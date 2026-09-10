### Task 11: Validate activities on load from IndexedDB

**Status:** DONE

**Commit:** `5cc8b04` - feat: validate activities on load, skip corrupt entries gracefully

**Summary:** Added `isValidActivity` type guard to `src/data/db.ts` that checks for required fields (id, date, ts, name, type). Updated `loadActivities()` to filter out invalid entries with console warnings instead of crashing.

**Typecheck:** `npm run typecheck` passed
**Tests:** `npm test` - 55 tests passed (4 test files)

**Concerns:** None