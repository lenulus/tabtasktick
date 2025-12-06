/**
 * Tab Snapshot Utilities
 *
 * Provides utilities for capturing tab metadata snapshots for task associations.
 * Snapshots enable resilience: tasks can still reference tabs even after they close.
 *
 * Architecture: Pure utility functions (no state, no side effects)
 * Called by: TaskService, UI modals
 *
 * Data Model:
 * {
 *   tabId: string,           // Storage ID (FK to tabs table) - null for non-collection tabs
 *   chromeTabId: number,     // Chrome runtime tab ID
 *   title: string,           // Tab title at association time
 *   url: string,             // Tab URL
 *   favIconUrl: string,      // Favicon URL (fallback to generic icon)
 *   associatedAt: number     // Timestamp of association
 * }
 */

/**
 * Get current active tab snapshot
 *
 * @returns {Promise<Object|null>} Tab snapshot or null if no active tab
 */
export async function getCurrentTabSnapshot() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return null;

  return createTabSnapshot(tab);
}

/**
 * Get snapshot for specific Chrome tab ID
 *
 * @param {number} chromeTabId - Chrome runtime tab ID
 * @returns {Promise<Object|null>} Tab snapshot or null if tab not found
 */
export async function getTabSnapshot(chromeTabId) {
  try {
    const tab = await chrome.tabs.get(chromeTabId);
    return createTabSnapshot(tab);
  } catch (error) {
    console.warn(`[tab-snapshot] Failed to get tab ${chromeTabId}:`, error);
    return null;
  }
}

/**
 * Create tab snapshot from Chrome tab object
 *
 * ARCHITECTURAL NOTE: This function intentionally does NOT import CollectionService
 * to avoid circular dependencies (utils → execution). Storage tab ID lookup is
 * deferred for Phase 2 or can be done via dependency injection if needed.
 *
 * @param {Object} chromeTab - Chrome tabs API tab object
 * @returns {Promise<Object>} Tab snapshot
 */
async function createTabSnapshot(chromeTab) {
  // Phase 1: Simple snapshot without storage tab ID lookup
  // Storage tab ID is not critical for Phase 1 functionality
  // Can be added via dependency injection in Phase 2 if needed

  return {
    tabId: null,                            // Storage ID lookup deferred (Phase 2)
    chromeTabId: chromeTab.id,              // Always present
    title: chromeTab.title || 'Untitled',   // Fallback for tabs without titles
    url: chromeTab.url || '',               // Empty string for restricted URLs
    favIconUrl: chromeTab.favIconUrl || '', // Empty string if no favicon
    associatedAt: Date.now()
  };
}

/**
 * Validate tab reference object
 *
 * @param {Object} tabRef - Tab reference to validate
 * @returns {boolean} True if valid
 */
export function isValidTabReference(tabRef) {
  if (!tabRef || typeof tabRef !== 'object') return false;

  // Must have chromeTabId (number) and url (string)
  if (typeof tabRef.chromeTabId !== 'number') return false;
  if (typeof tabRef.url !== 'string') return false;

  // Optional fields should have correct types if present
  if (tabRef.tabId !== null && typeof tabRef.tabId !== 'string') return false;
  if (tabRef.title !== undefined && typeof tabRef.title !== 'string') return false;
  if (tabRef.favIconUrl !== undefined && typeof tabRef.favIconUrl !== 'string') return false;
  if (tabRef.associatedAt !== undefined && typeof tabRef.associatedAt !== 'number') return false;

  return true;
}

/**
 * Check if tab still exists in Chrome
 *
 * @param {number} chromeTabId - Chrome runtime tab ID
 * @returns {Promise<boolean>} True if tab exists
 */
export async function isTabOpen(chromeTabId) {
  try {
    await chrome.tabs.get(chromeTabId);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Open or focus tab from snapshot
 *
 * Strategy:
 * 1. If chromeTabId exists and tab is open → focus it
 * 2. If tab closed but URL known → open new tab with URL
 * 3. If no URL → fail gracefully
 *
 * @param {Object} tabRef - Tab reference from task
 * @param {Object} options - Options
 * @param {boolean} options.createIfClosed - Create new tab if closed (default: true)
 * @param {number} options.windowId - Window to open tab in (default: current)
 * @returns {Promise<Object>} Result { success, tabId, created }
 */
export async function openTabFromSnapshot(tabRef, options = {}) {
  const { createIfClosed = true, windowId = null } = options;

  if (!isValidTabReference(tabRef)) {
    return { success: false, error: 'Invalid tab reference' };
  }

  // Try to focus existing tab
  const tabExists = await isTabOpen(tabRef.chromeTabId);

  if (tabExists) {
    try {
      // Update and focus the tab
      await chrome.tabs.update(tabRef.chromeTabId, { active: true });

      // Focus the window containing the tab
      const tab = await chrome.tabs.get(tabRef.chromeTabId);
      await chrome.windows.update(tab.windowId, { focused: true });

      return {
        success: true,
        tabId: tabRef.chromeTabId,
        created: false
      };
    } catch (error) {
      console.warn('[tab-snapshot] Failed to focus existing tab:', error);
      // Fall through to create new tab
    }
  }

  // Tab closed or focus failed - create new tab if allowed
  if (createIfClosed && tabRef.url) {
    try {
      const targetWindowId = windowId || (await chrome.windows.getCurrent()).id;

      // Check if a tab with this URL already exists in the target window
      const existingTabs = await chrome.tabs.query({
        url: tabRef.url,
        windowId: targetWindowId
      });

      // If found, focus it instead of creating a new tab
      if (existingTabs.length > 0) {
        const existingTab = existingTabs[0];
        await chrome.tabs.update(existingTab.id, { active: true });
        await chrome.windows.update(existingTab.windowId, { focused: true });

        return {
          success: true,
          tabId: existingTab.id,
          created: false
        };
      }

      // No existing tab found, create new one
      const newTab = await chrome.tabs.create({
        url: tabRef.url,
        windowId: targetWindowId,
        active: true
      });

      return {
        success: true,
        tabId: newTab.id,
        created: true
      };
    } catch (error) {
      console.error('[tab-snapshot] Failed to create new tab:', error);
      return { success: false, error: error.message };
    }
  }

  return {
    success: false,
    error: 'Tab closed and cannot be reopened'
  };
}

/**
 * Open multiple tabs from snapshots
 *
 * @param {Array<Object>} tabRefs - Array of tab references
 * @param {Object} options - Options (same as openTabFromSnapshot)
 * @returns {Promise<Object>} Result { success, opened, failed, results }
 */
export async function openTabsFromSnapshots(tabRefs, options = {}) {
  if (!Array.isArray(tabRefs) || tabRefs.length === 0) {
    return { success: false, opened: 0, failed: 0, results: [] };
  }

  const results = await Promise.all(
    tabRefs.map(ref => openTabFromSnapshot(ref, options))
  );

  const opened = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  return {
    success: opened > 0,
    opened,
    failed,
    results
  };
}

/**
 * Format tab title for display (truncate long titles)
 *
 * @param {string} title - Tab title
 * @param {number} maxLength - Max length (default: 40)
 * @returns {string} Formatted title
 */
export function formatTabTitle(title, maxLength = 40) {
  if (!title) return 'Untitled';
  if (title.length <= maxLength) return title;
  return title.slice(0, maxLength - 3) + '...';
}

/**
 * Get domain from URL for display
 *
 * @param {string} url - Full URL
 * @returns {string} Domain (e.g., "github.com")
 */
export function getDomainFromUrl(url) {
  if (!url) return '';

  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    return '';
  }
}

/**
 * Generate fallback favicon URL from domain
 *
 * @param {string} url - Tab URL
 * @returns {string} Favicon URL or empty string
 */
export function getFallbackFavicon(url) {
  const domain = getDomainFromUrl(url);
  if (!domain) return ''; // No favicon available

  // Try to get favicon from Google's service (works across contexts)
  try {
    const urlObj = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=16`;
  } catch (error) {
    return ''; // Invalid URL, no favicon
  }
}
