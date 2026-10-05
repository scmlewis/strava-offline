# Task 5 Report: Modals consolidation

## What was implemented

Created `src/ui/modals.ts` with:
- `shouldDismissOnKey(key)` — pure close-guard (`key === 'Escape'`), unit-tested in node env.
- `openModal(html, opts)` — builds `.overlay` + `.modal[role=dialog][aria-modal]`, wires Esc (via
  `shouldDismissOnKey`) + overlay-click close, focuses first button, returns idempotent `close()`.
  `opts` extends the brief's `{ onClose }` with optional `modalClass` / `modalStyle` — required to
  keep the `about`-class wrapper and the shortcuts `max-width:400px` wrapper byte-identical instead
  of silently dropping them (that would have been a visual change).
- Moved all 7 dialog builders off `main.ts`, inner HTML/ids/handlers verbatim:
  `openClearData`, `openBulkDelete`, `openZoneSettings`, `openGoalsDialog` (renamed from `openGoals`
  per brief), `openAbout`, `openDeleteConfirm`, `openShortcutsOverlay`.
- Stateful builders are parameterized with callbacks per the brief (`cfg`/`goals` in,
  `onSave`/`onReset`/`onDelete`/action-bag out); persistence/refresh/toast logic lives in thin
  `main.ts` wrappers. `deleteSingleActivity`, `lastDeleted`, `undoTimer` stay in `main.ts`
  untouched; only the confirm dialog DOM moved. `dashboard.ts` activity-detail overlay untouched
  (out of scope — 8th overlay, not one of the 7).

Behavior notes (no observable change):
- Bulk-delete error path still keeps the modal open: `onDelete` rethrows after toasting, modal
  closes only on success — matching the original try/catch placement.
- Shortcuts overlay now closes via shared `openModal` close (Esc listener + focus-on-open are
  additions from the brief's helper; overlay-click/close-button behavior identical). Pre-existing
  minor leak in the old shortcuts Esc handler is gone by construction.
- Toast-before-close vs close-before-toast reorder inside success handlers only (independent DOM
  nodes, visually identical).

## Test results (evidence)

- Step 1: `npx vitest run test/ui-modals.test.ts` → FAIL as expected (`Cannot find module
  '../src/ui/modals.ts'`).
- Step 3: same file → **1 passed**; `npm run typecheck` → clean; `npx playwright test
  test/e2e/app.spec.ts -g "help overlay"` → **1 passed** (`?` opens, `Escape` closes via new path).
- Step 4: `npm test` → **9 files / 75 tests passed**; `npm run test:e2e` (after `npm run build`,
  build clean) → **5 passed** (dropzone, nav, `?` overlay, CSV import, `#/load` deep-link).
- Extra: `npx eslint` on the 3 touched files → exit 0; `prettier --check` on them → clean.
- `test-results/` (Playwright artifact) removed before finishing.

## Files changed (commit 3f60b62)

- `src/ui/modals.ts` (new, ~290 lines), `src/main.ts` (−339/+~100: 7 builders deleted, replaced
  by imports + callback wrappers; `esc` import removed as now-unused), `test/ui-modals.test.ts`
  (new, brief-verbatim).

## Self-review findings

- Grep of `main.ts` confirms zero remaining `createElement('div')`/`className = 'overlay'` modal
  boilerplate; only imports + 7 call sites remain.
- Inner-HTML diff review: markup/ids/placeholders identical in all 7 (incl. `#z-*`, `#g-*`,
  `#clear-*`, `#bulk-*`, `#del-*`, `#about-close`, `#close-shortcuts`); computed strings
  (breakdown line, zone rows) built the same way.
- `noUnusedLocals` satisfied (typecheck clean); no new deps; i18n keys untouched.

## Issues / concerns

- Brief header mentions a "new Esc-dismiss test for zones modal" but the step list defines no such
  test and the commit file list excludes `test/e2e/app.spec.ts`, so none was added — Esc dismissal
  of every modal (incl. zones) flows through the covered `openModal` + `shouldDismissOnKey` path.
  Suggest Task 6 or a follow-up adds a zones-modal E2E if explicit coverage is wanted.
- Pre-existing `M .superpowers/sdd/*.md` line-ending noise in working tree was left untouched
  (not staged, not mine).
