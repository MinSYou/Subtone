import '@fontsource-variable/inter';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { systemClock } from './domain/dates';
import { createLocalStorageRepository, createMemoryRepository } from './persistence/localAdapters';
import type { FinanceRepository } from './persistence/repository';
import { FinanceStore } from './state/store';
import { App } from './ui/App';
import { StoreProvider } from './ui/context';
import './ui/styles.css';

/** Pick the persistence adapter. Swap in a Firebase adapter here later (see src/persistence/firebase). */
function chooseRepository(): FinanceRepository {
  try {
    const probe = '__subtone_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return createLocalStorageRepository(window.localStorage);
  } catch {
    // Storage blocked (some private modes): run in memory and let the user export a backup.
    return createMemoryRepository();
  }
}

const store = new FinanceStore(chooseRepository(), systemClock);
void store.init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider store={store}>
      <App />
    </StoreProvider>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env?.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* offline support is optional; the app works without it */
    });
  });
}
