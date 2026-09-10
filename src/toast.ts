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
