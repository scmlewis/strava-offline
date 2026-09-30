# Coach's Note Card — Design Spec

Date: 2026-09-30
Status: approved (design), pending spec review
Scope: one digest card atop Overview, driven by a deterministic local rule
engine. Out of scope: template pools, LLM generation, season model,
changes to charts/cards/filters.

## 1. Voice

A knowledgeable and caring coach. Discipline: one note, two sentences max,
numbers always. Specific over generic ("TSB −14 after three climbing weeks",
never "you're working hard"). Praise is earned and precise. Warnings are
caring, never alarming. Uncertainty is admitted outright ("No HR data this
month, so I'm reading effort from pace alone"). No exclamation marks. No
"crushing it", no gamified badges, no confetti.

## 2. Placement and layout

Top of the Overview tab, above the stat cards. Ledger-styled like existing
surfaces (`chart-wrap` family): mono kicker (`WEEK {n} · COACH'S NOTE`),
one headline, one to two sentences, one suggested-focus line. A muted
secondary line appears only when a second rule fires strongly. Respects
existing light/dark tokens and reduced-motion rules; no new visual language.

## 3. Rule engine

Pure function of already-computed analysis; no new data plumbing, no
network, fully deterministic and unit-testable.

Inputs: training load series (CTL/ATL/TSB), easy % with basis flag,
weekly volume series, streaks, weekly goal, recent PRs, activity count
and HR coverage.

Ranking (first match wins as primary):
1. Fatigue risk: TSB below −10 → name the depth, the banked weeks, and the
   easy horizon (5–7 days). Caring frame: rest as the plan working.
2. Freshness window: TSB above 5 with CTL at/near recent highs → sharpness
   noted, one hard effort suggested, no hype.
3. Balance drift: easy % more than ~10 points under the easy goal with
   histogram basis → grey-zone observation with the actual split.
4. Momentum: biggest week in 12+ weeks, or streak milestone (7/30/100) →
   precise acknowledgment tied to the numbers.
5. Goal outlook: weekly goal set → on-pace/behind readout against last
   full week.
6. Quiet baseline: none of the above → one grounded line reflecting current
   load level, never filler praise.

Honesty fallback (overrides all): fewer than 3 weeks of history, or no
distance/HR coverage to support a claim → "Not enough history to read yet"
plus the one thing that would unlock a read. Never fabricate insight.

## 4. Copy examples (illustrative, final wording in implementation)

- Fatigue: headline "Banked deep." / "TSB −14 after three climbing weeks.
  Keep everything easy for the next 5–7 days — the fitness isn't going
  anywhere."
- Momentum: headline "Biggest week since March." / "42 km with 84% of it
  easy. That combination is what builds durable form."
- Thin data: headline "Too early to read." / "Two weeks isn't a pattern
  yet. Keep logging — and add HR if you can, so effort reads become real."

## 5. Architecture

- New module `src/data/coach.ts`: `coachNote(acts, ctx)` returning
  `{ headline, body, focus?, secondary? } | { empty: reason }`. Depends on
  `computeLoad`, `computeEasy`, `computeWeeklyVolume`, `computeStreaks`
  from `src/data/analyze.ts` plus goals/units already in scope.
- `src/data/dashboard.ts`: render the card as the first Overview child;
  plain DOM like other sections, no chart dependency.
- `src/i18n.ts`: note strings live in code (they interpolate live numbers);
  static labels only if needed.

## 6. Testing

Unit tests with synthetic training states: overreached athlete (TSB −15),
grey-zone-heavy runner (easy 55% vs 80 goal), streak milestone, fresh peak,
thin data (2 activities, no HR). Each asserts the winning rule and that
rendered numbers match inputs. Existing suites must stay green; typecheck
and build clean.

## 7. Self-review

- No TBD/placeholders; thresholds explicit (−10/+5 TSB, ~10pt drift,
  3-week minimum, 12-week momentum window).
- Consistent: single primary note always; secondary only on strong second
  signal; fallback overrides rather than competes.
- Scope is one plan: card + engine + tests, no season model or copy rewrite.
- Ambiguity resolved: "strongly" for secondary means a second top-3 rule
  also firing; momentum window fixed at 12 weeks; focus line is one clause.
