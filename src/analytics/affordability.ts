import { categoryOf, indexCategories } from '../domain/categories';
import { monthKey, type ISODate } from '../domain/dates';
import { formatMoney, type Cents } from '../domain/money';
import type { FinanceSnapshot, Id } from '../domain/types';
import { allocation } from './goals';
import { computePacing, monthClock } from './pacing';

export type AffordVerdict = 'comfortable' | 'tight' | 'over-budget' | 'no-budget';

export interface AffordQuery {
  amountCents: Cents;
  categoryId: Id;
  /** Defaults to today. Purchases in a later month are checked against that month. */
  date?: ISODate;
}

export interface AffordResult {
  verdict: AffordVerdict;
  headline: string;
  advice: string;
  budgetLeftAfterCents: Cents | null;
  safePerDayAfterCents: Cents | null;
  /** null when the category has no limit. */
  categoryLeftAfterCents: Cents | null;
  categoryOverLimit: boolean;
  netAfterCents: Cents;
  unallocatedAfterCents: Cents;
  currentDailyRateCents: Cents;
}

/**
 * "What-if" check before spending. Works for ANY category (fixed or flexible). A purchase is
 * `comfortable` when, after it, the remaining daily allowance still covers at least 80% of the
 * user's current flexible run-rate and no category limit is broken.
 */
export function checkAffordability(snapshot: FinanceSnapshot, query: AffordQuery, today: ISODate): AffordResult {
  if (!Number.isInteger(query.amountCents) || query.amountCents <= 0) {
    throw new RangeError('amountCents must be a positive integer');
  }
  const date = query.date && query.date > today ? query.date : today;
  const month = monthKey(date);
  const report = computePacing(snapshot, month, today);
  const clock = monthClock(month, today);
  const { overall } = report;
  const amt = query.amountCents;
  const name = categoryOf(indexCategories(snapshot.categories), query.categoryId).name;
  const catPace = report.categories.find((c) => c.categoryId === query.categoryId);
  const categoryLeftAfter = catPace?.limitCents != null ? catPace.limitCents - catPace.spentCents - catPace.committedCents - amt : null;
  const categoryOverLimit = categoryLeftAfter !== null && categoryLeftAfter < 0;
  const alloc = allocation(snapshot, month);
  const netAfter = alloc.netCashflowCents - amt;
  const unallocatedAfter = alloc.unallocatedCents - amt;

  if (overall.limitCents === null) {
    return {
      verdict: 'no-budget',
      headline: 'Set a monthly budget to get a verdict',
      advice: `Without a budget we can only show the cashflow impact: net becomes ${netAfter >= 0 ? 'positive' : 'negative'} after this.`,
      budgetLeftAfterCents: null,
      safePerDayAfterCents: null,
      categoryLeftAfterCents: categoryLeftAfter,
      categoryOverLimit,
      netAfterCents: netAfter,
      unallocatedAfterCents: unallocatedAfter,
      currentDailyRateCents: overall.dailyRateCents,
    };
  }

  const budgetLeftAfter = overall.limitCents - overall.spentCents - overall.committedCents - amt;
  const days = Math.max(1, clock.daysLeft);
  const safeAfter = Math.max(0, Math.floor(budgetLeftAfter / days));
  const rate = overall.dailyRateCents;
  const base = {
    budgetLeftAfterCents: budgetLeftAfter,
    safePerDayAfterCents: safeAfter,
    categoryLeftAfterCents: categoryLeftAfter,
    categoryOverLimit,
    netAfterCents: netAfter,
    unallocatedAfterCents: unallocatedAfter,
    currentDailyRateCents: rate,
  };

  if (budgetLeftAfter < 0) {
    return {
      ...base,
      verdict: 'over-budget',
      headline: 'This would take you over budget',
      advice: `You would finish the month over budget. Consider moving this ${name} purchase to next month.`,
    };
  }
  if (categoryOverLimit || safeAfter < rate * 0.8) {
    return {
      ...base,
      verdict: 'tight',
      headline: categoryOverLimit ? `Fits the budget, but breaks your ${name} limit` : 'Possible, but it squeezes the rest of the month',
      advice: `Afterwards you would need to keep day-to-day spending to about ${formatMoney(safeAfter, { whole: true, currency: snapshot.settings.currency, locale: snapshot.settings.locale })} a day (your recent rate is ${formatMoney(rate, { whole: true, currency: snapshot.settings.currency, locale: snapshot.settings.locale })} a day).`,
    };
  }
  return {
    ...base,
    verdict: 'comfortable',
    headline: 'Yes, this fits this month',
    advice: 'You stay inside your budget and keep a normal daily buffer for the rest of the month.',
  };
}
