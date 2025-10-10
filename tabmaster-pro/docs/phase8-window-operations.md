# Phase 8: Window Operations - Implementation Plan

**Status**: Phase 8.0 Complete ✅ - Phase 8.1 Ready to Begin
**Date Started**: 2025-10-10
**Last Updated**: 2025-10-10
**Prerequisites**: Phase 7 Complete (Zero architectural violations)

## Overview

Phase 8 adds window-scoped operations to TabMaster Pro, enabling users to perform bulk actions on entire windows and scope duplicate detection to specific windows rather than globally.

This phase maintains the services-first architecture and zero-violation standard achieved in Phase 7.

---

## Architecture Review Summary

Two architectural reviews conducted on 2025-10-10:

### Review #1: Initial Phase 8 Plans

**✅ Architectural Strengths:**
- Strong service-first foundation in place
- Clear separation between selection and execution services
- Existing `selectTabs()` already supports `windowId` filtering
- Consistent patterns for service methods

**🚨 Critical Issues Identified & Resolved:**
1. **Window Properties Storage**: Window metadata must NOT be stored in SnoozeService. Solution: Create dedicated storage.
2. **Missing WindowService**: Need single source of truth. Solution: Create `/services/execution/WindowService.js`.
3. **Context Menu Handler Location**: Handlers must be THIN. Solution: Define clear boundaries in background.js.

**📋 Testing Gap Identified:**
- No multi-window test infrastructure exists
- Must build test infrastructure BEFORE implementing features

### Review #2: Service-to-Service Dependencies

**Key Discovery:** `ExportImportService.js` already contains robust window creation/restoration logic (lines 348-485)

**Question:** Should WindowService depend on ExportImportService to reuse this logic?

**✅ Architectural Decision: YES - Service dependencies are acceptable**

**Precedent Found:**
- `ExportImportService` already imports and uses `SnoozeService` (line 2, 181, 533)
- This establishes that service-to-service dependencies ARE acceptable in this codebase

**Dependency Guidelines Established:**

✅ **ALLOWED:**
- Execution → Execution (same layer) - e.g., WindowService → ExportImportService
- Execution → Selection (for filtering needs)
- Selection → Selection (same layer)

❌ **FORBIDDEN:**
- Selection → Execution (wrong direction)
- Circular dependencies
- Cross-layer violations

**Benefits of Reusing ExportImportService:**
- DRY principle - no duplicate window creation code
- Battle-tested logic for window/tab restoration
- Maintains single source of truth
- Follows existing architectural patterns
- Significantly simplifies Phase 8.1 implementation

**Impact on Implementation:**
- Phase 8.1 is now SIMPLER - reuse existing window creation logic
- WindowService becomes a coordination layer, not reimplementation
- Estimated time reduced from 6-8 hours to 4-6 hours

---

## Implementation Strategy

### Order of Implementation
1. **Phase 8.0**: Multi-Window Test Infrastructure (MUST DO FIRST)
2. **Phase 8.1**: WindowService + Basic Operations
3. **Phase 8.2**: Window-Scoped Deduplication
4. **Phase 8.3**: Window Snooze/Restore
5. **Phase 8.4**: Scheduled Export Snapshots (most complex, do last)

---

## Phase 8.0: Multi-Window Test Infrastructure ✅ COMPLETE

**Status**: ✅ COMPLETE (2025-10-10)
**Priority**: CRITICAL - Must complete before any feature implementation
**Actual Time**: ~3 hours
**Commits**:
- `ef3ebb5` - Phase 8.0: Add multi-window test infrastructure
- `cdce0d6` - Phase 8.0: Add multi-window test scenarios and assertions to test-panel

### Why This Comes First
- Current test suite has ZERO multi-window testing capability
- Cannot validate window operations without proper test infrastructure
- Prevents bugs and architectural violations during implementation
- Enables TDD approach for subsequent phases

### Deliverables

#### 1. Window Test Utilities (`/tests/utils/window-test-helpers.js`)

```javascript
/**
 * Window Test Utilities for Multi-Window Testing
 *
 * Provides mock window creation, multi-window scenarios,
 * and window-aware assertions.
 */

/**
 * Create a mock Chrome window object
 */
export function createMockWindow(id, tabs = [], options = {}) {
  return {
    id,
    left: options.left ?? 100,
    top: options.top ?? 100,
    width: options.width ?? 800,
    height: options.height ?? 600,
    state: options.state ?? 'normal', // normal, minimized, maximized, fullscreen
    type: options.type ?? 'normal',   // normal, popup, panel, app
    focused: options.focused ?? false,
    alwaysOnTop: options.alwaysOnTop ?? false,
    incognito: options.incognito ?? false,
    tabs
  };
}

/**
 * Create tabs with duplicates across multiple windows
 */
export function createTabsWithCrossWindowDuplicates() {
  const window1Tabs = [
    { id: 1, url: 'https://github.com', windowId: 1, title: 'GitHub' },
    { id: 2, url: 'https://google.com', windowId: 1, title: 'Google' },
    { id: 3, url: 'https://reddit.com', windowId: 1, title: 'Reddit' }
  ];

  const window2Tabs = [
    { id: 4, url: 'https://github.com', windowId: 2, title: 'GitHub' }, // Duplicate
    { id: 5, url: 'https://stackoverflow.com', windowId: 2, title: 'Stack' },
    { id: 6, url: 'https://google.com', windowId: 2, title: 'Google' }  // Duplicate
  ];

  return { window1Tabs, window2Tabs };
}

/**
 * Create multi-window scenario with various configurations
 */
export function createMultiWindowScenario(config = {}) {
  const {
    numWindows = 2,
    tabsPerWindow = 10,
    hasDuplicates = false,
    hasGroups = false
  } = config;

  const windows = [];
  const allTabs = [];

  for (let w = 0; w < numWindows; w++) {
    const windowId = w + 1;
    const tabs = [];

    for (let t = 0; t < tabsPerWindow; t++) {
      const tabId = (w * tabsPerWindow) + t + 1;
      const tab = {
        id: tabId,
        windowId,
        url: hasDuplicates && t < 3
          ? `https://example.com/page${t}` // Same URLs across windows
          : `https://window${w}.com/page${t}`,
        title: `Tab ${tabId}`,
        groupId: hasGroups ? (t % 3) : -1
      };
      tabs.push(tab);
      allTabs.push(tab);
    }

    windows.push(createMockWindow(windowId, tabs));
  }

  return { windows, allTabs };
}

/**
 * Create window with large tab count for performance testing
 */
export function createLargeWindow(windowId, tabCount) {
  const tabs = [];
  for (let i = 0; i < tabCount; i++) {
    tabs.push({
      id: i + 1,
      windowId,
      url: `https://example.com/page${i}`,
      title: `Tab ${i + 1}`
    });
  }
  return createMockWindow(windowId, tabs);
}

/**
 * Assert window properties match expected values
 */
export function assertWindowProperties(actual, expected) {
  expect(actual.left).toBe(expected.left);
  expect(actual.top).toBe(expected.top);
  expect(actual.width).toBe(expected.width);
  expect(actual.height).toBe(expected.height);
  expect(actual.state).toBe(expected.state);
}

/**
 * Assert tab is in correct window
 */
export function assertTabInWindow(tab, windowId) {
  expect(tab.windowId).toBe(windowId);
}

/**
 * Get all tabs for a specific window
 */
export function getTabsForWindow(allTabs, windowId) {
  return allTabs.filter(t => t.windowId === windowId);
}
```

#### 2. Multi-Window Test Suite Template

Create `/tests/window-operations.test.js`:

```javascript
import {
  createMockWindow,
  createMultiWindowScenario,
  createTabsWithCrossWindowDuplicates,
  assertWindowProperties
} from './utils/window-test-helpers.js';

describe('Window Operations', () => {
  describe('Multi-Window Scenarios', () => {
    it('should handle cross-window duplicate detection', () => {
      const { window1Tabs, window2Tabs } = createTabsWithCrossWindowDuplicates();

      // Test that global deduplication finds duplicates across windows
      // Test that window-scoped deduplication only finds within-window dupes
    });

    it('should handle large multi-window scenarios', () => {
      const scenario = createMultiWindowScenario({
        numWindows: 5,
        tabsPerWindow: 50,
        hasDuplicates: true
      });

      expect(scenario.windows.length).toBe(5);
      expect(scenario.allTabs.length).toBe(250);
    });
  });

  describe('Window Property Preservation', () => {
    it('should preserve window position and size', () => {
      const window = createMockWindow(1, [], {
        left: 200,
        top: 300,
        width: 1024,
        height: 768,
        state: 'maximized'
      });

      assertWindowProperties(window, {
        left: 200,
        top: 300,
        width: 1024,
        height: 768,
        state: 'maximized'
      });
    });
  });
});
```

#### 3. Update Test Runner for Multi-Window Support

Enhance `/lib/test-mode/test-mode.js`:

```javascript
// Add multi-window test category
const MULTI_WINDOW_TESTS = {
  'window-dedupe-scoped': {
    name: 'Window-Scoped Deduplication',
    scenario: {
      windows: [/* window 1 with dupes */, /* window 2 with dupes */]
    },
    rule: {
      when: { isDupe: true },
      then: [{ action: 'close-duplicates', scope: 'window' }]
    },
    assertions: [
      // Assert duplicates removed within each window
      // Assert cross-window duplicates NOT removed
    ]
  }
};
```

### Success Criteria ✅ ALL COMPLETE
- ✅ Window test utilities created and documented (`/tests/utils/window-test-helpers.js`)
- ✅ Multi-window test suite can create 10+ windows with 100+ tabs each
- ✅ Window property assertions working (26 Jest tests passing)
- ✅ Test Runner supports multi-window scenarios (3 new integration test scenarios)
- ✅ Performance benchmarks for multi-window operations (included in test scenarios)
- ✅ All new tests passing (436 total tests, up from 410)

### Implementation Summary

**Files Created:**
1. `/tests/utils/window-test-helpers.js` - 11 utility functions for multi-window test data generation
2. `/tests/window-operations.test.js` - 26 Jest unit tests validating multi-window scenarios

**Files Modified:**
1. `/lib/test-mode/test-mode.js` - Added 3 multi-window integration test scenarios
2. `/lib/test-mode/assertions.js` - Added 3 window-level assertion functions

**Test Results:**
- 436 tests passing (26 new window operation tests)
- Zero architectural violations (verified by architecture-guardian agent)
- All existing tests still passing

**Architecture Review:**
- ✅ Pure test helpers with no business logic
- ✅ Proper separation between Jest unit tests (window-test-helpers.js) and integration tests (assertions.js)
- ✅ No dynamic imports (critical for Chrome extensions)
- ✅ Follows existing patterns from tab-factory.js
- **Status**: APPROVED - Ready to proceed to Phase 8.1

---

## Phase 8.1: WindowService + Basic Operations

**Priority**: HIGH
**Estimated Time**: 4-6 hours (REDUCED - reusing ExportImportService)
**Depends On**: Phase 8.0 (test infrastructure)

### Overview
Create the WindowService as the coordination layer for window-level operations. This service reuses ExportImportService's battle-tested window creation/restoration logic and coordinates with SnoozeService for tab management.

**Key Simplification:** Instead of reimplementing window creation, WindowService delegates to ExportImportService's existing `importData()` function, which already handles:
- Window creation with metadata preservation
- Tab restoration with proper window assignment
- Group restoration
- Batch operations with error handling

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    background.js                         │
│                   (THIN - Routes only)                   │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│              WindowService (NEW)                         │
│  - snoozeWindow()     - Coordinates snooze               │
│  - restoreWindow()    - Delegates to ExportImportService │
│  - deduplicateWindow() - Window-scoped deduplication     │
│  - getWindowStats()   - Window information               │
└────────┬──────────────────┬────────────────────────────┘
         │                  │
         ▼                  ▼
┌────────────────┐   ┌──────────────────────┐
│ SnoozeService  │   │ ExportImportService  │
│ (existing)     │   │ (existing - REUSE!)  │
└────────────────┘   └──────────────────────┘
```

**Service Dependency:** WindowService → ExportImportService
- **Allowed:** Both are execution services (same layer)
- **Benefit:** Reuses 137 lines of tested window creation logic
- **Precedent:** ExportImportService → SnoozeService already exists

### File: `/services/execution/WindowService.js`

```javascript
/**
 * WindowService
 *
 * Coordinates window-level operations by delegating to existing services.
 *
 * Dependencies:
 * - ExportImportService: Reuses window creation/restoration logic
 * - SnoozeService: Tab snoozing and metadata
 * - SelectionService: Window-scoped tab selection
 *
 * This service maintains a single source of truth by delegating
 * complex window operations to ExportImportService rather than
 * duplicating window creation logic.
 */

import { importData } from '../ExportImportService.js';
import { snoozeTabs, getSnoozedTabs } from './SnoozeService.js';
import { selectTabs } from '../selection/selectTabs.js';
import { closeDuplicates } from './closeDuplicates.js';

// Storage keys
const WINDOW_METADATA_KEY = 'windowMetadata';

/**
 * Get all windows with their tabs
 */
export async function getAllWindows() {
  const windows = await chrome.windows.getAll({ populate: true });
  return windows;
}

/**
 * Get window metadata
 *
 * Returns window properties: position, size, state, etc.
 */
export async function getWindowMetadata(windowId) {
  const window = await chrome.windows.get(windowId);
  return {
    id: windowId,
    left: window.left,
    top: window.top,
    width: window.width,
    height: window.height,
    state: window.state,
    type: window.type,
    focused: window.focused,
    incognito: window.incognito
  };
}

/**
 * Store window metadata for later restoration
 */
async function storeWindowMetadata(metadata) {
  const stored = await chrome.storage.local.get(WINDOW_METADATA_KEY);
  const allMetadata = stored[WINDOW_METADATA_KEY] || {};
  allMetadata[metadata.snoozeId] = metadata;
  await chrome.storage.local.set({ [WINDOW_METADATA_KEY]: allMetadata });
}

/**
 * Retrieve stored window metadata
 */
async function retrieveWindowMetadata(snoozeId) {
  const stored = await chrome.storage.local.get(WINDOW_METADATA_KEY);
  const allMetadata = stored[WINDOW_METADATA_KEY] || {};
  return allMetadata[snoozeId];
}

/**
 * Delete window metadata after restoration
 */
async function deleteWindowMetadata(snoozeId) {
  const stored = await chrome.storage.local.get(WINDOW_METADATA_KEY);
  const allMetadata = stored[WINDOW_METADATA_KEY] || {};
  delete allMetadata[snoozeId];
  await chrome.storage.local.set({ [WINDOW_METADATA_KEY]: allMetadata });
}

/**
 * Snooze entire window
 *
 * Stores window metadata separately, then delegates tab snoozing
 * to SnoozeService. This maintains separation of concerns.
 *
 * @param {number} windowId - Window to snooze
 * @param {number} duration - Duration in milliseconds
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - Result with windowSnoozeId and tab results
 */
export async function snoozeWindow(windowId, duration, options = {}) {
  // 1. Get window metadata BEFORE closing
  const windowMeta = await getWindowMetadata(windowId);

  // 2. Create unique snooze ID for this window
  const snoozeId = `window_snooze_${Date.now()}_${windowId}`;
  const snoozeUntil = Date.now() + duration;

  // 3. Store window metadata with snooze info
  await storeWindowMetadata({
    snoozeId,
    windowId,
    snoozeUntil,
    ...windowMeta
  });

  // 4. Get all tabs in window
  const tabs = await chrome.tabs.query({ windowId });
  const tabIds = tabs.map(t => t.id);

  // 5. Delegate tab snoozing to SnoozeService
  // Pass snoozeId so tabs know they belong to a snoozed window
  const snoozedTabs = await snoozeTabs(tabIds, snoozeUntil, {
    ...options,
    windowSnoozeId: snoozeId
  });

  // 6. Close the window (tabs already snoozed)
  await chrome.windows.remove(windowId);

  return {
    snoozeId,
    snoozeUntil,
    windowMetadata: windowMeta,
    tabCount: tabIds.length,
    snoozedTabs
  };
}

/**
 * Restore snoozed window
 *
 * Delegates to ExportImportService's importData() which handles:
 * - Window creation with metadata preservation
 * - Tab restoration with proper window assignment
 * - Group restoration
 * - Batch operations and error handling
 *
 * This reuses 137 lines of battle-tested window creation logic.
 *
 * @param {string} snoozeId - Window snooze ID
 * @returns {Promise<Object>} - Result with new window ID and restored tabs
 */
export async function restoreWindow(snoozeId) {
  // 1. Retrieve window metadata
  const windowMeta = await retrieveWindowMetadata(snoozeId);

  if (!windowMeta) {
    throw new Error(`No window metadata found for snooze ID: ${snoozeId}`);
  }

  // 2. Get all snoozed tabs for this window
  const snoozedTabs = await getSnoozedTabsForWindow(snoozeId);

  if (snoozedTabs.length === 0) {
    throw new Error(`No snoozed tabs found for window: ${snoozeId}`);
  }

  // 3. Format data for ExportImportService
  // This matches the structure ExportImportService expects
  const importPayload = {
    session: {
      windows: [{
        id: `w${windowMeta.windowId}`,
        windowId: windowMeta.windowId,
        state: windowMeta.state,
        type: windowMeta.type,
        focused: true
      }],
      tabs: snoozedTabs.map(tab => ({
        id: `t${tab.id}`,
        windowId: `w${windowMeta.windowId}`,
        url: tab.url,
        title: tab.title,
        pinned: tab.pinned || false,
        groupId: tab.groupId || null
      })),
      groups: [] // Groups handled separately if needed
    }
  };

  // 4. Delegate to ExportImportService
  // This handles all window creation, tab restoration, and error handling
  const result = await importData(
    importPayload,
    {
      scope: 'new-windows',  // Create new window with metadata
      importGroups: true     // Restore tab groups if present
    },
    {}, // state (not needed for window restoration)
    null, // loadRules (not needed)
    null  // scheduler (not needed)
  );

  // 5. Clean up metadata after successful restoration
  if (result.success) {
    await deleteWindowMetadata(snoozeId);
  }

  return {
    windowId: result.imported.windows > 0 ? 'new window created' : null,
    tabCount: result.imported.tabs,
    groupCount: result.imported.groups,
    metadata: windowMeta,
    errors: result.errors
  };
}

/**
 * Get snoozed tabs for a specific window snooze
 */
async function getSnoozedTabsForWindow(windowSnoozeId) {
  const stored = await chrome.storage.local.get('snoozedTabs');
  const allSnoozed = stored.snoozedTabs || [];
  return allSnoozed.filter(t => t.windowSnoozeId === windowSnoozeId);
}

/**
 * Deduplicate tabs within a specific window
 *
 * Uses window-scoped selection, then delegates to closeDuplicates.
 *
 * @param {number} windowId - Window to deduplicate
 * @param {string} strategy - 'oldest' or 'newest'
 * @param {boolean} dryRun - Preview mode
 * @returns {Promise<Object>} - Deduplication results
 */
export async function deduplicateWindow(windowId, strategy = 'oldest', dryRun = false) {
  // 1. Select all tabs in window
  const allTabs = await chrome.tabs.query({ windowId });

  // 2. Delegate to closeDuplicates with windowScope option
  const results = await closeDuplicates(
    allTabs,
    strategy,
    dryRun,
    chrome,
    { windowScope: true }
  );

  return results;
}

/**
 * Get duplicate count for a window
 */
export async function getWindowDuplicateCount(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const dupes = await selectTabs({
    tabs,
    duplicates: true
  });
  return dupes.length;
}

/**
 * Get window statistics
 */
export async function getWindowStats(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const metadata = await getWindowMetadata(windowId);

  return {
    windowId,
    tabCount: tabs.length,
    groupedTabs: tabs.filter(t => t.groupId !== -1).length,
    pinnedTabs: tabs.filter(t => t.pinned).length,
    duplicateCount: await getWindowDuplicateCount(windowId),
    metadata
  };
}
```

### Updates to SnoozeService

Add support for `windowSnoozeId` to link tabs to snoozed windows:

```javascript
// In SnoozeService.js

export async function snoozeTabs(tabIds, wakeTime, options = {}) {
  const { windowSnoozeId = null } = options;

  // ... existing snooze logic ...

  // Store windowSnoozeId with each tab
  const snoozedTab = {
    // ... existing properties ...
    windowSnoozeId // NEW: Link to parent window snooze
  };

  // ... rest of function ...
}
```

### Context Menu Integration

Add to `background-integrated.js`:

```javascript
// Context menus - THIN handlers only
chrome.contextMenus.create({
  id: 'snooze-window',
  title: 'Snooze Window',
  contexts: ['page']
});

chrome.contextMenus.create({
  id: 'dedupe-window',
  title: 'Remove Duplicates in Window',
  contexts: ['page']
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'snooze-window') {
    // THIN - immediately delegate to service
    const result = await WindowService.snoozeWindow(
      tab.windowId,
      1000 * 60 * 60 // 1 hour default
    );
    console.log('Window snoozed:', result);
  }

  if (info.menuItemId === 'dedupe-window') {
    // THIN - immediately delegate to service
    const result = await WindowService.deduplicateWindow(
      tab.windowId,
      'oldest',
      false
    );
    console.log('Window deduplicated:', result);
  }
});
```

### Tests

Create `/tests/WindowService.test.js`:

```javascript
import {
  snoozeWindow,
  restoreWindow,
  deduplicateWindow,
  getWindowStats
} from '../services/execution/WindowService.js';
import {
  createMockWindow,
  createLargeWindow,
  assertWindowProperties
} from './utils/window-test-helpers.js';

describe('WindowService', () => {
  describe('snoozeWindow', () => {
    it('should snooze window with all tabs', async () => {
      const window = createLargeWindow(1, 50);
      const result = await snoozeWindow(1, 3600000);

      expect(result.tabCount).toBe(50);
      expect(result.snoozeId).toMatch(/^window_snooze_/);
      expect(result.windowMetadata.id).toBe(1);
    });

    it('should preserve window properties', async () => {
      const window = createMockWindow(1, [], {
        left: 200,
        top: 300,
        width: 1024,
        height: 768,
        state: 'maximized'
      });

      const result = await snoozeWindow(1, 3600000);

      assertWindowProperties(result.windowMetadata, {
        left: 200,
        top: 300,
        width: 1024,
        height: 768,
        state: 'maximized'
      });
    });
  });

  describe('restoreWindow', () => {
    it('should restore window with preserved properties', async () => {
      // Snooze then restore
      const snoozeResult = await snoozeWindow(1, 3600000);
      const restoreResult = await restoreWindow(snoozeResult.snoozeId);

      expect(restoreResult.restoredTabs.length).toBe(snoozeResult.tabCount);
      assertWindowProperties(
        restoreResult.metadata,
        snoozeResult.windowMetadata
      );
    });
  });

  describe('deduplicateWindow', () => {
    it('should only remove duplicates within window', async () => {
      // Test with cross-window duplicates
      // Verify only within-window dupes removed
    });
  });
});
```

### Success Criteria
- ✅ WindowService created with all methods documented
- ✅ Context menu handlers delegate to WindowService
- ✅ Window metadata stored/retrieved correctly
- ✅ Snooze/restore preserves window properties
- ✅ All WindowService tests passing
- ✅ No business logic in background.js

---

## Phase 8.2: Window-Scoped Deduplication

**Priority**: MEDIUM
**Estimated Time**: 4-6 hours
**Depends On**: Phase 8.1 (WindowService)

### Overview
Enhance duplicate detection to support window-scoped operations. Users can deduplicate tabs within a single window without affecting other windows.

### Implementation: Option C (Both Context Menu and Rules)

#### 1. Enhance closeDuplicates Service

Update `/services/execution/closeDuplicates.js`:

```javascript
/**
 * Close duplicate tabs
 *
 * @param {Array} tabs - Tabs to check for duplicates
 * @param {string} strategy - 'oldest' | 'newest'
 * @param {boolean} dryRun - Preview mode
 * @param {Object} chromeApi - Chrome API reference
 * @param {Object} options - Additional options
 * @param {boolean} options.windowScope - Only dedupe within each window
 * @returns {Promise<Object>} - Results with closed tabs
 */
export async function closeDuplicates(tabs, strategy, dryRun, chromeApi, options = {}) {
  const { windowScope = false } = options;

  if (windowScope) {
    // Group tabs by window first
    const byWindow = {};
    for (const tab of tabs) {
      if (!byWindow[tab.windowId]) {
        byWindow[tab.windowId] = [];
      }
      byWindow[tab.windowId].push(tab);
    }

    // Process each window independently
    const allResults = [];
    for (const [windowId, windowTabs] of Object.entries(byWindow)) {
      const windowResults = await processDuplicatesForTabs(
        windowTabs,
        strategy,
        dryRun,
        chromeApi
      );
      allResults.push(...windowResults);
    }

    return {
      closed: allResults,
      count: allResults.length,
      windowScoped: true
    };
  }

  // Global deduplication (existing logic)
  return processDuplicatesForTabs(tabs, strategy, dryRun, chromeApi);
}

// Helper function for processing duplicates
async function processDuplicatesForTabs(tabs, strategy, dryRun, chromeApi) {
  // Existing deduplication logic here
  // ...
}
```

#### 2. Add Window Scope to Rules Engine

Update rule schema to support `scope: 'window'`:

```javascript
// Example rule with window scope
const rule = {
  name: 'Dedupe Each Window',
  when: {
    all: [
      { subject: 'isDupe', operator: 'equals', value: true }
    ]
  },
  then: [
    {
      action: 'close-duplicates',
      keep: 'oldest',
      scope: 'window' // NEW: Only dedupe within each window
    }
  ],
  trigger: { repeat_every: '1h' }
};
```

Update `/lib/engine.v2.services.js` to pass scope to service:

```javascript
case 'close-duplicates':
  const strategy = action.keep || 'oldest';
  const scope = action.scope || 'global'; // NEW

  result = await closeDuplicates(
    matchedTabs,
    strategy,
    dryRun,
    chrome,
    { windowScope: scope === 'window' } // NEW
  );
  break;
```

#### 3. Context Menu (Already in WindowService)

Context menu handler already added in Phase 8.1:

```javascript
chrome.contextMenus.create({
  id: 'dedupe-window',
  title: 'Remove Duplicates in Window',
  contexts: ['page']
});
```

### Tests

Add to `/tests/window-dedupe.test.js`:

```javascript
import { closeDuplicates } from '../services/execution/closeDuplicates.js';
import { createTabsWithCrossWindowDuplicates } from './utils/window-test-helpers.js';

describe('Window-Scoped Deduplication', () => {
  it('should only remove duplicates within same window', async () => {
    const { window1Tabs, window2Tabs } = createTabsWithCrossWindowDuplicates();
    const allTabs = [...window1Tabs, ...window2Tabs];

    // Global deduplication - removes cross-window dupes
    const globalResult = await closeDuplicates(
      allTabs,
      'oldest',
      true,
      chrome,
      { windowScope: false }
    );

    // Should remove duplicates across windows
    expect(globalResult.closed.length).toBeGreaterThan(0);

    // Window-scoped deduplication - only within-window dupes
    const scopedResult = await closeDuplicates(
      allTabs,
      'oldest',
      true,
      chrome,
      { windowScope: true }
    );

    // Should only remove if there are dupes WITHIN a window
    // Cross-window dupes should be preserved
    expect(scopedResult.windowScoped).toBe(true);
  });

  it('should handle multiple windows with different duplicate patterns', async () => {
    // Window 1: 3 dupes of github.com
    // Window 2: 2 dupes of reddit.com
    // Window 3: No dupes

    const result = await closeDuplicates(
      allTabs,
      'oldest',
      false,
      chrome,
      { windowScope: true }
    );

    // Verify correct tabs closed in each window
  });
});
```

### Success Criteria
- ✅ closeDuplicates supports windowScope option
- ✅ Rules engine supports scope: 'window'
- ✅ Context menu "Remove Duplicates in Window" working
- ✅ Global vs window-scoped deduplication behavior validated
- ✅ All tests passing
- ✅ No duplicate implementations

---

## Phase 8.3: Complete Window Snooze/Restore UI

**Priority**: MEDIUM
**Estimated Time**: 4-6 hours
**Depends On**: Phase 8.1 (WindowService)

### Overview
Add UI for window snooze/restore operations in Dashboard and Popup.

### Deliverables

#### 1. Dashboard Window Actions

Add to `/dashboard/modules/views/tabs.js`:

```javascript
// Add window-level action buttons
export function renderWindowActions(windowId) {
  return `
    <div class="window-actions">
      <button class="btn-icon" data-action="snooze-window" data-window="${windowId}" title="Snooze Window">
        <svg><!-- clock icon --></svg>
      </button>
      <button class="btn-icon" data-action="dedupe-window" data-window="${windowId}" title="Remove Duplicates">
        <svg><!-- dedupe icon --></svg>
      </button>
    </div>
  `;
}

// Handler
async function handleWindowAction(action, windowId) {
  if (action === 'snooze-window') {
    // Show duration picker modal
    const duration = await showDurationPicker();
    const result = await sendMessage({
      action: 'snoozeWindow',
      windowId,
      duration
    });
    showNotification(`Window snoozed until ${new Date(result.snoozeUntil)}`);
  }

  if (action === 'dedupe-window') {
    const result = await sendMessage({
      action: 'deduplicateWindow',
      windowId
    });
    showNotification(`Removed ${result.count} duplicate tabs`);
  }
}
```

#### 2. Snoozed Windows View

Add to `/dashboard/modules/views/snoozed.js`:

```javascript
// Show snoozed windows separately from individual tabs
export function renderSnoozedWindows(snoozedWindows) {
  return snoozedWindows.map(window => `
    <div class="snoozed-window-card">
      <div class="window-info">
        <h4>Window (${window.tabCount} tabs)</h4>
        <p>Snoozed until: ${formatTime(window.snoozeUntil)}</p>
      </div>
      <button class="btn-restore" data-snooze-id="${window.snoozeId}">
        Restore Window
      </button>
    </div>
  `).join('');
}
```

#### 3. Background Message Handlers

Add to `background-integrated.js`:

```javascript
// Window operation handlers - THIN, delegate to service
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'snoozeWindow') {
    WindowService.snoozeWindow(message.windowId, message.duration)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'restoreWindow') {
    WindowService.restoreWindow(message.snoozeId)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'deduplicateWindow') {
    WindowService.deduplicateWindow(message.windowId, message.strategy || 'oldest')
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});
```

### Success Criteria
- ✅ Window action buttons in dashboard
- ✅ Snoozed windows display separately
- ✅ Duration picker modal working
- ✅ Restore window button working
- ✅ All message handlers THIN (delegate to service)
- ✅ UI reflects window operations in real-time

---

## Phase 8.4: Scheduled Export Snapshots

**Priority**: LOW (Nice to have)
**Estimated Time**: 8-10 hours
**Depends On**: Phases 8.1-8.3 complete

### Overview
Automatically export tab state on a schedule for backup/recovery purposes.

**Note**: This is the most complex feature. Defer if time-constrained.

### Service: `/services/execution/ScheduledExportService.js`

```javascript
/**
 * ScheduledExportService
 *
 * Handles automatic scheduled exports of tab state.
 * Uses chrome.alarms for scheduling.
 */

const ALARM_PREFIX = 'snapshot-';
const SNAPSHOTS_KEY = 'exportSnapshots';

/**
 * Schedule automatic exports
 */
export async function scheduleExport(frequency, options = {}) {
  const {
    format = 'json',
    retention = 10,
    scope = 'all'
  } = options;

  // Store settings
  await chrome.storage.local.set({
    snapshotSettings: { frequency, format, retention, scope }
  });

  // Create chrome alarm
  const alarmName = `${ALARM_PREFIX}${frequency}`;
  await chrome.alarms.create(alarmName, {
    periodInMinutes: getMinutesForFrequency(frequency)
  });
}

/**
 * Handle alarm trigger - export snapshot
 */
export async function handleSnapshotAlarm() {
  const settings = await getSnapshotSettings();
  const snapshot = await createSnapshot(settings);

  await saveSnapshot(snapshot);
  await cleanupOldSnapshots(settings.retention);
}

/**
 * Create snapshot of current tab state
 */
async function createSnapshot(settings) {
  // Use existing export logic
  const data = await exportData({
    scope: settings.scope,
    format: settings.format,
    includeGroups: true,
    includeRules: true
  });

  return {
    timestamp: Date.now(),
    format: settings.format,
    scope: settings.scope,
    data
  };
}

// ... storage and cleanup functions ...
```

### Settings UI

Add to `/options/options.html`:

```html
<section class="settings-section">
  <h2>Automatic Snapshots</h2>
  <div class="setting-item">
    <label>
      <input type="checkbox" id="enableSnapshots">
      Enable automatic snapshots
    </label>
  </div>
  <div class="setting-item">
    <label>Frequency</label>
    <select id="snapshotFrequency">
      <option value="hourly">Hourly</option>
      <option value="daily">Daily</option>
      <option value="weekly">Weekly</option>
    </select>
  </div>
  <div class="setting-item">
    <label>Keep last</label>
    <select id="snapshotRetention">
      <option value="5">5 snapshots</option>
      <option value="10">10 snapshots</option>
      <option value="20">20 snapshots</option>
    </select>
  </div>
  <div class="snapshot-info">
    <p>Last snapshot: <span id="lastSnapshot">Never</span></p>
    <p>Next snapshot: <span id="nextSnapshot">--</span></p>
  </div>
</section>
```

### Success Criteria
- ✅ Scheduled exports working with chrome.alarms
- ✅ Old snapshots cleaned up automatically
- ✅ Settings UI functional
- ✅ Restore from snapshot working
- ✅ Storage quota monitored
- ✅ All tests passing

---

## Risk Assessment

### High Risk
1. **Window Restore Position Conflicts**
   - **Mitigation**: Check screen bounds, adjust if needed

2. **Large Window Performance** (100+ tabs)
   - **Mitigation**: Batch operations, progress indicators

### Medium Risk
1. **Storage Quota for Snapshots**
   - **Mitigation**: Implement rolling cleanup, compress old data

2. **Tab Group Preservation in Snoozed Windows**
   - **Mitigation**: Store group metadata with window metadata

### Low Risk
1. **Context Menu Item Proliferation**
   - **Mitigation**: Use submenus, consolidate similar actions

---

## Success Metrics

### Phase 8 Overall
- ✅ Zero architectural violations maintained
- ✅ All 410+ tests passing (plus new window tests)
- ✅ Single source of truth for window operations
- ✅ No business logic in background.js
- ✅ Multi-window test infrastructure in place

### Performance
- Window operations < 500ms for 50 tabs
- Window restore preserves all properties
- Memory usage acceptable with 10+ windows

### Code Quality
- WindowService < 500 lines
- All methods documented with JSDoc
- Test coverage > 80% for window operations

---

## Implementation Timeline

| Phase | Estimated Time | Priority | Notes |
|-------|---------------|----------|-------|
| 8.0 - Test Infrastructure | 4-6 hours | CRITICAL | Must complete first |
| 8.1 - WindowService | 4-6 hours | HIGH | **REDUCED** - reuses ExportImportService |
| 8.2 - Window Deduplication | 4-6 hours | MEDIUM | |
| 8.3 - Snooze/Restore UI | 4-6 hours | MEDIUM | |
| 8.4 - Scheduled Exports | 8-10 hours | LOW | Defer if time-constrained |
| **Total** | **24-34 hours** | | **REDUCED from 26-36** |

**Time Savings:** 2 hours saved on Phase 8.1 by reusing ExportImportService instead of reimplementing window creation logic.

**Recommended Approach**: Implement phases 8.0-8.2 first (core functionality), then evaluate if 8.3-8.4 are needed based on user demand.

---

## Post-Implementation Checklist

After completing any phase:
- [ ] Run full test suite (npm test)
- [ ] Verify zero architectural violations
- [ ] Test with 200+ tabs across 5+ windows
- [ ] Check memory usage
- [ ] Update CLAUDE.md with new services
- [ ] Document service APIs with JSDoc
- [ ] Create example usage in tests
- [ ] Update TODO.md with completion status

---

## Questions for Implementation

1. Should window snooze duration be configurable via UI, or use presets?
   - **Recommendation**: Both - quick presets (30m, 1h, 2h) + custom option

2. Should snoozed windows be restorable individually or as a group?
   - **Recommendation**: Individual restore, but show as group in UI

3. Should window-scoped rules apply to current window or all windows?
   - **Recommendation**: Apply independently to each window (scope: 'window' means per-window execution)

4. Should scheduled snapshots be enabled by default?
   - **Recommendation**: No - opt-in feature with clear storage implications

---

**Document Version**: 1.0
**Last Updated**: 2025-10-10
**Status**: Ready for Implementation (pending approval)
