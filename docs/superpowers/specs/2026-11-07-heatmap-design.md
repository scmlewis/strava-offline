# Heatmap tab — design

Date: 2026-11-07
Status: approved (2026-11-08)

## Intent

Add a Strava-style personal heatmap: every GPS track in the user's local history drawn as a glowing density layer over a dark basemap, so recurring routes and "hot spots" are visible at a glance. The user asked for an interface "more or less like the original Strava one", and accepted that the map may fetch basemap tiles online.

This is an analysis view, not navigation. It reuses the existing local data and the existing global filters; it adds no new ingestion.

## Goals

- A new `#/heatmap` tab showing all route-bearing activities in the current filter set.
- Visually close to Strava's personal heatmap: near-black basemap, orange→yellow glow, floating control panel, zoom and fit controls, density legend.
- Smooth pan/zoom (heat is precomputed once per filter change, not per frame).
- Multi-select sport chips inside the panel (All / each type present) layered on top of the global filter, like Strava's activity-type checkboxes.
- Opacity control and a basemap on/off toggle persisted across sessions.
- Works with zero network: heat still renders on a plain dark field; tile failures produce one quiet note, not an error screen.
- Honest copy: the app no longer claims to make no network requests at all.

## Non-goals (v1)

- Satellite/terrain styles, 3D, rotation beyond Leaflet's defaults.
- Segments, route matching, "compare efforts", live GPS.
- Per-activity colouring by sport or by year.
- Denser GPS tracks. Routes stay at the existing 120-point cap (see Constraints).
- Fullscreen/expand mode. Possible follow-up; the panel is already ~70vh.
- Sharing or exporting a heatmap image.

## Anti-goals

- A map that silently renders blank when offline.
- Any API key, account, or coordinate upload.
- Re-blurring the whole canvas on every pan/zoom frame.
- Changing the import/database shape in a way that invalidates existing data.

## Constraints found in the codebase

- `Activity.route` is `[lat, lon][]`, produced by `parseGpx`/`parseFitGz` and decimated to **max 120 points** (`src/data/gpx.ts`, `src/data/fit.ts`). Raw GPX/FIT files are not retained, so raising the cap means users must re-import. 120 points over a 10 km run is ~80 m spacing; the blur hides it.
- Routes only exist when GPX or FIT tracks were imported; CSV-only imports have `route: null`.
- `renderDashboard` clears `root.innerHTML` on every refresh (`src/data/dashboard.ts`), so the map must be torn down and recreated on tab/filter changes. Viewport state must live outside the DOM.
- The app is a local-first PWA with a Workbox service worker (`vite.config.ts`). Static assets are precached; cross-origin tiles are not.
- Tests run in Node (`vitest.config.ts`, `environment: 'node'`), so canvas APIs are unavailable in unit tests. Pure math/colour functions must be testable without a canvas.
- `#app` is capped at 1180 px wide; the map lives inside the content column (nav stays visible), not true full-bleed.
- Two `TabId` unions exist (`src/ui/store.ts`, `src/data/dashboard.ts`) and `TABS` in `src/ui/router.ts`; all three must be updated.

## Approaches considered

- **A — Leaflet + CARTO dark raster tiles + precomputed heat image overlay. Chosen.** ~42 KB gzipped JS + 15 KB CSS, raster tiles give the near-black Strava backdrop, the heat layer is a pre-rendered PNG blob positioned by `L.imageOverlay`, so Leaflet handles pan/zoom smoothly. Offline degrades to heat-on-dark. Shortest path to the requested look.
- **B — MapLibre GL + free vector dark style.** Sharper at all zooms and nicer fullscreen/rotation, but +230 KB, WebGL, and a style document to tune. Rejected: extra weight and complexity for a backdrop.
- **C — No basemap, pure canvas.** Keeps the literal "no network calls" promise, but glowing lines on black is not recognisably Strava. Rejected for the look the user asked for.

## Decisions made with the user

- Approach A.
- Interface should resemble Strava's personal heatmap.
- Offline purity may bend for basemap tiles, but the heat itself must always render.

## Detailed design

### Data flow

```
main.refresh()
  → matchesFilters(allActs)                       (existing)
  → renderDashboard(root, acts, ctx)
    → renderTab('heatmap', acts)
      → renderHeatmapTab(acts)                     (new, src/ui/heatmap-view.ts)
          1. routes = sanitizeRoutes(acts)          (drop bad/outlier points, display only)
          2. local multi-select sport filter (module state, default All)
          3. compute projected bounds + heat image (src/data/heatmap.ts)
          4. init Leaflet map (restore in-memory view, or refit when it no longer
             intersects the new heat bounds)
```

The heat image is recomputed only when the tab renders, i.e. when the global filters, tab or data change. Pan/zoom never redraws it.

### Pure module — `src/data/heatmap.ts`

No DOM, no Leaflet, unit-testable:

- `lonLatToWorld(lat, lon): { x, y }` — Web Mercator, normalised 0..1 world coordinates (y grows south).
- `worldToLonLat(x, y): { lat, lon }` — inverse, for image-overlay bounds.
- `computeHeatBounds(routes, padFraction = 0.04): { west, south, east, north }` — projected min/max with padding; degenerate spans padded to at least ~0.002° so a single repeated point still produces a valid image.
- `sanitizeRoutes(acts): Array<{ id, type, points }>` — display-time cleanup: drop non-finite points, exact `(0, 0)` points, `|lat| > 85`, and per-activity outlier points more than `MAX_POINT_RADIUS_KM` (100 km) from that activity's median point; drop activities left with < 2 points or whose median is within 0.001° of `(0, 0)`. Display-only: stored `Activity.route` is never modified, so no migration or re-import.
- `sportTypes(acts): Array<{ type: string; count: number }>` — counts, descending, `Unknown` for blank; computed from **route-bearing** activities only so every chip leads to visible heat.
- `applyHeatRamp(rgba: Uint8ClampedArray, opts): void` — in place: read alpha, normalise, map through the colour ramp, write RGBA.
- `heatQuantile(alpha: Uint8Array, q): number` — 98th percentile of non-zero alphas, used as the "hot" level.

Rendering constants exported for the view and for tests: `RAMP`, `GAMMA`, `HOT_QUANTILE`, `MAX_RASTER`.

Colour ramp (Strava-ish, dark field):

```
0.00 → rgba(252, 76, 2, 0)
0.10 → rgba(120, 40, 10, 120)
0.30 → rgba(200, 60, 10, 200)
0.55 → rgba(252, 76, 2, 235)
0.75 → rgba(255, 140, 40, 250)
0.90 → rgba(255, 205, 90, 255)
1.00 → rgba(255, 246, 200, 255)
```

Normalisation: `hot = quantile(alpha>0, 0.98)`, `v = clamp(a / max(hot, 8), 0, 1) ** 0.75`; pixels with `a < 3` stay transparent. This keeps a 20-activity history visible while preventing a 500-activity history from saturating to white.

### Heat raster pipeline — `src/ui/heatmap-view.ts`

1. Project `computeHeatBounds` into an image rectangle. Raster size: longest side `min(2048, max(512, dataSpanPxAtZoom14))` — in practice 1024–2048 px. 2048² RGBA is ~16 MB transient and safe across browsers.
2. Draw pass A (transparent canvas): white strokes, `globalAlpha ≈ 0.06`, `lineWidth` scaled to the data span (`clamp(min(w,h)/180, 4, 14)`), round caps/joins. 1000 activities × 120 points = 120k segments, tens of ms.
3. Draw pass B: `ctx.filter = 'blur(Xpx)'` with `X ≈ lineWidth * 0.8`, draw canvas A onto canvas B. Fallback if `ctx.filter` is unsupported: three offset draws at low alpha (harmless, slightly softer).
4. `applyHeatRamp(getImageData(B))`, `putImageData`.
5. `canvas.toBlob()` → object URL → `L.imageOverlay(url, bounds, { opacity, interactive: false })`.
6. Revoke the previous object URL and `map.remove()` on teardown.

The whole pipeline targets < 500 ms for 1000 route-bearing activities. A small "Rendering heatmap…" chip appears immediately and is removed on the next frame if the work took less than ~120 ms.

### Map and controls

Leaflet `1.9.x` (static import; +42 KB gz, acceptable next to uPlot).

- Map options: `zoomControl: false`, `attributionControl: true`, `minZoom: 3`, `maxZoom: 18`, `worldCopyJump: true`, `preferCanvas: true`.
- Tiles: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`, subdomains `abcd`, attribution `© OpenStreetMap contributors © CARTO`. Dark basemap in both app themes (Strava parity); the control panel uses app tokens.
- Zoom: `L.control.zoom({ position: 'bottomright' })`.
- Custom "Fit routes" control bottom-right, above zoom. Also bound to `F` inside the map when focused.
- Legend bottom-left: gradient bar (`less → more`), above the attribution line.
- Floating panel top-left, translucent, same border/radius language as existing cards:
  - Title `Heatmap` + `N routes` count (route-bearing, after local sport filter).
  - Sport chips: `All` plus every type present among route-bearing activities, as multi-select toggles (`aria-pressed`); `All` clears the selection. Local-only filter; does not mutate the toolbar. Persisted as `sports: string[]`; saved types no longer present are dropped on load, and an empty selection means All.
  - Opacity slider `0.25–1` (default `0.85`).
  - Basemap checkbox (default on).
  - One-line hint: "Rendered locally · basemap © CARTO/OSM".
- Active global filters summary: one short line, e.g. `Run · last 90 days`; a "Clear filters" affordance is not added (the toolbar owns that).
- Empty state: panel still visible, map replaced by a dark panel with `routes_hint` copy.
- Tile failure: first `tileerror` streak (≥ 4) adds a one-time note in the panel: "Basemap unavailable — showing your heatmap only." Heat stays.

### Layout

The map tab breaks out of the normal section stack inside `.content`:

```css
.heatmap-tab { position: relative; }
.heatmap-map { height: clamp(480px, calc(100dvh - 260px), 820px); border-radius: var(--radius-lg); overflow: hidden; }
```

Panel and legend are absolutely positioned over the map. Controls keep app focus styles and 44 px touch targets. On ≤ 599 px the panel collapses to a compact bar (chips + a settings toggle) and the map height becomes `calc(100dvh - 320px)` minimum 420 px.

### Viewport persistence

Module-level `savedView: { center: [lat, lon]; zoom: number } | null`, updated on `moveend`. On re-render it is reused **only if the current viewport still intersects the new heat bounds**; otherwise (global filter moved the data to another region, or first open) the map fits the new bounds. A sport-chip change never changes bounds, so the view is kept. "Fit routes" recomputes and stores a new view. Not persisted across reloads; prefs are.

Persisted pref (localStorage `heatmapPrefs`): `{ opacity: number; basemap: boolean; sports: string[] }`, read/written with try/catch like other settings. Added to `clearSettings()` key list; **not** part of the backup bundle (cosmetic, like `theme`).

### Offline behaviour and service worker

`vite.config.ts` gains a Workbox runtime cache:

```ts
runtimeCaching: [
  {
    urlPattern: /^https:\/\/[a-d]\.basemaps\.cartocdn\.com\/.*/i,
    handler: 'CacheFirst',
    options: {
      cacheName: 'carto-dark-tiles',
      expiration: { maxEntries: 2500, maxAgeSeconds: 60 * 60 * 24 * 30 },
      cacheableResponse: { statuses: [0, 200] },
    },
  },
],
```

Result: previously viewed areas render offline; new areas fall back to the heat-on-dark view. Service-worker caching only applies to the production build, which matches where PWA install matters. Tiles are the only new network requests in the app.

### Copy changes (honesty)

- `about_safe`: "All analysis runs on this device; your activities never leave it. The Heatmap tab fetches basemap tiles from CARTO when online (previously viewed areas are cached); the heat layer itself is computed locally and works offline."
- `about_step4` tab list gains "Heatmap".
- `README.md` Features gains the heatmap; Limitations note the tile fetch/caching.
- `SPEC.md` route/UI sections updated after implementation.
- `index.html` dropzone feature list: swap one bullet for "Route heatmap".

### Accessibility

- Map container `role="region"` with `aria-label="Activity heatmap"`; Leaflet's own keyboard panning stays enabled.
- All controls are native `<button>`, `<input type="range">`, `<input type="checkbox">` with labels/`aria-label`s and visible focus.
- Sport chips are a `role="group"` with `aria-pressed` state.
- Colour is not the only signal: the legend has a text label and the route count is text.

### Failure modes and handling

| Case | Behaviour |
|---|---|
| No route-bearing activities | Panel + `routes_hint`, no map init |
| Tiles offline / blocked | Heat renders; one note; map background stays dark |
| Degenerate bounds (one point) | Padded bounds, minimum raster size |
| `(0,0)`, non-finite, GPS-spike points | Removed at render time by `sanitizeRoutes`; stored data untouched |
| Huge geographic spread | Raster capped at 2048 px; coarser glow, still usable |
| Tab switched during deferred init | `host.isConnected` guard aborts init |
| Repeated re-renders | `map.remove()` + object URL revocation prevent leaks |
| `ctx.filter` unsupported | Multi-draw blur fallback |

## Files touched

- `package.json` — add `leaflet`, `@types/leaflet`
- `src/data/heatmap.ts` — new pure module
- `src/ui/heatmap-view.ts` — new Leaflet view + controls
- `src/styles/heatmap.css` — new; imported from `src/styles.css`
- `src/data/dashboard.ts` — `TabId`, `renderTab` case, teardown hook
- `src/ui/store.ts` — `TabId`
- `src/ui/router.ts` — `TABS`
- `src/ui/nav.ts` — icon (`map`) + label key
- `src/i18n.ts` — new keys + revised About copy
- `vite.config.ts` — tile runtime cache
- `index.html`, `README.md`, `SPEC.md` — copy/docs
- `test/heatmap.test.ts` — new unit tests
- `test/e2e/heatmap.spec.ts` — heatmap e2e smoke tests

## Testing

Unit (`test/heatmap.test.ts`, Node env, no canvas):

- Projection known points and round-trip (`lonLatToWorld` ↔ `worldToLonLat`).
- Bounds contain all points; padding applied; degenerate input padded.
- `heatQuantile` ignores zeros and handles small samples.
- `sanitizeRoutes`: drops non-finite, `(0,0)`, high-latitude and per-activity outlier points; keeps legitimate end-of-route points; drops activities with < 2 usable points; never mutates input.
- `applyHeatRamp`: zero alpha stays transparent; ramp is monotonic in brightness; clamped at both ends; output alpha respects the ramp.
- `sportTypes` counts/sorts route-bearing activities only and handles blank types.

E2E (`test/e2e/app.spec.ts`):

- Build a **tiny synthetic export in the test** with JSZip: an `activities.csv` row plus two small GPX tracks near known coordinates. The 44 MB `test/export_84880339.zip` is not used (1221 entries, too slow/flaky for a smoke test).
- Import the synthetic zip, open `#/heatmap`.
- Abort all `cartocdn` requests via `page.route` so the test is hermetic and offline-like.
- Assert: map region visible, heat overlay image has non-zero size, legend and route count present, offline note appears after tile errors, sport chip toggle updates the count, and re-opening the tab keeps the view (or refits only when bounds moved).
- Confirm no uncaught console errors.

Manual/perf check: 1000+ activity fixture (or synthetic multiply) renders in < 500 ms; pan/zoom stays smooth; no memory growth across repeated tab/filter switches.

## What is left to the builder

- Exact raster sizing heuristic and blur/line-width constants (tune visually against a real export).
- Whether the sport chips show type icons or plain text.
- Mobile panel layout details.
- Whether the "Rendering…" chip is worth keeping if renders are consistently fast.
- Any visual tuning of the colour ramp to match a reference screenshot.

## Rollout

Single PR on a feature branch, tests + e2e green, then the normal build/deploy. No DB migration, no re-import required.
