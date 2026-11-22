import { useMemo, useState } from 'react';
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
import { CategoryDot, CategoryPicker, Empty, Segmented, Sheet, TxnRow } from '../components/common';
import { Icon } from '../components/Icon';
import { useMoney, useStore, useStoreState, useToday } from '../context';

export function Activity({ sub, navigate, onEdit }: { sub: string; navigate: (r: string) => void; onEdit: (id: string) => void }) {
  const current = sub === 'recurring' ? 'recurring' : 'transactions';
  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Activity</h1>
      </header>
      <Segmented
        label="Activity view"
        value={current}
        onChange={(v) => navigate(`activity/${v}`)}
        options={[
          { value: 'transactions', label: 'Transactions' },
          { value: 'recurring', label: 'Recurring & bills' },
        ]}
      />
      {current === 'transactions' ? <Transactions onEdit={onEdit} /> : <Recurring />}
    </div>
  );
}

// ---- Transactions: search, filter, bulk edit ------------------------------------------

function Transactions({ onEdit }: { onEdit: (id: string) => void }) {
  const { data } = useStoreState();
  const store = useStore();
  const today = useToday();
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<TransactionFilter>({});
  const [showFilters, setShowFilters] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<null | 'category' | 'tag'>(null);

  const results = useMemo(() => filterTransactions(data.transactions, data.categories, { ...filter, text }), [data, filter, text]);
  const groups = useMemo(() => groupByDate(results), [results]);
  const nFilters = activeFilterCount(filter);
  const selectedTx = data.transactions.filter((t) => selected.has(t.id));
  const selectionType = new Set(selectedTx.map((t) => t.type));

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

  return (
    <>
      <div className="row">
        <div className="search grow">
          <Icon name="search" size={18} />
          <label className="sr-only" htmlFor="txn-search">
            Search transactions
          </label>
          <input id="txn-search" className="input" type="search" placeholder="Search title, tag, category, amount" value={text} onChange={(e) => setText(e.target.value)} />
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
          aria-pressed={filter.from === monthStart(monthKey(today))}
          onClick={() =>
            setFilter(filter.from === monthStart(monthKey(today)) ? { ...filter, from: undefined, to: undefined } : { ...filter, from: monthStart(monthKey(today)), to: monthEnd(monthKey(today)) })
          }
        >
          This month
        </button>
        <button className="chip" aria-pressed={selecting} onClick={() => (selecting ? endSelect() : setSelecting(true))}>
          {selecting ? 'Done' : 'Select'}
        </button>
      </div>

      <div className="row between small muted num">
        <span>
          {results.length} transaction{results.length === 1 ? '' : 's'}
        </span>
        {selecting && (
          <button className="link-btn" onClick={() => setSelected(selected.size === results.length ? new Set() : new Set(results.map((t) => t.id)))}>
            {selected.size === results.length ? 'Clear selection' : 'Select all shown'}
          </button>
        )}
      </div>

      {data.transactions.length === 0 ? (
        <Empty title="No transactions yet" body="Tap + to add one, or load sample data from Settings." />
      ) : results.length === 0 ? (
        <Empty title="No matches" body="Try a different search or clear filters.">
          <button className="btn ghost" onClick={() => { setText(''); setFilter({}); }}>
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
                if (window.confirm(`Delete ${selected.size} transaction${selected.size > 1 ? 's' : ''}? This can't be undone (restore from a backup if needed).`)) {
                  store.deleteTransactions([...selected]);
                  endSelect();
                }
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
  return (
    <Sheet title="Filter transactions" onClose={onClose}>
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
        <div className="chips wrap" style={{ flexWrap: 'wrap' }}>
          {presets.map(([label, p]) => (
            <button key={label} className="chip" aria-pressed={f.from === p.from && f.to === p.to} onClick={() => setF({ ...f, ...p })}>
              {label}
            </button>
          ))}
        </div>
        <div className="row">
          <label className="field grow">
            <span className="lbl">From</span>
            <input className="input" type="date" value={f.from ?? ''} onChange={(e) => setF({ ...f, from: e.target.value || undefined })} />
          </label>
          <label className="field grow">
            <span className="lbl">To</span>
            <input className="input" type="date" value={f.to ?? ''} onChange={(e) => setF({ ...f, to: e.target.value || undefined })} />
          </label>
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
        <label className="field">
          <span className="lbl">Tag</span>
          <select className="input" value={f.tag ?? ''} onChange={(e) => setF({ ...f, tag: e.target.value || undefined })}>
            <option value="">Any tag</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="row">
        <button className="btn ghost grow" onClick={() => setF({})}>
          Reset
        </button>
        <button
          className="btn primary grow"
          onClick={() => {
            onChange(f);
            onClose();
          }}
        >
          Show results
        </button>
      </div>
    </Sheet>
  );
}

function BulkCategorySheet({ type, count, onApply, onClose }: { type: TransactionType; count: number; onApply: (id: string) => void; onClose: () => void }) {
  const [cat, setCat] = useState('');
  return (
    <Sheet title={`Recategorise ${count} transaction${count > 1 ? 's' : ''}`} onClose={onClose}>
      <CategoryPicker type={type} value={cat} onChange={setCat} label="Move to" />
      <button className="btn primary block" disabled={!cat} onClick={() => onApply(cat)}>
        Apply to {count}
      </button>
    </Sheet>
  );
}

function BulkTagSheet({ count, onApply, onClose }: { count: number; onApply: (tag: string, remove: boolean) => void; onClose: () => void }) {
  const [tag, setTag] = useState('');
  const clean = tag.trim().replace(/^#/, '').toLowerCase();
  return (
    <Sheet title={`Tag ${count} transaction${count > 1 ? 's' : ''}`} onClose={onClose}>
      <label className="field">
        <span className="lbl">Tag</span>
        <input className="input" value={tag} placeholder="e.g. holiday, work, shared" onChange={(e) => setTag(e.target.value)} />
      </label>
      <div className="row">
        <button className="btn ghost grow" disabled={!clean} onClick={() => onApply(clean, true)}>
          Remove tag
        </button>
        <button className="btn primary grow" disabled={!clean} onClick={() => onApply(clean, false)}>
          Add tag
        </button>
      </div>
    </Sheet>
  );
}

// ---- Recurring bills & subscriptions --------------------------------------------------

const CADENCE_LABEL: Record<Cadence, string> = { weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly', yearly: 'Yearly' };

function Recurring() {
  const { data } = useStoreState();
  const store = useStore();
  const today = useToday();
  const money = useMoney();
  const [editing, setEditing] = useState<RecurringItem | 'new' | null>(null);
  const summary = summariseRecurring(data.recurring);
  const soon = upcoming(data.recurring, today, 30);
  const posted = new Set(data.transactions.filter((t) => t.recurringId).map((t) => `${t.recurringId}|${t.date}`));
  const index = indexCategories(data.categories);
  const groups: [RecurringKind, string][] = [
    ['subscription', 'Subscriptions'],
    ['bill', 'Bills'],
    ['income', 'Income'],
  ];

  return (
    <>
      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <div className="stack" style={{ gap: 0 }}>
          <span className="muted small">Recurring spend</span>
          <span className="num" style={{ fontWeight: 650, fontSize: 17 }}>{money(summary.monthlyExpenseCents, { whole: true })}</span>
          <span className="muted small">per month</span>
        </div>
        <div className="stack" style={{ gap: 0 }}>
          <span className="muted small">Subscriptions</span>
          <span className="num" style={{ fontWeight: 650, fontSize: 17 }}>{money(summary.monthlySubscriptionCents, { whole: true })}</span>
          <span className="muted small">per month</span>
        </div>
        <div className="stack" style={{ gap: 0 }}>
          <span className="muted small">Paused saves</span>
          <span className="num" style={{ fontWeight: 650, fontSize: 17, color: 'var(--good)' }}>{money(summary.pausedMonthlySavingsCents, { whole: true })}</span>
          <span className="muted small">per month</span>
        </div>
      </div>

      <h2 className="section-title">Upcoming · next 30 days</h2>
      <div className="card tight">
        {soon.length === 0 && <div className="list-row muted small">Nothing due in the next 30 days.</div>}
        {soon.slice(0, 8).map((o) => {
          const paid = posted.has(`${o.item.id}|${o.date}`);
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
                (paid ? (
                  <span className="badge on-pace">Paid</span>
                ) : (
                  <button className="chip" onClick={() => store.markRecurringPaid(o.item.id, o.date)}>
                    {o.item.type === 'income' ? 'Received' : 'Mark paid'}
                  </button>
                ))}
            </div>
          );
        })}
      </div>

      {groups.map(([kind, label]) => {
        const items = data.recurring.filter((r) => r.kind === kind);
        if (!items.length) return null;
        return (
          <section key={kind} className="stack">
            <h2 className="section-title">{label}</h2>
            <div className="card tight">
              {items.map((r) => {
                const next = nextOccurrence({ ...r, status: 'active' }, today);
                const cat = categoryOf(index, r.categoryId);
                return (
                  <div className="list-row" key={r.id} style={{ opacity: r.status === 'paused' ? 0.6 : 1 }}>
                    <CategoryDot category={cat} size={30} />
                    <button className="grow stack" style={{ gap: 0, background: 'none', border: 0, textAlign: 'left', padding: 0 }} onClick={() => setEditing(r)}>
                      <span className="title">{r.title}</span>
                      <span className="sub num">
                        {CADENCE_LABEL[r.cadence]} · {r.status === 'paused' ? 'Paused' : next ? `next ${formatDayMonth(next)}` : 'ended'}
                        {r.cadence !== 'monthly' ? ` · ≈${money(monthlyEquivalent(r), { whole: true })}/mo` : ''}
                      </span>
                    </button>
                    <span className="amount num">{money(r.amountCents)}</span>
                    {r.kind !== 'income' && (
                      <button
                        className="icon-btn"
                        aria-label={r.status === 'paused' ? `Resume ${r.title}` : `Pause ${r.title}`}
                        onClick={() => store.setRecurringStatus(r.id, r.status === 'paused' ? 'active' : 'paused')}
                      >
                        <Icon name={r.status === 'paused' ? 'play' : 'pause'} size={16} />
                      </button>
                    )}
                  </div>
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
  const valid = title.trim() && cents && cents > 0 && anchor;

  return (
    <Sheet title={item ? 'Edit recurring item' : 'New bill or subscription'} onClose={onClose}>
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
      <label className="field">
        <span className="lbl">Name</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Netflix" />
      </label>
      <div className="row">
        <label className="field grow">
          <span className="lbl">Amount</span>
          <input className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </label>
        <label className="field grow">
          <span className="lbl">Repeats</span>
          <select className="input" value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
            {Object.entries(CADENCE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="lbl">Next due</span>
        <input className="input" type="date" value={anchor} onChange={(e) => { setAnchor(e.target.value); setAnchorTouched(true); }} />
      </label>
      <CategoryPicker type={type} value={categoryId} onChange={setCategoryId} />
      <div className="row">
        {item && (
          <button
            className="btn danger"
            onClick={() => {
              if (window.confirm(`Delete ${item.title}? Past transactions are kept.`)) {
                store.deleteRecurring(item.id);
                onClose();
              }
            }}
          >
            Delete
          </button>
        )}
        <button
          className="btn primary grow"
          disabled={!valid}
          onClick={() => {
            store.saveRecurring({
              id: item?.id,
              title: title.trim(),
              kind,
              type,
              amountCents: cents!,
              categoryId,
              cadence,
              anchorDate: item && !anchorTouched ? item.anchorDate : anchor,
              status: item?.status ?? 'active',
              endDate: item?.endDate,
            });
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}
