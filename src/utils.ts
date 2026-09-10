/** Escape HTML entities to prevent XSS when building innerHTML from user data. */
export function esc(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

/** Convert a timestamp to a local YYYY-MM-DD string (avoids UTC drift from toISOString). */
export function toLocalDate(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Today's date as local YYYY-MM-DD. */
export function todayLocal(): string {
  return toLocalDate(Date.now());
}

/** Yesterday's date as local YYYY-MM-DD. */
export function yesterdayLocal(): string {
  return toLocalDate(Date.now() - 86400000);
}
