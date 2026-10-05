# Task 4 Report: Shell + nav + toolbar rewiring

## What was implemented

**New modules (all markup/handlers moved verbatim, no behavior edits):**

- `src/ui/shell.ts` — `applyShellI18n()`, `setStatus()`, `showProgress()`/`hideProgress()`,
  `setDropzoneCompact()` moved verbatim from `main.ts`. Mechanical adaptation: they query their
  own DOM elements internally (`document.getElementById(...)` per call) instead of closing over
  `main.ts` module consts, so every call site in `main.ts` (`setStatus(...)`,
  `setDropzoneCompact(true/false)`, …) is byte-identical. `statusTimer` moved with `setStatus`.
- `src/ui/nav.ts` — `buildNav(nav, active, onSelect)` per the brief interface. Uses `TABS` from
  `router.ts`; label/icon maps preserve the exact `t('nav_*')` keys and icons from the old inline
  `TABS` array. Adds `data-testid="nav-tab-{id}"` alongside existing classes. Click handling
  delegates to `onSelect` (hash wiring lives in `main.ts`).
- `src/ui/toolbar.ts` — `renderToolbar(toolbar, deps)` per the brief interface (plus the fields
  verbatim rendering requires: `units`, `prefs`, `theme`, `collapsed`; `matched` typed as
  `Activity[]`). Owns the full toolbar markup moved verbatim, including the `.tb-actions` block
  with all button ids. Adds `data-testid` aliases mirroring every control id. Event wiring stays
  in `main.ts` (see boundary note below).

**What stayed in `main.ts`:** boot, ingest, persistence, all 7 modals (until Task 5), diagnostics,
keyboard shortcuts (`1-6`, `/`, `?`, `U` undo), document-drag dropzone expand, the
`navigator.storage.estimate` meter patch, the 180ms debounced search, and all toolbar/nav event
bindings (verbatim). Local `Filters` interface, `TABS` array, `countActiveFilters`, and the
`matches()` body were replaced with imports (`store.ts` / `router.ts`); the
`intensity`/`isEasy` HR-histogram post-filter is kept verbatim in `main.ts` (`matches()` =
`matchesFilters(allActs, filters)` + intensity post-filter; conjunction is order-independent so
results are identical, and `store.ts` does not evaluate intensity).

**Hash routing (`main.ts`):** `selectTab()` sets `window.location.hash = toHash(next)` with the
`hashchange` event driving re-render via `syncTabFromHash()` (brief's snippet, verbatim logic);
same-hash clicks re-render directly since re-setting an identical hash fires no event.
Boot does `ctx.tab = parseHash(window.location.hash)` before `buildNav()`.

**Topbar overflow (`index.html` + `main.ts`):** header gains
`<details id="topbar-menu"><summary>Menu</summary><div id="topbar-actions"></div></details>`.
After each `renderToolbar`, `main.ts` *moves* (appendChild, not clone) the rendered `.tb-actions`
node into `#topbar-actions`, clearing the slot first so repeat renders can't duplicate ids. All
button ids survive (`btn-backup`, `btn-restore`, `btn-export-filtered`, `btn-bulk-del`,
`btn-clear`, `btn-zones`, `btn-goals`, `btn-diag`, `btn-theme`, `btn-about`, `btn-reset`,
`t-toggle`, all `t-*` inputs — verified by id scan). `.tb-actions`/`.ico-btn` styles are global
(not `.toolbar`-scoped), so the moved buttons keep their styling. `data-testid` aliases added to
`#nav`, `#toolbar`, `#dashboard`, `#dropzone`, and the menu container.

## Test results with evidence

- **New deep-link E2E guard** (`hash route deep-links to load tab`): FAILED before the change as
  expected — `locator('#nav .nav-tab.active')` resolved to `<button data-tab="overview">`
  ("Overview"), confirmed via `npx playwright test test/e2e/app.spec.ts -g "deep-links"` on a
  fresh `npm run build`. PASSES after (259–353ms).
- **Full E2E** (`npx playwright test test/e2e/app.spec.ts`, after `npm run build` for the preview
  server): **5 passed** — 4 existing (dropzone, nav attached, `?` overlay, CSV import renders
  dashboard) + deep-link.
- **Unit** (`npm test`): **8 files, 74 tests, all passed** (incl. `ui-store` 5, `ui-router` 3).
- **Typecheck** (`npm run typecheck`): clean. **Lint** (`npm run lint`): 0 errors, 3 pre-existing
  warnings in untouched `src/data/fit.ts`. **Format** (`npm run format:check`, after removing the
  untracked `test-results/` Playwright artifact): all files pass.

## Files changed (commit `0df9ad2`)

- `refactor: modular shell with hash-routed tabs` — 6 files, +277/−257:
  new `src/ui/shell.ts`, `src/ui/nav.ts`, `src/ui/toolbar.ts`;
  modified `src/main.ts` (net −240 lines), `index.html`, `test/e2e/app.spec.ts`.

## Self-review findings

- Verified every moved markup string against the pre-extraction `main.ts` (only additions are
  `data-testid` attributes; attribute order `id`→`data-testid` preserved elsewhere).
- Verified `DEFAULT_FILTERS` is value-identical to the deleted local `filters` literal and
  `resetFilters` replacement.
- Verified `matchesFilters` covers exactly the non-intensity fields of the old `matches()`
  (type/range/from/to/minKm/maxKm/minGain/hasRoute/weekday/minPace/maxPace/search) with identical
  logic; intensity applied after, conjunctively — result-identical by construction.
- `main.ts` has no leftover references to deleted locals (`types`, `meterText`, `statusTimer`,
  `progressEl/*`, `applyShellI18n` def, `setDropzoneCompact` def, `countActiveFilters` def);
 `TabId` from `dashboard.ts` and `store.ts` are structurally identical unions, no cast issues.
- Boundary deviation (deliberate, documented): toolbar *bindings* and `resetFilters` stay in
  `main.ts` rather than moving into `toolbar.ts`, because `buildToolbar`'s ~20 handlers close over
  a dozen `main.ts` functions/state setters (`onBackup`, `units`/`prefs` reassignment, modal
  openers). Threading those through a callbacks object would have been a handler rewrite, which
  the task forbids. `toolbar.ts` owns markup; `main.ts` owns wiring — consistent with the plan's
  "main.ts keeps boot/ingest/persistence/modals/diagnostics/shortcuts".

## Issues / concerns

- **Pre-existing quirk preserved (not introduced):** keyboard `1-6` shortcuts set `ctx.tab`
  directly without touching the hash and without rebuilding nav, so the URL and the active pill go
  stale after keyboard nav — exactly as before. Task 6 (or a follow-up) may want shortcuts routed
  through `selectTab()`.
- **Unstyled `<details>` menu:** the topbar overflow has no dedicated CSS yet (out of scope;
  Task 6 owns responsive/a11y polish). Buttons render correctly since their styles are global.
- Working tree still contains unrelated prior-task modifications under `.superpowers/sdd/`
  (progress.md, task-1–3 briefs/reports) and `?? .superpowers/brainstorm/` — left untouched; this
  commit contains only the 6 brief-listed files.
