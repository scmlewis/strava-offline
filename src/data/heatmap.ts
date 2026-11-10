import type { Activity } from './types';

/** Any route point this far from an activity's median centre is treated as a GPS spike. */
export const MAX_POINT_RADIUS_KM = 100;

/** Bounds are expanded to at least this many degrees per axis so tiny routes stay visible. */
export const MIN_SPAN_DEG = 0.002;

/** Gamma applied to normalised overlap density, lifting lightly used paths away from the cold end. */
export const GAMMA = 0.85;

/** Longest raster edge, capping buffer size on very large viewports. */
export const MAX_RASTER = 2048;

/** `localStorage` key for the persisted heatmap preferences. */
export const HEATMAP_PREFS_KEY = 'heatmapPrefs';

/** Esri World Dark Gray Canvas raster tiles; keyless and the only network resource the heatmap loads. */
export const TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';

/** Attribution required by the Esri / OpenStreetMap tile licence. */
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, and the GIS user community';

/** Overlap count treated as the hottest line; higher counts clamp. */
export const HEAT_MAX_COUNT = 64;

/** Opaque line-heat ramp from a muted single-use red to near-white. */
export const HEAT_RAMP: Array<{ at: number; rgb: [number, number, number] }> = [
  { at: 0, rgb: [88, 12, 8] },
  { at: 0.2, rgb: [138, 24, 10] },
  { at: 0.4, rgb: [196, 48, 8] },
  { at: 0.62, rgb: [240, 96, 16] },
  { at: 0.8, rgb: [255, 168, 56] },
  { at: 1, rgb: [255, 246, 200] },
];

/** Perceptual value for a corridor overlap count, independent of the filtered set. */
export function densityValue(count: number): number {
  const safe = Math.max(0, count);
  return Math.min(1, Math.log1p(safe) / Math.log1p(HEAT_MAX_COUNT)) ** GAMMA;
}

/** Interpolated opaque RGB for a normalised heat value. */
export function heatColor(value: number): [number, number, number] {
  const v = Math.min(1, Math.max(0, value));
  let upper = 1;
  while (upper < HEAT_RAMP.length - 1 && HEAT_RAMP[upper].at < v) upper++;
  const hi = HEAT_RAMP[upper];
  const lo = HEAT_RAMP[upper - 1];
  const span = hi.at - lo.at;
  const t = span === 0 ? 0 : (v - lo.at) / span;
  return [0, 1, 2].map((i) => Math.round(lo.rgb[i] + (hi.rgb[i] - lo.rgb[i]) * t)) as [
    number,
    number,
    number,
  ];
}

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

/** A Leaflet-style viewport: `center` is `[lat, lon]`, matching `L.LatLng`. */
export interface MapView {
  center: [number, number];
  zoom: number;
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

/** Default heatmap preferences; also the fallback for missing or malformed storage. */
export const DEFAULT_HEATMAP_PREFS: HeatmapPrefs = {
  opacity: 0.85,
  basemap: true,
  sports: [],
};

/** Lowest and highest overlay opacity the slider/prefs allow. */
export const MIN_HEAT_OPACITY = 0.25;
export const MAX_HEAT_OPACITY = 1;

/**
 * Validates an unknown parsed `heatmapPrefs` value field by field, so one bad key
 * cannot discard the rest of the user's preferences.
 */
export function normalisePrefs(value: unknown): HeatmapPrefs {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const rawOpacity = source.opacity;

  return {
    opacity:
      typeof rawOpacity === 'number' && Number.isFinite(rawOpacity)
        ? Math.min(MAX_HEAT_OPACITY, Math.max(MIN_HEAT_OPACITY, rawOpacity))
        : DEFAULT_HEATMAP_PREFS.opacity,
    basemap:
      typeof source.basemap === 'boolean'
        ? source.basemap
        : DEFAULT_HEATMAP_PREFS.basemap,
    sports: Array.isArray(source.sports)
      ? source.sports.filter((sport): sport is string => typeof sport === 'string')
      : [],
  };
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

    // Copy each surviving tuple so display-time data (the heat overlay, decimation
    // in consumers) can never alias — and therefore mutate — the stored route.
    const points: [number, number][] = [];
    for (const [lat, lon] of valid) {
      if (haversineKm([medianLat, medianLon], [lat, lon]) <= MAX_POINT_RADIUS_KM) {
        points.push([lat, lon]);
      }
    }
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
 * Whether a saved viewport is worth discarding and refitting to the heat. Projects
 * both rectangles into world pixels at the saved zoom and returns `true` when they
 * do not overlap, so a user who panned away gets pulled back to their routes while
 * one centred on the heat keeps their viewport across tab switches.
 */
export function shouldRefit(
  view: MapView | null,
  bounds: HeatBounds,
  size: { width: number; height: number },
): boolean {
  if (!view) return true;

  const scale = 256 * 2 ** view.zoom;
  const centre = lonLatToWorld(view.center[0], view.center[1]);
  const viewLeft = centre.x * scale - size.width / 2;
  const viewTop = centre.y * scale - size.height / 2;
  const viewRight = viewLeft + size.width;
  const viewBottom = viewTop + size.height;

  const nw = lonLatToWorld(bounds.north, bounds.west);
  const se = lonLatToWorld(bounds.south, bounds.east);
  const heatLeft = nw.x * scale;
  const heatTop = nw.y * scale;
  const heatRight = se.x * scale;
  const heatBottom = se.y * scale;

  const intersects =
    viewRight > heatLeft &&
    viewLeft < heatRight &&
    viewBottom > heatTop &&
    viewTop < heatBottom;

  return !intersects;
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
