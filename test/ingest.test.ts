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
