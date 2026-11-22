import { categoryOf, indexCategories } from '../domain/categories';
import {
  addMonthsToKey,
  daysBetween,
  formatMonthLong,
  monthKey,
  monthRange,
  parts,
  toISODate,
  daysInMonth,
  type ISODate,
  type MonthKey,
} from '../domain/dates';
import type { Cents } from '../domain/money';
import type { Category, FinanceSnapshot, Transaction } from '../domain/types';
import { inPeriod, monthPeriod, summarise, type Period } from './breakdown';
import { comparisonPeriods, monthlySeries, type MonthPoint } from './trends';

export type StatementPeriod = { kind: 'month'; month: MonthKey } | { kind: 'year'; year: number };

export interface StatementTotals {
  incomeCents: Cents;
  expenseCents: Cents;
  netCents: Cents;
  savedToGoalsCents: Cents;
  count: number;
  avgDailySpendCents: Cents;
}

export interface StatementCategoryLine {
  category: Category;
  currentCents: Cents;
  previousCents: Cents;
  /** null when the previous period had nothing in this category. */
  deltaPct: number | null;
  sharePct: number;
}

export interface Statement {
  period: StatementPeriod;
  label: string;
  previousLabel: string;
  range: Period;
  previousRange: Period;
  /** True when the period is still running; the comparison then uses the same span last period. */
  partial: boolean;
  current: StatementTotals;
  previous: StatementTotals;
  /** Change vs previous period in %, null when previous is 0. */
  change: { income: number | null; expense: number | null; net: Cents };
  categories: StatementCategoryLine[];
  largest: Transaction[];
  /** Annual statements only: one row per month (Jan to Dec). */
  months?: MonthPoint[];
  bestMonth?: MonthPoint;
  worstMonth?: MonthPoint;
}

const pct = (cur: number, prev: number) => (prev === 0 ? null : ((cur - prev) / prev) * 100);

function totals(snapshot: FinanceSnapshot, range: Period): StatementTotals {
  const s = summarise(snapshot.transactions, snapshot.categories, range);
  const goals = new Set(snapshot.goals.map((g) => g.id));
  const saved = snapshot.contributions
    .filter((c) => goals.has(c.goalId) && c.date >= range.from && c.date <= range.to)
    .reduce((a, c) => a + c.amountCents, 0);
  const days = Math.max(1, daysBetween(range.from, range.to) + 1);
  return {
    incomeCents: s.incomeCents,
    expenseCents: s.expenseCents,
    netCents: s.netCents,
    savedToGoalsCents: saved,
    count: s.count,
    avgDailySpendCents: Math.round(s.expenseCents / days),
  };
}

function yearRanges(year: number, today: ISODate): { current: Period; previous: Period; partial: boolean } {
  const t = parts(today);
  const isCurrent = t.year === year;
  if (!isCurrent) {
    return {
      current: { from: `${year}-01-01`, to: `${year}-12-31` },
      previous: { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` },
      partial: false,
    };
  }
  // Year to date vs the same span last year (29 Feb clamps to 28 Feb).
  const prevDay = Math.min(t.day, daysInMonth(year - 1, t.month));
  return {
    current: { from: `${year}-01-01`, to: today },
    previous: { from: `${year - 1}-01-01`, to: toISODate(year - 1, t.month, prevDay) },
    partial: true,
  };
}

/** Bank-statement style review of a month or a year, compared like-for-like with the period before. */
export function buildStatement(snapshot: FinanceSnapshot, period: StatementPeriod, today: ISODate): Statement {
  const ranges =
    period.kind === 'month'
      ? (() => {
          const c = comparisonPeriods(period.month, today);
          const future = period.month > monthKey(today);
          return future ? { current: monthPeriod(period.month), previous: monthPeriod(addMonthsToKey(period.month, -1)), partial: false } : c;
        })()
      : yearRanges(period.year, today);

  const current = totals(snapshot, ranges.current);
  const previous = totals(snapshot, ranges.previous);
  const index = indexCategories(snapshot.categories);

  const byCat = new Map<string, { cur: Cents; prev: Cents }>();
  const add = (list: Transaction[], key: 'cur' | 'prev') => {
    for (const t of list) {
      if (t.type !== 'expense') continue;
      const e = byCat.get(t.categoryId) ?? { cur: 0, prev: 0 };
      e[key] += t.amountCents;
      byCat.set(t.categoryId, e);
    }
  };
  const curTx = inPeriod(snapshot.transactions, ranges.current);
  add(curTx, 'cur');
  add(inPeriod(snapshot.transactions, ranges.previous), 'prev');

  const categories = [...byCat.entries()]
    .map(([id, v]) => ({
      category: categoryOf(index, id),
      currentCents: v.cur,
      previousCents: v.prev,
      deltaPct: pct(v.cur, v.prev),
      sharePct: current.expenseCents ? (v.cur / current.expenseCents) * 100 : 0,
    }))
    .sort((a, b) => b.currentCents - a.currentCents || b.previousCents - a.previousCents);

  const largest = curTx
    .filter((t) => t.type === 'expense')
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 5);

  const label = period.kind === 'month' ? formatMonthLong(period.month) : String(period.year);
  const previousLabel = period.kind === 'month' ? formatMonthLong(addMonthsToKey(period.month, -1)) : String(period.year - 1);

  const result: Statement = {
    period,
    label,
    previousLabel,
    range: ranges.current,
    previousRange: ranges.previous,
    partial: ranges.partial,
    current,
    previous,
    change: { income: pct(current.incomeCents, previous.incomeCents), expense: pct(current.expenseCents, previous.expenseCents), net: current.netCents - previous.netCents },
    categories,
    largest,
  };

  if (period.kind === 'year') {
    const months = monthlySeries(snapshot.transactions, `${period.year}-12`, 12);
    const active = months.filter((m) => m.incomeCents || m.expenseCents);
    result.months = months;
    if (active.length) {
      result.bestMonth = active.reduce((a, b) => (b.netCents > a.netCents ? b : a));
      result.worstMonth = active.reduce((a, b) => (b.netCents < a.netCents ? b : a));
    }
  }
  return result;
}

/** Years and months that have data, newest first, for the period pickers. */
export function statementPeriods(transactions: Transaction[]): { years: number[]; months: MonthKey[] } {
  if (!transactions.length) return { years: [], months: [] };
  const keys = transactions.map((t) => monthKey(t.date)).sort();
  const months = monthRange(keys[0], keys[keys.length - 1]).reverse();
  const years = [...new Set(months.map((m) => Number(m.slice(0, 4))))];
  return { years, months };
}
