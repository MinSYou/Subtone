import { describe, expect, it } from 'vitest';
import { addMonths, addMonthsToKey, daysBetween, daysInMonth, isISODate, monthRange } from './dates';
import { formatMoney, parseAmount, sumCents, toCents } from './money';

describe('money', () => {
  it('sums in integer cents without floating-point drift', () => {
    const prices = Array.from({ length: 10 }, () => 0.1);
    expect(prices.reduce((a, b) => a + b, 0)).not.toBe(1); // the Double problem
    expect(sumCents(prices.map(toCents))).toBe(100);
  });

  it.each([
    ['42', 4200],
    ['42.5', 4250],
    ['$1,234.56', 123456],
    ['1,234', 123400],
    ['12,5', 1250],
    ['1.234,56', 123456],
    [' 0.99 ', 99],
  ])('parses %j → %i cents', (input, cents) => {
    expect(parseAmount(input)).toBe(cents);
  });

  it.each(['', 'abc', '-5', '1.234.5', '12.345'])('rejects %j', (input) => {
    expect(parseAmount(input)).toBeNull();
  });

  it('formats AUD with sign options', () => {
    expect(formatMoney(128_440)).toBe('$1,284.40');
    expect(formatMoney(128_440, { whole: true, signed: true })).toBe('+$1,284');
    expect(formatMoney(-5_000, { whole: true })).toBe('−$50');
  });
});

describe('dates', () => {
  it('validates real calendar dates only', () => {
    expect(isISODate('2028-02-29')).toBe(true);
    expect(isISODate('2026-02-29')).toBe(false);
    expect(isISODate('2026-13-01')).toBe(false);
  });

  it('clamps month arithmetic to month length', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonthsToKey('2026-11', 3)).toBe('2027-02');
    expect(addMonthsToKey('2026-01', -1)).toBe('2025-12');
  });

  it('counts days and ranges', () => {
    expect(daysInMonth(2026, 11)).toBe(30);
    expect(daysBetween('2026-11-22', '2026-12-01')).toBe(9);
    expect(monthRange('2026-10', '2027-01')).toEqual(['2026-10', '2026-11', '2026-12', '2027-01']);
  });
});
