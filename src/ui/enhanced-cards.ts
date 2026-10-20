// Enhanced UI components using 21st.dev patterns
import { t } from '../i18n.ts';
import { icon, type IconName } from '../icons.ts';

export function cardStat(
  label: string,
  value: string,
  sub?: string,
  accent?: string,
  trend?: 'up' | 'down' | 'neutral',
  trendValue?: string,
  iconName?: IconName,
): string {
  const trendIndicator = trend ? `
    <div class="stat-trend ${trend === 'up' ? 'trend-up' : trend === 'down' ? 'trend-down' : ''}">
      <span class="trend-arrow">${trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}</span>
      <span class="trend-value">${trendValue}</span>
    </div>` : '';
  
  const iconHtml = iconName ? `<div class="stat-icon">${icon(iconName, 24)}</div>` : '';
  const accentStyle = accent ? ` style="--stat-accent:${accent}"` : '';
  
  return `<div class="stat-card hover-lift"${accentStyle}>
    ${iconHtml}
    <div class="stat-content">
      <div class="stat-label text-sm text-muted font-medium mb-1">${label}</div>
      <div class="stat-value text-2xl font-bold text-on-surface my-2">${value}</div>
      ${sub ? `<div class="stat-sub text-sm text-muted">${sub}</div>` : ''}
      ${trendIndicator}
    </div>
  </div>`;
}

export function cardMetric(
  title: string,
  value: string,
  unit?: string,
  maxValue?: number,
  color?: 'primary' | 'secondary' | 'accent' | 'warning' | 'danger',
): string {
  const percentage = maxValue ? Math.min((parseFloat(value) / maxValue) * 100, 100) : 0;
  const colorClass = color ? `metric-${color}` : 'metric-primary';
  
  return `<div class="metric-card">
    <div class="metric-header">
      <div class="metric-title text-sm font-medium text-muted">${title}</div>
      <div class="metric-color-indicator ${colorClass}"></div>
    </div>
    <div class="metric-body">
      <div class="metric-value text-3xl font-bold text-on-surface">
        ${value}${unit ? `<span class="metric-unit text-lg font-normal text-muted ml-1">${unit}</span>` : ''}
      </div>
      <div class="metric-bar-container">
        <div class="metric-bar-bg">
          <div class="metric-bar-fill ${colorClass}" style="width: ${percentage}%"></div>
        </div>
      </div>
    </div>
  </div>`;
}

export function cardInsight(
  title: string,
  value: string,
  description: string,
  confidence?: number,
  insights?: string[],
): string {
  const confidenceColor = confidence !== undefined ? 
    (confidence > 80 ? 'text-green-600' : confidence > 60 ? 'text-yellow-600' : 'text-red-600') : '';
  
  const insightsHtml = insights && insights.length > 0 ? `
    <div class="insight-list mt-3">
      <div class="insight-list-title text-xs font-medium text-muted mb-2">Key Insights:</div>
      <ul class="insight-items space-y-1">
        ${insights.map(insight => `
          <li class="insight-item text-xs text-muted flex items-start">
            <span class="insight-bullet w-1 h-1 bg-accent rounded-full mt-1 mr-2 flex-shrink-0"></span>
            <span class="insight-text flex-1">${insight}</span>
          </li>
        `).join('')}
      </ul>
    </div>
  ` : '';
  
  return `<div class="insight-card hover-lift">
    <div class="insight-header">
      <div class="insight-title text-base font-semibold text-on-surface mb-1">${title}</div>
      <div class="insight-value text-2xl font-bold text-on-surface my-2">${value}</div>
    </div>
    <div class="insight-content">
      <div class="insight-description text-sm text-muted mb-3">${description}</div>
      ${insightsHtml}
    </div>
    ${confidence !== undefined ? `
      <div class="insight-confidence mt-3 pt-3 border-t border-outline-variant">
        <div class="confidence-label text-xs text-muted mb-1">Confidence Level:</div>
        <div class="confidence-bar h-2 bg-surface-container rounded-full overflow-hidden">
          <div class="confidence-fill h-full bg-accent transition-all duration-300" style="width: ${confidence}%"></div>
        </div>
        <div class="confidence-value text-xs ${confidenceColor} mt-1">${confidence}%</div>
      </div>
    ` : ''}
  </div>`;
}