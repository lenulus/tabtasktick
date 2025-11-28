/**
 * Unit tests for IndexedDB utilities (db.js)
 *
 * Tests database connection, schema initialization, transactions, and error handling.
 * Uses fake-indexeddb for in-memory database simulation.
 */

import 'fake-indexeddb/auto';
import { IDBKeyRange } from 'fake-indexeddb';
import {
  getDB,
  closeDB,
  withTransaction,
  QuotaExceededError,
  getAllFromIndex,
  getFromStore,
  putInStore,
  deleteFromStore,
  getAllFromStore,
  getDBStats,
  clearAllData,
  initialize
} from '../services/utils/db.js';

describe('db.js - IndexedDB Utilities', () => {
  beforeEach(async () => {
    // Close any existing connection before each test
    closeDB();

    // Clear all databases
    const databases = await indexedDB.databases();
    for (const db of databases) {
      indexedDB.deleteDatabase(db.name);
    }
  });

  afterEach(() => {
    closeDB();
  });

  describe('getDB', () => {
    test('opens database successfully', async () => {
      const db = await getDB();
      expect(db).toBeDefined();
      expect(db.name).toBe('TabTaskTickDB');
      expect(db.version).toBe(4); // Current version with Progressive Sync migration
    });

    test('creates all 4 object stores', async () => {
      const db = await getDB();

      expect(db.objectStoreNames.contains('collections')).toBe(true);
      expect(db.objectStoreNames.contains('folders')).toBe(true);
      expect(db.objectStoreNames.contains('tabs')).toBe(true);
      expect(db.objectStoreNames.contains('tasks')).toBe(true);
      expect(db.objectStoreNames.length).toBe(4);
    });

    test('creates indexes for collections store', async () => {
      const db = await getDB();
      const tx = db.transaction(['collections'], 'readonly');
      const store = tx.objectStore('collections');

      expect(store.indexNames.contains('isActive')).toBe(true);
      expect(store.indexNames.contains('tags')).toBe(true);
      expect(store.indexNames.contains('lastAccessed')).toBe(true);
      expect(store.indexNames.length).toBe(3);
    });

    test('creates indexes for folders store', async () => {
      const db = await getDB();
      const tx = db.transaction(['folders'], 'readonly');
      const store = tx.objectStore('folders');

      expect(store.indexNames.contains('collectionId')).toBe(true);
      expect(store.indexNames.length).toBe(1);
    });

    test('creates indexes for tabs store', async () => {
      const db = await getDB();
      const tx = db.transaction(['tabs'], 'readonly');
      const store = tx.objectStore('tabs');

      expect(store.indexNames.contains('folderId')).toBe(true);
      expect(store.indexNames.contains('collectionId')).toBe(true); // Added in v3 for Progressive Sync
      expect(store.indexNames.length).toBe(3);
    });

    test('creates indexes for tasks store', async () => {
      const db = await getDB();
      const tx = db.transaction(['tasks'], 'readonly');
      const store = tx.objectStore('tasks');

      expect(store.indexNames.contains('collectionId')).toBe(true);
      expect(store.indexNames.contains('status')).toBe(true);
      expect(store.indexNames.contains('priority')).toBe(true);
      expect(store.indexNames.contains('dueDate')).toBe(true);
      expect(store.indexNames.contains('tags')).toBe(true);
      expect(store.indexNames.contains('createdAt')).toBe(true);
      expect(store.indexNames.length).toBe(6);
    });

    test('returns singleton instance (same connection)', async () => {
      const db1 = await getDB();
      const db2 = await getDB();

      expect(db1).toBe(db2);
    });

    test('tags index is multi-entry', async () => {
      const db = await getDB();
      const tx = db.transaction(['collections'], 'readonly');
      const store = tx.objectStore('collections');
      const tagsIndex = store.index('tags');

      expect(tagsIndex.multiEntry).toBe(true);
    });

    test('task tags index is multi-entry', async () => {
      const db = await getDB();
      const tx = db.transaction(['tasks'], 'readonly');
      const store = tx.objectStore('tasks');
      const tagsIndex = store.index('tags');

      expect(tagsIndex.multiEntry).toBe(true);
    });
  });

  describe('closeDB', () => {
    test('closes database connection', async () => {
      const db1 = await getDB();
      expect(db1).toBeDefined();

      closeDB();

      // Next call should create new connection
      const db2 = await getDB();
      expect(db2).toBeDefined();
      expect(db2).not.toBe(db1); // Different instance
    });

    test('handles multiple close calls gracefully', () => {
      closeDB();
      closeDB();
      // Should not throw
    });
  });

  describe('withTransaction', () => {
    test('executes function within transaction', async () => {
      await getDB(); // Initialize

      const result = await withTransaction(['collections'], 'readwrite', async (tx) => {
        const store = tx.objectStore('collections');
        await putInStore(store, {
          id: 'col_test',
          name: 'Test',
          tags: [],
          isActive: false,
          metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
        });
        return { success: true };
      });

      expect(result.success).toBe(true);

      // Verify data was saved
      const saved = await withTransaction(['collections'], 'readonly', async (tx) => {
        const store = tx.objectStore('collections');
        return await getFromStore(store, 'col_test');
      });

      expect(saved.name).toBe('Test');
    });

    test('returns result from transaction function', async () => {
      await getDB();

      const result = await withTransaction(['collections'], 'readonly', async (tx) => {
        return { answer: 42 };
      });

      expect(result.answer).toBe(42);
    });

    test('rolls back on error', async () => {
      // Times out in fake-indexeddb environment
      await getDB();

      // First, save a record
      await withTransaction(['collections'], 'readwrite', async (tx) => {
        const store = tx.objectStore('collections');
        await putInStore(store, {
          id: 'col_rollback',
          name: 'Original',
          tags: [],
          isActive: false,
          metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
        });
      });

      // Try to update but throw error
      try {
        await withTransaction(['collections'], 'readwrite', async (tx) => {
          const store = tx.objectStore('collections');
          await putInStore(store, {
            id: 'col_rollback',
            name: 'Modified',
            tags: [],
            isActive: false,
            metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
          });
          throw new Error('Test error');
        });
      } catch (error) {
        // Expected
      }

      // Verify data was NOT modified
      const saved = await withTransaction(['collections'], 'readonly', async (tx) => {
        const store = tx.objectStore('collections');
        return await getFromStore(store, 'col_rollback');
      });

      expect(saved.name).toBe('Original'); // Not 'Modified'
    });

    test('handles multiple stores in transaction', async () => {
      await getDB();

      await withTransaction(['collections', 'folders'], 'readwrite', async (tx) => {
        const collectionStore = tx.objectStore('collections');
        const folderStore = tx.objectStore('folders');

        await putInStore(collectionStore, {
          id: 'col_multi',
          name: 'Multi',
          tags: [],
          isActive: false,
          metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
        });

        await putInStore(folderStore, {
          id: 'folder_multi',
          collectionId: 'col_multi',
          name: 'Folder',
          color: 'blue',
          collapsed: false,
          position: 0
        });
      });

      // Verify both were saved
      const collection = await withTransaction(['collections'], 'readonly', async (tx) => {
        const store = tx.objectStore('collections');
        return await getFromStore(store, 'col_multi');
      });

      const folder = await withTransaction(['folders'], 'readonly', async (tx) => {
        const store = tx.objectStore('folders');
        return await getFromStore(store, 'folder_multi');
      });

      expect(collection).toBeDefined();
      expect(folder).toBeDefined();
      expect(folder.collectionId).toBe('col_multi');
    });

    test.skip('throws QuotaExceededError on quota issues - SKIPPED: cannot simulate quota errors in fake-indexeddb', async () => {
      const db = await getDB();

      // Create a promise that will test the error handling
      const testPromise = new Promise(async (resolve, reject) => {
        const tx = db.transaction(['collections'], 'readwrite');

        // Set up transaction to simulate quota exceeded
        const quotaError = new Error('Quota exceeded');
        quotaError.name = 'QuotaExceededError';

        // Manually trigger the error event
        setTimeout(() => {
          tx.error = quotaError;
          if (tx.onerror) {
            tx.onerror();
          }
        }, 10);

        // Set up our withTransaction handlers on this transaction
        tx.oncomplete = () => resolve('should not complete');
        tx.onerror = () => {
          if (tx.error && tx.error.name === 'QuotaExceededError') {
            reject(new QuotaExceededError('IndexedDB quota exceeded. Try deleting old collections or archiving data.'));
          } else {
            reject(new Error('Wrong error type'));
          }
        };
      });

      await expect(testPromise).rejects.toThrow(QuotaExceededError);
      await expect(testPromise).rejects.toThrow('IndexedDB quota exceeded');
    });
  });

  describe('Helper Functions', () => {
    test('getAllFromIndex retrieves all records matching index', async () => {
      // Uses index.getAll() - see KNOWN_LIMITATIONS.md
      await getDB();

      // Save multiple collections with same isActive value
      await withTransaction(['collections'], 'readwrite', async (tx) => {
        const store = tx.objectStore('collections');
        await putInStore(store, {
          id: 'col_1',
          name: 'Active 1',
          tags: [],
          isActive: true,
          metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
        });
        await putInStore(store, {
          id: 'col_2',
          name: 'Active 2',
          tags: [],
          isActive: true,
          metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
        });
        await putInStore(store, {
          id: 'col_3',
          name: 'Saved',
          tags: [],
          isActive: false,
          metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
        });
      });

      // Query active collections
      const activeCollections = await withTransaction(['collections'], 'readonly', async (tx) => {
        const store = tx.objectStore('collections');
        const index = store.index('isActive');
        return await getAllFromIndex(index, true);
      });

      expect(activeCollections).toHaveLength(2);
      expect(activeCollections.every(c => c.isActive)).toBe(true);
    });

    test('getFromStore retrieves single record', async () => {
      await getDB();

      await withTransaction(['collections'], 'readwrite', async (tx) => {
        const store = tx.objectStore('collections');
        await putInStore(store, {
          id: 'col_get',
          name: 'Get Test',
          tags: [],
          isActive: false,
          metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
        });
      });

      const result = await withTransaction(['collections'], 'readonly', async (tx) => {
        const store = tx.objectStore('collections');
        return await getFromStore(store, 'col_get');
      });

      expect(result.name).toBe('Get Test');
    });

    test('getFromStore returns undefined for non-existent key', async () => {
      await getDB();

      const result = await withTransaction(['collections'], 'readonly', async (tx) => {
        const store = tx.objectStore('collections');
        return await getFromStore(store, 'nonexistent');
      });

      expect(result).toBeUndefined();
    });

    test('putInStore saves record', async () => {
      await getDB();

      const id = await withTransaction(['collections'], 'readwrite', async (tx) => {
        const store = tx.objectStore('collections');
        return await putInStore(store, {
          id: 'col_put',
          name: 'Put Test',
          tags: [],
          isActive: false,
          metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
        });
      });

      expect(id).toBe('col_put');
    });

    test('deleteFromStore removes record', async () => {
      await getDB();

      // Save then delete
      await withTransaction(['collections'], 'readwrite', async (tx) => {
        const store = tx.objectStore('collections');
        await putInStore(store, {
          id: 'col_delete',
          name: 'Delete Test',
          tags: [],
          isActive: false,
          metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
        });
      });

      await withTransaction(['collections'], 'readwrite', async (tx) => {
        const store = tx.objectStore('collections');
        await deleteFromStore(store, 'col_delete');
      });

      const result = await withTransaction(['collections'], 'readonly', async (tx) => {
        const store = tx.objectStore('collections');
        return await getFromStore(store, 'col_delete');
      });

      expect(result).toBeUndefined();
    });

    test('getAllFromStore retrieves all records', async () => {
      await getDB();

      await withTransaction(['collections'], 'readwrite', async (tx) => {
        const store = tx.objectStore('collections');
        await putInStore(store, {
          id: 'col_all_1',
          name: 'All 1',
          tags: [],
          isActive: false,
          metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
        });
        await putInStore(store, {
          id: 'col_all_2',
          name: 'All 2',
          tags: [],
          isActive: false,
          metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
        });
      });

      const all = await withTransaction(['collections'], 'readonly', async (tx) => {
        const store = tx.objectStore('collections');
        return await getAllFromStore(store);
      });

      expect(all).toHaveLength(2);
    });
  });

  describe('getDBStats', () => {
    test('returns empty statistics for new database', async () => {
      await getDB();

      const stats = await getDBStats();

      expect(stats.collections.total).toBe(0);
      expect(stats.collections.active).toBe(0);
      expect(stats.collections.saved).toBe(0);
      expect(stats.folders.total).toBe(0);
      expect(stats.tabs.total).toBe(0);
      expect(stats.tasks.total).toBe(0);
    });

    test('returns accurate statistics with data', async () => {
      await getDB();

      // Add test data
      await withTransaction(['collections', 'folders', 'tabs', 'tasks'], 'readwrite', async (tx) => {
        // 2 collections (1 active, 1 saved)
        await putInStore(tx.objectStore('collections'), {
          id: 'col_1',
          name: 'Active',
          tags: [],
          isActive: true,
          metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
        });
        await putInStore(tx.objectStore('collections'), {
          id: 'col_2',
          name: 'Saved',
          tags: [],
          isActive: false,
          metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
        });

        // 1 folder
        await putInStore(tx.objectStore('folders'), {
          id: 'folder_1',
          collectionId: 'col_1',
          name: 'Folder',
          color: 'blue',
          collapsed: false,
          position: 0
        });

        // 2 tabs
        await putInStore(tx.objectStore('tabs'), {
          id: 'tab_1',
          folderId: 'folder_1',
          url: 'https://example.com',
          title: 'Example',
          position: 0
        });
        await putInStore(tx.objectStore('tabs'), {
          id: 'tab_2',
          folderId: 'folder_1',
          url: 'https://example.org',
          title: 'Example Org',
          position: 1
        });

        // 3 tasks (different statuses)
        await putInStore(tx.objectStore('tasks'), {
          id: 'task_1',
          summary: 'Open task',
          status: 'open',
          priority: 'medium',
          tags: [],
          collectionId: 'col_1',
          tabIds: [],
          comments: [],
          createdAt: Date.now()
        });
        await putInStore(tx.objectStore('tasks'), {
          id: 'task_2',
          summary: 'Active task',
          status: 'active',
          priority: 'high',
          tags: [],
          collectionId: 'col_1',
          tabIds: [],
          comments: [],
          createdAt: Date.now()
        });
        await putInStore(tx.objectStore('tasks'), {
          id: 'task_3',
          summary: 'Fixed task',
          status: 'fixed',
          priority: 'low',
          tags: [],
          collectionId: 'col_1',
          tabIds: [],
          comments: [],
          createdAt: Date.now(),
          completedAt: Date.now()
        });
      });

      const stats = await getDBStats();

      expect(stats.collections.total).toBe(2);
      expect(stats.collections.active).toBe(1);
      expect(stats.collections.saved).toBe(1);
      expect(stats.folders.total).toBe(1);
      expect(stats.tabs.total).toBe(2);
      expect(stats.tasks.total).toBe(3);
      expect(stats.tasks.open).toBe(1);
      expect(stats.tasks.active).toBe(1);
      expect(stats.tasks.fixed).toBe(1);
      expect(stats.tasks.abandoned).toBe(0);
    });
  });

  describe('clearAllData', () => {
    test('clears all data from all stores', async () => {
      await getDB();

      // Add data to all stores
      await withTransaction(['collections', 'folders', 'tabs', 'tasks'], 'readwrite', async (tx) => {
        await putInStore(tx.objectStore('collections'), {
          id: 'col_clear',
          name: 'Clear Test',
          tags: [],
          isActive: false,
          metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
        });
        await putInStore(tx.objectStore('folders'), {
          id: 'folder_clear',
          collectionId: 'col_clear',
          name: 'Folder',
          color: 'blue',
          collapsed: false,
          position: 0
        });
        await putInStore(tx.objectStore('tabs'), {
          id: 'tab_clear',
          folderId: 'folder_clear',
          url: 'https://example.com',
          title: 'Example',
          position: 0
        });
        await putInStore(tx.objectStore('tasks'), {
          id: 'task_clear',
          summary: 'Task',
          status: 'open',
          priority: 'medium',
          tags: [],
          collectionId: 'col_clear',
          tabIds: [],
          comments: [],
          createdAt: Date.now()
        });
      });

      // Clear all
      await clearAllData();

      // Verify empty
      const stats = await getDBStats();
      expect(stats.collections.total).toBe(0);
      expect(stats.folders.total).toBe(0);
      expect(stats.tabs.total).toBe(0);
      expect(stats.tasks.total).toBe(0);
    });
  });

  describe('initialize', () => {
    test('initializes database successfully', async () => {
      closeDB();

      await initialize();

      // Should be able to use database
      const stats = await getDBStats();
      expect(stats).toBeDefined();
    });

    test('can be called multiple times safely', async () => {
      await initialize();
      await initialize();
      // Should not throw
    });
  });
});
