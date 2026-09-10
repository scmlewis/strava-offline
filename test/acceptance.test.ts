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
