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
    expect(matchesFilters(acts, { ...DEFAULT_FILTERS, type: 'run' }).map((a) => a.id)).toEqual([
      'a',
    ]);
  });
  it('filters by minKm', () => {
    const acts = [act('a', { distanceKm: 5 }), act('b', { distanceKm: 12 })];
    expect(matchesFilters(acts, { ...DEFAULT_FILTERS, minKm: 10 }).map((a) => a.id)).toEqual(['b']);
  });
  it('filters by search across name/type/date', () => {
    const acts = [act('Morning Run'), act('Evening Ride')];
    expect(matchesFilters(acts, { ...DEFAULT_FILTERS, search: 'ride' }).map((a) => a.id)).toEqual([
      'Evening Ride',
    ]);
  });
});

describe('countActiveFilters', () => {
  it('is 0 for defaults and counts each set field', () => {
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
    expect(countActiveFilters({ ...DEFAULT_FILTERS, type: 'Run', minKm: 5 })).toBe(2);
  });
});
