/**
 * Close Duplicates Service
 *
 * Handles closing duplicate tabs based on various keep strategies.
 * Part of Phase 7.1.1 Architectural Remediation.
 */

/**
 * Close duplicate tabs based on keep strategy
 *
 * @param {Array} tabs - Tabs with dupeKey property for grouping duplicates
 * @param {string} strategy - Keep strategy: 'oldest', 'newest', 'mru', 'lru', 'all', 'none'
 * @param {boolean} dryRun - If true, return preview without executing
 * @param {object} chromeApi - Chrome API object (for dependency injection in tests)
 * @returns {Promise<Array>} Results array with { tabId, action, success, details } or { error }
 */
export async function closeDuplicates(tabs, strategy = 'oldest', dryRun = false, chromeApi = chrome) {
  const results = [];

  // Group tabs by their dupeKey
  const dupeGroups = {};
  for (const tab of tabs) {
    if (!dupeGroups[tab.dupeKey]) {
      dupeGroups[tab.dupeKey] = [];
    }
    dupeGroups[tab.dupeKey].push(tab);
  }

  // Process each group of duplicates
  for (const [dupeKey, dupeTabs] of Object.entries(dupeGroups)) {
    if (dupeTabs.length <= 1) {
      // No duplicates in this group
      continue;
    }

    // Determine which tab(s) to close based on keep strategy
    const keepStrategy = strategy || 'oldest'; // Default to keeping oldest
    let tabsToClose = [];

    if (keepStrategy === 'all') {
      // Keep all - don't close any (no-op)
      tabsToClose = [];
    } else if (keepStrategy === 'none') {
      // Close all duplicates
      tabsToClose = dupeTabs;
    } else {
      // Sort tabs to identify which to keep
      const sortedDupes = [...dupeTabs].sort((a, b) => {
        if (keepStrategy === 'oldest' || keepStrategy === 'newest') {
          // Sort by creation time (use ID as proxy if no createdAt)
          const aTime = a.createdAt || a.id;
          const bTime = b.createdAt || b.id;
          return aTime - bTime; // Oldest first
        }
        else if (keepStrategy === 'mru' || keepStrategy === 'lru') {
          // Sort by last access time (with fallbacks)
          const aAccess = a.lastAccessed || a.createdAt || a.id || 0;
          const bAccess = b.lastAccessed || b.createdAt || b.id || 0;
          return aAccess - bAccess; // LRU first, MRU last
        }
        return 0;
      });

      if (keepStrategy === 'oldest' || keepStrategy === 'lru') {
        // Keep first in sorted array
        tabsToClose = sortedDupes.slice(1);
      } else if (keepStrategy === 'newest' || keepStrategy === 'mru') {
        // Keep last in sorted array
        tabsToClose = sortedDupes.slice(0, -1);
      }
    }

    // Close the designated duplicates
    for (const tab of tabsToClose) {
      try {
        if (!dryRun) {
          await chromeApi.tabs.remove(tab.id);
        }
        results.push({
          tabId: tab.id,
          action: 'close-duplicates',
          success: true,
          details: {
            closed: tab.id,
            dupeKey: tab.dupeKey,
            strategy: keepStrategy
          }
        });
      } catch (error) {
        results.push({
          tabId: tab.id,
          action: 'close-duplicates',
          success: false,
          error: error.message
        });
      }
    }
  }

  return results;
}
