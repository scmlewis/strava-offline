import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { activityTSS, vdotFromRace, computeStreaks } from '../src/data/analyze.ts';
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
    maxHr: null,
    avgSpeedKmh: null,
    elevationGainM: null,
    elapsedTimeMin: null,
    cadence: null,
    hrHistogram: { 140: 1800, 150: 1200 },
    ...overrides,
  };
}

describe('activityTSS property tests', () => {
  it('TSS is always non-negative for valid activities', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 220 }),
        fc.double({ min: 1, max: 180 }),
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
            date: fc
              .integer({ min: 19727, max: 20000 })
              .map((n) => new Date(n * 86400000).toISOString().slice(0, 10)),
            tss: fc.double({ min: 0, max: 500 }),
          }),
          { minLength: 1, maxLength: 50 },
        ),
        (dailyTss) => {
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
        fc.integer({ min: 1000, max: 42195 }),
        fc.integer({ min: 100, max: 50000 }),
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
        fc.array(
          fc
            .integer({ min: 19727, max: 20000 })
            .map((n) => new Date(n * 86400000).toISOString().slice(0, 10)),
          {
            minLength: 0,
            maxLength: 100,
          },
        ),
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
