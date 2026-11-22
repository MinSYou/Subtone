import { DEFAULT_CATEGORIES } from '../domain/categories';
import type { Clock, ISODate } from '../domain/dates';
import { randomId, type IdFactory } from '../domain/ids';
import type { Cents } from '../domain/money';
import {
  emptySnapshot,
  type Budget,
  type FinanceSnapshot,
  type GoalContribution,
  type Id,
  type RecurringItem,
  type SavingsGoal,
  type Settings,
  type Transaction,
} from '../domain/types';
import { LIMITS, parseTags, sanitizeLine, sanitizeMultiline, sanitizeTag } from '../domain/validation';
import { diffSnapshots, isEmptyChangeSet, type FinanceRepository } from '../persistence/repository';
import { generateSampleData } from '../seed/sampleData';

export interface StoreState {
  status: 'loading' | 'ready';
  data: FinanceSnapshot;
  /** Last persistence error. Data stays on screen; `retrySave` writes it again. */
  error: string | null;
  unsaved: boolean;
}

export type TransactionInput = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;
export type BulkPatch = { categoryId?: Id; addTag?: string; removeTag?: string };

/**
 * App state container: holds the snapshot, applies user actions immutably, and persists the
 * diff through the repository. React subscribes via useSyncExternalStore (see StoreProvider).
 */
export class FinanceStore {
  private state: StoreState = { status: 'loading', data: emptySnapshot(structuredClone(DEFAULT_CATEGORIES)), error: null, unsaved: false };
  private listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly repo: FinanceRepository,
    readonly clock: Clock,
    private readonly newId: IdFactory = randomId,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = () => this.state;

  get repositoryKind() {
    return this.repo.kind;
  }

  private set(patch: Partial<StoreState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  async init(): Promise<void> {
    try {
      const loaded = await this.repo.load();
      this.set({ status: 'ready', data: loaded ?? emptySnapshot(structuredClone(DEFAULT_CATEGORIES)) });
    } catch (err) {
      this.set({ status: 'ready', error: message(err) });
    }
  }

  /** Optimistically apply `next`, then persist the diff in order. */
  private commit(mutate: (draft: FinanceSnapshot) => FinanceSnapshot): void {
    const prev = this.state.data;
    const next = mutate(prev);
    if (next === prev) return;
    const changes = diffSnapshots(prev, next);
    this.set({ data: next });
    if (isEmptyChangeSet(changes)) return;
    this.queue = this.queue
      .then(() => this.repo.apply(changes))
      .then(() => {
        if (this.state.error || this.state.unsaved) this.set({ error: null, unsaved: false });
      })
      .catch((err) => this.set({ error: message(err), unsaved: true }));
  }

  async retrySave(): Promise<void> {
    try {
      await this.repo.replaceAll(this.state.data);
      this.set({ error: null, unsaved: false });
    } catch (err) {
      this.set({ error: message(err), unsaved: true });
    }
  }

  /** Replace all data (restore / sample / clear). Awaited so the UI can confirm success. */
  async replaceAll(snapshot: FinanceSnapshot): Promise<void> {
    await this.queue;
    await this.repo.replaceAll(snapshot);
    this.set({ data: snapshot, error: null, unsaved: false });
  }

  loadSample = () => this.replaceAll(generateSampleData(this.clock.today()));
  clearAll = () => this.replaceAll(emptySnapshot(structuredClone(DEFAULT_CATEGORIES)));

  // ---- transactions ----
  addTransaction(input: TransactionInput): Transaction {
    const ts = this.now();
    const t: Transaction = { ...clean(input), id: this.newId('txn'), createdAt: ts, updatedAt: ts };
    this.commit((d) => ({ ...d, transactions: [...d.transactions, t] }));
    return t;
  }

  updateTransaction(id: Id, patch: Partial<TransactionInput>): void {
    const ts = this.now();
    this.commit((d) => ({
      ...d,
      transactions: d.transactions.map((t) => (t.id === id ? { ...t, ...clean({ ...t, ...patch }), updatedAt: ts } : t)),
    }));
  }

  /** Delete and return what was removed, so the UI can offer Undo. */
  deleteTransactions(ids: Id[]): Transaction[] {
    const set = new Set(ids);
    const removed = this.state.data.transactions.filter((t) => set.has(t.id));
    this.commit((d) => ({ ...d, transactions: d.transactions.filter((t) => !set.has(t.id)) }));
    return removed;
  }

  /** Put previously deleted transactions back (Undo). */
  restoreTransactions(txns: Transaction[]): void {
    const existing = new Set(this.state.data.transactions.map((t) => t.id));
    const back = txns.filter((t) => !existing.has(t.id));
    if (back.length) this.commit((d) => ({ ...d, transactions: [...d.transactions, ...back] }));
  }

  bulkUpdate(ids: Id[], patch: BulkPatch): void {
    const set = new Set(ids);
    const ts = this.now();
    this.commit((d) => ({
      ...d,
      transactions: d.transactions.map((t) => {
        if (!set.has(t.id)) return t;
        let tags = t.tags;
        const add = patch.addTag ? sanitizeTag(patch.addTag) : '';
        if (add && tags.length < LIMITS.tagsPerTransaction) tags = dedupeTags([...tags, add]);
        if (patch.removeTag) tags = tags.filter((x) => x !== patch.removeTag);
        const categoryId = patch.categoryId ?? t.categoryId;
        if (categoryId === t.categoryId && tags === t.tags) return t;
        return { ...t, categoryId, tags, updatedAt: ts };
      }),
    }));
  }

  // ---- recurring ----
  saveRecurring(item: Omit<RecurringItem, 'id'> & { id?: Id }): RecurringItem {
    const full: RecurringItem = { ...item, title: sanitizeLine(item.title, LIMITS.title).value || 'Recurring', id: item.id ?? this.newId('rec') };
    this.commit((d) => ({ ...d, recurring: upsert(d.recurring, full) }));
    return full;
  }

  setRecurringStatus(id: Id, status: RecurringItem['status']): void {
    this.commit((d) => ({ ...d, recurring: d.recurring.map((r) => (r.id === id ? { ...r, status } : r)) }));
  }

  deleteRecurring(id: Id): void {
    this.commit((d) => ({ ...d, recurring: d.recurring.filter((r) => r.id !== id) }));
  }

  /** Record a due occurrence as a real transaction linked to its recurring item. */
  markRecurringPaid(id: Id, date: ISODate): Transaction | null {
    const r = this.state.data.recurring.find((x) => x.id === id);
    if (!r) return null;
    return this.addTransaction({ type: r.type, title: r.title, amountCents: r.amountCents, date, categoryId: r.categoryId, tags: [], recurringId: r.id });
  }

  // ---- budgets ----
  /** Set (or with null, remove) the standing monthly limit for a category, or overall when categoryId is null. */
  setBudget(categoryId: Id | null, limitCents: Cents | null): void {
    this.commit((d) => {
      const others = d.budgets.filter((b) => !(b.month === 'default' && b.categoryId === categoryId));
      if (limitCents === null) return { ...d, budgets: others };
      const existing = d.budgets.find((b) => b.month === 'default' && b.categoryId === categoryId);
      const b: Budget = { id: existing?.id ?? this.newId('bud'), month: 'default', categoryId, limitCents };
      return { ...d, budgets: [...others, b] };
    });
  }

  // ---- goals ----
  saveGoal(goal: Omit<SavingsGoal, 'id' | 'createdAt'> & { id?: Id; createdAt?: string }): void {
    const full: SavingsGoal = { ...goal, name: sanitizeLine(goal.name, LIMITS.name).value || 'Goal', id: goal.id ?? this.newId('goal'), createdAt: goal.createdAt ?? this.now() };
    this.commit((d) => ({ ...d, goals: upsert(d.goals, full) }));
  }

  deleteGoal(id: Id): { goal: SavingsGoal; contributions: GoalContribution[] } | null {
    const goal = this.state.data.goals.find((g) => g.id === id);
    if (!goal) return null;
    const contributions = this.state.data.contributions.filter((c) => c.goalId === id);
    this.commit((d) => ({ ...d, goals: d.goals.filter((g) => g.id !== id), contributions: d.contributions.filter((c) => c.goalId !== id) }));
    return { goal, contributions };
  }

  restoreGoal(removed: { goal: SavingsGoal; contributions: GoalContribution[] } | null): void {
    if (!removed) return;
    this.commit((d) => ({ ...d, goals: upsert(d.goals, removed.goal), contributions: [...d.contributions.filter((c) => c.goalId !== removed.goal.id), ...removed.contributions] }));
  }

  /** Positive = set aside into the goal; negative = withdraw. */
  contribute(goalId: Id, amountCents: Cents, date: ISODate = this.clock.today()): void {
    if (!Number.isInteger(amountCents) || amountCents === 0) return;
    const c: GoalContribution = { id: this.newId('gc'), goalId, amountCents, date };
    this.commit((d) => ({ ...d, contributions: [...d.contributions, c] }));
  }

  // ---- settings ----
  updateSettings(patch: Partial<Settings>): void {
    this.commit((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  }
}

function upsert<T extends { id: Id }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
}

function dedupeTags(tags: string[]): string[] {
  return [...new Set(tags.map(sanitizeTag).filter(Boolean))].slice(0, LIMITS.tagsPerTransaction);
}

/** Defence in depth: the same limits the form shows are enforced on every write. */
function clean<T extends Pick<Transaction, 'title' | 'tags'> & { notes?: string }>(t: T): T {
  const notes = t.notes === undefined ? undefined : sanitizeMultiline(t.notes, LIMITS.notes).value || undefined;
  return { ...t, title: sanitizeLine(t.title, LIMITS.title).value, tags: parseTags(t.tags.join(',')).tags, notes };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
