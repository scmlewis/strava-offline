# Task 6: Move jszip to runtime dependencies — Report

**Status:** DONE

**Commits:**
- `d555c39` — fix: move jszip to runtime dependencies (used in src/data/zip.ts)

**Test Summary:**
All 55 tests passed across 4 test files.

**Changes:**
- Moved `jszip` from `devDependencies` to `dependencies` in `package.json`
- Ran `npm install` to update lockfile
- Build succeeded, tests passed
