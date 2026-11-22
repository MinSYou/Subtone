import { useMemo, useState } from 'react';
import { buildStatement, statementPeriods, type StatementPeriod } from '../../analytics';
import { formatDayMonth, formatMonthLong, formatMonthShort, monthKey, parts } from '../../domain/dates';
import { transactionsToCsv } from '../../persistence/backup';
import { CategoryDot, Empty, Segmented } from '../components/common';
import { Icon } from '../components/Icon';
import { Select } from '../components/pickers';
import { useMoney, useStoreState, useToday } from '../context';
import { play } from '../sound';

/** Bank-statement style review: one month or one year, compared with the period before. */
export function StatementView() {
  const { data } = useStoreState();
  const today = useToday();
  const money = useMoney();
  const [kind, setKind] = useState<'month' | 'year'>('month');
  const periods = useMemo(() => statementPeriods(data.transactions), [data.transactions]);
  const [month, setMonth] = useState(monthKey(today));
  const [year, setYear] = useState(parts(today).year);
  const period: StatementPeriod = kind === 'month' ? { kind, month } : { kind, year };
  const s = useMemo(() => buildStatement(data, period, today), [data, kind, month, year, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const w = (c: number) => money(c, { whole: true });

  if (!data.transactions.length) return <Empty title="No statement yet" body="Statements appear once you have transactions." />;

  const monthOptions = (periods.months.includes(month) ? periods.months : [month, ...periods.months]).map((m) => ({ value: m, label: formatMonthLong(m) }));
  const yearOptions = (periods.years.includes(year) ? periods.years : [year, ...periods.years]).map((y) => ({ value: String(y), label: String(y) }));
  const fmtRange = (r: { from: string; to: string }) => `${formatDayMonth(r.from)} to ${formatDayMonth(r.to)} ${r.to.slice(0, 4)}`;

  const delta = (pct: number | null, higherIsGood: boolean) => {
    if (pct === null) return <span className="delta muted">new</span>;
    const up = pct >= 0;
    const cls = up ? (higherIsGood ? 'good-up' : 'up') : higherIsGood ? 'up' : 'down';
    return (
      <span className={`delta ${cls}`}>
        {up ? '▲' : '▼'} {Math.abs(Math.round(pct))}%
      </span>
    );
  };

  const exportCsv = () => {
    const scoped = { ...data, transactions: data.transactions.filter((t) => t.date >= s.range.from && t.date <= s.range.to) };
    const url = URL.createObjectURL(new Blob(['﻿' + transactionsToCsv(scoped)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `subtone-statement-${kind === 'month' ? month : year}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    play('success');
  };

  return (
    <>
      <div className="row" style={{ alignItems: 'stretch' }}>
        <div style={{ flex: '0 0 170px' }}>
          <Segmented small label="Statement period" value={kind} onChange={setKind} options={[{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Annual' }]} />
        </div>
        <div className="grow" style={{ minWidth: 0 }}>
          {kind === 'month' ? (
            <Select label="Month" value={month} onChange={setMonth} options={monthOptions} />
          ) : (
            <Select label="Year" value={String(year)} onChange={(y) => setYear(Number(y))} options={yearOptions} />
          )}
        </div>
      </div>

      <section className="card stack" aria-label={`Statement for ${s.label}`}>
        <div className="row between" style={{ alignItems: 'baseline' }}>
          <strong style={{ fontSize: 16 }}>🧾 {s.label}</strong>
          {s.partial && <span className="pill">to date</span>}
        </div>
        <span className="muted small num">
          {fmtRange(s.range)} · compared with {fmtRange(s.previousRange)}
        </span>
        <div className="stmt-head num">
          <div className="stmt-cell">
            <span className="muted small">↓ Money in</span>
            <span className="v" style={{ color: 'var(--good)' }}>{w(s.current.incomeCents)}</span>
            {delta(s.change.income, true)}
          </div>
          <div className="stmt-cell">
            <span className="muted small">↑ Money out</span>
            <span className="v">{w(s.current.expenseCents)}</span>
            {delta(s.change.expense, false)}
          </div>
          <div className="stmt-cell">
            <span className="muted small">= Net position</span>
            <span className="v" style={{ color: s.current.netCents >= 0 ? 'var(--good)' : 'var(--warn)' }}>{money(s.current.netCents, { whole: true, signed: true })}</span>
            <span className={`delta ${s.change.net >= 0 ? 'good-up' : 'up'}`}>{money(s.change.net, { whole: true, signed: true })} vs before</span>
          </div>
          <div className="stmt-cell">
            <span className="muted small">🐷 Saved to goals</span>
            <span className="v">{w(s.current.savedToGoalsCents)}</span>
            <span className="muted small">{w(s.previous.savedToGoalsCents)} before</span>
          </div>
        </div>
        <div className="pills num">
          <span className="pill">{s.current.count} transactions</span>
          <span className="pill">{w(s.current.avgDailySpendCents)}/day avg spend</span>
        </div>
      </section>

      {s.months && (
        <>
          <h2 className="section-title">Month by month</h2>
          <div className="card tight table-wrap">
            <table className="stmt-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="r">In</th>
                  <th className="r">Out</th>
                  <th className="r">Net</th>
                </tr>
              </thead>
              <tbody>
                {s.months
                  .filter((m) => m.incomeCents || m.expenseCents)
                  .map((m) => (
                    <tr key={m.month}>
                      <td>
                        {formatMonthShort(m.month)}
                        {s.bestMonth?.month === m.month ? ' 🏆' : s.worstMonth?.month === m.month && s.bestMonth?.month !== m.month ? ' ⚠️' : ''}
                      </td>
                      <td className="r">{w(m.incomeCents)}</td>
                      <td className="r">{w(m.expenseCents)}</td>
                      <td className="r" style={{ color: m.netCents >= 0 ? 'var(--good)' : 'var(--warn)', fontWeight: 600 }}>
                        {money(m.netCents, { whole: true, signed: true })}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="section-title">Spending by category</h2>
      <div className="card tight table-wrap">
        <table className="stmt-table">
          <thead>
            <tr>
              <th>Category</th>
              <th className="r">{s.label.split(' ')[0]}</th>
              <th className="r">Before</th>
              <th className="r">Change</th>
            </tr>
          </thead>
          <tbody>
            {s.categories.map((c) => (
              <tr key={c.category.id}>
                <td>
                  <span className="row" style={{ gap: 8 }}>
                    <CategoryDot category={c.category} size={24} />
                    {c.category.name}
                  </span>
                </td>
                <td className="r">{w(c.currentCents)}</td>
                <td className="r muted">{w(c.previousCents)}</td>
                <td className="r">{delta(c.deltaPct, false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {s.largest.length > 0 && (
        <>
          <h2 className="section-title">Largest expenses</h2>
          <div className="card tight">
            {s.largest.map((t) => (
              <div className="list-row" key={t.id}>
                <span className="grow stack" style={{ gap: 0 }}>
                  <span className="title">{t.title}</span>
                  <span className="sub">{formatDayMonth(t.date)}</span>
                </span>
                <span className="amount num">{money(t.amountCents)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <button className="btn ghost block" onClick={exportCsv}>
        <Icon name="download" size={18} /> Download this statement (CSV)
      </button>
    </>
  );
}
