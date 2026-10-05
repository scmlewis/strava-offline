import './styles.css';
import { runIngest } from './data/ingestClient';
import {
  saveActivities,
  loadActivities,
  deleteActivity,
  exportBackup,
  importBackup,
  clearActivities,
  clearAllData,
  clearSettings,
  bulkDeleteActivities,
  buildFilteredBundle,
  computeTypeBreakdown,
  formatStorageMeter,
} from './data/db';
import { renderDashboard, setCtx, onCtxChange, type TabId, type DashCtx } from './data/dashboard';
import { loadZones, saveZones, DEFAULT_ZONES, type ZonesConfig } from './data/zones';
import type { Activity, Units, Goals, Preferences } from './data/types';
import { computeEasy } from './data/analyze';
import { t } from './i18n';
import { esc } from './utils';
import { showToast } from './toast';
import { matchesFilters, countActiveFilters, DEFAULT_FILTERS, type Filters } from './ui/store.ts';
import { parseHash, toHash, TABS } from './ui/router.ts';
import { buildNav as buildNavView } from './ui/nav.ts';
import { renderToolbar } from './ui/toolbar.ts';
import {
  applyShellI18n,
  setDropzoneCompact,
  setStatus,
  showProgress,
  hideProgress,
} from './ui/shell.ts';

const dropzone = document.getElementById('dropzone') as HTMLDivElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const pickBtn = document.getElementById('pick-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const dashboard = document.getElementById('dashboard') as HTMLElement;
const nav = document.getElementById('nav') as HTMLElement;
const toolbar = document.getElementById('toolbar') as HTMLElement;

let allActs: Activity[] = [];
let cfg: ZonesConfig = loadZones();
let units: Units = loadUnits();
let goals: Goals = loadGoals();
let prefs: Preferences = loadPrefs();
let theme: 'dark' | 'light' | 'system' = loadTheme();

function loadTheme(): 'dark' | 'light' | 'system' {
  try {
    const raw = localStorage.getItem('theme');
    if (raw === 'light' || raw === 'dark') return raw;
  } catch {
    /* ignore */
  }
  return 'system';
}

function saveTheme(t: 'dark' | 'light' | 'system') {
  theme = t;
  localStorage.setItem('theme', t);
  applyTheme();
}

function applyTheme() {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

applyTheme();

function cycleTheme() {
  const order: Array<'dark' | 'light' | 'system'> = ['dark', 'light', 'system'];
  const next = order[(order.indexOf(theme) + 1) % order.length];
  saveTheme(next);
  showToast(t('theme_changed', { theme: t(`theme_${next}`) }), 'info');
}

let filters: Filters = { ...DEFAULT_FILTERS };
const ctx: DashCtx = { tab: 'overview', sortKey: 'date', sortDir: 'desc', search: '', page: 0 };

// ---- persistence ----
function loadUnits(): Units {
  try {
    const raw = localStorage.getItem('unitPref');
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { dist: 'km', pace: 'min/km' };
}
function saveUnits() {
  localStorage.setItem('unitPref', JSON.stringify(units));
}
function loadGoals(): Goals {
  try {
    const raw = localStorage.getItem('goals');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { weeklyKm: null, easyPct: 80, riegelExp: 1.06, easyZones: 2, ...parsed };
    }
  } catch {
    /* ignore */
  }
  return { weeklyKm: null, easyPct: 80, riegelExp: 1.06, easyZones: 2 };
}
function saveGoals() {
  localStorage.setItem('goals', JSON.stringify(goals));
}
function loadPrefs(): Preferences {
  const def: Preferences = { weekStart: 'sun' };
  try {
    const raw = localStorage.getItem('prefs');
    if (raw) return { ...def, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return def;
}
function savePrefs() {
  localStorage.setItem('prefs', JSON.stringify(prefs));
}

import { icon } from './icons';

function matches(acts: Activity[]): Activity[] {
  const pre = matchesFilters(acts, filters);
  // `intensity` stays HR-histogram-based here (store.ts does NOT evaluate it).
  if (!filters.intensity) return pre;
  const easySet = new Set<string>(); // activity ids classified easy (per current zones)
  for (const a of acts) {
    if (isEasy(a)) easySet.add(a.id);
  }
  return pre.filter((a) => {
    const easy = easySet.has(a.id);
    if (filters.intensity === 'easy' && !easy) return false;
    if (filters.intensity === 'hard' && easy) return false;
    return true;
  });
}

// per-activity easy classification: histogram-based if available, else avg HR proxy
function isEasy(a: Activity): boolean {
  const easy = computeEasy([a], cfg, goals.easyZones);
  return easy.basis === 'histogram' ? easy.easyCount > 0 : false;
}

function refresh() {
  setCtx(cfg, units, goals, prefs);
  renderDashboard(dashboard, matches(allActs), ctx);
  updateMeter();
}

function updateMeter() {
  const matched = matches(allActs);
  const el = toolbar.querySelector('.tb-meter');
  if (el) el.textContent = formatStorageMeter(matched.length, null, computeTypeBreakdown(matched));
  if (navigator.storage?.estimate) {
    navigator.storage
      .estimate()
      .then((est) => {
        const meter = toolbar.querySelector('.tb-meter');
        if (meter && typeof est.usage === 'number') {
          meter.textContent = formatStorageMeter(
            matched.length,
            est.usage,
            computeTypeBreakdown(matched),
          );
        }
      })
      .catch(() => {
        /* keep counts-only meter */
      });
  }
}

// ---- nav (tabs) ----
function buildNav() {
  applyShellI18n();
  buildNavView(nav, ctx.tab, selectTab);
}

function selectTab(next: TabId): void {
  // hashchange event drives the re-render; same-hash clicks re-render directly
  // (setting an identical hash would not fire hashchange).
  if (window.location.hash !== toHash(next)) {
    window.location.hash = toHash(next);
  } else {
    ctx.tab = next;
    buildNav();
    refresh();
  }
}

function syncTabFromHash(): void {
  const tab = parseHash(window.location.hash);
  if (tab !== ctx.tab) {
    ctx.tab = tab;
    buildNav();
    refresh();
  }
}
window.addEventListener('hashchange', syncTabFromHash);

// ---- toolbar (markup lives in ui/toolbar.ts; wiring below stays verbatim) ----
function buildToolbar() {
  const activeCount = countActiveFilters(filters);
  const collapsed = localStorage.getItem('filterCollapsed') === '1';
  const matched = matches(allActs);
  renderToolbar(toolbar, {
    acts: allActs,
    matched,
    filters,
    units,
    prefs,
    theme,
    activeCount,
    collapsed,
  });
  // Topbar overflow: the action buttons keep their ids (handlers + tests depend
  // on them) but live in the topbar menu instead of the toolbar.
  const menuSlot = document.getElementById('topbar-actions');
  const actions = toolbar.querySelector('.tb-actions');
  if (menuSlot && actions) {
    menuSlot.innerHTML = '';
    menuSlot.appendChild(actions);
  }

  updateMeter();

  const bind = (id: string, fn: (v: string) => void) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (!el) return;
    const ev =
      el instanceof HTMLInputElement && el.type === 'number'
        ? 'change'
        : el instanceof HTMLSelectElement
          ? 'change'
          : 'input';
    el.addEventListener(ev, () => fn(el.value));
  };

  const search = document.getElementById('t-search') as HTMLInputElement;
  let tmr: number | undefined;
  search.addEventListener('input', () => {
    window.clearTimeout(tmr);
    tmr = window.setTimeout(() => {
      filters.search = search.value;
      ctx.search = search.value;
      refresh();
    }, 180);
  });
  bind('t-type', (v) => {
    filters.type = v;
    refresh();
  });
  bind('t-range', (v) => {
    filters.range = v;
    refresh();
  });
  bind('t-weekday', (v) => {
    filters.weekday = v;
    refresh();
  });
  bind('t-intensity', (v) => {
    filters.intensity = v;
    refresh();
  });
  bind('t-route', (v) => {
    filters.hasRoute = v === '' ? null : v === 'yes';
    refresh();
  });
  bind('t-minkm', (v) => {
    filters.minKm = Number(v) || 0;
    refresh();
  });
  bind('t-maxkm', (v) => {
    filters.maxKm = Number(v) || 0;
    refresh();
  });
  bind('t-mingain', (v) => {
    filters.minGain = Number(v) || 0;
    refresh();
  });
  bind('t-minpace', (v) => {
    filters.minPace = Number(v) || 0;
    refresh();
  });
  bind('t-maxpace', (v) => {
    filters.maxPace = Number(v) || 0;
    refresh();
  });
  bind('t-from', (v) => {
    filters.from = v;
    refresh();
  });
  bind('t-to', (v) => {
    filters.to = v;
    refresh();
  });
  (document.getElementById('t-unit') as HTMLSelectElement).addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value as 'km' | 'mi';
    units = { dist: v, pace: v === 'mi' ? 'min/mi' : 'min/km' };
    saveUnits();
    refresh();
  });
  (document.getElementById('t-weekstart') as HTMLSelectElement).addEventListener('change', (e) => {
    prefs.weekStart = (e.target as HTMLSelectElement).value as 'sun' | 'mon';
    savePrefs();
    refresh();
  });
  document.getElementById('btn-reset')!.addEventListener('click', resetFilters);
  const toggle = document.getElementById('t-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const body = toolbar.querySelector<HTMLElement>('.tb-body');
      const collapsed = body?.classList.contains('collapsed') ?? false;
      if (body) body.classList.toggle('collapsed', !collapsed);
      localStorage.setItem('filterCollapsed', !collapsed ? '1' : '0');
      const caret = toggle.querySelector('.caret');
      if (caret)
        caret.innerHTML = !collapsed ? icon('chevron-right', 14) : icon('chevron-down', 14);
    });
  }
  const resetHead = document.getElementById('btn-reset-head');
  if (resetHead) resetHead.addEventListener('click', resetFilters);
  const aboutBtn = document.getElementById('btn-about');
  if (aboutBtn) aboutBtn.addEventListener('click', openAbout);
  document.getElementById('btn-backup')!.addEventListener('click', onBackup);
  document.getElementById('btn-restore')!.addEventListener('click', onRestore);
  document.getElementById('btn-clear')!.addEventListener('click', openClearData);
  document.getElementById('btn-bulk-del')!.addEventListener('click', () => {
    const ids = matches(allActs).map((a) => a.id);
    openBulkDelete(ids);
  });
  document.getElementById('btn-export-filtered')!.addEventListener('click', async () => {
    const subset = matches(allActs);
    if (!subset.length) return;
    const bundle = buildFilteredBundle(await exportBackup(), subset);
    const json = JSON.stringify(bundle, null, 2);
    if (!(await confirmLargeExport(json))) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `strava-filtered-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(t('backup_done'), 'success');
  });
  document.getElementById('btn-zones')!.addEventListener('click', openZoneSettings);
  document.getElementById('btn-goals')!.addEventListener('click', openGoals);
  document.getElementById('btn-diag')!.addEventListener('click', onDiagnostics);
  document.getElementById('btn-theme')!.addEventListener('click', cycleTheme);
}

function resetFilters() {
  filters = { ...DEFAULT_FILTERS };
  buildToolbar();
  refresh();
}

// ---- diagnostics (debug parse issues) ----
function onDiagnostics() {
  const withDist = allActs.filter((a) => a.distanceKm != null && a.distanceKm > 0);
  const runs = allActs.filter((a) => /run/i.test(a.type || ''));
  const runsWithDist = runs.filter((a) => a.distanceKm != null && a.distanceKm > 0);
  const sampleRow = allActs[0]
    ? {
        type: allActs[0].type,
        date: allActs[0].date,
        distanceKm: allActs[0].distanceKm,
      }
    : null;
  const firstRuns = runs
    .slice(0, 5)
    .map((a) => ({ type: a.type, date: a.date, distanceKm: a.distanceKm }));
  const diag = {
    totalActivities: allActs.length,
    activitiesWithDistance: withDist.length,
    totalDistanceKm: +withDist.reduce((s, a) => s + (a.distanceKm ?? 0), 0).toFixed(1),
    runActivities: runs.length,
    runActivitiesWithDistance: runsWithDist.length,
    sampleRow,
    firstRuns,
    note: 'If activitiesWithDistance is 0 but your CSV has Distance values, the parser is not reading the Distance column. Paste this JSON back to Hermie.',
  };
  const blob = new Blob([JSON.stringify(diag, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `strava-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(t('diag_done', { total: allActs.length, withDist: withDist.length }), 'info');
}

// ---- backup / restore ----
async function confirmLargeExport(json: string): Promise<boolean> {
  const sizeMB = new Blob([json]).size / (1024 * 1024);
  if (sizeMB > 50) {
    const proceed = window.confirm(
      t('backup_large', { size: sizeMB.toFixed(1) }) ||
        `Backup is ${sizeMB.toFixed(1)} MB. This may take a while to download and restore. Continue?`,
    );
    if (!proceed) return false;
  }
  return true;
}

async function onBackup() {
  const bundle = await exportBackup();
  const json = JSON.stringify(bundle, null, 2);
  if (!(await confirmLargeExport(json))) return;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `strava-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(t('backup_done'), 'success');
}

function onRestore() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json';
  inp.addEventListener('change', async () => {
    const f = inp.files?.[0];
    if (!f) return;
    try {
      const bundle = JSON.parse(await f.text());
      const n = await importBackup(bundle);
      allActs = await loadActivities();
      cfg = loadZones();
      buildToolbar();
      refresh();
      showToast(t('restore_done', { n }), 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // map known validation messages to friendly i18n strings
      const key = msg.includes('unsupported version')
        ? 'restore_bad_version'
        : msg.includes('missing activities') ||
            msg.includes('not a JSON') ||
            msg.includes('missing its id')
          ? 'restore_bad_shape'
          : null;
      showToast(key ? t(key) : t('restore_fail', { e: msg }), 'error');
    }
  });
  inp.click();
}

function resetAllState() {
  allActs = [];
  cfg = { ...DEFAULT_ZONES, zones: DEFAULT_ZONES.zones.map((z) => ({ ...z })) };
  units = { dist: 'km', pace: 'min/km' };
  goals = { weeklyKm: null, easyPct: 80, riegelExp: 1.06, easyZones: 2 };
  prefs = { weekStart: 'sun' };
  buildToolbar();
  setDropzoneCompact(false);
  refresh();
}

// ---- clear data modal ----
function openClearData() {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>${icon('trash', 20)} ${t('clear_title')}</h3>
      <p>${t('clear_confirm', { n: allActs.length })}</p>
      <div class="modal-actions">
        <button id="clear-backup" type="button">${icon('download', 14)} ${t('clear_backup_first')}</button>
        <button id="clear-acts" type="button">${t('reset_activities')}</button>
        <button id="clear-settings" type="button">${t('reset_settings')}</button>
        <button id="clear-go" type="button" class="danger">${t('reset_everything')}</button>
        <button id="clear-cancel" type="button">${t('zones_cancel')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  document.getElementById('clear-cancel')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.getElementById('clear-backup')!.addEventListener('click', async () => {
    await onBackup();
    await clearAllData();
    resetAllState();
    close();
    showToast(t('clear_done'), 'success');
  });
  document.getElementById('clear-acts')!.addEventListener('click', async () => {
    await clearActivities();
    allActs = [];
    buildToolbar();
    setDropzoneCompact(false);
    refresh();
    close();
    showToast(t('clear_done'), 'success');
  });
  document.getElementById('clear-settings')!.addEventListener('click', () => {
    clearSettings();
    cfg = loadZones();
    goals = loadGoals();
    units = loadUnits();
    prefs = loadPrefs();
    buildToolbar();
    refresh();
    close();
    showToast(t('zones_reset_done'), 'success');
  });
  document.getElementById('clear-go')!.addEventListener('click', async () => {
    await clearAllData();
    resetAllState();
    close();
    showToast(t('clear_done'), 'success');
  });
}

function openBulkDelete(ids: string[]) {
  if (!ids.length) return;
  const acts = allActs.filter((a) => ids.includes(a.id));
  const breakdown = computeTypeBreakdown(acts)
    .map((b) => `${esc(b.type)} ${b.count}`)
    .join(' / ');
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>${esc(t('bulk_title'))}</h3>
      <p>${esc(t('bulk_confirm'))}</p>
      <p class="hint">${ids.length} activities · ${breakdown}</p>
      <div class="modal-actions">
        <button id="bulk-backup" type="button">${icon('download', 14)} ${t('clear_backup_first')}</button>
        <button id="bulk-go" type="button" class="danger">${t('bulk_go')}</button>
        <button id="bulk-cancel" type="button">${t('zones_cancel')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  document.getElementById('bulk-cancel')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.getElementById('bulk-backup')!.addEventListener('click', () => onBackup());
  let armed = ids.length <= 100;
  const goBtn = document.getElementById('bulk-go')!;
  goBtn.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      goBtn.textContent = t('bulk_go') + ' (' + ids.length + ')?';
      return;
    }
    try {
      await bulkDeleteActivities(ids);
      allActs = await loadActivities();
      ctx.page = 0;
      buildToolbar();
      refresh();
      close();
      showToast(t('clear_done'), 'success');
    } catch (e) {
      showToast(t('restore_fail', { e: e instanceof Error ? e.message : String(e) }), 'error');
    }
  });
}

// ---- zone settings modal ----
function openZoneSettings() {
  const z = cfg.zones;
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>${t('zones_title')}</h3>
      <label class="zfield">${t('zones_hrmax')}<input id="z-hrmax" type="number" value="${cfg.hrMax}" /></label>
      <label class="zfield">${t('zones_rest')}<input id="z-rest" type="number" value="${cfg.restHr}" /></label>
      <label class="zfield">${t('zones_fthr')}<input id="z-fthr" type="number" value="${cfg.fthr ?? ''}" placeholder="e.g. 180" /></label>
      <p class="det-h">${t('training_model')}</p>
      <label class="zfield">${t('ctl_tau')}<input id="z-ctltau" type="number" min="7" max="90" step="1" value="${cfg.ctlTau}" /></label>
      <label class="zfield">${t('atl_tau')}<input id="z-atltau" type="number" min="3" max="30" step="1" value="${cfg.atlTau}" /></label>
      <label class="zfield">${t('tss_factor')}<input id="z-tssfactor" type="number" min="0.5" max="5" step="0.01" value="${cfg.tssFactor}" /></label>
      <p class="det-h">${t('zone_names_and_bounds')}</p>
      ${z.map((zn, i) => `<div class="zrow"><input id="z-name${i}" type="text" value="${esc(zn.name)}" style="width:100px" /><input id="z-z${i}" type="number" step="0.01" value="${zn.hi}" /></div>`).join('')}
      <div class="modal-actions">
        <button id="z-save" type="button">${t('zones_save')}</button>
        <button id="z-reset" type="button">${t('zones_reset')}</button>
        <button id="z-close" type="button">${t('zones_cancel')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  document.getElementById('z-close')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.getElementById('z-reset')!.addEventListener('click', () => {
    cfg = JSON.parse(JSON.stringify(DEFAULT_ZONES));
    saveZones(cfg);
    close();
    refresh();
    showToast(t('zones_reset_done'), 'success');
  });
  document.getElementById('z-save')!.addEventListener('click', () => {
    const hrMax = Number((document.getElementById('z-hrmax') as HTMLInputElement).value);
    const restHr = Number((document.getElementById('z-rest') as HTMLInputElement).value);
    const fthrRaw = (document.getElementById('z-fthr') as HTMLInputElement).value;
    const fthr = fthrRaw ? Number(fthrRaw) : undefined;
    const ctlTau = Number((document.getElementById('z-ctltau') as HTMLInputElement).value) || 42;
    const atlTau = Number((document.getElementById('z-atltau') as HTMLInputElement).value) || 7;
    const tssFactor =
      Number((document.getElementById('z-tssfactor') as HTMLInputElement).value) || 2.06;
    const zones = cfg.zones.map((zn, i) => ({
      name: (document.getElementById(`z-name${i}`) as HTMLInputElement).value || zn.name,
      lo: zn.lo,
      hi: Math.min(1.01, Number((document.getElementById(`z-z${i}`) as HTMLInputElement).value)),
    }));
    for (let i = 0; i < zones.length; i++) zones[i].lo = i === 0 ? 0 : zones[i - 1].hi;
    cfg = { ...cfg, hrMax, restHr, fthr, ctlTau, atlTau, tssFactor, zones };
    saveZones(cfg);
    setCtx(cfg, units, goals, prefs);
    close();
    refresh();
    showToast(t('zones_saved'), 'success');
  });
}

// ---- goals modal ----
function openGoals() {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>${t('goals_title')}</h3>
      <label class="zfield">${t('goals_weekly')}<input id="g-wk" type="number" min="0" step="1" value="${goals.weeklyKm ?? ''}" placeholder="e.g. 40" /></label>
      <label class="zfield">${t('goals_easy')}<input id="g-easy" type="number" min="0" max="100" step="1" value="${goals.easyPct}" /></label>
      <label class="zfield">${t('easy_zones')}<input id="g-easyzones" type="number" min="1" max="5" step="1" value="${goals.easyZones}" /></label>
      <label class="zfield">${t('riegel_exp')}<input id="g-riegel" type="number" min="0.8" max="1.5" step="0.01" value="${goals.riegelExp}" /></label>
      <div class="modal-actions">
        <button id="g-save" type="button">${t('zones_save')}</button>
        <button id="g-close" type="button">${t('zones_cancel')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  document.getElementById('g-close')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.getElementById('g-save')!.addEventListener('click', () => {
    const wk = (document.getElementById('g-wk') as HTMLInputElement).value;
    goals = {
      weeklyKm: wk ? Number(wk) : null,
      easyPct: Number((document.getElementById('g-easy') as HTMLInputElement).value) || 80,
      riegelExp: Number((document.getElementById('g-riegel') as HTMLInputElement).value) || 1.06,
      easyZones: Number((document.getElementById('g-easyzones') as HTMLInputElement).value) || 2,
    };
    saveGoals();
    close();
    refresh();
    showToast(t('goals_saved'), 'success');
  });
}

// ---- ingest ----
async function handleFiles(files: File[] | FileList) {
  try {
    setStatus(t('st_parsing'), 'info');
    showProgress(0, 1, '');
    const summary = await runIngest(files, (p) => showProgress(p.done, p.total, p.phase));
    hideProgress();
    const acts = summary.activities;
    if (!acts.length) {
      showToast(t('st_no_acts'), 'error');
      return;
    }
    await saveActivities(acts);
    allActs = await loadActivities();
    cfg = loadZones();
    buildToolbar();
    setDropzoneCompact(true);
    refresh();
    if (summary.issues.length) {
      console.warn(
        `Strava Offline: skipped ${summary.issues.length} file(s) during import:`,
        summary.issues,
      );
      showToast(
        t('st_imported_skip', { n: acts.length, skipped: summary.issues.length }),
        'success',
        6000,
      );
    } else {
      showToast(t('st_imported', { n: acts.length }), 'success');
    }
  } catch (e) {
    hideProgress();
    showToast(t('st_import_fail', { e: e instanceof Error ? e.message : String(e) }), 'error');
  }
}

// ---- About modal ----
function openAbout() {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="modal about">
      <h2>${icon('info', 20)} ${t('about_title')}</h2>
      <p>${t('about_p1')}</p>
      <h3>${t('about_how')}</h3>
      <ol>
        <li>${t('about_step1')}</li>
        <li>${t('about_step2')}</li>
        <li>${t('about_step3')}</li>
        <li>${t('about_step4')}</li>
        <li>${t('about_step5')}</li>
      </ol>
      <h3>${t('about_features')}</h3>
      <ul>
        <li>${t('about_f1')}</li>
        <li>${t('about_f2')}</li>
        <li>${t('about_f3')}</li>
        <li>${t('about_f4')}</li>
        <li>${t('about_f5')}</li>
        <li>${t('about_f6')}</li>
      </ul>
      <p class="hint">${t('about_safe')}</p>
      <div class="modal-actions"><button id="about-close" type="button">${t('about_ok')}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  document.getElementById('about-close')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

// ---- drag & drop (compact when data present, expands on any document drag) ----
pickBtn.addEventListener('click', () => fileInput.click());
const pickMini = document.getElementById('pick-btn-mini');
if (pickMini) pickMini.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files) handleFiles(fileInput.files);
  fileInput.value = '';
});
['dragenter', 'dragover'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add('drag');
  }),
);
['dragleave', 'drop'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag');
  }),
);
dropzone.addEventListener('drop', (e) => {
  const dt = (e as DragEvent).dataTransfer;
  if (dt && dt.files.length) handleFiles(dt.files);
});
// expand the (possibly compact) dropzone when a file is dragged anywhere over the window
let docDragDepth = 0;
['dragenter', 'dragover'].forEach((ev) =>
  document.addEventListener(ev, (e) => {
    const de = e as DragEvent;
    if (de.dataTransfer && Array.from(de.dataTransfer.types).includes('Files')) {
      docDragDepth++;
      setDropzoneCompact(false);
      dropzone.classList.add('drag');
    }
  }),
);
['dragleave', 'drop'].forEach((ev) =>
  document.addEventListener(ev, () => {
    docDragDepth = Math.max(0, docDragDepth - 1);
    if (docDragDepth === 0) {
      dropzone.classList.remove('drag');
      if (allActs.length) setDropzoneCompact(true);
    }
  }),
);

onCtxChange(dashboard, refresh);

let lastDeleted: Activity | null = null;
let undoTimer = 0;
async function deleteSingleActivity(id: string) {
  const target = allActs.find((a) => a.id === id);
  if (!target) return;
  openDeleteConfirm(target, async () => {
    lastDeleted = { ...target };
    window.clearTimeout(undoTimer);
    try {
      await deleteActivity(id);
      allActs = await loadActivities();
      if (allActs.length === 0) setDropzoneCompact(false);
      buildToolbar();
      refresh();
      showToast(t('del_undo'), 'info', 8000);
      undoTimer = window.setTimeout(() => {
        lastDeleted = null;
      }, 8000);
    } catch (e) {
      lastDeleted = null;
      showToast(t('restore_fail', { e: e instanceof Error ? e.message : String(e) }), 'error');
    }
  });
}

function openDeleteConfirm(target: Activity, onConfirm: () => void) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>${esc(t('del_activity'))}</h3>
      <p>${esc(t('del_confirm'))}</p>
      <p class="hint">${esc(target.name || '—')} · ${esc(target.date)}</p>
      <div class="modal-actions">
        <button id="del-cancel" type="button">${t('zones_cancel')}</button>
        <button id="del-go" type="button" class="danger">${t('del_go')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  document.getElementById('del-cancel')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.getElementById('del-go')!.addEventListener('click', () => {
    close();
    onConfirm();
  });
  document.getElementById('del-cancel')!.focus();
}

dashboard.addEventListener('delchange', (e) => {
  const id = (e as CustomEvent).detail?.id as string | undefined;
  if (id) deleteSingleActivity(id);
});

// Global error boundary — show uncaught errors in the status bar
window.addEventListener('error', (ev) => {
  const msg = ev.message || 'Unknown error';
  console.error('Uncaught error:', ev.error);
  statusEl.textContent = t('error_generic', { message: msg }) || `Error: ${msg}`;
  statusEl.className = 'status err';
  statusEl.style.display = '';
});

window.addEventListener('unhandledrejection', (ev) => {
  const msg = ev.reason instanceof Error ? ev.reason.message : String(ev.reason);
  console.error('Unhandled rejection:', ev.reason);
  statusEl.textContent = t('error_generic', { message: msg }) || `Error: ${msg}`;
  statusEl.className = 'status err';
  statusEl.style.display = '';
});

// Keyboard shortcuts
document.addEventListener('keydown', (ev) => {
  if (
    ev.target instanceof HTMLInputElement ||
    ev.target instanceof HTMLTextAreaElement ||
    ev.target instanceof HTMLSelectElement
  )
    return;

  if (ev.key === '?') {
    ev.preventDefault();
    openShortcutsOverlay();
    return;
  }

  if (ev.key === '/') {
    ev.preventDefault();
    const searchInput = document.querySelector(
      '.toolbar input[type="search"]',
    ) as HTMLInputElement | null;
    if (searchInput) searchInput.focus();
    return;
  }

  const num = parseInt(ev.key, 10);
  if (num >= 1 && num <= TABS.length && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
    ev.preventDefault();
    ctx.tab = TABS[num - 1];
    ctx.page = 0;
    refresh();
    return;
  }

  if ((ev.key === 'u' || ev.key === 'U') && lastDeleted) {
    const copy = lastDeleted;
    lastDeleted = null;
    window.clearTimeout(undoTimer);
    saveActivities([copy]).then(() => {
      loadActivities().then((acts) => {
        allActs = acts;
        buildToolbar();
        refresh();
        showToast(t('st_imported', { n: 1 }), 'success');
      });
    });
  }
});

function openShortcutsOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:400px">
      <h3>${esc(t('shortcuts_title'))}</h3>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 16px;margin-top:12px;font-size:0.9em">
        <kbd>?</kbd><span>${esc(t('shortcuts_help'))}</span>
        <kbd>1</kbd>-<kbd>${TABS.length}</kbd><span>${esc(t('shortcuts_tabs'))}</span>
        <kbd>/</kbd><span>${esc(t('shortcuts_search'))}</span>
        <kbd>U</kbd><span>${esc(t('del_undo'))}</span>
        <kbd>Esc</kbd><span>${esc(t('shortcuts_close'))}</span>
      </div>
      <button class="btn" style="margin-top:16px" id="close-shortcuts">${esc(t('close'))}</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay || (ev.target as HTMLElement).id === 'close-shortcuts')
      overlay.remove();
  });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', onEsc);
    }
  });
}

// ---- boot ----
ctx.tab = parseHash(window.location.hash);
loadActivities().then((acts) => {
  if (acts.length) {
    allActs = acts;
    buildToolbar();
    setDropzoneCompact(true);
    refresh();
    setStatus(t('st_loaded', { n: acts.length }), 'ok');
  }
});
buildNav();
