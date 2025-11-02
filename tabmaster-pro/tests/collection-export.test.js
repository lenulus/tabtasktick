/**
 * @file CollectionExportService Tests
 * @description Integration tests for collection export functionality
 *
 * Uses fake-indexeddb for testing the full export flow without mocking ES modules.
 * This approach follows the pattern from CollectionService.test.js which successfully
 * tests services that use IndexedDB storage.
 */

import 'fake-indexeddb/auto';
import { jest } from '@jest/globals';
import { closeDB } from '../services/utils/db.js';
import * as CollectionExportService from '../services/execution/CollectionExportService.js';
import * as CollectionService from '../services/execution/CollectionService.js';
import * as FolderService from '../services/execution/FolderService.js';
import * as TabService from '../services/execution/TabService.js';
import * as TaskService from '../services/execution/TaskService.js';

describe('CollectionExportService', () => {
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

    // Mock URL and Blob for download functionality
    global.URL = {
      createObjectURL: jest.fn(() => 'blob:mock-url'),
      revokeObjectURL: jest.fn()
    };

    global.Blob = class Blob {
      constructor(parts, options) {
        this.parts = parts;
        this.options = options;
        this.type = options?.type;
        // Store JSON content for verification in tests
        if (parts && parts[0]) {
          this._content = parts[0];
        }
      }
    };
  });

  afterEach(() => {
    closeDB();
    jest.clearAllMocks();
  });

  describe('exportCollection', () => {
    test('should export a single collection with all data', async () => {
      // Create a collection with data using real storage
      const collection = await CollectionService.createCollection({
        name: 'Test Collection',
        description: 'Test description',
        icon: '📁',
        color: '#667eea',
        tags: ['work', 'test']
      });

      // Create folders
      const folder1 = await FolderService.createFolder({
        collectionId: collection.id,
        name: 'Folder 1',
        color: 'blue',
        position: 0
      });

      const folder2 = await FolderService.createFolder({
        collectionId: collection.id,
        name: 'Folder 2',
        color: 'red',
        position: 1
      });

      // Create tabs
      const tab1 = await TabService.createTab({
        collectionId: collection.id,
        folderId: folder1.id,
        url: 'https://example.com',
        title: 'Example',
        favicon: 'https://example.com/favicon.ico',
        note: 'Test note',
        position: 0
      });

      const tab2 = await TabService.createTab({
        collectionId: collection.id,
        folderId: folder2.id,
        url: 'https://github.com',
        title: 'GitHub',
        position: 0
      });

      // Create a task
      const task = await TaskService.createTask({
        collectionId: collection.id,
        summary: 'Test task',
        status: 'open',
        priority: 'high',
        tabIds: [tab1.id, tab2.id]
      });

      // Export the collection
      const result = await CollectionExportService.exportCollection(collection.id, {
        includeTasks: true,
        includeSettings: true,
        includeMetadata: false
      });

      // Verify export result structure
      expect(result.filename).toMatch(/^collection-test-collection-\d+\.json$/);
      expect(result.downloadUrl).toMatch(/^data:application\/json;base64,/);
      expect(result.downloadId).toBe(12345);

      // Verify export data
      expect(result.data.version).toBeDefined();
      expect(result.data.exportedAt).toBeDefined();
      expect(result.data.collections).toHaveLength(1);

      const exportedCollection = result.data.collections[0];
      expect(exportedCollection.name).toBe('Test Collection');
      expect(exportedCollection.description).toBe('Test description');
      expect(exportedCollection.icon).toBe('📁');
      expect(exportedCollection.color).toBe('#667eea');
      expect(exportedCollection.tags).toEqual(['work', 'test']);
      expect(exportedCollection.metadata).toBeUndefined(); // includeMetadata: false

      // Verify folders and tabs
      expect(exportedCollection.folders).toHaveLength(2);
      expect(exportedCollection.folders[0].name).toBe('Folder 1');
      expect(exportedCollection.folders[0].tabs).toHaveLength(1);
      expect(exportedCollection.folders[0].tabs[0].url).toBe('https://example.com');
      expect(exportedCollection.folders[0].tabs[0].title).toBe('Example');
      expect(exportedCollection.folders[0].tabs[0].note).toBe('Test note');

      expect(exportedCollection.folders[1].name).toBe('Folder 2');
      expect(exportedCollection.folders[1].tabs).toHaveLength(1);
      expect(exportedCollection.folders[1].tabs[0].url).toBe('https://github.com');

      // Verify tasks with tab references
      expect(exportedCollection.tasks).toHaveLength(1);
      const exportedTask = exportedCollection.tasks[0];
      expect(exportedTask.summary).toBe('Test task');
      expect(exportedTask.status).toBe('open');
      expect(exportedTask.priority).toBe('high');

      // Verify tab references are converted to indices
      expect(exportedTask.tabReferences).toHaveLength(2);
      expect(exportedTask.tabReferences[0]).toEqual({
        folderIndex: 0,
        tabIndex: 0,
        url: 'https://example.com',
        title: 'Example'
      });
      expect(exportedTask.tabReferences[1]).toEqual({
        folderIndex: 1,
        tabIndex: 0,
        url: 'https://github.com',
        title: 'GitHub'
      });

      // Verify chrome.downloads was called
      expect(chrome.downloads.download).toHaveBeenCalledTimes(1);
      const downloadCall = chrome.downloads.download.mock.calls[0][0];
      expect(downloadCall.filename).toBe(result.filename);
      expect(downloadCall.url).toMatch(/^data:application\/json;base64,/);
      expect(downloadCall.saveAs).toBe(true);
    });

    test('should export collection without tasks when includeTasks is false', async () => {
      // Create collection with task
      const collection = await CollectionService.createCollection({
        name: 'No Tasks Export'
      });

      const folder = await FolderService.createFolder({
        collectionId: collection.id,
        name: 'Folder',
        color: 'blue',
        position: 0
      });

      const tab = await TabService.createTab({
        collectionId: collection.id,
        folderId: folder.id,
        url: 'https://example.com',
        title: 'Example',
        position: 0
      });

      await TaskService.createTask({
        collectionId: collection.id,
        summary: 'Should not be exported',
        tabIds: [tab.id]
      });

      // Export without tasks
      const result = await CollectionExportService.exportCollection(collection.id, {
        includeTasks: false
      });

      const exportedCollection = result.data.collections[0];
      expect(exportedCollection.tasks).toBeUndefined();
      expect(exportedCollection.folders).toHaveLength(1);
    });

    test('should export collection without settings when includeSettings is false', async () => {
      const collection = await CollectionService.createCollection({
        name: 'No Settings Export'
      });

      // Update collection to have settings
      await CollectionService.updateCollection(collection.id, {
        settings: { trackingEnabled: true, syncDebounceMs: 1000 }
      });

      const result = await CollectionExportService.exportCollection(collection.id, {
        includeSettings: false
      });

      const exportedCollection = result.data.collections[0];
      expect(exportedCollection.settings).toBeUndefined();
    });

    test('should export collection with metadata when includeMetadata is true', async () => {
      const collection = await CollectionService.createCollection({
        name: 'With Metadata'
      });

      const result = await CollectionExportService.exportCollection(collection.id, {
        includeMetadata: true
      });

      const exportedCollection = result.data.collections[0];
      expect(exportedCollection.metadata).toBeDefined();
      expect(exportedCollection.metadata.createdAt).toBeDefined();
      expect(exportedCollection.metadata.lastAccessed).toBeDefined();
    });

    test('should handle tabs without folders (ungroupedTabs)', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Ungrouped Tabs Test'
      });

      // Create an ungrouped tab (no folder ID)
      const ungroupedTab = await TabService.createTab({
        collectionId: collection.id, // Direct collection association
        folderId: null, // Explicitly null for ungrouped tabs
        url: 'https://ungrouped.com',
        title: 'Ungrouped Tab',
        position: 0
      });

      const result = await CollectionExportService.exportCollection(collection.id);

      const exportedCollection = result.data.collections[0];
      expect(exportedCollection.ungroupedTabs).toBeDefined();
      expect(exportedCollection.ungroupedTabs).toHaveLength(1);
      expect(exportedCollection.ungroupedTabs[0].url).toBe('https://ungrouped.com');
      expect(exportedCollection.ungroupedTabs[0].title).toBe('Ungrouped Tab');
    });

    test('should throw error if collection not found', async () => {
      await expect(
        CollectionExportService.exportCollection('nonexistent')
      ).rejects.toThrow('Collection not found: nonexistent');
    });

    test('should generate safe filename from collection name', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Test! @Collection# $With% Special&* Chars'
      });

      const result = await CollectionExportService.exportCollection(collection.id);

      // Filename should be sanitized
      expect(result.filename).toMatch(/^collection-test-collection-with-special-chars-\d+\.json$/);
      expect(result.filename).not.toContain('!');
      expect(result.filename).not.toContain('@');
      expect(result.filename).not.toContain('#');
      expect(result.filename).not.toContain('%');
    });
  });

  describe('exportCollections', () => {
    test('should export multiple collections', async () => {
      // Create multiple collections
      const collection1 = await CollectionService.createCollection({
        name: 'Collection 1'
      });

      const collection2 = await CollectionService.createCollection({
        name: 'Collection 2'
      });

      // Add some data to each
      const folder1 = await FolderService.createFolder({
        collectionId: collection1.id,
        name: 'Folder in Col 1',
        color: 'blue',
        position: 0
      });

      await TabService.createTab({
        collectionId: collection1.id,
        folderId: folder1.id,
        url: 'https://col1.com',
        title: 'Col 1 Tab',
        position: 0
      });

      const folder2 = await FolderService.createFolder({
        collectionId: collection2.id,
        name: 'Folder in Col 2',
        color: 'red',
        position: 0
      });

      await TabService.createTab({
        collectionId: collection2.id,
        folderId: folder2.id,
        url: 'https://col2.com',
        title: 'Col 2 Tab',
        position: 0
      });

      // Export both collections
      const result = await CollectionExportService.exportCollections([
        collection1.id,
        collection2.id
      ]);

      // Verify result
      expect(result.filename).toMatch(/^collections-export-2-\d+\.json$/);
      expect(result.count).toBe(2);
      expect(result.data.version).toBeDefined();
      expect(result.data.collections).toHaveLength(2);

      // Verify first collection
      expect(result.data.collections[0].name).toBe('Collection 1');
      expect(result.data.collections[0].folders).toHaveLength(1);
      expect(result.data.collections[0].folders[0].tabs[0].url).toBe('https://col1.com');

      // Verify second collection
      expect(result.data.collections[1].name).toBe('Collection 2');
      expect(result.data.collections[1].folders).toHaveLength(1);
      expect(result.data.collections[1].folders[0].tabs[0].url).toBe('https://col2.com');
    });

    test('should throw error if any collection not found', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Exists'
      });

      await expect(
        CollectionExportService.exportCollections([collection.id, 'nonexistent'])
      ).rejects.toThrow('Collection not found: nonexistent');
    });

    test('should respect export options for multiple collections', async () => {
      const col1 = await CollectionService.createCollection({
        name: 'Col 1',
        settings: { trackingEnabled: true }
      });

      const col2 = await CollectionService.createCollection({
        name: 'Col 2',
        settings: { syncDebounceMs: 500 }
      });

      // Create tasks
      await TaskService.createTask({
        collectionId: col1.id,
        summary: 'Task 1'
      });

      await TaskService.createTask({
        collectionId: col2.id,
        summary: 'Task 2'
      });

      // Export without tasks and settings
      const result = await CollectionExportService.exportCollections(
        [col1.id, col2.id],
        {
          includeTasks: false,
          includeSettings: false
        }
      );

      // Verify options were respected
      result.data.collections.forEach(col => {
        expect(col.tasks).toBeUndefined();
        expect(col.settings).toBeUndefined();
      });
    });
  });

  describe('tab reference conversion', () => {
    test('should convert task tab IDs to folder/tab indices', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Reference Test'
      });

      // Create folders and tabs
      const folder1 = await FolderService.createFolder({
        collectionId: collection.id,
        name: 'Folder 1',
        color: 'blue',
        position: 0
      });

      const folder2 = await FolderService.createFolder({
        collectionId: collection.id,
        name: 'Folder 2',
        color: 'red',
        position: 1
      });

      const tab1 = await TabService.createTab({
        collectionId: collection.id,
        folderId: folder1.id,
        url: 'https://a.com',
        title: 'A',
        position: 0
      });

      const tab2 = await TabService.createTab({
        collectionId: collection.id,
        folderId: folder1.id,
        url: 'https://b.com',
        title: 'B',
        position: 1
      });

      const tab3 = await TabService.createTab({
        collectionId: collection.id,
        folderId: folder2.id,
        url: 'https://c.com',
        title: 'C',
        position: 0
      });

      // Create task referencing tabs from different folders
      const task = await TaskService.createTask({
        collectionId: collection.id,
        summary: 'Cross-folder task',
        tabIds: [tab2.id, tab3.id, tab1.id]
      });

      const result = await CollectionExportService.exportCollection(collection.id, {
        includeTasks: true
      });

      const exportedTask = result.data.collections[0].tasks[0];

      // Verify tab references are correctly converted to indices
      expect(exportedTask.tabReferences).toHaveLength(3);

      // tab2 is in folder1 at index 1
      expect(exportedTask.tabReferences[0]).toEqual({
        folderIndex: 0,
        tabIndex: 1,
        url: 'https://b.com',
        title: 'B'
      });

      // tab3 is in folder2 at index 0
      expect(exportedTask.tabReferences[1]).toEqual({
        folderIndex: 1,
        tabIndex: 0,
        url: 'https://c.com',
        title: 'C'
      });

      // tab1 is in folder1 at index 0
      expect(exportedTask.tabReferences[2]).toEqual({
        folderIndex: 0,
        tabIndex: 0,
        url: 'https://a.com',
        title: 'A'
      });
    });

    test('should include url and title in tab references for fallback recovery', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Fallback Test'
      });

      const folder = await FolderService.createFolder({
        collectionId: collection.id,
        name: 'Test Folder',
        color: 'blue',
        position: 0
      });

      const tab = await TabService.createTab({
        collectionId: collection.id,
        folderId: folder.id,
        url: 'https://example.com/page',
        title: 'Example Page',
        position: 0
      });

      const task = await TaskService.createTask({
        collectionId: collection.id,
        summary: 'Task with fallback',
        tabIds: [tab.id]
      });

      const result = await CollectionExportService.exportCollection(collection.id, {
        includeTasks: true
      });

      const ref = result.data.collections[0].tasks[0].tabReferences[0];

      // Verify all fallback fields are included
      expect(ref).toHaveProperty('folderIndex', 0);
      expect(ref).toHaveProperty('tabIndex', 0);
      expect(ref).toHaveProperty('url', 'https://example.com/page');
      expect(ref).toHaveProperty('title', 'Example Page');
    });
  });
});