### Task 6: Move jszip to runtime dependencies

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: `jszip` is imported in `src/data/zip.ts` (runtime code)
- Produces: `jszip` listed under `dependencies` instead of `devDependencies`

- [ ] **Step 1: Move jszip from devDependencies to dependencies**

In `package.json`, remove `"jszip"` from `devDependencies` and add it to `dependencies`:
```json
"dependencies": {
  "dexie": "^4.0.8",
  "fit-file-parser": "^5.0.2",
  "jszip": "^3.10.1",
  "pako": "^2.2.0",
  "papaparse": "^5.4.1",
  "uplot": "^1.6.31"
}
```

- [ ] **Step 2: Run `npm install` to update lockfile**

Run: `npm install`

- [ ] **Step 3: Verify build still works**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "fix: move jszip to runtime dependencies (used in src/data/zip.ts)"
```

---
