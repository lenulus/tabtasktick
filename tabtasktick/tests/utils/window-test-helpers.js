// Window Test Helpers - Utilities for multi-window testing scenarios
// Part of Phase 8.0: Multi-Window Test Infrastructure
//
// PURPOSE:
// This file provides pure JavaScript utility functions for creating mock window
// and tab data for Jest unit tests. These helpers generate test data structures
// that mimic Chrome's window and tab objects, but DO NOT call any Chrome APIs.
//
// DISTINCTION FROM lib/test-mode/assertions.js:
// - window-test-helpers.js (THIS FILE):
//   - For Jest unit tests (/tests/*.test.js)
//   - Pure JavaScript functions with NO Chrome API calls
//   - Generates mock data structures for testing
//   - Assertion helpers use plain JavaScript (throw errors)
//   - Fast, isolated, no real browser required
//
// - lib/test-mode/assertions.js:
//   - For integration tests (test-panel UI)
//   - Calls real Chrome APIs (chrome.windows.*, chrome.tabs.*)
//   - Validates actual browser state
//   - Runs in real Chrome extension context
//   - Slower, requires actual browser windows/tabs
//
// USAGE:
// Import these helpers in Jest test files to create realistic multi-window
// test scenarios for validating business logic without browser overhead.
//
// Example:
//   import { createMultiWindowScenario } from './utils/window-test-helpers.js';
//   const { windows, tabs } = createMultiWindowScenario({
//     windows: [{ id: 1, tabCount: 10 }, { id: 2, tabCount: 5 }]
//   });

import { createWindow, createTab, resetCounters } from './tab-factory.js';

/**
 * Create a mock Chrome window object with tabs and metadata
 *
 * @param {number} id - Window ID
 * @param {Array} tabs - Array of tab objects that belong to this window
 * @param {Object} options - Window properties (left, top, width, height, state, type, focused, incognito)
 * @returns {Object} Mock window object with tabs
 */
export function createMockWindow(id, tabs = [], options = {}) {
  const window = createWindow({ id, ...options });

  // Ensure all tabs have the correct windowId
  const windowTabs = tabs.map(tab => ({
    ...tab,
    windowId: id
  }));

  return {
    window,
    tabs: windowTabs
  };
}

/**
 * Create a multi-window test scenario with configurable windows and tabs
 *
 * @param {Object} config - Configuration object
 * @param {Array<Object>} config.windows - Array of window specs: { id, tabCount, options }
 * @param {Object} config.defaults - Default tab properties
 * @returns {Object} { windows: Array, tabs: Array, groups: Array }
 */
export function createMultiWindowScenario(config = {}) {
  resetCounters();

  const { windows: windowSpecs = [], defaults = {} } = config;
  const allWindows = [];
  const allTabs = [];
  const allGroups = [];

  windowSpecs.forEach(spec => {
    const { id, tabCount = 5, options = {}, groupCount = 0 } = spec;
    const window = createWindow({ id, ...options });
    allWindows.push(window);

    // Create groups for this window if specified
    const windowGroups = [];
    for (let g = 0; g < groupCount; g++) {
      const group = {
        id: allGroups.length + 1,
        windowId: id,
        title: `Group ${g + 1}`,
        color: ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'][g % 8],
        collapsed: false
      };
      allGroups.push(group);
      windowGroups.push(group);
    }

    // Create tabs for this window
    for (let i = 0; i < tabCount; i++) {
      const groupId = windowGroups.length > 0 && i % 3 !== 0
        ? windowGroups[i % windowGroups.length].id
        : -1;

      const tab = createTab({
        windowId: id,
        groupId,
        url: `https://example${id}.com/page-${i}`,
        title: `Window ${id} Tab ${i}`,
        active: i === 0, // First tab in window is active
        ...defaults
      });
      allTabs.push(tab);
    }
  });

  return {
    windows: allWindows,
    tabs: allTabs,
    groups: allGroups
  };
}

/**
 * Create tabs with cross-window duplicates for testing duplicate detection
 *
 * @param {number} windowCount - Number of windows to create
 * @param {number} duplicatesPerWindow - How many duplicate URLs per window
 * @returns {Object} { windows: Array, tabs: Array }
 */
export function createTabsWithCrossWindowDuplicates(windowCount = 3, duplicatesPerWindow = 2) {
  resetCounters();

  const windows = [];
  const tabs = [];

  // Common URLs that will appear in multiple windows
  const commonUrls = [
    'https://github.com/trending',
    'https://news.ycombinator.com',
    'https://stackoverflow.com/questions/tagged/javascript',
    'https://reddit.com/r/programming',
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript'
  ];

  for (let w = 1; w <= windowCount; w++) {
    const window = createWindow({
      id: w,
      focused: w === 1,
      left: w * 100,
      top: w * 100
    });
    windows.push(window);

    // Add duplicate URLs to each window
    for (let d = 0; d < duplicatesPerWindow && d < commonUrls.length; d++) {
      tabs.push(createTab({
        windowId: w,
        url: commonUrls[d],
        title: `Duplicate ${d + 1} in Window ${w}`
      }));
    }

    // Add some unique URLs to each window
    for (let u = 0; u < 3; u++) {
      tabs.push(createTab({
        windowId: w,
        url: `https://unique-${w}-${u}.com`,
        title: `Unique Tab ${u} in Window ${w}`
      }));
    }
  }

  return { windows, tabs };
}

/**
 * Create a large window with many tabs for performance testing
 *
 * @param {number} windowId - Window ID
 * @param {number} tabCount - Number of tabs to create (default 100)
 * @returns {Object} { window: Object, tabs: Array }
 */
export function createLargeWindow(windowId = 1, tabCount = 100) {
  const window = createWindow({
    id: windowId,
    state: 'maximized',
    focused: true
  });

  const tabs = [];
  const domains = [
    'google.com', 'github.com', 'stackoverflow.com',
    'reddit.com', 'news.ycombinator.com', 'mozilla.org',
    'chromium.org', 'nodejs.org', 'npmjs.com', 'wikipedia.org'
  ];

  for (let i = 0; i < tabCount; i++) {
    const domain = domains[i % domains.length];
    const groupId = i % 10 === 0 ? -1 : Math.floor(i / 10) + 1; // Group every 10 tabs

    tabs.push(createTab({
      windowId,
      groupId,
      url: `https://${domain}/page-${i}`,
      title: `${domain} - Page ${i}`,
      active: i === 0,
      pinned: i < 3, // First 3 tabs pinned
      audible: i % 20 === 0 // Some tabs playing audio
    }));
  }

  return { window, tabs };
}

/**
 * Assert window properties match expected values
 *
 * @param {Object} actual - Actual window object
 * @param {Object} expected - Expected window properties
 */
export function assertWindowProperties(actual, expected) {
  const properties = ['id', 'left', 'top', 'width', 'height', 'state', 'type', 'focused', 'incognito'];

  properties.forEach(prop => {
    if (expected.hasOwnProperty(prop)) {
      if (actual[prop] !== expected[prop]) {
        throw new Error(
          `Window property '${prop}' mismatch: expected ${expected[prop]}, got ${actual[prop]}`
        );
      }
    }
  });
}

/**
 * Assert a tab is in the specified window
 *
 * @param {Object} tab - Tab object to check
 * @param {number} windowId - Expected window ID
 */
export function assertTabInWindow(tab, windowId) {
  if (tab.windowId !== windowId) {
    throw new Error(
      `Tab ${tab.id} (${tab.title}) is in window ${tab.windowId}, expected window ${windowId}`
    );
  }
}

/**
 * Get all tabs for a specific window
 *
 * @param {Array} allTabs - Array of all tabs
 * @param {number} windowId - Window ID to filter by
 * @returns {Array} Tabs in the specified window
 */
export function getTabsForWindow(allTabs, windowId) {
  return allTabs.filter(tab => tab.windowId === windowId);
}

/**
 * Create a realistic multi-window scenario with mixed content
 * Useful for integration testing
 *
 * @returns {Object} { windows: Array, tabs: Array, groups: Array }
 */
export function createRealisticMultiWindowScenario() {
  resetCounters();

  return createMultiWindowScenario({
    windows: [
      // Main work window - maximized, focused, many tabs
      {
        id: 1,
        tabCount: 25,
        groupCount: 3,
        options: {
          focused: true,
          state: 'maximized',
          left: 0,
          top: 0,
          width: 1920,
          height: 1080
        }
      },
      // Secondary research window - normal size
      {
        id: 2,
        tabCount: 15,
        groupCount: 2,
        options: {
          focused: false,
          state: 'normal',
          left: 100,
          top: 100,
          width: 1400,
          height: 900
        }
      },
      // Social media window - minimized
      {
        id: 3,
        tabCount: 10,
        groupCount: 1,
        options: {
          focused: false,
          state: 'minimized',
          left: 200,
          top: 200,
          width: 1200,
          height: 800
        }
      },
      // Popup/utility window - small, always on top
      {
        id: 4,
        tabCount: 3,
        groupCount: 0,
        options: {
          focused: false,
          state: 'normal',
          type: 'popup',
          alwaysOnTop: true,
          left: 1500,
          top: 100,
          width: 400,
          height: 600
        }
      }
    ]
  });
}

/**
 * Assert cross-window duplicate detection works correctly
 *
 * @param {Array} duplicates - Array of duplicate groups from duplicate detection
 * @param {number} expectedGroupCount - Expected number of duplicate groups
 * @param {number} expectedWindowCount - Expected number of different windows involved
 */
export function assertCrossWindowDuplicates(duplicates, expectedGroupCount, expectedWindowCount) {
  if (duplicates.length !== expectedGroupCount) {
    throw new Error(
      `Expected ${expectedGroupCount} duplicate groups, found ${duplicates.length}`
    );
  }

  // Count unique windows across all duplicates
  const windowIds = new Set();
  duplicates.forEach(group => {
    group.forEach(tab => windowIds.add(tab.windowId));
  });

  if (windowIds.size !== expectedWindowCount) {
    throw new Error(
      `Expected duplicates across ${expectedWindowCount} windows, found ${windowIds.size}`
    );
  }
}

/**
 * Create window state scenarios for testing window snooze/restore
 *
 * @returns {Object} Various window state configurations
 */
export function createWindowStateScenarios() {
  resetCounters();

  return {
    maximized: createMockWindow(1, [
      createTab({ url: 'https://example.com/1' }),
      createTab({ url: 'https://example.com/2' })
    ], { state: 'maximized', left: 0, top: 0, width: 1920, height: 1080 }),

    minimized: createMockWindow(2, [
      createTab({ url: 'https://example.com/3' })
    ], { state: 'minimized', left: 100, top: 100, width: 1200, height: 800 }),

    fullscreen: createMockWindow(3, [
      createTab({ url: 'https://example.com/4' })
    ], { state: 'fullscreen', left: 0, top: 0 }),

    popup: createMockWindow(4, [
      createTab({ url: 'https://example.com/5' })
    ], { type: 'popup', state: 'normal', left: 1500, top: 100, width: 400, height: 600 }),

    incognito: createMockWindow(5, [
      createTab({ url: 'https://example.com/6', incognito: true })
    ], { incognito: true, state: 'normal', left: 200, top: 200, width: 1200, height: 800 })
  };
}
