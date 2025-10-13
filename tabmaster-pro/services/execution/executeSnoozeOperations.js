/**
 * @file executeSnoozeOperations - Orchestrates snooze operation execution
 *
 * @description
 * The executeSnoozeOperations service coordinates the execution of snooze operations
 * detected by detectSnoozeOperations. It serves as the orchestration layer between
 * detection (identifying what to snooze) and execution (actually snoozing tabs/windows).
 *
 * The service handles both window-level and tab-level operations, delegating window
 * snoozes to WindowService and tab snoozes to SnoozeService. It processes operations
 * sequentially (windows first, then tabs) to avoid race conditions with closing tabs.
 *
 * Key features include operation validation, graceful error handling (partial success
 * support), and comprehensive result tracking with summaries. The service is purely
 * business logic with no UI dependencies, making it reusable across all surfaces
 * (dashboard, popup, background context menus).
 *
 * @module services/execution/executeSnoozeOperations
 *
 * @architecture
 * - Layer: Execution Service (Orchestrator)
 * - Dependencies:
 *   - WindowService.snoozeWindow (window-level snoozing)
 *   - SnoozeService.snoozeTabs (tab-level snoozing)
 * - Used By: Background message handlers, dashboard buttons, popup UI, rules engine
 * - Pattern: Orchestrator - coordinates multiple services, handles sequencing
 *
 * @example
 * // Execute detected operations
 * import { executeSnoozeOperations } from './services/execution/executeSnoozeOperations.js';
 * import { detectSnoozeOperations } from './services/execution/detectSnoozeOperations.js';
 *
 * const operations = await detectSnoozeOperations(selectedTabIds);
 * const snoozeUntil = Date.now() + (60 * 60 * 1000); // 1 hour
 *
 * const result = await executeSnoozeOperations({
 *   operations,
 *   snoozeUntil,
 *   options: { reason: 'manual', restorationMode: 'original' }
 * });
 *
 * console.log(`Snoozed ${result.summary.tabsSnoozed} tabs in ${result.summary.windowsSnoozed} windows`);
 *
 * @example
 * // Handle mixed window and tab operations
 * const operations = [
 *   { type: 'window', windowId: 123 },
 *   { type: 'tabs', tabIds: [456, 789], sourceWindowId: 999 }
 * ];
 *
 * const result = await executeSnoozeOperations({
 *   operations,
 *   snoozeUntil: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
 *   options: { restorationMode: 'new' }
 * });
 */

import { snoozeWindow } from './WindowService.js';
import { snoozeTabs } from './SnoozeService.js';

/**
 * Executes snooze operations detected by detectSnoozeOperations.
 *
 * This is the main orchestration function that coordinates execution of both window and
 * tab snooze operations. It processes operations sequentially (windows first, then tabs)
 * to avoid race conditions where closing a window would affect tab operations.
 *
 * The function supports graceful error handling - if some operations fail, others continue
 * and the function returns partial results with detailed error tracking. The overall success
 * flag is set to false if any operation fails, but all attempted operations are tracked
 * in the results.
 *
 * Time validation is performed upfront - if snoozeUntil is in the past, the function fails
 * immediately without executing any operations.
 *
 * @param {Object} params - Execution parameters
 * @param {SnoozeOperation[]} params.operations - Operations from detectSnoozeOperations
 * @param {number} params.snoozeUntil - Unix timestamp (milliseconds) when items should wake
 * @param {Object} [params.options={}] - Additional snooze options
 * @param {string} [params.options.reason='manual'] - Snooze reason for tracking/UI
 * @param {string} [params.options.restorationMode='original'] - Restoration mode: 'original' | 'current' | 'new'
 *
 * @returns {Promise<ExecutionResult>} Results object with per-operation tracking
 *
 * @typedef {Object} SnoozeOperation
 * @property {string} type - Operation type: 'window' | 'tabs'
 * @property {number} [windowId] - Window ID for window operations
 * @property {number[]} [tabIds] - Tab IDs for tab operations
 * @property {number} [sourceWindowId] - Source window for tab operations (restoration tracking)
 *
 * @typedef {Object} ExecutionResult
 * @property {boolean} success - True if all operations succeeded, false if any failed
 * @property {WindowResult[]} windows - Results for each window operation
 * @property {TabResult[]} tabs - Results for each tab operation
 * @property {Object} summary - Aggregate statistics
 * @property {number} summary.windowsSnoozed - Number of windows successfully snoozed
 * @property {number} summary.tabsSnoozed - Total tabs snoozed (includes tabs in snoozed windows)
 * @property {number} summary.totalOperations - Total operations attempted
 * @property {Error[]} errors - Array of errors encountered during execution
 *
 * @typedef {Object} WindowResult
 * @property {number} windowId - Chrome window ID
 * @property {string} [snoozeId] - Unique snooze identifier for restoration
 * @property {number} [tabCount] - Number of tabs in snoozed window
 * @property {boolean} success - Whether operation succeeded
 * @property {string} [error] - Error message if operation failed
 *
 * @typedef {Object} TabResult
 * @property {number[]} tabIds - Tab IDs in this operation
 * @property {number} [tabCount] - Number of tabs successfully snoozed
 * @property {number} [sourceWindowId] - Source window ID for restoration
 * @property {boolean} success - Whether operation succeeded
 * @property {string} [error] - Error message if operation failed
 *
 * @throws {Error} Does not throw - all errors are caught and returned in results.errors
 *
 * @example
 * // Execute window and tab snooze operations
 * import { detectSnoozeOperations } from './detectSnoozeOperations.js';
 * import { executeSnoozeOperations } from './executeSnoozeOperations.js';
 *
 * const operations = await detectSnoozeOperations([123, 456, 789]);
 * const snoozeUntil = Date.now() + (2 * 60 * 60 * 1000); // 2 hours
 *
 * const result = await executeSnoozeOperations({
 *   operations,
 *   snoozeUntil,
 *   options: {
 *     reason: 'user_requested',
 *     restorationMode: 'original'
 *   }
 * });
 *
 * console.log(`Success: ${result.success}`);
 * console.log(`Windows: ${result.summary.windowsSnoozed}, Tabs: ${result.summary.tabsSnoozed}`);
 *
 * @example
 * // Handle validation failure (time in past)
 * const result = await executeSnoozeOperations({
 *   operations: [{ type: 'window', windowId: 123 }],
 *   snoozeUntil: Date.now() - 1000, // Past time
 *   options: {}
 * });
 *
 * console.log(result.success); // false
 * console.log(result.errors[0].message); // "Snooze time is in the past"
 *
 * @example
 * // Partial success handling
 * const result = await executeSnoozeOperations({
 *   operations: [
 *     { type: 'window', windowId: 123 },
 *     { type: 'window', windowId: 999 } // Doesn't exist
 *   ],
 *   snoozeUntil: Date.now() + 3600000
 * });
 *
 * console.log(result.success); // false (one failed)
 * console.log(result.windows[0].success); // true
 * console.log(result.windows[1].success); // false
 * console.log(result.windows[1].error); // Error details
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
 * Validates that snooze operations can be executed successfully.
 *
 * Performs comprehensive validation of operation structure and Chrome entity existence.
 * Checks that window IDs and tab IDs still exist in Chrome, preventing errors during
 * execution when tabs/windows have been closed since operation detection.
 *
 * This function is useful for preview/confirmation UIs that want to validate operations
 * before presenting them to the user. It's NOT called automatically by executeSnoozeOperations
 * (which handles errors gracefully), so callers must explicitly validate if needed.
 *
 * @param {SnoozeOperation[]} operations - Operations to validate (from detectSnoozeOperations)
 *
 * @returns {Promise<ValidationResult>} Validation result with error details
 *
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - True if all operations are valid and can be executed
 * @property {string[]} errors - Array of human-readable error messages (empty if valid)
 *
 * @example
 * // Validate operations before execution
 * import { detectSnoozeOperations } from './detectSnoozeOperations.js';
 * import { validateOperations, executeSnoozeOperations } from './executeSnoozeOperations.js';
 *
 * const operations = await detectSnoozeOperations([123, 456]);
 * const validation = await validateOperations(operations);
 *
 * if (validation.valid) {
 *   await executeSnoozeOperations({ operations, snoozeUntil: Date.now() + 3600000 });
 * } else {
 *   console.error('Validation failed:', validation.errors);
 * }
 *
 * @example
 * // Handle stale operations (tabs closed)
 * const operations = [
 *   { type: 'tabs', tabIds: [999], sourceWindowId: 1 } // Tab 999 doesn't exist
 * ];
 *
 * const validation = await validateOperations(operations);
 * console.log(validation.valid); // false
 * console.log(validation.errors); // ["Tab 999 no longer exists"]
 *
 * @example
 * // Validate empty operations
 * const validation = await validateOperations([]);
 * console.log(validation.valid); // false
 * console.log(validation.errors); // ["No operations to execute"]
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
