### Task 2: Hash router — tab ↔ URL

**Files:**
- Create: `src/ui/router.ts`
- Create: `test/ui-router.test.ts`
- Modify: none (pure addition; wiring happens in Task 4)

**Interfaces:**
- Consumes: `TabId` from `./store.ts`.
- Produces (used by Task 4):
  - `export const TABS: TabId[]` (ordered `['overview','volume','load','zones','perf','log']`)
  - `export function parseHash(hash: string): TabId` (unknown/empty → `'overview'`)
  - `export function toHash(tab: TabId): string` (e.g. `'#/load'`)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseHash, toHash } from '../src/ui/router.ts';

describe('parseHash', () => {
  it('parses known tabs', () => {
    expect(parseHash('#/load')).toBe('load');
    expect(parseHash('#/log')).toBe('log');
  });
  it('falls back to overview for empty or unknown hashes', () => {
    expect(parseHash('')).toBe('overview');
    expect(parseHash('#/nope')).toBe('overview');
    expect(parseHash('#')).toBe('overview');
  });
});

describe('toHash', () => {
  it('serializes tabs to hashes', () => {
    expect(toHash('overview')).toBe('#/overview');
    expect(toHash('zones')).toBe('#/zones');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ui-router.test.ts`
Expected: FAIL with "Failed to resolve import ../src/ui/router.ts".

- [ ] **Step 3: Write minimal implementation**

```ts
import type { TabId } from './store.ts';

export const TABS: TabId[] = ['overview', 'volume', 'load', 'zones', 'perf', 'log'];

const TAB_SET: ReadonlySet<string> = new Set(TABS);

export function parseHash(hash: string): TabId {
  const m = /^#\/([a-z]+)/.exec(hash.trim());
  const tab = m?.[1] ?? '';
  if (TAB_SET.has(tab)) return tab as TabId;
  return 'overview';
}

export function toHash(tab: TabId): string {
  return `#/${tab}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/ui-router.test.ts`
Expected: PASS (3 tests). Then run: `npm run typecheck` — Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/router.ts test/ui-router.test.ts
git commit -m "feat: add hash router for dashboard tabs"
```

---

