/**
 * Integration tests for ProgressiveSyncService
 * Phase 8: Progressive Collection Sync
 *
 * Following integration testing pattern:
 * - Use real CollectionService implementations
 * - Only mock Chrome APIs (via global.chrome from setup.js)
 * - Use fake-indexeddb for storage
 */

import 'fake-indexeddb/auto';
import { jest } from '@jest/globals';
import { closeDB } from '../services/utils/db.js';
import * as ProgressiveSyncService from '../services/execution/ProgressiveSyncService.js';
import * as CollectionService from '../services/execution/CollectionService.js';

describe('ProgressiveSyncService', () => {
  // Add event listener mocks once before all tests
  beforeAll(() => {
    // Add event listener mocks to existing chromeMock (from setup.js)
    // ProgressiveSyncService needs these listeners
    chrome.tabs.onCreated = { addListener: jest.fn() };
    chrome.tabs.onRemoved = { addListener: jest.fn() };
    chrome.tabs.onMoved = { addListener: jest.fn() };
    chrome.tabs.onUpdated = { addListener: jest.fn() };
    chrome.tabs.onAttached = { addListener: jest.fn() };
    chrome.tabs.onDetached = { addListener: jest.fn() };
    chrome.tabGroups.onCreated = { addListener: jest.fn() };
    chrome.tabGroups.onUpdated = { addListener: jest.fn() };
    chrome.tabGroups.onRemoved = { addListener: jest.fn() };
    chrome.tabGroups.onMoved = { addListener: jest.fn() };
    chrome.windows.onRemoved = { addListener: jest.fn() };
  });

  beforeEach(async () => {
    // Close any existing connection and clear all databases
    closeDB();
    const databases = await indexedDB.databases();
    for (const db of databases) {
      indexedDB.deleteDatabase(db.name);
    }

    // Reset jest.fn() call counts for event listeners
    chrome.tabs.onCreated.addListener.mockClear();
    chrome.tabs.onRemoved.addListener.mockClear();
    chrome.tabs.onMoved.addListener.mockClear();
    chrome.tabs.onUpdated.addListener.mockClear();
    chrome.tabs.onAttached.addListener.mockClear();
    chrome.tabs.onDetached.addListener.mockClear();
    chrome.tabGroups.onCreated.addListener.mockClear();
    chrome.tabGroups.onUpdated.addListener.mockClear();
    chrome.tabGroups.onRemoved.addListener.mockClear();
    chrome.tabGroups.onMoved.addListener.mockClear();
    chrome.windows.onRemoved.addListener.mockClear();
  });

  afterEach(() => {
    closeDB();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      // Create real active collection using CollectionService
      await CollectionService.createCollection({
        name: 'Test Collection',
        windowId: 123,
        isActive: true,
        settings: {
          trackingEnabled: true,
          autoSync: true,
          syncDebounceMs: 2000
        }
      });

      await ProgressiveSyncService.initialize();

      // Verify Chrome event listeners were registered
      expect(chrome.tabs.onCreated.addListener).toHaveBeenCalled();
      expect(chrome.tabs.onRemoved.addListener).toHaveBeenCalled();
      expect(chrome.tabs.onMoved.addListener).toHaveBeenCalled();
      expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
      expect(chrome.tabGroups.onCreated.addListener).toHaveBeenCalled();
      expect(chrome.tabGroups.onUpdated.addListener).toHaveBeenCalled();
      expect(chrome.tabGroups.onRemoved.addListener).toHaveBeenCalled();
      expect(chrome.windows.onRemoved.addListener).toHaveBeenCalled();
    });

    it('should load settings cache for multiple active collections', async () => {
      // Initialize service first
      await ProgressiveSyncService.initialize();

      // Create multiple real active collections AFTER initialization
      const col1 = await CollectionService.createCollection({
        name: 'Collection 1',
        windowId: 123,
        isActive: true,
        settings: {
          trackingEnabled: true,
          autoSync: true,
          syncDebounceMs: 2000
        }
      });

      const col2 = await CollectionService.createCollection({
        name: 'Collection 2',
        windowId: 456,
        isActive: true,
        settings: {
          trackingEnabled: false,
          autoSync: false,
          syncDebounceMs: 5000
        }
      });

      // Track the newly created collections
      await ProgressiveSyncService.trackCollection(col1.id);
      await ProgressiveSyncService.trackCollection(col2.id);

      // Verify both collections are tracked (have sync status)
      const status1 = ProgressiveSyncService.getSyncStatus(col1.id);
      const status2 = ProgressiveSyncService.getSyncStatus(col2.id);

      expect(status1.lastSyncTime).not.toBeNull();
      expect(status2.lastSyncTime).not.toBeNull();
      expect(status1.pendingChanges).toBe(0);
      expect(status2.pendingChanges).toBe(0);
    });

    it('should handle collections without settings (backwards compatibility)', async () => {
      // Create collection without explicit settings (should get defaults)
      await CollectionService.createCollection({
        name: 'Legacy Collection',
        windowId: 123,
        isActive: true
      });

      // Should initialize without error
      await expect(ProgressiveSyncService.initialize()).resolves.toBeUndefined();
    });

    it('should be idempotent (safe to call multiple times)', async () => {
      await ProgressiveSyncService.initialize();

      // Second call should not throw error
      await expect(ProgressiveSyncService.initialize()).resolves.toBeUndefined();
    });
  });

  describe('getSyncStatus', () => {
    it('should return sync status for tracked collection', async () => {
      // Initialize first (may already be initialized from previous test)
      await ProgressiveSyncService.initialize();

      // Create and track a collection AFTER initialization
      const collection = await CollectionService.createCollection({
        name: 'Tracked Collection',
        windowId: 123,
        isActive: true,
        settings: {
          trackingEnabled: true,
          autoSync: true,
          syncDebounceMs: 2000
        }
      });

      // Manually track the new collection since it was created after initialize
      await ProgressiveSyncService.trackCollection(collection.id);

      const status = ProgressiveSyncService.getSyncStatus(collection.id);

      expect(status).toHaveProperty('lastSyncTime');
      expect(status).toHaveProperty('pendingChanges');
      expect(typeof status.lastSyncTime).toBe('number');
      expect(status.pendingChanges).toBe(0);
    });

    it('should return null lastSyncTime for untracked collection', () => {
      const status = ProgressiveSyncService.getSyncStatus('unknown-col-id');

      expect(status.lastSyncTime).toBeNull();
      expect(status.pendingChanges).toBe(0);
    });
  });

  describe('refreshSettings', () => {
    it('should refresh settings for active collection', async () => {
      await ProgressiveSyncService.initialize();

      const collection = await CollectionService.createCollection({
        name: 'Test Collection',
        windowId: 123,
        isActive: true,
        settings: {
          trackingEnabled: true,
          autoSync: true,
          syncDebounceMs: 3000
        }
      });

      // Should refresh without error
      await expect(
        ProgressiveSyncService.refreshSettings(collection.id)
      ).resolves.toBeUndefined();
    });

    it('should remove from cache when collection becomes inactive', async () => {
      await ProgressiveSyncService.initialize();

      // Create active collection
      const collection = await CollectionService.createCollection({
        name: 'Active Collection',
        windowId: 123,
        isActive: true
      });

      // Make it inactive
      const inactiveCollection = await CollectionService.unbindFromWindow(collection.id);
      expect(inactiveCollection.isActive).toBe(false);

      // Refresh should remove from cache (no error)
      await expect(
        ProgressiveSyncService.refreshSettings(collection.id)
      ).resolves.toBeUndefined();
    });

    it('should throw error if collection not found', async () => {
      await ProgressiveSyncService.initialize();

      await expect(
        ProgressiveSyncService.refreshSettings('nonexistent-id')
      ).rejects.toThrow('Collection not found');
    });
  });

  describe('trackCollection', () => {
    it('should add collection to tracking', async () => {
      await ProgressiveSyncService.initialize();

      const collection = await CollectionService.createCollection({
        name: 'New Collection',
        windowId: 123,
        isActive: true,
        settings: {
          trackingEnabled: true,
          autoSync: true,
          syncDebounceMs: 2000
        }
      });

      // Should track without error
      await expect(
        ProgressiveSyncService.trackCollection(collection.id)
      ).resolves.toBeUndefined();

      // Should now have sync status
      const status = ProgressiveSyncService.getSyncStatus(collection.id);
      expect(status.lastSyncTime).not.toBeNull();
    });
  });

  describe('untrackCollection', () => {
    it('should remove collection from tracking and flush pending changes', async () => {
      // Create and track collection
      const collection = await CollectionService.createCollection({
        name: 'Tracked Collection',
        windowId: 123,
        isActive: true,
        settings: {
          trackingEnabled: true,
          autoSync: true,
          syncDebounceMs: 2000
        }
      });

      await ProgressiveSyncService.initialize();

      // Should untrack without error
      await expect(
        ProgressiveSyncService.untrackCollection(collection.id)
      ).resolves.toBeUndefined();
    });

    it('should handle untracking non-tracked collection gracefully', async () => {
      await ProgressiveSyncService.initialize();

      // Should not throw error for unknown collection
      await expect(
        ProgressiveSyncService.untrackCollection('unknown-col')
      ).resolves.toBeUndefined();
    });
  });

  describe('flush', () => {
    it('should flush pending changes for specific collection', async () => {
      await ProgressiveSyncService.initialize();

      // Flush with no pending changes should complete without error
      await expect(
        ProgressiveSyncService.flush('col1')
      ).resolves.toBeUndefined();
    });

    it('should flush all collections when no collectionId provided', async () => {
      await ProgressiveSyncService.initialize();

      // Flush all should complete without error
      await expect(
        ProgressiveSyncService.flush()
      ).resolves.toBeUndefined();
    });
  });

  describe('Settings Validation (CollectionService)', () => {
    it('should validate syncDebounceMs range (0-10000ms)', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Test Collection',
        settings: {
          trackingEnabled: true,
          autoSync: true,
          syncDebounceMs: 2000
        }
      });

      // Valid range: 0-10000ms
      await expect(
        CollectionService.updateCollectionSettings(collection.id, {
          syncDebounceMs: 5000
        })
      ).resolves.toBeDefined();

      // Invalid: negative
      await expect(
        CollectionService.updateCollectionSettings(collection.id, {
          syncDebounceMs: -100
        })
      ).rejects.toThrow('syncDebounceMs must be between 0 and 10000');

      // Invalid: too large
      await expect(
        CollectionService.updateCollectionSettings(collection.id, {
          syncDebounceMs: 15000
        })
      ).rejects.toThrow('syncDebounceMs must be between 0 and 10000');
    });

    it('should auto-disable autoSync when trackingEnabled is false', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Test Collection',
        settings: {
          trackingEnabled: true,
          autoSync: true,
          syncDebounceMs: 2000
        }
      });

      const updated = await CollectionService.updateCollectionSettings(collection.id, {
        trackingEnabled: false
      });

      expect(updated.settings.trackingEnabled).toBe(false);
      expect(updated.settings.autoSync).toBe(false);
    });
  });

  describe('Default Settings', () => {
    it('should apply default settings when creating collection', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Test Collection'
      });

      expect(collection.settings).toEqual({
        trackingEnabled: true,
        autoSync: true,
        syncDebounceMs: 2000
      });
    });

    it('should merge custom settings with defaults', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Test Collection',
        settings: {
          syncDebounceMs: 5000
        }
      });

      expect(collection.settings).toEqual({
        trackingEnabled: true,
        autoSync: true,
        syncDebounceMs: 5000
      });
    });

    it('should allow overriding all default settings', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Test Collection',
        settings: {
          trackingEnabled: false,
          autoSync: false,
          syncDebounceMs: 8000
        }
      });

      expect(collection.settings).toEqual({
        trackingEnabled: false,
        autoSync: false,
        syncDebounceMs: 8000
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle flush with no pending changes', async () => {
      await ProgressiveSyncService.initialize();

      await expect(
        ProgressiveSyncService.flush('col1')
      ).resolves.toBeUndefined();
    });

    it('should handle refreshSettings for inactive collection', async () => {
      await ProgressiveSyncService.initialize();

      const collection = await CollectionService.createCollection({
        name: 'Inactive Collection',
        windowId: null,
        isActive: false,
        settings: {
          trackingEnabled: true,
          autoSync: true,
          syncDebounceMs: 2000
        }
      });

      await expect(
        ProgressiveSyncService.refreshSettings(collection.id)
      ).resolves.toBeUndefined();
    });

    it('should handle trackCollection for collection without settings', async () => {
      await ProgressiveSyncService.initialize();

      // Collection gets default settings via CollectionService
      const collection = await CollectionService.createCollection({
        name: 'Collection',
        windowId: 123,
        isActive: true
      });

      await expect(
        ProgressiveSyncService.trackCollection(collection.id)
      ).resolves.toBeUndefined();
    });

    it('should handle multiple initialize calls gracefully', async () => {
      // Should not throw errors when called multiple times
      await expect(ProgressiveSyncService.initialize()).resolves.toBeUndefined();
      await expect(ProgressiveSyncService.initialize()).resolves.toBeUndefined();
      await expect(ProgressiveSyncService.initialize()).resolves.toBeUndefined();

      // Service should still be functional
      const status = ProgressiveSyncService.getSyncStatus('any-id');
      expect(status).toHaveProperty('lastSyncTime');
      expect(status).toHaveProperty('pendingChanges');
    });
  });

  describe('CollectionService Integration', () => {
    it('should work with createCollection', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Integration Test',
        windowId: 123,
        isActive: true
      });

      expect(collection.settings).toBeDefined();
      expect(collection.settings.trackingEnabled).toBe(true);
      expect(collection.settings.autoSync).toBe(true);
      expect(collection.settings.syncDebounceMs).toBe(2000);
    });

    it('should work with updateCollectionSettings', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Update Test'
      });

      const updated = await CollectionService.updateCollectionSettings(collection.id, {
        trackingEnabled: false,
        syncDebounceMs: 3000
      });

      expect(updated.settings.trackingEnabled).toBe(false);
      expect(updated.settings.autoSync).toBe(false); // Auto-disabled
      expect(updated.settings.syncDebounceMs).toBe(3000);
    });

    it('should work with bindToWindow/unbindFromWindow', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Bind Test'
      });

      // Bind to window
      const bound = await CollectionService.bindToWindow(collection.id, 123);
      expect(bound.isActive).toBe(true);
      expect(bound.windowId).toBe(123);

      // Unbind from window
      const unbound = await CollectionService.unbindFromWindow(collection.id);
      expect(unbound.isActive).toBe(false);
      expect(unbound.windowId).toBeNull();
    });
  });
});
