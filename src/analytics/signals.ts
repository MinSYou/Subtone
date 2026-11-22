import { categoryOf, indexCategories } from '../domain/categories';
import { addDays, formatDayMonth, monthKey, type ISODate, type MonthKey } from '../domain/dates';
import { formatMoney, type Cents } from '../domain/money';
import type { FinanceSnapshot, Insight } from '../domain/types';
import { inPeriod, monthPeriod } from './breakdown';
import { allocation } from './goals';
import { computePacing, monthClock, type PacingReport } from './pacing';
import { upcoming } from './recurring';
import { categoryMovers, monthsOfHistory } from './trends';

/** Tunable thresholds; exported so tests and future "rules" settings can override them. */
export const SIGNAL_RULES = {
  /** Months of prior history before comparative signals (spikes, unusual) switch on. */
  minHistoryMonths: 2,
  spikeMinPct: 30,
  spikeMinDeltaCents: 50_00,
  unusualMultiple: 3,
  unusualMinCents: 30_00,
  unusualMinSamples: 5,
  unusualLookbackDays: 90,
  surplusMinCents: 100_00,
  surplusShowWhenDaysLeft: 10,
  maxPerKind: 2,
};

export type SignalRules = typeof SIGNAL_RULES;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface SignalContext {
  snapshot: FinanceSnapshot;
  month: MonthKey;
  today: ISODate;
  pacing?: PacingReport;
  rules?: Partial<SignalRules>;
}

export function generateSignals(ctx: SignalContext): Insight[] {
  const rules = { ...SIGNAL_RULES, ...ctx.rules };
  const { snapshot, month, today } = ctx;
  const money = (c: Cents) => formatMoney(c, { whole: true, currency: snapshot.settings.currency, locale: snapshot.settings.locale });
  const pacing = ctx.pacing ?? computePacing(snapshot, month, today);
  const clock = monthClock(month, today);
  const index = indexCategories(snapshot.categories);
  const out: Insight[] = [];

  // 1. Overall budget burn
  const o = pacing.overall;
  if (o.status === 'over' && o.limitCents !== null) {
    out.push({
      id: `budget-burn:${month}`,
      kind: 'budget-burn',
      severity: 'alert',
      priority: 100,
      title: `Over budget by ${money(o.spentCents - o.limitCents)}`,
      detail: `You've spent ${money(o.spentCents)} of ${money(o.limitCents)} this month.`,
      action: { label: 'See budget pacing', route: 'plan/budgets' },
    });
  } else if (o.status === 'fast' && o.limitCents !== null) {
    out.push({
      id: `budget-burn:${month}`,
      kind: 'budget-burn',
      severity: 'warning',
      priority: 90,
      title: `On track to finish ${money(o.projectedCents - o.limitCents)} over budget`,
      detail: `Day-to-day spending is running at ${money(o.dailyRateCents)}/day; ${money(o.safePerDayCents ?? 0)}/day keeps you inside ${money(o.limitCents)}.`,
      action: { label: 'See budget pacing', route: 'plan/budgets' },
    });
  }

  // 2. Category limits
  pacing.categories
    .filter((c) => c.status === 'over' || c.status === 'fast')
    .slice(0, rules.maxPerKind)
    .forEach((c) => {
      const over = c.status === 'over';
      out.push({
        id: `category-limit:${month}:${c.categoryId}`,
        kind: 'category-limit',
        severity: over ? 'alert' : 'warning',
        priority: over ? 85 : 70,
        title: over ? `${c.label} is over its ${money(c.limitCents!)} limit` : `${c.label} is spending fast`,
        detail: over
          ? `${money(c.spentCents)} spent — ${money(c.spentCents - c.limitCents!)} over.`
          : `${money(c.spentCents)} of ${money(c.limitCents!)} used; projected ${money(c.projectedCents)} by month end.`,
        action: { label: 'Adjust limit', route: 'plan/budgets', targetId: c.categoryId ?? undefined },
      });
    });

  const enoughHistory = monthsOfHistory(snapshot.transactions, month) >= rules.minHistoryMonths;

  // 3. Spend spikes (like-for-like vs the same days last month)
  if (enoughHistory) {
    categoryMovers(snapshot.transactions, snapshot.categories, month, today)
      .filter((m) => m.previousCents > 0 && m.deltaPct !== null && m.deltaPct >= rules.spikeMinPct && m.deltaCents >= rules.spikeMinDeltaCents)
      .sort((a, b) => (b.deltaPct ?? 0) - (a.deltaPct ?? 0))
      .slice(0, rules.maxPerKind)
      .forEach((m) => {
        out.push({
          id: `spend-spike:${month}:${m.category.id}`,
          kind: 'spend-spike',
          severity: 'warning',
          priority: 60 + Math.min(20, Math.round(m.deltaPct! / 10)),
          title: `${m.category.name} is up ${Math.round(m.deltaPct!)}% vs last month`,
          detail: `${money(m.currentCents)} so far vs ${money(m.previousCents)} over the same days last month.`,
          action: {
            label: pacing.categories.some((c) => c.categoryId === m.category.id) ? `Review ${m.category.name} limit` : `Set a limit for ${m.category.name}`,
            route: 'plan/budgets',
            targetId: m.category.id,
          },
        });
      });
  }

  // 4. Unusual transactions (vs the category's recent median)
  if (enoughHistory) {
    const monthTx = inPeriod(snapshot.transactions, monthPeriod(month)).filter((t) => t.type === 'expense');
    const candidates = monthTx
      .map((t) => {
        const from = addDays(t.date, -rules.unusualLookbackDays);
        const sample = snapshot.transactions
          .filter((s) => s.id !== t.id && s.type === 'expense' && s.categoryId === t.categoryId && s.date >= from && s.date <= t.date)
          .map((s) => s.amountCents);
        if (sample.length < rules.unusualMinSamples) return null;
        const typical = median(sample);
        const ratio = typical > 0 ? t.amountCents / typical : 0;
        return ratio >= rules.unusualMultiple && t.amountCents >= rules.unusualMinCents ? { t, typical, ratio } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, rules.maxPerKind);
    for (const { t, typical, ratio } of candidates) {
      out.push({
        id: `unusual:${t.id}`,
        kind: 'unusual-transaction',
        severity: 'info',
        priority: 50,
        title: `${t.title} ${formatMoney(t.amountCents, { currency: snapshot.settings.currency, locale: snapshot.settings.locale })} on ${formatDayMonth(t.date)}`,
        detail: `About ${ratio.toFixed(1)}× your typical ${categoryOf(index, t.categoryId).name} spend (${money(Math.round(typical))}). Check it was you, or recategorise it.`,
        action: { label: 'Review transaction', route: 'activity/transactions', targetId: t.id },
      });
    }
  }

  // 5. Upcoming recurring items
  if (clock.daysLeft > 0 || monthKey(today) < month) {
    const soon = upcoming(snapshot.recurring.filter((r) => r.type === 'expense'), today, snapshot.settings.upcomingWindowDays);
    if (soon.length > 0) {
      const total = soon.reduce((s, x) => s + x.item.amountCents, 0);
      const names = soon.slice(0, 3).map((x) => x.item.title);
      const more = soon.length > 3 ? ` and ${soon.length - 3} more` : '';
      out.push({
        id: `upcoming:${today}`,
        kind: 'upcoming-recurring',
        severity: 'info',
        priority: 40,
        title: soon.length === 1 ? `${names[0]} renews ${formatDayMonth(soon[0].date)}` : `${soon.length} bills due in the next ${snapshot.settings.upcomingWindowDays} days`,
        detail: `${names.join(', ')}${more} — ${formatMoney(total, { currency: snapshot.settings.currency, locale: snapshot.settings.locale })} total. Already reserved in your safe-to-spend figure.`,
        action: { label: 'View recurring', route: 'activity/recurring' },
      });
    }
  }

  // 6. Unallocated surplus → nudge into a goal
  const alloc = allocation(snapshot, month);
  const nearEnd = !clock.isCurrent ? month < monthKey(today) : clock.daysLeft <= rules.surplusShowWhenDaysLeft;
  if (nearEnd && alloc.unallocatedCents >= rules.surplusMinCents) {
    out.push({
      id: `surplus:${month}`,
      kind: 'unallocated-surplus',
      severity: 'positive',
      priority: 30,
      title: `${money(alloc.unallocatedCents)} of surplus isn't set aside yet`,
      detail: 'Move it into a savings goal so leftover cashflow is not treated as spending money.',
      action: { label: 'Add to a goal', route: 'plan/goals' },
    });
  }

  return out.sort((a, b) => b.priority - a.priority);
}
