### Task 10: Add global error boundary

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `setStatus()` function, `esc()` utility
- Produces: Uncaught errors displayed to user via status bar

- [ ] **Step 1: Add error handlers at the end of `main.ts` (before boot sequence)**

Add before the boot sequence (around line 715):
```ts
// Global error boundary — show uncaught errors in the status bar
window.addEventListener('error', (ev) => {
  const msg = ev.message || 'Unknown error';
  console.error('Uncaught error:', ev.error);
  statusEl.textContent = t('error_generic', { message: msg }) || `Error: ${msg}`;
  statusEl.className = 'status err';
  statusEl.style.display = '';
});

window.addEventListener('unhandledrejection', (ev) => {
  const msg = ev.reason instanceof Error ? ev.reason.message : String(ev.reason);
  console.error('Unhandled rejection:', ev.reason);
  statusEl.textContent = t('error_generic', { message: msg }) || `Error: ${msg}`;
  statusEl.className = 'status err';
  statusEl.style.display = '';
});
```

- [ ] **Step 2: Add `error_generic` key to `src/i18n.ts`**

Add to the `EN` dictionary:
```ts
error_generic: 'Something went wrong: {message}',
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: Clean pass.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/i18n.ts
git commit -m "feat: add global error boundary with user-friendly messages"
```

---
