# Line-density heatmap — short design

Date: 2026-11-10
Status: proposed (awaiting approval)
Supersedes the heat-rendering parts of
[2026-11-10-heatmap-basemap-and-outlines-design.md](./2026-11-10-heatmap-basemap-and-outlines-design.md)
(Esri basemap decision still stands).

## Why

The current heat layer is a cloud: white strokes are accumulated into a raster, the whole
raster is blurred, and its 98th-percentile alpha is stretched to white. A separate crisp
polyline layer sits on top. The result shows *where* activity is concentrated but not
*which paths* are hot, and one-off routes are nearly invisible.

The owner asked for the Strava-native look: the glow belongs to the route lines, and a
line gets brighter and hotter as more routes overlap it. Chosen approach: **A —
density-coloured glowing lines**.

## Goals

- Every visible path is a glowing line; there is no separate outline layer.
- Colour and brightness are driven by how many **distinct routes** pass through a
  corridor, not by accumulated pixel alpha.
- A single-use route is a clearly visible dark red; heavy overlap climbs through orange
  and yellow toward near-white.
- The scale is absolute, so the same road keeps roughly the same colour when sport chips
  change; only its overlap count changes the result.
- One rendered heat image over the Esri basemap, as today, so pan/zoom stay smooth.

## Non-goals

- No vector-tile/MapLibre rewrite, hover/tooltip, per-activity highlighting, or backend.
- No change to stored activities, GPX parsing, or the 120-point route decimation.
- No date filtering in the heatmap beyond the existing sport chips.

## Anti-goals

- A saturated white disc where the centre of mass is densest.
- Relative/quantile auto-normalisation that makes a single route look hottest.
- A second layer whose brightness means something different from the glow.

## Constraints

- Up to ~600 routes, each capped at 120 points (~72k points worst case).
- Rendering happens once per filter change on a deferred frame, output is an
  `L.imageOverlay` blob; raster longest edge is capped at 2048 px.
- No new dependencies and no network calls.
- All user-visible strings go through `t()`.

## Approaches considered

- **A — Density-coloured glowing lines. Chosen.** Build an overlap-count grid, then draw
  each route segment in a ramp colour sampled from that grid, with a soft coloured glow
  under it. Directly answers the request; no full-canvas blur; cost is a second canvas
  pass per filter change, which is bounded and fast at this data size.
- **B — Sharpen the existing cloud.** Smaller blur and thinner strokes; cheapest, but
  brightness still comes from pixel alpha, long segments cannot change colour along
  their length, and one route can still wash out.
- **C — Vector density lines in Leaflet.** Crisp at every zoom and hover-ready later, but
  needs a spatial grid plus tens of thousands of canvas paths re-coloured on every zoom;
  much more code and jank risk for little visual gain over A.

## How it works

### 1. Project once

Project each route's points into raster pixels for the current bounds, reusing the
existing `projectToCanvas` maths. Keep the projected arrays for both passes.

### 2. Count distinct routes per corridor

Build a grid over the heat bounds, `1024` cells on the longest side (`Uint16Array`).
For each route:

- traverse each segment with a DDA/Bresenham walk in grid space;
- mark a 1-cell corridor around the walked cells in a per-route `Uint16Array` stamp grid
  (route index + 1, so no set allocations and no clearing between routes);
- after the route is walked, add `1` to the shared count grid for each stamped cell, then
  the next route's writes overwrite the stamps.

A cell therefore holds "how many distinct routes touched this corridor", never more than
once per route. This is the informative number behind the colour.

### 3. Colour and glow

Sample the count at each segment's midpoint (subdividing segments longer than ~8 raster
px so long straights can change colour). Map the count to `0..1` with an absolute log
scale:

```
v = min(1, log1p(count) / log1p(HEAT_MAX_COUNT)) ** GAMMA
```

with `HEAT_MAX_COUNT = 64` and `GAMMA` around `0.85`. One route gives `v ≈ 0.17`; 64+
routes gives `v = 1`. Bucket `v` into 128 levels — fewer levels quantise the smooth
gradient into visible concentric rings across a dense core.

Draw twice into a transparent output canvas, low level to high:

1. **Glow:** a tight rim hugging the line, built from the overlap grid itself, not from
   the route paths. The grid's counts and a 0/1 coverage mask are each box-blurred twice
   per axis (which approximates a Gaussian). Every cell then takes `count / coverage` —
   the local average overlap — through the same ramp. The blur radius is only half a core
   width (`max(2, coreWidth * 0.5)` raster px), so the light extends just past the stroke
   edge instead of blooming into a radial wash. The bloom is put into a grid-sized canvas
   and upscaled once onto the output at alpha `0.28`.
2. **Core:** the same paths with a full-opacity stroke whose width scales with the
   raster (`clamp(longSide/280, 2, 8)` px) so on-screen weight stays constant after
   Leaflet downscales the overlay. Consecutive pieces in the same bucket are merged into
   one subpath, so a route costs a few strokes instead of one per 8 px piece.

Compositing the glow once matters: stroking it straight onto the output would accumulate
alpha for every overlapping route and turn busy roads into opaque slabs. The core still
carries density through its colour. Drawing all glow before all cores keeps every core
crisp.

Deriving the bloom from the grid is what keeps large exports responsive: a per-route
wide stroke costs `routes × brush area`, and 2000 routes took ~35 s to rasterise that
way (the tab simply stopped responding). The blurred grid is a fixed ~650k-cell job, so
a 2000-route export now renders in well under a second. The finished canvas is turned
into a blob and swapped into the existing `L.imageOverlay`.

### 4. Ramp

`HEAT_RAMP` holds opaque heat colours with a visible cold end: dark muted red
(`#580c08`) → `#8a180a` → `#c43008` → `#f06010` → `#ffa838` → near-white (`#fff6c8`).
`heatColor(v)` returns the interpolated RGB and replaces the old pixel-alpha
`applyHeatRamp`. `heatQuantile` and `HOT_QUANTILE` are no longer needed and are removed
with their tests. Update the legend CSS gradient to match and add a one-line hint:
"Brighter lines = more overlapping routes".

### 5. Remove the second layer

Delete the `lines` preference, its normalisation branch, the "Route lines" checkbox and
`heatmap_lines` string, and the `route-lines` pane/polyline/casing code. Old stored prefs
containing `lines` are ignored field-by-field. The map now has exactly one heat layer.

## Verification

- Unit: `heatColor` cold/hot endpoints and monotonic brightness; `densityValue` for
  counts 0/1/64/clamped; `normalisePrefs` no longer returns `lines`; existing geometry,
  bounds and sanitisation tests unchanged.
- e2e: heatmap still renders an overlay; no route-lines pane or toggle exists; sport
  chips still re-render the overlay; blocked tiles still degrade to heat-on-dark.
- Visual: synthetic 300-route dense + sparse dataset and a single-route dataset. Check
  that one route is dark red and traceable, busy corridors climb the ramp, and no white
  disc forms. Compare render time before/after.

## Files

- `src/data/heatmap.ts` — ramp/`heatColor`, `densityValue`, remove quantile/apply-ramp,
  drop `lines` from prefs.
- `src/ui/heatmap-view.ts` — overlap grid, colour/glow renderer, remove polyline layer
  and toggle, add density hint.
- `src/i18n.ts`, `src/styles/heatmap.css` — strings, legend gradient/hint.
- `test/heatmap.test.ts`, `test/e2e/heatmap.spec.ts`.
- `SPEC.md`, this design, previous heatmap design notes.

## Left to the builder

Exact tuning (`HEAT_MAX_COUNT`, `GAMMA`, corridor width, grid size, glow width/alpha)
against the real dataset. The structure above is fixed; those constants are expected to
move once the synthetic and real renders are compared.
