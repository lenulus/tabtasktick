/**
 * RestoreCollectionService Tests
 *
 * Tests for collection restoration orchestration. Uses real storage utilities
 * with fake-indexeddb and mocked Chrome APIs for integration testing.
 */

import 'fake-indexeddb/auto';
import { closeDB } from '../services/utils/db.js';
import * as RestoreCollectionService from '../services/execution/RestoreCollectionService.js';
import * as CaptureWindowService from '../services/execution/CaptureWindowService.js';

describe('RestoreCollectionService', () => {
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

  describe('restoreCollection', () => {
    test('restores collection as new window with tabs and groups', async () => {
      // First capture a window to have data to restore
      chrome.windows.get.mockResolvedValue({ id: 123 });
      chrome.tabs.query.mockResolvedValue([
        {
          id: 1,
          url: 'https://github.com/repo1',
          title: 'Repo 1',
          favIconUrl: 'https://github.com/favicon.ico',
          index: 0,
          groupId: 1,
          pinned: false
        },
        {
          id: 2,
          url: 'https://github.com/repo2',
          title: 'Repo 2',
          favIconUrl: 'https://github.com/favicon.ico',
          index: 1,
          groupId: 1,
          pinned: false
        }
      ]);
      chrome.tabGroups.query.mockResolvedValue([
        {
          id: 1,
          title: 'GitHub Repos',
          color: 'blue',
          collapsed: false
        }
      ]);

      const captured = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Test Collection' },
        keepActive: false // Save as inactive
      });

      expect(captured.collection.isActive).toBe(false);

      // Now restore the collection
      let newTabId = 100;
      chrome.tabs.create.mockImplementation(() =>
        Promise.resolve({ id: newTabId++, windowId: 456 })
      );
      chrome.tabs.group.mockResolvedValue(10); // Mock group ID
      chrome.tabGroups.update.mockResolvedValue({});
      chrome.windows.create.mockResolvedValue({ id: 456 });
      chrome.tabs.query.mockResolvedValue([]); // No default tabs

      const result = await RestoreCollectionService.restoreCollection({
        collectionId: captured.collection.id
      });

      // Verify window created
      expect(chrome.windows.create).toHaveBeenCalledWith({
        focused: true,
        state: 'normal',
        url: 'about:blank'
      });

      // Verify tabs created
      expect(result.stats.tabsRestored).toBe(2);
      expect(result.stats.tabsSkipped).toBe(0);
      expect(result.stats.groupsRestored).toBe(1);

      // Verify collection is now active
      expect(result.windowId).toBe(456);
    });

    test('restores collection in existing window', async () => {
      // Capture window first
      chrome.windows.get.mockResolvedValue({ id: 123 });
      chrome.tabs.query.mockResolvedValue([
        {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
          index: 0,
          groupId: -1,
          pinned: false
        }
      ]);
      chrome.tabGroups.query.mockResolvedValue([]);

      const captured = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Test' },
        keepActive: false
      });

      // Restore in existing window
      chrome.tabs.create.mockResolvedValue({ id: 200, windowId: 789 });

      const result = await RestoreCollectionService.restoreCollection({
        collectionId: captured.collection.id,
        createNewWindow: false,
        windowId: 789
      });

      // Should not create new window
      expect(chrome.windows.create).not.toHaveBeenCalled();

      // Should use specified window
      expect(result.windowId).toBe(789);
      expect(result.stats.tabsRestored).toBe(1);
    });

    test('skips system tabs during restoration', async () => {
      // NOTE: System tabs are already skipped during capture, so they never
      // make it into the collection. This test verifies the behavior is correct
      // by checking that only valid tabs were captured.

      // Capture window with system tabs
      chrome.windows.get.mockResolvedValue({ id: 123 });
      chrome.tabs.query.mockResolvedValue([
        {
          id: 1,
          url: 'chrome://settings',
          title: 'Settings',
          index: 0,
          groupId: -1
        },
        {
          id: 2,
          url: 'https://example.com',
          title: 'Example',
          index: 1,
          groupId: -1
        }
      ]);
      chrome.tabGroups.query.mockResolvedValue([]);

      const captured = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Test' },
        keepActive: false
      });

      // System tab was skipped during capture
      expect(captured.stats.tabsCaptured).toBe(1);
      expect(captured.stats.tabsSkipped).toBe(1);

      // Restore collection
      chrome.tabs.create.mockResolvedValue({ id: 300, windowId: 456 });
      chrome.windows.create.mockResolvedValue({ id: 456 });
      chrome.tabs.query.mockResolvedValue([]);

      const result = await RestoreCollectionService.restoreCollection({
        collectionId: captured.collection.id
      });

      // Only the valid tab should be restored
      expect(result.stats.tabsRestored).toBe(1);
      expect(result.stats.tabsSkipped).toBe(0); // Already filtered during capture
    });

    test('preserves pinned status on restoration', async () => {
      // Capture with pinned tab
      chrome.windows.get.mockResolvedValue({ id: 123 });
      chrome.tabs.query.mockResolvedValue([
        {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
          index: 0,
          groupId: -1,
          pinned: true
        }
      ]);
      chrome.tabGroups.query.mockResolvedValue([]);

      const captured = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Test' },
        keepActive: false
      });

      // Restore
      chrome.tabs.create.mockResolvedValue({ id: 400, windowId: 456 });
      chrome.windows.create.mockResolvedValue({ id: 456 });
      chrome.tabs.query.mockResolvedValue([]);

      await RestoreCollectionService.restoreCollection({
        collectionId: captured.collection.id
      });

      // Verify pinned status passed to create
      expect(chrome.tabs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          pinned: true
        })
      );
    });

    test('recreates tab groups with correct properties', async () => {
      // Capture with group
      chrome.windows.get.mockResolvedValue({ id: 123 });
      chrome.tabs.query.mockResolvedValue([
        {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
          index: 0,
          groupId: 1,
          pinned: false
        }
      ]);
      chrome.tabGroups.query.mockResolvedValue([
        {
          id: 1,
          title: 'Test Group',
          color: 'red',
          collapsed: true
        }
      ]);

      const captured = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Test' },
        keepActive: false
      });

      // Restore
      chrome.tabs.create.mockResolvedValue({ id: 500, windowId: 456 });
      chrome.tabs.group.mockResolvedValue(20); // Group ID
      chrome.tabGroups.update.mockResolvedValue({});
      chrome.windows.create.mockResolvedValue({ id: 456 });
      chrome.tabs.query.mockResolvedValue([]);

      await RestoreCollectionService.restoreCollection({
        collectionId: captured.collection.id
      });

      // Verify group created with correct properties
      expect(chrome.tabGroups.update).toHaveBeenCalledWith(
        20,
        expect.objectContaining({
          title: 'Test Group',
          color: 'red',
          collapsed: true
        })
      );
    });

    test('skips ungrouped folder during group creation', async () => {
      // Capture with ungrouped tabs only
      chrome.windows.get.mockResolvedValue({ id: 123 });
      chrome.tabs.query.mockResolvedValue([
        {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
          index: 0,
          groupId: -1,
          pinned: false
        }
      ]);
      chrome.tabGroups.query.mockResolvedValue([]);

      const captured = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Test' },
        keepActive: false
      });

      // Restore
      chrome.tabs.create.mockResolvedValue({ id: 600, windowId: 456 });
      chrome.windows.create.mockResolvedValue({ id: 456 });
      chrome.tabs.query.mockResolvedValue([]);

      const result = await RestoreCollectionService.restoreCollection({
        collectionId: captured.collection.id
      });

      // No groups should be created for ungrouped folder
      expect(chrome.tabs.group).not.toHaveBeenCalled();
      expect(result.stats.groupsRestored).toBe(0);
    });

    test('removes default blank tab in new window', async () => {
      // Capture window
      chrome.windows.get.mockResolvedValue({ id: 123 });
      chrome.tabs.query.mockResolvedValue([
        {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
          index: 0,
          groupId: -1,
          pinned: false
        }
      ]);
      chrome.tabGroups.query.mockResolvedValue([]);

      const captured = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Test' },
        keepActive: false
      });

      // Restore with default blank tab
      const defaultTab = { id: 999, url: 'about:blank' };
      chrome.windows.create.mockResolvedValue({ id: 456 });
      chrome.tabs.query.mockResolvedValue([defaultTab]);
      chrome.tabs.remove.mockResolvedValue();
      chrome.tabs.create.mockResolvedValue({ id: 700, windowId: 456 });

      await RestoreCollectionService.restoreCollection({
        collectionId: captured.collection.id
      });

      // Verify default tab removed
      expect(chrome.tabs.remove).toHaveBeenCalledWith(999);
    });

    test('throws error if collectionId missing', async () => {
      await expect(
        RestoreCollectionService.restoreCollection({})
      ).rejects.toThrow('Collection ID is required');
    });

    test('throws error if collection not found', async () => {
      await expect(
        RestoreCollectionService.restoreCollection({
          collectionId: 'nonexistent'
        })
      ).rejects.toThrow('Collection not found');
    });

    test('throws error if windowId required but not provided', async () => {
      // Create a collection first
      chrome.windows.get.mockResolvedValue({ id: 123 });
      chrome.tabs.query.mockResolvedValue([
        {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
          index: 0,
          groupId: -1
        }
      ]);
      chrome.tabGroups.query.mockResolvedValue([]);

      const captured = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Test' },
        keepActive: false
      });

      await expect(
        RestoreCollectionService.restoreCollection({
          collectionId: captured.collection.id,
          createNewWindow: false
          // Missing windowId
        })
      ).rejects.toThrow('windowId is required when createNewWindow=false');
    });

    test('throws error if collection has no tabs', async () => {
      // Manually create empty collection
      chrome.windows.get.mockResolvedValue({ id: 123 });
      chrome.tabs.query.mockResolvedValue([]);
      chrome.tabGroups.query.mockResolvedValue([]);

      // This should fail during capture
      await expect(
        CaptureWindowService.captureWindow({
          windowId: 123,
          metadata: { name: 'Empty' }
        })
      ).rejects.toThrow('No capturable tabs in window');
    });

    test('handles window state option', async () => {
      // Capture window
      chrome.windows.get.mockResolvedValue({ id: 123 });
      chrome.tabs.query.mockResolvedValue([
        {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
          index: 0,
          groupId: -1
        }
      ]);
      chrome.tabGroups.query.mockResolvedValue([]);

      const captured = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Test' },
        keepActive: false
      });

      // Restore as maximized
      chrome.windows.create.mockResolvedValue({ id: 456 });
      chrome.tabs.query.mockResolvedValue([]);
      chrome.tabs.create.mockResolvedValue({ id: 800, windowId: 456 });

      await RestoreCollectionService.restoreCollection({
        collectionId: captured.collection.id,
        windowState: 'maximized'
      });

      expect(chrome.windows.create).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'maximized'
        })
      );
    });

    test('handles focused option', async () => {
      // Capture window
      chrome.windows.get.mockResolvedValue({ id: 123 });
      chrome.tabs.query.mockResolvedValue([
        {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
          index: 0,
          groupId: -1
        }
      ]);
      chrome.tabGroups.query.mockResolvedValue([]);

      const captured = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Test' },
        keepActive: false
      });

      // Restore without focus
      chrome.windows.create.mockResolvedValue({ id: 456 });
      chrome.tabs.query.mockResolvedValue([]);
      chrome.tabs.create.mockResolvedValue({ id: 900, windowId: 456 });

      await RestoreCollectionService.restoreCollection({
        collectionId: captured.collection.id,
        focused: false
      });

      expect(chrome.windows.create).toHaveBeenCalledWith(
        expect.objectContaining({
          focused: false
        })
      );
    });
  });
});
