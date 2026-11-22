import { describe, expect, it } from 'vitest';
import { snapshot, txn } from '../test/fixtures';
import { activeFilterCount, filterTransactions, groupByDate } from './filters';

const cats = snapshot().categories;
const list = [
  txn('2026-11-01', 'rent', 1800_00, { title: 'Rent - Newtown' }),
  txn('2026-11-05', 'eating-out', 42_50, { title: 'Chat Thai', tags: ['date-night'] }),
  txn('2026-11-05', 'groceries', 86_40, { title: 'Woolworths', notes: 'weekly shop' }),
  txn('2026-11-20', 'salary', 2600_00, { title: 'Salary' }),
];

describe('transaction filters', () => {
  it('searches title, notes, tags, category and amount', () => {
    const titles = (text: string) => filterTransactions(list, cats, { text }).map((t) => t.title);
    expect(titles('thai')).toEqual(['Chat Thai']);
    expect(titles('weekly')).toEqual(['Woolworths']);
    expect(titles('#date-night')).toEqual(['Chat Thai']);
    expect(titles('groceries')).toEqual(['Woolworths']);
    expect(titles('$42.50')).toEqual(['Chat Thai']);
    expect(titles('chat 42')).toEqual(['Chat Thai']);
  });

  it('combines type, fixed/flexible, category and date filters', () => {
    expect(filterTransactions(list, cats, { spendClass: 'fixed' }).map((t) => t.title)).toEqual(['Rent - Newtown']);
    expect(filterTransactions(list, cats, { spendClass: 'flexible', from: '2026-11-02' }).map((t) => t.title)).toHaveLength(2);
    expect(filterTransactions(list, cats, { type: 'income' }).map((t) => t.title)).toEqual(['Salary']);
    expect(filterTransactions(list, cats, { categoryIds: ['rent', 'salary'], to: '2026-11-10' }).map((t) => t.title)).toEqual(['Rent - Newtown']);
    expect(activeFilterCount({ type: 'income', from: '2026-11-01', categoryIds: [] })).toBe(2);
  });

  it('sorts newest first and groups by date', () => {
    const groups = groupByDate(filterTransactions(list, cats, {}));
    expect(groups.map((g) => [g.date, g.items.length])).toEqual([
      ['2026-11-20', 1],
      ['2026-11-05', 2],
      ['2026-11-01', 1],
    ]);
  });
});
