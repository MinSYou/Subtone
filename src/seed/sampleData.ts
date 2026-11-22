import { DEFAULT_CATEGORIES } from '../domain/categories';
import {
  addDays,
  addMonths,
  addMonthsToKey,
  monthKey,
  monthStart,
  parts,
  type ISODate,
} from '../domain/dates';
import { sequentialIds, type IdFactory } from '../domain/ids';
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

/** Small deterministic PRNG so sample data (and the tests built on it) never change. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SampleOptions {
  /** Months of history before the current month. Default 4. */
  historyMonths?: number;
  seed?: number;
  ids?: IdFactory;
}

/**
 * Realistic sample data relative to `today`: ~4 months of history plus the current month to date,
 * with recurring bills, a fortnightly salary, budgets and savings goals. It deliberately contains
 * an Eating Out spike and one unusual transport charge so every signal type can be seen.
 */
export function generateSampleData(today: ISODate, opts: SampleOptions = {}): FinanceSnapshot {
  const rand = mulberry32(opts.seed ?? 20261122);
  const id = opts.ids ?? sequentialIds();
  const history = opts.historyMonths ?? 4;
  const thisMonth = monthKey(today);
  const start = monthStart(addMonthsToKey(thisMonth, -history));
  const stamp = (d: ISODate) => `${d}T09:00:00.000Z`;
  const between = (lo: number, hi: number) => Math.round((lo + rand() * (hi - lo)) * 100);

  const anchorDay = (day: number) => {
    const { year, month } = parts(start);
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const recurring: RecurringItem[] = [
    { id: id('rec'), title: 'Rent', kind: 'bill', type: 'expense', amountCents: 1800_00, categoryId: 'rent', cadence: 'monthly', anchorDate: anchorDay(1), status: 'active' },
    { id: id('rec'), title: 'Electricity', kind: 'bill', type: 'expense', amountCents: 138_40, categoryId: 'utilities', cadence: 'monthly', anchorDate: anchorDay(12), status: 'active' },
    { id: id('rec'), title: 'Phone plan', kind: 'bill', type: 'expense', amountCents: 45_00, categoryId: 'utilities', cadence: 'monthly', anchorDate: anchorDay(8), status: 'active' },
    { id: id('rec'), title: 'Netflix', kind: 'subscription', type: 'expense', amountCents: 18_99, categoryId: 'subscriptions', cadence: 'monthly', anchorDate: anchorDay(25), status: 'active' },
    { id: id('rec'), title: 'Spotify', kind: 'subscription', type: 'expense', amountCents: 14_99, categoryId: 'subscriptions', cadence: 'monthly', anchorDate: anchorDay(25), status: 'active' },
    { id: id('rec'), title: 'Car insurance', kind: 'bill', type: 'expense', amountCents: 1140_00, categoryId: 'insurance', cadence: 'yearly', anchorDate: addMonths(anchorDay(18), 6), status: 'active' },
    { id: id('rec'), title: 'Salary', kind: 'income', type: 'income', amountCents: 2600_00, categoryId: 'salary', cadence: 'fortnightly', anchorDate: anchorDay(6), status: 'active' },
  ];

  const transactions: Transaction[] = [];
  const push = (t: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'tags'> & { tags?: string[] }) =>
    transactions.push({ tags: [], ...t, id: id('txn'), createdAt: stamp(t.date), updatedAt: stamp(t.date) });

  // Posted recurring occurrences up to today.
  for (const r of recurring) {
    for (const date of occurrencesBetween(r, start, today)) {
      push({ type: r.type, title: r.title, amountCents: r.amountCents, date, categoryId: r.categoryId, recurringId: r.id });
    }
  }

  const merchants: Record<string, string[]> = {
    groceries: ['Woolworths', 'Coles', 'Aldi', 'Harris Farm'],
    'eating-out': ['Chat Thai', 'Mamak', 'Din Tai Fung', 'Bar Luca', 'Single O', 'Gelato Messina'],
    transport: ['Opal top-up', 'Uber', 'Shell', 'DiDi'],
    shopping: ['Uniqlo', 'Kmart', 'JB Hi-Fi', 'Officeworks'],
    entertainment: ['Event Cinemas', 'Moshtix', 'Steam'],
    health: ['Priceline', 'Chemist Warehouse', 'Physio'],
  };
  const pick = (list: string[]) => list[Math.floor(rand() * list.length)];

  for (let d = start; d <= today; d = addDays(d, 1)) {
    const current = monthKey(d) === thisMonth;
    const weekend = [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
    if (rand() < 0.3) push({ type: 'expense', title: pick(merchants.groceries), amountCents: between(48, 118), date: d, categoryId: 'groceries' });
    // Eating Out runs ~45% hotter in the current month, mostly on weekends (the "spike" story).
    const eatChance = (weekend ? 0.55 : 0.22) * (current ? 1.45 : 1);
    if (rand() < eatChance) push({ type: 'expense', title: pick(merchants['eating-out']), amountCents: between(14, 46), date: d, categoryId: 'eating-out' });
    if (rand() < 0.5) push({ type: 'expense', title: pick(merchants.transport.filter((m) => m !== 'Uber')), amountCents: between(6, 18), date: d, categoryId: 'transport' });
    if (rand() < 0.09) push({ type: 'expense', title: pick(merchants.shopping), amountCents: between(22, 115), date: d, categoryId: 'shopping' });
    if (rand() < 0.06) push({ type: 'expense', title: pick(merchants.entertainment), amountCents: between(18, 65), date: d, categoryId: 'entertainment' });
    if (rand() < 0.04) push({ type: 'expense', title: pick(merchants.health), amountCents: between(15, 90), date: d, categoryId: 'health' });
  }

  // One out-of-pattern charge a few days ago (for the "unusual transaction" signal).
  const unusualDate = addDays(today, -3) >= monthStart(thisMonth) ? addDays(today, -3) : today;
  push({ type: 'expense', title: 'Uber', amountCents: 64_20, date: unusualDate, categoryId: 'transport', notes: 'Late night, airport' });
  // A one-off freelance payment last month.
  push({ type: 'income', title: 'Freelance invoice #11', amountCents: 850_00, date: addMonths(monthStart(thisMonth), -1, 17), categoryId: 'freelance' });

  const budgets: Budget[] = [
    { id: id('bud'), month: 'default', categoryId: null, limitCents: 4500_00 },
    { id: id('bud'), month: 'default', categoryId: 'eating-out', limitCents: 450_00 },
    { id: id('bud'), month: 'default', categoryId: 'groceries', limitCents: 750_00 },
    { id: id('bud'), month: 'default', categoryId: 'shopping', limitCents: 300_00 },
    { id: id('bud'), month: 'default', categoryId: 'transport', limitCents: 350_00 },
    { id: id('bud'), month: 'default', categoryId: 'entertainment', limitCents: 150_00 },
  ];

  const goals: SavingsGoal[] = [
    { id: id('goal'), name: 'Japan trip', targetCents: 4000_00, icon: 'plane', color: '#3346D3', targetDate: addMonths(today, 8), createdAt: stamp(start) },
    { id: id('goal'), name: 'Emergency fund', targetCents: 10000_00, icon: 'shield', color: '#0F6E66', createdAt: stamp(start) },
    { id: id('goal'), name: 'New laptop', targetCents: 2200_00, icon: 'laptop', color: '#B4480F', targetDate: addMonths(today, 4), createdAt: stamp(start) },
  ];

  const contributions: GoalContribution[] = [];
  for (let m = 1; m <= history; m++) {
    const date = addMonths(monthStart(addMonthsToKey(thisMonth, -m)), 0, 28);
    contributions.push({ id: id('gc'), goalId: goals[0].id, amountCents: 300_00, date });
    contributions.push({ id: id('gc'), goalId: goals[1].id, amountCents: 400_00, date });
    if (m <= 2) contributions.push({ id: id('gc'), goalId: goals[2].id, amountCents: 250_00, date });
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

// ---- Profiles --------------------------------------------------------------------------

export type SampleProfile = 'professional' | 'student';

export const SAMPLE_PROFILES: { id: SampleProfile; label: string; emoji: string; blurb: string }[] = [
  { id: 'student', label: 'University student', emoji: '🎓', blurb: 'Share house, casual job, campus food, Opal' },
  { id: 'professional', label: 'Young professional', emoji: '💼', blurb: 'Salary, rent, subscriptions, car insurance' },
];

/** Sample data for a profile. The student generator lives in studentData.ts. */
export async function sampleFor(profile: SampleProfile, today: ISODate, opts: SampleOptions = {}): Promise<FinanceSnapshot> {
  if (profile === 'student') {
    const { generateStudentData } = await import('./studentData');
    return generateStudentData(today, opts);
  }
  return generateSampleData(today, opts);
}
