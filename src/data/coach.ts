import {
  computeLoad,
  computeEasy,
  computeWeeklyVolume,
  computeStreaks,
  mondayOf,
  type LoadPoint,
  type WeeklyPoint,
  type EasyResult,
  type StreakResult,
} from './analyze';
import type { Activity, Goals, Units, ZonesConfig } from './types';

export interface CoachNote {
  week: number;
  headline: string;
  body: string;
  focus?: string;
  secondary?: string;
}

export interface CoachEmpty {
  empty: string;
}

export type CoachOutput = CoachNote | CoachEmpty;

export interface CoachInputs {
  load: LoadPoint[];
  /** chronological, most recent last (computeWeeklyVolume output) */
  weekly: WeeklyPoint[];
  easy: EasyResult;
  streak: StreakResult;
  goalWeeklyKm: number | null;
  goalEasyPct: number;
  units: Units;
  /** Monday (YYYY-MM-DD) of the current local week */
  thisMonday: string;
  /** Monday (YYYY-MM-DD) of the most recent activity's week */
  lastActivityMonday: string | null;
}

const KM_PER_MI = 1.60934;

function fmtDist(km: number, units: Units): string {
  const v = units.dist === 'mi' ? km / KM_PER_MI : km;
  const u = units.dist === 'mi' ? 'mi' : 'km';
  return `${v.toFixed(1)} ${u}`;
}

/** ISO-8601 week number for a YYYY-MM-DD date string. */
export function isoWeek(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  );
}

function shiftMonday(monday: string, weeks: number): string {
  const d = new Date(monday + 'T00:00:00');
  d.setDate(d.getDate() + weeks * 7);
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mo}-${day}`;
}

/** The most recent completed week (the week before thisMonday), falling back sensibly. */
function lastFullWeek(weekly: WeeklyPoint[], thisMonday: string): WeeklyPoint | null {
  if (weekly.length === 0) return null;
  const target = shiftMonday(thisMonday, -7);
  const found = weekly.find((w) => w.week === target);
  if (found) return found;
  const idx = weekly.findIndex((w) => w.week === thisMonday);
  if (idx > 0) return weekly[idx - 1];
  return weekly.length >= 2 ? weekly[weekly.length - 2] : weekly[weekly.length - 1];
}

interface Fired {
  rank: number;
  headline: string;
  body: string;
  focus?: string;
}

function ruleFatigue(inp: CoachInputs): Fired | null {
  if (inp.load.length === 0) return null;
  const last = inp.load[inp.load.length - 1];
  if (last.tsb >= -10) return null;
  const depth = Math.round(last.tsb);
  let climb = 0;
  for (let i = inp.weekly.length - 1; i > 0; i--) {
    if (inp.weekly[i].distanceKm > inp.weekly[i - 1].distanceKm) climb++;
    else break;
  }
  const banked = climb >= 2 ? ` after ${climb} climbing weeks` : '';
  return {
    rank: 1,
    headline: 'Banked deep.',
    body: `TSB ${depth}${banked}. Keep everything easy for the next 5–7 days — the fitness isn't going anywhere.`,
    focus: 'Easy running only for 5–7 days.',
  };
}

function ruleFresh(inp: CoachInputs): Fired | null {
  if (inp.load.length === 0) return null;
  const last = inp.load[inp.load.length - 1];
  if (last.tsb <= 5) return null;
  const recent = inp.load.slice(-28);
  const ctlHigh = Math.max(...recent.map((p) => p.ctl));
  if (last.ctl < 0.95 * ctlHigh) return null;
  return {
    rank: 2,
    headline: 'Sharp and ready.',
    body: `TSB +${Math.round(last.tsb)} with fitness at a recent high (CTL ${Math.round(last.ctl)}). One controlled hard effort would fit well right now.`,
    focus: 'One quality session; keep the rest moderate.',
  };
}

function ruleDrift(inp: CoachInputs): Fired | null {
  const pct = inp.easy.pct;
  if (pct == null || inp.easy.basis !== 'histogram') return null;
  if (pct >= inp.goalEasyPct - 10) return null;
  const gap = Math.round(inp.goalEasyPct - pct);
  return {
    rank: 3,
    headline: 'Drifting grey.',
    body: `${Math.round(pct)}% easy against your ${inp.goalEasyPct}% goal — a ${gap}-point gap. Your next easy run should feel almost too comfortable.`,
    focus: 'Protect the easy days.',
  };
}

function ruleMomentum(inp: CoachInputs): Fired | null {
  const milestone = [7, 30, 100].includes(inp.streak.current)
    ? inp.streak.current
    : null;
  if (milestone != null) {
    return {
      rank: 4,
      headline: `${milestone}-day streak.`,
      body: `You've run ${milestone} days in a row. Consistency like that is what the easy weeks are built on.`,
    };
  }
  if (inp.weekly.length >= 2) {
    const last = inp.weekly[inp.weekly.length - 1];
    const prev = inp.weekly.slice(Math.max(0, inp.weekly.length - 13), inp.weekly.length - 1);
    if (last.distanceKm > 0 && prev.length > 0 && last.distanceKm > Math.max(...prev.map((w) => w.distanceKm))) {
      // A big week still short of the weekly goal lets rule 5 give the honest read.
      const shortOfGoal = inp.goalWeeklyKm != null && last.distanceKm < inp.goalWeeklyKm;
      if (shortOfGoal) return null;
      const easyPart = inp.easy.pct != null ? ` with ${Math.round(inp.easy.pct)}% of it easy` : '';
      return {
        rank: 4,
        headline: 'Biggest week in 12 weeks.',
        body: `${fmtDist(last.distanceKm, inp.units)}${easyPart}. That combination is what builds durable form.`,
      };
    }
  }
  return null;
}

function ruleGoal(inp: CoachInputs): Fired | null {
  if (inp.goalWeeklyKm == null) return null;
  const wf = lastFullWeek(inp.weekly, inp.thisMonday);
  if (!wf) return null;
  const goal = inp.goalWeeklyKm;
  if (wf.distanceKm >= goal * 0.9) {
    return {
      rank: 5,
      headline: 'On pace.',
      body: `Last full week: ${fmtDist(wf.distanceKm, inp.units)} against a ${fmtDist(goal, inp.units)} target. Steady as written.`,
    };
  }
  return {
    rank: 5,
    headline: 'Behind on the weekly.',
    body: `Last full week: ${fmtDist(wf.distanceKm, inp.units)} against a ${fmtDist(goal, inp.units)} target — ${fmtDist(goal - wf.distanceKm, inp.units)} short. One extra easy outing closes it.`,
  };
}

function ruleBaseline(inp: CoachInputs): Fired {
  const ctl = inp.load.length ? Math.round(inp.load[inp.load.length - 1].ctl) : 0;
  const recent = inp.weekly.slice(-4);
  const avgKm = recent.length
    ? recent.reduce((s, w) => s + w.distanceKm, 0) / recent.length
    : 0;
  return {
    rank: 6,
    headline: 'Steady work.',
    body: `Current load sits at CTL ${ctl}, averaging ${fmtDist(avgKm, inp.units)} a week. Consistency is the whole game — keep showing up.`,
  };
}

const RULES = [
  ruleFatigue,
  ruleFresh,
  ruleDrift,
  ruleMomentum,
  ruleGoal,
  ruleBaseline,
];

function honesty(inp: CoachInputs): CoachEmpty | null {
  if (inp.weekly.length < 3) {
    return {
      empty:
        "Not enough history to read yet. Two weeks isn't a pattern yet — keep logging and I'll find the signal.",
    };
  }
  const hasDist = inp.weekly.some((w) => w.distanceKm > 0);
  const hasHr = inp.easy.pct != null;
  if (!hasDist && !hasHr) {
    return {
      empty:
        'No distance or heart-rate data to read from. Re-import with GPX/FIT files, or check that your CSV includes distance.',
    };
  }
  return null;
}

export function pickNote(inp: CoachInputs): CoachOutput {
  const fb = honesty(inp);
  if (fb) return fb;
  const fired = RULES.map((r) => r(inp)).filter((f): f is Fired => f != null);
  const primary = fired[0];
  const secondary = fired.slice(1).find((f) => f.rank <= 3);
  const weekDate = inp.lastActivityMonday ?? inp.thisMonday;
  return {
    week: isoWeek(weekDate),
    headline: primary.headline,
    body: primary.body,
    focus: primary.focus,
    secondary: secondary ? secondary.body : undefined,
  };
}

export function coachNote(
  acts: Activity[],
  cfg: ZonesConfig,
  goals: Goals,
  units: Units,
): CoachOutput {
  const load = computeLoad(acts, cfg);
  const weekly = computeWeeklyVolume(acts);
  const easy = computeEasy(acts, cfg, goals.easyZones);
  const streak = computeStreaks(acts);
  const lastDate = acts.length ? acts.map((a) => a.date).sort().pop()! : null;
  const thisMonday = mondayOf(Date.now());
  const lastActivityMonday = lastDate
    ? mondayOf(new Date(lastDate + 'T00:00:00').getTime())
    : null;
  return pickNote({
    load,
    weekly,
    easy,
    streak,
    goalWeeklyKm: goals.weeklyKm,
    goalEasyPct: goals.easyPct,
    units,
    thisMonday,
    lastActivityMonday,
  });
}
