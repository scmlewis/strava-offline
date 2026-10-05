# UI Modernization Revamp — Design Spec

Date: 2026-10-05
Status: approved (design), pending spec review
Scope: major iteration, Approach A — modular vanilla system, shell + nav led, strict compat.
Out of scope: framework migration (React/Svelte/Lit), new runtime deps, i18n rewrite, chart-library swap (uPlot stays), backend/sync.

## Decisions (brainstorming)

- Scope: Restructure + systemize (keep vanilla TS + string rendering, split god-files, introduce design system + routing + shell overhaul).
- Lead priority: App shell + nav (tabs, toolbar/filters, header/dropzone, page hierarchy).
- Constraints: strict compat — no new runtime deps, keep Dexie/uPlot, keep `i18n.ts` keys, keep unit + property + Playwright E2E green, keep PWA/offline behavior.

## 1. Architecture — modular vanilla system

Current: `src/main.ts` (1182 lines, globals + innerHTML strings), `src/data/dashboard.ts` (~32 KB chart + card rendering), `src/styles.css` (1648 lines, M3 tokens + everything), `index.html` static shell.

Proposed `src/ui/` split (no framework):

- `src/ui/store.ts` — single `AppState` (`tab, filters, units, goals, prefs, theme`) + `subscribe/emit`. Replaces scattered `let filters/cfg/units/goals` globals. Syncs hash-route + localStorage persistence (existing keys unchanged).
- `src/ui/shell.ts` — topbar, layout grid, dropzone full/mini states, status/progress helpers.
- `src/ui/nav.ts` — tab bar + hash-router (`#/overview`, `#/volume`, `#/load`, `#/zones`, `#/perf`, `#/log`). Preserves keyboard `1-6`, `/` search focus, `?` shortcuts, `U` undo.
- `src/ui/toolbar.ts` — filter UI, meter, reset. Actions (backup/restore/export/bulk-delete/clear) relocate to topbar overflow menu.
- `src/ui/modals.ts` — one `openModal()` helper (Esc + overlay-click close, focus trap, `role=dialog`): zones, goals, clear-data, bulk-delete, delete-confirm, about, shortcuts.
- `src/ui/cards.ts` — stat-card renderers; `src/data/dashboard.ts` slimmed to chart-rendering only.
- `src/styles/` — `tokens.css` (existing M3 vars untouched), `shell.css`, `nav.css`, `toolbar.css`, `cards.css`, `modals.css`, `responsive.css`. `styles.css` becomes an import index during migration, then splits.

Each unit answers: what it renders, what state it reads/writes via `store.ts`, what DOM ids it owns. Consumers never reach into another unit's internals — only `store` + view-function calls.

## 2. App shell + nav

- Layout grid: sticky slim topbar (brand + theme + overflow menu + diagnostics) above a `main` grid: sidebar nav (desktop ≥900 px) / bottom tab-bar (mobile, thumb-reach, icons + labels, active pill). Toolbar becomes a filter rail under tabs.
- Nav: same 6 tabs, hash-routed so back/forward + refresh + shareable `#/load` work. Active = pill + `aria-current`. Skip-link `#dashboard` kept.
- Toolbar: `Filter (n)` collapsible header kept; row 1 = search + type + range + weekday; numeric/date constraints move to an expandable "More" row. Toolbar keeps Reset + meter only. Meter text (`12 activities · …`) + `navigator.storage.estimate` async patch unchanged.
- Topbar overflow menu takes: Backup, Restore, Export filtered, Bulk delete, Clear data, Zones, Goals, Diagnostics, About, Theme. Existing handlers move verbatim.
- Dropzone: full hero on empty state only; compact mini-bar otherwise. Document-drag expand behavior kept, restyled to shell tokens.
- Responsive: `≥900 px` sidebar, `<900 px` bottom nav + stacked toolbar, charts full-width, log tables → cards. Breakpoints 900/600 only.
- Compat: no E2E-depended DOM id renames without `data-testid` aliases; all strings via `t()`.

## 3. Design tokens + component system

- Keep existing M3 custom properties (`--surface-*`, `--primary`, `--elevation-*`, `--shape-*`, `--state-*`) as the token base in `tokens.css`. Both `data-theme` overrides + `prefers-color-scheme` paths preserved.
- Add component layer with fixed class contracts: `.card`, `.chart-wrap`, `.btn`, `.ico-btn`, `.tb-*`, `.nav-tab`, `.modal/.overlay`, `.status`, `.progress`, `.meter`. Ledger/monospaced kickers (`chart-wrap` family, coach's-note style) become the shared surface language — no new visual language.
- Accent discipline from training-ledger revision holds: primary green `#34d399` for action/health only; amber strictly for warnings (TSB warnings, storage pressure); red strictly for destructive.
- A11y: visible focus rings on all interactives, `aria-current` on nav, `role=dialog` + labelled modals, live-region for `statusEl` + toasts, `prefers-reduced-motion` respected, color-contrast kept at current AA-or-better.
- Dark/light: no new tokens required; component CSS references only existing vars so both themes + system mode work unchanged.

## 4. Data flow + error handling

- Flow: `loadActivities()` → `store.set({acts})` → `matches(acts, filters)` (same predicate logic, moved to `store`/selector) → `setCtx(cfg, units, goals, prefs)` → `renderDashboard(dashboard, matched, ctx)` → `updateMeter()`. Ingest path (`runIngest` worker → `saveActivities` → reload → `setDropzoneCompact` → toast) unchanged, only relocated into `shell.ts`/`store.ts` call sites.
- Hash-router: `hashchange` → `store.set({tab})` → `buildNav()` + `refresh()`. Tab clicks `location.hash = #/…` instead of direct `ctx.tab =` mutation so history works. Filter state stays in-memory + localStorage (no URL sync — deliberate, avoids gigantic URLs; reconsider only in a follow-up).
- Errors: global `window.onerror` / `unhandledrejection` → status bar pattern kept. Import/backup/restore/parse failures keep current toast + `console.warn` issue-list behavior. New: `openModal` failures and router unknown-hash fall back to `#/overview` with an info toast, never a blank screen.
- Storage pressure: `confirmLargeExport` (>50 MB) dialog kept for backup + filtered export.

## 5. Testing + rollout

- Unit: store reducer/selector tests (filter predicate parity vs current `matches()`), router hash↔tab mapping, modal open/close/Esc/overlay behavior, meter formatting. Synthetic-state tests following the coach-note pattern.
- Existing suites stay green: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run test:property`, `npm run test:e2e`, `npm run build`. E2E selectors get `data-testid` aliases before any id/class rename; update specs only for moved action buttons (toolbar → overflow menu).
- Rollout (for the later plan): 1) styles split (no behavior change), 2) store + router, 3) toolbar/nav shell, 4) modals, 5) cards/dashboard slimming, 6) responsive + a11y pass. Each step independently shippable; `main.ts` shrinks monotonically and re-exports during migration so no big-bang cutover.
- Perf guard: no new deps, no extra chart renders; `refresh()` call sites audited so filter keystrokes stay debounced (180 ms search) and `updateMeter` stays async-patched.

## Non-goals

- No framework, no router/store deps, no chart-library change, no i18n key renames, no filter-URL-sync, no command palette, no season model, no changes to ingest/analyze/zone math.

## Self-review

- No TBD/placeholders; thresholds and file maps explicit.
- Consistent: single store, hash-tabs, actions in overflow menu, toolbar keeps filters only.
- Scope fits one implementation plan (6 rollout steps, each shippable).
- Ambiguity resolved: filter state not URL-synced; E2E renames via `data-testid` aliases; breakpoints fixed at 900/600.
