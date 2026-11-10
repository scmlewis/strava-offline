# Heatmap basemap and route outlines — short design

> **Superseded:** the separate route-outline layer, its casing, pane, and `lines` preference
> were removed by `2026-11-10-line-density-heatmap-design.md`, which draws density-coloured
> glowing route lines in the heat canvas itself. The basemap decision below still stands.

Date: 2026-11-10
Status: approved by the product owner (chat: "go with your suggestion")

## Why

Two production faults were reported against the deployed heatmap:

1. The CARTO basemap now renders an "API KEY REQUIRED" placeholder on every tile. CARTO's
   docs confirm raster tiles require `?key=`, and the app deliberately has no account/key
   configuration.
2. With ~300 overlapping routes the heat layer becomes a saturated white disc ("radiant
   blast"). Sparse routes normalise down to near-invisible, and no route geometry is drawn,
   so there are no outlines to trace.

## Goals

- Restore a real dark basemap without adding an API-key field or an account.
- Keep every route locally renderable when the basemap is blocked.
- Make individual paths traceable while keeping the Strava-style density glow.

## Non-goals

- No vector-tile stack (MapLibre), no CARTO key UI, no backend, no database migration.
- No change to route decimation, sanitisation, or stored activities.

## Decisions

### Basemap: Esri World Dark Gray Canvas (approved)

- URL: `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`
- Keyless, dark, labels included; verified real tiles render at z16 and that z17+ are not
  served, so the layer uses `maxNativeZoom: 16` with `maxZoom: 18` (Leaflet upscales).
- Attribution: "Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS user community"
  with a link to Esri. Shown via Leaflet's attribution control.
- Workbox CacheFirst rule and cache name move from `carto-dark-tiles` to
  `esri-dark-tiles`; e2e tile-blocking targets the Esri host.
- Trade-off: the exact CARTO palette is lost and Esri's public tiles are used without an
  ArcGIS subscription. This is acceptable for a personal, non-commercial local app and is
  the only verified keyless dark raster source. `about_safe`/README/SPEC copy is updated.

### Route outlines layer

- New persisted preference `lines: boolean`, default `true`, validated in `loadPrefs`.
- Drawn as one non-interactive multi-polyline (all filtered routes) in a dedicated Leaflet
  pane above the heat image overlay, so paths stay crisp through pan/zoom.
- Style: warm white (`#ffe4c4`), weight 1.1, opacity 0.4, over a slightly wider dark
  casing (`#1a1008`, opacity 0.45) so paths stay traceable where the glow saturates to white.
- Follows the sport filter; rebuilt on filter change, removed on teardown.
- Panel checkbox "Route lines" (`heatmap_lines`) beside the Basemap toggle.

### Heat retune

- Lower the per-route stroke alpha (0.06 → 0.035) and thin the stroke so a single route no
  longer approaches saturation.
- Raise `GAMMA` from 0.75 toward linear (target 0.9) so only genuinely dense pixels reach
  white; sparse corridors stay orange.
- Keep the exact quantile normalisation; both changes are constants in
  `src/data/heatmap.ts`/`heatmap-view.ts`, tuned against a synthetic 300-route dataset.

## Verification

- Unit: tile constants, `lines` pref default/validation, ramp endpoints unchanged.
- e2e: Esri tiles requested; route-lines pane present, toggle removes it, filter updates it;
  existing heatmap/offline tests still pass.
- Visual: synthetic dense + sparse dataset screenshotted before/after; single-route corridors
  legible and the dense core not pure white.

## Files

- `src/data/heatmap.ts` (tile constants, gamma)
- `src/ui/heatmap-view.ts` (tile layer options, lines pane/pref, stroke alpha)
- `src/i18n.ts`, `src/styles/heatmap.css` (toggle styling)
- `vite.config.ts`, `playwright.config.ts` comment, `test/e2e/heatmap.spec.ts`,
  `test/heatmap.test.ts`
- `README.md`, `SPEC.md`, `docs/superpowers/specs/2026-11-07-heatmap-design.md`
