import { categoryOf, indexCategories } from '../domain/categories';
import { isWithin, monthEnd, monthStart, type ISODate, type MonthKey } from '../domain/dates';
import { percent, type Cents } from '../domain/money';
import type { Category, SpendClass, Transaction, TransactionType } from '../domain/types';

export interface Period {
  from: ISODate;
  to: ISODate;
}

export function monthPeriod(key: MonthKey): Period {
  return { from: monthStart(key), to: monthEnd(key) };
}

export function inPeriod(transactions: Transaction[], period: Period): Transaction[] {
  return transactions.filter((t) => isWithin(t.date, period.from, period.to));
}

export interface CategoryTotal {
  category: Category;
  totalCents: Cents;
  count: number;
  /** Share of the type's total, 0–100. */
  sharePct: number;
}

export interface CashflowSummary {
  incomeCents: Cents;
  expenseCents: Cents;
  netCents: Cents;
  count: number;
  fixedExpenseCents: Cents;
  flexibleExpenseCents: Cents;
  /** Expense categories, largest first. */
  expenseByCategory: CategoryTotal[];
  /** Income categories, largest first. */
  incomeByCategory: CategoryTotal[];
}

export function totalsByCategory(
  transactions: Transaction[],
  categories: Category[],
  type: TransactionType,
): CategoryTotal[] {
  const index = indexCategories(categories);
  const map = new Map<string, { totalCents: Cents; count: number }>();
  let total = 0;
  for (const t of transactions) {
    if (t.type !== type) continue;
    const entry = map.get(t.categoryId) ?? { totalCents: 0, count: 0 };
    entry.totalCents += t.amountCents;
    entry.count++;
    map.set(t.categoryId, entry);
    total += t.amountCents;
  }
  return [...map.entries()]
    .map(([id, e]) => ({ category: categoryOf(index, id), ...e, sharePct: percent(e.totalCents, total) }))
    .sort((a, b) => b.totalCents - a.totalCents || a.category.name.localeCompare(b.category.name));
}

export function spendClassOf(categories: Category[], categoryId: string): SpendClass {
  return categoryOf(indexCategories(categories), categoryId).spendClass;
}

export function summarise(transactions: Transaction[], categories: Category[], period: Period): CashflowSummary {
  const scoped = inPeriod(transactions, period);
  const index = indexCategories(categories);
  let incomeCents = 0;
  let expenseCents = 0;
  let fixedExpenseCents = 0;
  for (const t of scoped) {
    if (t.type === 'income') {
      incomeCents += t.amountCents;
    } else {
      expenseCents += t.amountCents;
      if (categoryOf(index, t.categoryId).spendClass === 'fixed') fixedExpenseCents += t.amountCents;
    }
  }
  return {
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    count: scoped.length,
    fixedExpenseCents,
    flexibleExpenseCents: expenseCents - fixedExpenseCents,
    expenseByCategory: totalsByCategory(scoped, categories, 'expense'),
    incomeByCategory: totalsByCategory(scoped, categories, 'income'),
  };
}
