import Papa from 'papaparse';
import type { Activity } from './types';

function num(v: string | undefined): number | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/,/g, '');
  if (s === '' || s === '-') return null;
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

// Strava date example: "2024-01-05 7:14:32 AM" — interpreted as LOCAL time.
// new Date("2024-01-05 7:14:32 AM") parses ambiguously across engines; parse components
// explicitly so the day never shifts when the user is east/west of UTC.
function parseDate(v: string | undefined): { date: string; ts: number } | null {
  if (!v) return null;
  const s = String(v).trim();
  // Strava format A: "2024-01-05 7:14:32 AM"
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?/i);
  if (m) {
    let h = parseInt(m[4], 10) % 24;
    const meridiem = m[7]?.toUpperCase();
    if (meridiem === 'PM' && h < 12) h += 12;
    if (meridiem === 'AM' && h === 12) h = 0;
    const y = +m[1];
    const mo = +m[2];
    const d = +m[3];
    const mi = +m[5];
    const se = +m[6];
    const dt = new Date(y, mo - 1, d, h, mi, se, 0);
    if (!isNaN(dt.getTime())) {
      const date = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return { date, ts: dt.getTime() };
    }
  }
  // Strava format B: "Aug 19, 2026, 3:08:04 PM" (English month abbrev, 12h)
  const MON: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6,
    aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const m2 = s.match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?/i);
  if (m2) {
    const mo = MON[m2[1].toLowerCase()];
    if (mo != null) {
      let h = parseInt(m2[4], 10) % 24;
      const mer = m2[7]?.toUpperCase();
      if (mer === 'PM' && h < 12) h += 12;
      if (mer === 'AM' && h === 12) h = 0;
      const y = +m2[3];
      const d = +m2[2];
      const mi = +m2[5];
      const se = +m2[6];
      const dt = new Date(y, mo, d, h, mi, se, 0);
      if (!isNaN(dt.getTime())) {
        const date = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        return { date, ts: dt.getTime() };
      }
    }
  }
  const fallback = new Date(s);
  if (isNaN(fallback.getTime())) return null;
  // local YYYY-MM-DD
  const y = fallback.getFullYear();
  const mo = fallback.getMonth() + 1;
  const d = fallback.getDate();
  const date = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { date, ts: fallback.getTime() };
}

const COL = {
  id: 'Activity ID',
  date: 'Activity Date',
  name: 'Activity Name',
  type: 'Activity Type',
  dist: 'Distance',
  elapsed: 'Elapsed Time',
  moving: 'Moving Time',
  avgHr: 'Average Heart Rate',
  maxHr: 'Max Heart Rate',
  avgSpeed: 'Average Speed',
  elev: 'Elevation Gain',
  cad: 'Average Run Cadence',
};

// Build a 1-bpm HR histogram by spreading avg HR across estimated sample count.
// Without a per-second stream, this is a proxy: a flat distribution centered on avg HR.
function proxyHistogram(avgHr: number | null, movingMin: number | null): Record<number, number> | null {
  if (avgHr == null || movingMin == null || movingMin <= 0) return null;
  const samples = Math.round(movingMin * 60); // ~1 sample/sec
  const bucket = Math.round(avgHr);
  const h: Record<number, number> = {};
  h[bucket] = samples;
  return h;
}

export function parseActivitiesCsv(text: string): Activity[] {
  // NOTE: PapaParse's transformHeader runs on EVERY row (not just the header
  // line), so de-duping headers there corrupts data keys. Instead we parse with
  // header:false, de-dupe the FIRST line ourselves (so a duplicate "Distance"
  // column becomes "Distance" + "Distance_2" — we always read the FIRST, which
  // is meters), then map each data row manually.
  const res = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: true,
  });
  const rows = (res.data ?? []).filter((r) => r && r.length > 0);
  if (rows.length < 2) return [];

  // Build de-duplicated header keys from the first row only.
  const seen: Record<string, number> = {};
  const headers = rows[0].map((h) => {
    const key = h.trim();
    if (!key) return '';
    seen[key] = (seen[key] ?? 0) + 1;
    return seen[key] === 1 ? key : `${key}_${seen[key]}`;
  });

  const out: Activity[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) row[h] = (cells[idx] ?? '').trim();
    });

    const rawId = row[COL.id];
    const id = rawId ? String(rawId).trim() : `csv-${out.length}`;
    const dt = parseDate(row[COL.date]);
    const avgHr = num(row[COL.avgHr]);
    const moving = num(row[COL.moving]);
    const elapsed = num(row[COL.elapsed]);
    const dKm = num(row[COL.dist]);
    const act: Activity = {
      id: `csv:${id}`,
      source: 'csv',
      date: dt?.date ?? '',
      ts: dt?.ts ?? 0,
      name: (row[COL.name] ?? '').trim(),
      type: (row[COL.type] ?? '').trim(),
      // Strava's "Distance" column is already in kilometers (verified against
      // the real export_84880339.zip: speed×movingTime cross-check on 1072
      // activities shows stored distanceKm = real_km / 1000, i.e. the raw
      // column was km and the old /1000 over-shrank every activity 1000×,
      // collapsing the weekly-volume chart to ~0). Use the value as-is.
      distanceKm: dKm != null ? dKm : null,
      movingTimeMin: moving != null ? moving / 60 : null,
      elapsedTimeMin: elapsed != null ? elapsed / 60 : null,
      avgHr,
      maxHr: num(row[COL.maxHr]),
      avgSpeedKmh: (() => {
        const v = num(row[COL.avgSpeed]);
        return v != null ? v * 3.6 : null;
      })(),
      elevationGainM: num(row[COL.elev]),
      cadence: num(row[COL.cad]),
      hrHistogram: proxyHistogram(avgHr, moving != null ? moving / 60 : null),
      route: null,
    };
    out.push(act);
  }
  return out;
}
