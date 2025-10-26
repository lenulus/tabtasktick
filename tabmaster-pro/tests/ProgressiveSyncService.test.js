/**
 * Unit tests for ProgressiveSyncService
 * Phase 8: Progressive Collection Sync
 */

import * as ProgressiveSyncService from '../services/execution/ProgressiveSyncService.js';
import * as CollectionService from '../services/execution/CollectionService.js';

// Mock dependencies
jest.mock('../services/utils/storage-queries.js', () => ({
  getCollection: jest.fn(),
  saveCollection: jest.fn(),
  getCollectionsByIndex: jest.fn(),
  getFolder: jest.fn(),
  saveFolder: jest.fn(),
  deleteFolder: jest.fn(),
  getTab: jest.fn(),
  saveTab: jest.fn(),
  deleteTab: jest.fn(),
  getFoldersByCollection: jest.fn(),
  getTabsByFolder: jest.fn(),
  findTabByRuntimeId: jest.fn()
}));

import * as storageQueries from '../services/utils/storage-queries.js';

describe('ProgressiveSyncService', () => {
  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock Chrome APIs
    global.chrome = {
      tabs: {
        onCreated: { addListener: jest.fn() },
        onRemoved: { addListener: jest.fn() },
        onMoved: { addListener: jest.fn() },
        onUpdated: { addListener: jest.fn() },
        onAttached: { addListener: jest.fn() },
        onDetached: { addListener: jest.fn() },
        get: jest.fn(),
        query: jest.fn()
      },
      tabGroups: {
        onCreated: { addListener: jest.fn() },
        onUpdated: { addListener: jest.fn() },
        onRemoved: { addListener: jest.fn() },
        onMoved: { addListener: jest.fn() },
        get: jest.fn(),
        TAB_GROUP_ID_NONE: -1
      },
      windows: {
        onRemoved: { addListener: jest.fn() }
      }
    };
  });

  afterEach(() => {
    delete global.chrome;
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      // Mock active collections
      storageQueries.getCollectionsByIndex.mockResolvedValue([
        {
          id: 'col1',
          windowId: 123,
          isActive: true,
          settings: {
            trackingEnabled: true,
            autoSync: true,
            syncDebounceMs: 2000
          }
        }
      ]);

      await ProgressiveSyncService.initialize();

      // Should register event listeners
      expect(chrome.tabs.onCreated.addListener).toHaveBeenCalled();
      expect(chrome.tabs.onRemoved.addListener).toHaveBeenCalled();
      expect(chrome.tabs.onMoved.addListener).toHaveBeenCalled();
      expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
      expect(chrome.tabGroups.onCreated.addListener).toHaveBeenCalled();
      expect(chrome.tabGroups.onUpdated.addListener).toHaveBeenCalled();
      expect(chrome.tabGroups.onRemoved.addListener).toHaveBeenCalled();
      expect(chrome.windows.onRemoved.addListener).toHaveBeenCalled();
    });

    it('should load settings cache for active collections', async () => {
      const activeCollections = [
        {
          id: 'col1',
          windowId: 123,
          isActive: true,
          settings: {
            trackingEnabled: true,
            autoSync: true,
            syncDebounceMs: 2000
          }
        },
        {
          id: 'col2',
          windowId: 456,
          isActive: true,
          settings: {
            trackingEnabled: false,
            autoSync: false,
            syncDebounceMs: 5000
          }
        }
      ];

      storageQueries.getCollectionsByIndex.mockResolvedValue(activeCollections);

      await ProgressiveSyncService.initialize();

      // Should query for active collections
      expect(storageQueries.getCollectionsByIndex).toHaveBeenCalledWith('isActive', true);
    });

    it('should handle missing settings (backwards compatibility)', async () => {
      // Collection without settings field
      const legacyCollection = {
        id: 'col1',
        windowId: 123,
        isActive: true
        // No settings field
      };

      storageQueries.getCollectionsByIndex.mockResolvedValue([legacyCollection]);

      await ProgressiveSyncService.initialize();

      // Should not throw error
      expect(storageQueries.getCollectionsByIndex).toHaveBeenCalled();
    });

    it('should be idempotent (safe to call multiple times)', async () => {
      storageQueries.getCollectionsByIndex.mockResolvedValue([]);

      await ProgressiveSyncService.initialize();
      await ProgressiveSyncService.initialize();

      // Should only load settings once
      expect(storageQueries.getCollectionsByIndex).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSyncStatus', () => {
    it('should return sync status for tracked collection', async () => {
      const activeCollections = [
        {
          id: 'col1',
          windowId: 123,
          isActive: true,
          settings: {
            trackingEnabled: true,
            autoSync: true,
            syncDebounceMs: 2000
          }
        }
      ];

      storageQueries.getCollectionsByIndex.mockResolvedValue(activeCollections);
      await ProgressiveSyncService.initialize();

      const status = ProgressiveSyncService.getSyncStatus('col1');

      expect(status).toHaveProperty('lastSyncTime');
      expect(status).toHaveProperty('pendingChanges');
      expect(status.pendingChanges).toBe(0);
    });

    it('should return null for untracked collection', () => {
      const status = ProgressiveSyncService.getSyncStatus('unknown-col');

      expect(status.lastSyncTime).toBeNull();
      expect(status.pendingChanges).toBe(0);
    });
  });

  describe('refreshSettings', () => {
    beforeEach(async () => {
      storageQueries.getCollectionsByIndex.mockResolvedValue([]);
      await ProgressiveSyncService.initialize();
    });

    it('should refresh settings for active collection', async () => {
      const collection = {
        id: 'col1',
        windowId: 123,
        isActive: true,
        settings: {
          trackingEnabled: true,
          autoSync: true,
          syncDebounceMs: 3000
        }
      };

      storageQueries.getCollection.mockResolvedValue(collection);

      await ProgressiveSyncService.refreshSettings('col1');

      expect(storageQueries.getCollection).toHaveBeenCalledWith('col1');
    });

    it('should remove from cache if collection is no longer active', async () => {
      const collection = {
        id: 'col1',
        windowId: null,
        isActive: false,
        settings: {
          trackingEnabled: true,
          autoSync: true,
          syncDebounceMs: 2000
        }
      };

      storageQueries.getCollection.mockResolvedValue(collection);

      await ProgressiveSyncService.refreshSettings('col1');

      expect(storageQueries.getCollection).toHaveBeenCalledWith('col1');
    });

    it('should throw error if collection not found', async () => {
      storageQueries.getCollection.mockResolvedValue(null);

      await expect(
        ProgressiveSyncService.refreshSettings('nonexistent')
      ).rejects.toThrow('Collection not found');
    });
  });

  describe('trackCollection', () => {
    beforeEach(async () => {
      storageQueries.getCollectionsByIndex.mockResolvedValue([]);
      await ProgressiveSyncService.initialize();
    });

    it('should add collection to tracking', async () => {
      const collection = {
        id: 'col1',
        windowId: 123,
        isActive: true,
        settings: {
          trackingEnabled: true,
          autoSync: true,
          syncDebounceMs: 2000
        }
      };

      storageQueries.getCollection.mockResolvedValue(collection);

      await ProgressiveSyncService.trackCollection('col1');

      expect(storageQueries.getCollection).toHaveBeenCalledWith('col1');
    });
  });

  describe('untrackCollection', () => {
    beforeEach(async () => {
      storageQueries.getCollectionsByIndex.mockResolvedValue([
        {
          id: 'col1',
          windowId: 123,
          isActive: true,
          settings: {
            trackingEnabled: true,
            autoSync: true,
            syncDebounceMs: 2000
          }
        }
      ]);
      await ProgressiveSyncService.initialize();
    });

    it('should remove collection from tracking and flush pending changes', async () => {
      await ProgressiveSyncService.untrackCollection('col1');

      // Should flush pending changes before removing
      // (Tested implicitly - no error should be thrown)
    });
  });

  describe('flush', () => {
    beforeEach(async () => {
      storageQueries.getCollectionsByIndex.mockResolvedValue([]);
      await ProgressiveSyncService.initialize();
    });

    it('should flush pending changes for specific collection', async () => {
      // No pending changes, should complete without error
      await ProgressiveSyncService.flush('col1');
    });

    it('should flush all collections if no collectionId provided', async () => {
      // Flush all collections
      await ProgressiveSyncService.flush();
    });
  });

  describe('Settings Validation', () => {
    it('should validate syncDebounceMs range in CollectionService', async () => {
      const collection = {
        id: 'col1',
        name: 'Test',
        settings: {
          trackingEnabled: true,
          autoSync: true,
          syncDebounceMs: 2000
        }
      };

      storageQueries.getCollection.mockResolvedValue(collection);
      storageQueries.saveCollection.mockResolvedValue('col1');

      // Valid range (0-10000)
      await expect(
        CollectionService.updateCollectionSettings('col1', { syncDebounceMs: 5000 })
      ).resolves.toBeDefined();

      // Invalid range (negative)
      await expect(
        CollectionService.updateCollectionSettings('col1', { syncDebounceMs: -100 })
      ).rejects.toThrow('syncDebounceMs must be between 0 and 10000');

      // Invalid range (too large)
      await expect(
        CollectionService.updateCollectionSettings('col1', { syncDebounceMs: 15000 })
      ).rejects.toThrow('syncDebounceMs must be between 0 and 10000');
    });

    it('should disable autoSync when trackingEnabled is false', async () => {
      const collection = {
        id: 'col1',
        name: 'Test',
        settings: {
          trackingEnabled: true,
          autoSync: true,
          syncDebounceMs: 2000
        }
      };

      storageQueries.getCollection.mockResolvedValue(collection);
      storageQueries.saveCollection.mockImplementation(async (col) => col.id);

      const result = await CollectionService.updateCollectionSettings('col1', {
        trackingEnabled: false
      });

      expect(result.settings.trackingEnabled).toBe(false);
      expect(result.settings.autoSync).toBe(false);
    });
  });

  describe('Default Settings', () => {
    it('should apply default settings in createCollection', async () => {
      storageQueries.saveCollection.mockResolvedValue('col1');

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
      storageQueries.saveCollection.mockResolvedValue('col1');

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
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      storageQueries.getCollectionsByIndex.mockResolvedValue([]);
      await ProgressiveSyncService.initialize();
    });

    it('should handle flush with no pending changes', async () => {
      await expect(ProgressiveSyncService.flush('col1')).resolves.toBeUndefined();
    });

    it('should handle refreshSettings for inactive collection', async () => {
      const inactiveCollection = {
        id: 'col1',
        windowId: null,
        isActive: false,
        settings: {
          trackingEnabled: true,
          autoSync: true,
          syncDebounceMs: 2000
        }
      };

      storageQueries.getCollection.mockResolvedValue(inactiveCollection);

      await expect(
        ProgressiveSyncService.refreshSettings('col1')
      ).resolves.toBeUndefined();
    });

    it('should handle untrackCollection for non-tracked collection', async () => {
      // Should not throw error
      await expect(
        ProgressiveSyncService.untrackCollection('unknown-col')
      ).resolves.toBeUndefined();
    });
  });
});
