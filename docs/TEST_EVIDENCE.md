# Test evidence & change log

Every flaw found while testing, with where it was, what failed (actual output), and the change made. Code diffs for UI fixes are in commit `e72d44b` (`git show e72d44b`).

## How this was tested

| Check | Tool | Result |
|---|---|---|
| Unit tests: domain, analytics, filters, persistence, store, seed (59 tests, 148 assertions) | Sandbox: `bun test` with a local shim mapping `vitest` → `bun:test`. In the repo: `npm test` runs Vitest. | **59 pass, 0 fail** |
| Strict typecheck of non-UI code (`domain`, `analytics`, `persistence`, `seed`) | `tsc --noEmit`, project `tsconfig.json` settings | **0 errors** |
| Bundle the full app | `bun build src/main.tsx` | 41 modules, no errors |
| Visual & console check of every screen at 390×844 @2x | Playwright (Chromium, mobile emulation): load sample data, open all 10 routes, toggle charts, open the add sheet, bulk-select | **0 console errors / page errors** |

**Not verified in the sandbox.** It had no npm registry access, so these were not run here. Run them locally after `npm install`:

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
- **Cause:** my hand calculation was wrong. The fixture has $412 (1–22 Nov) vs 5 × $50 = $250 (1–22 Oct), which is +64.8%. The engine was right.
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
