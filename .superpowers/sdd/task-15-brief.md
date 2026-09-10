### Task 15: Add toast notification system

**Files:**
- Create: `src/toast.ts`
- Modify: `src/styles.css`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `esc()` from `utils.ts`, `t()` from `i18n.ts`
- Produces: `showToast(message, type?)` function used throughout the app

- [ ] **Step 1: Create `src/toast.ts`**

```ts
import { esc } from './utils';

export type ToastType = 'success' | 'error' | 'info';

let container: HTMLDivElement | null = null;

function ensureContainer(): HTMLDivElement {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message: string, type: ToastType = 'info', durationMs = 4000): void {
  const c = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${esc(message)}</span>`;
  c.appendChild(toast);

  // Trigger enter animation
  requestAnimationFrame(() => toast.classList.add('toast-visible'));

  setTimeout(() => {
    toast.classList.remove('toast-visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, durationMs);
}
```

- [ ] **Step 2: Add toast styles to `src/styles.css`**

```css
.toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast {
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 0.9em;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 0.25s, transform 0.25s;
  pointer-events: auto;
}

.toast-visible {
  opacity: 1;
  transform: translateY(0);
}

.toast-success {
  background: var(--primary);
  color: #000;
}

.toast-error {
  background: var(--error);
  color: #fff;
}

.toast-info {
  background: var(--surface-container-high);
  color: var(--on-surface);
}

@media (max-width: 760px) {
  .toast-container {
    bottom: 80px;
    right: 12px;
    left: 12px;
  }
}
```

- [ ] **Step 3: Replace key `setStatus` calls in `main.ts` with `showToast`**

In `handleFiles()` and other success paths, replace status bar updates with toast notifications:
```ts
import { showToast } from './toast';
// In handleFiles after successful import:
showToast(`Imported ${summary.activities.length} activities`, 'success');
if (summary.issues.length > 0) {
  showToast(`${summary.issues.length} files had issues`, 'error', 6000);
}
```

Keep `setStatus()` for the progress bar during import (it's a different UX pattern — persistent status vs. transient toast).

- [ ] **Step 4: Run typecheck, lint, and tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/toast.ts src/styles.css src/main.ts
git commit -m "feat: add toast notification system for transient messages"
```

---
