/**
 * @file snoozeFormatters - UI text formatting for snooze operations
 *
 * @description
 * The snoozeFormatters service provides pure formatting functions for snooze-related
 * UI text. These functions convert operation data (from detectSnoozeOperations) into
 * human-readable strings for display in confirmation dialogs, modal titles, button labels,
 * and status messages.
 *
 * All functions are pure - they have no side effects, make no Chrome API calls, and contain
 * no business logic. They only perform string interpolation and pluralization based on
 * operation counts. This makes them easy to test, reusable across UI surfaces, and
 * decoupled from service logic.
 *
 * The formatters handle various snooze scenarios:
 * - Single window (complete): "Snooze Window: github.com (5 tabs)"
 * - Single window (partial): "Snooze 3 Tabs"
 * - Multiple windows: "Snooze 2 Windows"
 * - Mixed (windows + tabs): "Snooze Window 1 and 2 Other Tabs"
 *
 * @module services/utils/snoozeFormatters
 *
 * @architecture
 * - Layer: Utility Service (Presentation Helpers)
 * - Dependencies: None (pure functions)
 * - Used By: Dashboard snooze modal, popup snooze dialog, confirmation messages
 * - Pattern: Pure formatters - no side effects, deterministic output
 *
 * @example
 * // Format modal title from operations
 * import { formatSnoozeTitle } from './services/utils/snoozeFormatters.js';
 * import { detectSnoozeOperations } from './services/selection/detectSnoozeOperations.js';
 *
 * const { operations, summary } = await detectSnoozeOperations([123, 456]);
 * const title = formatSnoozeTitle({ operations, summary });
 * console.log(title); // "Snooze 2 Tabs"
 *
 * @example
 * // Format description for confirmation dialog
 * import { formatSnoozeDescription } from './services/utils/snoozeFormatters.js';
 *
 * const description = formatSnoozeDescription({ operations, summary });
 * console.log(description); // "This will snooze 2 tabs from the current window"
 */

/**
 * Formats modal title text describing what will be snoozed.
 *
 * Generates concise, human-readable titles for snooze confirmation dialogs based on
 * operation type and count. Handles five distinct scenarios with appropriate phrasing
 * and pluralization. Window titles include the window's identifying info (e.g., domain).
 *
 * @param {Object} params - Operation data from detectSnoozeOperations
 * @param {SnoozeOperation[]} params.operations - Array of detected operations
 * @param {OperationSummary} params.summary - Aggregate operation summary
 *
 * @returns {string} Formatted modal title
 *
 * @example
 * // Single complete window
 * formatSnoozeTitle({
 *   operations: [{ type: 'window', windowTitle: 'github.com (5 tabs)' }],
 *   summary: { windowCount: 1, individualTabCount: 0, isSingleWindow: true }
 * });
 * // → "Snooze Window: github.com (5 tabs)"
 *
 * @example
 * // Partial window (some tabs)
 * formatSnoozeTitle({
 *   operations: [{ type: 'tabs', tabIds: [1, 2, 3] }],
 *   summary: { windowCount: 0, individualTabCount: 3, isSingleWindow: true }
 * });
 * // → "Snooze 3 Tabs"
 *
 * @example
 * // Multiple windows
 * formatSnoozeTitle({
 *   operations: [{ type: 'window' }, { type: 'window' }],
 *   summary: { windowCount: 2, individualTabCount: 0 }
 * });
 * // → "Snooze 2 Windows"
 *
 * @example
 * // Mixed (windows + tabs)
 * formatSnoozeTitle({
 *   operations: [{ type: 'window' }, { type: 'tabs', tabIds: [1, 2] }],
 *   summary: { windowCount: 1, individualTabCount: 2 }
 * });
 * // → "Snooze Window 1 and 2 Other Tabs"
 */
export function formatSnoozeTitle({ operations, summary }) {
  const { windowCount, individualTabCount, isSingleWindow, isMixed } = summary;

  // Scenario 1: Single complete window
  if (isSingleWindow && windowCount === 1 && individualTabCount === 0) {
    const windowOp = operations.find(op => op.type === 'window');
    return `Snooze Window: ${windowOp.windowTitle}`;
  }

  // Scenario 2: Single window, partial tabs
  if (isSingleWindow && individualTabCount > 0) {
    return `Snooze ${individualTabCount} Tab${individualTabCount !== 1 ? 's' : ''}`;
  }

  // Scenario 3: Multiple complete windows, no individual tabs
  if (windowCount > 1 && individualTabCount === 0) {
    return `Snooze ${windowCount} Windows`;
  }

  // Scenario 4: Multiple complete windows + individual tabs
  if (windowCount > 0 && individualTabCount > 0) {
    const windowPart = windowCount === 1
      ? 'Window 1'
      : `${windowCount} Windows`;
    const tabPart = `${individualTabCount} Other Tab${individualTabCount !== 1 ? 's' : ''}`;
    return `Snooze ${windowPart} and ${tabPart}`;
  }

  // Scenario 5: Only individual tabs from multiple windows
  return `Snooze ${individualTabCount} Tab${individualTabCount !== 1 ? 's' : ''}`;
}

/**
 * Formats detailed confirmation text describing what will be snoozed.
 *
 * Generates longer, more explicit confirmation text for dialogs that need detailed
 * descriptions. Includes tab counts for windows and clarifies context (e.g., "from
 * the current window" for single-window operations).
 *
 * @param {Object} params - Operation data from detectSnoozeOperations
 * @param {SnoozeOperation[]} params.operations - Array of detected operations
 * @param {OperationSummary} params.summary - Aggregate operation summary
 *
 * @returns {string} Formatted confirmation description starting with "This will snooze..."
 *
 * @example
 * formatSnoozeDescription({
 *   operations: [{ type: 'window', tabCount: 5 }],
 *   summary: { windowCount: 1, totalTabs: 5 }
 * });
 * // → "This will snooze 1 window (5 tabs)"
 *
 * @example
 * formatSnoozeDescription({
 *   operations: [{ type: 'tabs', tabCount: 3 }],
 *   summary: { windowCount: 0, individualTabCount: 3, isSingleWindow: true }
 * });
 * // → "This will snooze 3 tabs from the current window"
 *
 * @example
 * formatSnoozeDescription({
 *   operations: [
 *     { type: 'window', tabCount: 8 },
 *     { type: 'window', tabCount: 4 },
 *     { type: 'tabs', tabCount: 3 }
 *   ],
 *   summary: { windowCount: 2, individualTabCount: 3 }
 * });
 * // → "This will snooze 2 windows (12 tabs) and 3 other tabs"
 */
export function formatSnoozeDescription({ operations, summary }) {
  const { windowCount, individualTabCount, totalTabs, isSingleWindow } = summary;

  const parts = [];

  if (windowCount > 0) {
    const windowLabel = windowCount === 1 ? '1 window' : `${windowCount} windows`;
    const windowTabs = operations
      .filter(op => op.type === 'window')
      .reduce((sum, op) => sum + op.tabCount, 0);
    parts.push(`${windowLabel} (${windowTabs} tab${windowTabs !== 1 ? 's' : ''})`);
  }

  if (individualTabCount > 0) {
    const tabLabel = `${individualTabCount} tab${individualTabCount !== 1 ? 's' : ''}`;
    if (windowCount > 0) {
      parts.push(`${individualTabCount} other tab${individualTabCount !== 1 ? 's' : ''}`);
    } else {
      const fromWindow = isSingleWindow ? ' from the current window' : '';
      parts.push(`${tabLabel}${fromWindow}`);
    }
  }

  return `This will snooze ${parts.join(' and ')}`;
}

/**
 * Formats operation count for compact button labels.
 *
 * Generates short count labels suitable for buttons with limited space. Uses "+" separator
 * for mixed operations to keep labels concise.
 *
 * @param {OperationSummary} summary - Operation summary from detectSnoozeOperations
 *
 * @returns {string} Compact count label with proper pluralization
 *
 * @example
 * formatOperationCount({ windowCount: 1, individualTabCount: 0 });
 * // → "1 Window"
 *
 * @example
 * formatOperationCount({ windowCount: 0, individualTabCount: 5 });
 * // → "5 Tabs"
 *
 * @example
 * formatOperationCount({ windowCount: 2, individualTabCount: 3 });
 * // → "2 Windows + 3 Tabs"
 */
export function formatOperationCount(summary) {
  const { windowCount, individualTabCount } = summary;

  if (windowCount > 0 && individualTabCount > 0) {
    return `${windowCount} Window${windowCount !== 1 ? 's' : ''} + ${individualTabCount} Tab${individualTabCount !== 1 ? 's' : ''}`;
  }

  if (windowCount > 0) {
    return `${windowCount} Window${windowCount !== 1 ? 's' : ''}`;
  }

  return `${individualTabCount} Tab${individualTabCount !== 1 ? 's' : ''}`;
}

/**
 * Formats restoration mode into human-readable text.
 *
 * Converts technical restoration mode values into user-friendly descriptions for
 * dropdowns, tooltips, and confirmation dialogs.
 *
 * @param {string} mode - Restoration mode: 'original' | 'current' | 'new'
 *
 * @returns {string} Human-readable mode description
 *
 * @example
 * formatRestorationMode('original');
 * // → "Back to original window"
 *
 * @example
 * formatRestorationMode('current');
 * // → "To current window"
 *
 * @example
 * formatRestorationMode('new');
 * // → "In new window"
 */
export function formatRestorationMode(mode) {
  const descriptions = {
    'original': 'Back to original window',
    'current': 'To current window',
    'new': 'In new window'
  };
  return descriptions[mode] || mode;
}
