import * as pako from 'pako';
// fit-file-parser has no bundled types
// @ts-ignore -- no @types/fit-file-parser available
import FitParser from 'fit-file-parser';
import type { TrackPoint } from './types';

const SEMICIRCLE_TO_DEG = 11930465.0; // NOT used: fit-file-parser already emits degrees

export interface FitStream {
  /** epoch ms of the activity start (FIT session start_time, UTC) */
  startMs: number;
  hrHistogram: Record<number, number> | null;
  route: [number, number][] | null;
  avgHr: number | null;
  maxHr: number | null;
  /** rough duration from record span, minutes (fallback only) */
  movingTimeMin: number | null;
}

function decimate(pts: TrackPoint[], max = 120): [number, number][] {
  const valid = pts.filter((p) => p.lat != null && p.lon != null).map((p) => [p.lat!, p.lon!] as [number, number]);
  if (valid.length <= max) return valid;
  const step = Math.ceil(valid.length / max);
  const out: [number, number][] = [];
  for (let i = 0; i < valid.length; i += step) out.push(valid[i]);
  return out;
}

/**
 * Parse a gzipped FIT activity (Strava bulk exports store tracks as activities/<id>.fit.gz).
 * Returns the per-second HR histogram + decimated route (real GPS, not the avg-HR proxy).
 */
export async function parseFitGz(gzBytes: Uint8Array): Promise<FitStream | null> {
  let fitBytes: Uint8Array;
  try {
    fitBytes = pako.ungzip(gzBytes);
  } catch {
    return null;
  }

  const fit = new FitParser({ force: true, mode: 'list' });
  const parsed = await new Promise<any>((resolve, reject) => {
    fit.parse(fitBytes.buffer as ArrayBuffer, (error: string | undefined, data: any) => {
      if (error) reject(new Error(error));
      else resolve(data);
    });
  });

  const records: any[] = parsed.records || [];
  if (records.length === 0) return null;

  const points: TrackPoint[] = [];
  const hrs: number[] = [];
  for (const r of records) {
    const hr = r.heart_rate != null && isFinite(r.heart_rate) ? r.heart_rate : undefined;
    // fit-file-parser already emits degrees; guard against a version that returns
    // semicircles (magnitude ~1e7) by converting only when out of range.
    const rawLat = r.position_lat != null ? Number(r.position_lat) : NaN;
    const rawLon = r.position_long != null ? Number(r.position_long) : NaN;
    const lat = !isNaN(rawLat) ? (Math.abs(rawLat) > 180 ? rawLat / SEMICIRCLE_TO_DEG : rawLat) : undefined;
    const lon = !isNaN(rawLon) ? (Math.abs(rawLon) > 180 ? rawLon / SEMICIRCLE_TO_DEG : rawLon) : undefined;
    const t = r.timestamp ? new Date(r.timestamp).getTime() : NaN;
    if (hr != null) hrs.push(hr);
    points.push({
      t: isNaN(t) ? 0 : t,
      hr,
      lat,
      lon,
    });
  }

  // HR histogram (1 bpm buckets)
  const hist: Record<number, number> = {};
  for (const h of hrs) {
    const b = Math.round(h);
    hist[b] = (hist[b] || 0) + 1;
  }

  const times = points.map((p) => p.t).filter((t) => t > 0).sort((a, b) => a - b);
  const startMs = times.length ? times[0] : 0;
  const endMs = times.length ? times[times.length - 1] : 0;
  const movingTimeMin = startMs && endMs && endMs > startMs ? (endMs - startMs) / 60000 : null;

  return {
    startMs,
    hrHistogram: Object.keys(hist).length ? hist : null,
    route: decimate(points),
    avgHr: hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null,
    maxHr: hrs.length ? Math.max(...hrs) : null,
    movingTimeMin,
  };
}
