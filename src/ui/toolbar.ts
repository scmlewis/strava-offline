import type { Activity, Preferences, Units } from '../data/types.ts';
import { computeTypeBreakdown, formatStorageMeter } from '../data/db.ts';
import { t } from '../i18n.ts';
import { icon } from '../icons.ts';
import { esc } from '../utils.ts';
import type { Filters } from './store.ts';

export interface ToolbarRenderDeps {
  acts: Activity[];
  matched: Activity[];
  filters: Filters;
  units: Units;
  prefs: Preferences;
  theme: string;
  activeCount: number;
  collapsed: boolean;
}

// Renders the toolbar markup verbatim (moved from src/main.ts `buildToolbar`).
// Event wiring stays in main.ts; this module owns markup only. All element ids
// are preserved so existing handlers and E2E selectors keep working. Each
// control additionally carries a `data-testid` alias mirroring its id.
export function renderToolbar(toolbar: HTMLElement, deps: ToolbarRenderDeps): void {
  const { acts, matched, filters, units, prefs, theme, activeCount, collapsed } = deps;
  const types = [...new Set(acts.map((a) => a.type).filter(Boolean))];
  const meterText = formatStorageMeter(matched.length, null, computeTypeBreakdown(matched));
  toolbar.innerHTML = `
    <div class="tb-head">
      <button id="t-toggle" data-testid="t-toggle" type="button" class="tb-toggle">${icon('filter')} ${t('filter')} ${activeCount ? `(${activeCount})` : ''} <span class="caret">${collapsed ? icon('chevron-right', 14) : icon('chevron-down', 14)}</span></button>
      ${activeCount ? `<button id="btn-reset-head" data-testid="btn-reset-head" type="button" class="tb-reset-mini">${t('reset')}</button>` : ''}
      <span class="tb-meter">${esc(meterText)}</span>
    </div>
    <div class="tb-body${collapsed ? ' collapsed' : ''}">
    <div class="tb-row">
      <input id="t-search" data-testid="t-search" class="tb-input" type="search" placeholder="${t('search_placeholder')}" value="${esc(filters.search)}" />
      <label class="tb-ico" title="${t('type')}">${icon('tag')}<select id="t-type" data-testid="t-type"><option value="">${t('all_types')}</option>${types.map((ty) => `<option ${filters.type === ty ? 'selected' : ''}>${esc(ty)}</option>`).join('')}</select></label>
      <label class="tb-ico" title="${t('time_range')}">${icon('calendar')}<select id="t-range" data-testid="t-range">
        <option value="all" ${filters.range === 'all' ? 'selected' : ''}>${t('all_time')}</option>
        <option value="90" ${filters.range === '90' ? 'selected' : ''}>${t('last_90')}</option>
        <option value="180" ${filters.range === '180' ? 'selected' : ''}>${t('last_180')}</option>
        <option value="365" ${filters.range === '365' ? 'selected' : ''}>${t('last_365')}</option>
      </select></label>
      <label class="tb-ico" title="${t('weekday')}">${icon('week')}<select id="t-weekday" data-testid="t-weekday">
        <option value="" ${filters.weekday === '' ? 'selected' : ''}>${t('weekday_any')}</option>
        <option value="weekday" ${filters.weekday === 'weekday' ? 'selected' : ''}>${t('weekday_weekday')}</option>
        <option value="weekend" ${filters.weekday === 'weekend' ? 'selected' : ''}>${t('weekday_weekend')}</option>
        <option value="6" ${filters.weekday === '6' ? 'selected' : ''}>${t('weekday_sat')}</option>
        <option value="0" ${filters.weekday === '0' ? 'selected' : ''}>${t('weekday_sun')}</option>
        <option value="1" ${filters.weekday === '1' ? 'selected' : ''}>${t('weekday_mon')}</option>
        <option value="2" ${filters.weekday === '2' ? 'selected' : ''}>${t('weekday_tue')}</option>
        <option value="3" ${filters.weekday === '3' ? 'selected' : ''}>${t('weekday_wed')}</option>
        <option value="4" ${filters.weekday === '4' ? 'selected' : ''}>${t('weekday_thu')}</option>
        <option value="5" ${filters.weekday === '5' ? 'selected' : ''}>${t('weekday_fri')}</option>
      </select></label>
      <label class="tb-ico" title="${t('intensity')}">${icon('flame')}<select id="t-intensity" data-testid="t-intensity">
        <option value="" ${filters.intensity === '' ? 'selected' : ''}>${t('intensity_any')}</option>
        <option value="easy" ${filters.intensity === 'easy' ? 'selected' : ''}>${t('intensity_easy')}</option>
        <option value="hard" ${filters.intensity === 'hard' ? 'selected' : ''}>${t('intensity_hard')}</option>
      </select></label>
      <label class="tb-ico" title="${t('route')}">${icon('map')}<select id="t-route" data-testid="t-route">
        <option value="" ${filters.hasRoute === null ? 'selected' : ''}>${t('route_any')}</option>
        <option value="yes" ${filters.hasRoute === true ? 'selected' : ''}>${t('route_yes')}</option>
        <option value="no" ${filters.hasRoute === false ? 'selected' : ''}>${t('route_no')}</option>
      </select></label>
    </div>
    <div class="tb-row">
      <label class="tb-inline">${t('distance')} <input id="t-minkm" data-testid="t-minkm" type="number" min="0" step="1" value="${filters.minKm || ''}" placeholder="${t('min')}" />–<input id="t-maxkm" data-testid="t-maxkm" type="number" min="0" step="1" value="${filters.maxKm || ''}" placeholder="${t('max')}" /> km</label>
      <label class="tb-inline">${t('elev_gain')} <input id="t-mingain" data-testid="t-mingain" type="number" min="0" step="10" value="${filters.minGain || ''}" placeholder="m" /> m</label>
      <label class="tb-inline">${t('pace')} <input id="t-minpace" data-testid="t-minpace" type="number" min="0" step="5" value="${filters.minPace || ''}" placeholder="${t('slower')}" />–<input id="t-maxpace" data-testid="t-maxpace" type="number" min="0" step="5" value="${filters.maxPace || ''}" placeholder="${t('faster')}" /> ${t('sec_per_km')}</label>
      <label class="tb-ico" title="${t('from')}"><span class="dot dot-green"></span><input id="t-from" data-testid="t-from" type="date" value="${filters.from}" /></label>
      <label class="tb-ico" title="${t('to')}"><span class="dot dot-red"></span><input id="t-to" data-testid="t-to" type="date" value="${filters.to}" /></label>
      <label class="tb-ico" title="${t('unit')}">${icon('ruler')}<select id="t-unit" data-testid="t-unit">
        <option value="km" ${units.dist === 'km' ? 'selected' : ''}>km</option>
        <option value="mi" ${units.dist === 'mi' ? 'selected' : ''}>mi</option>
      </select></label>
      <label class="tb-ico" title="${t('week_start')}">${icon('calendar')}<select id="t-weekstart" data-testid="t-weekstart">
        <option value="sun" ${prefs.weekStart === 'sun' ? 'selected' : ''}>${t('week_sun')}</option>
        <option value="mon" ${prefs.weekStart === 'mon' ? 'selected' : ''}>${t('week_mon')}</option>
      </select></label>
      <button id="btn-reset" data-testid="btn-reset" type="button" class="act-reset"${activeCount ? '' : ' disabled'}>${icon('refresh')} ${t('reset')} (${activeCount})</button>
    </div>
    </div>
    <div class="tb-actions">
      <button id="btn-backup" data-testid="btn-backup" type="button" class="ico-btn" title="${t('backup')}">${icon('download')}</button>
      <button id="btn-restore" data-testid="btn-restore" type="button" class="ico-btn" title="${t('restore')}">${icon('upload')}</button>
      <span class="tb-sep"></span>
      <button id="btn-export-filtered" data-testid="btn-export-filtered" type="button" class="ico-btn" title="${t('export_filtered')}" ${matched.length ? '' : ' disabled'}>${icon('download')}</button>
      <button id="btn-bulk-del" data-testid="btn-bulk-del" type="button" class="act-reset"${matched.length && matched.length < acts.length ? '' : ' disabled'}>${icon('trash')} ${t('bulk_delete')} (${matched.length})</button>
      <button id="btn-clear" data-testid="btn-clear" type="button" class="ico-btn" title="${t('clear_data')}">${icon('trash')}</button>
      <span class="tb-sep"></span>
      <button id="btn-zones" data-testid="btn-zones" type="button" class="ico-btn" title="${t('zones')}">${icon('heart')}</button>
      <button id="btn-goals" data-testid="btn-goals" type="button" class="ico-btn" title="${t('goals')}">${icon('target')}</button>
      <span class="tb-sep"></span>
      <button id="btn-diag" data-testid="btn-diag" type="button" class="ico-btn" title="${t('diagnostics')}">${icon('list')}</button>
      <button id="btn-theme" data-testid="btn-theme" type="button" class="ico-btn" title="${t(`theme_${theme}`)}">${icon('contrast')}</button>
      <button id="btn-about" data-testid="btn-about" type="button" class="ico-btn" title="${t('about')}">${icon('info')}</button>
    </div>`;
}
