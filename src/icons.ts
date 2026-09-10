// Inline stroke icons (Lucide/Feather style) — replaces emoji to avoid
// cross-platform rendering inconsistency and the "AI slop" look.
// All icons are 24x24, use currentColor, and carry aria-hidden.

export type IconName =
  | 'filter'
  | 'tag'
  | 'calendar'
  | 'week'
  | 'flame'
  | 'map'
  | 'ruler'
  | 'download'
  | 'upload'
  | 'heart'
  | 'target'
  | 'info'
  | 'x'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'overview'
  | 'activity'
  | 'star'
  | 'list'
  | 'refresh'
  | 'inbox'
  | 'trash'
  | 'contrast';

const PATHS: Record<IconName, string> = {
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
  tag: '<path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3H4v5.59A2 2 0 0 0 3.83 11l9.58 9.58a2 2 0 0 0 2.83 0l4.35-4.35a2 2 0 0 0 0-2.82z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  calendar:
    '<rect x="3" y="4.5" width="18" height="17" rx="2"/><path d="M16 2.5v4M8 2.5v4M3 9.5h18"/>',
  week: '<rect x="3" y="4.5" width="18" height="17" rx="2"/><path d="M3 9.5h18M8 4.5v17M12 4.5v17M16 4.5v17"/>',
  flame:
    '<path d="M12 2.5c.5 3 3.5 4.5 3.5 8a3.5 3.5 0 0 1-7 0c0-1 .5-1.8 1-2.5-1.8 1-3 3-3 5a6.5 6.5 0 0 0 13 0c0-4.5-6.5-9-6.5-10.5z"/>',
  map: '<path d="M9 3 3 5.5v15L9 18l6 2 6-2.5v-15L15 5l-6 2z"/><path d="M9 3v15M15 5v15"/>',
  ruler:
    '<path d="M3.5 11.5 12.5 2.5l8 8-9 9z"/><path d="M8 7l1.5 1.5M11 10l1.5 1.5M14 13l1.5 1.5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 8l5-5 5 5M12 3v12"/>',
  heart:
    '<path d="M19 13.5c1.4-1.4 2.8-3.1 2.8-5.3a4 4 0 0 0-6.8-2.8L12 7.2l-3-1.8A4 4 0 0 0 2.2 8.2c0 2.2 1.4 3.9 2.8 5.3l7 6.8 7-6.8z"/>',
  target:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  'chevron-down': '<path d="M6 9l6 6 6-6"/>',
  'chevron-left': '<path d="M15 6l-6 6 6 6"/>',
  'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  overview:
    '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  activity: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  refresh:
    '<path d="M3.5 12a8.5 8.5 0 0 1 14.5-6L21 7.5M21 3.5v4h-4M20.5 12a8.5 8.5 0 0 1-14.5 6L3 16.5M3 20.5v-4h4"/>',
  inbox:
    '<path d="M22 12.5h-6.5L13.5 16H10.5l-2-3.5H2"/><path d="M4.5 5h15l3 7.5v5a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-5z"/>',
  trash:
    '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>',
  contrast:
    '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z"/>',
};

export function icon(name: IconName, size = 16): string {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
}
