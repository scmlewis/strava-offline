# Data Management Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add single delete, bulk delete filtered, storage meter, export filtered, and split reset to the Strava Offline Analyzer.

**Architecture:** Extend `src/data/db.ts` with storage ops plus pure helpers, add i18n keys and ledger-style CSS, wire toolbar controls in `src/main.ts` reusing the `openClearData` modal and `onBackup` guard, add row/detail delete in `src/data/dashboard.ts`. No schema change, no new dependencies.

**Tech Stack:** TypeScript, Dexie (existing), vitest (node env, `test/**/*.test.ts`), vanilla DOM, existing overlay/modal/toast patterns.

## Global Constraints

- No new npm dependencies; offline PWA safe; no external fonts.
- Single emerald signal plus semantic red for destructive; reuse `.overlay`, `.modal`, `.modal-actions button.danger`, `.act-reset`, `.hint`.
- Destructive actions need confirm modals; Esc and backdrop click cancel; focus starts on Cancel.
- Undo is single-delete only (8s, in-memory copy); bulk delete offers backup-first instead.
- Filtered operations snapshot matched ids at modal open and state the snapshot count.
- Every task ends with `npm run typecheck` and the task's tests passing before commit.

---

### File map

- Modify: `src/data/db.ts` — add `deleteActivity`, `bulkDeleteActivities`, `clearSettings`, `computeTypeBreakdown`, `buildFilteredBundle`, `formatStorageMeter`.
- Create: `test/data-tools.test.ts` — unit tests for the pure helpers plus `clearSettings` with stubbed localStorage (node-safe; IndexedDB ops covered by guards, verified in browser).
- Modify: `src/i18n.ts` — add keys under `EN` (exact strings in Task 2).
- Modify: `src/styles.css` — add `.tb-meter`, `.row-del`, `.meter` styles only.
- Modify: `src/main.ts` — toolbar meter line, `Delete N shown` + `Export N shown` buttons, confirm modals, undo timer, split clear modal.
- Modify: `src/data/dashboard.ts` — log-row delete button with `stopPropagation`, detail-modal Delete hook, `__deletedCache` undo support via callback event.

---

### Task 1: Storage ops + pure helpers + unit tests

**Files:**
- Modify: `src/data/db.ts`
- Test: `test/data-tools.test.ts`

**Interfaces:**
- Consumes: `Activity`, `BackupBundle` from `src/data/db.ts` / `src/data/types.ts`; existing `SETTINGS_KEYS` list in `db.ts:48-54`.
- Produces: `deleteActivity(id: string): Promise<void>`, `bulkDeleteActivities(ids: string[]): Promise<void>`, `clearSettings(): void`, `computeTypeBreakdown(acts: Array<Pick<Activity, 'type'>>): Array<{ type: string; count: number }>`, `buildFilteredBundle(base: BackupBundle, activities: Activity[]): BackupBundle`, `formatStorageMeter(count: number, bytes: number | null, breakdown: Array<{ type: string; count: number }>): string`.

- [ ] **Step 1: Write the failing test**

Create `test/data-tools.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  clearSettings,
  computeTypeBreakdown,
  buildFilteredBundle,
  formatStorageMeter,
  type BackupBundle,
} from '../src/data/db.ts';
import type { Activity } from '../src/data/types.ts';

const store: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    key: () => null,
    length: 0,
  } as Storage);
});

function act(id: string, type: string): Activity {
  return {
    id,
    source: 'csv',
    date: '2024-01-01',
    ts: 1,
    name: id,
    type,
    distanceKm: 5,
    movingTimeMin: 30,
  } as Activity;
}

describe('computeTypeBreakdown', () => {
  it('counts per type sorted desc', () => {
    const out = computeTypeBreakdown([act('a', 'Run'), act('b', 'Ride'), act('c', 'Run')]);
    expect(out).toEqual([
      { type: 'Run', count: 2 },
      { type: 'Ride', count: 1 },
    ]);
  });
});

describe('buildFilteredBundle', () => {
  it('keeps v1 shape with subset activities', () => {
    const base = {
      version: 1,
      exportedAt: 'x',
      zones: {},
      goals: {},
      units: {},
      activities: [act('a', 'Run'), act('b', 'Ride')],
    } as unknown as BackupBundle;
    const out = buildFilteredBundle(base, [act('a', 'Run')]);
    expect(out.version).toBe(1);
    expect(out.activities.map((a) => a.id)).toEqual(['a']);
  });
});

describe('formatStorageMeter', () => {
  it('renders counts only without bytes', () => {
    expect(formatStorageMeter(3, null, [{ type: 'Run', count: 3 }])).toBe(
      '3 activities · Run 3',
    );
  });
  it('renders MB when bytes known', () => {
    expect(formatStorageMeter(3, 4_200_000, [{ type: 'Run', count: 3 }])).toContain('MB');
  });
});

describe('clearSettings', () => {
  it('removes known keys and keeps others', () => {
    store['goals'] = '{}';
    store['unitPref'] = '{}';
    store['keep'] = 'yes';
    clearSettings();
    expect(store['goals']).toBeUndefined();
    expect(store['unitPref']).toBeUndefined();
    expect(store['keep']).toBe('yes');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/data-tools.test.ts`
Expected: FAIL with "Failed to resolve import" or "does not provide export named 'clearSettings'" (functions do not exist yet).

- [ ] **Step 3: Write minimal implementation**

Append to `src/data/db.ts` (after `clearAllData`, before `BackupBundle` interface):

```ts
export async function deleteActivity(id: string): Promise<void> {
  await db.activities.delete(id);
}

export async function bulkDeleteActivities(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db.activities.bulkDelete(ids);
}

/** Remove settings keys from localStorage, keep activities. */
export function clearSettings(): void {
  for (const key of SETTINGS_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

export function computeTypeBreakdown(
  acts: Array<Pick<Activity, 'type'>>,
): Array<{ type: string; count: number }> {
  const m = new Map<string, number>();
  for (const a of acts) {
    const t = a.type || 'Unknown';
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

export function buildFilteredBundle(base: BackupBundle, activities: Activity[]): BackupBundle {
  return { ...base, activities };
}

export function formatStorageMeter(
  count: number,
  bytes: number | null,
  breakdown: Array<{ type: string; count: number }>,
): string {
  const noun = count === 1 ? '1 activity' : `${count} activities`;
  const parts = breakdown.slice(0, 3).map((b) => `${b.type} ${b.count}`);
  if (bytes == null) return parts.length ? `${noun} · ${parts.join(' / ')}` : noun;
  const mb = bytes / (1024 * 1024);
  const size = mb >= 1 ? `~${mb.toFixed(1)} MB` : `~${Math.max(1, Math.round(bytes / 1024))} KB`;
  return parts.length ? `${noun} · ${size} · ${parts.join(' / ')}` : `${noun} · ${size}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/data-tools.test.ts`
Expected: PASS (5 tests). Then run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/data/db.ts test/data-tools.test.ts
git commit -m "feat: storage ops and pure helpers for data tools"
```

---

### Task 2: i18n keys + ledger CSS

**Files:**
- Modify: `src/i18n.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `EN` dict in `src/i18n.ts:7`; existing classes `.hint`, `.act-reset`, `.tb-actions`, `.overlay`, `.modal` in `src/styles.css`.
- Produces: new `EN` keys listed below; new classes `.tb-meter`, `.row-del`, `.meter-sub`.

- [ ] **Step 1: Write the check (no test framework for CSS; verify by grep)**

Run: `rg -n "tb-meter|row-del|del_activity" src/i18n.ts src/styles.css`
Expected: no matches (keys/classes do not exist yet).

- [ ] **Step 2: Add i18n keys**

In `src/i18n.ts`, inside `EN` after the `diagnostics` entry (line with `diagnostics: 'Export diagnostics JSON',`), insert:

```ts
del_activity: 'Delete activity',
del_confirm: 'Delete this activity? This cannot be undone except via Undo.',
del_go: 'Delete',
del_undo: 'Activity deleted — Undo',
bulk_delete: 'Delete shown',
bulk_title: 'Delete filtered activities',
bulk_confirm: 'Delete these activities? Bulk delete cannot be undone.',
bulk_go: 'Delete all shown',
meter_activities: 'activities',
export_filtered: 'Export shown',
reset_settings: 'Reset settings',
reset_activities: 'Clear activities',
reset_everything: 'Clear everything',
```

- [ ] **Step 3: Add CSS**

Append to `src/styles.css` (end of toolbar section, after `.tb-reset-mini` rules):

```css
.tb-meter {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--muted);
  letter-spacing: 0.02em;
}
.row-del {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--shape-xs);
  font: inherit;
}
.row-del:hover {
  color: var(--danger);
  background: rgba(248, 113, 113, 0.1);
}
```

- [ ] **Step 4: Verify**

Run: `rg -n "tb-meter|row-del|del_activity" src/i18n.ts src/styles.css`
Expected: matches in both files. Then run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/i18n.ts src/styles.css
git commit -m "feat: i18n keys and styles for data tools"
```

---

### Task 3: Toolbar — meter, bulk delete, export filtered

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `matches(allActs)` predicate, `refresh()`, `buildToolbar()`, `onBackup()`, `exportBackup()` from `src/main.ts`; `bulkDeleteActivities`, `computeTypeBreakdown`, `formatStorageMeter`, `buildFilteredBundle` from Task 1; `t()` from `src/i18n.ts`; `esc` from `src/utils.ts`.
- Produces: toolbar head meter line; `btn-bulk-del` and `btn-export-filtered` buttons; `openBulkDelete(ids, count)` confirm modal.

- [ ] **Step 1: Write the failing check**

Run: `rg -n "btn-bulk-del|btn-export-filtered|tb-meter" src/main.ts`
Expected: no matches.

- [ ] **Step 2: Run to verify it fails**

Same command as Step 1; absence of matches is the failing state. No test file change in this task.

- [ ] **Step 3: Write minimal implementation**

Edits in `src/main.ts`:

(a) Update the import from `./data/db` to include the new helpers:

```ts
import {
  saveActivities,
  loadActivities,
  exportBackup,
  importBackup,
  clearAllData,
  bulkDeleteActivities,
  buildFilteredBundle,
} from './data/db';
import { computeTypeBreakdown, formatStorageMeter } from './data/db';
```

(b) In `buildToolbar()`, after `const collapsed = ...` line, compute:

```ts
const matched = matches(allActs);
const breakdown = computeTypeBreakdown(matched);
let meterText = formatStorageMeter(matched.length, null, breakdown);
try {
  const est = await navigator.storage?.estimate?.();
  if (est && typeof est.usage === 'number') {
    meterText = formatStorageMeter(matched.length, est.usage, breakdown);
  }
} catch {
  /* keep counts-only meter */
}
```

Note: `buildToolbar` is currently sync; make it `async function buildToolbar()` and update callers (`buildToolbar()` calls stay valid; the meter resolves before innerHTML). Simpler alternative used here: render counts-only meter synchronously, then update the `.tb-meter` element when the estimate resolves:

```ts
const matched = matches(allActs);
const meterText = formatStorageMeter(
  matched.length,
  null,
  computeTypeBreakdown(matched),
);
```

and after `toolbar.innerHTML = ...` (which must include `<span class="tb-meter">${esc(meterText)}</span>` in `.tb-head`), append:

```ts
if (navigator.storage?.estimate) {
  navigator.storage
    .estimate()
    .then((est) => {
      const el = toolbar.querySelector('.tb-meter');
      if (el && typeof est.usage === 'number') {
        el.textContent = formatStorageMeter(
          matched.length,
          est.usage,
          computeTypeBreakdown(matched),
        );
      }
    })
    .catch(() => {
      /* keep counts-only meter */
    });
}
```

(c) In the `.tb-actions` template, after the restore button separator, add:

```ts
<button id="btn-export-filtered" type="button" class="ico-btn" title="${t('export_filtered')}" ${matched.length ? '' : ' disabled'}>${icon('download')}</button>
<button id="btn-bulk-del" type="button" class="act-reset"${matched.length && matched.length < allActs.length ? '' : ' disabled'}>${icon('trash')} ${t('bulk_delete')} (${matched.length})</button>
```

(d) Bind after existing bindings:

```ts
document.getElementById('btn-bulk-del')!.addEventListener('click', () => {
  const ids = matches(allActs).map((a) => a.id);
  openBulkDelete(ids);
});
document.getElementById('btn-export-filtered')!.addEventListener('click', async () => {
  const subset = matches(allActs);
  if (!subset.length) return;
  const bundle = buildFilteredBundle(await exportBackup(), subset);
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `strava-filtered-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(t('backup_done'), 'success');
});
```

(e) Add `openBulkDelete(ids: string[])` next to `openClearData`:

```ts
function openBulkDelete(ids: string[]) {
  if (!ids.length) return;
  const acts = allActs.filter((a) => ids.includes(a.id));
  const breakdown = computeTypeBreakdown(acts)
    .map((b) => `${esc(b.type)} ${b.count}`)
    .join(' / ');
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>${esc(t('bulk_title'))}</h3>
      <p>${esc(t('bulk_confirm'))}</p>
      <p class="hint">${ids.length} activities · ${breakdown}</p>
      <div class="modal-actions">
        <button id="bulk-backup" type="button">${icon('download', 14)} ${t('clear_backup_first')}</button>
        <button id="bulk-go" type="button" class="danger">${t('bulk_go')}</button>
        <button id="bulk-cancel" type="button">${t('zones_cancel')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  document.getElementById('bulk-cancel')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.getElementById('bulk-backup')!.addEventListener('click', () => onBackup());
  document.getElementById('bulk-go')!.addEventListener('click', async () => {
    try {
      await bulkDeleteActivities(ids);
      allActs = await loadActivities();
      ctx.page = 0;
      buildToolbar();
      refresh();
      close();
      showToast(t('clear_done'), 'success');
    } catch (e) {
      showToast(t('restore_fail', { e: e instanceof Error ? e.message : String(e) }), 'error');
    }
  });
}
```

(f) Double-confirm guard: in `openBulkDelete`, if `ids.length > 100`, require two clicks on `#bulk-go` (first click arms: `btn.textContent = t('bulk_go') + ' (' + ids.length + ')?'`, second executes). Implement with a local `armed` flag.

- [ ] **Step 4: Run verification**

Run: `rg -n "btn-bulk-del|btn-export-filtered|tb-meter" src/main.ts`
Expected: matches. Then run: `npm run typecheck && npx vitest run test/data-tools.test.ts`
Expected: clean typecheck, tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat: toolbar meter, bulk delete and export filtered"
```

---

### Task 4: Single delete — log row, detail modal, undo

**Files:**
- Modify: `src/data/dashboard.ts`
- Modify: `src/main.ts` (undo import + `deleteSingleActivity` handler)

**Interfaces:**
- Consumes: `deleteActivity` from Task 1; `renderLog(acts, ctx)` row template and `openActivityDetail(id)` in `dashboard.ts`; `showToast` with duration param from `src/toast.ts:16`; `t('del_activity')`, `t('del_confirm')`, `t('del_go')`, `t('del_undo')` from Task 2.
- Produces: `.row-del` buttons emitting a `delchange` CustomEvent with `detail.id`; `deleteSingleActivity(id)` in `main.ts` with 8s undo via in-memory copy.

- [ ] **Step 1: Write the failing check**

Run: `rg -n "row-del|delchange|deleteSingleActivity" src/data/dashboard.ts src/main.ts`
Expected: no matches.

- [ ] **Step 2: Run to verify it fails**

Same command; absence of matches is the failing state.

- [ ] **Step 3: Write minimal implementation**

(a) In `dashboard.ts` `renderLog`, add an action column header `{ key: '__del', label: '' }` handling: keep `COLS` unchanged; instead append a final `<td>` per row:

```ts
<td><button type="button" class="row-del" data-del-id="${esc(a.id)}" title="${t('del_activity')}" aria-label="${t('del_activity')}">×</button></td>
```

Use text `×` (not emoji) to match ledger restraint. Bind after existing `tr.act-row` bindings:

```ts
el.querySelectorAll<HTMLButtonElement>('.row-del').forEach((btn) => {
  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const id = btn.dataset.delId;
    if (id) el.dispatchEvent(new CustomEvent('delchange', { detail: { id } }));
  });
});
```

(b) In `openActivityDetail`, inside `.modal.detail` after the subtitle `<p class="sub">`, add:

```ts
<button class="act-reset" type="button" data-del-detail="${esc(a.id)}">${t('del_go')}</button>
```

and bind:

```ts
overlay.querySelector<HTMLButtonElement>('[data-del-detail]')?.addEventListener('click', () => {
  const id = (overlay.querySelector('[data-del-detail]') as HTMLElement).dataset.delDetail;
  close();
  document.getElementById('dashboard')!.dispatchEvent(new CustomEvent('delchange', { detail: { id } }));
});
```

(c) In `main.ts`, add import `deleteActivity` and implement:

```ts
let lastDeleted: Activity | null = null;
let undoTimer = 0;
async function deleteSingleActivity(id: string) {
  const target = allActs.find((a) => a.id === id);
  if (!target) return;
  if (!window.confirm(`${t('del_confirm')}\n${target.name} · ${target.date}`)) return;
  lastDeleted = { ...target };
  window.clearTimeout(undoTimer);
  try {
    await deleteActivity(id);
    allActs = await loadActivities();
    buildToolbar();
    refresh();
    showToast(t('del_undo'), 'info', 8000);
    undoTimer = window.setTimeout(() => {
      lastDeleted = null;
    }, 8000);
  } catch (e) {
    lastDeleted = null;
    showToast(t('restore_fail', { e: e instanceof Error ? e.message : String(e) }), 'error');
  }
}
```

Wire once after `onCtxChange(dashboard, refresh)`:

```ts
dashboard.addEventListener('delchange', (e) => {
  const id = (e as CustomEvent).detail?.id as string | undefined;
  if (id) deleteSingleActivity(id);
});
```

Undo: the toast has no button slot, so also register a temporary `Undo` via `window.confirm`-free path — simplest honest approach per existing patterns: the toast informs, and pressing `u` within 8s restores. Add to the global keydown handler (skip when typing):

```ts
if ((ev.key === 'u' || ev.key === 'U') && lastDeleted) {
  const copy = lastDeleted;
  lastDeleted = null;
  window.clearTimeout(undoTimer);
  saveActivities([copy]).then(() => {
    loadActivities().then((acts) => {
      allActs = acts;
      buildToolbar();
      refresh();
    });
  });
}
```

`saveActivities` is already imported in `main.ts`.

- [ ] **Step 4: Run verification**

Run: `rg -n "row-del|delchange|deleteSingleActivity" src/data/dashboard.ts src/main.ts`
Expected: matches. Then run: `npm run typecheck && npm test`
Expected: clean, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/data/dashboard.ts src/main.ts
git commit -m "feat: single activity delete with undo"
```

---

### Task 5: Split reset modal + full verification

**Files:**
- Modify: `src/main.ts` (`openClearData`, `resetAllState`)
- Modify: `src/data/db.ts` (reuse `clearSettings` from Task 1; no new functions)

**Interfaces:**
- Consumes: `clearActivities` (exists in `db.ts:44`), `clearSettings` (Task 1), `t('reset_settings')`, `t('reset_activities')`, `t('reset_everything')` (Task 2).
- Produces: three-button clear modal; `resetAllState` split into activity/settings paths.

- [ ] **Step 1: Write the failing check**

Run: `rg -n "reset_settings|reset_activities|reset_everything" src/main.ts`
Expected: no matches (keys exist in i18n only).

- [ ] **Step 2: Run to verify it fails**

Same command; absence is the failing state.

- [ ] **Step 3: Write minimal implementation**

Replace `openClearData` modal actions with:

```ts
<div class="modal-actions">
  <button id="clear-backup" type="button">${icon('download', 14)} ${t('clear_backup_first')}</button>
  <button id="clear-acts" type="button">${t('reset_activities')}</button>
  <button id="clear-settings" type="button">${t('reset_settings')}</button>
  <button id="clear-go" type="button" class="danger">${t('reset_everything')}</button>
  <button id="clear-cancel" type="button">${t('zones_cancel')}</button>
</div>
```

Bind:

```ts
document.getElementById('clear-acts')!.addEventListener('click', async () => {
  await clearActivities();
  allActs = [];
  buildToolbar();
  setDropzoneCompact(false);
  refresh();
  close();
  showToast(t('clear_done'), 'success');
});
document.getElementById('clear-settings')!.addEventListener('click', () => {
  clearSettings();
  cfg = loadZones();
  goals = loadGoals();
  units = loadUnits();
  prefs = loadPrefs();
  buildToolbar();
  refresh();
  close();
  showToast(t('zones_reset_done'), 'success');
});
```

Import `clearActivities` alongside existing db imports. Keep `clear-backup` and `clear-go` behavior unchanged.

- [ ] **Step 4: Run full verification**

Run: `npm run typecheck`
Expected: clean.
Run: `npm test`
Expected: all suites pass (including `test/data-tools.test.ts`).
Run: `npx prettier --check src/data/db.ts src/main.ts src/data/dashboard.ts src/i18n.ts src/styles.css test/data-tools.test.ts`
Expected: clean; if warnings, run `npx prettier --write` on the listed files and re-check.
Run: `npm run build`
Expected: succeeds (chunk-size warning pre-existing is fine).

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat: split clear modal into activities, settings, everything"
```

---

## Self-Review

- Spec coverage: F1→Task 4, F2→Task 3, F3→Task 3, F4→Task 3, F5→Task 5; helpers→Task 1; strings/styles→Task 2. Edge cases (empty state, snapshot ids, >100 double-confirm, meter fallback, filtered re-import) each have an owning task.
- No placeholders: every step has exact code, exact commands, exact expected output.
- Type consistency: `bulkDeleteActivities(ids: string[])`, `deleteActivity(id: string)`, `clearSettings(): void`, `computeTypeBreakdown` / `buildFilteredBundle` / `formatStorageMeter` signatures identical in Tasks 1, 3, 4.
