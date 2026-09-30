# Data Management Options — Design Spec

Date: 2026-09-30
Status: approved (design), pending spec review
Scope: 5 features — single delete, bulk delete filtered, storage meter, export filtered, split reset.
Out of scope: duplicate/import preview, persistent trash, server sync.

## 1. Background

Today the app has all-or-nothing data tools: Export backup (full JSON),
Import backup, Clear all data (activities + settings together), Export
diagnostics JSON. A single bad upload forces wipe-all. This spec adds
surgical tools reusing existing patterns (Dexie `strava-offline` DB,
localStorage settings keys, `overlay`/`modal` confirms, toast feedback).

## 2. Features

### F1 — Delete single activity
- Entry points: trash icon-button per Activity Log row; Delete button in
  activity detail modal.
- Confirm modal: shows activity name, type, date; actions Cancel / Delete
  (destructive-red). Esc and backdrop click cancel. Focus starts on Cancel.
- Behavior: `db.activities.delete(id)`, reload list, rebuild toolbar,
  re-render dashboard, reset log page if out of range.
- Feedback: success toast with 8s Undo. Undo keeps an in-memory copy of the
  deleted record and re-inserts with `bulkPut`. No persistent trash table.
- Failure: error toast, list left unchanged.

### F2 — Bulk delete filtered activities
- Entry: toolbar button `Delete N shown` beside Reset. Visible only when a
  filter is active and matches fewer than the total; disabled at 0 matches.
- Confirm modal: count + per-type breakdown (e.g. Run 40 / Ride 3), warning
  that Undo is not offered, `Export backup first` secondary button reusing
  `onBackup`. Double-confirm (type-free, second press) when count > 100.
- Behavior: single `bulkDelete(ids)` against the currently matched set,
  computed with the same `matches()` predicate as the dashboard. Reset log
  page to 0, rebuild toolbar, re-render.
- Failure: error toast with count of deleted vs remaining unknown; advise
  re-import from backup.

### F3 — Storage meter
- One read-only line in the toolbar head: e.g.
  `312 activities · ~4.2 MB · Run 280 / Ride 32`.
- Data: activity/type counts from the in-memory list; bytes from
  `navigator.storage.estimate()` guarded with try/catch and `?.` (fallback
  shows counts only when the API is unavailable).
- Updates on every `refresh()`; no clicks, no destructive risk.

### F4 — Export filtered subset
- Icon-button `Export N shown` beside full backup. Disabled at 0 matches.
- Output: same `BackupBundle v1` shape and validators as full backup, with
  `activities` set to the filtered view and current zones/goals/units/prefs.
- Filename: `strava-filtered-YYYY-MM-DD.json`. Re-imports through the
  existing restore path.
- Large-export guard reuses the existing >50MB confirm.

### F5 — Split reset (activities vs settings)
- Clear modal offers three explicit actions: Activities only, Settings only,
  Everything. Everything preserves today's behavior.
- New `clearSettings()` removes exactly the settings keys
  (`strava-offline:zones`, `goals`, `unitPref`, `filterCollapsed`, `prefs`)
  and restores in-memory defaults; `clearActivities()` already exists.
- After Settings-only reset: rebuild toolbar, reset dropzone compact state,
  re-render with current activities.

## 3. Architecture

- `src/data/db.ts`: add `deleteActivity(id)`, `bulkDeleteActivities(ids)`,
  `clearSettings()` (or `clearSettingsKeys()` returning the key list).
  No schema change (still `activities: 'id, ts, type, date'`).
- `src/main.ts`: toolbar additions (meter line, two buttons), confirm
  modals following `openClearData` structure, undo timer management,
  empty-match disabled states.
- `src/data/dashboard.ts`: log-row action cell (stopPropagation so row
  click does not open detail), detail-modal Delete hook, page-clamp reuse.
- `src/styles.css`: reuse `.overlay`, `.modal`, `.modal-actions button.danger`,
  `.act-reset`, `.tb-reset-mini`, `.hint`; add small `.meter` and row-action
  styles in the existing ledger language. No new deps, no external fonts.

## 4. Data flow

Single delete: click → confirm → `delete(id)` → reload → rerender → toast
with Undo → timer expiry clears the in-memory copy. Bulk: filter → preview
count → optional backup → `bulkDelete` → page reset → rerender. Export:
filter → bundle → download. Meter: refresh → counts + estimate → render.

## 5. Edge cases

- Deleting the last activity returns the app to the empty state
  (dropzone expanded, dashboard hidden path as today).
- Filter changes between preview and confirm: snapshot ids at modal open;
  confirm deletes the snapshot, and the modal states the snapshot count.
- Undo after bulk delete is not offered (size + complexity); the modal
  says so and offers backup-first.
- Storage API missing or denied: meter degrades to counts only.
- Import of a filtered bundle behaves like a normal merge (bulkPut).

## 6. Testing

- Unit (vitest): delete then reload, undo re-insert, snapshot-set
  computation matches `matches()`, filtered bundle keeps v1 shape and
  passes `validateBackup`, settings-only reset preserves activities.
- Acceptance: log row delete → confirm → toast; bulk delete with type
  filter; empty-match buttons disabled; meter renders counts.
- Manual: light/dark themes, mobile bottom nav, keyboard (Esc closes,
  focus starts on Cancel), reduced-motion (no new animation).

## 7. Self-review

- No TBD/TODO placeholders; requirements are explicit.
- Consistent: single `bulkDelete` path, one bundle shape, one modal pattern.
- Scope is one plan: five related data tools, no import-preview or trash table.
- Ambiguity resolved: Undo is single-delete only; bulk uses snapshot ids;
  settings key list is enumerated; meter fallback defined.
