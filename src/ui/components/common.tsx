import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PACE_LABEL, type PaceResult } from '../../analytics';
import { categoryOf, indexCategories } from '../../domain/categories';
import { addMonthsToKey, formatDayMonth, formatMonthLong, type MonthKey } from '../../domain/dates';
import type { Category, Insight, Transaction, TransactionType } from '../../domain/types';
import { useMoney, useMonth, useStoreState } from '../context';
import { Icon } from './Icon';
import { play } from '../sound';
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

/** Open sheets, innermost last: only the top one reacts to Escape; scroll stays locked until all close. */
const sheetStack: symbol[] = [];

/**
 * Bottom sheet rendered through a portal on <body> (never trapped by an ancestor's stacking
 * context). Layout is a bounded flex column: the header and the optional footer stay pinned and
 * only the body scrolls, so titles never drift and primary actions are always on screen.
 */
export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const id = Symbol('sheet');
    sheetStack.push(id);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('.sheet-body input, .sheet-body textarea, .sheet-body button, .sheet-head button')?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && sheetStack[sheetStack.length - 1] === id) closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    root?.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.add('sheet-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      sheetStack.splice(sheetStack.indexOf(id), 1);
      if (sheetStack.length === 0) {
        root?.removeAttribute('inert');
        root?.removeAttribute('aria-hidden');
        document.documentElement.classList.remove('sheet-open');
      }
      prev?.focus?.({ preventScroll: true });
    };
    // Runs once per open: re-running on every parent render would steal focus while typing.
  }, []);
  return createPortal(
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && closeRef.current()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="sheet-head">
          <div className="grab" />
          <div className="row between">
            <h2>{title}</h2>
            <button className="icon-btn plain" aria-label="Close" onClick={() => closeRef.current()}>
              <Icon name="close" />
            </button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Label row with an optional live character counter. */
export function FieldLabel({ htmlFor, children, count, max, note }: { htmlFor?: string; children: ReactNode; count?: number; max?: number; note?: string }) {
  const near = max !== undefined && count !== undefined && count >= max * 0.9;
  return (
    <div className="row between" style={{ minHeight: 16 }}>
      <label className="lbl" htmlFor={htmlFor}>
        {children}
      </label>
      <span className="small num" aria-live="polite" style={{ color: note ? 'var(--warn)' : near ? 'var(--warn)' : 'var(--muted)' }}>
        {note ?? (max !== undefined && count !== undefined ? `${count}/${max}` : '')}
      </span>
    </div>
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
  compact,
}: {
  type: TransactionType;
  value: string;
  onChange: (id: string) => void;
  label?: string;
  /** Tighter tiles for forms that must fit above the fold. */
  compact?: boolean;
}) {
  const { data } = useStoreState();
  const cats = data.categories.filter((c) => c.type === type && !c.archived);
  return (
    <div className="field">
      <span className="lbl" id={`cat-${type}-lbl`}>
        {label}
      </span>
      <div className={`cat-grid${compact ? ' compact' : ''}`} role="group" aria-labelledby={`cat-${type}-lbl`}>
        {cats.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={c.id === value}
            onClick={() => {
              onChange(c.id);
              play('tap');
            }}
          >
            <span style={{ color: c.color }}>
              <Icon name={c.icon} size={compact ? 16 : 18} />
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
