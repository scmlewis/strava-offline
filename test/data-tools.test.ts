import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  clearSettings,
  computeTypeBreakdown,
  buildFilteredBundle,
  formatStorageMeter,
  type BackupBundle,
} from '../src/data/db.ts';
import type { Activity } from '../src/data/types.ts';

const store: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  vi.stubGlobal('localStorage', {
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
  } as Storage);
});

function act(id: string, type: string): Activity {
  return {
    id,
    source: 'csv',
    date: '2024-01-01',
    ts: 1,
    name: id,
    type,
    distanceKm: 5,
    movingTimeMin: 30,
  } as Activity;
}

describe('computeTypeBreakdown', () => {
  it('counts per type sorted desc', () => {
    const out = computeTypeBreakdown([act('a', 'Run'), act('b', 'Ride'), act('c', 'Run')]);
    expect(out).toEqual([
      { type: 'Run', count: 2 },
      { type: 'Ride', count: 1 },
    ]);
  });
});

describe('buildFilteredBundle', () => {
  it('keeps v1 shape with subset activities', () => {
    const base = {
      version: 1,
      exportedAt: 'x',
      zones: {},
      goals: {},
      units: {},
      activities: [act('a', 'Run'), act('b', 'Ride')],
    } as unknown as BackupBundle;
    const out = buildFilteredBundle(base, [act('a', 'Run')]);
    expect(out.version).toBe(1);
    expect(out.activities.map((a) => a.id)).toEqual(['a']);
  });
});

describe('formatStorageMeter', () => {
  it('renders counts only without bytes', () => {
    expect(formatStorageMeter(3, null, [{ type: 'Run', count: 3 }])).toBe('3 activities · Run 3');
  });
  it('renders MB when bytes known', () => {
    expect(formatStorageMeter(3, 4_200_000, [{ type: 'Run', count: 3 }])).toContain('MB');
  });
});

describe('clearSettings', () => {
  it('removes known keys and keeps others', () => {
    store['goals'] = '{}';
    store['unitPref'] = '{}';
    store['keep'] = 'yes';
    clearSettings();
    expect(store['goals']).toBeUndefined();
    expect(store['unitPref']).toBeUndefined();
    expect(store['keep']).toBe('yes');
  });
});
