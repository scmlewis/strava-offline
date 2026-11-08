import type { Activity } from './types';

/** Any route point this far from an activity's median centre is treated as a GPS spike. */
export const MAX_POINT_RADIUS_KM = 100;

/** Bounds are expanded to at least this many degrees per axis so tiny routes stay visible. */
export const MIN_SPAN_DEG = 0.002;

/** Alpha quantile used as the top of the heat scale so a few dense pixels cannot wash out the map. */
export const HOT_QUANTILE = 0.98;

/** Gamma applied to normalised heat, lifting mid-density trails away from the cold end. */
export const GAMMA = 0.75;

/** Longest raster edge, capping buffer size on very large viewports. */
export const MAX_RASTER = 2048;

/** `localStorage` key for the persisted heatmap preferences. */
export const HEATMAP_PREFS_KEY = 'heatmapPrefs';

/** Colour stops for the heat overlay, ascending from cold (0) to hot (1). */
export const RAMP: Array<{ at: number; rgba: [number, number, number, number] }> = [
  { at: 0, rgba: [252, 76, 2, 0] },
  { at: 0.1, rgba: [120, 40, 10, 120] },
  { at: 0.3, rgba: [200, 60, 10, 200] },
  { at: 0.55, rgba: [252, 76, 2, 235] },
  { at: 0.75, rgba: [255, 140, 40, 250] },
  { at: 0.9, rgba: [255, 205, 90, 255] },
  { at: 1, rgba: [255, 246, 200, 255] },
];

const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
/** Radius around (0, 0) that marks a route as bogus rather than a real equatorial track. */
const NULL_ISLAND_TOLERANCE_DEG = 0.001;
/** Mercator projection diverges near the poles, so reject latitudes beyond this. */
const MAX_ABS_LAT = 85;
const DEFAULT_PAD_FRACTION = 0.04;

export interface SanitizedRoute {
  id: string;
  type: string;
  points: [number, number][];
}

export interface HeatBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface SportTypeCount {
  type: string;
  count: number;
}

export interface HeatmapPrefs {
  opacity: number;
  basemap: boolean;
  sports: string[];
}

/** Web Mercator normalised world coordinates; (0, 0) is the top-left corner. */
export function lonLatToWorld(lat: number, lon: number): { x: number; y: number } {
  const sin = Math.sin(lat * DEG_TO_RAD);
  return {
    x: (lon + 180) / 360,
    y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  };
}

/** Inverse of {@link lonLatToWorld}. */
export function worldToLonLat(x: number, y: number): { lat: number; lon: number } {
  return {
    lat: RAD_TO_DEG * Math.atan(Math.sinh(Math.PI * (1 - 2 * y))),
    lon: x * 360 - 180,
  };
}

/** Great-circle distance in kilometres between two `[lat, lon]` pairs. */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function normaliseType(type: string | undefined): string {
  return (type || '').trim() || 'Unknown';
}

/**
 * Filters out malformed and spiking GPS points without touching the stored route.
 * An activity is dropped entirely when its cleaned route has fewer than two points
 * or when its centre sits on null island.
 */
export function sanitizeRoutes(acts: Activity[]): SanitizedRoute[] {
  const routes: SanitizedRoute[] = [];

  for (const activity of acts) {
    if (!activity.route || activity.route.length === 0) continue;

    const valid = activity.route.filter(
      ([lat, lon]) =>
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        !(lat === 0 && lon === 0) &&
        Math.abs(lat) <= MAX_ABS_LAT,
    );
    if (valid.length === 0) continue;

    const medianLat = median(valid.map(([lat]) => lat));
    const medianLon = median(valid.map(([, lon]) => lon));
    if (
      Math.abs(medianLat) <= NULL_ISLAND_TOLERANCE_DEG &&
      Math.abs(medianLon) <= NULL_ISLAND_TOLERANCE_DEG
    ) {
      continue;
    }

    const points = valid.filter(
      ([lat, lon]) => haversineKm([medianLat, medianLon], [lat, lon]) <= MAX_POINT_RADIUS_KM,
    );
    if (points.length < 2) continue;

    routes.push({ id: activity.id, type: normaliseType(activity.type), points });
  }

  return routes;
}

/**
 * Bounding box over every sanitised route, padded so the outermost points are not
 * flush against the viewport edge. Returns `null` when there are no points to show.
 */
export function computeHeatBounds(
  routes: SanitizedRoute[],
  padFraction = DEFAULT_PAD_FRACTION,
): HeatBounds | null {
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  let hasPoint = false;

  for (const route of routes) {
    for (const [lat, lon] of route.points) {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      hasPoint = true;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
      if (lon < west) west = lon;
      if (lon > east) east = lon;
    }
  }

  if (!hasPoint) return null;

  if (north - south < MIN_SPAN_DEG) {
    const centreLat = (north + south) / 2;
    south = centreLat - MIN_SPAN_DEG / 2;
    north = centreLat + MIN_SPAN_DEG / 2;
  }
  if (east - west < MIN_SPAN_DEG) {
    const centreLon = (east + west) / 2;
    west = centreLon - MIN_SPAN_DEG / 2;
    east = centreLon + MIN_SPAN_DEG / 2;
  }

  const padLat = (north - south) * padFraction;
  const padLon = (east - west) * padFraction;

  return {
    west: west - padLon,
    south: south - padLat,
    east: east + padLon,
    north: north + padLat,
  };
}

/**
 * Sport chips for route-bearing activities only, so counts match what the heat
 * layer can actually draw. Sorted by frequency, then alphabetically.
 */
export function sportTypes(acts: Activity[]): SportTypeCount[] {
  const counts = new Map<string, number>();

  for (const route of sanitizeRoutes(acts)) {
    const type = normaliseType(route.type);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

/**
 * Alpha level at `q` over the non-transparent pixels, used to normalise the heat
 * overlay. Transparent pixels are ignored so sparse margins do not drag the scale down.
 */
export function heatQuantile(alpha: Uint8Array, q = HOT_QUANTILE): number {
  const values: number[] = [];
  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i] > 0) values.push(alpha[i]);
  }
  if (values.length === 0) return 0;

  values.sort((a, b) => a - b);
  const index = Math.min(values.length - 1, Math.max(0, Math.floor(q * (values.length - 1))));
  return values[index];
}

/**
 * Recolours an RGBA raster in place, mapping its alpha channel through {@link RAMP}.
 * `hot` is the alpha value that should reach the hottest stop; everything above it clamps.
 * The input RGB is treated as white, so all colour comes from the ramp.
 */
export function applyHeatRamp(rgba: Uint8ClampedArray, hot: number): void {
  const scale = 255 / Math.max(hot, 8);

  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = rgba[i + 3];
    if (alpha < 3) {
      rgba[i + 3] = 0;
      continue;
    }

    const v = Math.min(1, (alpha * scale) / 255) ** GAMMA;

    let upper = 1;
    while (upper < RAMP.length - 1 && RAMP[upper].at < v) upper++;

    const hi = RAMP[upper];
    const lo = RAMP[upper - 1];
    const span = hi.at - lo.at;
    const t = span === 0 ? 0 : (v - lo.at) / span;

    for (let channel = 0; channel < 4; channel++) {
      rgba[i + channel] = lo.rgba[channel] + (hi.rgba[channel] - lo.rgba[channel]) * t;
    }
  }
}
