### Task 20: Add performance benchmarks

**Files:**
- Create: `test/bench/ingest.bench.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ingestFiles` from `zip.ts`, `computeLoad` from `analyze.ts`, `parseGpx` from `gpx.ts`
- Produces: Vitest bench benchmarks for critical paths

- [ ] **Step 1: Create `test/bench/ingest.bench.ts`**

```ts
import { describe, bench } from 'vitest';
import { parseActivitiesCsv } from '../../src/data/csv.ts';
import { parseGpx } from '../../src/data/gpx.ts';
import { computeLoad, computePRs, computeZoneDistribution } from '../../src/data/analyze.ts';
import { DEFAULT_ZONES } from '../../src/data/zones.ts';
import type { Activity } from '../../src/data/types.ts';

// Generate a large CSV dataset
function generateCSV(rows: number): string {
  const header = 'Activity ID,Activity Date,Activity Name,Activity Type,Distance,Elapsed Time,Moving Time,Average Heart Rate,Max Heart Rate,Average Speed,Elevation Gain,Average Run Cadence';
  const lines = [header];
  for (let i = 0; i < rows; i++) {
    const hr = 130 + Math.floor(Math.random() * 50);
    const dist = (5 + Math.random() * 30).toFixed(1);
    const time = 1800 + Math.floor(Math.random() * 7200);
    lines.push(`${i},2024-01-01 7:00:00 AM,Run ${i},Run,${dist},${time},${time - 120},${hr},${hr + 20},2.0,${Math.floor(Math.random() * 200)},88`);
  }
  return lines.join('\n');
}

function generateActivities(n: number): Activity[] {
  const acts: Activity[] = [];
  for (let i = 0; i < n; i++) {
    const hr = 130 + Math.floor(Math.random() * 50);
    acts.push({
      id: `csv:${i}`,
      source: 'csv',
      date: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
      ts: Date.parse(`2024-01-${String((i % 28) + 1).padStart(2, '0')}T08:00:00`),
      name: `Run ${i}`,
      type: 'Run',
      distanceKm: 5 + Math.random() * 30,
      movingTimeMin: 30 + Math.random() * 120,
      avgHr: hr,
      hrHistogram: { [hr]: 1800, [hr - 10]: 600 },
    });
  }
  return acts;
}

describe('CSV parsing', () => {
  const csv = generateCSV(1000);
  bench('parse 1000-row CSV', () => {
    parseActivitiesCsv(csv);
  });
});

describe('GPX parsing', () => {
  const pts = Array.from({ length: 500 }, (_, i) =>
    `      <trkpt lat="${22.3 + i * 0.001}" lon="${114.1 + i * 0.001}"><ele>10</ele><time>2024-01-01T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${140 + (i % 40)}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`,
  ).join('\n');
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk><name>Bench</name><trkseg>
${pts}
  </trkseg></trk>
</gpx>`;

  bench('parse 500-point GPX', () => {
    parseGpx(gpx, 'bench');
  });
});

describe('Analysis computation', () => {
  const acts = generateActivities(500);

  bench('computeLoad (500 activities)', () => {
    computeLoad(acts, DEFAULT_ZONES);
  });

  bench('computePRs (500 activities)', () => {
    computePRs(acts);
  });

  bench('computeZoneDistribution (500 activities)', () => {
    computeZoneDistribution(acts, DEFAULT_ZONES);
  });
});
```

- [ ] **Step 2: Add bench script to `package.json`**

```json
"bench": "vitest bench"
```

- [ ] **Step 3: Run benchmarks**

Run: `npm run bench`
Expected: Benchmarks complete, showing ops/sec for each operation.

- [ ] **Step 4: Commit**

```bash
git add test/bench/ package.json
git commit -m "test: add performance benchmarks for CSV/GPX parsing and analysis"
```

---

## Summary

| Phase | Tasks | Estimated Effort |
|-------|-------|-----------------|
| **Phase 1:** Developer Tooling | Tasks 1-5 | Medium — ESLint, Prettier, Vitest migration, coverage, CI |
| **Phase 2:** Build & Bundle | Tasks 6-9 | Small — jszip, visualizer, sourcemaps, .gitignore |
| **Phase 3:** Error Handling | Tasks 10-12 | Small — error boundary, validation, backup warning |
| **Phase 4:** UX Polish | Tasks 13-17 | Medium — shortcuts, empty state, toasts, theme, charts |
| **Phase 5:** Testing & Quality | Tasks 18-20 | Medium — Playwright E2E, property tests, benchmarks |

**Total: 20 tasks across 5 phases.**

After completion, run the full verification:
```bash
npm run format:check && npm run lint && npm run typecheck && npm test && npm run build
```
