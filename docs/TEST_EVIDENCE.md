# Test evidence & change log

Every flaw found while testing, with where it was, what failed (actual output), and the change made. Code diffs for UI fixes are in commit `e72d44b` (`git show e72d44b`).

## How this was tested

| Check | Tool | Result |
|---|---|---|
| Unit tests: domain, analytics, filters, persistence, store, seed (59 tests, 148 assertions) | Offline CI environment: `bun test` with an alias mapping `vitest` → `bun:test`. In the repo: `npm test` runs Vitest. | **59 pass, 0 fail** |
| Strict typecheck of non-UI code (`domain`, `analytics`, `persistence`, `seed`) | `tsc --noEmit`, project `tsconfig.json` settings | **0 errors** |
| Bundle the full app | `bun build src/main.tsx` | 41 modules, no errors |
| Visual & console check of every screen at 390×844 @2x | Playwright (Chromium, mobile emulation): load sample data, open all 10 routes, toggle charts, open the add sheet, bulk-select | **0 console errors / page errors** |

**Not verified in the offline test environment.** It had no npm registry access, so these were not run there. Run them locally after `npm install`:

- `npm run build`: full `tsc` including the React UI, which needs `@types/react`, plus the Vite production build
- the service worker and installability (Lighthouse PWA check)
- Vitest itself (tests were run by Bun's Vitest-compatible runner)
- the `@fontsource-variable/inter` import (stubbed locally; the screenshots used the system Inter font, the same typeface)

---

## Findings

### 1. Test expectation wrong: spike percentage
- **File:** `src/analytics/analytics.test.ts`, test *signals › raises budget burn, spike, unusual and upcoming signals*
- **Test output:**
  ```
  error: expect(received).toBe(expected)
  Expected: "Eating Out is up 106% vs last month"
  Received: "Eating Out is up 65% vs last month"
  (fail) signals > raises budget burn, spike, unusual and upcoming signals, highest priority first
  ```
- **Cause:** the hand-calculated expectation was wrong. The fixture has $412 (1–22 Nov) vs 5 × $50 = $250 (1–22 Oct), which is +64.8%. The engine was right.
- **Change:**
  ```diff
  - expect(spike?.title).toBe('Eating Out is up 106% vs last month');
  + // $412 (1–22 Nov) vs 5 × $50 = $250 (1–22 Oct) → +64.8%
  + expect(spike?.title).toBe('Eating Out is up 65% vs last month');
  ```

### 2. Test expectation wrong: seed income for the current month
- **File:** `src/seed/seed.test.ts`, *exercises every analytics feature on the dashboard*
- **Test output:**
  ```
  error: expect(received).toBe(expected)
  Expected: 520000
  Received: 260000
  ```
- **Cause:** the fortnightly salary is anchored 6 Jul, so it lands on 9 Nov and 23 Nov. On 22 Nov only one has been paid. The cadence maths was correct; the assumption of two November paydays was not.
- **Change:**
  ```diff
  - expect(d.summary.incomeCents).toBe(5200_00);
  + // Fortnightly salary anchored 6 Jul lands 9 Nov and 23 Nov; only the first has happened by the 22nd.
  + expect(d.summary.incomeCents).toBe(2600_00);
  ```

### 3. Type error in change-set application
- **File:** `src/persistence/repository.ts:78`, `applyChanges()`
- **Typecheck output:**
  ```
  src/persistence/repository.ts(78,6): error TS2352: Conversion of type 'FinanceSnapshot' to type
  'Record<string, unknown>' may be a mistake ... Index signature for type 'string' is missing
  ```
- **Change:**
  ```diff
  - (next as Record<string, unknown>)[key] = [...map.values()];
  + (next as unknown as Record<string, unknown>)[key] = [...map.values()];
  ```
  Behaviour is unchanged. The test *change sets › diffs and re-applies to the same snapshot* covers it.

### 4. Pace bar contradicted its badge ("Under pace" with the bar past the marker)
- **Files:** `src/analytics/pacing.ts` (`pace()`, new `PaceResult.idealPct`, lines 66–72 and 120–135); `src/ui/components/common.tsx` (`PaceBar`); `Home.tsx` and `Plan.tsx` call sites
- **Found in:** phone screenshot of Home and Plan › Budgets with sample data. *All spending* showed 76% spent, with the marker at 73% (day 22/30), but the badge read **Under pace**.
- **Cause:** the badge uses the projection, which correctly doesn't extrapolate rent paid on the 1st. The marker used plain calendar progress, which assumes even spending. Two different models showed side by side.
- **Change:** the marker now shows *fixed costs already paid + the rest of the limit spread evenly*, so both use the same model.
  ```diff
  + const idealPct = limit === null || !clock.isCurrent ? null
  +   : percent(fixed + Math.max(0, limit - fixed - committed) * (clock.daysElapsed / clock.daysInMonth), limit);
  ```
  ```diff
  - export function PaceBar({ pace, elapsedPct }: { pace: PaceResult; elapsedPct: number | null }) {
  + export function PaceBar({ pace }: { pace: PaceResult }) {
  +   const marker = pace.idealPct;
  - {elapsedPct !== null && ... <div className="pace" style={{ left: `${elapsedPct}%` }} />}
  + {marker !== null && ... <div className="pace" style={{ left: `${marker}%` }} title="Where spending should be today" />}
  ```
- **New test:** `pacing › projects fixed costs once…` now asserts `idealPct ≈ 83.69` and `spentPct > idealPct` for a "Spending fast" month.
- **After:** the re-run screenshot shows *All spending* 76% with the marker at about 85%, badge *Under pace*. Eating Out is 82% vs a marker at 73%, badge *Spending fast*. The bars and badges now agree.

### 5. Budget label punched a white box through chart bars
- **File:** `src/ui/components/charts.tsx`, `BudgetLine`
- **Found in:** Trends screenshot. The "Budget $4,500" label's white background rectangle cut a notch out of the October income bar.
- **Change:**
  ```diff
  - <rect x={W - 96} y={y - 16} width={96} height={14} fill="#fff" />
  - <text x={W} y={y - 5} textAnchor="end" ...>
  + <text x={2} y={y - 5} textAnchor="start" ... stroke="#fff" strokeWidth={3} paintOrder="stroke">
  ```

### 6. Charts plotted "no data" months as $0
- **Files:** `src/analytics/trends.ts` (new `trimLeadingEmpty`, line 109); `src/ui/screens/Analytics.tsx` (`Trends`)
- **Found in:** Line view screenshot. With 4 months of history, the 6-month series started in June with 0/0, so both lines dropped to $0, which reads as a real zero-spend month.
- **Change:**
  ```diff
  - const projected = clock.isCurrent ? { index: d.series.length - 1, ... } : null;
  + const series = trimLeadingEmpty(d.series);
  + const projected = clock.isCurrent ? { index: series.length - 1, ... } : null;
  ```
- **New test:** `trends › anchors the series…` asserts trimming and the all-empty case.

### 7. Spike action read "Set a Eating Out limit" when a limit already existed
- **File:** `src/analytics/signals.ts`, spend-spike block
- **Found in:** Home screenshot. The grammar was wrong, and the suggested action was wrong because Eating Out already had a $450 limit.
- **Change:**
  ```diff
  - action: { label: `Set a ${m.category.name} limit`, ... }
  + label: pacing.categories.some((c) => c.categoryId === m.category.id)
  +   ? `Review ${m.category.name} limit` : `Set a limit for ${m.category.name}`,
  ```

### 8. Bulk "Select" control was hidden off-screen
- **File:** `src/ui/screens/Activity.tsx`, `Transactions`
- **Found in:** Activity screenshot. "Select" was the last chip in a horizontally scrolling row and was clipped at 390 px ("Selec…").
- **Change:** moved it next to the result count as a persistent link button. The Playwright bulk flow (search "uber" → Select → Select all shown → bulk bar) passes against the new location.

### 9. Pre-spend impact hint was below the fold
- **File:** `src/ui/screens/TransactionSheet.tsx`
- **Found in:** Add sheet screenshot. The "after this, safe-to-spend drops to…" hint, which is the decision aid, sat under Notes and was only visible after scrolling.
- **Change:** the `{impact && …}` block now renders directly after the `CategoryPicker`.

### 10. Can I afford it? amount had no currency
- **File:** `src/ui/screens/Plan.tsx`, `Afford`
- **Change:**
  ```diff
  - <span className="lbl">Planned purchase</span>
  + <span className="lbl">Planned purchase ({data.settings.currency})</span>
  ```

---

## Inpenso issues deliberately not carried over

| Inpenso (Swift) | Risk | Subtone |
|---|---|---|
| `price: Double` | rounding drift in sums | integer cents (`domain.test.ts` shows `0.1 × 10 ≠ 1` vs cents = 100) |
| `averageDailySpend` over days *with* spending, × days in month | inflates projections; rent counted as daily spend | flexible spend ÷ calendar days elapsed, fixed costs added once (`pacing.test`) |
| `Date()` inside the view model | results depend on the day tests run | injected `Clock` |
| `catch { // Error handling without print }` | silent data loss | `RepositoryError` → banner + retry (`store.test`) |
| Trends always end at today | wrong chart for past months | `monthlySeries(…, endMonth)` (`trends.test`) |

---

# Round 2: UI de-clutter (branch `feat/ui-declutter`)

Measured with Playwright at 390×844 @2x (Chromium, mobile emulation), sample data loaded, on the build before and after this round. Raw metrics are the "before" and "after" JSON below. Unit tests: **59 pass, 0 fail (151 assertions)**. Core `tsc`: **0 errors**. Console/page errors across all routes: **0**.

| Check | Before | After |
|---|---|---|
| Bottom bar height (`.nav`, incl. 1px border) | 57px | **67px** (66px bar + border) + `env(safe-area-inset-bottom)` |
| `+` button size | 46×46 | **44×44** |
| `+` button clearance inside bar (top / bottom) | **1px** / 10px (it had `margin-top: -10px`) | **12px / 11px** |
| Visible text on Home (`.screen` `innerText`, whitespace-collapsed) | 638 chars | **366 chars (−43%)** |
| Sheet backdrop parent | `.app` (inside page tree) | **`<body>` via portal** |
| Sheet backdrop colour | `rgba(23,24,28,0.45)` | `rgba(23,24,28,0.58)` + 2px blur |
| Element at the header point (195, 40) with sheet open | `.backdrop` | `.backdrop` |

### R2-1. `+` button nearly overflowed the bar
- **File:** `src/ui/styles.css`, `.nav-inner`, `.nav .fab`, `--nav-h`
- **Finding:** FAB top at y=788 vs bar top at y=787, so 1px clearance, caused by `margin-top: -10px` on a 56px bar.
- **Change:**
  ```diff
  - --nav-h: 56px;
  + --nav-h: 66px;
  - .nav-inner { … padding: 0 4px; }
  + .nav-inner { … padding: 8px 4px; box-sizing: border-box; }
  - .nav .fab { width: 46px; height: 46px; border-radius: 23px; … margin-top: -10px; }
  + .nav .fab { width: 44px; height: 44px; border-radius: 22px; … transition: transform .12s }
  + .nav .fab:active { transform: scale(.92); }
  ```

### R2-2. Sheet backdrop lived inside the page tree and dimmed weakly
- **File:** `src/ui/components/common.tsx` (`Sheet`), `src/ui/styles.css` (`.backdrop`)
- **Finding:** Chromium did cover the full viewport, but the backdrop was a child of `.app`. Any future transform, filter or `will-change` on an ancestor (for example a slide-in screen transition) would turn `position: fixed` into "fixed to that ancestor", so the header would show through undimmed. At 45% opacity the header text (`< November 2026 >`) stayed crisp (before screenshot `sheet.png`).
- **Change:** render through `createPortal(…, document.body)`. Make `#root` `inert` + `aria-hidden` while open. Lock scroll on `html` and `body`. Use explicit `top/right/bottom/left: 0` plus `inset: 0` and `min-height: 100dvh`, and raise `z-index` to 1000, with 58% dim and a 2px blur.
  ```diff
  - return (<div className="backdrop" …>…</div>);
  + return createPortal(<div className="backdrop" …>…</div>, document.body);
  + root?.setAttribute('inert', ''); root?.setAttribute('aria-hidden', 'true');
  ```
- **Related constraint:** the new screen-enter animation is **opacity-only** on purpose, so it can never create a containing block for fixed children (sheet, bulk bar).

### R2-3. Text-heavy Home
- **Files:** `src/ui/screens/Home.tsx`; `src/ui/components/visual.tsx` (new: emoji maps, `useCountUp`); `src/domain/types.ts` (`Insight.chip`, `Insight.categoryId`); `src/analytics/signals.ts`
- **Before → after:**
  - `"$3,401 of $4,500 (76%)" · "Day 22 of 30" · "$118/day safe to spend for 9 days ($34 of bills reserved)"` → pills `$118/day left` · `⏳ 9d left` · `$3,401 / $4,500`. The full sentence stays available as the pill's `title` and the card's `aria-label`.
  - Signal cards (kind + title + sentence + link, about 4 lines each) → one-row chips: emoji, subject, bold metric, chevron (`🛍️ Shopping +261%`). The full text stays in Analytics → Signals.
  - Pace badge gets an animated emoji: ✨ under, 🟢 on pace, ⚡ spending fast (pulse), 🔥 over (wiggle, then pulse).
  - Net cashflow counts up on change (`useCountUp`, 450ms, off under reduced motion).
- **Test added:** `signals › raises…` asserts `chip = { label: 'Eating Out', metric: '+65%' }`, `categoryId = 'eating-out'`, and that every insight has a non-empty chip.

### R2-4. Duplicate Home chips for one category
- **Found in:** first after-screenshot. Eating Out appeared twice, once from the spike and once from the category limit (`→ $505`, which was also unclear).
- **Change:** Home de-dupes chips by `categoryId`, keeping the highest priority. The category-limit chip metric is now `82% used` or `+$X over`.

### R2-5. Emoji that don't render everywhere
- **Found in:** first after-screenshot. 🍽️ (U+1F37D + VS16) drew as a faint text glyph, and 🫙 (Unicode 14) is missing on older Android.
- **Change:** 🍽️ → 🍔, 🫙 → 🐷 (both Unicode 6).

### R2-6. Micro-animations (CSS only)
- Pace and category bars grow on mount (`bar-grow`) and animate width on update; the pace marker fades in and slides.
- Goal cards have an animated progress bar. The jar re-mounts and pops (`celebrate`) when a contribution changes the saved amount.
- Tactile `:active` scale on buttons, chips, segments, category tiles and the FAB.
- All motion is disabled by the existing `prefers-reduced-motion` rule.
- **Decision:** CSS keyframes instead of Framer Motion, which avoids a ~40 KB dependency for effects CSS already covers.

### Still not verified here
These are the same as round 1, plus one new item:
- `npm run build` with `@types/react`
- Vitest itself
- the real `@fontsource-variable/inter`
- (new) on-device iOS PWA safe-area rendering

---

# Round 3: forms, Activity, statements, settings, devices (branch `feat/ui-round3`)

**Results:** 72 unit tests pass, 0 fail (197 assertions), up from 59. Core `tsc`: 0 errors. Em dashes in the repo (a search for U+2014, excluding `node_modules`/`.git`): **0** (29 before). Console and page errors across all screens on 7 devices: **0**.

## Device matrix (Playwright, Chromium device emulation, sample data)

Per device the script loads all 11 routes and checks:
- horizontal overflow
- bottom bar and `+` button size and containment
- whether Save and the last field (Notes) are visible on first open, for Expense and Income
- whether the edit-sheet header moves after scrolling its body to the end with 12 lines of notes
- whether the Activity header is pinned after a 1500px scroll
- visible interactive elements smaller than 32px on either side

| Device | Overflow | Bar / `+` | Expense: fits / Save | Income: fits | Edit header moved | Activity pinned | Targets < 32px |
|---|---|---|---|---|---|---|---|
| iPhone SE 375×667 | none | 67 / 44, inside | yes / yes | yes | 0px | yes | 0 |
| iPhone 15 393×852 | none | 67 / 44, inside | yes / yes | yes | 0px | yes | 0 |
| iPhone 15 Pro Max 430×932 | none | 67 / 44, inside | yes / yes | yes | 0px | yes | 0 |
| Galaxy S23 360×780 | none | 67 / 44, inside | yes / yes | yes | 0px | yes | 0 |
| Galaxy Z Fold (folded) 344×882 | none | 67 / 44, inside | yes / yes | yes | 0px | yes | 0 |
| iPad mini 768×1024 | none | 67 / 44, inside | yes / yes | yes | 0px | yes | 0 |
| iPad Pro 1366×1024 | none | 67 / 44, inside | yes / yes | yes | 0px | yes | 0 |

This is browser emulation of viewport, pixel ratio and touch; it isn't real Safari or Samsung Internet. Safe-area insets are zero in emulation, so the `env(safe-area-inset-*)` paths still need checking on a real notched phone.

## Interaction checks (iPhone 15 viewport)

`{"menuClosedByEsc":true,"dateLabel":"Date: Yesterday","title":"bLunch/b x","note":"Removed < > { }","before":257,"afterPaid":258,"afterUndo":257,"styleAfterSwipe":"line","errs":[]}`

## Findings and fixes

### R3-1. Save button below the fold on Expense (reported)
- **Before (measured on the round-2 build):**

  | Device | Expense Save bottom / viewport | Income |
  |---|---|---|
  | iPhone SE | 857 / 667, hidden | 803 / 667, hidden |
  | iPhone 15 | 872 / 852, hidden | 836 / 852, visible |
  | Galaxy S23 | 866 / 780, hidden | 812 / 780, hidden |

- **Cause:** the sheet was a single scrolling column, so Save was the last item. The 12 expense categories made 3 rows of 58px tiles.
- **Change:**
  - `Sheet` got a pinned `footer` slot.
  - `CategoryPicker` got a `compact` mode with 46px tiles (42px on short screens).
  - Tags and Notes sit side by side on screens under 720px tall.
  - The amount row goes inline on short screens.
  - The first test still showed iPhone SE 100px over (`bodyScroll 632 / bodyClient 532`); the short-screen rules fixed it.
- **After:** the matrix above shows Save and every field visible on open on all 7 devices.

### R3-2. "Edit transaction" header scrolled with the content (reported)
- **Before:** after scrolling 400px the header top was at **−133px** (iPhone SE) and **−20px** (Galaxy S23), off screen.
- **Change:** the `.sheet` is a bounded flex column: `.sheet-head` (pinned), `.sheet-body` (`overflow-y: auto`), `.sheet-foot` (pinned). Max height is `100dvh` minus the top safe area.
- **After:** the header moves **0px** when the body scrolls to the end, and the footer stays visible.

### R3-3. Sheet stole focus on parent re-renders (found in code review)
- **File:** `src/ui/components/common.tsx`, `Sheet`
- **Cause:** `useEffect(..., [onClose])`. Callers pass inline arrows, so any parent render re-ran the effect, which re-focused the first focusable element (the Close button) and re-applied scroll lock.
- **Change:** keep `onClose` in a ref and run the effect once per open.
  ```diff
  - }, [onClose]);
  + const closeRef = useRef(onClose); closeRef.current = onClose;
  + }, []);
  ```

### R3-4. Escape on an open dropdown closed the whole form (found by the interaction test)
- **Test output:** `locator.click: Timeout 30000ms exceeded. waiting for getByRole('button', { name: /^Date:/ })`. The New transaction sheet had closed.
- **Cause:** the sheet's `window` keydown listener also received Escape.
- **Change:** `Select` registers a capture-phase `window` listener that calls `stopImmediatePropagation()` and `preventDefault()`. `Sheet` ignores `defaultPrevented` events and only the top sheet in the stack reacts.
- **After:** `menuClosedByEsc: true`, and the sheet stays open.

### R3-5. Native dropdowns looked inconsistent (reported)
- **Change:** a new `Select` listbox replaces every `<select>` (Repeats, recurring cadence, tag filter, language, currency, statement period). The trigger and menu share a 12–14px radius, the same border and an elevated shadow. Options are 44px tall. It supports arrow keys, Enter and Escape.

### R3-6. Small date picker (reported)
- **Change:** a new `DateField` replaces every `<input type="date">` (5 places). It opens a sheet with quick picks (Today, Yesterday, 2 days ago, Last week, or future equivalents), a Monday-first grid with 44px day cells, and a month/year view. `min`, `max` and Clear are supported.

### R3-7. Title placeholders
- 5 per type (expense: `e.g. Dinner - Chat Thai`, `e.g. Woolworths groceries`, `e.g. Opal / train fare`, `e.g. Chemist Warehouse`, `e.g. Coffee with Sam`), picked at random once per open, with hyphens instead of em dashes.

### R3-8. Character limits and illegal characters
- **New:** `src/domain/validation.ts`, used live in forms and again in `FinanceStore` writes.
- **Tests:** 6 in `validation.test.ts`, plus a store test that writes `<script>` + 100 × `x` and checks a 60-character title starting `script` and tags `['a-b','x']`.
- **UI:** live counters (`0/60`, `0/8`, `0/280`) turn orange near the limit, with a "Removed < > { }" note when something is stripped.

### R3-9. Em dashes
- 29 occurrences in 15 files were replaced: UI copy, signal text, manifest and title, comments, tests and README. The sanitiser converts any typed em dash to a hyphen. The source holds `U+2014` escapes, so the repo grep reads 0.
- **Note:** commit history was rewritten when this round was published, so commit messages are also free of em dashes.

### R3-10. Activity header (reported)
- **Change:** a `.sticky-top` block holds the title, tabs and a live summary (count, money in, money out, Select). The Recurring tab shows monthly recurring, subscriptions and the next 30 days.

### R3-11. No undo after Mark paid (reported)
- **Change:** Mark paid shows a toast: "Netflix marked paid · Undo". The row also shows a green **✓ Paid** chip that you can tap to reverse it.
- Single deletes, bulk deletes, budget removal, goal deletion and recurring removal now use Undo toasts instead of `window.confirm` popups.
- **Verified:** 257 → 258 → 257 transactions.

### R3-12. Pause/unpause removed (reported)
- **Removed:** the pause/resume buttons, the "Paused saves" summary and the paused gym item in the sample data.
- Old data that still contains a paused item is treated as active, so nothing disappears silently.
- The seed test now expects `pausedCount` 0.

### R3-13. Budget pace mascot
- **New:** `PaceMascot` ("Penny"), an original SVG coin character, with expression cross-fades that also work in Safari. All motion is off under reduced motion.
- **Found in its own gallery render:** sparkles showed on all five states. The `twinkle` animation's opacity keyframes override inline `opacity: 0`. Fix: visibility goes on an outer group and the animation on an inner group, scoped to `.mascot-under`; steam got the same treatment.
- **Also found:** the Spending fast brows looked angry, because the paths were swapped. Fix: inner ends raised = worried, lowered = cross.

### R3-14. Statements
- **New:** `src/analytics/statement.ts` with 4 tests. It covers monthly (like-for-like days for the current month) and annual (year to date vs the same span last year, 29 Feb clamped) statements, with money in/out, net, saved to goals, average daily spend, category table with change %, largest 5 expenses, month-by-month table with best 🏆 and worst ⚠️ months, and CSV download.

### R3-15. Settings: language, currency, chart style
- **Language** is a placeholder: only English (Australia) is enabled; the others are marked "Coming soon".
- **Currency** offers 11 options, with the note "Amounts are not converted". `formatMoney` now uses each currency's own minor units, so JPY and KRW show no decimals.
- **Chart style** is a 3-panel scroll-snap swiper (Bar / Pie / Line) that replaces the toggles inside Analytics. Settings migration maps the old `chartPrefs` to `chartStyle` (tested).

### R3-16. Sounds
- **New:** `src/ui/sound.ts`, 5 synthesised sounds (tap, open, success, undo, delete), on by default with a switch in Settings. They play when opening and saving a transaction, on Mark paid, Undo, delete, tab changes and picker choices.
- **Not verifiable headlessly:** whether they sound right and their volume on real speakers. Please listen on your phone.

### R3-17. Touch targets
- **Before the fix**, the matrix found 6 to 8 visible controls under 32px: section "All" links, small segments, "Review … limit →" links, goal name buttons, swiper dots and the Sounds switch.
- **Change:** 40px minimum on link buttons, 36px on small segments, 36px dots, a 54×34 switch and 36px goal title buttons.
- **After:** 0 on every device.

## Round 3 addendum: university student sample profile

- **New:** `src/seed/studentData.ts`, selectable from Home (empty state) and Settings > Sample data.
- **Profile:** a Sydney share-house room ($260/week) and power + internet share ($25/fortnight); casual café pay ($412/week) and a student payment ($318/fortnight); a prepaid phone, Spotify Student, uni gym and iCloud; frequent Opal trips, campus coffee and food, groceries, weekend nights out, start-of-semester textbooks; an exam-season eating-out spike this month and one unusual $189 headphones purchase. Goals: Emergency buffer, New laptop for uni, Exchange semester. Amounts are illustrative, not official rates.
- **Tests:** 4 in `student.test.ts`. They check determinism, valid categories, unique ids and no em dashes; a full month's income between $2.3k and $3k; rent as the biggest expense; median eating-out under $15; that pacing, signals and goals all fire; and profile selection.
- **Finding:** with a $2,200 budget, the reserved remaining rent weeks pushed safe-to-spend to **$0/day** on Home (screenshot). That looked broken rather than tight. The budget was raised to $2,400: now "Spending fast", projected $2,484, **$22/day** left. The test asserts a positive allowance.
- **Browser check:** loading the student sample from Home gave 328 transactions with no console errors. Switching to the professional profile in Settings replaced the data (Rent, Electricity, Phone plan, Netflix).
- **Results:** 76 tests pass, 0 fail.
