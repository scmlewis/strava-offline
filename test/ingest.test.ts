import { DOMParser as XDOMParser } from '@xmldom/xmldom';
(globalThis as unknown as { DOMParser: typeof XDOMParser }).DOMParser =
  XDOMParser as unknown as typeof DOMParser;

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
} from '../src/data/analyze.ts';
import type { Activity } from '../src/data/types.ts';

// minimal localStorage shim for loadZones/saveZones in node
const store: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
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
} as Storage;

let passed = 0;
let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log('  ✓ ' + msg);
  } else {
    failed++;
    console.error('  ✗ ' + msg);
  }
}
function approx(a: number, b: number, eps = 0.01) {
  return Math.abs(a - b) <= eps;
}

console.log('zones.ts');
ok(zoneForHr(100, DEFAULT_ZONES) === 1, 'HR 100 -> Z1');
ok(zoneForHr(154, DEFAULT_ZONES) === 2, 'HR 154 boundary -> Z2');
ok(zoneForHr(155, DEFAULT_ZONES) === 3, 'HR 155 -> Z3');
ok(zoneForHr(206, DEFAULT_ZONES) === 5, 'HR 206 -> Z5');
ok(zoneForHr(null, DEFAULT_ZONES) === null, 'null HR -> null');

console.log('csv.ts');
const SAMPLE = `Activity ID,Activity Date,Activity Name,Activity Type,Distance,Elapsed Time,Moving Time,Average Heart Rate,Max Heart Rate,Average Speed,Elevation Gain,Average Run Cadence
1234,2024-01-05 7:14:32 AM,Morning Run,Run,10.0,3245,3000,148,170,2.0,80,88
1235,2024-01-07 6:00:00 PM,Intervals,Run,8.0,2700,2500,168,190,1.8,40,90
1236,2024-01-10 12:00:00 PM,Coffee Ride,Ride,30.0,5400,5200,120,150,3.3,120,0`;
const acts = parseActivitiesCsv(SAMPLE);
ok(acts.length === 3, 'parsed 3 activities');
ok(acts[0].distanceKm === 10, 'distance 10.0km -> 10km');
ok(acts[0].hrHistogram !== null, 'CSV builds proxy histogram');
ok(acts[0].hrHistogram![148] === 3000, 'CSV proxy: 3000 samples at avg HR 148');

console.log('analyze.ts (summary)');
const s = computeSummary(acts);
ok(s.count === 3, 'count 3');
ok(approx(s.totalDistanceKm, 48), 'total distance 48km');

console.log('analyze.ts (histogram helpers)');
ok(histogramSeconds(acts[0].hrHistogram) === 3000, 'histogramSeconds = 3000');
ok(secondsInZone(acts[0].hrHistogram, 2, DEFAULT_ZONES) === 3000, 'all 3000s in Z2 (HR 148)');
ok(approx(avgIntensity(acts[0].hrHistogram, DEFAULT_ZONES)!, 148 / 206), 'avg intensity = 148/206');

console.log('analyze.ts (easy%)');
const easy = computeEasy(acts, DEFAULT_ZONES);
ok(easy.basis === 'histogram', 'histogram basis now');
ok(easy.easyCount === 2, '2 easy (Run 148, Ride 120)');
ok(easy.hardCount === 1, '1 hard (Intervals 168)');
ok(
  easy.pct != null && easy.pct > 50 && easy.pct < 80,
  `pct in range (got ${easy.pct?.toFixed(1)})`,
);

console.log('analyze.ts (daily volume / heatmap)');
const daily = computeDailyVolume(acts);
ok(daily.length === 3, 'daily volume = 3 days (one per activity)');
const d0 = daily.find((d) => d.date === '2024-01-05');
ok(d0 !== undefined && approx(d0.distanceKm, 10), '2024-01-05 totals 10km');
ok(d0 !== undefined && d0.count === 1, '2024-01-05 has 1 activity');
console.log('analyze.ts (zone dist)');
const zd = computeZoneDistribution(acts, DEFAULT_ZONES);
ok(zd.basis === 'histogram', 'histogram basis');
ok(approx(zd.byTime[2]!, 3000 + 0), 'Z2 time = 3000 (Run)');
ok(zd.byTime[3]! > 0, 'Z3 time > 0 (Intervals 168)');

console.log('analyze.ts (TSS)');
const tss0 = activityTSS(acts[0], DEFAULT_ZONES);
ok(tss0 != null && tss0 > 0, 'TSS computed for Run 148');
// ~50min at IF=148/206=0.718 -> TSS = 50/60 * 0.718^2 * 100 ~ 43
ok(tss0 != null && approx(tss0, 43, 5), `TSS ~43 (got ${tss0?.toFixed(1)})`);

console.log('analyze.ts (load)');
const load = computeLoad(acts, DEFAULT_ZONES);
ok(load.length > 0, 'load series produced');
const last = load[load.length - 1];
ok(last.ctl >= 0 && last.atl >= 0, 'CTL/ATL non-negative');
ok(approx(last.ctl, last.tsb + last.atl), 'TSB = CTL - ATL');

console.log('analyze.ts (PR + Riegel)');
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
ok(g !== null, 'gpx parsed');
const withRun = [
  ...acts,
  { ...g!.activity, type: 'Run', distanceKm: 5, movingTimeMin: 25 } as Activity,
];
const prs = computePRs(withRun);
const fiveK = prs.find((p) => p.label === '5K');
ok(fiveK !== undefined && fiveK.bestSec != null, '5K PR found');
ok(approx(fiveK!.bestSec!, 25 * 60), '5K best = 25:00');

const riegel = computeRiegel(withRun);
const mara = riegel.find((r) => r.label === 'Marathon');
ok(mara!.predictedSec != null, 'Marathon predicted');
// anchor is the 10K run (3000s); Riegel from 10K -> Marathon
const expected = 3000 * Math.pow(42.195 / 10, 1.06);
ok(
  mara!.predictedSec != null && approx(mara!.predictedSec, expected, expected * 0.001),
  `Riegel scales correctly (got ${mara!.predictedSec?.toFixed(0)}, exp ${expected.toFixed(0)})`,
);

console.log('analyze.ts (VO2max / JD / climb / streak)');
import('../src/data/analyze.ts').then((A) => {
  // 5K @ 1500s → VDOT
  const vdot = A.vdotFromRace(5000, 1500);
  ok(vdot != null && vdot > 30 && vdot < 70, `5K@25:00 VDOT in range (got ${vdot?.toFixed(1)})`);
  const jd = A.computeVO2max(withRun);
  ok(jd.vdot != null, 'VDOT computed');
  ok(jd.pacesSecPerKm != null, 'JD paces computed');
  if (jd.pacesSecPerKm) {
    // E (easy) must be SLOWER (more sec/km) than R (repetition)
    ok(jd.pacesSecPerKm.E > jd.pacesSecPerKm.R, 'E pace slower than R pace');
  }
  const climb = A.computeClimbScore(withRun);
  ok(Array.isArray(climb), 'climb score returns array');
  const streaks = A.computeStreaks(withRun);
  ok(streaks.longest >= 1, 'streak longest >= 1');

  // intensity filter relies on per-activity easy classification
  const slow = {
    id: 'x1',
    source: 'csv',
    date: '2024-03-02',
    ts: new Date('2024-03-02T08:00:00').getTime(),
    name: 'E',
    type: 'Run',
    distanceKm: 5,
    movingTimeMin: 30,
    avgHr: 120,
    hrHistogram: null,
  } as Activity;
  const fast = {
    id: 'x2',
    source: 'csv',
    date: '2024-03-03',
    ts: new Date('2024-03-03T08:00:00').getTime(),
    name: 'I',
    type: 'Run',
    distanceKm: 5,
    movingTimeMin: 25,
    avgHr: 190,
    hrHistogram: null,
  } as Activity;
  ok(A.computeEasy([slow], DEFAULT_ZONES).easyCount === 1, 'slow avg HR 120 = easy');
  ok(A.computeEasy([fast], DEFAULT_ZONES).easyCount === 0, 'fast avg HR 190 = hard');

  // pagination: 1072 activities -> ~22 pages at 50/page
  ok(Math.ceil(1072 / 50) >= 21, 'pagination math: 1072 acts >= 21 pages @50');
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});

const custom = { ...DEFAULT_ZONES, hrMax: 190, restHr: 50 };
saveZones(custom);
const loaded = loadZones();
ok(loaded.hrMax === 190, 'save/load round-trip hrMax');
ok(zoneForHr(95, loaded) === 1, 'zone recompute with custom hrMax');
