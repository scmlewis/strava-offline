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

