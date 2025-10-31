/**
 * @file CollectionExportService Tests (Simplified for refactored architecture)
 * @description Unit tests for collection export functionality using shared builder
 */
import { jest } from '@jest/globals';

import * as CollectionExportService from '../services/execution/CollectionExportService.js';
import * as storageQueries from '../services/utils/storage-queries.js';
import * as collectionExportBuilder from '../services/utils/collectionExportBuilder.js';

describe('CollectionExportService (Refactored)', () => {
  beforeEach(() => {
    // Mock chrome.downloads API (not in default chrome-mock)
    if (!chrome.downloads) {
      chrome.downloads = {};
    }
    chrome.downloads.download = jest.fn((options, callback) => {
      if (callback) callback(12345); // Mock download ID
      return Promise.resolve(12345);
    });
    chrome.runtime.lastError = null;

    // Mock URL and Blob
    global.URL = {
      createObjectURL: jest.fn(() => 'blob:mock-url'),
      revokeObjectURL: jest.fn()
    };
    global.Blob = class Blob {
      constructor(parts, options) {
        this.parts = parts;
        this.options = options;
      }
    };

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('exportCollection', () => {
    test('should export a single collection using shared builder', async () => {
      // Mock collection for validation
      const mockCollection = {
        id: 'col_123',
        name: 'Test Collection',
        description: 'Test description',
        icon: '📁'
      };

      // Mock the shared builder output
      const mockExportData = {
        name: 'Test Collection',
        description: 'Test description',
        icon: '📁',
        color: '#667eea',
        tags: ['work', 'test'],
        settings: { trackingEnabled: true },
        folders: [{
          name: 'Folder 1',
          color: 'blue',
          collapsed: false,
          position: 0,
          tabs: [{
            url: 'https://example.com',
            title: 'Example',
            favicon: 'https://example.com/favicon.ico',
            note: 'Test note',
            position: 0,
            isPinned: false
          }]
        }],
        tasks: [{
          summary: 'Test task',
          notes: '',
          status: 'open',
          priority: 'high',
          tabReferences: [{
            folderIndex: 0,
            tabIndex: 0,
            url: 'https://example.com',
            title: 'Example'
          }]
        }]
      };

      // Setup mocks
      jest.spyOn(storageQueries, 'getCollection').mockResolvedValue(mockCollection);
      jest.spyOn(collectionExportBuilder, 'buildCollectionExport').mockResolvedValue(mockExportData);

      // Execute
      const result = await CollectionExportService.exportCollection('col_123', {
        includeTasks: true,
        includeSettings: true
      });

      // Verify shared builder was called with correct params
      expect(collectionExportBuilder.buildCollectionExport).toHaveBeenCalledWith('col_123', {
        includeTasks: true,
        includeSettings: true
      });

      // Verify result structure
      expect(result.filename).toMatch(/^collection-test-collection-\d+\.json$/);
      expect(result.data).toHaveProperty('version');
      expect(result.data).toHaveProperty('exportedAt');
      expect(result.data.collections).toHaveLength(1);

      // Verify export data
      const exportedCollection = result.data.collections[0];
      expect(exportedCollection.name).toBe('Test Collection');
      expect(exportedCollection.folders).toHaveLength(1);
      expect(exportedCollection.tasks).toHaveLength(1);
    });

    test('should throw error if collection not found', async () => {
      jest.spyOn(storageQueries, 'getCollection').mockResolvedValue(null);

      await expect(
        CollectionExportService.exportCollection('nonexistent')
      ).rejects.toThrow('Collection not found: nonexistent');

      // Should not call builder if collection doesn't exist
      expect(collectionExportBuilder.buildCollectionExport).not.toHaveBeenCalled();
    });

    test('should respect export options passed to shared builder', async () => {
      const mockCollection = { id: 'col_456', name: 'Test' };

      jest.spyOn(storageQueries, 'getCollection').mockResolvedValue(mockCollection);
      jest.spyOn(collectionExportBuilder, 'buildCollectionExport').mockResolvedValue({
        name: 'Test',
        folders: []
      });

      await CollectionExportService.exportCollection('col_456', {
        includeTasks: false,
        includeSettings: false,
        includeMetadata: true
      });

      // Verify options are passed through to builder
      expect(collectionExportBuilder.buildCollectionExport).toHaveBeenCalledWith('col_456', {
        includeTasks: false,
        includeSettings: false,
        includeMetadata: true
      });
    });
  });

  describe('exportCollections', () => {
    test('should export multiple collections using shared builder', async () => {
      const mockCollections = [
        { id: 'col_1', name: 'Collection 1' },
        { id: 'col_2', name: 'Collection 2' }
      ];

      // Mock getCollection for validation
      jest.spyOn(storageQueries, 'getCollection').mockImplementation(async (id) => {
        return mockCollections.find(c => c.id === id) || null;
      });

      // Mock buildMultipleCollectionExports
      jest.spyOn(collectionExportBuilder, 'buildMultipleCollectionExports').mockResolvedValue([
        { name: 'Collection 1', folders: [] },
        { name: 'Collection 2', folders: [] }
      ]);

      const result = await CollectionExportService.exportCollections(['col_1', 'col_2']);

      // Verify shared builder was called
      expect(collectionExportBuilder.buildMultipleCollectionExports).toHaveBeenCalledWith(
        ['col_1', 'col_2'],
        {}
      );

      // Verify result
      expect(result.filename).toMatch(/^collections-export-2-\d+\.json$/);
      expect(result.count).toBe(2);
      expect(result.data.collections).toHaveLength(2);
    });

    test('should validate all collections exist before export', async () => {
      jest.spyOn(storageQueries, 'getCollection').mockImplementation(async (id) => {
        if (id === 'col_1') return { id: 'col_1', name: 'Collection 1' };
        return null;
      });

      await expect(
        CollectionExportService.exportCollections(['col_1', 'nonexistent'])
      ).rejects.toThrow('Collection not found: nonexistent');

      // Should not call builder if validation fails
      expect(collectionExportBuilder.buildMultipleCollectionExports).not.toHaveBeenCalled();
    });

    test('should pass options to shared builder', async () => {
      jest.spyOn(storageQueries, 'getCollection').mockResolvedValue({ id: 'col_1', name: 'Test' });
      jest.spyOn(collectionExportBuilder, 'buildMultipleCollectionExports').mockResolvedValue([
        { name: 'Test', folders: [] }
      ]);

      await CollectionExportService.exportCollections(['col_1'], {
        includeTasks: false,
        includeMetadata: true
      });

      expect(collectionExportBuilder.buildMultipleCollectionExports).toHaveBeenCalledWith(
        ['col_1'],
        { includeTasks: false, includeMetadata: true }
      );
    });
  });

  describe('filename generation', () => {
    test('should generate safe filename from collection name', async () => {
      const mockCollection = {
        id: 'col_special',
        name: 'Test! @Collection# $With% Special&* Chars'
      };

      jest.spyOn(storageQueries, 'getCollection').mockResolvedValue(mockCollection);
      jest.spyOn(collectionExportBuilder, 'buildCollectionExport').mockResolvedValue({
        name: mockCollection.name,
        folders: []
      });

      const result = await CollectionExportService.exportCollection('col_special');

      // Verify filename is sanitized
      expect(result.filename).toMatch(/^collection-test-collection-with-special-chars-\d+\.json$/);
      expect(result.filename).not.toContain('!');
      expect(result.filename).not.toContain('@');
      expect(result.filename).not.toContain('#');
    });

    test('should generate batch filename for multiple collections', async () => {
      const ids = ['col_1', 'col_2', 'col_3'];

      ids.forEach(id => {
        jest.spyOn(storageQueries, 'getCollection').mockResolvedValue({ id, name: `Collection ${id}` });
      });

      jest.spyOn(collectionExportBuilder, 'buildMultipleCollectionExports').mockResolvedValue(
        ids.map(id => ({ name: `Collection ${id}`, folders: [] }))
      );

      const result = await CollectionExportService.exportCollections(ids);

      expect(result.filename).toMatch(/^collections-export-3-\d+\.json$/);
    });
  });
});