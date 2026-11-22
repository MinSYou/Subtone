import { describe, expect, it } from 'vitest';
import { buildDashboard, summarise, monthPeriod } from '../analytics';
import { generateStudentData } from './studentData';
import { sampleFor } from './sampleData';

const TODAY = '2026-11-22';

describe('university student sample data', () => {
  const data = generateStudentData(TODAY);

  it('is deterministic and valid', () => {
    expect(generateStudentData(TODAY)).toEqual(data);
    const ids = new Set(data.categories.map((c) => c.id));
    expect(data.transactions.every((t) => ids.has(t.categoryId) && t.date <= TODAY && Number.isInteger(t.amountCents) && t.amountCents > 0)).toBe(true);
    expect(new Set(data.transactions.map((t) => t.id)).size).toBe(data.transactions.length);
    expect(JSON.stringify(data)).not.toContain('—');
  });

  it('looks like a student budget: weekly rent and pay, many small campus purchases', () => {
    const oct = summarise(data.transactions, data.categories, monthPeriod('2026-10'));
    // weekly casual pay + fortnightly student payment: roughly $2.3k-$3k in a full month
    expect(oct.incomeCents).toBeGreaterThan(2300_00);
    expect(oct.incomeCents).toBeLessThan(3000_00);
    // rent is the biggest expense; spending stays in a student range
    expect(oct.expenseByCategory[0].category.id).toBe('rent');
    expect(oct.expenseCents).toBeGreaterThan(1600_00);
    expect(oct.expenseCents).toBeLessThan(2600_00);
    const eatingOut = data.transactions.filter((t) => t.categoryId === 'eating-out');
    const median = eatingOut.map((t) => t.amountCents).sort((a, b) => a - b)[Math.floor(eatingOut.length / 2)];
    expect(median).toBeLessThan(15_00);
    expect(data.transactions.some((t) => t.title.startsWith('Textbook'))).toBe(true);
  });

  it('exercises pacing, signals and goals', () => {
    const d = buildDashboard(data, '2026-11', TODAY);
    expect(d.historyMonths).toBe(4);
    expect(d.pacing.overall.limitCents).toBe(2400_00);
    // exam-season overspend story, but still a positive daily allowance
    expect(d.pacing.overall.status).toBe('fast');
    expect(d.pacing.overall.safePerDayCents).toBeGreaterThan(0);
    expect(d.goals.map((g) => g.goal.name)).toEqual(['Emergency buffer', 'New laptop for uni', 'Exchange semester']);
    const kinds = new Set(d.signals.map((s) => s.kind));
    expect(kinds).toContain('unusual-transaction');
    expect(kinds).toContain('upcoming-recurring');
  });

  it('is selectable by profile', async () => {
    expect((await sampleFor('student', TODAY)).recurring.some((r) => r.title === 'Spotify Student')).toBe(true);
    expect((await sampleFor('professional', TODAY)).recurring.some((r) => r.title === 'Netflix')).toBe(true);
  });
});
