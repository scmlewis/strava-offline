import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Activity } from '../data/types.ts';
import {
  computeHeatBounds,
  DEFAULT_HEATMAP_PREFS,
  densityValue,
  HEATMAP_PREFS_KEY,
  heatColor,
  lonLatToWorld,
  MAX_HEAT_OPACITY,
  MAX_RASTER,
  MIN_HEAT_OPACITY,
  normalisePrefs,
  sanitizeRoutes,
  shouldRefit,
  sportTypes,
  TILE_ATTRIBUTION,
  TILE_URL,
  type HeatBounds,
  type HeatmapPrefs,
  type MapView,
  type SanitizedRoute,
} from '../data/heatmap.ts';
import { t } from '../i18n.ts';
import { icon } from '../icons.ts';

/** Zoomed-out raster scale: 256 px tiles at 2^14 world pixels keeps trails crisp. */
const RASTER_SCALE = 256 * 2 ** 14;
const MIN_RASTER = 512;
/** Smallest usable normalised world span, guarding against a zero-width bounding box. */
const MIN_SPAN = 1e-9;
/** Tile errors before the "basemap unavailable" note is shown (single failed tiles are noise). */
const TILE_ERROR_THRESHOLD = 4;

/** Overlap grid resolution: longest side in cells, and corridor radius in cells. */
const GRID_SIZE = 1024;
const GRID_RADIUS = 1;
/** Longest segment piece drawn with one sampled colour, in raster pixels. */
const CHUNK_PX = 8;
/** Number of colour buckets used to keep drawing to a few dozen strokes. */
const HEAT_LEVELS = 32;
/** Glow drawn under each line: width multiplier and alpha. */
const GLOW_WIDTH_MULT = 4;
const GLOW_ALPHA = 0.28;

/** Live map field; Leaflet attaches to this element once it has been laid out. */
let mapEl: HTMLElement | null = null;
let prefs: HeatmapPrefs = { ...DEFAULT_HEATMAP_PREFS };
let map: L.Map | null = null;
let tileLayer: L.TileLayer | null = null;
let overlay: L.ImageOverlay | null = null;
let blobUrl: string | null = null;
let noteEl: HTMLElement | null = null;
let renderingEl: HTMLElement | null = null;
let pendingFrame = 0;
let renderToken = 0;
let tileErrors = 0;

/** The bounds the heat overlay currently represents; the single source of truth for "Fit routes". */
let currentFitBounds: L.LatLngBounds | null = null;

/** Deferred `requestAnimationFrame` handles for the in-flight heat render (two frames). */
let renderFrames: number[] = [];

/** Shows/hides the "Rendering heatmap…" status chip. */
function setRendering(show: boolean): void {
  if (renderingEl) renderingEl.hidden = !show;
}

/** Cancels any frames scheduled for the in-flight heat render. */
function cancelRenderFrames(): void {
  for (const frame of renderFrames) cancelAnimationFrame(frame);
  renderFrames = [];
}

/**
 * Viewport the user last settled on, reused when the tab is re-opened. Written on
 * `moveend` and gated by `shouldRefit` on the next init; `destroyHeatmap` deliberately
 * keeps it so the viewport survives tab switches.
 */
let savedView: MapView | null = null;

function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_HEATMAP_PREFS.opacity;
  return Math.min(MAX_HEAT_OPACITY, Math.max(MIN_HEAT_OPACITY, value));
}

/** Read `heatmapPrefs`, falling back to defaults on missing or malformed storage. */
function loadPrefs(): HeatmapPrefs {
  try {
    const raw = localStorage.getItem(HEATMAP_PREFS_KEY);
    if (!raw) return { ...DEFAULT_HEATMAP_PREFS };
    return normalisePrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_HEATMAP_PREFS };
  }
}

function savePrefs(): void {
  try {
    localStorage.setItem(HEATMAP_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage disabled or full — preferences are non-fatal */
  }
}

function applyPrefs(): void {
  if (!mapEl) return;
  mapEl.classList.toggle('no-basemap', !prefs.basemap);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  testId?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (testId) node.dataset.testid = testId;
  return node;
}

/** Project a `[lat, lon]` pair into canvas pixels for the given bounding box. */
function projectToCanvas(
  lat: number,
  lon: number,
  nw: { x: number; y: number },
  spanX: number,
  spanY: number,
  width: number,
  height: number,
): [number, number] {
  const world = lonLatToWorld(lat, lon);
  return [((world.x - nw.x) / spanX) * width, ((world.y - nw.y) / spanY) * height];
}

/**
 * Renders the line heat: count how many distinct routes touch each corridor, then draw
 * every segment in the ramp colour sampled from that count, with a soft glow underneath.
 */
function drawHeat(routes: SanitizedRoute[], bounds: HeatBounds): HTMLCanvasElement {
  const nw = lonLatToWorld(bounds.north, bounds.west);
  const se = lonLatToWorld(bounds.south, bounds.east);
  const spanX = Math.max(MIN_SPAN, se.x - nw.x);
  const spanY = Math.max(MIN_SPAN, se.y - nw.y);
  const longestSpan = Math.max(spanX, spanY);

  const longSide = Math.min(
    MAX_RASTER,
    Math.max(MIN_RASTER, Math.round(longestSpan * RASTER_SCALE)),
  );
  const width = Math.max(1, Math.round((longSide * spanX) / longestSpan));
  const height = Math.max(1, Math.round((longSide * spanY) / longestSpan));

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) return out;

  const projected = routes
    .filter((route) => route.points.length >= 2)
    .map((route) =>
      route.points.map(([lat, lon]) =>
        projectToCanvas(lat, lon, nw, spanX, spanY, width, height),
      ),
    );
  if (projected.length === 0) return out;

  const gridW = Math.max(1, Math.round((GRID_SIZE * spanX) / longestSpan));
  const gridH = Math.max(1, Math.round((GRID_SIZE * spanY) / longestSpan));
  const counts = new Uint16Array(gridW * gridH);
  const stamps = new Uint16Array(gridW * gridH);
  const touched: number[] = [];

  const cellIndex = (gx: number, gy: number): number => {
    const x = gx < 0 ? 0 : gx >= gridW ? gridW - 1 : gx;
    const y = gy < 0 ? 0 : gy >= gridH ? gridH - 1 : gy;
    return y * gridW + x;
  };
  const mark = (gx: number, gy: number, stamp: number): void => {
    for (let oy = -GRID_RADIUS; oy <= GRID_RADIUS; oy++) {
      for (let ox = -GRID_RADIUS; ox <= GRID_RADIUS; ox++) {
        const index = cellIndex(gx + ox, gy + oy);
        if (stamps[index] !== stamp) {
          stamps[index] = stamp;
          touched.push(index);
        }
      }
    }
  };

  // Pass 1: count each route at most once per corridor cell.
  for (let r = 0; r < projected.length; r++) {
    const stamp = r + 1;
    const points = projected[r];
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      const gx0 = (x0 / width) * (gridW - 1);
      const gy0 = (y0 / height) * (gridH - 1);
      const dx = (x1 / width) * (gridW - 1) - gx0;
      const dy = (y1 / height) * (gridH - 1) - gy0;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        mark(Math.round(gx0 + dx * t), Math.round(gy0 + dy * t), stamp);
      }
    }
    for (const index of touched) counts[index] += 1;
    touched.length = 0;
  }

  // Pass 2: bucket each segment piece by the overlap count at its midpoint.
  const paths = Array.from({ length: HEAT_LEVELS }, () => new Path2D());
  const sample = (x: number, y: number): number => {
    const gx = Math.round((x / width) * (gridW - 1));
    const gy = Math.round((y / height) * (gridH - 1));
    return counts[cellIndex(gx, gy)];
  };

  for (const points of projected) {
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      const pieces = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / CHUNK_PX));
      for (let p = 0; p < pieces; p++) {
        const t0 = p / pieces;
        const t1 = (p + 1) / pieces;
        const ax = x0 + (x1 - x0) * t0;
        const ay = y0 + (y1 - y0) * t0;
        const bx = x0 + (x1 - x0) * t1;
        const by = y0 + (y1 - y0) * t1;
        const count = sample((ax + bx) / 2, (ay + by) / 2);
        const level = Math.min(
          HEAT_LEVELS - 1,
          Math.floor(densityValue(count) * HEAT_LEVELS),
        );
        paths[level].moveTo(ax, ay);
        paths[level].lineTo(bx, by);
      }
    }
  }

  const colour = (level: number): string => {
    const [r, g, b] = heatColor((level + 0.5) / HEAT_LEVELS);
    return `rgb(${r}, ${g}, ${b})`;
  };
  // Scale with the raster so the on-screen weight stays constant: the overlay is drawn
  // at up to 2048 px and Leaflet then fits it to the viewport, downscaling by 2–4×.
  const coreWidth = Math.min(8, Math.max(2, longSide / 280));

  // Glow is built on its own layer and composited once. Stroking it straight onto the
  // output would re-accumulate alpha for every overlapping route, turning busy roads
  // into opaque slabs; a single pass keeps the halo flat while the core carries density.
  const glow = document.createElement('canvas');
  glow.width = width;
  glow.height = height;
  const gctx = glow.getContext('2d');
  if (gctx) {
    gctx.lineCap = 'round';
    gctx.lineJoin = 'round';
    gctx.lineWidth = coreWidth * GLOW_WIDTH_MULT;
    for (let level = 0; level < HEAT_LEVELS; level++) {
      gctx.strokeStyle = colour(level);
      gctx.stroke(paths[level]);
    }

    ctx.save();
    if (typeof ctx.filter === 'string') {
      ctx.filter = `blur(${Math.max(1, Math.round(coreWidth * 1.2))}px)`;
    }
    ctx.globalAlpha = GLOW_ALPHA;
    ctx.drawImage(glow, 0, 0);
    ctx.restore();
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = coreWidth;
  for (let level = 0; level < HEAT_LEVELS; level++) {
    ctx.strokeStyle = colour(level);
    ctx.stroke(paths[level]);
  }

  return out;
}

/** Rasterises `routes` and swaps the image overlay in, ignoring stale renders. */
function updateHeat(routes: SanitizedRoute[], bounds: HeatBounds): void {
  const token = ++renderToken;
  const boundsLatLng = L.latLngBounds(
    [bounds.south, bounds.west],
    [bounds.north, bounds.east],
  );
  // This render is now the target "Fit routes" zooms to; a chip change lands here too.
  currentFitBounds = boundsLatLng;

  // Show the status chip synchronously, then defer the heavy raster work by two
  // frames so the chip can paint before the main thread blocks.
  setRendering(true);
  cancelRenderFrames();
  renderFrames.push(
    requestAnimationFrame(() => {
      renderFrames.push(
        requestAnimationFrame(() => {
          renderFrames = [];
          // Superseded by a newer render, or the map was torn down: drop this one.
          // A newer render owns the chip; teardown clears it via `destroyHeatmap`.
          if (token !== renderToken || !map) return;

          drawHeat(routes, bounds).toBlob((blob) => {
            // A newer render (or a teardown) finished first: drop this one.
            if (token !== renderToken || !map) return;
            if (!blob) {
              setRendering(false);
              return;
            }
            const url = URL.createObjectURL(blob);
            if (overlay) {
              map.removeLayer(overlay);
              overlay = null;
            }
            if (blobUrl) URL.revokeObjectURL(blobUrl);
            blobUrl = url;
            overlay = L.imageOverlay(url, boundsLatLng, {
              opacity: prefs.opacity,
              interactive: false,
              className: 'heatmap-overlay',
            });
            overlay.addTo(map);
            setRendering(false);
          });
        }),
      );
    }),
  );
}

/** Builds the Esri dark tile layer and reveals the offline note after repeated tile errors. */
function buildTiles(): L.TileLayer {
  const layer = L.tileLayer(TILE_URL, {
    // Esri serves World Dark Gray Canvas up to z16; Leaflet upscales beyond that.
    maxNativeZoom: 16,
    maxZoom: 18,
    attribution: TILE_ATTRIBUTION,
  });
  tileErrors = 0;
  layer.on('tileerror', () => {
    tileErrors += 1;
    if (tileErrors >= TILE_ERROR_THRESHOLD && noteEl) {
      noteEl.hidden = false;
      noteEl.textContent = t('heatmap_offline');
    }
  });
  tileLayer = layer;
  return layer;
}

/** Creates the Leaflet map, its controls, tiles, and the first heat render. */
function initMap(host: HTMLElement, routes: SanitizedRoute[], bounds: HeatBounds): void {
  map = L.map(host, {
    zoomControl: false,
    attributionControl: true,
    minZoom: 3,
    maxZoom: 18,
    worldCopyJump: true,
    preferCanvas: true,
  });

  const boundsLatLng = L.latLngBounds(
    [bounds.south, bounds.west],
    [bounds.north, bounds.east],
  );
  const size = map.getSize();
  // Keep the viewport the user left on unless it no longer overlaps the heat (or
  // there is none yet), in which case fit the routes fresh.
  if (savedView && !shouldRefit(savedView, bounds, { width: size.x, height: size.y })) {
    map.setView(savedView.center, savedView.zoom);
  } else {
    map.fitBounds(boundsLatLng);
  }

  // Track the settled viewport so the next tab render can restore it.
  map.on('moveend', () => {
    if (!map) return;
    const centre = map.getCenter();
    savedView = { center: [centre.lat, centre.lng], zoom: map.getZoom() };
  });

  // Zoom is added first so the Fit button stacks above it in the bottom-right corner
  // (Leaflet renders later controls higher within a corner).
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  const fitControl = new L.Control({ position: 'bottomright' });
  fitControl.onAdd = () => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'heatmap-fit';
    button.dataset.testid = 'heatmap-fit';
    button.textContent = t('heatmap_fit');
    button.title = t('heatmap_fit');
    button.setAttribute('aria-label', t('heatmap_fit'));
    L.DomEvent.disableClickPropagation(button);
    button.addEventListener('click', () => {
      if (currentFitBounds) map?.fitBounds(currentFitBounds);
    });
    return button;
  };
  fitControl.addTo(map);

  const tiles = buildTiles();
  if (prefs.basemap) tiles.addTo(map);

  updateHeat(routes, bounds);
}

export function renderHeatmapTab(acts: Activity[]): HTMLElement {
  // Start from a clean slate; `destroyHeatmap` keeps `savedView` so the viewport can
  // be restored once the map is rebuilt below.
  destroyHeatmap();
  prefs = loadPrefs();
  const routes = sanitizeRoutes(acts);
  const types = sportTypes(acts);

  // Drop persisted sports that no longer exist, otherwise a stale filter would hide
  // every route with no indication why.
  const known = new Set(types.map((sport) => sport.type));
  const pruned = prefs.sports.filter((sport) => known.has(sport));
  if (pruned.length !== prefs.sports.length) {
    prefs.sports = pruned;
    savePrefs();
  }

  const tab = el('div', 'heatmap-tab', 'heatmap-tab');

  const field = el('div', 'heatmap-map', 'heatmap-map');
  field.setAttribute('role', 'region');
  field.setAttribute('aria-label', t('heatmap_region'));

  const panel = el('div', 'heatmap-panel', 'heatmap-panel');

  const head = el('div', 'heatmap-panel-head');
  const title = el('h2', 'heatmap-title');
  title.textContent = t('heatmap_title');
  const count = el('span', 'heatmap-count', 'heatmap-count');
  count.id = 'heatmap-count';
  head.append(title, count);
  panel.appendChild(head);

  const rendering = el('p', 'heatmap-rendering', 'heatmap-rendering');
  rendering.hidden = true;
  rendering.setAttribute('role', 'status');
  rendering.setAttribute('aria-live', 'polite');
  rendering.textContent = t('heatmap_rendering');
  panel.appendChild(rendering);

  const chips = el('div', 'heatmap-chips');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', t('heatmap_sports'));

  const allChip = el('button', 'heatmap-chip', 'heatmap-chip-all');
  allChip.type = 'button';
  allChip.textContent = t('heatmap_all');

  const typeChips = types.map((sport) => {
    const chip = el('button', 'heatmap-chip', `heatmap-chip-${sport.type}`);
    chip.type = 'button';
    chip.dataset.sport = sport.type;
    chip.textContent = t('heatmap_chip', { type: sport.type, n: sport.count });
    return chip;
  });

  chips.append(allChip, ...typeChips);
  panel.appendChild(chips);

  const controls = el('div', 'heatmap-controls');

  const opacityField = el('label', 'heatmap-field');
  const opacityLabel = el('span', 'heatmap-field-label');
  opacityLabel.textContent = t('heatmap_opacity');
  const opacity = el('input', 'heatmap-opacity', 'heatmap-opacity');
  opacity.type = 'range';
  opacity.min = String(MIN_HEAT_OPACITY);
  opacity.max = String(MAX_HEAT_OPACITY);
  opacity.step = '0.05';
  opacity.value = String(prefs.opacity);
  opacity.setAttribute('aria-label', t('heatmap_opacity'));
  opacityField.append(opacityLabel, opacity);

  const basemapField = el('label', 'heatmap-toggle');
  const basemap = el('input', 'heatmap-basemap', 'heatmap-basemap');
  basemap.type = 'checkbox';
  basemap.checked = prefs.basemap;
  basemap.setAttribute('aria-label', t('heatmap_basemap'));
  const basemapLabel = el('span', 'heatmap-toggle-label');
  basemapLabel.textContent = t('heatmap_basemap');
  basemapField.append(basemap, basemapLabel);

  controls.append(opacityField, basemapField);
  panel.appendChild(controls);

  const densityHint = el('p', 'heatmap-hint');
  densityHint.textContent = t('heatmap_density');
  panel.appendChild(densityHint);

  const hint = el('p', 'heatmap-hint');
  hint.textContent = t('heatmap_local');
  panel.appendChild(hint);

  const note = el('p', 'heatmap-note', 'heatmap-note');
  note.hidden = true;
  panel.appendChild(note);

  const legend = el('div', 'heatmap-legend');
  const less = el('span', 'heatmap-legend-label');
  less.textContent = t('heatmap_less');
  const ramp = el('span', 'heatmap-ramp');
  ramp.setAttribute('aria-hidden', 'true');
  const more = el('span', 'heatmap-legend-label');
  more.textContent = t('heatmap_more');
  legend.append(less, ramp, more);

  field.append(panel, legend);

  let emptyEl: HTMLElement | null = null;

  function showEmpty(): void {
    if (emptyEl) return;
    emptyEl = el('div', 'heatmap-empty', 'heatmap-empty');
    const emptyIcon = el('span', 'heatmap-empty-icon');
    emptyIcon.setAttribute('aria-hidden', 'true');
    emptyIcon.innerHTML = icon('map', 28);
    const emptyText = el('span', 'heatmap-empty-text');
    emptyText.textContent = t('routes_hint');
    emptyEl.append(emptyIcon, emptyText);
    field.appendChild(emptyEl);
  }

  function hideEmpty(): void {
    if (!emptyEl) return;
    emptyEl.remove();
    emptyEl = null;
  }

  function setCount(n: number): void {
    count.textContent = n === 1 ? t('heatmap_routes_one') : t('heatmap_routes_many', { n });
  }

  function visibleRoutes(): SanitizedRoute[] {
    return prefs.sports.length === 0
      ? routes
      : routes.filter((route) => prefs.sports.includes(route.type));
  }

  function syncChips(): void {
    allChip.setAttribute('aria-pressed', String(prefs.sports.length === 0));
    for (const chip of typeChips) {
      chip.setAttribute('aria-pressed', String(prefs.sports.includes(chip.dataset.sport ?? '')));
    }
  }

  // Recompute the count and heat overlay in place — the map and its viewport survive.
  function applyFilter(): void {
    syncChips();
    const list = visibleRoutes();
    setCount(list.length);
    if (list.length === 0) {
      showEmpty();
      // Bump the token so any in-flight render cannot re-add a stale overlay, and
      // free the empty raster blob (its overlay is being removed below).
      cancelRenderFrames();
      renderToken += 1;
      setRendering(false);
      currentFitBounds = null;
      if (map && overlay) {
        map.removeLayer(overlay);
        overlay = null;
      }
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = null;
      }
      return;
    }
    hideEmpty();
    if (!map) return;
    const filteredBounds = computeHeatBounds(list);
    if (filteredBounds) updateHeat(list, filteredBounds);
  }

  allChip.addEventListener('click', () => {
    prefs.sports = [];
    savePrefs();
    applyFilter();
  });
  for (const chip of typeChips) {
    chip.addEventListener('click', () => {
      const sport = chip.dataset.sport ?? '';
      prefs.sports = prefs.sports.includes(sport)
        ? prefs.sports.filter((entry) => entry !== sport)
        : [...prefs.sports, sport];
      savePrefs();
      applyFilter();
    });
  }

  opacity.addEventListener('input', () => {
    prefs.opacity = clampOpacity(opacity.valueAsNumber);
    applyPrefs();
    overlay?.setOpacity(prefs.opacity);
    savePrefs();
  });
  basemap.addEventListener('change', () => {
    prefs.basemap = basemap.checked;
    applyPrefs();
    savePrefs();
    if (!map || !tileLayer) return;
    if (prefs.basemap) tileLayer.addTo(map);
    else map.removeLayer(tileLayer);
  });
  tab.appendChild(field);
  mapEl = field;
  noteEl = note;
  renderingEl = rendering;
  applyPrefs();

  const initialRoutes = visibleRoutes();
  syncChips();
  setCount(initialRoutes.length);

  if (initialRoutes.length === 0) {
    field.classList.add('is-empty');
    showEmpty();
  }

  if (initialRoutes.length > 0) {
    const bounds = computeHeatBounds(initialRoutes);
    if (bounds) {
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = 0;
        // The node can be detached again before the frame paints (fast tab switches).
        if (!field.isConnected) return;
        initMap(field, initialRoutes, bounds);
      });
    }
  }

  return tab;
}

/**
 * Detaches every live Leaflet object and frees the pending raster work. The saved viewport
 * is intentionally left intact so Task 5 can restore it across tab switches.
 */
export function destroyHeatmap(): void {
  if (pendingFrame) {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = 0;
  }
  // Drop any frames queued for the deferred raster work.
  cancelRenderFrames();
  // Invalidate any in-flight `toBlob` callback so it drops instead of drawing.
  renderToken += 1;

  if (map) {
    map.remove();
    map = null;
  }
  overlay = null;
  tileLayer = null;
  tileErrors = 0;
  noteEl = null;
  renderingEl = null;
  currentFitBounds = null;

  if (blobUrl) {
    URL.revokeObjectURL(blobUrl);
    blobUrl = null;
  }

  mapEl = null;
}
