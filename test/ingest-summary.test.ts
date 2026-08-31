// Regression tests for the production-readiness hardening:
//  - ingestFiles must not abort on a bad row/track (collect issues, return good activities)
//  - importBackup must reject malformed backups with a clear message
import { DOMParser as XDOMParser } from '@xmldom/xmldom';
(globalThis as unknown as { DOMParser: typeof XDOMParser }).DOMParser = XDOMParser as unknown as typeof DOMParser;

import { ingestFiles, type IngestSummary } from '../src/data/zip.ts';
import { validateBackup, importBackup, clearAllData, type BackupBundle } from '../src/data/db.ts';
import type { Activity } from '../src/data/types.ts';

// minimal localStorage shim
const store: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  key: () => null,
  length: 0,
} as Storage;

let passed = 0;
let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.error('  ✗ ' + msg); }
}

async function main() {
  console.log('ingestFiles robustness (bad tracks do not abort the import)');
  const JSZip = (await import('jszip')).default;
  // A good CSV row + a corrupt .fit.gz track (garbage, gzipped). The FIT parser throws
  // on it; zip.ts must record that as an issue and STILL return the good CSV activity.
  const CSV = `Activity ID,Activity Date,Activity Name,Activity Type,Distance,Elapsed Time,Moving Time,Average Heart Rate,Max Heart Rate,Average Speed,Elevation Gain,Average Run Cadence
7777,2024-06-01 7:00:00 AM,Morning Run,Run,12.0,3300,3000,150,180,2.1,90,88`;
  const zip = new JSZip();
  zip.file('activities.csv', CSV);
  // build a corrupt .fit.gz (valid gzip, but contents are not a FIT file) so the
  // FIT parser throws; zip.ts must record it as an issue and still return good rows.
  const pako = (await import('pako')).default;
  const gzBytes = pako.gzip(new Uint8Array(Array.from({ length: 200 }, (_, i) => i % 251)));
  const zip2 = new JSZip();
  zip2.file('activities.csv', CSV);
  zip2.file('activities/7777.fit.gz', gzBytes);
  const zipBuf = await zip2.generateAsync({ type: 'uint8array' });
  const mockZip = {
    name: 'strava-export.zip',
    async arrayBuffer() { return zipBuf.buffer.slice(zipBuf.byteOffset, zipBuf.byteOffset + zipBuf.byteLength); },
    async text() { return ''; },
  } as unknown as File;

  const summary: IngestSummary = await ingestFiles([mockZip]);
  ok(summary.activities.length === 1, 'good CSV row still parsed despite a broken .fit.gz');
  ok(summary.activities[0].id === 'csv:7777', 'activity id preserved');
  ok(summary.issues.length >= 1, `broken .fit.gz recorded as an issue (${summary.issues.length}), not thrown`);
  ok(summary.issues.some((i) => i.file.includes('7777.fit.gz')), 'issue names the offending file');

  console.log('importBackup validation (malformed backups rejected clearly)');
  let threw = false;
  try { validateBackup({ version: 2, activities: [] }); } catch { threw = true; }
  ok(threw, 'unsupported version -> throws');

  threw = false;
  try { validateBackup({ version: 1, activities: 'nope' }); } catch { threw = true; }
  ok(threw, 'missing activities array -> throws');

  threw = false;
  try { validateBackup({ version: 1, activities: [{ name: 'x' }] }); } catch { threw = true; }
  ok(threw, 'activity without id -> throws');

  // a valid bundle: validateBackup must accept it (the actual Dexie write needs a
  // browser IndexedDB, so only assert validation here; the import path is covered by
  // the app's own load/save round-trip in the browser).
  const good: BackupBundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    zones: { hrMax: 200, restHr: 50, zones: [], tssFactor: 1, ctlTau: 42, atlTau: 7 },
    goals: { weeklyKm: 40, easyPct: 80, riegelExp: 1.06, easyZones: 2 },
    units: { dist: 'km', pace: 'min/km' },
    activities: [{ id: 'csv:1', source: 'csv', date: '2024-01-01', ts: 1, name: 'Run', type: 'Run', distanceKm: 5, movingTimeMin: 25, avgHr: 150, hrHistogram: null } as Activity],
  };
  let validationThrew = false;
  try { validateBackup(good); } catch { validationThrew = true; }
  ok(!validationThrew, 'valid bundle passes validateBackup');

  // importBackup touches IndexedDB; only run where available (browser). In Node it is
  // expected to be unavailable, so we skip rather than fail.
  if (typeof indexedDB !== 'undefined') {
    let imported = -1;
    try { imported = await importBackup(good); } catch (e) { console.error('import failed', e); }
    ok(imported === 1, 'valid bundle imports 1 activity');
  } else {
    console.log('  · skipping live importBackup (no IndexedDB in Node)');
  }

  console.log('clearAllData (removes activities and localStorage keys)');
  // Set some localStorage keys to verify they get removed
  store['strava-offline:zones'] = JSON.stringify({ hrMax: 200, restHr: 55, zones: [], tssFactor: 1 });
  store['goals'] = JSON.stringify({ weeklyKm: 50, easyPct: 85 });
  store['unitPref'] = JSON.stringify({ dist: 'mi', pace: 'min/mi' });
  store['filterCollapsed'] = '1';
  store['someOtherKey'] = 'should survive';
  ok(store['strava-offline:zones'] != null, 'zones key set before clear');

  if (typeof indexedDB !== 'undefined') {
    try { await clearAllData(); } catch (e) { console.error('clearAllData failed', e); }
    ok(store['strava-offline:zones'] == null, 'zones key removed after clearAllData');
    ok(store['goals'] == null, 'goals key removed after clearAllData');
    ok(store['unitPref'] == null, 'unitPref key removed after clearAllData');
    ok(store['filterCollapsed'] == null, 'filterCollapsed key removed after clearAllData');
    ok(store['someOtherKey'] === 'should survive', 'unrelated localStorage keys preserved');
  } else {
    console.log('  · skipping live clearAllData (no IndexedDB in Node)');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
