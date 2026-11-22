import { PACE_LABEL } from '../../analytics';
import { formatMonthLong } from '../../domain/dates';
import { SAMPLE_PROFILES } from '../../seed/sampleData';
import { Empty, MonthSwitcher, PaceBar, TxnRow } from '../components/common';
import { PaceMascot } from '../components/PaceMascot';
import { Icon } from '../components/Icon';
import { insightEmoji, useCountUp } from '../components/visual';
import { useDashboard, useMoney, useMonth, useStore, useStoreState } from '../context';

/**
 * Home is a glance screen: big numbers, one gauge, a few one-line chips. Explanations live in
 * Analytics → Signals and Plan → Budgets, one tap away.
 */
export function Home({ navigate, onAdd, onEdit }: { navigate: (r: string) => void; onAdd: () => void; onEdit: (id: string) => void }) {
  const [month] = useMonth();
  const { data } = useStoreState();
  const store = useStore();
  const d = useDashboard(month);
  const money = useMoney();
  const { overall, clock } = d.pacing;
  const net = useCountUp(d.summary.netCents);
  const recent = [...data.transactions].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : a.date < b.date ? 1 : -1)).slice(0, 4);
  const w = (c: number) => money(c, { whole: true });
  // One chip per subject: a category with both a spike and a limit warning shows once (highest priority).
  const seen = new Set<string>();
  const chips = d.signals.filter((s) => {
    const key = s.categoryId ?? s.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="screen">
      <header className="screen-head">
        <MonthSwitcher />
        <a className="icon-btn" href="#/settings" aria-label="Settings and backup">
          <Icon name="settings" />
        </a>
      </header>

      {data.transactions.length === 0 ? (
        <Empty title="👋 Start tracking" body="Add a transaction or try sample data. Stays on this device.">
          <button className="btn primary" onClick={onAdd}>
            Add transaction
          </button>
          <span className="muted small">or explore with sample data</span>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            {SAMPLE_PROFILES.map((p) => (
              <button key={p.id} className="btn ghost" onClick={() => void store.loadSample(p.id)} aria-label={`Load sample data: ${p.label}`}>
                {p.emoji} {p.label}
              </button>
            ))}
          </div>
        </Empty>
      ) : (
        <>
          <section className="hero" aria-label={`Cashflow for ${formatMonthLong(month)}`}>
            <div className="top">
              <div className="stack" style={{ gap: 0 }}>
                <span className="label">Net cashflow</span>
                <span className="big num">{money(net, { whole: true, signed: true })}</span>
              </div>
              {d.allocation.unallocatedCents > 0 && (
                <a className="save-pill num" href="#/plan/goals" aria-label={`${w(d.allocation.unallocatedCents)} unallocated, set it aside in a goal`}>
                  💰 {w(d.allocation.unallocatedCents)} to save
                </a>
              )}
            </div>
            <div className="hero-grid">
              <div className="hero-cell">
                <span className="label">↓ In</span>
                <span className="v num" style={{ color: '#7fe0d6' }}>{w(d.summary.incomeCents)}</span>
              </div>
              <div className="hero-cell">
                <span className="label">↑ Out</span>
                <span className="v num">{w(d.summary.expenseCents)}</span>
              </div>
              <a className="hero-cell" href="#/plan/goals" style={{ color: '#fff', textDecoration: 'none' }}>
                <span className="label">🐷 Saved</span>
                <span className="v num">{w(d.allocation.setAsideCents)}</span>
              </a>
            </div>
          </section>

          <a href="#/plan/budgets" className="card pace-card" style={{ textDecoration: 'none', color: 'inherit' }} aria-label={`Budget pace: ${PACE_LABEL[overall.status]}. Open budgets.`}>
            <PaceMascot status={overall.status} size={68} />
            <div className="stack" style={{ gap: 8, minWidth: 0 }}>
              <div className="row between">
                <strong style={{ fontSize: 15 }}>Budget pace</strong>
                <span className={`pace-status ${overall.status}`}>{PACE_LABEL[overall.status]}</span>
              </div>
              {overall.limitCents === null ? (
                <div className="pills">
                  <span className="pill">➕ Set a monthly budget</span>
                </div>
              ) : (
                <>
                  <PaceBar pace={overall} large />
                  <div className="pills num">
                    {clock.isCurrent && overall.safePerDayCents !== null && (
                      <span className="pill strong" title="Safe to spend per day, bills already reserved">
                        {w(overall.safePerDayCents)}/day left
                      </span>
                    )}
                    {clock.isCurrent && <span className="pill">⏳ {clock.daysLeft}d left</span>}
                    <span className="pill">
                      {w(overall.spentCents)} <span className="k">/ {w(overall.limitCents)}</span>
                    </span>
                  </div>
                </>
              )}
            </div>
          </a>

          {d.signals.length > 0 && (
            <section className="stack" style={{ gap: 6 }} aria-label="Signals">
              <h2 className="section-title">
                Signals
                <a href="#/analytics/signals" style={{ fontSize: 13, fontWeight: 500 }}>
                  All {d.signals.length}
                </a>
              </h2>
              {chips.slice(0, 3).map((s) => (
                <button key={s.id} className={`alert-chip ${s.severity}`} onClick={() => navigate('analytics/signals')} aria-label={`${s.title}. Open signals.`}>
                  <span className="emo" aria-hidden="true">
                    {insightEmoji(s)}
                  </span>
                  <span className="lbl">{s.chip.label}</span>
                  <span className="met num">{s.chip.metric}</span>
                  <span className="chev">
                    <Icon name="chevronRight" size={16} />
                  </span>
                </button>
              ))}
            </section>
          )}

          <h2 className="section-title">
            Recent
            <a href="#/activity/transactions" style={{ fontSize: 13, fontWeight: 500 }}>
              All
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
