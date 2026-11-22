import { formatMonthLong } from '../../domain/dates';
import { Empty, MonthSwitcher, PaceBadge, PaceBar, SignalCard, TxnRow } from '../components/common';
import { Icon } from '../components/Icon';
import { useDashboard, useMoney, useMonth, useStore, useStoreState } from '../context';

export function Home({ navigate, onAdd, onEdit }: { navigate: (r: string) => void; onAdd: () => void; onEdit: (id: string) => void }) {
  const [month] = useMonth();
  const { data } = useStoreState();
  const store = useStore();
  const d = useDashboard(month);
  const money = useMoney();
  const { overall } = d.pacing;
  const recent = [...data.transactions].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : a.date < b.date ? 1 : -1)).slice(0, 5);

  return (
    <div className="screen">
      <header className="screen-head">
        <MonthSwitcher />
        <a className="icon-btn" href="#/settings" aria-label="Settings and backup">
          <Icon name="settings" />
        </a>
      </header>

      {data.transactions.length === 0 ? (
        <Empty title="No transactions yet" body="Add your first expense or income, or explore with sample data. Everything stays on this device.">
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={onAdd}>
              Add transaction
            </button>
            <button className="btn ghost" onClick={() => void store.loadSample()}>
              Load sample data
            </button>
          </div>
        </Empty>
      ) : (
        <>
          <section className="hero" aria-label={`Cashflow for ${formatMonthLong(month)}`}>
            <span className="label">Net cashflow</span>
            <span className="big num">{money(d.summary.netCents, { whole: true, signed: true })}</span>
            <div className="hero-grid">
              <div className="hero-cell">
                <span className="label">Income</span>
                <span className="v num" style={{ color: '#7fe0d6' }}>{money(d.summary.incomeCents, { whole: true })}</span>
              </div>
              <div className="hero-cell">
                <span className="label">Spent</span>
                <span className="v num">{money(d.summary.expenseCents, { whole: true })}</span>
              </div>
              <a className="hero-cell" href="#/plan/goals" style={{ color: '#fff', textDecoration: 'none' }}>
                <span className="label">Set aside</span>
                <span className="v num">{money(d.allocation.setAsideCents, { whole: true })}</span>
              </a>
            </div>
            {d.allocation.unallocatedCents > 0 && (
              <a href="#/plan/goals" className="label num" style={{ color: '#c9cbd2' }}>
                {money(d.allocation.unallocatedCents, { whole: true })} unallocated — ring-fence it in a goal →
              </a>
            )}
          </section>

          <a href="#/plan/budgets" className="card stack" style={{ textDecoration: 'none', color: 'inherit', gap: 8 }}>
            <div className="row between">
              <strong style={{ fontSize: 15 }}>Budget pace</strong>
              <PaceBadge status={overall.status} />
            </div>
            {overall.limitCents === null ? (
              <span className="muted small">Set a monthly budget to see pacing and a safe-to-spend figure.</span>
            ) : (
              <>
                <PaceBar pace={overall} elapsedPct={d.pacing.clock.isCurrent ? d.pacing.clock.elapsedPct : null} />
                <div className="row between small muted num">
                  <span>
                    {money(overall.spentCents, { whole: true })} of {money(overall.limitCents, { whole: true })} ({Math.round(overall.spentPct)}%)
                  </span>
                  {d.pacing.clock.isCurrent && (
                    <span>
                      Day {d.pacing.clock.daysElapsed} of {d.pacing.clock.daysInMonth}
                    </span>
                  )}
                </div>
                {d.pacing.clock.isCurrent && overall.safePerDayCents !== null && (
                  <div className="row" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 8, alignItems: 'baseline' }}>
                    <span className="num" style={{ fontSize: 20, fontWeight: 650 }}>
                      {money(overall.safePerDayCents, { whole: true })}/day
                    </span>
                    <span className="muted small num">
                      safe to spend for {d.pacing.clock.daysLeft} days
                      {overall.committedCents > 0 ? ` (${money(overall.committedCents, { whole: true })} of bills reserved)` : ''}
                    </span>
                  </div>
                )}
              </>
            )}
          </a>

          {d.signals.length > 0 && (
            <>
              <h2 className="section-title">
                Signals
                <a href="#/analytics/signals" style={{ fontSize: 13, fontWeight: 500 }}>
                  See all {d.signals.length}
                </a>
              </h2>
              <div className="stack">
                {d.signals.slice(0, 2).map((s) => (
                  <SignalCard key={s.id} insight={s} onAction={navigate} />
                ))}
              </div>
            </>
          )}

          <h2 className="section-title">
            Recent
            <a href="#/activity/transactions" style={{ fontSize: 13, fontWeight: 500 }}>
              All activity
            </a>
          </h2>
          <div className="card tight">
            {recent.map((t) => (
              <TxnRow key={t.id} t={t} onClick={() => onEdit(t.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
