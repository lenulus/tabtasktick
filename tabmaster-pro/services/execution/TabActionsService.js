// TabActionsService - Handle simple tab operations (close, pin, mute, move)
// Extracted from engine.v2.services.js (Phase 6.1.3)

/**
 * Close tabs
 * @param {Array<number>} tabIds - Array of tab IDs to close
 * @returns {Promise<object>} Result object with success status
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
 * Pin tabs
 * @param {Array<number>} tabIds - Array of tab IDs to pin
 * @returns {Promise<object>} Result object with success status
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
 * Unpin tabs
 * @param {Array<number>} tabIds - Array of tab IDs to unpin
 * @returns {Promise<object>} Result object with success status
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
 * Mute tabs
 * @param {Array<number>} tabIds - Array of tab IDs to mute
 * @returns {Promise<object>} Result object with success status
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
 * Unmute tabs
 * @param {Array<number>} tabIds - Array of tab IDs to unmute
 * @returns {Promise<object>} Result object with success status
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
 * Move tabs to a window
 * CRITICAL: This function preserves EXACT window focus behavior from engine.v2.services.js (lines 321-411)
 *
 * @param {Array<number>} tabIds - Array of tab IDs to move
 * @param {object} options - Move options
 * @param {string|number} options.windowId - Target window ID (or 'new' for new window)
 * @param {boolean} options.preserveGroup - Whether to preserve tab groups (default: true)
 * @returns {Promise<object>} Result object with success status and move details
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
        // Store original focused window
        const currentWindow = await chrome.windows.getCurrent();
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
        // Store original focused window
        const currentWindow = await chrome.windows.getCurrent();
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
