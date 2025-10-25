/**
 * @file windowCreation - Shared window creation utilities
 *
 * @description
 * Provides battle-tested window creation logic (137+ lines) extracted from
 * ExportImportService for reuse across the codebase. Handles complex edge
 * cases like system tab filtering, tab group recreation, batch processing,
 * and Chrome API rate limiting.
 *
 * This utility is designed to work with both:
 * - TabMaster Pro (ExportImportService export/import format)
 * - TabTaskTick (normalized collection/folder/tab model)
 *
 * Key Features:
 * - Window creation with state preservation (normal, maximized, minimized)
 * - System tab filtering (chrome://, about:, etc.)
 * - Batch tab creation (10 tabs per batch with 100ms delay)
 * - Tab group recreation with colors/titles/collapsed state
 * - Default "New Tab" cleanup
 * - Extensible via callbacks for storage updates
 *
 * @module services/utils/windowCreation
 *
 * @architecture
 * - Layer: Utility (pure orchestration logic)
 * - Dependencies: chrome.windows, chrome.tabs, chrome.tabGroups
 * - Used By: ExportImportService, RestoreCollectionService
 * - Storage: None (delegates to callbacks)
 *
 * @example
 * // Create window with tabs and groups
 * import { createWindowWithTabsAndGroups } from './services/utils/windowCreation.js';
 *
 * const result = await createWindowWithTabsAndGroups({
 *   tabs: [
 *     { url: 'https://example.com', pinned: false, groupKey: 'work', groupInfo: { name: 'Work', color: 'blue' } },
 *     { url: 'https://github.com', pinned: false, groupKey: 'work', groupInfo: { name: 'Work', color: 'blue' } }
 *   ],
 *   createNewWindow: true,
 *   focused: true
 * });
 *
 * console.log(`Created window ${result.windowId} with ${result.stats.tabsCreated} tabs`);
 */

/**
 * System URL prefixes that cannot be created as tabs
 * @constant
 */
const SYSTEM_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'view-source:'
];

/**
 * Batch size for tab creation (rate limiting)
 * @constant
 */
const TAB_CREATION_BATCH_SIZE = 10;

/**
 * Delay between batches (milliseconds)
 * @constant
 */
const BATCH_DELAY_MS = 100;

/**
 * Creates a browser window with tabs and tab groups.
 *
 * This is the shared window creation logic extracted from ExportImportService.
 * It handles all the edge cases of window/tab creation:
 * - Filtering system tabs that can't be created
 * - Creating window or using existing window
 * - Removing default "New Tab" tabs
 * - Creating tabs in batches to avoid Chrome API rate limits
 * - Creating and assigning tab groups with proper metadata
 * - Calling optional callbacks for storage updates
 *
 * Tab Data Format:
 * Each tab object should have:
 * - url: string (required) - Tab URL
 * - pinned: boolean (optional) - Whether tab is pinned
 * - groupKey: string (optional) - Unique key for tab group (e.g., folder ID, group name)
 * - groupInfo: object (optional) - Group metadata if this tab belongs to a group
 *   - name: string - Group name/title
 *   - color: string - Chrome tab group color
 *   - collapsed: boolean - Whether group is collapsed
 *   - position: number - Group position in window
 * - metadata: any (optional) - Additional data to pass to onTabCreated callback
 *
 * Options:
 * - createNewWindow: true = create new window, false = use windowId
 * - windowId: Chrome window ID (required if createNewWindow=false)
 * - focused: Whether new window should be focused
 * - windowState: Window state ('normal', 'maximized', 'minimized')
 * - onTabCreated: Callback after each tab created (chromeTab, tabData) => Promise<void>
 * - onGroupCreated: Callback after each group created (groupId, groupInfo) => Promise<void>
 *
 * @param {Object} options - Window creation options
 * @param {Object[]} options.tabs - Array of tab data objects
 * @param {boolean} [options.createNewWindow=true] - Create new window vs use existing
 * @param {number} [options.windowId] - Target window ID (required if createNewWindow=false)
 * @param {boolean} [options.focused=true] - Focus new window
 * @param {string} [options.windowState='normal'] - Window state
 * @param {Function} [options.onTabCreated] - Called after each tab created
 * @param {Function} [options.onGroupCreated] - Called after each group created
 *
 * @returns {Promise<Object>} Creation result
 * @returns {number} return.windowId - Chrome window ID
 * @returns {Object[]} return.tabs - Created tabs with Chrome tab IDs
 * @returns {Map<string,number>} return.groups - Map of groupKey -> Chrome group ID
 * @returns {Object} return.stats - Creation statistics
 * @returns {number} return.stats.tabsCreated - Tabs created count
 * @returns {number} return.stats.tabsSkipped - System tabs skipped count
 * @returns {number} return.stats.groupsCreated - Tab groups created count
 * @returns {string[]} return.stats.warnings - Warning messages
 *
 * @throws {Error} If tabs array is empty
 * @throws {Error} If windowId required but not provided
 * @throws {Error} If no restorable tabs (all are system tabs)
 * @throws {Error} If Chrome API operations fail
 *
 * @example
 * // Create new window with tabs and groups
 * const result = await createWindowWithTabsAndGroups({
 *   tabs: [
 *     { url: 'https://example.com', groupKey: 'work', groupInfo: { name: 'Work', color: 'blue' } }
 *   ],
 *   createNewWindow: true
 * });
 *
 * @example
 * // Restore in existing window with storage callbacks
 * const result = await createWindowWithTabsAndGroups({
 *   tabs: [...],
 *   createNewWindow: false,
 *   windowId: 123,
 *   onTabCreated: async (chromeTab, tabData) => {
 *     await updateTabInStorage(tabData.metadata.id, { tabId: chromeTab.id });
 *   }
 * });
 */
export async function createWindowWithTabsAndGroups(options) {
  // Validation
  const {
    tabs,
    createNewWindow = true,
    windowId,
    focused = true,
    windowState = 'normal',
    onTabCreated,
    onGroupCreated
  } = options;

  if (!tabs || tabs.length === 0) {
    throw new Error('Tabs array is required and cannot be empty');
  }

  if (!createNewWindow && !windowId) {
    throw new Error('windowId is required when createNewWindow=false');
  }

  const warnings = [];
  let targetWindowId = windowId;

  // Step 1: Filter system tabs
  const restorableTabs = [];
  let skippedCount = 0;

  for (const tab of tabs) {
    if (isSystemTab(tab.url)) {
      skippedCount++;
      warnings.push(`Skipped system tab: ${tab.url}`);
      continue;
    }
    restorableTabs.push(tab);
  }

  if (restorableTabs.length === 0) {
    throw new Error('No restorable tabs (all are system tabs)');
  }

  // Step 2: Create window if requested
  let defaultTabIds = []; // Track default tabs to remove after creating real tabs
  if (createNewWindow) {
    const newWindow = await chrome.windows.create({
      focused,
      state: windowState,
      url: 'about:blank' // Create with blank tab first
    });
    targetWindowId = newWindow.id;

    // Save default tab IDs to remove later (after creating real tabs)
    // This avoids closing the window by removing all tabs
    const defaultTabs = await chrome.tabs.query({ windowId: targetWindowId });
    defaultTabIds = defaultTabs.map(t => t.id);
  } else {
    // Verify window exists if using existing window
    try {
      await chrome.windows.get(targetWindowId);
    } catch (error) {
      throw new Error(`Window ${targetWindowId} does not exist. Cannot create tabs in non-existent window.`);
    }
    // No default tabs to remove when using existing window
  }

  // Step 3: Prepare tab groups
  // groupKey -> Chrome group ID
  const groupKeyToGroupId = new Map();
  const createdGroups = new Set();

  // Step 4: Group tabs by groupKey for efficient batch processing
  const tabsByGroup = new Map();
  const ungroupedTabs = [];

  for (const tab of restorableTabs) {
    if (tab.groupKey) {
      if (!tabsByGroup.has(tab.groupKey)) {
        tabsByGroup.set(tab.groupKey, []);
      }
      tabsByGroup.get(tab.groupKey).push(tab);
    } else {
      ungroupedTabs.push(tab);
    }
  }

  // Sort groups by position if available
  const sortedGroups = Array.from(tabsByGroup.keys()).sort((a, b) => {
    const tabsA = tabsByGroup.get(a);
    const tabsB = tabsByGroup.get(b);
    const posA = tabsA[0]?.groupInfo?.position ?? 999;
    const posB = tabsB[0]?.groupInfo?.position ?? 999;
    return posA - posB;
  });

  // Step 5: Create tabs in batches with proper grouping
  const createdTabs = [];
  let tabsCreated = 0;

  // Process grouped tabs first
  for (const groupKey of sortedGroups) {
    const groupTabs = tabsByGroup.get(groupKey);
    const groupInfo = groupTabs[0].groupInfo;

    // Sort tabs by position if available
    groupTabs.sort((a, b) => {
      const posA = a.metadata?.position ?? 999;
      const posB = b.metadata?.position ?? 999;
      return posA - posB;
    });

    // Process tabs in batches
    for (let i = 0; i < groupTabs.length; i += TAB_CREATION_BATCH_SIZE) {
      const batch = groupTabs.slice(i, i + TAB_CREATION_BATCH_SIZE);

      // Create tabs in parallel within batch
      await Promise.all(batch.map(async (tabData) => {
        try {
          // Create Chrome tab
          const chromeTab = await chrome.tabs.create({
            windowId: targetWindowId,
            url: tabData.url || 'about:blank',
            pinned: tabData.pinned || false,
            active: false
          });

          tabsCreated++;

          // Assign to tab group
          let groupId = groupKeyToGroupId.get(groupKey);

          if (!groupId) {
            // Create new group
            groupId = await chrome.tabs.group({
              tabIds: [chromeTab.id],
              createProperties: { windowId: targetWindowId }
            });

            // Update group properties
            await chrome.tabGroups.update(groupId, {
              title: groupInfo.name || '',
              color: groupInfo.color || 'grey',
              collapsed: groupInfo.collapsed || false
            });

            groupKeyToGroupId.set(groupKey, groupId);
            createdGroups.add(groupId);

            // Call onGroupCreated callback
            if (onGroupCreated) {
              await onGroupCreated(groupId, groupInfo);
            }
          } else {
            // Add to existing group
            await chrome.tabs.group({
              tabIds: [chromeTab.id],
              groupId
            });
          }

          // Call onTabCreated callback
          if (onTabCreated) {
            await onTabCreated(chromeTab, tabData);
          }

          createdTabs.push({
            chromeTabId: chromeTab.id,
            url: tabData.url,
            groupId,
            metadata: tabData.metadata
          });

        } catch (error) {
          warnings.push(`Failed to create tab ${tabData.url}: ${error.message}`);
        }
      }));

      // Rate limiting: delay between batches
      if (i + TAB_CREATION_BATCH_SIZE < groupTabs.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }
  }

  // Process ungrouped tabs
  if (ungroupedTabs.length > 0) {
    // Sort by position if available
    ungroupedTabs.sort((a, b) => {
      const posA = a.metadata?.position ?? 999;
      const posB = b.metadata?.position ?? 999;
      return posA - posB;
    });

    for (let i = 0; i < ungroupedTabs.length; i += TAB_CREATION_BATCH_SIZE) {
      const batch = ungroupedTabs.slice(i, i + TAB_CREATION_BATCH_SIZE);

      await Promise.all(batch.map(async (tabData) => {
        try {
          const chromeTab = await chrome.tabs.create({
            windowId: targetWindowId,
            url: tabData.url || 'about:blank',
            pinned: tabData.pinned || false,
            active: false
          });

          tabsCreated++;

          // Call onTabCreated callback
          if (onTabCreated) {
            await onTabCreated(chromeTab, tabData);
          }

          createdTabs.push({
            chromeTabId: chromeTab.id,
            url: tabData.url,
            groupId: null,
            metadata: tabData.metadata
          });

        } catch (error) {
          warnings.push(`Failed to create tab ${tabData.url}: ${error.message}`);
        }
      }));

      // Rate limiting
      if (i + TAB_CREATION_BATCH_SIZE < ungroupedTabs.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }
  }

  // Step 6: Remove default blank tabs (now that we have real tabs)
  if (defaultTabIds.length > 0) {
    for (const tabId of defaultTabIds) {
      try {
        await chrome.tabs.remove(tabId);
      } catch (error) {
        // Ignore errors removing default tabs (they may have been auto-closed)
      }
    }
  }

  // Step 7: Return result
  return {
    windowId: targetWindowId,
    tabs: createdTabs,
    groups: groupKeyToGroupId,
    stats: {
      tabsCreated,
      tabsSkipped: skippedCount,
      groupsCreated: createdGroups.size,
      warnings
    }
  };
}

/**
 * Checks if a URL is a system URL that cannot be created.
 *
 * @param {string} url - URL to check
 * @returns {boolean} True if URL is a system URL
 *
 * @private
 */
function isSystemTab(url) {
  if (!url) return false;
  return SYSTEM_URL_PREFIXES.some(prefix => url.startsWith(prefix));
}
