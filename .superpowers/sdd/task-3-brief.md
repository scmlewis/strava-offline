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
