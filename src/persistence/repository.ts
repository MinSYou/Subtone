import type { FinanceSnapshot, Settings } from '../domain/types';

/** Collections that hold records with an `id`. Settings is a single document. */
export const COLLECTIONS = ['transactions', 'categories', 'budgets', 'recurring', 'goals', 'contributions'] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

export interface CollectionChange<T> {
  upserts: T[];
  deletes: string[];
}

/** A minimal, backend-neutral description of what changed between two snapshots. */
export type ChangeSet = {
  [K in CollectionName]?: CollectionChange<FinanceSnapshot[K][number]>;
} & { settings?: Settings };

/**
 * Storage boundary. The UI/state layer only talks to this interface, so the in-memory,
 * localStorage and (future) Firebase/Firestore adapters are interchangeable.
 *
 * Errors are thrown (never swallowed) so the store can surface them to the user.
 */
export interface FinanceRepository {
  readonly kind: string;
  load(): Promise<FinanceSnapshot | null>;
  /** Apply incremental changes (maps 1:1 to document writes in Firestore). */
  apply(changes: ChangeSet): Promise<void>;
  /** Replace everything — used by restore-from-backup and "clear all data". */
  replaceAll(snapshot: FinanceSnapshot): Promise<void>;
}

export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export function isEmptyChangeSet(c: ChangeSet): boolean {
  return (
    !c.settings &&
    COLLECTIONS.every((k) => {
      const ch = c[k];
      return !ch || (ch.upserts.length === 0 && ch.deletes.length === 0);
    })
  );
}

/** Compute a ChangeSet by comparing records by id + JSON equality. */
export function diffSnapshots(prev: FinanceSnapshot, next: FinanceSnapshot): ChangeSet {
  const changes: ChangeSet = {};
  for (const key of COLLECTIONS) {
    const before = new Map<string, string>((prev[key] as { id: string }[]).map((r) => [r.id, JSON.stringify(r)]));
    const after = next[key] as { id: string }[];
    const afterIds = new Set(after.map((r) => r.id));
    const upserts = after.filter((r) => before.get(r.id) !== JSON.stringify(r));
    const deletes = [...before.keys()].filter((id) => !afterIds.has(id));
    if (upserts.length || deletes.length) {
      (changes as Record<string, unknown>)[key] = { upserts, deletes };
    }
  }
  if (JSON.stringify(prev.settings) !== JSON.stringify(next.settings)) changes.settings = next.settings;
  return changes;
}

/** Apply a ChangeSet to a snapshot (pure). Shared by the local adapters. */
export function applyChanges(base: FinanceSnapshot, changes: ChangeSet): FinanceSnapshot {
  const next: FinanceSnapshot = { ...base };
  for (const key of COLLECTIONS) {
    const ch = changes[key];
    if (!ch) continue;
    const map = new Map((base[key] as { id: string }[]).map((r) => [r.id, r]));
    for (const id of ch.deletes) map.delete(id);
    for (const r of ch.upserts as { id: string }[]) map.set(r.id, r);
    (next as unknown as Record<string, unknown>)[key] = [...map.values()];
  }
  if (changes.settings) next.settings = changes.settings;
  return next;
}
