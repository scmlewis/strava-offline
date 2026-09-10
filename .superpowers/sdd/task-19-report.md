### Task 19 Report: Property-based testing for analyze functions

**Status:** DONE

**Commits:**
- `75b7efd` — test: add property-based tests for analyze invariants

**Test Summary:** 6 property-based tests across 4 describe blocks covering `activityTSS`, `computeLoad`, `vdotFromRace`, and `computeStreaks` invariants. All pass alongside existing 55 tests (61 total).

**Changes:**
- Installed `fast-check` as devDependency
- Created `test/analyze.property.test.ts` with property tests for:
  - TSS is always non-negative for valid activities
  - TSS is null when histogram is empty
  - CTL - ATL = TSB invariant on load points
  - VDOT is positive for valid race data
  - Faster time at same distance = higher VDOT
  - Longest streak >= current streak
- Added `test:property` script to `package.json`

**Note:** `fc.dateSince` from the task brief was not available in the installed fast-check version; replaced with `fc.integer().map(n => new Date(n * 86400000))` to generate date strings.

**Report file:** `.superpowers/sdd/task-19-report.md`
