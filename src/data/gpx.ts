import type { Activity, TrackPoint } from './types';

// HR element names observed across Garmin/Strava GPX extensions
const HR_TAGS = ['gpxtpx:gpxTPXExt', 'gpxtpx:hr', 'gpxpx:hr', 'ns3:hr', 'ns2:hr', 'hr'];

function findHr(pt: Element): number | undefined {
  for (const tag of HR_TAGS) {
    // direct child first
    const direct = pt.getElementsByTagName(tag);
    if (direct.length) {
      const v = parseFloat(direct[0].textContent || '');
      if (isFinite(v)) return v;
    }
  }
  // fallback: search any descendant named *hr*
  const all = pt.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (/hr$/i.test(el.tagName) && el.textContent) {
      const v = parseFloat(el.textContent);
      if (isFinite(v)) return v;
    }
  }
  return undefined;
}

function decimate(pts: TrackPoint[], max = 120): [number, number][] {
  if (pts.length <= max)
    return pts.filter((p) => p.lat != null && p.lon != null).map((p) => [p.lat!, p.lon!]);
  const step = Math.ceil(pts.length / max);
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i += step) {
    const p = pts[i];
    if (p.lat != null && p.lon != null) out.push([p.lat, p.lon]);
  }
  return out;
}

export function parseGpx(
  xml: string,
  id: string,
): { activity: Activity; points: TrackPoint[] } | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  // getElementsByTagName works in browser + xmldom polyfill (querySelector is not universal)
  if (doc.getElementsByTagName('parsererror').length) return null;
  const trkpts = Array.from(doc.getElementsByTagName('trkpt'));
  if (trkpts.length === 0) return null;

  const points: TrackPoint[] = [];
  for (const pt of trkpts) {
    const tEl = pt.getElementsByTagName('time')[0];
    const t = tEl ? new Date(tEl.textContent || '').getTime() : NaN;
    const eleEl = pt.getElementsByTagName('ele')[0];
    const ele = eleEl ? parseFloat(eleEl.textContent || '') : NaN;
    const hr = findHr(pt);
    const lat = parseFloat(pt.getAttribute('lat') || '');
    const lon = parseFloat(pt.getAttribute('lon') || '');
    points.push({
      t: isNaN(t) ? 0 : t,
      hr,
      lat: isFinite(lat) ? lat : undefined,
      lon: isFinite(lon) ? lon : undefined,
      ele: isFinite(ele) ? ele : undefined,
    });
  }

  const times = points
    .map((p) => p.t)
    .filter((t) => t > 0)
    .sort((a, b) => a - b);
  const firstT = times[0];
  const lastT = times[times.length - 1];
  const hrs = points.map((p) => p.hr).filter((h): h is number => h != null);
  const avgHr = hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null;
  const maxHr = hrs.length ? Math.max(...hrs) : null;

  // real 1-bpm histogram from stream
  const hist: Record<number, number> = {};
  for (const h of hrs) {
    const b = Math.round(h);
    hist[b] = (hist[b] || 0) + 1;
  }

  const nameEl = doc.getElementsByTagName('name')[0];
  const activity: Activity = {
    id: `gpx:${id}`,
    source: 'gpx',
    date: firstT ? new Date(firstT).toISOString().slice(0, 10) : '',
    ts: firstT || 0,
    name: nameEl ? (nameEl.textContent || '').trim() : `Activity ${id}`,
    type: '',
    distanceKm: null, // filled from CSV if id matches
    movingTimeMin: firstT && lastT && lastT > firstT ? (lastT - firstT) / 60000 : null,
    elapsedTimeMin: null,
    avgHr,
    maxHr,
    avgSpeedKmh: null,
    elevationGainM: null,
    cadence: null,
    hrHistogram: Object.keys(hist).length ? hist : null,
    route: decimate(points),
  };
  return { activity, points };
}
