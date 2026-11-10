# Line-Density Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the blurred heat cloud and separate route-outline layer with glowing route lines whose colour and brightness come from how many distinct routes overlap each corridor.

**Architecture:** A pure overlap grid counts distinct routes per corridor. The view projects routes once, walks each route through the grid (counting each route at most once per cell), then draws every segment twice into one transparent canvas: a wide faint colour glow under a thin full-opacity core, bucketed by density level. The canvas becomes the existing `L.imageOverlay` blob. The old quantile/blur renderer and the route-lines pane, toggle, and preference are deleted.

**Tech Stack:** TypeScript, Canvas 2D, Leaflet `L.imageOverlay`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-line-density-heatmap-design.md`

## Global Constraints

- Up to ~600 routes, each ≤120 points.
- Raster longest edge ≤2048 px; grid longest side 1024 cells.
- No new dependencies, no network calls beyond Esri tiles.
- All user-visible strings go through `t()`.
- Stored activities, GPX parsing, and route decimation are unchanged.
- `HEAT_MAX_COUNT = 64`, `GAMMA` starts at `0.85`, `HEAT_LEVELS = 32`, glow alpha `0.16`, glow width `3×` core, core width `clamp(minDim/700, 1.2, 3)` raster px.

## Review Focus

- A single route: every segment has count 1, must render dark red and remain visible, never white.
- Many fully overlapping routes: the line core may reach near-white, but the surrounding map must not become a white disc.
- Long straight segments (decimated routes with few points): colour must be sampled along the segment, not once per route.
- Bounds with extreme aspect ratio or a tiny viewport: grid and raster dimensions must stay ≥1 and keep the aspect ratio.
- Filtering to zero routes / all routes outside the grid: no crash, stale overlay removed, empty state unchanged.

---

### Task 1: Add the absolute line-heat scale

**Files:**
- Modify: `src/data/heatmap.ts`
- Test: `test/heatmap.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `HEAT_MAX_COUNT: 64`, `HEAT_RAMP: Array<{ at: number; rgb: [number, number, number] }>`, `heatColor(value: number): [number, number, number]`, `densityValue(count: number): number`.

- [ ] **Step 1: Write failing tests**

Add to `test/heatmap.test.ts`, importing `HEAT_MAX_COUNT`, `densityValue`, `heatColor`:

```ts
describe('line heat scale', () => {
  it('maps no overlap to cold and the maximum count to hot', () => {
    expect(densityValue(0)).toBe(0);
    expect(densityValue(HEAT_MAX_COUNT)).toBeCloseTo(1, 5);
    expect(densityValue(HEAT_MAX_COUNT * 4)).toBe(1);
  });

  it('brightens monotonically with overlap count', () => {
    const values = [1, 2, 4, 8, 16, 32].map(densityValue);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it('returns opaque warm RGB endpoints and clamps out-of-range values', () => {
    expect(heatColor(0)).toEqual([107, 18, 0]);
    expect(heatColor(1)).toEqual([255, 246, 200]);
    expect(heatColor(-5)).toEqual(heatColor(0));
    expect(heatColor(5)).toEqual(heatColor(1));
  });
});
```

- [ ] **Step 2: Run the tests to confirm RED**

Run: `npm test -- test/heatmap.test.ts`
Expected: FAIL — `heatColor` / `densityValue` / `HEAT_MAX_COUNT` not exported.

- [ ] **Step 3: Implement the scale**

In `src/data/heatmap.ts` add, without touching the existing `RAMP`/`applyHeatRamp` yet:

```ts
/** Overlap count treated as the hottest line; higher counts clamp. */
export const HEAT_MAX_COUNT = 64;

/** Opaque line-heat ramp from a muted single-use red to near-white. */
export const HEAT_RAMP: Array<{ at: number; rgb: [number, number, number] }> = [
  { at: 0, rgb: [107, 18, 0] },
  { at: 0.2, rgb: [168, 42, 0] },
  { at: 0.4, rgb: [225, 70, 4] },
  { at: 0.62, rgb: [252, 118, 22] },
  { at: 0.8, rgb: [255, 176, 64] },
  { at: 1, rgb: [255, 246, 200] },
];

/** Perceptual value for a corridor overlap count, independent of the filtered set. */
export function densityValue(count: number): number {
  const safe = Math.max(0, count);
  return Math.min(1, Math.log1p(safe) / Math.log1p(HEAT_MAX_COUNT)) ** GAMMA;
}

/** Interpolated opaque RGB for a normalised heat value. */
export function heatColor(value: number): [number, number, number] {
  const v = Math.min(1, Math.max(0, value));
  let upper = 1;
  while (upper < HEAT_RAMP.length - 1 && HEAT_RAMP[upper].at < v) upper++;
  const hi = HEAT_RAMP[upper];
  const lo = HEAT_RAMP[upper - 1];
  const span = hi.at - lo.at;
  const t = span === 0 ? 0 : (v - lo.at) / span;
  return [0, 1, 2].map((i) => Math.round(lo.rgb[i] + (hi.rgb[i] - lo.rgb[i]) * t)) as [
    number,
    number,
    number,
  ];
}
```

Set `GAMMA = 0.85`.

- [ ] **Step 4: Run tests to GREEN**

Run: `npm test -- test/heatmap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/heatmap.ts test/heatmap.test.ts
git commit -m "feat: add absolute overlap colour scale for line heat"
```

---

### Task 2: Render density-coloured glowing lines and remove the second layer

**Files:**
- Modify: `src/ui/heatmap-view.ts`
- Modify: `src/data/heatmap.ts`
- Modify: `src/i18n.ts`
- Modify: `src/styles/heatmap.css`
- Modify: `test/heatmap.test.ts`
- Modify: `test/e2e/heatmap.spec.ts`

**Interfaces:**
- Consumes: `HEAT_MAX_COUNT`, `HEAT_RAMP`, `densityValue`, `heatColor` from Task 1.
- Produces: one canvas renderer inside `drawHeat(routes, bounds)`; no exported API changes.

- [ ] **Step 1: Update the failing pref test and remove route-lines expectations**

In `test/heatmap.test.ts`, change the `normalisePrefs` expectations so the returned object is `{ opacity, basemap, sports }` only, and remove `lines` from the inputs. In `test/e2e/heatmap.spec.ts`, delete the `route lines are drawn above the heat and can be hidden` test and assert in `renders heat over the dark map...` that `.leaflet-route-lines-pane` has count 0.

- [ ] **Step 2: Run to confirm RED**

Run: `npm test -- test/heatmap.test.ts`
Expected: FAIL because `normalisePrefs` still returns `lines`.

- [ ] **Step 3: Implement the overlap grid and two-pass renderer**

In `src/ui/heatmap-view.ts`:

1. Import `densityValue`, `heatColor`; stop importing `applyHeatRamp`, `heatQuantile`, `HOT_QUANTILE`.
2. Delete `ROUTE_LINE_*`, `ROUTE_CASING_*`, `ROUTE_LINES_PANE`, `routeLayers`, `linesPane`, `updateRouteLines`, `applyLinesVisibility`, the pane creation, the filter/teardown calls, the `lines` checkbox/listener, and `heatmap_lines` usage.
3. Add constants `GRID_SIZE = 1024`, `GRID_RADIUS = 1`, `CHUNK_PX = 8`, `HEAT_LEVELS = 32`, `GLOW_WIDTH_MULT = 3`, `GLOW_ALPHA = 0.16`.
4. Rewrite `drawHeat`:
   - compute `nw`, spans, `width`, `height` as today;
   - project every routable route once into `{ x, y }[]`;
   - build `gridW`/`gridH` from the raster aspect ratio, longest side `GRID_SIZE`, each ≥1;
   - `counts = new Uint16Array(gridW * gridH)`, `stamps = new Uint16Array(...)`;
   - per route `i`, stamp = `i + 1`; DDA-walk each segment in grid coordinates, stamping a 1-cell corridor and pushing newly stamped indices to `touched`; after the walk add 1 to `counts` for each touched index; reset `touched.length = 0` for the next route;
   - chunk each segment into at most `CHUNK_PX`-long pieces, sample `counts` at each chunk midpoint (clamped indices), map through `densityValue`, bucket into `HEAT_LEVELS` `Path2D`s;
   - draw all buckets low→high with `lineWidth = coreWidth * GLOW_WIDTH_MULT`, `globalAlpha = GLOW_ALPHA`, colour `heatColor((level + 0.5) / HEAT_LEVELS)`, round caps/joins;
   - draw all buckets low→high again with `lineWidth = coreWidth`, `globalAlpha = 1`, same colours;
   - `coreWidth = Math.min(3, Math.max(1.2, Math.min(width, height) / 700))`;
   - return the transparent output canvas.

Use one helper `cellIndex(gx, gy)` with bounds clamping; keep all geometry local to `drawHeat`.

- [ ] **Step 4: Remove the old heat functions and ramp**

In `src/data/heatmap.ts`, delete `HOT_QUANTILE`, `GAMMA`-dependent old `RAMP`, `applyHeatRamp`, and `heatQuantile`. Remove `lines` from `HeatmapPrefs`, `DEFAULT_HEATMAP_PREFS`, and `normalisePrefs`. Delete the corresponding old ramp/quantile tests in `test/heatmap.test.ts`.

- [ ] **Step 5: Add the density hint and legend colours**

In `src/i18n.ts`, add `heatmap_density: 'Brighter lines = more overlapping routes'` and remove `heatmap_lines`. In `src/ui/heatmap-view.ts`, add a `<p class="heatmap-hint">` with that string after the controls. In `src/styles/heatmap.css`, change `.heatmap-ramp` to `linear-gradient(90deg, #6b1200, #a82a00, #e14604, #fc7616, #ffb040, #fff6c8)`.

- [ ] **Step 6: Run unit + typecheck + lint**

Run: `npm test -- test/heatmap.test.ts`
Expected: PASS.
Run: `npm run typecheck && npm run lint`
Expected: typecheck clean; lint has only the known pre-existing warnings.

- [ ] **Step 7: Commit**

```bash
git add src/data/heatmap.ts src/ui/heatmap-view.ts src/i18n.ts src/styles/heatmap.css test/heatmap.test.ts test/e2e/heatmap.spec.ts
git commit -m "feat: draw density-coloured glowing route lines"
```

---

### Task 3: Update docs, verify visually, and ship

**Files:**
- Modify: `SPEC.md`
- Modify: `docs/superpowers/specs/2026-11-10-heatmap-basemap-and-outlines-design.md`
- Modify: `README.md` only if wording still mentions outlines
- Test: whole suite

**Interfaces:**
- Consumes: the renderer from Task 2.
- Produces: updated living docs and a verified build.

- [ ] **Step 1: Update living docs**

In `SPEC.md`, replace the heat pipeline paragraph with the overlap-grid/log-scale/two-pass description and remove `lines` from the `heatmapPrefs` shape. Add a superseded note to
`docs/superpowers/specs/2026-11-10-heatmap-basemap-and-outlines-design.md` pointing at the new line-density design.

- [ ] **Step 2: Run the full verification**

Run: `npm test && npm run typecheck && npm run lint && npm run build && npm run test:e2e`
Expected: all unit tests pass; e2e passes; typecheck clean; only known lint warnings.

- [ ] **Step 3: Visual check with synthetic data**

Render two local builds against the same synthetic dataset used before:
- a single-route import — screenshot must show a visible dark-red line;
- the ~300-route import — screenshot must show dark-red one-off paths, orange busy roads, and near-white only on the hottest corridors, with no white disc.

If the render is too dim, too white, or glow overwhelms the core, tune `HEAT_MAX_COUNT`, `GAMMA`, `GLOW_ALPHA`, or `GLOW_WIDTH_MULT` only, then repeat Steps 2–3.

- [ ] **Step 4: Commit and deploy**

```bash
git add SPEC.md docs/superpowers/specs/2026-11-10-heatmap-basemap-and-outlines-design.md
git commit -m "docs: describe line-density heatmap"
git push origin main
```

Publish `dist` to `gh-pages` (delete old tracked assets, copy `dist/*`, keep `.gitignore`), push, and verify the live `index.html` references the new asset and the heatmap loads Esri tiles.
