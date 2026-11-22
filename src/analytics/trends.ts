import { categoryOf, indexCategories } from '../domain/categories';
import {
  addMonthsToKey,
  daysInMonthKey,
  monthKey,
  monthRange,
  monthStart,
  parts,
  toISODate,
  monthParts,
  type ISODate,
  type MonthKey,
} from '../domain/dates';
import type { Cents } from '../domain/money';
import type { Category, Transaction } from '../domain/types';
import { inPeriod, type Period } from './breakdown';

export interface MonthPoint {
  month: MonthKey;
  incomeCents: Cents;
  expenseCents: Cents;
  netCents: Cents;
}

/**
 * Income/expense per month for the `count` months ending at `endMonth` (oldest first).
 * Anchored to the month being viewed, not to "today" (Inpenso's trend always ends at the
 * current month even when an older month is selected).
 */
export function monthlySeries(transactions: Transaction[], endMonth: MonthKey, count: number): MonthPoint[] {
  const months = monthRange(addMonthsToKey(endMonth, -(count - 1)), endMonth);
  const byMonth = new Map<MonthKey, MonthPoint>(
    months.map((m) => [m, { month: m, incomeCents: 0, expenseCents: 0, netCents: 0 }]),
  );
  for (const t of transactions) {
    const point = byMonth.get(monthKey(t.date));
    if (!point) continue;
    if (t.type === 'income') point.incomeCents += t.amountCents;
    else point.expenseCents += t.amountCents;
  }
  for (const p of byMonth.values()) p.netCents = p.incomeCents - p.expenseCents;
  return months.map((m) => byMonth.get(m)!);
}

/**
 * Like-for-like comparison window. For the current (partial) month we compare day 1..N of this
 * month against day 1..N of the previous month; comparing 22 days with a full previous month
 * would make every category look like it dropped.
 */
export function comparisonPeriods(month: MonthKey, today: ISODate): { current: Period; previous: Period; partial: boolean } {
  const prev = addMonthsToKey(month, -1);
  const isCurrent = monthKey(today) === month;
  const lastDay = isCurrent ? parts(today).day : daysInMonthKey(month);
  const { year: py, month: pm } = monthParts(prev);
  const prevLastDay = Math.min(lastDay, daysInMonthKey(prev));
  const { year, month: m } = monthParts(month);
  return {
    current: { from: monthStart(month), to: toISODate(year, m, lastDay) },
    previous: { from: monthStart(prev), to: toISODate(py, pm, isCurrent ? prevLastDay : daysInMonthKey(prev)) },
    partial: isCurrent,
  };
}

export interface CategoryMove {
  category: Category;
  currentCents: Cents;
  previousCents: Cents;
  deltaCents: Cents;
  /** null when there was no previous spend (a new category this month). */
  deltaPct: number | null;
}

export function categoryMovers(
  transactions: Transaction[],
  categories: Category[],
  month: MonthKey,
  today: ISODate,
): CategoryMove[] {
  const { current, previous } = comparisonPeriods(month, today);
  const index = indexCategories(categories);
  const totals = new Map<string, { cur: Cents; prev: Cents }>();
  const add = (list: Transaction[], key: 'cur' | 'prev') => {
    for (const t of list) {
      if (t.type !== 'expense') continue;
      const e = totals.get(t.categoryId) ?? { cur: 0, prev: 0 };
      e[key] += t.amountCents;
      totals.set(t.categoryId, e);
    }
  };
  add(inPeriod(transactions, current), 'cur');
  add(inPeriod(transactions, previous), 'prev');
  return [...totals.entries()]
    .map(([id, { cur, prev }]) => ({
      category: categoryOf(index, id),
      currentCents: cur,
      previousCents: prev,
      deltaCents: cur - prev,
      deltaPct: prev === 0 ? null : ((cur - prev) / prev) * 100,
    }))
    .sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents));
}

/** Number of distinct calendar months that contain at least one transaction before `month`. */
export function monthsOfHistory(transactions: Transaction[], month: MonthKey): number {
  return new Set(transactions.map((t) => monthKey(t.date)).filter((m) => m < month)).size;
}

/** Drop months before the first recorded activity so charts don't plot "no data" as $0. */
export function trimLeadingEmpty(series: MonthPoint[]): MonthPoint[] {
  const first = series.findIndex((p) => p.incomeCents !== 0 || p.expenseCents !== 0);
  return first === -1 ? series.slice(-1) : series.slice(first);
}
