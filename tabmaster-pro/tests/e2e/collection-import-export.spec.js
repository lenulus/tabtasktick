/**
 * E2E Tests for Collection Import/Export
 *
 * Tests the complete import/export workflow including:
 * - Export single collection
 * - Export multiple collections
 * - Import collections
 * - Name conflict resolution
 * - Data integrity verification
 * - Error handling
 */

import { test, expect } from './fixtures/extension.js';
import { setTimeout } from 'timers/promises';

test.describe('Collection Import/Export', () => {
  test.beforeEach(async ({ testPage }) => {
    // Clear all data before each test to ensure clean state
    await testPage.evaluate(async () => {
      const { clearAllData } = await import('./services/utils/db.js');
      await clearAllData();
    });
  });

  test('should export a single collection with all data', async ({ testPage }) => {
    // Create a collection with folders, tabs, and tasks
    const result = await testPage.evaluate(async () => {
      const CollectionService = await import('./services/execution/CollectionService.js');
      const FolderService = await import('./services/execution/FolderService.js');
      const TabService = await import('./services/execution/TabService.js');
      const TaskService = await import('./services/execution/TaskService.js');
      const { exportCollection } = await import('./services/execution/CollectionExportService.js');

      // Create collection
      const collection = await CollectionService.createCollection({
        name: 'Test Export Collection',
        description: 'Test description',
        icon: '📁',
        color: '#667eea',
        tags: ['test', 'export']
      });

      // Create folder
      const folder = await FolderService.createFolder({
        collectionId: collection.id,
        name: 'Test Folder',
        color: 'blue',
        position: 0,
        collapsed: false
      });

      // Create tabs
      const tab1 = await TabService.createTab({
        folderId: folder.id,
        url: 'https://example.com',
        title: 'Example Site',
        position: 0,
        isPinned: false,
        note: 'Test note'
      });

      const tab2 = await TabService.createTab({
        folderId: folder.id,
        url: 'https://test.com',
        title: 'Test Site',
        position: 1,
        isPinned: true
      });

      // Create task with tab references
      const task = await TaskService.createTask({
        collectionId: collection.id,
        summary: 'Test task',
        notes: 'Task notes',
        status: 'open',
        priority: 'high',
        tabIds: [tab1.id, tab2.id],
        tags: ['important']
      });

      // Export (mock download since we can't actually download in tests)
      // We'll just get the data object instead of triggering download
      const { data } = await exportCollection(collection.id, {
        includeTasks: true,
        includeSettings: true,
        includeMetadata: false
      });

      return {
        originalCollectionId: collection.id,
        exportData: data
      };
    });

    // Verify export data structure
    expect(result.exportData.version).toBe('1.0');
    expect(result.exportData.collections).toHaveLength(1);

    const exported = result.exportData.collections[0];
    expect(exported.name).toBe('Test Export Collection');
    expect(exported.description).toBe('Test description');
    expect(exported.icon).toBe('📁');
    expect(exported.color).toBe('#667eea');
    expect(exported.tags).toEqual(['test', 'export']);
    expect(exported.folders).toHaveLength(1);
    expect(exported.folders[0].name).toBe('Test Folder');
    expect(exported.folders[0].tabs).toHaveLength(2);
    expect(exported.folders[0].tabs[0].url).toBe('https://example.com');
    expect(exported.folders[0].tabs[0].note).toBe('Test note');
    expect(exported.folders[0].tabs[1].isPinned).toBe(true);
    expect(exported.tasks).toHaveLength(1);
    expect(exported.tasks[0].summary).toBe('Test task');
    expect(exported.tasks[0].priority).toBe('high');
    expect(exported.tasks[0].tabReferences).toEqual([
      { folderIndex: 0, tabIndex: 0 },
      { folderIndex: 0, tabIndex: 1 }
    ]);
  });

  test('should import a collection and create it in the database', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { importCollections } = await import('./services/execution/CollectionImportService.js');
      const { getAllCollections } = await import('./services/utils/storage-queries.js');

      const importData = {
        version: '1.0',
        exportedAt: Date.now(),
        collections: [
          {
            name: 'Imported Collection',
            description: 'Imported description',
            icon: '📥',
            color: '#FF5722',
            tags: ['imported'],
            folders: [
              {
                name: 'Imported Folder',
                color: 'red',
                collapsed: false,
                position: 0,
                tabs: [
                  {
                    url: 'https://imported.com',
                    title: 'Imported Tab',
                    position: 0,
                    isPinned: false,
                    note: 'Imported note'
                  }
                ]
              }
            ],
            tasks: [
              {
                summary: 'Imported task',
                status: 'open',
                priority: 'medium',
                tabReferences: [{ folderIndex: 0, tabIndex: 0 }]
              }
            ]
          }
        ]
      };

      const importResult = await importCollections(importData, {
        mode: 'merge',
        importTasks: true,
        importSettings: true
      });

      // Verify collection was created
      const collections = await getAllCollections();

      return {
        importResult,
        collections
      };
    });

    // Verify import succeeded
    expect(result.importResult.imported).toHaveLength(1);
    expect(result.importResult.errors).toHaveLength(0);
    expect(result.importResult.stats.collectionsImported).toBe(1);
    expect(result.importResult.stats.foldersImported).toBe(1);
    expect(result.importResult.stats.tabsImported).toBe(1);
    expect(result.importResult.stats.tasksImported).toBe(1);

    // Verify collection exists in database
    expect(result.collections).toHaveLength(1);
    expect(result.collections[0].name).toBe('Imported Collection');
    expect(result.collections[0].isActive).toBe(false); // Always imported as saved
  });

  test('should maintain data integrity through export → import cycle', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const CollectionService = await import('./services/execution/CollectionService.js');
      const FolderService = await import('./services/execution/FolderService.js');
      const TabService = await import('./services/execution/TabService.js');
      const TaskService = await import('./services/execution/TaskService.js');
      const { exportCollection } = await import('./services/execution/CollectionExportService.js');
      const { importCollections } = await import('./services/execution/CollectionImportService.js');
      const { getCompleteCollection } = await import('./services/utils/storage-queries.js');

      // Create original collection
      const collection = await CollectionService.createCollection({
        name: 'Integrity Test',
        description: 'Testing data integrity',
        icon: '🔒',
        color: '#4CAF50',
        tags: ['integrity', 'test']
      });

      const folder = await FolderService.createFolder({
        collectionId: collection.id,
        name: 'Folder 1',
        color: 'green',
        position: 0
      });

      const tab = await TabService.createTab({
        folderId: folder.id,
        url: 'https://integrity-test.com',
        title: 'Integrity Test Tab',
        position: 0,
        note: 'Important note'
      });

      const task = await TaskService.createTask({
        collectionId: collection.id,
        summary: 'Verify integrity',
        status: 'in_progress',
        priority: 'high',
        tabIds: [tab.id]
      });

      // Export
      const { data: exportData } = await exportCollection(collection.id, {
        includeTasks: true,
        includeSettings: true,
        includeMetadata: false
      });

      // Delete original collection
      await CollectionService.deleteCollection(collection.id);

      // Import
      const importResult = await importCollections(exportData, {
        mode: 'merge',
        importTasks: true
      });

      // Get the imported collection
      const importedCollectionId = importResult.imported[0].id;
      const importedCollection = await getCompleteCollection(importedCollectionId);

      return {
        original: {
          name: 'Integrity Test',
          description: 'Testing data integrity',
          icon: '🔒',
          color: '#4CAF50',
          tags: ['integrity', 'test'],
          folderName: 'Folder 1',
          tabUrl: 'https://integrity-test.com',
          tabNote: 'Important note'
        },
        imported: {
          name: importedCollection.name,
          description: importedCollection.description,
          icon: importedCollection.icon,
          color: importedCollection.color,
          tags: importedCollection.tags,
          folderName: importedCollection.folders[0].name,
          tabUrl: importedCollection.folders[0].tabs[0].url,
          tabNote: importedCollection.folders[0].tabs[0].note
        }
      };
    });

    // Verify data integrity
    expect(result.imported).toEqual(result.original);
  });

  test('should export multiple collections', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const CollectionService = await import('./services/execution/CollectionService.js');
      const { exportCollections } = await import('./services/execution/CollectionExportService.js');

      // Create multiple collections
      const col1 = await CollectionService.createCollection({
        name: 'Collection 1',
        tags: ['one']
      });

      const col2 = await CollectionService.createCollection({
        name: 'Collection 2',
        tags: ['two']
      });

      const col3 = await CollectionService.createCollection({
        name: 'Collection 3',
        tags: ['three']
      });

      // Export all
      const { data } = await exportCollections([col1.id, col2.id, col3.id]);

      return {
        count: data.collections.length,
        names: data.collections.map(c => c.name)
      };
    });

    expect(result.count).toBe(3);
    expect(result.names).toEqual(['Collection 1', 'Collection 2', 'Collection 3']);
  });

  test('should resolve name conflicts with suffix', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const CollectionService = await import('./services/execution/CollectionService.js');
      const { importCollections } = await import('./services/execution/CollectionImportService.js');
      const { getAllCollections } = await import('./services/utils/storage-queries.js');

      // Create existing collection
      await CollectionService.createCollection({
        name: 'Duplicate Name',
        tags: []
      });

      // Import collection with same name
      const importData = {
        version: '1.0',
        exportedAt: Date.now(),
        collections: [
          {
            name: 'Duplicate Name',
            tags: ['imported'],
            folders: []
          }
        ]
      };

      await importCollections(importData, { mode: 'merge' });

      // Get all collections
      const collections = await getAllCollections();

      return {
        count: collections.length,
        names: collections.map(c => c.name).sort()
      };
    });

    expect(result.count).toBe(2);
    expect(result.names).toEqual(['Duplicate Name', 'Duplicate Name (imported)']);
  });

  test('should handle multiple name conflicts incrementally', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const CollectionService = await import('./services/execution/CollectionService.js');
      const { importCollections } = await import('./services/execution/CollectionImportService.js');
      const { getAllCollections } = await import('./services/utils/storage-queries.js');

      // Create existing collections
      await CollectionService.createCollection({ name: 'Test', tags: [] });
      await CollectionService.createCollection({ name: 'Test (imported)', tags: [] });

      // Import another with same base name
      const importData = {
        version: '1.0',
        exportedAt: Date.now(),
        collections: [
          { name: 'Test', tags: [], folders: [] }
        ]
      };

      await importCollections(importData, { mode: 'merge' });

      const collections = await getAllCollections();
      return {
        count: collections.length,
        names: collections.map(c => c.name).sort()
      };
    });

    expect(result.count).toBe(3);
    expect(result.names).toEqual(['Test', 'Test (imported)', 'Test (imported 2)']);
  });

  test('should reject invalid JSON with helpful error', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { importCollections } = await import('./services/execution/CollectionImportService.js');

      try {
        await importCollections('{invalid json', { mode: 'merge' });
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid JSON');
  });

  test('should reject unsupported version', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { importCollections } = await import('./services/execution/CollectionImportService.js');

      const importData = {
        version: '99.0', // Unsupported version
        exportedAt: Date.now(),
        collections: []
      };

      try {
        await importCollections(importData, { mode: 'merge' });
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported import version');
  });

  test('should handle partial failures gracefully', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { importCollections } = await import('./services/execution/CollectionImportService.js');

      const importData = {
        version: '1.0',
        exportedAt: Date.now(),
        collections: [
          {
            name: 'Valid Collection',
            tags: [],
            folders: []
          },
          {
            // Missing name - should fail
            tags: [],
            folders: []
          },
          {
            name: 'Another Valid Collection',
            tags: [],
            folders: []
          }
        ]
      };

      const importResult = await importCollections(importData, { mode: 'merge' });

      return {
        imported: importResult.imported.length,
        errors: importResult.errors.length,
        importedNames: importResult.imported.map(c => c.name),
        errorMessages: importResult.errors.map(e => e.error)
      };
    });

    expect(result.imported).toBe(2); // 2 valid collections
    expect(result.errors).toBe(1); // 1 failed collection
    expect(result.importedNames).toEqual(['Valid Collection', 'Another Valid Collection']);
    expect(result.errorMessages[0]).toContain('name is required');
  });

  test('should handle collections with tasks and tab references', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { importCollections } = await import('./services/execution/CollectionImportService.js');
      const { getCompleteCollection } = await import('./services/utils/storage-queries.js');
      const { getTasksByCollection } = await import('./services/utils/storage-queries.js');

      const importData = {
        version: '1.0',
        exportedAt: Date.now(),
        collections: [
          {
            name: 'Task Test Collection',
            tags: [],
            folders: [
              {
                name: 'Folder 1',
                color: 'blue',
                position: 0,
                tabs: [
                  { url: 'https://tab1.com', title: 'Tab 1', position: 0, isPinned: false },
                  { url: 'https://tab2.com', title: 'Tab 2', position: 1, isPinned: false }
                ]
              },
              {
                name: 'Folder 2',
                color: 'red',
                position: 1,
                tabs: [
                  { url: 'https://tab3.com', title: 'Tab 3', position: 0, isPinned: false }
                ]
              }
            ],
            tasks: [
              {
                summary: 'Task with multiple tab refs',
                status: 'open',
                priority: 'high',
                tabReferences: [
                  { folderIndex: 0, tabIndex: 0 },
                  { folderIndex: 0, tabIndex: 1 },
                  { folderIndex: 1, tabIndex: 0 }
                ]
              }
            ]
          }
        ]
      };

      const importResult = await importCollections(importData, {
        mode: 'merge',
        importTasks: true
      });

      const collectionId = importResult.imported[0].id;
      const collection = await getCompleteCollection(collectionId);
      const tasks = await getTasksByCollection(collectionId);

      return {
        folderCount: collection.folders.length,
        totalTabCount: collection.folders.reduce((sum, f) => sum + f.tabs.length, 0),
        taskCount: tasks.length,
        taskTabReferenceCount: tasks[0].tabIds.length
      };
    });

    expect(result.folderCount).toBe(2);
    expect(result.totalTabCount).toBe(3);
    expect(result.taskCount).toBe(1);
    expect(result.taskTabReferenceCount).toBe(3); // Task should reference all 3 tabs
  });

  test('should skip import of tasks when importTasks is false', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { importCollections } = await import('./services/execution/CollectionImportService.js');
      const { getTasksByCollection } = await import('./services/utils/storage-queries.js');

      const importData = {
        version: '1.0',
        exportedAt: Date.now(),
        collections: [
          {
            name: 'No Tasks Import',
            tags: [],
            folders: [],
            tasks: [
              { summary: 'Should not import', status: 'open', priority: 'medium' }
            ]
          }
        ]
      };

      const importResult = await importCollections(importData, {
        mode: 'merge',
        importTasks: false // Don't import tasks
      });

      const collectionId = importResult.imported[0].id;
      const tasks = await getTasksByCollection(collectionId);

      return {
        tasksImported: importResult.stats.tasksImported,
        tasksInDb: tasks.length
      };
    });

    expect(result.tasksImported).toBe(0);
    expect(result.tasksInDb).toBe(0);
  });

  test('performance: should handle importing 50 collections efficiently', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { importCollections } = await import('./services/execution/CollectionImportService.js');
      const { getAllCollections } = await import('./services/utils/storage-queries.js');

      // Generate 50 collections
      const collections = [];
      for (let i = 1; i <= 50; i++) {
        collections.push({
          name: `Collection ${i}`,
          description: `Description for collection ${i}`,
          tags: [`tag${i}`, `group${Math.floor(i / 10)}`],
          folders: [
            {
              name: `Folder ${i}`,
              color: 'blue',
              position: 0,
              tabs: [
                {
                  url: `https://site${i}.com`,
                  title: `Site ${i}`,
                  position: 0,
                  isPinned: false
                }
              ]
            }
          ]
        });
      }

      const importData = {
        version: '1.0',
        exportedAt: Date.now(),
        collections
      };

      const startTime = Date.now();
      const importResult = await importCollections(importData, {
        mode: 'merge',
        importTasks: false
      });
      const duration = Date.now() - startTime;

      const allCollections = await getAllCollections();

      return {
        imported: importResult.imported.length,
        errors: importResult.errors.length,
        totalInDb: allCollections.length,
        duration
      };
    });

    expect(result.imported).toBe(50);
    expect(result.errors).toBe(0);
    expect(result.totalInDb).toBe(50);
    expect(result.duration).toBeLessThan(10000); // Should complete within 10 seconds
  });
});
