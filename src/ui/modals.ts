import type { Activity, Goals } from '../data/types.ts';
import { computeTypeBreakdown } from '../data/db.ts';
import type { ZonesConfig } from '../data/zones.ts';
import { t } from '../i18n.ts';
import { icon } from '../icons.ts';
import { esc } from '../utils.ts';
import { TABS } from './router.ts';

// ---- modal plumbing (extracted from src/main.ts) ----
// Pure close-guard kept beside `openModal` so it stays unit-testable in the
// node-env vitest suite (`openModal` itself touches `document` and is covered
// by the Playwright `?` overlay E2E test instead).

export function shouldDismissOnKey(key: string): boolean {
  return key === 'Escape';
}

export interface OpenModalOpts {
  onClose?: () => void;
  /** Extra class appended to `.modal` (e.g. `'about'`, kept verbatim). */
  modalClass?: string;
  /** Inline style for the `.modal` wrapper (e.g. `'max-width:400px'`). */
  modalStyle?: string;
}

export function openModal(html: string, opts: OpenModalOpts = {}): () => void {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const cls = opts.modalClass ? `modal ${opts.modalClass}` : 'modal';
  const style = opts.modalStyle ? ` style="${opts.modalStyle}"` : '';
  overlay.innerHTML = `<div class="${cls}" role="dialog" aria-modal="true"${style}>${html}</div>`;
  document.body.appendChild(overlay);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (shouldDismissOnKey(e.key)) close();
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector<HTMLElement>('button')?.focus();
  return close;
}

// ---- clear data modal (moved verbatim from src/main.ts) ----
export interface ClearDataActions {
  onBackupFirst: () => Promise<void>;
  onClearActivities: () => Promise<void>;
  onClearSettings: () => void;
  onClearAll: () => Promise<void>;
}

export function openClearData(count: number, actions: ClearDataActions): void {
  const close = openModal(`
      <h3>${icon('trash', 20)} ${t('clear_title')}</h3>
      <p>${t('clear_confirm', { n: count })}</p>
      <div class="modal-actions">
        <button id="clear-backup" type="button">${icon('download', 14)} ${t('clear_backup_first')}</button>
        <button id="clear-acts" type="button">${t('reset_activities')}</button>
        <button id="clear-settings" type="button">${t('reset_settings')}</button>
        <button id="clear-go" type="button" class="danger">${t('reset_everything')}</button>
        <button id="clear-cancel" type="button">${t('zones_cancel')}</button>
      </div>`);
  document.getElementById('clear-cancel')!.addEventListener('click', close);
  document.getElementById('clear-backup')!.addEventListener('click', async () => {
    await actions.onBackupFirst();
    close();
  });
  document.getElementById('clear-acts')!.addEventListener('click', async () => {
    await actions.onClearActivities();
    close();
  });
  document.getElementById('clear-settings')!.addEventListener('click', () => {
    actions.onClearSettings();
    close();
  });
  document.getElementById('clear-go')!.addEventListener('click', async () => {
    await actions.onClearAll();
    close();
  });
}

// ---- bulk delete modal (moved verbatim from src/main.ts) ----
export function openBulkDelete(
  ids: string[],
  acts: Activity[],
  onBackup: () => void,
  onDelete: (ids: string[]) => Promise<void>,
): void {
  if (!ids.length) return;
  const matched = acts.filter((a) => ids.includes(a.id));
  const breakdown = computeTypeBreakdown(matched)
    .map((b) => `${esc(b.type)} ${b.count}`)
    .join(' / ');
  const close = openModal(`
      <h3>${esc(t('bulk_title'))}</h3>
      <p>${esc(t('bulk_confirm'))}</p>
      <p class="hint">${ids.length} activities · ${breakdown}</p>
      <div class="modal-actions">
        <button id="bulk-backup" type="button">${icon('download', 14)} ${t('clear_backup_first')}</button>
        <button id="bulk-go" type="button" class="danger">${t('bulk_go')}</button>
        <button id="bulk-cancel" type="button">${t('zones_cancel')}</button>
      </div>`);
  document.getElementById('bulk-cancel')!.addEventListener('click', close);
  document.getElementById('bulk-backup')!.addEventListener('click', () => onBackup());
  let armed = ids.length <= 100;
  const goBtn = document.getElementById('bulk-go')!;
  goBtn.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      goBtn.textContent = t('bulk_go') + ' (' + ids.length + ')?';
      return;
    }
    try {
      await onDelete(ids);
    } catch {
      return; // onDelete already reported the failure; keep the modal open
    }
    close();
  });
}

// ---- zone settings modal (moved verbatim from src/main.ts) ----
export function openZoneSettings(
  cfg: ZonesConfig,
  onSave: (c: ZonesConfig) => void,
  onReset: () => void,
): void {
  const z = cfg.zones;
  const close = openModal(`
      <h3>${t('zones_title')}</h3>
      <label class="zfield">${t('zones_hrmax')}<input id="z-hrmax" type="number" value="${cfg.hrMax}" /></label>
      <label class="zfield">${t('zones_rest')}<input id="z-rest" type="number" value="${cfg.restHr}" /></label>
      <label class="zfield">${t('zones_fthr')}<input id="z-fthr" type="number" value="${cfg.fthr ?? ''}" placeholder="e.g. 180" /></label>
      <p class="det-h">${t('training_model')}</p>
      <label class="zfield">${t('ctl_tau')}<input id="z-ctltau" type="number" min="7" max="90" step="1" value="${cfg.ctlTau}" /></label>
      <label class="zfield">${t('atl_tau')}<input id="z-atltau" type="number" min="3" max="30" step="1" value="${cfg.atlTau}" /></label>
      <label class="zfield">${t('tss_factor')}<input id="z-tssfactor" type="number" min="0.5" max="5" step="0.01" value="${cfg.tssFactor}" /></label>
      <p class="det-h">${t('zone_names_and_bounds')}</p>
      ${z.map((zn, i) => `<div class="zrow"><input id="z-name${i}" type="text" value="${esc(zn.name)}" style="width:100px" /><input id="z-z${i}" type="number" step="0.01" value="${zn.hi}" /></div>`).join('')}
      <div class="modal-actions">
        <button id="z-save" type="button">${t('zones_save')}</button>
        <button id="z-reset" type="button">${t('zones_reset')}</button>
        <button id="z-close" type="button">${t('zones_cancel')}</button>
      </div>`);
  document.getElementById('z-close')!.addEventListener('click', close);
  document.getElementById('z-reset')!.addEventListener('click', () => {
    onReset();
    close();
  });
  document.getElementById('z-save')!.addEventListener('click', () => {
    const hrMax = Number((document.getElementById('z-hrmax') as HTMLInputElement).value);
    const restHr = Number((document.getElementById('z-rest') as HTMLInputElement).value);
    const fthrRaw = (document.getElementById('z-fthr') as HTMLInputElement).value;
    const fthr = fthrRaw ? Number(fthrRaw) : undefined;
    const ctlTau = Number((document.getElementById('z-ctltau') as HTMLInputElement).value) || 42;
    const atlTau = Number((document.getElementById('z-atltau') as HTMLInputElement).value) || 7;
    const tssFactor =
      Number((document.getElementById('z-tssfactor') as HTMLInputElement).value) || 2.06;
    const zones = cfg.zones.map((zn, i) => ({
      name: (document.getElementById(`z-name${i}`) as HTMLInputElement).value || zn.name,
      lo: zn.lo,
      hi: Math.min(1.01, Number((document.getElementById(`z-z${i}`) as HTMLInputElement).value)),
    }));
    for (let i = 0; i < zones.length; i++) zones[i].lo = i === 0 ? 0 : zones[i - 1].hi;
    onSave({ ...cfg, hrMax, restHr, fthr, ctlTau, atlTau, tssFactor, zones });
    close();
  });
}

// ---- goals modal (moved verbatim from src/main.ts) ----
export function openGoalsDialog(goals: Goals, onSave: (g: Goals) => void): void {
  const close = openModal(`
      <h3>${t('goals_title')}</h3>
      <label class="zfield">${t('goals_weekly')}<input id="g-wk" type="number" min="0" step="1" value="${goals.weeklyKm ?? ''}" placeholder="e.g. 40" /></label>
      <label class="zfield">${t('goals_easy')}<input id="g-easy" type="number" min="0" max="100" step="1" value="${goals.easyPct}" /></label>
      <label class="zfield">${t('easy_zones')}<input id="g-easyzones" type="number" min="1" max="5" step="1" value="${goals.easyZones}" /></label>
      <label class="zfield">${t('riegel_exp')}<input id="g-riegel" type="number" min="0.8" max="1.5" step="0.01" value="${goals.riegelExp}" /></label>
      <div class="modal-actions">
        <button id="g-save" type="button">${t('zones_save')}</button>
        <button id="g-close" type="button">${t('zones_cancel')}</button>
      </div>`);
  document.getElementById('g-close')!.addEventListener('click', close);
  document.getElementById('g-save')!.addEventListener('click', () => {
    const wk = (document.getElementById('g-wk') as HTMLInputElement).value;
    onSave({
      weeklyKm: wk ? Number(wk) : null,
      easyPct: Number((document.getElementById('g-easy') as HTMLInputElement).value) || 80,
      riegelExp: Number((document.getElementById('g-riegel') as HTMLInputElement).value) || 1.06,
      easyZones: Number((document.getElementById('g-easyzones') as HTMLInputElement).value) || 2,
    });
    close();
  });
}

// ---- About modal (moved verbatim from src/main.ts) ----
export function openAbout(): void {
  const close = openModal(
    `
      <h2>${icon('info', 20)} ${t('about_title')}</h2>
      <p>${t('about_p1')}</p>
      <h3>${t('about_how')}</h3>
      <ol>
        <li>${t('about_step1')}</li>
        <li>${t('about_step2')}</li>
        <li>${t('about_step3')}</li>
        <li>${t('about_step4')}</li>
        <li>${t('about_step5')}</li>
      </ol>
      <h3>${t('about_features')}</h3>
      <ul>
        <li>${t('about_f1')}</li>
        <li>${t('about_f2')}</li>
        <li>${t('about_f3')}</li>
        <li>${t('about_f4')}</li>
        <li>${t('about_f5')}</li>
        <li>${t('about_f6')}</li>
      </ul>
      <p class="hint">${t('about_safe')}</p>
      <div class="modal-actions"><button id="about-close" type="button">${t('about_ok')}</button></div>
    `,
    { modalClass: 'about' },
  );
  document.getElementById('about-close')!.addEventListener('click', close);
}

// ---- delete-single confirm (moved verbatim from src/main.ts) ----
// The delete-single flow itself (`deleteSingleActivity`, `lastDeleted`,
// `undoTimer`) stays in main.ts; only the dialog DOM moved here.
export function openDeleteConfirm(target: Activity, onConfirm: () => void): void {
  const close = openModal(`
      <h3>${esc(t('del_activity'))}</h3>
      <p>${esc(t('del_confirm'))}</p>
      <p class="hint">${esc(target.name || '—')} · ${esc(target.date)}</p>
      <div class="modal-actions">
        <button id="del-cancel" type="button">${t('zones_cancel')}</button>
        <button id="del-go" type="button" class="danger">${t('del_go')}</button>
      </div>`);
  document.getElementById('del-cancel')!.addEventListener('click', close);
  document.getElementById('del-go')!.addEventListener('click', () => {
    close();
    onConfirm();
  });
  document.getElementById('del-cancel')!.focus();
}

// ---- shortcuts overlay (moved verbatim from src/main.ts) ----
export function openShortcutsOverlay(): void {
  const close = openModal(
    `
      <h3>${esc(t('shortcuts_title'))}</h3>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 16px;margin-top:12px;font-size:0.9em">
        <kbd>?</kbd><span>${esc(t('shortcuts_help'))}</span>
        <kbd>1</kbd>-<kbd>${TABS.length}</kbd><span>${esc(t('shortcuts_tabs'))}</span>
        <kbd>/</kbd><span>${esc(t('shortcuts_search'))}</span>
        <kbd>U</kbd><span>${esc(t('del_undo'))}</span>
        <kbd>Esc</kbd><span>${esc(t('shortcuts_close'))}</span>
      </div>
      <button class="btn" style="margin-top:16px" id="close-shortcuts">${esc(t('close'))}</button>
    `,
    { modalStyle: 'max-width:400px' },
  );
  document.getElementById('close-shortcuts')!.addEventListener('click', close);
}
