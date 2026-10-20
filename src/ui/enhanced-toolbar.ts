// Enhanced toolbar with modern UI patterns

export function buildToolbarModern(filters: any): string {
  const rangeOptions = [
    { value: 'all', label: 'Range All' },
    { value: '90', label: 'Last 90 days' },
    { value: '180', label: 'Last 180 days' },
    { value: '365', label: 'Last 365 days' },
  ];
  
  const typeOptions = [
    { value: '', label: 'All Activities' },
    { value: 'run', label: 'Runs' },
    { value: 'ride', label: 'Rides' },
    { value: 'swim', label: 'Swims' },
    { value: 'walk', label: 'Walks' },
    { value: 'hike', label: 'Hikes' },
  ];
  
  return `
    <div class="toolbar-modern">
      <div class="toolbar-section">
        <div class="toolbar-filters">
          <div class="filter-group">
            <label class="filter-label">Type</label>
            <div class="select-wrapper">
              <select class="filter-select" data-filter="type">
                ${typeOptions.map(opt => `
                  <option value="${opt.value}" ${filters.type === opt.value ? 'selected' : ''}>${opt.label}</option>
                `).join('')}
              </select>
            </div>
          </div>
          
          <div class="filter-group">
            <label class="filter-label">Range</label>
            <div class="select-wrapper">
              <select class="filter-select" data-filter="range">
                ${rangeOptions.map(opt => `
                  <option value="${opt.value}" ${filters.range === opt.value ? 'selected' : ''}>${opt.label}</option>
                `).join('')}
              </select>
            </div>
          </div>
          
          <div class="filter-group">
            <label class="filter-label">Search</label>
            <div class="input-wrapper">
              <input 
                type="text" 
                class="filter-input" 
                data-filter="search" 
                placeholder="Search activities..."
                value="${filters.search || ''}"
              />
            </div>
          </div>
        </div>
      </div>
      
      <div class="toolbar-section">
        <div class="toolbar-actions">
          <button class="btn btn-primary" id="apply-filters" data-testid="apply-filters">
            <span class="btn-icon">🔍</span>
            <span class="btn-text">Apply Filters</span>
          </button>
          <button class="btn btn-secondary" id="reset-filters" data-testid="reset-filters">
            <span class="btn-icon">↻</span>
            <span class="btn-text">Reset</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

export function buildToolbarCompact(activeFilterCount: number): string {
  const activeFiltersIndicator = activeFilterCount > 0 ? `
    <div class="compact-filter-badge">
      <span class="badge-dot"></span>
      <span class="badge-count">${activeFilterCount}</span>
    </div>
  ` : '';
  
  return `
    <div class="toolbar-compact">
      <div class="toolbar-compact-content">
        <div class="compact-filters-toggle">
          <button class="btn-icon-only" id="toggle-filters" data-testid="toggle-filters">
            <span class="icon-filter">⚙️</span>
            <span class="sr-only">Filters</span>
          </button>
          ${activeFiltersIndicator}
        </div>
        <div class="compact-search">
          <input 
            type="text" 
            class="input-compact" 
            placeholder="Search..."
            data-testid="compact-search"
          />
        </div>
      </div>
    </div>
  `;
}

export function buildToolbarAdvanced(advancedOptions: any): string {
  const { showDateRange, showIntensity, showType, showHasRoute } = advancedOptions;
  
  return `
    <div class="toolbar-advanced">
      <div class="toolbar-advanced-header">
        <h3 class="toolbar-advanced-title">Advanced Filters</h3>
        <button class="btn-icon-only btn-close" id="close-advanced" data-testid="close-advanced">
          <span class="icon-close">✕</span>
        </button>
      </div>
      
      <div class="toolbar-advanced-content">
        ${showDateRange ? `
          <div class="advanced-filter-group">
            <label class="advanced-filter-label">Date Range</label>
            <div class="date-range-picker">
              <input type="date" class="input-date" data-filter="from" placeholder="From" value="${advancedOptions.dateFrom || ''}" />
              <span class="date-separator">to</span>
              <input type="date" class="input-date" data-filter="to" placeholder="To" value="${advancedOptions.dateTo || ''}" />
            </div>
          </div>
        ` : ''}
        
        ${showIntensity ? `
          <div class="advanced-filter-group">
            <label class="advanced-filter-label">Intensity</label>
            <div class="intensity-selector">
              <button class="intensity-btn" data-intensity="low">Low</button>
              <button class="intensity-btn" data-intensity="medium">Medium</button>
              <button class="intensity-btn" data-intensity="high">High</button>
            </div>
          </div>
        ` : ''}
        
        ${showType ? `
          <div class="advanced-filter-group">
            <label class="advanced-filter-label">Activity Type</label>
            <div class="type-selector">
              <div class="type-checkboxes">
                <label class="checkbox-label">
                  <input type="checkbox" class="checkbox-input" value="run" ${advancedOptions.types?.includes('run') ? 'checked' : ''} />
                  <span class="checkbox-custom">Run</span>
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" class="checkbox-input" value="ride" ${advancedOptions.types?.includes('ride') ? 'checked' : ''} />
                  <span class="checkbox-custom">Ride</span>
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" class="checkbox-input" value="swim" ${advancedOptions.types?.includes('swim') ? 'checked' : ''} />
                  <span class="checkbox-custom">Swim</span>
                </label>
              </div>
            </div>
          </div>
        ` : ''}
        
        ${showHasRoute ? `
          <div class="advanced-filter-group">
            <label class="advanced-filter-label">Route</label>
            <div class="route-selector">
              <label class="radio-label">
                <input type="radio" class="radio-input" name="route" value="all" ${advancedOptions.hasRoute === null ? 'checked' : ''} />
                <span class="radio-custom">All</span>
              </label>
              <label class="radio-label">
                <input type="radio" class="radio-input" name="route" value="yes" ${advancedOptions.hasRoute === true ? 'checked' : ''} />
                <span class="radio-custom">With Route</span>
              </label>
              <label class="radio-label">
                <input type="radio" class="radio-input" name="route" value="no" ${advancedOptions.hasRoute === false ? 'checked' : ''} />
                <span class="radio-custom">No Route</span>
              </label>
            </div>
          </div>
        ` : ''}
      </div>
      
      <div class="toolbar-advanced-footer">
        <button class="btn btn-primary" id="apply-advanced-filters" data-testid="apply-advanced-filters">
          <span class="btn-icon">✅</span>
          <span class="btn-text">Apply Advanced Filters</span>
        </button>
      </div>
    </div>
  `;
}