import { useEffect, useState } from 'react';
import { Icon } from './components/Icon';
import { MonthProvider, routeHref, ToastProvider, useRoute, useStore, useStoreState, type Tab } from './context';
import { play, setSoundsEnabled } from './sound';
import { Activity } from './screens/Activity';
import { Analytics } from './screens/Analytics';
import { Home } from './screens/Home';
import { Plan } from './screens/Plan';
import { Settings } from './screens/Settings';
import { TransactionSheet } from './screens/TransactionSheet';

const NAV: { tab: Tab; label: string; icon: string }[] = [
  { tab: 'home', label: 'Home', icon: 'home' },
  { tab: 'analytics', label: 'Analytics', icon: 'chart' },
  { tab: 'activity', label: 'Activity', icon: 'list' },
  { tab: 'plan', label: 'Plan', icon: 'target' },
];

export function App() {
  const { status, error, unsaved, data } = useStoreState();
  useEffect(() => setSoundsEnabled(data.settings.sounds), [data.settings.sounds]);
  const store = useStore();
  const [route, navigate] = useRoute();
  const [sheet, setSheet] = useState<{ editId: string | null } | null>(null);
  const openEdit = (id: string) => {
    play('open');
    setSheet({ editId: id });
  };
  const openNew = () => {
    play('open');
    setSheet({ editId: null });
  };

  // Deep link from a signal ("activity/transactions/<id>") opens that transaction.
  const deepLinkId = route.tab === 'activity' && route.sub === 'transactions' ? route.id : undefined;
  useEffect(() => {
    if (deepLinkId && store.getState().data.transactions.some((t) => t.id === deepLinkId)) {
      setSheet({ editId: deepLinkId });
      navigate('activity/transactions');
    }
  }, [deepLinkId, store, navigate]);

  if (status === 'loading') {
    return (
      <div className="app" aria-busy="true">
        <div className="screen">
          <div className="card stack">
            <div style={{ width: '45%', height: 14, borderRadius: 7, background: '#ececE7' }} />
            <div style={{ width: '70%', height: 30, borderRadius: 8, background: '#ececE7' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <MonthProvider>
      <ToastProvider>
      <div className="app">
        {error && (
          <div className="banner" role="alert" style={{ margin: '10px 14px 0' }}>
            <Icon name="alert" size={18} />
            <span className="grow">
              {error}
              {unsaved ? ' Your latest changes are still on screen.' : ''}
            </span>
            {unsaved && (
              <button className="btn dark" style={{ height: 34 }} onClick={() => void store.retrySave()}>
                Try again
              </button>
            )}
          </div>
        )}
        <main>
          {route.tab === 'home' && <Home navigate={navigate} onAdd={openNew} onEdit={openEdit} />}
          {route.tab === 'analytics' && <Analytics sub={route.sub} navigate={navigate} />}
          {route.tab === 'activity' && <Activity sub={route.sub} navigate={navigate} onEdit={openEdit} />}
          {route.tab === 'plan' && <Plan sub={route.sub} navigate={navigate} />}
          {route.tab === 'settings' && <Settings />}
        </main>
        <nav className="nav" aria-label="Primary">
          <div className="nav-inner">
            {NAV.slice(0, 2).map((n) => (
              <NavLink key={n.tab} {...n} active={route.tab === n.tab} />
            ))}
            <button className="fab" aria-label="Add transaction" onClick={openNew}>
              <Icon name="plus" size={24} strokeWidth={2.4} />
            </button>
            {NAV.slice(2).map((n) => (
              <NavLink key={n.tab} {...n} active={route.tab === n.tab} />
            ))}
          </div>
        </nav>
        {sheet && <TransactionSheet editId={sheet.editId} onClose={() => setSheet(null)} />}
      </div>
      </ToastProvider>
    </MonthProvider>
  );
}

function NavLink({ tab, label, icon, active }: { tab: Tab; label: string; icon: string; active: boolean }) {
  return (
    <a href={routeHref(tab)} aria-current={active ? 'page' : undefined} onClick={() => !active && play('tap')}>
      <Icon name={icon} size={22} />
      {label}
    </a>
  );
}
