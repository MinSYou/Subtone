import { categoryOf, indexCategories } from '../domain/categories';
import type { ISODate } from '../domain/dates';
import type { Category, SpendClass, Transaction, TransactionType } from '../domain/types';

export interface TransactionFilter {
  /** Free text: matches title, notes, tags, category name, or an amount like "42.50". */
  text?: string;
  type?: TransactionType | 'all';
  spendClass?: SpendClass | 'all';
  categoryIds?: string[];
  from?: ISODate;
  to?: ISODate;
  tag?: string;
}

export function filterTransactions(transactions: Transaction[], categories: Category[], f: TransactionFilter): Transaction[] {
  const index = indexCategories(categories);
  const terms = (f.text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const cats = f.categoryIds && f.categoryIds.length ? new Set(f.categoryIds) : null;
  return transactions
    .filter((t) => {
      if (f.type && f.type !== 'all' && t.type !== f.type) return false;
      if (f.from && t.date < f.from) return false;
      if (f.to && t.date > f.to) return false;
      if (cats && !cats.has(t.categoryId)) return false;
      const cat = categoryOf(index, t.categoryId);
      if (f.spendClass && f.spendClass !== 'all' && (t.type !== 'expense' || cat.spendClass !== f.spendClass)) return false;
      if (f.tag && !t.tags.includes(f.tag)) return false;
      if (terms.length) {
        const hay = [t.title, t.notes ?? '', cat.name, ...t.tags.map((x) => `#${x} ${x}`), (t.amountCents / 100).toFixed(2)]
          .join(' ')
          .toLowerCase();
        return terms.every((term) => hay.includes(term.replace(/^\$/, '')));
      }
      return true;
    })
    .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : a.date < b.date ? 1 : -1));
}

export function activeFilterCount(f: TransactionFilter): number {
  return (
    (f.type && f.type !== 'all' ? 1 : 0) +
    (f.spendClass && f.spendClass !== 'all' ? 1 : 0) +
    (f.categoryIds?.length ? 1 : 0) +
    (f.from || f.to ? 1 : 0) +
    (f.tag ? 1 : 0)
  );
}

/** Group a (sorted) list by date for sectioned lists. */
export function groupByDate(transactions: Transaction[]): { date: ISODate; items: Transaction[] }[] {
  const out: { date: ISODate; items: Transaction[] }[] = [];
  for (const t of transactions) {
    const last = out[out.length - 1];
    if (last && last.date === t.date) last.items.push(t);
    else out.push({ date: t.date, items: [t] });
  }
  return out;
}
