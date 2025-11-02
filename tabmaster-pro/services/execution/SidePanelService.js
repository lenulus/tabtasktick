/**
 * Side Panel Service
 *
 * Centralized service for opening and managing the side panel.
 * Provides consistent interface for opening side panel with various actions/views.
 *
 * Architecture:
 * - Execution layer (performs side panel operations)
 * - Used by popup, dashboard, and other surfaces
 * - Handles chrome.sidePanel API and message passing to side panel
 *
 * @module services/execution/SidePanelService
 */

/**
 * Open the side panel with optional view or action
 *
 * @param {Object} options - Options for opening the side panel
 * @param {string} [options.view] - View to open in side panel ('collections', 'tasks', etc.)
 * @param {string} [options.action] - Action for side panel to execute ('createCollection', etc.)
 * @param {Object} [options.actionData] - Additional data for the action
 * @param {number} [options.windowId] - Specific window ID (defaults to current window)
 * @returns {Promise<{success: boolean, error?: string}>}
 *
 * @example
 * // Open side panel to collections view
 * await openSidePanel({ view: 'collections' });
 *
 * @example
 * // Open side panel with create collection action
 * await openSidePanel({
 *   action: 'createCollection',
 *   actionData: { windowId: 123 }
 * });
 *
 * @example
 * // Open side panel in specific window
 * await openSidePanel({
 *   view: 'tasks',
 *   windowId: 456
 * });
 */
export async function openSidePanel(options = {}) {
  const { view, action, actionData, windowId } = options;

  try {
    // Get target window ID
    let targetWindowId = windowId;
    if (!targetWindowId) {
      const currentWindow = await chrome.windows.getCurrent();
      targetWindowId = currentWindow.id;
    }

    // Open the side panel
    await chrome.sidePanel.open({ windowId: targetWindowId });

    // Send appropriate message based on options
    if (action) {
      // Send action-based message
      chrome.runtime.sendMessage({
        action: 'openSidePanelWithAction',
        data: {
          panelAction: action,
          ...actionData
        }
      });
    } else if (view) {
      // Send view-based message
      chrome.runtime.sendMessage({
        action: 'openSidePanelView',
        data: { view }
      });
    }
    // If neither action nor view specified, just open the panel

    return { success: true };
  } catch (error) {
    console.error('Failed to open side panel:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Open side panel to a specific view
 * Convenience wrapper around openSidePanel
 *
 * @param {string} view - View name ('collections', 'tasks', etc.)
 * @param {number} [windowId] - Optional window ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function openSidePanelView(view, windowId) {
  return openSidePanel({ view, windowId });
}

/**
 * Open side panel with a specific action
 * Convenience wrapper around openSidePanel
 *
 * @param {string} action - Action name ('createCollection', etc.)
 * @param {Object} [actionData] - Additional data for the action
 * @param {number} [windowId] - Optional window ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function openSidePanelWithAction(action, actionData = {}, windowId) {
  return openSidePanel({ action, actionData, windowId });
}
