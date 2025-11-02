/**
 * @file CollectionExportService Tests (Simplified for refactored architecture)
 * @description Integration tests for collection export functionality using shared builder
 *
 * This test file validates the refactored export service that delegates to shared
 * utilities. It uses fake-indexeddb for integration testing without ES module mocking.
 */

import 'fake-indexeddb/auto';
import { jest } from '@jest/globals';
import { closeDB } from '../services/utils/db.js';
import * as CollectionExportService from '../services/execution/CollectionExportService.js';
import * as CollectionService from '../services/execution/CollectionService.js';
import * as FolderService from '../services/execution/FolderService.js';
import * as TabService from '../services/execution/TabService.js';
import * as TaskService from '../services/execution/TaskService.js';

describe('CollectionExportService (Refactored)', () => {
  beforeEach(async () => {
    // Close any existing connection and clear all databases
    closeDB();
    const databases = await indexedDB.databases();
    for (const db of databases) {
      indexedDB.deleteDatabase(db.name);
    }

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

  afterEach(() => {
    closeDB();
  });

  describe('exportCollection', () => {
    test('should export a single collection using shared builder', async () => {
      // Create collection with data
      const collection = await CollectionService.createCollection({
        name: 'Test Collection',
        description: 'Test description',
        icon: '📁',
        color: '#667eea',
        tags: ['work', 'test']
      });

      // Update with settings
      await CollectionService.updateCollection(collection.id, {
        settings: { trackingEnabled: true }
      });

      // Create folder and tabs
      const folder = await FolderService.createFolder({
        collectionId: collection.id,
        name: 'Folder 1',
        color: 'blue',
        position: 0
      });

      const tab = await TabService.createTab({
        collectionId: collection.id,
        folderId: folder.id,
        url: 'https://example.com',
        title: 'Example',
        favicon: 'https://example.com/favicon.ico',
        note: 'Test note',
        position: 0
      });

      // Create task
      const task = await TaskService.createTask({
        collectionId: collection.id,
        summary: 'Test task',
        status: 'open',
        priority: 'high',
        tabIds: [tab.id]
      });

      // Execute export
      const result = await CollectionExportService.exportCollection(collection.id, {
        includeTasks: true,
        includeSettings: true
      });

      // Verify result structure
      expect(result.filename).toMatch(/^collection-test-collection-\d+\.json$/);
      expect(result.data).toHaveProperty('version');
      expect(result.data).toHaveProperty('exportedAt');
      expect(result.data.collections).toHaveLength(1);

      // Verify export data (validates shared builder is used correctly)
      const exportedCollection = result.data.collections[0];
      expect(exportedCollection.name).toBe('Test Collection');
      expect(exportedCollection.description).toBe('Test description');
      expect(exportedCollection.icon).toBe('📁');
      expect(exportedCollection.settings).toEqual({ trackingEnabled: true });
      expect(exportedCollection.folders).toHaveLength(1);
      expect(exportedCollection.folders[0].tabs).toHaveLength(1);
      expect(exportedCollection.tasks).toHaveLength(1);

      // Verify task tab references
      expect(exportedCollection.tasks[0].tabReferences).toHaveLength(1);
      expect(exportedCollection.tasks[0].tabReferences[0]).toEqual({
        folderIndex: 0,
        tabIndex: 0,
        url: 'https://example.com',
        title: 'Example'
      });
    });

    test('should throw error if collection not found', async () => {
      await expect(
        CollectionExportService.exportCollection('nonexistent')
      ).rejects.toThrow('Collection not found: nonexistent');
    });

    test('should respect export options passed to shared builder', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Options Test',
        settings: { trackingEnabled: false }
      });

      // Create task that should be excluded
      await TaskService.createTask({
        collectionId: collection.id,
        summary: 'Should not appear'
      });

      const result = await CollectionExportService.exportCollection(collection.id, {
        includeTasks: false,
        includeSettings: false,
        includeMetadata: true
      });

      const exportedCollection = result.data.collections[0];

      // Verify options were respected by the shared builder
      expect(exportedCollection.tasks).toBeUndefined();
      expect(exportedCollection.settings).toBeUndefined();
      expect(exportedCollection.metadata).toBeDefined();
      expect(exportedCollection.metadata.createdAt).toBeDefined();
    });
  });

  describe('exportCollections', () => {
    test('should export multiple collections using shared builder', async () => {
      // Create multiple collections
      const collection1 = await CollectionService.createCollection({
        name: 'Collection 1'
      });

      const collection2 = await CollectionService.createCollection({
        name: 'Collection 2'
      });

      // Add folders to each
      await FolderService.createFolder({
        collectionId: collection1.id,
        name: 'Folder in Col 1',
        color: 'blue',
        position: 0
      });

      await FolderService.createFolder({
        collectionId: collection2.id,
        name: 'Folder in Col 2',
        color: 'red',
        position: 0
      });

      const result = await CollectionExportService.exportCollections([
        collection1.id,
        collection2.id
      ]);

      // Verify result
      expect(result.filename).toMatch(/^collections-export-2-\d+\.json$/);
      expect(result.count).toBe(2);
      expect(result.data.collections).toHaveLength(2);

      // Verify both collections are exported
      expect(result.data.collections[0].name).toBe('Collection 1');
      expect(result.data.collections[1].name).toBe('Collection 2');
    });

    test('should validate all collections exist before export', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Exists'
      });

      await expect(
        CollectionExportService.exportCollections([collection.id, 'nonexistent'])
      ).rejects.toThrow('Collection not found: nonexistent');
    });

    test('should pass options to shared builder', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Test',
        settings: { syncDebounceMs: 500 }
      });

      await TaskService.createTask({
        collectionId: collection.id,
        summary: 'Task'
      });

      const result = await CollectionExportService.exportCollections([collection.id], {
        includeTasks: false,
        includeMetadata: true
      });

      const exportedCollection = result.data.collections[0];

      // Verify options were passed through to builder
      expect(exportedCollection.tasks).toBeUndefined();
      expect(exportedCollection.metadata).toBeDefined();
    });
  });

  describe('filename generation', () => {
    test('should generate safe filename from collection name', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Test! @Collection# $With% Special&* Chars'
      });

      const result = await CollectionExportService.exportCollection(collection.id);

      // Verify filename is sanitized
      expect(result.filename).toMatch(/^collection-test-collection-with-special-chars-\d+\.json$/);
      expect(result.filename).not.toMatch(/[!@#$%&*]/);
    });

    test('should generate batch filename for multiple collections', async () => {
      const collections = await Promise.all([
        CollectionService.createCollection({ name: 'Col 1' }),
        CollectionService.createCollection({ name: 'Col 2' }),
        CollectionService.createCollection({ name: 'Col 3' })
      ]);

      const ids = collections.map(c => c.id);
      const result = await CollectionExportService.exportCollections(ids);

      expect(result.filename).toMatch(/^collections-export-3-\d+\.json$/);
    });
  });

  describe('integration with shared builder', () => {
    test('should properly delegate to collectionExportBuilder', async () => {
      // This test verifies the service properly uses the shared builder
      // by creating complex data and checking it's transformed correctly

      const collection = await CollectionService.createCollection({
        name: 'Builder Integration Test'
      });

      // Create multiple folders with tabs
      const folder1 = await FolderService.createFolder({
        collectionId: collection.id,
        name: 'First Folder',
        color: 'blue',
        position: 0
      });

      const folder2 = await FolderService.createFolder({
        collectionId: collection.id,
        name: 'Second Folder',
        color: 'red',
        position: 1
      });

      // Create tabs in different folders
      const tabs = await Promise.all([
        TabService.createTab({
          collectionId: collection.id,
          folderId: folder1.id,
          url: 'https://site1.com',
          title: 'Site 1',
          position: 0
        }),
        TabService.createTab({
          collectionId: collection.id,
          folderId: folder1.id,
          url: 'https://site2.com',
          title: 'Site 2',
          position: 1
        }),
        TabService.createTab({
          collectionId: collection.id,
          folderId: folder2.id,
          url: 'https://site3.com',
          title: 'Site 3',
          position: 0
        })
      ]);

      // Create task with references to multiple tabs
      await TaskService.createTask({
        collectionId: collection.id,
        summary: 'Multi-tab task',
        tabIds: [tabs[0].id, tabs[2].id] // Tabs from different folders
      });

      const result = await CollectionExportService.exportCollection(collection.id, {
        includeTasks: true
      });

      const exportedCollection = result.data.collections[0];

      // Verify folder structure is preserved
      expect(exportedCollection.folders).toHaveLength(2);
      expect(exportedCollection.folders[0].tabs).toHaveLength(2);
      expect(exportedCollection.folders[1].tabs).toHaveLength(1);

      // Verify task references are correctly converted
      const task = exportedCollection.tasks[0];
      expect(task.tabReferences).toHaveLength(2);

      // First reference: folder 0, tab 0
      expect(task.tabReferences[0]).toEqual({
        folderIndex: 0,
        tabIndex: 0,
        url: 'https://site1.com',
        title: 'Site 1'
      });

      // Second reference: folder 1, tab 0
      expect(task.tabReferences[1]).toEqual({
        folderIndex: 1,
        tabIndex: 0,
        url: 'https://site3.com',
        title: 'Site 3'
      });
    });

    test('should handle ungrouped tabs via shared builder', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Ungrouped Test'
      });

      // Create tab without folder (ungrouped)
      await TabService.createTab({
        collectionId: collection.id,
        folderId: null, // Explicitly null for ungrouped tabs
        url: 'https://ungrouped.com',
        title: 'Ungrouped',
        position: 0
      });

      const result = await CollectionExportService.exportCollection(collection.id);

      const exportedCollection = result.data.collections[0];

      // Verify ungrouped tabs are handled by the shared builder
      expect(exportedCollection.ungroupedTabs).toBeDefined();
      expect(exportedCollection.ungroupedTabs).toHaveLength(1);
      expect(exportedCollection.ungroupedTabs[0].url).toBe('https://ungrouped.com');
    });
  });
});