### Task 20 Report: Add performance benchmarks

**Status:** DONE

**Commit:** `bcb179b` — test: add performance benchmarks for CSV/GPX parsing and analysis

**Files created/modified:**
- `test/bench/ingest.bench.ts` (new) — Vitest bench benchmarks for CSV parsing, GPX parsing, and analysis computation
- `package.json` — added `"bench": "vitest bench"` script

**Benchmarks implemented:**
- CSV: parse 1000-row CSV (~235 ops/s)
- GPX: parse 500-point GPX
- Analysis: computeLoad (500 activities) (~2037 ops/s)
- Analysis: computePRs (500 activities) (~32247 ops/s)
- Analysis: computeZoneDistribution (500 activities) (~731 ops/s)

**Test summary:** All 61 existing tests pass. `npm run bench` completes successfully.

**Concerns:** None. GPX benchmark doesn't show detailed stats in summary (completes very fast), but runs without errors.
