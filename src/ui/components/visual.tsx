import { useEffect, useRef, useState } from 'react';
import type { PaceStatus } from '../../analytics';
import type { Insight } from '../../domain/types';

/** Expressive glyphs for glanceable UI. Text labels always accompany them for screen readers. */
export const CATEGORY_EMOJI: Record<string, string> = {
  rent: '🏠',
  utilities: '💡',
  subscriptions: '🔁',
  insurance: '🛡️',
  groceries: '🛒',
  'eating-out': '🍔',
  transport: '🚗',
  shopping: '🛍️',
  entertainment: '🎟️',
  health: '💊',
  education: '📚',
  'other-expense': '🧾',
  salary: '💼',
  freelance: '✍️',
  refund: '↩️',
  gift: '🎁',
  interest: '📈',
  'other-income': '💵',
};

const KIND_EMOJI: Record<Insight['kind'], string> = {
  'budget-burn': '🔥',
  'category-limit': '🚦',
  'spend-spike': '📈',
  'unusual-transaction': '👀',
  'upcoming-recurring': '📅',
  'unallocated-surplus': '💰',
};

export function insightEmoji(i: Insight): string {
  if (i.kind === 'spend-spike' || i.kind === 'category-limit' || i.kind === 'unusual-transaction') {
    return (i.categoryId && CATEGORY_EMOJI[i.categoryId]) || KIND_EMOJI[i.kind];
  }
  return KIND_EMOJI[i.kind];
}

export const PACE_EMOJI: Record<PaceStatus, string> = {
  under: '✨',
  'on-pace': '🟢',
  fast: '⚡',
  over: '🔥',
  'no-budget': '➕',
};

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Animate a number from its previous value to `target` (≈450ms ease-out). Respects reduced motion. */
export function useCountUp(target: number, duration = 450): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (start === target || reducedMotion()) {
      from.current = target;
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setValue(Math.round(start + (target - start) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target, duration]);
  return value;
}
