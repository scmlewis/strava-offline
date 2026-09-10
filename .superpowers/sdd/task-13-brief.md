### Task 13: Add keyboard shortcuts

**Files:**
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Modify: `src/i18n.ts`

**Interfaces:**
- Consumes: `TABS` array, modal open/close functions, search input
- Produces: `?` overlay, `1-6` tab switch, `/` search focus, `Esc` modal close

- [ ] **Step 1: Add keyboard event listener in `main.ts`**

Add after the global error handlers (from Task 10):
```ts
// Keyboard shortcuts
document.addEventListener('keydown', (ev) => {
  // Ignore if typing in an input/textarea
  if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;

  if (ev.key === '?') {
    ev.preventDefault();
    openShortcutsOverlay();
    return;
  }

  if (ev.key === '/') {
    ev.preventDefault();
    const searchInput = document.querySelector('.toolbar input[type="text"]') as HTMLInputElement | null;
    if (searchInput) searchInput.focus();
    return;
  }

  // Tab switching: 1-6
  const num = parseInt(ev.key, 10);
  if (num >= 1 && num <= TABS.length && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
    ev.preventDefault();
    ctx.tab = TABS[num - 1].id;
    ctx.page = 0;
    onCtxChange(ctx);
    return;
  }
});
```

- [ ] **Step 2: Add `openShortcutsOverlay` function in `main.ts`**

```ts
function openShortcutsOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:400px">
      <h3>${esc(t('shortcuts_title'))}</h3>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 16px;margin-top:12px;font-size:0.9em">
        <kbd>?</kbd><span>${esc(t('shortcuts_help'))}</span>
        <kbd>1</kbd>-<kbd>${TABS.length}</kbd><span>${esc(t('shortcuts_tabs'))}</span>
        <kbd>/</kbd><span>${esc(t('shortcuts_search'))}</span>
        <kbd>Esc</kbd><span>${esc(t('shortcuts_close'))}</span>
      </div>
      <button class="btn" style="margin-top:16px" id="close-shortcuts">${esc(t('close'))}</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay || (ev.target as HTMLElement).id === 'close-shortcuts') overlay.remove();
  });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onEsc); }
  });
}
```

- [ ] **Step 3: Add i18n keys to `src/i18n.ts`**

Add to the `EN` dictionary:
```ts
shortcuts_title: 'Keyboard Shortcuts',
shortcuts_help: 'Show this help',
shortcuts_tabs: 'Switch tab',
shortcuts_search: 'Focus search',
shortcuts_close: 'Close modal / overlay',
close: 'Close',
```

- [ ] **Step 4: Add `<kbd>` styles to `src/styles.css`**

Add to `styles.css`:
```css
kbd {
  display: inline-block;
  padding: 2px 6px;
  font-family: inherit;
  font-size: 0.85em;
  background: var(--surface-container);
  border: 1px solid var(--outline);
  border-radius: 4px;
  min-width: 24px;
  text-align: center;
}
```

- [ ] **Step 5: Run typecheck, lint, and tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/i18n.ts src/styles.css
git commit -m "feat: add keyboard shortcuts (? help, 1-6 tabs, / search, Esc close)"
```

---
