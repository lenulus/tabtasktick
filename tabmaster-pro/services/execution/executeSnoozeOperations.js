/**
 * Snooze Execution Coordinator
 *
 * Coordinates execution of snooze operations from detectSnoozeOperations.
 * Delegates to WindowService and SnoozeService for actual execution.
 *
 * This is pure business logic - no UI dependencies.
 */

import { snoozeWindow } from './WindowService.js';
import { snoozeTabs } from './SnoozeService.js';

/**
 * Executes snooze operations detected by detectSnoozeOperations.
 *
 * @param {Object} params
 * @param {SnoozeOperation[]} params.operations - Operations from detectSnoozeOperations
 * @param {number} params.snoozeUntil - Timestamp when items should wake
 * @param {Object} params.options - Additional options
 * @param {string} [params.options.reason='manual'] - Snooze reason
 * @param {string} [params.options.restorationMode='original'] - Where to restore tabs ('original', 'current', 'new')
 * @returns {Promise<ExecutionResult>}
 *
 * @typedef {Object} ExecutionResult
 * @property {boolean} success - Overall success status
 * @property {WindowResult[]} windows - Results for window operations
 * @property {TabResult[]} tabs - Results for tab operations
 * @property {Object} summary - Summary of execution
 * @property {Error[]} errors - Any errors encountered
 */
export async function executeSnoozeOperations({ operations, snoozeUntil, options = {} }) {
  const {
    reason = 'manual',
    restorationMode = 'original'
  } = options;

  const results = {
    success: true,
    windows: [],
    tabs: [],
    summary: {
      windowsSnoozed: 0,
      tabsSnoozed: 0,
      totalOperations: operations.length
    },
    errors: []
  };

  // Calculate duration from timestamp
  const duration = snoozeUntil - Date.now();

  if (duration < 0) {
    results.success = false;
    results.errors.push(new Error('Snooze time is in the past'));
    return results;
  }

  // Execute window operations first
  for (const operation of operations.filter(op => op.type === 'window')) {
    try {
      const windowResult = await snoozeWindow(
        operation.windowId,
        duration,
        {
          reason,
          restorationMode
        }
      );

      results.windows.push({
        windowId: operation.windowId,
        snoozeId: windowResult.snoozeId,
        tabCount: windowResult.tabCount,
        success: true
      });

      results.summary.windowsSnoozed++;
      results.summary.tabsSnoozed += windowResult.tabCount;
    } catch (error) {
      console.error(`Failed to snooze window ${operation.windowId}:`, error);
      results.success = false;
      results.errors.push(error);
      results.windows.push({
        windowId: operation.windowId,
        success: false,
        error: error.message
      });
    }
  }

  // Execute tab operations
  for (const operation of operations.filter(op => op.type === 'tabs')) {
    try {
      const snoozedTabs = await snoozeTabs(
        operation.tabIds,
        snoozeUntil,
        {
          reason,
          restorationMode,
          sourceWindowId: operation.sourceWindowId // Track source for restoration
        }
      );

      results.tabs.push({
        tabIds: operation.tabIds,
        tabCount: snoozedTabs.length,
        sourceWindowId: operation.sourceWindowId,
        success: true
      });

      results.summary.tabsSnoozed += snoozedTabs.length;
    } catch (error) {
      console.error(`Failed to snooze tabs ${operation.tabIds.join(', ')}:`, error);
      results.success = false;
      results.errors.push(error);
      results.tabs.push({
        tabIds: operation.tabIds,
        success: false,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Validates that operations can be executed.
 *
 * @param {SnoozeOperation[]} operations - Operations to validate
 * @returns {Promise<{valid: boolean, errors: string[]}>}
 */
export async function validateOperations(operations) {
  const errors = [];

  if (!operations || operations.length === 0) {
    errors.push('No operations to execute');
  }

  // Validate window operations
  for (const op of operations.filter(o => o.type === 'window')) {
    if (!op.windowId) {
      errors.push('Window operation missing windowId');
    }
    // Check if window still exists
    try {
      await chrome.windows.get(op.windowId);
    } catch (e) {
      errors.push(`Window ${op.windowId} no longer exists`);
    }
  }

  // Validate tab operations
  for (const op of operations.filter(o => o.type === 'tabs')) {
    if (!op.tabIds || op.tabIds.length === 0) {
      errors.push('Tab operation has no tab IDs');
    }
    // Check if tabs still exist
    for (const tabId of op.tabIds || []) {
      try {
        await chrome.tabs.get(tabId);
      } catch (e) {
        errors.push(`Tab ${tabId} no longer exists`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
