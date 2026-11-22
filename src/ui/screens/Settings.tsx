import { useEffect, useRef, useState } from 'react';
import type { ChartStyle } from '../../domain/types';
import { backupFileName, BackupError, createBackup, parseBackup, transactionsToCsv } from '../../persistence/backup';
import { SAMPLE_PROFILES, type SampleProfile } from '../../seed/sampleData';
import { Icon } from '../components/Icon';
import { Select } from '../components/pickers';
import { useStore, useStoreState } from '../context';
import { play } from '../sound';

const LANGUAGES = [
  { value: 'en-AU', label: 'English (Australia)' },
  { value: 'zh-Hans', label: '简体中文', disabled: true, hint: 'Coming soon' },
  { value: 'ko', label: '한국어', disabled: true, hint: 'Coming soon' },
  { value: 'vi', label: 'Tiếng Việt', disabled: true, hint: 'Coming soon' },
  { value: 'es', label: 'Español', disabled: true, hint: 'Coming soon' },
];

const CURRENCIES = ['AUD', 'NZD', 'USD', 'GBP', 'EUR', 'CAD', 'SGD', 'JPY', 'KRW', 'CNY', 'INR'].map((c) => ({
  value: c,
  label: `${c} · ${new Intl.DisplayNames(['en-AU'], { type: 'currency' }).of(c) ?? c}`,
}));

const STYLES: { value: ChartStyle; label: string; note: string }[] = [
  { value: 'bar', label: 'Bar', note: 'Bars everywhere' },
  { value: 'pie', label: 'Pie', note: 'Pie for category splits, bars for trends' },
  { value: 'line', label: 'Line', note: 'Lines for trends, bars for category splits' },
];

function StylePreview({ style }: { style: ChartStyle }) {
  if (style === 'pie')
    return (
      <svg viewBox="0 0 120 70" aria-hidden="true">
        <circle cx="60" cy="35" r="26" fill="none" stroke="#3346D3" strokeWidth="14" strokeDasharray="70 200" transform="rotate(-90 60 35)" />
        <circle cx="60" cy="35" r="26" fill="none" stroke="#5FB8AE" strokeWidth="14" strokeDasharray="45 200" strokeDashoffset="-72" transform="rotate(-90 60 35)" />
        <circle cx="60" cy="35" r="26" fill="none" stroke="#E58A4B" strokeWidth="14" strokeDasharray="44 200" strokeDashoffset="-119" transform="rotate(-90 60 35)" />
      </svg>
    );
  if (style === 'line')
    return (
      <svg viewBox="0 0 120 70" aria-hidden="true">
        <path d="M8 52L30 40L52 46L74 24L96 30L114 14" fill="none" stroke="#3346D3" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 34L30 30L52 22L74 32L96 18L114 22" fill="none" stroke="#5FB8AE" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 120 70" aria-hidden="true">
      {[18, 30, 22, 40, 28, 46].map((h, i) => (
        <rect key={i} x={10 + i * 18} y={64 - h} width="12" height={h} rx="3" fill={i % 2 ? '#3346D3' : '#5FB8AE'} />
      ))}
    </svg>
  );
}

/** Three-panel swipe (left/right) to pick the app-wide chart style; dots and arrow keys work too. */
function ChartStyleSwiper({ value, onChange }: { value: ChartStyle; onChange: (s: ChartStyle) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const index = STYLES.findIndex((s) => s.value === value);
  const settle = useRef<number>(0);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTo({ left: index * el.clientWidth, behavior: 'instant' as ScrollBehavior });
    // only on mount: afterwards the scroll position drives the value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const goTo = (i: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div
        ref={ref}
        className="style-swiper"
        role="radiogroup"
        aria-label="Chart style"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') goTo(Math.min(STYLES.length - 1, index + 1));
          if (e.key === 'ArrowLeft') goTo(Math.max(0, index - 1));
        }}
        onScroll={(e) => {
          const el = e.currentTarget;
          window.clearTimeout(settle.current);
          settle.current = window.setTimeout(() => {
            const i = Math.round(el.scrollLeft / el.clientWidth);
            const next = STYLES[Math.max(0, Math.min(STYLES.length - 1, i))].value;
            if (next !== value) {
              onChange(next);
              play('tap');
            }
          }, 90);
        }}
      >
        {STYLES.map((s) => (
          <div key={s.value} className="style-card" role="radio" aria-checked={s.value === value} aria-label={`${s.label}: ${s.note}`}>
            <StylePreview style={s.value} />
            <strong>{s.label}</strong>
            <span className="muted small" style={{ textAlign: 'center' }}>
              {s.note}
            </span>
          </div>
        ))}
      </div>
      <div className="dots">
        {STYLES.map((s, i) => (
          <button key={s.value} aria-label={`Show ${s.label}`} aria-pressed={s.value === value} onClick={() => goTo(i)}>
            <span />
          </button>
        ))}
      </div>
    </div>
  );
}

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
  const [profile, setProfile] = useState<SampleProfile>('student');
  const [status, setStatus] = useState<{ tone: 'good' | 'warn'; text: string; details?: string[] } | null>(null);
  const counts = `${data.transactions.length} transactions · ${data.recurring.length} recurring · ${data.goals.length} goals`;

  const exportJson = () => {
    const now = new Date().toISOString();
    download(backupFileName(now, 'json'), 'application/json', JSON.stringify(createBackup(data, now), null, 2));
    setStatus({ tone: 'good', text: 'Backup downloaded. Keep it somewhere safe. It contains your financial records.' });
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

      <h2 className="section-title">Preferences</h2>
      <div className="card stack" style={{ gap: 6 }}>
        <div className="setting-row">
          <span className="row"><Icon name="globe" size={18} /> Language</span>
          <div className="field">
            <Select label="Language" value={data.settings.language} onChange={(language) => store.updateSettings({ language })} options={LANGUAGES} />
          </div>
        </div>
        <div className="setting-row">
          <span className="row">💱 Currency</span>
          <div className="field">
            <Select label="Currency" value={data.settings.currency} onChange={(currency) => store.updateSettings({ currency })} options={CURRENCIES} />
          </div>
        </div>
        <span className="muted small">Changes how amounts are shown. Amounts are not converted.</span>
        <div className="setting-row">
          <span className="row"><Icon name="volume" size={18} /> Sounds</span>
          <button
            className="switch"
            role="switch"
            aria-checked={data.settings.sounds}
            aria-label="Sounds"
            onClick={() => {
              store.updateSettings({ sounds: !data.settings.sounds });
              if (!data.settings.sounds) setTimeout(() => play('tap'), 0);
            }}
          />
        </div>
      </div>

      <h2 className="section-title">Chart style</h2>
      <div className="card" style={{ padding: 8 }}>
        <ChartStyleSwiper value={data.settings.chartStyle} onChange={(chartStyle) => store.updateSettings({ chartStyle })} />
      </div>

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
          <span>Storage</span>
          <span className="muted">This device ({store.repositoryKind})</span>
        </div>
        <div className="setting-row">
          <span>Sample data</span>
          <div className="field">
            <Select label="Sample profile" value={profile} onChange={setProfile} options={SAMPLE_PROFILES.map((p) => ({ value: p.id, label: `${p.emoji} ${p.label}` }))} />
          </div>
        </div>
        <span className="muted small">{SAMPLE_PROFILES.find((p) => p.id === profile)?.blurb}</span>
        <button
          className="btn ghost block"
          onClick={() => {
            if (data.transactions.length === 0 || window.confirm('Replace your data with sample data? Back up first if you want to keep it.')) {
              void store.loadSample(profile).then(() => {
                play('success');
                setStatus({ tone: 'good', text: `Loaded the ${SAMPLE_PROFILES.find((p) => p.id === profile)?.label.toLowerCase()} sample.` });
              });
            }
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
