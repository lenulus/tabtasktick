/**
 * @file ProgressiveSyncService - Real-time collection synchronization
 *
 * @description
 * ProgressiveSyncService keeps collections in sync with browser state as users work.
 * Instead of only syncing on window close, this service tracks tab and tab group changes
 * in real-time and progressively updates IndexedDB with debounced batch writes.
 *
 * Key features:
 * - Tracks Chrome tab events (created, removed, moved, updated, attached, detached)
 * - Tracks Chrome tab group events (created, updated, removed, moved)
 * - Debounced batch updates (configurable per collection)
 * - Only tracks active collections (isActive=true)
 * - Respects per-collection tracking settings (trackingEnabled, autoSync, syncDebounceMs)
 * - Memory cache for collection settings (avoid repeated IndexedDB lookups)
 * - Immediate flush on critical events (window close, tab group delete)
 * - Handles rapid changes with coalescing
 * - Graceful error handling and recovery
 *
 * Architecture:
 * - Layer: Execution Service
 * - Dependencies: CollectionService, storage-queries.js, Chrome APIs
 * - Used By: background-integrated.js (initialized once on startup)
 * - Storage: IndexedDB (via storage-queries.js)
 *
 * Performance optimizations:
 * - Change queue in memory (batch IndexedDB writes)
 * - Collection settings cache (avoid repeated lookups)
 * - Debounced flush (reduce write frequency)
 * - Only track active collections (skip saved collections)
 *
 * @module services/execution/ProgressiveSyncService
 *
 * @example
 * // Initialize in background script
 * import * as ProgressiveSyncService from './services/execution/ProgressiveSyncService.js';
 *
 * await ProgressiveSyncService.initialize();
 *
 * @example
 * // Manually flush pending changes
 * await ProgressiveSyncService.flush();
 *
 * @example
 * // Get sync status for collection
 * const status = await ProgressiveSyncService.getSyncStatus('col_123');
 * console.log(status.lastSyncTime);
 * console.log(status.pendingChanges);
 */

import {
  getCollection,
  saveCollection,
  getCollectionsByIndex,
  getFolder,
  saveFolder,
  deleteFolder,
  getTab,
  saveTab,
  deleteTab,
  getFoldersByCollection,
  getTabsByFolder
} from '../utils/storage-queries.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Service state
 * - initialized: Whether service has been initialized
 * - settingsCache: Map of collectionId → settings (avoid repeated DB lookups)
 * - changeQueue: Map of collectionId → pending changes
 * - flushTimers: Map of collectionId → debounce timer
 * - syncMetadata: Map of collectionId → sync metadata (lastSyncTime, pendingCount)
 */
const state = {
  initialized: false,
  settingsCache: new Map(),
  changeQueue: new Map(),
  flushTimers: new Map(),
  syncMetadata: new Map()
};

/**
 * Change types for queue
 */
const ChangeType = {
  TAB_CREATED: 'tab_created',
  TAB_REMOVED: 'tab_removed',
  TAB_UPDATED: 'tab_updated',
  TAB_MOVED: 'tab_moved',
  FOLDER_CREATED: 'folder_created',
  FOLDER_UPDATED: 'folder_updated',
  FOLDER_REMOVED: 'folder_removed',
  FOLDER_MOVED: 'folder_moved'
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initializes the progressive sync service.
 *
 * Sets up Chrome event listeners and loads settings cache for active collections.
 * Should be called once on service worker startup.
 *
 * Steps:
 * 1. Check if already initialized (idempotent)
 * 2. Load settings cache for all active collections
 * 3. Register Chrome event listeners
 * 4. Mark as initialized
 *
 * @returns {Promise<void>}
 *
 * @throws {Error} If initialization fails
 *
 * @example
 * // In background-integrated.js
 * import * as ProgressiveSyncService from './services/execution/ProgressiveSyncService.js';
 *
 * await ProgressiveSyncService.initialize();
 */
export async function initialize() {
  if (state.initialized) {
    console.log('[ProgressiveSyncService] Already initialized');
    return;
  }

  try {
    console.log('[ProgressiveSyncService] Initializing...');

    // Load settings cache for active collections
    await loadSettingsCache();

    // Register Chrome event listeners
    registerEventListeners();

    state.initialized = true;
    console.log('[ProgressiveSyncService] Initialized successfully');
  } catch (error) {
    console.error('[ProgressiveSyncService] Initialization failed:', error);
    throw error;
  }
}

/**
 * Loads settings cache for all active collections.
 *
 * Queries IndexedDB for active collections and caches their settings in memory.
 * This avoids repeated lookups on every Chrome event.
 *
 * @returns {Promise<void>}
 */
async function loadSettingsCache() {
  try {
    const activeCollections = await getCollectionsByIndex('isActive', true);

    for (const collection of activeCollections) {
      // Ensure default settings exist (backwards compatibility)
      const settings = collection.settings || {
        trackingEnabled: true,
        autoSync: true,
        syncDebounceMs: 2000
      };

      state.settingsCache.set(collection.id, {
        ...settings,
        windowId: collection.windowId
      });

      // Initialize sync metadata
      state.syncMetadata.set(collection.id, {
        lastSyncTime: Date.now(),
        pendingChanges: 0
      });
    }

    console.log(`[ProgressiveSyncService] Loaded settings for ${activeCollections.length} active collections`);
  } catch (error) {
    console.error('[ProgressiveSyncService] Failed to load settings cache:', error);
    throw error;
  }
}

/**
 * Registers Chrome event listeners for tabs and tab groups.
 *
 * Listeners are idempotent - safe to call multiple times.
 */
function registerEventListeners() {
  // Tab events
  chrome.tabs.onCreated.addListener(handleTabCreated);
  chrome.tabs.onRemoved.addListener(handleTabRemoved);
  chrome.tabs.onMoved.addListener(handleTabMoved);
  chrome.tabs.onUpdated.addListener(handleTabUpdated);
  chrome.tabs.onAttached.addListener(handleTabAttached);
  chrome.tabs.onDetached.addListener(handleTabDetached);

  // Tab group events
  chrome.tabGroups.onCreated.addListener(handleTabGroupCreated);
  chrome.tabGroups.onUpdated.addListener(handleTabGroupUpdated);
  chrome.tabGroups.onRemoved.addListener(handleTabGroupRemoved);
  chrome.tabGroups.onMoved.addListener(handleTabGroupMoved);

  // Window events (for cleanup)
  chrome.windows.onRemoved.addListener(handleWindowRemoved);

  console.log('[ProgressiveSyncService] Event listeners registered');
}

// ============================================================================
// CHROME EVENT HANDLERS - TABS
// ============================================================================

/**
 * Handles tab created event.
 *
 * When a tab is created in a tracked window:
 * 1. Find collection for window
 * 2. Determine folder (tab group) for tab
 * 3. Queue tab creation change
 *
 * @param {chrome.tabs.Tab} tab - Created tab
 */
async function handleTabCreated(tab) {
  try {
    const collectionId = await findCollectionByWindowId(tab.windowId);
    if (!collectionId || !shouldTrack(collectionId)) {
      return;
    }

    console.log(`[ProgressiveSyncService] Tab created: ${tab.id} in window ${tab.windowId}`);

    queueChange(collectionId, {
      type: ChangeType.TAB_CREATED,
      tabId: tab.id,
      groupId: tab.groupId,
      data: tab
    });
  } catch (error) {
    console.error('[ProgressiveSyncService] handleTabCreated failed:', error);
  }
}

/**
 * Handles tab removed event.
 *
 * When a tab is closed in a tracked window:
 * 1. Find collection for window
 * 2. Queue tab removal change
 *
 * @param {number} tabId - Removed tab ID
 * @param {Object} removeInfo - Remove info (windowId, isWindowClosing)
 */
async function handleTabRemoved(tabId, removeInfo) {
  try {
    // Skip if entire window is closing (handled by window close)
    if (removeInfo.isWindowClosing) {
      return;
    }

    const collectionId = await findCollectionByWindowId(removeInfo.windowId);
    if (!collectionId || !shouldTrack(collectionId)) {
      return;
    }

    console.log(`[ProgressiveSyncService] Tab removed: ${tabId}`);

    queueChange(collectionId, {
      type: ChangeType.TAB_REMOVED,
      tabId,
      data: { tabId }
    });
  } catch (error) {
    console.error('[ProgressiveSyncService] handleTabRemoved failed:', error);
  }
}

/**
 * Handles tab moved event.
 *
 * When a tab is reordered within a window:
 * 1. Find collection for window
 * 2. Queue tab move change
 *
 * @param {number} tabId - Moved tab ID
 * @param {Object} moveInfo - Move info (windowId, fromIndex, toIndex)
 */
async function handleTabMoved(tabId, moveInfo) {
  try {
    const collectionId = await findCollectionByWindowId(moveInfo.windowId);
    if (!collectionId || !shouldTrack(collectionId)) {
      return;
    }

    console.log(`[ProgressiveSyncService] Tab moved: ${tabId} from ${moveInfo.fromIndex} to ${moveInfo.toIndex}`);

    queueChange(collectionId, {
      type: ChangeType.TAB_MOVED,
      tabId,
      data: moveInfo
    });
  } catch (error) {
    console.error('[ProgressiveSyncService] handleTabMoved failed:', error);
  }
}

/**
 * Handles tab updated event.
 *
 * When a tab's properties change (URL, title, favicon, pinned):
 * 1. Find collection for window
 * 2. Queue tab update change
 *
 * @param {number} tabId - Updated tab ID
 * @param {Object} changeInfo - Change info (status, url, title, favIconUrl, pinned)
 * @param {chrome.tabs.Tab} tab - Updated tab object
 */
async function handleTabUpdated(tabId, changeInfo, tab) {
  try {
    const collectionId = await findCollectionByWindowId(tab.windowId);
    if (!collectionId || !shouldTrack(collectionId)) {
      return;
    }

    // Only track meaningful changes
    if (!changeInfo.url && !changeInfo.title && !changeInfo.favIconUrl && changeInfo.pinned === undefined) {
      return;
    }

    console.log(`[ProgressiveSyncService] Tab updated: ${tabId}`, changeInfo);

    queueChange(collectionId, {
      type: ChangeType.TAB_UPDATED,
      tabId,
      data: { tabId, changeInfo, tab }
    });
  } catch (error) {
    console.error('[ProgressiveSyncService] handleTabUpdated failed:', error);
  }
}

/**
 * Handles tab attached event.
 *
 * When a tab is moved to a different window:
 * 1. Find collection for new window
 * 2. Queue tab creation in new collection
 *
 * @param {number} tabId - Attached tab ID
 * @param {Object} attachInfo - Attach info (newWindowId, newPosition)
 */
async function handleTabAttached(tabId, attachInfo) {
  try {
    const collectionId = await findCollectionByWindowId(attachInfo.newWindowId);
    if (!collectionId || !shouldTrack(collectionId)) {
      return;
    }

    console.log(`[ProgressiveSyncService] Tab attached: ${tabId} to window ${attachInfo.newWindowId}`);

    // Get full tab info
    const tab = await chrome.tabs.get(tabId);

    queueChange(collectionId, {
      type: ChangeType.TAB_CREATED,
      tabId,
      groupId: tab.groupId,
      data: tab
    });
  } catch (error) {
    console.error('[ProgressiveSyncService] handleTabAttached failed:', error);
  }
}

/**
 * Handles tab detached event.
 *
 * When a tab is moved out of a tracked window:
 * 1. Find collection for old window
 * 2. Queue tab removal from collection
 *
 * @param {number} tabId - Detached tab ID
 * @param {Object} detachInfo - Detach info (oldWindowId, oldPosition)
 */
async function handleTabDetached(tabId, detachInfo) {
  try {
    const collectionId = await findCollectionByWindowId(detachInfo.oldWindowId);
    if (!collectionId || !shouldTrack(collectionId)) {
      return;
    }

    console.log(`[ProgressiveSyncService] Tab detached: ${tabId} from window ${detachInfo.oldWindowId}`);

    queueChange(collectionId, {
      type: ChangeType.TAB_REMOVED,
      tabId,
      data: { tabId }
    });
  } catch (error) {
    console.error('[ProgressiveSyncService] handleTabDetached failed:', error);
  }
}

// ============================================================================
// CHROME EVENT HANDLERS - TAB GROUPS
// ============================================================================

/**
 * Handles tab group created event.
 *
 * When a tab group is created in a tracked window:
 * 1. Find collection for window
 * 2. Queue folder creation change
 *
 * @param {chrome.tabGroups.TabGroup} group - Created tab group
 */
async function handleTabGroupCreated(group) {
  try {
    const collectionId = await findCollectionByWindowId(group.windowId);
    if (!collectionId || !shouldTrack(collectionId)) {
      return;
    }

    console.log(`[ProgressiveSyncService] Tab group created: ${group.id} in window ${group.windowId}`);

    queueChange(collectionId, {
      type: ChangeType.FOLDER_CREATED,
      groupId: group.id,
      data: group
    });
  } catch (error) {
    console.error('[ProgressiveSyncService] handleTabGroupCreated failed:', error);
  }
}

/**
 * Handles tab group updated event.
 *
 * When a tab group's properties change (name, color, collapsed):
 * 1. Find collection for window
 * 2. Queue folder update change
 *
 * @param {chrome.tabGroups.TabGroup} group - Updated tab group
 */
async function handleTabGroupUpdated(group) {
  try {
    const collectionId = await findCollectionByWindowId(group.windowId);
    if (!collectionId || !shouldTrack(collectionId)) {
      return;
    }

    console.log(`[ProgressiveSyncService] Tab group updated: ${group.id}`);

    queueChange(collectionId, {
      type: ChangeType.FOLDER_UPDATED,
      groupId: group.id,
      data: group
    });
  } catch (error) {
    console.error('[ProgressiveSyncService] handleTabGroupUpdated failed:', error);
  }
}

/**
 * Handles tab group removed event.
 *
 * When a tab group is ungrouped in a tracked window:
 * 1. Find collection for window
 * 2. Queue folder removal change
 * 3. Flush immediately (critical change)
 *
 * @param {chrome.tabGroups.TabGroup} group - Removed tab group
 */
async function handleTabGroupRemoved(group) {
  try {
    const collectionId = await findCollectionByWindowId(group.windowId);
    if (!collectionId || !shouldTrack(collectionId)) {
      return;
    }

    console.log(`[ProgressiveSyncService] Tab group removed: ${group.id}`);

    queueChange(collectionId, {
      type: ChangeType.FOLDER_REMOVED,
      groupId: group.id,
      data: group
    });

    // Flush immediately for critical changes
    await flush(collectionId);
  } catch (error) {
    console.error('[ProgressiveSyncService] handleTabGroupRemoved failed:', error);
  }
}

/**
 * Handles tab group moved event.
 *
 * When a tab group is reordered within a window:
 * 1. Find collection for window
 * 2. Queue folder move change
 *
 * @param {chrome.tabGroups.TabGroup} group - Moved tab group
 */
async function handleTabGroupMoved(group) {
  try {
    const collectionId = await findCollectionByWindowId(group.windowId);
    if (!collectionId || !shouldTrack(collectionId)) {
      return;
    }

    console.log(`[ProgressiveSyncService] Tab group moved: ${group.id}`);

    queueChange(collectionId, {
      type: ChangeType.FOLDER_MOVED,
      groupId: group.id,
      data: group
    });
  } catch (error) {
    console.error('[ProgressiveSyncService] handleTabGroupMoved failed:', error);
  }
}

// ============================================================================
// CHROME EVENT HANDLERS - WINDOWS
// ============================================================================

/**
 * Handles window removed event.
 *
 * When a window is closed:
 * 1. Find collection for window
 * 2. Flush all pending changes immediately
 * 3. Unbind collection from window (handled by WindowService via background)
 * 4. Clear settings cache
 *
 * @param {number} windowId - Removed window ID
 */
async function handleWindowRemoved(windowId) {
  try {
    const collectionId = await findCollectionByWindowId(windowId);
    if (!collectionId) {
      return;
    }

    console.log(`[ProgressiveSyncService] Window removed: ${windowId}, flushing collection ${collectionId}`);

    // Flush all pending changes immediately
    await flush(collectionId);

    // Clear settings cache (collection no longer active)
    state.settingsCache.delete(collectionId);
    state.syncMetadata.delete(collectionId);

    console.log(`[ProgressiveSyncService] Collection ${collectionId} untracked (window closed)`);
  } catch (error) {
    console.error('[ProgressiveSyncService] handleWindowRemoved failed:', error);
  }
}

// ============================================================================
// CHANGE QUEUE MANAGEMENT
// ============================================================================

/**
 * Queues a change for later batch processing.
 *
 * Coalesces changes:
 * - Multiple updates to same tab → keep only latest
 * - Multiple moves of same tab → keep only latest position
 *
 * Schedules flush after debounce delay.
 *
 * @param {string} collectionId - Collection ID
 * @param {Object} change - Change object
 */
function queueChange(collectionId, change) {
  // Get or create queue for collection
  if (!state.changeQueue.has(collectionId)) {
    state.changeQueue.set(collectionId, []);
  }

  const queue = state.changeQueue.get(collectionId);

  // Coalesce changes (remove duplicates for same entity)
  const key = change.tabId ? `tab_${change.tabId}` : `folder_${change.groupId}`;
  const existingIndex = queue.findIndex(c => {
    const cKey = c.tabId ? `tab_${c.tabId}` : `folder_${c.groupId}`;
    return cKey === key && c.type === change.type;
  });

  if (existingIndex >= 0) {
    // Replace existing change (keep latest)
    queue[existingIndex] = change;
  } else {
    // Add new change
    queue.push(change);
  }

  // Update sync metadata
  const metadata = state.syncMetadata.get(collectionId) || { lastSyncTime: 0, pendingChanges: 0 };
  metadata.pendingChanges = queue.length;
  state.syncMetadata.set(collectionId, metadata);

  // Schedule flush
  scheduleFlush(collectionId);
}

/**
 * Schedules a debounced flush for a collection.
 *
 * Cancels existing timer and creates new one with collection's debounce delay.
 *
 * @param {string} collectionId - Collection ID
 */
function scheduleFlush(collectionId) {
  // Get debounce delay from settings cache
  const settings = state.settingsCache.get(collectionId);
  const debounceMs = settings?.syncDebounceMs || 2000;

  // Cancel existing timer
  if (state.flushTimers.has(collectionId)) {
    clearTimeout(state.flushTimers.get(collectionId));
  }

  // Schedule new flush
  const timer = setTimeout(() => {
    flush(collectionId).catch(error => {
      console.error(`[ProgressiveSyncService] Scheduled flush failed for ${collectionId}:`, error);
    });
  }, debounceMs);

  state.flushTimers.set(collectionId, timer);
}

/**
 * Flushes pending changes for a collection to IndexedDB.
 *
 * Processes all queued changes in a single batch:
 * 1. Get queued changes
 * 2. Process each change type
 * 3. Update IndexedDB
 * 4. Clear queue
 * 5. Update sync metadata
 *
 * @param {string} collectionId - Collection ID to flush (optional, flushes all if omitted)
 * @returns {Promise<void>}
 */
export async function flush(collectionId) {
  try {
    // If no collectionId, flush all
    if (!collectionId) {
      const allCollections = Array.from(state.changeQueue.keys());
      await Promise.all(allCollections.map(id => flush(id)));
      return;
    }

    const queue = state.changeQueue.get(collectionId);
    if (!queue || queue.length === 0) {
      return;
    }

    console.log(`[ProgressiveSyncService] Flushing ${queue.length} changes for collection ${collectionId}`);

    // Cancel flush timer
    if (state.flushTimers.has(collectionId)) {
      clearTimeout(state.flushTimers.get(collectionId));
      state.flushTimers.delete(collectionId);
    }

    // Process changes
    await processChanges(collectionId, queue);

    // Clear queue
    state.changeQueue.delete(collectionId);

    // Update sync metadata
    const metadata = state.syncMetadata.get(collectionId) || { lastSyncTime: 0, pendingChanges: 0 };
    metadata.lastSyncTime = Date.now();
    metadata.pendingChanges = 0;
    state.syncMetadata.set(collectionId, metadata);

    console.log(`[ProgressiveSyncService] Flushed collection ${collectionId} successfully`);
  } catch (error) {
    console.error(`[ProgressiveSyncService] Flush failed for ${collectionId}:`, error);
    throw error;
  }
}

/**
 * Processes queued changes and updates IndexedDB.
 *
 * Handles each change type:
 * - TAB_CREATED: Create tab in folder
 * - TAB_REMOVED: Delete tab
 * - TAB_UPDATED: Update tab properties
 * - TAB_MOVED: Update tab position
 * - FOLDER_CREATED: Create folder
 * - FOLDER_UPDATED: Update folder properties
 * - FOLDER_REMOVED: Delete folder
 * - FOLDER_MOVED: Update folder position
 *
 * @param {string} collectionId - Collection ID
 * @param {Array} changes - Array of change objects
 * @returns {Promise<void>}
 */
async function processChanges(collectionId, changes) {
  for (const change of changes) {
    try {
      switch (change.type) {
        case ChangeType.TAB_CREATED:
          await processTabCreated(collectionId, change);
          break;
        case ChangeType.TAB_REMOVED:
          await processTabRemoved(collectionId, change);
          break;
        case ChangeType.TAB_UPDATED:
          await processTabUpdated(collectionId, change);
          break;
        case ChangeType.TAB_MOVED:
          await processTabMoved(collectionId, change);
          break;
        case ChangeType.FOLDER_CREATED:
          await processFolderCreated(collectionId, change);
          break;
        case ChangeType.FOLDER_UPDATED:
          await processFolderUpdated(collectionId, change);
          break;
        case ChangeType.FOLDER_REMOVED:
          await processFolderRemoved(collectionId, change);
          break;
        case ChangeType.FOLDER_MOVED:
          await processFolderMoved(collectionId, change);
          break;
        default:
          console.warn(`[ProgressiveSyncService] Unknown change type: ${change.type}`);
      }
    } catch (error) {
      console.error(`[ProgressiveSyncService] Failed to process change:`, change, error);
      // Continue processing other changes
    }
  }
}

// ============================================================================
// CHANGE PROCESSORS - TABS
// ============================================================================

/**
 * Processes tab created change.
 *
 * Creates new tab in appropriate folder (or ungrouped).
 *
 * @param {string} collectionId - Collection ID
 * @param {Object} change - Change object
 */
async function processTabCreated(collectionId, change) {
  const { tabId, groupId, data: tab } = change;

  // Find or create folder for tab
  let folderId = null;
  if (groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
    const folder = await findOrCreateFolder(collectionId, groupId);
    folderId = folder.id;
  }

  // Get tab position
  const position = tab.index;

  // Create tab in IndexedDB
  const tabData = {
    id: crypto.randomUUID(),
    folderId,
    url: tab.url,
    title: tab.title,
    favicon: tab.favIconUrl,
    note: undefined,
    position,
    isPinned: tab.pinned,
    tabId: tab.id // Runtime ID for lookups
  };

  await saveTab(tabData);
  console.log(`[ProgressiveSyncService] Created tab ${tabId} in collection ${collectionId}`);
}

/**
 * Processes tab removed change.
 *
 * Deletes tab from IndexedDB.
 *
 * @param {string} collectionId - Collection ID
 * @param {Object} change - Change object
 */
async function processTabRemoved(collectionId, change) {
  const { tabId } = change;

  // Find tab by runtime ID
  const tab = await findTabByRuntimeId(tabId);
  if (!tab) {
    console.warn(`[ProgressiveSyncService] Tab ${tabId} not found in collection ${collectionId}`);
    return;
  }

  // Delete tab
  await deleteTab(tab.id);
  console.log(`[ProgressiveSyncService] Deleted tab ${tabId} from collection ${collectionId}`);
}

/**
 * Processes tab updated change.
 *
 * Updates tab properties (URL, title, favicon, pinned).
 *
 * @param {string} collectionId - Collection ID
 * @param {Object} change - Change object
 */
async function processTabUpdated(collectionId, change) {
  const { tabId, data } = change;
  const { changeInfo, tab } = data;

  // Find tab by runtime ID
  const existingTab = await findTabByRuntimeId(tabId);
  if (!existingTab) {
    console.warn(`[ProgressiveSyncService] Tab ${tabId} not found in collection ${collectionId}`);
    return;
  }

  // Update tab properties
  const updatedTab = {
    ...existingTab,
    url: changeInfo.url !== undefined ? changeInfo.url : existingTab.url,
    title: changeInfo.title !== undefined ? changeInfo.title : existingTab.title,
    favicon: changeInfo.favIconUrl !== undefined ? changeInfo.favIconUrl : existingTab.favicon,
    isPinned: changeInfo.pinned !== undefined ? changeInfo.pinned : existingTab.isPinned
  };

  await saveTab(updatedTab);
  console.log(`[ProgressiveSyncService] Updated tab ${tabId} in collection ${collectionId}`);
}

/**
 * Processes tab moved change.
 *
 * Updates tab position within folder.
 *
 * @param {string} collectionId - Collection ID
 * @param {Object} change - Change object
 */
async function processTabMoved(collectionId, change) {
  const { tabId, data } = change;
  const { toIndex } = data;

  // Find tab by runtime ID
  const existingTab = await findTabByRuntimeId(tabId);
  if (!existingTab) {
    console.warn(`[ProgressiveSyncService] Tab ${tabId} not found in collection ${collectionId}`);
    return;
  }

  // Update tab position
  const updatedTab = {
    ...existingTab,
    position: toIndex
  };

  await saveTab(updatedTab);
  console.log(`[ProgressiveSyncService] Moved tab ${tabId} to position ${toIndex} in collection ${collectionId}`);
}

// ============================================================================
// CHANGE PROCESSORS - FOLDERS
// ============================================================================

/**
 * Processes folder created change.
 *
 * Creates new folder for tab group.
 *
 * @param {string} collectionId - Collection ID
 * @param {Object} change - Change object
 */
async function processFolderCreated(collectionId, change) {
  const { groupId, data: group } = change;

  // Create folder in IndexedDB
  const folderData = {
    id: crypto.randomUUID(),
    collectionId,
    name: group.title || 'Untitled Group',
    color: group.color,
    collapsed: group.collapsed,
    position: 0, // Will be updated when tabs are added
    groupId: group.id // Runtime ID for lookups
  };

  await saveFolder(folderData);
  console.log(`[ProgressiveSyncService] Created folder for group ${groupId} in collection ${collectionId}`);
}

/**
 * Processes folder updated change.
 *
 * Updates folder properties (name, color, collapsed).
 *
 * @param {string} collectionId - Collection ID
 * @param {Object} change - Change object
 */
async function processFolderUpdated(collectionId, change) {
  const { groupId, data: group } = change;

  // Find folder by group ID
  const folder = await findFolderByGroupId(collectionId, groupId);
  if (!folder) {
    console.warn(`[ProgressiveSyncService] Folder for group ${groupId} not found in collection ${collectionId}`);
    return;
  }

  // Update folder properties
  const updatedFolder = {
    ...folder,
    name: group.title || folder.name,
    color: group.color,
    collapsed: group.collapsed
  };

  await saveFolder(updatedFolder);
  console.log(`[ProgressiveSyncService] Updated folder for group ${groupId} in collection ${collectionId}`);
}

/**
 * Processes folder removed change.
 *
 * Deletes folder and moves tabs to ungrouped.
 *
 * @param {string} collectionId - Collection ID
 * @param {Object} change - Change object
 */
async function processFolderRemoved(collectionId, change) {
  const { groupId } = change;

  // Find folder by group ID
  const folder = await findFolderByGroupId(collectionId, groupId);
  if (!folder) {
    console.warn(`[ProgressiveSyncService] Folder for group ${groupId} not found in collection ${collectionId}`);
    return;
  }

  // Move all tabs in folder to ungrouped (folderId = null)
  const tabs = await getTabsByFolder(folder.id);
  for (const tab of tabs) {
    const updatedTab = {
      ...tab,
      folderId: null
    };
    await saveTab(updatedTab);
  }

  // Delete folder
  await deleteFolder(folder.id);
  console.log(`[ProgressiveSyncService] Deleted folder for group ${groupId} from collection ${collectionId}`);
}

/**
 * Processes folder moved change.
 *
 * Updates folder position.
 *
 * @param {string} collectionId - Collection ID
 * @param {Object} change - Change object
 */
async function processFolderMoved(collectionId, change) {
  const { groupId, data: group } = change;

  // Find folder by group ID
  const folder = await findFolderByGroupId(collectionId, groupId);
  if (!folder) {
    console.warn(`[ProgressiveSyncService] Folder for group ${groupId} not found in collection ${collectionId}`);
    return;
  }

  // Update folder position (derived from first tab in group)
  // Position calculation is complex, defer to next full sync
  console.log(`[ProgressiveSyncService] Folder moved for group ${groupId} in collection ${collectionId} (position update deferred)`);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Finds collection ID by window ID.
 *
 * Checks settings cache first (fast), falls back to IndexedDB query.
 *
 * @param {number} windowId - Chrome window ID
 * @returns {Promise<string|null>} Collection ID or null
 */
async function findCollectionByWindowId(windowId) {
  // Check settings cache first
  for (const [collectionId, settings] of state.settingsCache.entries()) {
    if (settings.windowId === windowId) {
      return collectionId;
    }
  }

  // Fallback to IndexedDB query
  const activeCollections = await getCollectionsByIndex('isActive', true);
  const collection = activeCollections.find(c => c.windowId === windowId);
  return collection ? collection.id : null;
}

/**
 * Checks if a collection should be tracked.
 *
 * Returns true if:
 * - Collection exists in settings cache
 * - trackingEnabled is true
 * - autoSync is true
 *
 * @param {string} collectionId - Collection ID
 * @returns {boolean} Whether to track this collection
 */
function shouldTrack(collectionId) {
  const settings = state.settingsCache.get(collectionId);
  if (!settings) {
    return false;
  }

  return settings.trackingEnabled && settings.autoSync;
}

/**
 * Finds or creates a folder for a tab group.
 *
 * @param {string} collectionId - Collection ID
 * @param {number} groupId - Chrome tab group ID
 * @returns {Promise<Object>} Folder object
 */
async function findOrCreateFolder(collectionId, groupId) {
  // Try to find existing folder
  const folder = await findFolderByGroupId(collectionId, groupId);
  if (folder) {
    return folder;
  }

  // Create new folder
  const group = await chrome.tabGroups.get(groupId);
  const folderData = {
    id: crypto.randomUUID(),
    collectionId,
    name: group.title || 'Untitled Group',
    color: group.color,
    collapsed: group.collapsed,
    position: 0,
    groupId: group.id
  };

  await saveFolder(folderData);
  return folderData;
}

/**
 * Finds folder by Chrome tab group ID.
 *
 * @param {string} collectionId - Collection ID
 * @param {number} groupId - Chrome tab group ID
 * @returns {Promise<Object|null>} Folder or null
 */
async function findFolderByGroupId(collectionId, groupId) {
  const folders = await getFoldersByCollection(collectionId);
  return folders.find(f => f.groupId === groupId) || null;
}

/**
 * Finds tab by Chrome tab ID (runtime ID).
 *
 * This is a linear search across all tabs - not optimized.
 * Consider adding an index on tabId if performance becomes an issue.
 *
 * @param {number} chromeTabId - Chrome tab ID
 * @returns {Promise<Object|null>} Tab or null
 */
async function findTabByRuntimeId(chromeTabId) {
  // Import from storage-queries.js
  const { findTabByRuntimeId: findTab } = await import('../utils/storage-queries.js');
  return await findTab(chromeTabId);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Gets sync status for a collection.
 *
 * Returns:
 * - lastSyncTime: Timestamp of last flush
 * - pendingChanges: Number of queued changes
 *
 * @param {string} collectionId - Collection ID
 * @returns {Object} Sync status
 */
export function getSyncStatus(collectionId) {
  const metadata = state.syncMetadata.get(collectionId);
  if (!metadata) {
    return {
      lastSyncTime: null,
      pendingChanges: 0
    };
  }

  return {
    lastSyncTime: metadata.lastSyncTime,
    pendingChanges: metadata.pendingChanges
  };
}

/**
 * Refreshes settings cache for a collection.
 *
 * Called when collection settings are updated via UI.
 *
 * @param {string} collectionId - Collection ID
 * @returns {Promise<void>}
 */
export async function refreshSettings(collectionId) {
  const collection = await getCollection(collectionId);
  if (!collection) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  if (collection.isActive) {
    const settings = collection.settings || {
      trackingEnabled: true,
      autoSync: true,
      syncDebounceMs: 2000
    };

    state.settingsCache.set(collectionId, {
      ...settings,
      windowId: collection.windowId
    });

    console.log(`[ProgressiveSyncService] Refreshed settings for collection ${collectionId}`);
  } else {
    // Remove from cache if no longer active
    state.settingsCache.delete(collectionId);
    state.syncMetadata.delete(collectionId);
  }
}

/**
 * Adds a new active collection to tracking.
 *
 * Called when a collection is activated (bound to window).
 *
 * @param {string} collectionId - Collection ID
 * @returns {Promise<void>}
 */
export async function trackCollection(collectionId) {
  await refreshSettings(collectionId);
  console.log(`[ProgressiveSyncService] Now tracking collection ${collectionId}`);
}

/**
 * Removes a collection from tracking.
 *
 * Called when a collection is deactivated (unbound from window).
 *
 * @param {string} collectionId - Collection ID
 * @returns {Promise<void>}
 */
export async function untrackCollection(collectionId) {
  // Flush pending changes
  await flush(collectionId);

  // Remove from cache
  state.settingsCache.delete(collectionId);
  state.syncMetadata.delete(collectionId);

  console.log(`[ProgressiveSyncService] Stopped tracking collection ${collectionId}`);
}
