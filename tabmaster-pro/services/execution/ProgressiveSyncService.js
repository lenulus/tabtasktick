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
import * as WindowService from './WindowService.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Service state
 * - initialized: Whether service has been initialized
 * - listenersRegistered: Whether Chrome event listeners have been registered (prevents duplicates)
 * - settingsCache: Map of collectionId → settings (avoid repeated DB lookups)
 * - changeQueue: Map of collectionId → pending changes
 * - flushTimers: Map of collectionId → debounce timer
 * - syncMetadata: Map of collectionId → sync metadata (lastSyncTime, pendingCount)
 * - logBuffer: Ring buffer for recent logs (for debugging)
 */
const state = {
  initialized: false,
  listenersRegistered: false,
  settingsCache: new Map(),
  changeQueue: new Map(),
  flushTimers: new Map(),
  syncMetadata: new Map(),
  logBuffer: []
};

/**
 * Tracks ongoing initialization to prevent race conditions.
 * When multiple event handlers fire during service worker restart,
 * they all need initialization but should not trigger duplicate init.
 * This promise ensures only one initialization runs at a time.
 */
let initializationPromise = null;

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

    // Register Chrome event listeners (idempotent - safe to call multiple times)
    // NOTE: In Manifest V3, listeners should be registered at module top level
    // for automatic re-registration on service worker restart. However, we keep
    // this call here for backwards compatibility and explicit initialization.
    registerEventListeners();

    state.initialized = true;
    console.log('[ProgressiveSyncService] Initialized successfully');
  } catch (error) {
    console.error('[ProgressiveSyncService] Initialization failed:', error);
    throw error;
  }
}

/**
 * Ensures the service is initialized (lazy initialization with race condition protection).
 *
 * SERVICE WORKER RESTART PROBLEM:
 * Service workers can restart at any time, losing all in-memory state (cache, queues, flags).
 * When this happens, multiple Chrome events may fire simultaneously, all needing initialization.
 *
 * RACE CONDITION WITHOUT SYNCHRONIZATION:
 * 1. Event A fires → sees empty cache → starts initialize()
 * 2. Event B fires (while A is initializing) → ALSO sees empty cache → starts ANOTHER initialize()
 * 3. Result: Duplicate initialization, wasted work, potential data corruption
 *
 * SOLUTION:
 * Use a shared Promise (initializationPromise) to coordinate multiple callers.
 * - First caller starts initialization and stores the Promise
 * - Subsequent callers wait for the same Promise (no duplicate work)
 * - After completion, Promise is cleared for next restart cycle
 *
 * This pattern is necessary because:
 * - JavaScript is single-threaded but async (events interleave)
 * - We can't use locks/mutexes (not available in JavaScript)
 * - Promise coordination is the idiomatic way to prevent async race conditions
 *
 * @returns {Promise<void>}
 */
async function ensureInitialized() {
  // Fast path: Already initialized with populated cache
  if (state.initialized && state.settingsCache.size > 0) {
    return;
  }

  // If initialization is already in progress, wait for it
  if (initializationPromise) {
    logAndBuffer('info', 'Initialization already in progress, waiting...');
    return initializationPromise;
  }

  // Start initialization (this is the first caller)
  logAndBuffer('warn', 'Settings cache is empty, reinitializing (service worker likely restarted)');

  state.initialized = false;

  // Store the promise so other callers can wait
  initializationPromise = initialize();

  try {
    await initializationPromise;

    // After service worker resume, sync all active collections from their windows
    // This recovers from any missed events during suspension
    logAndBuffer('info', 'Service worker resumed - syncing active collections from Chrome state');
    await syncAllCollectionsFromWindows();
  } finally {
    // Clear the promise after completion (success or failure)
    initializationPromise = null;
  }
}

/**
 * Syncs all active collections from their Chrome windows.
 * Called after service worker resume to recover from missed events.
 *
 * @returns {Promise<void>}
 */
async function syncAllCollectionsFromWindows() {
  try {
    const activeCollectionIds = Array.from(state.settingsCache.keys());

    if (activeCollectionIds.length === 0) {
      logAndBuffer('info', 'No active collections to sync');
      return;
    }

    logAndBuffer('info', `Syncing ${activeCollectionIds.length} active collections after resume`);

    // Sync each collection (don't fail all if one fails)
    for (const collectionId of activeCollectionIds) {
      try {
        const result = await syncCollectionFromWindow(collectionId);
        if (result.success) {
          const changes = result.tabsAdded + result.tabsRemoved + result.tabsUpdated;
          if (changes > 0) {
            logAndBuffer('info', `Recovered ${changes} changes for collection ${collectionId}`);
          }
        }
      } catch (error) {
        logAndBuffer('error', `Failed to sync collection ${collectionId} on resume:`, error);
        // Continue with other collections
      }
    }

    logAndBuffer('info', 'Finished syncing all active collections after resume');
  } catch (error) {
    logAndBuffer('error', 'Failed to sync collections on resume:', error);
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
        autoSync: true,
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
 * Wraps an event handler to ensure initialization before execution.
 *
 * THE FRAGILITY PROBLEM:
 * Without this wrapper, every event handler must manually call ensureInitialized().
 * This is fragile because:
 * - Developers must remember to add it to every handler (easy to forget)
 * - Code reviewers must catch missing calls (manual, error-prone)
 * - Forgetting causes silent failures (handler runs with empty cache)
 * - Adding new handlers requires remembering this pattern (perpetual cognitive load)
 *
 * THE WRAPPER SOLUTION:
 * This function wraps any event handler to automatically ensure initialization.
 * - Centralized: Initialization check happens in ONE place
 * - Automatic: Impossible to forget (it's in the registration, not the handler)
 * - Maintainable: New handlers just need to be wrapped, no other changes
 * - Obvious: The wrapper name makes the pattern explicit
 *
 * HOW IT WORKS:
 * 1. Takes a handler function as input
 * 2. Returns a new function that:
 *    a. First ensures initialization
 *    b. Then calls the original handler
 * 3. The wrapper preserves all arguments and context
 *
 * USAGE EXAMPLE:
 * Instead of:
 *   chrome.tabs.onCreated.addListener(handleTabCreated);
 *   // And handleTabCreated must remember to call ensureInitialized()
 *
 * We do:
 *   chrome.tabs.onCreated.addListener(withInitialization(handleTabCreated));
 *   // And handleTabCreated can focus only on its business logic
 *
 * This is the idiomatic JavaScript pattern for cross-cutting concerns (like logging,
 * authentication, initialization). It's similar to decorators in other languages.
 *
 * @param {Function} handler - The event handler function to wrap
 * @returns {Function} A new function that ensures initialization before calling handler
 */
function withInitialization(handler) {
  return async function(...args) {
    await ensureInitialized();
    return handler(...args);
  };
}

/**
 * Registers Chrome event listeners for tabs and tab groups.
 *
 * ALL HANDLERS ARE WRAPPED WITH withInitialization():
 * This ensures every handler automatically checks initialization before running.
 * Without this wrapper, we'd need to add ensureInitialized() to every handler,
 * which is fragile and easy to forget. See withInitialization() docs for details.
 *
 * IDEMPOTENT: Safe to call multiple times - uses listenersRegistered flag to prevent duplicates.
 *
 * MANIFEST V3 PATTERN:
 * For service worker persistence, this should be called at module top level.
 * Event listeners registered at top level are automatically re-registered by Chrome
 * when the service worker wakes up from suspension.
 */
function registerEventListeners() {
  // Check if already registered (prevent duplicate listeners)
  if (state.listenersRegistered) {
    console.log('[ProgressiveSyncService] Event listeners already registered, skipping');
    return;
  }

  // Tab events (all wrapped for automatic initialization)
  chrome.tabs.onCreated.addListener(withInitialization(handleTabCreated));
  chrome.tabs.onRemoved.addListener(withInitialization(handleTabRemoved));
  chrome.tabs.onMoved.addListener(withInitialization(handleTabMoved));
  chrome.tabs.onUpdated.addListener(withInitialization(handleTabUpdated));
  chrome.tabs.onAttached.addListener(withInitialization(handleTabAttached));
  chrome.tabs.onDetached.addListener(withInitialization(handleTabDetached));

  // Tab group events (all wrapped for automatic initialization)
  chrome.tabGroups.onCreated.addListener(withInitialization(handleTabGroupCreated));
  chrome.tabGroups.onUpdated.addListener(withInitialization(handleTabGroupUpdated));
  chrome.tabGroups.onRemoved.addListener(withInitialization(handleTabGroupRemoved));
  chrome.tabGroups.onMoved.addListener(withInitialization(handleTabGroupMoved));

  // Window events (wrapped for automatic initialization)
  chrome.windows.onRemoved.addListener(withInitialization(handleWindowRemoved));

  state.listenersRegistered = true;
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

    // Only track meaningful changes (including groupId for tab group assignment)
    if (!changeInfo.url && !changeInfo.title && !changeInfo.favIconUrl && changeInfo.pinned === undefined && changeInfo.groupId === undefined) {
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
 * 3. Let debounce handle flush (discarded if window closes)
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

    // Don't flush immediately - let debounce handle it
    // If window is closing, handleWindowRemoved will discard these changes
    // If window stays open, normal flush after debounce will persist the removal
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
 * 2. Discard pending changes (preserve last saved state)
 * 3. Unbind collection from window in IndexedDB (delegates to WindowService)
 * 4. Clear in-memory cache
 *
 * Note: This listener fires reliably because it's registered at module top level.
 * The background-integrated.js listener may not fire if service worker restarts.
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

    // Unbind collection from window in IndexedDB
    // Delegates to WindowService which is the single source of truth for window binding
    // WindowService handles broadcasting collection state changes to UI surfaces
    await WindowService.unbindCollectionFromWindow(collectionId);
    logAndBuffer('info', `Collection ${collectionId} unbound from window ${windowId} in IndexedDB`);

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
 * Syncs a collection from the actual Chrome window state.
 *
 * This performs a full reconciliation between Chrome's current state
 * and what's stored in IndexedDB. Use this to:
 * - Recover from missed events during service worker suspension
 * - Manually refresh collection data
 * - Ensure consistency after errors
 *
 * Process:
 * 1. Get current Chrome tabs for the window
 * 2. Get stored tabs from IndexedDB
 * 3. Reconcile differences:
 *    - Add tabs that exist in Chrome but not in DB
 *    - Remove tabs from DB that don't exist in Chrome
 *    - Update tabs with changed properties
 * 4. Sync tab groups/folders
 * 5. Update collection metadata
 *
 * @param {string} collectionId - Collection ID to sync
 * @returns {Promise<Object>} Sync result with counts
 */
export async function syncCollectionFromWindow(collectionId) {
  try {
    logAndBuffer('info', `Starting full sync for collection ${collectionId}`);

    // Get collection
    const collection = await getCompleteCollection(collectionId);
    if (!collection) {
      throw new Error(`Collection ${collectionId} not found`);
    }

    if (!collection.isActive || !collection.windowId) {
      logAndBuffer('warn', `Collection ${collectionId} is not active or has no window`);
      return {
        success: false,
        reason: 'Collection is not active or has no associated window',
        tabsAdded: 0,
        tabsRemoved: 0,
        tabsUpdated: 0,
        foldersAdded: 0,
        foldersRemoved: 0
      };
    }

    // Get current Chrome tabs
    const chromeTabs = await chrome.tabs.query({ windowId: collection.windowId });
    const chromeTabsMap = new Map(chromeTabs.map(t => [t.id, t]));

    // Get current Chrome tab groups
    const chromeGroups = await chrome.tabGroups.query({ windowId: collection.windowId });
    const chromeGroupsMap = new Map(chromeGroups.map(g => [g.id, g]));

    // Get stored tabs
    const storedTabs = collection.tabs || [];
    const storedTabsMap = new Map();
    for (const tab of storedTabs) {
      if (tab.runtimeId) {
        storedTabsMap.set(tab.runtimeId, tab);
      }
    }

    // Get stored folders
    const storedFolders = collection.folders || [];
    const storedFoldersMap = new Map(storedFolders.map(f => [f.groupId, f]));

    let tabsAdded = 0;
    let tabsRemoved = 0;
    let tabsUpdated = 0;
    let foldersAdded = 0;
    let foldersRemoved = 0;

    // STEP 1: Add or update tabs from Chrome
    for (const [runtimeId, chromeTab] of chromeTabsMap) {
      const storedTab = storedTabsMap.get(runtimeId);

      if (!storedTab) {
        // Tab exists in Chrome but not in DB - add it
        let folderId = null;
        if (chromeTab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE && chromeTab.groupId !== -1) {
          const folder = await findOrCreateFolder(collectionId, chromeTab.groupId, chromeTab.index);
          folderId = folder.id;
          if (!storedFoldersMap.has(chromeTab.groupId)) {
            foldersAdded++;
          }
        }

        const newTab = {
          id: crypto.randomUUID(),
          collectionId,
          folderId,
          runtimeId: chromeTab.id,
          url: chromeTab.url,
          title: chromeTab.title,
          favicon: chromeTab.favIconUrl,
          isPinned: chromeTab.pinned,
          position: chromeTab.index
        };

        await saveTab(newTab);
        tabsAdded++;
        logAndBuffer('info', `Added missing tab: ${chromeTab.title}`);
      } else {
        // Tab exists in both - check if update needed
        let needsUpdate = false;
        const updates = { ...storedTab };

        if (storedTab.url !== chromeTab.url) {
          updates.url = chromeTab.url;
          needsUpdate = true;
        }
        if (storedTab.title !== chromeTab.title) {
          updates.title = chromeTab.title;
          needsUpdate = true;
        }
        if (storedTab.favicon !== chromeTab.favIconUrl) {
          updates.favicon = chromeTab.favIconUrl;
          needsUpdate = true;
        }
        if (storedTab.isPinned !== chromeTab.pinned) {
          updates.isPinned = chromeTab.pinned;
          needsUpdate = true;
        }
        if (storedTab.position !== chromeTab.index) {
          updates.position = chromeTab.index;
          needsUpdate = true;
        }

        // Check group/folder assignment
        const currentGroupId = chromeTab.groupId === -1 ? null : chromeTab.groupId;
        const shouldHaveFolder = currentGroupId !== null && currentGroupId !== chrome.tabGroups.TAB_GROUP_ID_NONE;

        if (shouldHaveFolder) {
          const folder = await findOrCreateFolder(collectionId, currentGroupId, chromeTab.index);
          if (storedTab.folderId !== folder.id) {
            updates.folderId = folder.id;
            needsUpdate = true;
            if (!storedFoldersMap.has(currentGroupId)) {
              foldersAdded++;
            }
          }
        } else if (storedTab.folderId !== null) {
          updates.folderId = null;
          needsUpdate = true;
        }

        if (needsUpdate) {
          await saveTab(updates);
          tabsUpdated++;
          logAndBuffer('info', `Updated tab: ${chromeTab.title}`);
        }
      }
    }

    // STEP 2: Remove tabs from DB that don't exist in Chrome
    for (const [runtimeId, storedTab] of storedTabsMap) {
      if (!chromeTabsMap.has(runtimeId)) {
        await deleteTab(storedTab.id);
        tabsRemoved++;
        logAndBuffer('info', `Removed orphaned tab: ${storedTab.title}`);
      }
    }

    // STEP 3: Remove folders/groups that don't exist in Chrome
    for (const [groupId, storedFolder] of storedFoldersMap) {
      if (groupId && !chromeGroupsMap.has(groupId)) {
        await deleteFolder(storedFolder.id);
        foldersRemoved++;
        logAndBuffer('info', `Removed orphaned folder: ${storedFolder.name}`);
      }
    }

    // STEP 4: Update collection metadata counts
    await updateMetadataCounts(collectionId);

    // STEP 5: Update sync metadata
    const metadata = state.syncMetadata.get(collectionId) || { lastSyncTime: 0, pendingChanges: 0 };
    metadata.lastSyncTime = Date.now();
    state.syncMetadata.set(collectionId, metadata);

    logAndBuffer('info', `Full sync completed for collection ${collectionId}`, {
      tabsAdded,
      tabsRemoved,
      tabsUpdated,
      foldersAdded,
      foldersRemoved
    });

    return {
      success: true,
      tabsAdded,
      tabsRemoved,
      tabsUpdated,
      foldersAdded,
      foldersRemoved
    };
  } catch (error) {
    logAndBuffer('error', `Full sync failed for ${collectionId}:`, error);
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

  // Use Chrome's tab index as position (preserves window-level ordering)
  const position = tab.index;

  // Determine folder for tab
  let folderId = null;
  if (groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
    logAndBuffer('info', `Tab is in group ${groupId}, finding/creating folder`);
    // Pass tab position when creating folder to preserve group position in window
    const folder = await findOrCreateFolder(collectionId, groupId, position);
    folderId = folder.id;
    logAndBuffer('info', `Using folder ${folderId}`);
  } else {
    logAndBuffer('info', `Tab is ungrouped (groupId: ${groupId}), saving with folderId: null`);
    // Ungrouped tabs are saved with folderId: null to preserve window-level ordering
    folderId = null;
  }

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
 * Updates tab properties (URL, title, favicon, pinned, groupId/folderId).
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
    hasFavIcon: changeInfo.favIconUrl !== undefined,
    hasGroupId: changeInfo.groupId !== undefined
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
    newUrl: changeInfo.url,
    currentFolderId: existingTab.folderId,
    newGroupId: changeInfo.groupId
  });

  // Handle groupId change (tab added to/removed from group)
  let folderId = existingTab.folderId; // Default: keep existing
  let oldFolderId = existingTab.folderId; // Track original folder for cleanup

  if (changeInfo.groupId !== undefined) {
    if (changeInfo.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE || changeInfo.groupId === -1) {
      // Tab ungrouped
      folderId = null;
      logAndBuffer('info', `Tab ${tabId} ungrouped, setting folderId to null`);
    } else {
      // Tab assigned to group - find or create folder
      // Pass tab's current position for folder positioning
      const folder = await findOrCreateFolder(collectionId, changeInfo.groupId, tab.index);
      folderId = folder.id;
      logAndBuffer('info', `Tab ${tabId} assigned to group ${changeInfo.groupId}, setting folderId to ${folderId}`);
    }
  }

  // Update tab properties
  const updatedTab = {
    ...existingTab,
    url: changeInfo.url !== undefined ? changeInfo.url : existingTab.url,
    title: changeInfo.title !== undefined ? changeInfo.title : existingTab.title,
    favicon: changeInfo.favIconUrl !== undefined ? changeInfo.favIconUrl : existingTab.favicon,
    isPinned: changeInfo.pinned !== undefined ? changeInfo.pinned : existingTab.isPinned,
    folderId, // Update folderId if groupId changed
    position: tab.index // Always sync current Chrome position
  };

  await saveTab(updatedTab);
  logAndBuffer('info', `Updated tab ${tabId} in collection ${collectionId}`, {
    oldUrl: existingTab.url,
    newUrl: updatedTab.url,
    oldFolderId: existingTab.folderId,
    newFolderId: updatedTab.folderId,
    oldPosition: existingTab.position,
    newPosition: updatedTab.position
  });

  // Update metadata counts if folderId changed (grouped/ungrouped status changed)
  if (existingTab.folderId !== updatedTab.folderId) {
    await updateMetadataCounts(collectionId);

    // If tab was ungrouped (moved from a folder to null), check if old folder is now empty
    if (oldFolderId && folderId === null) {
      const remainingTabs = await getTabsByFolder(oldFolderId);
      if (remainingTabs.length === 0) {
        logAndBuffer('info', `Folder ${oldFolderId} is now empty after ungrouping tab ${tabId}, deleting folder`);
        await deleteFolder(oldFolderId);
        // Update metadata counts again after folder deletion
        await updateMetadataCounts(collectionId);
      }
    }
  }
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
  const { fromIndex, toIndex, windowId } = data;

  // When a tab moves, Chrome adjusts positions of tabs in the affected range.
  // We only need to sync tabs between min(fromIndex, toIndex) and max(fromIndex, toIndex).
  //
  // Example: Moving tab from position 5 → 2
  // - Tabs at positions 2, 3, 4 shift right by 1
  // - Tab at position 5 moves to position 2
  // - Tabs at positions 0, 1, 6+ are unaffected

  try {
    // Calculate affected range
    const minIndex = Math.min(fromIndex, toIndex);
    const maxIndex = Math.max(fromIndex, toIndex);

    // Get all tabs from Chrome in this window
    const chromeTabs = await chrome.tabs.query({ windowId });

    // Filter to only tabs in the affected range
    const affectedChromeTabs = chromeTabs.filter(tab =>
      tab.index >= minIndex && tab.index <= maxIndex
    );

    logAndBuffer('info', `Syncing tab positions in affected range after tab ${tabId} moved`, {
      fromIndex,
      toIndex,
      affectedRange: `${minIndex}-${maxIndex}`,
      affectedTabCount: affectedChromeTabs.length,
      totalTabs: chromeTabs.length,
      collectionId
    });

    // Update each affected tab's position to match Chrome's current state
    let updatedCount = 0;
    for (const chromeTab of affectedChromeTabs) {
      const existingTab = await findTabByRuntimeId(chromeTab.id);
      if (existingTab) {
        // Only update if position changed
        if (existingTab.position !== chromeTab.index) {
          const updatedTab = {
            ...existingTab,
            position: chromeTab.index
          };
          await saveTab(updatedTab);
          updatedCount++;

          logAndBuffer('info', `Updated tab ${chromeTab.id} position`, {
            storageId: existingTab.id,
            oldPosition: existingTab.position,
            newPosition: chromeTab.index
          });
        }
      }
    }

    logAndBuffer('info', `Synced ${updatedCount} tab positions (${affectedChromeTabs.length} tabs checked) in collection ${collectionId}`);
  } catch (error) {
    logAndBuffer('error', `Failed to sync tab positions after move:`, error);
  }
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

  logAndBuffer('info', `Processing folder created for group ${groupId}`, {
    collectionId,
    groupTitle: group.title,
    groupColor: group.color,
    collapsed: group.collapsed
  });

  // Determine folder position from tabs in the group
  let position = 0;
  try {
    const tabsInGroup = await chrome.tabs.query({ groupId });
    if (tabsInGroup.length > 0) {
      position = Math.min(...tabsInGroup.map(t => t.index));
      logAndBuffer('info', `Calculated folder position ${position} from ${tabsInGroup.length} tabs in group`);
    }
  } catch (error) {
    logAndBuffer('warn', `Failed to query tabs for group ${groupId}, using position 0:`, error);
  }

  // Create folder in IndexedDB
  const folderData = {
    id: crypto.randomUUID(),
    collectionId,
    name: group.title || 'Untitled Group',
    color: group.color,
    collapsed: group.collapsed,
    position, // Use calculated position from group's tabs
    groupId: group.id // Runtime ID for lookups
  };

  await saveFolder(folderData);
  logAndBuffer('info', `Created folder ${folderData.id} for group ${groupId} at position ${position} in collection ${collectionId}`, {
    folderId: folderData.id,
    folderName: folderData.name
  });

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

  logAndBuffer('info', `Processing folder updated for group ${groupId}`, {
    collectionId,
    groupTitle: group.title,
    groupColor: group.color,
    collapsed: group.collapsed
  });

  // Find folder by group ID
  const folder = await findFolderByGroupId(collectionId, groupId);
  if (!folder) {
    logAndBuffer('warn', `Folder for group ${groupId} not found in collection ${collectionId}`);
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
  logAndBuffer('info', `Updated folder ${folder.id} for group ${groupId} in collection ${collectionId}`, {
    folderId: folder.id,
    oldName: folder.name,
    newName: updatedFolder.name,
    oldColor: folder.color,
    newColor: updatedFolder.color
  });
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

  logAndBuffer('info', `Processing folder removed for group ${groupId}`, {
    collectionId
  });

  // Find folder by group ID
  const folder = await findFolderByGroupId(collectionId, groupId);
  if (!folder) {
    logAndBuffer('warn', `Folder for group ${groupId} not found in collection ${collectionId}`);
    return;
  }

  // Move all tabs in folder to ungrouped (folderId = null)
  const tabs = await getTabsByFolder(folder.id);
  logAndBuffer('info', `Moving ${tabs.length} tabs from folder ${folder.id} to ungrouped`);

  for (const tab of tabs) {
    const updatedTab = {
      ...tab,
      folderId: null
    };
    await saveTab(updatedTab);
  }

  // Delete folder
  await deleteFolder(folder.id);
  logAndBuffer('info', `Deleted folder ${folder.id} for group ${groupId} from collection ${collectionId}`, {
    folderId: folder.id,
    folderName: folder.name,
    tabsUngrouped: tabs.length
  });

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

  logAndBuffer('info', `Processing folder moved for group ${groupId}`, {
    collectionId
  });

  // Find folder by group ID
  const folder = await findFolderByGroupId(collectionId, groupId);
  if (!folder) {
    logAndBuffer('warn', `Folder for group ${groupId} not found in collection ${collectionId}`);
    return;
  }

  // Update folder position (derived from first tab in group)
  // Position calculation is complex, defer to next full sync
  logAndBuffer('info', `Folder moved for group ${groupId} in collection ${collectionId} (position update deferred)`, {
    folderId: folder.id,
    folderName: folder.name
  });
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
 * @param {number} [initialPosition] - Initial position hint from first tab (optional)
 * @returns {Promise<Object>} Folder object
 */
async function findOrCreateFolder(collectionId, groupId, initialPosition) {
  // Try to find existing folder
  const folder = await findFolderByGroupId(collectionId, groupId);
  if (folder) {
    return folder;
  }

  // Create new folder
  const group = await chrome.tabGroups.get(groupId);

  // Determine folder position:
  // - Use initialPosition if provided (from the tab being grouped)
  // - Otherwise query all tabs in the group and use minimum index
  let position = 0;
  if (initialPosition !== undefined) {
    position = initialPosition;
  } else {
    // Fallback: query tabs in this group to find minimum position
    const tabsInGroup = await chrome.tabs.query({ groupId });
    if (tabsInGroup.length > 0) {
      position = Math.min(...tabsInGroup.map(t => t.index));
    }
  }

  const folderData = {
    id: crypto.randomUUID(),
    collectionId,
    name: group.title || 'Untitled Group',
    color: group.color,
    collapsed: group.collapsed,
    position, // Use calculated position instead of hardcoded 0
    groupId: group.id
  };

  await saveFolder(folderData);
  logAndBuffer('info', `Created folder for group ${groupId} at position ${position}: ${folderData.name}`);
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
      autoSync: true,
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

// ============================================================================
// MODULE INITIALIZATION - MANIFEST V3 PATTERN
// ============================================================================

/**
 * Register event listeners at module top level.
 *
 * CRITICAL FOR MANIFEST V3:
 * In Manifest V3, service workers can be suspended after inactivity and restarted
 * when events fire. When the service worker restarts:
 * - The module script is re-executed from the top
 * - chrome.runtime.onInstalled does NOT fire (extension already installed)
 * - chrome.runtime.onStartup does NOT fire (Chrome already running)
 *
 * By calling registerEventListeners() at the top level (not inside onInstalled/onStartup),
 * we ensure event listeners are registered every time the service worker loads, including
 * after suspension/wake-up cycles.
 *
 * The withInitialization() wrapper ensures each handler lazily loads the settings cache
 * on first use, so we don't need to call initialize() here.
 */
registerEventListeners();
