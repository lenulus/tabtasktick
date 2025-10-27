/**
 * @file TabActionsService - Basic tab operations (close, pin, mute, move)
 *
 * @description
 * The TabActionsService provides fundamental tab manipulation operations that form the
 * building blocks for higher-level features. It handles six core tab operations: closing,
 * pinning/unpinning, muting/unmuting, and moving tabs between windows. Each operation
 * supports batch processing and returns detailed results with error tracking.
 *
 * All functions implement graceful error handling - if some tabs fail while others succeed,
 * the operation continues and returns partial results with specific error details. This
 * allows bulk operations on 200+ tabs to complete even if individual tabs fail (e.g., due
 * to Chrome restrictions on system tabs).
 *
 * The moveTabsToWindow function is more complex than the others - it preserves tab group
 * membership across window moves, handles window focus management, and can create new
 * windows on demand. This complexity is necessary because Chrome's tab groups cannot span
 * windows, requiring capture and recreation of group metadata.
 *
 * Created during Phase 6.1.3 by extracting inline Chrome API calls from engine.v2.services.js
 * to establish a single source of truth for basic tab operations.
 *
 * @module services/execution/TabActionsService
 *
 * @architecture
 * - Layer: Execution Service (Basic Operations)
 * - Dependencies: chrome.tabs, chrome.tabGroups, chrome.windows (Chrome APIs only)
 * - Used By: Rules engine, command handlers, dashboard bulk actions, keyboard shortcuts
 * - Pattern: Thin wrappers around Chrome APIs with consistent error handling
 *
 * @example
 * // Close multiple tabs
 * import * as TabActionsService from './services/execution/TabActionsService.js';
 *
 * const result = await TabActionsService.closeTabs([123, 456, 789]);
 * console.log(`Closed ${result.closed.length} tabs, ${result.errors.length} errors`);
 *
 * @example
 * // Move tabs to new window with group preservation
 * const result = await TabActionsService.moveTabsToWindow([123, 456], {
 *   windowId: null, // creates new window
 *   preserveGroup: true
 * });
 */
// TabActionsService - Handle simple tab operations (close, pin, mute, move)
// Extracted from engine.v2.services.js (Phase 6.1.3)

/**
 * Closes one or more tabs.
 *
 * Batch closes tabs with graceful error handling. If some tabs fail (e.g., Chrome system tabs),
 * the operation continues and returns partial results. Success is determined by whether any tabs
 * were closed, not all tabs.
 *
 * @param {Array<number>} tabIds - Tab IDs to close
 * @returns {Promise<object>} Result with closed tabs and errors
 * @returns {boolean} return.success - True if any tabs closed
 * @returns {Array<number>} return.closed - Successfully closed tab IDs
 * @returns {Array<object>} return.errors - Errors with tabId and message
 *
 * @example
 * const result = await closeTabs([123, 456, 789]);
 * console.log(`Closed ${result.closed.length}/${tabIds.length} tabs`);
 */
export async function closeTabs(tabIds) {
  const results = {
    success: true,
    closed: [],
    errors: [],
    details: {}
  };

  for (const tabId of tabIds) {
    try {
      await chrome.tabs.remove(tabId);
      results.closed.push(tabId);
    } catch (error) {
      results.errors.push({
        tabId,
        error: error.message
      });
    }
  }

  // Set success based on whether any tabs were closed
  results.success = results.closed.length > 0 || tabIds.length === 0;

  return results;
}

/**
 * Pins one or more tabs to the left side of the tab strip.
 *
 * @param {Array<number>} tabIds - Tab IDs to pin
 * @returns {Promise<object>} Result with pinned tabs and errors
 * @example
 * await pinTabs([123, 456]);
 */
export async function pinTabs(tabIds) {
  const results = {
    success: true,
    pinned: [],
    errors: [],
    details: {}
  };

  for (const tabId of tabIds) {
    try {
      await chrome.tabs.update(tabId, { pinned: true });
      results.pinned.push(tabId);
    } catch (error) {
      results.errors.push({
        tabId,
        error: error.message
      });
    }
  }

  results.success = results.pinned.length > 0 || tabIds.length === 0;

  return results;
}

/**
 * Unpins one or more pinned tabs.
 *
 * @param {Array<number>} tabIds - Tab IDs to unpin
 * @returns {Promise<object>} Result with unpinned tabs and errors
 * @example
 * await unpinTabs([123, 456]);
 */
export async function unpinTabs(tabIds) {
  const results = {
    success: true,
    unpinned: [],
    errors: [],
    details: {}
  };

  for (const tabId of tabIds) {
    try {
      await chrome.tabs.update(tabId, { pinned: false });
      results.unpinned.push(tabId);
    } catch (error) {
      results.errors.push({
        tabId,
        error: error.message
      });
    }
  }

  results.success = results.unpinned.length > 0 || tabIds.length === 0;

  return results;
}

/**
 * Mutes audio on one or more tabs.
 *
 * @param {Array<number>} tabIds - Tab IDs to mute
 * @returns {Promise<object>} Result with muted tabs and errors
 * @example
 * await muteTabs([123, 456]);
 */
export async function muteTabs(tabIds) {
  const results = {
    success: true,
    muted: [],
    errors: [],
    details: {}
  };

  for (const tabId of tabIds) {
    try {
      await chrome.tabs.update(tabId, { muted: true });
      results.muted.push(tabId);
    } catch (error) {
      results.errors.push({
        tabId,
        error: error.message
      });
    }
  }

  results.success = results.muted.length > 0 || tabIds.length === 0;

  return results;
}

/**
 * Unmutes audio on one or more tabs.
 *
 * @param {Array<number>} tabIds - Tab IDs to unmute
 * @returns {Promise<object>} Result with unmuted tabs and errors
 * @example
 * await unmuteTabs([123, 456]);
 */
export async function unmuteTabs(tabIds) {
  const results = {
    success: true,
    unmuted: [],
    errors: [],
    details: {}
  };

  for (const tabId of tabIds) {
    try {
      await chrome.tabs.update(tabId, { muted: false });
      results.unmuted.push(tabId);
    } catch (error) {
      results.errors.push({
        tabId,
        error: error.message
      });
    }
  }

  results.success = results.unmuted.length > 0 || tabIds.length === 0;

  return results;
}

/**
 * Moves tabs to a different window with optional group preservation.
 *
 * The most complex operation in this service. Handles window creation, group metadata
 * preservation (Chrome groups can't span windows), and window focus management. The
 * function captures group information before moving, moves tabs to target window, then
 * recreates groups with original titles/colors.
 *
 * CRITICAL: Preserves exact window focus behavior - stores original focused window,
 * switches focus to target window for operations, then restores original focus. This
 * prevents unexpected focus changes that confuse users.
 *
 * @param {Array<number>} tabIds - Tab IDs to move
 * @param {object} [options={}] - Move configuration
 * @param {string|number} options.windowId - Target window ID or 'new' for new window
 * @param {boolean} [options.preserveGroup=true] - Preserve tab group membership
 *
 * @returns {Promise<object>} Result with moved tabs and details
 * @returns {boolean} return.success - True if any tabs moved
 * @returns {Array<number>} return.moved - Successfully moved tab IDs
 * @returns {Array<object>} return.errors - Errors with details
 * @returns {object} return.details - Operation details
 * @returns {number} return.details.windowId - Target window ID
 * @returns {boolean} return.details.newWindow - Whether new window was created
 * @returns {boolean} return.details.regrouped - Whether groups were recreated
 *
 * @example
 * // Move to existing window
 * await moveTabsToWindow([123, 456], { windowId: 789 });
 *
 * @example
 * // Move to new window with group preservation
 * const result = await moveTabsToWindow([123, 456], {
 *   windowId: 'new',
 *   preserveGroup: true
 * });
 * console.log(`Created new window ${result.details.windowId}`);
 */
export async function moveTabsToWindow(tabIds, options = {}) {
  const { windowId, preserveGroup = true } = options;

  const results = {
    success: true,
    moved: [],
    errors: [],
    details: {
      windowId,
      newWindow: windowId === 'new',
      regrouped: false
    }
  };

  // Validate windowId parameter
  if (!windowId) {
    return {
      success: false,
      moved: [],
      errors: [{ error: 'Move action requires windowId parameter' }],
      details: {}
    };
  }

  // Process each tab
  for (const tabId of tabIds) {
    try {
      // Get tab details
      const tab = await chrome.tabs.get(tabId);

      // Store original group info before moving
      const originalGroupId = tab.groupId;
      let groupTitle = null;
      let groupColor = null;

      if (originalGroupId && originalGroupId !== -1 && preserveGroup) {
        try {
          const group = await chrome.tabGroups.get(originalGroupId);
          groupTitle = group.title;
          groupColor = group.color;
        } catch (e) {
          // Group might not exist anymore
        }
      }

      // Handle "new" window creation
      if (windowId === 'new') {
        // Store original focused window (service workers can't use getCurrent)
        const currentWindow = await chrome.windows.getLastFocused();
        const originalFocusedWindowId = currentWindow.id;

        const newWindow = await chrome.windows.create({
          tabId: tab.id,
          focused: false
        });

        // Re-group if needed
        if (groupTitle && preserveGroup) {
          // Focus the new window to create group correctly
          await chrome.windows.update(newWindow.id, { focused: true });

          const newGroupId = await chrome.tabs.group({
            tabIds: [tab.id]
          });
          await chrome.tabGroups.update(newGroupId, {
            title: groupTitle,
            color: groupColor
          });

          // Restore original focus
          await chrome.windows.update(originalFocusedWindowId, { focused: true });

          results.details.regrouped = true;
        }

        results.moved.push(tabId);
        results.details.windowId = newWindow.id;
        continue;
      }

      // Move to existing window
      await chrome.tabs.move(tab.id, {
        windowId: parseInt(windowId),
        index: -1
      });

      // Re-group if needed
      if (groupTitle && preserveGroup) {
        // Store original focused window (service workers can't use getCurrent)
        const currentWindow = await chrome.windows.getLastFocused();
        const originalFocusedWindowId = currentWindow.id;

        // CRITICAL: Focus the target window first, otherwise Chrome creates group in focused window
        await chrome.windows.update(parseInt(windowId), { focused: true });

        const newGroupId = await chrome.tabs.group({
          tabIds: [tab.id]
        });
        await chrome.tabGroups.update(newGroupId, {
          title: groupTitle,
          color: groupColor
        });

        // Restore original focus
        await chrome.windows.update(originalFocusedWindowId, { focused: true });

        results.details.regrouped = true;
      }

      results.moved.push(tabId);
    } catch (error) {
      results.errors.push({
        tabId,
        error: error.message
      });
    }
  }

  results.success = results.moved.length > 0 || tabIds.length === 0;

  return results;
}

/**
 * Focuses a tab and brings its window to the front.
 *
 * Activates the specified tab and focuses its containing window. This is commonly used by
 * keyboard shortcuts and task management features to quickly jump to a specific tab.
 *
 * @param {number} tabId - Tab ID to focus
 * @returns {Promise<object>} Result with tab details
 * @returns {boolean} return.success - True if tab was focused
 * @returns {object} return.tab - The focused tab object (if successful)
 * @returns {string} return.error - Error message (if failed)
 *
 * @example
 * const result = await focusTab(123);
 * if (result.success) {
 *   console.log(`Focused tab: ${result.tab.title}`);
 * }
 */
export async function focusTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab) {
      return { success: false, error: 'Tab not found' };
    }

    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });

    return { success: true, tab };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
