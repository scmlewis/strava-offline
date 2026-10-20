export function card(
  label: string,
  value: string,
  sub?: string,
  accent?: string,
  small?: boolean,
): string {
  const style = accent ? ` style="--card-accent:${accent}"` : '';
  const baseClasses = small ? 'card-sm' : '';
  const interactiveClasses = 'card-interactive';
  
  return `<div class="card ${baseClasses} ${interactiveClasses}"${style}>
    <div class="card-label">${label}</div>
    <div class="card-value">${value}</div>
    ${sub ? `<div class="card-sub">${sub}</div>` : ''}
  </div>`;
}

export function cardModern(
  label: string,
  value: string,
  sub?: string,
  accent?: string,
  trend?: 'up' | 'down' | 'neutral',
  trendValue?: string,
): string {
  const trendIcon = trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→';
  const trendColor = trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-600';
  const accentStyle = accent ? ` style="--card-accent:${accent}"` : '';
  
  return `<div class="card card-modern hover-elevate"${accentStyle}>
    <div class="card-header">
      <div class="card-label">${label}</div>
      ${trend ? `<div class="card-trend ${trendColor}">${trendIcon} ${trendValue}</div>` : ''}
    </div>
    <div class="card-value-group">
      <div class="card-value-main">${value}</div>
      ${sub ? `<div class="card-sub text-sm text-muted">${sub}</div>` : ''}
    </div>
  </div>`;
}
