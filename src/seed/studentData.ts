import { DEFAULT_CATEGORIES } from '../domain/categories';
import { addDays, addMonths, addMonthsToKey, monthKey, monthStart, parts, toISODate, type ISODate } from '../domain/dates';
import { sequentialIds } from '../domain/ids';
import { occurrencesBetween } from '../analytics/recurring';
import {
  DEFAULT_SETTINGS,
  type Budget,
  type FinanceSnapshot,
  type GoalContribution,
  type RecurringItem,
  type SavingsGoal,
  type Transaction,
} from '../domain/types';
import { mulberry32, type SampleOptions } from './sampleData';

/**
 * Placeholder data for a typical full-time university student in Sydney: a share-house room paid
 * weekly, a casual café job paid weekly, a fortnightly student payment, lots of small campus food
 * and Opal trips, textbooks at the start of semester, and modest savings goals. All merchant
 * names are generic or invented; amounts are realistic but illustrative, not official rates.
 */
export function generateStudentData(today: ISODate, opts: SampleOptions = {}): FinanceSnapshot {
  const rand = mulberry32(opts.seed ?? 20260224);
  const id = opts.ids ?? sequentialIds();
  const history = opts.historyMonths ?? 4;
  const thisMonth = monthKey(today);
  const start = monthStart(addMonthsToKey(thisMonth, -history));
  const stamp = (d: ISODate) => `${d}T09:00:00.000Z`;
  const between = (lo: number, hi: number) => Math.round((lo + rand() * (hi - lo)) * 100);
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
  const weekday = (d: ISODate) => new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 Sun .. 6 Sat
  const { year: sy, month: sm } = parts(start);
  // first Monday / Thursday on or after the start date, used as weekly anchors
  const firstOn = (dow: number) => addDays(start, (dow - weekday(start) + 7) % 7);
  const day = (d: number) => toISODate(sy, sm, d);

  const recurring: RecurringItem[] = [
    { id: id('rec'), title: 'Room in share house', kind: 'bill', type: 'expense', amountCents: 260_00, categoryId: 'rent', cadence: 'weekly', anchorDate: firstOn(1), status: 'active' },
    { id: id('rec'), title: 'Bills share (power + internet)', kind: 'bill', type: 'expense', amountCents: 25_00, categoryId: 'utilities', cadence: 'fortnightly', anchorDate: firstOn(1), status: 'active' },
    { id: id('rec'), title: 'Prepaid phone plan', kind: 'bill', type: 'expense', amountCents: 30_00, categoryId: 'utilities', cadence: 'monthly', anchorDate: day(9), status: 'active' },
    { id: id('rec'), title: 'Spotify Student', kind: 'subscription', type: 'expense', amountCents: 7_49, categoryId: 'subscriptions', cadence: 'monthly', anchorDate: day(14), status: 'active' },
    { id: id('rec'), title: 'Uni gym membership', kind: 'subscription', type: 'expense', amountCents: 22_00, categoryId: 'subscriptions', cadence: 'monthly', anchorDate: day(3), status: 'active' },
    { id: id('rec'), title: 'iCloud 50GB', kind: 'subscription', type: 'expense', amountCents: 1_49, categoryId: 'subscriptions', cadence: 'monthly', anchorDate: day(20), status: 'active' },
    { id: id('rec'), title: 'Casual pay - campus café', kind: 'income', type: 'income', amountCents: 412_00, categoryId: 'salary', cadence: 'weekly', anchorDate: firstOn(4), status: 'active' },
    { id: id('rec'), title: 'Student payment', kind: 'income', type: 'income', amountCents: 318_00, categoryId: 'other-income', cadence: 'fortnightly', anchorDate: firstOn(2), status: 'active' },
  ];

  const transactions: Transaction[] = [];
  const push = (t: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'tags'> & { tags?: string[] }) =>
    transactions.push({ tags: [], ...t, id: id('txn'), createdAt: stamp(t.date), updatedAt: stamp(t.date) });

  for (const r of recurring) {
    for (const date of occurrencesBetween(r, start, today)) {
      push({ type: r.type, title: r.title, amountCents: r.amountCents, date, categoryId: r.categoryId, recurringId: r.id });
    }
  }

  const campusFood = ['Campus food court', 'Uni bar', 'Sushi train (campus)', 'Banh mi stall', 'Library café'];
  const coffee = ['Coffee cart', 'Campus café', 'Single shot espresso bar'];
  const groceries = ['Aldi', 'Coles', 'Woolworths', 'Asian grocer'];
  const nights = ['Uni bar trivia', 'Club night', 'Cinema student ticket', 'Karaoke with friends', 'Bowling'];
  const shops = ['Kmart', 'Uniqlo', 'Op shop', 'Officeworks'];

  for (let d = start; d <= today; d = addDays(d, 1)) {
    const dow = weekday(d);
    const weekdayDay = dow >= 1 && dow <= 5;
    const current = monthKey(d) === thisMonth;
    const { month, day: dom } = parts(d);
    // Exam season this month: more takeaway and coffee (the "spike" story).
    const stress = current ? 1.5 : 1;

    if (weekdayDay && rand() < 0.75) push({ type: 'expense', title: 'Opal - train/bus', amountCents: between(3.2, 5.4), date: d, categoryId: 'transport', tags: ['uni'] });
    if (weekdayDay && rand() < 0.45 * stress) push({ type: 'expense', title: pick(coffee), amountCents: between(4.5, 6), date: d, categoryId: 'eating-out', tags: ['campus'] });
    if (weekdayDay && rand() < 0.4) push({ type: 'expense', title: pick(campusFood), amountCents: between(8, 16), date: d, categoryId: 'eating-out', tags: ['campus'] });
    if (rand() < 0.12 * stress) push({ type: 'expense', title: 'Late-night delivery', amountCents: between(22, 38), date: d, categoryId: 'eating-out' });
    if (rand() < 0.26) push({ type: 'expense', title: pick(groceries), amountCents: between(18, 62), date: d, categoryId: 'groceries' });
    if ((dow === 5 || dow === 6) && rand() < 0.35) push({ type: 'expense', title: pick(nights), amountCents: between(15, 55), date: d, categoryId: 'entertainment', tags: ['friends'] });
    if (rand() < 0.04) push({ type: 'expense', title: pick(shops), amountCents: between(12, 60), date: d, categoryId: 'shopping' });
    if (rand() < 0.03) push({ type: 'expense', title: 'Pharmacy', amountCents: between(8, 30), date: d, categoryId: 'health' });
    if (weekdayDay && rand() < 0.05) push({ type: 'expense', title: 'Library printing', amountCents: between(2, 6), date: d, categoryId: 'education', tags: ['uni'] });
    // Start of semester (late Feb / late Jul): textbooks and a course reader.
    if ((month === 2 || month === 7) && dom === 24) {
      push({ type: 'expense', title: 'Textbook (second-hand)', amountCents: between(45, 70), date: d, categoryId: 'education', tags: ['uni'] });
      push({ type: 'expense', title: 'Course reader + lab coat', amountCents: between(55, 85), date: d, categoryId: 'education', tags: ['uni'] });
    }
  }

  // One out-of-pattern buy a few days ago (unusual-transaction signal) and a birthday gift from family.
  const recent = addDays(today, -4) >= monthStart(thisMonth) ? addDays(today, -4) : today;
  push({ type: 'expense', title: 'Noise-cancelling headphones', amountCents: 189_00, date: recent, categoryId: 'shopping', notes: 'For studying in the library' });
  push({ type: 'income', title: 'Birthday money from family', amountCents: 150_00, date: addMonths(monthStart(thisMonth), -2, 12), categoryId: 'gift' });

  const budgets: Budget[] = [
    { id: id('bud'), month: 'default', categoryId: null, limitCents: 2400_00 },
    { id: id('bud'), month: 'default', categoryId: 'eating-out', limitCents: 260_00 },
    { id: id('bud'), month: 'default', categoryId: 'groceries', limitCents: 320_00 },
    { id: id('bud'), month: 'default', categoryId: 'transport', limitCents: 110_00 },
    { id: id('bud'), month: 'default', categoryId: 'entertainment', limitCents: 120_00 },
    { id: id('bud'), month: 'default', categoryId: 'shopping', limitCents: 80_00 },
  ];

  const goals: SavingsGoal[] = [
    { id: id('goal'), name: 'Emergency buffer', targetCents: 1000_00, icon: 'shield', color: '#0F6E66', createdAt: stamp(start) },
    { id: id('goal'), name: 'New laptop for uni', targetCents: 1600_00, icon: 'laptop', color: '#B4480F', targetDate: addMonths(today, 5), createdAt: stamp(start) },
    { id: id('goal'), name: 'Exchange semester', targetCents: 5000_00, icon: 'plane', color: '#3346D3', targetDate: addMonths(today, 14), createdAt: stamp(start) },
  ];

  const contributions: GoalContribution[] = [];
  for (let m = 1; m <= history; m++) {
    const date = addMonths(monthStart(addMonthsToKey(thisMonth, -m)), 0, 27);
    contributions.push({ id: id('gc'), goalId: goals[0].id, amountCents: 80_00, date });
    contributions.push({ id: id('gc'), goalId: goals[1].id, amountCents: 100_00, date });
    if (m <= 2) contributions.push({ id: id('gc'), goalId: goals[2].id, amountCents: 50_00, date });
  }

  transactions.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));
  return {
    transactions,
    categories: structuredClone(DEFAULT_CATEGORIES),
    budgets,
    recurring,
    goals,
    contributions,
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}
