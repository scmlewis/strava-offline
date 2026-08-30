import './styles.css';
import { runIngest } from './data/ingestClient';
import { saveActivities, loadActivities, exportBackup, importBackup, clearAllData } from './data/db';
import { renderDashboard, setCtx, onCtxChange, type TabId, type DashCtx } from './data/dashboard';
import { loadZones, saveZones, DEFAULT_ZONES, type ZonesConfig } from './data/zones';
import type { Activity, Units, Goals } from './data/types';
import { computeEasy } from './data/analyze';
import { t } from './i18n';
import { esc } from './utils';

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

interface Filters {
  type: string;
  range: string;
  from: string;
  to: string;
  minKm: number;
  maxKm: number;
  minGain: number;
  weekday: string; // '' = any, 'weekend' | 'weekday' | '0'..'6'
  intensity: string; // '' | 'easy' | 'hard'
  hasRoute: boolean | null; // null = any
  minPace: number; // sec/km, 0 = any
  maxPace: number; // sec/km, 0 = any
  search: string;
}
let filters: Filters = {
  type: '', range: 'all', from: '', to: '', minKm: 0, maxKm: 0, minGain: 0,
  weekday: '', intensity: '', hasRoute: null, minPace: 0, maxPace: 0, search: '',
};
const ctx: DashCtx = { tab: 'overview', sortKey: 'date', sortDir: 'desc', search: '', page: 0 };

// ---- persistence ----
function loadUnits(): Units {
  try {
    const raw = localStorage.getItem('unitPref');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { dist: 'km', pace: 'min/km' };
}
function saveUnits() { localStorage.setItem('unitPref', JSON.stringify(units)); }
function loadGoals(): Goals {
  try {
    const raw = localStorage.getItem('goals');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { weeklyKm: null, easyPct: 80 };
}
function saveGoals() { localStorage.setItem('goals', JSON.stringify(goals)); }

import { icon, type IconName } from './icons';

const TABS: Array<{ id: TabId; label: string; icon: IconName }> = [
  { id: 'overview', label: t('nav_overview'), icon: 'overview' },
  { id: 'volume', label: t('nav_volume'), icon: 'activity' },
  { id: 'load', label: t('nav_load'), icon: 'flame' },
  { id: 'zones', label: t('nav_zones'), icon: 'heart' },
  { id: 'perf', label: t('nav_perf'), icon: 'star' },
  { id: 'log', label: t('nav_log'), icon: 'list' },
];

function setStatus(msg: string, kind: 'ok' | 'err' | 'info' = 'info') {
  statusEl.hidden = false;
  statusEl.className = `status ${kind}`;
  statusEl.textContent = msg;
}

const progressEl = document.getElementById('progress') as HTMLDivElement;
const progressFill = document.getElementById('progress-fill') as HTMLDivElement;
const progressLabel = document.getElementById('progress-label') as HTMLSpanElement;

function showProgress(done: number, total: number, phase: string) {
  progressEl.hidden = false;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  progressFill.style.width = `${pct}%`;
  progressLabel.textContent = total > 0 ? t('st_progress', { done, total }) : t('st_parsing');
  if (phase) progressLabel.textContent += ` · ${phase}`;
}
function hideProgress() {
  progressEl.hidden = true;
  progressFill.style.width = '0%';
}

function matches(acts: Activity[]): Activity[] {
  const now = Date.now();
  const rangeDays: Record<string, number> = { all: Infinity, '90': 90, '180': 180, '365': 365 };
  const days = rangeDays[filters.range] ?? Infinity;
  const q = filters.search.trim().toLowerCase();
  const fromT = filters.from ? new Date(filters.from + 'T00:00:00').getTime() : -Infinity;
  const toT = filters.to ? new Date(filters.to + 'T23:59:59').getTime() : Infinity;
  const easySet = new Set<string>(); // activity ids classified easy (per current zones)
  if (filters.intensity) {
    for (const a of acts) {
      if (isEasy(a)) easySet.add(a.id);
    }
  }
  return acts.filter((a) => {
    if (filters.type && !(a.type || '').toLowerCase().includes(filters.type.toLowerCase())) return false;
    if (days !== Infinity && a.ts && (now - a.ts) / 86400000 > days) return false;
    if (a.ts && a.ts < fromT) return false;
    if (a.ts && a.ts > toT) return false;
    if (filters.minKm > 0 && (a.distanceKm ?? 0) < filters.minKm) return false;
    if (filters.maxKm > 0 && (a.distanceKm ?? 0) > filters.maxKm) return false;
    if (filters.minGain > 0 && (a.elevationGainM ?? 0) < filters.minGain) return false;
    if (filters.hasRoute !== null) {
      const has = !!(a.route && a.route.length > 1);
      if (has !== filters.hasRoute) return false;
    }
    if (filters.weekday) {
      if (!a.ts) return false;
      const dow = new Date(a.ts).getDay(); // 0=Sun..6=Sat
      if (filters.weekday === 'weekend' && dow !== 0 && dow !== 6) return false;
      if (filters.weekday === 'weekday' && (dow === 0 || dow === 6)) return false;
      if (/^[0-6]$/.test(filters.weekday) && String(dow) !== filters.weekday) return false;
    }
    if (filters.intensity) {
      const easy = easySet.has(a.id);
      if (filters.intensity === 'easy' && !easy) return false;
      if (filters.intensity === 'hard' && easy) return false;
    }
    if (filters.minPace > 0 || filters.maxPace > 0) {
      const pace = a.distanceKm && a.movingTimeMin ? (a.movingTimeMin * 60) / a.distanceKm : 0; // sec/km
      if (filters.minPace > 0 && pace < filters.minPace) return false;
      if (filters.maxPace > 0 && pace > filters.maxPace) return false;
    }
    if (q && !`${a.name} ${a.type} ${a.date}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

// per-activity easy classification: histogram-based if available, else avg HR proxy
function isEasy(a: Activity): boolean {
  const easy = computeEasy([a], cfg);
  return easy.basis === 'histogram' ? easy.easyCount > 0 : false;
}

function refresh() {
  setCtx(cfg, units, goals);
  renderDashboard(dashboard, matches(allActs), ctx);
}

// ---- nav (tabs) ----
function applyShellI18n() {
  const set = (id: string, key: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  };
  set('app-title', 'app_title');
  set('app-sub', 'app_sub');
  set('dz-full-1', 'dz_full_1');
  set('dz-full-2', 'dz_full_2');
  const pick = document.getElementById('pick-btn');
  if (pick) pick.textContent = t('choose_file');
  const pickMini = document.getElementById('pick-btn-mini');
  if (pickMini) pickMini.textContent = t('choose_file');
  document.documentElement.lang = 'en';
}

function buildNav() {
  applyShellI18n();
  nav.innerHTML = TABS.map(
    (t) => `<button class="nav-tab${ctx.tab === t.id ? ' active' : ''}" data-tab="${t.id}">
      <span class="nav-ico">${icon(t.icon, 20)}</span><span class="nav-lbl">${t.label}</span>
    </button>`,
  ).join('');
  nav.querySelectorAll<HTMLButtonElement>('.nav-tab').forEach((b) => {
    b.addEventListener('click', () => {
      ctx.tab = b.dataset.tab as TabId;
      buildNav();
      refresh();
    });
  });
}

// ---- toolbar ----
function buildToolbar() {
  const types = [...new Set(allActs.map((a) => a.type).filter(Boolean))];
  const activeCount = countActiveFilters();
  const collapsed = localStorage.getItem('filterCollapsed') === '1';
  toolbar.innerHTML = `
    <div class="tb-head">
      <button id="t-toggle" type="button" class="tb-toggle">${icon('filter')} ${t('filter')} ${activeCount ? `(${activeCount})` : ''} <span class="caret">${collapsed ? icon('chevron-right', 14) : icon('chevron-down', 14)}</span></button>
      ${activeCount ? `<button id="btn-reset-head" type="button" class="tb-reset-mini">${t('reset')}</button>` : ''}
    </div>
    <div class="tb-body${collapsed ? ' collapsed' : ''}">
    <div class="tb-row">
      <input id="t-search" class="tb-input" type="search" placeholder="${t('search_placeholder')}" value="${esc(filters.search)}" />
      <label class="tb-ico" title="${t('type')}">${icon('tag')}<select id="t-type"><option value="">${t('all_types')}</option>${types.map((ty) => `<option ${filters.type === ty ? 'selected' : ''}>${esc(ty)}</option>`).join('')}</select></label>
      <label class="tb-ico" title="${t('time_range')}">${icon('calendar')}<select id="t-range">
        <option value="all">${t('all_time')}</option>
        <option value="90">${t('last_90')}</option>
        <option value="180">${t('last_180')}</option>
        <option value="365">${t('last_365')}</option>
      </select></label>
      <label class="tb-ico" title="${t('weekday')}">${icon('week')}<select id="t-weekday">
        <option value="">${t('weekday_any')}</option>
        <option value="weekday">${t('weekday_weekday')}</option>
        <option value="weekend">${t('weekday_weekend')}</option>
        <option value="6">${t('weekday_sat')}</option>
        <option value="0">${t('weekday_sun')}</option>
        <option value="1">${t('weekday_mon')}</option>
        <option value="2">${t('weekday_tue')}</option>
        <option value="3">${t('weekday_wed')}</option>
        <option value="4">${t('weekday_thu')}</option>
        <option value="5">${t('weekday_fri')}</option>
      </select></label>
      <label class="tb-ico" title="${t('intensity')}">${icon('flame')}(<select id="t-intensity">
        <option value="">${t('intensity_any')}</option>
        <option value="easy">${t('intensity_easy')}</option>
        <option value="hard">${t('intensity_hard')}</option>
      </select>)</label>
      <label class="tb-ico" title="${t('route')}">${icon('map')}<select id="t-route">
        <option value="">${t('route_any')}</option>
        <option value="yes">${t('route_yes')}</option>
        <option value="no">${t('route_no')}</option>
      </select></label>
    </div>
    <div class="tb-row">
      <label class="tb-inline">${t('distance')} <input id="t-minkm" type="number" min="0" step="1" value="${filters.minKm || ''}" placeholder="${t('min')}" />–<input id="t-maxkm" type="number" min="0" step="1" value="${filters.maxKm || ''}" placeholder="${t('max')}" /> km</label>
      <label class="tb-inline">${t('elev_gain')} <input id="t-mingain" type="number" min="0" step="10" value="${filters.minGain || ''}" placeholder="m" /> m</label>
      <label class="tb-inline">${t('pace')} <input id="t-minpace" type="number" min="0" step="5" value="${filters.minPace || ''}" placeholder="${t('slower')}" />–<input id="t-maxpace" type="number" min="0" step="5" value="${filters.maxPace || ''}" placeholder="${t('faster')}" /> ${t('sec_per_km')}</label>
      <label class="tb-ico" title="${t('from')}"><span class="dot dot-green"></span><input id="t-from" type="date" value="${filters.from}" /></label>
      <label class="tb-ico" title="${t('to')}"><span class="dot dot-red"></span><input id="t-to" type="date" value="${filters.to}" /></label>
      <label class="tb-ico" title="${t('unit')}">${icon('ruler')}<select id="t-unit">
        <option value="km" ${units.dist === 'km' ? 'selected' : ''}>km</option>
        <option value="mi" ${units.dist === 'mi' ? 'selected' : ''}>mi</option>
      </select></label>
      <button id="btn-reset" type="button" class="act-reset"${activeCount ? '' : ' disabled'}>${icon('refresh')} ${t('reset')} (${activeCount})</button>
    </div>
    </div>
    <div class="tb-actions">
      <button id="btn-backup" type="button" class="ico-btn" title="${t('backup')}">${icon('download')}</button>
      <button id="btn-restore" type="button" class="ico-btn" title="${t('restore')}">${icon('upload')}</button>
      <button id="btn-clear" type="button" class="ico-btn" title="${t('clear_data')}">${icon('trash')}</button>
      <button id="btn-zones" type="button" class="ico-btn" title="${t('zones')}">${icon('heart')}</button>
      <button id="btn-goals" type="button" class="ico-btn" title="${t('goals')}">${icon('target')}</button>
      <button id="btn-diag" type="button" class="ico-btn" title="${t('diagnostics')}">${icon('list')}</button>
      <button id="btn-about" type="button" class="ico-btn" title="${t('about')}">${icon('info')}</button>
    </div>`;

  const bind = (id: string, fn: (v: string) => void) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (!el) return;
    const ev = el instanceof HTMLInputElement && el.type === 'number' ? 'change' : el instanceof HTMLSelectElement ? 'change' : 'input';
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
  bind('t-type', (v) => { filters.type = v; refresh(); });
  bind('t-range', (v) => { filters.range = v; refresh(); });
  bind('t-weekday', (v) => { filters.weekday = v; refresh(); });
  bind('t-intensity', (v) => { filters.intensity = v; refresh(); });
  bind('t-route', (v) => { filters.hasRoute = v === '' ? null : v === 'yes'; refresh(); });
  bind('t-minkm', (v) => { filters.minKm = Number(v) || 0; refresh(); });
  bind('t-maxkm', (v) => { filters.maxKm = Number(v) || 0; refresh(); });
  bind('t-mingain', (v) => { filters.minGain = Number(v) || 0; refresh(); });
  bind('t-minpace', (v) => { filters.minPace = Number(v) || 0; refresh(); });
  bind('t-maxpace', (v) => { filters.maxPace = Number(v) || 0; refresh(); });
  bind('t-from', (v) => { filters.from = v; refresh(); });
  bind('t-to', (v) => { filters.to = v; refresh(); });
  (document.getElementById('t-unit') as HTMLSelectElement).addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value as 'km' | 'mi';
    units = { dist: v, pace: v === 'mi' ? 'min/mi' : 'min/km' };
    saveUnits();
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
      if (caret) caret.innerHTML = !collapsed ? icon('chevron-right', 14) : icon('chevron-down', 14);
    });
  }
  const resetHead = document.getElementById('btn-reset-head');
  if (resetHead) resetHead.addEventListener('click', resetFilters);
  const aboutBtn = document.getElementById('btn-about');
  if (aboutBtn) aboutBtn.addEventListener('click', openAbout);
  document.getElementById('btn-backup')!.addEventListener('click', onBackup);
  document.getElementById('btn-restore')!.addEventListener('click', onRestore);
  document.getElementById('btn-clear')!.addEventListener('click', openClearData);
  document.getElementById('btn-zones')!.addEventListener('click', openZoneSettings);
  document.getElementById('btn-goals')!.addEventListener('click', openGoals);
  document.getElementById('btn-diag')!.addEventListener('click', onDiagnostics);
}

function resetFilters() {
  filters = { type: '', range: 'all', from: '', to: '', minKm: 0, maxKm: 0, minGain: 0, weekday: '', intensity: '', hasRoute: null, minPace: 0, maxPace: 0, search: '' };
  buildToolbar();
  refresh();
}

function countActiveFilters(): number {
  let n = 0;
  if (filters.type) n++;
  if (filters.range !== 'all') n++;
  if (filters.from) n++;
  if (filters.to) n++;
  if (filters.minKm) n++;
  if (filters.maxKm) n++;
  if (filters.minGain) n++;
  if (filters.weekday) n++;
  if (filters.intensity) n++;
  if (filters.hasRoute !== null) n++;
  if (filters.minPace) n++;
  if (filters.maxPace) n++;
  if (filters.search) n++;
  return n;
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
  const firstRuns = runs.slice(0, 5).map((a) => ({ type: a.type, date: a.date, distanceKm: a.distanceKm }));
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
  setStatus(t('diag_done', { total: allActs.length, withDist: withDist.length }), 'info');
}

// ---- backup / restore ----
async function onBackup() {
  const bundle = await exportBackup();
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `strava-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus(t('backup_done'), 'ok');
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
      setStatus(t('restore_done', { n }), 'ok');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // map known validation messages to friendly i18n strings
      const key =
        msg.includes('unsupported version') ? 'restore_bad_version'
        : msg.includes('missing activities') || msg.includes('not a JSON') || msg.includes('missing its id') ? 'restore_bad_shape'
        : null;
      setStatus(key ? t(key) : t('restore_fail', { e: msg }), 'err');
    }
  });
  inp.click();
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
        <button id="clear-go" type="button" class="danger">${t('clear_go')}</button>
        <button id="clear-cancel" type="button">${t('zones_cancel')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  document.getElementById('clear-cancel')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.getElementById('clear-backup')!.addEventListener('click', async () => {
    await onBackup();
    await clearAllData();
    allActs = [];
    cfg = { ...DEFAULT_ZONES, zones: DEFAULT_ZONES.zones.map((z) => ({ ...z })) };
    units = { dist: 'km', pace: 'min/km' };
    goals = { weeklyKm: null, easyPct: 80 };
    buildToolbar();
    setDropzoneCompact(false);
    refresh();
    close();
    setStatus(t('clear_done'), 'ok');
  });
  document.getElementById('clear-go')!.addEventListener('click', async () => {
    await clearAllData();
    allActs = [];
    cfg = { ...DEFAULT_ZONES, zones: DEFAULT_ZONES.zones.map((z) => ({ ...z })) };
    units = { dist: 'km', pace: 'min/km' };
    goals = { weeklyKm: null, easyPct: 80 };
    buildToolbar();
    setDropzoneCompact(false);
    refresh();
    close();
    setStatus(t('clear_done'), 'ok');
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
      <p class="hint">${t('zones_hint')}</p>
      ${z.map((zn, i) => `<div class="zrow"><span>${esc(zn.name)}</span><input id="z-z${i}" type="number" step="0.01" value="${zn.hi}" /></div>`).join('')}
      <div class="modal-actions">
        <button id="z-save" type="button">${t('zones_save')}</button>
        <button id="z-reset" type="button">${t('zones_reset')}</button>
        <button id="z-close" type="button">${t('zones_cancel')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  document.getElementById('z-close')!.addEventListener('click', close);
  document.getElementById('z-reset')!.addEventListener('click', () => {
    cfg = JSON.parse(JSON.stringify(DEFAULT_ZONES));
    saveZones(cfg);
    overlay.remove();
    refresh();
    setStatus(t('zones_reset_done'), 'ok');
  });
  document.getElementById('z-save')!.addEventListener('click', () => {
    const hrMax = Number((document.getElementById('z-hrmax') as HTMLInputElement).value);
    const restHr = Number((document.getElementById('z-rest') as HTMLInputElement).value);
    const fthrRaw = (document.getElementById('z-fthr') as HTMLInputElement).value;
    const fthr = fthrRaw ? Number(fthrRaw) : undefined;
    const zones = cfg.zones.map((zn, i) => ({
      ...zn,
      hi: Math.min(1.01, Number((document.getElementById(`z-z${i}`) as HTMLInputElement).value)),
    }));
    for (let i = 0; i < zones.length; i++) zones[i].lo = i === 0 ? 0 : zones[i - 1].hi;
    cfg = { ...cfg, hrMax, restHr, fthr, zones };
    saveZones(cfg);
    setCtx(cfg, units, goals);
    overlay.remove();
    refresh();
    setStatus(t('zones_saved'), 'ok');
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
      <div class="modal-actions">
        <button id="g-save" type="button">${t('zones_save')}</button>
        <button id="g-close" type="button">${t('zones_cancel')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  document.getElementById('g-close')!.addEventListener('click', close);
  document.getElementById('g-save')!.addEventListener('click', () => {
    const wk = (document.getElementById('g-wk') as HTMLInputElement).value;
    goals = {
      weeklyKm: wk ? Number(wk) : null,
      easyPct: Number((document.getElementById('g-easy') as HTMLInputElement).value) || 80,
    };
    saveGoals();
    overlay.remove();
    refresh();
    setStatus(t('goals_saved'), 'ok');
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
      setStatus(t('st_no_acts'), 'err');
      return;
    }
    await saveActivities(acts);
    allActs = await loadActivities();
    cfg = loadZones();
    buildToolbar();
    setDropzoneCompact(true);
    refresh();
    if (summary.issues.length) {
      console.warn(`Strava Offline: skipped ${summary.issues.length} file(s) during import:`, summary.issues);
      setStatus(t('st_imported_skip', { n: acts.length, skipped: summary.issues.length }), 'ok');
    } else {
      setStatus(t('st_imported', { n: acts.length }), 'ok');
    }
  } catch (e) {
    hideProgress();
    setStatus(t('st_import_fail', { e: e instanceof Error ? e.message : String(e) }), 'err');
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
  document.getElementById('about-close')!.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ---- drag & drop (compact when data present, expands on any document drag) ----
function setDropzoneCompact(compact: boolean) {
  dropzone.classList.toggle('compact', compact);
  dropzone.querySelector('.dz-full')?.classList.toggle('hidden', compact);
  dropzone.querySelector('.dz-mini')?.classList.toggle('hidden', !compact);
}
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

// ---- boot ----
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
