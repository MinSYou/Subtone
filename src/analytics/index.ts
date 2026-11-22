import type { ISODate, MonthKey } from '../domain/dates';
import type { FinanceSnapshot } from '../domain/types';
import { monthPeriod, summarise } from './breakdown';
import { allocation, goalProgress } from './goals';
import { computePacing } from './pacing';
import { summariseRecurring, upcoming } from './recurring';
import { generateSignals } from './signals';
import { categoryMovers, monthlySeries, monthsOfHistory } from './trends';

export * from './affordability';
export * from './breakdown';
export * from './goals';
export * from './pacing';
export * from './recurring';
export * from './signals';
export * from './trends';

/**
 * One pure call that computes everything the UI needs for a month. Screens read from this;
 * nothing in analytics touches storage, React, or the system clock.
 */
export function buildDashboard(snapshot: FinanceSnapshot, month: MonthKey, today: ISODate) {
  const pacing = computePacing(snapshot, month, today);
  return {
    month,
    today,
    summary: summarise(snapshot.transactions, snapshot.categories, monthPeriod(month)),
    pacing,
    allocation: allocation(snapshot, month),
    signals: generateSignals({ snapshot, month, today, pacing }),
    series: monthlySeries(snapshot.transactions, month, 6),
    movers: categoryMovers(snapshot.transactions, snapshot.categories, month, today),
    historyMonths: monthsOfHistory(snapshot.transactions, month),
    recurring: summariseRecurring(snapshot.recurring),
    upcoming: upcoming(snapshot.recurring, today, 30),
    goals: snapshot.goals.filter((g) => !g.archived).map((g) => goalProgress(g, snapshot.contributions, today)),
  };
}

export type Dashboard = ReturnType<typeof buildDashboard>;
export * from './filters';
