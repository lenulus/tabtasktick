/**
 * TabService Tests
 *
 * Tests for tab creation, updating, deletion within folders.
 * Uses real storage utilities with fake-indexeddb for integration testing.
 */

import 'fake-indexeddb/auto';
import { closeDB } from '../services/utils/db.js';
import * as CollectionService from '../services/execution/CollectionService.js';
import * as FolderService from '../services/execution/FolderService.js';
import * as TabService from '../services/execution/TabService.js';

describe('TabService', () => {
  let testCollectionId;
  let testFolderId;

  beforeEach(async () => {
    // Close any existing connection and clear all databases
    closeDB();
    const databases = await indexedDB.databases();
    for (const db of databases) {
      indexedDB.deleteDatabase(db.name);
    }

    // Create test collection and folder for FK relationships
    const collection = await CollectionService.createCollection({
      name: 'Test Collection'
    });
    testCollectionId = collection.id;

    const folder = await FolderService.createFolder({
      collectionId: testCollectionId,
      name: 'Test Folder',
      color: 'blue',
      position: 0
    });
    testFolderId = folder.id;
  });

  afterEach(() => {
    closeDB();
  });

  describe('createTab', () => {
    test('creates tab with required fields', async () => {
      const params = {
        folderId: testFolderId,
        url: 'https://example.com',
        title: 'Example Site',
        position: 0
      };

      const result = await TabService.createTab(params);

      expect(result).toMatchObject({
        folderId: testFolderId,
        url: 'https://example.com',
        title: 'Example Site',
        position: 0,
        isPinned: false
      });
      expect(result.id).toMatch(/^[a-f0-9-]{36}$/); // UUID format
    });

    test('includes optional fields', async () => {
      const params = {
        folderId: testFolderId,
        url: 'https://example.com',
        title: 'Example',
        favicon: 'data:image/png;base64,abc123',
        note: 'Test note',
        position: 0,
        isPinned: true,
        lastAccess: 1702000000000
      };

      const result = await TabService.createTab(params);

      expect(result.favicon).toBe('data:image/png;base64,abc123');
      expect(result.note).toBe('Test note');
      expect(result.isPinned).toBe(true);
      expect(result.lastAccess).toBe(1702000000000);
    });

    test('defaults isPinned to false', async () => {
      const params = {
        folderId: testFolderId,
        url: 'https://example.com',
        title: 'Example',
        position: 0
      };

      const result = await TabService.createTab(params);
      expect(result.isPinned).toBe(false);
    });

    test('throws error if url is missing', async () => {
      await expect(TabService.createTab({
        folderId: testFolderId,
        title: 'Example',
        position: 0
      })).rejects.toThrow('Tab URL is required');
    });

    test('throws error if url is empty', async () => {
      await expect(TabService.createTab({
        folderId: testFolderId,
        url: '',
        title: 'Example',
        position: 0
      })).rejects.toThrow('Tab URL is required');
    });

    test('throws error if title is missing', async () => {
      await expect(TabService.createTab({
        folderId: testFolderId,
        url: 'https://example.com',
        position: 0
      })).rejects.toThrow('Tab title is required');
    });

    test('throws error if title is empty', async () => {
      await expect(TabService.createTab({
        folderId: testFolderId,
        url: 'https://example.com',
        title: '',
        position: 0
      })).rejects.toThrow('Tab title is required');
    });

    test('throws error if folderId is missing', async () => {
      await expect(TabService.createTab({
        url: 'https://example.com',
        title: 'Example',
        position: 0
      })).rejects.toThrow('Folder ID is required');
    });

    test('throws error if position is missing', async () => {
      await expect(TabService.createTab({
        folderId: testFolderId,
        url: 'https://example.com',
        title: 'Example'
      })).rejects.toThrow('Tab position is required');
    });

    test('validates note length is under 255 characters', async () => {
      const longNote = 'a'.repeat(256);

      await expect(TabService.createTab({
        folderId: testFolderId,
        url: 'https://example.com',
        title: 'Example',
        note: longNote,
        position: 0
      })).rejects.toThrow('Note must be 255 characters or less');
    });

    test('accepts note exactly 255 characters', async () => {
      const maxNote = 'a'.repeat(255);

      const result = await TabService.createTab({
        folderId: testFolderId,
        url: 'https://example.com',
        title: 'Example',
        note: maxNote,
        position: 0
      });

      expect(result.note).toBe(maxNote);
    });
  });

  describe('updateTab', () => {
    test('updates tab with merged fields', async () => {
      const created = await TabService.createTab({
        folderId: testFolderId,
        url: 'https://old.com',
        title: 'Old Title',
        note: 'Old note',
        position: 0
      });

      const result = await TabService.updateTab(created.id, {
        title: 'New Title',
        note: 'New note'
      });

      expect(result.title).toBe('New Title');
      expect(result.note).toBe('New note');
      expect(result.id).toBe(created.id);
      expect(result.url).toBe('https://old.com'); // Unchanged
    });

    test('allows updating position', async () => {
      const created = await TabService.createTab({
        folderId: testFolderId,
        url: 'https://example.com',
        title: 'Example',
        position: 0
      });

      const result = await TabService.updateTab(created.id, {
        position: 5
      });

      expect(result.position).toBe(5);
    });

    test('allows updating isPinned', async () => {
      const created = await TabService.createTab({
        folderId: testFolderId,
        url: 'https://example.com',
        title: 'Example',
        position: 0
      });

      const result = await TabService.updateTab(created.id, {
        isPinned: true
      });

      expect(result.isPinned).toBe(true);
    });

    test('allows updating tabId (Chrome runtime ID)', async () => {
      const created = await TabService.createTab({
        folderId: testFolderId,
        url: 'https://example.com',
        title: 'Example',
        position: 0
      });

      const result = await TabService.updateTab(created.id, {
        tabId: 567
      });

      expect(result.tabId).toBe(567);
    });

    test('allows clearing tabId (set to null)', async () => {
      const created = await TabService.createTab({
        folderId: testFolderId,
        url: 'https://example.com',
        title: 'Example',
        position: 0,
        tabId: 567
      });

      const result = await TabService.updateTab(created.id, {
        tabId: null
      });

      expect(result.tabId).toBe(null);
    });

    test('does not allow updating id field', async () => {
      const created = await TabService.createTab({
        folderId: testFolderId,
        url: 'https://example.com',
        title: 'Example',
        position: 0
      });

      const result = await TabService.updateTab(created.id, {
        id: 'tab_HACKED',
        title: 'Updated'
      });

      expect(result.id).toBe(created.id); // Original ID preserved
      expect(result.title).toBe('Updated');
    });

    test('does not allow updating folderId', async () => {
      const created = await TabService.createTab({
        folderId: testFolderId,
        url: 'https://example.com',
        title: 'Example',
        position: 0
      });

      const result = await TabService.updateTab(created.id, {
        folderId: 'folder_HACKED',
        title: 'Updated'
      });

      expect(result.folderId).toBe(testFolderId); // Original FK preserved
      expect(result.title).toBe('Updated');
    });

    test('throws error if tab not found', async () => {
      await expect(TabService.updateTab('tab_999', { title: 'New' }))
        .rejects.toThrow('Tab not found: tab_999');
    });

    test('throws error if title is empty string', async () => {
      const created = await TabService.createTab({
        folderId: testFolderId,
        url: 'https://example.com',
        title: 'Example',
        position: 0
      });

      await expect(TabService.updateTab(created.id, { title: '' }))
        .rejects.toThrow('Tab title cannot be empty');
    });

    test('throws error if url is empty string', async () => {
      const created = await TabService.createTab({
        folderId: testFolderId,
        url: 'https://example.com',
        title: 'Example',
        position: 0
      });

      await expect(TabService.updateTab(created.id, { url: '' }))
        .rejects.toThrow('Tab URL cannot be empty');
    });

    test('validates note length on update', async () => {
      const created = await TabService.createTab({
        folderId: testFolderId,
        url: 'https://example.com',
        title: 'Example',
        position: 0
      });

      const longNote = 'a'.repeat(256);

      await expect(TabService.updateTab(created.id, { note: longNote }))
        .rejects.toThrow('Note must be 255 characters or less');
    });
  });

  describe('deleteTab', () => {
    test('deletes tab from storage', async () => {
      const created = await TabService.createTab({
        folderId: testFolderId,
        url: 'https://example.com',
        title: 'Example',
        position: 0
      });

      await TabService.deleteTab(created.id);

      // Verify deletion by trying to update (should fail)
      await expect(TabService.updateTab(created.id, { title: 'New' }))
        .rejects.toThrow('Tab not found');
    });
  });

  describe('getTabsByFolder', () => {
    test('returns all tabs for a folder sorted by position', async () => {
      // Create tabs in non-sequential order
      const tab2 = await TabService.createTab({
        folderId: testFolderId,
        url: 'https://example2.com',
        title: 'Tab 2',
        position: 2
      });

      const tab0 = await TabService.createTab({
        folderId: testFolderId,
        url: 'https://example0.com',
        title: 'Tab 0',
        position: 0
      });

      const tab1 = await TabService.createTab({
        folderId: testFolderId,
        url: 'https://example1.com',
        title: 'Tab 1',
        position: 1
      });

      const result = await TabService.getTabsByFolder(testFolderId);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe(tab0.id); // Sorted by position
      expect(result[1].id).toBe(tab1.id);
      expect(result[2].id).toBe(tab2.id);
    });

    test('returns empty array if no tabs exist', async () => {
      const result = await TabService.getTabsByFolder(testFolderId);
      expect(result).toEqual([]);
    });

    test('only returns tabs for specified folder', async () => {
      // Create another folder
      const otherFolder = await FolderService.createFolder({
        collectionId: testCollectionId,
        name: 'Other Folder',
        color: 'red',
        position: 1
      });

      // Create tabs in different folders
      await TabService.createTab({
        folderId: testFolderId,
        url: 'https://example1.com',
        title: 'Tab 1',
        position: 0
      });

      await TabService.createTab({
        folderId: otherFolder.id,
        url: 'https://example2.com',
        title: 'Other Tab',
        position: 0
      });

      const result = await TabService.getTabsByFolder(testFolderId);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Tab 1');
    });
  });
});
