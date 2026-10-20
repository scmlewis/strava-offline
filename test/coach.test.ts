import { describe, it, expect } from 'vitest';
import { pickNote, isoWeek, type CoachInputs } from '../src/data/coach.ts';
import type { LoadPoint, WeeklyPoint } from '../src/data/analyze.ts';

function inp(over: Partial<CoachInputs>): CoachInputs {
  return {
    load: [],
    weekly: [],
    easy: { easyCount: 5, hardCount: 1, pct: 83, basis: 'histogram' },
    streak: { current: 0, longest: 0, currentEnds: null },
    goalWeeklyKm: null,
    goalEasyPct: 80,
    units: { dist: 'km', pace: 'min/km' },
    thisMonday: '2026-06-15',
    lastActivityMonday: '2026-06-15',
    ...over,
  };
}

function load(tsb: number, ctl = 60): LoadPoint[] {
  return [
    { date: '2026-06-14', ctl: ctl - 3, atl: ctl - 3 - 10, tsb: 10 },
    { date: '2026-06-15', ctl, atl: ctl - tsb, tsb },
  ];
}

function weeks(distances: number[]): WeeklyPoint[] {
  // week keys: Mondays ending at thisMonday 2026-06-15
  const keys = ['2026-05-25', '2026-06-01', '2026-06-08', '2026-06-15'];
  return distances.map((d, i) => ({
    week: keys[i] ?? `2026-04-${String(6 + i).padStart(2, '0')}`,
    distanceKm: d,
    hours: d / 10,
    count: 3,
  }));
}

describe('isoWeek', () => {
  it('returns 1 for 2026-01-01 (Thursday of week 1)', () => {
    expect(isoWeek('2026-01-01')).toBe(1);
  });
  it('returns 1 for 2025-12-29 (Monday of ISO week 1 of 2026)', () => {
    expect(isoWeek('2025-12-29')).toBe(1);
  });
});

describe('pickNote honesty fallback', () => {
  it('returns empty with < 3 weeks', () => {
    const out = pickNote(inp({ weekly: weeks([30, 32]).slice(0, 2) }));
    expect('empty' in out).toBe(true);
    if ('empty' in out) expect(out.empty).toContain('Not enough history');
  });
  it('returns empty with no distance and no HR', () => {
    const out = pickNote(
      inp({
        weekly: weeks([0, 0, 0, 0]),
        easy: { easyCount: 0, hardCount: 0, pct: null, basis: 'avgHr' },
      }),
    );
    expect('empty' in out).toBe(true);
  });
});

describe('pickNote rule ranking', () => {
  it('rule 1 fatigue: TSB -15 wins', () => {
    const out = pickNote(inp({ load: load(-15), weekly: weeks([30, 35, 40, 42]) }));
    expect('empty' in out).toBe(false);
    if (!('empty' in out)) {
      expect(out.headline).toBe('Banked deep.');
      expect(out.body).toContain('TSB -15');
    }
  });
  it('rule 2 freshness: TSB +8 with CTL at recent high', () => {
    const out = pickNote(inp({ load: load(8, 60), weekly: weeks([30, 32, 31, 30]) }));
    if (!('empty' in out)) {
      expect(out.headline).toBe('Sharp and ready.');
      expect(out.body).toContain('TSB +8');
    }
  });
  it('rule 3 drift: easy 55% vs 80 goal on histogram basis', () => {
    const out = pickNote(
      inp({
        load: load(0),
        weekly: weeks([30, 32, 31, 30]),
        easy: { easyCount: 11, hardCount: 9, pct: 55, basis: 'histogram' },
      }),
    );
    if (!('empty' in out)) {
      expect(out.headline).toBe('Drifting grey.');
      expect(out.body).toContain('55%');
      expect(out.body).toContain('25-point');
    }
  });
  it('rule 3 does not fire on avgHr basis', () => {
    const out = pickNote(
      inp({
        load: load(0),
        weekly: weeks([30, 32, 31, 30]),
        easy: { easyCount: 11, hardCount: 9, pct: 55, basis: 'avgHr' },
      }),
    );
    if (!('empty' in out)) expect(out.headline).not.toBe('Drifting grey.');
  });
  it('rule 4 momentum: biggest week in 12+ weeks', () => {
    const out = pickNote(inp({ load: load(0), weekly: weeks([30, 32, 31, 42]) }));
    if (!('empty' in out)) {
      expect(out.headline).toBe('Biggest week in 12 weeks.');
      expect(out.body).toContain('42.0 km');
    }
  });
  it('rule 4 momentum: 7-day streak milestone', () => {
    const out = pickNote(
      inp({
        load: load(0),
        weekly: weeks([30, 32, 31, 30]),
        streak: { current: 7, longest: 7, currentEnds: '2026-06-15' },
      }),
    );
    if (!('empty' in out)) expect(out.headline).toBe('7-day streak.');
  });
  it('rule 5 goal behind: last full week under target', () => {
    const out = pickNote(inp({ load: load(0), weekly: weeks([30, 32, 30, 38]), goalWeeklyKm: 40 }));
    if (!('empty' in out)) {
      expect(out.headline).toBe('Behind on the weekly.');
      expect(out.body).toContain('30.0 km');
      expect(out.body).toContain('40.0 km');
    }
  });
  it('rule 5 goal on-pace: last full week >= 90% of target', () => {
    const out = pickNote(inp({ load: load(0), weekly: weeks([30, 32, 38, 10]), goalWeeklyKm: 40 }));
    if (!('empty' in out)) expect(out.headline).toBe('On pace.');
  });
  it('rule 6 quiet baseline when nothing else fires', () => {
    const out = pickNote(inp({ load: load(0), weekly: weeks([30, 32, 31, 30]) }));
    if (!('empty' in out)) expect(out.headline).toBe('Steady work.');
  });
});

describe('pickNote secondary and formatting', () => {
  it('surfaces a second top-3 rule as secondary', () => {
    const out = pickNote(
      inp({
        load: load(-15),
        weekly: weeks([30, 35, 40, 42]),
        easy: { easyCount: 11, hardCount: 9, pct: 55, basis: 'histogram' },
      }),
    );
    if (!('empty' in out)) {
      expect(out.headline).toBe('Banked deep.');
      expect(out.secondary).toContain('55%');
    }
  });
  it('formats distances in miles when units say mi', () => {
    const out = pickNote(
      inp({
        load: load(0),
        weekly: weeks([30, 32, 31, 42]),
        units: { dist: 'mi', pace: 'min/mi' },
      }),
    );
    if (!('empty' in out)) expect(out.body).toContain('26.1 mi');
  });
  it('includes ISO week number for the kicker', () => {
    const out = pickNote(inp({ load: load(0), weekly: weeks([30, 32, 31, 30]) }));
    if (!('empty' in out)) expect(out.week).toBe(isoWeek('2026-06-15'));
  });
});
