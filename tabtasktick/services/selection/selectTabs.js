/**
 * @file selectTabs - Generalized tab selection and filtering service
 *
 * @description
 * The selectTabs service provides comprehensive tab selection capabilities through flexible
 * filter criteria. It serves as the central selection layer that converts user intent and
 * rule conditions into concrete tab arrays for execution services to act upon.
 *
 * The service supports 15+ filter types including window scope, grouping state, pinned status,
 * domain matching, URL patterns, age filtering, audio state, suspension state, and duplicate
 * detection. Filters can be combined arbitrarily to create complex selection queries like
 * "ungrouped tabs from github.com older than 7 days in the current window".
 *
 * Key features include intelligent URL normalization for duplicate detection (whitelist-based
 * approach that preserves content-identifying parameters like YouTube video IDs), domain
 * extraction with special protocol handling, and rule engine integration with support for
 * both legacy and modern rule formats.
 *
 * The service also provides tab statistics calculation (single-pass performance optimization),
 * pre-built filter combinations for common use cases, and multiple utility functions for
 * duplicate detection and URL comparison.
 *
 * @module services/selection/selectTabs
 *
 * @architecture
 * - Layer: Selection Service (Filtering/Analysis)
 * - Dependencies:
 *   - chrome.tabs API (read-only queries)
 *   - domain-categories.js (domain categorization for rules)
 * - Used By: Rules engine, executeSnoozeOperations, dashboard bulk actions, popup filters
 * - Pattern: Filter Service - provides flexible querying with composition
 *
 * @example
 * // Select ungrouped tabs in current window
 * import { selectTabs } from './services/selection/selectTabs.js';
 *
 * const tabs = await selectTabs({
 *   currentWindow: true,
 *   grouped: false
 * });
 *
 * console.log(`Found ${tabs.length} ungrouped tabs`);
 *
 * @example
 * // Select old tabs from specific domains
 * const staleTabs = await selectTabs({
 *   domain: ['reddit.com', 'twitter.com'],
 *   maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
 * });
 *
 * @example
 * // Find duplicate tabs
 * const duplicates = await selectTabs({
 *   duplicates: true,
 *   grouped: false
 * });
 */

import { getCategoriesForDomain } from '../../lib/domain-categories.js';
import { extractDomain } from '../utils/domainUtils.js';

/**
 * Selects tabs based on flexible filter criteria.
 *
 * This is the main tab selection function that combines Chrome's native tab.query with
 * additional post-filtering for criteria that Chrome doesn't support directly (domain matching,
 * age filtering, duplicate detection). The function applies filters in two phases:
 * 1. Native Chrome filtering via tabs.query (fast, leverages browser indexing)
 * 2. Post-processing filters (domain, age, duplicates) on the result set
 *
 * All filter parameters are optional and can be combined freely. For example, you can select
 * "ungrouped, audible tabs from reddit.com that are duplicates in the current window". Null
 * values mean "no filter" (include all), while false/true mean "exclude/include only".
 *
 * Returns standardized tab objects with consistent property structure regardless of which
 * filters were applied. Empty filters object selects all tabs.
 *
 * @param {Object} [filters={}] - Filter criteria (all optional, combinable)
 * @param {number} [filters.windowId] - Specific window ID to filter by
 * @param {boolean} [filters.currentWindow=false] - Use current window only
 * @param {boolean} [filters.grouped] - Grouped state: true = only grouped, false = only ungrouped, null = all
 * @param {boolean} [filters.pinned] - Pinned state: true = only pinned, false = only unpinned, null = all
 * @param {string|string[]} [filters.domain] - Domain(s) to match (supports subdomain matching)
 * @param {string|string[]} [filters.url] - URL pattern(s) to match (Chrome match patterns)
 * @param {number} [filters.maxAge] - Maximum age in milliseconds (based on lastAccessed)
 * @param {number} [filters.minAge] - Minimum age in milliseconds (based on lastAccessed)
 * @param {boolean} [filters.audible] - Audio state: true = playing sound, false = silent, null = all
 * @param {boolean} [filters.muted] - Muted state: true = muted, false = unmuted, null = all
 * @param {boolean} [filters.discarded] - Suspension state: true = suspended, false = active, null = all
 * @param {boolean} [filters.autoDiscardable] - Auto-discard eligibility: true = eligible, false = protected, null = all
 * @param {boolean} [filters.duplicates=false] - Duplicate filter: true = only tabs with duplicates
 * @param {string} [filters.status] - Loading status: 'loading' | 'complete'
 * @param {string} [filters.title] - Title substring to match (case-sensitive partial match)
 * @param {number[]} [filters.excludeIds=[]] - Tab IDs to exclude from results
 *
 * @returns {Promise<TabInfo[]>} Array of standardized tab objects
 *
 * @typedef {Object} TabInfo
 * @property {number} id - Chrome tab ID
 * @property {number} windowId - Chrome window ID
 * @property {string} url - Tab URL (empty string if unavailable)
 * @property {string} title - Tab title (empty string if unavailable)
 * @property {number} index - Tab index in window
 * @property {boolean} pinned - Whether tab is pinned
 * @property {number} groupId - Chrome group ID (-1 if ungrouped)
 * @property {number} lastAccessed - Last access timestamp in milliseconds
 *
 * @example
 * // Select all ungrouped tabs in current window
 * import { selectTabs } from './services/selection/selectTabs.js';
 *
 * const tabs = await selectTabs({
 *   currentWindow: true,
 *   grouped: false
 * });
 *
 * @example
 * // Select old Reddit and Twitter tabs
 * const staleTabs = await selectTabs({
 *   domain: ['reddit.com', 'twitter.com'],
 *   maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
 * });
 *
 * @example
 * // Find audible duplicate tabs
 * const noisyDuplicates = await selectTabs({
 *   audible: true,
 *   duplicates: true
 * });
 *
 * @example
 * // Select suspended tabs excluding specific IDs
 * const suspended = await selectTabs({
 *   discarded: true,
 *   excludeIds: [123, 456] // Exclude these tab IDs
 * });
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
      const normalized = normalizeUrlForDuplicates(tab.url);
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
 * Normalize URL for duplicate detection.
 *
 * Strategy: WHITELIST approach
 * - By default, remove ALL query parameters (they rarely identify unique content)
 * - Only preserve params that are known to identify unique content for specific domains
 *
 * This scales better than blacklisting tracking params (which is infinite).
 *
 * @param {string} url - URL to normalize
 * @returns {string} Normalized URL for duplicate comparison
 */

// WHITELIST: Parameters that identify unique content for specific domains
// CRITICAL: Only add params here if they identify DIFFERENT content
// (e.g., YouTube video ID, Google search query, article ID)
const CONTENT_IDENTIFYING_PARAMS = {
  'youtube.com': ['v', 'list', 't'],
  'youtu.be': ['v', 't'],
  'github.com': ['q', 'type', 'language', 'tab'],
  'google.com': ['q', 'tbm', 'tbs'], // Search only
  'docs.google.com': [], // Path-based (doc ID in path), ignore all query params
  'amazon.com': ['k', 'i', 'dp'],
  'stackoverflow.com': ['q', 'tab', 'noredirect', 'lq'],
  'reddit.com': ['context'],
  'twitter.com': [], // Path-based (status IDs in path)
  'x.com': [], // Path-based
  'facebook.com': ['fbid', 'set', 'story_fbid', 'id'],
  'linkedin.com': [], // Path-based
  'instagram.com': [], // Path-based
  'wikipedia.org': ['title', 'oldid'],
  'medium.com': [], // Path-based
  'substack.com': [], // Path-based
};

/**
 * Normalizes URLs for accurate duplicate detection.
 *
 * Uses a **WHITELIST approach**: removes ALL query parameters except those that identify
 * unique content (e.g., YouTube video IDs, Google search queries, GitHub search filters).
 * This prevents false positives where tracking parameters make identical pages appear different.
 *
 * The whitelist strategy scales better than blacklisting tracking parameters (which is
 * infinite and constantly evolving). Only domain-specific content-identifying parameters
 * are preserved based on the CONTENT_IDENTIFYING_PARAMS whitelist (lines 183-200).
 *
 * Additional normalization steps:
 * - Removes URL fragments/anchors (#section)
 * - Sorts remaining query parameters alphabetically
 * - Removes default ports (443 for https, 80 for http)
 * - Removes trailing slashes from paths
 * - Lowercases hostname only (preserves case-sensitive paths)
 * - Handles special protocols (chrome://, data:, chrome-extension://)
 *
 * @param {string} url - The URL to normalize
 *
 * @returns {string} Normalized URL suitable for duplicate comparison
 *
 * @example
 * // Tracking parameters removed (same content)
 * import { normalizeUrlForDuplicates } from './services/selection/selectTabs.js';
 *
 * normalizeUrlForDuplicates('https://example.com?utm_source=twitter');
 * // → 'https://example.com'
 *
 * normalizeUrlForDuplicates('https://example.com?ref=123&utm_campaign=promo');
 * // → 'https://example.com'
 *
 * @example
 * // YouTube video IDs preserved (different content)
 * normalizeUrlForDuplicates('https://youtube.com/watch?v=abc123&feature=share');
 * // → 'https://youtube.com/watch?v=abc123'
 *
 * normalizeUrlForDuplicates('https://youtube.com/watch?v=xyz789&t=30');
 * // → 'https://youtube.com/watch?t=30&v=xyz789' (different video, params sorted)
 *
 * @example
 * // Google search queries preserved (different content)
 * normalizeUrlForDuplicates('https://google.com/search?q=javascript&source=hp');
 * // → 'https://google.com/search?q=javascript'
 *
 * @example
 * // Special protocols handled
 * normalizeUrlForDuplicates('chrome://extensions#details?id=abc');
 * // → 'chrome://extensions'
 */
export function normalizeUrlForDuplicates(url) {
  if (!url) return '';

  // Return non-URLs as-is
  if (typeof url !== 'string') return url;

  try {
    // Handle special protocols that URL constructor doesn't support well
    if (url.startsWith('chrome://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('data:') ||
        url.startsWith('javascript:') ||
        url.startsWith('about:')) {
      // For chrome:// and similar, just remove the hash
      // DON'T lowercase - preserves data: URL content and chrome:// paths
      const hashIndex = url.indexOf('#');
      return hashIndex !== -1 ? url.substring(0, hashIndex) : url;
    }

    const u = new URL(url);

    // Remove fragment/anchor - treat example.com#a and example.com#b as duplicates
    u.hash = '';

    // Process query parameters with WHITELIST approach
    const params = new URLSearchParams(u.search);
    const domain = u.hostname;

    // Get content-identifying params for this domain (WHITELIST)
    const contentParams = Object.entries(CONTENT_IDENTIFYING_PARAMS)
      .find(([d]) => domain.includes(d))?.[1] || [];

    // WHITELIST: Only keep params that identify unique content
    const filteredParams = new URLSearchParams();
    for (const [key, value] of params) {
      // ONLY keep if it's on the content-identifying list for this domain
      if (contentParams.includes(key)) {
        filteredParams.append(key, value);
      }
    }

    // Sort parameters for consistent ordering
    const sortedParams = new URLSearchParams(
      [...filteredParams.entries()].sort(([a], [b]) => a.localeCompare(b))
    );

    // Only set search if there are params, otherwise clear it
    u.search = sortedParams.toString();

    // Remove default ports for http/https
    if ((u.protocol === 'https:' && u.port === '443') ||
        (u.protocol === 'http:' && u.port === '80')) {
      u.port = '';
    }

    // Remove trailing slash from pathname (but keep root /)
    if (u.pathname.endsWith('/') && u.pathname !== '/') {
      u.pathname = u.pathname.slice(0, -1);
    }

    // ONLY lowercase the hostname (for duplicate detection)
    // DON'T lowercase path/query/fragment - preserves case-sensitive content
    // and proper percent-encoding (%3A not %3a)
    u.hostname = u.hostname.toLowerCase();

    return u.toString();
  } catch {
    // Invalid URLs - return as-is (preserve case)
    return url;
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
    { extractDomain, generateDupeKey: normalizeUrlForDuplicates, extractOrigin: (url) => extractDomain(url) };

  const byDomain = {};
  const byOrigin = {};
  const byDupeKey = {};
  const byCategory = {};

  // Enhance tabs with derived fields (like engine.js does)
  for (const tab of tabs) {
    // Add derived fields
    tab.domain = tab.domain || extractDomain(tab.url);
    tab.dupeKey = tab.dupeKey || normalizeUrlForDuplicates(tab.url);
    tab.origin = tab.origin || extractDomain(tab.referrer || '');

    // Get categories for this domain
    const categories = getCategoriesForDomain(tab.domain);
    tab.category = categories.length > 0 ? categories[0] : 'unknown';
    tab.categories = categories.length > 0 ? categories : ['unknown'];

    // Calculate age - prefer createdAt (from test data) over lastAccessed
    if (tab.createdAt) {
      tab.age = Date.now() - tab.createdAt;
    } else if (tab.lastAccessed) {
      tab.age = Date.now() - tab.lastAccessed;
    }

    // Calculate time since last access from Chrome's lastAccessed property
    if (tab.lastAccessed) {
      tab.last_access = Date.now() - tab.lastAccessed;
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
  // Handle "match all" case - empty conditions object
  if (rule.conditions && typeof rule.conditions === 'object' && Object.keys(rule.conditions).length === 0) {
    return true;
  }

  // Handle different rule formats
  if (rule.conditions) {
    const result = evaluateLegacyConditions(tab, rule.conditions, context);
    return result;
  }

  if (rule.when) {
    const result = evaluateWhenConditions(tab, rule.when, context);
    return result;
  }

  // No conditions property means match all tabs
  return true;
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
    domainCount: context.domainCounts.get(tab.domain) || 1,
    duplicate: context.duplicates.has(tab.id), // Alias for isDupe
    grouped: tab.groupId && tab.groupId !== -1 // Add grouped mapping
  };

  // V2 ENGINE: ONLY handle UI format { subject, operator, value }
  const { subject, operator, value } = condition;

  if (!subject || !operator) {
    console.warn('Invalid condition - missing subject or operator:', condition);
    return false;
  }

  // Get the actual value from the tab or window
  let actualValue;

  // Handle window.* properties
  if (subject.startsWith('window.')) {
    const windowProp = subject.replace('window.', '');
    const window = context.windows?.find(w => w.id === tab.windowId);
    actualValue = window?.[windowProp];
  }
  // Handle nested properties (e.g., "tab.url")
  else if (subject.includes('.')) {
    const parts = subject.split('.');
    actualValue = mappedTab;
    for (const part of parts) {
      actualValue = actualValue?.[part];
      if (actualValue === undefined) break;
    }
  }
  // Handle direct properties
  else {
    actualValue = mappedTab[subject];
  }

  // Normalize expected value for certain subjects (e.g., age comparisons)
  let expectedValue = value;
  if ((subject === 'age' || subject === 'last_access') && typeof value === 'string') {
    expectedValue = normalizeDurationValue(value);
  }

  // Evaluate the operator
  return evaluateOperator(actualValue, operator, expectedValue, subject);
}

/**
 * Evaluate an operator comparison
 * @private
 */
function evaluateOperator(actual, operator, expected) {
  switch (operator) {
  case '=':
  case '==':
  case 'eq':
  case 'equals':
    return actual == expected;

  case '!=':
  case 'neq':
  case 'not_equals':
  case 'notEquals':
    return actual != expected;

  case '>':
  case 'gt':
  case 'greater_than':
  case 'greaterThan':
    return actual > expected;

  case '>=':
  case 'gte':
  case 'greater_than_or_equal':
  case 'greaterThanOrEqual':
    return actual >= expected;

  case '<':
  case 'lt':
  case 'less_than':
  case 'lessThan':
    return actual < expected;

  case '<=':
  case 'lte':
  case 'less_than_or_equal':
  case 'lessThanOrEqual':
    return actual <= expected;

  case 'contains':
    return String(actual).toLowerCase().includes(String(expected).toLowerCase());

  case 'not_contains':
  case 'notContains':
    return !String(actual).toLowerCase().includes(String(expected).toLowerCase());

  case 'starts_with':
  case 'startsWith':
    return String(actual).toLowerCase().startsWith(String(expected).toLowerCase());

  case 'ends_with':
  case 'endsWith':
    return String(actual).toLowerCase().endsWith(String(expected).toLowerCase());

  case 'matches':
  case 'regex':
    try {
      return new RegExp(expected, 'i').test(String(actual));
    } catch (error) {
      console.warn(`Invalid regex pattern: ${expected}`, error);
      return false;
    }

  case 'in':
    return Array.isArray(expected) ? expected.includes(actual) : expected == actual;

  case 'not_in':
  case 'notIn':
    return Array.isArray(expected) ? !expected.includes(actual) : expected != actual;

  case 'is':
    return Boolean(actual) === Boolean(expected);

  case 'is_not':
  case 'isNot':
    return Boolean(actual) !== Boolean(expected);

  default:
    console.warn(`Unknown operator: ${operator}`);
    return false;
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

/**
 * Calculates comprehensive tab statistics for UI display.
 *
 * Performs single-pass accumulation for optimal performance with large tab counts (200+).
 * The function queries all tabs/windows/groups once, then processes the entire dataset in
 * a single loop to compute all statistics simultaneously. This is significantly faster than
 * making multiple separate queries or passes.
 *
 * Statistics calculated:
 * - Total tabs, windows, and groups across all windows
 * - Pinned tabs count
 * - Duplicate tabs count (using URL normalization, excludes original)
 * - Top 5 domains by tab count (sorted descending)
 *
 * Includes performance instrumentation that measures query time vs processing time to help
 * identify bottlenecks. Performance metrics are logged to console for analysis.
 *
 * Used by popup and dashboard header to display tab overview.
 *
 * @returns {Promise<TabStatistics>} Statistics object with performance metrics
 *
 * @typedef {Object} TabStatistics
 * @property {number} totalTabs - Total number of tabs across all windows
 * @property {number} totalWindows - Total number of open windows
 * @property {number} groupedTabs - Number of tab groups (not tabs in groups)
 * @property {number} pinnedTabs - Number of pinned tabs
 * @property {number} duplicates - Number of duplicate tabs (excludes originals - only counts extras)
 * @property {DomainCount[]} topDomains - Top 5 domains by tab count, sorted descending
 * @property {PerformanceMetrics} performanceMetrics - Performance measurement data
 *
 * @typedef {Object} DomainCount
 * @property {string} domain - Domain name (e.g., 'github.com')
 * @property {number} count - Number of tabs from this domain
 *
 * @typedef {Object} PerformanceMetrics
 * @property {number} queryTime - Chrome API query time in milliseconds
 * @property {number} processingTime - Processing/calculation time in milliseconds
 * @property {number} totalTime - Total execution time in milliseconds
 * @property {number} tabCount - Number of tabs processed
 *
 * @example
 * // Display statistics in popup header
 * import { getTabStatistics } from './services/selection/selectTabs.js';
 *
 * const stats = await getTabStatistics();
 * console.log(`${stats.totalTabs} tabs in ${stats.totalWindows} windows`);
 * console.log(`${stats.duplicates} duplicates, ${stats.pinnedTabs} pinned`);
 * console.log(`Top domain: ${stats.topDomains[0].domain} (${stats.topDomains[0].count} tabs)`);
 *
 * @example
 * // Monitor performance with large tab counts
 * const stats = await getTabStatistics();
 * console.log(`Processed ${stats.performanceMetrics.tabCount} tabs in ${stats.performanceMetrics.totalTime}ms`);
 * console.log(`Avg: ${(stats.performanceMetrics.processingTime / stats.totalTabs).toFixed(2)}ms/tab`);
 */
export async function getTabStatistics() {
  const startTotal = performance.now();

  // Measure Chrome API query time
  const startQuery = performance.now();
  const tabs = await chrome.tabs.query({});
  const windows = await chrome.windows.getAll();
  const groups = await chrome.tabGroups.query({});
  const queryTime = performance.now() - startQuery;

  // Measure processing time
  const startProcessing = performance.now();

  const stats = {
    totalTabs: tabs.length,
    totalWindows: windows.length,
    groupedTabs: groups.length, // Number of groups, not tabs in groups
    pinnedTabs: 0,
    duplicates: 0,
    topDomains: []
  };

  // Single-pass accumulation
  const dupeMap = new Map(); // dupeKey -> count
  const domainCounts = new Map(); // domain -> count

  for (const tab of tabs) {

    // Count pinned tabs
    if (tab.pinned) {
      stats.pinnedTabs++;
    }

    // Track duplicates using normalized URL
    const dupeKey = normalizeUrlForDuplicates(tab.url);
    if (dupeKey) {
      dupeMap.set(dupeKey, (dupeMap.get(dupeKey) || 0) + 1);
    }

    // Track domain counts
    const domain = extractDomain(tab.url);
    if (domain) {
      domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
    }
  }

  // Count tabs that are duplicates (exclude the first/original, only count extras)
  for (const count of dupeMap.values()) {
    if (count > 1) {
      stats.duplicates += (count - 1); // Don't count the original
    }
  }

  // Get top 5 domains by count
  stats.topDomains = Array.from(domainCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain, count]) => ({ domain, count }));

  const processingTime = performance.now() - startProcessing;
  const totalTime = performance.now() - startTotal;

  // Add performance metrics for analysis
  stats.performanceMetrics = {
    queryTime: Math.round(queryTime * 100) / 100,
    processingTime: Math.round(processingTime * 100) / 100,
    totalTime: Math.round(totalTime * 100) / 100,
    tabCount: tabs.length
  };

  // Log performance for analysis (use string formatting for proper display in logs)
  console.log(
    `[TabStatistics] Performance: ${tabs.length} tabs, ` +
    `query=${stats.performanceMetrics.queryTime}ms, ` +
    `processing=${stats.performanceMetrics.processingTime}ms, ` +
    `total=${stats.performanceMetrics.totalTime}ms, ` +
    `avg=${Math.round((processingTime / tabs.length) * 1000) / 1000}ms/tab`
  );

  return stats;
};

/**
 * Extract domain from URL - exported for engine compatibility
 * @param {string} url - URL to extract domain from
 * @returns {string} Domain (e.g., 'example.com')
 */
export { extractDomain };

/**
 * Generate duplicate key - alias for normalizeUrlForDuplicates
 * Exported for backward compatibility with v1 engine
 * @param {string} url - URL to generate key for
 * @returns {string} Normalized URL for duplicate detection
 */
export function generateDupeKey(url) {
  return normalizeUrlForDuplicates(url);
}

/**
 * Extract origin information from a referrer URL
 * Recognizes common sources like Gmail, search engines, social media
 * @param {string} referrer - The referrer URL
 * @returns {string} Origin identifier (e.g., 'gmail', 'search', 'direct')
 */
export function extractOrigin(referrer) {
  if (!referrer) return 'direct';

  // Check for known origins
  if (referrer.includes('mail.google.com')) return 'gmail';
  if (referrer.includes('google.com/search')) return 'search';
  if (referrer.includes('bing.com/search')) return 'search';
  if (referrer.includes('duckduckgo.com')) return 'search';
  if (referrer.includes('reddit.com')) return 'reddit';
  if (referrer.includes('twitter.com') || referrer.includes('x.com')) return 'twitter';
  if (referrer.includes('facebook.com')) return 'facebook';
  if (referrer.includes('linkedin.com')) return 'linkedin';
  if (referrer.includes('slack.com')) return 'slack';

  // Handle special protocols
  if (referrer.startsWith('chrome://') ||
      referrer.startsWith('chrome-extension://') ||
      referrer.startsWith('file://') ||
      referrer.startsWith('data:')) {
    return 'direct';
  }

  // Extract domain as origin for others
  const domain = extractDomain(referrer);
  return domain || 'direct';
}

/**
 * Normalize URL - alias for normalizeUrlForDuplicates
 * Exported for backward compatibility
 * @param {string} url - URL to normalize
 * @returns {string} Normalized URL
 */
export function normalizeUrl(url) {
  return normalizeUrlForDuplicates(url);
}

/**
 * Check if two URLs or tab objects are duplicates
 * @param {string|object} url1 - First URL or tab object
 * @param {string|object} url2 - Second URL or tab object
 * @returns {boolean} True if the URLs are duplicates
 */
export function areDuplicates(url1, url2) {
  // Handle null/undefined
  if (!url1 && !url2) return true;
  if (!url1 || !url2) return false;

  // Extract URLs from tab objects if necessary
  const u1 = typeof url1 === 'object' ? url1.url : url1;
  const u2 = typeof url2 === 'object' ? url2.url : url2;

  // Generate and compare dupe keys
  return generateDupeKey(u1) === generateDupeKey(u2);
}

/**
 * Find all duplicate URLs in a list of tabs
 * @param {Array} tabs - Array of tab objects
 * @returns {Map} Map of dupe keys to arrays of duplicate tabs
 */
export function findDuplicates(tabs) {
  const dupeGroups = new Map();

  for (const tab of tabs) {
    if (!tab.url) continue;

    const dupeKey = generateDupeKey(tab.url);
    if (!dupeGroups.has(dupeKey)) {
      dupeGroups.set(dupeKey, []);
    }
    dupeGroups.get(dupeKey).push(tab);
  }

  // Filter out non-duplicates (single tab groups)
  for (const [key, tabList] of dupeGroups.entries()) {
    if (tabList.length <= 1) {
      dupeGroups.delete(key);
    }
  }

  return dupeGroups;
}