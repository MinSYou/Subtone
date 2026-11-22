import { categoryOf, indexCategories } from '../domain/categories';
import { daysInMonthKey, monthEnd, monthKey, parts, type ISODate, type MonthKey } from '../domain/dates';
import { percent, type Cents } from '../domain/money';
import type { Budget, Category, FinanceSnapshot, Id } from '../domain/types';
import { inPeriod, monthPeriod } from './breakdown';
import { pendingCommitments } from './recurring';

/**
 * - `under`: projected to finish well under the limit (< 90%).
 * - `on-pace`: projected to finish at 90–100% of the limit.
 * - `fast`: not over yet, but the current run-rate ends the month over the limit ("Spending fast").
 * - `over`: already spent more than the limit.
 * - `no-budget`: no limit set.
 */
export type PaceStatus = 'under' | 'on-pace' | 'fast' | 'over' | 'no-budget';

export const PACE_LABEL: Record<PaceStatus, string> = {
  under: 'Under pace',
  'on-pace': 'On pace',
  fast: 'Spending fast',
  over: 'Over budget',
  'no-budget': 'No budget set',
};

export interface MonthClock {
  month: MonthKey;
  daysInMonth: number;
  /** Days counted as elapsed, today included. 0 for a future month, all days for a past month. */
  daysElapsed: number;
  /** Days still available to spend in, today included. */
  daysLeft: number;
  elapsedPct: number;
  isCurrent: boolean;
}

export function monthClock(month: MonthKey, today: ISODate): MonthClock {
  const dim = daysInMonthKey(month);
  const todayMonth = monthKey(today);
  const isCurrent = todayMonth === month;
  const daysElapsed = isCurrent ? parts(today).day : month < todayMonth ? dim : 0;
  const daysLeft = isCurrent ? dim - parts(today).day + 1 : month > todayMonth ? dim : 0;
  return { month, daysInMonth: dim, daysElapsed, daysLeft, elapsedPct: percent(daysElapsed, dim), isCurrent };
}

/** Month-specific budget wins over the standing "default" budget. */
export function resolveBudget(budgets: Budget[], month: MonthKey, categoryId: Id | null): Budget | undefined {
  return (
    budgets.find((b) => b.month === month && b.categoryId === categoryId) ??
    budgets.find((b) => b.month === 'default' && b.categoryId === categoryId)
  );
}

export interface PaceResult {
  categoryId: Id | null;
  label: string;
  limitCents: Cents | null;
  spentCents: Cents;
  /** Recurring expenses due later this month that are not posted yet. */
  committedCents: Cents;
  remainingCents: Cents | null;
  spentPct: number;
  projectedCents: Cents;
  /** Daily flexible run-rate used for the projection. */
  dailyRateCents: Cents;
  /** Amount per remaining day that keeps you within the limit after commitments. */
  safePerDayCents: Cents | null;
  /**
   * Where spending "should" be today, as % of the limit: fixed costs already paid count in full
   * (rent lands on the 1st), the rest of the limit is spread evenly over the month. Drawn as the
   * pace marker so the bar and the status badge agree. null outside the current month.
   */
  idealPct: number | null;
  status: PaceStatus;
}

function statusFor(limit: number | null, spent: number, projected: number): PaceStatus {
  if (limit === null) return 'no-budget';
  if (spent > limit) return 'over';
  if (projected > limit) return 'fast';
  if (projected < limit * 0.9) return 'under';
  return 'on-pace';
}

interface Scope {
  categoryId: Id | null;
  label: string;
  matches: (categoryId: Id) => boolean;
}

function pace(snapshot: FinanceSnapshot, clock: MonthClock, today: ISODate, scope: Scope): PaceResult {
  const index = indexCategories(snapshot.categories);
  const spentTx = inPeriod(snapshot.transactions, monthPeriod(clock.month)).filter(
    (t) => t.type === 'expense' && scope.matches(t.categoryId),
  );
  let fixed = 0;
  let flexible = 0;
  for (const t of spentTx) {
    if (categoryOf(index, t.categoryId).spendClass === 'fixed') fixed += t.amountCents;
    else flexible += t.amountCents;
  }
  const spent = fixed + flexible;
  const committed = clock.isCurrent
    ? pendingCommitments(
        snapshot.recurring.filter((r) => scope.matches(r.categoryId)),
        snapshot.transactions,
        today,
        monthEnd(clock.month),
      ).reduce((s, o) => s + o.item.amountCents, 0)
    : 0;
  const dailyRate = clock.daysElapsed > 0 ? flexible / clock.daysElapsed : 0;
  const daysAfterToday = Math.max(0, clock.daysLeft - 1);
  const projected = Math.round(spent + committed + dailyRate * daysAfterToday);
  const budget = resolveBudget(snapshot.budgets, clock.month, scope.categoryId);
  const limit = budget ? budget.limitCents : null;
  const remaining = limit === null ? null : limit - spent;
  const safe =
    limit === null || clock.daysLeft === 0
      ? null
      : Math.max(0, Math.floor((limit - spent - committed) / clock.daysLeft));
  const idealPct =
    limit === null || !clock.isCurrent
      ? null
      : percent(fixed + Math.max(0, limit - fixed - committed) * (clock.daysElapsed / clock.daysInMonth), limit);
  return {
    categoryId: scope.categoryId,
    label: scope.label,
    limitCents: limit,
    spentCents: spent,
    committedCents: committed,
    remainingCents: remaining,
    spentPct: limit ? percent(spent, limit) : 0,
    projectedCents: clock.daysElapsed === 0 ? spent + committed : projected,
    dailyRateCents: Math.round(dailyRate),
    safePerDayCents: safe,
    idealPct,
    status: statusFor(limit, spent, clock.isCurrent ? projected : spent),
  };
}

export interface PacingReport {
  clock: MonthClock;
  overall: PaceResult;
  /** Categories that have a limit, worst status first. */
  categories: PaceResult[];
}

const STATUS_ORDER: Record<PaceStatus, number> = { over: 0, fast: 1, 'on-pace': 2, under: 3, 'no-budget': 4 };

export function computePacing(snapshot: FinanceSnapshot, month: MonthKey, today: ISODate): PacingReport {
  const clock = monthClock(month, today);
  const overall = pace(snapshot, clock, today, { categoryId: null, label: 'All spending', matches: () => true });
  const categoryIds = new Set(
    snapshot.budgets.filter((b) => b.categoryId && (b.month === month || b.month === 'default')).map((b) => b.categoryId!),
  );
  const index = indexCategories(snapshot.categories);
  const categories = [...categoryIds]
    .map((id) => pace(snapshot, clock, today, { categoryId: id, label: categoryOf(index, id).name, matches: (c) => c === id }))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.spentPct - a.spentPct);
  return { clock, overall, categories };
}

export function categoryLabel(categories: Category[], id: Id): string {
  return categoryOf(indexCategories(categories), id).name;
}
