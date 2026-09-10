// Acceptance test: exercise the real analysis pipeline end-to-end with
// realistic inputs (real GPX with per-point HR, multi-distance races) so we
// can confirm the existing features actually produce correct numbers.
import { DOMParser as XDOMParser } from '@xmldom/xmldom';
(globalThis as unknown as { DOMParser: typeof XDOMParser }).DOMParser =
  XDOMParser as unknown as typeof DOMParser;

import { DEFAULT_ZONES } from '../src/data/zones.ts';
import { parseGpx } from '../src/data/gpx.ts';
import {
  computePRs,
  computeRiegel,
  computeVO2max,
  computeClimbScore,
  computeStreaks,
} from '../src/data/analyze.ts';
import type { Activity } from '../src/data/types.ts';

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

// A realistic GPX: 40 trackpoints each at a fixed HR, spaced 30s apart
// (so each contributes 1 sample-second of HR). HRs chosen to land in Z1/Z2/Z3/Z5.
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

console.log('GPX parsing + real HR histogram');
const t0 = Date.parse('2024-03-01T00:00:00Z');
const pts: Array<{ hr: number; t: string; lat: number; lon: number }> = [];
// 10 pts @120 (Z1), 20 pts @148 (Z2), 6 pts @170 (Z3), 4 pts @195 (Z5)
const spec = [
  [120, 10],
  [148, 20],
  [170, 6],
  [195, 4],
] as const;
let idx = 0;
for (const [hr, n] of spec) {
  for (let i = 0; i < n; i++) {
    const t = new Date(t0 + idx * 30000).toISOString();
    pts.push({ hr, t, lat: 22.3 + idx * 0.001, lon: 114.1 + idx * 0.001 });
    idx++;
  }
}
const parsed = parseGpx(gpxWithHr(pts), 'gpx1');
ok(parsed !== null, 'GPX parsed with HR extension');
const gpxAct = parsed!.activity;
ok(gpxAct.hrHistogram !== null, 'real 1-bpm histogram built from GPX stream');
ok(gpxAct.distanceKm === null, 'distance null until merged from CSV (expected)');

// histogram total seconds = number of points (each point = 1 sample here)
let totalSamples = 0;
for (const k of Object.keys(gpxAct.hrHistogram!)) totalSamples += gpxAct.hrHistogram![Number(k)];
ok(totalSamples === pts.length, `histogram total = ${pts.length} samples (got ${totalSamples})`);
ok(gpxAct.hrHistogram![120] === 10, '10 samples @ HR120');
ok(gpxAct.hrHistogram![148] === 20, '20 samples @ HR148');
ok(gpxAct.hrHistogram![170] === 6, '6 samples @ HR170');
ok(gpxAct.hrHistogram![195] === 4, '4 samples @ HR195');
ok(gpxAct.route != null && gpxAct.route.length > 0, 'route decimated points stored');

console.log('zone distribution from real GPX histogram');
const { computeZoneDistribution, secondsInZone, histogramSeconds } =
  await import('../src/data/analyze.ts');
const zd = computeZoneDistribution([gpxAct], DEFAULT_ZONES);
ok(zd.basis === 'histogram', 'histogram basis');
ok(secondsInZone(gpxAct.hrHistogram, 1, DEFAULT_ZONES) === 10, 'Z1 = 10s (HR120)');
ok(secondsInZone(gpxAct.hrHistogram, 2, DEFAULT_ZONES) === 20, 'Z2 = 20s (HR148)');
ok(secondsInZone(gpxAct.hrHistogram, 3, DEFAULT_ZONES) === 6, 'Z3 = 6s (HR170)');
ok(
  secondsInZone(gpxAct.hrHistogram, 4, DEFAULT_ZONES) === 4,
  'Z4 = 4s (HR195 — per current zones Z5 starts at 0.95*206=195.7)',
);
ok(histogramSeconds(gpxAct.hrHistogram) === 40, 'total 40s');
// easy = time in Z1+Z2 >= 50% of total -> (10+20)/40 = 75% -> easy
const { computeEasy } = await import('../src/data/analyze.ts');
const ez = computeEasy([gpxAct], DEFAULT_ZONES);
ok(ez.easyCount === 1, 'GPX run classified EASY (75% in Z1/Z2)');
ok(ez.basis === 'histogram', 'easy basis = histogram');

console.log('PR + Riegel with realistic multi-distance races');
// Realistic races: 5K @ 21:00 (1260s), 10K @ 44:00 (2640s), Half @ 1:40:00 (6000s)
const race = (id: string, type: string, km: number, sec: number, date: string): Activity =>
  ({
    id,
    source: 'csv',
    date,
    ts: Date.parse(date + 'T08:00:00'),
    name: type,
    type,
    distanceKm: km,
    movingTimeMin: sec / 60,
    avgHr: 160,
    hrHistogram: null,
  }) as Activity;
const races = [
  race('r1', 'Run', 5, 1260, '2024-01-10'),
  race('r2', 'Run', 10, 2640, '2024-02-10'),
  race('r3', 'Run', 21.1, 6000, '2024-03-10'),
];
const prs = computePRs(races);
const p5 = prs.find((p) => p.label === '5K')!;
const p10 = prs.find((p) => p.label === '10K')!;
const pHalf = prs.find((p) => p.label === 'Half')!;
ok(p5.bestSec === 1260, '5K PR = 21:00');
ok(p10.bestSec === 2640, '10K PR = 44:00');
ok(pHalf.bestSec === 6000, 'Half PR = 1:40:00');

// Riegel uses 10K as anchor (preferred). Marathon prediction from 10K.
const riegel = computeRiegel(races);
const mara = riegel.find((r) => r.label === 'Marathon')!;
const expMara = 2640 * Math.pow(42.195 / 10, 1.06);
ok(
  mara.predictedSec != null && approx(mara.predictedSec, expMara, expMara * 0.001),
  `Marathon Riegel from 10K anchor (got ${mara.predictedSec?.toFixed(0)}, exp ${expMara.toFixed(0)})`,
);
ok(mara.anchorLabel === '10K', 'anchor = 10K (preferred)');
// sanity: predicted marathon should be slower than predicted Half (longer distance)
const halfPred = riegel.find((r) => r.label === 'Half')!.predictedSec!;
ok(mara.predictedSec! > halfPred, 'marathon prediction > half prediction');

console.log('VDOT + Jack Daniels paces from real races');
const vd = computeVO2max(races);
ok(vd.vdot != null, 'VDOT computed from best race');
ok(vd.anchorLabel != null, `anchor = ${vd.anchorLabel}`);
// VDOT for 10K @ 44:00 should be a plausible value (~45-55 range for a decent runner)
ok(vd.vdot! > 35 && vd.vdot! < 70, `VDOT plausible (got ${vd.vdot})`);
ok(vd.pacesSecPerKm != null, 'JD paces computed');
if (vd.pacesSecPerKm) {
  const p = vd.pacesSecPerKm;
  // pace ordering: E (easiest/slowest) > M > T > I > R (hardest/fastest)
  ok(p.E > p.M && p.M > p.T && p.T > p.I && p.I > p.R, 'JD pace ordering E>M>T>I>R');
  // VDOT anchor = fastest race (5K). I-pace (~0.98x) should be near that race pace (~252 s/km)
  ok(p.I > 220 && p.I < 280, `I pace near 5K race pace (got ${p.I.toFixed(0)} s/km)`);
  ok(p.E > p.I * 1.2, 'E pace >20% slower than I pace');
}

console.log('Climb Score formula check');
const climbActs: Activity[] = [
  {
    id: 'c1',
    source: 'csv',
    date: '2024-04-01',
    ts: Date.parse('2024-04-01T08:00:00'),
    name: 'Hill',
    type: 'Run',
    distanceKm: 10,
    movingTimeMin: 60,
    avgHr: 150,
    hrHistogram: null,
    elevationGainM: 500,
  } as Activity,
  {
    id: 'c2',
    source: 'csv',
    date: '2024-04-02',
    ts: Date.parse('2024-04-02T08:00:00'),
    name: 'Flat',
    type: 'Run',
    distanceKm: 10,
    movingTimeMin: 50,
    avgHr: 150,
    hrHistogram: null,
    elevationGainM: 50,
  } as Activity,
];
const climb = computeClimbScore(climbActs);
ok(climb.length === 2, 'climb score for 2 activities');
// c1: gain 500, dist 10000m -> grad 0.05 -> score = round(500*(1+0.05*6)) = round(500*1.3)=650
ok(climb[0].id === 'c1', 'hillier run ranked first');
ok(climb[0].score > climb[1].score, 'higher gain -> higher score');
ok(climb[0].score === 650, `c1 climb score = 650 (got ${climb[0].score})`);

console.log('Streak computation');
const streakActs: Activity[] = [];
// 5 consecutive days 2024-05-01..05-05, then gap, then 2024-05-10 (single, not today)
const dates = ['2024-05-01', '2024-05-02', '2024-05-03', '2024-05-04', '2024-05-05', '2024-05-10'];
dates.forEach((d, i) =>
  streakActs.push({
    id: 's' + i,
    source: 'csv',
    date: d,
    ts: Date.parse(d + 'T08:00:00'),
    name: 'Run',
    type: 'Run',
    distanceKm: 5,
    movingTimeMin: 25,
    avgHr: 140,
    hrHistogram: null,
  } as Activity),
);
const st = computeStreaks(streakActs);
ok(st.longest === 5, `longest streak = 5 (got ${st.longest})`);
ok(st.current === 0, `current streak = 0 (last activity not today/yesterday) (got ${st.current})`);

console.log('ZIP ingest: CSV + GPX merge by Strava id (the real "use GPX" path)');
const JSZip = (await import('jszip')).default;
const { ingestFiles } = await import('../src/data/zip.ts');
// Build a Strava-style export zip: activities.csv has a run with id 7777,
// and a GPX file named after that id carries the HR stream + route.
const CSV = `Activity ID,Activity Date,Activity Name,Activity Type,Distance,Elapsed Time,Moving Time,Average Heart Rate,Max Heart Rate,Average Speed,Elevation Gain,Average Run Cadence
7777,2024-06-01 7:00:00 AM,Morning Run,Run,12.0,3300,3000,150,180,2.1,90,88`;
const gpxPts = [];
for (let i = 0; i < 12; i++) {
  const hr = i < 4 ? 140 : 175; // 4 easy (Z2), 8 hard (Z3/4) -> clearly hard
  const t = new Date(Date.parse('2024-06-01T00:00:00Z') + i * 30000).toISOString();
  gpxPts.push(
    `      <trkpt lat="${(22.3 + i * 0.001).toFixed(4)}" lon="${(114.1 + i * 0.001).toFixed(4)}"><ele>10</ele><time>${t}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${hr}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`,
  );
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
// mock File (node has no DOM File with .arrayBuffer returning these); provide name + accessors
const mockZip = {
  name: 'strava-export.zip',
  async arrayBuffer() {
    return zipBuf.buffer.slice(zipBuf.byteOffset, zipBuf.byteOffset + zipBuf.byteLength);
  },
  async text() {
    return '';
  },
} as unknown as File;
const merged = await ingestFiles([mockZip]);
ok(merged.activities.length === 1, 'zip ingest produced 1 activity');
const m = merged.activities[0];
ok(m.id === 'csv:7777', 'activity id preserved from CSV (csv:7777)');
ok(m.distanceKm === 12, `distance 12000m -> 12km from CSV (got ${m.distanceKm})`);
ok(m.hrHistogram !== null, 'GPX HR histogram merged into CSV activity');
ok(m.route !== null && m.route!.length > 0, 'GPX route merged into CSV activity');
// 4 pts @140 (Z2 easy) + 8 pts @175 (Z3/Z4 hard) -> easy fraction 33% -> hard
const ezMerged = (await import('../src/data/analyze.ts')).computeEasy([m], DEFAULT_ZONES);
ok(ezMerged.basis === 'histogram', 'merged activity uses histogram basis');
ok(ezMerged.hardCount === 1, 'merged run with 67% hard HR -> classified hard');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
