import { describe, expect, it } from 'vitest';
import { budget, rec, snapshot, txn } from '../test/fixtures';
import { checkAffordability } from './affordability';
import { monthPeriod, summarise } from './breakdown';
import { allocation, goalProgress } from './goals';
import { computePacing, monthClock, PACE_LABEL } from './pacing';
import { monthlyEquivalent, occurrencesBetween, pendingCommitments, summariseRecurring } from './recurring';
import { generateSignals } from './signals';
import { categoryMovers, comparisonPeriods, monthlySeries, trimLeadingEmpty } from './trends';

const TODAY = '2026-11-22';

/** November to date: rent $1,800 (fixed) + $2,116 flexible = $3,916; salary $5,200. */
function november() {
  return snapshot({
    transactions: [
      txn('2026-11-01', 'rent', 1800_00),
      txn('2026-11-06', 'salary', 2600_00),
      txn('2026-11-20', 'salary', 2600_00),
      txn('2026-11-05', 'groceries', 640_00),
      txn('2026-11-08', 'eating-out', 412_00),
      txn('2026-11-10', 'transport', 268_00),
      txn('2026-11-12', 'shopping', 246_00),
      txn('2026-11-14', 'utilities', 214_00, { categoryId: 'health' }),
      txn('2026-11-15', 'entertainment', 336_00),
    ],
    budgets: [budget(4500_00), budget(450_00, 'eating-out'), budget(750_00, 'groceries')],
    recurring: [rec({ title: 'Netflix', anchorDate: '2026-01-25', cadence: 'monthly', amountCents: 18_99 })],
  });
}

describe('breakdown', () => {
  it('totals cashflow and splits fixed vs flexible', () => {
    const s = summarise(november().transactions, november().categories, monthPeriod('2026-11'));
    expect(s.incomeCents).toBe(5200_00);
    expect(s.expenseCents).toBe(3916_00);
    expect(s.netCents).toBe(1284_00);
    expect(s.fixedExpenseCents).toBe(1800_00);
    expect(s.flexibleExpenseCents).toBe(2116_00);
    expect(s.expenseByCategory[0].category.id).toBe('rent');
    expect(Math.round(s.expenseByCategory.reduce((a, c) => a + c.sharePct, 0))).toBe(100);
  });
});

describe('recurring', () => {
  it('keeps a 31st anchor on month-end without drifting', () => {
    const r = rec({ anchorDate: '2026-01-31', cadence: 'monthly' });
    expect(occurrencesBetween(r, '2026-01-01', '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('handles weekly, fortnightly and yearly cadences', () => {
    expect(occurrencesBetween(rec({ anchorDate: '2026-11-02', cadence: 'weekly' }), '2026-11-10', '2026-11-30')).toEqual([
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ]);
    expect(occurrencesBetween(rec({ anchorDate: '2026-11-06', cadence: 'fortnightly' }), '2026-11-07', '2026-12-31')).toEqual([
      '2026-11-20',
      '2026-12-04',
      '2026-12-18',
    ]);
    expect(occurrencesBetween(rec({ anchorDate: '2024-02-29', cadence: 'yearly' }), '2025-01-01', '2026-12-31')).toEqual([
      '2025-02-28',
      '2026-02-28',
    ]);
  });

  it('skips paused items and respects end dates', () => {
    expect(occurrencesBetween(rec({ anchorDate: '2026-01-01', cadence: 'monthly', status: 'paused' }), '2026-01-01', '2026-12-31')).toEqual([]);
    expect(occurrencesBetween(rec({ anchorDate: '2026-01-01', cadence: 'monthly', endDate: '2026-03-15' }), '2026-01-01', '2026-12-31')).toHaveLength(3);
  });

  it('normalises to a monthly equivalent', () => {
    expect(monthlyEquivalent({ amountCents: 34_00, cadence: 'fortnightly' })).toBe(7367);
    expect(monthlyEquivalent({ amountCents: 1140_00, cadence: 'yearly' })).toBe(95_00);
    const s = summariseRecurring([
      rec({ anchorDate: '2026-01-01', cadence: 'monthly', amountCents: 20_00 }),
      rec({ anchorDate: '2026-01-01', cadence: 'weekly', amountCents: 10_00, status: 'paused' }),
    ]);
    expect(s.monthlySubscriptionCents).toBe(20_00);
    expect(s.pausedMonthlySavingsCents).toBe(4333);
  });

  it('only reserves commitments that have not been posted', () => {
    const r = rec({ anchorDate: '2026-01-25', cadence: 'monthly' });
    const posted = txn('2026-11-25', 'subscriptions', 10_00, { recurringId: r.id });
    expect(pendingCommitments([r], [], TODAY, '2026-11-30')).toHaveLength(1);
    expect(pendingCommitments([r], [posted], TODAY, '2026-11-30')).toHaveLength(0);
  });
});

describe('pacing', () => {
  it('counts today as a spendable day', () => {
    expect(monthClock('2026-11', TODAY)).toMatchObject({ daysElapsed: 22, daysLeft: 9, daysInMonth: 30 });
    expect(monthClock('2026-10', TODAY)).toMatchObject({ daysElapsed: 31, daysLeft: 0 });
  });

  it('projects fixed costs once and flexible spend at the calendar-day rate', () => {
    const { overall } = computePacing(november(), '2026-11', TODAY);
    expect(overall.spentCents).toBe(3916_00);
    expect(overall.committedCents).toBe(18_99);
    // flexible $2,116 over 22 elapsed calendar days (not only days with spending)
    expect(overall.dailyRateCents).toBe(9618);
    // 3916 + 18.99 + 96.18 × 8 remaining days after today
    expect(overall.projectedCents).toBe(4704_44);
    // (4500 − 3916 − 18.99) / 9 days left including today
    expect(overall.safePerDayCents).toBe(62_77);
    expect(overall.status).toBe('fast');
    // pace marker: 1800 fixed + (4500 − 1800 − 18.99) × 22/30 = 3766.07 → 83.7% of the limit
    expect(overall.idealPct).toBeCloseTo(83.69, 1);
    expect(overall.spentPct).toBeGreaterThan(overall.idealPct!);
    expect(PACE_LABEL[overall.status]).toBe('Spending fast');
  });

  it('distinguishes over, under, on-pace and no-budget', () => {
    const s = november();
    expect(computePacing({ ...s, budgets: [budget(3000_00)] }, '2026-11', TODAY).overall.status).toBe('over');
    expect(computePacing({ ...s, budgets: [budget(6000_00)] }, '2026-11', TODAY).overall.status).toBe('under');
    expect(computePacing({ ...s, budgets: [budget(4900_00)] }, '2026-11', TODAY).overall.status).toBe('on-pace');
    expect(computePacing({ ...s, budgets: [] }, '2026-11', TODAY).overall.status).toBe('no-budget');
  });

  it('prefers a month-specific budget over the default', () => {
    const s = { ...november(), budgets: [budget(4500_00), budget(5000_00, null, '2026-11')] };
    expect(computePacing(s, '2026-11', TODAY).overall.limitCents).toBe(5000_00);
  });

  it('reports category limits worst-first', () => {
    const cats = computePacing(november(), '2026-11', TODAY).categories;
    expect(cats.map((c) => [c.label, c.status])).toEqual([
      ['Eating Out', 'fast'],
      ['Groceries', 'fast'],
    ]);
  });
});

describe('trends', () => {
  it('compares like-for-like days for the current month', () => {
    expect(comparisonPeriods('2026-11', TODAY)).toEqual({
      current: { from: '2026-11-01', to: '2026-11-22' },
      previous: { from: '2026-10-01', to: '2026-10-22' },
      partial: true,
    });
    expect(comparisonPeriods('2026-03', TODAY).previous).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('anchors the series to the selected month, not today', () => {
    const s = monthlySeries([txn('2026-05-03', 'groceries', 10_00)], '2026-06', 6);
    expect(s.map((p) => p.month)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
    expect(s[4].expenseCents).toBe(10_00);
    expect(trimLeadingEmpty(s).map((p) => p.month)).toEqual(['2026-05', '2026-06']);
    expect(trimLeadingEmpty(monthlySeries([], '2026-06', 6))).toHaveLength(1);
  });

  it('ranks movers by absolute change', () => {
    const movers = categoryMovers(
      [txn('2026-10-05', 'eating-out', 100_00), txn('2026-11-05', 'eating-out', 160_00), txn('2026-10-25', 'shopping', 999_00)],
      snapshot().categories,
      '2026-11',
      TODAY,
    );
    // the 25 Oct shopping is outside the 1–22 Oct comparison window
    expect(movers).toHaveLength(1);
    expect(movers[0]).toMatchObject({ deltaCents: 60_00, deltaPct: 60 });
  });
});

describe('signals', () => {
  function withHistory() {
    const s = november();
    for (const m of ['2026-09', '2026-10']) {
      for (const d of ['03', '08', '12', '16', '20']) s.transactions.push(txn(`${m}-${d}`, 'eating-out', 50_00));
      for (const d of ['04', '09', '13', '17', '21']) s.transactions.push(txn(`${m}-${d}`, 'transport', 15_00));
    }
    s.transactions.push(txn('2026-11-19', 'transport', 64_20, { title: 'Uber' }));
    return s;
  }

  it('raises budget burn, spike, unusual and upcoming signals, highest priority first', () => {
    const insights = generateSignals({ snapshot: withHistory(), month: '2026-11', today: TODAY });
    const kinds = insights.map((i) => i.kind);
    expect(kinds).toContain('budget-burn');
    expect(kinds).toContain('spend-spike');
    expect(kinds).toContain('unusual-transaction');
    expect(kinds).toContain('upcoming-recurring');
    const priorities = insights.map((i) => i.priority);
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
    const spike = insights.find((i) => i.kind === 'spend-spike' && i.title.startsWith('Eating Out'));
    // $412 (1–22 Nov) vs 5 × $50 = $250 (1–22 Oct) → +64.8%
    expect(spike?.title).toBe('Eating Out is up 65% vs last month');
    expect(spike?.chip).toEqual({ label: 'Eating Out', metric: '+65%' });
    expect(spike?.categoryId).toBe('eating-out');
    // every signal has a compact chip for Home
    expect(insights.every((i) => i.chip.label.length > 0 && i.chip.metric.length > 0)).toBe(true);
  });

  it('stays quiet on comparative signals without two months of history', () => {
    const kinds = generateSignals({ snapshot: november(), month: '2026-11', today: TODAY }).map((i) => i.kind);
    expect(kinds).not.toContain('spend-spike');
    expect(kinds).not.toContain('unusual-transaction');
  });

  it('nudges unallocated surplus into goals near month end', () => {
    const s = { ...november(), budgets: [] };
    expect(generateSignals({ snapshot: s, month: '2026-11', today: TODAY }).some((i) => i.kind === 'unallocated-surplus')).toBe(true);
    expect(generateSignals({ snapshot: s, month: '2026-11', today: '2026-11-10' }).some((i) => i.kind === 'unallocated-surplus')).toBe(false);
  });
});

describe('goals', () => {
  const goal = { id: 'g1', name: 'Japan', targetCents: 4000_00, icon: 'plane', color: '#000', targetDate: '2027-07-22', createdAt: '' };

  it('tracks progress and per-month requirement', () => {
    const p = goalProgress(goal, [{ id: 'c1', goalId: 'g1', amountCents: 1200_00, date: '2026-10-28' }], TODAY);
    expect(p).toMatchObject({ savedCents: 1200_00, remainingCents: 2800_00, pct: 30, complete: false, perMonthNeededCents: 350_00 });
  });

  it('ring-fences contributions out of unallocated cashflow', () => {
    const s = { ...november(), goals: [goal], contributions: [{ id: 'c1', goalId: 'g1', amountCents: 500_00, date: '2026-11-21' }] };
    expect(allocation(s, '2026-11')).toMatchObject({ netCashflowCents: 1284_00, setAsideCents: 500_00, unallocatedCents: 784_00 });
  });
});

describe('affordability', () => {
  it('returns comfortable / tight / over-budget verdicts', () => {
    const s = november();
    expect(checkAffordability(s, { amountCents: 20_00, categoryId: 'health' }, TODAY).verdict).toBe('tight');
    const roomy = { ...s, budgets: [budget(5600_00)] };
    expect(checkAffordability(roomy, { amountCents: 50_00, categoryId: 'shopping' }, TODAY).verdict).toBe('comfortable');
    expect(checkAffordability(s, { amountCents: 700_00, categoryId: 'shopping' }, TODAY).verdict).toBe('over-budget');
  });

  it('flags a broken category limit even when the overall budget fits', () => {
    const roomy = { ...november(), budgets: [budget(9000_00), budget(450_00, 'eating-out')] };
    const r = checkAffordability(roomy, { amountCents: 60_00, categoryId: 'eating-out' }, TODAY);
    expect(r.verdict).toBe('tight');
    expect(r.categoryOverLimit).toBe(true);
    expect(r.categoryLeftAfterCents).toBe(-22_00);
  });

  it('works for any category, including fixed ones', () => {
    const r = checkAffordability(november(), { amountCents: 100_00, categoryId: 'rent' }, TODAY);
    expect(r.budgetLeftAfterCents).toBe(4500_00 - 3916_00 - 18_99 - 100_00);
    expect(r.netAfterCents).toBe(1184_00);
  });

  it('rejects non-positive or fractional amounts', () => {
    expect(() => checkAffordability(november(), { amountCents: 0, categoryId: 'rent' }, TODAY)).toThrow(RangeError);
    expect(() => checkAffordability(november(), { amountCents: 1.5, categoryId: 'rent' }, TODAY)).toThrow(RangeError);
  });
});
