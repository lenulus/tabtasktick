/**
 * WindowService Collection Binding Tests
 *
 * Tests for collection-window binding functionality in WindowService.
 * Separated from main WindowService tests because it uses IndexedDB (fake-index eddb)
 * while main WindowService tests use chrome-mock. The two don't mix well in same file.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { closeDB } from '../services/utils/db.js';
import * as CollectionService from '../services/execution/CollectionService.js';
import {
  bindCollectionToWindow,
  unbindCollectionFromWindow,
  getCollectionForWindow,
  rebuildCollectionCache,
  clearCollectionCache
} from '../services/execution/WindowService.js';

import { selectCollections } from '../services/selection/selectCollections.js';

describe('WindowService Collection Binding', () => {
  beforeEach(async () => {
    // Clean up IndexedDB
    closeDB();
    const databases = await indexedDB.databases();
    for (const db of databases) {
      indexedDB.deleteDatabase(db.name);
    }

    // Clear collection cache
    clearCollectionCache();
  });

  afterEach(() => {
    closeDB();
  });

  // Debug tests
  describe('debug', () => {
    it('first collection persists', async () => {
      const col1 = await CollectionService.createCollection({
        name: 'First Collection',
        windowId: 100
      });

      // Verify it was saved
      const { getAllCollections } = await import('../services/utils/storage-queries.js');
      const all = await getAllCollections();

      expect(all.length).toBe(1);
      expect(all[0].name).toBe('First Collection');
    });

    it('two collections both persist', async () => {
      const { getAllCollections } = await import('../services/utils/storage-queries.js');

      const col1 = await CollectionService.createCollection({
        name: 'Active 1',
        windowId: 100
      });

      let all = await getAllCollections();

      const col2 = await CollectionService.createCollection({
        name: 'Saved 1'
      });

      all = await getAllCollections();

      expect(all.length).toBe(2);
    });

    it('collections are created correctly', async () => {
      const col1 = await CollectionService.createCollection({
        name: 'Active 1',
        windowId: 100
      });

      // Check created collection properties
      expect(col1.isActive).toBe(true);
      expect(col1.windowId).toBe(100);
    });

    it('getCollection retrieves stored collection', async () => {
      const created = await CollectionService.createCollection({
        name: 'Test',
        windowId: 100
      });

      // Import getCollection
      const { getCollection } = await import('../services/utils/storage-queries.js');
      const retrieved = await getCollection(created.id);

      expect(retrieved).not.toBe(null);
      expect(retrieved.isActive).toBe(true);
      expect(retrieved.windowId).toBe(100);
    });

    it('getAllCollections returns all collections', async () => {
      const { getAllCollections } = await import('../services/utils/storage-queries.js');

      await CollectionService.createCollection({
        name: 'Active 1',
        windowId: 100
      });

      await CollectionService.createCollection({
        name: 'Saved 1'
      });

      const allCollections = await getAllCollections();
      expect(allCollections.length).toBe(2);
    });

    it('selectCollections without filters returns all', async () => {
      await CollectionService.createCollection({
        name: 'Active 1',
        windowId: 100
      });

      await CollectionService.createCollection({
        name: 'Saved 1'
      });

      const allCollections = await selectCollections({});
      expect(allCollections.length).toBe(2);
    });

    it('direct index query works', async () => {
      const col1 = await CollectionService.createCollection({
        name: 'Active 1',
        windowId: 100
      });

      await CollectionService.createCollection({
        name: 'Saved 1'
      });

      // Direct IndexedDB index query
      const { getCollectionsByIndex } = await import('../services/utils/storage-queries.js');
      const activeCollections = await getCollectionsByIndex('isActive', true);

      expect(activeCollections.length).toBe(1);
      expect(activeCollections[0].id).toBe(col1.id);
    });

    it('selectCollections with isActive works', async () => {
      const col1 = await CollectionService.createCollection({
        name: 'Active 1',
        windowId: 100
      });

      await CollectionService.createCollection({
        name: 'Saved 1'
      });

      const activeCollections = await selectCollections({ isActive: true });
      expect(activeCollections.length).toBe(1);
      expect(activeCollections[0].id).toBe(col1.id);
    });
  });

  describe('bindCollectionToWindow', () => {
    it('should bind collection to window and update cache', async () => {
      // Create a saved collection
      const collection = await CollectionService.createCollection({
        name: 'Test Collection'
      });

      expect(collection.isActive).toBe(false);
      expect(collection.windowId).toBe(null);

      // Bind to window
      const windowId = 123;
      const result = await bindCollectionToWindow(collection.id, windowId);

      // Verify collection was bound
      expect(result.isActive).toBe(true);
      expect(result.windowId).toBe(windowId);
      expect(result.id).toBe(collection.id);

      // Verify cache was updated (getCollectionForWindow should return from cache)
      const cached = await getCollectionForWindow(windowId);
      expect(cached).not.toBe(null);
      expect(cached.id).toBe(collection.id);
    });

    it('should allow rebinding collection to different window', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Test Collection',
        windowId: 100
      });

      // Bind to first window
      await bindCollectionToWindow(collection.id, 200);
      let cached = await getCollectionForWindow(200);
      expect(cached.windowId).toBe(200);

      // Rebind to second window
      await bindCollectionToWindow(collection.id, 300);
      cached = await getCollectionForWindow(300);
      expect(cached.windowId).toBe(300);

      // Old window should not have collection
      const oldWindow = await getCollectionForWindow(200);
      expect(oldWindow).toBe(null);
    });

    it('should throw error if collection not found', async () => {
      await expect(bindCollectionToWindow('col_invalid', 123))
        .rejects.toThrow('Collection not found');
    });
  });

  describe('unbindCollectionFromWindow', () => {
    it('should unbind collection from window and clear cache', async () => {
      // Create active collection
      const collection = await CollectionService.createCollection({
        name: 'Active Collection',
        windowId: 456
      });

      // Bind to ensure cache is populated
      await bindCollectionToWindow(collection.id, 456);

      // Verify it's in cache
      let cached = await getCollectionForWindow(456);
      expect(cached).not.toBe(null);

      // Unbind
      const result = await unbindCollectionFromWindow(collection.id);

      // Verify collection was unbound
      expect(result.isActive).toBe(false);
      expect(result.windowId).toBe(null);

      // Verify cache was cleared
      cached = await getCollectionForWindow(456);
      expect(cached).toBe(null);
    });

    it('should be idempotent (unbind already unbound collection)', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Saved Collection'
      });

      // Unbind already unbound collection
      const result = await unbindCollectionFromWindow(collection.id);

      expect(result.isActive).toBe(false);
      expect(result.windowId).toBe(null);
    });

    it('should throw error if collection not found', async () => {
      await expect(unbindCollectionFromWindow('col_invalid'))
        .rejects.toThrow('Collection not found');
    });
  });

  describe('getCollectionForWindow', () => {
    it('should return collection from cache (cache hit)', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Test Collection'
      });

      const windowId = 789;
      await bindCollectionToWindow(collection.id, windowId);

      // First call populates cache, second call should hit cache
      const result1 = await getCollectionForWindow(windowId);
      const result2 = await getCollectionForWindow(windowId);

      expect(result1.id).toBe(collection.id);
      expect(result2.id).toBe(collection.id);
      expect(result1).toEqual(result2);
    });

    it('should return collection from database (cache miss)', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Test Collection',
        windowId: 999
      });

      // Clear cache to force database lookup
      clearCollectionCache();

      const result = await getCollectionForWindow(999);

      expect(result).not.toBe(null);
      expect(result.id).toBe(collection.id);
      expect(result.windowId).toBe(999);
    });

    it('should return null if no collection bound to window', async () => {
      const result = await getCollectionForWindow(123);

      expect(result).toBe(null);
    });

    it('should update cache after database lookup', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Test Collection',
        windowId: 555
      });

      // Clear cache
      clearCollectionCache();

      // First call queries database and updates cache
      const result1 = await getCollectionForWindow(555);
      expect(result1.id).toBe(collection.id);

      // Second call should hit cache (we can't directly verify this,
      // but we can verify the result is consistent)
      const result2 = await getCollectionForWindow(555);
      expect(result2.id).toBe(collection.id);
    });
  });

  describe('rebuildCollectionCache', () => {
    it('should rebuild cache from all active collections', async () => {
      // Mock chrome.windows.getAll for Phase 2.7 orphaned collection detection
      global.chrome = {
        windows: {
          getAll: async () => [
            { id: 100 },
            { id: 200 },
            { id: 300 }
          ]
        }
      };

      // Create multiple active collections
      const col1 = await CollectionService.createCollection({
        name: 'Collection 1',
        windowId: 100
      });

      const col2 = await CollectionService.createCollection({
        name: 'Collection 2',
        windowId: 200
      });

      const col3 = await CollectionService.createCollection({
        name: 'Collection 3' // Saved, no windowId
      });

      // Clear cache
      clearCollectionCache();

      // Rebuild cache
      await rebuildCollectionCache();

      // Verify active collections are in cache
      const cached1 = await getCollectionForWindow(100);
      expect(cached1).not.toBe(null);
      expect(cached1.id).toBe(col1.id);

      const cached2 = await getCollectionForWindow(200);
      expect(cached2).not.toBe(null);
      expect(cached2.id).toBe(col2.id);

      // Verify saved collection is not in cache
      const cached3 = await getCollectionForWindow(col3.windowId);
      expect(cached3).toBe(null);
    });

    it('should handle empty collections', async () => {
      clearCollectionCache();

      // Should not throw
      await expect(rebuildCollectionCache()).resolves.not.toThrow();

      // Cache should be empty
      const result = await getCollectionForWindow(123);
      expect(result).toBe(null);
    });

    it('should replace existing cache entries', async () => {
      // Create and bind collection
      const col1 = await CollectionService.createCollection({
        name: 'Collection 1',
        windowId: 100
      });
      await bindCollectionToWindow(col1.id, 100);

      // Manually unbind in database (simulate out-of-sync cache)
      await CollectionService.unbindFromWindow(col1.id);

      // Rebuild cache should reflect database state
      await rebuildCollectionCache();

      const cached = await getCollectionForWindow(100);
      expect(cached).toBe(null);
    });
  });

  describe('clearCollectionCache', () => {
    it('should clear all cache entries', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Test Collection',
        windowId: 123
      });

      await bindCollectionToWindow(collection.id, 123);

      // Verify cache is populated
      let cached = await getCollectionForWindow(123);
      expect(cached).not.toBe(null);

      // Clear cache
      clearCollectionCache();

      // Should force database lookup (we can verify by checking result is still correct)
      cached = await getCollectionForWindow(123);
      expect(cached).not.toBe(null);
      expect(cached.id).toBe(collection.id);
    });
  });

  describe('cache consistency', () => {
    it('should maintain cache consistency across operations', async () => {
      const col = await CollectionService.createCollection({
        name: 'Test Collection'
      });

      // Bind to window 1
      await bindCollectionToWindow(col.id, 100);
      let cached = await getCollectionForWindow(100);
      expect(cached.windowId).toBe(100);

      // Rebind to window 2
      await bindCollectionToWindow(col.id, 200);
      cached = await getCollectionForWindow(200);
      expect(cached.windowId).toBe(200);

      // Window 1 should not have collection anymore
      cached = await getCollectionForWindow(100);
      expect(cached).toBe(null);

      // Unbind completely
      await unbindCollectionFromWindow(col.id);
      cached = await getCollectionForWindow(200);
      expect(cached).toBe(null);
    });

    it('should handle multiple collections on different windows', async () => {
      const col1 = await CollectionService.createCollection({ name: 'Col 1' });
      const col2 = await CollectionService.createCollection({ name: 'Col 2' });
      const col3 = await CollectionService.createCollection({ name: 'Col 3' });

      await bindCollectionToWindow(col1.id, 100);
      await bindCollectionToWindow(col2.id, 200);
      await bindCollectionToWindow(col3.id, 300);

      // All should be retrievable
      expect((await getCollectionForWindow(100)).id).toBe(col1.id);
      expect((await getCollectionForWindow(200)).id).toBe(col2.id);
      expect((await getCollectionForWindow(300)).id).toBe(col3.id);

      // Unbind one
      await unbindCollectionFromWindow(col2.id);

      // Others should still be cached
      expect((await getCollectionForWindow(100)).id).toBe(col1.id);
      expect(await getCollectionForWindow(200)).toBe(null);
      expect((await getCollectionForWindow(300)).id).toBe(col3.id);
    });
  });
});
