import { describe, expect, it } from 'vitest';
import { fixedClock } from '../domain/dates';
import { sequentialIds } from '../domain/ids';
import { createMemoryRepository } from '../persistence/localAdapters';
import type { FinanceRepository } from '../persistence/repository';
import { FinanceStore } from './store';

const flush = () => new Promise((r) => setTimeout(r, 0));

function makeStore(repo: FinanceRepository = createMemoryRepository()) {
  return new FinanceStore(repo, fixedClock('2026-11-22'), sequentialIds(), () => '2026-11-22T10:00:00.000Z');
}

describe('FinanceStore', () => {
  it('persists actions through the repository', async () => {
    const repo = createMemoryRepository();
    const store = makeStore(repo);
    await store.init();
    store.addTransaction({ type: 'expense', title: 'Coffee', amountCents: 5_50, date: '2026-11-22', categoryId: 'eating-out', tags: ['Morning', 'morning '] });
    await flush();
    const saved = repo.peek()!.transactions;
    expect(saved).toHaveLength(1);
    expect(saved[0].tags).toEqual(['morning']);
  });

  it('bulk recategorises, tags and deletes only the selected transactions', async () => {
    const store = makeStore();
    await store.init();
    const a = store.addTransaction({ type: 'expense', title: 'A', amountCents: 1_00, date: '2026-11-01', categoryId: 'shopping', tags: [] });
    const b = store.addTransaction({ type: 'expense', title: 'B', amountCents: 2_00, date: '2026-11-02', categoryId: 'shopping', tags: [] });
    const c = store.addTransaction({ type: 'expense', title: 'C', amountCents: 3_00, date: '2026-11-03', categoryId: 'shopping', tags: [] });
    store.bulkUpdate([a.id, b.id], { categoryId: 'entertainment', addTag: 'gifts' });
    let txns = store.getState().data.transactions;
    expect(txns.map((t) => [t.title, t.categoryId, t.tags])).toEqual([
      ['A', 'entertainment', ['gifts']],
      ['B', 'entertainment', ['gifts']],
      ['C', 'shopping', []],
    ]);
    store.deleteTransactions([a.id, c.id]);
    txns = store.getState().data.transactions;
    expect(txns.map((t) => t.title)).toEqual(['B']);
  });

  it('keeps data on screen and reports when saving fails, then recovers on retry', async () => {
    const inner = createMemoryRepository();
    let fail = true;
    const flaky: FinanceRepository = {
      kind: 'flaky',
      load: () => inner.load(),
      apply: async (c) => {
        if (fail) throw new Error('Storage full');
        return inner.apply(c);
      },
      replaceAll: (s) => inner.replaceAll(s),
    };
    const store = makeStore(flaky);
    await store.init();
    store.addTransaction({ type: 'expense', title: 'Lunch', amountCents: 18_00, date: '2026-11-22', categoryId: 'eating-out', tags: [] });
    await flush();
    expect(store.getState()).toMatchObject({ error: 'Storage full', unsaved: true });
    expect(store.getState().data.transactions).toHaveLength(1);
    fail = false;
    await store.retrySave();
    expect(store.getState()).toMatchObject({ error: null, unsaved: false });
    expect(inner.peek()!.transactions).toHaveLength(1);
  });

  it('marks a recurring bill as paid so it is no longer reserved', async () => {
    const store = makeStore();
    await store.loadSample();
    const netflix = store.getState().data.recurring.find((r) => r.title === 'Netflix')!;
    store.markRecurringPaid(netflix.id, '2026-11-25');
    const posted = store.getState().data.transactions.filter((t) => t.recurringId === netflix.id && t.date === '2026-11-25');
    expect(posted).toHaveLength(1);
  });

  it('sets and removes standing budgets', async () => {
    const store = makeStore();
    await store.init();
    store.setBudget(null, 4000_00);
    store.setBudget(null, 4200_00);
    expect(store.getState().data.budgets).toEqual([{ id: 'bud_0001', month: 'default', categoryId: null, limitCents: 4200_00 }]);
    store.setBudget(null, null);
    expect(store.getState().data.budgets).toEqual([]);
  });
});
