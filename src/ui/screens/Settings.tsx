import { useRef, useState } from 'react';
import { backupFileName, BackupError, createBackup, parseBackup, transactionsToCsv } from '../../persistence/backup';
import { Icon } from '../components/Icon';
import { useStore, useStoreState } from '../context';

function download(name: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Settings() {
  const store = useStore();
  const { data } = useStoreState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ tone: 'good' | 'warn'; text: string; details?: string[] } | null>(null);
  const counts = `${data.transactions.length} transactions · ${data.recurring.length} recurring · ${data.goals.length} goals`;

  const exportJson = () => {
    const now = new Date().toISOString();
    download(backupFileName(now, 'json'), 'application/json', JSON.stringify(createBackup(data, now), null, 2));
    setStatus({ tone: 'good', text: 'Backup downloaded. Keep it somewhere safe — it contains your financial records.' });
  };
  const exportCsv = () => {
    download(backupFileName(new Date().toISOString(), 'csv'), 'text/csv;charset=utf-8', '﻿' + transactionsToCsv(data));
    setStatus({ tone: 'good', text: 'Transactions exported as CSV (opens in Excel, Numbers or Google Sheets).' });
  };
  const restore = async (file: File) => {
    try {
      const snapshot = parseBackup(await file.text());
      const msg = `Replace everything on this device with "${file.name}"?\n\n${snapshot.transactions.length} transactions, ${snapshot.recurring.length} recurring items and ${snapshot.goals.length} goals will be restored. Current data will be overwritten.`;
      if (!window.confirm(msg)) return;
      await store.replaceAll(snapshot);
      setStatus({ tone: 'good', text: `Restored ${snapshot.transactions.length} transactions from ${file.name}.` });
    } catch (err) {
      setStatus({ tone: 'warn', text: err instanceof Error ? err.message : String(err), details: err instanceof BackupError ? err.problems : undefined });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="screen">
      <header className="screen-head">
        <a className="icon-btn plain" href="#/home" aria-label="Back to home">
          <Icon name="chevronLeft" />
        </a>
        <h1 className="grow">Settings</h1>
      </header>

      <h2 className="section-title">Backup &amp; export</h2>
      <div className="card stack" style={{ gap: 10 }}>
        <button className="btn primary block" onClick={exportJson}>
          <Icon name="download" size={18} /> Back up now (JSON)
        </button>
        <button className="btn ghost block" onClick={exportCsv} disabled={data.transactions.length === 0}>
          <Icon name="download" size={18} /> Export transactions (CSV)
        </button>
        <button className="btn ghost block" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={18} /> Restore from backup…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Choose a Subtone backup file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void restore(f);
          }}
        />
        <span className="muted small num">{counts}</span>
        {status && (
          <div role="status" className="small" style={{ color: status.tone === 'good' ? 'var(--good)' : 'var(--warn)' }}>
            {status.text}
            {status.details && status.details.length > 0 && (
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {status.details.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <h2 className="section-title">Data</h2>
      <div className="card stack" style={{ gap: 10 }}>
        <div className="row between small">
          <span>Currency</span>
          <span className="muted">{data.settings.currency} ({data.settings.locale})</span>
        </div>
        <div className="row between small">
          <span>Storage</span>
          <span className="muted">This device ({store.repositoryKind})</span>
        </div>
        <button
          className="btn ghost block"
          onClick={() => {
            if (data.transactions.length === 0 || window.confirm('Replace your data with sample data? Back up first if you want to keep it.')) void store.loadSample();
          }}
        >
          Load sample data
        </button>
        <button
          className="btn danger block"
          onClick={() => {
            if (window.confirm('Delete all data on this device? This cannot be undone unless you have a backup.')) void store.clearAll();
          }}
        >
          <Icon name="trash" size={18} /> Clear all data
        </button>
      </div>

      <p className="row muted small" style={{ margin: 0, alignItems: 'flex-start' }}>
        <Icon name="lock" size={16} />
        Subtone stores everything in this browser only. There are no accounts, trackers or servers; backups go only where you save them.
      </p>
    </div>
  );
}
