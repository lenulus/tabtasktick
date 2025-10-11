/**
 * @file Manages all tab snoozing and waking logic.
 * This service is the single source of truth for all snooze-related operations.
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
 */
async function ensureInitialized() {
  if (!isInitialized) {
    const data = await chrome.storage.local.get(SNOOZE_STORAGE_KEY);
    snoozedTabs = data[SNOOZE_STORAGE_KEY] || [];
    isInitialized = true;
    console.log(`SnoozeService lazy-initialized with ${snoozedTabs.length} snoozed tabs.`);
  }
}

/**
 * Initializes the SnoozeService.
 * Must be called once when the extension starts.
 */
export async function initialize() {
  const data = await chrome.storage.local.get(SNOOZE_STORAGE_KEY);
  snoozedTabs = data[SNOOZE_STORAGE_KEY] || [];
  isInitialized = true;
  console.log(`SnoozeService initialized with ${snoozedTabs.length} snoozed tabs.`);
  await setupAlarms();
}

/**
 * Snoozes one or more tabs.
 * @param {number[]} tabIds - An array of chrome.tabs.Tab IDs to snooze.
 * @param {number} snoozeUntil - The timestamp (in ms) when the tabs should wake up.
 * @param {Object} [options={}] - Options for snoozing.
 * @param {string} [options.reason='manual'] - The reason for snoozing.
 * @param {string} [options.windowSnoozeId] - If part of a window snooze, the window snooze ID.
 * @param {number} [options.sourceWindowId] - The window ID tabs came from (for restoration).
 * @param {string} [options.restorationMode='original'] - Where to restore tabs ('original', 'current', 'new').
 * @returns {Promise<object[]>} The newly created snoozed tab objects.
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
 * Wakes one or more previously snoozed tabs.
 * @param {string[]} snoozedTabIds - An array of snoozed tab IDs to wake.
 * @param {object} [options={}] - Options for the wake operation.
 * @param {boolean} [options.makeActive=false] - Whether to make the first restored tab active.
 * @param {number} [options.targetWindowId] - Override: specific window to restore to (ignores restorationMode).
 * @returns {Promise<number[]>} The newly created chrome.tabs.Tab IDs.
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
            // Original window doesn't exist, fall back to current
            windowId = (await chrome.windows.getCurrent()).id;
          }
        } else if (mode === 'current') {
          // Restore to current window
          windowId = (await chrome.windows.getCurrent()).id;
        } else if (mode === 'original' && !tab.sourceWindowId) {
          // Legacy tab without sourceWindowId - restore to current window
          windowId = (await chrome.windows.getCurrent()).id;
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
 * Retrieves all currently snoozed tabs.
 * @returns {Promise<object[]>} An array of all snoozed tab objects.
 */
export async function getSnoozedTabs() {
  await ensureInitialized();
  return [...snoozedTabs];
}

/**
 * Deletes a snoozed tab entry without waking the tab.
 * @param {string} snoozedTabId - The ID of the snoozed tab to delete.
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
 * @param {string} snoozedTabId - The ID of the snoozed tab to reschedule.
 * @param {number} newSnoozeUntil - The new timestamp for when the tab should wake up.
 * @returns {Promise<object>} The updated snoozed tab object.
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
 * Handles incoming chrome.alarms events.
 * @param {object} alarm - The alarm that fired.
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