// Test Helpers - Common utilities for testing the rules engine

import { chromeMock } from './chrome-mock.js';
import { createTab, addTimeTracking } from './tab-factory.js';
import { extractDomain, normalizeUrlForDuplicates, extractOrigin } from '../../services/selection/selectTabs.js';
import { getCategoriesForDomain } from '../../lib/domain-categories.js';

/**
 * Build indices for test contexts
 * Replaces deprecated engine.buildIndices
 */
function buildIndicesForTests(tabs) {
  const byDomain = {};
  const byOrigin = {};
  const byDupeKey = {};
  const byCategory = {};

  // Enhance tabs with derived fields and build indices
  for (const tab of tabs) {
    tab.domain = tab.domain || extractDomain(tab.url);
    tab.dupeKey = tab.dupeKey || normalizeUrlForDuplicates(tab.url);
    tab.origin = tab.origin || extractOrigin(tab.referrer || '');

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

  return { byDomain, byOrigin, byDupeKey, byCategory };
}

// Helper to create a test context with tabs, windows, and indices
export function createTestContext(tabs, windows = null, timeData = null) {
  // Default to one window if not provided
  if (!windows) {
    // Create windows based on unique windowIds in tabs
    const windowIds = [...new Set(tabs.map(t => t.windowId || 1))];
    windows = windowIds.map(id => ({
      id,
      tabCount: tabs.filter(t => (t.windowId || 1) === id).length
    }));
  }

  // Ensure all tabs have windowId
  tabs.forEach(tab => {
    if (!tab.windowId) tab.windowId = 1;
  });

  // Build indices using SelectionService logic
  // V2's selectTabsMatchingRule() builds its own indices internally,
  // but some tests (like predicate.test.js) test the predicate compiler
  // directly and need the indices in the context
  const idx = buildIndicesForTests(tabs);

  const context = {
    tabs,
    windows,
    idx
  };

  // Add time data if provided
  if (timeData) {
    context.timeData = timeData;
  }

  return context;
}

// Helper to simulate rule evaluation
export function evaluateRuleOnTab(rule, tab, context) {
  // This would use the real predicate compiler
  // For now, return a simple mock evaluation
  return {
    matched: false,
    reason: 'Mock evaluation'
  };
}

// Helper to wait for async operations
export function waitFor(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to setup Chrome API responses for integration tests
export function setupChromeResponses(scenario = 'default') {
  switch (scenario) {
  case 'with-tabs':
    chromeMock.tabs.query.mockResolvedValue([
      createTab({ id: 1, url: 'https://example.com' }),
      createTab({ id: 2, url: 'https://google.com' }),
      createTab({ id: 3, url: 'https://github.com' })
    ]);
    break;
      
  case 'with-groups':
    chromeMock.tabs.query.mockResolvedValue([
      createTab({ id: 1, groupId: 1 }),
      createTab({ id: 2, groupId: 1 }),
      createTab({ id: 3, groupId: 2 })
    ]);
    chromeMock.tabGroups.query.mockResolvedValue([
      { id: 1, title: 'Work', color: 'blue' },
      { id: 2, title: 'Personal', color: 'red' }
    ]);
    break;
      
  case 'empty':
    chromeMock.tabs.query.mockResolvedValue([]);
    break;
      
  default:
    // Reset to empty state
    break;
  }
}

// Helper to verify action was executed
export function verifyAction(action, expectedCalls) {
  switch (action.action) {
  case 'close':
    expect(chromeMock.tabs.remove).toHaveBeenCalledTimes(expectedCalls);
    break;
  case 'group':
    expect(chromeMock.tabs.group).toHaveBeenCalledTimes(expectedCalls);
    break;
  case 'snooze':
    expect(chromeMock.storage.local.set).toHaveBeenCalled();
    break;
  }
}

// Helper to create a mock dry-run result
export function createDryRunResult(rule, matchedTabs) {
  return {
    rule: {
      id: rule.id,
      name: rule.name
    },
    matches: matchedTabs.map(tab => ({
      tabId: tab.id,
      title: tab.title,
      url: tab.url,
      actions: rule.then.map(a => a.action)
    })),
    totalMatches: matchedTabs.length,
    wouldExecute: rule.then
  };
}

// Helper to parse duration strings (like the engine will need to)
export function parseDuration(duration) {
  const units = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };
  
  const match = duration.match(/^(\d+)([mhd])$/);
  if (!match) return null;
  
  const [, num, unit] = match;
  return parseInt(num) * units[unit];
}

// Helper to normalize URLs (simplified version for testing)
export function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    
    // Remove hash
    parsed.hash = '';
    
    // Remove tracking params
    const params = new URLSearchParams(parsed.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'fbclid'].forEach(param => {
      params.delete(param);
    });
    
    // Sort remaining params
    const sortedParams = new URLSearchParams([...params.entries()].sort());
    parsed.search = sortedParams.toString();
    
    return parsed.toString();
  } catch (e) {
    return url;
  }
}

// Helper to generate expected log entries
export function expectLogEntry(action, details, source = 'manual') {
  return {
    action,
    details,
    source,
    timestamp: expect.any(Number)
  };
}

// Helper to mock performance.now() for consistent timing tests
export function mockPerformanceNow() {
  let time = 0;
  const originalNow = performance.now;
  
  performance.now = jest.fn(() => time);
  
  return {
    advance: (ms) => { time += ms; },
    reset: () => { 
      time = 0;
      performance.now = originalNow;
    }
  };
}