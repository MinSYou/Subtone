import { describe, expect, it } from 'vitest';
import { LIMITS, parseTags, sanitizeLine, sanitizeMultiline, sanitizeTag, sanitizeTagInput } from './validation';

describe('text sanitising', () => {
  it('strips markup, control and invisible characters but keeps normal punctuation and accents', () => {
    const r = sanitizeLine('<b>Café</b> & co. {x} `rm` ​hi\u0007 (50%)', LIMITS.title);
    expect(r.value).toBe('bCafé/b & co. x rm hi (50%)');
    expect(r.removed).toEqual(expect.arrayContaining(['<', '>', '{', '}', '`']));
  });

  it('replaces em dashes with hyphens and collapses whitespace', () => {
    expect(sanitizeLine('Dinner \u2014   Chat  Thai', 60).value).toBe('Dinner - Chat Thai');
  });

  it('caps length by characters, not UTF-16 units', () => {
    const r = sanitizeLine('🍜'.repeat(70), LIMITS.title);
    expect([...r.value]).toHaveLength(LIMITS.title);
    expect(r.truncated).toBe(true);
  });

  it('keeps a trailing space while typing but trims on save', () => {
    expect(sanitizeLine('Coffee ', 60, true).value).toBe('Coffee ');
    expect(sanitizeLine('  Coffee  ', 60).value).toBe('Coffee');
  });

  it('keeps short line breaks in notes', () => {
    expect(sanitizeMultiline('line 1\r\n\r\n\r\n\r\nline 2', LIMITS.notes).value).toBe('line 1\n\nline 2');
    expect([...sanitizeMultiline('x'.repeat(400), LIMITS.notes).value]).toHaveLength(280);
  });

  it('normalises tags and caps their number', () => {
    expect(sanitizeTag(' #Date Night! ')).toBe('date-night');
    const { tags, dropped } = parseTags('a,b,c,d,e,f,g,h,i,j,A');
    expect(tags).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(dropped).toBe(2);
    expect(sanitizeTagInput('work, <shared>').value).toBe('work, shared');
  });
});
