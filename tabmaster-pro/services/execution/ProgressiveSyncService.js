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
  getCompleteCollection,
  getFolder,
  saveFolder,
  deleteFolder,
  getTab,
  saveTab,
  deleteTab,
  getFoldersByCollection,
  getTabsByFolder,
  findTabByRuntimeId
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
 * - logBuffer: Ring buffer for recent logs (for debugging)
 */
const state = {
  initialized: false,
  settingsCache: new Map(),
  changeQueue: new Map(),
  flushTimers: new Map(),
  syncMetadata: new Map(),
  logBuffer: []
};

/**
 * Maximum number of log entries to keep in buffer
 */
const MAX_LOG_BUFFER_SIZE = 1000;

/**
 * Logs a message and adds it to the buffer for retrieval
 */
function logAndBuffer(level, message, data) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    data: data || null
  };

  // Add to buffer
  state.logBuffer.push(logEntry);

  // Trim buffer if too large
  if (state.logBuffer.length > MAX_LOG_BUFFER_SIZE) {
    state.logBuffer.shift();
  }

  // Also log to console
  const fullMessage = `[ProgressiveSyncService] ${message}`;
  if (level === 'error') {
    console.error(fullMessage, data || '');
  } else if (level === 'warn') {
    console.warn(fullMessage, data || '');
  } else {
    console.log(fullMessage, data || '');
  }
}

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

    logAndBuffer('info', `Loading settings cache for ${activeCollections.length} active collections`);

    for (const collection of activeCollections) {
      // Ensure default settings exist (backwards compatibility)
      const settings = collection.settings || {
        trackingEnabled: true,
        syncDebounceMs: 2000
      };

      const cacheEntry = {
        ...settings,
        windowId: collection.windowId
      };

      state.settingsCache.set(collection.id, cacheEntry);

      logAndBuffer('info', `Cached settings for collection ${collection.id}:`, cacheEntry);

      // Initialize sync metadata
      state.syncMetadata.set(collection.id, {
        lastSyncTime: Date.now(),
        pendingChanges: 0
      });
    }

    logAndBuffer('info', `Loaded settings for ${activeCollections.length} active collections`);
  } catch (error) {
    logAndBuffer('error', 'Failed to load settings cache:', error);
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
    logAndBuffer('info', `Tab created event fired: ${tab.id} in window ${tab.windowId}`);

    const collectionId = await findCollectionByWindowId(tab.windowId);

    if (!collectionId) {
      return;
    }

    if (!shouldTrack(collectionId)) {
      return;
    }

    logAndBuffer('info', `Queueing TAB_CREATED for tab ${tab.id}`);

    queueChange(collectionId, {
      type: ChangeType.TAB_CREATED,
      tabId: tab.id,
      groupId: tab.groupId,
      data: tab
    });
  } catch (error) {
    logAndBuffer('error', 'handleTabCreated failed:', error);
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

    logAndBuffer('info', `Tab moved: ${tabId}`, {
      fromIndex: moveInfo.fromIndex,
      toIndex: moveInfo.toIndex,
      windowId: moveInfo.windowId,
      collectionId
    });

    queueChange(collectionId, {
      type: ChangeType.TAB_MOVED,
      tabId,
      data: moveInfo
    });
  } catch (error) {
    logAndBuffer('error', 'handleTabMoved failed:', error);
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
    logAndBuffer('info', `Tab updated event fired: ${tabId}`, changeInfo);

    const collectionId = await findCollectionByWindowId(tab.windowId);

    if (!collectionId) {
      return;
    }

    if (!shouldTrack(collectionId)) {
      return;
    }

    // Only track meaningful changes
    if (!changeInfo.url && !changeInfo.title && !changeInfo.favIconUrl && changeInfo.pinned === undefined) {
      return;
    }

    logAndBuffer('info', `Queueing TAB_UPDATED for tab ${tabId}`, changeInfo);

    queueChange(collectionId, {
      type: ChangeType.TAB_UPDATED,
      tabId,
      data: { tabId, changeInfo, tab }
    });
  } catch (error) {
    logAndBuffer('error', 'handleTabUpdated failed:', error);
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

    logAndBuffer('info', `Window removed: ${windowId}, discarding pending changes for collection ${collectionId}`);

    // IMPORTANT: Discard pending changes, don't flush them!
    // When a window closes naturally, we want to preserve the collection's
    // last saved state (from the previous flush), not process tab removals
    // that occurred during the window close sequence.
    //
    // This ensures "close window" = "save collection with current state"
    // rather than "save all the deletions that just happened"
    const pendingCount = state.changeQueue.get(collectionId)?.length || 0;
    if (pendingCount > 0) {
      logAndBuffer('info', `Discarding ${pendingCount} pending changes for ${collectionId}`);
    }

    // Clear the change queue
    state.changeQueue.delete(collectionId);

    // Cancel any pending flush timer
    if (state.flushTimers.has(collectionId)) {
      clearTimeout(state.flushTimers.get(collectionId));
      state.flushTimers.delete(collectionId);
    }

    // Clear settings cache (collection no longer active)
    state.settingsCache.delete(collectionId);
    state.syncMetadata.delete(collectionId);

    logAndBuffer('info', `Collection ${collectionId} untracked (window closed)`);
  } catch (error) {
    logAndBuffer('error', 'handleWindowRemoved failed:', error);
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
    // For TAB_UPDATED, merge changeInfo to preserve all fields (url, title, favicon, etc.)
    if (change.type === ChangeType.TAB_UPDATED && queue[existingIndex].type === ChangeType.TAB_UPDATED) {
      const existing = queue[existingIndex];
      queue[existingIndex] = {
        ...change,
        data: {
          ...change.data,
          changeInfo: {
            ...existing.data.changeInfo, // Preserve previous changes
            ...change.data.changeInfo    // Apply new changes
          }
        }
      };
      logAndBuffer('info', `Merged TAB_UPDATED change in queue for ${collectionId}:`, {
        type: change.type,
        key,
        queueLength: queue.length,
        mergedChangeInfo: queue[existingIndex].data.changeInfo
      });
    } else {
      // For other change types, just replace
      queue[existingIndex] = change;
      logAndBuffer('info', `Replaced change in queue for ${collectionId}:`, {
        type: change.type,
        key,
        queueLength: queue.length
      });
    }
  } else {
    // Add new change
    queue.push(change);
    logAndBuffer('info', `Added change to queue for ${collectionId}:`, {
      type: change.type,
      key,
      queueLength: queue.length
    });
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

  logAndBuffer('info', `Scheduling flush for ${collectionId} in ${debounceMs}ms`);

  // Cancel existing timer
  if (state.flushTimers.has(collectionId)) {
    clearTimeout(state.flushTimers.get(collectionId));
    logAndBuffer('info', `Cancelled existing timer for ${collectionId}`);
  }

  // Schedule new flush
  const timer = setTimeout(() => {
    logAndBuffer('info', `Flush timer fired for ${collectionId}`);
    flush(collectionId).catch(error => {
      logAndBuffer('error', `Scheduled flush failed for ${collectionId}:`, error);
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

    logAndBuffer('info', `Flushing ${queue.length} changes for collection ${collectionId}`);

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

    logAndBuffer('info', `Flushed collection ${collectionId} successfully`);
  } catch (error) {
    logAndBuffer('error', `Flush failed for ${collectionId}:`, error);
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

  logAndBuffer('info', `Processing tab created:`, {
    collectionId,
    tabId,
    groupId,
    url: tab.url,
    title: tab.title
  });

  // Determine folder for tab
  let folderId = null;
  if (groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
    logAndBuffer('info', `Tab is in group ${groupId}, finding/creating folder`);
    const folder = await findOrCreateFolder(collectionId, groupId);
    folderId = folder.id;
    logAndBuffer('info', `Using folder ${folderId}`);
  } else {
    logAndBuffer('info', `Tab is ungrouped (groupId: ${groupId}), saving with folderId: null`);
    // Ungrouped tabs are saved with folderId: null to preserve window-level ordering
    folderId = null;
  }

  // Use Chrome's tab index as position (preserves window-level ordering)
  const position = tab.index;

  // Create tab in IndexedDB
  const tabData = {
    id: crypto.randomUUID(),
    collectionId, // Link tab to collection (required for ungrouped tabs)
    folderId, // Can be null for ungrouped tabs
    url: tab.url,
    title: tab.title,
    favicon: tab.favIconUrl,
    note: undefined,
    position,
    isPinned: tab.pinned,
    tabId: tab.id // Runtime ID for lookups
  };

  logAndBuffer('info', `Saving tab to IndexedDB:`, {
    storageId: tabData.id,
    collectionId: tabData.collectionId,
    folderId: tabData.folderId,
    runtimeTabId: tabData.tabId,
    position: tabData.position
  });

  await saveTab(tabData);
  logAndBuffer('info', `Created tab ${tabId} in collection ${collectionId}`);

  // Update collection metadata counts
  await updateMetadataCounts(collectionId);
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

  // Update collection metadata counts
  await updateMetadataCounts(collectionId);
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

  logAndBuffer('info', `Processing tab update for tab ${tabId}`, {
    changeInfo,
    hasUrl: changeInfo.url !== undefined,
    hasTitle: changeInfo.title !== undefined,
    hasFavIcon: changeInfo.favIconUrl !== undefined
  });

  // Find tab by runtime ID
  const existingTab = await findTabByRuntimeId(tabId);
  if (!existingTab) {
    logAndBuffer('warn', `Tab ${tabId} not found in IndexedDB, cannot update`);
    return;
  }

  logAndBuffer('info', `Found existing tab in IndexedDB`, {
    storageId: existingTab.id,
    currentUrl: existingTab.url,
    newUrl: changeInfo.url
  });

  // Update tab properties
  const updatedTab = {
    ...existingTab,
    url: changeInfo.url !== undefined ? changeInfo.url : existingTab.url,
    title: changeInfo.title !== undefined ? changeInfo.title : existingTab.title,
    favicon: changeInfo.favIconUrl !== undefined ? changeInfo.favIconUrl : existingTab.favicon,
    isPinned: changeInfo.pinned !== undefined ? changeInfo.pinned : existingTab.isPinned
  };

  await saveTab(updatedTab);
  logAndBuffer('info', `Updated tab ${tabId} in collection ${collectionId}`, {
    oldUrl: existingTab.url,
    newUrl: updatedTab.url
  });
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
  const { fromIndex, toIndex } = data;

  // Find tab by runtime ID
  const existingTab = await findTabByRuntimeId(tabId);
  if (!existingTab) {
    logAndBuffer('warn', `Tab ${tabId} not found in collection ${collectionId} for move operation`);
    return;
  }

  // Update tab position
  const updatedTab = {
    ...existingTab,
    position: toIndex
  };

  await saveTab(updatedTab);
  logAndBuffer('info', `Moved tab ${tabId} in collection ${collectionId}`, {
    oldPosition: fromIndex,
    newPosition: toIndex,
    storageId: existingTab.id
  });
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

  // Update collection metadata counts
  await updateMetadataCounts(collectionId);
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

  // Update collection metadata counts
  await updateMetadataCounts(collectionId);
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
 * Updates collection metadata with current tab and folder counts.
 *
 * Queries IndexedDB for actual counts and updates collection metadata.
 * Called after tabs/folders are added or removed.
 *
 * @param {string} collectionId - Collection ID
 * @returns {Promise<void>}
 */
async function updateMetadataCounts(collectionId) {
  try {
    // Get complete collection with all tabs (both grouped and ungrouped)
    const completeCollection = await getCompleteCollection(collectionId);
    if (!completeCollection) {
      console.warn(`[ProgressiveSyncService] Collection ${collectionId} not found for metadata update`);
      return;
    }

    // Count tabs in folders (grouped tabs)
    const groupedTabCount = completeCollection.folders.reduce((sum, folder) => {
      return sum + (folder.tabs?.length || 0);
    }, 0);

    // Count ungrouped tabs
    const ungroupedTabCount = completeCollection.ungroupedTabs?.length || 0;

    // Total tabs = grouped + ungrouped
    const totalTabs = groupedTabCount + ungroupedTabCount;

    // Update metadata
    const collection = await getCollection(collectionId);
    collection.metadata.tabCount = totalTabs;
    collection.metadata.folderCount = completeCollection.folders.length;

    await saveCollection(collection);
    logAndBuffer('info', `Updated metadata counts for ${collectionId}: ${totalTabs} tabs (${groupedTabCount} grouped + ${ungroupedTabCount} ungrouped), ${completeCollection.folders.length} folders`);
  } catch (error) {
    logAndBuffer('error', `Failed to update metadata counts for ${collectionId}:`, error);
  }
}

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
 *
 * @param {string} collectionId - Collection ID
 * @returns {boolean} Whether to track this collection
 */
function shouldTrack(collectionId) {
  const settings = state.settingsCache.get(collectionId);

  // Log the actual settings value for debugging
  if (!settings) {
    logAndBuffer('warn', `shouldTrack(${collectionId}): No settings in cache`, {
      cacheSize: state.settingsCache.size,
      cacheKeys: Array.from(state.settingsCache.keys())
    });
    return false;
  }

  const result = settings.trackingEnabled === true;
  logAndBuffer('info', `shouldTrack(${collectionId}): ${result}`, {
    trackingEnabled: settings.trackingEnabled,
    windowId: settings.windowId
  });

  return result;
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
  logAndBuffer('info', `Created folder for group ${groupId}: ${folderData.name}`);
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
  logAndBuffer('info', `refreshSettings called for collection ${collectionId}`);

  const collection = await getCollection(collectionId);
  if (!collection) {
    logAndBuffer('error', `Collection not found: ${collectionId}`);
    throw new Error(`Collection not found: ${collectionId}`);
  }

  logAndBuffer('info', `Collection found:`, {
    id: collection.id,
    name: collection.name,
    isActive: collection.isActive,
    windowId: collection.windowId,
    settings: collection.settings
  });

  if (collection.isActive) {
    const settings = collection.settings || {
      trackingEnabled: true,
      syncDebounceMs: 2000
    };

    const cacheEntry = {
      ...settings,
      windowId: collection.windowId
    };

    state.settingsCache.set(collectionId, cacheEntry);

    logAndBuffer('info', `Settings cache updated for ${collectionId}:`, cacheEntry);

    // Initialize sync metadata if not exists
    if (!state.syncMetadata.has(collectionId)) {
      state.syncMetadata.set(collectionId, {
        lastSyncTime: Date.now(),
        pendingChanges: 0
      });
    }

    logAndBuffer('info', `Refreshed settings for collection ${collectionId}`);
  } else {
    // Remove from cache if no longer active
    state.settingsCache.delete(collectionId);
    state.syncMetadata.delete(collectionId);
    logAndBuffer('info', `Removed ${collectionId} from cache (not active)`);
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
  logAndBuffer('info', `trackCollection called for ${collectionId}`);
  await refreshSettings(collectionId);
  logAndBuffer('info', `Now tracking collection ${collectionId}`);
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

// ============================================================================
// DIAGNOSTIC/DEBUG METHODS
// ============================================================================

/**
 * Check if service is initialized.
 * @returns {boolean} Whether service is initialized
 */
export function isInitialized() {
  return state.initialized;
}

/**
 * Get current settings cache (for diagnostics).
 * @returns {Object} Settings cache as plain object
 */
export function getSettingsCache() {
  const cache = {};
  for (const [collectionId, settings] of state.settingsCache.entries()) {
    cache[collectionId] = settings;
  }
  return cache;
}

/**
 * Get pending changes queue (for diagnostics).
 * @returns {Object} Pending changes as plain object
 */
export function getPendingChanges() {
  const pending = {};
  for (const [collectionId, changes] of state.changeQueue.entries()) {
    pending[collectionId] = changes;
  }
  return pending;
}

/**
 * Get recent logs from buffer (for diagnostics).
 * @param {number} limit - Maximum number of logs to return (default: all)
 * @returns {Array} Array of log entries
 */
export function getRecentLogs(limit) {
  if (limit && limit > 0) {
    return state.logBuffer.slice(-limit);
  }
  return [...state.logBuffer];
}

/**
 * Clear the log buffer.
 */
export function clearLogs() {
  state.logBuffer = [];
}

/**
 * Refresh settings cache for all active collections.
 * @returns {Promise<void>}
 */
export async function refreshAllSettings() {
  await loadSettingsCache();
}

/**
 * Get comprehensive sync info for a collection (for diagnostics).
 * @param {string} collectionId - Collection ID
 * @returns {Promise<Object>} Diagnostic information
 */
export async function getCollectionSyncInfo(collectionId) {
  const collection = await getCollection(collectionId);
  if (!collection) {
    return {
      error: 'Collection not found',
      collectionId
    };
  }

  // Debug: log what we see
  console.log('[ProgressiveSyncService] getCollectionSyncInfo debug:', {
    collectionId,
    cacheSize: state.settingsCache.size,
    cacheKeys: Array.from(state.settingsCache.keys()),
    hasKey: state.settingsCache.has(collectionId)
  });

  const cachedSettings = state.settingsCache.get(collectionId);
  const syncStatus = getSyncStatus(collectionId);
  const pendingForCollection = state.changeQueue.get(collectionId) || [];

  return {
    collection: {
      id: collection.id,
      name: collection.name,
      windowId: collection.windowId,
      isActive: collection.isActive,
      settings: collection.settings
    },
    cached: cachedSettings || null,
    shouldTrack: shouldTrack(collectionId),
    syncStatus,
    pendingChanges: pendingForCollection,
    hasFlushTimer: state.flushTimers.has(collectionId),
    // Debug info
    debug: {
      cacheSize: state.settingsCache.size,
      cacheKeys: Array.from(state.settingsCache.keys()),
      hasKey: state.settingsCache.has(collectionId),
      idType: typeof collectionId,
      idLength: collectionId.length
    }
  };
}
