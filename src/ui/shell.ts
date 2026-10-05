import { t } from '../i18n.ts';

// ---- app shell helpers (moved verbatim from src/main.ts) ----
// These query their own DOM elements so every call site in main.ts
// (`setDropzoneCompact(true)`, `setStatus(...)`, …) stays unchanged.

export function applyShellI18n(): void {
  const set = (id: string, key: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  };
  set('app-title', 'app_title');
  set('app-sub', 'app_sub');
  set('dropzone-title', 'dropzone_title');
  set('dropzone-sub', 'dropzone_sub');
  const pick = document.getElementById('pick-btn');
  if (pick) pick.textContent = t('choose_file');
  const pickMini = document.getElementById('pick-btn-mini');
  if (pickMini) pickMini.textContent = t('choose_file');
  document.documentElement.lang = 'en';
}

let statusTimer = 0;
export function setStatus(msg: string, kind: 'ok' | 'err' | 'info' = 'info'): void {
  const statusEl = document.getElementById('status') as HTMLDivElement;
  statusEl.hidden = false;
  statusEl.className = `status ${kind}`;
  statusEl.textContent = msg;
  // Auto-dismiss success/info after 3s
  if (kind !== 'err') {
    clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      statusEl.hidden = true;
    }, 3000);
  }
}

export function showProgress(done: number, total: number, phase: string): void {
  const progressEl = document.getElementById('progress') as HTMLDivElement;
  const progressFill = document.getElementById('progress-fill') as HTMLDivElement;
  const progressLabel = document.getElementById('progress-label') as HTMLSpanElement;
  progressEl.hidden = false;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  progressFill.style.width = `${pct}%`;
  progressLabel.textContent = total > 0 ? t('st_progress', { done, total }) : t('st_parsing');
  if (phase) progressLabel.textContent += ` · ${phase}`;
}

export function hideProgress(): void {
  const progressEl = document.getElementById('progress') as HTMLDivElement;
  const progressFill = document.getElementById('progress-fill') as HTMLDivElement;
  progressEl.hidden = true;
  progressFill.style.width = '0%';
}

// ---- drag & drop (compact when data present, expands on any document drag) ----
export function setDropzoneCompact(compact: boolean): void {
  const dropzone = document.getElementById('dropzone') as HTMLDivElement;
  dropzone.classList.toggle('compact', compact);
  dropzone.querySelector('.dz-full')?.classList.toggle('hidden', compact);
  dropzone.querySelector('.dz-mini')?.classList.toggle('hidden', !compact);
}
