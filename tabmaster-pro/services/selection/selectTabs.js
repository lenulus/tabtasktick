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

/**
 * Select tabs that match a rule's conditions
 * @param {Object} rule - The rule object with conditions
 * @param {Array} tabs - Optional tab array (queries all if not provided)
 * @param {Array} windows - Optional window array for context
 * @returns {Promise<Array>} Tabs that match the rule with all their properties
 */
export async function selectTabsMatchingRule(rule, tabs = null, windows = null) {
  if (!tabs) {
    tabs = await chrome.tabs.query({});
  }

  if (!windows) {
    windows = await chrome.windows.getAll();
  }

  // Build context for evaluation (duplicates, counts, indices)
  const context = buildRuleContext(tabs, windows);

  // Filter tabs that match the rule
  const matches = [];

  for (const tab of tabs) {
    const isMatch = matchesRuleWithContext(tab, rule, context, windows);
    if (isMatch) {
      matches.push(tab);
    }
  }

  return matches;
}

/**
 * Build context for rule evaluation (duplicates, domain counts, etc.)
 * Compatible with engine.js indices structure
 * @private
 * @param {Array} tabs - Array of tabs to build context from
 * @param {Array} windows - Array of windows for context
 * @returns {Object} Context with indices and counts
 */
function buildRuleContext(tabs, windows) {
  // Import normalize functions for consistency with engine
  const { extractDomain: normExtractDomain, generateDupeKey, extractOrigin } =
    { extractDomain, generateDupeKey: normalizeUrl, extractOrigin: (url) => extractDomain(url) };

  const byDomain = {};
  const byOrigin = {};
  const byDupeKey = {};
  const byCategory = {};

  // Enhance tabs with derived fields (like engine.js does)
  for (const tab of tabs) {
    // Add derived fields
    tab.domain = tab.domain || extractDomain(tab.url);
    tab.dupeKey = tab.dupeKey || normalizeUrl(tab.url);
    tab.origin = tab.origin || extractDomain(tab.referrer || '');

    // For now, set default category
    tab.category = tab.category || 'unknown';
    tab.categories = tab.categories || ['unknown'];

    // Calculate age - prefer createdAt (from test data) over lastAccessed
    if (tab.createdAt) {
      tab.age = Date.now() - tab.createdAt;
    } else if (tab.lastAccessed) {
      tab.age = Date.now() - tab.lastAccessed;
    }

    // Calculate time since last access
    if (tab.last_access) {
      tab.last_access = Date.now() - tab.last_access;
    }

    // Add to indices
    (byDomain[tab.domain] ||= []).push(tab);
    (byOrigin[tab.origin] ||= []).push(tab);
    (byDupeKey[tab.dupeKey] ||= []).push(tab);
    (byCategory[tab.category] ||= []).push(tab);
  }

  // Build duplicate set
  const duplicates = new Set();
  const domainCounts = new Map();

  // Mark duplicates and count domains
  for (const [dupeKey, tabList] of Object.entries(byDupeKey)) {
    if (tabList.length > 1) {
      tabList.forEach(tab => duplicates.add(tab.id));
    }
  }

  for (const [domain, tabList] of Object.entries(byDomain)) {
    domainCounts.set(domain, tabList.length);
  }

  return {
    tabs,
    windows,
    idx: { byDomain, byOrigin, byDupeKey, byCategory },
    duplicates,
    domainCounts
  };
}

/**
 * Test if a single tab matches a rule with full context
 * SIMPLIFIED VERSION - Dynamic imports removed to prevent crashes
 * @private
 * @param {Object} tab - Tab to test
 * @param {Object} rule - Rule with conditions
 * @param {Object} context - Full context with tabs, windows, idx
 * @param {Array} windows - Window array
 * @returns {boolean}
 */
function matchesRuleWithContext(tab, rule, context, windows) {
  // TEMPORARILY SIMPLIFIED - Use basic matching instead of predicate compiler
  // This prevents crashes from dynamic imports in Chrome extension context

  try {
    // For now, fall back to the simpler matchesRule function
    const result = matchesRule(tab, rule, context);
    return result;
  } catch (error) {
    console.error('Error evaluating rule for tab:', tab.url, error);
    return false;
  }
}

/**
 * Test if a single tab matches a rule (simplified version without async)
 * @private
 * @param {Object} tab - Tab to test
 * @param {Object} rule - Rule with conditions
 * @param {Object} context - Context with indices and counts
 * @returns {boolean}
 */
function matchesRule(tab, rule, context) {
  // Handle different rule formats
  if (rule.conditions) {
    const result = evaluateLegacyConditions(tab, rule.conditions, context);
    return result;
  }

  if (rule.when) {
    const result = evaluateWhenConditions(tab, rule.when, context);
    return result;
  }

  // No conditions means match all tabs (this might be the issue!)
  return false;
}

/**
 * Evaluate legacy-format conditions (older rules)
 * @private
 */
function evaluateLegacyConditions(tab, conditions, context) {
  // Handle array of conditions (AND logic)
  if (Array.isArray(conditions)) {
    return conditions.every(cond => evaluateSingleCondition(tab, cond, context));
  }

  // Handle object with logical operators
  if (conditions.all) {
    return conditions.all.every(cond => evaluateSingleCondition(tab, cond, context));
  }

  if (conditions.any) {
    return conditions.any.some(cond => evaluateSingleCondition(tab, cond, context));
  }

  // Single condition object
  return evaluateSingleCondition(tab, conditions, context);
}

/**
 * Evaluate modern when-format conditions
 * @private
 */
function evaluateWhenConditions(tab, when, context) {
  // Handle nested logical operators by recursing
  if (when.all) {
    return when.all.every(cond => {
      // Check if this is a nested logical operator or a single condition
      if (cond.all || cond.any) {
        return evaluateWhenConditions(tab, cond, context);
      }
      return evaluateSingleCondition(tab, cond, context);
    });
  }

  if (when.any) {
    return when.any.some(cond => {
      // Check if this is a nested logical operator or a single condition
      if (cond.all || cond.any) {
        return evaluateWhenConditions(tab, cond, context);
      }
      return evaluateSingleCondition(tab, cond, context);
    });
  }

  // Direct condition
  return evaluateSingleCondition(tab, when, context);
}

/**
 * Normalize duration values - convert strings like "1h" to milliseconds
 * @private
 */
function normalizeDurationValue(value) {
  // Already a number - return as-is
  if (typeof value === 'number') return value;

  // Not a string - return as-is
  if (typeof value !== 'string') return value;

  // Try to parse as duration string (e.g., "1h", "30m", "2d")
  const units = {
    m: 60 * 1000,           // minutes
    h: 60 * 60 * 1000,      // hours
    d: 24 * 60 * 60 * 1000  // days
  };

  const match = value.match(/^(\d+)([mhd])$/);
  if (match) {
    const [, num, unit] = match;
    return parseInt(num) * units[unit];
  }

  // Not a duration string - return as-is
  return value;
}

/**
 * Get value from an object using dot-notation path
 * @private
 */
function getValueFromPath(obj, path, context) {
  // Handle simple cases
  if (!path || typeof path !== 'string') return undefined;

  // Handle special countPerOrigin paths
  if (path.startsWith('tab.countPerOrigin:')) {
    const metric = path.split(':')[1];
    const tab = obj;
    if (!tab) return 0;

    switch (metric) {
      case 'domain':
        return context?.idx?.byDomain?.[tab.domain]?.length || 0;
      case 'origin':
        return context?.idx?.byOrigin?.[tab.origin || 'unknown']?.length || 0;
      case 'dupeKey':
        return context?.idx?.byDupeKey?.[tab.dupeKey]?.length || 0;
      default:
        return 0;
    }
  }

  // Remove 'tab.' prefix if present
  const cleanPath = path.startsWith('tab.') ? path.slice(4) : path;

  // Handle nested paths
  const parts = cleanPath.split('.');
  let value = obj;

  for (const part of parts) {
    if (value == null) return undefined;
    value = value[part];
  }

  return value;
}

/**
 * Evaluate a single condition against a tab
 * @private
 */
function evaluateSingleCondition(tab, condition, context) {
  // Map Chrome properties to expected names
  const mappedTab = {
    ...tab,
    isPinned: tab.pinned,
    isMuted: tab.mutedInfo?.muted || false,
    isAudible: tab.audible || false,
    isActive: tab.active,
    isDupe: context.duplicates.has(tab.id),
    domainCount: context.domainCounts.get(tab.domain) || 1
  };

  // Handle different condition formats

  // Format 1: { eq: ['tab.domain', 'github.com'] }
  // Format 2: { gt: ['tab.age', 1000] }
  // Format 3: { is: ['tab.isDupe', true] }
  if (condition.eq) {
    const [path, expected] = condition.eq;
    const actual = getValueFromPath(mappedTab, path, context);
    return actual === expected;
  }

  if (condition.gt) {
    const [path, threshold] = condition.gt;
    const actual = getValueFromPath(mappedTab, path, context);
    const normalizedThreshold = normalizeDurationValue(threshold);
    return actual > normalizedThreshold;
  }

  if (condition.lt) {
    const [path, threshold] = condition.lt;
    const actual = getValueFromPath(mappedTab, path, context);
    const normalizedThreshold = normalizeDurationValue(threshold);
    return actual < normalizedThreshold;
  }

  if (condition.gte) {
    const [path, threshold] = condition.gte;
    const actual = getValueFromPath(mappedTab, path, context);
    const normalizedThreshold = normalizeDurationValue(threshold);
    return actual >= normalizedThreshold;
  }

  if (condition.lte) {
    const [path, threshold] = condition.lte;
    const actual = getValueFromPath(mappedTab, path, context);
    const normalizedThreshold = normalizeDurationValue(threshold);
    return actual <= normalizedThreshold;
  }

  if (condition.is) {
    const [path, expected] = condition.is;
    const actual = getValueFromPath(mappedTab, path, context);
    return actual === expected;
  }

  if (condition.not) {
    const [path, expected] = condition.not;
    const actual = getValueFromPath(mappedTab, path, context);
    return actual !== expected;
  }

  if (condition.in) {
    const [path, values] = condition.in;
    const actual = getValueFromPath(mappedTab, path, context);
    return values.includes(actual);
  }

  if (condition.contains) {
    const [path, substring] = condition.contains;
    const actual = getValueFromPath(mappedTab, path, context);
    return String(actual).includes(substring);
  }

  if (condition.matches || condition.regex) {
    const [path, pattern] = condition.matches || condition.regex;
    const actual = getValueFromPath(mappedTab, path, context);
    // Remove leading/trailing slashes if present (e.g., "/pattern/" -> "pattern")
    const cleanPattern = pattern.replace(/^\/|\/$/g, '');
    return new RegExp(cleanPattern).test(String(actual));
  }

  // Legacy format: { property, operator, value }
  const { property, operator, value } = condition;

  if (!property || !operator) {
    // No recognized condition format - should not match
    console.warn('Unrecognized condition format:', condition);
    return false;
  }

  // Get the actual value from the tab
  let actualValue = mappedTab[property];

  // Handle nested properties (e.g., "tab.url")
  if (property.includes('.')) {
    const parts = property.split('.');
    actualValue = mappedTab;
    for (const part of parts) {
      actualValue = actualValue?.[part];
      if (actualValue === undefined) break;
    }
  }

  // Evaluate the operator
  return evaluateOperator(actualValue, operator, value);
}

/**
 * Evaluate an operator comparison
 * @private
 */
function evaluateOperator(actual, operator, expected) {
  switch (operator) {
    case '=':
    case '==':
    case 'equals':
      return actual == expected;

    case '!=':
    case 'not_equals':
      return actual != expected;

    case '>':
    case 'greater_than':
      return actual > expected;

    case '>=':
    case 'greater_than_or_equal':
      return actual >= expected;

    case '<':
    case 'less_than':
      return actual < expected;

    case '<=':
    case 'less_than_or_equal':
      return actual <= expected;

    case 'contains':
      return String(actual).toLowerCase().includes(String(expected).toLowerCase());

    case 'not_contains':
      return !String(actual).toLowerCase().includes(String(expected).toLowerCase());

    case 'starts_with':
      return String(actual).toLowerCase().startsWith(String(expected).toLowerCase());

    case 'ends_with':
      return String(actual).toLowerCase().endsWith(String(expected).toLowerCase());

    case 'matches':
      return new RegExp(expected, 'i').test(String(actual));

    case 'in':
      return Array.isArray(expected) ? expected.includes(actual) : expected == actual;

    case 'not_in':
      return Array.isArray(expected) ? !expected.includes(actual) : expected != actual;

    case 'is':
      return Boolean(actual) === Boolean(expected);

    case 'is_not':
      return Boolean(actual) !== Boolean(expected);

    default:
      console.warn(`Unknown operator: ${operator}`);
      return false;
  }
}

/**
 * Extract domain from URL
 * @private
 */
function extractDomain(url) {
  if (!url) return '';

  try {
    const u = new URL(url);
    return u.hostname.toLowerCase().replace('www.', '');
  } catch {
    return '';
  }
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