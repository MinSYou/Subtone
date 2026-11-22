import { categoryOf, indexCategories } from '../domain/categories';
import { isISODate } from '../domain/dates';
import { DEFAULT_SETTINGS, type FinanceSnapshot, type Settings } from '../domain/types';

export const BACKUP_FORMAT = 'subtone-backup';
export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  app: { name: 'Subtone' };
  counts: Record<string, number>;
  data: FinanceSnapshot;
}

export class BackupError extends Error {
  constructor(
    message: string,
    readonly problems: string[] = [],
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

export function createBackup(snapshot: FinanceSnapshot, exportedAt: string): BackupEnvelope {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    app: { name: 'Subtone' },
    counts: {
      transactions: snapshot.transactions.length,
      categories: snapshot.categories.length,
      budgets: snapshot.budgets.length,
      recurring: snapshot.recurring.length,
      goals: snapshot.goals.length,
      contributions: snapshot.contributions.length,
    },
    data: snapshot,
  };
}

export function backupFileName(exportedAt: string, ext: 'json' | 'csv'): string {
  return `subtone-backup-${exportedAt.slice(0, 10)}.${ext}`;
}

// ---- validation ---------------------------------------------------------------------

type Check = (v: unknown) => boolean;
const str: Check = (v) => typeof v === 'string';
const nonEmpty: Check = (v) => typeof v === 'string' && v.trim().length > 0;
const int: Check = (v) => Number.isInteger(v);
const posInt: Check = (v) => Number.isInteger(v) && (v as number) > 0;
const date: Check = isISODate;
const oneOf = (...xs: string[]): Check => (v) => typeof v === 'string' && xs.includes(v);
const optional = (c: Check): Check => (v) => v === undefined || v === null || c(v);
const strArray: Check = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const monthOrDefault: Check = (v) => v === 'default' || (typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v));

const SCHEMAS: Record<string, Record<string, Check>> = {
  transactions: {
    id: nonEmpty, type: oneOf('expense', 'income'), title: str, amountCents: posInt, date,
    categoryId: nonEmpty, tags: strArray, notes: optional(str), recurringId: optional(str), createdAt: str, updatedAt: str,
  },
  categories: {
    id: nonEmpty, name: nonEmpty, type: oneOf('expense', 'income'), spendClass: oneOf('fixed', 'flexible'), icon: str, color: str,
  },
  budgets: { id: nonEmpty, month: monthOrDefault, categoryId: optional(nonEmpty), limitCents: posInt },
  recurring: {
    id: nonEmpty, title: nonEmpty, kind: oneOf('bill', 'subscription', 'income'), type: oneOf('expense', 'income'),
    amountCents: posInt, categoryId: nonEmpty, cadence: oneOf('weekly', 'fortnightly', 'monthly', 'yearly'),
    anchorDate: date, status: oneOf('active', 'paused'), endDate: optional(date),
  },
  goals: { id: nonEmpty, name: nonEmpty, targetCents: posInt, icon: str, color: str, targetDate: optional(date), createdAt: str },
  contributions: { id: nonEmpty, goalId: nonEmpty, amountCents: int, date },
};

/** Validate an untrusted object (backup data or stored JSON) into a FinanceSnapshot. */
export function parseSnapshot(raw: unknown): FinanceSnapshot {
  const problems: string[] = [];
  if (!raw || typeof raw !== 'object') throw new BackupError('Backup data is not an object.');
  const obj = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [collection, schema] of Object.entries(SCHEMAS)) {
    const list = obj[collection] ?? [];
    if (!Array.isArray(list)) {
      problems.push(`${collection} is not a list`);
      continue;
    }
    const ids = new Set<string>();
    list.forEach((item, i) => {
      if (!item || typeof item !== 'object') {
        problems.push(`${collection}[${i}] is not an object`);
        return;
      }
      for (const [field, check] of Object.entries(schema)) {
        if (!check((item as Record<string, unknown>)[field])) problems.push(`${collection}[${i}].${field} is invalid`);
      }
      const id = (item as { id?: string }).id;
      if (id && ids.has(id)) problems.push(`${collection}[${i}] duplicates id ${id}`);
      if (id) ids.add(id);
    });
    out[collection] = list;
  }
  if (problems.length) {
    throw new BackupError(`Backup failed validation (${problems.length} problem${problems.length > 1 ? 's' : ''}).`, problems.slice(0, 20));
  }
  const settingsRaw = (obj.settings ?? {}) as Partial<Settings>;
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...settingsRaw,
    chartPrefs: { ...DEFAULT_SETTINGS.chartPrefs, ...(settingsRaw.chartPrefs ?? {}) },
  };
  // Normalise optional nulls and missing tags written by older versions.
  const snapshot = { ...(out as unknown as FinanceSnapshot), settings };
  snapshot.transactions = snapshot.transactions.map((t) => ({ ...t, tags: t.tags ?? [] }));
  snapshot.budgets = snapshot.budgets.map((b) => ({ ...b, categoryId: b.categoryId ?? null }));
  return snapshot;
}

/** Parse a backup file's text. Accepts the versioned envelope only. */
export function parseBackup(text: string): FinanceSnapshot {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupError('This file is not valid JSON.');
  }
  const env = json as Partial<BackupEnvelope>;
  if (!env || env.format !== BACKUP_FORMAT) throw new BackupError('This is not a Subtone backup file.');
  if (typeof env.schemaVersion !== 'number' || env.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new BackupError(`Backup version ${String(env.schemaVersion)} is newer than this app supports (${BACKUP_SCHEMA_VERSION}).`);
  }
  return parseSnapshot(env.data);
}

// ---- CSV ------------------------------------------------------------------------------

/**
 * Escape one CSV cell (RFC 4180) and neutralise spreadsheet formula injection: cells that start
 * with = + - @ or a tab/CR are prefixed with an apostrophe so Excel/Sheets don't evaluate them.
 * Numeric columns are written separately and are never prefixed.
 */
export function csvCell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export const CSV_HEADER = ['date', 'type', 'title', 'amount', 'category', 'spend_class', 'tags', 'notes', 'id'];

export function transactionsToCsv(snapshot: FinanceSnapshot): string {
  const index = indexCategories(snapshot.categories);
  const rows = [...snapshot.transactions]
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1))
    .map((t) => {
      const cat = categoryOf(index, t.categoryId);
      const signed = (t.type === 'expense' ? -t.amountCents : t.amountCents) / 100;
      return [
        t.date,
        t.type,
        csvCell(t.title),
        signed.toFixed(2),
        csvCell(cat.name),
        cat.spendClass,
        csvCell(t.tags.join(';')),
        csvCell(t.notes ?? ''),
        csvCell(t.id),
      ].join(',');
    });
  return [CSV_HEADER.join(','), ...rows].join('\r\n') + '\r\n';
}
