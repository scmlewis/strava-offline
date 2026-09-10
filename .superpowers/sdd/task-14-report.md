## Task 14: Improve empty state

**Status:** DONE

**Commits:**
- `be9adcb` — feat: improve empty state with feature highlights

**Files modified:**
- `index.html` — Replaced dz-full content with dropzone-title, dropzone-sub, and feature grid
- `src/styles.css` — Added `.dropzone-features`, `.feature`, `.feature-icon` grid styles with mobile responsive breakpoint
- `src/i18n.ts` — Added `dropzone_title` and `dropzone_sub` keys
- `src/main.ts` — Updated i18n element references from `dz-full-1`/`dz-full-2` to `dropzone-title`/`dropzone-sub`

**Test summary:** 55/55 tests passing, typecheck clean.

**Notes:**
- Used `--muted` instead of `--on-surface-variant` for feature text color since that variable was not defined in the CSS custom properties
- Feature highlights are hardcoded HTML (emoji-based icons) as specified in the brief, not i18n-able
- Fixed a smart-quote encoding issue in `dz_full_2` that surfaced during edit
