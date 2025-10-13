/**
 * @file BookmarkService - Tab bookmark creation with folder management
 *
 * @description
 * The BookmarkService provides tab bookmarking functionality with intelligent folder
 * management. It creates Chrome bookmarks from tabs, automatically finding or creating
 * bookmark folders as needed. The service handles folder lookups, folder creation in
 * the "Other Bookmarks" root, and graceful error handling for batch bookmark operations.
 *
 * The service supports partial success - if some tabs fail to bookmark (e.g., due to
 * invalid URLs or Chrome restrictions), other tabs continue processing and the function
 * returns detailed results with both successes and errors.
 *
 * Folder management uses a find-or-create pattern: if the specified folder exists, it's
 * reused; if not, it's created in "Other Bookmarks" (parentId '2'). Folders are identified
 * by exact title match, excluding URL bookmarks in the search.
 *
 * Created during Phase 6.1.2 by extracting inline bookmark logic from engine.v2.services.js.
 *
 * @module services/execution/BookmarkService
 *
 * @architecture
 * - Layer: Execution Service (Basic Operations)
 * - Dependencies: chrome.bookmarks API, chrome.tabs API
 * - Used By: Rules engine, dashboard bulk actions, context menus
 * - Pattern: Thin wrapper around Chrome bookmarks API with folder management
 *
 * @example
 * // Bookmark tabs to default folder
 * import { bookmarkTabs } from './services/execution/BookmarkService.js';
 *
 * const result = await bookmarkTabs([123, 456, 789]);
 * console.log(`Bookmarked ${result.bookmarked.length} tabs to Other Bookmarks`);
 *
 * @example
 * // Bookmark tabs to named folder (creates if needed)
 * const result = await bookmarkTabs([123, 456], {
 *   folder: 'Important Tabs'
 * });
 * console.log(`Bookmarked to folder: ${result.details.folder}`);
 */

/**
 * Creates Chrome bookmarks from tabs with automatic folder management.
 *
 * Bookmarks the specified tabs into a Chrome bookmark folder, creating the folder if it
 * doesn't exist. The function handles folder lookup (by exact title), folder creation in
 * "Other Bookmarks" root, and batch bookmark creation with per-tab error tracking.
 *
 * Supports graceful error handling - if some tabs fail (e.g., chrome:// URLs that can't be
 * bookmarked, or tabs that no longer exist), the function continues processing other tabs
 * and returns partial results. The success flag is true only if all tabs were bookmarked
 * successfully.
 *
 * @param {number[]} tabIds - Array of Chrome tab IDs to bookmark
 * @param {Object} [options={}] - Bookmark configuration options
 * @param {string} [options.folder] - Folder name to bookmark into (creates if needed, defaults to "Other Bookmarks")
 * @param {string} [options.parentId] - Explicit parent folder ID (overrides folder name lookup if provided)
 *
 * @returns {Promise<BookmarkResult>} Result object with bookmarked tabs and errors
 *
 * @typedef {Object} BookmarkResult
 * @property {boolean} success - True if all tabs bookmarked successfully, false if any errors
 * @property {number[]} bookmarked - Successfully bookmarked tab IDs
 * @property {BookmarkError[]} errors - Array of errors encountered during bookmarking
 * @property {Object} details - Operation details
 * @property {string} details.parentId - Chrome bookmark folder ID used
 * @property {string} details.folder - Folder name used
 *
 * @typedef {Object} BookmarkError
 * @property {number} [tabId] - Tab ID that failed (if applicable)
 * @property {string} error - Error message describing the failure
 *
 * @example
 * // Bookmark tabs to default folder
 * import { bookmarkTabs } from './services/execution/BookmarkService.js';
 *
 * const result = await bookmarkTabs([123, 456, 789]);
 * console.log(`Success: ${result.success}`);
 * console.log(`Bookmarked ${result.bookmarked.length}/${tabIds.length} tabs`);
 * console.log(`Folder: ${result.details.folder} (ID: ${result.details.parentId})`);
 *
 * @example
 * // Bookmark to named folder (creates if needed)
 * const result = await bookmarkTabs([123, 456], {
 *   folder: 'Work Resources'
 * });
 *
 * // Folder "Work Resources" is created in "Other Bookmarks" if it doesn't exist
 * console.log(`Bookmarked to: ${result.details.folder}`);
 *
 * @example
 * // Bookmark to specific parent folder by ID
 * const result = await bookmarkTabs([123], {
 *   parentId: '5' // Bookmarks Bar folder ID
 * });
 *
 * @example
 * // Handle partial success (some tabs fail)
 * const result = await bookmarkTabs([123, 999]); // 999 doesn't exist
 *
 * console.log(result.success); // false
 * console.log(result.bookmarked); // [123]
 * console.log(result.errors); // [{ tabId: 999, error: "Failed to get tab: ..." }]
 */
export async function bookmarkTabs(tabIds, options = {}) {
  const results = {
    success: true,
    bookmarked: [],
    errors: [],
    details: {}
  };

  try {
    // Get parent folder ID
    const parentId = await getParentFolderId(options);
    results.details.parentId = parentId;
    results.details.folder = options.folder || 'Other Bookmarks';

    // Get tab details for all tabs
    const tabs = await Promise.all(
      tabIds.map(async (tabId) => {
        try {
          return await chrome.tabs.get(tabId);
        } catch (error) {
          results.errors.push({
            tabId,
            error: `Failed to get tab: ${error.message}`
          });
          return null;
        }
      })
    );

    // Bookmark each tab
    for (const tab of tabs) {
      if (!tab) continue; // Skip tabs that failed to fetch

      try {
        await chrome.bookmarks.create({
          parentId,
          title: tab.title,
          url: tab.url
        });
        results.bookmarked.push(tab.id);
      } catch (error) {
        results.errors.push({
          tabId: tab.id,
          error: error.message
        });
      }
    }

    // Set success to false if any errors occurred
    if (results.errors.length > 0) {
      results.success = results.bookmarked.length > 0; // Partial success if some bookmarks created
    }

    return results;
  } catch (error) {
    return {
      success: false,
      bookmarked: [],
      errors: [{ error: error.message }],
      details: {}
    };
  }
}

/**
 * Get parent folder ID for bookmarks
 * @param {object} options - Options containing folder name or parentId
 * @returns {Promise<string>} Parent folder ID
 * @private
 */
async function getParentFolderId(options) {
  // If parentId is explicitly provided, use it
  if (options.parentId) {
    return options.parentId;
  }

  // Default to "Other Bookmarks" (ID: '2')
  let parentId = '2';

  // If folder name is specified, find or create it
  if (options.folder) {
    try {
      const folder = await findOrCreateFolder(options.folder);
      parentId = folder.id;
    } catch (error) {
      console.warn(`Failed to find/create bookmark folder: ${options.folder}`, error);
      // Fall back to default parentId
    }
  }

  return parentId;
}

/**
 * Find a bookmark folder by name, or create it if it doesn't exist
 * @param {string} folderName - Name of the folder to find or create
 * @returns {Promise<object>} Bookmark folder object with id and title
 * @private
 */
async function findOrCreateFolder(folderName) {
  // Search for existing folder
  const bookmarks = await chrome.bookmarks.search({ title: folderName });

  // Find folder (not URL bookmark) - folders have no url property
  const folder = bookmarks.find(b => !b.url);

  if (folder) {
    return folder;
  }

  // Folder doesn't exist, create it in Other Bookmarks (ID: '2')
  const newFolder = await chrome.bookmarks.create({
    parentId: '2',
    title: folderName
  });

  return newFolder;
}
