### Task 17 Report: Add responsive chart tooltips for mobile

**Status:** DONE

**Commits:**
- `4e15863` fix: enable touch-responsive chart cursors for mobile

**Test Summary:** 55 tests passed (4 test files), typecheck clean.

**Changes:**
Added `cursor` configuration to the `plotOpts()` return object in `src/data/dashboard.ts:169-172`:
- `drag: { x: false, y: false }` — prevents drag-triggered axis shifts on touch
- `focus: { prox: 20 }` — shows crosshair when finger/mouse is within 20px proximity

**Concerns:** None.
