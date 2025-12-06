/**
 * FolderService Tests
 *
 * Tests for folder creation, updating, deletion within collections.
 * Uses real storage utilities with fake-indexeddb for integration testing.
 */

import 'fake-indexeddb/auto';
import { closeDB } from '../services/utils/db.js';
import * as CollectionService from '../services/execution/CollectionService.js';
import * as FolderService from '../services/execution/FolderService.js';

describe('FolderService', () => {
  let testCollectionId;

  beforeEach(async () => {
    // Close any existing connection and clear all databases
    closeDB();
    const databases = await indexedDB.databases();
    for (const db of databases) {
      indexedDB.deleteDatabase(db.name);
    }

    // Create a test collection for FK relationships
    const collection = await CollectionService.createCollection({
      name: 'Test Collection'
    });
    testCollectionId = collection.id;
  });

  afterEach(() => {
    closeDB();
  });

  describe('createFolder', () => {
    test('creates folder with required fields', async () => {
      const params = {
        collectionId: testCollectionId,
        name: 'Test Folder',
        color: 'blue',
        position: 0
      };

      const result = await FolderService.createFolder(params);

      expect(result).toMatchObject({
        collectionId: testCollectionId,
        name: 'Test Folder',
        color: 'blue',
        collapsed: false,
        position: 0
      });
      expect(result.id).toMatch(/^[a-f0-9-]{36}$/); // UUID format
    });

    test('defaults collapsed to false', async () => {
      const params = {
        collectionId: testCollectionId,
        name: 'Test',
        color: 'red',
        position: 0
      };

      const result = await FolderService.createFolder(params);
      expect(result.collapsed).toBe(false);
    });

    test('accepts collapsed as true', async () => {
      const params = {
        collectionId: testCollectionId,
        name: 'Test',
        color: 'blue',
        collapsed: true,
        position: 0
      };

      const result = await FolderService.createFolder(params);
      expect(result.collapsed).toBe(true);
    });

    test('throws error if name is missing', async () => {
      await expect(FolderService.createFolder({
        collectionId: testCollectionId,
        color: 'blue',
        position: 0
      })).rejects.toThrow('Folder name is required');
    });

    test('throws error if name is empty', async () => {
      await expect(FolderService.createFolder({
        collectionId: testCollectionId,
        name: '',
        color: 'blue',
        position: 0
      })).rejects.toThrow('Folder name is required');
    });

    test('throws error if collectionId is missing', async () => {
      await expect(FolderService.createFolder({
        name: 'Test',
        color: 'blue',
        position: 0
      })).rejects.toThrow('Collection ID is required');
    });

    test('throws error if color is missing', async () => {
      await expect(FolderService.createFolder({
        collectionId: testCollectionId,
        name: 'Test',
        position: 0
      })).rejects.toThrow('Folder color is required');
    });

    test('throws error if position is missing', async () => {
      await expect(FolderService.createFolder({
        collectionId: testCollectionId,
        name: 'Test',
        color: 'blue'
      })).rejects.toThrow('Folder position is required');
    });

    test('validates color is valid Chrome tab group color', async () => {
      await expect(FolderService.createFolder({
        collectionId: testCollectionId,
        name: 'Test',
        color: 'invalid-color',
        position: 0
      })).rejects.toThrow('Invalid folder color');
    });

    test('accepts all valid Chrome tab group colors', async () => {
      const validColors = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

      for (const color of validColors) {
        const result = await FolderService.createFolder({
          collectionId: testCollectionId,
          name: `Test ${color}`,
          color,
          position: 0
        });
        expect(result.color).toBe(color);
      }
    });
  });

  describe('updateFolder', () => {
    test('updates folder with merged fields', async () => {
      const created = await FolderService.createFolder({
        collectionId: testCollectionId,
        name: 'Old Name',
        color: 'blue',
        position: 0
      });

      const result = await FolderService.updateFolder(created.id, {
        name: 'New Name',
        color: 'red'
      });

      expect(result.name).toBe('New Name');
      expect(result.color).toBe('red');
      expect(result.id).toBe(created.id);
      expect(result.position).toBe(0); // Unchanged
    });

    test('allows updating collapsed state', async () => {
      const created = await FolderService.createFolder({
        collectionId: testCollectionId,
        name: 'Test',
        color: 'blue',
        position: 0
      });

      const result = await FolderService.updateFolder(created.id, {
        collapsed: true
      });

      expect(result.collapsed).toBe(true);
    });

    test('allows updating position', async () => {
      const created = await FolderService.createFolder({
        collectionId: testCollectionId,
        name: 'Test',
        color: 'blue',
        position: 0
      });

      const result = await FolderService.updateFolder(created.id, {
        position: 5
      });

      expect(result.position).toBe(5);
    });

    test('does not allow updating id field', async () => {
      const created = await FolderService.createFolder({
        collectionId: testCollectionId,
        name: 'Test',
        color: 'blue',
        position: 0
      });

      const result = await FolderService.updateFolder(created.id, {
        id: 'folder_HACKED',
        name: 'Updated'
      });

      expect(result.id).toBe(created.id); // Original ID preserved
      expect(result.name).toBe('Updated');
    });

    test('does not allow updating collectionId', async () => {
      const created = await FolderService.createFolder({
        collectionId: testCollectionId,
        name: 'Test',
        color: 'blue',
        position: 0
      });

      const result = await FolderService.updateFolder(created.id, {
        collectionId: 'col_HACKED',
        name: 'Updated'
      });

      expect(result.collectionId).toBe(testCollectionId); // Original FK preserved
      expect(result.name).toBe('Updated');
    });

    test('throws error if folder not found', async () => {
      await expect(FolderService.updateFolder('folder_999', { name: 'New' }))
        .rejects.toThrow('Folder not found: folder_999');
    });

    test('throws error if name is empty string', async () => {
      const created = await FolderService.createFolder({
        collectionId: testCollectionId,
        name: 'Test',
        color: 'blue',
        position: 0
      });

      await expect(FolderService.updateFolder(created.id, { name: '' }))
        .rejects.toThrow('Folder name cannot be empty');
    });

    test('validates color on update', async () => {
      const created = await FolderService.createFolder({
        collectionId: testCollectionId,
        name: 'Test',
        color: 'blue',
        position: 0
      });

      await expect(FolderService.updateFolder(created.id, { color: 'invalid' }))
        .rejects.toThrow('Invalid folder color');
    });
  });

  describe('deleteFolder', () => {
    test('deletes folder from storage', async () => {
      const created = await FolderService.createFolder({
        collectionId: testCollectionId,
        name: 'Test',
        color: 'blue',
        position: 0
      });

      await FolderService.deleteFolder(created.id);

      // Verify deletion by trying to update (should fail)
      await expect(FolderService.updateFolder(created.id, { name: 'New' }))
        .rejects.toThrow('Folder not found');
    });
  });

  describe('getFoldersByCollection', () => {
    test('returns all folders for a collection sorted by position', async () => {
      // Create folders in non-sequential order
      const folder2 = await FolderService.createFolder({
        collectionId: testCollectionId,
        name: 'Folder 2',
        color: 'red',
        position: 2
      });

      const folder0 = await FolderService.createFolder({
        collectionId: testCollectionId,
        name: 'Folder 0',
        color: 'blue',
        position: 0
      });

      const folder1 = await FolderService.createFolder({
        collectionId: testCollectionId,
        name: 'Folder 1',
        color: 'green',
        position: 1
      });

      const result = await FolderService.getFoldersByCollection(testCollectionId);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe(folder0.id); // Sorted by position
      expect(result[1].id).toBe(folder1.id);
      expect(result[2].id).toBe(folder2.id);
    });

    test('returns empty array if no folders exist', async () => {
      const result = await FolderService.getFoldersByCollection(testCollectionId);
      expect(result).toEqual([]);
    });

    test('only returns folders for specified collection', async () => {
      // Create another collection
      const otherCollection = await CollectionService.createCollection({
        name: 'Other Collection'
      });

      // Create folders in different collections
      await FolderService.createFolder({
        collectionId: testCollectionId,
        name: 'Folder 1',
        color: 'blue',
        position: 0
      });

      await FolderService.createFolder({
        collectionId: otherCollection.id,
        name: 'Other Folder',
        color: 'red',
        position: 0
      });

      const result = await FolderService.getFoldersByCollection(testCollectionId);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Folder 1');
    });
  });
});
