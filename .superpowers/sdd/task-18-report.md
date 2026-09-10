## Task 18: Add Playwright E2E tests — Report

**Status:** DONE

**Commit:** `ef0f9eb` — test: add Playwright E2E tests for critical user flows

**Test summary:** 4/4 E2E tests passing — load/dropzone, nav tabs, keyboard shortcut `?` overlay, CSV file pick.

**Changes:**
- Installed `@playwright/test` + Chromium browser
- Created `playwright.config.ts` (testDir `test/e2e`, port 4173, headless, 30s timeout)
- Created `test/e2e/app.spec.ts` with 4 critical user-flow tests
- Added `test:e2e` and `test:all` scripts to `package.json`
- Added Playwright install + E2E test steps to `.github/workflows/deploy.yml`

**Note:** The brief's `.modal-overlay` selector was corrected to `.overlay` / `.overlay .modal` to match the actual DOM structure. The brief's `Shift+/` keypress was changed to `page.keyboard.type('?')` for reliable `?` key detection in Chromium.
