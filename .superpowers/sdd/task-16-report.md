### Task 16 Report: Add dark/light theme toggle

**Status:** DONE

**Commits:**
- `95c0672` feat: add dark/light theme toggle with system preference support

**Test summary:** 55 tests passed across 4 test files; typecheck and lint clean (3 pre-existing warnings in fit.ts).

**Changes:**
- `src/styles.css` — Reorganized CSS custom properties: theme-agnostic values stay in `:root`; dark theme moved to `html[data-theme="dark"]` and `html:not([data-theme])` (default); light theme added via `@media (prefers-color-scheme: light)` for system preference and `html[data-theme="light"]` for manual override. Includes light-appropriate elevation shadows, outline opacities, and color roles.
- `src/main.ts` — Added `loadTheme()`, `saveTheme()`, `applyTheme()`, and `cycleTheme()` functions with localStorage persistence. Theme toggle button added to toolbar actions row with `contrast` icon. Cycles dark → light → system on click, shows toast with current theme.
- `src/i18n.ts` — Added `theme_dark`, `theme_light`, `theme_system`, and `theme_changed` i18n keys.
- `src/icons.ts` — Added `contrast` icon (half-circle Lucide-style) to the icon set.

**Concerns:** None.
