/**
 * @file detectSnoozeOperations - Smart window and tab snooze detection
 *
 * @description
 * The detectSnoozeOperations service analyzes user tab selections and intelligently
 * determines the optimal snooze operations to perform. It detects when all tabs in a
 * window are selected (indicating window-level snooze intent) versus when only some
 * tabs are selected (indicating tab-level snooze intent).
 *
 * The smart detection algorithm groups selected tabs by window, queries each window to
 * check if all tabs are selected, and creates either window operations (snooze entire
 * window) or tab operations (snooze individual tabs). This distinction is critical for
 * proper restoration - window snoozes preserve window metadata and can be restored as
 * complete windows, while tab snoozes only restore individual tabs.
 *
 * The service provides comprehensive operation summaries including counts of windows,
 * individual tabs, and flags for single-window vs mixed operations. These summaries
 * enable UI surfaces to show appropriate confirmation messages like "Snooze 2 windows
 * and 5 tabs" or "Snooze window with 12 tabs".
 *
 * @module services/selection/detectSnoozeOperations
 *
 * @architecture
 * - Layer: Selection Service (Detection/Analysis)
 * - Dependencies: chrome.tabs API (read-only queries)
 * - Used By: executeSnoozeOperations, background message handlers, dashboard/popup UI
 * - Pattern: Detection - analyzes patterns in user selections, produces operation plans
 *
 * @example
 * // Detect operations from user tab selection
 * import { detectSnoozeOperations } from './services/selection/detectSnoozeOperations.js';
 *
 * const selectedTabIds = [123, 456, 789]; // User-selected tabs
 * const { operations, summary } = await detectSnoozeOperations(selectedTabIds);
 *
 * console.log(`Operations: ${operations.length}`);
 * console.log(`Windows: ${summary.windowCount}, Individual tabs: ${summary.individualTabCount}`);
 *
 * @example
 * // Detect complete window snooze
 * const windowTabs = await chrome.tabs.query({ windowId: 123 });
 * const { operations } = await detectSnoozeOperations(windowTabs.map(t => t.id));
 *
 * console.log(operations[0].type); // 'window' (all tabs selected)
 * console.log(operations[0].windowTitle); // "github.com (5 tabs)"
 */

/**
 * Analyzes selected tabs and determines optimal snooze operations.
 *
 * This is the core detection algorithm that groups selected tabs by window and determines
 * whether to perform window-level or tab-level snooze operations. The algorithm:
 * 1. Groups selected tabs by window ID
 * 2. Queries all tabs in each affected window
 * 3. Compares selected count vs total count to detect complete window selections
 * 4. Creates window operations (type: 'window') for complete windows
 * 5. Creates tab operations (type: 'tabs') for partial window selections
 *
 * Window detection is critical because window snoozes preserve window metadata (position,
 * state, focused status) for better restoration, while tab snoozes only track individual
 * tab data.
 *
 * The function returns both the operations array (for execution) and a summary (for UI
 * display and analytics). Empty selections return empty operations with zero-counts.
 *
 * @param {number[]} selectedTabIds - Array of Chrome tab IDs selected by user
 *
 * @returns {Promise<DetectionResult>} Detection result with operations and summary
 *
 * @typedef {Object} DetectionResult
 * @property {SnoozeOperation[]} operations - Array of operations to execute (sequential order: windows first, then tabs)
 * @property {OperationSummary} summary - Aggregate statistics for UI display
 *
 * @typedef {Object} SnoozeOperation
 * @property {'window'|'tabs'} type - Operation type (window = snooze entire window, tabs = snooze individual tabs)
 * @property {number} [windowId] - Chrome window ID (present only for type: 'window')
 * @property {string} [windowTitle] - Human-readable window title (present only for type: 'window')
 * @property {number[]} [tabIds] - Chrome tab IDs (present only for type: 'tabs')
 * @property {number} [sourceWindowId] - Source window ID for tab operations (restoration tracking)
 * @property {number} tabCount - Number of tabs in this operation
 *
 * @typedef {Object} OperationSummary
 * @property {number} totalTabs - Total tabs being snoozed across all operations
 * @property {number} windowCount - Number of complete window operations
 * @property {number} individualTabCount - Number of tabs in tab operations (excludes tabs in window operations)
 * @property {boolean} isSingleWindow - True if all selected tabs belong to one window
 * @property {boolean} isMixed - True if there are both window and tab operations (mixed intent)
 *
 * @example
 * // Detect single window snooze (all tabs selected)
 * import { detectSnoozeOperations } from './services/selection/detectSnoozeOperations.js';
 *
 * const windowTabs = await chrome.tabs.query({ windowId: 123 });
 * const { operations, summary } = await detectSnoozeOperations(windowTabs.map(t => t.id));
 *
 * console.log(operations[0].type); // 'window'
 * console.log(operations[0].windowTitle); // "github.com (8 tabs)"
 * console.log(summary.windowCount); // 1
 * console.log(summary.isSingleWindow); // true
 *
 * @example
 * // Detect partial window snooze (some tabs selected)
 * const selectedTabIds = [123, 456]; // Only 2 out of 8 tabs in window
 * const { operations, summary } = await detectSnoozeOperations(selectedTabIds);
 *
 * console.log(operations[0].type); // 'tabs'
 * console.log(operations[0].tabIds); // [123, 456]
 * console.log(operations[0].sourceWindowId); // 999 (for restoration)
 * console.log(summary.individualTabCount); // 2
 *
 * @example
 * // Detect mixed operations (multiple windows, some complete, some partial)
 * const mixedTabIds = [1, 2, 3, 4, 5, 6]; // Tabs from 3 windows
 * const { operations, summary } = await detectSnoozeOperations(mixedTabIds);
 *
 * // Window 1: All 3 tabs selected → window operation
 * // Window 2: 2 of 5 tabs selected → tab operation
 * // Window 3: 1 of 10 tabs selected → tab operation
 *
 * console.log(operations.length); // 3
 * console.log(summary.windowCount); // 1
 * console.log(summary.individualTabCount); // 3
 * console.log(summary.isMixed); // true
 *
 * @example
 * // Handle empty selection
 * const { operations, summary } = await detectSnoozeOperations([]);
 *
 * console.log(operations.length); // 0
 * console.log(summary.totalTabs); // 0
 */
export async function detectSnoozeOperations(selectedTabIds) {
  if (!selectedTabIds || selectedTabIds.length === 0) {
    return {
      operations: [],
      summary: {
        totalTabs: 0,
        windowCount: 0,
        individualTabCount: 0,
        isSingleWindow: false,
        isMixed: false
      }
    };
  }

  // Get all tabs with their window information
  const selectedTabs = await chrome.tabs.query({
    // Query all tabs, then filter to selected IDs
  });
  const selectedTabsMap = new Map(
    selectedTabs
      .filter(tab => selectedTabIds.includes(tab.id))
      .map(tab => [tab.id, tab])
  );

  // Group selected tabs by window
  const tabsByWindow = new Map();
  for (const tab of selectedTabsMap.values()) {
    if (!tabsByWindow.has(tab.windowId)) {
      tabsByWindow.set(tab.windowId, []);
    }
    tabsByWindow.get(tab.windowId).push(tab);
  }

  // Get all tabs in each window to detect complete windows
  const windowPromises = Array.from(tabsByWindow.keys()).map(async windowId => {
    const allTabsInWindow = await chrome.tabs.query({ windowId });
    return {
      windowId,
      allTabs: allTabsInWindow,
      selectedTabs: tabsByWindow.get(windowId)
    };
  });
  const windowsData = await Promise.all(windowPromises);

  // Analyze each window and create operations
  const operations = [];
  let totalWindowCount = 0;
  let totalIndividualTabCount = 0;

  for (const { windowId, allTabs, selectedTabs } of windowsData) {
    const isCompleteWindow = selectedTabs.length === allTabs.length;

    if (isCompleteWindow) {
      // Complete window - create window operation
      const windowTitle = await getWindowTitle(windowId, allTabs);
      operations.push({
        type: 'window',
        windowId,
        windowTitle,
        tabCount: allTabs.length
      });
      totalWindowCount++;
    } else {
      // Partial window - create tabs operation
      operations.push({
        type: 'tabs',
        tabIds: selectedTabs.map(t => t.id),
        tabCount: selectedTabs.length,
        sourceWindowId: windowId // Track source for restoration
      });
      totalIndividualTabCount += selectedTabs.length;
    }
  }

  // Build summary
  const summary = {
    totalTabs: selectedTabIds.length,
    windowCount: totalWindowCount,
    individualTabCount: totalIndividualTabCount,
    isSingleWindow: tabsByWindow.size === 1,
    isMixed: totalWindowCount > 0 && totalIndividualTabCount > 0
  };

  return { operations, summary };
}

/**
 * Generates a descriptive title for a window based on its tabs.
 *
 * Creates human-readable window titles for UI display in format: "domain.com (N tabs)".
 * Uses the active tab's domain if available, otherwise falls back to the first tab.
 * Handles edge cases like unparseable URLs by using tab title truncated to 30 chars.
 *
 * @param {number} windowId - Chrome window ID
 * @param {chrome.tabs.Tab[]} tabs - Tabs in the window
 *
 * @returns {Promise<string>} Formatted window title
 *
 * @example
 * // Active tab in window
 * const title = await getWindowTitle(123, [
 *   { url: 'https://github.com/user/repo', active: false },
 *   { url: 'https://www.google.com/search', active: true }
 * ]);
 * console.log(title); // "google.com (2 tabs)"
 *
 * @example
 * // No active tab, uses first tab
 * const title = await getWindowTitle(123, [
 *   { url: 'https://www.reddit.com/r/programming', active: false }
 * ]);
 * console.log(title); // "reddit.com (1 tab)"
 *
 * @example
 * // Unparseable URL, uses tab title
 * const title = await getWindowTitle(123, [
 *   { url: 'chrome://extensions', title: 'Extensions', active: true }
 * ]);
 * console.log(title); // "Extensions (1 tab)"
 */
async function getWindowTitle(windowId, tabs) {
  if (!tabs || tabs.length === 0) {
    return `Window ${windowId}`;
  }

  // Get the active tab's title, or the first tab if no active tab
  const activeTab = tabs.find(t => t.active);
  const titleTab = activeTab || tabs[0];

  // Extract domain from URL
  let domain = 'Unknown';
  try {
    const url = new URL(titleTab.url);
    domain = url.hostname.replace('www.', '');
  } catch (e) {
    // If URL parsing fails, use the title
    if (titleTab.title && titleTab.title.length > 0) {
      domain = titleTab.title.substring(0, 30);
    }
  }

  return `${domain} (${tabs.length} tab${tabs.length !== 1 ? 's' : ''})`;
}

/**
 * Validates that selected tabs still exist in Chrome.
 *
 * Checks each tab ID against Chrome's tab registry to determine which tabs still exist
 * and which have been closed since selection. This is useful for preview/confirmation UIs
 * that need to validate selections before showing snooze dialogs, especially in workflows
 * where there's a delay between tab selection and operation execution.
 *
 * The function performs parallel validation (all tab checks run concurrently) for performance
 * with large selections (200+ tabs). Empty input returns empty valid/invalid arrays.
 *
 * @param {number[]} tabIds - Array of Chrome tab IDs to validate
 *
 * @returns {Promise<ValidationResult>} Validation result with valid and invalid tab IDs
 *
 * @typedef {Object} ValidationResult
 * @property {number[]} valid - Tab IDs that still exist in Chrome
 * @property {number[]} invalid - Tab IDs that no longer exist (closed or invalid)
 *
 * @example
 * // Validate tab selection before showing snooze dialog
 * import { validateTabIds } from './services/selection/detectSnoozeOperations.js';
 *
 * const selectedTabIds = [123, 456, 789];
 * const { valid, invalid } = await validateTabIds(selectedTabIds);
 *
 * if (invalid.length > 0) {
 *   console.warn(`${invalid.length} tabs no longer exist`);
 * }
 *
 * // Show dialog only for valid tabs
 * showSnoozeDialog(valid);
 *
 * @example
 * // Handle completely stale selection
 * const { valid, invalid } = await validateTabIds([999, 888, 777]); // All closed
 *
 * if (valid.length === 0) {
 *   alert('All selected tabs have been closed');
 *   return;
 * }
 *
 * @example
 * // Validate empty selection
 * const { valid, invalid } = await validateTabIds([]);
 * console.log(valid.length); // 0
 * console.log(invalid.length); // 0
 */
export async function validateTabIds(tabIds) {
  const results = {
    valid: [],
    invalid: []
  };

  if (!tabIds || tabIds.length === 0) {
    return results;
  }

  // Check each tab
  const validationPromises = tabIds.map(async tabId => {
    try {
      const tab = await chrome.tabs.get(tabId);
      return { tabId, exists: !!tab };
    } catch (e) {
      return { tabId, exists: false };
    }
  });

  const validations = await Promise.all(validationPromises);
  for (const { tabId, exists } of validations) {
    if (exists) {
      results.valid.push(tabId);
    } else {
      results.invalid.push(tabId);
    }
  }

  return results;
}
