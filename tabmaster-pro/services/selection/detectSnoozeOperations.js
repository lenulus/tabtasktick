/**
 * Smart Window Snooze Detection Service
 *
 * Analyzes selected tabs and determines optimal snooze operations.
 * Detects when entire windows should be snoozed vs individual tabs.
 *
 * This is pure business logic with no UI dependencies.
 */

/**
 * Analyzes selected tabs and determines snooze operations.
 *
 * @param {number[]} selectedTabIds - IDs of tabs user selected
 * @returns {Promise<{operations: SnoozeOperation[], summary: OperationSummary}>}
 *
 * @typedef {Object} SnoozeOperation
 * @property {'window'|'tabs'} type - Operation type
 * @property {number} [windowId] - Window ID (for window operations)
 * @property {string} [windowTitle] - Window title (for window operations)
 * @property {number[]} [tabIds] - Tab IDs (for tab operations)
 * @property {number} tabCount - Number of tabs in this operation
 *
 * @typedef {Object} OperationSummary
 * @property {number} totalTabs - Total tabs being snoozed
 * @property {number} windowCount - Number of complete windows
 * @property {number} individualTabCount - Number of individual tabs
 * @property {boolean} isSingleWindow - True if all tabs from one window
 * @property {boolean} isMixed - True if mix of windows and individual tabs
 */
export async function detectSnoozeOperations(selectedTabIds) {
  if (!selectedTabIds || selectedTabIds.length === 0) {
    return {
      operations: [],
      summary: {
        totalTabs: 0,
        windowCount: 0,
        individualTabCount: 0,
        isSingleWindow: false,
        isMixed: false
      }
    };
  }

  // Get all tabs with their window information
  const selectedTabs = await chrome.tabs.query({
    // Query all tabs, then filter to selected IDs
  });
  const selectedTabsMap = new Map(
    selectedTabs
      .filter(tab => selectedTabIds.includes(tab.id))
      .map(tab => [tab.id, tab])
  );

  // Group selected tabs by window
  const tabsByWindow = new Map();
  for (const tab of selectedTabsMap.values()) {
    if (!tabsByWindow.has(tab.windowId)) {
      tabsByWindow.set(tab.windowId, []);
    }
    tabsByWindow.get(tab.windowId).push(tab);
  }

  // Get all tabs in each window to detect complete windows
  const windowPromises = Array.from(tabsByWindow.keys()).map(async windowId => {
    const allTabsInWindow = await chrome.tabs.query({ windowId });
    return {
      windowId,
      allTabs: allTabsInWindow,
      selectedTabs: tabsByWindow.get(windowId)
    };
  });
  const windowsData = await Promise.all(windowPromises);

  // Analyze each window and create operations
  const operations = [];
  let totalWindowCount = 0;
  let totalIndividualTabCount = 0;

  for (const { windowId, allTabs, selectedTabs } of windowsData) {
    const isCompleteWindow = selectedTabs.length === allTabs.length;

    if (isCompleteWindow) {
      // Complete window - create window operation
      const windowTitle = await getWindowTitle(windowId, allTabs);
      operations.push({
        type: 'window',
        windowId,
        windowTitle,
        tabCount: allTabs.length
      });
      totalWindowCount++;
    } else {
      // Partial window - create tabs operation
      operations.push({
        type: 'tabs',
        tabIds: selectedTabs.map(t => t.id),
        tabCount: selectedTabs.length,
        sourceWindowId: windowId // Track source for restoration
      });
      totalIndividualTabCount += selectedTabs.length;
    }
  }

  // Build summary
  const summary = {
    totalTabs: selectedTabIds.length,
    windowCount: totalWindowCount,
    individualTabCount: totalIndividualTabCount,
    isSingleWindow: tabsByWindow.size === 1,
    isMixed: totalWindowCount > 0 && totalIndividualTabCount > 0
  };

  return { operations, summary };
}

/**
 * Gets a descriptive title for a window based on its tabs.
 *
 * @param {number} windowId - Window ID
 * @param {chrome.tabs.Tab[]} tabs - Tabs in the window
 * @returns {Promise<string>} - Window title
 */
async function getWindowTitle(windowId, tabs) {
  if (!tabs || tabs.length === 0) {
    return `Window ${windowId}`;
  }

  // Get the active tab's title, or the first tab if no active tab
  const activeTab = tabs.find(t => t.active);
  const titleTab = activeTab || tabs[0];

  // Extract domain from URL
  let domain = 'Unknown';
  try {
    const url = new URL(titleTab.url);
    domain = url.hostname.replace('www.', '');
  } catch (e) {
    // If URL parsing fails, use the title
    if (titleTab.title && titleTab.title.length > 0) {
      domain = titleTab.title.substring(0, 30);
    }
  }

  return `${domain} (${tabs.length} tab${tabs.length !== 1 ? 's' : ''})`;
}

/**
 * Validates that all selected tabs still exist.
 * Useful for checking before executing operations.
 *
 * @param {number[]} tabIds - Tab IDs to validate
 * @returns {Promise<{valid: number[], invalid: number[]}>}
 */
export async function validateTabIds(tabIds) {
  const results = {
    valid: [],
    invalid: []
  };

  if (!tabIds || tabIds.length === 0) {
    return results;
  }

  // Check each tab
  const validationPromises = tabIds.map(async tabId => {
    try {
      const tab = await chrome.tabs.get(tabId);
      return { tabId, exists: !!tab };
    } catch (e) {
      return { tabId, exists: false };
    }
  });

  const validations = await Promise.all(validationPromises);
  for (const { tabId, exists } of validations) {
    if (exists) {
      results.valid.push(tabId);
    } else {
      results.invalid.push(tabId);
    }
  }

  return results;
}
