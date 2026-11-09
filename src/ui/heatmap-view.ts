import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Activity } from '../data/types.ts';
import {
  applyHeatRamp,
  computeHeatBounds,
  HEATMAP_PREFS_KEY,
  heatQuantile,
  HOT_QUANTILE,
  lonLatToWorld,
  MAX_RASTER,
  sanitizeRoutes,
  TILE_ATTRIBUTION,
  TILE_URL,
  type HeatBounds,
  type HeatmapPrefs,
  type SanitizedRoute,
} from '../data/heatmap.ts';
import { t } from '../i18n.ts';
import { icon } from '../icons.ts';

const DEFAULT_PREFS: HeatmapPrefs = { opacity: 0.85, basemap: true, sports: [] };
const MIN_OPACITY = 0.25;
const MAX_OPACITY = 1;
/** Zoomed-out raster scale: 256 px tiles at 2^14 world pixels keeps trails crisp. */
const RASTER_SCALE = 256 * 2 ** 14;
const MIN_RASTER = 512;
/** Smallest usable normalised world span, guarding against a zero-width bounding box. */
const MIN_SPAN = 1e-9;
/** Tile errors before the "basemap unavailable" note is shown (single failed tiles are noise). */
const TILE_ERROR_THRESHOLD = 4;

/** Live map field; Leaflet attaches to this element once it has been laid out. */
let mapEl: HTMLElement | null = null;
let prefs: HeatmapPrefs = { ...DEFAULT_PREFS, sports: [] };
let map: L.Map | null = null;
let tileLayer: L.TileLayer | null = null;
let overlay: L.ImageOverlay | null = null;
let blobUrl: string | null = null;
let noteEl: HTMLElement | null = null;
let pendingFrame = 0;
let renderToken = 0;
let tileErrors = 0;

/**
 * Viewport the user last settled on, reused when the tab is re-opened. Task 5 adds the
 * `shouldRefit` rule and writes this on `moveend`; `destroyHeatmap` deliberately keeps it.
 * Declared here (and only read for now) because the teardown contract must honour it.
 */
// eslint-disable-next-line prefer-const -- reassigned by the Task 5 viewport rule.
let savedView: { center: [number, number]; zoom: number } | null = null;

function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PREFS.opacity;
  return Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, value));
}

/** Read `heatmapPrefs`, falling back to defaults on missing or malformed storage. */
function loadPrefs(): HeatmapPrefs {
  try {
    const raw = localStorage.getItem(HEATMAP_PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS, sports: [] };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_PREFS, sports: [] };
    }
    const obj = parsed as Record<string, unknown>;
    return {
      opacity:
        typeof obj.opacity === 'number'
          ? clampOpacity(obj.opacity)
          : DEFAULT_PREFS.opacity,
      basemap: typeof obj.basemap === 'boolean' ? obj.basemap : DEFAULT_PREFS.basemap,
      sports: Array.isArray(obj.sports)
        ? obj.sports.filter((s): s is string => typeof s === 'string')
        : [],
    };
  } catch {
    return { ...DEFAULT_PREFS, sports: [] };
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
  mapEl.style.setProperty('--heat-opacity', String(prefs.opacity));
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
 * Renders the heat raster for the given routes: white strokes, blurred, then recoloured
 * through the heat ramp. Returns the finished canvas so the caller can turn it into a blob.
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

  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;

  const sctx = source.getContext('2d');
  const octx = out.getContext('2d');
  if (!sctx || !octx) return out;

  const lineWidth = Math.min(14, Math.max(4, Math.min(width, height) / 180));
  sctx.globalAlpha = 0.06;
  sctx.strokeStyle = '#fff';
  sctx.lineWidth = lineWidth;
  sctx.lineCap = 'round';
  sctx.lineJoin = 'round';

  for (const route of routes) {
    if (route.points.length < 2) continue;
    sctx.beginPath();
    const [startX, startY] = projectToCanvas(
      route.points[0][0],
      route.points[0][1],
      nw,
      spanX,
      spanY,
      width,
      height,
    );
    sctx.moveTo(startX, startY);
    for (let i = 1; i < route.points.length; i++) {
      const [x, y] = projectToCanvas(
        route.points[i][0],
        route.points[i][1],
        nw,
        spanX,
        spanY,
        width,
        height,
      );
      sctx.lineTo(x, y);
    }
    sctx.stroke();
  }

  if (typeof octx.filter === 'undefined') {
    octx.globalAlpha = 0.5;
    octx.drawImage(source, 0, 0);
    octx.drawImage(source, -1, 0);
    octx.drawImage(source, 1, 0);
  } else {
    octx.filter = `blur(${Math.max(1, Math.round(lineWidth * 0.8))}px)`;
    octx.drawImage(source, 0, 0);
    octx.filter = 'none';
  }

  // `ImageData.data` is a `Uint8ClampedArray`; copy the alpha channel into a plain
  // `Uint8Array` because `heatQuantile` is typed against the latter.
  const data = octx.getImageData(0, 0, width, height);
  const alpha = new Uint8Array(width * height);
  for (let i = 3, j = 0; i < data.data.length; i += 4, j++) alpha[j] = data.data[i];
  applyHeatRamp(data.data, heatQuantile(alpha, HOT_QUANTILE));
  octx.putImageData(data, 0, 0);

  return out;
}

/** Rasterises `routes` and swaps the image overlay in, ignoring stale renders. */
function updateHeat(routes: SanitizedRoute[], bounds: HeatBounds): void {
  const token = ++renderToken;
  const canvas = drawHeat(routes, bounds);
  const boundsLatLng: L.LatLngBoundsExpression = [
    [bounds.south, bounds.west],
    [bounds.north, bounds.east],
  ];

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    // A newer render (or a teardown) finished first: drop this one and free its blob.
    if (token !== renderToken || !map) {
      URL.revokeObjectURL(url);
      return;
    }
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
  });
}

/** Builds the CARTO tile layer and reveals the offline note after repeated tile errors. */
function buildTiles(): L.TileLayer {
  const layer = L.tileLayer(TILE_URL, {
    subdomains: 'abcd',
    maxZoom: 20,
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
  // Task 5 gates this restore behind `shouldRefit`; until then it always fits fresh bounds.
  if (savedView) {
    map.setView(savedView.center, savedView.zoom);
  } else {
    map.fitBounds(boundsLatLng);
  }

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
    button.addEventListener('click', () => map?.fitBounds(boundsLatLng));
    return button;
  };
  fitControl.addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  const tiles = buildTiles();
  if (prefs.basemap) tiles.addTo(map);

  updateHeat(routes, bounds);
}

export function renderHeatmapTab(acts: Activity[]): HTMLElement {
  const routes = sanitizeRoutes(acts);
  prefs = loadPrefs();

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
  count.textContent =
    routes.length === 1 ? t('heatmap_routes_one') : t('heatmap_routes_many', { n: routes.length });
  head.append(title, count);
  panel.appendChild(head);

  const controls = el('div', 'heatmap-controls');

  const opacityField = el('label', 'heatmap-field');
  const opacityLabel = el('span', 'heatmap-field-label');
  opacityLabel.textContent = t('heatmap_opacity');
  const opacity = el('input', 'heatmap-opacity', 'heatmap-opacity');
  opacity.type = 'range';
  opacity.min = String(MIN_OPACITY);
  opacity.max = String(MAX_OPACITY);
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

  if (routes.length === 0) {
    field.classList.add('is-empty');
    const empty = el('div', 'heatmap-empty', 'heatmap-empty');
    const emptyIcon = el('span', 'heatmap-empty-icon');
    emptyIcon.setAttribute('aria-hidden', 'true');
    emptyIcon.innerHTML = icon('map', 28);
    const emptyText = el('span', 'heatmap-empty-text');
    emptyText.textContent = t('routes_hint');
    empty.append(emptyIcon, emptyText);
    field.appendChild(empty);
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
  applyPrefs();

  if (routes.length > 0) {
    const bounds = computeHeatBounds(routes);
    if (bounds) {
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = 0;
        // The node can be detached again before the frame paints (fast tab switches).
        if (!field.isConnected) return;
        initMap(field, routes, bounds);
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
  // Invalidate any in-flight `toBlob` callback so it revokes its URL instead of drawing.
  renderToken += 1;

  if (map) {
    map.remove();
    map = null;
  }
  overlay = null;
  tileLayer = null;
  tileErrors = 0;
  noteEl = null;

  if (blobUrl) {
    URL.revokeObjectURL(blobUrl);
    blobUrl = null;
  }

  mapEl = null;
}
