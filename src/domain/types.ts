import type { Cents } from './money';
import type { ISODate, MonthKey } from './dates';

export type Id = string;

export type TransactionType = 'expense' | 'income';

/** Fixed = predictable commitments (rent, utilities, subscriptions); flexible = day-to-day choices. */
export type SpendClass = 'fixed' | 'flexible';

export interface Category {
  id: Id;
  name: string;
  /** Which side of the ledger the category is offered on. */
  type: TransactionType;
  spendClass: SpendClass;
  /** Short icon key rendered by the UI (no UI types in the domain). */
  icon: string;
  /** Hex colour token for charts. */
  color: string;
  archived?: boolean;
}

export interface Transaction {
  id: Id;
  type: TransactionType;
  title: string;
  /** Always positive; `type` carries the sign. */
  amountCents: Cents;
  date: ISODate;
  categoryId: Id;
  tags: string[];
  notes?: string;
  /** Set when generated from / matched to a recurring item. */
  recurringId?: Id;
  createdAt: string;
  updatedAt: string;
}

/** Monthly spending limit. categoryId null = the overall budget for that month. */
export interface Budget {
  id: Id;
  month: MonthKey | 'default';
  categoryId: Id | null;
  limitCents: Cents;
}

export type Cadence = 'weekly' | 'fortnightly' | 'monthly' | 'yearly';
export type RecurringKind = 'bill' | 'subscription' | 'income';

export interface RecurringItem {
  id: Id;
  title: string;
  kind: RecurringKind;
  type: TransactionType;
  amountCents: Cents;
  categoryId: Id;
  cadence: Cadence;
  /** First (or any known) occurrence; later occurrences are derived from it. */
  anchorDate: ISODate;
  status: 'active' | 'paused';
  /** Optional last occurrence (cancelled subscriptions keep history). */
  endDate?: ISODate;
  notes?: string;
}

export interface SavingsGoal {
  id: Id;
  name: string;
  targetCents: Cents;
  /** Animated icon key, e.g. "plane", "shield", "home", "gift", "laptop", "sprout". */
  icon: string;
  color: string;
  targetDate?: ISODate;
  createdAt: string;
  archived?: boolean;
}

/** Money moved into (positive) or out of (negative) a goal. Ring-fenced from "unallocated" cashflow. */
export interface GoalContribution {
  id: Id;
  goalId: Id;
  amountCents: Cents;
  date: ISODate;
  note?: string;
}

export type ChartKind = 'bar' | 'line' | 'donut';

export interface Settings {
  currency: string;
  locale: string;
  chartPrefs: { trends: 'bar' | 'line'; breakdown: 'bar' | 'donut' };
  /** Days of advance notice for upcoming recurring items. */
  upcomingWindowDays: number;
}

export const DEFAULT_SETTINGS: Settings = {
  currency: 'AUD',
  locale: 'en-AU',
  chartPrefs: { trends: 'bar', breakdown: 'bar' },
  upcomingWindowDays: 7,
};

/** Everything the app persists. Backups are a versioned envelope around this. */
export interface FinanceSnapshot {
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  recurring: RecurringItem[];
  goals: SavingsGoal[];
  contributions: GoalContribution[];
  settings: Settings;
}

export function emptySnapshot(categories: Category[] = []): FinanceSnapshot {
  return {
    transactions: [],
    categories,
    budgets: [],
    recurring: [],
    goals: [],
    contributions: [],
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

// ---- Analytics outputs -------------------------------------------------------------

export type InsightSeverity = 'alert' | 'warning' | 'info' | 'positive';

export type InsightKind =
  | 'budget-burn'
  | 'category-limit'
  | 'spend-spike'
  | 'unusual-transaction'
  | 'upcoming-recurring'
  | 'unallocated-surplus';

export interface InsightAction {
  label: string;
  /** Route the UI should open, e.g. "plan/budgets", "activity/recurring", "plan/goals". */
  route: string;
  /** Optional entity the action is about. */
  targetId?: Id;
}

/** A decision signal. Pure data: UI decides colour/icon from `kind` + `severity`. */
export interface Insight {
  id: string;
  kind: InsightKind;
  severity: InsightSeverity;
  title: string;
  detail: string;
  /** Sort weight; higher = more important. */
  priority: number;
  action?: InsightAction;
}
