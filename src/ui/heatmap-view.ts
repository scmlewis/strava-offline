import type { Activity } from '../data/types.ts';
import { HEATMAP_PREFS_KEY, sanitizeRoutes, type HeatmapPrefs } from '../data/heatmap.ts';
import { t } from '../i18n.ts';
import { icon } from '../icons.ts';

const DEFAULT_PREFS: HeatmapPrefs = { opacity: 0.85, basemap: true, sports: [] };
const MIN_OPACITY = 0.25;
const MAX_OPACITY = 1;

/** Live map field; Task 4 attaches the Leaflet map to this element. */
let mapEl: HTMLElement | null = null;
let prefs: HeatmapPrefs = { ...DEFAULT_PREFS, sports: [] };

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

export function renderHeatmapTab(acts: Activity[]): HTMLElement {
  const routes = sanitizeRoutes(acts);
  prefs = loadPrefs();

  const tab = el('div', 'heatmap-tab', 'heatmap-tab');

  const map = el('div', 'heatmap-map', 'heatmap-map');
  map.setAttribute('role', 'region');
  map.setAttribute('aria-label', t('heatmap_region'));

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

  map.append(panel, legend);

  if (routes.length === 0) {
    map.classList.add('is-empty');
    const empty = el('div', 'heatmap-empty', 'heatmap-empty');
    const emptyIcon = el('span', 'heatmap-empty-icon');
    emptyIcon.setAttribute('aria-hidden', 'true');
    emptyIcon.innerHTML = icon('map', 28);
    const emptyText = el('span', 'heatmap-empty-text');
    emptyText.textContent = t('routes_hint');
    empty.append(emptyIcon, emptyText);
    map.appendChild(empty);
  }

  opacity.addEventListener('input', () => {
    prefs.opacity = clampOpacity(opacity.valueAsNumber);
    applyPrefs();
    savePrefs();
  });
  basemap.addEventListener('change', () => {
    prefs.basemap = basemap.checked;
    applyPrefs();
    savePrefs();
  });

  tab.appendChild(map);
  mapEl = map;
  applyPrefs();

  return tab;
}

/** Detach module state. The map itself (Task 4) will be torn down here. */
export function destroyHeatmap(): void {
  mapEl = null;
}
