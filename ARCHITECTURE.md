# Architecture

Subtone is a client-only React + TypeScript app built with Vite. The core rule: **analytics are pure functions over plain data**. They don't touch React, storage, or the system clock, so every number on screen can be reproduced in a unit test.

```
src/
  domain/        Types and primitives: money (integer cents), ISO dates + Clock, categories, ids,
                 validation (text limits + sanitising)
  analytics/     Pure calculation engines (no I/O)
    breakdown.ts     cashflow summary, totals by category, fixed vs flexible
    trends.ts        monthly series, like-for-like comparison windows, category movers
    pacing.ts        budget resolution, month clock, projection, pace status, safe-to-spend
    recurring.ts     cadence maths, upcoming items, pending commitments, monthly equivalents
    signals.ts       rule-based Insight generation (thresholds in SIGNAL_RULES)
    affordability.ts "Can I afford it?" what-if verdicts
    goals.ts         goal progress, surplus allocation (ring-fencing)
    filters.ts       transaction search / filter / grouping
    statement.ts     monthly / annual statements with like-for-like comparison
    index.ts         buildDashboard(snapshot, month, today): one call for everything a screen needs
  persistence/   Storage boundary
    repository.ts    FinanceRepository interface, ChangeSet diff/apply
    localAdapters.ts memory + localStorage adapters
    backup.ts        versioned JSON backup, validation, CSV export
    firebase/        how to add a Firestore adapter (docs only for now)
  seed/          Deterministic sample data generator
  state/         FinanceStore: actions, optimistic updates, ordered persistence, error state
  ui/            React: context/hooks (store, router, toasts), components (Sheet, Select,
                 DateField, PaceMascot, charts), screens, styles, sound.ts (Web Audio)
public/          PWA manifest, service worker, icons
```

## Data flow

```
user action ─▶ FinanceStore.action() ─▶ new FinanceSnapshot (immutable)
                     │                         │
                     │ diffSnapshots()         └─▶ React re-renders (useSyncExternalStore)
                     ▼                                      │
             FinanceRepository.apply(ChangeSet)             ▼
             (localStorage today, Firestore later)   buildDashboard(snapshot, month, today)
                     │                                      │
              error? ─▶ store.error banner + retry          ▼
                                                       screens render numbers
```

- **Snapshot** (`FinanceSnapshot`): transactions, categories, budgets, recurring items, goals, goal contributions, settings.
- **ChangeSet**: per-collection `upserts` / `deletes`. Local adapters apply it to one JSON document; a Firestore adapter maps it to a batched write.
- **Errors are never swallowed.** Failed saves keep the data on screen, show a banner, and `retrySave()` rewrites the full snapshot.

## How the smart analytics work

| Output | Method |
|---|---|
| **Projection** | Spent so far + recurring expenses still due this month (not yet posted) + *flexible* spend ÷ elapsed **calendar** days × days remaining. Fixed costs (rent) are not extrapolated. |
| **Pace status** | `over` if spent > limit; `fast` ("Spending fast") if the projection exceeds the limit; `under` if the projection is < 90% of the limit; otherwise `on-pace`. |
| **Pace marker** | Fixed costs already paid + the rest of the limit spread evenly over the month. The bar and the badge use the same model, so they agree. |
| **Safe-to-spend** | (limit − spent − pending bills) ÷ days left, today included. |
| **Spend spike** | Category spend for day 1..N this month vs day 1..N last month; fires at ≥ +30% and ≥ $50. Needs 2 months of history. |
| **Unusual transaction** | ≥ 3× the category's 90-day median (≥ 5 samples, ≥ $30). |
| **Upcoming bills** | Recurring expense occurrences in the next 7 days (setting). |
| **Unallocated surplus** | Net cashflow − money set aside in goals; nudged in the last 10 days of the month. |
| **Affordability** | Re-runs pacing with the hypothetical purchase: `over-budget` if it breaks the monthly limit; `tight` if it breaks a category limit or leaves < 80% of your current daily rate; otherwise `comfortable`. Works for any category and future dates. |

All thresholds live in `SIGNAL_RULES` and can be overridden per call. That's the hook for user-editable rules later.

## Conventions

- Money is `number` cents (`Cents`); format only at the edge with `formatMoney`. Every figure in the UI uses the `.num` class (`font-variant-numeric: tabular-nums`).
- Dates are `YYYY-MM-DD` strings; "today" comes from a `Clock` (`systemClock` in the app, `fixedClock` in tests).
- The domain holds no UI types (insights carry `kind` + `severity`; the UI picks colours).
- One `CategoryPicker` is used by every flow (add/edit, afford, bulk, recurring, budgets) so category choice stays consistent.
- Charts are small dependency-free SVG components. Donuts are used only for single-period composition.

## Extension points

- **Firebase / sync**: implement `FinanceRepository` (see `src/persistence/firebase/README.md`) and swap it in `src/main.tsx`'s `chooseRepository()`.
- **Imports (bank CSV / OFX)**: parse into `TransactionInput[]` and call `store.addTransaction`. Add a matcher that sets `recurringId` when a row matches a recurring item's amount and date.
- **Forecasting**: `monthlySeries` + `occurrencesBetween` give history and known future cashflow. A forecaster can return extra `MonthPoint`s, which the charts already render as projected.
- **Rules & alerts**: add a rule to `signals.ts` returning `Insight`s. For push alerts, run `generateSignals` from the service worker or a scheduled job and use the `Insight.id` to de-duplicate.
- **Multi-currency**: `Settings.currency/locale` drive formatting; add `currency` per transaction plus a rates table before mixing currencies in sums.

## Input rules

| Field | Limit | Allowed |
|---|---|---|
| Title, recurring name | 60 characters | letters, numbers, spaces, everyday punctuation |
| Goal name | 40 characters | same |
| Notes | 280 characters, max 2 blank lines in a row | same, plus line breaks |
| Tags | 8 per transaction, 24 characters each | letters, numbers, `-`, `_` (saved lower-case) |

Control characters, zero-width and bidi marks, and `< > { } [ ] \ ` | ^ ~` are removed. Em dashes become hyphens. The form strips them live and shows what it removed. `FinanceStore` applies the same rules again on every write, so imports and hand-edited backups can't bypass them.

## UI building blocks

- **Sheet**: portal on `<body>`, bounded flex column (`max-height: 100dvh` minus the top safe area), pinned header and footer, scrolling body. A stack of open sheets makes Escape close only the top one.
- **Select**: listbox dropdown with the same radius, border and shadow as its trigger. Keyboard accessible, and Escape closes only the menu.
- **DateField**: opens a sheet with quick picks, a Monday-first month grid with 44px cells, and a month/year grid.
- **Toasts**: one at a time, with an Undo action. Used instead of confirmation popups for reversible actions. Restore and Clear all still confirm, because they can't be undone.
- **Sounds**: synthesised with Web Audio, no files. Peak gain is 0.05, they're created on the first tap as browsers require, they're off when Settings > Sounds is off, and they use the "ambient" iOS audio session so the silent switch is respected on iOS 17+.
- **Chart style**: one app-wide setting (`bar | pie | line`). Pie is used only for single-period composition and line only for time series; otherwise bars are shown.
