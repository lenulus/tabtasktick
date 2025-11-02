/**
 * @file CollectionImportService Tests
 * @description Integration tests for collection import functionality
 *
 * Uses fake-indexeddb for testing the full import flow without mocking ES modules.
 * This approach follows the pattern from collection-export.test.js which successfully
 * tests services that use IndexedDB storage.
 */

import 'fake-indexeddb/auto';
import { jest } from '@jest/globals';
import { closeDB } from '../services/utils/db.js';
import * as CollectionImportService from '../services/execution/CollectionImportService.js';
import * as CollectionService from '../services/execution/CollectionService.js';
import * as FolderService from '../services/execution/FolderService.js';
import * as TabService from '../services/execution/TabService.js';
import * as TaskService from '../services/execution/TaskService.js';
import * as storageQueries from '../services/utils/storage-queries.js';

describe('CollectionImportService', () => {
  beforeEach(async () => {
    // Close any existing connection and clear all databases
    closeDB();
    const databases = await indexedDB.databases();
    for (const db of databases) {
      indexedDB.deleteDatabase(db.name);
    }

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    closeDB();
  });

  describe('importCollections', () => {
    test('should import a valid single collection', async () => {
      const importData = {
        version: '1.0',
        exportedAt: Date.now(),
        collections: [
          {
            name: 'Imported Collection',
            description: 'Test description',
            icon: '📁',
            color: '#667eea',
            tags: ['test'],
            folders: [
              {
                name: 'Folder 1',
                color: 'blue',
                collapsed: false,
                position: 0,
                tabs: [
                  {
                    url: 'https://example.com',
                    title: 'Example',
                    position: 0,
                    isPinned: false
                  }
                ]
              }
            ],
            tasks: [
              {
                summary: 'Test task',
                status: 'open',
                priority: 'medium',
                tabReferences: [{ folderIndex: 0, tabIndex: 0 }]
              }
            ]
          }
        ]
      };

      const result = await CollectionImportService.importCollections(importData);

      expect(result.stats.collectionsImported).toBe(1);
      expect(result.imported).toHaveLength(1);
      expect(result.imported[0].name).toBe('Imported Collection');
      expect(result.errors).toHaveLength(0);

      // Verify the collection was actually created
      const collections = await storageQueries.getAllCollections();
      expect(collections).toHaveLength(1);
      expect(collections[0].name).toBe('Imported Collection');
      expect(collections[0].description).toBe('Test description');
      expect(collections[0].icon).toBe('📁');
      expect(collections[0].color).toBe('#667eea');
      expect(collections[0].tags).toEqual(['test']);
    });

    test('should import multiple collections', async () => {
      const importData = {
        version: '1.0',
        exportedAt: Date.now(),
        collections: [
          {
            name: 'Collection 1',
            tags: [],
            folders: []
          },
          {
            name: 'Collection 2',
            tags: [],
            folders: []
          }
        ]
      };

      const result = await CollectionImportService.importCollections(importData);

      expect(result.stats.collectionsImported).toBe(2);
      expect(result.imported).toHaveLength(2);
      expect(result.imported[0].name).toBe('Collection 1');
      expect(result.imported[1].name).toBe('Collection 2');

      // Verify both collections were created
      const collections = await storageQueries.getAllCollections();
      expect(collections).toHaveLength(2);
      const names = collections.map(c => c.name).sort();
      expect(names).toEqual(['Collection 1', 'Collection 2']);
    });

    test('should handle invalid JSON', async () => {
      const invalidJSON = '{invalid json';

      await expect(
        CollectionImportService.importCollections(invalidJSON)
      ).rejects.toThrow(/Invalid JSON/);
    });

    test('should reject unsupported version', async () => {
      const importData = {
        version: '2.0', // Unsupported
        exportedAt: Date.now(),
        collections: []
      };

      await expect(
        CollectionImportService.importCollections(importData)
      ).rejects.toThrow(/Unsupported import version/);
    });

    test('should reject missing version field', async () => {
      const importData = {
        exportedAt: Date.now(),
        collections: []
      };

      await expect(
        CollectionImportService.importCollections(importData)
      ).rejects.toThrow(/missing version field/);
    });

    test('should reject missing collections array', async () => {
      const importData = {
        version: '1.0',
        exportedAt: Date.now()
      };

      await expect(
        CollectionImportService.importCollections(importData)
      ).rejects.toThrow(/missing collections array/);
    });

    test('should reject empty collections array', async () => {
      const importData = {
        version: '1.0',
        exportedAt: Date.now(),
        collections: []
      };

      await expect(
        CollectionImportService.importCollections(importData)
      ).rejects.toThrow(/contains no collections/);
    });

    test('should skip collection with missing name', async () => {
      const importData = {
        version: '1.0',
        exportedAt: Date.now(),
        collections: [
          {
            // Missing name
            description: 'Test',
            tags: [],
            folders: []
          }
        ]
      };

      const result = await CollectionImportService.importCollections(importData);

      expect(result.imported).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toMatch(/name is required/);

      // Verify no collection was created
      const collections = await storageQueries.getAllCollections();
      expect(collections).toHaveLength(0);
    });

    test('should resolve name conflicts by appending suffix', async () => {
      // Create existing collection with same name
      await CollectionService.createCollection({
        name: 'Test Collection',
        tags: []
      });

      const importData = {
        version: '1.0',
        exportedAt: Date.now(),
        collections: [
          {
            name: 'Test Collection',
            tags: [],
            folders: []
          }
        ]
      };

      const result = await CollectionImportService.importCollections(importData);

      expect(result.imported).toHaveLength(1);
      expect(result.imported[0].name).toBe('Test Collection (imported)');

      // Verify both collections exist
      const collections = await storageQueries.getAllCollections();
      expect(collections).toHaveLength(2);
      const names = collections.map(c => c.name).sort();
      expect(names).toEqual(['Test Collection', 'Test Collection (imported)']);
    });

    test('should resolve multiple name conflicts incrementally', async () => {
      // Create existing collections
      await CollectionService.createCollection({
        name: 'Test',
        tags: []
      });
      await CollectionService.createCollection({
        name: 'Test (imported)',
        tags: []
      });

      const importData = {
        version: '1.0',
        exportedAt: Date.now(),
        collections: [
          {
            name: 'Test',
            tags: [],
            folders: []
          }
        ]
      };

      const result = await CollectionImportService.importCollections(importData);

      expect(result.imported).toHaveLength(1);
      expect(result.imported[0].name).toBe('Test (imported 2)');

      // Verify all three collections exist
      const collections = await storageQueries.getAllCollections();
      expect(collections).toHaveLength(3);
      const names = new Set(collections.map(c => c.name));
      expect(names).toEqual(new Set(['Test', 'Test (imported)', 'Test (imported 2)']));
    });

    test('should import collections as saved (isActive=false)', async () => {
      const importData = {
        version: '1.0',
        exportedAt: Date.now(),
        collections: [
          {
            name: 'Test',
            tags: [],
            folders: []
          }
        ]
      };

      const result = await CollectionImportService.importCollections(importData);

      // Verify collection is not active
      const collections = await storageQueries.getAllCollections();
      expect(collections).toHaveLength(1);
      expect(collections[0].isActive).toBe(false);
      expect(collections[0].windowId).toBeNull(); // windowId is null when not active
    });

    test('should convert tab references from indices to new IDs', async () => {
      const importData = {
        version: '1.0',
        exportedAt: Date.now(),
        collections: [
          {
            name: 'Test',
            tags: [],
            folders: [
              {
                name: 'Folder 1',
                color: 'blue',
                position: 0,
                tabs: [
                  { url: 'https://a.com', title: 'A', position: 0, isPinned: false },
                  { url: 'https://b.com', title: 'B', position: 1, isPinned: false }
                ]
              }
            ],
            tasks: [
              {
                summary: 'Test task',
                status: 'open',
                priority: 'medium',
                tabReferences: [
                  { folderIndex: 0, tabIndex: 1 }
                ]
              }
            ]
          }
        ]
      };

      const result = await CollectionImportService.importCollections(importData);

      // Get the created task and verify it has correct tab references
      const collections = await storageQueries.getAllCollections();
      const tasks = await TaskService.getTasksByCollection(collections[0].id);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].tabIds).toHaveLength(1);

      // The tab ID should reference the second tab (index 1)
      const completeCollection = await storageQueries.getCompleteCollection(collections[0].id);
      const secondTab = completeCollection.tabs.find(t => t.url === 'https://b.com');
      expect(tasks[0].tabIds[0]).toBe(secondTab.id);
    });

    test('should remove invalid tab references and warn', async () => {
      const importData = {
        version: '1.0',
        exportedAt: Date.now(),
        collections: [
          {
            name: 'Test',
            tags: [],
            folders: [
              {
                name: 'Folder 1',
                color: 'blue',
                position: 0,
                tabs: [
                  { url: 'https://a.com', title: 'A', position: 0, isPinned: false }
                ]
              }
            ],
            tasks: [
              {
                summary: 'Test task',
                status: 'open',
                priority: 'medium',
                tabReferences: [
                  { folderIndex: 0, tabIndex: 0 },
                  { folderIndex: 0, tabIndex: 99 }, // Invalid - tab doesn't exist
                  { folderIndex: 99, tabIndex: 0 }  // Invalid - folder doesn't exist
                ]
              }
            ]
          }
        ]
      };

      const result = await CollectionImportService.importCollections(importData);

      // Should have warnings
      expect(result.stats.warnings.length).toBeGreaterThan(0);

      // Verify task only has valid reference
      const collections = await storageQueries.getAllCollections();
      const tasks = await TaskService.getTasksByCollection(collections[0].id);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].tabIds).toHaveLength(1); // Only one valid reference
    });

    test('should skip folders with missing required fields', async () => {
      const importData = {
        version: '1.0',
        exportedAt: Date.now(),
        collections: [
          {
            name: 'Test',
            tags: [],
            folders: [
              {
                // Missing name
                color: 'blue',
                position: 0,
                tabs: []
              },
              {
                name: 'Valid Folder',
                color: 'red',
                position: 1,
                tabs: []
              }
            ]
          }
        ]
      };

      const result = await CollectionImportService.importCollections(importData);

      // Should have warnings
      expect(result.stats.warnings.length).toBeGreaterThan(0);

      // Verify only valid folder was created
      const collections = await storageQueries.getAllCollections();
      const folders = await FolderService.getFoldersByCollection(collections[0].id);
      expect(folders).toHaveLength(1);
      expect(folders[0].name).toBe('Valid Folder');
    });

    test('should use merge mode by default', async () => {
      // Create existing collection
      await CollectionService.createCollection({
        name: 'Existing Collection',
        tags: []
      });

      const importData = {
        version: '1.0',
        exportedAt: Date.now(),
        collections: [
          {
            name: 'Test',
            tags: [],
            folders: []
          }
        ]
      };

      await CollectionImportService.importCollections(importData, { mode: 'merge' });

      // Should NOT delete existing collection
      const collections = await storageQueries.getAllCollections();
      expect(collections).toHaveLength(2);
      const names = collections.map(c => c.name).sort();
      expect(names).toEqual(['Existing Collection', 'Test']);
    });

    test('should not import tasks when importTasks is false', async () => {
      const importData = {
        version: '1.0',
        exportedAt: Date.now(),
        collections: [
          {
            name: 'Test',
            tags: [],
            folders: [],
            tasks: [
              {
                summary: 'Should not import',
                status: 'open',
                priority: 'medium'
              }
            ]
          }
        ]
      };

      await CollectionImportService.importCollections(importData, {
        importTasks: false
      });

      // Verify no tasks were created
      const collections = await storageQueries.getAllCollections();
      const tasks = await TaskService.getTasksByCollection(collections[0].id);
      expect(tasks).toHaveLength(0);
    });

    test('should use fallback URL matching when indices do not match', async () => {
      const importData = {
        version: '1.0',
        exportedAt: Date.now(),
        collections: [
          {
            name: 'Test',
            tags: [],
            folders: [
              {
                name: 'Folder 1',
                color: 'blue',
                position: 0,
                tabs: [
                  { url: 'https://a.com', title: 'A', position: 0, isPinned: false },
                  { url: 'https://b.com', title: 'B', position: 1, isPinned: false }
                ]
              }
            ],
            tasks: [
              {
                summary: 'Test task',
                status: 'open',
                priority: 'medium',
                tabReferences: [
                  // Reference by index (wrong index) + URL (correct for fallback)
                  { folderIndex: 99, tabIndex: 99, url: 'https://b.com', title: 'B' }
                ]
              }
            ]
          }
        ]
      };

      const result = await CollectionImportService.importCollections(importData);

      // Should have warning about using fallback
      expect(result.stats.warnings.length).toBeGreaterThan(0);
      expect(result.stats.warnings.some(w => w.includes('matched by URL instead'))).toBe(true);

      // Verify task has correct tab reference (matched by URL)
      const collections = await storageQueries.getAllCollections();
      const tasks = await TaskService.getTasksByCollection(collections[0].id);
      const completeCollection = await storageQueries.getCompleteCollection(collections[0].id);
      const matchedTab = completeCollection.tabs.find(t => t.url === 'https://b.com');
      expect(tasks[0].tabIds[0]).toBe(matchedTab.id);
    });

    test('should handle tab references with new format (url and title)', async () => {
      const importData = {
        version: '1.0',
        exportedAt: Date.now(),
        collections: [
          {
            name: 'Test',
            tags: [],
            folders: [
              {
                name: 'Folder 1',
                color: 'blue',
                position: 0,
                tabs: [
                  { url: 'https://example.com', title: 'Example', position: 0, isPinned: false }
                ]
              }
            ],
            tasks: [
              {
                summary: 'Task with new format',
                status: 'open',
                priority: 'medium',
                tabReferences: [
                  { folderIndex: 0, tabIndex: 0, url: 'https://example.com', title: 'Example' }
                ]
              }
            ]
          }
        ]
      };

      const result = await CollectionImportService.importCollections(importData);

      // Verify task has correct tab reference
      const collections = await storageQueries.getAllCollections();
      const tasks = await TaskService.getTasksByCollection(collections[0].id);
      const completeCollection = await storageQueries.getCompleteCollection(collections[0].id);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].tabIds).toHaveLength(1);
      expect(tasks[0].tabIds[0]).toBe(completeCollection.tabs[0].id);
    });
  });
});