# Subtone: Smart Analytics

A private, mobile-first personal finance app that helps you decide whether you can afford something before you spend, not just record it afterwards. Track expenses and income, see where the month is heading, and get a daily safe-to-spend figure. Installable as a PWA; all data stays in your browser.

## Features

- **Home**: net cashflow, and **Penny**, a budget-pace mascot whose colour, face and motion show the status at a glance: Under pace, On pace, Spending fast or Over budget. Also an animated pace bar with metric pills, one-row signal chips and recent activity.
- **Analytics**: category breakdown, a 6-month income vs spending trend with a month-end projection, signals, and **Statements**: bank-style monthly and annual reviews with period-over-period comparison, category table, largest expenses and CSV download.
- **Activity**: pinned header with totals, instant search, filters (type, fixed vs flexible, categories, date range, tag), edit, bulk recategorise/tag/delete, and recurring bills and subscriptions (weekly, fortnightly, monthly, yearly) with Mark paid. Deletes and Mark paid can be undone from a toast.
- **Plan**: per-category budgets with pacing, **Can I afford it?** for any category and date, and savings goal buckets with animated icons that ring-fence surplus cashflow.
- **Settings**: language (placeholder), currency, subtle sounds on/off, a swipeable Bar / Pie / Line chart style, one-tap JSON backup, CSV export, restore.
- **Forms**: pinned sheet header and Save button, big-target date picker, rounded dropdowns, character limits with live counters, and illegal-character filtering.

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

- [ARCHITECTURE.md](ARCHITECTURE.md): layers, data flow, how insights are computed, extension points.
- [docs/TEST_EVIDENCE.md](docs/TEST_EVIDENCE.md): test runs and the change log of every flaw found and fixed.
- [src/persistence/firebase/README.md](src/persistence/firebase/README.md): plugging in Firebase.

Design and analytics concepts were adapted from [Inpenso](https://github.com/VintusS/Inpenso) (MIT), re-implemented for a TypeScript/React web stack.
