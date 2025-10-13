/**
 * @file DeduplicationOrchestrator - Unified entry point for all duplicate tab operations
 *
 * @description
 * The DeduplicationOrchestrator provides a single, consistent API for duplicate detection
 * and removal across all surfaces (rules engine, context menus, dashboard buttons). It
 * handles three scope modes: global deduplication (across all windows), per-window
 * deduplication (isolated to each window), and single-window deduplication (specific window only).
 *
 * The orchestrator's key responsibility is scope management - it groups tabs appropriately,
 * generates dupeKeys for URL normalization, and delegates the actual duplicate detection
 * and closure logic to closeDuplicatesCore (internal implementation). This separation ensures
 * consistent duplicate detection behavior regardless of which surface initiated the operation.
 *
 * Multiple keep strategies are supported: 'oldest' (keep first occurrence), 'newest' (keep
 * last occurrence), 'mru' (most recently used), 'lru' (least recently used), 'all' (close
 * all duplicates), and 'none' (keep all, preview only).
 *
 * Created during Phase 8.2 Architectural Remediation to eliminate duplicate deduplication
 * logic and establish a single source of truth.
 *
 * @module services/execution/DeduplicationOrchestrator
 *
 * @architecture
 * - Layer: Execution Service (Orchestrator)
 * - Dependencies:
 *   - SelectionService.generateDupeKey (URL normalization for duplicate detection)
 *   - closeDuplicatesCore (internal - actual duplicate detection and closure)
 * - Used By: Rules engine, WindowService, background context menus, dashboard buttons
 * - Pattern: Orchestrator - handles coordination, delegates execution to core
 *
 * @example
 * // Global deduplication (all windows)
 * import { deduplicate } from './services/execution/DeduplicationOrchestrator.js';
 *
 * const result = await deduplicate({
 *   scope: 'global',
 *   strategy: 'oldest',
 *   dryRun: false
 * });
 * console.log(`Closed ${result.filter(r => r.success).length} duplicates`);
 *
 * @example
 * // Per-window deduplication (each window isolated)
 * const result = await deduplicate({
 *   scope: 'per-window',
 *   strategy: 'newest'
 * });
 */

import { generateDupeKey } from '../selection/selectTabs.js';
import { closeDuplicatesCore } from './closeDuplicatesCore.js';

/**
 * Orchestrates deduplication with configurable scope and strategy.
 *
 * This is the primary entry point for all deduplication operations in TabMaster Pro.
 * It handles tab collection based on scope, generates dupeKeys for URL normalization,
 * applies scope-based grouping, and delegates duplicate detection/closure to closeDuplicatesCore.
 *
 * Scope behavior:
 * - 'global': Treat all tabs as one pool, dedupe across all windows
 * - 'per-window': Group tabs by window, dedupe each window independently
 * - 'window': Dedupe only tabs in specified windowId
 *
 * Strategy behavior:
 * - 'oldest': Keep first occurrence (by createdAt), close others
 * - 'newest': Keep last occurrence (by createdAt), close others
 * - 'mru': Keep most recently accessed (by lastAccessed), close others
 * - 'lru': Keep least recently accessed (by lastAccessed), close others
 * - 'all': Close all duplicates (keep none)
 * - 'none': Keep all duplicates (preview only)
 *
 * @param {Object} options - Deduplication configuration
 * @param {Array} [options.tabs=null] - Pre-fetched tabs to deduplicate (if null, queries based on scope)
 * @param {number} [options.windowId=null] - Specific window ID (required when scope='window')
 * @param {string} [options.scope='global'] - Scope mode: 'global' | 'per-window' | 'window'
 * @param {string} [options.strategy='oldest'] - Keep strategy: 'oldest' | 'newest' | 'mru' | 'lru' | 'all' | 'none'
 * @param {boolean} [options.dryRun=false] - Preview mode (no actual tab closure)
 * @param {object} [options.chromeApi=chrome] - Chrome API object (dependency injection for tests)
 *
 * @returns {Promise<Array>} Results array with objects: { tabId, action, success, details } or { error }
 *
 * @example
 * // Global deduplication, keep oldest tabs
 * const result = await deduplicate({
 *   scope: 'global',
 *   strategy: 'oldest'
 * });
 * console.log(`Closed ${result.filter(r => r.action === 'close').length} duplicates`);
 *
 * @example
 * // Per-window deduplication, keep newest tabs
 * const result = await deduplicate({
 *   scope: 'per-window',
 *   strategy: 'newest',
 *   dryRun: false
 * });
 *
 * @example
 * // Single window deduplication with preview
 * const preview = await deduplicate({
 *   scope: 'window',
 *   windowId: 123,
 *   strategy: 'oldest',
 *   dryRun: true
 * });
 * console.log(`Would close ${preview.filter(r => r.action === 'close').length} tabs`);
 *
 * @example
 * // Use with pre-fetched tabs
 * const tabs = await chrome.tabs.query({});
 * const result = await deduplicate({
 *   tabs,
 *   scope: 'global',
 *   strategy: 'mru'
 * });
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
 * Deduplicates tabs across all windows (convenience wrapper).
 *
 * Backward compatibility helper that wraps deduplicate() with scope='global'.
 * Treats all tabs as a single pool and removes duplicates across all windows,
 * keeping one occurrence based on strategy.
 *
 * Use this when you want cross-window deduplication (e.g., "Close Duplicates"
 * button that affects entire browser).
 *
 * @param {Array} tabs - Pre-fetched tabs to deduplicate
 * @param {string} [strategy='oldest'] - Keep strategy ('oldest', 'newest', 'mru', 'lru', 'all', 'none')
 * @param {boolean} [dryRun=false] - Preview mode (no actual closure)
 *
 * @returns {Promise<Array>} Results array from closeDuplicatesCore
 *
 * @example
 * // Close duplicates across all windows, keeping oldest
 * const tabs = await chrome.tabs.query({});
 * const result = await deduplicateGlobal(tabs, 'oldest');
 * console.log(`Closed ${result.filter(r => r.action === 'close').length} duplicates globally`);
 */
export async function deduplicateGlobal(tabs, strategy = 'oldest', dryRun = false) {
  return deduplicate({ tabs, scope: 'global', strategy, dryRun });
}

/**
 * Deduplicates tabs within each window separately (convenience wrapper).
 *
 * Backward compatibility helper that wraps deduplicate() with scope='per-window'.
 * Groups tabs by window and deduplicates each window independently. A URL appearing
 * in multiple windows will be kept in each window, but duplicates within a window
 * are removed.
 *
 * Use this for rules like "Keep newest duplicate per window" where you want to
 * preserve cross-window tabs but clean up within-window duplicates.
 *
 * @param {Array} tabs - Pre-fetched tabs to deduplicate
 * @param {string} [strategy='oldest'] - Keep strategy ('oldest', 'newest', 'mru', 'lru', 'all', 'none')
 * @param {boolean} [dryRun=false] - Preview mode (no actual closure)
 *
 * @returns {Promise<Array>} Results array from closeDuplicatesCore
 *
 * @example
 * // Deduplicate each window separately, keeping newest in each
 * const tabs = await chrome.tabs.query({});
 * const result = await deduplicatePerWindow(tabs, 'newest');
 * console.log(`Closed ${result.filter(r => r.action === 'close').length} duplicates per-window`);
 */
export async function deduplicatePerWindow(tabs, strategy = 'oldest', dryRun = false) {
  return deduplicate({ tabs, scope: 'per-window', strategy, dryRun });
}

/**
 * Deduplicates tabs in a specific window only (convenience wrapper).
 *
 * Backward compatibility helper that wraps deduplicate() with scope='window'.
 * Only processes tabs in the specified window, ignoring all other windows.
 *
 * Use this for window-scoped operations like context menu "Remove Duplicates in Window"
 * or when working with a specific window ID.
 *
 * @param {number} windowId - Chrome window ID to deduplicate
 * @param {string} [strategy='oldest'] - Keep strategy ('oldest', 'newest', 'mru', 'lru', 'all', 'none')
 * @param {boolean} [dryRun=false] - Preview mode (no actual closure)
 *
 * @returns {Promise<Array>} Results array from closeDuplicatesCore
 *
 * @example
 * // Remove duplicates in window 123, keeping oldest
 * const result = await deduplicateWindow(123, 'oldest');
 * console.log(`Closed ${result.filter(r => r.action === 'close').length} duplicates in window`);
 *
 * @example
 * // Preview what would be closed
 * const preview = await deduplicateWindow(123, 'newest', true);
 * console.log(`Window has ${preview.filter(r => r.action === 'close').length} duplicates`);
 */
export async function deduplicateWindow(windowId, strategy = 'oldest', dryRun = false) {
  return deduplicate({ windowId, scope: 'window', strategy, dryRun });
}
