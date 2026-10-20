// Loading and empty state components

export function loadingSpinner(size: 'sm' | 'md' | 'lg' = 'md'): string {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  };
  
  return `<div class="loading-container flex items-center justify-center py-8">
    <div class="loading-spinner ${sizeClasses[size]} border-current border-t-transparent rounded-full animate-spin text-primary"></div>
  </div>`;
}

export function skeletonCard(): string {
  return `<div class="skeleton-card p-5 rounded-xl border border-outline-variant bg-surface-container">
    <div class="flex items-start space-x-4">
      <div class="skeleton-avatar"></div>
      <div class="flex-1 space-y-3">
        <div class="skeleton-text w-3/4"></div>
        <div class="skeleton-text w-1/2"></div>
        <div class="skeleton-text w-5/6"></div>
      </div>
    </div>
  </div>`;
}

export function emptyState(
  title: string,
  description: string,
  actionText?: string,
  actionHandler?: () => void,
  icon?: string,
): string {
  const iconHtml = icon ? `<div class="empty-state-icon">
    <svg class="w-16 h-16 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      ${icon}
    </svg>
  </div>` : '';
  
  const actionHtml = actionText && actionHandler ? `
    <button 
      onclick="${actionHandler.toString()}" 
      class="btn btn-primary"
      data-testid="empty-state-action"
    >
      <span class="btn-icon">+</span>
      <span class="btn-text">${actionText}</span>
    </button>
  ` : '';
  
  return `<div class="empty-state" data-testid="empty-state">
    ${iconHtml}
    <div class="empty-state-title">${title}</div>
    <div class="empty-state-description">${description}</div>
    ${actionHtml}
  </div>`;
}

export function errorState(
  title: string,
  description: string,
  retryAction?: () => void,
  errorCode?: string,
): string {
  const retryHtml = retryAction ? `
    <button 
      onclick="${retryAction.toString()}" 
      class="btn btn-primary"
      data-testid="retry-button"
    >
      <span class="btn-icon">↻</span>
      <span class="btn-text">Try Again</span>
    </button>
  ` : '';
  
  return `<div class="error-message" data-testid="error-state">
    <div class="error-icon">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
    </div>
    <div class="error-content">
      <div class="error-title">${title}</div>
      <div class="error-description">${description}</div>
      ${errorCode ? `<div class="text-xs text-muted mt-2">Error: ${errorCode}</div>` : ''}
    </div>
    ${retryHtml}
  </div>`;
}

export function toastNotification(
  message: string,
  type: 'success' | 'error' | 'warning' | 'info' = 'info',
): string {
  const typeClasses = {
    success: 'border-green-500 bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200',
    error: 'border-red-500 bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200',
    warning: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200',
    info: 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-200',
  };
  
  const iconMap = {
    success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    error: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
    warning: 'M12 9v2m0 4h.01m-6-6l2 2 4-4 4 4 2-2-4-4-4 4z',
    info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  };
  
  const colorMap = {
    success: 'text-green-600 dark:text-green-400',
    error: 'text-red-600 dark:text-red-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    info: 'text-blue-600 dark:text-blue-400',
  };
  
  return `<div class="toast ${typeClasses[type]}" data-testid="toast" data-type="${type}">
    <div class="flex items-start">
      <div class="flex-shrink-0 ${colorMap[type]} mt-0.5">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${iconMap[type]}"/>
        </svg>
      </div>
      <div class="ml-3 flex-1">
        <p class="text-sm font-medium">${message}</p>
      </div>
      <div class="ml-4 flex-shrink-0">
        <button 
          type="button" 
          class="inline-flex ${colorMap[type]} hover:${colorMap[type].replace('text-', 'text-')} focus:outline-none"
          onclick="this.parentElement.parentElement.parentElement.remove()"
          data-testid="toast-close"
        >
          <span class="sr-only">Close</span>
          <svg class="w-5 h-5" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>
  </div>`;
}