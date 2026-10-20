# Coach's Note Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, rule-based "Coach's Note" digest card at the top of the Overview tab, driven entirely by already-computed training analysis.

**Architecture:** New pure module `src/data/coach.ts` with a testable rule engine (`pickNote`) and a thin wrapper (`coachNote`) that wires in `analyze.ts` functions. `dashboard.ts` renders the result as the first Overview child, ledger-styled like existing `chart-wrap` surfaces. No new data plumbing, no network, no i18n keys (strings interpolate live numbers; app is English-only).

**Tech Stack:** TypeScript 5.6 (strict), Vitest, existing Dexie/uPlot app — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-30-coach-note-design.md` (approved). Key constraints copied verbatim:

## Global Constraints

- Voice: knowledgeable and caring coach. One note, two sentences max plus optional focus line. Numbers always. No exclamation marks. No gamified language.
- Rule ranking (first match wins as primary): 1) fatigue TSB < −10, 2) freshness TSB > 5 with CTL at/near recent highs, 3) balance drift easy% > ~10 points under goal with histogram basis, 4) momentum (biggest week in 12+ weeks or streak 7/30/100), 5) goal outlook, 6) quiet baseline.
- Honesty fallback (overrides all): < 3 weeks of history, or no distance/HR coverage → `{ empty: reason }`, never fabricate insight.
- Thresholds: TSB −10 / +5, drift ~10 points, 3-week minimum, 12-week momentum window.
- Secondary line only when a second top-3 rule also fires.
- Out of scope: template pools, LLM, season model, changes to charts/cards/filters beyond inserting one card.
- Existing suites must stay green; `npm run typecheck` and `npm run build` clean.

---

### Task 1: Coach rule engine (`src/data/coach.ts`)

**Files:**
- Create: `src/data/coach.ts`
- Modify: `src/data/analyze.ts:5` — change `function mondayOf(ts: number)` to `export function mondayOf(ts: number)` (single-word change; `coachNote` reuses it for week alignment)
- Test: `test/coach.test.ts`

**Interfaces:**
- Consumes: `computeLoad`, `computeEasy`, `computeWeeklyVolume`, `computeStreaks` (existing exports of `src/data/analyze.ts`), types `LoadPoint`, `WeeklyPoint`, `EasyResult`, `StreakResult`; `Activity`, `Goals`, `Units`, `ZonesConfig` from `src/data/types.ts`; `todayLocal` from `src/utils.ts`; newly exported `mondayOf`.
- Produces (used by Task 2):
  - `coachNote(acts: Activity[], cfg: ZonesConfig, goals: Goals, units: Units): CoachOutput`
  - `pickNote(inp: CoachInputs): CoachOutput`
  - `isoWeek(dateStr: string): number`
  - Types: `CoachOutput = CoachNote | CoachEmpty`; `CoachNote { week: number; headline: string; body: string; focus?: string; secondary?: string }`; `CoachEmpty { empty: string }`

- [ ] **Step 1: Export `mondayOf` from analyze.ts**

In `src/data/analyze.ts:5`, change:

```ts
function mondayOf(ts: number): string {
```

to:

```ts
export function mondayOf(ts: number): string {
```

- [ ] **Step 2: Write the failing tests**

Create `test/coach.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pickNote, isoWeek, type CoachInputs } from '../src/data/coach.ts';
import type { LoadPoint, WeeklyPoint } from '../src/data/analyze.ts';

function inp(over: Partial<CoachInputs>): CoachInputs {
  return {
    load: [],
    weekly: [],
    easy: { easyCount: 5, hardCount: 1, pct: 83, basis: 'histogram' },
    streak: { current: 0, longest: 0, currentEnds: null },
    goalWeeklyKm: null,
    goalEasyPct: 80,
    units: { dist: 'km', pace: 'min/km' },
    thisMonday: '2026-06-15',
    lastActivityMonday: '2026-06-15',
    ...over,
  };
}

function load(tsb: number, ctl = 60): LoadPoint[] {
  return [
    { date: '2026-06-14', ctl: ctl - 3, atl: ctl - 3 - 10, tsb: 10 },
    { date: '2026-06-15', ctl, atl: ctl - tsb, tsb },
  ];
}

function weeks(distances: number[]): WeeklyPoint[] {
  // week keys: Mondays ending at thisMonday 2026-06-15
  const keys = ['2026-05-25', '2026-06-01', '2026-06-08', '2026-06-15'];
  return distances.map((d, i) => ({
    week: keys[i] ?? `2026-04-${String(6 + i).padStart(2, '0')}`,
    distanceKm: d,
    hours: d / 10,
    count: 3,
  }));
}

describe('isoWeek', () => {
  it('returns 1 for 2026-01-01 (Thursday of week 1)', () => {
    expect(isoWeek('2026-01-01')).toBe(1);
  });
  it('returns 1 for 2025-12-29 (Monday of ISO week 1 of 2026)', () => {
    expect(isoWeek('2025-12-29')).toBe(1);
  });
});

describe('pickNote honesty fallback', () => {
  it('returns empty with < 3 weeks', () => {
    const out = pickNote(inp({ weekly: weeks([30, 32]).slice(0, 2) }));
    expect('empty' in out).toBe(true);
    if ('empty' in out) expect(out.empty).toContain('Not enough history');
  });
  it('returns empty with no distance and no HR', () => {
    const out = pickNote(
      inp({
        weekly: weeks([0, 0, 0, 0]),
        easy: { easyCount: 0, hardCount: 0, pct: null, basis: 'avgHr' },
      }),
    );
    expect('empty' in out).toBe(true);
  });
});

describe('pickNote rule ranking', () => {
  it('rule 1 fatigue: TSB -15 wins', () => {
    const out = pickNote(inp({ load: load(-15), weekly: weeks([30, 35, 40, 42]) }));
    expect('empty' in out).toBe(false);
    if (!('empty' in out)) {
      expect(out.headline).toBe('Banked deep.');
      expect(out.body).toContain('TSB -15');
    }
  });
  it('rule 2 freshness: TSB +8 with CTL at recent high', () => {
    const out = pickNote(inp({ load: load(8, 60), weekly: weeks([30, 32, 31, 30]) }));
    if (!('empty' in out)) {
      expect(out.headline).toBe('Sharp and ready.');
      expect(out.body).toContain('TSB +8');
    }
  });
  it('rule 3 drift: easy 55% vs 80 goal on histogram basis', () => {
    const out = pickNote(
      inp({
        load: load(0),
        weekly: weeks([30, 32, 31, 30]),
        easy: { easyCount: 11, hardCount: 9, pct: 55, basis: 'histogram' },
      }),
    );
    if (!('empty' in out)) {
      expect(out.headline).toBe('Drifting grey.');
      expect(out.body).toContain('55%');
      expect(out.body).toContain('25-point');
    }
  });
  it('rule 3 does not fire on avgHr basis', () => {
    const out = pickNote(
      inp({
        load: load(0),
        weekly: weeks([30, 32, 31, 30]),
        easy: { easyCount: 11, hardCount: 9, pct: 55, basis: 'avgHr' },
      }),
    );
    if (!('empty' in out)) expect(out.headline).not.toBe('Drifting grey.');
  });
  it('rule 4 momentum: biggest week in 12+ weeks', () => {
    const out = pickNote(inp({ load: load(0), weekly: weeks([30, 32, 31, 42]) }));
    if (!('empty' in out)) {
      expect(out.headline).toBe('Biggest week in 12 weeks.');
      expect(out.body).toContain('42.0 km');
    }
  });
  it('rule 4 momentum: 7-day streak milestone', () => {
    const out = pickNote(
      inp({
        load: load(0),
        weekly: weeks([30, 32, 31, 30]),
        streak: { current: 7, longest: 7, currentEnds: '2026-06-15' },
      }),
    );
    if (!('empty' in out)) expect(out.headline).toBe('7-day streak.');
  });
  it('rule 5 goal behind: last full week under target', () => {
    const out = pickNote(
      inp({ load: load(0), weekly: weeks([30, 32, 30, 38]), goalWeeklyKm: 40 }),
    );
    if (!('empty' in out)) {
      expect(out.headline).toBe('Behind on the weekly.');
      expect(out.body).toContain('30.0 km');
      expect(out.body).toContain('40.0 km');
    }
  });
  it('rule 5 goal on-pace: last full week >= 90% of target', () => {
    const out = pickNote(
      inp({ load: load(0), weekly: weeks([30, 32, 38, 10]), goalWeeklyKm: 40 }),
    );
    if (!('empty' in out)) expect(out.headline).toBe('On pace.');
  });
  it('rule 6 quiet baseline when nothing else fires', () => {
    const out = pickNote(inp({ load: load(0), weekly: weeks([30, 32, 31, 30]) }));
    if (!('empty' in out)) expect(out.headline).toBe('Steady work.');
  });
});

describe('pickNote secondary and formatting', () => {
  it('surfaces a second top-3 rule as secondary', () => {
    const out = pickNote(
      inp({
        load: load(-15),
        weekly: weeks([30, 35, 40, 42]),
        easy: { easyCount: 11, hardCount: 9, pct: 55, basis: 'histogram' },
      }),
    );
    if (!('empty' in out)) {
      expect(out.headline).toBe('Banked deep.');
      expect(out.secondary).toContain('55%');
    }
  });
  it('formats distances in miles when units say mi', () => {
    const out = pickNote(
      inp({
        load: load(0),
        weekly: weeks([30, 32, 31, 42]),
        units: { dist: 'mi', pace: 'min/mi' },
      }),
    );
    if (!('empty' in out)) expect(out.body).toContain('26.1 mi');
  });
  it('includes ISO week number for the kicker', () => {
    const out = pickNote(inp({ load: load(0), weekly: weeks([30, 32, 31, 30]) }));
    if (!('empty' in out)) expect(out.week).toBe(isoWeek('2026-06-15'));
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run test/coach.test.ts`
Expected: FAIL — module `../src/data/coach.ts` not found.

- [ ] **Step 4: Write the implementation**

Create `src/data/coach.ts`:

```ts
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
    body: `TSB ${depth}${banked}. Keep everything easy for the next 5\u20137 days \u2014 the fitness isn't going anywhere.`,
    focus: 'Easy running only for 5\u20137 days.',
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
    body: `${Math.round(pct)}% easy against your ${inp.goalEasyPct}% goal \u2014 a ${gap}-point gap. Your next easy run should feel almost too comfortable.`,
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
    body: `Last full week: ${fmtDist(wf.distanceKm, inp.units)} against a ${fmtDist(goal, inp.units)} target \u2014 ${fmtDist(goal - wf.distanceKm, inp.units)} short. One extra easy outing closes it.`,
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
    body: `Current load sits at CTL ${ctl}, averaging ${fmtDist(avgKm, inp.units)} a week. Consistency is the whole game \u2014 keep showing up.`,
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
        "Not enough history to read yet. Two weeks isn't a pattern yet \u2014 keep logging and I'll find the signal.",
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/coach.test.ts`
Expected: all tests PASS.

- [ ] **Step 6: Run existing suites to check for regressions**

Run: `npm test`
Expected: all suites PASS (analyze suite unaffected by the `mondayOf` export).

- [ ] **Step 7: Commit**

```bash
git add src/data/analyze.ts src/data/coach.ts test/coach.test.ts
git commit -m "feat: add coach's note rule engine with unit tests"
```

---

### Task 2: Render the card on Overview

**Files:**
- Modify: `src/data/dashboard.ts` (imports near top; `renderOverview` at line ~187; new `renderCoachNote` function)
- Modify: `src/styles/cards.css` (append after the `.chart-wrap` block, ~line 99)

**Interfaces:**
- Consumes: `coachNote`, types `CoachOutput` from `src/data/coach.ts`; module-level `currentCfg`, `goals`, `units` already present in `dashboard.ts`; `esc` already imported from `../utils`.
- Produces: Overview tab renders the coach card as its first child.

- [ ] **Step 1: Add the import to dashboard.ts**

After the existing `import { card } from '../ui/cards.ts';` (line ~70), add:

```ts
import { coachNote } from './coach.ts';
```

- [ ] **Step 2: Add renderCoachNote and insert it in renderOverview**

Add this function immediately before `renderOverview` (before line 187):

```ts
function renderCoachNote(acts: Activity[]): HTMLElement {
  const el = document.createElement('div');
  el.className = 'chart-wrap coach-note';
  const out = coachNote(acts, currentCfg, goals, units);
  if ('empty' in out) {
    el.innerHTML = `<p class="coach-kicker">COACH'S NOTE</p>
      <h3 class="coach-headline">Too early to read.</h3>
      <p class="coach-body">${esc(out.empty)}</p>`;
    return el;
  }
  el.innerHTML = `<p class="coach-kicker">WEEK ${out.week} · COACH'S NOTE</p>
    <h3 class="coach-headline">${esc(out.headline)}</h3>
    <p class="coach-body">${esc(out.body)}</p>
    ${out.focus ? `<p class="coach-focus">Focus: ${esc(out.focus)}</p>` : ''}
    ${out.secondary ? `<p class="coach-secondary">${esc(out.secondary)}</p>` : ''}`;
  return el;
}
```

In `renderOverview` (line ~187), change the first append:

```ts
function renderOverview(acts: Activity[]): HTMLElement {
  const frag = document.createElement('div');
  frag.className = 'stack';
  frag.appendChild(renderCoachNote(acts));
  frag.appendChild(renderCards(acts));
```

- [ ] **Step 3: Add styles to cards.css**

Append to `src/styles/cards.css` (after the `.chart-wrap h3::before` block, ~line 99):

```css
/* ---- Coach's Note ---- */
.coach-note .coach-kicker {
  margin: 0 0 6px;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.coach-note .coach-headline {
  margin: 0 0 6px;
  font-size: 1.05rem;
  font-weight: 650;
}
.coach-note .coach-body {
  margin: 0 0 8px;
  font-size: 0.9rem;
  line-height: 1.5;
  max-width: 65ch;
}
.coach-note .coach-focus {
  margin: 0;
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--accent);
}
.coach-note .coach-secondary {
  margin: 8px 0 0;
  font-size: 0.84rem;
  color: var(--muted);
}
```

- [ ] **Step 4: Typecheck and full test run**

Run: `npm run typecheck && npm test`
Expected: clean typecheck; all suites PASS.

- [ ] **Step 5: Manual smoke check**

Run: `npm run dev`, open the app, import or use existing data, and confirm:
- The coach card is the first element on Overview, above the stat cards.
- Light and dark themes both look correct.
- With < 3 weeks of data, the card shows "Too early to read." instead of a note.

- [ ] **Step 6: Commit**

```bash
git add src/data/dashboard.ts src/styles/cards.css
git commit -m "feat: render coach's note card on Overview"
```

---

### Task 3: Final verification

**Files:** none modified (verification only).

- [ ] **Step 1: Lint, format check, build**

Run: `npm run lint && npm run format:check && npm run build`
Expected: all clean. If `format:check` flags the new files, run `npm run format` on them and re-commit with `git commit --amend` only if the commit has not been pushed; otherwise a follow-up `style: prettier format` commit.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: E2E smoke (optional but recommended)**

Run: `npm run test:e2e`
Expected: PASS (coach card is additive; existing e2e specs should be unaffected).

---

## Self-Review (completed at plan time)

- **Spec coverage:** Sections 1–7 all mapped — voice enforced in copy strings (Task 1 rules); placement/layout in Task 2; rule engine + thresholds + honesty fallback in Task 1; architecture (`coach.ts`, dashboard first child, strings in code, no i18n changes since the app is EN-only) matches spec §5; testing (overreached, grey-zone, streak, fresh peak, thin data) matches spec §6.
- **Placeholders:** none — every step contains complete code.
- **Type consistency:** `CoachOutput`/`pickNote`/`coachNote` signatures used in Task 2 match Task 1 definitions; `mondayOf` export matches usage.
