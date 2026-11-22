/**
 * Calendar dates are plain local "YYYY-MM-DD" strings (ISODate) and months are "YYYY-MM"
 * (MonthKey). Transactions are day-granular, so avoiding Date objects in the domain removes
 * timezone off-by-one bugs and makes everything trivially serialisable.
 *
 * All "now" access goes through a Clock so analytics are deterministic in tests
 * (Inpenso calls `Date()` inside the view model, which makes results depend on the day the
 * tests run).
 */
export type ISODate = string;
export type MonthKey = string;

export interface Clock {
  today(): ISODate;
}

export const systemClock: Clock = {
  today() {
    const d = new Date();
    return toISODate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  },
};

export function fixedClock(date: ISODate): Clock {
  assertISODate(date);
  return { today: () => date };
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string') return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function assertISODate(value: unknown): asserts value is ISODate {
  if (!isISODate(value)) throw new RangeError(`Invalid ISO date: ${String(value)}`);
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function toISODate(year: number, month: number, day: number): ISODate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function parts(date: ISODate): { year: number; month: number; day: number } {
  const m = ISO_RE.exec(date);
  if (!m) throw new RangeError(`Invalid ISO date: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthKey(date: ISODate): MonthKey {
  return date.slice(0, 7);
}

export function monthKeyOf(year: number, month: number): MonthKey {
  return `${pad(year, 4)}-${pad(month)}`;
}

export function monthParts(key: MonthKey): { year: number; month: number } {
  const [y, m] = key.split('-').map(Number);
  return { year: y, month: m };
}

export function addMonthsToKey(key: MonthKey, delta: number): MonthKey {
  const { year, month } = monthParts(key);
  const index = year * 12 + (month - 1) + delta;
  return monthKeyOf(Math.floor(index / 12), (index % 12) + 1);
}

export function monthStart(key: MonthKey): ISODate {
  return `${key}-01`;
}

export function monthEnd(key: MonthKey): ISODate {
  const { year, month } = monthParts(key);
  return toISODate(year, month, daysInMonth(year, month));
}

export function daysInMonthKey(key: MonthKey): number {
  const { year, month } = monthParts(key);
  return daysInMonth(year, month);
}

function toUTC(date: ISODate): number {
  const { year, month, day } = parts(date);
  return Date.UTC(year, month - 1, day);
}

function fromUTC(ms: number): ISODate {
  const d = new Date(ms);
  return toISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * 86_400_000);
}

/** Add calendar months, clamping the day to the target month's length (31 Jan + 1 → 28/29 Feb). */
export function addMonths(date: ISODate, months: number, anchorDay?: number): ISODate {
  const { day } = parts(date);
  const key = addMonthsToKey(monthKey(date), months);
  const { year, month } = monthParts(key);
  return toISODate(year, month, Math.min(anchorDay ?? day, daysInMonth(year, month)));
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

export function isWithin(date: ISODate, from: ISODate, to: ISODate): boolean {
  return date >= from && date <= to;
}

/** Month keys from `from` to `to` inclusive. */
export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let k = from; k <= to; k = addMonthsToKey(k, 1)) out.push(k);
  return out;
}

const shortMonth = new Intl.DateTimeFormat('en-AU', { month: 'short', timeZone: 'UTC' });
const longMonth = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayMonth = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function formatMonthShort(key: MonthKey): string {
  return shortMonth.format(toUTC(monthStart(key)));
}
export function formatMonthLong(key: MonthKey): string {
  return longMonth.format(toUTC(monthStart(key)));
}
export function formatDayMonth(date: ISODate): string {
  return dayMonth.format(toUTC(date));
}
