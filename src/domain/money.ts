/**
 * Money is stored as integer minor units (cents) to avoid floating-point drift.
 * (Inpenso stores `price: Double`; 0.1 + 0.2 style errors accumulate over a month of sums.)
 */
export type Cents = number;

export const DEFAULT_CURRENCY = 'AUD';
export const DEFAULT_LOCALE = 'en-AU';

export function toCents(major: number): Cents {
  if (!Number.isFinite(major)) throw new RangeError(`Invalid amount: ${major}`);
  return Math.round(major * 100);
}

export function fromCents(cents: Cents): number {
  return cents / 100;
}

/**
 * Parse user input such as "42", "42.5", "$1,234.56" or "1 234,56" (comma decimal)
 * into cents. Returns null when the input is not a usable non-negative amount.
 */
export function parseAmount(input: string): Cents | null {
  const trimmed = input.trim().replace(/[$\s]/g, '');
  if (trimmed === '') return null;
  let normalised = trimmed;
  const lastComma = normalised.lastIndexOf(',');
  const lastDot = normalised.lastIndexOf('.');
  if (lastComma > lastDot && normalised.length - lastComma - 1 <= 2) {
    // "1.234,56" or "12,5": comma is the decimal separator
    normalised = normalised.replace(/\./g, '').replace(',', '.');
  } else {
    normalised = normalised.replace(/,/g, '');
  }
  if (!/^\d+(\.\d{0,2})?$/.test(normalised)) return null;
  const [whole, frac = ''] = normalised.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, locale: string, whole: boolean): Intl.NumberFormat {
  const key = `${locale}|${currency}|${whole}`;
  let f = formatters.get(key);
  if (!f) {
    // Non-whole uses the currency's own minor units (2 for AUD, 0 for JPY/KRW).
    f = new Intl.NumberFormat(locale, whole ? { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 } : { style: 'currency', currency });
    formatters.set(key, f);
  }
  return f;
}

export interface FormatOptions {
  currency?: string;
  locale?: string;
  /** Drop cents (rounded), for headline figures. */
  whole?: boolean;
  /** Prefix "+" for positive values (cashflow). */
  signed?: boolean;
}

export function formatMoney(cents: Cents, opts: FormatOptions = {}): string {
  const { currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE, whole = false, signed = false } = opts;
  const abs = Math.abs(cents);
  const body = formatter(currency, locale, whole).format(whole ? Math.round(abs / 100) : abs / 100);
  if (cents < 0) return `−${body}`;
  if (signed && cents > 0) return `+${body}`;
  return body;
}

export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Percentage (0–100+) of part over whole; 0 when whole is 0. */
export function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : (part / whole) * 100;
}
