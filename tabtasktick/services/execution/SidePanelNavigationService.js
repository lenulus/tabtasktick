/**
 * @file SidePanelNavigationService - Coordinates navigation between surfaces and side panel
 *
 * @description
 * Handles navigation intent coordination between surfaces (popup, dashboard) and the
 * side panel. Uses storage-based handoff to solve the race condition where the side
 * panel may not have its message listener registered when a navigation message arrives.
 *
 * The problem: When popup opens the side panel and immediately sends a message, the
 * message may arrive before the side panel has finished initializing and registered
 * its listener. This service solves this by storing the pending action in chrome.storage
 * before opening the panel, then having the panel consume it after initialization.
 *
 * @module services/execution/SidePanelNavigationService
 *
 * @architecture
 * - Layer: Execution Service (coordination)
 * - Dependencies: chrome.storage.local
 * - Used By: popup (to set pending actions), sidepanel (to consume pending actions)
 * - Storage Key: 'sidepanel_pending_action'
 *
 * @example
 * // In popup - before opening side panel
 * import { setPendingAction } from '../services/execution/SidePanelNavigationService.js';
 * await setPendingAction('createCollection', { windowId: 123 });
 * await chrome.sidePanel.open({ windowId });
 *
 * @example
 * // In side panel - after initialization
 * import { consumePendingAction } from '../services/execution/SidePanelNavigationService.js';
 * const pending = await consumePendingAction();
 * if (pending?.action === 'createCollection') {
 *   this.handleSaveWindow();
 * }
 */

const PENDING_ACTION_KEY = 'sidepanel_pending_action';
const PENDING_ACTION_TTL_MS = 5000; // Actions expire after 5 seconds

/**
 * Set a pending navigation action for the side panel to consume.
 *
 * Call this BEFORE opening the side panel to ensure the action is available
 * when the panel initializes. The action will expire after 5 seconds to
 * prevent stale actions from executing unexpectedly.
 *
 * @param {string} action - Action name ('createCollection', 'createTask', 'switchView')
 * @param {Object} [data={}] - Additional data for the action
 * @returns {Promise<void>}
 *
 * @example
 * // Set action to create a collection
 * await setPendingAction('createCollection', { windowId: 123 });
 *
 * @example
 * // Set action to switch to tasks view
 * await setPendingAction('switchView', { view: 'tasks' });
 */
export async function setPendingAction(action, data = {}) {
  await chrome.storage.local.set({
    [PENDING_ACTION_KEY]: {
      action,
      data,
      timestamp: Date.now()
    }
  });
}

/**
 * Consume and clear the pending action.
 *
 * Call this in the side panel after initialization to check for and execute
 * any pending navigation actions. The action is cleared immediately to prevent
 * double-execution. Returns null if no pending action or if the action has expired.
 *
 * @returns {Promise<{action: string, data: Object}|null>} The pending action or null
 *
 * @example
 * const pending = await consumePendingAction();
 * if (pending) {
 *   switch (pending.action) {
 *     case 'createCollection':
 *       await this.switchView('collections');
 *       this.handleSaveWindow();
 *       break;
 *     case 'switchView':
 *       await this.switchView(pending.data.view);
 *       break;
 *   }
 * }
 */
export async function consumePendingAction() {
  const result = await chrome.storage.local.get([PENDING_ACTION_KEY]);
  const pending = result[PENDING_ACTION_KEY];

  // Always clear the pending action to prevent double-execution
  await chrome.storage.local.remove(PENDING_ACTION_KEY);

  // No pending action
  if (!pending) {
    return null;
  }

  // Check TTL - reject stale actions
  const age = Date.now() - pending.timestamp;
  if (age > PENDING_ACTION_TTL_MS) {
    console.log('[SidePanelNavigationService] Discarded stale pending action:', pending.action, `(${age}ms old)`);
    return null;
  }

  console.log('[SidePanelNavigationService] Consuming pending action:', pending.action);
  return {
    action: pending.action,
    data: pending.data
  };
}

/**
 * Clear any pending action without consuming it.
 *
 * Useful for cleanup or testing scenarios.
 *
 * @returns {Promise<void>}
 */
export async function clearPendingAction() {
  await chrome.storage.local.remove(PENDING_ACTION_KEY);
}
