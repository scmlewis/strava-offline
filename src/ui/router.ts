import type { TabId } from './store.ts';

export const TABS: TabId[] = ['overview', 'volume', 'load', 'zones', 'perf', 'log'];

const TAB_SET: ReadonlySet<string> = new Set(TABS);

export function parseHash(hash: string): TabId {
  const m = /^#\/([a-z]+)/.exec(hash.trim());
  const tab = m?.[1] ?? '';
  if (TAB_SET.has(tab)) return tab as TabId;
  return 'overview';
}

export function toHash(tab: TabId): string {
  return `#/${tab}`;
}
