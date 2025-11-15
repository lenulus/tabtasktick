/**
 * @file SnoozeService - Tab and window snoozing with automatic restoration
 *
 * @description
 * The SnoozeService manages all tab snoozing and waking operations, serving as the single
 * source of truth for snooze-related functionality. It handles closing tabs temporarily,
 * storing their metadata, scheduling automatic wake-ups with chrome.alarms, and restoring
 * tabs to their original state.
 *
 * Key features include window snoozing (entire windows can be snoozed together), flexible
 * restoration modes (original window, current window, or new window), group preservation,
 * and robust alarm handling with periodic fallback checks. The service implements lazy
 * initialization to handle service worker restarts in Manifest V3.
 *
 * All snooze operations (manual, rule-based, keyboard shortcuts, context menus) route
 * through this service to ensure consistent behavior across all surfaces.
 *
 * @module services/execution/SnoozeService
 *
 * @architecture
 * - Layer: Execution Service
 * - Dependencies: WindowService.cleanupOrphanedWindowMetadata (periodic cleanup)
 * - Used By: WindowService, executeSnoozeOperations, background message handlers, rules engine
 * - Storage: chrome.storage.local (snoozed tabs metadata)
 * - Scheduling: chrome.alarms (precise wake-up times + periodic fallback)
 *
 * @example
 * // Basic tab snooze
 * import * as SnoozeService from './services/execution/SnoozeService.js';
 *
 * await SnoozeService.initialize();
 * const snoozeUntil = Date.now() + (60 * 60 * 1000); // 1 hour
 * await SnoozeService.snoozeTabs([tabId], snoozeUntil, { reason: 'manual' });
 *
 * @example
 * // Window snooze with restoration mode
 * const windowSnoozeId = `window_${Date.now()}`;
 * await SnoozeService.snoozeTabs(
 *   [tab1Id, tab2Id, tab3Id],
 *   snoozeUntil,
 *   {
 *     reason: 'window_snooze',
 *     windowSnoozeId,
 *     sourceWindowId: windowId,
 *     restorationMode: 'original' // or 'current', 'new'
 *   }
 * );
 */

import { cleanupOrphanedWindowMetadata } from './WindowService.js';

// Service state
let snoozedTabs = [];
let isInitialized = false;
const SNOOZE_STORAGE_KEY = 'snoozedTabs';
const ALARM_PREFIX = 'snooze_wake_';
const PERIODIC_ALARM_NAME = 'snooze_periodic_check';

/**
 * Ensures the service is initialized by loading from storage if needed.
 * This handles service worker restarts where module state is reset.
 * Also ensures the periodic fallback alarm exists (safety net for missed wake-ups).
 */
async function ensureInitialized() {
  if (!isInitialized) {
    const data = await chrome.storage.local.get(SNOOZE_STORAGE_KEY);
    snoozedTabs = data[SNOOZE_STORAGE_KEY] || [];
    isInitialized = true;

    // Ensure periodic fallback alarm exists (created on first use, not proactively)
    const periodicAlarm = await chrome.alarms.get(PERIODIC_ALARM_NAME);
    if (!periodicAlarm) {
      chrome.alarms.create(PERIODIC_ALARM_NAME, {
        delayInMinutes: 5,
        periodInMinutes: 5,
      });
      console.log('SnoozeService: Created periodic fallback alarm');
    }

    console.log(`SnoozeService lazy-initialized with ${snoozedTabs.length} snoozed tabs.`);
  }
}

/**
 * Initializes the SnoozeService on extension startup.
 *
 * Loads snoozed tabs from storage and sets up chrome.alarms for automatic wake-ups.
 * This function must be called once in the background service worker on extension
 * startup (both onInstalled and onStartup events).
 *
 * Note: The service also implements lazy initialization via ensureInitialized() to
 * handle service worker restarts, but explicit initialization is still recommended
 * for setting up alarms properly.
 *
 * @returns {Promise<void>}
 *
 * @example
 * // In background service worker
 * import * as SnoozeService from './services/execution/SnoozeService.js';
 *
 * chrome.runtime.onInstalled.addListener(() => {
 *   await SnoozeService.initialize();
 * });
 *
 * chrome.runtime.onStartup.addListener(() => {
 *   await SnoozeService.initialize();
 * });
 */
export async function initialize() {
  const data = await chrome.storage.local.get(SNOOZE_STORAGE_KEY);
  snoozedTabs = data[SNOOZE_STORAGE_KEY] || [];
  isInitialized = true;
  console.log(`SnoozeService initialized with ${snoozedTabs.length} snoozed tabs.`);
  await setupAlarms();
}

/**
 * Snoozes one or more tabs until a specified time.
 *
 * Closes the specified tabs immediately, stores their metadata (URL, title, favicon, group),
 * and schedules chrome.alarms to automatically restore them at the specified time. Tabs can
 * be part of a window snooze operation and support flexible restoration modes.
 *
 * The tabs are closed immediately after metadata is captured. A chrome.alarm is created for
 * each snoozed tab to trigger automatic restoration. If alarms fail, a periodic fallback
 * check will catch missed wake-ups.
 *
 * @param {number[]} tabIds - Array of chrome.tabs.Tab IDs to snooze
 * @param {number} snoozeUntil - Unix timestamp (milliseconds) when tabs should wake up
 * @param {Object} [options={}] - Snooze configuration options
 * @param {string} [options.reason='manual'] - Reason for snoozing (e.g., 'manual', 'rule', 'window_snooze')
 * @param {string} [options.windowSnoozeId] - If part of a window snooze, the shared window snooze ID
 * @param {number} [options.sourceWindowId] - Original window ID for restoration tracking
 * @param {string} [options.restorationMode='original'] - Restoration mode: 'original' (source window), 'current' (focused window), or 'new' (new window)
 *
 * @returns {Promise<object[]>} Array of snoozed tab objects with metadata
 *
 * @throws {Error} If tab with specified ID cannot be found (error logged, operation continues)
 *
 * @example
 * // Snooze single tab for 1 hour
 * const tabId = 123;
 * const snoozeUntil = Date.now() + (60 * 60 * 1000);
 * await snoozeTabs([tabId], snoozeUntil, { reason: 'manual' });
 *
 * @example
 * // Snooze multiple tabs with window context
 * const tabIds = [123, 456, 789];
 * const windowId = (await chrome.windows.getLastFocused()).id;
 * const windowSnoozeId = `window_${Date.now()}_${windowId}`;
 * await snoozeTabs(tabIds, snoozeUntil, {
 *   reason: 'window_snooze',
 *   windowSnoozeId,
 *   sourceWindowId: windowId,
 *   restorationMode: 'original'
 * });
 *
 * @example
 * // Legacy signature (backward compatible)
 * await snoozeTabs([tabId], snoozeUntil, 'manual'); // reason as string
 */
export async function snoozeTabs(tabIds, snoozeUntil, options = {}) {
  await ensureInitialized();

  // Support legacy signature: snoozeTabs(tabIds, snoozeUntil, 'reason')
  const isLegacyCall = typeof options === 'string';
  const reason = isLegacyCall ? options : (options.reason || 'manual');
  const windowSnoozeId = isLegacyCall ? null : options.windowSnoozeId;
  const sourceWindowId = isLegacyCall ? null : options.sourceWindowId;
  const restorationMode = isLegacyCall ? 'original' : (options.restorationMode || 'original');

  const newSnoozedTabs = [];
  const now = Date.now();

  for (const tabId of tabIds) {
    try {
      const tab = await chrome.tabs.get(tabId);
      const snoozedTab = {
        id: `snoozed_${now}_${tab.id}`,
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
        snoozeUntil,
        snoozeReason: reason,
        originalTabId: tab.id,
        groupId: tab.groupId > 0 ? tab.groupId : null,
        createdAt: now,
        restorationMode,
      };

      // Add windowSnoozeId if this tab is part of a snoozed window
      if (windowSnoozeId) {
        snoozedTab.windowSnoozeId = windowSnoozeId;
      }

      // Add sourceWindowId to track where tab came from
      if (sourceWindowId) {
        snoozedTab.sourceWindowId = sourceWindowId;
      }

      snoozedTabs.push(snoozedTab);
      newSnoozedTabs.push(snoozedTab);
      chrome.alarms.create(`${ALARM_PREFIX}${snoozedTab.id}`, { when: snoozeUntil });
    } catch (error) {
      console.error(`Could not find tab with ID ${tabId} to snooze.`, error);
    }
  }

  await saveSnoozedTabs();
  await chrome.tabs.remove(tabIds);

  console.log(`Snoozed ${newSnoozedTabs.length} tabs until ${new Date(snoozeUntil).toLocaleString()}`);
  return newSnoozedTabs;
}

/**
 * Wakes (restores) one or more previously snoozed tabs.
 *
 * Creates new tabs with the stored URLs and metadata, removes the snoozed tab records
 * from storage, and clears the associated chrome.alarms. Tabs are restored according
 * to their restorationMode (original window, current window, or new window).
 *
 * Group membership is restored if the original group still exists. The first tab in
 * the array can optionally be made active (focused) upon restoration.
 *
 * @param {string[]} snoozedTabIds - Array of snoozed tab IDs (not chrome tab IDs)
 * @param {object} [options={}] - Wake operation configuration
 * @param {boolean} [options.makeActive=true] - Make the first restored tab active (default: true for better UX)
 * @param {number} [options.targetWindowId] - Override window ID (ignores restorationMode, forces specific window)
 *
 * @returns {Promise<number[]>} Array of newly created chrome.tabs.Tab IDs
 *
 * @throws {Error} If tab creation fails (error logged, operation continues for remaining tabs)
 *
 * @example
 * // Wake specific snoozed tabs
 * const snoozedTabIds = ['snoozed_1234567890_123', 'snoozed_1234567890_456'];
 * const newTabIds = await wakeTabs(snoozedTabIds);
 * console.log(`Restored ${newTabIds.length} tabs`);
 *
 * @example
 * // Wake to specific window (override restorationMode)
 * const windowId = 999;
 * await wakeTabs(snoozedTabIds, { targetWindowId: windowId });
 *
 * @example
 * // Wake without focusing (background restoration)
 * await wakeTabs(snoozedTabIds, { makeActive: false });
 */
export async function wakeTabs(snoozedTabIds, options = {}) {
    await ensureInitialized();
    const { makeActive = true, targetWindowId } = options; // Default to active for better UX
    const newTabIds = [];

    const tabsToWake = snoozedTabs.filter(tab => snoozedTabIds.includes(tab.id));
    const remainingTabs = snoozedTabs.filter(tab => !snoozedTabIds.includes(tab.id));

    for (let i = 0; i < tabsToWake.length; i++) {
      const tab = tabsToWake[i];
      try {
        // Determine window for restoration based on restorationMode
        // Default to 'original' for backward compatibility with tabs that don't have restorationMode set
        const mode = tab.restorationMode || 'original';
        let windowId;

        if (targetWindowId) {
          // Override: use explicit target window
          windowId = targetWindowId;
        } else if (mode === 'original' && tab.sourceWindowId) {
          // Try to restore to original window
          try {
            await chrome.windows.get(tab.sourceWindowId);
            windowId = tab.sourceWindowId;
          } catch (e) {
            // Original window doesn't exist, fall back to last focused
            windowId = (await chrome.windows.getLastFocused()).id;
          }
        } else if (mode === 'current') {
          // Restore to last focused window (service workers can't use getCurrent)
          windowId = (await chrome.windows.getLastFocused()).id;
        } else if (mode === 'original' && !tab.sourceWindowId) {
          // Legacy tab without sourceWindowId - restore to last focused window
          windowId = (await chrome.windows.getLastFocused()).id;
        }
        // If mode === 'new', windowId stays undefined (creates new window)

        const newTab = await chrome.tabs.create({
          url: tab.url,
          active: i === 0 ? makeActive : false, // Only make first tab active
          windowId, // undefined creates new window
        });
        if (tab.groupId) {
          await restoreTabToGroup(newTab.id, tab.groupId);
        }
        newTabIds.push(newTab.id);
        chrome.alarms.clear(`${ALARM_PREFIX}${tab.id}`);
      } catch (error) {
        console.error(`Error waking tab ${tab.id}:`, error);
      }
    }

    snoozedTabs = remainingTabs;
    await saveSnoozedTabs();
    console.log(`Woke ${newTabIds.length} tabs.`);
    return newTabIds;
}

/**
 * Retrieves all currently snoozed tabs from storage.
 *
 * Returns a copy of the snoozed tabs array to prevent external mutation of
 * internal state. Each snoozed tab object contains metadata like URL, title,
 * favicon, snoozeUntil timestamp, windowSnoozeId, and restorationMode.
 *
 * @returns {Promise<object[]>} Array of snoozed tab objects (defensive copy)
 *
 * @example
 * // Get all snoozed tabs for display in UI
 * const snoozed = await getSnoozedTabs();
 * snoozed.forEach(tab => {
 *   console.log(`${tab.title} wakes at ${new Date(tab.snoozeUntil)}`);
 * });
 *
 * @example
 * // Filter window snoozes
 * const snoozed = await getSnoozedTabs();
 * const windowSnoozes = snoozed.filter(tab => tab.windowSnoozeId);
 */
export async function getSnoozedTabs() {
  await ensureInitialized();
  return [...snoozedTabs];
}

/**
 * Deletes a snoozed tab entry without restoring it.
 *
 * Removes the snoozed tab record from storage and clears its associated alarm.
 * This is used when the user wants to cancel a scheduled wake-up without
 * restoring the tab (e.g., "Delete" button in snoozed tabs UI).
 *
 * @param {string} snoozedTabId - The snoozed tab ID to delete (not chrome tab ID)
 *
 * @returns {Promise<void>}
 *
 * @example
 * // Delete a snoozed tab permanently
 * await deleteSnoozedTab('snoozed_1234567890_123');
 *
 * @example
 * // Delete all snoozed tabs for a window
 * const snoozed = await getSnoozedTabs();
 * const windowTabs = snoozed.filter(tab => tab.windowSnoozeId === windowSnoozeId);
 * for (const tab of windowTabs) {
 *   await deleteSnoozedTab(tab.id);
 * }
 */
export async function deleteSnoozedTab(snoozedTabId) {
  await ensureInitialized();
  const initialLength = snoozedTabs.length;
  snoozedTabs = snoozedTabs.filter(tab => tab.id !== snoozedTabId);
  if (snoozedTabs.length < initialLength) {
    chrome.alarms.clear(`${ALARM_PREFIX}${snoozedTabId}`);
    await saveSnoozedTabs();
    console.log(`Deleted snoozed tab: ${snoozedTabId}`);
  }
}

/**
 * Updates the wake-up time for a snoozed tab.
 *
 * Changes the snoozeUntil timestamp and updates the chrome.alarm to fire at the
 * new time. This is used when the user wants to postpone or advance a scheduled
 * wake-up without canceling and re-snoozing the tab.
 *
 * @param {string} snoozedTabId - The snoozed tab ID to reschedule (not chrome tab ID)
 * @param {number} newSnoozeUntil - New Unix timestamp (milliseconds) for wake-up
 *
 * @returns {Promise<object>} Updated snoozed tab object with new snoozeUntil
 *
 * @throws {Error} If snoozed tab with specified ID is not found
 *
 * @example
 * // Postpone wake-up by 1 hour
 * const snoozedTab = (await getSnoozedTabs())[0];
 * const newTime = snoozedTab.snoozeUntil + (60 * 60 * 1000);
 * await rescheduleSnoozedTab(snoozedTab.id, newTime);
 *
 * @example
 * // Advance wake-up to now (wake immediately)
 * await rescheduleSnoozedTab(snoozedTabId, Date.now());
 */
export async function rescheduleSnoozedTab(snoozedTabId, newSnoozeUntil) {
  const tabIndex = snoozedTabs.findIndex(tab => tab.id === snoozedTabId);
  if (tabIndex > -1) {
    snoozedTabs[tabIndex].snoozeUntil = newSnoozeUntil;
    chrome.alarms.create(`${ALARM_PREFIX}${snoozedTabs[tabIndex].id}`, { when: newSnoozeUntil });
    await saveSnoozedTabs();
    console.log(`Rescheduled snoozed tab ${snoozedTabId} to ${new Date(newSnoozeUntil).toLocaleString()}`);
    return { ...snoozedTabs[tabIndex] };
  }
  throw new Error(`Snoozed tab with ID ${snoozedTabId} not found.`);
}

/**
 * Handles chrome.alarms events for automatic tab wake-ups.
 *
 * This function should be called from the chrome.alarms.onAlarm listener in the
 * background service worker. It processes two types of alarms:
 *
 * 1. Precise snooze alarms (snooze_wake_*) - wake specific tabs at scheduled time
 * 2. Periodic fallback alarm (snooze_periodic_check) - catch missed alarms and cleanup
 *
 * The periodic alarm runs every 5 minutes as a fallback in case precise alarms fail
 * due to service worker restarts or other Chrome API issues.
 *
 * @param {object} alarm - Chrome alarm object with name and scheduledTime properties
 *
 * @returns {Promise<void>}
 *
 * @example
 * // In background service worker
 * import * as SnoozeService from './services/execution/SnoozeService.js';
 *
 * chrome.alarms.onAlarm.addListener((alarm) => {
 *   await SnoozeService.handleAlarm(alarm);
 * });
 *
 * @example
 * // Alarm names
 * // Precise alarm: "snooze_wake_snoozed_1234567890_123"
 * // Periodic alarm: "snooze_periodic_check"
 */
export async function handleAlarm(alarm) {
  await ensureInitialized();
  if (alarm.name.startsWith(ALARM_PREFIX)) {
    const snoozedTabId = alarm.name.substring(ALARM_PREFIX.length);
    console.log(`Waking tab for alarm: ${alarm.name}`);
    await wakeTabs([snoozedTabId]);
  } else if (alarm.name === PERIODIC_ALARM_NAME) {
    console.log('Periodic snooze check running...');
    await checkMissedAlarms();
  }
}

// --- Private Helper Functions ---

/**
 * Saves the current snoozed tabs array to local storage.
 */
async function saveSnoozedTabs() {
  return chrome.storage.local.set({ [SNOOZE_STORAGE_KEY]: snoozedTabs });
}

/**
 * Sets up the periodic alarm and re-creates precise alarms if needed.
 */
async function setupAlarms() {
  // Create the fallback periodic alarm
  chrome.alarms.create(PERIODIC_ALARM_NAME, {
    delayInMinutes: 5,
    periodInMinutes: 5,
  });

  // Re-create precise alarms for all snoozed tabs
  for (const tab of snoozedTabs) {
    chrome.alarms.create(`${ALARM_PREFIX}${tab.id}`, { when: tab.snoozeUntil });
  }
  console.log(`Set up ${snoozedTabs.length} precise snooze alarms.`);
}

/**
 * Periodically checks for any tabs that should have woken up but didn't.
 * Also cleans up orphaned window metadata.
 */
async function checkMissedAlarms() {
  const now = Date.now();
  const missedTabs = snoozedTabs.filter(tab => tab.snoozeUntil <= now);
  if (missedTabs.length > 0) {
    console.warn(`Found ${missedTabs.length} missed snoozed tabs. Waking them now.`);
    const missedTabIds = missedTabs.map(tab => tab.id);
    await wakeTabs(missedTabIds);
  }

  // Clean up orphaned window metadata (Phase 8.3)
  try {
    await cleanupOrphanedWindowMetadata();
  } catch (error) {
    console.error('Failed to cleanup orphaned window metadata:', error);
  }
}

/**
 * Restores a tab to its original group if the group still exists.
 * @param {number} newTabId - The ID of the newly created tab.
 * @param {number} originalGroupId - The ID of the group to restore to.
 */
async function restoreTabToGroup(newTabId, originalGroupId) {
    if (!originalGroupId) return;
    try {
      // Check if the group still exists
      await chrome.tabGroups.get(originalGroupId);
      // If it exists, add the tab to it
      await chrome.tabs.group({ tabIds: [newTabId], groupId: originalGroupId });
    } catch (error) {
      // Group likely doesn't exist anymore, which is fine.
      console.log(`Could not restore tab ${newTabId} to group ${originalGroupId}. Group may no longer exist.`);
    }
}