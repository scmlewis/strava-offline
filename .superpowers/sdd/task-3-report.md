# Task 3 Report: Styles split — same pixels, layered files

## What was implemented

`src/styles.css` (1648 lines) was split verbatim into 7 layered files; `src/styles.css` is now the 7-line `@import` index only (exact paths from the brief). No selector, value, or declaration was edited — verified by line-multiset comparison against `HEAD:src/styles.css` (identical after prettier, which touched blank lines only). Split performed by exact line-range slicing, not retyping.

- `src/styles/tokens.css` (180 lines, orig 1–180): `:root` shape/state/font tokens, `html[data-theme]` dark default + light/dark overrides, `@media (prefers-color-scheme: light)`.
- `src/styles/shell.css` (orig 181–246 base `*`/`html`/`body`/`#app`/type, 248–305 topbar+brand, 307–423 dropzone incl. features, 608–672 `.dot`/`.status`/`.progress`, 674–689 `.icon`/`:focus-visible`, 691–697 `.layout`, 759–762 `.content`, 1470–1480 `.enter`, 1523–1534 `kbd`, 1597–1640 toast system).
- `src/styles/nav.css` (orig 699–757): `.nav`, `.nav-tab` (+hover/active), `.nav-ico`, `.nav-lbl`.
- `src/styles/toolbar.css` (orig 430–607 toolbar section incl. `.tb-*`/`.ico-btn`/`.row-del`/`.act-reset`, plus 763–821 second `.tb-row`/`.tb-input`/`.tb-inline` block — kept together so the later `.tb-row` still wins cascade as in the original).
- `src/styles/cards.css` (orig 823–921 dashboard/cards, 923–1006 heatmap, 1008–1036 goals, 1038–1073 zone bars, 1075–1171 tables/pager, 1173–1207 routes, 1439–1468 vdot/streak, 1504–1521 uPlot theme).
- `src/styles/modals.css` (orig 1209–1437): `.overlay`, `.modal` family, `.det-*`, zone-bar, `.zfield`/`.zrow`, `.modal-actions`.
- `src/styles/responsive.css` (97 lines): `@media (max-width: 500px)` dropzone-features (orig 424–428), `@media (prefers-reduced-motion: reduce)` (orig 1481–1502), responsive comment + `@media (max-width: 760px)` shell block (orig 1536–1595), `@media (max-width: 760px)` toast block (orig 1642–1648). Imported last so conditional overrides keep final-cascade position.

Judgment calls for blocks the map didn't name (brief maps didn't cover base/heatmap/tables/toast/motion; actual breakpoints are 500px/760px, not the 900px/600px quoted in the brief/plan): base/typography/toast/`kbd`/`.enter` → shell; heatmap/goals/zones/tables/routes/vdot/streak/uPlot → cards (dashboard content); toasts → shell (shell chrome, not modal); `prefers-reduced-motion` → responsive (media-query file). All documented here; no rule edits in any case.

## Baseline vs post-split bundle evidence

- Baseline (pre-split `npm run build`): `dist/assets/index-DNdY6iOM.css:27890` bytes.
- Post-split `npm run build` (before and after prettier): `dist/assets/index-Cwv9dVrP.css:27890` bytes — byte-identical size (Δ 0, tolerance ±50). Hash differs (expected: module graph changed), payload identical.
- Build (`tsc --noEmit && vite build`) PASS in all runs.

## Test results

- `npm run format:check`: the 8 task files PASS after `npx prettier --write src/styles/ src/styles.css` (verified whitespace-only). Full-repo check still flags 2 PRE-EXISTING files from Tasks 1–2 (`src/ui/store.ts`, `test/ui-store.test.ts`) — untouched, left for their owners; see concerns.
- `npm run test:e2e`: 4/4 PASS — loads and shows dropzone (4.2s), nav tabs render, `?` help overlay open/Escape-close, CSV import renders dashboard (11.9s total).

## Files changed (commit 761eef9)

- Created: `src/styles/tokens.css`, `shell.css`, `nav.css`, `toolbar.css`, `cards.css`, `modals.css`, `responsive.css`
- Modified: `src/styles.css` (1648 rules → 7-line import index)

## Self-review

- Completeness: all 5 brief steps done (baseline recorded, verbatim split, size verified, format fixed, E2E green, exact commit message).
- Quality: mechanical line-range slicing + automated multiset verification; cascade order preserved within each file; cross-file order safe (moved blocks have unique selectors; the one duplicate `.tb-row` keeps original relative order inside `toolbar.css`; media queries stay last via import order).
- Discipline (YAGNI): zero rule edits, zero new styles, zero header comments, no TS/config changes; out-of-scope format failures left untouched.

## Issues / concerns

1. `npm run format:check` is NOT fully green repo-wide: `src/ui/store.ts` + `test/ui-store.test.ts` (Task 1–2 files) fail prettier on HEAD, independent of this task. Recommend their owners run prettier --write.
2. Brief/plan quote responsive breakpoints as 900px/600px, but the stylesheet actually uses 500px/760px (plus `prefers-color-scheme`/`prefers-reduced-motion`). Split treated "all conditional @media blocks per section intent" as responsive; no breakpoint values were changed.
