# Subtone — Smart Analytics

A private, mobile-first spending and decision-support web app. Track expenses and income, see where the month is heading, and check whether a purchase fits **before** you make it. Installable as a PWA; all data stays in your browser.

## Features

- **Home** — net cashflow, budget pace with a clear status (*Under pace / On pace / Spending fast / Over budget*), a daily safe-to-spend figure that reserves upcoming bills, top signals, recent activity.
- **Analytics** — category breakdown (Bar / Donut), 6-month income vs spending (Bar / Line) with a month-end projection, biggest movers, and a signals feed (budget burn, category limits, spend spikes, unusual transactions, upcoming bills, unallocated surplus).
- **Activity** — instant search (title, notes, tags, category, amount), filters (type, fixed vs flexible, categories, date range, tag), edit/delete, and bulk recategorise / tag / delete. **Recurring & bills**: weekly, fortnightly, monthly and yearly items, upcoming renewals, mark-as-paid, pause/resume, monthly-equivalent totals.
- **Plan** — per-category budgets with pacing, **Can I afford it?** for any category, and **savings goal buckets** with animated icons that ring-fence surplus cashflow.
- **Settings** — one-tap JSON backup, CSV export, restore from backup, sample data, clear all.

## Getting started

Requires Node.js 20.19+.

```bash
npm install
npm run dev        # http://localhost:5173 (also on your LAN for phone testing)
npm test           # analytics, persistence and store tests (Vitest)
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build (service worker enabled)
```

Open the app and tap **Load sample data** to explore with ~4 months of realistic records.

### Install on a phone

Deploy `dist/` to any static HTTPS host (or use `npm run preview` on your network), open it on the phone, then:

- **iPhone / iPad (Safari):** Share → *Add to Home Screen*.
- **Android (Chrome):** ⋮ → *Install app* / *Add to Home screen*.

It launches standalone with the Subtone icon and theme colour, and the app shell works offline. The service worker only runs in production builds.

## Privacy

No accounts, analytics, trackers or network calls for your data. Records live in this browser's `localStorage`; backups go only where you save them. Exported backup files are git-ignored.

## Docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — layers, data flow, how insights are computed, extension points.
- [docs/TEST_EVIDENCE.md](docs/TEST_EVIDENCE.md) — test runs and the change log of every flaw found and fixed.
- [src/persistence/firebase/README.md](src/persistence/firebase/README.md) — plugging in Firebase.

Design and analytics concepts were adapted from [Inpenso](https://github.com/VintusS/Inpenso) (MIT), re-implemented for a TypeScript/React web stack.
