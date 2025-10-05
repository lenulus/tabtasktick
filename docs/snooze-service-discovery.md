# Snooze Service Discovery

## 1. Goal

The goal of this discovery is to analyze all existing implementations of "snooze" functionality within the TabMaster Pro extension. This analysis will inform the creation of a single, canonical `SnoozeService` that will become the single source of truth for all snooze-related operations, aligning with the project's services-first architecture.

## 2. Existing Implementations

Snooze logic is currently scattered across four main locations:

1.  **UI-Driven (`background-integrated.js`)**: Handles manual snoozing from the popup, context menus, and keyboard shortcuts.
2.  **Legacy Rules Engine (`lib/engine.js`)**: Implements the "snooze" action for the v1 rules engine.
3.  **Services-Based Rules Engine (`lib/engine.v2.services.js`)**: A second implementation for the v2 engine.
4.  **Command Pattern Handler (`lib/commands/ActionManager.js`)**: A third implementation for the command-based engine.

## 3. Comparison Matrix

| Feature | `background-integrated.js` | `lib/engine.js` (Legacy) | `lib/engine.v2.services.js` | `lib/commands/ActionManager.js` | **Proposed Canonical Service** |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Trigger** | Manual (UI, context menu, shortcut) | Rule-based (v1) | Rule-based (v2) | Command-based | All (Service is agnostic) |
| **Data Structure** | `{ id, url, title, favIconUrl, windowId, index, groupId, wakeTime }` | `{ id, url, title, favIconUrl, windowId, index, groupId, wakeTime }` (via context) | `{ id, url, title, favIconUrl, windowId, index, groupId, wakeTime }` (via context) | `{ id, url, title, favIconUrl, windowId, index, groupId, wakeTime }` (via context) | **`{ id, url, title, favIconUrl, snoozeUntil, snoozeReason, originalTabId, groupId, createdAt }` (from SPEC-003)** |
| **Storage Key** | `snoozedTabs` in `chrome.storage.local` and in-memory `state.snoozedTabs` | `snoozedTabs` in `chrome.storage.local` (direct access) | `snoozedTabs` in `chrome.storage.local` (direct access) | `snoozedTabs` in `chrome.storage.local` (direct access) | **`snoozedTabs` in `chrome.storage.local` (managed by service)** |
| **Wake Logic** | `chrome.alarms` (`checkSnoozedTabs`) checks every minute | Relies on the same central `checkSnoozedTabs` alarm | Relies on the same central `checkSnoozedTabs` alarm | Relies on the same central `checkSnoozedTabs` alarm | **`chrome.alarms` per tab for precision, with a periodic fallback.** |
| **Dependencies** | Direct `chrome.*` API calls | `context` object, `chrome.storage.local` | `context` object, `chrome.storage.local` | `context` object, `chrome.storage.local` | **Minimal; inject `chrome` API for testability.** |
| **Group Handling**| Preserves `groupId` when snoozing and restoring | Preserves `groupId` from context | Preserves `groupId` from context | Preserves `groupId` from context | **Yes, preserves and restores group association.** |
| **Notes** | The most feature-complete implementation, including wake/reschedule logic. | Redundant logic inside the engine's action executor. | A direct copy of the legacy engine's logic. | Another copy of the same logic for the command pattern. | Will consolidate all logic and adhere to `SPEC-003`. |

## 4. Analysis Summary

- **Redundancy**: The core snooze logic (creating a snoozed tab object, saving it to storage, and closing the original tab) is duplicated in at least three different rule engine files.
- **Inconsistency**: While the data structures are currently similar, they are not guaranteed to stay in sync. The spec (`SPEC-003`) calls for an enhanced data structure that is not yet implemented anywhere.
- **Coupling**: The rules engines are all tightly coupled to `chrome.storage.local` and the `snoozedTabs` key.
- **Central Wake Logic**: All implementations fortunately rely on a single, centralized `checkSnoozedTabs` function in `background-integrated.js`, which is a good starting point.

The path forward is clear: consolidate all snooze and wake logic into a dedicated `SnoozeService` to eliminate redundancy and create a single, reliable source of truth.

## 5. Canonical Behavior and Service API

Based on the analysis and the requirements from `SPEC-003-enhanced-snooze-interface.md`, the new `SnoozeService` will adhere to the following canonical behavior and expose a clear, consistent API.

### Canonical Data Structure

The single source of truth for a snoozed tab object will be the enhanced structure defined in the specification. This ensures all necessary data is captured for rich functionality.

```javascript
// Canonical Snoozed Tab Object
{
  id: string,             // Unique ID for the snoozed item, e.g., `snoozed_<timestamp>_<originalTabId>`
  url: string,            // The URL of the snoozed tab
  title: string,          // The title of the snoozed tab
  favIconUrl: string,     // The favicon URL for display
  snoozeUntil: number,    // Timestamp (in ms) for when the tab should wake up
  snoozeReason: string,   // User-provided reason or preset ID (e.g., "lunch", "custom")
  originalTabId: number,  // The original chrome.tabs.Tab ID
  groupId: number,        // The original chrome.tabGroups.TabGroup ID, if any
  createdAt: number,      // Timestamp (in ms) for when the tab was snoozed
}
```

### Wake-up Strategy

To ensure timely and reliable wake-ups, the service will use a hybrid alarm strategy:

1.  **Precise Alarms**: For each snoozed tab, a dedicated `chrome.alarms` entry will be created using a unique name (e.g., `snooze_wake_${snoozedTab.id}`). This ensures the tab wakes up at the exact specified time.
2.  **Fallback Periodic Check**: A single periodic alarm (e.g., `snooze_periodic_check`) will run every 5-10 minutes. Its purpose is to act as a fallback, waking any tabs that might have been missed due to browser restart or other edge cases.

This approach provides the best of both worlds: precision and reliability.

### Public Service API

The `SnoozeService.js` will expose the following public methods. All business logic will be contained within this service.

```javascript
/**
 * Snoozes one or more tabs.
 * @param {number[]} tabIds - An array of chrome.tabs.Tab IDs to snooze.
 * @param {number} snoozeUntil - The timestamp (in ms) when the tabs should wake up.
 * @param {string} [reason='manual'] - The reason for snoozing (e.g., "tomorrow", "custom").
 * @returns {Promise<object[]>} A promise that resolves with an array of the newly created snoozed tab objects.
 */
async function snoozeTabs(tabIds, snoozeUntil, reason = 'manual') {}

/**
 * Wakes one or more previously snoozed tabs.
 * @param {string[]} snoozedTabIds - An array of snoozed tab IDs to wake.
 * @param {object} [options={}] - Options for the wake operation.
 * @param {boolean} [options.makeActive=false] - Whether to make the restored tab active.
 * @returns {Promise<number[]>} A promise that resolves with an array of the newly created chrome.tabs.Tab IDs.
 */
async function wakeTabs(snoozedTabIds, options = {}) {}

/**
 * Retrieves all currently snoozed tabs.
 * @returns {Promise<object[]>} A promise that resolves with an array of all snoozed tab objects.
 */
async function getSnoozedTabs() {}

/**
 * Deletes a snoozed tab entry without waking the tab.
 * @param {string} snoozedTabId - The ID of the snoozed tab to delete.
 * @returns {Promise<void>}
 */
async function deleteSnoozedTab(snoozedTabId) {}

/**
 * Updates the wake-up time for a snoozed tab.
 * @param {string} snoozedTabId - The ID of the snoozed tab to reschedule.
 * @param {number} newSnoozeUntil - The new timestamp for when the tab should wake up.
 * @returns {Promise<object>} A promise that resolves with the updated snoozed tab object.
 */
async function rescheduleSnoozedTab(snoozedTabId, newSnoozeUntil) {}

/**
 * Initializes the service, loading snoozed tabs from storage and setting up alarms.
 * Should be called once when the extension starts.
 * @returns {Promise<void>}
 */
async function initialize() {}
```