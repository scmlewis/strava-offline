### Task 4: Shell + nav + toolbar rewiring

**Files:**
- Create: `src/ui/shell.ts`, `src/ui/nav.ts`, `src/ui/toolbar.ts`
- Modify: `src/main.ts` (replace inline `buildNav`/`buildToolbar`/`matches`/`countActiveFilters` with imports; keep all handlers verbatim), `index.html` (add `data-testid` aliases, topbar overflow menu container)
- Test: `test/ui-store.test.ts` (already passing), `test/e2e/app.spec.ts` (must stay green)

**Interfaces:**
- Consumes: `matchesFilters`, `countActiveFilters`, `DEFAULT_FILTERS`, `Filters` from `./store.ts`; `parseHash`, `toHash`, `TABS` from `./router.ts`; `t` from `../i18n.ts`; `icon` from `../icons.ts`.
- Produces:
  - `export function buildNav(nav: HTMLElement, active: TabId, onSelect: (t: TabId) => void): void`
  - `export function renderToolbar(toolbar: HTMLElement, deps: { acts: Activity[]; matched: unknown[]; filters: Filters; activeCount: number }): void` (initial version renders existing markup verbatim; regrouping into "More" row ships as a pure-CSS/HTML reorder inside this file with no handler changes)

- [ ] **Step 1: Write the failing E2E guard for deep-linkable tabs**

Append to `test/e2e/app.spec.ts` (temporary, kept permanently):

```ts
test('hash route deep-links to load tab', async ({ page }) => {
  await page.goto('/#/load');
  await expect(page.locator('#nav .nav-tab.active')).toContainText('Load');
});
```

Run: `npx playwright test test/e2e/app.spec.ts -g "deep-links"`
Expected: FAIL (no hash routing yet; active tab stays Overview).

- [ ] **Step 2: Extract shell/nav/toolbar modules (move code verbatim)**

Create the three modules by moving the corresponding functions out of `src/main.ts` without behavior edits: `setDropzoneCompact`/`setStatus`/progress helpers → `shell.ts`; `buildNav` → `nav.ts` (using `TABS` from `router.ts`); `buildToolbar`/`resetFilters`/`countActiveFilters`-callers → `toolbar.ts` (using `matchesFilters`/`countActiveFilters` from `store.ts`). `src/main.ts` keeps: boot, ingest, persistence, modals (until Task 5), diagnostics, keyboard shortcuts. Replace local `matches()` body with `matchesFilters(allActs, filters)` plus the existing `intensity`/`isEasy` post-filter kept verbatim in `main.ts`.

- [ ] **Step 3: Wire hash routing in `src/main.ts`**

```ts
import { parseHash, toHash } from './ui/router.ts';

function syncTabFromHash(): void {
  const tab = parseHash(window.location.hash);
  if (tab !== ctx.tab) {
    ctx.tab = tab;
    buildNav();
    refresh();
  }
}
window.addEventListener('hashchange', syncTabFromHash);
// in nav click handler: window.location.hash = toHash(next); (hashchange event drives the re-render)
// on boot, before buildNav(): ctx.tab = parseHash(window.location.hash);
```

Topbar overflow: move Backup/Restore/Export/Bulk-delete/Clear/Zones/Goals/Diagnostics/About/Theme buttons into a `<details class="menu">` in the topbar, keeping their existing `id`s (`btn-backup`, `btn-restore`, …) so handlers and tests keep working. Toolbar keeps Reset + meter. Add `data-testid="nav-tab-{id}"` alongside existing classes.

- [ ] **Step 4: Verify**

Run: `npm run typecheck` — Expected: clean.
Run: `npm test` — Expected: all suites PASS.
Run: `npx playwright test test/e2e/app.spec.ts` — Expected: all 5 tests PASS (4 existing + deep-link).

- [ ] **Step 5: Commit**

```bash
git add src/ui/shell.ts src/ui/nav.ts src/ui/toolbar.ts src/main.ts index.html test/e2e/app.spec.ts
git commit -m "refactor: modular shell with hash-routed tabs"
```

---

