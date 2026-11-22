import type { Category } from './types';

/** Built-in categories, adapted from Inpenso's list with income categories and a fixed/flexible split. */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'rent', name: 'Rent', type: 'expense', spendClass: 'fixed', icon: 'home', color: '#1F2A7A' },
  { id: 'utilities', name: 'Utilities', type: 'expense', spendClass: 'fixed', icon: 'bolt', color: '#0F6E66' },
  { id: 'subscriptions', name: 'Subscriptions', type: 'expense', spendClass: 'fixed', icon: 'repeat', color: '#8C93AD' },
  { id: 'insurance', name: 'Insurance', type: 'expense', spendClass: 'fixed', icon: 'shield', color: '#4A5578' },
  { id: 'groceries', name: 'Groceries', type: 'expense', spendClass: 'flexible', icon: 'cart', color: '#3346D3' },
  { id: 'eating-out', name: 'Eating Out', type: 'expense', spendClass: 'flexible', icon: 'fork', color: '#B4480F' },
  { id: 'transport', name: 'Transport', type: 'expense', spendClass: 'flexible', icon: 'car', color: '#7C8BEA' },
  { id: 'shopping', name: 'Shopping', type: 'expense', spendClass: 'flexible', icon: 'bag', color: '#E58A4B' },
  { id: 'entertainment', name: 'Entertainment', type: 'expense', spendClass: 'flexible', icon: 'ticket', color: '#A63D6B' },
  { id: 'health', name: 'Health', type: 'expense', spendClass: 'flexible', icon: 'heart', color: '#4FA79C' },
  { id: 'education', name: 'Education', type: 'expense', spendClass: 'flexible', icon: 'book', color: '#6A4FB3' },
  { id: 'other-expense', name: 'Other', type: 'expense', spendClass: 'flexible', icon: 'dots', color: '#9A9DA6' },
  { id: 'salary', name: 'Salary', type: 'income', spendClass: 'fixed', icon: 'briefcase', color: '#0F6E66' },
  { id: 'freelance', name: 'Freelance', type: 'income', spendClass: 'flexible', icon: 'spark', color: '#3346D3' },
  { id: 'refund', name: 'Refund', type: 'income', spendClass: 'flexible', icon: 'undo', color: '#7C8BEA' },
  { id: 'gift', name: 'Gift', type: 'income', spendClass: 'flexible', icon: 'gift', color: '#A63D6B' },
  { id: 'interest', name: 'Interest', type: 'income', spendClass: 'flexible', icon: 'percent', color: '#4FA79C' },
  { id: 'other-income', name: 'Other income', type: 'income', spendClass: 'flexible', icon: 'dots', color: '#9A9DA6' },
];

export const FALLBACK_CATEGORY: Category = {
  id: 'uncategorised',
  name: 'Uncategorised',
  type: 'expense',
  spendClass: 'flexible',
  icon: 'dots',
  color: '#9A9DA6',
};

export type CategoryIndex = ReadonlyMap<string, Category>;

export function indexCategories(categories: Category[]): CategoryIndex {
  return new Map(categories.map((c) => [c.id, c]));
}

export function categoryOf(index: CategoryIndex, id: string): Category {
  return index.get(id) ?? FALLBACK_CATEGORY;
}
