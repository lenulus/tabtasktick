/**
 * E2E test for IndexedDB functionality
 *
 * Tests Phase 1 IndexedDB operations using real Chrome IndexedDB
 * This validates schema creation, CRUD operations, and index queries
 * that were failing with fake-indexeddb.
 */

import { test, expect } from './fixtures/extension.js';

test.describe('IndexedDB - Phase 1 Validation', () => {
  test('extension loads and creates database schema', async ({ serviceWorkerPage, extensionId }) => {
    // Verify extension loaded
    expect(extensionId).toBeTruthy();
    expect(extensionId).toMatch(/^[a-z]{32}$/); // Chrome extension ID format

    // Execute code in service worker context to test db initialization
    const dbCreated = await serviceWorkerPage.evaluate(async () => {
      // Import and initialize database
      const { initialize, getDBStats } = await import('./services/utils/db.js');

      await initialize();
      const stats = await getDBStats();

      return {
        collections: stats.collections.total,
        folders: stats.folders.total,
        tabs: stats.tabs.total,
        tasks: stats.tasks.total
      };
    });

    // Database should be initialized with empty stores
    expect(dbCreated.collections).toBe(0);
    expect(dbCreated.folders).toBe(0);
    expect(dbCreated.tabs).toBe(0);
    expect(dbCreated.tasks).toBe(0);
  });

  test('can save and retrieve collections', async ({ serviceWorkerPage }) => {
    const result = await serviceWorkerPage.evaluate(async () => {
      const { saveCollection, getCollection, getAllCollections } =
        await import('./services/utils/storage-queries.js');

      // Save a collection
      const collection = {
        id: 'test_col_1',
        name: 'Test Collection',
        description: 'E2E test collection',
        tags: ['test', 'e2e'],
        isActive: true,
        metadata: {
          createdAt: Date.now(),
          lastAccessed: Date.now()
        }
      };

      await saveCollection(collection);

      // Retrieve by ID
      const retrieved = await getCollection('test_col_1');

      // Get all collections
      const all = await getAllCollections();

      return {
        retrieved,
        allCount: all.length
      };
    });

    expect(result.retrieved).toBeTruthy();
    expect(result.retrieved.name).toBe('Test Collection');
    expect(result.retrieved.tags).toEqual(['test', 'e2e']);
    expect(result.allCount).toBe(1);
  });

  test('index queries work correctly (THE CRITICAL TEST)', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      // Import modules in the page context (works because it's a regular page, not service worker)
      const { saveCollection, getCollectionsByIndex, getAllCollections } =
        await import('./services/utils/storage-queries.js');
      const { clearAllData } = await import('./services/utils/db.js');

      // Clear any existing data
      await clearAllData();

      // Save multiple collections with different isActive values
      await saveCollection({
        id: 'active_1',
        name: 'Active Collection 1',
        tags: ['work'],
        isActive: true,
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await saveCollection({
        id: 'active_2',
        name: 'Active Collection 2',
        tags: ['personal'],
        isActive: true,
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await saveCollection({
        id: 'saved_1',
        name: 'Saved Collection',
        tags: ['archive'],
        isActive: false,
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      // Query using index - THIS IS THE TEST THAT FAILED WITH fake-indexeddb
      const activeCollections = await getCollectionsByIndex('isActive', true);
      const savedCollections = await getCollectionsByIndex('isActive', false);
      const workTagged = await getCollectionsByIndex('tags', 'work');

      return {
        activeCount: activeCollections.length,
        activeIds: activeCollections.map(c => c.id).sort(),
        savedCount: savedCollections.length,
        savedIds: savedCollections.map(c => c.id),
        workTaggedCount: workTagged.length,
        workTaggedIds: workTagged.map(c => c.id)
      };
    });

    // Boolean index query
    expect(result.activeCount).toBe(2);
    expect(result.activeIds).toEqual(['active_1', 'active_2']);
    expect(result.savedCount).toBe(1);
    expect(result.savedIds).toEqual(['saved_1']);

    // Multi-entry index query (tags)
    expect(result.workTaggedCount).toBe(1);
    expect(result.workTaggedIds).toEqual(['active_1']);
  });

  test('can save and query tasks with indexes', async ({ serviceWorkerPage }) => {
    const result = await serviceWorkerPage.evaluate(async () => {
      const { saveTask, getTasksByIndex } =
        await import('./services/utils/storage-queries.js');
      const { clearAllData } = await import('./services/utils/db.js');

      await clearAllData();

      const now = Date.now();

      // Save tasks with different statuses and priorities
      await saveTask({
        id: 'task_1',
        summary: 'High priority task',
        status: 'open',
        priority: 'high',
        dueDate: now + 86400000,
        tags: ['urgent'],
        collectionId: 'col_1',
        tabIds: [],
        comments: [],
        createdAt: now
      });

      await saveTask({
        id: 'task_2',
        summary: 'Medium priority task',
        status: 'active',
        priority: 'medium',
        dueDate: now + 172800000,
        tags: ['normal'],
        collectionId: 'col_1',
        tabIds: [],
        comments: [],
        createdAt: now
      });

      await saveTask({
        id: 'task_3',
        summary: 'Completed task',
        status: 'fixed',
        priority: 'low',
        dueDate: now - 86400000,
        tags: ['done'],
        collectionId: 'col_2',
        tabIds: [],
        comments: [],
        createdAt: now,
        completedAt: now
      });

      // Query by various indexes
      const openTasks = await getTasksByIndex('status', 'open');
      const highPriorityTasks = await getTasksByIndex('priority', 'high');
      const col1Tasks = await getTasksByIndex('collectionId', 'col_1');
      const urgentTasks = await getTasksByIndex('tags', 'urgent');

      return {
        openCount: openTasks.length,
        highPriorityCount: highPriorityTasks.length,
        col1Count: col1Tasks.length,
        col1Ids: col1Tasks.map(t => t.id).sort(),
        urgentCount: urgentTasks.length
      };
    });

    expect(result.openCount).toBe(1);
    expect(result.highPriorityCount).toBe(1);
    expect(result.col1Count).toBe(2);
    expect(result.col1Ids).toEqual(['task_1', 'task_2']);
    expect(result.urgentCount).toBe(1);
  });

  test('cascade deletion works correctly', async ({ serviceWorkerPage }) => {
    const result = await serviceWorkerPage.evaluate(async () => {
      const {
        saveCollection,
        saveFolder,
        saveTab,
        saveTask,
        deleteCollection,
        getAllCollections,
        getFoldersByCollection,
        getTasksByCollection
      } = await import('./services/utils/storage-queries.js');
      const { clearAllData } = await import('./services/utils/db.js');

      await clearAllData();

      // Create collection with folders, tabs, and tasks
      await saveCollection({
        id: 'cascade_col',
        name: 'Collection to Delete',
        tags: [],
        isActive: true,
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await saveFolder({
        id: 'cascade_folder',
        collectionId: 'cascade_col',
        name: 'Test Folder',
        color: 'blue',
        collapsed: false,
        position: 0
      });

      await saveTab({
        id: 'cascade_tab',
        folderId: 'cascade_folder',
        url: 'https://example.com',
        title: 'Example',
        position: 0
      });

      await saveTask({
        id: 'cascade_task',
        summary: 'Task to cascade delete',
        status: 'open',
        priority: 'medium',
        collectionId: 'cascade_col',
        tabIds: [],
        tags: [],
        comments: [],
        createdAt: Date.now()
      });

      // Delete collection (should cascade)
      await deleteCollection('cascade_col');

      // Verify cascade deletion
      const collections = await getAllCollections();
      const folders = await getFoldersByCollection('cascade_col');
      const tasks = await getTasksByCollection('cascade_col');

      return {
        collectionsCount: collections.length,
        foldersCount: folders.length,
        tasksCount: tasks.length
      };
    });

    expect(result.collectionsCount).toBe(0);
    expect(result.foldersCount).toBe(0);
    expect(result.tasksCount).toBe(0);
  });
});
