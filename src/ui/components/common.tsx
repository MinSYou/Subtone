import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PACE_LABEL, type PaceResult } from '../../analytics';
import { categoryOf, indexCategories } from '../../domain/categories';
import { addMonthsToKey, formatDayMonth, formatMonthLong, type MonthKey } from '../../domain/dates';
import type { Category, Insight, Transaction, TransactionType } from '../../domain/types';
import { useMoney, useMonth, useStoreState } from '../context';
import { Icon } from './Icon';
import { PACE_EMOJI } from './visual';

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  small,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  small?: boolean;
}) {
  return (
    <div className={`seg${small ? ' small' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function MonthSwitcher() {
  const [month, setMonth] = useMonth();
  return (
    <div className="row" style={{ gap: 0 }}>
      <button className="icon-btn plain" aria-label="Previous month" onClick={() => setMonth(addMonthsToKey(month, -1))}>
        <Icon name="chevronLeft" />
      </button>
      <span style={{ fontWeight: 600, fontSize: 15, minWidth: 118, textAlign: 'center' }}>{formatMonthLong(month)}</span>
      <button className="icon-btn plain" aria-label="Next month" onClick={() => setMonth(addMonthsToKey(month, 1))}>
        <Icon name="chevronRight" />
      </button>
    </div>
  );
}

export function useMonthLabel(month: MonthKey) {
  return formatMonthLong(month);
}

/**
 * Bottom sheet rendered through a portal on <body>, so its full-screen backdrop is never trapped
 * by an ancestor's transform/filter/stacking context. The page behind is made inert (no focus,
 * no taps, hidden from screen readers) and scroll is locked on both html and body.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    root?.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.add('sheet-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      root?.removeAttribute('inert');
      root?.removeAttribute('aria-hidden');
      document.documentElement.classList.remove('sheet-open');
      prev?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="grab" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn plain" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function PaceBar({ pace, large }: { pace: PaceResult; large?: boolean }) {
  const marker = pace.idealPct;
  const pct = pace.limitCents ? Math.min(100, pace.spentPct) : 0;
  return (
    <div
      className={`bar${large ? ' lg' : ''}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pace.spentPct)}
      aria-label={`${pace.label}: ${Math.round(pace.spentPct)}% of limit used, ${PACE_LABEL[pace.status]}`}
    >
      <div className={`fill ${pace.status}`} style={{ width: `${pct}%` }} />
      {marker !== null && marker > 0 && marker < 100 && <div className="pace" style={{ left: `${marker}%` }} title="Where spending should be today" />}
    </div>
  );
}

export function PaceBadge({ status }: { status: PaceResult['status'] }) {
  return (
    <span className={`badge ${status}`}>
      <span className={`pace-emoji ${status}`} aria-hidden="true">
        {PACE_EMOJI[status]}
      </span>{' '}
      {PACE_LABEL[status]}
    </span>
  );
}

export function CategoryDot({ category, size = 34 }: { category: Category; size?: number }) {
  return (
    <span className="cat-dot" style={{ width: size, height: size, background: `${category.color}1f`, color: category.color }}>
      <Icon name={category.icon} size={Math.round(size * 0.5)} />
    </span>
  );
}

/**
 * The single category picker used everywhere (Add/Edit transaction, Can I afford it?,
 * bulk recategorise, recurring items) so every flow offers the same full category list.
 */
export function CategoryPicker({
  type,
  value,
  onChange,
  label = 'Category',
}: {
  type: TransactionType;
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const { data } = useStoreState();
  const cats = data.categories.filter((c) => c.type === type && !c.archived);
  return (
    <div className="field">
      <span className="lbl" id={`cat-${type}-lbl`}>
        {label}
      </span>
      <div className="cat-grid" role="group" aria-labelledby={`cat-${type}-lbl`}>
        {cats.map((c) => (
          <button key={c.id} type="button" aria-pressed={c.id === value} onClick={() => onChange(c.id)}>
            <span style={{ color: c.color }}>
              <Icon name={c.icon} size={18} />
            </span>
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}

const KIND_LABEL: Record<Insight['kind'], string> = {
  'budget-burn': 'Budget burn',
  'category-limit': 'Category limit',
  'spend-spike': 'Spike',
  'unusual-transaction': 'Unusual',
  'upcoming-recurring': 'Upcoming',
  'unallocated-surplus': 'Surplus',
};

export function SignalCard({ insight, onAction, compact }: { insight: Insight; onAction: (route: string) => void; compact?: boolean }) {
  return (
    <div className={`card signal ${insight.severity}`}>
      <span className="kind">{KIND_LABEL[insight.kind]}</span>
      <span className="t num">{insight.title}</span>
      {!compact && <span className="d num">{insight.detail}</span>}
      {!compact && insight.action && (
        <button className="link-btn" onClick={() => onAction(insight.action!.route + (insight.action!.targetId ? `/${insight.action!.targetId}` : ''))}>
          {insight.action.label} →
        </button>
      )}
    </div>
  );
}

export function TxnRow({
  t,
  onClick,
  selected,
  selecting,
}: {
  t: Transaction;
  onClick: () => void;
  selected?: boolean;
  selecting?: boolean;
}) {
  const money = useMoney();
  const { data } = useStoreState();
  const cat = categoryOf(indexCategories(data.categories), t.categoryId);
  return (
    <button className="list-row" onClick={onClick} aria-pressed={selecting ? selected : undefined}>
      {selecting ? (
        <span className={`check${selected ? ' on' : ''}`} aria-hidden="true">
          {selected && <Icon name="check" size={14} strokeWidth={3} />}
        </span>
      ) : (
        <CategoryDot category={cat} />
      )}
      <span className="grow stack" style={{ gap: 0 }}>
        <span className="title">{t.title || cat.name}</span>
        <span className="sub">
          {cat.name} · {formatDayMonth(t.date)}
          {t.recurringId ? ' · recurring' : ''}
          {t.tags.length ? ` · #${t.tags.join(' #')}` : ''}
        </span>
      </span>
      <span className={`amount num${t.type === 'income' ? ' income' : ''}`}>
        {t.type === 'income' ? '+' : '−'}
        {money(t.amountCents)}
      </span>
    </button>
  );
}

export function Empty({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="card empty">
      <strong style={{ fontSize: 16 }}>{title}</strong>
      <span className="muted" style={{ fontSize: 13, maxWidth: 300 }}>
        {body}
      </span>
      {children}
    </div>
  );
}
