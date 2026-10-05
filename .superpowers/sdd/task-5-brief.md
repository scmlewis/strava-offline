### Task 5: Modals consolidation

**Files:**
- Create: `src/ui/modals.ts`
- Modify: `src/main.ts` (replace 7 inline modal builders with imports; delete moved code)
- Test: existing E2E `?` overlay test + new Esc-dismiss test for zones modal

**Interfaces:**
- Consumes: `t` from `../i18n.ts`; `icon` from `../icons.ts`; zone/goal types from `../data/zones.ts` and `../data/types.ts`.
- Produces:
  - `export function openModal(html: string, opts?: { onClose?: () => void }): () => void` (creates `.overlay` + `.modal`, wires Esc + overlay-click close, focuses first button, returns `close`)
  - `export function openZoneSettings(cfg: ZonesConfig, onSave: (c: ZonesConfig) => void, onReset: () => void): void`
  - `export function openGoalsDialog(goals: Goals, onSave: (g: Goals) => void): void`
  - (clear-data, bulk-delete, delete-confirm, about, shortcuts move in the same mechanical way, keeping markup/ids verbatim)

- [ ] **Step 1: Write the failing test (pure helper part, node-env safe)**

The DOM-touching `openModal` cannot run in node env, so test the pure close-guard logic extracted alongside it. Create `test/ui-modals.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shouldDismissOnKey } from '../src/ui/modals.ts';

describe('shouldDismissOnKey', () => {
  it('dismisses on Escape only', () => {
    expect(shouldDismissOnKey('Escape')).toBe(true);
    expect(shouldDismissOnKey('Enter')).toBe(false);
  });
});
```

with `export function shouldDismissOnKey(key: string): boolean { return key === 'Escape'; }` living in `modals.ts` next to `openModal`. Run: `npx vitest run test/ui-modals.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 2: Implement `modals.ts`**

```ts
export function shouldDismissOnKey(key: string): boolean {
  return key === 'Escape';
}

export function openModal(html: string, opts: { onClose?: () => void } = {}): () => void {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(overlay);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (shouldDismissOnKey(e.key)) close();
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector<HTMLElement>('button')?.focus();
  return close;
}
```

Then move each of the 7 modal builders from `main.ts` onto `openModal`, keeping inner HTML/ids/handlers verbatim (only `document.createElement('div')` + `className` + `appendChild` boilerplate is deleted).

- [ ] **Step 3: Verify**

Run: `npx vitest run test/ui-modals.test.ts` — Expected: PASS.
Run: `npm run typecheck` — Expected: clean.
Run: `npx playwright test test/e2e/app.spec.ts -g "help overlay"` — Expected: PASS (`?` opens, `Escape` closes).

- [ ] **Step 4: Full suite**

Run: `npm test && npm run test:e2e`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/modals.ts src/main.ts test/ui-modals.test.ts
git commit -m "refactor: consolidate modals behind openModal helper"
```

---

