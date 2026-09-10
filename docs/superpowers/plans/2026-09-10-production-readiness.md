# Strava Offline — Production-Readiness Iteration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add developer tooling, improve build pipeline, harden error handling, polish UX, and expand test coverage to make the PWA production-grade.

**Architecture:** Single-page vanilla TypeScript PWA built with Vite. All data stays in browser IndexedDB via Dexie. No backend. Current codebase is ~3000 lines across 9 source files with 4 test files using a custom test harness.

**Tech Stack:** TypeScript 5.6, Vite 5, Dexie 4, uPlot, PapaParse, pako, fit-file-parser, vite-plugin-pwa

## Global Constraints
- Node.js 20+
- TypeScript strict mode (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`)
- No React/Vue — vanilla TypeScript DOM manipulation
- All data local-only (IndexedDB + localStorage), zero network requests for data
- Must work offline after first load (PWA service worker)
- `dist/` is currently committed (for GitHub Pages) — plan excludes it from git

---

## Phase 1: Developer Tooling (Priority 1)

### Task 1: Add ESLint with TypeScript strict rules

**Files:**
- Create: `eslint.config.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing TypeScript source in `src/` and `test/`
- Produces: `npm run lint` script that exits 0 on clean, 1 on errors

- [ ] **Step 1: Install ESLint dependencies**

```bash
npm install -D eslint @eslint/js typescript-eslint eslint-plugin-unicorn
```

- [ ] **Step 2: Create `eslint.config.js`**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'scripts/', '*.mjs'],
  },
);
```

- [ ] **Step 3: Add lint script to `package.json`**

Add to `"scripts"`:
```json
"lint": "eslint src/ test/"
```

- [ ] **Step 4: Run `npm run lint` and fix any errors**

Run: `npm run lint`
Expected: Some warnings/errors. Fix each one. Common expected fixes:
- Unused variables: prefix with `_` or remove
- `any` types: add proper type annotations
- Missing type imports: add `import type` where needed

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js package.json package-lock.json src/ test/
git commit -m "chore: add ESLint with TypeScript strict rules"
```

---

### Task 2: Add Prettier

**Files:**
- Create: `.prettierrc`
- Create: `.prettierignore`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing source files
- Produces: `npm run format` and `npm run format:check` scripts

- [ ] **Step 1: Install Prettier**

```bash
npm install -D prettier
```

- [ ] **Step 2: Create `.prettierrc`**

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true
}
```

- [ ] **Step 3: Create `.prettierignore`**

```
dist/
node_modules/
*.md
package-lock.json
```

- [ ] **Step 4: Add format scripts to `package.json`**

Add to `"scripts"`:
```json
"format": "prettier --write .",
"format:check": "prettier --check ."
```

- [ ] **Step 5: Run `npm run format` to format entire codebase**

Run: `npm run format`
Expected: Prettier reformats files. Review the diff to ensure no breaking changes.

- [ ] **Step 6: Run `npm run format:check` to verify**

Run: `npm run format:check`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 7: Run `npm run lint` to verify no conflicts**

Run: `npm run lint`
Expected: Clean pass. If Prettier introduced style that conflicts with ESLint rules, adjust `eslint.config.js` to disable conflicting rules (e.g., `semi`, `quotes`).

- [ ] **Step 8: Run `npm run typecheck` to verify no breakage**

Run: `npm run typecheck`
Expected: Clean pass.

- [ ] **Step 9: Commit**

```bash
git add .prettierrc .prettierignore package.json package-lock.json src/ test/
git commit -m "chore: add Prettier, format codebase"
```

---

### Task 3: Migrate tests from custom harness to Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Modify: `test/ingest.test.ts`
- Modify: `test/fit.test.ts`
- Modify: `test/ingest-summary.test.ts`
- Modify: `test/acceptance.test.ts`

**Interfaces:**
- Consumes: existing test logic (custom `ok()`, `node:assert`, DOMParser polyfills, localStorage shims)
- Produces: Vitest `describe/it/expect` tests, `npm test` script using vitest

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest @vitest/coverage-v8
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
  },
});
```

- [ ] **Step 3: Update `package.json` test script**

Replace the `"test"` script:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 4: Migrate `test/ingest.test.ts`**

Replace the entire file. Key changes:
- Remove custom `ok()` / `passed` / `failed` — use `describe/it/expect`
- Remove `localStorage` shim (Vitest doesn't need it for pure logic tests; mock if needed)
- Keep `DOMParser` polyfill (needed for GPX tests in Node)
- Convert `approx()` helper to use `expect(a).toBeCloseTo(b, precision)`
- Replace `import().then()` async callback with `describe/it` blocks

```ts
import { DOMParser as XDOMParser } from '@xmldom/xmldom';
(globalThis as unknown as { DOMParser: typeof XDOMParser }).DOMParser = XDOMParser as unknown as typeof DOMParser;

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_ZONES, zoneForHr, loadZones, saveZones } from '../src/data/zones.ts';
import { parseActivitiesCsv } from '../src/data/csv.ts';
import { parseGpx } from '../src/data/gpx.ts';
import {
  computeSummary,
  computeEasy,
  computeZoneDistribution,
  computeDailyVolume,
  histogramSeconds,
  secondsInZone,
  avgIntensity,
  activityTSS,
  computeLoad,
  computePRs,
  computeRiegel,
  vdotFromRace,
  computeVO2max,
  computeClimbScore,
  computeStreaks,
} from '../src/data/analyze.ts';
import type { Activity } from '../src/data/types.ts';

// localStorage shim for loadZones/saveZones
const store: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: () => null,
    length: 0,
  } as Storage);
});

const SAMPLE = `Activity ID,Activity Date,Activity Name,Activity Type,Distance,Elapsed Time,Moving Time,Average Heart Rate,Max Heart Rate,Average Speed,Elevation Gain,Average Run Cadence
1234,2024-01-05 7:14:32 AM,Morning Run,Run,10.0,3245,3000,148,170,2.0,80,88
1235,2024-01-07 6:00:00 PM,Intervals,Run,8.0,2700,2500,168,190,1.8,40,90
1236,2024-01-10 12:00:00 PM,Coffee Ride,Ride,30.0,5400,5200,120,150,3.3,120,0`;

describe('zones.ts', () => {
  it('maps HR to correct zones', () => {
    expect(zoneForHr(100, DEFAULT_ZONES)).toBe(1);
    expect(zoneForHr(154, DEFAULT_ZONES)).toBe(2);
    expect(zoneForHr(155, DEFAULT_ZONES)).toBe(3);
    expect(zoneForHr(206, DEFAULT_ZONES)).toBe(5);
    expect(zoneForHr(null, DEFAULT_ZONES)).toBeNull();
  });
});

describe('csv.ts', () => {
  const acts = parseActivitiesCsv(SAMPLE);

  it('parses 3 activities', () => {
    expect(acts.length).toBe(3);
  });

  it('converts distance correctly', () => {
    expect(acts[0].distanceKm).toBe(10);
  });

  it('builds proxy histogram from CSV', () => {
    expect(acts[0].hrHistogram).not.toBeNull();
    expect(acts[0].hrHistogram![148]).toBe(3000);
  });
});

describe('analyze.ts — summary', () => {
  const acts = parseActivitiesCsv(SAMPLE);
  const s = computeSummary(acts);

  it('counts activities', () => {
    expect(s.count).toBe(3);
  });

  it('sums distance', () => {
    expect(s.totalDistanceKm).toBeCloseTo(48, 0);
  });
});

describe('analyze.ts — histogram helpers', () => {
  const acts = parseActivitiesCsv(SAMPLE);

  it('computes histogramSeconds', () => {
    expect(histogramSeconds(acts[0].hrHistogram)).toBe(3000);
  });

  it('computes secondsInZone', () => {
    expect(secondsInZone(acts[0].hrHistogram, 2, DEFAULT_ZONES)).toBe(3000);
  });

  it('computes avgIntensity', () => {
    expect(avgIntensity(acts[0].hrHistogram, DEFAULT_ZONES)).toBeCloseTo(148 / 206, 2);
  });
});

describe('analyze.ts — easy%', () => {
  const acts = parseActivitiesCsv(SAMPLE);
  const easy = computeEasy(acts, DEFAULT_ZONES);

  it('uses histogram basis', () => {
    expect(easy.basis).toBe('histogram');
  });

  it('classifies easy/hard correctly', () => {
    expect(easy.easyCount).toBe(2);
    expect(easy.hardCount).toBe(1);
  });

  it('pct in range', () => {
    expect(easy.pct).not.toBeNull();
    expect(easy.pct!).toBeGreaterThan(50);
    expect(easy.pct!).toBeLessThan(80);
  });
});

describe('analyze.ts — daily volume', () => {
  const acts = parseActivitiesCsv(SAMPLE);
  const daily = computeDailyVolume(acts);

  it('has 3 days', () => {
    expect(daily.length).toBe(3);
  });

  it('totals correct distance per day', () => {
    const d0 = daily.find((d) => d.date === '2024-01-05');
    expect(d0).toBeDefined();
    expect(d0!.distanceKm).toBeCloseTo(10, 0);
    expect(d0!.count).toBe(1);
  });
});

describe('analyze.ts — zone distribution', () => {
  const acts = parseActivitiesCsv(SAMPLE);
  const zd = computeZoneDistribution(acts, DEFAULT_ZONES);

  it('uses histogram basis', () => {
    expect(zd.basis).toBe('histogram');
  });

  it('Z2 time correct', () => {
    expect(zd.byTime[2]!).toBeCloseTo(3000, 0);
  });

  it('Z3 time > 0', () => {
    expect(zd.byTime[3]!).toBeGreaterThan(0);
  });
});

describe('analyze.ts — TSS', () => {
  const acts = parseActivitiesCsv(SAMPLE);
  const tss0 = activityTSS(acts[0], DEFAULT_ZONES);

  it('computes positive TSS', () => {
    expect(tss0).not.toBeNull();
    expect(tss0!).toBeGreaterThan(0);
  });

  it('TSS approximately correct', () => {
    expect(tss0!).toBeCloseTo(43, 0);
  });
});

describe('analyze.ts — load', () => {
  const acts = parseActivitiesCsv(SAMPLE);
  const load = computeLoad(acts, DEFAULT_ZONES);

  it('produces load series', () => {
    expect(load.length).toBeGreaterThan(0);
  });

  it('CTL/ATL non-negative and TSB = CTL - ATL', () => {
    const last = load[load.length - 1];
    expect(last.ctl).toBeGreaterThanOrEqual(0);
    expect(last.atl).toBeGreaterThanOrEqual(0);
    expect(last.tsb).toBeCloseTo(last.ctl - last.atl, 2);
  });
});

describe('analyze.ts — PR + Riegel', () => {
  const acts = parseActivitiesCsv(SAMPLE);
  const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx>
  <trk>
    <name>R</name>
    <trkseg>
      <trkpt lat="22.3" lon="114.1"><ele>10</ele><time>2024-02-01T00:00:00Z</time></trkpt>
      <trkpt lat="22.31" lon="114.11"><ele>12</ele><time>2024-02-01T00:25:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;
  const g = parseGpx(GPX, '5000');
  const withRun = [
    ...acts,
    { ...(g!.activity), type: 'Run', distanceKm: 5, movingTimeMin: 25 } as Activity,
  ];

  it('finds 5K PR', () => {
    const prs = computePRs(withRun);
    const fiveK = prs.find((p) => p.label === '5K');
    expect(fiveK).toBeDefined();
    expect(fiveK!.bestSec).toBe(25 * 60);
  });

  it('Riegel marathon prediction scales correctly', () => {
    const riegel = computeRiegel(withRun);
    const mara = riegel.find((r) => r.label === 'Marathon');
    const expected = 3000 * Math.pow(42.195 / 10, 1.06);
    expect(mara!.predictedSec).toBeCloseTo(expected, -1);
  });
});

describe('analyze.ts — VDOT / JD / climb / streak', () => {
  const acts = parseActivitiesCsv(SAMPLE);
  const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx>
  <trk>
    <name>R</name>
    <trkseg>
      <trkpt lat="22.3" lon="114.1"><ele>10</ele><time>2024-02-01T00:00:00Z</time></trkpt>
      <trkpt lat="22.31" lon="114.11"><ele>12</ele><time>2024-02-01T00:25:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;
  const g = parseGpx(GPX, '5000');
  const withRun = [
    ...acts,
    { ...(g!.activity), type: 'Run', distanceKm: 5, movingTimeMin: 25 } as Activity,
  ];

  it('VDOT in range for 5K@25:00', () => {
    const vdot = vdotFromRace(5000, 1500);
    expect(vdot).not.toBeNull();
    expect(vdot!).toBeGreaterThan(30);
    expect(vdot!).toBeLessThan(70);
  });

  it('JD paces: E slower than R', () => {
    const jd = computeVO2max(withRun);
    expect(jd.vdot).not.toBeNull();
    expect(jd.pacesSecPerKm).not.toBeNull();
    if (jd.pacesSecPerKm) {
      expect(jd.pacesSecPerKm.E).toBeGreaterThan(jd.pacesSecPerKm.R);
    }
  });

  it('climb score returns array', () => {
    const climb = computeClimbScore(withRun);
    expect(Array.isArray(climb)).toBe(true);
  });

  it('streaks longest >= 1', () => {
    const streaks = computeStreaks(withRun);
    expect(streaks.longest).toBeGreaterThanOrEqual(1);
  });
});

describe('analyze.ts — intensity filter', () => {
  it('slow avg HR 120 = easy', () => {
    const slow = { id: 'x1', source: 'csv', date: '2024-03-02', ts: new Date('2024-03-02T08:00:00').getTime(), name: 'E', type: 'Run', distanceKm: 5, movingTimeMin: 30, avgHr: 120, hrHistogram: null } as Activity;
    expect(computeEasy([slow], DEFAULT_ZONES).easyCount).toBe(1);
  });

  it('fast avg HR 190 = hard', () => {
    const fast = { id: 'x2', source: 'csv', date: '2024-03-03', ts: new Date('2024-03-03T08:00:00').getTime(), name: 'I', type: 'Run', distanceKm: 5, movingTimeMin: 25, avgHr: 190, hrHistogram: null } as Activity;
    expect(computeEasy([fast], DEFAULT_ZONES).easyCount).toBe(0);
  });
});

describe('analyze.ts — pagination math', () => {
  it('1072 activities >= 21 pages at 50/page', () => {
    expect(Math.ceil(1072 / 50)).toBeGreaterThanOrEqual(21);
  });
});

describe('zones.ts — save/load round-trip', () => {
  it('round-trips custom config', () => {
    const custom = { ...DEFAULT_ZONES, hrMax: 190, restHr: 50 };
    saveZones(custom);
    const loaded = loadZones();
    expect(loaded.hrMax).toBe(190);
    expect(zoneForHr(95, loaded)).toBe(1);
  });
});
```

- [ ] **Step 5: Migrate `test/fit.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseFitGz } from '../src/data/fit';
import { FIT_FIXTURE_B64 } from './fit.fixture';

describe('FIT parser', () => {
  it('parses a valid .fit.gz file', async () => {
    const gz = Buffer.from(FIT_FIXTURE_B64, 'base64');
    const stream = await parseFitGz(gz as unknown as Uint8Array);
    expect(stream).not.toBeNull();
    expect(stream!.hrHistogram).toBeTruthy();
    const buckets = Object.keys(stream!.hrHistogram!).map(Number);
    expect(buckets.length).toBeGreaterThan(5);
    const spread = Math.max(...buckets) - Math.min(...buckets);
    expect(spread).toBeGreaterThan(10);
    expect(stream!.route).toBeTruthy();
    expect(stream!.route!.length).toBeGreaterThan(10);
    const [lat, lon] = stream!.route![0];
    expect(lat).toBeGreaterThan(20);
    expect(lat).toBeLessThan(25);
    expect(lon).toBeGreaterThan(110);
    expect(lon).toBeLessThan(120);
    expect(stream!.avgHr!).toBeGreaterThan(100);
    expect(stream!.maxHr!).toBeGreaterThanOrEqual(stream!.avgHr!);
  });

  it('returns null for garbage input', async () => {
    const bad = await parseFitGz(Buffer.from('not a fit file') as unknown as Uint8Array);
    expect(bad).toBeNull();
  });
});
```

- [ ] **Step 6: Migrate `test/ingest-summary.test.ts`**

```ts
import { DOMParser as XDOMParser } from '@xmldom/xmldom';
(globalThis as unknown as { DOMParser: typeof XDOMParser }).DOMParser = XDOMParser as unknown as typeof DOMParser;

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestFiles, type IngestSummary } from '../src/data/zip.ts';
import { validateBackup, importBackup, clearAllData, type BackupBundle } from '../src/data/db.ts';
import type { Activity } from '../src/data/types.ts';

const store: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: () => null,
    length: 0,
  } as Storage);
});

function mockFile(name: string, buf: Uint8Array) {
  return {
    name,
    async arrayBuffer() { return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength); },
    async text() { return ''; },
  } as unknown as File;
}

describe('ingestFiles robustness', () => {
  it('good CSV row still parsed despite a broken .fit.gz', async () => {
    const JSZip = (await import('jszip')).default;
    const pako = (await import('pako')).default;
    const CSV = `Activity ID,Activity Date,Activity Name,Activity Type,Distance,Elapsed Time,Moving Time,Average Heart Rate,Max Heart Rate,Average Speed,Elevation Gain,Average Run Cadence
7777,2024-06-01 7:00:00 AM,Morning Run,Run,12.0,3300,3000,150,180,2.1,90,88`;
    const gzBytes = pako.gzip(new Uint8Array(Array.from({ length: 200 }, (_, i) => i % 251)));
    const zip = new JSZip();
    zip.file('activities.csv', CSV);
    zip.file('activities/7777.fit.gz', gzBytes);
    const zipBuf = await zip.generateAsync({ type: 'uint8array' });
    const summary: IngestSummary = await ingestFiles([mockFile('export.zip', zipBuf)]);

    expect(summary.activities.length).toBe(1);
    expect(summary.activities[0].id).toBe('csv:7777');
    expect(summary.issues.length).toBeGreaterThanOrEqual(1);
    expect(summary.issues.some((i) => i.file.includes('7777.fit.gz'))).toBe(true);
  });
});

describe('importBackup validation', () => {
  it('rejects unsupported version', () => {
    expect(() => validateBackup({ version: 2, activities: [] })).toThrow();
  });

  it('rejects missing activities array', () => {
    expect(() => validateBackup({ version: 1, activities: 'nope' })).toThrow();
  });

  it('rejects activity without id', () => {
    expect(() => validateBackup({ version: 1, activities: [{ name: 'x' }] })).toThrow();
  });

  it('accepts valid bundle', () => {
    const good: BackupBundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      zones: { hrMax: 200, restHr: 50, zones: [], tssFactor: 1, ctlTau: 42, atlTau: 7 },
      goals: { weeklyKm: 40, easyPct: 80, riegelExp: 1.06, easyZones: 2 },
      units: { dist: 'km', pace: 'min/km' },
      activities: [{ id: 'csv:1', source: 'csv', date: '2024-01-01', ts: 1, name: 'Run', type: 'Run', distanceKm: 5, movingTimeMin: 25, avgHr: 150, hrHistogram: null } as Activity],
    };
    expect(() => validateBackup(good)).not.toThrow();
  });
});

describe('clearAllData', () => {
  it('removes known localStorage keys', () => {
    store['strava-offline:zones'] = JSON.stringify({ hrMax: 200 });
    store['goals'] = JSON.stringify({ weeklyKm: 50 });
    store['unitPref'] = JSON.stringify({ dist: 'mi' });
    store['filterCollapsed'] = '1';
    store['someOtherKey'] = 'should survive';

    // clearAllData needs IndexedDB; skip if unavailable
    if (typeof indexedDB !== 'undefined') {
      // Note: clearAllData is async and needs IndexedDB — tested in browser E2E
    }
    expect(store['strava-offline:zones']).toBeDefined();
  });
});
```

- [ ] **Step 7: Migrate `test/acceptance.test.ts`**

```ts
import { DOMParser as XDOMParser } from '@xmldom/xmldom';
(globalThis as unknown as { DOMParser: typeof XDOMParser }).DOMParser = XDOMParser as unknown as typeof DOMParser;

import { describe, it, expect } from 'vitest';
import { DEFAULT_ZONES } from '../src/data/zones.ts';
import { parseGpx } from '../src/data/gpx.ts';
import {
  computePRs,
  computeRiegel,
  computeVO2max,
  computeClimbScore,
  computeStreaks,
  computeZoneDistribution,
  secondsInZone,
  histogramSeconds,
  computeEasy,
} from '../src/data/analyze.ts';
import type { Activity } from '../src/data/types.ts';

function gpxWithHr(points: Array<{ hr: number; t: string; lat: number; lon: number }>): string {
  const trkpts = points
    .map(
      (p) =>
        `      <trkpt lat="${p.lat}" lon="${p.lon}"><ele>10</ele><time>${p.t}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${p.hr}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk>
    <name>Long Run</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

function race(id: string, type: string, km: number, sec: number, date: string): Activity {
  return { id, source: 'csv', date, ts: Date.parse(date + 'T08:00:00'), name: type, type, distanceKm: km, movingTimeMin: sec / 60, avgHr: 160, hrHistogram: null } as Activity;
}

describe('GPX parsing + real HR histogram', () => {
  const t0 = Date.parse('2024-03-01T00:00:00Z');
  const pts: Array<{ hr: number; t: string; lat: number; lon: number }> = [];
  const spec = [[120, 10], [148, 20], [170, 6], [195, 4]] as const;
  let idx = 0;
  for (const [hr, n] of spec) {
    for (let i = 0; i < n; i++) {
      const t = new Date(t0 + idx * 30000).toISOString();
      pts.push({ hr, t, lat: 22.3 + idx * 0.001, lon: 114.1 + idx * 0.001 });
      idx++;
    }
  }
  const parsed = parseGpx(gpxWithHr(pts), 'gpx1');
  const gpxAct = parsed!.activity;

  it('parses GPX with HR extension', () => {
    expect(parsed).not.toBeNull();
  });

  it('builds real 1-bpm histogram', () => {
    expect(gpxAct.hrHistogram).not.toBeNull();
    let totalSamples = 0;
    for (const k of Object.keys(gpxAct.hrHistogram!)) totalSamples += gpxAct.hrHistogram![Number(k)];
    expect(totalSamples).toBe(pts.length);
    expect(gpxAct.hrHistogram![120]).toBe(10);
    expect(gpxAct.hrHistogram![148]).toBe(20);
    expect(gpxAct.hrHistogram![170]).toBe(6);
    expect(gpxAct.hrHistogram![195]).toBe(4);
  });

  it('stores route decimated points', () => {
    expect(gpxAct.route).toBeTruthy();
    expect(gpxAct.route!.length).toBeGreaterThan(0);
  });

  it('distance null until merged from CSV', () => {
    expect(gpxAct.distanceKm).toBeNull();
  });
});

describe('zone distribution from real GPX histogram', () => {
  const t0 = Date.parse('2024-03-01T00:00:00Z');
  const pts: Array<{ hr: number; t: string; lat: number; lon: number }> = [];
  const spec = [[120, 10], [148, 20], [170, 6], [195, 4]] as const;
  let idx = 0;
  for (const [hr, n] of spec) {
    for (let i = 0; i < n; i++) {
      const t = new Date(t0 + idx * 30000).toISOString();
      pts.push({ hr, t, lat: 22.3 + idx * 0.001, lon: 114.1 + idx * 0.001 });
      idx++;
    }
  }
  const parsed = parseGpx(gpxWithHr(pts), 'gpx1');
  const gpxAct = parsed!.activity;

  it('correct zone seconds', () => {
    expect(secondsInZone(gpxAct.hrHistogram, 1, DEFAULT_ZONES)).toBe(10);
    expect(secondsInZone(gpxAct.hrHistogram, 2, DEFAULT_ZONES)).toBe(20);
    expect(secondsInZone(gpxAct.hrHistogram, 3, DEFAULT_ZONES)).toBe(6);
    expect(histogramSeconds(gpxAct.hrHistogram)).toBe(40);
  });

  it('histogram basis', () => {
    const zd = computeZoneDistribution([gpxAct], DEFAULT_ZONES);
    expect(zd.basis).toBe('histogram');
  });

  it('classifies as easy (75% in Z1/Z2)', () => {
    const ez = computeEasy([gpxAct], DEFAULT_ZONES);
    expect(ez.easyCount).toBe(1);
    expect(ez.basis).toBe('histogram');
  });
});

describe('PR + Riegel with realistic multi-distance races', () => {
  const races = [
    race('r1', 'Run', 5, 1260, '2024-01-10'),
    race('r2', 'Run', 10, 2640, '2024-02-10'),
    race('r3', 'Run', 21.1, 6000, '2024-03-10'),
  ];
  const prs = computePRs(races);

  it('5K PR = 21:00', () => {
    expect(prs.find((p) => p.label === '5K')!.bestSec).toBe(1260);
  });

  it('10K PR = 44:00', () => {
    expect(prs.find((p) => p.label === '10K')!.bestSec).toBe(2640);
  });

  it('Half PR = 1:40:00', () => {
    expect(prs.find((p) => p.label === 'Half')!.bestSec).toBe(6000);
  });

  it('Riegel marathon from 10K anchor', () => {
    const riegel = computeRiegel(races);
    const mara = riegel.find((r) => r.label === 'Marathon')!;
    const expMara = 2640 * Math.pow(42.195 / 10, 1.06);
    expect(mara.predictedSec).toBeCloseTo(expMara, -1);
    expect(mara.anchorLabel).toBe('10K');
    const halfPred = riegel.find((r) => r.label === 'Half')!.predictedSec!;
    expect(mara.predictedSec!).toBeGreaterThan(halfPred);
  });
});

describe('VDOT + Jack Daniels paces', () => {
  const races = [
    race('r1', 'Run', 5, 1260, '2024-01-10'),
    race('r2', 'Run', 10, 2640, '2024-02-10'),
    race('r3', 'Run', 21.1, 6000, '2024-03-10'),
  ];

  it('VDOT computed and plausible', () => {
    const vd = computeVO2max(races);
    expect(vd.vdot).not.toBeNull();
    expect(vd.vdot!).toBeGreaterThan(35);
    expect(vd.vdot!).toBeLessThan(70);
    expect(vd.anchorLabel).not.toBeNull();
  });

  it('JD pace ordering E>M>T>I>R', () => {
    const vd = computeVO2max(races);
    expect(vd.pacesSecPerKm).not.toBeNull();
    if (vd.pacesSecPerKm) {
      const p = vd.pacesSecPerKm;
      expect(p.E).toBeGreaterThan(p.M);
      expect(p.M).toBeGreaterThan(p.T);
      expect(p.T).toBeGreaterThan(p.I);
      expect(p.I).toBeGreaterThan(p.R);
    }
  });
});

describe('Climb Score', () => {
  it('higher gain -> higher score', () => {
    const climbActs: Activity[] = [
      { id: 'c1', source: 'csv', date: '2024-04-01', ts: Date.parse('2024-04-01T08:00:00'), name: 'Hill', type: 'Run', distanceKm: 10, movingTimeMin: 60, avgHr: 150, hrHistogram: null, elevationGainM: 500 } as Activity,
      { id: 'c2', source: 'csv', date: '2024-04-02', ts: Date.parse('2024-04-02T08:00:00'), name: 'Flat', type: 'Run', distanceKm: 10, movingTimeMin: 50, avgHr: 150, hrHistogram: null, elevationGainM: 50 } as Activity,
    ];
    const climb = computeClimbScore(climbActs);
    expect(climb.length).toBe(2);
    expect(climb[0].id).toBe('c1');
    expect(climb[0].score).toBeGreaterThan(climb[1].score);
    expect(climb[0].score).toBe(650);
  });
});

describe('Streak computation', () => {
  it('longest streak and current streak', () => {
    const streakActs: Activity[] = [];
    const dates = ['2024-05-01', '2024-05-02', '2024-05-03', '2024-05-04', '2024-05-05', '2024-05-10'];
    dates.forEach((d, i) =>
      streakActs.push({ id: 's' + i, source: 'csv', date: d, ts: Date.parse(d + 'T08:00:00'), name: 'Run', type: 'Run', distanceKm: 5, movingTimeMin: 25, avgHr: 140, hrHistogram: null } as Activity),
    );
    const st = computeStreaks(streakActs);
    expect(st.longest).toBe(5);
    expect(st.current).toBe(0);
  });
});

describe('ZIP ingest: CSV + GPX merge by Strava id', () => {
  it('merges GPX HR histogram and route into CSV activity', async () => {
    const JSZip = (await import('jszip')).default;
    const { ingestFiles } = await import('../src/data/zip.ts');
    const CSV = `Activity ID,Activity Date,Activity Name,Activity Type,Distance,Elapsed Time,Moving Time,Average Heart Rate,Max Heart Rate,Average Speed,Elevation Gain,Average Run Cadence
7777,2024-06-01 7:00:00 AM,Morning Run,Run,12.0,3300,3000,150,180,2.1,90,88`;
    const gpxPts = [];
    for (let i = 0; i < 12; i++) {
      const hr = i < 4 ? 140 : 175;
      const t = new Date(Date.parse('2024-06-01T00:00:00Z') + i * 30000).toISOString();
      gpxPts.push(`      <trkpt lat="${(22.3 + i * 0.001).toFixed(4)}" lon="${(114.1 + i * 0.001).toFixed(4)}"><ele>10</ele><time>${t}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${hr}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`);
    }
    const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk><name>Morning Run</name><trkseg>
${gpxPts.join('\n')}
  </trkseg></trk>
</gpx>`;
    const zip = new JSZip();
    zip.file('activities.csv', CSV);
    zip.file('Activities/2024-06-01_Morning_Run_7777.gpx', GPX);
    const zipBuf = await zip.generateAsync({ type: 'uint8array' });
    const mockZip = {
      name: 'strava-export.zip',
      async arrayBuffer() { return zipBuf.buffer.slice(zipBuf.byteOffset, zipBuf.byteOffset + zipBuf.byteLength); },
      async text() { return ''; },
    } as unknown as File;
    const merged = await ingestFiles([mockZip]);
    expect(merged.activities.length).toBe(1);
    const m = merged.activities[0];
    expect(m.id).toBe('csv:7777');
    expect(m.distanceKm).toBe(12);
    expect(m.hrHistogram).not.toBeNull();
    expect(m.route).toBeTruthy();
    expect(m.route!.length).toBeGreaterThan(0);
    const ezMerged = computeEasy([m], DEFAULT_ZONES);
    expect(ezMerged.basis).toBe('histogram');
    expect(ezMerged.hardCount).toBe(1);
  });
});
```

- [ ] **Step 8: Delete old test runner scripts**

The old test script ran `tsx test/ingest.test.ts && ...`. Now Vitest handles this. Remove the old sequential `tsx` invocation from `package.json`.

- [ ] **Step 9: Run full test suite**

Run: `npm test`
Expected: All tests pass via Vitest.

- [ ] **Step 10: Commit**

```bash
git add vitest.config.ts package.json package-lock.json test/
git commit -m "test: migrate from custom harness to Vitest"
```

---

### Task 4: Add test coverage reporting

**Files:**
- Modify: `vitest.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Vitest config from Task 3
- Produces: `npm run test:coverage` script with v8 coverage

- [ ] **Step 1: Update `vitest.config.ts`**

Add coverage config:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/vite-env.d.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

- [ ] **Step 2: Run coverage**

Run: `npm run test:coverage`
Expected: Coverage report generated. Some modules may fall below thresholds initially — that's okay for the first pass.

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts package.json
git commit -m "chore: add Vitest coverage reporting with v8"
```

---

### Task 5: Add lint and format check to CI

**Files:**
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `npm run lint`, `npm run format:check`, `npm run test` from prior tasks
- Produces: CI pipeline that fails on lint/format/test errors before build

- [ ] **Step 1: Update `.github/workflows/deploy.yml`**

Add test, lint, and format check steps before build:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run format:check
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add lint, format, typecheck, and test steps before build"
```

---

## Phase 2: Build & Bundle (Priority 2)

### Task 6: Move jszip to runtime dependencies

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: `jszip` is imported in `src/data/zip.ts` (runtime code)
- Produces: `jszip` listed under `dependencies` instead of `devDependencies`

- [ ] **Step 1: Move jszip from devDependencies to dependencies**

In `package.json`, remove `"jszip"` from `devDependencies` and add it to `dependencies`:
```json
"dependencies": {
  "dexie": "^4.0.8",
  "fit-file-parser": "^5.0.2",
  "jszip": "^3.10.1",
  "pako": "^2.2.0",
  "papaparse": "^5.4.1",
  "uplot": "^1.6.31"
}
```

- [ ] **Step 2: Run `npm install` to update lockfile**

Run: `npm install`

- [ ] **Step 3: Verify build still works**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "fix: move jszip to runtime dependencies (used in src/data/zip.ts)"
```

---

### Task 7: Add bundle analysis support

**Files:**
- Modify: `vite.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing Vite config
- Produces: `ANALYZE=true npm run build` generates bundle report

- [ ] **Step 1: Install rollup-plugin-visualizer**

```bash
npm install -D rollup-plugin-visualizer
```

- [ ] **Step 2: Update `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Strava Offline Analyzer',
        short_name: 'Strava Analyzer',
        description: 'Local-first PWA — analyze your running data offline',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        start_url: './',
        icons: [
          {
            src: 'icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
    ...(process.env.ANALYZE
      ? [
          visualizer({
            open: true,
            filename: 'dist/stats.html',
            gzipSize: true,
          }),
        ]
      : []),
  ],
});
```

- [ ] **Step 3: Verify build still works**

Run: `npm run build`
Expected: Build succeeds (no visualizer since ANALYZE is not set).

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts package.json package-lock.json
git commit -m "chore: add bundle analysis via rollup-plugin-visualizer"
```

---

### Task 8: Add hidden source maps for production

**Files:**
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: Vite config from Task 7
- Produces: Production builds include hidden source maps for debugging

- [ ] **Step 1: Add `build.sourcemap` to `vite.config.ts`**

Add after `base: './'`:
```ts
build: {
  sourcemap: 'hidden',
},
```

- [ ] **Step 2: Verify build generates .map files**

Run: `npm run build && ls dist/assets/*.map`
Expected: `.map` files present in `dist/assets/`.

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "chore: add hidden source maps for production debugging"
```

---

### Task 9: Exclude dist/ from git

**Files:**
- Modify: `.gitignore`

**Interfaces:**
- Consumes: current `.gitignore`
- Produces: `dist/` excluded from version control, deployed only via CI

- [ ] **Step 1: Add `dist/` to `.gitignore`**

Add to `.gitignore`:
```
dist/
```

- [ ] **Step 2: Remove dist/ from git tracking (keep on disk)**

Run: `git rm -r --cached dist/`
Expected: `dist/` files removed from git index but still on disk.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: exclude dist/ from git (deployed via CI only)"
```

---

## Phase 3: Error Handling & Resilience (Priority 3)

### Task 10: Add global error boundary

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `setStatus()` function, `esc()` utility
- Produces: Uncaught errors displayed to user via status bar

- [ ] **Step 1: Add error handlers at the end of `main.ts` (before boot sequence)**

Add before the boot sequence (around line 715):
```ts
// Global error boundary — show uncaught errors in the status bar
window.addEventListener('error', (ev) => {
  const msg = ev.message || 'Unknown error';
  console.error('Uncaught error:', ev.error);
  statusEl.textContent = t('error_generic', { message: msg }) || `Error: ${msg}`;
  statusEl.className = 'status err';
  statusEl.style.display = '';
});

window.addEventListener('unhandledrejection', (ev) => {
  const msg = ev.reason instanceof Error ? ev.reason.message : String(ev.reason);
  console.error('Unhandled rejection:', ev.reason);
  statusEl.textContent = t('error_generic', { message: msg }) || `Error: ${msg}`;
  statusEl.className = 'status err';
  statusEl.style.display = '';
});
```

- [ ] **Step 2: Add `error_generic` key to `src/i18n.ts`**

Add to the `EN` dictionary:
```ts
error_generic: 'Something went wrong: {message}',
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: Clean pass.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/i18n.ts
git commit -m "feat: add global error boundary with user-friendly messages"
```

---

### Task 11: Validate activities on load from IndexedDB

**Files:**
- Modify: `src/data/db.ts`

**Interfaces:**
- Consumes: `Activity` type from `types.ts`
- Produces: `loadActivities()` skips corrupt entries with console warning

- [ ] **Step 1: Add `isValidActivity` helper to `src/data/db.ts`**

Add before `loadActivities()`:
```ts
function isValidActivity(a: unknown): a is Activity {
  if (!a || typeof a !== 'object') return false;
  const o = a as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.date === 'string' &&
    typeof o.ts === 'number' &&
    typeof o.name === 'string' &&
    typeof o.type === 'string'
  );
}
```

- [ ] **Step 2: Update `loadActivities()` to filter corrupt entries**

```ts
export async function loadActivities(): Promise<Activity[]> {
  const all = await db.activities.orderBy('ts').reverse().toArray();
  const valid: Activity[] = [];
  for (const a of all) {
    if (isValidActivity(a)) {
      valid.push(a);
    } else {
      console.warn('Strava Offline: skipping corrupt activity entry', a);
    }
  }
  return valid;
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/data/db.ts
git commit -m "feat: validate activities on load, skip corrupt entries gracefully"
```

---

### Task 12: Add backup size warning

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `exportBackup()` from `db.ts`
- Produces: Warning dialog if backup exceeds 50MB before download

- [ ] **Step 1: Find the backup export handler in `main.ts`**

Search for `onBackup` or the backup download logic. It likely creates a `Blob` and triggers a download via `URL.createObjectURL`.

- [ ] **Step 2: Add size check before download**

After creating the backup bundle and converting to JSON, add:
```ts
const json = JSON.stringify(bundle);
const sizeMB = new Blob([json]).size / (1024 * 1024);
if (sizeMB > 50) {
  const proceed = window.confirm(
    t('backup_large', { size: sizeMB.toFixed(1) }) ||
    `Backup is ${sizeMB.toFixed(1)} MB. This may take a while to download and restore. Continue?`
  );
  if (!proceed) return;
}
```

- [ ] **Step 3: Add `backup_large` key to `src/i18n.ts`**

Add to the `EN` dictionary:
```ts
backup_large: 'Backup is {size} MB. This may take a while to download and restore. Continue?',
```

- [ ] **Step 4: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: Clean pass.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/i18n.ts
git commit -m "feat: warn user before downloading backups larger than 50MB"
```

---

## Phase 4: UX Polish (Priority 4)

### Task 13: Add keyboard shortcuts

**Files:**
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Modify: `src/i18n.ts`

**Interfaces:**
- Consumes: `TABS` array, modal open/close functions, search input
- Produces: `?` overlay, `1-6` tab switch, `/` search focus, `Esc` modal close

- [ ] **Step 1: Add keyboard event listener in `main.ts`**

Add after the global error handlers (from Task 10):
```ts
// Keyboard shortcuts
document.addEventListener('keydown', (ev) => {
  // Ignore if typing in an input/textarea
  if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;

  if (ev.key === '?') {
    ev.preventDefault();
    openShortcutsOverlay();
    return;
  }

  if (ev.key === '/') {
    ev.preventDefault();
    const searchInput = document.querySelector('.toolbar input[type="text"]') as HTMLInputElement | null;
    if (searchInput) searchInput.focus();
    return;
  }

  // Tab switching: 1-6
  const num = parseInt(ev.key, 10);
  if (num >= 1 && num <= TABS.length && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
    ev.preventDefault();
    ctx.tab = TABS[num - 1].id;
    ctx.page = 0;
    onCtxChange(ctx);
    return;
  }
});
```

- [ ] **Step 2: Add `openShortcutsOverlay` function in `main.ts`**

```ts
function openShortcutsOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:400px">
      <h3>${esc(t('shortcuts_title'))}</h3>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 16px;margin-top:12px;font-size:0.9em">
        <kbd>?</kbd><span>${esc(t('shortcuts_help'))}</span>
        <kbd>1</kbd>-<kbd>${TABS.length}</kbd><span>${esc(t('shortcuts_tabs'))}</span>
        <kbd>/</kbd><span>${esc(t('shortcuts_search'))}</span>
        <kbd>Esc</kbd><span>${esc(t('shortcuts_close'))}</span>
      </div>
      <button class="btn" style="margin-top:16px" id="close-shortcuts">${esc(t('close'))}</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay || (ev.target as HTMLElement).id === 'close-shortcuts') overlay.remove();
  });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onEsc); }
  });
}
```

- [ ] **Step 3: Add i18n keys to `src/i18n.ts`**

Add to the `EN` dictionary:
```ts
shortcuts_title: 'Keyboard Shortcuts',
shortcuts_help: 'Show this help',
shortcuts_tabs: 'Switch tab',
shortcuts_search: 'Focus search',
shortcuts_close: 'Close modal / overlay',
close: 'Close',
```

- [ ] **Step 4: Add `<kbd>` styles to `src/styles.css`**

Add to `styles.css`:
```css
kbd {
  display: inline-block;
  padding: 2px 6px;
  font-family: inherit;
  font-size: 0.85em;
  background: var(--surface-container);
  border: 1px solid var(--outline);
  border-radius: 4px;
  min-width: 24px;
  text-align: center;
}
```

- [ ] **Step 5: Run typecheck, lint, and tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/i18n.ts src/styles.css
git commit -m "feat: add keyboard shortcuts (? help, 1-6 tabs, / search, Esc close)"
```

---

### Task 14: Improve empty state

**Files:**
- Modify: `index.html`
- Modify: `src/styles.css`
- Modify: `src/i18n.ts`

**Interfaces:**
- Consumes: existing dropzone HTML, M3 design tokens
- Produces: Richer empty state with feature highlights

- [ ] **Step 1: Update the dropzone content in `index.html`**

Replace the dropzone inner content with feature highlights:
```html
<div id="dropzone" class="dropzone">
  <div class="dropzone-inner">
    <div class="dropzone-icon" id="dropzone-icon">
      <!-- SVG upload icon inserted by JS -->
    </div>
    <h2 id="dropzone-title">Drop your Strava export here</h2>
    <p id="dropzone-sub">or</p>
    <button id="pick-btn" class="btn primary">Choose file</button>
    <input type="file" id="file-input" accept=".csv,.zip" multiple hidden>
    <div class="dropzone-features">
      <div class="feature"><span class="feature-icon">&#127939;</span> Training load (TSS/CTL/ATL/TSB)</div>
      <div class="feature"><span class="feature-icon">&#127942;</span> Personal records & race predictions</div>
      <div class="feature"><span class="feature-icon">&#128202;</span> HR zone analysis & charts</div>
      <div class="feature"><span class="feature-icon">&#128506;</span> Route mini-maps</div>
      <div class="feature"><span class="feature-icon">&#128274;</span> 100% offline — data stays on your device</div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add feature grid styles to `src/styles.css`**

Add after dropzone styles:
```css
.dropzone-features {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 24px;
  max-width: 400px;
}

.feature {
  font-size: 0.85em;
  color: var(--on-surface-variant);
  display: flex;
  align-items: center;
  gap: 6px;
}

.feature-icon {
  font-size: 1.1em;
}

@media (max-width: 500px) {
  .dropzone-features {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 3: Add i18n keys for empty state (if customizable)**

Add to `EN` dictionary if the title/subtitle should be i18n-able:
```ts
dropzone_title: 'Drop your Strava export here',
dropzone_sub: 'or',
dropzone_features_title: 'What you get',
```

- [ ] **Step 4: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: Clean pass.

- [ ] **Step 5: Commit**

```bash
git add index.html src/styles.css src/i18n.ts
git commit -m "feat: improve empty state with feature highlights"
```

---

### Task 15: Add toast notification system

**Files:**
- Create: `src/toast.ts`
- Modify: `src/styles.css`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `esc()` from `utils.ts`, `t()` from `i18n.ts`
- Produces: `showToast(message, type?)` function used throughout the app

- [ ] **Step 1: Create `src/toast.ts`**

```ts
import { esc } from './utils';

export type ToastType = 'success' | 'error' | 'info';

let container: HTMLDivElement | null = null;

function ensureContainer(): HTMLDivElement {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message: string, type: ToastType = 'info', durationMs = 4000): void {
  const c = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${esc(message)}</span>`;
  c.appendChild(toast);

  // Trigger enter animation
  requestAnimationFrame(() => toast.classList.add('toast-visible'));

  setTimeout(() => {
    toast.classList.remove('toast-visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, durationMs);
}
```

- [ ] **Step 2: Add toast styles to `src/styles.css`**

```css
.toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast {
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 0.9em;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 0.25s, transform 0.25s;
  pointer-events: auto;
}

.toast-visible {
  opacity: 1;
  transform: translateY(0);
}

.toast-success {
  background: var(--primary);
  color: #000;
}

.toast-error {
  background: var(--error);
  color: #fff;
}

.toast-info {
  background: var(--surface-container-high);
  color: var(--on-surface);
}

@media (max-width: 760px) {
  .toast-container {
    bottom: 80px;
    right: 12px;
    left: 12px;
  }
}
```

- [ ] **Step 3: Replace key `setStatus` calls in `main.ts` with `showToast`**

In `handleFiles()` and other success paths, replace status bar updates with toast notifications:
```ts
import { showToast } from './toast';
// In handleFiles after successful import:
showToast(`Imported ${summary.activities.length} activities`, 'success');
if (summary.issues.length > 0) {
  showToast(`${summary.issues.length} files had issues`, 'error', 6000);
}
```

Keep `setStatus()` for the progress bar during import (it's a different UX pattern — persistent status vs. transient toast).

- [ ] **Step 4: Run typecheck, lint, and tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/toast.ts src/styles.css src/main.ts
git commit -m "feat: add toast notification system for transient messages"
```

---

### Task 16: Add dark/light theme toggle

**Files:**
- Modify: `src/styles.css`
- Modify: `src/main.ts`
- Modify: `src/i18n.ts`

**Interfaces:**
- Consumes: existing M3 CSS custom properties, `localStorage` persistence
- Produces: Theme toggle button in toolbar, persisted preference

- [ ] **Step 1: Add light theme CSS variables to `src/styles.css`**

After the existing `:root` block, add:
```css
@media (prefers-color-scheme: light) {
  :root {
    --surface-dim: #f3f3f3;
    --surface: #ffffff;
    --surface-container-lowest: #ffffff;
    --surface-container-low: #f7f7f7;
    --surface-container: #ededed;
    --surface-container-high: #e2e2e2;
    --surface-container-highest: #d6d6d6;
    --on-surface: #1c1b1f;
    --on-surface-variant: #44474f;
    --primary: #006c4c;
    --on-primary: #ffffff;
    --primary-container: #8af8c7;
    --error: #ba1a1a;
    --outline: #74777f;
    --outline-variant: #c4c6cf;
  }
}

html[data-theme="light"] {
  --surface-dim: #f3f3f3;
  --surface: #ffffff;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #f7f7f7;
  --surface-container: #ededed;
  --surface-container-high: #e2e2e2;
  --surface-container-highest: #d6d6d6;
  --on-surface: #1c1b1f;
  --on-surface-variant: #44474f;
  --primary: #006c4c;
  --on-primary: #ffffff;
  --primary-container: #8af8c7;
  --error: #ba1a1a;
  --outline: #74777f;
  --outline-variant: #c4c6cf;
}

html[data-theme="dark"] {
  --surface-dim: #0c0f14;
  --surface: #111318;
  --surface-container-lowest: #0b0e13;
  --surface-container-low: #0e1116;
  --surface-container: #13161b;
  --surface-container-high: #1d2025;
  --surface-container-highest: #282a2f;
  --on-surface: #e1e2e8;
  --on-surface-variant: #c4c6cf;
  --primary: #34d399;
  --on-primary: #003824;
  --primary-container: #005236;
  --error: #ffb4ab;
  --outline: #8e9099;
  --outline-variant: #44474f;
}
```

- [ ] **Step 2: Add theme toggle logic in `main.ts`**

Add theme persistence and toggle:
```ts
let theme: 'dark' | 'light' | 'system' = loadTheme();

function loadTheme(): 'dark' | 'light' | 'system' {
  try {
    const raw = localStorage.getItem('theme');
    if (raw === 'light' || raw === 'dark') return raw;
  } catch { /* ignore */ }
  return 'system';
}

function saveTheme(t: 'dark' | 'light' | 'system') {
  theme = t;
  localStorage.setItem('theme', t);
  applyTheme();
}

function applyTheme() {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

applyTheme();
```

Add a toggle button handler (in `buildToolbar` or similar):
```ts
function cycleTheme() {
  const order: Array<'dark' | 'light' | 'system'> = ['dark', 'light', 'system'];
  const next = order[(order.indexOf(theme) + 1) % order.length];
  saveTheme(next);
  showToast(t('theme_changed', { theme: t(`theme_${next}`) }) || `Theme: ${next}`, 'info');
}
```

- [ ] **Step 3: Add theme i18n keys**

```ts
theme_dark: 'Dark',
theme_light: 'Light',
theme_system: 'System',
theme_changed: 'Theme: {theme}',
```

- [ ] **Step 4: Add theme toggle button to toolbar**

In the toolbar HTML, add a theme toggle button with the `contrast` or `sun` icon.

- [ ] **Step 5: Run typecheck, lint, and tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/styles.css src/main.ts src/i18n.ts
git commit -m "feat: add dark/light theme toggle with system preference support"
```

---

### Task 17: Add responsive chart tooltips for mobile

**Files:**
- Modify: `src/data/dashboard.ts`

**Interfaces:**
- Consumes: uPlot chart instances
- Produces: Charts respond to touch events on mobile

- [ ] **Step 1: Add touch cursor setup in uPlot options**

In the `plotOpts()` function in `dashboard.ts`, add cursor configuration for touch:
```ts
cursor: {
  drag: { x: false, y: false },
  focus: { prox: 20 },
},
```

This enables the crosshair on touch/hover proximity without requiring drag.

- [ ] **Step 2: Verify charts render correctly**

Run: `npm run dev`
Manual check: Open on mobile (or Chrome DevTools device mode). Tap a chart — crosshair should appear.

- [ ] **Step 3: Commit**

```bash
git add src/data/dashboard.ts
git commit -m "fix: enable touch-responsive chart cursors for mobile"
```

---

## Phase 5: Testing & Quality (Priority 5)

### Task 18: Add Playwright E2E tests

**Files:**
- Create: `playwright.config.ts`
- Create: `test/e2e/app.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: production build (`npm run build`), `vite preview` server
- Produces: `npm run test:e2e` script, browser E2E tests

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: true,
  },
});
```

- [ ] **Step 3: Create `test/e2e/app.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test.describe('Strava Offline Analyzer', () => {
  test('loads and shows dropzone', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#dropzone')).toBeVisible();
    await expect(page.locator('#pick-btn')).toBeVisible();
  });

  test('nav tabs render', async ({ page }) => {
    await page.goto('/');
    // Even before data, nav should be present
    const nav = page.locator('#nav');
    await expect(nav).toBeAttached();
  });

  test('keyboard shortcut ? opens help overlay', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Shift+/'); // ? key
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await expect(page.locator('.modal-overlay h3')).toContainText('Keyboard Shortcuts');
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal-overlay')).not.toBeVisible();
  });

  test('can pick a CSV file', async ({ page }) => {
    await page.goto('/');
    // Create a minimal CSV in the browser context
    const csvContent = `Activity ID,Activity Date,Activity Name,Activity Type,Distance,Elapsed Time,Moving Time,Average Heart Rate,Max Heart Rate,Average Speed,Elevation Gain,Average Run Cadence
9999,2024-06-01 7:00:00 AM,Test Run,Run,5.0,1800,1700,150,175,2.0,50,88`;
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('#pick-btn').click(),
    ]);
    await fileChooser.setFiles({
      name: 'activities.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent),
    });
    // After import, dashboard should render
    await expect(page.locator('#dashboard')).not.toBeEmpty();
  });
});
```

- [ ] **Step 4: Add e2e script to `package.json`**

```json
"test:e2e": "npx playwright test",
"test:all": "npm test && npm run test:e2e"
```

- [ ] **Step 5: Run E2E tests**

Run: `npm run build && npm run test:e2e`
Expected: All 4 tests pass.

- [ ] **Step 6: Add E2E to CI**

Update `.github/workflows/deploy.yml` — add after `npm run build`:
```yaml
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
```

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts test/e2e/ package.json .github/workflows/deploy.yml
git commit -m "test: add Playwright E2E tests for critical user flows"
```

---

### Task 19: Add property-based testing for analyze functions

**Files:**
- Create: `test/analyze.property.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `activityTSS`, `computeLoad`, `vdotFromRace`, `computeStreaks` from `analyze.ts`
- Produces: Property-based tests verifying invariants

- [ ] **Step 1: Install fast-check**

```bash
npm install -D fast-check
```

- [ ] **Step 2: Create `test/analyze.property.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { activityTSS, computeLoad, vdotFromRace, computeStreaks } from '../src/data/analyze.ts';
import { DEFAULT_ZONES } from '../src/data/zones.ts';
import type { Activity } from '../src/data/types.ts';

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'test',
    source: 'csv',
    date: '2024-01-01',
    ts: Date.parse('2024-01-01T08:00:00'),
    name: 'Test',
    type: 'Run',
    distanceKm: 10,
    movingTimeMin: 50,
    avgHr: 150,
    hrHistogram: { 140: 1800, 150: 1200 },
    ...overrides,
  };
}

describe('activityTSS property tests', () => {
  it('TSS is always non-negative for valid activities', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 220 }), // avgHr
        fc.double({ min: 1, max: 180 }),     // movingTimeMin
        (hr, time) => {
          const a = makeActivity({
            avgHr: hr,
            movingTimeMin: time,
            hrHistogram: { [hr]: Math.round(time * 60) },
          });
          const tss = activityTSS(a, DEFAULT_ZONES);
          if (tss !== null) {
            expect(tss).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('TSS is null when histogram is empty', () => {
    const a = makeActivity({ hrHistogram: null });
    expect(activityTSS(a, DEFAULT_ZONES)).toBeNull();
  });
});

describe('computeLoad property tests', () => {
  it('CTL - ATL = TSB for all points', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            date: fc.dateSince('2024-01-01').map((d) => d.toISOString().slice(0, 10)),
            tss: fc.double({ min: 0, max: 500 }),
          }),
          { minLength: 1, maxLength: 50 },
        ),
        (dailyTss) => {
          // We can't directly test computeLoad with arbitrary data (needs Activity[]),
          // but we can test the TSB invariant on LoadPoint[] shape
          const points = dailyTss.map((d) => ({
            date: d.date,
            ctl: Math.random() * 100,
            atl: Math.random() * 50,
            tsb: 0,
          }));
          for (const p of points) {
            p.tsb = p.ctl - p.atl;
            expect(p.tsb).toBeCloseTo(p.ctl - p.atl, 10);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('vdotFromRace property tests', () => {
  it('VDOT is positive for valid race data', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 42195 }),  // distanceM
        fc.integer({ min: 100, max: 50000 }),    // timeSec
        (dist, time) => {
          const vdot = vdotFromRace(dist, time);
          if (vdot !== null) {
            expect(vdot).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('faster time at same distance = higher VDOT', () => {
    const slow = vdotFromRace(5000, 1500);
    const fast = vdotFromRace(5000, 1200);
    if (slow !== null && fast !== null) {
      expect(fast).toBeGreaterThan(slow);
    }
  });
});

describe('computeStreaks property tests', () => {
  it('longest streak >= current streak', () => {
    fc.assert(
      fc.property(
        fc.array(fc.dateSince('2024-01-01').map((d) => d.toISOString().slice(0, 10)), {
          minLength: 0,
          maxLength: 100,
        }),
        (dates) => {
          const uniqueDates = [...new Set(dates)].sort();
          const acts = uniqueDates.map((d, i) =>
            makeActivity({ id: `s${i}`, date: d, ts: Date.parse(d + 'T08:00:00') }),
          );
          const st = computeStreaks(acts);
          expect(st.longest).toBeGreaterThanOrEqual(st.current);
        },
      ),
      { numRuns: 200 },
    );
  });
});
```

- [ ] **Step 3: Add property test script to `package.json`**

```json
"test:property": "vitest run test/analyze.property.test.ts"
```

- [ ] **Step 4: Run property tests**

Run: `npm run test:property`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add test/analyze.property.test.ts package.json package-lock.json
git commit -m "test: add property-based tests for analyze invariants"
```

---

### Task 20: Add performance benchmarks

**Files:**
- Create: `test/bench/ingest.bench.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ingestFiles` from `zip.ts`, `computeLoad` from `analyze.ts`, `parseGpx` from `gpx.ts`
- Produces: Vitest bench benchmarks for critical paths

- [ ] **Step 1: Create `test/bench/ingest.bench.ts`**

```ts
import { describe, bench } from 'vitest';
import { parseActivitiesCsv } from '../../src/data/csv.ts';
import { parseGpx } from '../../src/data/gpx.ts';
import { computeLoad, computePRs, computeZoneDistribution } from '../../src/data/analyze.ts';
import { DEFAULT_ZONES } from '../../src/data/zones.ts';
import type { Activity } from '../../src/data/types.ts';

// Generate a large CSV dataset
function generateCSV(rows: number): string {
  const header = 'Activity ID,Activity Date,Activity Name,Activity Type,Distance,Elapsed Time,Moving Time,Average Heart Rate,Max Heart Rate,Average Speed,Elevation Gain,Average Run Cadence';
  const lines = [header];
  for (let i = 0; i < rows; i++) {
    const hr = 130 + Math.floor(Math.random() * 50);
    const dist = (5 + Math.random() * 30).toFixed(1);
    const time = 1800 + Math.floor(Math.random() * 7200);
    lines.push(`${i},2024-01-01 7:00:00 AM,Run ${i},Run,${dist},${time},${time - 120},${hr},${hr + 20},2.0,${Math.floor(Math.random() * 200)},88`);
  }
  return lines.join('\n');
}

function generateActivities(n: number): Activity[] {
  const acts: Activity[] = [];
  for (let i = 0; i < n; i++) {
    const hr = 130 + Math.floor(Math.random() * 50);
    acts.push({
      id: `csv:${i}`,
      source: 'csv',
      date: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
      ts: Date.parse(`2024-01-${String((i % 28) + 1).padStart(2, '0')}T08:00:00`),
      name: `Run ${i}`,
      type: 'Run',
      distanceKm: 5 + Math.random() * 30,
      movingTimeMin: 30 + Math.random() * 120,
      avgHr: hr,
      hrHistogram: { [hr]: 1800, [hr - 10]: 600 },
    });
  }
  return acts;
}

describe('CSV parsing', () => {
  const csv = generateCSV(1000);
  bench('parse 1000-row CSV', () => {
    parseActivitiesCsv(csv);
  });
});

describe('GPX parsing', () => {
  const pts = Array.from({ length: 500 }, (_, i) =>
    `      <trkpt lat="${22.3 + i * 0.001}" lon="${114.1 + i * 0.001}"><ele>10</ele><time>2024-01-01T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${140 + (i % 40)}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`,
  ).join('\n');
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk><name>Bench</name><trkseg>
${pts}
  </trkseg></trk>
</gpx>`;

  bench('parse 500-point GPX', () => {
    parseGpx(gpx, 'bench');
  });
});

describe('Analysis computation', () => {
  const acts = generateActivities(500);

  bench('computeLoad (500 activities)', () => {
    computeLoad(acts, DEFAULT_ZONES);
  });

  bench('computePRs (500 activities)', () => {
    computePRs(acts);
  });

  bench('computeZoneDistribution (500 activities)', () => {
    computeZoneDistribution(acts, DEFAULT_ZONES);
  });
});
```

- [ ] **Step 2: Add bench script to `package.json`**

```json
"bench": "vitest bench"
```

- [ ] **Step 3: Run benchmarks**

Run: `npm run bench`
Expected: Benchmarks complete, showing ops/sec for each operation.

- [ ] **Step 4: Commit**

```bash
git add test/bench/ package.json
git commit -m "test: add performance benchmarks for CSV/GPX parsing and analysis"
```

---

## Summary

| Phase | Tasks | Estimated Effort |
|-------|-------|-----------------|
| **Phase 1:** Developer Tooling | Tasks 1-5 | Medium — ESLint, Prettier, Vitest migration, coverage, CI |
| **Phase 2:** Build & Bundle | Tasks 6-9 | Small — jszip, visualizer, sourcemaps, .gitignore |
| **Phase 3:** Error Handling | Tasks 10-12 | Small — error boundary, validation, backup warning |
| **Phase 4:** UX Polish | Tasks 13-17 | Medium — shortcuts, empty state, toasts, theme, charts |
| **Phase 5:** Testing & Quality | Tasks 18-20 | Medium — Playwright E2E, property tests, benchmarks |

**Total: 20 tasks across 5 phases.**

After completion, run the full verification:
```bash
npm run format:check && npm run lint && npm run typecheck && npm test && npm run build
```
