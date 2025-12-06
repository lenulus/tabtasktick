import { groupTabs } from '../../../services/execution/groupTabs.js';

describe('groupTabs', () => {
  // Mocks are automatically reset by tests/setup.js via resetChromeMocks()

  describe('basic functionality', () => {
    test('returns empty result for empty tab array', async () => {
      const result = await groupTabs([]);

      expect(result.success).toBe(true);
      expect(result.results).toEqual([]);
      expect(result.plan).toEqual([]);
    });

    test('filters out non-existent tabs', async () => {
      chrome.tabs.get.mockRejectedValue(new Error('Tab not found'));

      const result = await groupTabs([999], {
        scope: 'targeted',
        targetWindowId: 1
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No valid tabs found');
    });
  });

  describe('includePinned option', () => {
    test('excludes pinned tabs by default', async () => {
      const tabs = [
        { id: 1, url: 'https://github.com/test', windowId: 1, pinned: true, groupId: -1 },
        { id: 2, url: 'https://github.com/other', windowId: 1, pinned: false, groupId: -1 },
        { id: 3, url: 'https://github.com/third', windowId: 1, pinned: false, groupId: -1 }
      ];

      chrome.tabs.get.mockImplementation(async (id) => tabs.find(t => t.id === id));
      chrome.tabGroups.query.mockResolvedValue([]);
      chrome.tabs.group.mockResolvedValue(1);
      chrome.tabGroups.update.mockResolvedValue({});

      const result = await groupTabs([1, 2, 3], {
        byDomain: true,
        scope: 'targeted',
        targetWindowId: 1,
        includePinned: false
      });

      expect(result.success).toBe(true);
      // Should only group tabs 2 and 3 (unpinned)
      expect(result.plan).toHaveLength(1);
      expect(result.plan[0].tabIds).toEqual([2, 3]);
    });

    test('includes pinned tabs when explicitly enabled', async () => {
      const tabs = [
        { id: 1, url: 'https://github.com/test', windowId: 1, pinned: true, groupId: -1 },
        { id: 2, url: 'https://github.com/other', windowId: 1, pinned: false, groupId: -1 }
      ];

      chrome.tabs.get.mockImplementation(async (id) => tabs.find(t => t.id === id));
      chrome.tabGroups.query.mockResolvedValue([]);
      chrome.tabs.group.mockResolvedValue(1);
      chrome.tabGroups.update.mockResolvedValue({});

      const result = await groupTabs([1, 2], {
        byDomain: true,
        scope: 'targeted',
        targetWindowId: 1,
        includePinned: true
      });

      expect(result.success).toBe(true);
      // Should group both tabs
      expect(result.plan).toHaveLength(1);
      expect(result.plan[0].tabIds).toEqual([1, 2]);
    });
  });

  describe('scope: targeted', () => {
    test('requires targetWindowId', async () => {
      const tabs = [
        { id: 1, url: 'https://github.com/test', windowId: 1, pinned: false, groupId: -1 },
        { id: 2, url: 'https://github.com/other', windowId: 1, pinned: false, groupId: -1 }
      ];

      chrome.tabs.get.mockImplementation(async (id) => tabs.find(t => t.id === id));

      const result = await groupTabs([1, 2], {
        scope: 'targeted',
        perWindow: false // Ensure it's not legacy usage
        // Missing targetWindowId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('targetWindowId is required');
    });

    test('filters tabs to target window only', async () => {
      const tabs = [
        { id: 1, url: 'https://github.com/test', windowId: 1, pinned: false, groupId: -1 },
        { id: 2, url: 'https://github.com/other', windowId: 2, pinned: false, groupId: -1 },
        { id: 3, url: 'https://github.com/third', windowId: 1, pinned: false, groupId: -1 }
      ];

      chrome.tabs.get.mockImplementation(async (id) => tabs.find(t => t.id === id));
      chrome.tabGroups.query.mockResolvedValue([]);
      chrome.tabs.group.mockResolvedValue(1);
      chrome.tabGroups.update.mockResolvedValue({});

      const result = await groupTabs([1, 2, 3], {
        byDomain: true,
        scope: 'targeted',
        targetWindowId: 1
      });

      expect(result.success).toBe(true);
      // Should only include tabs from window 1
      const allTabIds = result.plan.flatMap(p => p.tabIds);
      expect(allTabIds).toEqual(expect.arrayContaining([1, 3]));
      expect(allTabIds).not.toContain(2);
    });
  });

  describe('scope: global', () => {
    test('requires targetWindowId', async () => {
      const result = await groupTabs([1, 2], {
        scope: 'global'
        // Missing targetWindowId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('targetWindowId is required');
    });

    test('moves tabs from other windows to target window', async () => {
      const tabs = [
        { id: 1, url: 'https://github.com/test', windowId: 1, pinned: false, groupId: -1 },
        { id: 2, url: 'https://github.com/other', windowId: 2, pinned: false, groupId: -1 }
      ];

      chrome.tabs.get.mockImplementation(async (id) => tabs.find(t => t.id === id));
      chrome.tabs.move.mockResolvedValue({});
      chrome.tabs.query.mockResolvedValue([
        { id: 1, url: 'https://github.com/test', windowId: 1, pinned: false, groupId: -1 },
        { id: 2, url: 'https://github.com/other', windowId: 1, pinned: false, groupId: -1 }
      ]);
      chrome.tabGroups.query.mockResolvedValue([]);
      chrome.tabs.group.mockResolvedValue(1);
      chrome.tabGroups.update.mockResolvedValue({});

      const result = await groupTabs([1, 2], {
        byDomain: true,
        scope: 'global',
        targetWindowId: 1
      });

      expect(result.success).toBe(true);
      // Should have move operations in the plan
      const movePlans = result.plan.filter(p => p.kind === 'move');
      expect(movePlans).toHaveLength(1); // Tab 2 needs to move
      expect(movePlans[0].tabId).toBe(2);
      expect(movePlans[0].toWindowId).toBe(1);
      expect(chrome.tabs.move).toHaveBeenCalled();
    });
  });

  describe('scope: per_window', () => {
    test('processes each window independently', async () => {
      const tabs = [
        { id: 1, url: 'https://github.com/test', windowId: 1, pinned: false, groupId: -1 },
        { id: 2, url: 'https://github.com/test', windowId: 1, pinned: false, groupId: -1 },
        { id: 3, url: 'https://github.com/test', windowId: 2, pinned: false, groupId: -1 },
        { id: 4, url: 'https://github.com/test', windowId: 2, pinned: false, groupId: -1 }
      ];

      chrome.tabs.get.mockImplementation(async (id) => tabs.find(t => t.id === id));
      chrome.tabGroups.query.mockResolvedValue([]);
      chrome.tabs.group.mockResolvedValue(1);
      chrome.tabGroups.update.mockResolvedValue({});

      const result = await groupTabs([1, 2, 3, 4], {
        byDomain: true,
        scope: 'per_window'
        // No targetWindowId needed for per_window
      });

      expect(result.success).toBe(true);
      // Should create 2 groups (one per window)
      expect(result.summary.groupsCreated).toBe(2);
      expect(result.summary.windowsProcessed).toBe(2);
    });
  });

  describe('minTabsPerGroup option', () => {
    test('respects minTabsPerGroup threshold for new groups', async () => {
      const tabs = [
        { id: 1, url: 'https://github.com/test', windowId: 1, pinned: false, groupId: -1 },
        { id: 2, url: 'https://reddit.com/test', windowId: 1, pinned: false, groupId: -1 },
        { id: 3, url: 'https://reddit.com/other', windowId: 1, pinned: false, groupId: -1 }
      ];

      chrome.tabs.get.mockImplementation(async (id) => tabs.find(t => t.id === id));
      chrome.tabGroups.query.mockResolvedValue([]);
      chrome.tabs.group.mockResolvedValue(1);
      chrome.tabGroups.update.mockResolvedValue({});

      const result = await groupTabs([1, 2, 3], {
        byDomain: true,
        scope: 'targeted',
        targetWindowId: 1,
        minTabsPerGroup: 2
      });

      expect(result.success).toBe(true);
      // Should only create group for reddit.com (2 tabs), not github.com (1 tab)
      expect(result.plan).toHaveLength(1);
      expect(result.plan[0].groupName).toBe('reddit.com');
      expect(result.plan[0].tabIds).toEqual([2, 3]);
    });

    test('allows minTabsPerGroup to be set to 1', async () => {
      const tabs = [
        { id: 1, url: 'https://github.com/test', windowId: 1, pinned: false, groupId: -1 }
      ];

      chrome.tabs.get.mockImplementation(async (id) => tabs.find(t => t.id === id));
      chrome.tabGroups.query.mockResolvedValue([]);
      chrome.tabs.group.mockResolvedValue(1);
      chrome.tabGroups.update.mockResolvedValue({});

      const result = await groupTabs([1], {
        byDomain: true,
        scope: 'targeted',
        targetWindowId: 1,
        minTabsPerGroup: 1
      });

      expect(result.success).toBe(true);
      // Should create group even for single tab
      expect(result.plan).toHaveLength(1);
      expect(result.plan[0].tabIds).toEqual([1]);
    });
  });

  describe('includeSingleIfExisting option', () => {
    test('adds single tab to existing group when includeSingleIfExisting is true', async () => {
      const tabs = [
        { id: 1, url: 'https://github.com/test', windowId: 1, pinned: false, groupId: -1 }
      ];

      const existingGroup = {
        id: 100,
        title: 'github.com',
        windowId: 1
      };

      chrome.tabs.get.mockImplementation(async (id) => tabs.find(t => t.id === id));
      chrome.tabGroups.query.mockResolvedValue([existingGroup]);
      chrome.tabs.group.mockResolvedValue(100);

      const result = await groupTabs([1], {
        byDomain: true,
        scope: 'targeted',
        targetWindowId: 1,
        minTabsPerGroup: 2,
        includeSingleIfExisting: true
      });

      expect(result.success).toBe(true);
      // Should reuse existing group even though only 1 tab
      expect(result.plan).toHaveLength(1);
      expect(result.plan[0].action).toBe('reuse');
      expect(result.plan[0].groupId).toBe(100);
    });

    test('does not add single tab to existing group when includeSingleIfExisting is false', async () => {
      const tabs = [
        { id: 1, url: 'https://github.com/test', windowId: 1, pinned: false, groupId: -1 }
      ];

      const existingGroup = {
        id: 100,
        title: 'github.com',
        windowId: 1
      };

      chrome.tabs.get.mockImplementation(async (id) => tabs.find(t => t.id === id));
      chrome.tabGroups.query.mockResolvedValue([existingGroup]);

      const result = await groupTabs([1], {
        byDomain: true,
        scope: 'targeted',
        targetWindowId: 1,
        minTabsPerGroup: 2,
        includeSingleIfExisting: false
      });

      expect(result.success).toBe(true);
      // Should NOT create or reuse group for single tab
      expect(result.plan).toHaveLength(0);
    });
  });

  describe('dryRun option', () => {
    test('returns plan without executing when dryRun is true', async () => {
      const tabs = [
        { id: 1, url: 'https://github.com/test', windowId: 1, pinned: false, groupId: -1 },
        { id: 2, url: 'https://github.com/other', windowId: 1, pinned: false, groupId: -1 }
      ];

      chrome.tabs.get.mockImplementation(async (id) => tabs.find(t => t.id === id));
      chrome.tabGroups.query.mockResolvedValue([]);

      const result = await groupTabs([1, 2], {
        byDomain: true,
        scope: 'targeted',
        targetWindowId: 1,
        dryRun: true
      });

      expect(result.success).toBe(true);
      // Should have plan but no results
      expect(result.plan.length).toBeGreaterThan(0);
      expect(result.results).toEqual([]);
      // Should NOT call chrome.tabs.group
      expect(chrome.tabs.group).not.toHaveBeenCalled();
    });
  });

  describe('customName option', () => {
    test('groups all tabs under custom name', async () => {
      const tabs = [
        { id: 1, url: 'https://github.com/test', windowId: 1, pinned: false, groupId: -1 },
        { id: 2, url: 'https://reddit.com/other', windowId: 1, pinned: false, groupId: -1 }
      ];

      chrome.tabs.get.mockImplementation(async (id) => tabs.find(t => t.id === id));
      chrome.tabGroups.query.mockResolvedValue([]);
      chrome.tabs.group.mockResolvedValue(1);
      chrome.tabGroups.update.mockResolvedValue({});

      const result = await groupTabs([1, 2], {
        customName: 'My Custom Group',
        scope: 'targeted',
        targetWindowId: 1
      });

      expect(result.success).toBe(true);
      // Should create one group with custom name
      expect(result.plan).toHaveLength(1);
      expect(result.plan[0].groupName).toBe('My Custom Group');
      expect(result.plan[0].tabIds).toEqual([1, 2]);
    });
  });

  describe('backward compatibility', () => {
    test('works with legacy perWindow option', async () => {
      const tabs = [
        { id: 1, url: 'https://github.com/test', windowId: 1, pinned: false, groupId: -1 },
        { id: 2, url: 'https://github.com/other', windowId: 1, pinned: false, groupId: -1 }
      ];

      chrome.tabs.get.mockImplementation(async (id) => tabs.find(t => t.id === id));
      chrome.tabGroups.query.mockResolvedValue([]);
      chrome.tabs.group.mockResolvedValue(1);
      chrome.tabGroups.update.mockResolvedValue({});

      // Old API without scope
      const result = await groupTabs([1, 2], {
        byDomain: true,
        perWindow: true
      });

      // Should still work (defaults to targeted scope)
      expect(result.success).toBe(true);
    });
  });
});
