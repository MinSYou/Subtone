import { useMemo, useState } from 'react';
import { checkAffordability, PACE_LABEL, type PaceResult } from '../../analytics';
import { formatDayMonth } from '../../domain/dates';
import { parseAmount } from '../../domain/money';
import type { SavingsGoal, TransactionType } from '../../domain/types';
import { CategoryPicker, Empty, FieldLabel, MonthSwitcher, PaceBadge, PaceBar, Segmented, Sheet } from '../components/common';
import { PaceMascot } from '../components/PaceMascot';
import { DateField } from '../components/pickers';
import { LIMITS, sanitizeLine } from '../../domain/validation';
import { play } from '../sound';
import { GoalJar, GOAL_ICONS } from '../components/GoalJar';
import { Icon } from '../components/Icon';
import { useDashboard, useMoney, useMonth, useStore, useStoreState, useToast, useToday } from '../context';

export function Plan({ sub, navigate }: { sub: string; navigate: (r: string) => void }) {
  const current = (['budgets', 'afford', 'goals'].includes(sub) ? sub : 'budgets') as 'budgets' | 'afford' | 'goals';
  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Plan</h1>
        {current === 'budgets' && <MonthSwitcher />}
      </header>
      <Segmented
        label="Plan view"
        value={current}
        onChange={(v) => navigate(`plan/${v}`)}
        options={[
          { value: 'budgets', label: 'Budgets' },
          { value: 'afford', label: 'Can I afford it?' },
          { value: 'goals', label: 'Goals' },
        ]}
      />
      {current === 'budgets' && <Budgets />}
      {current === 'afford' && <Afford />}
      {current === 'goals' && <Goals />}
    </div>
  );
}

// ---- Budgets ---------------------------------------------------------------------------

function Budgets() {
  const [month] = useMonth();
  const d = useDashboard(month);
  const money = useMoney();
  const [edit, setEdit] = useState<{ categoryId: string | null; current: number | null } | null>(null);
  const { clock } = d.pacing;
  const rows = [d.pacing.overall, ...d.pacing.categories];

  const stateLine = (p: PaceResult) => {
    if (p.limitCents === null) return 'No limit set';
    const left = p.limitCents - p.spentCents;
    if (p.status === 'over') return `${Math.round(p.spentPct)}% · ${money(-left, { whole: true })} over`;
    const tail = clock.isCurrent ? ` · projected ${money(p.projectedCents, { whole: true })}` : '';
    return `${Math.round(p.spentPct)}% · ${money(left, { whole: true })} left${tail}`;
  };

  return (
    <>
      <div className="card pace-card">
        <PaceMascot status={d.pacing.overall.status} size={60} />
        <div className="stack" style={{ gap: 4 }}>
          <span className={`pace-status ${d.pacing.overall.status}`}>{PACE_LABEL[d.pacing.overall.status]}</span>
          <div className="pills num">
            {d.pacing.overall.limitCents !== null && <span className="pill">{money(Math.max(0, d.pacing.overall.limitCents - d.pacing.overall.spentCents), { whole: true })} left</span>}
            {clock.isCurrent && <span className="pill">→ {money(d.pacing.overall.projectedCents, { whole: true })}</span>}
          </div>
        </div>
      </div>
      {clock.isCurrent && (
        <div className="row between small muted num">
          <span>
            Day {clock.daysElapsed} of {clock.daysInMonth}
          </span>
          <span className="row" style={{ gap: 4 }}>
            <span style={{ width: 2, height: 12, background: 'var(--ink)', display: 'inline-block' }} /> where you should be today
          </span>
        </div>
      )}
      <div className="card tight">
        {rows.map((p) => (
          <button key={p.categoryId ?? 'all'} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }} onClick={() => setEdit({ categoryId: p.categoryId, current: p.limitCents })}>
            <div className="row between">
              <span className="title" style={{ fontWeight: p.categoryId ? 500 : 650 }}>{p.label}</span>
              <span className="row" style={{ gap: 6 }}>
                <span className="muted small num">
                  {money(p.spentCents, { whole: true })}
                  {p.limitCents !== null ? ` / ${money(p.limitCents, { whole: true })}` : ''}
                </span>
                <PaceBadge status={p.status} />
              </span>
            </div>
            {p.limitCents !== null && <PaceBar pace={p} />}
            <span className="sub num">{stateLine(p)}</span>
          </button>
        ))}
      </div>
      <button className="btn ghost block" onClick={() => setEdit({ categoryId: '', current: null })}>
        <Icon name="plus" size={18} /> Add a category limit
      </button>
      <p className="muted small" style={{ margin: 0 }} title="Your current day-to-day rate plus bills still due would finish the month over the limit.">
        ⚡ Spending fast = projected over limit
      </p>
      {edit && <BudgetSheet categoryId={edit.categoryId} current={edit.current} onClose={() => setEdit(null)} />}
    </>
  );
}

function BudgetSheet({ categoryId, current, onClose }: { categoryId: string | null; current: number | null; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const { data } = useStoreState();
  const [cat, setCat] = useState(categoryId ?? '');
  const [amount, setAmount] = useState(current ? String(current / 100) : '');
  const cents = parseAmount(amount);
  const isOverall = categoryId === null;
  const name = isOverall ? 'Monthly budget' : data.categories.find((c) => c.id === cat)?.name ?? 'Category limit';
  return (
    <Sheet
      title={categoryId === '' ? 'New category limit' : name}
      onClose={onClose}
      footer={
        <div className="row">
          {current !== null && (
            <button
              className="btn danger"
              onClick={() => {
                store.setBudget(isOverall ? null : cat, null);
                play('delete');
                onClose();
                toast({ message: `${name} limit removed`, actionLabel: 'Undo', onAction: () => { store.setBudget(isOverall ? null : cat, current); play('undo'); } });
              }}
            >
              Remove
            </button>
          )}
          <button
            className="btn primary grow"
            disabled={!cents || (!isOverall && !cat)}
            onClick={() => {
              store.setBudget(isOverall ? null : cat, cents!);
              play('success');
              onClose();
            }}
          >
            Save limit
          </button>
        </div>
      }
    >
      {categoryId === '' && <CategoryPicker type="expense" value={cat} onChange={setCat} compact />}
      <label className="field">
        <span className="lbl">Limit per month</span>
        <input className="input num" inputMode="decimal" maxLength={12} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0.00" />
      </label>
    </Sheet>
  );
}

// ---- Can I afford it? -------------------------------------------------------------------

const PRESETS = [50_00, 150_00, 400_00, 700_00];

function Afford() {
  const { data } = useStoreState();
  const today = useToday();
  const money = useMoney();
  const [amount, setAmount] = useState('150');
  const [type] = useState<TransactionType>('expense');
  const [categoryId, setCategoryId] = useState('shopping');
  const [date, setDate] = useState(today);
  const cents = parseAmount(amount);
  const result = useMemo(
    () => (cents && cents > 0 ? checkAffordability(data, { amountCents: cents, categoryId, date }, today) : null),
    [data, cents, categoryId, date, today],
  );
  const tone = result?.verdict === 'comfortable' ? 'good' : result?.verdict === 'no-budget' ? 'muted' : 'warn';
  const tag = { comfortable: 'Comfortable', tight: 'Tight', 'over-budget': 'Not this month', 'no-budget': 'No budget' }[result?.verdict ?? 'no-budget'];

  return (
    <>
      <div className="card stack" style={{ gap: 10 }}>
        <label className="field">
          <span className="lbl">Planned purchase ({data.settings.currency})</span>
          <input className="amount-input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" placeholder="0" />
        </label>
        <div className="chips" role="group" aria-label="Preset amounts">
          {PRESETS.map((p) => (
            <button key={p} className="chip num" aria-pressed={cents === p} onClick={() => setAmount(String(p / 100))}>
              {money(p, { whole: true })}
            </button>
          ))}
        </div>
        <CategoryPicker type={type} value={categoryId} onChange={setCategoryId} />
        <div className="field">
          <span className="lbl">When</span>
          <DateField value={date} onChange={(d) => setDate(d || today)} today={today} label="When" min={today} quick="future" />
        </div>
      </div>

      {result && (
        <section className="card stack" aria-live="polite" style={{ background: `var(--${tone}-soft, #f1f1ee)`, borderColor: 'transparent' }}>
          <span className="small" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: `var(--${tone === 'muted' ? 'muted' : tone})` }}>
            {tag}
          </span>
          <strong style={{ fontSize: 16 }}>{result.headline}</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
            <Metric label="Safe-to-spend after" value={result.safePerDayAfterCents === null ? '-' : `${money(result.safePerDayAfterCents, { whole: true })}/day`} />
            <Metric
              label={`${data.categories.find((c) => c.id === categoryId)?.name ?? 'Category'} limit left`}
              value={result.categoryLeftAfterCents === null ? 'No limit' : money(result.categoryLeftAfterCents, { whole: true })}
              warn={result.categoryOverLimit}
            />
            <Metric label="Budget left after" value={result.budgetLeftAfterCents === null ? '-' : money(result.budgetLeftAfterCents, { whole: true })} warn={(result.budgetLeftAfterCents ?? 0) < 0} />
            <Metric label="Unallocated after" value={money(result.unallocatedAfterCents, { whole: true, signed: true })} warn={result.unallocatedAfterCents < 0} />
          </div>
          <span className="small" style={{ color: '#3a3d44' }}>
            {result.advice}
          </span>
          {date > today && <span className="muted small">Checked against {formatDayMonth(date)}'s month.</span>}
        </section>
      )}
    </>
  );
}

function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: '8px 10px', display: 'grid' }}>
      <span className="muted small">{label}</span>
      <span className="num" style={{ fontWeight: 650, color: warn ? 'var(--warn)' : undefined }}>
        {value}
      </span>
    </div>
  );
}

// ---- Savings goals ------------------------------------------------------------------------

function Goals() {
  const [month] = useMonth();
  const d = useDashboard(month);
  const money = useMoney();
  const [editing, setEditing] = useState<SavingsGoal | 'new' | null>(null);
  const [moving, setMoving] = useState<{ goal: SavingsGoal; withdraw: boolean } | null>(null);
  const { allocation } = d;

  return (
    <>
      <div className="card stack" style={{ gap: 6 }}>
        <div className="row between">
          <span className="muted small">Saved across goals</span>
        </div>
        <span className="num" style={{ fontSize: 26, fontWeight: 700 }}>{money(allocation.totalSavedCents, { whole: true })}</span>
        <div className="row between" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 8 }}>
          <span className="pill num">💰 {money(Math.max(0, allocation.unallocatedCents), { whole: true })} to save</span>
          <span className="pill num">🐷 {money(allocation.setAsideCents, { whole: true })} this month</span>
        </div>
      </div>

      {d.goals.length === 0 ? (
        <Empty title="No goals yet" body="Ring-fence surplus cashflow into buckets: a trip, an emergency fund, a new laptop." />
      ) : (
        <div className="card tight">
          {d.goals.map((g) => (
            <div className="list-row" key={g.goal.id} style={{ alignItems: 'flex-start', gap: 12, padding: '12px 14px' }}>
              <GoalJar key={`${g.goal.id}-${g.savedCents}`} icon={g.goal.icon} color={g.goal.color} pct={g.pct} complete={g.complete} celebrate />
              <div className="grow stack" style={{ gap: 4 }}>
                <button className="row between" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', minHeight: 36 }} onClick={() => setEditing(g.goal)} aria-label={`Edit ${g.goal.name}`}>
                  <span className="title">{g.goal.name}</span>
                  <span className="num small muted">{Math.round(g.pct)}%</span>
                </button>
                <span className="num" style={{ fontWeight: 600 }}>
                  {money(g.savedCents, { whole: true })} <span className="muted small">of {money(g.goal.targetCents, { whole: true })}</span>
                </span>
                <div className="goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(g.pct)} aria-label={`${g.goal.name} progress`}>
                  <span style={{ width: `${Math.max(2, g.pct)}%`, background: g.goal.color }} />
                </div>
                <span className="sub num">
                  {g.complete
                    ? '🎉 Goal reached'
                    : g.perMonthNeededCents
                      ? `🎯 ${money(g.perMonthNeededCents, { whole: true })}/mo · by ${formatDayMonth(g.goal.targetDate!)}`
                      : `${money(g.remainingCents, { whole: true })} to go`}
                </span>
                <div className="row" style={{ marginTop: 2 }}>
                  <button className="chip" onClick={() => setMoving({ goal: g.goal, withdraw: false })}>
                    <Icon name="plus" size={14} /> Set aside
                  </button>
                  {g.savedCents > 0 && (
                    <button className="chip" onClick={() => setMoving({ goal: g.goal, withdraw: true })}>
                      Withdraw
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <button className="btn ghost block" onClick={() => setEditing('new')}>
        <Icon name="plus" size={18} /> New goal
      </button>
      {editing && <GoalSheet goal={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {moving && (
        <ContributeSheet
          goal={moving.goal}
          withdraw={moving.withdraw}
          suggestion={moving.withdraw ? 0 : Math.max(0, Math.min(allocation.unallocatedCents, d.goals.find((g) => g.goal.id === moving.goal.id)?.remainingCents ?? 0))}
          onClose={() => setMoving(null)}
        />
      )}
    </>
  );
}

function GoalSheet({ goal, onClose }: { goal: SavingsGoal | null; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const today = useToday();
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? String(goal.targetCents / 100) : '');
  const [icon, setIcon] = useState(goal?.icon ?? 'plane');
  const [date, setDate] = useState(goal?.targetDate ?? '');
  const cents = parseAmount(target);
  const meta = GOAL_ICONS.find((g) => g.icon === icon) ?? GOAL_ICONS[0];
  const footer = (
    <div className="row">
      {goal && (
        <button
          className="btn danger"
          aria-label={`Delete ${goal.name}`}
          onClick={() => {
            const removed = store.deleteGoal(goal.id);
            play('delete');
            onClose();
            toast({ message: `${goal.name} deleted`, actionLabel: 'Undo', onAction: () => { store.restoreGoal(removed); play('undo'); } });
          }}
        >
          <Icon name="trash" size={18} />
        </button>
      )}
      <button
        className="btn primary grow"
        disabled={!name.trim() || !cents}
        onClick={() => {
          store.saveGoal({ id: goal?.id, createdAt: goal?.createdAt, name: sanitizeLine(name, LIMITS.name).value, targetCents: cents!, icon, color: meta.color, targetDate: date || undefined });
          play('success');
          onClose();
        }}
      >
        Save goal
      </button>
    </div>
  );
  return (
    <Sheet title={goal ? 'Edit goal' : 'New savings goal'} onClose={onClose} footer={footer}>
      <div className="field">
        <FieldLabel htmlFor="goal-name" count={[...name].length} max={LIMITS.name}>
          Name
        </FieldLabel>
        <input id="goal-name" className="input" value={name} maxLength={LIMITS.name} onChange={(e) => setName(sanitizeLine(e.target.value, LIMITS.name, true).value)} placeholder="e.g. Japan trip" />
      </div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="field grow" style={{ flexBasis: 0, minWidth: 0 }}>
          <label className="lbl" htmlFor="goal-target">Target</label>
          <input id="goal-target" className="input num" inputMode="decimal" maxLength={12} value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0.00" />
        </div>
        <div className="field grow" style={{ flexBasis: 0, minWidth: 0 }}>
          <span className="lbl">Target date</span>
          <DateField value={date} onChange={setDate} today={today} label="Target date" min={today} optional quick="future" />
        </div>
      </div>
      <div className="field">
        <span className="lbl">Icon</span>
        <div className="row wrap" role="group" aria-label="Goal icon">
          {GOAL_ICONS.map((g) => (
            <button key={g.icon} type="button" aria-pressed={g.icon === icon} aria-label={g.label} onClick={() => { setIcon(g.icon); play('tap'); }} style={{ border: g.icon === icon ? '2px solid var(--accent)' : '1px solid var(--line)', borderRadius: 18, padding: 2, background: '#fff' }}>
              <GoalJar icon={g.icon} color={g.color} pct={60} size={44} />
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

function ContributeSheet({ goal, withdraw, suggestion, onClose }: { goal: SavingsGoal; withdraw: boolean; suggestion: number; onClose: () => void }) {
  const store = useStore();
  const money = useMoney();
  const [amount, setAmount] = useState(suggestion > 0 ? (suggestion / 100).toFixed(2) : '');
  const cents = parseAmount(amount);
  return (
    <Sheet
      title={`${withdraw ? 'Withdraw from' : 'Set aside for'} ${goal.name}`}
      onClose={onClose}
      footer={
        <button
          className="btn primary block"
          disabled={!cents}
          onClick={() => {
            store.contribute(goal.id, withdraw ? -cents! : cents!);
            play(withdraw ? 'tap' : 'success');
            onClose();
          }}
        >
          {withdraw ? 'Withdraw' : 'Set aside'}
        </button>
      }
    >
      <label className="field">
        <span className="lbl">Amount</span>
        <input className="amount-input num" inputMode="decimal" maxLength={12} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0" aria-label="Amount" />
      </label>
      {!withdraw && suggestion > 0 && <span className="muted small num">💰 Suggested: {money(suggestion, { whole: true })} unallocated</span>}
      <span className="muted small">🫙 A planning bucket only. No money moves in your bank.</span>
    </Sheet>
  );
}
