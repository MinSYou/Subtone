import { addDays, addMonths, daysBetween, type ISODate } from '../domain/dates';
import type { Cents } from '../domain/money';
import type { Cadence, RecurringItem, Transaction } from '../domain/types';

const STEP_DAYS: Partial<Record<Cadence, number>> = { weekly: 7, fortnightly: 14 };
const PER_YEAR: Record<Cadence, number> = { weekly: 52, fortnightly: 26, monthly: 12, yearly: 1 };

/** Occurrence dates of a recurring item within [from, to] (inclusive). Paused items have none. */
export function occurrencesBetween(item: RecurringItem, from: ISODate, to: ISODate): ISODate[] {
  if (item.status === 'paused' || from > to) return [];
  const end = item.endDate && item.endDate < to ? item.endDate : to;
  const out: ISODate[] = [];
  const step = STEP_DAYS[item.cadence];

  if (step) {
    let k = from <= item.anchorDate ? 0 : Math.ceil(daysBetween(item.anchorDate, from) / step);
    for (let d = addDays(item.anchorDate, k * step); d <= end; d = addDays(item.anchorDate, ++k * step)) {
      if (d >= from) out.push(d);
    }
    return out;
  }

  const monthsPerStep = item.cadence === 'monthly' ? 1 : 12;
  // Always compute from the anchor so a 31st anchor gives 28 Feb then 31 Mar (no drift).
  const fromMonths = monthsFromAnchor(item.anchorDate, from);
  let n = Math.max(0, Math.floor(fromMonths / monthsPerStep) - 1);
  for (let d = addMonths(item.anchorDate, n * monthsPerStep); d <= end; d = addMonths(item.anchorDate, ++n * monthsPerStep)) {
    if (d >= from && d >= item.anchorDate) out.push(d);
  }
  return out;
}

function monthsFromAnchor(anchor: ISODate, date: ISODate): number {
  const [ay, am] = anchor.split('-').map(Number);
  const [y, m] = date.split('-').map(Number);
  return (y - ay) * 12 + (m - am);
}

export function nextOccurrence(item: RecurringItem, from: ISODate, horizonDays = 400): ISODate | null {
  return occurrencesBetween(item, from, addDays(from, horizonDays))[0] ?? null;
}

/** Normalised monthly cost of a recurring item (weekly × 52 / 12 etc.). */
export function monthlyEquivalent(item: Pick<RecurringItem, 'amountCents' | 'cadence'>): Cents {
  return Math.round((item.amountCents * PER_YEAR[item.cadence]) / 12);
}

export interface UpcomingOccurrence {
  item: RecurringItem;
  date: ISODate;
  daysAway: number;
}

export function upcoming(items: RecurringItem[], today: ISODate, windowDays: number): UpcomingOccurrence[] {
  const to = addDays(today, windowDays);
  return items
    .flatMap((item) => occurrencesBetween(item, today, to).map((date) => ({ item, date, daysAway: daysBetween(today, date) })))
    .sort((a, b) => (a.date === b.date ? a.item.title.localeCompare(b.item.title) : a.date < b.date ? -1 : 1));
}

/**
 * Expense occurrences still to come in [today, until] that have not been posted as a transaction yet.
 * Used to reserve committed money before telling the user what is "safe to spend".
 */
export function pendingCommitments(
  items: RecurringItem[],
  transactions: Transaction[],
  today: ISODate,
  until: ISODate,
): UpcomingOccurrence[] {
  const posted = new Set(transactions.filter((t) => t.recurringId).map((t) => `${t.recurringId}|${t.date}`));
  return upcoming(items.filter((i) => i.type === 'expense'), today, daysBetween(today, until)).filter(
    (o) => !posted.has(`${o.item.id}|${o.date}`),
  );
}

export interface RecurringSummary {
  monthlyExpenseCents: Cents;
  monthlyIncomeCents: Cents;
  monthlySubscriptionCents: Cents;
  activeCount: number;
  pausedCount: number;
  /** What paused items would cost per month if resumed. */
  pausedMonthlySavingsCents: Cents;
}

export function summariseRecurring(items: RecurringItem[]): RecurringSummary {
  const s: RecurringSummary = {
    monthlyExpenseCents: 0,
    monthlyIncomeCents: 0,
    monthlySubscriptionCents: 0,
    activeCount: 0,
    pausedCount: 0,
    pausedMonthlySavingsCents: 0,
  };
  for (const item of items) {
    const monthly = monthlyEquivalent(item);
    if (item.status === 'paused') {
      s.pausedCount++;
      if (item.type === 'expense') s.pausedMonthlySavingsCents += monthly;
      continue;
    }
    s.activeCount++;
    if (item.type === 'income') s.monthlyIncomeCents += monthly;
    else s.monthlyExpenseCents += monthly;
    if (item.kind === 'subscription') s.monthlySubscriptionCents += monthly;
  }
  return s;
}
