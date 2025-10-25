/**
 * CaptureWindowService Tests
 *
 * Tests for window capture orchestration including tabs, tab groups,
 * and collection creation. Uses real storage utilities with fake-indexeddb
 * and mocked Chrome APIs for integration testing.
 */

import 'fake-indexeddb/auto';
import { closeDB } from '../services/utils/db.js';
import * as CaptureWindowService from '../services/execution/CaptureWindowService.js';

describe('CaptureWindowService', () => {
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

  describe('captureWindow', () => {
    test('captures window with tabs and groups', async () => {
      // Mock window
      chrome.windows.get.mockResolvedValue({
        id: 123,
        state: 'normal'
      });

      // Mock tabs
      chrome.tabs.query.mockResolvedValue([
        {
          id: 1,
          url: 'https://github.com/user/repo1',
          title: 'Repo 1',
          favIconUrl: 'https://github.com/favicon.ico',
          index: 0,
          groupId: 1,
          pinned: false,
          lastAccessed: Date.now()
        },
        {
          id: 2,
          url: 'https://github.com/user/repo2',
          title: 'Repo 2',
          favIconUrl: 'https://github.com/favicon.ico',
          index: 1,
          groupId: 1,
          pinned: false,
          lastAccessed: Date.now()
        },
        {
          id: 3,
          url: 'https://stackoverflow.com/questions/123',
          title: 'Stack Overflow Question',
          favIconUrl: 'https://stackoverflow.com/favicon.ico',
          index: 2,
          groupId: -1, // Ungrouped
          pinned: true,
          lastAccessed: Date.now()
        }
      ]);

      // Mock tab groups
      chrome.tabGroups.query.mockResolvedValue([
        {
          id: 1,
          title: 'GitHub Repos',
          color: 'blue',
          collapsed: false
        }
      ]);

      const result = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: {
          name: 'Test Collection',
          description: 'Test description',
          tags: ['test']
        }
      });

      // Verify collection created
      expect(result.collection).toMatchObject({
        name: 'Test Collection',
        description: 'Test description',
        tags: ['test'],
        isActive: true,
        windowId: 123
      });

      // Verify folders created (1 group + 1 ungrouped)
      expect(result.folders).toHaveLength(2);
      expect(result.folders[0]).toMatchObject({
        name: 'GitHub Repos',
        color: 'blue',
        collapsed: false,
        position: 0
      });
      expect(result.folders[1]).toMatchObject({
        name: 'Ungrouped',
        color: 'grey',
        collapsed: false,
        position: 1
      });

      // Verify tabs created
      expect(result.tabs).toHaveLength(3);
      expect(result.tabs[0]).toMatchObject({
        url: 'https://github.com/user/repo1',
        title: 'Repo 1',
        position: 0,
        isPinned: false
      });
      expect(result.tabs[1]).toMatchObject({
        url: 'https://github.com/user/repo2',
        title: 'Repo 2',
        position: 1,
        isPinned: false
      });
      expect(result.tabs[2]).toMatchObject({
        url: 'https://stackoverflow.com/questions/123',
        title: 'Stack Overflow Question',
        position: 0, // First in ungrouped folder
        isPinned: true
      });

      // Verify stats
      expect(result.stats).toMatchObject({
        tabsCaptured: 3,
        tabsSkipped: 0,
        foldersCaptured: 2
      });
      expect(result.stats.warnings).toHaveLength(0);
    });

    test('captures window as saved collection when keepActive=false', async () => {
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

      const result = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Saved Collection' },
        keepActive: false
      });

      // Collection should not be active
      expect(result.collection.isActive).toBe(false);
      expect(result.collection.windowId).toBeNull();

      // Tabs should not have tabId stored
      expect(result.tabs[0].tabId).toBeUndefined();
    });

    test('skips system tabs', async () => {
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
        },
        {
          id: 3,
          url: 'chrome-extension://abc123/popup.html',
          title: 'Extension',
          index: 2,
          groupId: -1
        }
      ]);
      chrome.tabGroups.query.mockResolvedValue([]);

      const result = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Test' }
      });

      // Only 1 tab should be captured
      expect(result.tabs).toHaveLength(1);
      expect(result.tabs[0].url).toBe('https://example.com');

      // Stats should show skipped count
      expect(result.stats.tabsSkipped).toBe(2);
      expect(result.stats.warnings).toContain('Skipped system tab: chrome://settings');
      expect(result.stats.warnings).toContain('Skipped system tab: chrome-extension://abc123/popup.html');
    });

    test('creates only ungrouped folder when no tab groups exist', async () => {
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

      const result = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Test' }
      });

      // Only ungrouped folder should exist
      expect(result.folders).toHaveLength(1);
      expect(result.folders[0].name).toBe('Ungrouped');
      expect(result.folders[0].color).toBe('grey');
    });

    test('skips empty tab groups', async () => {
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
      chrome.tabGroups.query.mockResolvedValue([
        {
          id: 1,
          title: 'Empty Group',
          color: 'blue',
          collapsed: false
        }
      ]);

      const result = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Test' }
      });

      // Empty group should be skipped
      expect(result.folders).toHaveLength(1);
      expect(result.folders[0].name).toBe('Ungrouped');
      expect(result.stats.warnings).toContain('Skipped empty tab group: Empty Group');
    });

    test('handles tab groups with invalid colors', async () => {
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
          color: 'invalid-color', // Invalid color
          collapsed: false
        }
      ]);

      const result = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Test' }
      });

      // Should fall back to 'grey' color
      expect(result.folders[0].color).toBe('grey');
    });

    test('preserves tab positions within folders', async () => {
      chrome.windows.get.mockResolvedValue({ id: 123 });
      chrome.tabs.query.mockResolvedValue([
        { id: 1, url: 'https://a.com', title: 'A', index: 0, groupId: 1 },
        { id: 2, url: 'https://b.com', title: 'B', index: 1, groupId: 1 },
        { id: 3, url: 'https://c.com', title: 'C', index: 2, groupId: 1 },
        { id: 4, url: 'https://d.com', title: 'D', index: 3, groupId: -1 },
        { id: 5, url: 'https://e.com', title: 'E', index: 4, groupId: -1 }
      ]);
      chrome.tabGroups.query.mockResolvedValue([
        { id: 1, title: 'Group 1', color: 'blue', collapsed: false }
      ]);

      const result = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Test' }
      });

      // Check positions within Group 1 folder
      const group1Tabs = result.tabs.filter(t => t.folderId === result.folders[0].id);
      expect(group1Tabs).toHaveLength(3);
      expect(group1Tabs[0].position).toBe(0);
      expect(group1Tabs[1].position).toBe(1);
      expect(group1Tabs[2].position).toBe(2);

      // Check positions within Ungrouped folder
      const ungroupedTabs = result.tabs.filter(t => t.folderId === result.folders[1].id);
      expect(ungroupedTabs).toHaveLength(2);
      expect(ungroupedTabs[0].position).toBe(0);
      expect(ungroupedTabs[1].position).toBe(1);
    });

    test('handles tabs without favicons', async () => {
      chrome.windows.get.mockResolvedValue({ id: 123 });
      chrome.tabs.query.mockResolvedValue([
        {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
          index: 0,
          groupId: -1,
          favIconUrl: undefined // No favicon
        }
      ]);
      chrome.tabGroups.query.mockResolvedValue([]);

      const result = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Test' }
      });

      expect(result.tabs[0].favicon).toBeUndefined();
    });

    test('throws error if windowId missing', async () => {
      await expect(
        CaptureWindowService.captureWindow({
          metadata: { name: 'Test' }
        })
      ).rejects.toThrow('Window ID is required');
    });

    test('throws error if metadata.name missing', async () => {
      await expect(
        CaptureWindowService.captureWindow({
          windowId: 123,
          metadata: {}
        })
      ).rejects.toThrow('Collection name is required');
    });

    test('throws error if window not found', async () => {
      chrome.windows.get.mockRejectedValue(new Error('Window not found'));

      await expect(
        CaptureWindowService.captureWindow({
          windowId: 999,
          metadata: { name: 'Test' }
        })
      ).rejects.toThrow('Window not found: 999');
    });

    test('throws error if all tabs are system tabs', async () => {
      chrome.windows.get.mockResolvedValue({ id: 123 });
      chrome.tabs.query.mockResolvedValue([
        { id: 1, url: 'chrome://settings', title: 'Settings', index: 0, groupId: -1 },
        { id: 2, url: 'chrome://extensions', title: 'Extensions', index: 1, groupId: -1 }
      ]);
      chrome.tabGroups.query.mockResolvedValue([]);

      await expect(
        CaptureWindowService.captureWindow({
          windowId: 123,
          metadata: { name: 'Test' }
        })
      ).rejects.toThrow('No capturable tabs in window');
    });

    test('warns when window has no tabs', async () => {
      chrome.windows.get.mockResolvedValue({ id: 123 });
      chrome.tabs.query.mockResolvedValue([]);
      chrome.tabGroups.query.mockResolvedValue([]);

      // Should still throw since no capturable tabs
      await expect(
        CaptureWindowService.captureWindow({
          windowId: 123,
          metadata: { name: 'Test' }
        })
      ).rejects.toThrow('No capturable tabs in window');
    });

    test('handles tab groups query failure gracefully', async () => {
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
      chrome.tabGroups.query.mockRejectedValue(new Error('Tab groups not supported'));

      const result = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Test' }
      });

      // Should continue without groups
      expect(result.tabs).toHaveLength(1);
      expect(result.folders).toHaveLength(1);
      expect(result.stats.warnings).toContain('Failed to fetch tab groups, continuing without groups');
    });
  });

  describe('suggestCollectionName', () => {
    test('suggests dominant domain when >= 30% threshold', () => {
      const tabs = [
        { url: 'https://github.com/user/repo1' },
        { url: 'https://github.com/user/repo2' },
        { url: 'https://github.com/user/repo3' },
        { url: 'https://stackoverflow.com/questions/123' }
      ];

      const name = CaptureWindowService.suggestCollectionName(tabs);

      // github.com appears 3/4 times (75% > 30%)
      expect(name).toBe('github.com');
    });

    test('returns "New Collection" when no dominant domain', () => {
      const tabs = [
        { url: 'https://a.com' },
        { url: 'https://b.com' },
        { url: 'https://c.com' }
      ];

      const name = CaptureWindowService.suggestCollectionName(tabs);

      // No domain reaches 30% threshold (each is 33%)
      expect(name).toBe('New Collection');
    });

    test('returns "New Collection" for empty tabs array', () => {
      expect(CaptureWindowService.suggestCollectionName([])).toBe('New Collection');
    });

    test('returns "New Collection" for null/undefined', () => {
      expect(CaptureWindowService.suggestCollectionName(null)).toBe('New Collection');
      expect(CaptureWindowService.suggestCollectionName(undefined)).toBe('New Collection');
    });

    test('skips system tabs when suggesting name', () => {
      const tabs = [
        { url: 'chrome://settings' },
        { url: 'https://github.com/user/repo1' },
        { url: 'https://github.com/user/repo2' }
      ];

      const name = CaptureWindowService.suggestCollectionName(tabs);

      // Should suggest github.com (2/2 non-system tabs = 100%)
      expect(name).toBe('github.com');
    });

    test('handles invalid URLs gracefully', () => {
      const tabs = [
        { url: 'invalid-url' },
        { url: 'https://github.com/repo1' },
        { url: 'https://github.com/repo2' }
      ];

      const name = CaptureWindowService.suggestCollectionName(tabs);

      // Should work with valid URLs only
      expect(name).toBe('github.com');
    });

    test('requires minimum 2 tabs even if 30% threshold met', () => {
      const tabs = [
        { url: 'https://github.com/repo' }
      ];

      const name = CaptureWindowService.suggestCollectionName(tabs);

      // 1 tab doesn't meet minimum threshold
      expect(name).toBe('New Collection');
    });
  });
});
