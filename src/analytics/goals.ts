import { daysBetween, monthKey, type ISODate, type MonthKey } from '../domain/dates';
import { percent, type Cents } from '../domain/money';
import type { FinanceSnapshot, GoalContribution, SavingsGoal } from '../domain/types';
import { monthPeriod, summarise } from './breakdown';

export interface GoalProgress {
  goal: SavingsGoal;
  savedCents: Cents;
  remainingCents: Cents;
  pct: number;
  complete: boolean;
  /** Needed per month from `today` to reach the target by targetDate; null without a date. */
  perMonthNeededCents: Cents | null;
}

export function goalProgress(goal: SavingsGoal, contributions: GoalContribution[], today: ISODate): GoalProgress {
  const saved = contributions.filter((c) => c.goalId === goal.id).reduce((s, c) => s + c.amountCents, 0);
  const remaining = Math.max(0, goal.targetCents - saved);
  let perMonth: Cents | null = null;
  if (goal.targetDate && remaining > 0) {
    const months = Math.max(1, Math.ceil(daysBetween(today, goal.targetDate) / 30.44));
    perMonth = Math.ceil(remaining / months);
  }
  return {
    goal,
    savedCents: saved,
    remainingCents: remaining,
    pct: Math.min(100, percent(saved, goal.targetCents)),
    complete: saved >= goal.targetCents,
    perMonthNeededCents: perMonth,
  };
}

export interface Allocation {
  month: MonthKey;
  netCashflowCents: Cents;
  /** Net amount moved into goals this month. */
  setAsideCents: Cents;
  /** Surplus not yet ring-fenced. Negative means more was set aside than was earned net. */
  unallocatedCents: Cents;
  totalSavedCents: Cents;
}

/**
 * Surplus cashflow is shown as "unallocated" until the user ring-fences it into a goal, so a
 * positive net figure is not mistaken for money that is free to spend.
 */
export function allocation(snapshot: FinanceSnapshot, month: MonthKey): Allocation {
  const net = summarise(snapshot.transactions, snapshot.categories, monthPeriod(month)).netCents;
  const activeGoals = new Set(snapshot.goals.map((g) => g.id));
  const contribs = snapshot.contributions.filter((c) => activeGoals.has(c.goalId));
  const setAside = contribs.filter((c) => monthKey(c.date) === month).reduce((s, c) => s + c.amountCents, 0);
  return {
    month,
    netCashflowCents: net,
    setAsideCents: setAside,
    unallocatedCents: net - setAside,
    totalSavedCents: contribs.reduce((s, c) => s + c.amountCents, 0),
  };
}
