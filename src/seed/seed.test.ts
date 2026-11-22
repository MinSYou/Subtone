import { describe, expect, it } from 'vitest';
import { buildDashboard } from '../analytics';
import { generateSampleData } from './sampleData';

const TODAY = '2026-11-22';

describe('sample seed data', () => {
  const data = generateSampleData(TODAY);

  it('is deterministic for the same day', () => {
    expect(generateSampleData(TODAY)).toEqual(data);
  });

  it('references only known categories and has no future transactions', () => {
    const ids = new Set(data.categories.map((c) => c.id));
    expect(data.transactions.every((t) => ids.has(t.categoryId))).toBe(true);
    expect(data.transactions.every((t) => t.date <= TODAY)).toBe(true);
    expect(data.transactions.every((t) => Number.isInteger(t.amountCents) && t.amountCents > 0)).toBe(true);
  });

  it('exercises every analytics feature on the dashboard', () => {
    const d = buildDashboard(data, '2026-11', TODAY);
    expect(d.historyMonths).toBe(4);
    // Fortnightly salary anchored 6 Jul lands 9 Nov and 23 Nov; only the first has happened by the 22nd.
    expect(d.summary.incomeCents).toBe(2600_00);
    expect(d.pacing.overall.limitCents).toBe(4500_00);
    expect(d.goals).toHaveLength(3);
    const kinds = new Set(d.signals.map((s) => s.kind));
    for (const k of ['spend-spike', 'unusual-transaction', 'upcoming-recurring'] as const) expect(kinds).toContain(k);
    expect(d.recurring.pausedCount).toBe(1);
  });
});
