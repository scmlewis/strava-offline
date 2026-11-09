# Strava Offline Analyzer — Recreation Spec

A local-first PWA. User drags in a Strava export (zip/csv/gpx/fit), everything is parsed and stored in the browser (IndexedDB). No backend, no accounts. No network calls except optional CARTO basemap tiles (Workbox-cached). All analysis runs client-side.

**Stack:** Vanilla TypeScript + Vite, Tailwind (utility classes) + hand-written CSS modules, uPlot for charts, Leaflet (heatmap basemap), Dexie (IndexedDB), JSZip, PapaParse, pako, fit-file-parser. No React/framework — DOM is built imperatively. Vitest (unit) + Playwright (e2e). PWA via vite-plugin-pwa (service worker, installable, works offline). Deployed to GitHub Pages at `https://scmlewis.github.io/strava-offline/` (build must use base `/strava-offline/`).

**Commands:** `npm run dev` | `npm run build` (tsc + vite) | `npm test` (vitest) | `npm run test:e2e` (playwright) | `npm run lint` | `npm run typecheck`

---

## 1. Architecture / file map

```
src/
  main.ts           # app wiring: boot, filters, ingest, modals, shortcuts
  i18n.ts           # English-only string dictionary, t(key, params) with {param} interpolation
  toast.ts          # toast notifications (success/error/info, optional duration)
  icons.ts          # inline SVG icon set, icon(name, size)
  utils.ts          # esc() HTML-escape, toLocalDate(ts) local YYYY-MM-DD, todayLocal(), yesterdayLocal()
  data/
    types.ts        # all domain types
    db.ts           # Dexie DB, localStorage settings, backup/restore
    zip.ts          # ingest orchestrator (csv + zip merging)
    csv.ts          # Strava activities.csv parser
    gpx.ts          # GPX track parser (HR histogram + route)
    fit.ts          # gzipped FIT parser
    ingest.worker.ts / ingestClient.ts  # web worker + main-thread fallback
    zones.ts        # zone config + defaults + HR→zone + intensity
    heatmap.ts      # route sanitising, bounds, tile URL, heat ramp, sport counts, heatmapPrefs
    analyze.ts      # ALL metric formulas (TSS, CTL/ATL/TSB, PR, Riegel, VDOT, etc.)
    dashboard.ts    # tab rendering, cards, charts, tables, activity detail drawer
  ui/
    router.ts       # hash routing: #/overview | #/heatmap | #/volume | #/load | #/zones | #/perf | #/log
    store.ts        # Filters type, DEFAULT_FILTERS, matchesFilters(), countActiveFilters()
    heatmap-view.ts # Leaflet map + canvas heat raster for the Heatmap tab
    nav.ts, toolbar.ts, shell.ts, modals.ts   # markup builders
    (enhanced-*.ts  # legacy/alternate components — not primary)
  styles/           # tokens.css (design tokens), shell/nav/toolbar/cards/modals/responsive css
test/               # vitest unit tests pin down exact formulas
```

Rendering flow: `main.ts` holds `allActs`, `filters`, `cfg/zones`, `units`, `goals`, `prefs`, `theme`, `ctx` (tab/sort/page). `refresh()` → `setCtx()` → `renderDashboard(dashboardEl, matchedActs, ctx)`.

---

## 2. Data model

```ts
interface Activity {
  id: string;              // 'csv:<stravaId>' (primary key)
  source: 'csv' | 'gpx' | 'fit';
  date: string;            // 'YYYY-MM-DD'
  ts: number;              // epoch ms
  name: string;
  type: string;            // 'Run', 'Ride', ...
  distanceKm: number | null;
  movingTimeMin: number | null;
  elapsedTimeMin: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgSpeedKmh: number | null;
  elevationGainM: number | null;
  cadence: number | null;
  hrHistogram?: Record<number, number> | null;  // seconds per 1-bpm bucket
  route?: [number, number][] | null;            // decimated [lat,lon] polyline, max 120 pts
}
```

**IndexedDB:** one Dexie DB `strava-offline`, version 1, table `activities` keyed by `id`, indexes `ts, type, date`. `saveActivities` = `bulkPut` (re-import is idempotent). `loadActivities` = orderBy ts desc, skips corrupt rows with console.warn.

**localStorage keys:** `strava-offline:zones`, `goals`, `unitPref`, `prefs`, `filterCollapsed`, `heatmapPrefs`, `theme`. All reads/writes try/catch → fall back to defaults. `heatmapPrefs` (`{ opacity: number; basemap: boolean; sports: string[] }`, defaults `{ opacity: 0.85, basemap: true, sports: [] }`) is cosmetic — added to the clear-settings list but **not** part of the backup bundle, like `theme`.

**Backup bundle (JSON export/import):**
```ts
{ version: 1, exportedAt: ISOString, zones, goals, units, prefs?, activities: Activity[] }
```
Validation throws on: not an object / version !== 1 / missing activities array / activity missing string id. Export > 50 MB prompts `confirm()`.

---

## 3. Ingestion pipeline

Entry: drag-drop on dropzone, file input, or document-wide drag. Runs in a Web Worker (`ingest.worker.ts`), falls back to main thread on error/absence. Progress messages: `{type:'progress', done, total, phase}` → shown in status bar; `{type:'done', summary}`; `{type:'error'}`.

`ingestFiles(files, onProgress)` per file by lowercase extension:
- **`.csv`** → PapaParse (header:false) → `parseActivitiesCsv`. Headers from row 0 (dupes → `Distance_2`, read first column). Columns: Activity ID, Activity Date, Activity Name, Activity Type, Distance, Elapsed Time, Moving Time, Average Heart Rate, Max Heart Rate, Average Speed, Elevation Gain, Average Run Cadence.
  - `id = 'csv:' + Activity ID` (fallback `'csv-' + index`)
  - **Distance is already in Strava's CSV — use as-is (km), do NOT divide by 1000.**
  - `movingTimeMin = moving/60`, `avgSpeedKmh = avgSpeed*3.6`
  - Date formats: `YYYY-MM-DD H:MM:SS [AM|PM]` (local time) and `Mon D, YYYY, H:MM:SS [AM|PM]`; unparsable → `date:'', ts:0`.
  - **Proxy histogram:** single bucket at `round(avgHr)` with `round(movingMin*60)` seconds (stand-in for per-second HR).
- **`.zip`** → JSZip; entries ending `activities.csv` → parse as above; `*.gpx` → parse with activity id from **trailing digit group of filename** (`/([0-9]+)(?!.*[0-9])/`); `activities/*.fit.gz` → parse FIT.
- Any other file type: silently ignored.

**GPX parse:** HR tags tried in order `gpxtpx:gpxTPXExt, gpxtpx:hr, gpxpx:hr, ns3:hr, ns2:hr, hr`, then any descendant tag matching `/hr$/i`. Builds real 1-bpm histogram, avg/max HR, route (decimate to 120 points), moving time from first/last track time. `parsererror` or no points → null (recorded as issue).

**FIT parse:** `pako.ungzip` → fit-file-parser (`force:true, mode:'list'`). From records: heart_rate → 1-bpm histogram, timestamps → startMs, lat/lon (divide by 11930465 only if |value|>180), route decimated. Joined to CSV by start timestamp within **±30 seconds** (tz-offset-adjusted).

**Merge (CSV is the row; GPX/FIT only enrich):**
- GPX overrides: `hrHistogram`, `route`; fills `avgHr/maxHr/movingTimeMin` only if CSV null.
- FIT overrides: `hrHistogram`, `route`, **and** `avgHr/maxHr` (FIT wins), `source='fit'`.
- Unmatched GPX/FIT → dropped silently.
- Every per-file/entry error → pushed to `summary.issues[]` (`{file, reason}`), never aborts the batch. UI toast: "Imported N, skipped M".

After ingest: `saveActivities` → `loadActivities` → rebuild toolbar → `refresh()`. Dropzone becomes compact when data exists.

---

## 4. Zone model & settings

```ts
DEFAULT_ZONES = {
  hrMax: 206, restHr: 60, fthr: undefined,
  zones: [                                 // [lo, hi) as fraction of HRmax
    { name: 'Z1 Recovery',  lo: 0.00, hi: 0.60 },
    { name: 'Z2 Easy',      lo: 0.60, hi: 0.75 },
    { name: 'Z3 Tempo',     lo: 0.75, hi: 0.85 },
    { name: 'Z4 Threshold', lo: 0.85, hi: 0.95 },
    { name: 'Z5 VO2',       lo: 0.95, hi: 1.01 },
  ],
  tssFactor: 2.06,   // 1h at ~threshold ≈ 100 TSS
  ctlTau: 42, atlTau: 7,
}
```

- `zoneForHr(hr, cfg)`: `frac = hr/hrMax`, first zone where `frac >= lo && frac < hi` → 1..5; `frac >= 1` → 5; else null. Zone boundaries are **always %HRmax** (fthr does not change them).
- `intensityForHr(hr, cfg)`: if `fthr` set → `(hr - restHr)/(fthr - restHr)` clamped ≥0 (HRR-based IF); else `hr/hrMax`.
- Zone settings modal: edit hrMax, restHr, fthr (optional), ctlTau (7–90), atlTau (3–30), tssFactor (0.5–5), per-zone name + hi (≤1.01); `lo` auto-chains from previous `hi`. Reset → deep copy of defaults. Saving recomputes everything (formulas read cfg live).
- Goals modal: `weeklyKm|null`, `easyPct` (default 80), `riegelExp` (0.8–1.5, default 1.06), `easyZones` (1–5, default 2 = Z1+Z2).

---

## 5. Metrics (exact formulas — `src/data/analyze.ts`)

- **Histogram sec** = Σ bucket counts. `secondsInZone(hist, z, cfg)` = sum of buckets whose bpm maps to z.
- **TSS per activity** = `(histSec/3600) * IF² * 100 * (tssFactor/2.06)` where IF = time-weighted `intensityForHr` over the histogram. Null if no histogram sec or no moving time. Daily TSS = sum per `a.date`.
- **CTL/ATL/TSB:** iterate every calendar day from first to last activity date; `ctl += (1 - exp(-1/ctlTau)) * (tss - ctl)`; `atl` same with `atlTau`; `tsb = ctl - atl`. Start ctl=atl=0 at first day. UI Form: tsb>5 Fresh, tsb<-10 Fatigued, else Optimal.
- **Summary:** totals of distance/moving-hours/elevation; `firstDate/lastDate` from ts; `avgDistanceKm = totalDist / count` (all activities).
- **Weekly volume:** week key = Monday of local date (`mondayOf`), accumulate km/hours/count, sorted asc, show **last 16 weeks**.
- **Pace trend:** runs only (`/run/i`, dist>0, time>0), `paceMinPerKm = movingTimeMin / distanceKm`, sorted by ts.
- **Easy%:** activity is easy if ≥50% of histogram seconds fall in Z1..Z(easyZones); fallback (no histogram): avg-HR zone ≤ easyZones. `pct = easy/(easy+hard)*100`; basis labeled 'histogram' vs 'avgHr'. Card goal met when `pct >= easyPct * 0.9`.
- **Zone distribution:** with histograms → seconds per zone (byTime); else count activities per avg-HR zone (byActivity). Basis flips to 'histogram' if ANY activity has one.
- **PRs:** distances 5K/10K/Half(21.1)/Marathon(42.195); runs only; if `|d - target|/target <= 0.08` → best (min moving time); else keep longest shorter run as fallback (`bestSec:null`).
- **Riegel:** `T2 = T1 * (D2/D1)^riegelExp`; anchor = PR with bestSec, prefer '10K' else middle of list.
- **VDOT:** `vdot = (-4.6 + 0.182258v + 0.000104v²) / (0.8 + 0.1894393·e^(-0.012778t) + 0.2989558·e^(-0.1932605t))`, v = m/min, t = min; accept only 20–100, 1 dp. Jack Daniels paces from race pace sec/km × {E:1.3, M:1.11, T:1.04, I:0.98, R:0.9}.
- **Climb score:** `round(gain * (1 + min(gain/(distKm*1000), 0.15) * 6))`; requires gain>0, dist>0.
- **Streaks:** unique activity dates; longest = max consecutive-day run; current = consecutive days ending today/yesterday, else 0.
- **Calendar heatmap:** day cells, levels by quantiles of daily km: [q50, q80, q92, q98] → levels 1–4 (0 = no activity); column offset uses `prefs.weekStart` (sun/mon).
- **Route heatmap pipeline (`src/data/heatmap.ts` + `src/ui/heatmap-view.ts`):** `sanitizeRoutes` drops non-finite/null-island/spiking points (median-centre haversine ≤ 100 km, |lat| ≤ 85) and keeps activities with ≥2 cleaned points; `computeHeatBounds` pads the bbox (min span 0.002° per axis, default 4% pad). Routes are projected to Web-Mercator canvas pixels (longest side `min(2048, max(512, spanPx@z14))`), white strokes at `alpha 0.06` / round caps, blurred, then recoloured in place by `applyHeatRamp`: `hot = heatQuantile(alpha>0, 0.98)`, `v = clamp(a / max(hot,8),0,1) ** 0.75`, pixels with `a<3` transparent, 7-stop ascent from `rgba(252,76,2,0)` to `rgba(255,246,200,255)`. The canvas becomes a blob → `L.imageOverlay`; the previous object URL is revoked on re-render/teardown. Sport chips filter route-bearing types locally only (frequency then alphabetical), and opacity/basemap/sports persist in `heatmapPrefs`. The Leaflet viewport is kept across tab switches via module-level `savedView`, refit only when it no longer intersects the new heat bounds (`shouldRefit`).

---

## 6. Filters (`ui/store.ts`)

```ts
Filters = { type, range:'all'|'90'|'180'|'365', from, to, minKm, maxKm, minGain,
            weekday, intensity, hasRoute:null|boolean, minPace, maxPace, search }
```
- type: case-insensitive substring; range: `(now - ts)/86400000 > days` excludes; from/to: local `T00:00:00`/`T23:59:59` bounds on ts.
- weekday: `''|'weekday'|'weekend'|'0'..'6'` via `new Date(ts).getDay()`.
- hasRoute: `route && route.length > 1`. min/maxKm: 0 = off, missing distance = 0. min/maxPace: **seconds per km** (`movingTimeMin*60/distanceKm`), 0 = off.
- search: case-insensitive substring of `name + type + date`, debounced 180 ms.
- intensity easy/hard: computed separately in main.ts via per-activity `computeEasy`; only histogram-basis activities can be "easy".
- Active-filter count badge = number of non-default fields. Reset restores `DEFAULT_FILTERS`. Toolbar collapse persisted in `filterCollapsed`.

---

## 7. UI

**Shell:** topbar (app title, status bar, progress bar, theme toggle, overflow actions menu) → dropzone (full height when empty, compact bar when data) → left/side nav with 7 tabs → filter toolbar → dashboard content. Hash routing `#/tab`; changing tab re-renders.

**Tabs:**
| Tab | Content |
|---|---|
| `overview` | Stat cards (activities, total distance+avg, moving time, total climb, Easy% vs goal, Form/TSB+CTL, date range), activity heatmap, streak bar, weekly-goal box, grid of weekly-volume chart + training-load chart |
| `heatmap` | Leaflet map with a CANVAS heat raster over CARTO dark tiles: title + route count, sport chips (multi-select, local only), opacity slider, basemap toggle, legend + "rendered locally" hint, "Fit routes" control; falls back to heat-on-dark with a note when tiles fail; empty state shows `routes_hint` |
| `volume` | Weekly volume chart (last 16 wks) + route mini-maps (first 12 with routes) |
| `load` | CTL/ATL/TSB chart + pace trend chart |
| `zones` | HR zone distribution bars (color-coded per zone) |
| `perf` | PR table (5K/10K/Half/Marathon), Riegel predictions, VDOT + JD paces, climb-score ranking |
| `log` | Sortable, paginated (50/page) activity table: date, name, type, distance, moving time, avg HR, TSS, delete btn |

**Charts (uPlot):** height 220, no legend, theme-aware grid colors, ResizeObserver for width, destroyed on re-render. Colors: CTL `#34d399`, ATL `#fb923c`, TSB `#a78bfa`, pace `#fbbf24`. Zone colors `['#7a8299','#34d399','#fbbf24','#fb923c','#f87171']`. Weekly x-axis labeled `YYYY-Www`.

**Activity detail drawer:** distance, pace, moving time, elevation, avg/max HR, TSS, type, per-zone time bar (or avg-HR hint if no histogram), route SVG polyline (viewBox 0 0 100 60, no basemap), delete button (confirm modal).

**Modals:** Zone settings, Goals, Clear data (backup-first / clear activities / clear settings / clear all), Bulk delete (of filtered set), Delete confirm, About, Keyboard shortcuts.

**Toolbar:** search, type, time range, weekday, intensity, route, min/max distance, min elevation, min/max pace, from/to dates, unit selector (km/mi ↔ min/km, min/mi), week-start (sun/mon), reset, storage meter ("N activities · ~X MB · type breakdown").

**UX behaviors:** toast notifications; import progress in status bar; global `error`/`unhandledrejection` → status bar; delete → 8s undo toast (`U` key); large-export confirm; diagnostics JSON download button.

**Keyboard:** `?` shortcuts overlay, `/` focus search, `1`–`7` switch tabs, `U` undo delete.

**Theme:** dark/light/system, `data-theme` attr on `<html>`, persisted in `theme` key. Design tokens in `styles/tokens.css` (CSS custom properties for colors/spacing/radii/typography). Responsive breakpoints in `responsive.css`. Light CSS animation layer (`modern-*.css`).

---

## 8. Backup / clear

- **Backup:** full JSON (bundle above), download `strava-backup-YYYY-MM-DD.json`. **Export shown:** same but only filtered activities (`strava-filtered-…`).
- **Restore:** parse JSON → `validateBackup` → write settings + `bulkPut` activities → reload; error messages mapped to friendly toasts.
- **Clear data modal:** backup-first, clear activities only, clear settings only, clear all (activities + 5 settings keys; theme kept).

---

## 9. Tests & quality gates

- Vitest unit tests in `test/` pin exact formula outputs (TSS ≈43 for avgHR 148 / 3000 s at defaults; climb score 650 for 500 m / 10 km; zone edges 154→Z2, 155→Z3, 206→Z5; proxy histogram bucket; ingest issues isolation), property tests (`fast-check`) for TSB=CTL−ATL etc., Playwright e2e.
- `npm run lint` (ESLint + typescript-eslint), `npm run typecheck`, Prettier. CI: `.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on push to `main`.

## 10. Known quirks to reproduce

1. CSV dates are local-time; GPX-derived dates are UTC (`toISOString().slice(0,10)`) — can shift a day.
2. Weekly volume is always Monday-aligned; `weekStart` pref only affects heatmap columns.
3. Pace trend plots min/km regardless of selected unit.
4. Intensity filter never marks histogram-less activities as easy.
5. `zoneForHr` uses `[lo, hi)` boundaries; hi capped at 1.01.
6. FIT `movingTimeMin` is computed but never merged; GPX avgHr loses to CSV, FIT avgHr wins over CSV.
7. TSS duration comes from histogram seconds (proxy histogram ≈ moving time).
8. Re-importing the same export overwrites rows (id-keyed bulkPut), no duplicates.
