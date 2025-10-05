// services/execution/groupTabs.js
// Execution-only service for grouping tabs
// Takes tab IDs and groups them - no selection logic

/**
 * Group provided tabs by domain or custom criteria.
 * This is an execution-only service - it acts on provided tab IDs.
 *
 * @param {number[]} tabIds - Array of tab IDs to group
 * @param {Object} options - Grouping options
 * @param {boolean} [options.byDomain=true] - Group by domain
 * @param {string} [options.customName] - Use custom group name instead of domain
 * @param {boolean} [options.perWindow=true] - Respect window boundaries
 * @param {boolean} [options.collapsed=false] - Collapse groups after creation
 * @param {boolean} [options.dryRun=false] - Preview without executing
 * @param {number} [options.callerWindowId] - Window ID to restore focus to after grouping
 * @returns {Promise<{success: boolean, results: Array, plan: Array, error?: string}>}
 */
export async function groupTabs(tabIds, options = {}) {
  const {
    byDomain = true,
    customName = null,
    perWindow = true,
    collapsed = false,
    dryRun = false,
    callerWindowId = null
  } = options;

  if (!tabIds || tabIds.length === 0) {
    return {
      success: true,
      results: [],
      plan: []
    };
  }

  try {
    // Get full tab objects for the provided IDs
    const tabs = await Promise.all(
      tabIds.map(id => chrome.tabs.get(id).catch(() => null))
    );

    // Filter out nulls (tabs that don't exist)
    const validTabs = tabs.filter(tab => tab !== null);

    if (validTabs.length === 0) {
      return {
        success: false,
        error: 'No valid tabs found',
        results: [],
        plan: []
      };
    }

    // Build execution plan
    const plan = [];
    const results = [];

    if (customName) {
      // Group all tabs under custom name
      if (perWindow) {
        // Group per window with same custom name (no window moving)
        const tabsByWindow = groupTabsByWindow(validTabs);

        for (const [windowId, windowTabs] of tabsByWindow) {
          const step = await planGroupCreation(windowTabs, customName, windowId, collapsed, false);
          if (step) plan.push(step);
        }
      } else {
        // Group all tabs together (may involve moving tabs)
        const step = await planGroupCreation(validTabs, customName, null, collapsed, true);
        if (step) plan.push(step);
      }
    } else if (byDomain) {
      // Group tabs by their domains
      const tabsByDomain = groupTabsByDomain(validTabs);

      for (const [domain, domainTabs] of tabsByDomain) {
        if (perWindow) {
          // Further group by window (no window moving)
          const tabsByWindow = groupTabsByWindow(domainTabs);

          for (const [windowId, windowTabs] of tabsByWindow) {
            const step = await planGroupCreation(windowTabs, domain, windowId, collapsed, false);
            if (step) plan.push(step);
          }
        } else {
          // Group all tabs of this domain together (may move windows)
          const step = await planGroupCreation(domainTabs, domain, null, collapsed, true);
          if (step) plan.push(step);
        }
      }
    }

    // Execute plan (unless dry-run)
    if (!dryRun) {
      for (const step of plan) {
        const result = await executeGroupStep(step, callerWindowId);
        results.push(result);
      }
    }

    const windowCounts = {};
    for (const tab of validTabs) {
      windowCounts[tab.windowId] = (windowCounts[tab.windowId] || 0) + 1;
    }

    return {
      success: true,
      results,
      plan,
      summary: {
        totalTabs: validTabs.length,
        groupsCreated: plan.filter(s => s?.action === 'create').length,
        groupsReused: plan.filter(s => s?.action === 'reuse').length,
        debug: {
          planSteps: plan.length,
          planDetails: plan.map(s => ({ action: s?.action, groupName: s?.groupName, windowId: s?.windowId, tabCount: s?.tabIds?.length })),
          byDomain: byDomain,
          perWindow: perWindow,
          validTabsCount: validTabs.length,
          tabsWithGroupId: validTabs.filter(t => t.groupId && t.groupId !== -1).length,
          windowCounts: windowCounts,
          groupIds: [...new Set(validTabs.map(t => t.groupId).filter(id => id && id !== -1))]
        }
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      results: [],
      plan: []
    };
  }
}

/**
 * Plan a grouping operation
 * @private
 */
async function planGroupCreation(tabs, groupName, windowId, collapsed, allowWindowMove = false) {
  if (tabs.length === 0) {
    return null;
  }

  // If no specific window, use the first tab's window
  const targetWindowId = windowId || tabs[0].windowId;

  // Check if a group with this name already exists
  // When allowWindowMove=false (perWindow=true), only search in target window to maintain window isolation
  // When allowWindowMove=true (perWindow=false), search all windows to allow consolidation
  const searchQuery = allowWindowMove ? {} : { windowId: targetWindowId };
  const groups = await chrome.tabGroups.query(searchQuery);
  const existingGroup = groups.find(g => g.title === groupName);

  // Filter out tabs that are already in the correct group
  let tabsToGroup = tabs;
  if (existingGroup) {
    tabsToGroup = tabs.filter(t => t.groupId !== existingGroup.id);

    // If all tabs are already in the correct group, nothing to do
    if (tabsToGroup.length === 0) {
      return null;
    }
  }

  const tabIds = tabsToGroup.map(t => t.id);

  if (existingGroup) {
    // Reuse existing group - tabs will be moved to the group's window
    return {
      action: 'reuse',
      groupId: existingGroup.id,
      groupName: groupName,
      tabIds: tabIds,
      windowId: existingGroup.windowId, // Use the existing group's window, not the target window
      allowWindowMove: true // Allow movement to join the existing group
    };
  } else {
    return {
      action: 'create',
      groupName: groupName,
      tabIds: tabIds,
      windowId: targetWindowId,
      color: pickColorForName(groupName),
      collapsed: collapsed,
      allowWindowMove
    };
  }
}

/**
 * Execute a single grouping step
 * @private
 * @param {Object} step - The grouping step to execute
 * @param {number} callerWindowId - Window ID to restore focus to (overrides auto-detection)
 */
async function executeGroupStep(step, callerWindowId = null) {
  if (!step || step.tabIds.length === 0) {
    return { success: false, error: 'No tabs to group' };
  }

  try {
    let groupId;
    let originalFocusedWindowId = callerWindowId; // Use provided caller window if available

    // Verify all tabs are in the target window (they should be if perWindow=true)
    // Only move tabs if explicitly allowed (perWindow=false means cross-window grouping is ok)
    if (step.allowWindowMove) {
      const tabsToMove = [];
      for (const tabId of step.tabIds) {
        const tab = await chrome.tabs.get(tabId);
        if (tab.windowId !== step.windowId) {
          tabsToMove.push(tabId);
        }
      }

      if (tabsToMove.length > 0) {
        await chrome.tabs.move(tabsToMove, {
          windowId: step.windowId,
          index: -1
        });
      }
    }

    if (step.action === 'create') {
      // Chrome moves tabs to the focused window when creating groups
      // To maintain window isolation (perWindow=true), focus the target window first
      if (!step.allowWindowMove && step.windowId) {
        // Only detect focused window if caller didn't provide one
        if (!originalFocusedWindowId) {
          const windows = await chrome.windows.getAll();
          const focusedWindow = windows.find(w => w.focused);
          originalFocusedWindowId = focusedWindow?.id;
        }

        await chrome.windows.update(step.windowId, { focused: true });
      }

      // Create new group
      groupId = await chrome.tabs.group({ tabIds: step.tabIds });
      await chrome.tabGroups.update(groupId, {
        title: step.groupName,
        color: step.color,
        collapsed: step.collapsed
      });

      // Restore original focus
      if (originalFocusedWindowId && originalFocusedWindowId !== step.windowId) {
        await chrome.windows.update(originalFocusedWindowId, { focused: true });
      }
    } else if (step.action === 'reuse') {
      // Add to existing group
      groupId = step.groupId;

      // CRITICAL: Must focus the group's window to prevent tab stealing
      // Chrome will steal the entire group if we add tabs from a different focused window
      const group = await chrome.tabGroups.get(groupId);

      // Use provided callerWindowId, or detect focused window
      if (!originalFocusedWindowId) {
        const windows = await chrome.windows.getAll();
        const focusedWindow = windows.find(w => w.focused);
        originalFocusedWindowId = focusedWindow?.id;
      }

      const needsFocusSwitch = originalFocusedWindowId && originalFocusedWindowId !== group.windowId;

      if (needsFocusSwitch) {
        await chrome.windows.update(group.windowId, { focused: true });
      }

      await chrome.tabs.group({
        tabIds: step.tabIds,
        groupId: groupId
      });

      // Restore original focus
      if (needsFocusSwitch && originalFocusedWindowId) {
        await chrome.windows.update(originalFocusedWindowId, { focused: true });
      }
    }

    return {
      success: true,
      action: step.action,
      groupId: groupId,
      groupName: step.groupName,
      tabCount: step.tabIds.length
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      step: step
    };
  }
}

/**
 * Group tabs by their domain
 * @private
 */
function groupTabsByDomain(tabs) {
  const domainMap = new Map();

  for (const tab of tabs) {
    const domain = extractDomain(tab.url);
    if (domain) {
      if (!domainMap.has(domain)) {
        domainMap.set(domain, []);
      }
      domainMap.get(domain).push(tab);
    }
  }

  return domainMap;
}

/**
 * Group tabs by their window ID
 * @private
 */
function groupTabsByWindow(tabs) {
  const windowMap = new Map();

  for (const tab of tabs) {
    if (!windowMap.has(tab.windowId)) {
      windowMap.set(tab.windowId, []);
    }
    windowMap.get(tab.windowId).push(tab);
  }

  return windowMap;
}

/**
 * Extract domain from URL
 * @private
 */
function extractDomain(url) {
  if (!url) return null;

  try {
    // Skip chrome:// and other special URLs
    if (url.startsWith('chrome://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:') ||
        url.startsWith('chrome-extension://')) {
      return null;
    }

    const u = new URL(url);
    let hostname = u.hostname.toLowerCase();

    // Remove www prefix
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }

    return hostname || null;
  } catch {
    return null;
  }
}

/**
 * Pick a color for a group name (deterministic)
 * @private
 */
function pickColorForName(name) {
  const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }

  return colors[Math.abs(hash) % colors.length];
}