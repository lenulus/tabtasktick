/**
 * Deduplication Orchestrator Service
 *
 * Single entry point for all deduplication operations.
 * Handles scope-based deduplication (global, per-window, window).
 *
 * Part of Phase 8.2 Architectural Remediation.
 *
 * Architecture:
 * - All surfaces (rules engine, context menu, dashboard) call this service
 * - This service handles tab selection, dupeKey generation, and scope logic
 * - Delegates actual closing to closeDuplicatesCore (internal implementation)
 *
 * Scope modes:
 * - 'global': Dedupe across all windows (default)
 * - 'per-window': Dedupe within each window separately
 * - 'window': Dedupe only specific window
 */

import { generateDupeKey } from '../selection/selectTabs.js';
import { closeDuplicatesCore } from './closeDuplicatesCore.js';

/**
 * Orchestrates deduplication with proper scope handling
 * Single entry point for all deduplication operations
 *
 * @param {Object} options - Deduplication options
 * @param {Array} [options.tabs=null] - Optional: tabs to deduplicate (if not provided, queries based on scope)
 * @param {number} [options.windowId=null] - Optional: specific window to deduplicate (for scope='window')
 * @param {string} [options.scope='global'] - Scope: 'global' | 'per-window' | 'window'
 * @param {string} [options.strategy='oldest'] - Keep strategy: 'oldest', 'newest', 'mru', 'lru', 'all', 'none'
 * @param {boolean} [options.dryRun=false] - If true, preview without executing
 * @param {object} [options.chromeApi=chrome] - Chrome API object (for dependency injection in tests)
 * @returns {Promise<Array>} Results array with { tabId, action, success, details } or { error }
 */
export async function deduplicate(options) {
  const {
    tabs = null,
    windowId = null,
    scope = 'global',
    strategy = 'oldest',
    dryRun = false,
    chromeApi = chrome
  } = options;

  // 1. Tab collection based on scope
  let targetTabs;
  if (scope === 'window' && windowId) {
    // Window-specific: query single window
    targetTabs = await chromeApi.tabs.query({ windowId });
  } else if (tabs) {
    // Use provided tabs
    targetTabs = tabs;
  } else {
    // Global or per-window: query all tabs
    targetTabs = await chromeApi.tabs.query({});
  }

  // 2. Add dupeKeys if missing (single place for this logic)
  const tabsWithKeys = targetTabs.map(tab => ({
    ...tab,
    dupeKey: tab.dupeKey || generateDupeKey(tab.url)
  }));

  // 3. Apply scope-based grouping
  if (scope === 'per-window') {
    // Group by window, dedupe within each
    const results = [];
    const windowGroups = {};

    for (const tab of tabsWithKeys) {
      const winId = tab.windowId;
      if (!windowGroups[winId]) {
        windowGroups[winId] = [];
      }
      windowGroups[winId].push(tab);
    }

    for (const windowTabs of Object.values(windowGroups)) {
      const windowResults = await closeDuplicatesCore(
        windowTabs,
        strategy,
        dryRun,
        chromeApi
      );
      results.push(...windowResults);
    }

    return results;
  } else {
    // Global or window scope: treat as single pool
    return await closeDuplicatesCore(
      tabsWithKeys,
      strategy,
      dryRun,
      chromeApi
    );
  }
}

/**
 * Deduplicate across all windows (backward compatibility helper)
 *
 * @param {Array} tabs - Tabs to deduplicate
 * @param {string} strategy - Keep strategy
 * @param {boolean} dryRun - Preview mode
 * @returns {Promise<Array>} Results
 */
export async function deduplicateGlobal(tabs, strategy = 'oldest', dryRun = false) {
  return deduplicate({ tabs, scope: 'global', strategy, dryRun });
}

/**
 * Deduplicate within each window separately (backward compatibility helper)
 *
 * @param {Array} tabs - Tabs to deduplicate
 * @param {string} strategy - Keep strategy
 * @param {boolean} dryRun - Preview mode
 * @returns {Promise<Array>} Results
 */
export async function deduplicatePerWindow(tabs, strategy = 'oldest', dryRun = false) {
  return deduplicate({ tabs, scope: 'per-window', strategy, dryRun });
}

/**
 * Deduplicate a specific window (backward compatibility helper)
 *
 * @param {number} windowId - Window ID to deduplicate
 * @param {string} strategy - Keep strategy
 * @param {boolean} dryRun - Preview mode
 * @returns {Promise<Array>} Results
 */
export async function deduplicateWindow(windowId, strategy = 'oldest', dryRun = false) {
  return deduplicate({ windowId, scope: 'window', strategy, dryRun });
}
