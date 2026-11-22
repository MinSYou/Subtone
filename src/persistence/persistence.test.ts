import { describe, expect, it } from 'vitest';
import { generateSampleData } from '../seed/sampleData';
import { budget, snapshot, txn } from '../test/fixtures';
import { BackupError, createBackup, csvCell, parseBackup, transactionsToCsv } from './backup';
import { createLocalStorageRepository, createMemoryRepository, type KeyValueStorage } from './localAdapters';
import { applyChanges, diffSnapshots, isEmptyChangeSet, RepositoryError } from './repository';

function fakeStorage(opts: { failWrites?: boolean } = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (opts.failWrites) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      data.set(k, v);
    },
    removeItem: (k) => void data.delete(k),
  };
}

describe('change sets', () => {
  it('diffs and re-applies to the same snapshot', () => {
    const a = snapshot({ transactions: [txn('2026-11-01', 'rent', 1800_00), txn('2026-11-02', 'groceries', 50_00)] });
    const b = structuredClone(a);
    b.transactions[1] = { ...b.transactions[1], amountCents: 55_00 };
    b.transactions.splice(0, 1);
    b.budgets.push(budget(4500_00));
    const changes = diffSnapshots(a, b);
    expect(changes.transactions?.deletes).toEqual([a.transactions[0].id]);
    expect(changes.transactions?.upserts).toHaveLength(1);
    expect(applyChanges(a, changes)).toEqual(b);
    expect(isEmptyChangeSet(diffSnapshots(b, b))).toBe(true);
  });
});

describe('repositories', () => {
  it('memory adapter isolates callers from internal state', async () => {
    const repo = createMemoryRepository(snapshot());
    const loaded = (await repo.load())!;
    loaded.transactions.push(txn('2026-11-01', 'rent', 1_00));
    expect((await repo.load())!.transactions).toHaveLength(0);
  });

  it('localStorage adapter round-trips data', async () => {
    const storage = fakeStorage();
    const repo = createLocalStorageRepository(storage);
    expect(await repo.load()).toBeNull();
    const s = generateSampleData('2026-11-22');
    await repo.replaceAll(s);
    expect(await repo.load()).toEqual(s);
  });

  it('surfaces storage failures instead of swallowing them', async () => {
    const repo = createLocalStorageRepository(fakeStorage({ failWrites: true }));
    await expect(repo.replaceAll(snapshot())).rejects.toBeInstanceOf(RepositoryError);
  });

  it('reports corrupt stored data', async () => {
    const storage = fakeStorage();
    storage.data.set('subtone:data:v1', '{"transactions":[{"id":1}]}');
    await expect(createLocalStorageRepository(storage).load()).rejects.toBeInstanceOf(RepositoryError);
  });
});

describe('backup', () => {
  it('exports and restores a complete snapshot', () => {
    const s = generateSampleData('2026-11-22');
    const text = JSON.stringify(createBackup(s, '2026-11-22T10:00:00.000Z'));
    expect(parseBackup(text)).toEqual(s);
  });

  it('rejects foreign, newer or invalid files with readable errors', () => {
    expect(() => parseBackup('not json')).toThrow('not valid JSON');
    expect(() => parseBackup('{"hello":1}')).toThrow('not a Subtone backup');
    const env = createBackup(snapshot(), 'x');
    expect(() => parseBackup(JSON.stringify({ ...env, schemaVersion: 99 }))).toThrow('newer');
    const bad = createBackup(snapshot({ transactions: [{ ...txn('2026-11-01', 'rent', 1_00), amountCents: -5 }] }), 'x');
    try {
      parseBackup(JSON.stringify(bad));
      throw new Error('expected failure');
    } catch (e) {
      expect(e).toBeInstanceOf(BackupError);
      expect((e as BackupError).problems).toEqual(['transactions[0].amountCents is invalid']);
    }
  });

  it('writes RFC 4180 CSV and blocks formula injection', () => {
    expect(csvCell('Coffee, "large"')).toBe('"Coffee, ""large"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-refund')).toBe("'-refund");
    const csv = transactionsToCsv(snapshot({ transactions: [txn('2026-11-01', 'groceries', 12_34, { title: 'Aldi, Newtown', tags: ['weekly', 'food'] })] }));
    expect(csv.split('\r\n')[1]).toMatch(/^2026-11-01,expense,"Aldi, Newtown",-12\.34,Groceries,flexible,weekly;food,,t_\d+$/);
  });
});
