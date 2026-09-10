## Task 10: Add global error boundary

**Status:** DONE

**Commit:** `27c8978` feat: add global error boundary with user-friendly messages

**Changes:**
- `src/main.ts` — Added `window.onerror` and `unhandledrejection` listeners before the boot sequence (line ~828). Errors display in the status bar via `t('error_generic', { message })`.
- `src/i18n.ts` — Added `error_generic` key: `"Something went wrong: {message}"`.

**Tests:** 55 passed, 0 failed. Typecheck clean.
