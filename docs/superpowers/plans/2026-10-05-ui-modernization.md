# UI Modernization Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the vanilla-TS UI into a modular `src/ui/` + `src/styles/` system with a hash-routed app shell, without changing behavior or adding dependencies.

**Architecture:** Extract a pure `store.ts` (state + filter predicate) and `router.ts` (hash↔tab) first as independently tested units; then split `styles.css` into layered files with identical output; then rewire `index.html`/`main.ts` shell, nav, toolbar, modals, and cards onto the store. Each task ships independently with `main.ts` re-exporting during migration.

**Tech Stack:** Vanilla TypeScript, Vite 5, Vitest 3 (node env), Playwright, uPlot, Dexie — no new runtime dependencies.

## Global Constraints

- No new runtime dependencies (`uplot`, `dexie` stay; devDeps unchanged).
- Keep all `src/i18n.ts` keys; all UI strings via `t()`.
- Keep green: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run test:property`, `npm run test:e2e`, `npm run build`.
- Unit tests run in node env (see `vitest.config.ts`: `environment: 'node'`) — new unit tests must be pure logic (no `document`/`window`).
- PWA/offline behavior preserved (service worker, IndexedDB, localStorage keys: `theme`, `unitPref`, `goals`, `prefs`, `filterCollapsed`).
- Filters stay in-memory + localStorage; filters are NOT synced to the URL (explicit non-goal).
- Responsive breakpoints fixed at 900px / 600px.
- E2E selectors preserved: `#dropzone`, `#pick-btn`, `#nav`, `#dashboard`, `#toolbar`, `.overlay`, `.overlay .modal h3`. Any renamed class/id gets a `data-testid` alias before removal.

---

### Task 1: UI store — state + filter predicate

**Files:**
- Create: `src/ui/store.ts`
- Create: `test/ui-store.test.ts`
- Modify: none (no wiring yet — pure addition)

**Interfaces:**
- Consumes: `Activity` from `src/data/types.ts`; `ZonesConfig` from `src/data/zones.ts` (types only).
- Produces (used by Tasks 2, 4, 5):
  - `export type TabId = 'overview' | 'volume' | 'load' | 'zones' | 'perf' | 'log'`
  - `export interface Filters { type: string; range: string; from: string; to: string; minKm: number; maxKm: number; minGain: number; weekday: string; intensity: string; hasRoute: boolean | null; minPace: number; maxPace: number; search: string }`
  - `export const DEFAULT_FILTERS: Filters`
  - `export function matchesFilters(acts: Activity[], f: Filters, now?: number): Activity[]`
  - `export function countActiveFilters(f: Filters): number`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { matchesFilters, countActiveFilters, DEFAULT_FILTERS } from '../src/ui/store.ts';
import type { Activity } from '../src/data/types.ts';

function act(id: string, partial: Partial<Activity> = {}): Activity {
  return {
    id,
    source: 'csv',
    date: '2024-06-01',
    ts: new Date('2024-06-01T07:00:00').getTime(),
    name: id,
    type: 'Run',
    distanceKm: 5,
    movingTimeMin: 30,
    elevationGainM: 50,
    ...partial,
  } as Activity;
}

describe('matchesFilters', () => {
  it('returns all when filters are default', () => {
    const acts = [act('a'), act('b')];
    expect(matchesFilters(acts, DEFAULT_FILTERS).map((a) => a.id)).toEqual(['a', 'b']);
  });
  it('filters by type substring case-insensitively', () => {
    const acts = [act('a', { type: 'Run' }), act('b', { type: 'Ride' })];
    expect(
      matchesFilters(acts, { ...DEFAULT_FILTERS, type: 'run' }).map((a) => a.id),
    ).toEqual(['a']);
  });
  it('filters by minKm', () => {
    const acts = [act('a', { distanceKm: 5 }), act('b', { distanceKm: 12 })];
    expect(
      matchesFilters(acts, { ...DEFAULT_FILTERS, minKm: 10 }).map((a) => a.id),
    ).toEqual(['b']);
  });
  it('filters by search across name/type/date', () => {
    const acts = [act('Morning Run'), act('Evening Ride')];
    expect(
      matchesFilters(acts, { ...DEFAULT_FILTERS, search: 'ride' }).map((a) => a.id),
    ).toEqual(['Evening Ride']);
  });
});

describe('countActiveFilters', () => {
  it('is 0 for defaults and counts each set field', () => {
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
    expect(countActiveFilters({ ...DEFAULT_FILTERS, type: 'Run', minKm: 5 }).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ui-store.test.ts`
Expected: FAIL with "Failed to resolve import ../src/ui/store.ts" (file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Activity } from '../data/types.ts';

export type TabId = 'overview' | 'volume' | 'load' | 'zones' | 'perf' | 'log';

export interface Filters {
  type: string;
  range: string;
  from: string;
  to: string;
  minKm: number;
  maxKm: number;
  minGain: number;
  weekday: string;
  intensity: string;
  hasRoute: boolean | null;
  minPace: number;
  maxPace: number;
  search: string;
}

export const DEFAULT_FILTERS: Filters = {
  type: '',
  range: 'all',
  from: '',
  to: '',
  minKm: 0,
  maxKm: 0,
  minGain: 0,
  weekday: '',
  intensity: '',
  hasRoute: null,
  minPace: 0,
  maxPace: 0,
  search: '',
};

const RANGE_DAYS: Record<string, number> = { all: Infinity, '90': 90, '180': 180, '365': 365 };

export function matchesFilters(acts: Activity[], f: Filters, now = Date.now()): Activity[] {
  const days = RANGE_DAYS[f.range] ?? Infinity;
  const q = f.search.trim().toLowerCase();
  const fromT = f.from ? new Date(f.from + 'T00:00:00').getTime() : -Infinity;
  const toT = f.to ? new Date(f.to + 'T23:59:59').getTime() : Infinity;
  return acts.filter((a) => {
    if (f.type && !(a.type || '').toLowerCase().includes(f.type.toLowerCase())) return false;
    if (days !== Infinity && a.ts && (now - a.ts) / 86400000 > days) return false;
    if (a.ts && a.ts < fromT) return false;
    if (a.ts && a.ts > toT) return false;
    if (f.minKm > 0 && (a.distanceKm ?? 0) < f.minKm) return false;
    if (f.maxKm > 0 && (a.distanceKm ?? 0) > f.maxKm) return false;
    if (f.minGain > 0 && (a.elevationGainM ?? 0) < f.minGain) return false;
    if (f.hasRoute !== null) {
      const has = !!(a.route && a.route.length > 1);
      if (has !== f.hasRoute) return false;
    }
    if (f.weekday) {
      if (!a.ts) return false;
      const dow = new Date(a.ts).getDay();
      if (f.weekday === 'weekend' && dow !== 0 && dow !== 6) return false;
      if (f.weekday === 'weekday' && (dow === 0 || dow === 6)) return false;
      if (/^[0-6]$/.test(f.weekday) && String(dow) !== f.weekday) return false;
    }
    if (f.minPace > 0 || f.maxPace > 0) {
      const pace =
        a.distanceKm && a.movingTimeMin ? (a.movingTimeMin * 60) / a.distanceKm : 0;
      if (f.minPace > 0 && pace < f.minPace) return false;
      if (f.maxPace > 0 && pace > f.maxPace) return false;
    }
    if (q && !`${a.name} ${a.type} ${a.date}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function countActiveFilters(f: Filters): number {
  let n = 0;
  if (f.type) n++;
  if (f.range !== 'all') n++;
  if (f.from) n++;
  if (f.to) n++;
  if (f.minKm) n++;
  if (f.maxKm) n++;
  if (f.minGain) n++;
  if (f.weekday) n++;
  if (f.intensity) n++;
  if (f.hasRoute !== null) n++;
  if (f.minPace) n++;
  if (f.maxPace) n++;
  if (f.search) n++;
  return n;
}
```

Note: `intensity` is accepted in `Filters` and counted, but evaluated in `main.ts` via the HR-histogram `isEasy()` helper until Task 4 moves it; the predicate above is intentionally behavior-identical for all other fields.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/ui-store.test.ts`
Expected: PASS (5 tests). Then run: `npm run typecheck` — Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/store.ts test/ui-store.test.ts
git commit -m "feat: add UI store with filter predicate and counter"
```

---

### Task 2: Hash router — tab ↔ URL

**Files:**
- Create: `src/ui/router.ts`
- Create: `test/ui-router.test.ts`
- Modify: none (pure addition; wiring happens in Task 4)

**Interfaces:**
- Consumes: `TabId` from `./store.ts`.
- Produces (used by Task 4):
  - `export const TABS: TabId[]` (ordered `['overview','volume','load','zones','perf','log']`)
  - `export function parseHash(hash: string): TabId` (unknown/empty → `'overview'`)
  - `export function toHash(tab: TabId): string` (e.g. `'#/load'`)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseHash, toHash } from '../src/ui/router.ts';

describe('parseHash', () => {
  it('parses known tabs', () => {
    expect(parseHash('#/load')).toBe('load');
    expect(parseHash('#/log')).toBe('log');
  });
  it('falls back to overview for empty or unknown hashes', () => {
    expect(parseHash('')).toBe('overview');
    expect(parseHash('#/nope')).toBe('overview');
    expect(parseHash('#')).toBe('overview');
  });
});

describe('toHash', () => {
  it('serializes tabs to hashes', () => {
    expect(toHash('overview')).toBe('#/overview');
    expect(toHash('zones')).toBe('#/zones');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ui-router.test.ts`
Expected: FAIL with "Failed to resolve import ../src/ui/router.ts".

- [ ] **Step 3: Write minimal implementation**

```ts
import type { TabId } from './store.ts';

export const TABS: TabId[] = ['overview', 'volume', 'load', 'zones', 'perf', 'log'];

const TAB_SET: ReadonlySet<string> = new Set(TABS);

export function parseHash(hash: string): TabId {
  const m = /^#\/([a-z]+)/.exec(hash.trim());
  const tab = m?.[1] ?? '';
  if (TAB_SET.has(tab)) return tab as TabId;
  return 'overview';
}

export function toHash(tab: TabId): string {
  return `#/${tab}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/ui-router.test.ts`
Expected: PASS (3 tests). Then run: `npm run typecheck` — Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/router.ts test/ui-router.test.ts
git commit -m "feat: add hash router for dashboard tabs"
```

---

### Task 3: Styles split — same pixels, layered files

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/shell.css`, `src/styles/nav.css`, `src/styles/toolbar.css`, `src/styles/cards.css`, `src/styles/modals.css`, `src/styles/responsive.css`
- Modify: `src/styles.css` (becomes import index only)
- Test: build + E2E smoke (no unit test — CSS output verified by byte-identical compiled bundle and Playwright)

**Interfaces:**
- Consumes: current `src/styles.css` (1648 lines) — content moves verbatim, zero rule edits.
- Produces: `src/styles.css` containing only:
```css
@import './styles/tokens.css';
@import './styles/shell.css';
@import './styles/nav.css';
@import './styles/toolbar.css';
@import './styles/cards.css';
@import './styles/modals.css';
@import './styles/responsive.css';
```
Split map (by current section): `:root` + `html[data-theme]` + `prefers-color-scheme` blocks → `tokens.css`; `.topbar/.brand/.layout/.content/.dropzone/.status/.progress` → `shell.css`; `.nav/.nav-tab` → `nav.css`; `.toolbar/.tb-*` → `toolbar.css`; `.dashboard/.card/.chart-wrap` → `cards.css`; `.overlay/.modal/.zfield/.zrow` → `modals.css`; all `@media (max-width: 900px)` / `(max-width: 600px)` blocks → `responsive.css`.

- [ ] **Step 1: Write the failing check (bundle diff baseline)**

Run: `npm run build`
Expected: PASS — then record baseline: `node -e "const fs=require('fs');const f=fs.readdirSync('dist/assets').find(x=>x.endsWith('.css'));console.log(f+':'+fs.statSync('dist/assets/'+f).size)"` prints e.g. `index-AbC123.css:33508`. Save that filename+size; the post-split bundle must be byte-comparable in size (±50 bytes for import-header whitespace).

- [ ] **Step 2: Perform the verbatim split**

Move each rule block from `src/styles.css` into its target file per the split map above without editing selectors, values, or order within each file. Replace `src/styles.css` with the 7-line import index shown above.

- [ ] **Step 3: Verify identical output**

Run: `npm run build`
Expected: PASS. Re-run the size command — Expected: same size ±50 bytes.
Run: `npm run format:check`
Expected: PASS (run `npx prettier --write src/styles/ src/styles.css` first if needed).

- [ ] **Step 4: Run E2E smoke**

Run: `npm run test:e2e`
Expected: all 4 tests in `test/e2e/app.spec.ts` PASS (dropzone visible, nav attached, `?` overlay, CSV import renders dashboard).

- [ ] **Step 5: Commit**

```bash
git add src/styles/ src/styles.css
git commit -m "refactor: split styles.css into layered modules (no visual change)"
```

---

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

### Task 5: Modals consolidation

**Files:**
- Create: `src/ui/modals.ts`
- Modify: `src/main.ts` (replace 7 inline modal builders with imports; delete moved code)
- Test: existing E2E `?` overlay test + new Esc-dismiss test for zones modal

**Interfaces:**
- Consumes: `t` from `../i18n.ts`; `icon` from `../icons.ts`; zone/goal types from `../data/zones.ts` and `../data/types.ts`.
- Produces:
  - `export function openModal(html: string, opts?: { onClose?: () => void }): () => void` (creates `.overlay` + `.modal`, wires Esc + overlay-click close, focuses first button, returns `close`)
  - `export function openZoneSettings(cfg: ZonesConfig, onSave: (c: ZonesConfig) => void, onReset: () => void): void`
  - `export function openGoalsDialog(goals: Goals, onSave: (g: Goals) => void): void`
  - (clear-data, bulk-delete, delete-confirm, about, shortcuts move in the same mechanical way, keeping markup/ids verbatim)

- [ ] **Step 1: Write the failing test (pure helper part, node-env safe)**

The DOM-touching `openModal` cannot run in node env, so test the pure close-guard logic extracted alongside it. Create `test/ui-modals.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shouldDismissOnKey } from '../src/ui/modals.ts';

describe('shouldDismissOnKey', () => {
  it('dismisses on Escape only', () => {
    expect(shouldDismissOnKey('Escape')).toBe(true);
    expect(shouldDismissOnKey('Enter')).toBe(false);
  });
});
```

with `export function shouldDismissOnKey(key: string): boolean { return key === 'Escape'; }` living in `modals.ts` next to `openModal`. Run: `npx vitest run test/ui-modals.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 2: Implement `modals.ts`**

```ts
export function shouldDismissOnKey(key: string): boolean {
  return key === 'Escape';
}

export function openModal(html: string, opts: { onClose?: () => void } = {}): () => void {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(overlay);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (shouldDismissOnKey(e.key)) close();
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector<HTMLElement>('button')?.focus();
  return close;
}
```

Then move each of the 7 modal builders from `main.ts` onto `openModal`, keeping inner HTML/ids/handlers verbatim (only `document.createElement('div')` + `className` + `appendChild` boilerplate is deleted).

- [ ] **Step 3: Verify**

Run: `npx vitest run test/ui-modals.test.ts` — Expected: PASS.
Run: `npm run typecheck` — Expected: clean.
Run: `npx playwright test test/e2e/app.spec.ts -g "help overlay"` — Expected: PASS (`?` opens, `Escape` closes).

- [ ] **Step 4: Full suite**

Run: `npm test && npm run test:e2e`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/modals.ts src/main.ts test/ui-modals.test.ts
git commit -m "refactor: consolidate modals behind openModal helper"
```

---

### Task 6: Cards extraction + responsive/a11y pass

**Files:**
- Create: `src/ui/cards.ts`
- Modify: `src/data/dashboard.ts` (delete moved `card()` helper, import from `../../ui/cards.ts`), `src/styles/responsive.css`, `src/styles/nav.css`, `index.html` (skip-link + `aria-current` + bottom-bar CSS hooks)
- Test: `test/acceptance.test.ts` (existing stat assertions), `test/e2e/app.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `export function card(label: string, value: string, sub?: string, accent?: string, small?: boolean): string` (moved verbatim from `dashboard.ts:117-130`, escaping unchanged)

- [ ] **Step 1: Move `card()` with a failing-then-passing unit check**

The helper is a pure string function, but existing coverage lives in `test/acceptance.test.ts`. First run: `npx vitest run test/acceptance.test.ts` — Expected: PASS (baseline). Then move `card()` verbatim to `src/ui/cards.ts`, update `dashboard.ts` to import it, re-run — Expected: still PASS (move is behavior-preserving by construction).

- [ ] **Step 2: Responsive shell (CSS only)**

In `src/styles/nav.css` + `responsive.css`: sidebar `.nav` (≥900px) becomes fixed bottom tab-bar (<900px) with active pill; `.toolbar .tb-row` stacks; `.dashboard` charts full-width; log tables → card rows. No DOM restructuring beyond classes already present. Verify visually via `npm run dev` at 1280/768/390px widths.

- [ ] **Step 3: A11y pass**

Add: visible `:focus-visible` rings for `.nav-tab/.tb-input/.ico-btn/button/a`; `aria-current="page"` on active nav tab in `nav.ts`; `role=dialog aria-modal` already from Task 5; `aria-live="polite"` on `#status`; keep `.skip-link`. No color-token changes.

- [ ] **Step 4: Verify everything**

Run: `npm run typecheck && npm run lint && npm run format:check` — Expected: all clean.
Run: `npm test && npm run test:property` — Expected: all PASS.
Run: `npm run build && npm run test:e2e` — Expected: build clean, all E2E PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/cards.ts src/data/dashboard.ts src/styles/ index.html src/ui/nav.ts
git commit -m "refactor: extract cards, responsive shell and a11y pass"
```

---

## File map (final state)

- `src/ui/store.ts` — `TabId, Filters, DEFAULT_FILTERS, matchesFilters, countActiveFilters`
- `src/ui/router.ts` — `TABS, parseHash, toHash`
- `src/ui/shell.ts` — dropzone states, status, progress, topbar menu wiring
- `src/ui/nav.ts` — `buildNav` + hash sync
- `src/ui/toolbar.ts` — filters UI + meter + reset
- `src/ui/modals.ts` — `openModal, shouldDismissOnKey` + 7 dialog builders
- `src/ui/cards.ts` — `card()`
- `src/styles/*.css` — `tokens, shell, nav, toolbar, cards, modals, responsive`
- `src/main.ts` — boot + ingest + persistence + wiring only (target <400 lines)
- `src/data/dashboard.ts` — charts + tab renderers only (imports `card()`)

## Self-review

- Spec coverage: architecture split → Tasks 1/4/5/6; shell+nav → Task 4; toolbar regroup → Task 4; overflow menu → Task 4 Step 3; tokens/components → Task 3; a11y → Task 6 Step 3; data-flow/error handling → Tasks 1/4 (predicate parity, unknown-hash fallback in `parseHash`); testing/rollout order → Tasks 1–6 sequence. Non-goals (framework, deps, i18n renames, filter-URL-sync, chart swap) appear in no task. Gap check: `intensity` predicate stays HR-histogram-based in `main.ts` (noted in Task 1) — no behavior change, no gap.
- Placeholder scan: no TBD/TODO; every step has exact code, exact commands, expected outputs.
- Type consistency: `TabId`/`Filters` defined once in `store.ts`, imported by `router.ts`/Tasks 4–6; `parseHash`/`toHash` signatures match Task 4 usage; `card()` signature matches `dashboard.ts:117` original.
