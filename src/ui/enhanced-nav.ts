// Enhanced navigation using modern patterns
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

const NAV_LABELS: Record<TabId, string> = {
  overview: 'nav_overview',
  volume: 'nav_volume',
  load: 'nav_load',
  zones: 'nav_zones',
  perf: 'nav_perf',
  log: 'nav_log',
};

export function buildNavModern(nav: HTMLElement, active: TabId, onSelect: (t: TabId) => void): void {
  const navItems = TABS.map((id) => {
    const isActive = active === id;
    const iconName = NAV_ICONS[id];
    const label = t(NAV_LABELS[id]);
    
    return `
      <button 
        class="nav-tab-modern ${isActive ? 'nav-tab-active' : 'nav-tab-inactive'}"
        data-tab="${id}"
        data-testid="nav-tab-${id}"
        aria-current="page"${isActive ? ' aria-current="page"' : ''}
      >
        <span class="nav-tab-icon ${isActive ? 'nav-tab-icon-active' : ''}">
          ${icon(iconName, 20)}
        </span>
        <span class="nav-tab-label ${isActive ? 'nav-tab-label-active' : ''}">
          ${label}
        </span>
      </button>
    `;
  }).join('');
  
  nav.innerHTML = navItems;
  
  nav.querySelectorAll<HTMLButtonElement>('.nav-tab-modern').forEach((button) => {
    button.addEventListener('click', () => {
      const tabId = button.dataset.tab as TabId;
      onSelect(tabId);
      
      // Update active state
      nav.querySelectorAll('.nav-tab-modern').forEach(btn => {
        const btnTabId = btn.dataset.tab as TabId;
        const isActive = btnTabId === tabId;
        btn.className = `nav-tab-modern ${isActive ? 'nav-tab-active' : 'nav-tab-inactive'}`;
      });
    });
  });
}

export function buildNavCompact(nav: HTMLElement, active: TabId, onSelect: (t: TabId) => void): void {
  const navItems = TABS.map((id) => {
    const isActive = active === id;
    const iconName = NAV_ICONS[id];
    
    return `
      <button 
        class="nav-tab-compact ${isActive ? 'nav-tab-compact-active' : ''}"
        data-tab="${id}"
        data-testid="nav-tab-${id}"
        aria-label="${t(NAV_LABELS[id])}"
        title="${t(NAV_LABELS[id])}"
      >
        <span class="nav-tab-icon-compact ${isActive ? 'nav-tab-icon-compact-active' : ''}">
          ${icon(iconName, 24)}
        </span>
      </button>
    `;
  }).join('');
  
  nav.innerHTML = navItems;
  
  nav.querySelectorAll<HTMLButtonElement>('.nav-tab-compact').forEach((button) => {
    button.addEventListener('click', () => {
      const tabId = button.dataset.tab as TabId;
      onSelect(tabId);
    });
  });
}

export function buildNavWithBadges(nav: HTMLElement, active: TabId, onSelect: (t: TabId) => void, badgeCounts?: Partial<Record<TabId, number>>): void {
  const navItems = TABS.map((id) => {
    const isActive = active === id;
    const iconName = NAV_ICONS[id];
    const label = t(NAV_LABELS[id]);
    const badgeCount = badgeCounts?.[id];
    
    const badgeHtml = badgeCount !== undefined ? `
      <span class="nav-badge ${isActive ? 'nav-badge-active' : ''}">${badgeCount}</span>
    ` : '';
    
    return `
      <button 
        class="nav-tab-with-badge ${isActive ? 'nav-tab-with-badge-active' : ''}"
        data-tab="${id}"
        data-testid="nav-tab-${id}"
        aria-current="page"${isActive ? ' aria-current="page"' : ''}
      >
        <span class="nav-tab-icon-with-badge ${isActive ? 'nav-tab-icon-with-badge-active' : ''}">
          ${icon(iconName, 20)}
        </span>
        <span class="nav-tab-label-with-badge ${isActive ? 'nav-tab-label-with-badge-active' : ''}">
          ${label}
        </span>
        ${badgeHtml}
      </button>
    `;
  }).join('');
  
  nav.innerHTML = navItems;
  
  nav.querySelectorAll<HTMLButtonElement>('.nav-tab-with-badge').forEach((button) => {
    button.addEventListener('click', () => {
      const tabId = button.dataset.tab as TabId;
      onSelect(tabId);
    });
  });
}