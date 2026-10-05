export function card(
  label: string,
  value: string,
  sub?: string,
  accent?: string,
  small?: boolean,
): string {
  const style = accent ? ` style="--card-accent:${accent}"` : '';
  return `<div class="card${small ? ' card-sm' : ''}"${style}>
    <div class="card-label">${label}</div>
    <div class="card-value">${value}</div>
    ${sub ? `<div class="card-sub">${sub}</div>` : ''}
  </div>`;
}
