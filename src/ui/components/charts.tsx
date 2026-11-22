import type { CategoryTotal, MonthPoint } from '../../analytics';
import { formatMonthShort } from '../../domain/dates';
import type { Cents } from '../../domain/money';

/**
 * Small dependency-free SVG charts. Each has an aria-label summary; the surrounding screen also
 * lists the underlying numbers, so nothing is chart-only.
 */

const INCOME = '#5FB8AE';
const SPENT = '#3346D3';

function niceMax(v: number): number {
  if (v <= 0) return 100_00;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / p / 0.5) * 0.5 * p;
}

interface SeriesProps {
  series: MonthPoint[];
  budgetCents?: Cents | null;
  /** Index of a projected point (drawn hatched / dashed). */
  projected?: { index: number; expenseCents: Cents } | null;
  format: (c: Cents) => string;
}

export function IncomeSpendBars({ series, budgetCents, projected, format }: SeriesProps) {
  const W = 340, H = 170, top = 10, bottom = 22, left = 4;
  const values = series.flatMap((p, i) => [p.incomeCents, i === projected?.index ? projected.expenseCents : p.expenseCents]);
  const max = niceMax(Math.max(...values, budgetCents ?? 0));
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  const slot = (W - left) / series.length;
  const bw = Math.min(14, slot / 3);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Income and spending for the last ${series.length} months`}>
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#c9cff5" />
          <rect width="3" height="6" fill={SPENT} />
        </pattern>
      </defs>
      <line x1={0} x2={W} y1={H - bottom} y2={H - bottom} stroke="#e4e4df" />
      {series.map((p, i) => {
        const cx = left + slot * i + slot / 2;
        const isProj = i === projected?.index;
        const spend = isProj ? projected!.expenseCents : p.expenseCents;
        return (
          <g key={p.month}>
            <rect x={cx - bw - 1.5} y={y(p.incomeCents)} width={bw} height={H - bottom - y(p.incomeCents)} rx={3} fill={INCOME}>
              <title>{`${formatMonthShort(p.month)} income ${format(p.incomeCents)}`}</title>
            </rect>
            <rect x={cx + 1.5} y={y(spend)} width={bw} height={H - bottom - y(spend)} rx={3} fill={isProj ? 'url(#hatch)' : SPENT}>
              <title>{`${formatMonthShort(p.month)} ${isProj ? 'projected ' : ''}spending ${format(spend)}`}</title>
            </rect>
            <text x={cx} y={H - 6} textAnchor="middle" fontSize="11" fill="#5b5f68">
              {formatMonthShort(p.month)}
            </text>
          </g>
        );
      })}
      {budgetCents ? <BudgetLine y={y(budgetCents)} W={W} label={`Budget ${format(budgetCents)}`} /> : null}
    </svg>
  );
}

function BudgetLine({ y, W, label }: { y: number; W: number; label: string }) {
  return (
    <g>
      <line x1={0} x2={W} y1={y} y2={y} stroke="#5b5f68" strokeDasharray="4 4" />
      <text x={2} y={y - 5} textAnchor="start" fontSize="11" fill="#5b5f68" stroke="#fff" strokeWidth={3} paintOrder="stroke">
        {label}
      </text>
    </g>
  );
}

export function IncomeSpendLines({ series, budgetCents, projected, format }: SeriesProps) {
  const W = 340, H = 170, top = 12, bottom = 22, pad = 18;
  const values = series.flatMap((p) => [p.incomeCents, p.expenseCents]).concat(projected ? [projected.expenseCents] : []);
  const max = niceMax(Math.max(...values, budgetCents ?? 0));
  const x = (i: number) => pad + ((W - pad * 2) * i) / Math.max(1, series.length - 1);
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const lastActual = projected ? projected.index - 1 : series.length - 1;
  const spendActual = series.slice(0, lastActual + 1).map((p) => p.expenseCents);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Income and spending trend over ${series.length} months`}>
      <line x1={0} x2={W} y1={H - bottom} y2={H - bottom} stroke="#e4e4df" />
      {budgetCents ? <BudgetLine y={y(budgetCents)} W={W} label={`Budget ${format(budgetCents)}`} /> : null}
      <path d={path(series.map((p) => p.incomeCents))} fill="none" stroke={INCOME} strokeWidth={2.5} />
      <path d={path(spendActual)} fill="none" stroke={SPENT} strokeWidth={2.5} />
      {projected && lastActual >= 0 && (
        <path
          d={`M${x(lastActual)},${y(series[lastActual].expenseCents)} L${x(projected.index)},${y(projected.expenseCents)}`}
          fill="none"
          stroke={SPENT}
          strokeWidth={2.5}
          strokeDasharray="5 4"
        />
      )}
      {series.map((p, i) => {
        const spend = i === projected?.index ? projected.expenseCents : p.expenseCents;
        return (
          <g key={p.month}>
            <circle cx={x(i)} cy={y(p.incomeCents)} r={3} fill={INCOME} />
            <circle cx={x(i)} cy={y(spend)} r={3.5} fill={i === projected?.index ? '#fff' : SPENT} stroke={SPENT} strokeWidth={2}>
              <title>{`${formatMonthShort(p.month)} spending ${format(spend)}`}</title>
            </circle>
            <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="#5b5f68">
              {formatMonthShort(p.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Donut: used only for single-period composition (a category breakdown of one month). */
export function Donut({ items, total, centerLabel }: { items: CategoryTotal[]; total: string; centerLabel: string }) {
  const R = 62, r = 40, C = 80;
  let angle = -Math.PI / 2;
  const sum = items.reduce((s, i) => s + i.totalCents, 0) || 1;
  const arcs = items.map((it) => {
    const a = (it.totalCents / sum) * Math.PI * 2;
    const start = angle;
    const end = angle + Math.max(a - 0.015, 0.001);
    angle += a;
    const large = end - start > Math.PI ? 1 : 0;
    const p = (rad: number, rr: number) => `${(C + rr * Math.cos(rad)).toFixed(2)},${(C + rr * Math.sin(rad)).toFixed(2)}`;
    return {
      it,
      d: `M${p(start, R)} A${R},${R} 0 ${large} 1 ${p(end, R)} L${p(end, r)} A${r},${r} 0 ${large} 0 ${p(start, r)} Z`,
    };
  });
  return (
    <svg className="chart" viewBox="0 0 160 160" style={{ maxWidth: 190, margin: '0 auto' }} role="img" aria-label={`${centerLabel} ${total}, split across ${items.length} categories`}>
      {items.length === 1 ? (
        <circle cx={C} cy={C} r={(R + r) / 2} fill="none" stroke={items[0].category.color} strokeWidth={R - r} />
      ) : (
        arcs.map(({ it, d }) => (
          <path key={it.category.id} d={d} fill={it.category.color}>
            <title>{`${it.category.name} ${Math.round(it.sharePct)}%`}</title>
          </path>
        ))
      )}
      <text x={C} y={C - 4} textAnchor="middle" fontSize="16" fontWeight="700" fill="#17181c">
        {total}
      </text>
      <text x={C} y={C + 13} textAnchor="middle" fontSize="10" fill="#5b5f68">
        {centerLabel}
      </text>
    </svg>
  );
}

/** Stacked composition strip used by the Bar view of Breakdown. */
export function CompositionStrip({ items }: { items: CategoryTotal[] }) {
  return (
    <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 }} aria-hidden="true">
      {items.map((i) => (
        <div key={i.category.id} style={{ flex: `${Math.max(i.sharePct, 0.5)} 1 0`, background: i.category.color }} />
      ))}
    </div>
  );
}
