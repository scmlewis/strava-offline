import { TABS } from './router.ts';
import type { TabId } from './store.ts';
import { t } from '../i18n.ts';
import { icon, type IconName } from '../icons.ts';

const NAV_ICONS: Record<TabId, IconName> = {
  overview: 'overview',
  volume: 'activity',
  load: 'flame',
  zones: 'heart',
  perf: 'star',
  log: 'list',
};

const NAV_LABEL_KEYS: Record<TabId, string> = {
  overview: 'nav_overview',
  volume: 'nav_volume',
  load: 'nav_load',
  zones: 'nav_zones',
  perf: 'nav_perf',
  log: 'nav_log',
};

export function buildNav(nav: HTMLElement, active: TabId, onSelect: (t: TabId) => void): void {
  nav.innerHTML = TABS.map(
    (id) =>
      `<button class="nav-tab${active === id ? ' active' : ''}" data-tab="${id}" data-testid="nav-tab-${id}">
      <span class="nav-ico">${icon(NAV_ICONS[id], 20)}</span><span class="nav-lbl">${t(NAV_LABEL_KEYS[id])}</span>
    </button>`,
  ).join('');
  nav.querySelectorAll<HTMLButtonElement>('.nav-tab').forEach((b) => {
    b.addEventListener('click', () => {
      onSelect(b.dataset.tab as TabId);
    });
  });
}
