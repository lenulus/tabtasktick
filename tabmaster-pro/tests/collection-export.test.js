/**
 * @file CollectionExportService Tests
 * @description Unit tests for collection export functionality
 */
import { jest } from '@jest/globals';

import * as CollectionExportService from '../services/execution/CollectionExportService.js';
import * as storageQueries from '../services/utils/storage-queries.js';

describe('CollectionExportService', () => {
  beforeEach(() => {
    // Mock chrome.downloads API (not in default chrome-mock)
    if (!chrome.downloads) {
      chrome.downloads = {};
    }
    chrome.downloads.download = jest.fn((options, callback) => {
      callback(12345); // Mock download ID
    });
    chrome.runtime.lastError = null;

    // Mock URL.createObjectURL
    global.URL = {
      createObjectURL: jest.fn(() => 'blob:mock-url'),
      revokeObjectURL: jest.fn()
    };

    // Mock Blob
    global.Blob = class Blob {
      constructor(parts, options) {
        this.parts = parts;
        this.options = options;
      }
    };
  });

  describe('exportCollection', () => {
    test('should export a single collection with all data', async () => {
      // Mock data
      const mockCollection = {
        id: 'col_123',
        name: 'Test Collection',
        description: 'Test description',
        icon: '📁',
        color: '#667eea',
        tags: ['work', 'test'],
        settings: { trackingEnabled: true },
        metadata: { createdAt: 1000, lastAccessed: 2000 }
      };

      const mockFolders = [
        {
          id: 'folder_1',
          collectionId: 'col_123',
          name: 'Folder 1',
          color: 'blue',
          collapsed: false,
          position: 0,
          tabs: []
        }
      ];

      const mockTabs = [
        {
          id: 'tab_1',
          folderId: 'folder_1',
          url: 'https://example.com',
          title: 'Example',
          favicon: 'https://example.com/favicon.ico',
          note: 'Test note',
          position: 0,
          isPinned: false
        }
      ];

      const mockTasks = [
        {
          id: 'task_1',
          collectionId: 'col_123',
          summary: 'Test task',
          status: 'open',
          priority: 'high',
          tabIds: ['tab_1'],
          tags: [],
          comments: []
        }
      ];

      // Mock storage queries
      jest.spyOn(storageQueries, 'getCollection').mockResolvedValue(mockCollection);
      jest.spyOn(storageQueries, 'getFoldersByCollection').mockResolvedValue(mockFolders);
      jest.spyOn(storageQueries, 'getTabsByFolder').mockImplementation(async (folderId) => {
        if (folderId === 'folder_1') {
          return mockTabs;
        }
        return [];
      });
      jest.spyOn(storageQueries, 'getTasksByCollection').mockResolvedValue(mockTasks);

      // Export
      const result = await CollectionExportService.exportCollection('col_123', {
        includeTasks: true,
        includeSettings: true,
        includeMetadata: false
      });

      // Assertions
      expect(result.filename).toMatch(/^collection-test-collection-\d+\.json$/);
      expect(result.downloadUrl).toBe('blob:mock-url');
      expect(result.downloadId).toBe(12345);
      expect(result.data.version).toBe('1.0');
      expect(result.data.collections).toHaveLength(1);

      const exportedCollection = result.data.collections[0];
      expect(exportedCollection.name).toBe('Test Collection');
      expect(exportedCollection.description).toBe('Test description');
      expect(exportedCollection.icon).toBe('📁');
      expect(exportedCollection.color).toBe('#667eea');
      expect(exportedCollection.tags).toEqual(['work', 'test']);
      expect(exportedCollection.settings).toEqual({ trackingEnabled: true });
      expect(exportedCollection.metadata).toBeUndefined(); // includeMetadata: false
      expect(exportedCollection.folders).toHaveLength(1);
      expect(exportedCollection.folders[0].name).toBe('Folder 1');
      expect(exportedCollection.folders[0].tabs).toHaveLength(1);
      expect(exportedCollection.folders[0].tabs[0].url).toBe('https://example.com');
      expect(exportedCollection.tasks).toHaveLength(1);
      expect(exportedCollection.tasks[0].summary).toBe('Test task');
    });

    test('should export collection without tasks when includeTasks is false', async () => {
      const mockCollection = {
        id: 'col_456',
        name: 'No Tasks Collection',
        tags: []
      };

      jest.spyOn(storageQueries, 'getCollection').mockResolvedValue(mockCollection);
      jest.spyOn(storageQueries, 'getFoldersByCollection').mockResolvedValue([]);
      jest.spyOn(storageQueries, 'getTabsByFolder').mockResolvedValue([]);

      const result = await CollectionExportService.exportCollection('col_456', {
        includeTasks: false
      });

      const exportedCollection = result.data.collections[0];
      expect(exportedCollection.tasks).toBeUndefined();
    });

    test('should export collection without settings when includeSettings is false', async () => {
      const mockCollection = {
        id: 'col_789',
        name: 'No Settings Collection',
        tags: [],
        settings: { trackingEnabled: true }
      };

      jest.spyOn(storageQueries, 'getCollection').mockResolvedValue(mockCollection);
      jest.spyOn(storageQueries, 'getFoldersByCollection').mockResolvedValue([]);
      jest.spyOn(storageQueries, 'getTabsByFolder').mockResolvedValue([]);

      const result = await CollectionExportService.exportCollection('col_789', {
        includeSettings: false
      });

      const exportedCollection = result.data.collections[0];
      expect(exportedCollection.settings).toBeUndefined();
    });

    test('should export collection with metadata when includeMetadata is true', async () => {
      const mockCollection = {
        id: 'col_101',
        name: 'With Metadata',
        tags: [],
        metadata: { createdAt: 1000, lastAccessed: 2000 }
      };

      jest.spyOn(storageQueries, 'getCollection').mockResolvedValue(mockCollection);
      jest.spyOn(storageQueries, 'getFoldersByCollection').mockResolvedValue([]);
      jest.spyOn(storageQueries, 'getTabsByFolder').mockResolvedValue([]);

      const result = await CollectionExportService.exportCollection('col_101', {
        includeMetadata: true
      });

      const exportedCollection = result.data.collections[0];
      expect(exportedCollection.metadata).toEqual({ createdAt: 1000, lastAccessed: 2000 });
    });

    test('should throw error if collection not found', async () => {
      jest.spyOn(storageQueries, 'getCollection').mockResolvedValue(null);

      await expect(CollectionExportService.exportCollection('nonexistent')).rejects.toThrow(
        'Collection not found: nonexistent'
      );
    });

    test('should generate safe filename from collection name', async () => {
      const mockCollection = {
        id: 'col_special',
        name: 'Test! @Collection# $With% Special&* Chars',
        tags: []
      };

      jest.spyOn(storageQueries, 'getCollection').mockResolvedValue(mockCollection);
      jest.spyOn(storageQueries, 'getFoldersByCollection').mockResolvedValue([]);
      jest.spyOn(storageQueries, 'getTabsByFolder').mockResolvedValue([]);

      const result = await CollectionExportService.exportCollection('col_special');

      expect(result.filename).toMatch(/^collection-test-collection-with-special-chars-\d+\.json$/);
    });
  });

  describe('exportCollections', () => {
    test('should export multiple collections', async () => {
      const mockCollections = [
        { id: 'col_1', name: 'Collection 1', tags: [] },
        { id: 'col_2', name: 'Collection 2', tags: [] }
      ];

      jest.spyOn(storageQueries, 'getCollection').mockImplementation(async (id) => {
        return mockCollections.find(c => c.id === id) || null;
      });
      jest.spyOn(storageQueries, 'getFoldersByCollection').mockResolvedValue([]);
      jest.spyOn(storageQueries, 'getTabsByFolder').mockResolvedValue([]);

      const result = await CollectionExportService.exportCollections(['col_1', 'col_2']);

      expect(result.filename).toMatch(/^collections-export-2-\d+\.json$/);
      expect(result.count).toBe(2);
      expect(result.data.collections).toHaveLength(2);
      expect(result.data.collections[0].name).toBe('Collection 1');
      expect(result.data.collections[1].name).toBe('Collection 2');
    });

    test('should throw error if any collection not found', async () => {
      jest.spyOn(storageQueries, 'getCollection').mockImplementation(async (id) => {
        if (id === 'col_1') return { id: 'col_1', name: 'Collection 1', tags: [] };
        return null;
      });

      await expect(
        CollectionExportService.exportCollections(['col_1', 'nonexistent'])
      ).rejects.toThrow('Collection not found: nonexistent');
    });
  });

  describe('tab reference conversion', () => {
    test('should convert task tab IDs to folder/tab indices with fallback identifiers', async () => {
      const mockCollection = {
        id: 'col_ref',
        name: 'References Test',
        tags: []
      };

      const mockFolders = [
        {
          id: 'folder_1',
          name: 'Folder 1',
          color: 'blue',
          position: 0,
          tabs: []
        },
        {
          id: 'folder_2',
          name: 'Folder 2',
          color: 'red',
          position: 1,
          tabs: []
        }
      ];

      const mockTabs1 = [
        { id: 'tab_1', url: 'https://a.com', title: 'A', position: 0, isPinned: false },
        { id: 'tab_2', url: 'https://b.com', title: 'B', position: 1, isPinned: false }
      ];

      const mockTabs2 = [
        { id: 'tab_3', url: 'https://c.com', title: 'C', position: 0, isPinned: false }
      ];

      const mockTasks = [
        {
          id: 'task_1',
          summary: 'Test task with references',
          status: 'open',
          priority: 'medium',
          tabIds: ['tab_2', 'tab_3'],
          tags: [],
          comments: []
        }
      ];

      jest.spyOn(storageQueries, 'getCollection').mockResolvedValue(mockCollection);
      jest.spyOn(storageQueries, 'getFoldersByCollection').mockResolvedValue(mockFolders);
      jest.spyOn(storageQueries, 'getTabsByFolder').mockImplementation(async (folderId) => {
        if (folderId === 'folder_1') return mockTabs1;
        if (folderId === 'folder_2') return mockTabs2;
        return [];
      });
      jest.spyOn(storageQueries, 'getTasksByCollection').mockResolvedValue(mockTasks);

      const result = await CollectionExportService.exportCollection('col_ref', {
        includeTasks: true
      });

      const task = result.data.collections[0].tasks[0];
      expect(task.tabReferences).toEqual([
        { folderIndex: 0, tabIndex: 1, url: 'https://b.com', title: 'B' }, // tab_2 in folder_1
        { folderIndex: 1, tabIndex: 0, url: 'https://c.com', title: 'C' }  // tab_3 in folder_2
      ]);
    });

    test('should include url and title in tab references for fallback recovery', async () => {
      const mockCollection = {
        id: 'col_fallback',
        name: 'Fallback Test',
        tags: []
      };

      const mockFolder = {
        id: 'folder_1',
        name: 'Test Folder',
        color: 'blue',
        position: 0,
        tabs: []
      };

      const mockTab = {
        id: 'tab_1',
        url: 'https://example.com/page',
        title: 'Example Page',
        position: 0,
        isPinned: false
      };

      const mockTask = {
        id: 'task_1',
        summary: 'Task',
        tabIds: ['tab_1'],
        tags: [],
        comments: []
      };

      jest.spyOn(storageQueries, 'getCollection').mockResolvedValue(mockCollection);
      jest.spyOn(storageQueries, 'getFoldersByCollection').mockResolvedValue([mockFolder]);
      jest.spyOn(storageQueries, 'getTabsByFolder').mockResolvedValue([mockTab]);
      jest.spyOn(storageQueries, 'getTasksByCollection').mockResolvedValue([mockTask]);

      const result = await CollectionExportService.exportCollection('col_fallback', {
        includeTasks: true
      });

      const ref = result.data.collections[0].tasks[0].tabReferences[0];
      expect(ref).toHaveProperty('folderIndex', 0);
      expect(ref).toHaveProperty('tabIndex', 0);
      expect(ref).toHaveProperty('url', 'https://example.com/page');
      expect(ref).toHaveProperty('title', 'Example Page');
    });
  });
});
