// Tests for Multi-Window Operations
// Part of Phase 8.0: Multi-Window Test Infrastructure

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  createMockWindow,
  createMultiWindowScenario,
  createTabsWithCrossWindowDuplicates,
  createLargeWindow,
  assertWindowProperties,
  assertTabInWindow,
  getTabsForWindow,
  createRealisticMultiWindowScenario,
  assertCrossWindowDuplicates,
  createWindowStateScenarios
} from './utils/window-test-helpers.js';
import { normalizeUrlForDuplicates } from '../services/selection/selectTabs.js';

describe('Window Test Helpers - Basic Window Creation', () => {
  it('should create a mock window with tabs', () => {
    const { window, tabs } = createMockWindow(1, [
      { id: 1, url: 'https://example.com/1' },
      { id: 2, url: 'https://example.com/2' }
    ]);

    expect(window.id).toBe(1);
    expect(tabs).toHaveLength(2);
    expect(tabs[0].windowId).toBe(1);
    expect(tabs[1].windowId).toBe(1);
  });

  it('should create window with custom properties', () => {
    const { window } = createMockWindow(2, [], {
      state: 'maximized',
      left: 100,
      top: 200,
      width: 1920,
      height: 1080,
      focused: true
    });

    expect(window.state).toBe('maximized');
    expect(window.left).toBe(100);
    expect(window.top).toBe(200);
    expect(window.width).toBe(1920);
    expect(window.height).toBe(1080);
    expect(window.focused).toBe(true);
  });

  it('should handle empty tab array', () => {
    const { window, tabs } = createMockWindow(1);

    expect(window.id).toBe(1);
    expect(tabs).toHaveLength(0);
  });
});

describe('Window Test Helpers - Multi-Window Scenarios', () => {
  it('should create multiple windows with specified tab counts', () => {
    const scenario = createMultiWindowScenario({
      windows: [
        { id: 1, tabCount: 10 },
        { id: 2, tabCount: 5 },
        { id: 3, tabCount: 15 }
      ]
    });

    expect(scenario.windows).toHaveLength(3);
    expect(scenario.tabs).toHaveLength(30); // 10 + 5 + 15

    // Verify tabs are assigned to correct windows
    expect(getTabsForWindow(scenario.tabs, 1)).toHaveLength(10);
    expect(getTabsForWindow(scenario.tabs, 2)).toHaveLength(5);
    expect(getTabsForWindow(scenario.tabs, 3)).toHaveLength(15);
  });

  it('should create windows with groups', () => {
    const scenario = createMultiWindowScenario({
      windows: [
        { id: 1, tabCount: 12, groupCount: 3 },
        { id: 2, tabCount: 6, groupCount: 2 }
      ]
    });

    expect(scenario.groups).toHaveLength(5); // 3 + 2
    expect(scenario.groups.filter(g => g.windowId === 1)).toHaveLength(3);
    expect(scenario.groups.filter(g => g.windowId === 2)).toHaveLength(2);

    // Verify tabs are assigned to groups
    const window1Tabs = getTabsForWindow(scenario.tabs, 1);
    const groupedTabs = window1Tabs.filter(t => t.groupId !== -1);
    expect(groupedTabs.length).toBeGreaterThan(0);
  });

  it('should set first tab as active in each window', () => {
    const scenario = createMultiWindowScenario({
      windows: [
        { id: 1, tabCount: 5 },
        { id: 2, tabCount: 3 }
      ]
    });

    const window1Tabs = getTabsForWindow(scenario.tabs, 1);
    const window2Tabs = getTabsForWindow(scenario.tabs, 2);

    expect(window1Tabs[0].active).toBe(true);
    expect(window1Tabs.slice(1).every(t => !t.active)).toBe(true);

    expect(window2Tabs[0].active).toBe(true);
    expect(window2Tabs.slice(1).every(t => !t.active)).toBe(true);
  });
});

describe('Window Test Helpers - Cross-Window Duplicates', () => {
  it('should create tabs with duplicate URLs across windows', () => {
    const { windows, tabs } = createTabsWithCrossWindowDuplicates(3, 2);

    expect(windows).toHaveLength(3);

    // Each window should have at least 2 tabs (duplicates + unique)
    expect(getTabsForWindow(tabs, 1).length).toBeGreaterThanOrEqual(2);
    expect(getTabsForWindow(tabs, 2).length).toBeGreaterThanOrEqual(2);
    expect(getTabsForWindow(tabs, 3).length).toBeGreaterThanOrEqual(2);
  });

  it('should have same URLs in different windows', () => {
    const { tabs } = createTabsWithCrossWindowDuplicates(3, 2);

    // Group tabs by normalized URL
    const urlGroups = new Map();
    tabs.forEach(tab => {
      const normalized = normalizeUrlForDuplicates(tab.url);
      if (!urlGroups.has(normalized)) {
        urlGroups.set(normalized, []);
      }
      urlGroups.get(normalized).push(tab);
    });

    // Find duplicate groups (URLs that appear multiple times)
    const duplicateGroups = Array.from(urlGroups.values()).filter(group => group.length > 1);

    // Should have at least 2 duplicate groups (2 duplicatesPerWindow)
    expect(duplicateGroups.length).toBeGreaterThanOrEqual(2);

    // Each duplicate group should span multiple windows
    duplicateGroups.forEach(group => {
      const windowIds = new Set(group.map(t => t.windowId));
      expect(windowIds.size).toBeGreaterThan(1);
    });
  });

  it('should handle window positioning', () => {
    const { windows } = createTabsWithCrossWindowDuplicates(3, 2);

    // Windows should have different positions
    expect(windows[0].left).toBe(100);
    expect(windows[1].left).toBe(200);
    expect(windows[2].left).toBe(300);

    expect(windows[0].top).toBe(100);
    expect(windows[1].top).toBe(200);
    expect(windows[2].top).toBe(300);
  });
});

describe('Window Test Helpers - Large Window Scenarios', () => {
  it('should create a window with 100 tabs', () => {
    const { window, tabs } = createLargeWindow(1, 100);

    expect(window.id).toBe(1);
    expect(tabs).toHaveLength(100);
    expect(tabs.every(t => t.windowId === 1)).toBe(true);
  });

  it('should create a window with 250 tabs for stress testing', () => {
    const { window, tabs } = createLargeWindow(1, 250);

    expect(window.id).toBe(1);
    expect(tabs).toHaveLength(250);

    // Verify tab properties are set correctly
    expect(tabs[0].active).toBe(true); // First tab active
    expect(tabs[0].pinned).toBe(true); // First 3 tabs pinned
    expect(tabs[1].pinned).toBe(true);
    expect(tabs[2].pinned).toBe(true);
    expect(tabs[3].pinned).toBe(false);
  });

  it('should distribute tabs across multiple domains', () => {
    const { tabs } = createLargeWindow(1, 100);

    // Extract domains from URLs
    const domains = new Set(tabs.map(t => new URL(t.url).hostname));

    // Should use multiple domains (10 in the implementation)
    expect(domains.size).toBe(10);
  });

  it('should group tabs in large window', () => {
    const { tabs } = createLargeWindow(1, 100);

    const groupedTabs = tabs.filter(t => t.groupId !== -1);
    const ungroupedTabs = tabs.filter(t => t.groupId === -1);

    // Most tabs should be grouped (every 10th is ungrouped)
    expect(groupedTabs.length).toBeGreaterThan(ungroupedTabs.length);
  });
});

describe('Window Test Helpers - Window Property Assertions', () => {
  it('should pass assertion for matching properties', () => {
    const window = {
      id: 1,
      left: 100,
      top: 200,
      width: 1920,
      height: 1080,
      state: 'maximized',
      focused: true
    };

    expect(() => {
      assertWindowProperties(window, {
        id: 1,
        state: 'maximized',
        focused: true
      });
    }).not.toThrow();
  });

  it('should fail assertion for mismatched properties', () => {
    const window = {
      id: 1,
      state: 'normal',
      focused: false
    };

    expect(() => {
      assertWindowProperties(window, {
        state: 'maximized'
      });
    }).toThrow(/state.*mismatch/);
  });

  it('should validate tab is in correct window', () => {
    const tab = { id: 1, windowId: 5, title: 'Test Tab' };

    expect(() => {
      assertTabInWindow(tab, 5);
    }).not.toThrow();

    expect(() => {
      assertTabInWindow(tab, 1);
    }).toThrow(/window 5.*expected window 1/);
  });
});

describe('Window Test Helpers - Realistic Multi-Window Scenario', () => {
  it('should create a realistic multi-window setup', () => {
    const scenario = createRealisticMultiWindowScenario();

    expect(scenario.windows).toHaveLength(4);
    expect(scenario.tabs.length).toBe(53); // 25 + 15 + 10 + 3

    // Verify main window is maximized and focused
    const mainWindow = scenario.windows.find(w => w.id === 1);
    expect(mainWindow.state).toBe('maximized');
    expect(mainWindow.focused).toBe(true);

    // Verify popup window
    const popupWindow = scenario.windows.find(w => w.id === 4);
    expect(popupWindow.type).toBe('popup');
    expect(popupWindow.alwaysOnTop).toBe(true);
  });

  it('should have groups distributed across windows', () => {
    const scenario = createRealisticMultiWindowScenario();

    // Total groups: 3 + 2 + 1 + 0 = 6
    expect(scenario.groups).toHaveLength(6);

    // Verify groups are assigned to correct windows
    expect(scenario.groups.filter(g => g.windowId === 1)).toHaveLength(3);
    expect(scenario.groups.filter(g => g.windowId === 2)).toHaveLength(2);
    expect(scenario.groups.filter(g => g.windowId === 3)).toHaveLength(1);
    expect(scenario.groups.filter(g => g.windowId === 4)).toHaveLength(0);
  });
});

describe('Window Test Helpers - Window State Scenarios', () => {
  it('should create various window states', () => {
    const scenarios = createWindowStateScenarios();

    expect(scenarios.maximized.window.state).toBe('maximized');
    expect(scenarios.minimized.window.state).toBe('minimized');
    expect(scenarios.fullscreen.window.state).toBe('fullscreen');
    expect(scenarios.popup.window.type).toBe('popup');
    expect(scenarios.incognito.window.incognito).toBe(true);
  });

  it('should have correct dimensions for maximized window', () => {
    const scenarios = createWindowStateScenarios();
    const { window } = scenarios.maximized;

    expect(window.width).toBe(1920);
    expect(window.height).toBe(1080);
    expect(window.left).toBe(0);
    expect(window.top).toBe(0);
  });

  it('should have tabs in incognito window marked as incognito', () => {
    const scenarios = createWindowStateScenarios();
    const { tabs } = scenarios.incognito;

    expect(tabs.every(t => t.incognito)).toBe(true);
  });
});

describe('Window Test Helpers - Cross-Window Duplicate Assertions', () => {
  it('should validate cross-window duplicate detection', () => {
    const { tabs } = createTabsWithCrossWindowDuplicates(3, 2);

    // Manually group duplicates for testing
    const dupeGroups = new Map();
    tabs.forEach(tab => {
      const normalized = normalizeUrlForDuplicates(tab.url);
      if (!dupeGroups.has(normalized)) {
        dupeGroups.set(normalized, []);
      }
      dupeGroups.get(normalized).push(tab);
    });

    const duplicates = Array.from(dupeGroups.values()).filter(group => group.length > 1);

    // Count unique windows in duplicates
    const allWindowIds = new Set();
    duplicates.forEach(group => {
      group.forEach(tab => allWindowIds.add(tab.windowId));
    });

    expect(() => {
      assertCrossWindowDuplicates(duplicates, duplicates.length, allWindowIds.size);
    }).not.toThrow();
  });

  it('should fail if duplicate count is wrong', () => {
    const duplicates = [
      [{ id: 1, windowId: 1 }, { id: 2, windowId: 2 }]
    ];

    expect(() => {
      assertCrossWindowDuplicates(duplicates, 2, 2); // Wrong count
    }).toThrow(/Expected 2 duplicate groups, found 1/);
  });

  it('should fail if window count is wrong', () => {
    const duplicates = [
      [{ id: 1, windowId: 1 }, { id: 2, windowId: 2 }]
    ];

    expect(() => {
      assertCrossWindowDuplicates(duplicates, 1, 3); // Wrong window count
    }).toThrow(/Expected duplicates across 3 windows, found 2/);
  });
});

describe('Window Test Helpers - Performance with Large Multi-Window Scenarios', () => {
  it('should handle 10 windows with 100 tabs each', () => {
    const windowSpecs = [];
    for (let i = 1; i <= 10; i++) {
      windowSpecs.push({ id: i, tabCount: 100 });
    }

    const scenario = createMultiWindowScenario({ windows: windowSpecs });

    expect(scenario.windows).toHaveLength(10);
    expect(scenario.tabs).toHaveLength(1000);

    // Verify each window has correct tab count
    for (let i = 1; i <= 10; i++) {
      expect(getTabsForWindow(scenario.tabs, i)).toHaveLength(100);
    }
  });

  it('should maintain unique tab IDs across all windows', () => {
    const windowSpecs = [];
    for (let i = 1; i <= 5; i++) {
      windowSpecs.push({ id: i, tabCount: 50 });
    }

    const scenario = createMultiWindowScenario({ windows: windowSpecs });

    // All tab IDs should be unique
    const tabIds = new Set(scenario.tabs.map(t => t.id));
    expect(tabIds.size).toBe(250); // 5 windows × 50 tabs
  });
});
