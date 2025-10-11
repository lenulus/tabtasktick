/**
 * Snooze UI Formatting Utilities
 *
 * Pure formatting functions for snooze-related UI text.
 * No business logic, no Chrome API calls - just string formatting.
 */

/**
 * Formats a title for the snooze modal based on the operations to be performed.
 *
 * @param {Object} params
 * @param {SnoozeOperation[]} params.operations - Operations from detectSnoozeOperations
 * @param {OperationSummary} params.summary - Summary from detectSnoozeOperations
 * @returns {string} - Formatted modal title
 *
 * Examples:
 * - "Snooze Window 1"
 * - "Snooze 3 Tabs"
 * - "Snooze Window 1 and 2 Other Tabs"
 * - "Snooze 2 Windows"
 * - "Snooze 2 Windows and 5 Other Tabs"
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
 * Formats a description of what will be snoozed for confirmation UI.
 *
 * @param {Object} params
 * @param {SnoozeOperation[]} params.operations - Operations from detectSnoozeOperations
 * @param {OperationSummary} params.summary - Summary from detectSnoozeOperations
 * @returns {string} - Formatted description
 *
 * Examples:
 * - "This will snooze 1 window (5 tabs)"
 * - "This will snooze 3 tabs from the current window"
 * - "This will snooze 2 windows (12 tabs) and 3 other tabs"
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
 * Formats the operation count for button labels.
 *
 * @param {OperationSummary} summary - Summary from detectSnoozeOperations
 * @returns {string} - Count label for button
 *
 * Examples:
 * - "1 Window"
 * - "5 Tabs"
 * - "2 Windows + 3 Tabs"
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
 * Formats restoration mode for display in UI.
 *
 * @param {string} mode - Restoration mode ('original', 'current', 'new')
 * @returns {string} - Human-readable description
 */
export function formatRestorationMode(mode) {
  const descriptions = {
    'original': 'Back to original window',
    'current': 'To current window',
    'new': 'In new window'
  };
  return descriptions[mode] || mode;
}
