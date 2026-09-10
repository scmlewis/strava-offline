## Task 12: Add backup size warning

**Status:** DONE

**Commit:** `addf574` feat: warn user before downloading backups larger than 50MB

**Tests:** 55/55 passed, typecheck clean

**Changes:**

- `src/main.ts` — `onBackup()` now computes backup size via `new Blob([json]).size`, shows `window.confirm` if >50 MB, and aborts download if user cancels.
- `src/i18n.ts` — Added `backup_large` key to EN dictionary with `{size}` placeholder.

**Concerns:** None
