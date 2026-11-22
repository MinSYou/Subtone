import { describe, expect, it } from 'vitest';
import { snapshot, txn } from '../test/fixtures';
import { buildStatement, statementPeriods } from './statement';

const TODAY = '2026-11-22';

function data() {
  return snapshot({
    transactions: [
      txn('2025-03-10', 'groceries', 100_00),
      txn('2025-11-05', 'salary', 2000_00),
      txn('2025-11-06', 'groceries', 300_00),
      txn('2026-01-15', 'salary', 2600_00),
      txn('2026-01-20', 'rent', 1800_00),
      txn('2026-10-04', 'salary', 2600_00),
      txn('2026-10-05', 'eating-out', 200_00),
      txn('2026-10-25', 'eating-out', 999_00),
      txn('2026-11-06', 'salary', 2600_00),
      txn('2026-11-08', 'eating-out', 300_00),
      txn('2026-11-09', 'groceries', 150_00),
    ],
    goals: [{ id: 'g', name: 'Trip', targetCents: 1000_00, icon: 'plane', color: '#000', createdAt: '' }],
    contributions: [{ id: 'c', goalId: 'g', amountCents: 400_00, date: '2026-11-10' }],
  });
}

describe('monthly statement', () => {
  it('summarises the month and compares like-for-like with last month', () => {
    const s = buildStatement(data(), { kind: 'month', month: '2026-11' }, TODAY);
    expect(s.label).toBe('November 2026');
    expect(s.partial).toBe(true);
    expect(s.current).toMatchObject({ incomeCents: 2600_00, expenseCents: 450_00, netCents: 2150_00, savedToGoalsCents: 400_00, count: 3 });
    // 1 to 22 Oct only: the $999 on 25 Oct is excluded
    expect(s.previous).toMatchObject({ incomeCents: 2600_00, expenseCents: 200_00 });
    expect(s.change.expense).toBe(125);
    expect(s.categories.map((c) => [c.category.id, c.currentCents, c.previousCents])).toEqual([
      ['eating-out', 300_00, 200_00],
      ['groceries', 150_00, 0],
    ]);
    expect(s.categories[1].deltaPct).toBeNull();
    expect(s.largest[0].amountCents).toBe(300_00);
    expect(s.current.avgDailySpendCents).toBe(Math.round(450_00 / 22));
  });

  it('uses the full previous month for a completed month', () => {
    const s = buildStatement(data(), { kind: 'month', month: '2026-10' }, TODAY);
    expect(s.partial).toBe(false);
    expect(s.current.expenseCents).toBe(1199_00);
    expect(s.range).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });
});

describe('annual statement', () => {
  it('compares year to date with the same span last year and finds best and worst months', () => {
    const s = buildStatement(data(), { kind: 'year', year: 2026 }, TODAY);
    expect(s.partial).toBe(true);
    expect(s.range).toEqual({ from: '2026-01-01', to: '2026-11-22' });
    expect(s.previousRange).toEqual({ from: '2025-01-01', to: '2025-11-22' });
    expect(s.current).toMatchObject({ incomeCents: 7800_00, expenseCents: 3449_00, netCents: 4351_00 });
    expect(s.previous).toMatchObject({ incomeCents: 2000_00, expenseCents: 400_00 });
    expect(s.months).toHaveLength(12);
    expect(s.months![0].month).toBe('2026-01');
    expect(s.bestMonth?.month).toBe('2026-11');
    expect(s.worstMonth?.month).toBe('2026-01');
  });

  it('lists the periods that have data, newest first', () => {
    const { years, months } = statementPeriods(data().transactions);
    expect(years).toEqual([2026, 2025]);
    expect(months[0]).toBe('2026-11');
    expect(months.at(-1)).toBe('2025-03');
  });
});
