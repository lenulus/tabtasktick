/**
 * WindowService
 *
 * Coordinates window-level operations by delegating to existing services.
 *
 * Dependencies:
 * - ExportImportService: Reuses window creation/restoration logic
 * - SnoozeService: Tab snoozing and metadata
 * - SelectionService: Window-scoped tab selection
 *
 * This service maintains a single source of truth by delegating
 * complex window operations to ExportImportService rather than
 * duplicating window creation logic.
 */

import { importData } from '../ExportImportService.js';
import { snoozeTabs, deleteSnoozedTab } from './SnoozeService.js';
import { selectTabs } from '../selection/selectTabs.js';
import { deduplicateWindow as deduplicateWindowOrchestrator } from './DeduplicationOrchestrator.js';

// Storage keys
const WINDOW_METADATA_KEY = 'windowMetadata';

/**
 * Get all windows with their tabs
 */
export async function getAllWindows() {
  const windows = await chrome.windows.getAll({ populate: true });
  return windows;
}

/**
 * Get window metadata
 *
 * Returns window properties: position, size, state, etc.
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
 * Clean up orphaned window metadata (metadata without corresponding snoozed tabs)
 * This handles edge cases where window metadata exists but tabs were cleaned up
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
 * Snooze entire window
 *
 * Stores window metadata separately, then delegates tab snoozing
 * to SnoozeService. This maintains separation of concerns.
 *
 * @param {number} windowId - Window to snooze
 * @param {number} duration - Duration in milliseconds
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - Result with windowSnoozeId and tab results
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
 * Restore snoozed window
 *
 * Delegates to ExportImportService's importData() which handles:
 * - Window creation with metadata preservation
 * - Tab restoration with proper window assignment
 * - Group restoration
 * - Batch operations and error handling
 *
 * This reuses 137 lines of battle-tested window creation logic.
 *
 * @param {string} snoozeId - Window snooze ID
 * @returns {Promise<Object>} - Result with new window ID and restored tabs
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
 * Deduplicate tabs within a specific window (THIN delegation)
 *
 * Delegates to DeduplicationOrchestrator which handles all business logic.
 *
 * @param {number} windowId - Window to deduplicate
 * @param {string} strategy - 'oldest' or 'newest'
 * @param {boolean} dryRun - Preview mode
 * @returns {Promise<Object>} - Deduplication results
 */
export async function deduplicateWindow(windowId, strategy = 'oldest', dryRun = false) {
  // THIN - delegate to orchestrator
  return await deduplicateWindowOrchestrator(windowId, strategy, dryRun);
}

/**
 * Get duplicate count for a window
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
 * Get window statistics
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
