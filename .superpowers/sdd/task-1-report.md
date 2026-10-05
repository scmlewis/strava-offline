# Task 1 Report: UI store — state + filter predicate

## What you implemented
- Created `src/ui/store.ts` (verbatim from brief): `TabId` type, `Filters` interface (13 fields), `DEFAULT_FILTERS`, `matchesFilters(acts, f, now?)` predicate covering type substring, range/from/to dates, minKm/maxKm, minGain, hasRoute, weekday (weekend/weekday/0-6), minPace/maxPace (sec/km derived from movingTimeMin/distanceKm), and free-text search over name/type/date. `intensity` accepted + counted but intentionally not evaluated (deferred to `main.ts` `isEasy()` until Task 4, per brief note). Plus `countActiveFilters(f)` counting each non-default field (13 checks).
- Created `test/ui-store.test.ts` (brief's test, with one syntax fix — see Issues): 5 tests across `matchesFilters` (default passthrough, type substring, minKm, search) and `countActiveFilters` (0 for defaults, 2 for type+minKm).
- No other files modified — pure addition, no wiring into `main.ts` (per brief, wiring is Task 4).

## What you tested and test results
- Focused: `npx vitest run test/ui-store.test.ts` → 5 passed.
- Full suite: `npm test` (`vitest run`) → 7 files, 71 tests passed (includes new file).
- Typecheck: `npm run typecheck` (`tsc --noEmit`) → clean, exit 0.

## TDD Evidence
- RED — command: `npx vitest run test/ui-store.test.ts` (run after writing test, before `src/ui/store.ts` existed).
  - Output: `FAIL test/ui-store.test.ts — Error: Cannot find module '../src/ui/store.ts' ... Failed to load url ../src/ui/store.ts ... Does the file exist?` / `Test Files 1 failed, Tests no tests`.
  - Why expected: brief Step 2 predicts exactly this — file does not exist yet, so import resolution fails. Confirms the test exercises the new module.
- GREEN — command: `npx vitest run test/ui-store.test.ts` (after writing `src/ui/store.ts`).
  - Output: `✓ test/ui-store.test.ts (5 tests) 6ms / Test Files 1 passed / Tests 5 passed`.
  - Then `npm run typecheck` → clean; then `npm test` → 71 passed.

## Files changed
- `src/ui/store.ts` (new, ~91 lines)
- `test/ui-store.test.ts` (new, ~49 lines)
- Commit: `d03df2f feat: add UI store with filter predicate and counter`

## Self-review findings
- Completeness: all 5 exports from the brief's interface list present (`TabId`, `Filters`, `DEFAULT_FILTERS`, `matchesFilters`, `countActiveFilters`); implementation transcribed verbatim (verified field-by-field against brief lines 79-170).
- Quality: imports use `.ts` extensions per repo convention (`../src/ui/store.ts`, `../src/data/types.ts`, `../data/types.ts`); logic is pure (no document/window) so node-env vitest is safe.
- Discipline (YAGNI): no extra helpers, no wiring, no store state beyond what the brief specifies; `intensity` correctly left unevaluated per brief note rather than inventing semantics.
- Testing: 5/5 new tests pass; full suite green; typecheck clean. Edge coverage beyond the brief (range/weekday/pace/hasRoute branches) is inherited verbatim from the specified implementation, not separately tested — acceptable since Task 1 scope pins the predicate and later tasks (4/5) will exercise it through the UI.

## Issues or concerns
- Brief typo fixed: Step 1 test line `expect(countActiveFilters({ ...DEFAULT_FILTERS, type: 'Run', minKm: 5 }).toBe(2);` is missing a closing paren (would be a parse error, not the expected import-resolution RED). Transcribed as `expect(countActiveFilters({ ...DEFAULT_FILTERS, type: 'Run', minKm: 5 })).toBe(2);`. Recommend fixing the brief/plan source.
- No other concerns. Ready for Task 2.
