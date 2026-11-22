import { useState } from 'react';
import { formatMonthLong } from '../../domain/dates';
import { trimLeadingEmpty } from '../../analytics';
import { CompositionStrip, Donut, IncomeSpendBars, IncomeSpendLines } from '../components/charts';
import { CategoryDot, Empty, MonthSwitcher, Segmented, SignalCard } from '../components/common';
import { Icon } from '../components/Icon';
import { useDashboard, useMoney, useMonth, useStore, useStoreState } from '../context';

type Sub = 'breakdown' | 'trends' | 'signals';

export function Analytics({ sub, navigate }: { sub: string; navigate: (r: string) => void }) {
  const current = (['breakdown', 'trends', 'signals'].includes(sub) ? sub : 'breakdown') as Sub;
  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Analytics</h1>
        <MonthSwitcher />
      </header>
      <Segmented
        label="Analytics view"
        value={current}
        onChange={(v) => navigate(`analytics/${v}`)}
        options={[
          { value: 'breakdown', label: 'Breakdown' },
          { value: 'trends', label: 'Trends' },
          { value: 'signals', label: 'Signals' },
        ]}
      />
      {current === 'breakdown' && <Breakdown />}
      {current === 'trends' && <Trends />}
      {current === 'signals' && <Signals navigate={navigate} />}
    </div>
  );
}

function Breakdown() {
  const [month] = useMonth();
  const d = useDashboard(month);
  const money = useMoney();
  const store = useStore();
  const { data } = useStoreState();
  const [side, setSide] = useState<'expense' | 'income'>('expense');
  const chart = data.settings.chartPrefs.breakdown;
  const items = side === 'expense' ? d.summary.expenseByCategory : d.summary.incomeByCategory;
  const total = side === 'expense' ? d.summary.expenseCents : d.summary.incomeCents;

  return (
    <>
      <div className="row between">
        <Segmented
          small
          label="Spending or income"
          value={side}
          onChange={setSide}
          options={[
            { value: 'expense', label: 'Spending' },
            { value: 'income', label: 'Income' },
          ]}
        />
        <Segmented
          small
          label="Chart type"
          value={chart}
          onChange={(v) => store.updateSettings({ chartPrefs: { ...data.settings.chartPrefs, breakdown: v } })}
          options={[
            { value: 'bar', label: 'Bar' },
            { value: 'donut', label: 'Donut' },
          ]}
        />
      </div>
      {items.length === 0 ? (
        <Empty title={`No ${side === 'expense' ? 'spending' : 'income'} in ${formatMonthLong(month)}`} body="Pick another month or add a transaction." />
      ) : (
        <>
          <div className="card stack">
            {chart === 'donut' ? (
              <Donut items={items} total={money(total, { whole: true })} centerLabel={side === 'expense' ? 'spent' : 'earned'} />
            ) : (
              <>
                <div className="row between" style={{ alignItems: 'baseline' }}>
                  <span className="num" style={{ fontSize: 26, fontWeight: 650 }}>{money(total, { whole: true })}</span>
                  <span className="muted small num">
                    {items.length} categories · {items.reduce((s, i) => s + i.count, 0)} txns
                  </span>
                </div>
                <CompositionStrip items={items} />
              </>
            )}
            {side === 'expense' && (
              <span className="muted small num">
                Fixed {money(d.summary.fixedExpenseCents, { whole: true })} · Flexible {money(d.summary.flexibleExpenseCents, { whole: true })}
              </span>
            )}
          </div>
          <div className="card tight">
            {items.map((i) => (
              <div className="list-row" key={i.category.id}>
                <CategoryDot category={i.category} size={30} />
                <div className="grow stack" style={{ gap: 4 }}>
                  <div className="row between">
                    <span className="title">{i.category.name}</span>
                    <span className="amount num">{money(i.totalCents)}</span>
                  </div>
                  {chart === 'bar' && (
                    <div className="bar" style={{ height: 6 }} aria-hidden="true">
                      <div className="fill" style={{ width: `${(i.totalCents / items[0].totalCents) * 100}%`, background: i.category.color }} />
                    </div>
                  )}
                  <div className="row between sub num">
                    <span>{side === 'expense' ? (i.category.spendClass === 'fixed' ? 'Fixed' : 'Flexible') : `${i.count} payments`}</span>
                    <span>{Math.round(i.sharePct)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Trends() {
  const [month] = useMonth();
  const d = useDashboard(month);
  const money = useMoney();
  const store = useStore();
  const { data } = useStoreState();
  const chart = data.settings.chartPrefs.trends;
  const { overall, clock } = d.pacing;
  const series = trimLeadingEmpty(d.series);
  const projected = clock.isCurrent ? { index: series.length - 1, expenseCents: overall.projectedCents } : null;
  const fmt = (c: number) => money(c, { whole: true });

  return (
    <>
      <div className="card stack">
        <div className="row between">
          <div className="legend">
            <span style={{ ['--c' as string]: '#5FB8AE' }}>Income</span>
            <span style={{ ['--c' as string]: '#3346D3' }}>Spent</span>
          </div>
          <Segmented
            small
            label="Chart type"
            value={chart}
            onChange={(v) => store.updateSettings({ chartPrefs: { ...data.settings.chartPrefs, trends: v } })}
            options={[
              { value: 'bar', label: 'Bar' },
              { value: 'line', label: 'Line' },
            ]}
          />
        </div>
        {chart === 'line' ? (
          <IncomeSpendLines series={series} budgetCents={overall.limitCents} projected={projected} format={fmt} />
        ) : (
          <IncomeSpendBars series={series} budgetCents={overall.limitCents} projected={projected} format={fmt} />
        )}
        {projected && (
          <div className="stack" style={{ gap: 2, borderTop: '1px solid var(--line-soft)', paddingTop: 8 }}>
            <span className="muted small">{formatMonthLong(month)} projection ({chart === 'bar' ? 'hatched' : 'dashed'})</span>
            <div className="row" style={{ alignItems: 'baseline' }}>
              <span className="num" style={{ fontSize: 20, fontWeight: 650 }}>{fmt(overall.projectedCents)}</span>
              {overall.limitCents !== null && (
                <span className="num small" style={{ fontWeight: 600, color: overall.projectedCents > overall.limitCents ? 'var(--warn)' : 'var(--good)' }}>
                  {overall.projectedCents > overall.limitCents
                    ? `${fmt(overall.projectedCents - overall.limitCents)} over budget`
                    : `${fmt(overall.limitCents - overall.projectedCents)} under budget`}
                </span>
              )}
            </div>
            <span className="muted small num">
              Spent so far + bills still due + day-to-day rate of {fmt(overall.dailyRateCents)}/day for the remaining {Math.max(0, clock.daysLeft - 1)} days
            </span>
          </div>
        )}
      </div>
      <h2 className="section-title">Biggest movers vs last month</h2>
      {d.historyMonths < 1 ? (
        <Empty title="Not enough history yet" body="Movers appear once there's a previous month to compare against." />
      ) : (
        <div className="card tight">
          {d.movers.slice(0, 6).map((m) => (
            <div className="list-row" key={m.category.id}>
              <CategoryDot category={m.category} size={30} />
              <span className="grow title">{m.category.name}</span>
              <span className="amount num" style={{ color: m.deltaCents > 0 ? 'var(--warn)' : 'var(--good)' }}>
                {m.deltaCents > 0 ? '▲' : m.deltaCents < 0 ? '▼' : '•'} {m.deltaPct === null ? 'new' : `${Math.abs(Math.round(m.deltaPct))}%`} ·{' '}
                {money(m.deltaCents, { whole: true, signed: true })}
              </span>
            </div>
          ))}
          {d.movers.length === 0 && <div className="list-row muted small">No spending to compare.</div>}
        </div>
      )}
    </>
  );
}

function Signals({ navigate }: { navigate: (r: string) => void }) {
  const [month] = useMonth();
  const d = useDashboard(month);
  return (
    <>
      {d.signals.length === 0 ? (
        <Empty title="All quiet" body="No budget, spike or bill signals for this month." />
      ) : (
        d.signals.map((s) => <SignalCard key={s.id} insight={s} onAction={navigate} />)
      )}
      {d.historyMonths < 2 && (
        <p className="muted small" style={{ margin: 0 }}>
          Spike and unusual-spend signals switch on after 2 months of history, so you aren't shown noise.
        </p>
      )}
      <p className="row muted small" style={{ margin: 0, alignItems: 'flex-start' }}>
        <Icon name="lock" size={16} />
        Signals are computed on this device from your own records. Nothing is sent anywhere.
      </p>
    </>
  );
}
