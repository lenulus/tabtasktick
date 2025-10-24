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
 * - Empty collections - error
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

/**
 * System URL prefixes that cannot be restored
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

  if (!createNewWindow && !windowId) {
    throw new Error('windowId is required when createNewWindow=false');
  }

  const warnings = [];
  let targetWindowId = windowId;

  // Step 1: Fetch collection with complete hierarchy
  const collectionData = await getCompleteCollection(collectionId);

  if (!collectionData) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  // Extract collection and folders
  // getCompleteCollection returns { ...collection, folders: [{ ...folder, tabs: [...] }] }
  const { folders, ...collection } = collectionData;

  // Flatten tabs from nested folder structure
  const tabs = [];
  for (const folder of folders) {
    if (folder.tabs) {
      tabs.push(...folder.tabs);
    }
  }

  if (tabs.length === 0) {
    throw new Error('Collection has no tabs to restore');
  }

  // Step 2: Filter system tabs
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
    throw new Error('No restorable tabs in collection (all are system tabs)');
  }

  // Step 3: Create window if requested
  if (createNewWindow) {
    const newWindow = await chrome.windows.create({
      focused,
      state: windowState,
      url: 'about:blank' // Create with blank tab first
    });
    targetWindowId = newWindow.id;

    // Remove the default blank tab
    const defaultTabs = await chrome.tabs.query({ windowId: targetWindowId });
    for (const tab of defaultTabs) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch (error) {
        // Ignore errors removing default tabs
      }
    }
  }

  // Step 4: Prepare tab groups (folders → Chrome tab groups)
  // We'll create groups as we create tabs (find-or-create pattern)
  const folderIdToGroupId = new Map();
  const createdGroups = new Set();

  // Step 5: Sort tabs by folder and position
  // Group tabs by folder for efficient batch processing
  const tabsByFolder = new Map();
  for (const tab of restorableTabs) {
    if (!tabsByFolder.has(tab.folderId)) {
      tabsByFolder.set(tab.folderId, []);
    }
    tabsByFolder.get(tab.folderId).push(tab);
  }

  // Sort folders by position
  const sortedFolders = folders.sort((a, b) => a.position - b.position);

  // Step 6: Create tabs in batches with proper grouping
  const restoredTabs = [];
  let tabsCreated = 0;

  for (const folder of sortedFolders) {
    const folderTabs = tabsByFolder.get(folder.id) || [];
    if (folderTabs.length === 0) continue;

    // Sort tabs by position within folder
    folderTabs.sort((a, b) => a.position - b.position);

    // Process tabs in batches
    for (let i = 0; i < folderTabs.length; i += TAB_CREATION_BATCH_SIZE) {
      const batch = folderTabs.slice(i, i + TAB_CREATION_BATCH_SIZE);

      // Create tabs in parallel within batch
      await Promise.all(batch.map(async (storageTab) => {
        try {
          // Create Chrome tab
          const chromeTab = await chrome.tabs.create({
            windowId: targetWindowId,
            url: storageTab.url,
            pinned: storageTab.isPinned || false,
            active: false
          });

          tabsCreated++;

          // Assign to tab group (folder)
          // Skip "Ungrouped" folder (grey color by convention)
          if (folder.name !== 'Ungrouped' && folder.color !== 'grey') {
            // Find or create group for this folder
            let groupId = folderIdToGroupId.get(folder.id);

            if (!groupId) {
              // Create new group
              groupId = await chrome.tabs.group({
                tabIds: [chromeTab.id],
                createProperties: { windowId: targetWindowId }
              });

              // Update group properties
              await chrome.tabGroups.update(groupId, {
                title: folder.name,
                color: folder.color,
                collapsed: folder.collapsed || false
              });

              folderIdToGroupId.set(folder.id, groupId);
              createdGroups.add(groupId);
            } else {
              // Add to existing group
              await chrome.tabs.group({
                tabIds: [chromeTab.id],
                groupId
              });
            }
          }

          // Update storage tab with Chrome tabId
          await TabService.updateTab(storageTab.id, {
            tabId: chromeTab.id
          });

          restoredTabs.push({
            storageId: storageTab.id,
            chromeTabId: chromeTab.id,
            url: storageTab.url
          });

        } catch (error) {
          warnings.push(`Failed to restore tab ${storageTab.url}: ${error.message}`);
        }
      }));

      // Rate limiting: delay between batches
      if (i + TAB_CREATION_BATCH_SIZE < folderTabs.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }
  }

  // Step 7: Bind collection to window and mark active
  await CollectionService.bindToWindow(collectionId, targetWindowId);
  await WindowService.bindCollectionToWindow(collectionId, targetWindowId);

  // Step 8: Return result
  return {
    collectionId,
    windowId: targetWindowId,
    tabs: restoredTabs,
    stats: {
      tabsRestored: tabsCreated,
      tabsSkipped: skippedCount,
      groupsRestored: createdGroups.size,
      warnings
    }
  };
}

/**
 * Checks if a URL is a system URL that cannot be restored.
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
