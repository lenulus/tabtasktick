/**
 * @file RestoreCollectionService - Collection restoration orchestration
 *
 * @description
 * RestoreCollectionService handles restoring saved collections as browser windows.
 * It coordinates the process of reading collection data from IndexedDB and
 * recreating the window state in Chrome with all tabs, tab groups, and metadata.
 *
 * The service reuses the battle-tested window creation logic from ExportImportService
 * (137 lines of edge case handling) while adapting it for TabTaskTick's normalized
 * data model.
 *
 * Restoration Strategy:
 * 1. Fetch collection with folders and tabs from IndexedDB
 * 2. Create new window (or use current window based on options)
 * 3. Create tab groups from folders
 * 4. Create tabs in proper groups with correct positions
 * 5. Map Chrome-assigned tab IDs back to storage tabs
 * 6. Bind collection to window (isActive=true)
 * 7. Clean up default "New Tab" tabs
 *
 * Edge Cases Handled:
 * - System tabs (chrome://) - skipped with warning
 * - Empty collections - creates empty window with default "New Tab"
 * - Tab group recreation with proper order
 * - Pinned tab preservation
 * - Window state (normal, maximized, minimized)
 * - Batch processing for large collections (>50 tabs)
 * - Chrome API rate limiting (100ms delay between batches)
 *
 * @module services/execution/RestoreCollectionService
 *
 * @architecture
 * - Layer: Orchestration Service
 * - Dependencies: CollectionService, FolderService, TabService, WindowService, storage-queries
 * - Used By: Background message handlers, TaskExecutionService, UI surfaces
 * - Storage: IndexedDB (via selection/execution services)
 *
 * @example
 * // Restore saved collection as new window
 * import * as RestoreCollectionService from './services/execution/RestoreCollectionService.js';
 *
 * const result = await RestoreCollectionService.restoreCollection({
 *   collectionId: 'col_123',
 *   createNewWindow: true
 * });
 *
 * console.log(`Restored ${result.stats.tabsRestored} tabs in window ${result.windowId}`);
 *
 * @example
 * // Restore collection in current window
 * const result = await RestoreCollectionService.restoreCollection({
 *   collectionId: 'col_456',
 *   createNewWindow: false,
 *   windowId: 789
 * });
 */

import * as CollectionService from './CollectionService.js';
import * as WindowService from './WindowService.js';
import { getCollection, getCompleteCollection } from '../utils/storage-queries.js';
import * as TabService from './TabService.js';
import { createWindowWithTabsAndGroups } from '../utils/windowCreation.js';

// Note: System tab filtering, batching, and delays are now handled by
// the shared windowCreation utility. This service focuses on data transformation
// and storage updates.

/**
 * Restores a saved collection as a browser window.
 *
 * Orchestrates the complex process of recreating a window from saved collection
 * data. Creates tabs in batches to avoid Chrome API rate limiting, recreates
 * tab groups with proper colors/titles, maps Chrome tab IDs back to storage,
 * and binds the collection to the window.
 *
 * Options:
 * - createNewWindow: true = create new window, false = use specified windowId
 * - windowId: Chrome window ID (required if createNewWindow=false)
 * - focused: Whether new window should be focused (default: true)
 *
 * Stats returned:
 * - tabsRestored: Number of tabs successfully created
 * - tabsSkipped: Number of system tabs skipped
 * - groupsRestored: Number of tab groups created
 * - warnings: Array of warning messages
 *
 * Post-restore state:
 * - collection.isActive = true
 * - collection.windowId = <new window ID>
 * - tabs have Chrome tabId mapped
 *
 * @param {Object} options - Restoration options
 * @param {string} options.collectionId - Collection ID to restore (required)
 * @param {boolean} [options.createNewWindow=true] - Create new window vs use existing
 * @param {number} [options.windowId] - Target window ID (required if createNewWindow=false)
 * @param {boolean} [options.focused=true] - Focus new window
 * @param {string} [options.windowState='normal'] - Window state ('normal', 'maximized', 'minimized')
 *
 * @returns {Promise<Object>} Restoration result
 * @returns {string} return.collectionId - Collection ID
 * @returns {number} return.windowId - Chrome window ID
 * @returns {Object[]} return.tabs - Array of restored tab objects
 * @returns {Object} return.stats - Restoration statistics
 * @returns {number} return.stats.tabsRestored - Tabs created count
 * @returns {number} return.stats.tabsSkipped - System tabs skipped count
 * @returns {number} return.stats.groupsRestored - Tab groups created count
 * @returns {string[]} return.stats.warnings - Warning messages
 *
 * @throws {Error} If collectionId is missing
 * @throws {Error} If collection not found
 * @throws {Error} If collection has no tabs
 * @throws {Error} If windowId required but not provided
 * @throws {Error} If Chrome API operations fail
 *
 * @example
 * // Restore as new window
 * const result = await restoreCollection({
 *   collectionId: 'col_123'
 * });
 *
 * @example
 * // Restore in current window
 * const result = await restoreCollection({
 *   collectionId: 'col_456',
 *   createNewWindow: false,
 *   windowId: 789
 * });
 *
 * @example
 * // Restore as maximized window
 * const result = await restoreCollection({
 *   collectionId: 'col_789',
 *   windowState: 'maximized'
 * });
 */
export async function restoreCollection(options) {
  // Validation
  if (!options.collectionId) {
    throw new Error('Collection ID is required');
  }

  const {
    collectionId,
    createNewWindow = true,
    windowId,
    focused = true,
    windowState = 'normal'
  } = options;

  // Step 1: Fetch collection with complete hierarchy
  const collectionData = await getCompleteCollection(collectionId);

  if (!collectionData) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  // Extract collection, folders, and ungroupedTabs
  // getCompleteCollection returns { ...collection, folders: [...], ungroupedTabs: [...] }
  const { folders, ungroupedTabs, ...collection } = collectionData;

  // Step 2: Transform collection data into windowCreation format
  // Build tab array with group metadata embedded
  const tabsForCreation = [];

  // Add tabs from folders (grouped tabs)
  for (const folder of folders) {
    if (!folder.tabs || folder.tabs.length === 0) continue;

    for (const tab of folder.tabs) {
      tabsForCreation.push({
        url: tab.url,
        pinned: tab.isPinned || false,
        groupKey: folder.id,
        groupInfo: {
          name: folder.name,
          color: folder.color,
          collapsed: folder.collapsed || false,
          position: folder.position
        },
        metadata: {
          id: tab.id, // Storage tab ID for callback
          position: tab.position
        }
      });
    }
  }

  // Add ungrouped tabs (folderId === null)
  if (ungroupedTabs && ungroupedTabs.length > 0) {
    for (const tab of ungroupedTabs) {
      tabsForCreation.push({
        url: tab.url,
        pinned: tab.isPinned || false,
        groupKey: null, // No group
        groupInfo: null,
        metadata: {
          id: tab.id, // Storage tab ID for callback
          position: tab.position
        }
      });
    }
  }

  // Sort all tabs by position to preserve window-level ordering
  tabsForCreation.sort((a, b) => a.metadata.position - b.metadata.position);

  // Handle empty collections - create window with default "New Tab"
  let result;
  if (tabsForCreation.length === 0) {
    // Create empty window (Chrome creates with default "New Tab")
    if (createNewWindow) {
      const newWindow = await chrome.windows.create({
        focused: focused !== undefined ? focused : true,
        state: windowState || 'normal'
      });
      result = {
        windowId: newWindow.id,
        tabs: [],
        groups: [],
        stats: {
          tabsRestored: 0,
          tabsSkipped: 0,
          groupsRestored: 0,
          warnings: ['Collection has no tabs - created empty window']
        }
      };
    } else {
      // Use existing window
      result = {
        windowId,
        tabs: [],
        groups: [],
        stats: {
          tabsRestored: 0,
          tabsSkipped: 0,
          groupsRestored: 0,
          warnings: ['Collection has no tabs - using current window']
        }
      };
    }
  } else {
    // Step 3: Use shared window creation utility
    result = await createWindowWithTabsAndGroups({
      tabs: tabsForCreation,
      createNewWindow,
      windowId,
      focused,
      windowState,
      // Callback: Update storage tab with Chrome tabId after each tab created
      onTabCreated: async (chromeTab, tabData) => {
        await TabService.updateTab(tabData.metadata.id, {
          tabId: chromeTab.id
        });
      }
    });
  }

  // Step 4: Bind collection to window and mark active
  // Note: WindowService.bindCollectionToWindow internally calls CollectionService.bindToWindow
  // and also manages the cache, so we only need to call it once
  await WindowService.bindCollectionToWindow(collectionId, result.windowId);

  // Step 5: Update metadata counts (tabs may have been updated, not created, so counts need refresh)
  const completeCollectionData = await getCompleteCollection(collectionId);
  const groupedTabCount = completeCollectionData.folders.reduce((sum, folder) => sum + (folder.tabs?.length || 0), 0);
  const ungroupedTabCount = completeCollectionData.ungroupedTabs?.length || 0;
  const totalTabs = groupedTabCount + ungroupedTabCount;

  await CollectionService.updateCollection(collectionId, {
    metadata: {
      ...completeCollectionData.metadata,
      tabCount: totalTabs,
      folderCount: completeCollectionData.folders.length
    }
  });

  // Step 6: Fetch updated collection (now has windowId, isActive, and correct counts)
  const updatedCollection = await getCollection(collectionId);

  // Step 6: Transform result to match expected format
  const restoredTabs = result.tabs.map(tab => ({
    storageId: tab.metadata.id,
    chromeTabId: tab.chromeTabId,
    url: tab.url
  }));

  return {
    collection: updatedCollection, // Include collection for Progressive Sync tracking
    collectionId,
    windowId: result.windowId,
    tabs: restoredTabs,
    stats: {
      tabsRestored: result.stats.tabsCreated,
      tabsSkipped: result.stats.tabsSkipped,
      groupsRestored: result.stats.groupsCreated,
      warnings: result.stats.warnings
    }
  };
}

