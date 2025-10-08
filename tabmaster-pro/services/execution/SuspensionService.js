// @ts-check
// Tab Suspension Service - Centralized logic for suspending (discarding) tabs
// Execution service - takes tab IDs and suspends them with configurable options

/**
 * Default options for tab suspension.
 * @typedef {Object} SuspendOptions
 * @property {boolean} includePinned - Whether to suspend pinned tabs
 * @property {boolean} includeActive - Whether to suspend active tabs
 * @property {boolean} includeAudible - Whether to suspend audible tabs
 */

/**
 * @type {SuspendOptions}
 */
const defaultOptions = {
  includePinned: false,
  includeActive: false,
  includeAudible: false,
};

/**
 * Suspends a list of tabs, respecting the provided options.
 *
 * This is an execution service - it only suspends the tabs provided.
 * Selection logic (which tabs to suspend) should be handled by the caller.
 *
 * @param {number[]} tabIds - An array of tab IDs to consider for suspension.
 * @param {Partial<SuspendOptions>} [options] - Configuration options for suspension.
 * @returns {Promise<{suspended: number[], skipped: number[], errors: {tabId: number, error: string}[]}>} - The result of the suspension operation.
 */
export async function suspendTabs(tabIds, options = {}) {
  const finalOptions = { ...defaultOptions, ...options };
  const suspended = [];
  const skipped = [];
  const errors = [];

  if (!chrome.tabs) {
    console.warn('chrome.tabs API not available. Skipping suspension.');
    return { suspended, skipped: tabIds, errors };
  }

  for (const tabId of tabIds) {
    try {
      const tab = await chrome.tabs.get(tabId);

      // Check if the tab should be skipped based on options
      if (tab.pinned && !finalOptions.includePinned) {
        skipped.push(tabId);
        continue;
      }
      if (tab.active && !finalOptions.includeActive) {
        skipped.push(tabId);
        continue;
      }
      if (tab.audible && !finalOptions.includeAudible) {
        skipped.push(tabId);
        continue;
      }

      // Discard the tab
      await chrome.tabs.discard(tabId);
      suspended.push(tabId);
    } catch (error) {
      errors.push({ tabId, error: error.message });
    }
  }

  return { suspended, skipped, errors };
}
