// BookmarkService - Handle bookmark creation for tabs
// Extracted from engine.v2.services.js (Phase 6.1.2)

/**
 * Bookmark tabs in a specified folder
 * @param {Array<number>} tabIds - Array of tab IDs to bookmark
 * @param {object} options - Bookmark options
 * @param {string} options.folder - Folder name (optional, defaults to "Other Bookmarks")
 * @param {string} options.parentId - Parent folder ID (optional, overrides folder name lookup)
 * @returns {Promise<object>} Result object with success status and bookmarked tab IDs
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
