/**
 * @file SuspensionService - Tab memory suspension (chrome.tabs.discard)
 *
 * @description
 * The SuspensionService provides tab suspension functionality using Chrome's native
 * tabs.discard API. Suspension (also called "discarding") frees memory occupied by
 * a tab while keeping the tab visible in the tab strip. When the user clicks a
 * suspended tab, Chrome automatically reloads it, restoring the page.
 *
 * This service is an execution layer service - it only suspends the specific tab IDs
 * provided. Selection logic (determining which tabs to suspend) is handled by callers,
 * typically through selectTabs or rule matching.
 *
 * The service includes configurable protection for important tabs: by default, it skips
 * pinned tabs, active tabs, and audible tabs (playing sound). These protections prevent
 * disrupting the user's workflow or interrupting media playback. Callers can override
 * these protections via options if needed.
 *
 * All suspension operations track three categories: successfully suspended tabs, skipped
 * tabs (protected by options), and errors (tabs that failed to suspend). This enables
 * callers to provide detailed feedback to users.
 *
 * @module services/execution/SuspensionService
 *
 * @architecture
 * - Layer: Execution Service (Basic Operations)
 * - Dependencies: chrome.tabs.discard API (Chrome 54+)
 * - Used By: Rules engine, dashboard bulk actions, context menus
 * - Pattern: Thin wrapper around Chrome discard API with protection filters
 *
 * @example
 * // Suspend tabs with default protections
 * import { suspendTabs } from './services/execution/SuspensionService.js';
 *
 * const result = await suspendTabs([123, 456, 789]);
 * console.log(`Suspended ${result.suspended.length}, skipped ${result.skipped.length}`);
 *
 * @example
 * // Suspend all tabs including pinned
 * const result = await suspendTabs([123, 456], {
 *   includePinned: true
 * });
 */

/**
 * Default protection options for tab suspension.
 * @typedef {Object} SuspendOptions
 * @property {boolean} includePinned - Whether to suspend pinned tabs (default: false, protects pinned)
 * @property {boolean} includeActive - Whether to suspend active tabs (default: false, protects active)
 * @property {boolean} includeAudible - Whether to suspend audible tabs (default: false, protects audio)
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
 * Suspends tabs using Chrome's discard API with configurable protections.
 *
 * Processes each tab ID sequentially, checking protections (pinned, active, audible) before
 * suspending. Suspended tabs free memory while staying visible in the tab strip - Chrome
 * automatically reloads them when clicked.
 *
 * The function applies three protection filters by default:
 * - Pinned tabs: skipped (prevent losing important pinned references)
 * - Active tabs: skipped (prevent disrupting current workflow)
 * - Audible tabs: skipped (prevent interrupting media playback)
 *
 * Each protection can be overridden via options. For example, rules that specifically target
 * old tabs might set `includeActive: true` to suspend even the currently visible tab.
 *
 * Returns detailed results with three categories: suspended (success), skipped (protected),
 * and errors (failures). This enables callers to report accurate counts like "Suspended 10,
 * skipped 3 pinned tabs, 1 error".
 *
 * @param {number[]} tabIds - Array of Chrome tab IDs to suspend
 * @param {Partial<SuspendOptions>} [options={}] - Suspension configuration (overrides defaults)
 *
 * @returns {Promise<SuspensionResult>} Result object with suspended/skipped/error tracking
 *
 * @typedef {Object} SuspensionResult
 * @property {number[]} suspended - Tab IDs successfully suspended
 * @property {number[]} skipped - Tab IDs skipped due to protection options
 * @property {SuspensionError[]} errors - Tab IDs that failed to suspend
 *
 * @typedef {Object} SuspensionError
 * @property {number} tabId - Tab ID that failed
 * @property {string} error - Error message from Chrome API
 *
 * @example
 * // Suspend tabs with default protections
 * import { suspendTabs } from './services/execution/SuspensionService.js';
 *
 * const result = await suspendTabs([123, 456, 789]);
 * console.log(`Suspended: ${result.suspended.length}`);
 * console.log(`Skipped: ${result.skipped.length} (pinned/active/audible)`);
 * console.log(`Errors: ${result.errors.length}`);
 *
 * @example
 * // Suspend all tabs including pinned and active
 * const result = await suspendTabs([123, 456, 789], {
 *   includePinned: true,
 *   includeActive: true,
 *   includeAudible: false // Still protect audible
 * });
 *
 * @example
 * // Suspend everything (no protections)
 * const result = await suspendTabs([123, 456], {
 *   includePinned: true,
 *   includeActive: true,
 *   includeAudible: true
 * });
 *
 * console.log(`Suspended all ${result.suspended.length} tabs`);
 * console.log(`Skipped: ${result.skipped.length}`); // Should be 0
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
