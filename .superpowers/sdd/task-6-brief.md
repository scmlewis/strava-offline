### Task 6: Cards extraction + responsive/a11y pass

**Files:**
- Create: `src/ui/cards.ts`
- Modify: `src/data/dashboard.ts` (delete moved `card()` helper, import from `../../ui/cards.ts`), `src/styles/responsive.css`, `src/styles/nav.css`, `index.html` (skip-link + `aria-current` + bottom-bar CSS hooks)
- Test: `test/acceptance.test.ts` (existing stat assertions), `test/e2e/app.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `export function card(label: string, value: string, sub?: string, accent?: string, small?: boolean): string` (moved verbatim from `dashboard.ts:117-130`, escaping unchanged)

- [ ] **Step 1: Move `card()` with a failing-then-passing unit check**

The helper is a pure string function, but existing coverage lives in `test/acceptance.test.ts`. First run: `npx vitest run test/acceptance.test.ts` — Expected: PASS (baseline). Then move `card()` verbatim to `src/ui/cards.ts`, update `dashboard.ts` to import it, re-run — Expected: still PASS (move is behavior-preserving by construction).

- [ ] **Step 2: Responsive shell (CSS only)**

In `src/styles/nav.css` + `responsive.css`: sidebar `.nav` (≥900px) becomes fixed bottom tab-bar (<900px) with active pill; `.toolbar .tb-row` stacks; `.dashboard` charts full-width; log tables → card rows. No DOM restructuring beyond classes already present. Verify visually via `npm run dev` at 1280/768/390px widths.

- [ ] **Step 3: A11y pass**

Add: visible `:focus-visible` rings for `.nav-tab/.tb-input/.ico-btn/button/a`; `aria-current="page"` on active nav tab in `nav.ts`; `role=dialog aria-modal` already from Task 5; `aria-live="polite"` on `#status`; keep `.skip-link`. No color-token changes.

- [ ] **Step 4: Verify everything**

Run: `npm run typecheck && npm run lint && npm run format:check` — Expected: all clean.
Run: `npm test && npm run test:property` — Expected: all PASS.
Run: `npm run build && npm run test:e2e` — Expected: build clean, all E2E PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/cards.ts src/data/dashboard.ts src/styles/ index.html src/ui/nav.ts
git commit -m "refactor: extract cards, responsive shell and a11y pass"
```

---

## File map (final state)

- `src/ui/store.ts` — `TabId, Filters, DEFAULT_FILTERS, matchesFilters, countActiveFilters`
- `src/ui/router.ts` — `TABS, parseHash, toHash`
- `src/ui/shell.ts` — dropzone states, status, progress, topbar menu wiring
- `src/ui/nav.ts` — `buildNav` + hash sync
- `src/ui/toolbar.ts` — filters UI + meter + reset
- `src/ui/modals.ts` — `openModal, shouldDismissOnKey` + 7 dialog builders
- `src/ui/cards.ts` — `card()`
- `src/styles/*.css` — `tokens, shell, nav, toolbar, cards, modals, responsive`
- `src/main.ts` — boot + ingest + persistence + wiring only (target <400 lines)
- `src/data/dashboard.ts` — charts + tab renderers only (imports `card()`)

## Self-review

- Spec coverage: architecture split → Tasks 1/4/5/6; shell+nav → Task 4; toolbar regroup → Task 4; overflow menu → Task 4 Step 3; tokens/components → Task 3; a11y → Task 6 Step 3; data-flow/error handling → Tasks 1/4 (predicate parity, unknown-hash fallback in `parseHash`); testing/rollout order → Tasks 1–6 sequence. Non-goals (framework, deps, i18n renames, filter-URL-sync, chart swap) appear in no task. Gap check: `intensity` predicate stays HR-histogram-based in `main.ts` (noted in Task 1) — no behavior change, no gap.
- Placeholder scan: no TBD/TODO; every step has exact code, exact commands, expected outputs.
- Type consistency: `TabId`/`Filters` defined once in `store.ts`, imported by `router.ts`/Tasks 4–6; `parseHash`/`toHash` signatures match Task 4 usage; `card()` signature matches `dashboard.ts:117` original.
