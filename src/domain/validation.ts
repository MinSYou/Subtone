/**
 * Input limits and sanitising for free text. Applied live in the UI (so users see what is kept)
 * and again in the store (so nothing bypasses it, e.g. a restored backup edited by hand).
 */
export const LIMITS = {
  title: 60,
  notes: 280,
  tag: 24,
  tagsPerTransaction: 8,
  name: 40,
} as const;

/** Control characters, zero-width/bidi marks, and markup/escape characters are never allowed. */
// eslint-disable-next-line no-control-regex
const ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤﻿<>{}[\]\\`|^~]/gu;
/** Tags: letters, numbers, hyphen, underscore only. */
const TAG_ILLEGAL = /[^\p{L}\p{N}_-]/gu;
const EM_DASH = /\u2014/g;

export interface Sanitised {
  value: string;
  /** Characters that were removed (deduplicated), for user feedback. */
  removed: string[];
  truncated: boolean;
}

function collectRemoved(input: string, pattern: RegExp): string[] {
  const found = input.match(new RegExp(pattern.source, pattern.flags)) ?? [];
  return [...new Set(found.map((c) => (/\s/.test(c) || c.charCodeAt(0) < 32 ? 'control character' : c)))];
}

/**
 * Single-line text (titles, names): strips illegal characters, turns em dashes into hyphens,
 * collapses whitespace and caps the length. `live` keeps a trailing space so typing feels normal.
 */
export function sanitizeLine(input: string, max: number, live = false): Sanitised {
  const removed = collectRemoved(input, ILLEGAL);
  let v = input.replace(EM_DASH, '-').replace(ILLEGAL, '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ');
  v = live ? v.replace(/^\s+/, '') : v.trim();
  const truncated = [...v].length > max;
  if (truncated) v = [...v].slice(0, max).join('');
  return { value: v, removed, truncated };
}

/** Multi-line text (notes): like sanitizeLine but keeps up to 2 consecutive line breaks. */
export function sanitizeMultiline(input: string, max: number, live = false): Sanitised {
  const removed = collectRemoved(input, ILLEGAL);
  let v = input.replace(EM_DASH, '-').replace(/\r\n?/g, '\n').replace(ILLEGAL, '').replace(/\t/g, ' ').replace(/\n{3,}/g, '\n\n');
  v = live ? v.replace(/^\s+/, '') : v.trim();
  const truncated = [...v].length > max;
  if (truncated) v = [...v].slice(0, max).join('');
  return { value: v, removed, truncated };
}

export function sanitizeTag(input: string): string {
  return [...input.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-').replace(TAG_ILLEGAL, '')].slice(0, LIMITS.tag).join('');
}

/** Parse a comma-separated tag field into clean, unique tags (max 8). */
export function parseTags(input: string): { tags: string[]; dropped: number } {
  const raw = input.split(',').map(sanitizeTag).filter(Boolean);
  const unique = [...new Set(raw)];
  return { tags: unique.slice(0, LIMITS.tagsPerTransaction), dropped: Math.max(0, unique.length - LIMITS.tagsPerTransaction) };
}

/** Live filter for the tag input: allow letters, numbers, - _ , and spaces while typing. */
export function sanitizeTagInput(input: string): Sanitised {
  const pattern = /[^\p{L}\p{N}_,\s#-]/gu;
  const removed = collectRemoved(input, pattern);
  let v = input.replace(pattern, '');
  const max = (LIMITS.tag + 2) * LIMITS.tagsPerTransaction;
  const truncated = v.length > max;
  if (truncated) v = v.slice(0, max);
  return { value: v, removed, truncated };
}
