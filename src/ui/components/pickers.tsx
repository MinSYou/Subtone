import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDays, daysInMonth, parts, toISODate, type ISODate } from '../../domain/dates';
import { play } from '../sound';
import { Sheet } from './common';
import { Icon } from './Icon';

// ---- Select: rounded trigger + rounded popover (replaces native <select>) ----------------

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  hint?: string;
}

/**
 * Accessible listbox dropdown whose open menu shares the trigger's radius, border and elevation.
 * Keyboard: Enter/Space/ArrowDown opens, arrows move, Enter selects, Escape closes.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  id,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  label: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const autoId = useId();
  const listId = `${id ?? autoId}-list`;
  const current = options.find((o) => o.value === value);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const wanted = Math.min(options.length * 46 + 12, 320);
    if (below >= Math.min(wanted, 200) || below >= above) {
      setPos({ left: r.left, width: r.width, top: r.bottom + 6, maxHeight: Math.max(140, below) });
    } else {
      setPos({ left: r.left, width: r.width, bottom: window.innerHeight - r.top + 6, maxHeight: Math.max(140, above) });
    }
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    list.current?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const onResize = () => setOpen(false);
    // Capture phase on window runs before the sheet's Escape handler, so Escape closes only the menu.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      setOpen(false);
      btn.current?.focus();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const choose = (o: SelectOption<T>) => {
    if (o.disabled) return;
    onChange(o.value);
    setOpen(false);
    play('tap');
    btn.current?.focus();
  };

  const move = (dir: 1 | -1) => {
    let i = active;
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i].disabled) break;
    }
    setActive(i);
  };

  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${current?.label ?? ''}`}
        onClick={() => {
          setActive(Math.max(0, options.findIndex((o) => o.value === value)));
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="grow" style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current?.label}
        </span>
        <span className={`chev${open ? ' up' : ''}`} aria-hidden="true">
          <Icon name="chevronRight" size={16} />
        </span>
      </button>
      {open &&
        pos &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            aria-activedescendant={`${listId}-${active}`}
            className="select-menu"
            style={{ left: pos.left, width: Math.max(pos.width, 160), top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
              else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(options[active]); }
              else if (e.key === 'Tab') { setOpen(false); btn.current?.focus(); }
            }}
          >
            {options.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled || undefined}
                className={`${i === active ? 'active' : ''}${o.disabled ? ' disabled' : ''}`}
                onPointerEnter={() => !o.disabled && setActive(i)}
                onClick={() => choose(o)}
              >
                <span className="grow">{o.label}</span>
                {o.hint && <span className="muted small">{o.hint}</span>}
                {o.value === value && <Icon name="check" size={16} />}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}

// ---- Date field: big-target bottom-sheet picker ------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const longFmt = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function describeDate(date: ISODate, today: ISODate): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  if (date === addDays(today, 1)) return 'Tomorrow';
  return longFmt.format(Date.UTC(parts(date).year, parts(date).month - 1, parts(date).day));
}

/**
 * Replaces <input type="date">: a full-width trigger opens a sheet with quick picks and a month
 * grid of 44px+ day cells; tapping the month title switches to a month/year grid.
 */
export function DateField({
  value,
  onChange,
  today,
  label,
  min,
  max,
  optional,
  quick = 'past',
}: {
  value: ISODate | '';
  onChange: (d: ISODate | '') => void;
  today: ISODate;
  label: string;
  min?: ISODate;
  max?: ISODate;
  optional?: boolean;
  quick?: 'past' | 'future';
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="select-trigger" aria-label={`${label}: ${value ? describeDate(value, today) : 'not set'}`} onClick={() => setOpen(true)}>
        <Icon name="calendar" size={18} />
        <span className="grow" style={{ textAlign: 'left' }}>
          {value ? describeDate(value, today) : <span className="muted">Not set</span>}
        </span>
      </button>
      {open && (
        <DateSheet
          label={label}
          value={value || today}
          today={today}
          min={min}
          max={max}
          quick={quick}
          optional={optional}
          onClose={() => setOpen(false)}
          onPick={(d) => {
            onChange(d);
            setOpen(false);
            play('tap');
          }}
        />
      )}
    </>
  );
}

function DateSheet({
  label,
  value,
  today,
  min,
  max,
  quick,
  optional,
  onPick,
  onClose,
}: {
  label: string;
  value: ISODate;
  today: ISODate;
  min?: ISODate;
  max?: ISODate;
  quick: 'past' | 'future';
  optional?: boolean;
  onPick: (d: ISODate | '') => void;
  onClose: () => void;
}) {
  const p = parts(value);
  const [view, setView] = useState({ year: p.year, month: p.month });
  const [mode, setMode] = useState<'days' | 'months'>('days');
  const allowed = (d: ISODate) => (!min || d >= min) && (!max || d <= max);
  const quickPicks: [string, ISODate][] =
    quick === 'past'
      ? [['Today', today], ['Yesterday', addDays(today, -1)], ['2 days ago', addDays(today, -2)], ['Last week', addDays(today, -7)]]
      : [['Today', today], ['Tomorrow', addDays(today, 1)], ['Next week', addDays(today, 7)], ['In a month', addDays(today, 30)]];

  const first = new Date(Date.UTC(view.year, view.month - 1, 1)).getUTCDay(); // 0 = Sun
  const lead = (first + 6) % 7; // Monday-first weeks
  const dim = daysInMonth(view.year, view.month);
  const cells: (ISODate | null)[] = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => toISODate(view.year, view.month, i + 1))];
  const shift = (delta: number) => {
    const idx = view.year * 12 + view.month - 1 + delta;
    setView({ year: Math.floor(idx / 12), month: (idx % 12) + 1 });
  };

  return (
    <Sheet title={label} onClose={onClose} footer={optional ? <button className="btn ghost block" onClick={() => onPick('')}>Clear date</button> : undefined}>
      <div className="chips" role="group" aria-label="Quick dates" style={{ flexWrap: 'wrap' }}>
        {quickPicks.map(([l, d]) => (
          <button key={l} className="chip" aria-pressed={d === value} disabled={!allowed(d)} onClick={() => onPick(d)}>
            {l}
          </button>
        ))}
      </div>
      <div className="row between">
        <button className="icon-btn" aria-label={mode === 'days' ? 'Previous month' : 'Previous year'} onClick={() => (mode === 'days' ? shift(-1) : setView({ ...view, year: view.year - 1 }))}>
          <Icon name="chevronLeft" />
        </button>
        <button className="btn ghost" style={{ height: 44 }} aria-label="Choose month and year" onClick={() => setMode(mode === 'days' ? 'months' : 'days')}>
          {mode === 'days' ? `${MONTHS[view.month - 1]} ${view.year}` : view.year} <Icon name="chevronRight" size={14} />
        </button>
        <button className="icon-btn" aria-label={mode === 'days' ? 'Next month' : 'Next year'} onClick={() => (mode === 'days' ? shift(1) : setView({ ...view, year: view.year + 1 }))}>
          <Icon name="chevronRight" />
        </button>
      </div>
      {mode === 'days' ? (
        <div className="cal" role="grid" aria-label={`${MONTHS[view.month - 1]} ${view.year}`}>
          {WEEKDAYS.map((w, i) => (
            <span key={`w${i}`} className="cal-wd" aria-hidden="true">
              {w}
            </span>
          ))}
          {cells.map((d, i) =>
            d === null ? (
              <span key={`e${i}`} />
            ) : (
              <button
                key={d}
                className={`cal-day${d === value ? ' sel' : ''}${d === today ? ' today' : ''}`}
                aria-pressed={d === value}
                aria-label={describeDate(d, today)}
                disabled={!allowed(d)}
                onClick={() => onPick(d)}
              >
                {parts(d).day}
              </button>
            ),
          )}
        </div>
      ) : (
        <div className="cal-months">
          {MONTHS.map((m, i) => (
            <button
              key={m}
              className={`cal-day${view.month === i + 1 ? ' sel' : ''}`}
              onClick={() => {
                setView({ ...view, month: i + 1 });
                setMode('days');
              }}
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
