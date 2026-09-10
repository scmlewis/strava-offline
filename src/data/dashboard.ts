import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { Activity, Units, Goals, Preferences } from './types';
import { loadZones, zoneBpm, zoneForHr, type ZonesConfig } from './zones';
import { icon } from '../icons';
import { t } from '../i18n';
import {
  computeSummary,
  computeWeeklyVolume,
  computeDailyVolume,
  computeEasy,
  computeZoneDistribution,
  computePaceTrend,
  computeLoad,
  computePRs,
  computeRiegel,
  computeVO2max,
  computeClimbScore,
  computeStreaks,
  activityTSS,
  secondsInZone,
  histogramSeconds,
} from './analyze';

let plots: uPlot[] = [];
let currentCfg: ZonesConfig = loadZones();
let units: Units = { dist: 'km', pace: 'min/km' };
let goals: Goals = { weeklyKm: null, easyPct: 80, riegelExp: 1.06, easyZones: 2 };
let prefs: Preferences = { weekStart: 'sun' };
let lastActs: Activity[] = [];

// ResizeObserver keeps each uPlot sized to its (responsive) container column,
// so charts never overflow a narrow grid cell or stay too wide on resize.
const chartRO = new ResizeObserver((entries) => {
  for (const e of entries) {
    const host = e.target as HTMLElement;
    const plot = plots.find(
      (p) =>
        p.root?.parentElement === host || (p as unknown as { _host?: HTMLElement })._host === host,
    );
    if (!plot) continue;
    const w = Math.max(220, Math.floor(host.clientWidth));
    if (w > 0 && w !== plot.width) plot.setSize({ width: w, height: plot.height });
  }
});
function makeChart(host: HTMLElement, opts: uPlot.Options, data: uPlot.AlignedData): uPlot {
  const plot = new uPlot(opts, data, host);
  (plot as unknown as { _host?: HTMLElement })._host = host;
  chartRO.observe(host);
  plots.push(plot);
  // initial correct width once laid out
  requestAnimationFrame(() => {
    const w = Math.max(220, Math.floor(host.clientWidth));
    if (w > 0 && w !== plot.width) plot.setSize({ width: w, height: plot.height });
  });
  return plot;
}
const ZONE_COLORS = ['#7a8299', '#34d399', '#fbbf24', '#fb923c', '#f87171'];
export type TabId = 'overview' | 'volume' | 'load' | 'zones' | 'perf' | 'log';

export interface DashCtx {
  tab: TabId;
  sortKey: string;
  sortDir: 'asc' | 'desc';
  search: string;
  page: number;
}

import { esc, toLocalDate } from '../utils';

// ---- unit-aware formatters ----
const KM_PER_MI = 1.60934;
function toDist(km: number | null): number | null {
  if (km == null) return null;
  return units.dist === 'mi' ? km / KM_PER_MI : km;
}
function fmtDistance(km: number | null): string {
  const v = toDist(km);
  if (v == null) return '—';
  const unit = units.dist === 'mi' ? ' mi' : ' km';
  return `${v.toFixed(1)}${unit}`;
}
function fmtPaceMin(sec: number | null): string {
  if (sec == null) return '—';
  const s = units.pace === 'min/mi' ? sec * KM_PER_MI : sec;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}
function fmtHours(h: number): string {
  const totalMin = Math.round(h * 60);
  if (totalMin < 60) return `${totalMin} min`;
  const mins = totalMin % 60;
  const totalH = Math.floor(totalMin / 60);
  const hours = totalH % 24;
  const totalDays = Math.floor(totalH / 24);
  const days = totalDays % 7;
  const weeks = Math.floor(totalDays / 7);
  // Show the two largest non-zero units (e.g. "3d 4h", "1w 2d", "5h 30m").
  const parts: string[] = [];
  if (weeks) parts.push(`${weeks}w`);
  if (days) parts.push(`${days}d`);
  if (hours && parts.length < 2) parts.push(`${hours}h`);
  if (mins && parts.length < 2) parts.push(`${mins}m`);
  return parts.join(' ');
}
function fmtElev(m: number | null): string {
  if (m == null) return '—';
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}
function fmtTSS(tss: number | null): string {
  return tss == null ? '—' : tss.toFixed(0);
}

// ---- shared building blocks ----
function card(
  label: string,
  value: string,
  sub?: string,
  accent?: string,
  small?: boolean,
): string {
  const style = accent ? ` style="--card-accent:${accent}"` : '';
  return `<div class="card${small ? ' card-sm' : ''}"${style}>
    <div class="card-label">${label}</div>
    <div class="card-value">${value}</div>
    ${sub ? `<div class="card-sub">${sub}</div>` : ''}
  </div>`;
}

function plotOpts(series: uPlot.Series[], height = 220, yValues?: number[]): uPlot.Options {
  // auto y-range with padding so lines never clip the plot edges.
  // Floor at 0 for non-negative metrics (volume/load) and enforce a minimum
  // span so sparse / all-zero data doesn't collapse to a distorted tiny axis.
  let yScale: uPlot.Scale | undefined;
  if (yValues && yValues.length) {
    const lo = Math.min(...yValues);
    const hi = Math.max(...yValues);
    const dataLo = Math.min(0, lo); // never a negative floor for distance/load
    const dataHi = hi <= 0 ? Math.max(hi, 10) : hi; // all-zero case → show 0–10
    const span = dataHi - dataLo;
    const pad = span * 0.08 || Math.max(2, dataHi * 0.1);
    const minSpan = Math.max(10, dataHi * 0.25); // keep axis readable when flat
    let top = dataHi + pad;
    if (top - dataLo < minSpan) top = dataLo + minSpan;
    yScale = { range: [Math.floor(dataLo), Math.ceil(top)] };
  }
  return {
    width: 320,
    height,
    scales: { x: { time: true }, ...(yScale ? { y: yScale } : {}) },
    series,
    axes: [
      {
        stroke: '#9aa0c0',
        grid: { stroke: 'rgba(255,255,255,0.06)', width: 1 },
        ticks: { stroke: 'rgba(255,255,255,0.08)' },
      },
      {
        stroke: '#9aa0c0',
        grid: { stroke: 'rgba(255,255,255,0.06)', width: 1 },
        ticks: { stroke: 'rgba(255,255,255,0.08)' },
      },
    ],
    legend: { show: false },
    cursor: {
      drag: { x: false, y: false },
      focus: { prox: 20 },
    },
  };
}

function section(title: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'chart-wrap';
  const h = document.createElement('h3');
  h.textContent = title;
  el.appendChild(h);
  return el;
}

function wrapPair(a: HTMLElement | null, b: HTMLElement | null): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'grid-2';
  if (a) wrap.appendChild(a);
  if (b) wrap.appendChild(b);
  return wrap;
}

// ---- per-tab renderers ----
function renderOverview(acts: Activity[]): HTMLElement {
  const frag = document.createElement('div');
  frag.className = 'stack';
  frag.appendChild(renderCards(acts));
  frag.appendChild(renderHeatmap(acts));
  frag.appendChild(renderStreakBar(acts));

  // goals progress
  if (goals.weeklyKm != null) {
    const vol = computeWeeklyVolume(acts);
    const last = vol[vol.length - 1];
    const lastWeekKm = last ? last.distanceKm : 0;
    const pct = Math.min(100, (lastWeekKm / goals.weeklyKm) * 100);
    const goalBox = document.createElement('div');
    goalBox.className = 'chart-wrap goal-box';
    goalBox.innerHTML = `<h3>${t('weekly_goal')}</h3>
      <div class="goal-row">
        <span>${t('weekly_distance')}</span>
        <span class="goal-num">${lastWeekKm.toFixed(1)} / ${goals.weeklyKm} km</span>
      </div>
      <div class="goal-track"><div class="goal-fill" style="width:${pct.toFixed(0)}%"></div></div>`;
    frag.appendChild(goalBox);
  }

  frag.appendChild(wrapPair(renderWeekly(acts), renderLoad(acts)));
  return frag;
}

function renderCards(acts: Activity[]): HTMLElement {
  const s = computeSummary(acts);
  const easy = computeEasy(acts, currentCfg, goals.easyZones);
  const load = computeLoad(acts, currentCfg);
  const tsb = load.length ? load[load.length - 1].tsb : 0;
  const ctl = load.length ? load[load.length - 1].ctl : 0;
  const cards = [
    card(t('card_activities'), String(s.count), undefined, '#34d399'),
    card(
      t('card_total_dist'),
      fmtDistance(s.totalDistanceKm),
      s.avgDistanceKm ? `${t('card_avg')} ${fmtDistance(s.avgDistanceKm)}` : '',
      '#34d399',
    ),
    card(t('card_moving_time'), fmtHours(s.totalMovingHours), undefined, '#a78bfa', true),
    card(
      t('card_total_elev'),
      s.totalElevM ? fmtElev(s.totalElevM) : '—',
      undefined,
      '#fbbf24',
      true,
    ),
  ];
  if (easy.pct != null) {
    const ok = easy.pct >= goals.easyPct * 0.9;
    const accent = ok ? '#34d399' : '#fbbf24';
    cards.push(
      card(
        t('card_easy_pct'),
        `${easy.pct.toFixed(0)}%`,
        `${ok ? t('goal_met') : t('goal_unmet') + ' ' + goals.easyPct + '%'} · ${easy.basis === 'histogram' ? t('basis_histogram') : t('basis_avg')}`,
        accent,
      ),
    );
  }
  if (load.length) {
    const formLabel =
      tsb > 5 ? t('form_fresh') : tsb < -10 ? t('form_fatigued') : t('form_optimal');
    const accent = tsb > 5 ? '#a78bfa' : tsb < -10 ? '#f87171' : '#34d399';
    cards.push(
      card(
        t('card_form'),
        tsb.toFixed(0),
        `${t('card_ctl')} ${ctl.toFixed(0)} · ${formLabel}`,
        accent,
      ),
    );
  }
  if (s.firstDate && s.lastDate) {
    const fmtShort = (d: string) => {
      const dt = new Date(d + 'T00:00:00');
      return `${dt.toLocaleString('en', { month: 'short' })} ${dt.getFullYear()}`;
    };
    cards.push(
      card(
        t('card_date_range'),
        `${fmtShort(s.firstDate)} → ${fmtShort(s.lastDate)}`,
        undefined,
        '#9aa0c0',
      ),
    );
  }
  const wrap = document.createElement('div');
  wrap.className = 'cards';
  wrap.innerHTML = cards.join('');
  return wrap;
}

function renderHeatmap(acts: Activity[]): HTMLElement {
  const daily = computeDailyVolume(acts);
  const el = section(t('training_calendar'));
  if (daily.length === 0) {
    el.innerHTML += `<p class="hint">${t('import_to_show')}</p>`;
    return el;
  }
  const map = new Map(daily.map((d) => [d.date, d.distanceKm]));
  const start = new Date(daily[0].date + 'T00:00:00');
  const end = new Date(daily[daily.length - 1].date + 'T00:00:00');
  const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const firstDow = prefs.weekStart === 'mon' ? (start.getDay() + 6) % 7 : start.getDay();
  const cellCount = firstDow + totalDays;
  const weekCols = Math.ceil(cellCount / 7);

  // Quantile-based levels so skewed distance distributions still show contrast.
  const kms = daily.map((d) => d.distanceKm).sort((a, b) => a - b);
  const q = (p: number) => kms[Math.min(kms.length - 1, Math.floor(p * kms.length))] || 0;
  const thresholds = [q(0.5), q(0.8), q(0.92), q(0.98)];
  const levelFor = (km: number): number => {
    if (km <= 0) return 0;
    if (km >= thresholds[3]) return 4;
    if (km >= thresholds[2]) return 3;
    if (km >= thresholds[1]) return 2;
    if (km >= thresholds[0]) return 1;
    return 1;
  };

  const grid = document.createElement('div');
  grid.className = 'heatmap';
  const days: HTMLElement[] = [];
  for (let i = 0; i < firstDow; i++) {
    const c = document.createElement('div');
    c.className = 'hm-cell empty';
    days.push(c);
  }
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const key = toLocalDate(t);
    const km = map.get(key) || 0;
    const lvl = levelFor(km);
    const c = document.createElement('div');
    c.className = `hm-cell lvl-${lvl}`;
    c.title = `${key} · ${km.toFixed(1)} km`;
    days.push(c);
  }
  days.forEach((c) => grid.appendChild(c));

  // Month axis via absolute px offset (column width 15px + 3px gap = 18px stride)
  const STRIDE = 18;
  const months: Array<{ left: number; label: string }> = [];
  let lastMonth = -1;
  for (let w = 0; w < weekCols; w++) {
    const dayIdx = w * 7 - firstDow;
    const dt = new Date(start.getTime() + dayIdx * 86400000);
    if (dt < start) continue;
    const m = dt.getMonth();
    if (m !== lastMonth) {
      months.push({
        left: w * STRIDE,
        label: `${dt.getFullYear()} ${dt.toLocaleString('en', { month: 'short' })}`,
      });
      lastMonth = m;
    }
  }
  const axis = document.createElement('div');
  axis.className = 'hm-axis';
  axis.style.width = `${weekCols * STRIDE}px`;
  axis.innerHTML = months
    .map((m) => `<span class="hm-month" style="left:${m.left}px">${m.label}</span>`)
    .join('');

  const wrap = document.createElement('div');
  wrap.className = 'hm-wrap';
  wrap.appendChild(axis);
  wrap.appendChild(grid);
  el.appendChild(wrap);
  el.innerHTML += `<div class="hm-legend">
      <span>${t('hm_less')}</span>
      <span class="hm-cell lvl-0"></span><span class="hm-cell lvl-1"></span><span class="hm-cell lvl-2"></span><span class="hm-cell lvl-3"></span><span class="hm-cell lvl-4"></span>
      <span>${t('hm_more')}</span>
      <span class="hm-info" title="${esc(t('hm_hint'))}">${icon('info', 14)}</span>
    </div>`;
  return el;
}

function renderWeekly(acts: Activity[]): HTMLElement {
  const vol = computeWeeklyVolume(acts);
  const xs = vol.map((w) => new Date(w.week + 'T00:00:00Z').getTime());
  const ys = vol.map((w) => +w.distanceKm.toFixed(1));
  const el = section(t('weekly_volume', { n: vol.length, unit: units.dist }));
  const host = document.createElement('div');
  el.appendChild(host);
  const opts = plotOpts(
    [{}, { label: 'km', stroke: '#34d399', width: 2, fill: 'rgba(52,211,153,0.12)' }],
    210,
    ys,
  );
  // x-axis ticks show actual ISO week numbers
  (opts.axes![0] as uPlot.Axis).values = (_u, ts) =>
    ts.map((t) => {
      const d = new Date(t);
      const onejan = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.ceil(
        ((d.getTime() - onejan.getTime()) / 86400000 + onejan.getUTCDay() + 1) / 7,
      );
      return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    });
  makeChart(host, opts, [xs, ys]);
  return el;
}

function renderLoad(acts: Activity[]): HTMLElement | null {
  const load = computeLoad(acts, currentCfg);
  if (load.length < 2) return null;
  const xs = load.map((l) => new Date(l.date + 'T00:00:00Z').getTime());
  const ctl = load.map((l) => +l.ctl.toFixed(1));
  const atl = load.map((l) => +l.atl.toFixed(1));
  const tsb = load.map((l) => +l.tsb.toFixed(1));
  const el = section(t('training_load'));
  const host = document.createElement('div');
  el.appendChild(host);
  const allY = [...ctl, ...atl, ...tsb];
  makeChart(
    host,
    plotOpts(
      [
        {},
        { label: 'CTL', stroke: '#34d399', width: 2 },
        { label: 'ATL', stroke: '#fb923c', width: 2 },
        { label: 'TSB', stroke: '#a78bfa', width: 1.5, fill: 'rgba(167,139,250,0.15)' },
      ],
      230,
      allY,
    ),
    [xs, ctl, atl, tsb],
  );
  return el;
}

function renderPace(acts: Activity[]): HTMLElement | null {
  const pts = computePaceTrend(acts);
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p.ts);
  const ys = pts.map((p) => +(p.paceMinPerKm ?? 0));
  const el = section(t('pace_trend', { unit: units.pace }));
  const host = document.createElement('div');
  el.appendChild(host);
  makeChart(
    host,
    plotOpts([{ label: 'date' }, { label: 'pace', stroke: '#fbbf24', width: 2 }], 210, ys),
    [xs, ys],
  );
  return el;
}

function renderZones(acts: Activity[]): HTMLElement {
  const dist = computeZoneDistribution(acts, currentCfg);
  const el = section(dist.basis === 'histogram' ? t('zones_by_time') : t('zones_by_activity'));
  const bar = document.createElement('div');
  bar.className = 'zone-bars';
  const items: Array<[number, number]> = [];
  if (dist.basis === 'histogram') {
    const total = Object.values(dist.byTime).reduce((s, v) => s + v, 0);
    for (let z = 1; z <= 5; z++) items.push([z, total ? ((dist.byTime[z] || 0) / total) * 100 : 0]);
  } else {
    const total = Object.values(dist.byActivity).reduce((s, v) => s + v, 0);
    for (let z = 1; z <= 5; z++)
      items.push([z, total ? ((dist.byActivity[z] || 0) / total) * 100 : 0]);
  }
  for (const [z, pct] of items) {
    const cfg = currentCfg.zones[z - 1];
    const [lo, hi] = zoneBpm(cfg, currentCfg);
    const row = document.createElement('div');
    row.className = 'zone-row';
    row.innerHTML = `
      <span class="zone-name">${esc(cfg.name)}</span>
      <span class="zone-bpm">${lo}–${hi}</span>
      <div class="zone-track"><div class="zone-fill" style="width:${pct.toFixed(1)}%;background:${ZONE_COLORS[z - 1]}"></div></div>
      <span class="zone-pct">${pct.toFixed(0)}%</span>`;
    bar.appendChild(row);
  }
  el.appendChild(bar);
  return el;
}

function renderRoutes(acts: Activity[]): HTMLElement {
  const withRoute = acts.filter((a) => a.route && a.route.length > 1);
  const el = section(t('routes_shape', { n: withRoute.length }));
  if (withRoute.length === 0) {
    el.innerHTML += `<p class="hint">${t('routes_hint')}</p>`;
    return el;
  }
  const grid = document.createElement('div');
  grid.className = 'route-grid';
  withRoute.slice(0, 12).forEach((a) => {
    const svg = buildRouteSvg(a.route!);
    const wrap = document.createElement('div');
    wrap.className = 'route-cell';
    wrap.dataset.actId = a.id;
    wrap.innerHTML = `${svg}<div class="route-cap">${esc(a.date)}</div>`;
    wrap.addEventListener('click', () => openActivityDetail(a.id));
    grid.appendChild(wrap);
  });
  el.appendChild(grid);
  return el;
}

function renderPRs(acts: Activity[]): HTMLElement {
  const prs = computePRs(acts);
  const el = section(t('personal_records'));
  const rows = prs
    .map(
      (p) =>
        `<tr><td>${esc(p.label)}</td><td>${p.bestSec != null ? fmtPaceMin(p.bestSec) : '—'}</td><td>${esc(p.date || '—')}</td></tr>`,
    )
    .join('');
  el.innerHTML += `<div class="table-scroll"><table class="act-table">
    <thead><tr><th>${t('col_distance')}</th><th>${t('col_best_time')}</th><th>${t('col_date')}</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
  return el;
}

function renderRiegel(acts: Activity[]): HTMLElement {
  const preds = computeRiegel(acts, goals.riegelExp);
  const el = section(t('race_predictions'));
  const rows = preds
    .map(
      (p) =>
        `<tr><td>${esc(p.label)}</td><td>${p.predictedSec != null ? fmtPaceMin(p.predictedSec) : '—'}</td><td>${esc(p.anchorLabel || '—')}</td></tr>`,
    )
    .join('');
  el.innerHTML += `<div class="table-scroll"><table class="act-table">
    <thead><tr><th>${t('col_distance')}</th><th>${t('col_predicted')}</th><th>${t('col_anchor')}</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
  return el;
}

function renderVO2(acts: Activity[]): HTMLElement {
  const r = computeVO2max(acts);
  const el = section(t('vo2max'));
  if (r.vdot == null) {
    el.innerHTML += `<p class="hint">${t('vo2need')}</p>`;
    return el;
  }
  const paceRows = r.pacesSecPerKm
    ? (['E', 'M', 'T', 'I', 'R'] as const)
        .map((k) => `<tr><td>${k}</td><td>${fmtPaceMin(r.pacesSecPerKm![k])} /km</td></tr>`)
        .join('')
    : '';
  el.innerHTML += `
    <div class="vdot-num">${r.vdot.toFixed(1)}</div>
    <p class="hint">${t('vo2anchor', { label: esc(r.anchorLabel ?? '—') })}</p>
    <div class="table-scroll"><table class="act-table">
      <thead><tr><th>${t('col_training_pace')}</th><th>${t('col_target_per_km')}</th></tr></thead>
      <tbody>${paceRows}</tbody></table></div>
    <p class="hint">${t('vdot_zones')}</p>`;
  return el;
}

function renderClimb(acts: Activity[]): HTMLElement {
  const scores = computeClimbScore(acts);
  const el = section(t('climb_score', { n: scores.length }));
  if (scores.length === 0) {
    el.innerHTML += `<p class="hint">${t('climb_need')}</p>`;
    return el;
  }
  const rows = scores
    .slice(0, 12)
    .map(
      (s) =>
        `<tr><td>${s.date}</td><td>${s.score}</td><td>${fmtElev(s.gainM)}</td><td>${(s.grad * 100).toFixed(1)}%</td></tr>`,
    )
    .join('');
  el.innerHTML += `<div class="table-scroll climb-scroll"><table class="act-table">
    <thead><tr><th>${t('col_date')}</th><th>${t('col_score')}</th><th>${t('col_gain')}</th><th>${t('col_grade')}</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="hint">${t('climb_formula')}</p>`;
  return el;
}

function renderStreakBar(acts: Activity[]): HTMLElement {
  const s = computeStreaks(acts);
  const el = document.createElement('div');
  el.className = 'chart-wrap';
  el.innerHTML = `<h3>${t('streak_title')}</h3>
    <div class="streak-row">
      <div class="streak-box"><div class="streak-num">${s.current}</div><div class="streak-lbl">${t('streak_current')}</div></div>
      <div class="streak-box"><div class="streak-num">${s.longest}</div><div class="streak-lbl">${t('streak_longest')}</div></div>
    </div>`;
  return el;
}

function buildRouteSvg(route: [number, number][]): string {
  const lats = route.map((r) => r[0]);
  const lons = route.map((r) => r[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const W = 100;
  const H = 60;
  const pad = 6;
  const spanLat = maxLat - minLat || 1e-6;
  const spanLon = maxLon - minLon || 1e-6;
  const pts = route
    .map(([lat, lon]) => {
      const x = pad + ((lon - minLon) / spanLon) * (W - 2 * pad);
      const y = pad + ((maxLat - lat) / spanLat) * (H - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="route-svg" preserveAspectRatio="none">
    <polyline points="${pts}" fill="none" stroke="#34d399" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`;
}

// ---- Activity detail drawer ----
export function openActivityDetail(id: string): void {
  const a = lastActs.find((x) => x.id === id);
  if (!a) return;
  const overlay = document.createElement('div');
  overlay.className = 'overlay';

  const tss = activityTSS(a, currentCfg);
  const histTotal = a.hrHistogram ? histogramSeconds(a.hrHistogram) : 0;
  const hasHist = a.hrHistogram != null;

  // HR-zone stacked bar (time-based when histogram present, else per-activity count)
  let zoneBar = `<p class="hint">${t('det_no_hr')}</p>`;
  if (hasHist) {
    const segs = [1, 2, 3, 4, 5]
      .map((z) => {
        const sec = secondsInZone(a.hrHistogram, z, currentCfg);
        const pct = histTotal ? (sec / histTotal) * 100 : 0;
        if (pct <= 0) return '';
        const [lo, hi] = zoneBpm(currentCfg.zones[z - 1], currentCfg);
        return `<div class="zb-seg" style="flex:${pct.toFixed(1)};background:${ZONE_COLORS[z - 1]}" title="Z${z} ${lo}-${hi} bpm · ${Math.round(sec)}s (${pct.toFixed(0)}%)"></div>`;
      })
      .join('');
    const legend = [1, 2, 3, 4, 5]
      .map((z) => {
        const sec = secondsInZone(a.hrHistogram, z, currentCfg);
        const pct = histTotal ? (sec / histTotal) * 100 : 0;
        const [lo, hi] = zoneBpm(currentCfg.zones[z - 1], currentCfg);
        return `<span class="zb-leg"><i style="background:${ZONE_COLORS[z - 1]}"></i>Z${z} ${lo}-${hi} · ${pct.toFixed(0)}%</span>`;
      })
      .join('');
    zoneBar = `<div class="zone-bar">${segs}</div><div class="zb-legend">${legend}</div>`;
  } else if (a.avgHr != null) {
    const z = zoneForHr(a.avgHr, currentCfg);
    zoneBar = `<p class="hint">${t('det_avg_hr_only', { hr: Math.round(a.avgHr), z: z ?? '—' })}</p>`;
  }

  const stats: Array<[string, string]> = [
    [t('col_distance'), a.distanceKm != null ? fmtDistance(a.distanceKm) : '—'],
    [
      t('col_pace'),
      a.distanceKm && a.movingTimeMin ? fmtPaceMin((a.movingTimeMin * 60) / a.distanceKm) : '—',
    ],
    [t('col_moving_time'), a.movingTimeMin != null ? fmtHours(a.movingTimeMin / 60) : '—'],
    [t('col_elevation_gain'), a.elevationGainM != null ? fmtElev(a.elevationGainM) : '—'],
    [t('col_avg_hr'), a.avgHr != null ? `${Math.round(a.avgHr)} bpm` : '—'],
    [t('col_max_hr'), a.maxHr != null ? `${Math.round(a.maxHr)} bpm` : '—'],
    [t('col_tss'), tss != null ? tss.toFixed(0) : '—'],
    [t('col_type'), esc(a.type || '—')],
  ];
  const statGrid = stats
    .map(
      ([k, v]) =>
        `<div class="det-stat"><span class="det-k">${k}</span><span class="det-v">${v}</span></div>`,
    )
    .join('');

  const routeSvg =
    a.route && a.route.length > 1
      ? `<div class="det-route">${buildRouteSvg(a.route)}</div>`
      : `<p class="hint">${t('det_no_route')}</p>`;

  overlay.innerHTML = `
    <div class="modal detail">
      <button class="modal-x" type="button" aria-label="${t('close')}">${icon('x', 16)}</button>
      <h2>${esc(a.name || a.type || t('activity'))}</h2>
      <p class="sub">${esc(a.date || '')} · ${esc(a.type || '')}</p>
      <div class="det-stats">${statGrid}</div>
      <h3 class="det-h">${t('det_hr_zones')}</h3>
      ${zoneBar}
      <h3 class="det-h">${t('det_route')}</h3>
      ${routeSvg}
    </div>`;

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector<HTMLButtonElement>('.modal-x')!.addEventListener('click', close);
  document.body.appendChild(overlay);
}

// ---- Activity log (sortable) ----
const COLS: Array<{ key: string; label: string }> = [
  { key: 'date', label: t('col_date') },
  { key: 'name', label: t('col_name') },
  { key: 'type', label: t('col_type') },
  { key: 'distanceKm', label: t('col_distance') },
  { key: 'movingTimeMin', label: t('col_moving') },
  { key: 'avgHr', label: t('col_avg_hr') },
  { key: 'tss', label: t('col_tss') },
];
function sortVal(a: Activity, key: string): number | string {
  if (key === 'tss') return activityTSS(a, currentCfg) ?? -1;
  const v = (a as unknown as Record<string, unknown>)[key];
  if (typeof v === 'number') return v;
  return (v as string) ?? '';
}
function renderLog(acts: Activity[], ctx: DashCtx): HTMLElement {
  const PAGE = 50;
  const totalPages = Math.max(1, Math.ceil(acts.length / PAGE));
  if (ctx.page >= totalPages) ctx.page = totalPages - 1;
  if (ctx.page < 0) ctx.page = 0;
  const el = section(t('activity_log', { n: acts.length }));
  const sorted = acts.slice().sort((a, b) => {
    const va = sortVal(a, ctx.sortKey);
    const vb = sortVal(b, ctx.sortKey);
    const cmp =
      typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb));
    return ctx.sortDir === 'asc' ? cmp : -cmp;
  });
  const head = COLS.map((c) => {
    const arrow = ctx.sortKey === c.key ? (ctx.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th data-key="${c.key}" class="sortable">${c.label}${arrow}</th>`;
  }).join('');
  const pageActs = sorted.slice(ctx.page * PAGE, ctx.page * PAGE + PAGE);
  const rows = pageActs
    .map((a) => {
      const tss = activityTSS(a, currentCfg);
      return `<tr data-act-id="${esc(a.id)}" class="act-row">
        <td>${a.date}</td>
        <td>${esc(a.name || '—')}</td>
        <td>${esc(a.type || '—')}</td>
        <td>${fmtDistance(a.distanceKm)}</td>
        <td>${a.movingTimeMin ? a.movingTimeMin.toFixed(0) + ' ' + t('unit_min') : '—'}</td>
        <td>${a.avgHr != null ? a.avgHr.toFixed(0) : '—'}</td>
        <td>${fmtTSS(tss)}</td>
      </tr>`;
    })
    .join('');
  el.innerHTML += `<div class="table-scroll"><table class="act-table">
    <thead><tr>${head}</tr></thead>
    <tbody>${rows}</tbody></table></div>
    <div class="pager">
      <button type="button" data-pg="prev" ${ctx.page === 0 ? 'disabled' : ''}>${icon('chevron-left', 14)} ${t('prev')}</button>
      <span class="pg-info">${t('page_info', { cur: ctx.page + 1, total: totalPages })}</span>
      <button type="button" data-pg="next" ${ctx.page >= totalPages - 1 ? 'disabled' : ''}>${t('next')} ${icon('chevron-right', 14)}</button>
      <label class="pg-jump">${t('jump_to')} <input id="pg-input" type="number" min="1" max="${totalPages}" value="${ctx.page + 1}" /> ${t('page_noun')}</label>
      <button type="button" data-pg="jump">${t('jump')}</button>
    </div>`;
  el.querySelectorAll<HTMLTableCellElement>('th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.key!;
      if (ctx.sortKey === key) ctx.sortDir = ctx.sortDir === 'asc' ? 'desc' : 'asc';
      else {
        ctx.sortKey = key;
        ctx.sortDir = key === 'date' || key === 'name' || key === 'type' ? 'asc' : 'desc';
      }
      ctx.page = 0;
      const evt = new CustomEvent('ctxchange');
      el.dispatchEvent(evt);
    });
  });
  el.querySelectorAll<HTMLButtonElement>('.pager button').forEach((b) => {
    b.addEventListener('click', () => {
      const pg = b.dataset.pg;
      if (pg === 'prev') ctx.page = Math.max(0, ctx.page - 1);
      else if (pg === 'next') ctx.page = Math.min(totalPages - 1, ctx.page + 1);
      else if (pg === 'jump') {
        const input = el.querySelector<HTMLInputElement>('#pg-input');
        const v = input ? Math.min(totalPages, Math.max(1, Number(input.value) || 1)) : 1;
        ctx.page = v - 1;
      }
      const evt = new CustomEvent('ctxchange');
      el.dispatchEvent(evt);
    });
  });
  el.querySelectorAll<HTMLTableRowElement>('tr.act-row').forEach((tr) => {
    tr.addEventListener('click', () => {
      const id = tr.dataset.actId;
      if (id) openActivityDetail(id);
    });
  });
  return el;
}

function renderTab(tab: TabId, acts: Activity[], ctx: DashCtx): HTMLElement {
  switch (tab) {
    case 'overview':
      return renderOverview(acts);
    case 'volume':
      return wrapPair(renderWeekly(acts), renderRoutes(acts));
    case 'load':
      return wrapPair(renderLoad(acts), renderPace(acts));
    case 'zones':
      return wrapPair(renderZones(acts), null);
    case 'perf': {
      const frag = document.createElement('div');
      frag.className = 'stack';
      frag.appendChild(wrapPair(renderPRs(acts), renderRiegel(acts)));
      frag.appendChild(wrapPair(renderVO2(acts), renderClimb(acts)));
      return frag;
    }
    case 'log':
      return renderLog(acts, ctx);
  }
}

export function renderDashboard(root: HTMLElement, acts: Activity[], ctx: DashCtx): void {
  plots.forEach((p) => {
    const host = (p as unknown as { _host?: HTMLElement })._host;
    if (host) chartRO.unobserve(host);
    p.destroy();
  });
  plots = [];
  root.innerHTML = '';
  root.hidden = false;
  lastActs = acts;

  const content = renderTab(ctx.tab, acts, ctx);
  content.classList.add('enter');
  // re-trigger transition
  requestAnimationFrame(() => content.classList.add('enter-active'));
  root.appendChild(content);

  // sort changes bubble up to caller via event
  content.addEventListener('ctxchange', () => {
    const cb = (root as unknown as { __onCtx?: () => void }).__onCtx;
    cb?.();
  });
}

export function setCtx(cfg: ZonesConfig, u: Units, g: Goals, p?: Preferences): void {
  currentCfg = cfg;
  units = u;
  goals = g;
  if (p) prefs = p;
}

export function onCtxChange(root: HTMLElement, cb: () => void): void {
  (root as unknown as { __onCtx?: () => void }).__onCtx = cb;
}
