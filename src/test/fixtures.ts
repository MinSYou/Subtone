import { DEFAULT_CATEGORIES } from '../domain/categories';
import { sequentialIds } from '../domain/ids';
import { emptySnapshot, type Budget, type FinanceSnapshot, type RecurringItem, type Transaction } from '../domain/types';

const ids = sequentialIds();

export function txn(
  date: string,
  categoryId: string,
  amountCents: number,
  extra: Partial<Transaction> = {},
): Transaction {
  const income = ['salary', 'freelance', 'refund', 'gift', 'interest', 'other-income'].includes(categoryId);
  return {
    id: ids('t'),
    type: income ? 'income' : 'expense',
    title: categoryId,
    amountCents,
    date,
    categoryId,
    tags: [],
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
    ...extra,
  };
}

export function budget(limitCents: number, categoryId: string | null = null, month: Budget['month'] = 'default'): Budget {
  return { id: ids('b'), month, categoryId, limitCents };
}

export function rec(partial: Partial<RecurringItem> & Pick<RecurringItem, 'anchorDate' | 'cadence'>): RecurringItem {
  return {
    id: ids('r'),
    title: 'Item',
    kind: 'subscription',
    type: 'expense',
    amountCents: 10_00,
    categoryId: 'subscriptions',
    status: 'active',
    ...partial,
  };
}

export function snapshot(parts: Partial<FinanceSnapshot> = {}): FinanceSnapshot {
  return { ...emptySnapshot(structuredClone(DEFAULT_CATEGORIES)), ...parts };
}
