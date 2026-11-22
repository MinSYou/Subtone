/** Random ids for new records. Injected where determinism matters (seed data, tests). */
export type IdFactory = (prefix: string) => string;

export const randomId: IdFactory = (prefix) => {
  const c = globalThis.crypto;
  const body =
    c && typeof c.randomUUID === 'function'
      ? c.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${body}`;
};

export function sequentialIds(): IdFactory {
  const counters = new Map<string, number>();
  return (prefix) => {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return `${prefix}_${String(n).padStart(4, '0')}`;
  };
}
