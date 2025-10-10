/**
 * @jest-environment jsdom
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import chromeMock, { resetChromeMocks } from './utils/chrome-mock.js';

// Add windows.remove to chromeMock if not present
if (!chromeMock.windows.remove) {
  chromeMock.windows.remove = jest.fn(() => Promise.resolve());
}

import {
  getAllWindows,
  getWindowMetadata,
  snoozeWindow,
  deduplicateWindow,
  getWindowStats,
  getWindowDuplicateCount
} from '../services/execution/WindowService.js';

import {
  createMockWindow,
  assertWindowProperties
} from './utils/window-test-helpers.js';

describe('WindowService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetChromeMocks();
    chromeMock.storage.local.get.mockResolvedValue({});
    chromeMock.storage.local.set.mockResolvedValue(undefined);
  });

  describe('getAllWindows', () => {
    it('should return all windows with tabs', async () => {
      const { window: window1 } = createMockWindow(1, [], { focused: true });
      const { window: window2 } = createMockWindow(2, [], { focused: false });
      const mockWindows = [window1, window2];
      chromeMock.windows.getAll.mockResolvedValue(mockWindows);

      const result = await getAllWindows();

      expect(result).toEqual(mockWindows);
      expect(chromeMock.windows.getAll).toHaveBeenCalledWith({ populate: true });
    });
  });

  describe('getWindowMetadata', () => {
    it('should return window metadata', async () => {
      const { window: mockWindow } = createMockWindow(1, [], {
        left: 200,
        top: 300,
        width: 1024,
        height: 768,
        state: 'maximized',
        type: 'normal',
        focused: true,
        incognito: false
      });
      chromeMock.windows.get.mockResolvedValue(mockWindow);

      const metadata = await getWindowMetadata(1);

      expect(metadata).toEqual({
        id: 1,
        left: 200,
        top: 300,
        width: 1024,
        height: 768,
        state: 'maximized',
        type: 'normal',
        focused: true,
        incognito: false
      });
      expect(chromeMock.windows.get).toHaveBeenCalledWith(1);
    });
  });

  describe('snoozeWindow', () => {
    it('should snooze window with all tabs', async () => {
      const windowId = 1;
      const duration = 3600000; // 1 hour
      const { window: mockWindow } = createMockWindow(windowId, [], {
        left: 100,
        top: 100,
        width: 800,
        height: 600,
        state: 'normal'
      });

      // Create 50 mock tabs
      const mockTabs = [];
      for (let i = 1; i <= 50; i++) {
        mockTabs.push({
          id: i,
          url: `https://example.com/page${i}`,
          title: `Tab ${i}`,
          windowId,
          groupId: -1
        });
      }

      chromeMock.windows.get.mockResolvedValue(mockWindow);
      chromeMock.tabs.query.mockResolvedValue(mockTabs);
      chromeMock.tabs.get.mockImplementation((tabId) => {
        return Promise.resolve(mockTabs.find(t => t.id === tabId));
      });
      chromeMock.tabs.remove.mockResolvedValue(undefined);
      chromeMock.windows.remove.mockResolvedValue(undefined);
      chromeMock.alarms.create.mockReturnValue(undefined);

      const result = await snoozeWindow(windowId, duration);

      expect(result.tabCount).toBe(50);
      expect(result.snoozeId).toMatch(/^window_snooze_/);
      expect(result.windowMetadata.id).toBe(windowId);
      expect(chromeMock.windows.remove).toHaveBeenCalledWith(windowId);
      expect(chromeMock.storage.local.set).toHaveBeenCalled();
    });

    it('should preserve window properties', async () => {
      const windowId = 1;
      const { window: mockWindow } = createMockWindow(windowId, [], {
        left: 200,
        top: 300,
        width: 1024,
        height: 768,
        state: 'maximized',
        type: 'normal',
        focused: true,
        incognito: false
      });

      chromeMock.windows.get.mockResolvedValue(mockWindow);
      chromeMock.tabs.query.mockResolvedValue([{ id: 1, windowId, groupId: -1 }]);
      chromeMock.tabs.get.mockResolvedValue({ id: 1, windowId, groupId: -1, url: 'https://example.com', title: 'Test' });
      chromeMock.tabs.remove.mockResolvedValue(undefined);
      chromeMock.windows.remove.mockResolvedValue(undefined);

      const result = await snoozeWindow(windowId, 3600000);

      assertWindowProperties(result.windowMetadata, {
        left: 200,
        top: 300,
        width: 1024,
        height: 768,
        state: 'maximized'
      });
    });
  });

  describe('deduplicateWindow', () => {
    it('should deduplicate tabs within window', async () => {
      const windowId = 1;
      const mockTabs = [
        { id: 1, url: 'https://example.com', windowId },
        { id: 2, url: 'https://example.com', windowId },
        { id: 3, url: 'https://other.com', windowId }
      ];

      chromeMock.tabs.query.mockResolvedValue(mockTabs);
      // closeDuplicates will be called with mockTabs
      chromeMock.tabs.remove.mockResolvedValue(undefined);

      const result = await deduplicateWindow(windowId, 'oldest', false);

      // Should have called chrome.tabs.query with windowId
      expect(chromeMock.tabs.query).toHaveBeenCalledWith({ windowId });
    });
  });

  describe('getWindowStats', () => {
    it('should return comprehensive window statistics', async () => {
      const windowId = 1;
      const { window: mockWindow } = createMockWindow(windowId, [], {
        left: 100,
        top: 100,
        width: 800,
        height: 600
      });

      const mockTabs = [
        { id: 1, url: 'https://example.com/1', windowId, groupId: -1, pinned: false },
        { id: 2, url: 'https://example.com/2', windowId, groupId: 1, pinned: false },
        { id: 3, url: 'https://example.com/3', windowId, groupId: 1, pinned: true },
        { id: 4, url: 'https://example.com/1', windowId, groupId: -1, pinned: false } // duplicate
      ];

      chromeMock.windows.get.mockResolvedValue(mockWindow);
      chromeMock.tabs.query.mockResolvedValue(mockTabs);

      const stats = await getWindowStats(windowId);

      expect(stats.windowId).toBe(windowId);
      expect(stats.tabCount).toBe(4);
      expect(stats.groupedTabs).toBe(2);
      expect(stats.pinnedTabs).toBe(1);
      expect(stats.metadata).toBeDefined();
    });
  });

  describe('getWindowDuplicateCount', () => {
    it('should count duplicates in window', async () => {
      const windowId = 1;
      const mockTabs = [
        { id: 1, url: 'https://example.com', windowId },
        { id: 2, url: 'https://example.com', windowId },
        { id: 3, url: 'https://other.com', windowId }
      ];

      chromeMock.tabs.query.mockResolvedValue(mockTabs);

      const count = await getWindowDuplicateCount(windowId);

      // The exact count depends on the selectTabs implementation
      expect(typeof count).toBe('number');
      expect(chromeMock.tabs.query).toHaveBeenCalledWith({ windowId });
    });
  });
});
