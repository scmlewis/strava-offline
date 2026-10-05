# Task 6 Report: Cards extraction + responsive/a11y pass

## What was implemented

### 1. `card()` move (verbatim)
- Created `src/ui/cards.ts` with `export function card(label, value, sub?, accent?, small?)`
  copied verbatim from `src/data/dashboard.ts:117-130` (only change: `function` ->
  `export function`). Escaping behavior unchanged (function never escaped; callers
  unchanged).
- `src/data/dashboard.ts`: deleted the local `card()`, added
  `import { card } from '../ui/cards.ts';` (note: the brief text says
  `../../ui/cards.ts`, which would resolve outside `src/`; the correct relative path
  from `src/data/` is `../ui/cards.ts`, consistent with the file's existing
  `../icons`, `../i18n`, `../utils` imports).
- The `// ---- shared building blocks ----` header was kept; it still labels
  `plotOpts`/`section`/`wrapPair`.

### 2. Responsive CSS (per binding human decision: ADD 900/600 alongside untouched 500/760)
- `src/styles/responsive.css`: legacy `@media (max-width: 500px)` and both
  `@media (max-width: 760px)` blocks untouched. Appended after them:
  - `@media (max-width: 899px)`: `.layout` -> single column; `.nav` -> fixed bottom
    tab-bar (row, space-around, surface bg, elevation-2, top border); `.nav-tab` ->
    column layout with `border-radius: var(--shape-full)` active pill; `#app`
    bottom padding 84px; `.grid-2` -> 1fr; `.dashboard .chart-wrap` max-width 100%.
  - `@media (max-width: 599px)`: `.toolbar .tb-row` stacks
    (column/stretch, inputs full-width); `.dashboard .chart-wrap` padding 12px;
    `.cards` -> 1fr; `.streak-row` -> column; log tables -> card rows
    (`thead` hidden; table/tbody/tr/td block, rows as bordered rounded cards with
    normal wrapping).
- `src/styles/nav.css` (append-only): `@media (min-width: 900px)` block restating the
  base sidebar (sticky/column; zero visual change, documents the switch point) plus
  `.nav-tab:focus-visible` ring. No existing rule edited.

### 3. A11y pass
- `src/ui/nav.ts`: active tab button now renders `aria-current="page"`.
- `index.html`: `#status` gained `aria-live="polite"` (only attribute added; all
  E2E selectors/ids untouched, no `data-testid` aliases needed since nothing renamed).
- `src/styles/shell.css`: explicit `:focus-visible` ring group for
  `.nav-tab/.tb-input/.ico-btn/button/a` (same treatment as the existing generic
  rule, spelled out per component). `.skip-link` kept as-is; `role=dialog
  aria-modal` from Task 5 untouched; no color-token changes; all strings still via `t()`.

## Test results (evidence)

- Acceptance baseline BEFORE move: `npx vitest run test/acceptance.test.ts` -> PASS (16 tests).
- Acceptance AFTER move: same command -> PASS (16 tests). Behavior-preserving by construction.
- `npm run typecheck` -> clean. `npm run lint` -> 0 errors (3 pre-existing `any`
  warnings in untouched `src/data/fit.ts`). `npm run format:check` -> PASS
  (ran `prettier --write` on touched files first: all unchanged).
- `npm test` -> 9 files, 75 tests, all PASS (incl. acceptance 16, ui-store 5,
  ui-router 3, ui-modals 1, property 6).
- `npm run test:property` -> 6 passed. `npm run build` -> clean (only pre-existing
  chunk-size warning). `npm run test:e2e` (after build) -> 5/5 PASS
  (dropzone, nav tabs, `?` overlay, CSV pick, hash deep-link).
- `test-results/` (Playwright artifact) removed before final `format:check`; final
  `format:check` re-run after cleanup -> PASS.
- Visual check at 1280/768/390px: SKIPPED (no interactive browser in this
  environment). Relied on E2E + successful build (Vite validates CSS syntax) instead.
  The 768px width now hits the new 899px bottom-bar rules by design (per plan).

## Files changed (commit 390a0ce)

- Created: `src/ui/cards.ts`
- Modified: `src/data/dashboard.ts`, `src/styles/responsive.css`, `src/styles/nav.css`,
  `src/styles/shell.css`, `src/ui/nav.ts`, `index.html`
- Deliberately NOT committed: pre-existing dirty `.superpowers/sdd/*.md` files
  (not mine; left untouched) and untracked `.superpowers/brainstorm/`.

## Self-review findings

- `card()` body diffed against `git show HEAD:src/data/dashboard.ts` lines 117-130:
  identical except `export`. All 7 call sites in `dashboard.ts` resolve to the import.
- Responsive additions are purely additive and placed after legacy rules, so later
  rules win ties at overlapping widths (e.g. 390px), as required.
- No E2E selector changed (`#dropzone`, `#pick-btn`, `#nav`, `#dashboard`,
  `#toolbar`, `.overlay` all intact); E2E 5/5 confirms.
- No new dependencies; `package.json` untouched.
- One nit noted but kept: the `// ---- shared building blocks ----` comment in
  `dashboard.ts` now heads `plotOpts`/`section`/`wrapPair` instead of `card()`; still
  accurate, so left in place.

## Issues / concerns

- Brief typo: import path written as `../../ui/cards.ts`; used correct `../ui/cards.ts`.
- Overlap behavior change (intended): viewports 761-899px (e.g. 768px) now get the
  bottom tab-bar where previously they showed the sidebar. This is the planned 900px
  switch, but worth a human glance at 768px when convenient.
- Visual 1280/768/390 check skipped (headless-only environment); recommend a quick
  manual look on a real device, especially the 600px table-to-card transformation.
