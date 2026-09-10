### Task 16: Add dark/light theme toggle

**Files:**
- Modify: `src/styles.css`
- Modify: `src/main.ts`
- Modify: `src/i18n.ts`

**Interfaces:**
- Consumes: existing M3 CSS custom properties, `localStorage` persistence
- Produces: Theme toggle button in toolbar, persisted preference

- [ ] **Step 1: Add light theme CSS variables to `src/styles.css`**

After the existing `:root` block, add:
```css
@media (prefers-color-scheme: light) {
  :root {
    --surface-dim: #f3f3f3;
    --surface: #ffffff;
    --surface-container-lowest: #ffffff;
    --surface-container-low: #f7f7f7;
    --surface-container: #ededed;
    --surface-container-high: #e2e2e2;
    --surface-container-highest: #d6d6d6;
    --on-surface: #1c1b1f;
    --on-surface-variant: #44474f;
    --primary: #006c4c;
    --on-primary: #ffffff;
    --primary-container: #8af8c7;
    --error: #ba1a1a;
    --outline: #74777f;
    --outline-variant: #c4c6cf;
  }
}

html[data-theme="light"] {
  --surface-dim: #f3f3f3;
  --surface: #ffffff;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #f7f7f7;
  --surface-container: #ededed;
  --surface-container-high: #e2e2e2;
  --surface-container-highest: #d6d6d6;
  --on-surface: #1c1b1f;
  --on-surface-variant: #44474f;
  --primary: #006c4c;
  --on-primary: #ffffff;
  --primary-container: #8af8c7;
  --error: #ba1a1a;
  --outline: #74777f;
  --outline-variant: #c4c6cf;
}

html[data-theme="dark"] {
  --surface-dim: #0c0f14;
  --surface: #111318;
  --surface-container-lowest: #0b0e13;
  --surface-container-low: #0e1116;
  --surface-container: #13161b;
  --surface-container-high: #1d2025;
  --surface-container-highest: #282a2f;
  --on-surface: #e1e2e8;
  --on-surface-variant: #c4c6cf;
  --primary: #34d399;
  --on-primary: #003824;
  --primary-container: #005236;
  --error: #ffb4ab;
  --outline: #8e9099;
  --outline-variant: #44474f;
}
```

- [ ] **Step 2: Add theme toggle logic in `main.ts`**

Add theme persistence and toggle:
```ts
let theme: 'dark' | 'light' | 'system' = loadTheme();

function loadTheme(): 'dark' | 'light' | 'system' {
  try {
    const raw = localStorage.getItem('theme');
    if (raw === 'light' || raw === 'dark') return raw;
  } catch { /* ignore */ }
  return 'system';
}

function saveTheme(t: 'dark' | 'light' | 'system') {
  theme = t;
  localStorage.setItem('theme', t);
  applyTheme();
}

function applyTheme() {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

applyTheme();
```

Add a toggle button handler (in `buildToolbar` or similar):
```ts
function cycleTheme() {
  const order: Array<'dark' | 'light' | 'system'> = ['dark', 'light', 'system'];
  const next = order[(order.indexOf(theme) + 1) % order.length];
  saveTheme(next);
  showToast(t('theme_changed', { theme: t(`theme_${next}`) }) || `Theme: ${next}`, 'info');
}
```

- [ ] **Step 3: Add theme i18n keys**

```ts
theme_dark: 'Dark',
theme_light: 'Light',
theme_system: 'System',
theme_changed: 'Theme: {theme}',
```

- [ ] **Step 4: Add theme toggle button to toolbar**

In the toolbar HTML, add a theme toggle button with the `contrast` or `sun` icon.

- [ ] **Step 5: Run typecheck, lint, and tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/styles.css src/main.ts src/i18n.ts
git commit -m "feat: add dark/light theme toggle with system preference support"
```

---
