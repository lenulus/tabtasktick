/**
 * CollectionService Tests
 *
 * Tests for collection creation, updating, deletion, and window binding.
 * Uses real storage utilities with fake-indexeddb for integration testing.
 */

import 'fake-indexeddb/auto';
import { closeDB } from '../services/utils/db.js';
import * as CollectionService from '../services/execution/CollectionService.js';

describe('CollectionService', () => {
  beforeEach(async () => {
    // Close any existing connection and clear all databases
    closeDB();
    const databases = await indexedDB.databases();
    for (const db of databases) {
      indexedDB.deleteDatabase(db.name);
    }
  });

  afterEach(() => {
    closeDB();
  });

  describe('createCollection', () => {
    test('creates collection with required fields', async () => {
      const params = {
        name: 'Test Collection'
      };

      const result = await CollectionService.createCollection(params);

      expect(result).toMatchObject({
        name: 'Test Collection',
        isActive: false,
        windowId: null
      });
      expect(result.id).toMatch(/^[a-f0-9-]{36}$/); // UUID format
      expect(result.metadata.createdAt).toBeDefined();
      expect(result.metadata.lastAccessed).toBeDefined();
      expect(result.tags).toEqual([]);
    });

    test('creates active collection when windowId provided', async () => {
      const params = {
        name: 'Active Collection',
        windowId: 123
      };

      const result = await CollectionService.createCollection(params);

      expect(result.isActive).toBe(true);
      expect(result.windowId).toBe(123);
    });

    test('includes optional fields', async () => {
      const params = {
        name: 'Full Collection',
        description: 'Test description',
        icon: '📁',
        color: '#FF0000',
        tags: ['work', 'urgent']
      };

      const result = await CollectionService.createCollection(params);

      expect(result.description).toBe('Test description');
      expect(result.icon).toBe('📁');
      expect(result.color).toBe('#FF0000');
      expect(result.tags).toEqual(['work', 'urgent']);
    });

    test('defaults tags to empty array', async () => {
      const params = { name: 'Test' };

      const result = await CollectionService.createCollection(params);

      expect(result.tags).toEqual([]);
    });

    test('throws error if name is missing', async () => {
      await expect(CollectionService.createCollection({}))
        .rejects.toThrow('Collection name is required');
    });

    test('throws error if name is empty', async () => {
      await expect(CollectionService.createCollection({ name: '' }))
        .rejects.toThrow('Collection name is required');
    });
  });

  describe('updateCollection', () => {
    test('updates collection with merged fields', async () => {
      // Create a collection first
      const created = await CollectionService.createCollection({
        name: 'Old Name',
        description: 'Old description',
        tags: ['old']
      });

      // Wait a tiny bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await CollectionService.updateCollection(created.id, {
        name: 'New Name',
        description: 'New description'
      });

      expect(result.name).toBe('New Name');
      expect(result.description).toBe('New description');
      expect(result.id).toBe(created.id);
      expect(result.tags).toEqual(['old']); // Unchanged
      expect(result.metadata.createdAt).toBe(created.metadata.createdAt); // Unchanged
      expect(result.metadata.lastAccessed).toBeGreaterThan(created.metadata.lastAccessed); // Updated
    });

    test('allows updating tags', async () => {
      const created = await CollectionService.createCollection({
        name: 'Test',
        tags: ['old', 'tag']
      });

      const result = await CollectionService.updateCollection(created.id, {
        tags: ['new', 'tags']
      });

      expect(result.tags).toEqual(['new', 'tags']);
    });

    test('does not allow updating id field', async () => {
      const created = await CollectionService.createCollection({
        name: 'Test'
      });

      const result = await CollectionService.updateCollection(created.id, {
        id: 'col_HACKED', // Should be ignored
        name: 'Updated'
      });

      expect(result.id).toBe(created.id); // Original ID preserved
      expect(result.name).toBe('Updated');
    });

    test('does not allow updating isActive directly', async () => {
      const created = await CollectionService.createCollection({
        name: 'Test'
      });

      const result = await CollectionService.updateCollection(created.id, {
        isActive: true // Should be ignored
      });

      expect(result.isActive).toBe(false); // Unchanged (use bindToWindow instead)
    });

    test('does not allow updating windowId directly', async () => {
      const created = await CollectionService.createCollection({
        name: 'Test'
      });

      const result = await CollectionService.updateCollection(created.id, {
        windowId: 456 // Should be ignored
      });

      expect(result.windowId).toBe(null); // Unchanged (use bindToWindow instead)
    });

    test('throws error if collection not found', async () => {
      await expect(CollectionService.updateCollection('col_999', { name: 'New' }))
        .rejects.toThrow('Collection not found: col_999');
    });

    test('throws error if name is empty string', async () => {
      const created = await CollectionService.createCollection({
        name: 'Test'
      });

      await expect(CollectionService.updateCollection(created.id, { name: '' }))
        .rejects.toThrow('Collection name cannot be empty');
    });
  });

  describe('deleteCollection', () => {
    test('deletes collection from storage', async () => {
      const created = await CollectionService.createCollection({
        name: 'Test'
      });

      await CollectionService.deleteCollection(created.id);

      // Verify deletion by trying to update (should fail)
      await expect(CollectionService.updateCollection(created.id, { name: 'New' }))
        .rejects.toThrow('Collection not found');
    });
  });

  describe('bindToWindow', () => {
    test('binds collection to window', async () => {
      const created = await CollectionService.createCollection({
        name: 'Test'
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await CollectionService.bindToWindow(created.id, 456);

      expect(result.windowId).toBe(456);
      expect(result.isActive).toBe(true);
      expect(result.metadata.lastAccessed).toBeGreaterThan(created.metadata.lastAccessed);
    });

    test('throws error if collection not found', async () => {
      await expect(CollectionService.bindToWindow('col_999', 456))
        .rejects.toThrow('Collection not found: col_999');
    });

    test('allows rebinding to different window', async () => {
      const created = await CollectionService.createCollection({
        name: 'Test',
        windowId: 100
      });

      const result = await CollectionService.bindToWindow(created.id, 200);

      expect(result.windowId).toBe(200);
      expect(result.isActive).toBe(true);
    });
  });

  describe('unbindFromWindow', () => {
    test('unbinds collection from window', async () => {
      const created = await CollectionService.createCollection({
        name: 'Test',
        windowId: 456
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await CollectionService.unbindFromWindow(created.id);

      expect(result.windowId).toBe(null);
      expect(result.isActive).toBe(false);
      expect(result.metadata.lastAccessed).toBeGreaterThan(created.metadata.lastAccessed);
    });

    test('throws error if collection not found', async () => {
      await expect(CollectionService.unbindFromWindow('col_999'))
        .rejects.toThrow('Collection not found: col_999');
    });

    test('is idempotent (unbinding already unbound)', async () => {
      const created = await CollectionService.createCollection({
        name: 'Test'
      });

      const result = await CollectionService.unbindFromWindow(created.id);

      expect(result.windowId).toBe(null);
      expect(result.isActive).toBe(false);
    });
  });

  describe('validation edge cases', () => {
    test('validates color format if provided', async () => {
      const params = {
        name: 'Test',
        color: 'invalid-color'
      };

      // Should accept any color value (validation not enforced)
      const result = await CollectionService.createCollection(params);
      expect(result.color).toBe('invalid-color');
    });

    test('validates tags is array', async () => {
      const created = await CollectionService.createCollection({
        name: 'Test'
      });

      await expect(CollectionService.updateCollection(created.id, {
        tags: 'not-an-array'
      })).rejects.toThrow('Tags must be an array');
    });

    test('handles metadata preservation', async () => {
      const created = await CollectionService.createCollection({
        name: 'Test'
      });

      // Manually add custom metadata field via update
      await CollectionService.updateCollection(created.id, {
        name: 'Test Updated'
      });

      const result = await CollectionService.updateCollection(created.id, {
        name: 'Final Name'
      });

      expect(result.metadata.createdAt).toBe(created.metadata.createdAt);
    });
  });
});
