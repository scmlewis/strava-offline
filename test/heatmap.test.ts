import { describe, expect, it } from 'vitest';
import {
  MAX_POINT_RADIUS_KM,
  MIN_SPAN_DEG,
  applyHeatRamp,
  computeHeatBounds,
  haversineKm,
  heatQuantile,
  lonLatToWorld,
  sanitizeRoutes,
  shouldRefit,
  sportTypes,
  worldToLonLat,
} from '../src/data/heatmap';
import type { Activity } from '../src/data/types';

function activity(
  id: string,
  route: [number, number][] | null,
  type = 'Run',
): Activity {
  return {
    id,
    source: 'gpx',
    date: '2024-01-01',
    ts: 0,
    name: id,
    type,
    distanceKm: 5,
    movingTimeMin: 30,
    elapsedTimeMin: 30,
    avgHr: null,
    maxHr: null,
    avgSpeedKmh: null,
    elevationGainM: null,
    cadence: null,
    route,
  };
}

describe('projection', () => {
  it('maps null island to the centre of the world', () => {
    expect(lonLatToWorld(0, 0)).toEqual({ x: 0.5, y: 0.5 });
    const back = worldToLonLat(0.5, 0.5);
    expect(back.lat).toBeCloseTo(0, 9);
    expect(back.lon).toBeCloseTo(0, 9);
  });

  it('round-trips a London coordinate', () => {
    const p = lonLatToWorld(51.5074, -0.1278);
    const back = worldToLonLat(p.x, p.y);
    expect(back.lat).toBeCloseTo(51.5074, 9);
    expect(back.lon).toBeCloseTo(-0.1278, 9);
  });
});

describe('haversineKm', () => {
  it('measures London to Paris at about 343 km', () => {
    const d = haversineKm([51.5074, -0.1278], [48.8566, 2.3522]);
    expect(d).toBeGreaterThan(330);
    expect(d).toBeLessThan(360);
  });
});

describe('sanitizeRoutes', () => {
  it('drops (0,0), non-finite and far-away spike points', () => {
    const route: [number, number][] = [
      [51.5, -0.1],
      [0, 0],
      [Number.NaN, -0.1],
      [51.5001, -0.1001],
      [51.5002, -0.1002],
      [40.7128, -74.006],
    ];
    const [out] = sanitizeRoutes([activity('a', route)]);
    expect(out.points).toHaveLength(3);
    expect(out.points.every(([lat, lon]) => lat > 51 && lon < 0)).toBe(true);
  });

  it('keeps legitimate end-of-route points', () => {
    const route: [number, number][] = [
      [51.5, -0.1],
      [51.52, -0.09],
      [51.54, -0.08],
      [51.55, -0.07],
    ];
    expect(sanitizeRoutes([activity('a', route)])[0].points).toHaveLength(4);
  });

  it('keeps points within the outlier radius when they are real', () => {
    const km = MAX_POINT_RADIUS_KM / 111;
    const route: [number, number][] = [
      [51.5, -0.1],
      [51.5 + km * 0.8, -0.1],
      [51.5 + km * 0.95, -0.1],
    ];
    expect(sanitizeRoutes([activity('a', route)])[0].points).toHaveLength(3);
  });

  it('drops activities centred on (0,0) or left with fewer than 2 points', () => {
    expect(sanitizeRoutes([activity('a', [[0, 0], [0, 0.0001]])])).toEqual([]);
    expect(sanitizeRoutes([activity('b', [[51.5, -0.1]])])).toEqual([]);
    expect(sanitizeRoutes([activity('c', null)])).toEqual([]);
  });

  it('does not mutate the stored route', () => {
    const route: [number, number][] = [
      [51.5, -0.1],
      [0, 0],
      [51.5001, -0.1001],
    ];
    const copy = route.map((p) => [...p]);
    sanitizeRoutes([activity('a', route)]);
    expect(route).toEqual(copy);
  });
});

describe('computeHeatBounds', () => {
  const routes = sanitizeRoutes([
    activity('a', [
      [51.5, -0.12],
      [51.55, -0.08],
    ]),
    activity('b', [
      [51.48, -0.1],
      [51.52, -0.15],
    ]),
  ]);

  it('contains every point and pads the box', () => {
    const b = computeHeatBounds(routes)!;
    expect(b.south).toBeLessThan(51.48);
    expect(b.north).toBeGreaterThan(51.55);
    expect(b.west).toBeLessThan(-0.15);
    expect(b.east).toBeGreaterThan(-0.08);
  });

  it('returns null for no routes', () => {
    expect(computeHeatBounds([])).toBeNull();
  });

  it('enforces a minimum span for a single repeated point', () => {
    const b = computeHeatBounds(sanitizeRoutes([activity('a', [[51.5, -0.1], [51.5, -0.1]])]))!;
    expect(b.north - b.south).toBeGreaterThanOrEqual(MIN_SPAN_DEG);
    expect(b.east - b.west).toBeGreaterThanOrEqual(MIN_SPAN_DEG);
  });
});

describe('sportTypes', () => {
  it('counts route-bearing activities only, sorted by count then name', () => {
    const acts = [
      activity('a', [[51.5, -0.1], [51.51, -0.1]], 'Run'),
      activity('b', [[51.5, -0.1], [51.51, -0.1]], 'Run'),
      activity('c', [[51.5, -0.1], [51.51, -0.1]], 'Ride'),
      activity('d', null, 'Swim'),
      activity('e', [[51.5, -0.1], [51.51, -0.1]], ''),
    ];
    expect(sportTypes(acts)).toEqual([
      { type: 'Run', count: 2 },
      { type: 'Ride', count: 1 },
      { type: 'Unknown', count: 1 },
    ]);
  });
});

describe('heatQuantile', () => {
  it('ignores zero alpha and returns the requested quantile', () => {
    const alpha = new Uint8Array([0, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(heatQuantile(alpha, 0.5)).toBe(50);
    expect(heatQuantile(alpha, 1)).toBe(100);
  });

  it('returns 0 when every pixel is transparent', () => {
    expect(heatQuantile(new Uint8Array([0, 0, 0]), 0.98)).toBe(0);
  });
});

describe('applyHeatRamp', () => {
  it('leaves transparent pixels transparent', () => {
    const px = new Uint8ClampedArray([255, 255, 255, 0]);
    applyHeatRamp(px, 255);
    expect(px[3]).toBe(0);
  });

  it('maps full heat to the hot end of the ramp', () => {
    const px = new Uint8ClampedArray([255, 255, 255, 255]);
    applyHeatRamp(px, 255);
    expect([px[0], px[1], px[2], px[3]]).toEqual([255, 246, 200, 255]);
  });

  it('clamps values above the hot level and brightens monotonically', () => {
    const low = new Uint8ClampedArray([255, 255, 255, 20]);
    const high = new Uint8ClampedArray([255, 255, 255, 120]);
    const over = new Uint8ClampedArray([255, 255, 255, 255]);
    applyHeatRamp(low, 200);
    applyHeatRamp(high, 200);
    applyHeatRamp(over, 100);
    const brightness = (v: Uint8ClampedArray) => v[0] + v[1] + v[2] + v[3];
    expect(brightness(high)).toBeGreaterThan(brightness(low));
    expect([over[0], over[1], over[2], over[3]]).toEqual([255, 246, 200, 255]);
  });
});

describe('shouldRefit', () => {
  const bounds = { west: -0.15, south: 51.48, east: -0.08, north: 51.55 };
  const size = { width: 800, height: 600 };

  it('refits when there is no saved view', () => {
    expect(shouldRefit(null, bounds, size)).toBe(true);
  });

  it('keeps a view centred on the heat', () => {
    expect(shouldRefit({ center: [51.515, -0.115], zoom: 13 }, bounds, size)).toBe(false);
  });

  it('refits when the view has moved to another region', () => {
    expect(shouldRefit({ center: [48.8566, 2.3522], zoom: 13 }, bounds, size)).toBe(true);
  });
});
