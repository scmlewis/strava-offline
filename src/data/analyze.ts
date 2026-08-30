import type { Activity, ZonesConfig } from './types';
import { zoneForHr, intensityForHr } from './zones';
import { toLocalDate, todayLocal, yesterdayLocal } from '../utils';

function mondayOf(ts: number): string {
  const d = new Date(ts);
  const day = (d.getDay() + 6) % 7; // Mon=0 (local)
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  const y = d.getFullYear();
  const mo = d.getMonth() + 1;
  const day2 = d.getDate();
  return `${y}-${String(mo).padStart(2, '0')}-${String(day2).padStart(2, '0')}`;
}

// --- Histogram-based HR helpers (zone-independent; recompute on config change) ---

/** total seconds represented by the HR histogram (1 bucket = 1s) */
export function histogramSeconds(hist: Record<number, number> | null | undefined): number {
  if (!hist) return 0;
  return Object.values(hist).reduce((s, v) => s + v, 0);
}

/** seconds spent at or below a given zone (1..5). Needs config to assign bpm->zone. */
export function secondsInZone(hist: Record<number, number> | null | undefined, zone: number, cfg: ZonesConfig): number {
  if (!hist) return 0;
  let sec = 0;
  for (const [bp, count] of Object.entries(hist)) {
    const z = zoneForHr(Number(bp), cfg);
    if (z === zone) sec += count;
  }
  return sec;
}

/** average intensity factor across the histogram (HRR if fthr, else HRmax%) */
export function avgIntensity(hist: Record<number, number> | null | undefined, cfg: ZonesConfig): number | null {
  if (!hist) return null;
  let total = 0;
  let acc = 0;
  for (const [bp, count] of Object.entries(hist)) {
    const hr = Number(bp);
    total += count;
    acc += intensityForHr(hr, cfg) * count;
  }
  return total > 0 ? acc / total : null;
}

// --- TSS / CTL / ATL / TSB ---

/** Training Stress Score for a single activity (HR-based estimate) */
export function activityTSS(a: Activity, cfg: ZonesConfig): number | null {
  const sec = histogramSeconds(a.hrHistogram);
  if (sec <= 0 || a.movingTimeMin == null || a.movingTimeMin <= 0) return null;
  const iff = avgIntensity(a.hrHistogram, cfg);
  if (iff == null) return null;
  // TSS = (sec/3600) * IF^2 * 100 * factor
  const tss = (sec / 3600) * iff * iff * 100 * (cfg.tssFactor / 2.06);
  return tss;
}

export interface DayLoad {
  date: string; // YYYY-MM-DD (Mon-aligned week start, but here actual day)
  tss: number;
}

/** daily TSS aligned to calendar days */
export function dailyTSS(acts: Activity[], cfg: ZonesConfig): DayLoad[] {
  const byDay = new Map<string, number>();
  for (const a of acts) {
    if (!a.date) continue;
    const tss = activityTSS(a, cfg);
    if (tss == null) continue;
    byDay.set(a.date, (byDay.get(a.date) || 0) + tss);
  }
  return [...byDay.entries()].map(([date, tss]) => ({ date, tss }));
}

export interface LoadPoint {
  date: string;
  ctl: number; // 42d fitness
  atl: number; // 7d fatigue
  tsb: number; // form = ctl - atl
}

/**
 * Exponentially-weighted CTL/ATL over a continuous daily series.
 * CTL tau=42, ATL tau=7. Anchored to first day with data.
 */
export function computeLoad(acts: Activity[], cfg: ZonesConfig): LoadPoint[] {
  const daily = dailyTSS(acts, cfg);
  if (daily.length === 0) return [];
  const sorted = daily.sort((a, b) => (a.date < b.date ? -1 : 1));

  // build continuous day range
  const start = new Date(sorted[0].date + 'T00:00:00Z').getTime();
  const end = new Date(sorted[sorted.length - 1].date + 'T00:00:00Z').getTime();
  const dayMs = 86400000;
  const tssByDay = new Map(sorted.map((d) => [d.date, d.tss]));
  const days: string[] = [];
  for (let t = start; t <= end; t += dayMs) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }

  const ctlA = 1 - Math.exp(-1 / 42);
  const atlA = 1 - Math.exp(-1 / 7);
  let ctl = 0;
  let atl = 0;
  const out: LoadPoint[] = [];
  for (const d of days) {
    const tss = tssByDay.get(d) || 0;
    ctl = ctl + ctlA * (tss - ctl);
    atl = atl + atlA * (tss - atl);
    out.push({ date: d, ctl, atl, tsb: ctl - atl });
  }
  return out;
}

// --- Personal Records ---

export interface PR {
  distanceKm: number;
  label: string;
  bestSec: number | null;
  activityId: string | null;
  date: string | null;
}

const PR_DISTANCES: Array<{ km: number; label: string }> = [
  { km: 5, label: '5K' },
  { km: 10, label: '10K' },
  { km: 21.1, label: 'Half' },
  { km: 42.195, label: 'Marathon' },
];

/**
 * Best effort per standard distance. Picks runs whose distance is within +8% of
 * the target and minimizes moving time. Falls back to closest-but-short if none match.
 */
export function computePRs(acts: Activity[]): PR[] {
  const runs = acts.filter(
    (a) => a.distanceKm && a.distanceKm > 0 && a.movingTimeMin && a.movingTimeMin > 0 && /run/i.test(a.type || ''),
  );
  return PR_DISTANCES.map(({ km, label }) => {
    let best: { sec: number; id: string; date: string; d: number } | null = null;
    let fallback: { sec: number; id: string; date: string; d: number } | null = null;
    for (const a of runs) {
      const d = a.distanceKm!;
      const sec = a.movingTimeMin! * 60;
      if (Math.abs(d - km) / km <= 0.08) {
        if (!best || sec < best.sec) best = { sec, id: a.id, date: a.date, d };
      } else if (d < km) {
        // keep the longest shorter run as a reference (closest to target)
        if (!fallback || d > fallback.d) fallback = { sec, id: a.id, date: a.date, d };
      }
    }
    if (best) {
      return { distanceKm: km, label, bestSec: best.sec, activityId: best.id, date: best.date };
    }
    if (fallback) {
      return { distanceKm: km, label, bestSec: null, activityId: fallback.id, date: fallback.date };
    }
    return { distanceKm: km, label, bestSec: null, activityId: null, date: null };
  });
}

// --- Race prediction (Riegel) ---
// T2 = T1 * (D2/D1)^1.06 , using the best matched effort as the anchor.

export interface RacePrediction {
  label: string;
  distanceKm: number;
  predictedSec: number | null;
  anchorLabel: string | null;
}

const RACE_DISTANCES: Array<{ km: number; label: string }> = [
  { km: 5, label: '5K' },
  { km: 10, label: '10K' },
  { km: 21.1, label: 'Half' },
  { km: 42.195, label: 'Marathon' },
];

const RIEGEL = 1.06;

export function computeRiegel(acts: Activity[]): RacePrediction[] {
  const prs = computePRs(acts);
  const anchors = prs.filter((p) => p.bestSec != null);
  if (anchors.length === 0) {
    return RACE_DISTANCES.map((r) => ({ label: r.label, distanceKm: r.km, predictedSec: null, anchorLabel: null }));
  }
  // pick the anchor with the most representative distance (prefer 10K if present, else middle)
  const anchor = anchors.find((a) => a.label === '10K') || anchors[Math.floor(anchors.length / 2)];
  const anchorSec = anchor.bestSec!;
  const anchorKm = anchor.distanceKm;

  return RACE_DISTANCES.map((r) => {
    if (r.km === anchorKm) {
      return { label: r.label, distanceKm: r.km, predictedSec: anchorSec, anchorLabel: anchor.label };
    }
    const pred = anchorSec * Math.pow(r.km / anchorKm, RIEGEL);
    return { label: r.label, distanceKm: r.km, predictedSec: pred, anchorLabel: anchor.label };
  });
}

// --- Summary / volume / easy% / zone dist / pace (MVP) ---

export interface Summary {
  count: number;
  totalDistanceKm: number;
  totalMovingHours: number;
  totalElevM: number;
  firstDate: string | null;
  lastDate: string | null;
  avgDistanceKm: number | null;
}

export function computeSummary(acts: Activity[]): Summary {
  let dist = 0;
  let moving = 0;
  let elev = 0;
  let first: number | null = null;
  let last: number | null = null;
  for (const a of acts) {
    if (a.distanceKm != null) dist += a.distanceKm;
    if (a.movingTimeMin != null) moving += a.movingTimeMin;
    if (a.elevationGainM != null) elev += a.elevationGainM;
    if (a.ts) {
      first = first == null ? a.ts : Math.min(first, a.ts);
      last = last == null ? a.ts : Math.max(last, a.ts);
    }
  }
  const n = acts.length;
  return {
    count: n,
    totalDistanceKm: dist,
    totalMovingHours: moving / 60,
    totalElevM: elev,
    firstDate: first ? toLocalDate(first) : null,
    lastDate: last ? toLocalDate(last) : null,
    avgDistanceKm: n && dist ? dist / n : null,
  };
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD (local-ish, UTC day of the activity)
  distanceKm: number;
  movingMin: number;
  count: number;
}

/** Per-calendar-day totals, for the activity heatmap (GitHub-contribution style). */
export function computeDailyVolume(acts: Activity[]): DailyPoint[] {
  const map = new Map<string, DailyPoint>();
  for (const a of acts) {
    const d = a.date; // already local YYYY-MM-DD from parseDate
    if (!d) continue;
    const p = map.get(d) || { date: d, distanceKm: 0, movingMin: 0, count: 0 };
    p.distanceKm += a.distanceKm ?? 0;
    p.movingMin += a.movingTimeMin ?? 0;
    p.count += 1;
    map.set(d, p);
  }
  return [...map.values()].sort((x, y) => (x.date < y.date ? -1 : 1));
}

export interface WeeklyPoint {
  week: string;
  distanceKm: number;
  hours: number;
  count: number;
}

export function computeWeeklyVolume(acts: Activity[]): WeeklyPoint[] {
  const map = new Map<string, WeeklyPoint>();
  for (const a of acts) {
    if (!a.ts) continue;
    const wk = mondayOf(a.ts);
    const p = map.get(wk) || { week: wk, distanceKm: 0, hours: 0, count: 0 };
    p.distanceKm += a.distanceKm ?? 0;
    p.hours += (a.movingTimeMin ?? 0) / 60;
    p.count += 1;
    map.set(wk, p);
  }
  return [...map.values()].sort((x, y) => (x.week < y.week ? -1 : 1)).slice(-16);
}

export interface EasyResult {
  easyCount: number;
  hardCount: number;
  pct: number | null;
  basis: 'avgHr' | 'histogram';
}

// easy = activity whose HR histogram is predominantly Z1/Z2
export function computeEasy(acts: Activity[], cfg: ZonesConfig): EasyResult {
  let easy = 0;
  let hard = 0;
  let basis: 'avgHr' | 'histogram' = 'avgHr';
  let usedHist = false;
  for (const a of acts) {
    if (a.hrHistogram) {
      usedHist = true;
      const easySec = secondsInZone(a.hrHistogram, 1, cfg) + secondsInZone(a.hrHistogram, 2, cfg);
      const total = histogramSeconds(a.hrHistogram);
      if (total > 0) {
        if (easySec / total >= 0.5) easy++;
        else hard++;
      }
    } else if (a.avgHr != null) {
      const z = zoneForHr(a.avgHr, cfg);
      if (z != null && z <= 2) easy++;
      else hard++;
    }
  }
  if (usedHist) basis = 'histogram';
  const total = easy + hard;
  return { easyCount: easy, hardCount: hard, pct: total ? (easy / total) * 100 : null, basis };
}

export interface ZoneDist {
  byActivity: Record<number, number>;
  byTime: Record<number, number>;
  basis: 'avgHr' | 'histogram';
}

export function computeZoneDistribution(acts: Activity[], cfg: ZonesConfig): ZoneDist {
  const byActivity: Record<number, number> = {};
  const byTime: Record<number, number> = {};
  let basis: 'avgHr' | 'histogram' = 'avgHr';
  for (const a of acts) {
    if (a.hrHistogram) {
      basis = 'histogram';
      for (let z = 1; z <= 5; z++) {
        byTime[z] = (byTime[z] || 0) + secondsInZone(a.hrHistogram, z, cfg);
      }
    } else if (a.avgHr != null) {
      const z = zoneForHr(a.avgHr, cfg);
      if (z != null) byActivity[z] = (byActivity[z] || 0) + 1;
    }
  }
  return { byActivity, byTime, basis };
}

export interface PacePoint {
  ts: number;
  date: string;
  paceMinPerKm: number | null;
  distanceKm: number | null;
}

export function computePaceTrend(acts: Activity[]): PacePoint[] {
  return acts
    .filter(
      (a) =>
        a.distanceKm &&
        a.distanceKm > 0 &&
        a.movingTimeMin &&
        a.movingTimeMin > 0 &&
        /run/i.test(a.type || ''),
    )
    .map((a) => ({
      ts: a.ts,
      date: a.date,
      distanceKm: a.distanceKm,
      paceMinPerKm: a.movingTimeMin! / a.distanceKm!,
    }))
    .sort((x, y) => x.ts - y.ts);
}

// ─────────────────────────────────────────────────────────────────────────
// Effective VO2max (VDOT) — Daniels & Gilbert oxygen-power formula.
// VDOT = (-4.6 + 0.182258·v + 0.000104·v²) / (0.8 + 0.1894393·e^(-0.012778·t) + 0.2989558·e^(-0.1932605·t))
//   v = speed in metres/min, t = time in minutes.
// ─────────────────────────────────────────────────────────────────────────

/** VDOT from a race result. distM = metres, timeSec = seconds. Returns null if inputs invalid. */
export function vdotFromRace(distM: number, timeSec: number): number | null {
  if (!isFinite(distM) || !isFinite(timeSec) || distM <= 0 || timeSec <= 0) return null;
  const t = timeSec / 60;
  const v = distM / t; // m/min
  const num = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const den = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  if (den <= 0) return null;
  const vdot = num / den;
  return vdot > 20 && vdot < 100 ? +vdot.toFixed(1) : null;
}

/** Invert the VDOT formula to get race-equivalent speed (m/min) for a given VDOT. */
export function vdotToSpeed(vdot: number): number | null {
  if (!isFinite(vdot) || vdot <= 0) return null;
  let best: { t: number; v: number; err: number } | null = null;
  for (let t = 1; t <= 600; t += 0.5) {
    const den = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
    const c = -4.6 - vdot * den;
    const a = 0.000104;
    const b = 0.182258;
    const disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    const v = (-b + Math.sqrt(disc)) / (2 * a);
    if (v <= 0) continue;
    const recomputed = (-4.6 + 0.182258 * v + 0.000104 * v * v) / den;
    const err = Math.abs(recomputed - vdot);
    if (!best || err < best.err) best = { t, v, err };
  }
  return best && best.err < 0.05 ? best.v : null;
}

export interface JDResult {
  vdot: number | null;
  anchorLabel: string | null;
  anchorDistKm: number | null;
  pacesSecPerKm: { E: number; M: number; T: number; I: number; R: number } | null;
}

// Daniels training-pace factors: multiplier ON seconds-per-km (slower = larger).
const JD_FACTOR: Record<'E' | 'M' | 'T' | 'I' | 'R', number> = {
  E: 1.3,
  M: 1.11,
  T: 1.04,
  I: 0.98,
  R: 0.9,
};

export function computeVO2max(acts: Activity[]): JDResult {
  const prs = computePRs(acts);
  let best: { vdot: number; label: string; km: number } | null = null;
  for (const p of prs) {
    if (p.bestSec == null || p.distanceKm == null) continue;
    const v = vdotFromRace(p.distanceKm * 1000, p.bestSec);
    if (v == null) continue;
    if (!best || v > best.vdot) best = { vdot: v, label: p.label, km: p.distanceKm };
  }
  if (!best) return { vdot: null, anchorLabel: null, anchorDistKm: null, pacesSecPerKm: null };

  const v = vdotToSpeed(best.vdot);
  let paces: JDResult['pacesSecPerKm'] = null;
  if (v != null) {
    const raceSecPerKm = (1000 / v) * 60;
    paces = {
      E: +(raceSecPerKm * JD_FACTOR.E).toFixed(1),
      M: +(raceSecPerKm * JD_FACTOR.M).toFixed(1),
      T: +(raceSecPerKm * JD_FACTOR.T).toFixed(1),
      I: +(raceSecPerKm * JD_FACTOR.I).toFixed(1),
      R: +(raceSecPerKm * JD_FACTOR.R).toFixed(1),
    };
  }
  return { vdot: best.vdot, anchorLabel: best.label, anchorDistKm: best.km, pacesSecPerKm: paces };
}

export function computeClimbScore(acts: Activity[]): Array<{ id: string; date: string; score: number; gainM: number; grad: number }> {
  return acts
    .filter((a) => a.elevationGainM && a.elevationGainM > 0 && a.distanceKm && a.distanceKm > 0)
    .map((a) => {
      const gain = a.elevationGainM!;
      const distM = a.distanceKm! * 1000;
      const grad = gain / distM;
      const score = Math.round(gain * (1 + Math.min(grad, 0.15) * 6));
      return { id: a.id, date: a.date, score, gainM: gain, grad: +grad.toFixed(3) };
    })
    .sort((x, y) => y.score - x.score);
}

export interface StreakResult {
  current: number;
  longest: number;
  currentEnds: string | null;
}

export function computeStreaks(acts: Activity[]): StreakResult {
  const days = new Set(acts.map((a) => a.date).filter(Boolean).sort());
  if (days.size === 0) return { current: 0, longest: 0, currentEnds: null };
  const arr = [...days];
  let longest = 1;
  let run = 1;
  for (let i = 1; i < arr.length; i++) {
    const prev = new Date(arr[i - 1] + 'T00:00:00');
    const cur = new Date(arr[i] + 'T00:00:00');
    const diff = (cur.getTime() - prev.getTime()) / 86400000;
    if (diff === 1) run++;
    else run = 1;
    if (run > longest) longest = run;
  }
  const last = arr[arr.length - 1];
  const today = todayLocal();
  const yest = yesterdayLocal();
  let current = 0;
  let cursor = last;
  if (last === today || last === yest) {
    current = 1;
    for (let i = arr.length - 2; i >= 0; i--) {
      const prev = new Date(arr[i] + 'T00:00:00');
      const cur = new Date(cursor + 'T00:00:00');
      if ((cur.getTime() - prev.getTime()) / 86400000 === 1) {
        current++;
        cursor = arr[i];
      } else break;
    }
  }
  return { current, longest, currentEnds: last };
}
