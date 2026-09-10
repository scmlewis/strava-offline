import JSZip from 'jszip';
import { parseActivitiesCsv } from './csv';
import { parseGpx } from './gpx';
import { parseFitGz } from './fit';
import type { Activity } from './types';

export interface IngestionIssue {
  file: string;
  reason: string;
}

export interface IngestSummary {
  activities: Activity[];
  issues: IngestionIssue[];
}

// Browser tz offset (minutes WEST of UTC). Strava CSV "Activity Date" is stored as
// local wall-clock; FIT session start_time is UTC. The join key is:
//   fitUtcSec = floor((csv.ts + tzOffsetMs) / 1000)
function tzOffsetMs(ts: number): number {
  return -new Date(ts).getTimezoneOffset() * 60000;
}

function idFromFile(name: string): string | null {
  // Legacy GPX naming (e.g. 2023-12-25_Morning_Run_1234567890.gpx). The trailing
  // digit group is the Strava activity id. Modern exports are FIT-based and joined
  // by timestamp instead (see ingestFiles), so this is a fallback only.
  const m = name.match(/([0-9]+)(?!.*[0-9])/);
  return m ? m[1] : null;
}

/** Build a lookup from expected FIT UTC start-second -> csv activity id. */
function buildFitJoin(acts: Activity[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const a of acts) {
    if (!a.ts) continue;
    const fitSec = Math.floor((a.ts + tzOffsetMs(a.ts)) / 1000);
    map.set(fitSec, a.id);
  }
  return map;
}

function resolveFitId(join: Map<number, string>, fitStartSec: number): string | null {
  for (let dt = 0; dt <= 30; dt++) {
    const hit = join.get(fitStartSec + dt) || join.get(fitStartSec - dt);
    if (hit) return hit;
  }
  return null;
}

/**
 * Parse a Strava export (activities.csv and/or a zip containing activities.csv +
 * per-activity .gpx/.fit.gz tracks) into Activity[].
 *
 * Robustness: a bad row or unreadable track must NOT abort the whole import.
 * Failures are collected into `issues` and reported; the activities that parsed
 * are still returned. `onProgress` (when provided) receives incremental progress
 * so the UI can show a bar during large imports.
 */
export async function ingestFiles(
  files: File[] | FileList,
  onProgress?: (done: number, total: number, phase: string) => void,
): Promise<IngestSummary> {
  const all: Activity[] = [];
  const issues: IngestionIssue[] = [];
  const gpxById = new Map<string, Activity>();
  const fitStreamByCsvId = new Map<string, Awaited<ReturnType<typeof parseFitGz>>>();

  const fileList = Array.from(files);
  let processed = 0;
  const total = fileList.length;

  const bump = (phase: string) => {
    processed++;
    onProgress?.(processed, total, phase);
  };

  for (const file of fileList) {
    const lower = file.name.toLowerCase();
    try {
      if (lower.endsWith('.csv')) {
        const text = await file.text();
        all.push(...parseActivitiesCsv(text));
      } else if (lower.endsWith('.zip')) {
        const buf = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(buf);
        let csvText: string | null = null;
        const fitEntries: JSZip.JSZipObject[] = [];
        for (const [path, entry] of Object.entries(zip.files)) {
          if (entry.dir) continue;
          const p = path.toLowerCase();
          if (p.endsWith('activities.csv')) {
            csvText = await entry.async('string');
          } else if (p.endsWith('.gpx')) {
            const id = idFromFile(path);
            if (id) {
              try {
                const xml = await entry.async('string');
                const r = parseGpx(xml, id);
                if (r) gpxById.set(id, r.activity);
              } catch (e) {
                issues.push({ file: path, reason: e instanceof Error ? e.message : String(e) });
              }
            }
          } else if (/activities\/.*\.fit\.gz$/.test(p)) {
            fitEntries.push(entry);
          }
        }
        if (csvText) {
          try {
            all.push(...parseActivitiesCsv(csvText));
          } catch (e) {
            issues.push({
              file: 'activities.csv',
              reason: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // Join FIT tracks to CSV activities by start timestamp.
        const csvActs = all.filter((a) => a.id.startsWith('csv:'));
        const join = buildFitJoin(csvActs);
        for (let i = 0; i < fitEntries.length; i++) {
          const entry = fitEntries[i];
          try {
            const gz = await entry.async('uint8array');
            let stream: Awaited<ReturnType<typeof parseFitGz>> | null = null;
            try {
              stream = await parseFitGz(gz as unknown as Uint8Array);
            } catch (e) {
              issues.push({
                file: entry.name,
                reason: `FIT parse failed: ${e instanceof Error ? e.message : String(e)}`,
              });
              stream = null;
            }
            if (stream && stream.startMs) {
              const csvId = resolveFitId(join, Math.floor(stream.startMs / 1000));
              if (csvId) fitStreamByCsvId.set(csvId, stream);
            }
          } catch (e) {
            issues.push({ file: entry.name, reason: e instanceof Error ? e.message : String(e) });
          }
          if (onProgress && (i % 25 === 0 || i === fitEntries.length - 1)) {
            onProgress(processed, total, `Decoding tracks ${i + 1}/${fitEntries.length}`);
          }
        }
      }
    } catch (e) {
      issues.push({ file: file.name, reason: e instanceof Error ? e.message : String(e) });
    }
    bump(lower.endsWith('.zip') ? 'Importing activities' : 'Reading file');
  }

  // Merge GPX + FIT extras into matching CSV activities.
  const merged = all.map((a) => {
    const id = a.id.replace(/^csv:/, '');
    const csvId = `csv:${id}`;
    const g = gpxById.get(id);
    const stream = fitStreamByCsvId.get(csvId);
    let out = a;
    if (g) {
      out = {
        ...out,
        hrHistogram: g.hrHistogram ?? out.hrHistogram,
        route: g.route ?? out.route,
        avgHr: out.avgHr ?? g.avgHr,
        maxHr: out.maxHr ?? g.maxHr,
        movingTimeMin: out.movingTimeMin ?? g.movingTimeMin,
      };
    }
    if (stream) {
      out = {
        ...out,
        source: 'fit',
        hrHistogram: stream.hrHistogram ?? out.hrHistogram,
        route: stream.route ?? out.route,
        avgHr: stream.avgHr ?? out.avgHr,
        maxHr: stream.maxHr ?? out.maxHr,
      };
    }
    return out;
  });

  return { activities: merged, issues };
}

export { parseFitGz };
