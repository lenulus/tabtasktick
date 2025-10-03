// Tab Grouping Service
// Centralized service for grouping tabs by domain with explicit scoping control

export const GroupingScope = {
  GLOBAL: 'global',           // All tabs from all windows → single target window
  TARGETED: 'targeted',       // Group tabs only within specified window
  PER_WINDOW: 'per_window'    // Group tabs within each window independently
};

/**
 * Groups tabs by domain with explicit scope control
 * @param {string} scope - One of GroupingScope values
 * @param {number} targetWindowId - Required for GLOBAL and TARGETED scopes
 * @returns {object} Result with groupsCreated, groupsReused, totalTabsGrouped, windowsAffected
 */
export async function groupTabsByDomain(scope, targetWindowId = null) {
  switch (scope) {
    case GroupingScope.GLOBAL:
      if (!targetWindowId) {
        throw new Error('Target window ID required for GLOBAL scope');
      }
      return await groupGlobally(targetWindowId);

    case GroupingScope.TARGETED:
      if (!targetWindowId) {
        throw new Error('Target window ID required for TARGETED scope');
      }
      return await groupInWindow(targetWindowId);

    case GroupingScope.PER_WINDOW:
      return await groupPerWindow();

    default:
      throw new Error(`Invalid scope: ${scope}`);
  }
}

/**
 * GLOBAL scope: Pull all tabs from all windows into target window and group them
 */
async function groupGlobally(targetWindowId) {
  const result = {
    groupsCreated: 0,
    groupsReused: 0,
    totalTabsGrouped: 0,
    windowsAffected: new Set(),
    targetWindow: targetWindowId
  };

  // Get ALL tabs from ALL windows
  const allTabs = await chrome.tabs.query({});

  // Filter out tabs that are already in the target window and grouped
  const tabsToMove = [];
  const tabsInTarget = [];

  for (const tab of allTabs) {
    if (tab.windowId === targetWindowId) {
      tabsInTarget.push(tab);
    } else {
      tabsToMove.push(tab);
      result.windowsAffected.add(tab.windowId);
    }
  }

  // Move tabs from other windows to target window
  const movedTabIds = [];
  for (const tab of tabsToMove) {
    try {
      const movedTab = await chrome.tabs.move(tab.id, {
        windowId: targetWindowId,
        index: -1
      });
      movedTabIds.push(movedTab.id);
    } catch (error) {
      console.error(`Failed to move tab ${tab.id}:`, error);
    }
  }

  // Now group all ungrouped tabs in the target window
  const targetResult = await groupInWindow(targetWindowId);

  result.groupsCreated = targetResult.groupsCreated;
  result.groupsReused = targetResult.groupsReused;
  result.totalTabsGrouped = targetResult.totalTabsGrouped;
  result.windowsAffected.add(targetWindowId);
  result.windowsAffected = Array.from(result.windowsAffected);

  return result;
}

/**
 * TARGETED scope: Group tabs only within the specified window
 */
async function groupInWindow(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const existingGroups = await chrome.tabGroups.query({ windowId });

  // Build map of existing groups by title
  const groupsByDomain = new Map();
  for (const group of existingGroups) {
    if (group.title) {
      groupsByDomain.set(group.title, group.id);
    }
  }

  // Group ungrouped tabs by domain
  const domainMap = new Map();
  for (const tab of tabs) {
    if (tab.groupId && tab.groupId !== -1) continue; // Skip already grouped tabs

    try {
      const url = new URL(tab.url);
      const domain = url.hostname;

      if (!domainMap.has(domain)) {
        domainMap.set(domain, []);
      }
      domainMap.get(domain).push(tab.id);
    } catch {
      // Skip invalid URLs
    }
  }

  // Create or add to groups
  let groupsCreated = 0;
  let groupsReused = 0;
  let totalTabsGrouped = 0;
  const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
  let colorIndex = existingGroups.length;

  for (const [domain, tabIds] of domainMap) {
    // Only group if we have 2+ tabs OR an existing group for this domain
    if (tabIds.length >= 2 || (tabIds.length === 1 && groupsByDomain.has(domain))) {
      let groupId;

      if (groupsByDomain.has(domain)) {
        // Add to existing group
        groupId = groupsByDomain.get(domain);
        await chrome.tabs.group({
          tabIds: tabIds,
          groupId: groupId
        });
        groupsReused++;
      } else if (tabIds.length >= 2) {
        // Create new group only for 2+ tabs
        groupId = await chrome.tabs.group({ tabIds });

        await chrome.tabGroups.update(groupId, {
          title: domain,
          color: colors[colorIndex % colors.length],
          collapsed: false
        });

        colorIndex++;
        groupsCreated++;
        groupsByDomain.set(domain, groupId);
      } else {
        continue;
      }

      totalTabsGrouped += tabIds.length;
    }
  }

  return {
    groupsCreated,
    groupsReused,
    totalTabsGrouped,
    windowId
  };
}

/**
 * PER_WINDOW scope: Group tabs within each window independently
 */
async function groupPerWindow() {
  const windows = await chrome.windows.getAll();
  const results = {
    groupsCreated: 0,
    groupsReused: 0,
    totalTabsGrouped: 0,
    windowsAffected: []
  };

  for (const window of windows) {
    const windowResult = await groupInWindow(window.id);

    if (windowResult.totalTabsGrouped > 0) {
      results.groupsCreated += windowResult.groupsCreated;
      results.groupsReused += windowResult.groupsReused;
      results.totalTabsGrouped += windowResult.totalTabsGrouped;
      results.windowsAffected.push(window.id);
    }
  }

  return results;
}

/**
 * Helper to get the current window ID for dashboard/popup contexts
 */
export async function getCurrentWindowId() {
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return currentTab.windowId;
}