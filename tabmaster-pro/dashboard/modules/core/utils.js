/**
 * Core utility functions for TabMaster Pro
 */

/**
 * Normalize URL by removing query parameters and hash fragments
 * @param {string} urlString - URL to normalize
 * @returns {string} Normalized URL
 */
export function normalizeUrl(urlString) {
  try {
    const url = new URL(urlString);
    // Remove query parameters and hash fragments
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch (error) {
    // If URL parsing fails, return the original string
    console.warn(`Could not parse URL: ${urlString}`, error);
    return urlString;
  }
}

/**
 * Debounce function to limit execution rate
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Format bytes to human readable string
 * @param {number} bytes - Number of bytes
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted string
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Get human-readable time ago string
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {string} Time ago string
 */
export function getTimeAgo(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Get activity icon SVG
 * @param {string} type - Activity type
 * @returns {string} SVG string
 */
export function getActivityIcon(type) {
  const icons = {
    close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    group: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>',
    snooze: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
    rule: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"></path></svg>',
  };
  return icons[type] || '';
}

/**
 * Get Chrome group color as hex
 * @param {string} chromeColor - Chrome color name
 * @returns {string} Hex color
 */
export function getGroupColor(chromeColor) {
  const colors = {
    'grey': '#5f6368',
    'blue': '#1a73e8',
    'red': '#d93025',
    'yellow': '#f9ab00',
    'green': '#188038',
    'pink': '#e91e63',
    'purple': '#9c27b0',
    'cyan': '#00acc1',
    'orange': '#ff6d00'
  };
  return colors[chromeColor] || '#5f6368';
}

/**
 * Get tab state description
 * @param {Object} tab - Chrome tab object
 * @returns {string} Tab state
 */
export function getTabState(tab) {
  if (tab.discarded) return '💤 Suspended';
  if (tab.active) return '👁 Active';
  if (tab.audible) return '🔊 Playing';
  if (tab.pinned) return '📌 Pinned';
  return 'Loaded';
}

/**
 * Get last access text for tab
 * @param {Object} tab - Tab object with lastAccessed property
 * @returns {string} Last access text
 */
export function getLastAccessText(tab) {
  if (tab.active) return 'Now';
  if (!tab.lastAccessed) return 'Unknown';
  
  const now = Date.now();
  const diff = now - tab.lastAccessed;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

/**
 * Create a signature from window tabs for identification
 * @param {Array} tabs - Array of tab objects
 * @returns {string} Window signature
 */
export function getWindowSignature(tabs) {
  // Create a signature from the first few pinned/important tabs
  const pinnedUrls = tabs
    .filter(t => t.pinned)
    .slice(0, 3)
    .map(t => {
      try {
        return new URL(t.url).hostname;
      } catch {
        return '';
      }
    })
    .filter(Boolean)
    .sort()
    .join('|');
  
  const topDomains = tabs
    .slice(0, 5)
    .map(t => {
      try {
        return new URL(t.url).hostname;
      } catch {
        return '';
      }
    })
    .filter(Boolean)
    .sort()
    .join('|');
    
  return pinnedUrls || topDomains;
}

/**
 * Generate color using HSL for even distribution
 * @param {number} index - Item index
 * @param {number} total - Total items
 * @returns {string} HSL color string
 */
export function generateWindowColor(index, total) {
  const hue = (index * 360 / Math.max(8, total)) % 360;
  const saturation = 60 + (index % 3) * 15; // Vary saturation between 60-90%
  const lightness = 50 + (index % 2) * 10; // Vary lightness between 50-60%
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Get favicon URL for a tab
 * @param {Object} tab - Chrome tab object
 * @returns {string} Favicon URL
 */
export function getFaviconUrl(tab) {
  // Use the tab's favicon if available
  if (tab.favIconUrl) {
    return tab.favIconUrl;
  }

  // Otherwise generate one from the URL
  try {
    const u = new URL(tab.url);
    // Chrome internal pages - use appropriate icons
    if (u.protocol === 'chrome:') {
      if (u.hostname === 'newtab') {
        return '../icons/chrome-newtab-16.png';
      }
      if (u.hostname === 'extensions') {
        return '../icons/chrome-extensions-16.png';
      }
      // Generic Chrome icon for other chrome:// pages
      return '../icons/chrome-logo-16.png';
    }
    if (u.protocol === 'chrome-extension:') {
      // Use this extension's own icon for its pages
      if (u.hostname === chrome.runtime.id) {
        return '../icons/icon-16.png';
      }
      // Use puzzle piece for other extensions
      return '../icons/chrome-extensions-16.png';
    }
    return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(tab.url)}&size=16`;
  } catch (e) {
    return '../icons/icon-16.png';
  }
}

/**
 * Get color for domain (consistent color per domain)
 * @param {string} domain - Domain name
 * @returns {string} Color string
 */
export function getColorForDomain(domain) {
  // Simple hash function for consistent colors
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const colors = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Sort tabs by various criteria
 * @param {Array} tabs - Array of tabs
 * @param {string} sortType - Sort type
 * @returns {Array} Sorted tabs
 */
export function sortTabs(tabs, sortType) {
  const sorted = [...tabs];
  
  switch (sortType) {
  case 'alphabetical':
    return sorted.sort((a, b) => a.title.localeCompare(b.title));
    
  case 'domain':
    return sorted.sort((a, b) => {
      try {
        const domainA = new URL(a.url).hostname;
        const domainB = new URL(b.url).hostname;
        return domainA.localeCompare(domainB);
      } catch {
        return 0;
      }
    });
    
  case 'recent':
    return sorted.sort((a, b) => {
      const accessA = a.lastAccessed || 0;
      const accessB = b.lastAccessed || 0;
      return accessB - accessA;
    });
    
  case 'oldest':
    return sorted.sort((a, b) => {
      const accessA = a.lastAccessed || Infinity;
      const accessB = b.lastAccessed || Infinity;
      return accessA - accessB;
    });
    
  default:
    return sorted;
  }
}