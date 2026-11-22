import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { buildDashboard } from '../analytics';
import { monthKey, type MonthKey } from '../domain/dates';
import { formatMoney, type Cents } from '../domain/money';
import type { FinanceStore, StoreState } from '../state/store';

const StoreContext = createContext<FinanceStore | null>(null);

export function StoreProvider({ store, children }: { store: FinanceStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): FinanceStore {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used inside <StoreProvider>');
  return s;
}

export function useStoreState(): StoreState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export function useToday() {
  return useStore().clock.today();
}

export function useDashboard(month: MonthKey) {
  const { data } = useStoreState();
  const today = useToday();
  return useMemo(() => buildDashboard(data, month, today), [data, month, today]);
}

export function useMoney() {
  const { data } = useStoreState();
  const { currency, locale } = data.settings;
  return useCallback(
    (cents: Cents, opts: { whole?: boolean; signed?: boolean } = {}) => formatMoney(cents, { currency, locale, ...opts }),
    [currency, locale],
  );
}

// ---- hash routing ------------------------------------------------------------------

export type Tab = 'home' | 'analytics' | 'activity' | 'plan' | 'settings';
export interface Route {
  tab: Tab;
  sub: string;
  /** Optional entity id, e.g. a transaction to open. */
  id?: string;
}

const DEFAULT_SUB: Record<Tab, string> = { home: '', analytics: 'breakdown', activity: 'transactions', plan: 'budgets', settings: '' };
const TABS = Object.keys(DEFAULT_SUB) as Tab[];

export function parseRoute(hash: string): Route {
  const [tabRaw, sub, id] = hash.replace(/^#\/?/, '').split('/');
  const tab = (TABS as string[]).includes(tabRaw) ? (tabRaw as Tab) : 'home';
  return { tab, sub: sub || DEFAULT_SUB[tab], id: id || undefined };
}

export function routeHref(route: string): string {
  return `#/${route}`;
}

export function useRoute(): [Route, (to: string) => void] {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const navigate = useCallback((to: string) => {
    window.location.hash = `/${to}`;
  }, []);
  return [parseRoute(hash), navigate];
}

/** Month being viewed, shared by Home / Analytics / Plan. */
const MonthContext = createContext<[MonthKey, (m: MonthKey) => void] | null>(null);

export function MonthProvider({ children }: { children: ReactNode }) {
  const today = useToday();
  const state = useState<MonthKey>(monthKey(today));
  return <MonthContext.Provider value={state}>{children}</MonthContext.Provider>;
}

export function useMonth() {
  const ctx = useContext(MonthContext);
  if (!ctx) throw new Error('useMonth must be used inside <MonthProvider>');
  return ctx;
}
