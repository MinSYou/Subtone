import { emptySnapshot, type FinanceSnapshot } from '../domain/types';
import { parseSnapshot } from './backup';
import { applyChanges, RepositoryError, type ChangeSet, type FinanceRepository } from './repository';

/** In-memory adapter: tests, storybook-style previews, and a fallback when storage is blocked. */
export function createMemoryRepository(initial: FinanceSnapshot | null = null): FinanceRepository & { peek(): FinanceSnapshot | null } {
  let data: FinanceSnapshot | null = initial ? structuredClone(initial) : null;
  return {
    kind: 'memory',
    async load() {
      return data ? structuredClone(data) : null;
    },
    async apply(changes: ChangeSet) {
      data = applyChanges(data ?? emptySnapshot(), structuredClone(changes));
    },
    async replaceAll(snapshot) {
      data = structuredClone(snapshot);
    },
    peek: () => data,
  };
}

/** The subset of the Web Storage API we use; lets tests pass a fake that throws. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEY = 'subtone:data:v1';

/**
 * Browser adapter: one JSON document in localStorage. Data never leaves the device.
 * Quota/private-mode failures are rethrown as RepositoryError (Inpenso swallows them).
 */
export function createLocalStorageRepository(storage: KeyValueStorage, key = STORAGE_KEY): FinanceRepository {
  const read = (): FinanceSnapshot | null => {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    try {
      return parseSnapshot(JSON.parse(raw));
    } catch (err) {
      throw new RepositoryError('Saved data is unreadable. Restore from a backup or clear data.', err);
    }
  };
  const write = (snapshot: FinanceSnapshot) => {
    try {
      storage.setItem(key, JSON.stringify(snapshot));
    } catch (err) {
      throw new RepositoryError("Couldn't save to this browser's storage (private mode or storage full).", err);
    }
  };
  return {
    kind: 'localStorage',
    async load() {
      return read();
    },
    async apply(changes) {
      write(applyChanges(read() ?? emptySnapshot(), changes));
    },
    async replaceAll(snapshot) {
      write(snapshot);
    },
  };
}
