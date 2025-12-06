/**
 * @file WindowService - Window-level operations and coordination
 *
 * @description
 * The WindowService coordinates window-level operations by orchestrating multiple
 * services to handle complex workflows like window snoozing, restoration, and
 * deduplication. It maintains window metadata for preservation across snooze/restore
 * cycles and delegates execution to specialized services.
 *
 * This service follows the DRY principle by reusing existing battle-tested logic
 * from ExportImportService for window creation/restoration instead of duplicating
 * 137 lines of complex window management code. It stores minimal window metadata
 * separately (position, size, state) while delegating tab-level operations to
 * SnoozeService and deduplication to DeduplicationOrchestrator.
 *
 * The service handles graceful degradation when metadata is missing and implements
 * cleanup routines to prevent orphaned data from accumulating in storage.
 *
 * @module services/execution/WindowService
 *
 * @architecture
 * - Layer: Execution Service (Orchestrator)
 * - Dependencies:
 *   - ExportImportService (window creation/restoration - reuses logic)
 *   - SnoozeService (tab-level snoozing and wake operations)
 *   - SelectionService (window-scoped tab filtering)
 *   - DeduplicationOrchestrator (window-scoped duplicate removal)
 * - Used By: executeSnoozeOperations, background context menus, message handlers
 * - Storage: chrome.storage.local (windowMetadata - separate from snoozed tabs)
 *
 * @example
 * // Snooze entire window
 * import * as WindowService from './services/execution/WindowService.js';
 *
 * const windowId = 123;
 * const duration = 3 * 60 * 60 * 1000; // 3 hours
 * const result = await WindowService.snoozeWindow(windowId, duration);
 * console.log(`Snoozed ${result.tabCount} tabs`);
 *
 * @example
 * // Restore snoozed window
 * const snoozeId = 'window_snooze_1234567890_123';
 * const result = await WindowService.restoreWindow(snoozeId);
 * console.log(`Restored ${result.tabCount} tabs to new window`);
 */

import { importData } from '../ExportImportService.js';
import { snoozeTabs, deleteSnoozedTab } from './SnoozeService.js';
import { selectTabs } from '../selection/selectTabs.js';
import { deduplicateWindow as deduplicateWindowOrchestrator } from './DeduplicationOrchestrator.js';
import * as CollectionService from './CollectionService.js';
import { selectCollections } from '../selection/selectCollections.js';
import { getCollection } from '../utils/storage-queries.js';

// Storage keys
const WINDOW_METADATA_KEY = 'windowMetadata';

// Collection cache (windowId → collectionId mapping)
// Used for fast lookups of collection-window bindings
const collectionCache = new Map();

/**
 * Retrieves all browser windows with their populated tab lists.
 *
 * Uses chrome.windows.getAll with populate:true to fetch complete window data
 * including all tabs, groups, and window properties in a single call.
 *
 * @returns {Promise<chrome.windows.Window[]>} Array of window objects with tabs
 *
 * @example
 * // Get all windows and count total tabs
 * const windows = await getAllWindows();
 * const totalTabs = windows.reduce((sum, w) => sum + w.tabs.length, 0);
 * console.log(`${windows.length} windows with ${totalTabs} total tabs`);
 */
export async function getAllWindows() {
  const windows = await chrome.windows.getAll({ populate: true });
  return windows;
}

/**
 * Retrieves metadata for a specific window.
 *
 * Fetches window properties needed for restoration: position (left/top),
 * size (width/height), state (normal/maximized/minimized), type, focus state,
 * and incognito mode. Used when snoozing windows to preserve visual layout.
 *
 * @param {number} windowId - Chrome window ID
 *
 * @returns {Promise<Object>} Window metadata object with properties
 * @returns {number} return.id - Window ID
 * @returns {number} return.left - X position on screen
 * @returns {number} return.top - Y position on screen
 * @returns {number} return.width - Window width in pixels
 * @returns {number} return.height - Window height in pixels
 * @returns {string} return.state - Window state (normal/maximized/minimized/fullscreen)
 * @returns {string} return.type - Window type (normal/popup/panel/app/devtools)
 * @returns {boolean} return.focused - Whether window has focus
 * @returns {boolean} return.incognito - Whether window is incognito
 *
 * @throws {Error} If window with specified ID does not exist
 *
 * @example
 * // Get window metadata before snoozing
 * const metadata = await getWindowMetadata(123);
 * console.log(`Window at ${metadata.left},${metadata.top} size ${metadata.width}x${metadata.height}`);
 */
export async function getWindowMetadata(windowId) {
  const window = await chrome.windows.get(windowId);
  return {
    id: windowId,
    left: window.left,
    top: window.top,
    width: window.width,
    height: window.height,
    state: window.state,
    type: window.type,
    focused: window.focused,
    incognito: window.incognito
  };
}

/**
 * Store window metadata for later restoration
 */
async function storeWindowMetadata(metadata) {
  const stored = await chrome.storage.local.get(WINDOW_METADATA_KEY);
  const allMetadata = stored[WINDOW_METADATA_KEY] || {};
  allMetadata[metadata.snoozeId] = metadata;
  await chrome.storage.local.set({ [WINDOW_METADATA_KEY]: allMetadata });
}

/**
 * Retrieve stored window metadata
 */
async function retrieveWindowMetadata(snoozeId) {
  const stored = await chrome.storage.local.get(WINDOW_METADATA_KEY);
  const allMetadata = stored[WINDOW_METADATA_KEY] || {};
  return allMetadata[snoozeId];
}

/**
 * Delete window metadata after restoration
 */
async function deleteWindowMetadata(snoozeId) {
  const stored = await chrome.storage.local.get(WINDOW_METADATA_KEY);
  const allMetadata = stored[WINDOW_METADATA_KEY] || {};
  delete allMetadata[snoozeId];
  await chrome.storage.local.set({ [WINDOW_METADATA_KEY]: allMetadata });
}

/**
 * Cleans up orphaned window metadata that has no corresponding snoozed tabs.
 *
 * Periodically called by SnoozeService to prevent metadata accumulation from edge
 * cases like manual tab deletion, extension crashes, or partial restore failures.
 * Identifies window snooze IDs that have no associated tabs and removes their
 * metadata from storage.
 *
 * This function is safe to call frequently as it only performs cleanup when needed.
 *
 * @returns {Promise<Object>} Cleanup result
 * @returns {number} return.cleaned - Number of orphaned entries cleaned up
 * @returns {string[]} return.orphanedIds - Array of cleaned snooze IDs
 *
 * @example
 * // Manual cleanup
 * const result = await cleanupOrphanedWindowMetadata();
 * console.log(`Cleaned up ${result.cleaned} orphaned window metadata entries`);
 *
 * @example
 * // Automatic cleanup (called by SnoozeService every 5 minutes)
 * // In SnoozeService periodic check:
 * await cleanupOrphanedWindowMetadata();
 */
export async function cleanupOrphanedWindowMetadata() {
  const stored = await chrome.storage.local.get([WINDOW_METADATA_KEY, 'snoozedTabs']);
  const allMetadata = stored[WINDOW_METADATA_KEY] || {};
  const snoozedTabs = stored.snoozedTabs || [];

  // Get all window snooze IDs that have associated tabs
  const activeWindowSnoozeIds = new Set(
    snoozedTabs
      .filter(tab => tab.windowSnoozeId)
      .map(tab => tab.windowSnoozeId)
  );

  // Find orphaned metadata (no tabs reference this window snooze)
  const orphanedIds = Object.keys(allMetadata).filter(
    snoozeId => !activeWindowSnoozeIds.has(snoozeId)
  );

  if (orphanedIds.length > 0) {
    console.log(`Cleaning up ${orphanedIds.length} orphaned window metadata entries:`, orphanedIds);
    orphanedIds.forEach(id => delete allMetadata[id]);
    await chrome.storage.local.set({ [WINDOW_METADATA_KEY]: allMetadata });
  }

  return { cleaned: orphanedIds.length, orphanedIds };
}

/**
 * Snoozes an entire window with all its tabs until a specified duration.
 *
 * Orchestrates window-level snoozing by:
 * 1. Capturing window metadata (position, size, state) before closure
 * 2. Creating unique window snooze ID to link tabs together
 * 3. Storing window metadata separately from tab metadata
 * 4. Delegating tab snoozing to SnoozeService (with shared windowSnoozeId)
 * 5. Closing the window gracefully (may auto-close when tabs removed)
 *
 * CRITICAL: Uses same timestamp for both snoozeId and snoozeUntil to prevent
 * race conditions during concurrent window snooze operations.
 *
 * @param {number} windowId - Chrome window ID to snooze
 * @param {number} duration - Duration in milliseconds until wake-up
 * @param {Object} [options={}] - Additional snooze options (passed to SnoozeService)
 * @param {string} [options.reason] - Reason for snoozing (e.g., 'manual', 'rule')
 * @param {string} [options.restorationMode] - Where to restore ('original', 'current', 'new')
 *
 * @returns {Promise<Object>} Snooze operation result
 * @returns {string} return.snoozeId - Unique window snooze identifier
 * @returns {number} return.snoozeUntil - Timestamp when window will wake
 * @returns {Object} return.windowMetadata - Captured window properties
 * @returns {number} return.tabCount - Number of tabs snoozed
 * @returns {Object[]} return.snoozedTabs - Array of snoozed tab objects
 *
 * @example
 * // Snooze window for 3 hours
 * const windowId = 123;
 * const duration = 3 * 60 * 60 * 1000;
 * const result = await snoozeWindow(windowId, duration, { reason: 'manual' });
 * console.log(`Snoozed ${result.tabCount} tabs until ${new Date(result.snoozeUntil)}`);
 *
 * @example
 * // Snooze with custom restoration mode
 * await snoozeWindow(windowId, duration, {
 *   reason: 'window_snooze',
 *   restorationMode: 'original' // restore to original window position
 * });
 */
export async function snoozeWindow(windowId, duration, options = {}) {
  // 1. Get window metadata BEFORE closing
  const windowMeta = await getWindowMetadata(windowId);

  // 2. Create unique snooze ID for this window
  // CRITICAL: Use same timestamp for both snoozeId and snoozeUntil calculation
  const now = Date.now();
  const snoozeId = `window_snooze_${now}_${windowId}`;
  const snoozeUntil = now + duration;

  // 3. Store window metadata with snooze info
  await storeWindowMetadata({
    snoozeId,
    windowId,
    snoozeUntil,
    ...windowMeta
  });

  // 4. Get all tabs in window
  const tabs = await chrome.tabs.query({ windowId });
  const tabIds = tabs.map(t => t.id);

  // 5. Delegate tab snoozing to SnoozeService
  // Pass snoozeId so tabs know they belong to a snoozed window
  // NOTE: SnoozeService.snoozeTabs() closes the tabs, which will auto-close
  // the window if all tabs are removed. We wrap chrome.windows.remove()
  // in a try-catch to handle this gracefully.
  const snoozedTabs = await snoozeTabs(tabIds, snoozeUntil, {
    ...options,
    windowSnoozeId: snoozeId
  });

  // 6. Close the window (tabs already snoozed)
  // Window may already be closed if all tabs were removed
  try {
    await chrome.windows.remove(windowId);
  } catch (error) {
    // Window already closed - this is expected and not an error
    if (!error.message.includes('No window with id')) {
      // If it's a different error, log it
      console.warn('Unexpected error closing window:', error);
    }
  }

  return {
    snoozeId,
    snoozeUntil,
    windowMetadata: windowMeta,
    tabCount: tabIds.length,
    snoozedTabs
  };
}

/**
 * Restores a previously snoozed window with all its tabs.
 *
 * Delegates to ExportImportService.importData() to reuse 137 lines of battle-tested
 * window creation logic. Handles graceful degradation when metadata is missing and
 * ensures proper cleanup of both window metadata and snoozed tab records.
 *
 * Process:
 * 1. Retrieve snoozed tabs for window (required - fail if none found)
 * 2. Retrieve window metadata (optional - create fallback if missing)
 * 3. Format data for ExportImportService (matches import payload structure)
 * 4. Delegate window creation to ExportImportService
 * 5. Clean up window metadata and snoozed tab records
 *
 * CRITICAL: Tabs are cleaned up via deleteSnoozedTab() to maintain cache consistency.
 * Direct storage manipulation would cause cache desync.
 *
 * @param {string} snoozeId - Window snooze identifier (e.g., 'window_snooze_1234567890_123')
 *
 * @returns {Promise<Object>} Restoration result
 * @returns {boolean} return.success - Whether restoration succeeded
 * @returns {string|null} return.windowId - New window ID or 'new window created'
 * @returns {number} return.tabCount - Number of tabs restored
 * @returns {number} return.groupCount - Number of groups restored
 * @returns {Object} return.metadata - Original window metadata
 * @returns {string[]} return.errors - Array of error messages (may be partial success)
 *
 * @throws {Error} If no snoozed tabs found for window (orphaned metadata cleaned up)
 *
 * @example
 * // Restore snoozed window
 * const snoozeId = 'window_snooze_1234567890_123';
 * const result = await restoreWindow(snoozeId);
 * if (result.success) {
 *   console.log(`Restored ${result.tabCount} tabs to new window`);
 * }
 *
 * @example
 * // Handle partial restoration errors
 * const result = await restoreWindow(snoozeId);
 * if (result.errors.length > 0) {
 *   console.warn(`${result.errors.length} errors during restore:`, result.errors);
 * }
 */
export async function restoreWindow(snoozeId) {
  // 1. Get all snoozed tabs for this window FIRST
  const snoozedTabs = await getSnoozedTabsForWindow(snoozeId);

  if (snoozedTabs.length === 0) {
    // No tabs found - clean up any orphaned metadata and fail
    const windowMeta = await retrieveWindowMetadata(snoozeId);
    if (windowMeta) {
      await deleteWindowMetadata(snoozeId);
    }
    throw new Error(`No snoozed tabs found for window: ${snoozeId}. Metadata has been cleaned up.`);
  }

  // 2. Retrieve window metadata (optional - used for position/size)
  let windowMeta = await retrieveWindowMetadata(snoozeId);

  if (!windowMeta) {
    // Missing metadata isn't fatal - we have the tabs!
    // Create fallback metadata and continue with restore
    console.warn(`Window metadata missing for ${snoozeId}, using fallback. This may be due to a timing issue during snooze.`);
    windowMeta = {
      snoozeId,
      windowId: parseInt(snoozeId.split('_').pop()), // Extract original window ID
      state: 'normal',
      type: 'normal',
      focused: true
    };
    // Clean up any other orphaned metadata while we're at it
    await cleanupOrphanedWindowMetadata();
  }

  // 3. Format data for ExportImportService
  // This matches the structure ExportImportService expects
  const importPayload = {
    session: {
      windows: [{
        id: `w${windowMeta.windowId}`,
        windowId: windowMeta.windowId,
        state: windowMeta.state,
        type: windowMeta.type,
        focused: true
      }],
      tabs: snoozedTabs.map(tab => ({
        id: `t${tab.id}`,
        windowId: `w${windowMeta.windowId}`,
        url: tab.url,
        title: tab.title,
        pinned: tab.pinned || false,
        groupId: tab.groupId || null
      })),
      groups: [] // Groups handled separately if needed
    }
  };

  // 4. Delegate to ExportImportService
  // This handles all window creation, tab restoration, and error handling
  const result = await importData(
    importPayload,
    {
      scope: 'new-windows',  // Create new window with metadata
      importGroups: true     // Restore tab groups if present
    },
    {}, // state (not needed for window restoration)
    null, // loadRules (not needed)
    null  // scheduler (not needed)
  );

  // 5. Clean up after restoration
  // Always clean up, even if there were some errors during import
  // (importData may partially succeed - some tabs restored, some failed)
  console.log('Window restore result:', result);
  console.log(`Cleaning up ${snoozedTabs.length} tabs for window ${snoozeId}`);

  // Delete window metadata (if it exists)
  const metadataExists = await retrieveWindowMetadata(snoozeId);
  if (metadataExists) {
    await deleteWindowMetadata(snoozeId);
    console.log('Window metadata deleted');
  }

  // CRITICAL: Remove tabs from SnoozeService
  // The tabs were restored via importData (not wakeTabs), so we need
  // to manually clean up via SnoozeService which manages both storage and in-memory cache
  const tabIds = snoozedTabs.map(t => t.id);
  console.log('Cleaning up snoozed tabs via SnoozeService:', tabIds);

  // Delete each tab through SnoozeService (updates both storage and in-memory state)
  for (const tabId of tabIds) {
    await deleteSnoozedTab(tabId);
    console.log(`Deleted snoozed tab: ${tabId}`);
  }

  console.log('Window restore cleanup complete');

  return {
    success: true,
    windowId: result.imported.windows > 0 ? 'new window created' : null,
    tabCount: result.imported.tabs,
    groupCount: result.imported.groups,
    metadata: windowMeta,
    errors: result.errors
  };
}

/**
 * Get snoozed tabs for a specific window snooze
 */
async function getSnoozedTabsForWindow(windowSnoozeId) {
  const stored = await chrome.storage.local.get('snoozedTabs');
  const allSnoozed = stored.snoozedTabs || [];
  return allSnoozed.filter(t => t.windowSnoozeId === windowSnoozeId);
}

/**
 * Deduplicates tabs within a specific window.
 *
 * THIN wrapper that delegates to DeduplicationOrchestrator for all business logic.
 * Finds and closes duplicate tabs within window scope, keeping either oldest or
 * newest occurrence based on strategy.
 *
 * @param {number} windowId - Chrome window ID to deduplicate
 * @param {string} [strategy='oldest'] - Which duplicate to keep ('oldest' or 'newest')
 * @param {boolean} [dryRun=false] - Preview mode (don't actually close tabs)
 *
 * @returns {Promise<Object>} Deduplication results (from DeduplicationOrchestrator)
 *
 * @example
 * // Remove duplicates, keeping oldest tabs
 * const result = await deduplicateWindow(123, 'oldest');
 * console.log(`Closed ${result.closed.length} duplicate tabs`);
 *
 * @example
 * // Preview what would be closed
 * const preview = await deduplicateWindow(123, 'newest', true);
 * console.log(`Would close ${preview.toClose.length} tabs`);
 */
export async function deduplicateWindow(windowId, strategy = 'oldest', dryRun = false) {
  // THIN - delegate to orchestrator
  return await deduplicateWindowOrchestrator(windowId, strategy, dryRun);
}

/**
 * Counts duplicate tabs in a specific window.
 *
 * Uses SelectionService to identify tabs with duplicate URLs (normalized for comparison).
 * Useful for showing duplicate counts in UI without performing deduplication.
 *
 * @param {number} windowId - Chrome window ID
 *
 * @returns {Promise<number>} Count of duplicate tabs in window
 *
 * @example
 * // Show duplicate count in window stats
 * const dupeCount = await getWindowDuplicateCount(123);
 * if (dupeCount > 0) {
 *   console.log(`Window has ${dupeCount} duplicate tabs`);
 * }
 */
export async function getWindowDuplicateCount(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const dupes = await selectTabs({
    tabs,
    duplicates: true
  });
  return dupes.length;
}

/**
 * Retrieves comprehensive statistics for a window.
 *
 * Aggregates multiple metrics including tab counts, group counts, pinned tabs,
 * duplicate counts, and window metadata. Useful for dashboard analytics and
 * window management UI.
 *
 * @param {number} windowId - Chrome window ID
 *
 * @returns {Promise<Object>} Window statistics
 * @returns {number} return.windowId - Window ID
 * @returns {number} return.tabCount - Total number of tabs
 * @returns {number} return.groupedTabs - Number of tabs in groups
 * @returns {number} return.pinnedTabs - Number of pinned tabs
 * @returns {number} return.duplicateCount - Number of duplicate tabs
 * @returns {Object} return.metadata - Window metadata (position, size, state)
 *
 * @example
 * // Get window stats for dashboard
 * const stats = await getWindowStats(123);
 * console.log(`Window: ${stats.tabCount} tabs, ${stats.duplicateCount} duplicates, ${stats.groupedTabs} grouped`);
 *
 * @example
 * // Find windows with many duplicates
 * const windows = await getAllWindows();
 * for (const window of windows) {
 *   const stats = await getWindowStats(window.id);
 *   if (stats.duplicateCount > 10) {
 *     console.log(`Window ${window.id} has ${stats.duplicateCount} duplicates`);
 *   }
 * }
 */
export async function getWindowStats(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const metadata = await getWindowMetadata(windowId);

  return {
    windowId,
    tabCount: tabs.length,
    groupedTabs: tabs.filter(t => t.groupId !== -1).length,
    pinnedTabs: tabs.filter(t => t.pinned).length,
    duplicateCount: await getWindowDuplicateCount(windowId),
    metadata
  };
}

/**
 * Binds a collection to a Chrome window (activates collection).
 *
 * Delegates to CollectionService.bindToWindow() for persistence and updates the
 * in-memory cache for fast lookups. Handles rebinding by clearing old cache entries.
 *
 * @param {string} collectionId - Collection ID to bind
 * @param {number} windowId - Chrome window ID to bind to
 *
 * @returns {Promise<Object>} Updated collection object
 * @returns {number} return.windowId - Now set to provided windowId
 * @returns {boolean} return.isActive - Now true
 *
 * @throws {Error} If collection not found (from CollectionService)
 *
 * @example
 * // Bind saved collection to window
 * const collection = await bindCollectionToWindow('col_123', 456);
 * console.log(collection.isActive); // true
 * console.log(collection.windowId); // 456
 */
export async function bindCollectionToWindow(collectionId, windowId) {
  // Get current collection state to check if it's already bound
  const currentCollection = await getCollection(collectionId);
  if (!currentCollection) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  // If collection was bound to a different window, clear that cache entry
  if (currentCollection.windowId !== null && currentCollection.windowId !== windowId) {
    collectionCache.delete(currentCollection.windowId);
  }

  // Delegate to CollectionService for persistence
  const updated = await CollectionService.bindToWindow(collectionId, windowId);

  // Update cache
  collectionCache.set(windowId, collectionId);

  // Broadcast collection state change to all UI surfaces
  await broadcastCollectionUpdate(collectionId);

  return updated;
}

/**
 * Unbinds a collection from its Chrome window (saves collection).
 *
 * Delegates to CollectionService.unbindFromWindow() for persistence and clears the
 * in-memory cache entry. Idempotent - safe to call on already unbound collections.
 *
 * @param {string} collectionId - Collection ID to unbind
 *
 * @returns {Promise<Object>} Updated collection object
 * @returns {null} return.windowId - Now null
 * @returns {boolean} return.isActive - Now false
 *
 * @throws {Error} If collection not found (from CollectionService)
 *
 * @example
 * // Unbind active collection (window closing)
 * const collection = await unbindCollectionFromWindow('col_123');
 * console.log(collection.isActive); // false
 * console.log(collection.windowId); // null
 */
export async function unbindCollectionFromWindow(collectionId) {
  // Get current collection state to find windowId for cache clearing
  const currentCollection = await getCollection(collectionId);
  if (!currentCollection) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  // Clear cache if collection was bound
  if (currentCollection.windowId !== null) {
    collectionCache.delete(currentCollection.windowId);
  }

  // Delegate to CollectionService for persistence
  const updated = await CollectionService.unbindFromWindow(collectionId);

  // Broadcast collection state change to all UI surfaces
  await broadcastCollectionUpdate(collectionId);

  return updated;
}

/**
 * Gets the collection bound to a specific window.
 *
 * Uses cache-first lookup for performance. If not in cache, queries all active
 * collections and updates cache. Returns null if no collection is bound.
 *
 * Cache behavior:
 * - Cache hit: Return immediately (O(1))
 * - Cache miss: Query database, update cache, return result (O(n) where n = active collections)
 *
 * @param {number} windowId - Chrome window ID
 *
 * @returns {Promise<Object|null>} Collection object or null if not bound
 *
 * @example
 * // Check if window has bound collection
 * const collection = await getCollectionForWindow(123);
 * if (collection) {
 *   console.log(`Window 123 has collection: ${collection.name}`);
 * } else {
 *   console.log('Window 123 has no bound collection');
 * }
 */
export async function getCollectionForWindow(windowId) {
  // Check cache first (fast path)
  if (collectionCache.has(windowId)) {
    const collectionId = collectionCache.get(windowId);
    const collection = await getCollection(collectionId);

    // If collection exists, return it
    if (collection) {
      return collection;
    } else {
      // Collection was deleted, clear cache entry
      collectionCache.delete(windowId);
      return null;
    }
  }

  // Cache miss - query all collections and filter for active ones
  // Note: We avoid using selectCollections({ isActive: true }) because it can fail
  // with IDBIndex errors if isActive values are inconsistent (null vs boolean)
  const allCollections = await selectCollections({});
  const activeCollections = allCollections.filter(c => c.isActive === true);

  // Find collection with matching windowId
  const collection = activeCollections.find(col => col.windowId === windowId);

  if (collection) {
    // Update cache for future lookups
    collectionCache.set(windowId, collection.id);
    return collection;
  }

  return null;
}

/**
 * Rebuilds the collection cache from all active collections.
 *
 * Queries all active collections and rebuilds the in-memory cache. Called on
 * extension startup to warm the cache or after cache invalidation.
 *
 * Additionally, performs orphaned collection cleanup:
 * - Detects collections bound to non-existent windows
 * - Automatically unbinds orphaned collections (isActive=false, windowId=null)
 * - Ensures cache consistency with actual Chrome windows
 *
 * Performance: O(n) where n = number of active collections
 *
 * @returns {Promise<void>}
 *
 * @example
 * // Rebuild cache on extension startup
 * await rebuildCollectionCache();
 * console.log('Collection cache rebuilt');
 */
export async function rebuildCollectionCache() {
  // Clear existing cache
  collectionCache.clear();

  // Get all collections and filter for active ones
  // Note: We avoid using selectCollections({ isActive: true }) because it can fail
  // with IDBIndex errors if isActive values are inconsistent (null vs boolean)
  const allCollections = await selectCollections({});
  const activeCollections = allCollections.filter(c => c.isActive === true);

  // Get all existing window IDs
  const allWindows = await chrome.windows.getAll();
  const existingWindowIds = new Set((allWindows || []).map(w => w.id));

  // Rebuild cache and detect orphaned collections
  const orphanedCollections = [];

  for (const collection of activeCollections) {
    if (collection.windowId !== null) {
      // Check if window still exists
      if (existingWindowIds.has(collection.windowId)) {
        // Window exists - add to cache
        collectionCache.set(collection.windowId, collection.id);
      } else {
        // Window doesn't exist - mark as orphaned
        console.warn(`Detected orphaned collection ${collection.id} bound to non-existent window ${collection.windowId}`);
        orphanedCollections.push(collection.id);
      }
    }
  }

  // Unbind orphaned collections
  if (orphanedCollections.length > 0) {
    console.log(`Unbinding ${orphanedCollections.length} orphaned collections:`, orphanedCollections);
    for (const collectionId of orphanedCollections) {
      await unbindCollectionFromWindow(collectionId);
    }
    console.log('Orphaned collections cleaned up');
  }
}

/**
 * Clears the collection cache.
 *
 * Removes all entries from the in-memory cache. Used for testing or when
 * cache invalidation is needed.
 *
 * @returns {void}
 *
 * @example
 * // Clear cache (testing)
 * clearCollectionCache();
 */
export function clearCollectionCache() {
  collectionCache.clear();
}

/**
 * Broadcasts a collection update message to all UI surfaces.
 *
 * Private helper that notifies side panels, dashboards, and other UI components
 * that a collection's state has changed. This ensures all views refresh to show
 * the updated active/saved state. Errors are silently ignored if no listeners
 * are present (e.g., side panel not open).
 *
 * @param {string} collectionId - Collection that was updated
 * @returns {void}
 *
 * @private
 */
async function broadcastCollectionUpdate(collectionId) {
  try {
    await chrome.runtime.sendMessage({
      action: 'collection.updated',
      data: { collectionId }
    });
  } catch (error) {
    // Ignore errors if no listeners (e.g., side panel not open)
    // This is expected behavior when UI surfaces aren't active
  }
}

/**
 * Focuses a Chrome window (brings it to the front).
 *
 * Activates the specified window and brings it to the foreground. Commonly used by
 * keyboard shortcuts and collection management features to quickly jump to a specific window.
 *
 * @param {number} windowId - Chrome window ID to focus
 * @returns {Promise<object>} Result with success status
 * @returns {boolean} return.success - True if window was focused
 * @returns {string} return.error - Error message (if failed)
 *
 * @example
 * const result = await focusWindow(123);
 * if (result.success) {
 *   console.log('Window focused successfully');
 * }
 */
export async function focusWindow(windowId) {
  try {
    await chrome.windows.update(windowId, { focused: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Closes a Chrome window.
 *
 * Closes the specified window and all its tabs. Use with caution - this operation
 * cannot be undone. Consider saving window state before closing if needed.
 *
 * @param {number} windowId - Chrome window ID to close
 * @returns {Promise<object>} Result with success status
 * @returns {boolean} return.success - True if window was closed
 * @returns {string} return.error - Error message (if failed)
 *
 * @example
 * const result = await closeWindow(123);
 * if (result.success) {
 *   console.log('Window closed successfully');
 * }
 */
export async function closeWindow(windowId) {
  try {
    await chrome.windows.remove(windowId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
