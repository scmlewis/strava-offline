### Task 13: Add keyboard shortcuts — Report

- **Status:** DONE
- **Commit:** `8afbcd0` — feat: add keyboard shortcuts (? help, 1-6 tabs, / search, Esc close)
- **Tests:** 55 passed, 0 failed

**Changes:**
- `src/main.ts`: Added `openShortcutsOverlay()` function and global `keydown` listener after error handlers. `?` opens help overlay, `1-6` switches tabs, `/` focuses search input (corrected selector to `type="search"`), `Esc` closes modals.
- `src/i18n.ts`: Added 5 i18n keys: `shortcuts_title`, `shortcuts_help`, `shortcuts_tabs`, `shortcuts_search`, `shortcuts_close`. (`close` already existed.)
- `src/styles.css`: Added `kbd` element styles (inline-block, surface-container background, border, rounded, min-width).

**Note:** Fixed search input selector from `input[type="text"]` to `input[type="search"]` to match actual DOM (`#t-search` uses `type="search"`).
