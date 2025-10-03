// services/selection/selectTabs.js
// Generalized tab selection service with filter criteria
// Returns arrays of tab info for execution services to act upon

/**
 * Select tabs based on filter criteria.
 *
 * @param {Object} filters - Filter criteria for tab selection
 * @param {number} [filters.windowId] - Specific window ID to filter by
 * @param {boolean} [filters.currentWindow] - Use current window
 * @param {boolean} [filters.grouped] - true = only grouped, false = only ungrouped, null = all
 * @param {boolean} [filters.pinned] - true = only pinned, false = only unpinned, null = all
 * @param {string|string[]} [filters.domain] - Domain(s) to match
 * @param {string|string[]} [filters.url] - URL pattern(s) to match
 * @param {number} [filters.maxAge] - Maximum age in milliseconds
 * @param {number} [filters.minAge] - Minimum age in milliseconds
 * @param {boolean} [filters.audible] - true = only audible, false = only silent, null = all
 * @param {boolean} [filters.muted] - true = only muted, false = only unmuted, null = all
 * @param {boolean} [filters.discarded] - true = only discarded, false = only active, null = all
 * @param {boolean} [filters.autoDiscardable] - true = only auto-discardable, false = only not, null = all
 * @param {boolean} [filters.duplicates] - true = only duplicate tabs
 * @param {string} [filters.status] - Tab status: 'loading', 'complete'
 * @param {string} [filters.title] - Title pattern to match
 * @param {number[]} [filters.excludeIds] - Tab IDs to exclude from results
 * @returns {Promise<Array<{id: number, windowId: number, url: string, title: string}>>}
 */
export async function selectTabs(filters = {}) {
  const {
    windowId = null,
    currentWindow = false,
    grouped = null,
    pinned = null,
    domain = null,
    url = null,
    maxAge = null,
    minAge = null,
    audible = null,
    muted = null,
    discarded = null,
    autoDiscardable = null,
    duplicates = false,
    status = null,
    title = null,
    excludeIds = []
  } = filters;

  // Build Chrome tabs.query object from applicable filters
  const query = {};

  if (windowId !== null) query.windowId = windowId;
  if (currentWindow) query.currentWindow = true;
  if (pinned !== null) query.pinned = pinned;
  if (audible !== null) query.audible = audible;
  if (muted !== null) query.muted = muted;
  if (discarded !== null) query.discarded = discarded;
  if (autoDiscardable !== null) query.autoDiscardable = autoDiscardable;
  if (status !== null) query.status = status;
  if (title !== null) query.title = title;

  // Handle grouped/ungrouped (Chrome uses groupId = -1 for ungrouped)
  if (grouped === false) {
    query.groupId = -1;
  }

  // URL patterns if Chrome supports them
  if (url && typeof url === 'string') {
    query.url = url;
  } else if (url && Array.isArray(url)) {
    query.url = url;
  }

  // Query tabs
  const tabs = await chrome.tabs.query(query);

  // Apply filters that Chrome can't handle directly
  let filtered = tabs;

  // Filter by grouped status if grouped === true
  if (grouped === true) {
    filtered = filtered.filter(tab => tab.groupId && tab.groupId !== -1);
  }

  // Filter by domain
  if (domain) {
    const domains = Array.isArray(domain) ? domain : [domain];
    filtered = filtered.filter(tab => {
      if (!tab.url) return false;
      try {
        const tabUrl = new URL(tab.url);
        const tabDomain = tabUrl.hostname.toLowerCase().replace('www.', '');
        return domains.some(d => {
          const searchDomain = d.toLowerCase().replace('www.', '');
          return tabDomain === searchDomain || tabDomain.endsWith('.' + searchDomain);
        });
      } catch {
        return false;
      }
    });
  }

  // Filter by age
  if (maxAge !== null || minAge !== null) {
    const now = Date.now();
    filtered = filtered.filter(tab => {
      // Use lastAccessed if available, otherwise fall back to id-based estimation
      const tabAge = tab.lastAccessed ? (now - tab.lastAccessed) : null;
      if (tabAge === null) return true; // Can't filter if we don't know age

      if (maxAge !== null && tabAge > maxAge) return false;
      if (minAge !== null && tabAge < minAge) return false;
      return true;
    });
  }

  // Filter by duplicates
  if (duplicates) {
    const urlCounts = new Map();
    const normalizedUrls = new Map();

    // First pass: count occurrences
    for (const tab of filtered) {
      if (!tab.url) continue;
      const normalized = normalizeUrl(tab.url);
      if (!urlCounts.has(normalized)) {
        urlCounts.set(normalized, []);
      }
      urlCounts.get(normalized).push(tab);
      normalizedUrls.set(tab.id, normalized);
    }

    // Second pass: only keep tabs that have duplicates
    filtered = filtered.filter(tab => {
      const normalized = normalizedUrls.get(tab.id);
      return normalized && urlCounts.get(normalized).length > 1;
    });
  }

  // Exclude specific tab IDs
  if (excludeIds && excludeIds.length > 0) {
    const excludeSet = new Set(excludeIds);
    filtered = filtered.filter(tab => !excludeSet.has(tab.id));
  }

  // Return standardized tab info
  return filtered.map(tab => ({
    id: tab.id,
    windowId: tab.windowId,
    url: tab.url || '',
    title: tab.title || '',
    index: tab.index,
    pinned: tab.pinned,
    groupId: tab.groupId,
    lastAccessed: tab.lastAccessed
  }));
}

/**
 * Helper: Get current window ID
 */
export async function getCurrentWindowId() {
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return currentTab?.windowId ?? null;
}

/**
 * Helper: Normalize URL for duplicate detection
 * @private
 */
function normalizeUrl(url) {
  if (!url) return '';

  try {
    const u = new URL(url);

    // Remove common tracking parameters
    const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
    for (const param of paramsToRemove) {
      u.searchParams.delete(param);
    }

    // Sort remaining parameters for consistency
    u.searchParams.sort();

    // Remove fragment
    u.hash = '';

    // Normalize protocol
    if (u.protocol === 'https:' || u.protocol === 'http:') {
      // Remove default ports
      if ((u.protocol === 'https:' && u.port === '443') ||
          (u.protocol === 'http:' && u.port === '80')) {
        u.port = '';
      }
    }

    // Remove trailing slash from pathname
    if (u.pathname.endsWith('/') && u.pathname !== '/') {
      u.pathname = u.pathname.slice(0, -1);
    }

    return u.toString().toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Test if a single tab matches the filter criteria.
 * Useful for rules engine to test tabs without querying.
 *
 * @param {Object} tab - Chrome tab object to test
 * @param {Object} filters - Same filter criteria as selectTabs
 * @returns {boolean} True if tab matches all criteria
 */
export function matchesFilter(tab, filters = {}) {
  const {
    windowId = null,
    grouped = null,
    pinned = null,
    domain = null,
    url = null,
    maxAge = null,
    minAge = null,
    audible = null,
    muted = null,
    discarded = null,
    autoDiscardable = null,
    duplicates = false,
    status = null,
    title = null,
    excludeIds = []
  } = filters;

  // Check windowId
  if (windowId !== null && tab.windowId !== windowId) return false;

  // Check grouped status
  if (grouped !== null) {
    const isGrouped = tab.groupId && tab.groupId !== -1;
    if (grouped && !isGrouped) return false;
    if (!grouped && isGrouped) return false;
  }

  // Check pinned status
  if (pinned !== null && tab.pinned !== pinned) return false;

  // Check audible status
  if (audible !== null && tab.audible !== audible) return false;

  // Check muted status
  if (muted !== null && tab.mutedInfo?.muted !== muted) return false;

  // Check discarded status
  if (discarded !== null && tab.discarded !== discarded) return false;

  // Check auto-discardable status
  if (autoDiscardable !== null && tab.autoDiscardable !== autoDiscardable) return false;

  // Check status
  if (status !== null && tab.status !== status) return false;

  // Check title pattern
  if (title !== null && !tab.title?.includes(title)) return false;

  // Check domain
  if (domain) {
    if (!tab.url) return false;
    try {
      const tabUrl = new URL(tab.url);
      const tabDomain = tabUrl.hostname.toLowerCase().replace('www.', '');
      const domains = Array.isArray(domain) ? domain : [domain];
      const matches = domains.some(d => {
        const searchDomain = d.toLowerCase().replace('www.', '');
        return tabDomain === searchDomain || tabDomain.endsWith('.' + searchDomain);
      });
      if (!matches) return false;
    } catch {
      return false;
    }
  }

  // Check URL pattern
  if (url) {
    if (!tab.url) return false;
    const patterns = Array.isArray(url) ? url : [url];
    const matches = patterns.some(pattern => {
      // Simple wildcard matching (could be enhanced)
      const regex = pattern.replace(/\*/g, '.*');
      return new RegExp(regex).test(tab.url);
    });
    if (!matches) return false;
  }

  // Check age
  if (maxAge !== null || minAge !== null) {
    if (!tab.lastAccessed) return true; // Can't filter if no age data
    const now = Date.now();
    const tabAge = now - tab.lastAccessed;
    if (maxAge !== null && tabAge > maxAge) return false;
    if (minAge !== null && tabAge < minAge) return false;
  }

  // Check excluded IDs
  if (excludeIds && excludeIds.length > 0) {
    if (excludeIds.includes(tab.id)) return false;
  }

  // Note: duplicates filter requires comparing with other tabs,
  // so it can't be tested on a single tab
  if (duplicates) {
    console.warn('Duplicate filter cannot be tested on single tab');
    return true; // Pass through, needs batch context
  }

  return true;
}

// Pre-built filter combinations for common use cases
export const CommonFilters = {
  // All ungrouped tabs in current window
  ungroupedInWindow: (windowId) => ({
    windowId,
    grouped: false
  }),

  // All tabs from a specific domain
  byDomain: (domain, windowId = null) => ({
    domain,
    ...(windowId && { windowId })
  }),

  // Old tabs that haven't been accessed recently
  stale: (days = 7, windowId = null) => ({
    maxAge: days * 24 * 60 * 60 * 1000,
    ...(windowId && { windowId })
  }),

  // Duplicate tabs
  duplicates: (windowId = null) => ({
    duplicates: true,
    ...(windowId && { windowId })
  }),

  // Audible tabs (playing sound)
  audible: (windowId = null) => ({
    audible: true,
    ...(windowId && { windowId })
  }),

  // Discarded (suspended) tabs
  suspended: (windowId = null) => ({
    discarded: true,
    ...(windowId && { windowId })
  }),

  // Pinned tabs
  pinned: (windowId = null) => ({
    pinned: true,
    ...(windowId && { windowId })
  })
};