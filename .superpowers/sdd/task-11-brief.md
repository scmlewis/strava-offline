### Task 11: Validate activities on load from IndexedDB

**Files:**
- Modify: `src/data/db.ts`

**Interfaces:**
- Consumes: `Activity` type from `types.ts`
- Produces: `loadActivities()` skips corrupt entries with console warning

- [ ] **Step 1: Add `isValidActivity` helper to `src/data/db.ts`**

Add before `loadActivities()`:
```ts
function isValidActivity(a: unknown): a is Activity {
  if (!a || typeof a !== 'object') return false;
  const o = a as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.date === 'string' &&
    typeof o.ts === 'number' &&
    typeof o.name === 'string' &&
    typeof o.type === 'string'
  );
}
```

- [ ] **Step 2: Update `loadActivities()` to filter corrupt entries**

```ts
export async function loadActivities(): Promise<Activity[]> {
  const all = await db.activities.orderBy('ts').reverse().toArray();
  const valid: Activity[] = [];
  for (const a of all) {
    if (isValidActivity(a)) {
      valid.push(a);
    } else {
      console.warn('Strava Offline: skipping corrupt activity entry', a);
    }
  }
  return valid;
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/data/db.ts
git commit -m "feat: validate activities on load, skip corrupt entries gracefully"
```

---
