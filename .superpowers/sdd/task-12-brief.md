### Task 12: Add backup size warning

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `exportBackup()` from `db.ts`
- Produces: Warning dialog if backup exceeds 50MB before download

- [ ] **Step 1: Find the backup export handler in `main.ts`**

Search for `onBackup` or the backup download logic. It likely creates a `Blob` and triggers a download via `URL.createObjectURL`.

- [ ] **Step 2: Add size check before download**

After creating the backup bundle and converting to JSON, add:
```ts
const json = JSON.stringify(bundle);
const sizeMB = new Blob([json]).size / (1024 * 1024);
if (sizeMB > 50) {
  const proceed = window.confirm(
    t('backup_large', { size: sizeMB.toFixed(1) }) ||
    `Backup is ${sizeMB.toFixed(1)} MB. This may take a while to download and restore. Continue?`
  );
  if (!proceed) return;
}
```

- [ ] **Step 3: Add `backup_large` key to `src/i18n.ts`**

Add to the `EN` dictionary:
```ts
backup_large: 'Backup is {size} MB. This may take a while to download and restore. Continue?',
```

- [ ] **Step 4: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: Clean pass.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/i18n.ts
git commit -m "feat: warn user before downloading backups larger than 50MB"
```

---

## Phase 4: UX Polish (Priority 4)
