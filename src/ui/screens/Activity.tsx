import { useMemo, useState, type ReactNode } from 'react';
import {
  activeFilterCount,
  filterTransactions,
  groupByDate,
  monthlyEquivalent,
  nextOccurrence,
  summariseRecurring,
  upcoming,
  type TransactionFilter,
} from '../../analytics';
import { categoryOf, indexCategories } from '../../domain/categories';
import { addDays, formatDayMonth, monthEnd, monthKey, monthStart } from '../../domain/dates';
import { parseAmount } from '../../domain/money';
import type { Cadence, RecurringItem, RecurringKind, TransactionType } from '../../domain/types';
import { LIMITS, sanitizeLine, sanitizeTag } from '../../domain/validation';
import { CategoryDot, CategoryPicker, Empty, FieldLabel, Segmented, Sheet, TxnRow } from '../components/common';
import { Icon } from '../components/Icon';
import { DateField, Select } from '../components/pickers';
import { useMoney, useStore, useStoreState, useToast, useToday } from '../context';
import { play } from '../sound';

type ActivityView = 'transactions' | 'recurring';

export function Activity({ sub, navigate, onEdit }: { sub: string; navigate: (r: string) => void; onEdit: (id: string) => void }) {
  const current: ActivityView = sub === 'recurring' ? 'recurring' : 'transactions';
  const go = (v: ActivityView) => navigate(`activity/${v}`);
  return (
    <div className="screen">
      {current === 'transactions' ? <Transactions onEdit={onEdit} view={current} onView={go} /> : <Recurring view={current} onView={go} />}
    </div>
  );
}

/** Title, tabs and the live summary stay pinned while the list scrolls. */
function ActivityHeader({ view, onView, summary }: { view: ActivityView; onView: (v: ActivityView) => void; summary: ReactNode }) {
  return (
    <div className="sticky-top">
      <header className="screen-head">
        <h1>Activity</h1>
      </header>
      <Segmented
        label="Activity view"
        value={view}
        onChange={(v) => {
          play('tap');
          onView(v);
        }}
        options={[
          { value: 'transactions', label: 'Transactions' },
          { value: 'recurring', label: 'Recurring & bills' },
        ]}
      />
      {summary}
    </div>
  );
}

// ---- Transactions: search, filter, bulk edit ------------------------------------------

function Transactions({ onEdit, view, onView }: { onEdit: (id: string) => void; view: ActivityView; onView: (v: ActivityView) => void }) {
  const { data } = useStoreState();
  const store = useStore();
  const toast = useToast();
  const money = useMoney();
  const today = useToday();
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<TransactionFilter>({});
  const [showFilters, setShowFilters] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<null | 'category' | 'tag'>(null);

  const results = useMemo(() => filterTransactions(data.transactions, data.categories, { ...filter, text }), [data, filter, text]);
  const groups = useMemo(() => groupByDate(results), [results]);
  const totals = useMemo(
    () => results.reduce((a, t) => (t.type === 'income' ? { ...a, in: a.in + t.amountCents } : { ...a, out: a.out + t.amountCents }), { in: 0, out: 0 }),
    [results],
  );
  const nFilters = activeFilterCount(filter);
  const selectedTx = data.transactions.filter((t) => selected.has(t.id));
  const selectionType = new Set(selectedTx.map((t) => t.type));
  const thisMonth = monthStart(monthKey(today));

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const endSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const summary = (
    <div className="row between" style={{ minHeight: 30 }}>
      <div className="pills num">
        <span className="pill">{results.length} txns</span>
        <span className="pill" style={{ color: 'var(--good)' }}>↓ {money(totals.in, { whole: true })}</span>
        <span className="pill">↑ {money(totals.out, { whole: true })}</span>
      </div>
      {results.length > 0 && (
        <button className="link-btn" aria-pressed={selecting} onClick={() => (selecting ? endSelect() : setSelecting(true))} style={{ minHeight: 36 }}>
          {selecting ? 'Done' : 'Select'}
        </button>
      )}
    </div>
  );

  return (
    <>
      <ActivityHeader view={view} onView={onView} summary={summary} />
      <div className="row">
        <div className="search grow">
          <Icon name="search" size={18} />
          <label className="sr-only" htmlFor="txn-search">
            Search transactions
          </label>
          <input id="txn-search" className="input" type="search" maxLength={60} placeholder="Search title, tag, category, amount" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <button className="btn ghost" style={{ padding: '0 12px' }} onClick={() => setShowFilters(true)} aria-label={`Filters${nFilters ? `, ${nFilters} active` : ''}`}>
          <Icon name="filter" size={18} />
          {nFilters > 0 && <span className="num">{nFilters}</span>}
        </button>
      </div>
      <div className="chips" role="group" aria-label="Quick filters">
        {(
          [
            ['all', 'All'],
            ['expense', 'Expenses'],
            ['income', 'Income'],
          ] as const
        ).map(([v, l]) => (
          <button key={v} className="chip" aria-pressed={(filter.type ?? 'all') === v} onClick={() => setFilter({ ...filter, type: v })}>
            {l}
          </button>
        ))}
        <button
          className="chip"
          aria-pressed={filter.from === thisMonth}
          onClick={() => setFilter(filter.from === thisMonth ? { ...filter, from: undefined, to: undefined } : { ...filter, from: thisMonth, to: monthEnd(monthKey(today)) })}
        >
          This month
        </button>
      </div>
      {selecting && (
        <div className="row between small muted">
          <span className="num">{selected.size} selected</span>
          <button className="link-btn" onClick={() => setSelected(selected.size === results.length ? new Set() : new Set(results.map((t) => t.id)))}>
            {selected.size === results.length ? 'Clear' : 'Select all shown'}
          </button>
        </div>
      )}

      {data.transactions.length === 0 ? (
        <Empty title="No transactions yet" body="Tap + to add one, or load sample data from Settings." />
      ) : results.length === 0 ? (
        <Empty title="No matches" body="Try a different search or clear filters.">
          <button
            className="btn ghost"
            onClick={() => {
              setText('');
              setFilter({});
            }}
          >
            Clear all
          </button>
        </Empty>
      ) : (
        groups.map((g) => (
          <section key={g.date} className="stack" style={{ gap: 4 }}>
            <h3 className="muted small" style={{ margin: '4px 2px 0', fontWeight: 600 }}>
              {g.date === today ? 'Today' : g.date === addDays(today, -1) ? 'Yesterday' : formatDayMonth(g.date)}
            </h3>
            <div className="card tight">
              {g.items.map((t) => (
                <TxnRow key={t.id} t={t} selecting={selecting} selected={selected.has(t.id)} onClick={() => (selecting ? toggle(t.id) : onEdit(t.id))} />
              ))}
            </div>
          </section>
        ))
      )}
      {selecting && selected.size > 0 && <div style={{ height: 52 }} />}

      {selecting && selected.size > 0 && (
        <div className="bulk-bar" role="toolbar" aria-label="Bulk actions">
          <div className="bulk-inner">
            <span className="grow num small" style={{ fontWeight: 600 }}>
              {selected.size} selected
            </span>
            <button className="btn" disabled={selectionType.size !== 1} onClick={() => setBulk('category')} title={selectionType.size !== 1 ? 'Select only expenses or only income to recategorise' : undefined}>
              Recategorise
            </button>
            <button className="btn" onClick={() => setBulk('tag')}>
              <Icon name="tag" size={16} /> Tag
            </button>
            <button
              className="btn"
              aria-label={`Delete ${selected.size} transactions`}
              onClick={() => {
                const removed = store.deleteTransactions([...selected]);
                play('delete');
                endSelect();
                toast({
                  message: `${removed.length} transaction${removed.length > 1 ? 's' : ''} deleted`,
                  actionLabel: 'Undo',
                  onAction: () => {
                    store.restoreTransactions(removed);
                    play('undo');
                  },
                });
              }}
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        </div>
      )}

      {showFilters && <FilterSheet value={filter} onChange={setFilter} onClose={() => setShowFilters(false)} />}
      {bulk === 'category' && (
        <BulkCategorySheet
          type={[...selectionType][0] ?? 'expense'}
          count={selected.size}
          onClose={() => setBulk(null)}
          onApply={(categoryId) => {
            store.bulkUpdate([...selected], { categoryId });
            play('success');
            setBulk(null);
            endSelect();
          }}
        />
      )}
      {bulk === 'tag' && (
        <BulkTagSheet
          count={selected.size}
          onClose={() => setBulk(null)}
          onApply={(tag, remove) => {
            store.bulkUpdate([...selected], remove ? { removeTag: tag } : { addTag: tag });
            play('success');
            setBulk(null);
            endSelect();
          }}
        />
      )}
    </>
  );
}

function FilterSheet({ value, onChange, onClose }: { value: TransactionFilter; onChange: (f: TransactionFilter) => void; onClose: () => void }) {
  const { data } = useStoreState();
  const today = useToday();
  const [f, setF] = useState<TransactionFilter>(value);
  const tags = [...new Set(data.transactions.flatMap((t) => t.tags))].sort();
  const cats = data.categories.filter((c) => !c.archived && (f.type === 'income' ? c.type === 'income' : f.type === 'expense' ? c.type === 'expense' : true));
  const toggleCat = (id: string) => {
    const s = new Set(f.categoryIds ?? []);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setF({ ...f, categoryIds: [...s] });
  };
  const presets: [string, TransactionFilter][] = [
    ['This month', { from: monthStart(monthKey(today)), to: monthEnd(monthKey(today)) }],
    ['Last 30 days', { from: addDays(today, -29), to: today }],
    ['Last 90 days', { from: addDays(today, -89), to: today }],
    ['Any time', { from: undefined, to: undefined }],
  ];
  const footer = (
    <div className="row">
      <button className="btn ghost grow" onClick={() => setF({})}>
        Reset
      </button>
      <button
        className="btn primary grow"
        onClick={() => {
          onChange(f);
          play('tap');
          onClose();
        }}
      >
        Show results
      </button>
    </div>
  );
  return (
    <Sheet title="Filter transactions" onClose={onClose} footer={footer}>
      <div className="field">
        <span className="lbl">Type</span>
        <Segmented label="Type" value={f.type ?? 'all'} onChange={(type) => setF({ ...f, type })} options={[{ value: 'all', label: 'All' }, { value: 'expense', label: 'Expenses' }, { value: 'income', label: 'Income' }]} />
      </div>
      <div className="field">
        <span className="lbl">Spending class</span>
        <Segmented label="Spending class" value={f.spendClass ?? 'all'} onChange={(spendClass) => setF({ ...f, spendClass })} options={[{ value: 'all', label: 'All' }, { value: 'fixed', label: 'Fixed' }, { value: 'flexible', label: 'Flexible' }]} />
      </div>
      <div className="field">
        <span className="lbl">Date range</span>
        <div className="chips" style={{ flexWrap: 'wrap' }}>
          {presets.map(([label, p]) => (
            <button key={label} className="chip" aria-pressed={f.from === p.from && f.to === p.to} onClick={() => setF({ ...f, ...p })}>
              {label}
            </button>
          ))}
        </div>
        <div className="row">
          <div className="field grow" style={{ flexBasis: 0, minWidth: 0 }}>
            <span className="lbl">From</span>
            <DateField value={f.from ?? ''} onChange={(d) => setF({ ...f, from: d || undefined })} today={today} label="From" max={f.to} optional />
          </div>
          <div className="field grow" style={{ flexBasis: 0, minWidth: 0 }}>
            <span className="lbl">To</span>
            <DateField value={f.to ?? ''} onChange={(d) => setF({ ...f, to: d || undefined })} today={today} label="To" min={f.from} optional />
          </div>
        </div>
      </div>
      <div className="field">
        <span className="lbl">Categories {f.categoryIds?.length ? `(${f.categoryIds.length})` : ''}</span>
        <div className="chips" style={{ flexWrap: 'wrap' }}>
          {cats.map((c) => (
            <button key={c.id} className="chip" aria-pressed={f.categoryIds?.includes(c.id) ?? false} onClick={() => toggleCat(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      </div>
      {tags.length > 0 && (
        <div className="field">
          <span className="lbl">Tag</span>
          <Select label="Tag" value={f.tag ?? ''} onChange={(t) => setF({ ...f, tag: t || undefined })} options={[{ value: '', label: 'Any tag' }, ...tags.map((t) => ({ value: t, label: `#${t}` }))]} />
        </div>
      )}
    </Sheet>
  );
}

function BulkCategorySheet({ type, count, onApply, onClose }: { type: TransactionType; count: number; onApply: (id: string) => void; onClose: () => void }) {
  const [cat, setCat] = useState('');
  return (
    <Sheet
      title={`Recategorise ${count} transaction${count > 1 ? 's' : ''}`}
      onClose={onClose}
      footer={
        <button className="btn primary block" disabled={!cat} onClick={() => onApply(cat)}>
          Apply to {count}
        </button>
      }
    >
      <CategoryPicker type={type} value={cat} onChange={setCat} label="Move to" compact />
    </Sheet>
  );
}

function BulkTagSheet({ count, onApply, onClose }: { count: number; onApply: (tag: string, remove: boolean) => void; onClose: () => void }) {
  const [tag, setTag] = useState('');
  const clean = sanitizeTag(tag);
  return (
    <Sheet
      title={`Tag ${count} transaction${count > 1 ? 's' : ''}`}
      onClose={onClose}
      footer={
        <div className="row">
          <button className="btn ghost grow" disabled={!clean} onClick={() => onApply(clean, true)}>
            Remove tag
          </button>
          <button className="btn primary grow" disabled={!clean} onClick={() => onApply(clean, false)}>
            Add tag
          </button>
        </div>
      }
    >
      <div className="field">
        <FieldLabel htmlFor="bulk-tag" count={clean.length} max={LIMITS.tag}>
          Tag
        </FieldLabel>
        <input id="bulk-tag" className="input" value={tag} maxLength={LIMITS.tag + 1} placeholder="e.g. holiday, work, shared" onChange={(e) => setTag(e.target.value.replace(/[^\p{L}\p{N}_\s#-]/gu, ''))} />
        {clean && <span className="muted small">Will be saved as #{clean}</span>}
      </div>
    </Sheet>
  );
}

// ---- Recurring bills & subscriptions --------------------------------------------------

const CADENCE_OPTIONS: { value: Cadence; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];
const CADENCE_LABEL = Object.fromEntries(CADENCE_OPTIONS.map((o) => [o.value, o.label])) as Record<Cadence, string>;

function Recurring({ view, onView }: { view: ActivityView; onView: (v: ActivityView) => void }) {
  const { data } = useStoreState();
  const store = useStore();
  const toast = useToast();
  const today = useToday();
  const money = useMoney();
  const [editing, setEditing] = useState<RecurringItem | 'new' | null>(null);
  // Paused items from older data are treated like any other item; the pause toggle was removed.
  const items = data.recurring;
  const summary = summariseRecurring(items.map((r) => ({ ...r, status: 'active' as const })));
  const soon = upcoming(items.map((r) => ({ ...r, status: 'active' as const })), today, 30);
  const due30 = soon.filter((o) => o.item.type === 'expense').reduce((s, o) => s + o.item.amountCents, 0);
  const postedTxn = new Map(data.transactions.filter((t) => t.recurringId).map((t) => [`${t.recurringId}|${t.date}`, t.id]));
  const index = indexCategories(data.categories);
  const groups: [RecurringKind, string][] = [
    ['subscription', 'Subscriptions'],
    ['bill', 'Bills'],
    ['income', 'Income'],
  ];

  const markPaid = (item: RecurringItem, date: string) => {
    const t = store.markRecurringPaid(item.id, date);
    if (!t) return;
    play('success');
    toast({
      message: `${item.title} marked ${item.type === 'income' ? 'received' : 'paid'}`,
      actionLabel: 'Undo',
      onAction: () => {
        store.deleteTransactions([t.id]);
        play('undo');
      },
    });
  };

  const header = (
    <div className="pills num">
      <span className="pill">🔁 {money(summary.monthlyExpenseCents, { whole: true })}/mo</span>
      <span className="pill">📺 {money(summary.monthlySubscriptionCents, { whole: true })}/mo subs</span>
      <span className="pill">📅 {money(due30, { whole: true })} next 30d</span>
    </div>
  );

  return (
    <>
      <ActivityHeader view={view} onView={onView} summary={header} />
      <h2 className="section-title">Upcoming · next 30 days</h2>
      <div className="card tight">
        {soon.length === 0 && <div className="list-row muted small">Nothing due in the next 30 days.</div>}
        {soon.slice(0, 8).map((o) => {
          const paidId = postedTxn.get(`${o.item.id}|${o.date}`);
          return (
            <div className="list-row" key={`${o.item.id}${o.date}`}>
              <div className="grow stack" style={{ gap: 0 }}>
                <span className="title">{o.item.title}</span>
                <span className="sub num">
                  {formatDayMonth(o.date)} · {o.daysAway === 0 ? 'today' : `in ${o.daysAway} day${o.daysAway > 1 ? 's' : ''}`}
                </span>
              </div>
              <span className={`amount num${o.item.type === 'income' ? ' income' : ''}`}>
                {o.item.type === 'income' ? '+' : '−'}
                {money(o.item.amountCents)}
              </span>
              {o.daysAway <= 3 &&
                (paidId ? (
                  <button
                    className="chip paid"
                    aria-label={`${o.item.title} is marked ${o.item.type === 'income' ? 'received' : 'paid'}. Tap to undo.`}
                    onClick={() => {
                      store.deleteTransactions([paidId]);
                      play('undo');
                    }}
                  >
                    <Icon name="check" size={14} /> {o.item.type === 'income' ? 'Received' : 'Paid'}
                  </button>
                ) : (
                  <button className="chip" onClick={() => markPaid(o.item, o.date)}>
                    {o.item.type === 'income' ? 'Received' : 'Mark paid'}
                  </button>
                ))}
            </div>
          );
        })}
      </div>

      {groups.map(([kind, label]) => {
        const list = items.filter((r) => r.kind === kind);
        if (!list.length) return null;
        return (
          <section key={kind} className="stack">
            <h2 className="section-title">{label}</h2>
            <div className="card tight">
              {list.map((r) => {
                const next = nextOccurrence({ ...r, status: 'active' }, today);
                const cat = categoryOf(index, r.categoryId);
                return (
                  <button className="list-row" key={r.id} onClick={() => setEditing(r)} aria-label={`Edit ${r.title}`}>
                    <CategoryDot category={cat} size={30} />
                    <span className="grow stack" style={{ gap: 0 }}>
                      <span className="title">{r.title}</span>
                      <span className="sub num">
                        {CADENCE_LABEL[r.cadence]} · {next ? `next ${formatDayMonth(next)}` : 'ended'}
                        {r.cadence !== 'monthly' ? ` · ≈${money(monthlyEquivalent(r), { whole: true })}/mo` : ''}
                      </span>
                    </span>
                    <span className="amount num">{money(r.amountCents)}</span>
                    <span className="muted" aria-hidden="true">
                      <Icon name="chevronRight" size={16} />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      <button className="btn ghost block" onClick={() => setEditing('new')}>
        <Icon name="plus" size={18} /> Add bill or subscription
      </button>
      {editing && <RecurringSheet item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function RecurringSheet({ item, onClose }: { item: RecurringItem | null; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const today = useToday();
  const [title, setTitle] = useState(item?.title ?? '');
  const [amount, setAmount] = useState(item ? (item.amountCents / 100).toFixed(2) : '');
  const [kind, setKind] = useState<RecurringKind>(item?.kind ?? 'subscription');
  const type: TransactionType = kind === 'income' ? 'income' : 'expense';
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? (kind === 'income' ? 'salary' : 'subscriptions'));
  const [cadence, setCadence] = useState<Cadence>(item?.cadence ?? 'monthly');
  const [anchor, setAnchor] = useState(item ? (nextOccurrence({ ...item, status: 'active' }, today) ?? item.anchorDate) : today);
  // Keep the original anchor unless the user changes the date, so a 31st-of-month bill stays on month-end.
  const [anchorTouched, setAnchorTouched] = useState(false);
  const cents = parseAmount(amount);
  const valid = Boolean(title.trim() && cents && cents > 0 && anchor);

  const footer = (
    <div className="row">
      {item && (
        <button
          className="btn danger"
          aria-label={`Delete ${item.title}`}
          onClick={() => {
            store.deleteRecurring(item.id);
            play('delete');
            onClose();
            toast({
              message: `${item.title} removed`,
              actionLabel: 'Undo',
              onAction: () => {
                store.saveRecurring(item);
                play('undo');
              },
            });
          }}
        >
          <Icon name="trash" size={18} />
        </button>
      )}
      <button
        className="btn primary grow"
        disabled={!valid}
        onClick={() => {
          store.saveRecurring({
            id: item?.id,
            title: sanitizeLine(title, LIMITS.title).value,
            kind,
            type,
            amountCents: cents!,
            categoryId,
            cadence,
            anchorDate: item && !anchorTouched ? item.anchorDate : anchor,
            status: 'active',
            endDate: item?.endDate,
          });
          play('success');
          onClose();
        }}
      >
        Save
      </button>
    </div>
  );

  return (
    <Sheet title={item ? 'Edit recurring item' : 'New bill or subscription'} onClose={onClose} footer={footer}>
      <Segmented
        label="Kind"
        value={kind}
        onChange={(k) => {
          setKind(k);
          setCategoryId(k === 'income' ? 'salary' : k === 'subscription' ? 'subscriptions' : 'utilities');
        }}
        options={[
          { value: 'subscription', label: 'Subscription' },
          { value: 'bill', label: 'Bill' },
          { value: 'income', label: 'Income' },
        ]}
      />
      <div className="field">
        <FieldLabel htmlFor="rec-title" count={[...title].length} max={LIMITS.title}>
          Name
        </FieldLabel>
        <input id="rec-title" className="input" value={title} maxLength={LIMITS.title} onChange={(e) => setTitle(sanitizeLine(e.target.value, LIMITS.title, true).value)} placeholder="e.g. Netflix" />
      </div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="field grow" style={{ flexBasis: 0, minWidth: 0 }}>
          <label className="lbl" htmlFor="rec-amount">Amount</label>
          <input id="rec-amount" className="input num" inputMode="decimal" maxLength={12} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0.00" />
        </div>
        <div className="field grow" style={{ flexBasis: 0, minWidth: 0 }}>
          <span className="lbl">Repeats</span>
          <Select label="Repeats" value={cadence} onChange={setCadence} options={CADENCE_OPTIONS} />
        </div>
      </div>
      <div className="field">
        <span className="lbl">Next due</span>
        <DateField
          value={anchor}
          onChange={(d) => {
            setAnchor(d || today);
            setAnchorTouched(true);
          }}
          today={today}
          label="Next due"
          quick="future"
        />
      </div>
      <CategoryPicker type={type} value={categoryId} onChange={setCategoryId} compact />
    </Sheet>
  );
}
