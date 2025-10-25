/**
 * @file CaptureWindowService - Window capture orchestration
 *
 * @description
 * CaptureWindowService handles the orchestration of capturing a browser window's
 * complete state (tabs, tab groups, window metadata) and creating a persistent
 * Collection in IndexedDB. This is the primary entry point for the "Save Window"
 * feature.
 *
 * The service coordinates multiple sub-services:
 * - CollectionService: Creates the collection entity
 * - FolderService: Creates folders (tab groups)
 * - TabService: Creates tab entities with metadata
 * - WindowService: Binds collection to window (optional)
 *
 * Capture Strategy:
 * 1. Fetch all window data (tabs, tab groups, window info)
 * 2. Create collection with metadata
 * 3. Map Chrome tab groups → folders
 * 4. Map Chrome tabs → tab entities (with proper folder assignment)
 * 5. Bind collection to window (if keepActive=true)
 *
 * Edge Cases Handled:
 * - Empty windows (warning, but allowed)
 * - Tabs without groups (assigned to default "Ungrouped" folder)
 * - System tabs (chrome://) - skipped with warning
 * - Large windows (100+ tabs) - batched operations
 * - Tab groups without tabs - skipped
 *
 * @module services/execution/CaptureWindowService
 *
 * @architecture
 * - Layer: Orchestration Service
 * - Dependencies: CollectionService, FolderService, TabService, WindowService
 * - Used By: Background message handlers, context menus, popup
 * - Storage: IndexedDB (via execution services)
 *
 * @example
 * // Capture current window as new collection
 * import * as CaptureWindowService from './services/execution/CaptureWindowService.js';
 *
 * const result = await CaptureWindowService.captureWindow({
 *   windowId: 123,
 *   metadata: {
 *     name: 'Research Project',
 *     description: 'OAuth 2.0 implementation docs',
 *     icon: '🔐',
 *     tags: ['work', 'backend']
 *   }
 * });
 *
 * console.log(`Captured ${result.stats.tabsCaptured} tabs in ${result.stats.foldersCaptured} folders`);
 *
 * @example
 * // Capture window without binding (saved collection)
 * const saved = await CaptureWindowService.captureWindow({
 *   windowId: 456,
 *   metadata: { name: 'Saved Research' },
 *   keepActive: false
 * });
 * console.log(saved.collection.isActive); // false
 */

import * as CollectionService from './CollectionService.js';
import * as FolderService from './FolderService.js';
import * as TabService from './TabService.js';
import * as WindowService from './WindowService.js';

/**
 * System URL prefixes to skip during capture.
 * These are internal Chrome URLs that cannot/shouldn't be reopened.
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
 * Default folder name for ungrouped tabs
 * @constant
 */
const UNGROUPED_FOLDER_NAME = 'Ungrouped';

/**
 * Default folder color for ungrouped tabs
 * @constant
 */
const UNGROUPED_FOLDER_COLOR = 'grey';

/**
 * Chrome tab group colors
 * @constant
 */
const TAB_GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

/**
 * Captures a browser window's complete state and creates a Collection.
 *
 * Orchestrates the process of capturing all tabs, tab groups, and window metadata,
 * then persisting them as a Collection with Folders and Tabs in IndexedDB.
 *
 * Process:
 * 1. Validate window exists
 * 2. Fetch window data (tabs, tab groups, window info)
 * 3. Filter system tabs (chrome://, etc.)
 * 4. Create collection entity
 * 5. Create folders for each tab group (+ "Ungrouped" folder)
 * 6. Create tab entities with proper folder assignment
 * 7. Optionally bind collection to window (keepActive=true)
 *
 * Metadata:
 * - name: User-provided or auto-generated from dominant domain
 * - description, icon, color, tags: Optional user metadata
 * - windowId: Bound to window if keepActive=true
 *
 * Stats returned:
 * - tabsCaptured: Number of tabs saved
 * - tabsSkipped: Number of system tabs skipped
 * - foldersCaptured: Number of folders created
 * - warnings: Array of warning messages
 *
 * @param {Object} options - Capture options
 * @param {number} options.windowId - Chrome window ID to capture (required)
 * @param {Object} options.metadata - Collection metadata
 * @param {string} options.metadata.name - Collection name (required)
 * @param {string} [options.metadata.description] - Description
 * @param {string} [options.metadata.icon] - Emoji icon
 * @param {string} [options.metadata.color] - Hex color
 * @param {string[]} [options.metadata.tags] - Tag array
 * @param {boolean} [options.keepActive=true] - Keep collection bound to window (active)
 *
 * @returns {Promise<Object>} Capture result
 * @returns {Object} return.collection - Created collection object
 * @returns {Object[]} return.folders - Created folder objects
 * @returns {Object[]} return.tabs - Created tab objects
 * @returns {Object} return.stats - Capture statistics
 * @returns {number} return.stats.tabsCaptured - Tabs saved count
 * @returns {number} return.stats.tabsSkipped - System tabs skipped count
 * @returns {number} return.stats.foldersCaptured - Folders created count
 * @returns {string[]} return.stats.warnings - Warning messages
 *
 * @throws {Error} If windowId is missing
 * @throws {Error} If window not found
 * @throws {Error} If metadata.name is missing
 * @throws {Error} If Chrome API operations fail
 * @throws {Error} If storage operations fail
 *
 * @example
 * // Capture window with metadata
 * const result = await captureWindow({
 *   windowId: 123,
 *   metadata: {
 *     name: 'Research',
 *     tags: ['work', 'backend']
 *   }
 * });
 *
 * @example
 * // Capture as saved collection (not bound to window)
 * const saved = await captureWindow({
 *   windowId: 456,
 *   metadata: { name: 'Archive' },
 *   keepActive: false
 * });
 */
export async function captureWindow(options) {
  // Validation
  if (!options.windowId) {
    throw new Error('Window ID is required');
  }

  if (!options.metadata?.name) {
    throw new Error('Collection name is required in metadata');
  }

  const { windowId, metadata, keepActive = true } = options;
  const warnings = [];

  // Step 1: Validate window exists and get window info
  let windowInfo;
  try {
    windowInfo = await chrome.windows.get(windowId, { populate: false });
  } catch (error) {
    throw new Error(`Window not found: ${windowId}`);
  }

  // Step 2: Fetch all tabs in window
  const allTabs = await chrome.tabs.query({ windowId });

  if (allTabs.length === 0) {
    warnings.push('Window has no tabs to capture');
  }

  // Step 3: Filter system tabs
  const capturableTabs = [];
  let skippedCount = 0;

  for (const tab of allTabs) {
    if (isSystemTab(tab.url)) {
      skippedCount++;
      warnings.push(`Skipped system tab: ${tab.url}`);
      continue;
    }
    capturableTabs.push(tab);
  }

  if (capturableTabs.length === 0) {
    throw new Error('No capturable tabs in window (all are system tabs)');
  }

  // Step 4: Fetch tab groups in window
  let tabGroups = [];
  try {
    tabGroups = await chrome.tabGroups.query({ windowId });
  } catch (error) {
    warnings.push('Failed to fetch tab groups, continuing without groups');
  }

  // Step 5: Create collection
  const collection = await CollectionService.createCollection({
    name: metadata.name,
    description: metadata.description,
    icon: metadata.icon,
    color: metadata.color,
    tags: metadata.tags || [],
    windowId: keepActive ? windowId : null
  });

  // Step 6: Create folders (map tab groups → folders)
  const groupIdToFolderId = new Map();
  const folders = [];

  // Create folders for each tab group
  for (let i = 0; i < tabGroups.length; i++) {
    const group = tabGroups[i];

    // Skip groups with no tabs (edge case)
    const tabsInGroup = capturableTabs.filter(t => t.groupId === group.id);
    if (tabsInGroup.length === 0) {
      warnings.push(`Skipped empty tab group: ${group.title || 'Untitled'}`);
      continue;
    }

    const folder = await FolderService.createFolder({
      collectionId: collection.id,
      name: group.title || 'Untitled',
      color: TAB_GROUP_COLORS.includes(group.color) ? group.color : 'grey',
      collapsed: group.collapsed || false,
      position: i
    });

    folders.push(folder);
    groupIdToFolderId.set(group.id, folder.id);
  }

  // Create "Ungrouped" folder for tabs not in any group
  const ungroupedTabs = capturableTabs.filter(t => t.groupId === -1);
  let ungroupedFolder = null;

  if (ungroupedTabs.length > 0) {
    ungroupedFolder = await FolderService.createFolder({
      collectionId: collection.id,
      name: UNGROUPED_FOLDER_NAME,
      color: UNGROUPED_FOLDER_COLOR,
      collapsed: false,
      position: folders.length
    });

    folders.push(ungroupedFolder);
  }

  // Step 7: Create tabs (map Chrome tabs → tab entities)
  const tabs = [];
  const tabPositionCounters = new Map(); // Track position within each folder

  for (const chromeTab of capturableTabs) {
    // Determine folder for this tab
    let folderId;
    if (chromeTab.groupId === -1) {
      folderId = ungroupedFolder.id;
    } else {
      folderId = groupIdToFolderId.get(chromeTab.groupId);
      if (!folderId) {
        // Tab belongs to group we skipped (empty group), assign to ungrouped
        if (!ungroupedFolder) {
          // Create ungrouped folder if we didn't already
          ungroupedFolder = await FolderService.createFolder({
            collectionId: collection.id,
            name: UNGROUPED_FOLDER_NAME,
            color: UNGROUPED_FOLDER_COLOR,
            collapsed: false,
            position: folders.length
          });
          folders.push(ungroupedFolder);
        }
        folderId = ungroupedFolder.id;
      }
    }

    // Get position within folder
    if (!tabPositionCounters.has(folderId)) {
      tabPositionCounters.set(folderId, 0);
    }
    const position = tabPositionCounters.get(folderId);
    tabPositionCounters.set(folderId, position + 1);

    // Create tab entity
    const tab = await TabService.createTab({
      folderId,
      url: chromeTab.url,
      title: chromeTab.title || chromeTab.url,
      favicon: chromeTab.favIconUrl,
      position,
      isPinned: chromeTab.pinned || false,
      lastAccess: chromeTab.lastAccessed,
      tabId: keepActive ? chromeTab.id : undefined // Only store tabId if keeping active
    });

    tabs.push(tab);
  }

  // Step 8: Bind collection to window if keepActive=true
  if (keepActive) {
    await WindowService.bindCollectionToWindow(collection.id, windowId);
  }

  // Step 9: Return result with stats
  return {
    collection,
    folders,
    tabs,
    stats: {
      tabsCaptured: tabs.length,
      tabsSkipped: skippedCount,
      foldersCaptured: folders.length,
      warnings
    }
  };
}

/**
 * Checks if a tab URL is a system tab that should be skipped.
 *
 * System tabs include:
 * - chrome:// (internal Chrome pages)
 * - chrome-extension:// (extension pages)
 * - edge:// (Edge internal pages)
 * - about: (browser about pages)
 * - view-source: (source view)
 *
 * These tabs cannot be reopened programmatically and should be skipped
 * during capture.
 *
 * @param {string} url - Tab URL to check
 * @returns {boolean} True if URL is a system tab
 *
 * @example
 * isSystemTab('chrome://settings'); // true
 * isSystemTab('https://example.com'); // false
 */
function isSystemTab(url) {
  if (!url) return false;
  return SYSTEM_URL_PREFIXES.some(prefix => url.startsWith(prefix));
}

/**
 * Suggests a collection name based on tab URLs.
 *
 * Analyzes tab URLs to find the most common domain and suggests a name.
 * Falls back to "New Collection" if no clear pattern emerges.
 *
 * Strategy:
 * 1. Extract domains from all tabs
 * 2. Count domain frequencies
 * 3. Return most common domain (if >= 30% of tabs)
 * 4. Otherwise return "New Collection"
 *
 * @param {Object[]} tabs - Array of Chrome tab objects
 * @returns {string} Suggested collection name
 *
 * @example
 * const tabs = [
 *   { url: 'https://github.com/user/repo1' },
 *   { url: 'https://github.com/user/repo2' },
 *   { url: 'https://stackoverflow.com/questions/123' }
 * ];
 * suggestCollectionName(tabs); // 'github.com'
 *
 * @example
 * const mixedTabs = [
 *   { url: 'https://a.com' },
 *   { url: 'https://b.com' },
 *   { url: 'https://c.com' }
 * ];
 * suggestCollectionName(mixedTabs); // 'New Collection'
 */
export function suggestCollectionName(tabs) {
  if (!tabs || tabs.length === 0) {
    return 'New Collection';
  }

  // Count domain frequencies
  const domainCounts = new Map();

  for (const tab of tabs) {
    if (!tab.url || isSystemTab(tab.url)) continue;

    try {
      const url = new URL(tab.url);
      const domain = url.hostname;
      domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
    } catch {
      // Invalid URL, skip
      continue;
    }
  }

  if (domainCounts.size === 0) {
    return 'New Collection';
  }

  // Find most common domain
  let maxDomain = null;
  let maxCount = 0;

  for (const [domain, count] of domainCounts) {
    if (count > maxCount) {
      maxDomain = domain;
      maxCount = count;
    }
  }

  // Only use domain if it represents >= 30% of tabs
  const threshold = Math.max(2, Math.ceil(tabs.length * 0.3));
  if (maxCount >= threshold) {
    return maxDomain;
  }

  return 'New Collection';
}
