import JSZip from 'jszip';
import { parseActivitiesCsv } from './csv';
import { parseGpx } from './gpx';
import type { Activity } from './types';

function idFromFile(name: string): string | null {
  // Strava bulk export names GPX files like "2023-12-25_Morning_Run_1234567890.gpx"
  // (no "activity" prefix) — the TRAILING digits are the Strava activity id,
  // which matches the "Activity ID" column in activities.csv. Match the LAST
  // digit group so the leading date (e.g. 2024) is ignored.
  const m = name.match(/([0-9]+)(?!.*[0-9])/);
  return m ? m[1] : null;
}

export async function ingestFiles(files: File[] | FileList): Promise<Activity[]> {
  const all: Activity[] = [];
  const gpxById = new Map<string, Activity>();

  for (const file of Array.from(files)) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.csv')) {
      const text = await file.text();
      all.push(...parseActivitiesCsv(text));
    } else if (lower.endsWith('.zip')) {
      const buf = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(buf);
      let csvText: string | null = null;
      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const p = path.toLowerCase();
        if (p.endsWith('activities.csv')) {
          csvText = await entry.async('string');
        } else if (p.endsWith('.gpx')) {
          const id = idFromFile(path);
          if (id) {
            const xml = await entry.async('string');
            const r = parseGpx(xml, id);
            if (r) gpxById.set(id, r.activity);
          }
        }
      }
      if (csvText) all.push(...parseActivitiesCsv(csvText));
    }
  }

  // Merge GPX extras into matching CSV activities by Strava id
  const merged = all.map((a) => {
    const id = a.id.replace(/^csv:/, '');
    const g = gpxById.get(id);
    if (g) {
      return {
        ...a,
        hrHistogram: g.hrHistogram ?? a.hrHistogram,
        route: g.route ?? a.route,
        avgHr: a.avgHr ?? g.avgHr,
        maxHr: a.maxHr ?? g.maxHr,
        movingTimeMin: a.movingTimeMin ?? g.movingTimeMin,
      };
    }
    return a;
  });
  return merged;
}
