import {
  closeTabs,
  pinTabs,
  unpinTabs,
  muteTabs,
  unmuteTabs,
  moveTabsToWindow
} from '../services/execution/TabActionsService.js';

describe('TabActionsService', () => {
  describe('closeTabs', () => {
    test('closes single tab successfully', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);

      const result = await closeTabs([1]);

      expect(result.success).toBe(true);
      expect(result.closed).toEqual([1]);
      expect(result.errors).toEqual([]);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(1);
    });

    test('closes multiple tabs', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);

      const result = await closeTabs([1, 2, 3]);

      expect(result.success).toBe(true);
      expect(result.closed).toEqual([1, 2, 3]);
      expect(chrome.tabs.remove).toHaveBeenCalledTimes(3);
    });

    test('handles close errors gracefully', async () => {
      chrome.tabs.remove.mockRejectedValue(new Error('Tab not found'));

      const result = await closeTabs([999]);

      expect(result.success).toBe(false);
      expect(result.closed).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].tabId).toBe(999);
    });

    test('handles empty array', async () => {
      const result = await closeTabs([]);

      expect(result.success).toBe(true);
      expect(result.closed).toEqual([]);
      expect(chrome.tabs.remove).not.toHaveBeenCalled();
    });
  });

  describe('pinTabs', () => {
    test('pins single tab successfully', async () => {
      chrome.tabs.update.mockResolvedValue({});

      const result = await pinTabs([1]);

      expect(result.success).toBe(true);
      expect(result.pinned).toEqual([1]);
      expect(chrome.tabs.update).toHaveBeenCalledWith(1, { pinned: true });
    });

    test('pins multiple tabs', async () => {
      chrome.tabs.update.mockResolvedValue({});

      const result = await pinTabs([1, 2, 3]);

      expect(result.success).toBe(true);
      expect(result.pinned).toEqual([1, 2, 3]);
      expect(chrome.tabs.update).toHaveBeenCalledTimes(3);
    });

    test('handles pin errors', async () => {
      chrome.tabs.update.mockRejectedValue(new Error('Update failed'));

      const result = await pinTabs([1]);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('unpinTabs', () => {
    test('unpins single tab successfully', async () => {
      chrome.tabs.update.mockResolvedValue({});

      const result = await unpinTabs([1]);

      expect(result.success).toBe(true);
      expect(result.unpinned).toEqual([1]);
      expect(chrome.tabs.update).toHaveBeenCalledWith(1, { pinned: false });
    });

    test('unpins multiple tabs', async () => {
      chrome.tabs.update.mockResolvedValue({});

      const result = await unpinTabs([1, 2, 3]);

      expect(result.success).toBe(true);
      expect(result.unpinned).toEqual([1, 2, 3]);
    });
  });

  describe('muteTabs', () => {
    test('mutes single tab successfully', async () => {
      chrome.tabs.update.mockResolvedValue({});

      const result = await muteTabs([1]);

      expect(result.success).toBe(true);
      expect(result.muted).toEqual([1]);
      expect(chrome.tabs.update).toHaveBeenCalledWith(1, { muted: true });
    });

    test('mutes multiple tabs', async () => {
      chrome.tabs.update.mockResolvedValue({});

      const result = await muteTabs([1, 2, 3]);

      expect(result.success).toBe(true);
      expect(result.muted).toEqual([1, 2, 3]);
    });
  });

  describe('unmuteTabs', () => {
    test('unmutes single tab successfully', async () => {
      chrome.tabs.update.mockResolvedValue({});

      const result = await unmuteTabs([1]);

      expect(result.success).toBe(true);
      expect(result.unmuted).toEqual([1]);
      expect(chrome.tabs.update).toHaveBeenCalledWith(1, { muted: false });
    });

    test('unmutes multiple tabs', async () => {
      chrome.tabs.update.mockResolvedValue({});

      const result = await unmuteTabs([1, 2, 3]);

      expect(result.success).toBe(true);
      expect(result.unmuted).toEqual([1, 2, 3]);
    });
  });

  describe('moveTabsToWindow', () => {
    test('requires windowId parameter', async () => {
      const result = await moveTabsToWindow([1], {});

      expect(result.success).toBe(false);
      expect(result.errors[0].error).toContain('requires windowId');
    });

    test('moves tab to existing window', async () => {
      const mockTab = { id: 1, groupId: -1 };
      chrome.tabs.get.mockResolvedValue(mockTab);
      chrome.tabs.move.mockResolvedValue({});
      chrome.windows.getCurrent.mockResolvedValue({ id: 100 });

      const result = await moveTabsToWindow([1], { windowId: 200 });

      expect(result.success).toBe(true);
      expect(result.moved).toEqual([1]);
      expect(chrome.tabs.move).toHaveBeenCalledWith(1, {
        windowId: 200,
        index: -1
      });
    });

    test('creates new window when windowId is "new"', async () => {
      const mockTab = { id: 1, groupId: -1 };
      const mockNewWindow = { id: 999 };

      chrome.tabs.get.mockResolvedValue(mockTab);
      chrome.windows.getCurrent.mockResolvedValue({ id: 100 });
      chrome.windows.create.mockResolvedValue(mockNewWindow);

      const result = await moveTabsToWindow([1], { windowId: 'new' });

      expect(result.success).toBe(true);
      expect(result.moved).toEqual([1]);
      expect(result.details.newWindow).toBe(true);
      expect(result.details.windowId).toBe(999);
      expect(chrome.windows.create).toHaveBeenCalledWith({
        tabId: 1,
        focused: false
      });
    });

    test('preserves tab group when moving to existing window', async () => {
      const mockTab = { id: 1, groupId: 5 };
      const mockGroup = { title: 'Work', color: 'blue' };

      chrome.tabs.get.mockResolvedValue(mockTab);
      chrome.tabGroups.get.mockResolvedValue(mockGroup);
      chrome.tabs.move.mockResolvedValue({});
      chrome.tabs.group.mockResolvedValue(10); // New group ID
      chrome.tabGroups.update.mockResolvedValue({});
      chrome.windows.getCurrent.mockResolvedValue({ id: 100 });
      chrome.windows.update.mockResolvedValue({});

      const result = await moveTabsToWindow([1], { windowId: 200, preserveGroup: true });

      expect(result.success).toBe(true);
      expect(result.moved).toEqual([1]);
      expect(result.details.regrouped).toBe(true);

      // Verify group was recreated
      expect(chrome.tabs.group).toHaveBeenCalledWith({ tabIds: [1] });
      expect(chrome.tabGroups.update).toHaveBeenCalledWith(10, {
        title: 'Work',
        color: 'blue'
      });
    });

    test('restores window focus after moving with group preservation', async () => {
      const mockTab = { id: 1, groupId: 5 };
      const mockGroup = { title: 'Work', color: 'blue' };

      chrome.tabs.get.mockResolvedValue(mockTab);
      chrome.tabGroups.get.mockResolvedValue(mockGroup);
      chrome.tabs.move.mockResolvedValue({});
      chrome.tabs.group.mockResolvedValue(10);
      chrome.tabGroups.update.mockResolvedValue({});
      chrome.windows.getCurrent.mockResolvedValue({ id: 100 });
      chrome.windows.update.mockResolvedValue({});

      await moveTabsToWindow([1], { windowId: 200, preserveGroup: true });

      // Verify focus sequence: target window focused, then original restored
      expect(chrome.windows.update).toHaveBeenCalledWith(200, { focused: true });
      expect(chrome.windows.update).toHaveBeenCalledWith(100, { focused: true });
      expect(chrome.windows.update).toHaveBeenCalledTimes(2);
    });

    test('creates new window and preserves group', async () => {
      const mockTab = { id: 1, groupId: 5 };
      const mockGroup = { title: 'Work', color: 'blue' };
      const mockNewWindow = { id: 999 };

      chrome.tabs.get.mockResolvedValue(mockTab);
      chrome.tabGroups.get.mockResolvedValue(mockGroup);
      chrome.windows.getCurrent.mockResolvedValue({ id: 100 });
      chrome.windows.create.mockResolvedValue(mockNewWindow);
      chrome.windows.update.mockResolvedValue({});
      chrome.tabs.group.mockResolvedValue(10);
      chrome.tabGroups.update.mockResolvedValue({});

      const result = await moveTabsToWindow([1], { windowId: 'new', preserveGroup: true });

      expect(result.success).toBe(true);
      expect(result.details.regrouped).toBe(true);

      // Verify new window was focused for grouping, then original focus restored
      expect(chrome.windows.update).toHaveBeenCalledWith(999, { focused: true });
      expect(chrome.windows.update).toHaveBeenCalledWith(100, { focused: true });
    });

    test('handles tabs without groups', async () => {
      const mockTab = { id: 1, groupId: -1 };

      chrome.tabs.get.mockResolvedValue(mockTab);
      chrome.tabs.move.mockResolvedValue({});
      chrome.windows.getCurrent.mockResolvedValue({ id: 100 });

      const result = await moveTabsToWindow([1], { windowId: 200 });

      expect(result.success).toBe(true);
      expect(result.details.regrouped).toBe(false);
      expect(chrome.tabGroups.get).not.toHaveBeenCalled();
    });

    test('skips group preservation when preserveGroup is false', async () => {
      const mockTab = { id: 1, groupId: 5 };

      chrome.tabs.get.mockResolvedValue(mockTab);
      chrome.tabs.move.mockResolvedValue({});
      chrome.windows.getCurrent.mockResolvedValue({ id: 100 });

      const result = await moveTabsToWindow([1], { windowId: 200, preserveGroup: false });

      expect(result.success).toBe(true);
      expect(result.details.regrouped).toBe(false);
      expect(chrome.tabGroups.get).not.toHaveBeenCalled();
    });

    test('handles errors when getting tab group info', async () => {
      const mockTab = { id: 1, groupId: 5 };

      chrome.tabs.get.mockResolvedValue(mockTab);
      chrome.tabGroups.get.mockRejectedValue(new Error('Group not found'));
      chrome.tabs.move.mockResolvedValue({});
      chrome.windows.getCurrent.mockResolvedValue({ id: 100 });

      const result = await moveTabsToWindow([1], { windowId: 200, preserveGroup: true });

      // Should still succeed, just without regrouping
      expect(result.success).toBe(true);
      expect(result.moved).toEqual([1]);
      expect(result.details.regrouped).toBe(false);
    });

    test('handles move errors gracefully', async () => {
      chrome.tabs.get.mockRejectedValue(new Error('Tab not found'));

      const result = await moveTabsToWindow([999], { windowId: 200 });

      expect(result.success).toBe(false);
      expect(result.moved).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].tabId).toBe(999);
    });

    test('moves multiple tabs', async () => {
      const mockTabs = [
        { id: 1, groupId: -1 },
        { id: 2, groupId: -1 },
        { id: 3, groupId: -1 }
      ];

      chrome.tabs.get.mockImplementation((tabId) =>
        Promise.resolve(mockTabs.find(t => t.id === tabId))
      );
      chrome.tabs.move.mockResolvedValue({});
      chrome.windows.getCurrent.mockResolvedValue({ id: 100 });

      const result = await moveTabsToWindow([1, 2, 3], { windowId: 200 });

      expect(result.success).toBe(true);
      expect(result.moved).toEqual([1, 2, 3]);
      expect(chrome.tabs.move).toHaveBeenCalledTimes(3);
    });

    test('returns consistent result format', async () => {
      const mockTab = { id: 1, groupId: -1 };

      chrome.tabs.get.mockResolvedValue(mockTab);
      chrome.tabs.move.mockResolvedValue({});
      chrome.windows.getCurrent.mockResolvedValue({ id: 100 });

      const result = await moveTabsToWindow([1], { windowId: 200 });

      // Verify result structure
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('moved');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('details');
      expect(result.details).toHaveProperty('windowId');
      expect(result.details).toHaveProperty('newWindow');
      expect(result.details).toHaveProperty('regrouped');
    });
  });

  describe('result format consistency', () => {
    test('all simple actions return consistent format', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);
      chrome.tabs.update.mockResolvedValue({});

      const closeResult = await closeTabs([1]);
      const pinResult = await pinTabs([1]);
      const muteResult = await muteTabs([1]);

      // All should have success, errors, details
      for (const result of [closeResult, pinResult, muteResult]) {
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('details');
        expect(Array.isArray(result.errors)).toBe(true);
        expect(typeof result.details).toBe('object');
      }
    });
  });
});
