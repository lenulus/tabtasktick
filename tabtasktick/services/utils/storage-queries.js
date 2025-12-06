/**
 * Storage Query Utilities
 *
 * Simple CRUD operations for TabTaskTick's IndexedDB stores.
 * Called ONLY by execution services - no business logic here.
 *
 * Stores: collections, folders, tabs, tasks
 * Pattern: Each operation uses withTransaction() for atomicity
 * Returns: Standardized {success, data, error} objects
 */

import {
  withTransaction,
  getAllFromIndex,
  getFromStore,
  putInStore,
  deleteFromStore,
  getAllFromStore,
  QuotaExceededError
} from './db.js';

// ============================================================================
// COLLECTIONS
// ============================================================================

/**
 * Get collection by ID
 *
 * @param {string} id - Collection ID
 * @returns {Promise<Object|null>} Collection or null if not found
 */
export async function getCollection(id) {
  try {
    const result = await withTransaction(['collections'], 'readonly', async (tx) => {
      const store = tx.objectStore('collections');
      return await getFromStore(store, id);
    });
    return result || null;
  } catch (error) {
    console.error('getCollection failed:', error);
    throw error;
  }
}

/**
 * Get all collections
 *
 * @returns {Promise<Array>} All collections
 */
export async function getAllCollections() {
  try {
    return await withTransaction(['collections'], 'readonly', async (tx) => {
      const store = tx.objectStore('collections');
      return await getAllFromStore(store);
    });
  } catch (error) {
    console.error('getAllCollections failed:', error);
    throw error;
  }
}

/**
 * Get collections by index
 * Generic query helper for any index
 *
 * IMPORTANT: IndexedDB does NOT support boolean values as keys.
 * If querying a boolean index (like isActive), we fall back to
 * fetching all collections and filtering in memory.
 *
 * @param {string} indexName - Index name (isActive, tags, lastAccessed)
 * @param {*} value - Value to match
 * @returns {Promise<Array>} Matching collections
 */
export async function getCollectionsByIndex(indexName, value) {
  try {
    // IndexedDB valid key types: Number, String, Date, Array, Binary
    // Booleans are NOT valid keys, so we fall back to full scan + filter
    if (typeof value === 'boolean') {
      console.log(`getCollectionsByIndex: Boolean value detected for ${indexName}, using fallback`);
      const allCollections = await getAllCollections();
      return allCollections.filter(c => c[indexName] === value);
    }

    // Use index query for non-boolean values
    return await withTransaction(['collections'], 'readonly', async (tx) => {
      const store = tx.objectStore('collections');
      const index = store.index(indexName);
      return await getAllFromIndex(index, value);
    });
  } catch (error) {
    console.error(`getCollectionsByIndex(${indexName}) failed:`, error);
    throw error;
  }
}

/**
 * Save collection (create or update)
 *
 * @param {Object} collection - Collection object
 * @returns {Promise<string>} Collection ID
 */
export async function saveCollection(collection) {
  try {
    return await withTransaction(['collections'], 'readwrite', async (tx) => {
      const store = tx.objectStore('collections');
      return await putInStore(store, collection);
    });
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      throw error; // Propagate quota errors to caller
    }
    console.error('saveCollection failed:', error);
    throw error;
  }
}

/**
 * Delete collection with cascade delete
 * Deletes all folders, tabs, and tasks belonging to collection
 *
 * @param {string} id - Collection ID
 * @returns {Promise<void>}
 */
export async function deleteCollection(id) {
  try {
    await withTransaction(['collections', 'folders', 'tabs', 'tasks'], 'readwrite', async (tx) => {
      // 1. Get all folders in collection
      const folderStore = tx.objectStore('folders');
      const folderIndex = folderStore.index('collectionId');
      const folders = await getAllFromIndex(folderIndex, id);

      // 2. Delete all tabs in all folders
      const tabStore = tx.objectStore('tabs');
      for (const folder of folders) {
        const tabIndex = tabStore.index('folderId');
        const tabs = await getAllFromIndex(tabIndex, folder.id);

        for (const tab of tabs) {
          await deleteFromStore(tabStore, tab.id);
        }

        // Delete folder
        await deleteFromStore(folderStore, folder.id);
      }

      // 3. Delete all tasks in collection
      const taskStore = tx.objectStore('tasks');
      const taskIndex = taskStore.index('collectionId');
      const tasks = await getAllFromIndex(taskIndex, id);

      for (const task of tasks) {
        await deleteFromStore(taskStore, task.id);
      }

      // 4. Delete collection
      const collectionStore = tx.objectStore('collections');
      await deleteFromStore(collectionStore, id);
    });
  } catch (error) {
    console.error('deleteCollection failed:', error);
    throw error;
  }
}

// ============================================================================
// FOLDERS
// ============================================================================

/**
 * Get folder by ID
 *
 * @param {string} id - Folder ID
 * @returns {Promise<Object|null>} Folder or null if not found
 */
export async function getFolder(id) {
  try {
    const result = await withTransaction(['folders'], 'readonly', async (tx) => {
      const store = tx.objectStore('folders');
      return await getFromStore(store, id);
    });
    return result || null;
  } catch (error) {
    console.error('getFolder failed:', error);
    throw error;
  }
}

/**
 * Get all folders for a collection
 *
 * @param {string} collectionId - Collection ID
 * @returns {Promise<Array>} Folders in collection
 */
export async function getFoldersByCollection(collectionId) {
  try {
    return await withTransaction(['folders'], 'readonly', async (tx) => {
      const store = tx.objectStore('folders');
      const index = store.index('collectionId');
      return await getAllFromIndex(index, collectionId);
    });
  } catch (error) {
    console.error('getFoldersByCollection failed:', error);
    throw error;
  }
}

/**
 * Save folder (create or update)
 *
 * @param {Object} folder - Folder object
 * @returns {Promise<string>} Folder ID
 */
export async function saveFolder(folder) {
  try {
    return await withTransaction(['folders'], 'readwrite', async (tx) => {
      const store = tx.objectStore('folders');
      return await putInStore(store, folder);
    });
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      throw error;
    }
    console.error('saveFolder failed:', error);
    throw error;
  }
}

/**
 * Delete folder with cascade delete
 * Deletes all tabs in folder
 *
 * @param {string} id - Folder ID
 * @returns {Promise<void>}
 */
export async function deleteFolder(id) {
  try {
    await withTransaction(['folders', 'tabs'], 'readwrite', async (tx) => {
      // 1. Get all tabs in folder
      const tabStore = tx.objectStore('tabs');
      const tabIndex = tabStore.index('folderId');
      const tabs = await getAllFromIndex(tabIndex, id);

      // 2. Delete all tabs
      for (const tab of tabs) {
        await deleteFromStore(tabStore, tab.id);
      }

      // 3. Delete folder
      const folderStore = tx.objectStore('folders');
      await deleteFromStore(folderStore, id);
    });
  } catch (error) {
    console.error('deleteFolder failed:', error);
    throw error;
  }
}

// ============================================================================
// TABS
// ============================================================================

/**
 * Get tab by ID
 *
 * @param {string} id - Tab ID
 * @returns {Promise<Object|null>} Tab or null if not found
 */
export async function getTab(id) {
  try {
    const result = await withTransaction(['tabs'], 'readonly', async (tx) => {
      const store = tx.objectStore('tabs');
      return await getFromStore(store, id);
    });
    return result || null;
  } catch (error) {
    console.error('getTab failed:', error);
    throw error;
  }
}

/**
 * Get all tabs for a folder
 *
 * @param {string} folderId - Folder ID
 * @returns {Promise<Array>} Tabs in folder
 */
export async function getTabsByFolder(folderId) {
  try {
    return await withTransaction(['tabs'], 'readonly', async (tx) => {
      const store = tx.objectStore('tabs');
      const index = store.index('folderId');
      return await getAllFromIndex(index, folderId);
    });
  } catch (error) {
    console.error('getTabsByFolder failed:', error);
    throw error;
  }
}

/**
 * Get all tabs
 *
 * @returns {Promise<Array>} All tabs
 */
export async function getAllTabs() {
  try {
    return await withTransaction(['tabs'], 'readonly', async (tx) => {
      const store = tx.objectStore('tabs');
      return await getAllFromStore(store);
    });
  } catch (error) {
    console.error('getAllTabs failed:', error);
    throw error;
  }
}

/**
 * Save tab (create or update)
 *
 * @param {Object} tab - Tab object
 * @returns {Promise<string>} Tab ID
 */
export async function saveTab(tab) {
  try {
    return await withTransaction(['tabs'], 'readwrite', async (tx) => {
      const store = tx.objectStore('tabs');
      return await putInStore(store, tab);
    });
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      throw error;
    }
    console.error('saveTab failed:', error);
    throw error;
  }
}

/**
 * Delete tab
 * No cascade (tabs are leaf nodes)
 *
 * @param {string} id - Tab ID
 * @returns {Promise<void>}
 */
export async function deleteTab(id) {
  try {
    await withTransaction(['tabs'], 'readwrite', async (tx) => {
      const store = tx.objectStore('tabs');
      await deleteFromStore(store, id);
    });
  } catch (error) {
    console.error('deleteTab failed:', error);
    throw error;
  }
}

// ============================================================================
// TASKS
// ============================================================================

/**
 * Get task by ID
 *
 * @param {string} id - Task ID
 * @returns {Promise<Object|null>} Task or null if not found
 */
export async function getTask(id) {
  try {
    const result = await withTransaction(['tasks'], 'readonly', async (tx) => {
      const store = tx.objectStore('tasks');
      return await getFromStore(store, id);
    });
    return result || null;
  } catch (error) {
    console.error('getTask failed:', error);
    throw error;
  }
}

/**
 * Get all tasks
 *
 * @returns {Promise<Array>} All tasks
 */
export async function getAllTasks() {
  try {
    return await withTransaction(['tasks'], 'readonly', async (tx) => {
      const store = tx.objectStore('tasks');
      return await getAllFromStore(store);
    });
  } catch (error) {
    console.error('getAllTasks failed:', error);
    throw error;
  }
}

/**
 * Get all tasks for a collection
 *
 * @param {string} collectionId - Collection ID
 * @returns {Promise<Array>} Tasks in collection
 */
export async function getTasksByCollection(collectionId) {
  try {
    return await withTransaction(['tasks'], 'readonly', async (tx) => {
      const store = tx.objectStore('tasks');
      const index = store.index('collectionId');
      return await getAllFromIndex(index, collectionId);
    });
  } catch (error) {
    console.error('getTasksByCollection failed:', error);
    throw error;
  }
}

/**
 * Get tasks by index
 * Generic query helper for any index
 *
 * @param {string} indexName - Index name (status, priority, dueDate, tags, createdAt)
 * @param {*} value - Value to match
 * @returns {Promise<Array>} Matching tasks
 */
export async function getTasksByIndex(indexName, value) {
  try {
    return await withTransaction(['tasks'], 'readonly', async (tx) => {
      const store = tx.objectStore('tasks');
      const index = store.index(indexName);
      return await getAllFromIndex(index, value);
    });
  } catch (error) {
    console.error(`getTasksByIndex(${indexName}) failed:`, error);
    throw error;
  }
}

/**
 * Save task (create or update)
 *
 * @param {Object} task - Task object
 * @returns {Promise<string>} Task ID
 */
export async function saveTask(task) {
  try {
    return await withTransaction(['tasks'], 'readwrite', async (tx) => {
      const store = tx.objectStore('tasks');
      return await putInStore(store, task);
    });
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      throw error;
    }
    console.error('saveTask failed:', error);
    throw error;
  }
}

/**
 * Delete task
 * No cascade (tasks don't own tabs)
 *
 * @param {string} id - Task ID
 * @returns {Promise<void>}
 */
export async function deleteTask(id) {
  try {
    await withTransaction(['tasks'], 'readwrite', async (tx) => {
      const store = tx.objectStore('tasks');
      await deleteFromStore(store, id);
    });
  } catch (error) {
    console.error('deleteTask failed:', error);
    throw error;
  }
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Save multiple tabs in a single transaction
 * Useful for bulk updates or folder operations
 *
 * @param {Array<Object>} tabs - Array of tab objects
 * @returns {Promise<Array<string>>} Array of tab IDs
 */
export async function saveTabs(tabs) {
  try {
    return await withTransaction(['tabs'], 'readwrite', async (tx) => {
      const store = tx.objectStore('tabs');
      const ids = [];

      for (const tab of tabs) {
        const id = await putInStore(store, tab);
        ids.push(id);
      }

      return ids;
    });
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      throw error;
    }
    console.error('saveTabs failed:', error);
    throw error;
  }
}

/**
 * Save multiple folders in a single transaction
 * Useful for collection operations
 *
 * @param {Array<Object>} folders - Array of folder objects
 * @returns {Promise<Array<string>>} Array of folder IDs
 */
export async function saveFolders(folders) {
  try {
    return await withTransaction(['folders'], 'readwrite', async (tx) => {
      const store = tx.objectStore('folders');
      const ids = [];

      for (const folder of folders) {
        const id = await putInStore(store, folder);
        ids.push(id);
      }

      return ids;
    });
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      throw error;
    }
    console.error('saveFolders failed:', error);
    throw error;
  }
}

/**
 * Get complete collection hierarchy
 * Returns collection with nested folders and tabs
 *
 * @param {string} collectionId - Collection ID
 * @returns {Promise<Object|null>} Collection with folders and tabs, or null
 */
export async function getCompleteCollection(collectionId) {
  try {
    return await withTransaction(['collections', 'folders', 'tabs', 'tasks'], 'readonly', async (tx) => {
      // Get collection
      const collectionStore = tx.objectStore('collections');
      const collection = await getFromStore(collectionStore, collectionId);

      if (!collection) {
        return null;
      }

      // Get folders
      const folderStore = tx.objectStore('folders');
      const folderIndex = folderStore.index('collectionId');
      const folders = await getAllFromIndex(folderIndex, collectionId);

      // Get tabs for each folder and collect all tabs
      const tabStore = tx.objectStore('tabs');
      const allCollectionTabs = [];

      for (const folder of folders) {
        const tabIndex = tabStore.index('folderId');
        folder.tabs = await getAllFromIndex(tabIndex, folder.id);
        // Sort tabs by position
        folder.tabs.sort((a, b) => a.position - b.position);
        // Collect for flat array
        allCollectionTabs.push(...folder.tabs);
      }

      // Get ungrouped tabs (folderId === null) for this collection
      // Note: Can't use index query for null, so we filter all tabs
      const allTabs = await getAllFromStore(tabStore);
      const ungroupedTabs = allTabs.filter(tab =>
        tab.folderId === null && tab.collectionId === collectionId
      );
      // Sort ungrouped tabs by position (window-level ordering)
      ungroupedTabs.sort((a, b) => a.position - b.position);
      // Add to flat array
      allCollectionTabs.push(...ungroupedTabs);

      // Get tasks for this collection
      const taskStore = tx.objectStore('tasks');
      const taskIndex = taskStore.index('collectionId');
      const tasks = await getAllFromIndex(taskIndex, collectionId);

      // Sort folders by position
      folders.sort((a, b) => a.position - b.position);

      return {
        ...collection,
        folders,
        ungroupedTabs,
        tabs: allCollectionTabs, // Flat array of ALL tabs for dashboard compatibility
        tasks // Tasks array for dashboard compatibility
      };
    });
  } catch (error) {
    console.error('getCompleteCollection failed:', error);
    throw error;
  }
}

/**
 * Find tab by Chrome tab ID (runtime ID)
 * Reverse lookup for tab moved/updated events
 *
 * Uses the tabId index for O(1) lookup instead of full table scan.
 *
 * @param {number} chromeTabId - Chrome tab ID
 * @returns {Promise<Object|null>} Tab with matching tabId, or null
 */
export async function findTabByRuntimeId(chromeTabId) {
  try {
    return await withTransaction(['tabs'], 'readonly', async (tx) => {
      const store = tx.objectStore('tabs');
      const index = store.index('tabId');
      const results = await getAllFromIndex(index, chromeTabId);

      // Return first match (should only be one tab per runtime ID)
      return results.length > 0 ? results[0] : null;
    });
  } catch (error) {
    console.error('findTabByRuntimeId failed:', error);
    throw error;
  }
}
