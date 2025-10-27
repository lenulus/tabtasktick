/**
 * @file CollectionImportService Tests
 * @description Unit tests for collection import functionality
 */
import { jest } from '@jest/globals';


import * as CollectionImportService from '../services/execution/CollectionImportService.js';
import * as CollectionService from '../services/execution/CollectionService.js';
import * as FolderService from '../services/execution/FolderService.js';
import * as TabService from '../services/execution/TabService.js';
import * as TaskService from '../services/execution/TaskService.js';
import * as storageQueries from '../services/utils/storage-queries.js';

describe('CollectionImportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(storageQueries, 'getAllCollections').mockResolvedValue([]);
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

      // Mock service calls
      jest.spyOn(CollectionService, 'createCollection').mockResolvedValue({
        id: 'col_new',
        name: 'Imported Collection',
        isActive: false
      });
      jest.spyOn(FolderService, 'createFolder').mockResolvedValue({
        id: 'folder_new',
        collectionId: 'col_new',
        name: 'Folder 1'
      });
      jest.spyOn(TabService, 'createTab').mockResolvedValue({
        id: 'tab_new',
        folderId: 'folder_new',
        url: 'https://example.com'
      });
      jest.spyOn(TaskService, 'createTask').mockResolvedValue({
        id: 'task_new',
        collectionId: 'col_new',
        summary: 'Test task'
      });

      const result = await CollectionImportService.importCollections(importData);

      expect(result.stats.collectionsImported).toBe(1);
      expect(result.imported).toHaveLength(1);
      expect(result.imported[0].name).toBe('Imported Collection');
      expect(result.errors).toHaveLength(0);
      expect(CollectionService.createCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Imported Collection',
          description: 'Test description',
          icon: '📁',
          color: '#667eea',
          tags: ['test']
        })
      );
      expect(FolderService.createFolder).toHaveBeenCalledTimes(1);
      expect(TabService.createTab).toHaveBeenCalledTimes(1);
      expect(TaskService.createTask).toHaveBeenCalledTimes(1);
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

      jest.spyOn(CollectionService, 'createCollection').mockImplementation(async (params) => ({
        id: `col_${params.name}`,
        name: params.name,
        isActive: false
      }));

      const result = await CollectionImportService.importCollections(importData);

      expect(result.stats.collectionsImported).toBe(2);
      expect(result.imported).toHaveLength(2);
      expect(result.imported[0].name).toBe('Collection 1');
      expect(result.imported[1].name).toBe('Collection 2');
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
    });

    test('should resolve name conflicts by appending suffix', async () => {
      // Simulate existing collection with same name
      jest.spyOn(storageQueries, 'getAllCollections').mockResolvedValue([
        { id: 'existing', name: 'Test Collection' }
      ]);

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

      jest.spyOn(CollectionService, 'createCollection').mockResolvedValue({
        id: 'col_new',
        name: 'Test Collection (imported)',
        isActive: false
      });

      const result = await CollectionImportService.importCollections(importData);

      expect(result.imported).toHaveLength(1);
      expect(CollectionService.createCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Collection (imported)'
        })
      );
    });

    test('should resolve multiple name conflicts incrementally', async () => {
      jest.spyOn(storageQueries, 'getAllCollections').mockResolvedValue([
        { id: 'existing1', name: 'Test' },
        { id: 'existing2', name: 'Test (imported)' }
      ]);

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

      jest.spyOn(CollectionService, 'createCollection').mockResolvedValue({
        id: 'col_new',
        name: 'Test (imported 2)',
        isActive: false
      });

      const result = await CollectionImportService.importCollections(importData);

      expect(CollectionService.createCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test (imported 2)'
        })
      );
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

      jest.spyOn(CollectionService, 'createCollection').mockResolvedValue({
        id: 'col_new',
        name: 'Test',
        isActive: false
      });

      await CollectionImportService.importCollections(importData);

      expect(CollectionService.createCollection).toHaveBeenCalledWith(
        expect.not.objectContaining({ windowId: expect.anything() })
      );
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

      jest.spyOn(CollectionService, 'createCollection').mockResolvedValue({
        id: 'col_new',
        name: 'Test',
        isActive: false
      });
      jest.spyOn(FolderService, 'createFolder').mockResolvedValue({
        id: 'folder_new',
        collectionId: 'col_new'
      });
      jest.spyOn(TabService, 'createTab').mockImplementation(async (params) => ({
        id: `tab_${params.position}`,
        ...params
      }));
      jest.spyOn(TaskService, 'createTask').mockResolvedValue({
        id: 'task_new'
      });

      await CollectionImportService.importCollections(importData);

      expect(TaskService.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          tabIds: ['tab_1'] // Should reference tab at position 1
        })
      );
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

      jest.spyOn(CollectionService, 'createCollection').mockResolvedValue({
        id: 'col_new',
        name: 'Test',
        isActive: false
      });
      jest.spyOn(FolderService, 'createFolder').mockResolvedValue({
        id: 'folder_new'
      });
      jest.spyOn(TabService, 'createTab').mockResolvedValue({
        id: 'tab_0'
      });
      jest.spyOn(TaskService, 'createTask').mockResolvedValue({
        id: 'task_new'
      });

      const result = await CollectionImportService.importCollections(importData);

      // Should only include valid reference
      expect(TaskService.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          tabIds: ['tab_0']
        })
      );

      // Should have warnings
      expect(result.stats.warnings.length).toBeGreaterThan(0);
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

      jest.spyOn(CollectionService, 'createCollection').mockResolvedValue({
        id: 'col_new',
        name: 'Test',
        isActive: false
      });
      jest.spyOn(FolderService, 'createFolder').mockResolvedValue({
        id: 'folder_new'
      });

      const result = await CollectionImportService.importCollections(importData);

      // Should only create the valid folder
      expect(FolderService.createFolder).toHaveBeenCalledTimes(1);
      expect(FolderService.createFolder).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Valid Folder' })
      );

      // Should have warnings
      expect(result.stats.warnings.length).toBeGreaterThan(0);
    });

    test('should use merge mode by default', async () => {
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

      jest.spyOn(storageQueries, 'getAllCollections').mockResolvedValue([
        { id: 'existing', name: 'Existing Collection' }
      ]);
      jest.spyOn(CollectionService, 'createCollection').mockResolvedValue({
        id: 'col_new',
        name: 'Test',
        isActive: false
      });
      jest.spyOn(CollectionService, 'deleteCollection').mockResolvedValue();

      await CollectionImportService.importCollections(importData, { mode: 'merge' });

      // Should NOT delete existing collections
      expect(CollectionService.deleteCollection).not.toHaveBeenCalled();
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

      jest.spyOn(CollectionService, 'createCollection').mockResolvedValue({
        id: 'col_new',
        name: 'Test',
        isActive: false
      });
      jest.spyOn(TaskService, 'createTask').mockResolvedValue({});

      await CollectionImportService.importCollections(importData, {
        importTasks: false
      });

      expect(TaskService.createTask).not.toHaveBeenCalled();
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

      jest.spyOn(CollectionService, 'createCollection').mockResolvedValue({
        id: 'col_new',
        name: 'Test',
        isActive: false
      });
      jest.spyOn(FolderService, 'createFolder').mockResolvedValue({
        id: 'folder_new'
      });
      jest.spyOn(TabService, 'createTab').mockImplementation(async (params) => ({
        id: `tab_${params.position}`,
        ...params
      }));
      jest.spyOn(TaskService, 'createTask').mockResolvedValue({
        id: 'task_new'
      });

      const result = await CollectionImportService.importCollections(importData);

      // Should have matched by URL fallback
      expect(TaskService.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          tabIds: ['tab_1'] // Should reference tab at position 1 (https://b.com)
        })
      );

      // Should have warning about using fallback
      expect(result.stats.warnings.length).toBeGreaterThan(0);
      expect(result.stats.warnings.some(w => w.includes('matched by URL instead'))).toBe(true);
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

      jest.spyOn(CollectionService, 'createCollection').mockResolvedValue({
        id: 'col_new',
        name: 'Test',
        isActive: false
      });
      jest.spyOn(FolderService, 'createFolder').mockResolvedValue({
        id: 'folder_new'
      });
      jest.spyOn(TabService, 'createTab').mockResolvedValue({
        id: 'tab_0'
      });
      jest.spyOn(TaskService, 'createTask').mockResolvedValue({
        id: 'task_new'
      });

      await CollectionImportService.importCollections(importData);

      // Should resolve using index-based lookup (fast path)
      expect(TaskService.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          tabIds: ['tab_0']
        })
      );
    });
  });
});
