# TabMaster Pro - Architecture & Implementation Guide

## ⚠️ CRITICAL: NO SHORTCUTS

**YOU MUST NOT take shortcuts when encountering problems.**

- **DO NOT comment out failing tests** - Fix the underlying issue
- **DO NOT skip debugging** - Investigate root causes, don't work around them
- **DO NOT remove features** - If something doesn't work, make it work
- **DO NOT silently reduce scope** - Ask the user before cutting anything
- **DO NOT avoid difficult problems** - Face them head-on

**When you encounter:**
- Failing tests → Debug and fix them
- Crashes or errors → Investigate the root cause
- Missing functionality → Implement it fully
- Unexpected behavior → Understand why and correct it

**Before removing or deferring anything, you MUST:**
1. Attempt to fix it yourself
2. Clearly explain the problem to the user
3. Get explicit approval to defer/remove

## Core Architecture Principles

### Non-Negotiable Goals

1. **One Behavior**: Same functionality across all surfaces (dashboard/popup, background/worker, rules runner)
2. **Services-First**: All logic lives in shared services; surfaces are thin presentation layers
3. **No Magic**: Every side effect is an explicit call; every option is a parameter
4. **Deterministic**: Same inputs → same outputs; handle collisions predictably
5. **Maintainable**: Small PRs, strong tests, clear docs, remove dead code immediately
6. **Separation of Concerns**: Selection (what to act on) is separate from Execution (how to act)

### Implementation Rules

- **If two places have similar logic, it MUST move to `/services/*` and both call it**
- **NO duplicate implementations** - everything has one source of truth
- **Surfaces (popup, dashboard, etc) are THIN** - they only handle UI, not business logic
- **Services handle ALL business logic** - surfaces just call services
- **Every option is explicit** - no hidden defaults or magic behavior
- **Dead code is deleted immediately** - not commented out or left around
- **NEVER skip or defer TODO items without explicit user approval** - If you think something should be skipped, ASK FIRST. Do not silently mark features as "deferred to Phase X" or "not yet implemented". The user decides what gets deferred, not you.

### Separation of Concerns Pattern

- **UI Layer**: Handles user-based selection
  - User clicks, checkbox selections, list selections
  - Returns selected entity IDs
  - Stays THIN - no business logic

- **Selection Services**: Handle bulk selection by filtering (business logic)
  - Filtering patterns (all ungrouped, by domain, by age, duplicates, etc.)
  - Return arrays of entity IDs
  - Example: `selectUngroupedTabs(windowId)`

- **Execution Services**: Handle operations on provided entities
  - Take entity IDs and perform operations
  - No selection logic, only execution
  - Example: `groupTabs(tabIds, options)`

- **Usage**:
  - **Bulk operations**: UI → Selection Service (filtering) → Execution Service
  - **User selections**: UI (user picks items) → Execution Service
  - **Rules engine**: Does matching (custom filtering) → Execution Service

### Directory Structure

```
/services/               # ALL shared business logic
  ├── selection/         # Selection services (what to act on)
  │   ├── selectTabs.js            # Tab selection patterns
  │   ├── detectSnoozeOperations.js # Window/tab snooze detection
  │   └── ...
  ├── execution/         # Execution services (how to act)
  │   ├── groupTabs.js              # Tab grouping execution
  │   ├── SnoozeService.js          # Tab/window snoozing
  │   ├── WindowService.js          # Window-level orchestration
  │   ├── TabActionsService.js      # Basic tab operations
  │   ├── BookmarkService.js        # Bookmark creation
  │   ├── SuspensionService.js      # Tab suspension (discard)
  │   ├── DeduplicationOrchestrator.js # Duplicate removal
  │   ├── executeSnoozeOperations.js # Snooze orchestration
  │   ├── ScheduledExportService.js # Auto-backup system
  │   ├── ExportImportService.js    # Data export/import
  │   └── ...
  └── utils/             # Utility services
      └── snoozeFormatters.js # UI text formatting

/popup/                  # THIN presentation layer
/dashboard/              # THIN presentation layer
/background.js           # THIN coordinator - calls services
/lib/engine.js          # Rules engine - does selection, calls execution services
```

## Service Directory

Comprehensive catalog of all services in TabMaster Pro. See `/docs/service-dependencies.md` for dependency diagram and `/docs/service-usage-examples.md` for real-world workflows.

### Selection Services (Read-Only Filtering)

#### selectTabs.js

**Purpose**: Generalized tab selection with 15+ filter criteria

**Key Features**:
- Flexible filter composition (domain, age, grouping, audio state, etc.)
- URL normalization for duplicate detection (whitelist approach)
- Tab statistics calculation (single-pass optimization)
- Rule engine integration (legacy and modern rule formats)

**When to Use**: Any time you need to select tabs based on criteria, whether for bulk operations, rule matching, or UI filtering

**Example**:
```javascript
import { selectTabs } from './services/selection/selectTabs.js';

// Select old, ungrouped tabs from specific domains
const tabs = await selectTabs({
  domain: ['reddit.com', 'twitter.com'],
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  grouped: false,
  currentWindow: true
});
```

**Dependencies**: chrome.tabs API only

**Exports**: selectTabs, getCurrentWindowId, normalizeUrlForDuplicates, matchesFilter, getTabStatistics, findDuplicates, areDuplicates, extractDomain, extractOrigin

---

#### detectSnoozeOperations.js

**Purpose**: Smart window/tab snooze detection - determines if user selection represents complete windows or partial tabs

**Key Features**:
- Automatic window detection (all tabs selected = window operation)
- Per-window analysis with context
- Window title generation for UI display
- Tab validation (check if tabs still exist)

**When to Use**: Before snoozing - converts tab selection into appropriate window or tab operations

**Example**:
```javascript
import { detectSnoozeOperations } from './services/selection/detectSnoozeOperations.js';

const selectedTabIds = [123, 456, 789];
const { operations, summary } = await detectSnoozeOperations(selectedTabIds);

// operations = [{ type: 'window', windowId: 1, windowTitle: 'github.com (8 tabs)', tabCount: 8 }]
// summary = { windowCount: 1, individualTabCount: 0, isSingleWindow: true, isMixed: false }
```

**Dependencies**: chrome.tabs API only

**Exports**: detectSnoozeOperations, validateTabIds

---

### Execution Services (State Modification)

#### TabActionsService.js

**Purpose**: Basic tab operations - close, pin, mute, move

**Key Features**:
- Batch processing with graceful error handling
- Partial success support (some tabs may fail, others succeed)
- Group preservation during tab moves
- Window focus management (prevents unexpected focus changes)

**When to Use**: For basic tab manipulation that forms building blocks for higher-level features

**Example**:
```javascript
import * as TabActionsService from './services/execution/TabActionsService.js';

const result = await TabActionsService.closeTabs([123, 456, 789]);
console.log(`Closed ${result.closed.length}, errors: ${result.errors.length}`);
```

**Dependencies**: chrome.tabs, chrome.tabGroups, chrome.windows

**Exports**: closeTabs, pinTabs, unpinTabs, muteTabs, unmuteTabs, moveTabsToWindow

---

#### SnoozeService.js

**Purpose**: Tab and window snoozing with automatic restoration

**Key Features**:
- Tab metadata storage (URL, title, favicon, group)
- Automatic wake-up with chrome.alarms
- Window snooze support (entire windows with metadata)
- Flexible restoration modes (original/current/new window)
- Lazy initialization (handles service worker restarts)
- Periodic fallback checks (ensures no missed wake-ups)

**When to Use**: For snoozing individual tabs or window-level operations (typically via WindowService)

**Example**:
```javascript
import * as SnoozeService from './services/execution/SnoozeService.js';

await SnoozeService.initialize(); // Required once

const snoozeUntil = Date.now() + (60 * 60 * 1000); // 1 hour
await SnoozeService.snoozeTabs([123, 456], snoozeUntil, {
  reason: 'manual',
  restorationMode: 'original'
});
```

**Dependencies**: chrome.tabs, chrome.alarms, chrome.storage, WindowService (cleanup only)

**Exports**: initialize, snoozeTabs, wakeTab, wakeTabs, getAllSnoozedTabs, getAllSnoozedWindows, handleSnoozeAlarm, cleanupExpiredSnoozes

---

#### WindowService.js

**Purpose**: Window-level orchestration - snooze, restore, deduplication

**Key Features**:
- Window metadata preservation (position, state, focused status)
- Delegates to SnoozeService for tab-level operations
- Reuses ExportImportService for window creation (DRY principle)
- Window-scoped deduplication
- Orphaned metadata cleanup

**When to Use**: For window-level operations that require coordination across multiple services

**Example**:
```javascript
import * as WindowService from './services/execution/WindowService.js';

// Snooze entire window
await WindowService.snoozeWindow(123, 2 * 60 * 60 * 1000, {
  reason: 'user_requested',
  restorationMode: 'original'
});

// Deduplicate tabs in specific window
await WindowService.deduplicateWindow(123, 'oldest');
```

**Dependencies**: SnoozeService, ExportImportService, selectTabs, DeduplicationOrchestrator

**Exports**: snoozeWindow, restoreWindow, getWindowMetadata, deleteWindowMetadata, getAllWindows, deduplicateWindow, cleanupOrphanedWindowMetadata

---

#### BookmarkService.js

**Purpose**: Tab bookmark creation with folder management

**Key Features**:
- Find-or-create folder pattern (reuses existing folders)
- Batch bookmark creation with per-tab error tracking
- Automatic folder creation in "Other Bookmarks"
- Partial success support

**When to Use**: When bookmarking tabs, typically before closing them

**Example**:
```javascript
import { bookmarkTabs } from './services/execution/BookmarkService.js';

const result = await bookmarkTabs([123, 456], {
  folder: 'Important Work' // Creates if doesn't exist
});

console.log(`Bookmarked to: ${result.details.folder}`);
```

**Dependencies**: chrome.bookmarks, chrome.tabs

**Exports**: bookmarkTabs

---

#### SuspensionService.js

**Purpose**: Tab memory suspension using chrome.tabs.discard

**Key Features**:
- Configurable protection filters (pinned/active/audible)
- Tab stays visible in strip, reloads on click
- Batch suspension with skip/error tracking

**When to Use**: To free memory by suspending unused tabs

**Example**:
```javascript
import { suspendTabs } from './services/execution/SuspensionService.js';

const result = await suspendTabs([123, 456, 789], {
  includePinned: false, // Protect pinned tabs
  includeActive: false, // Protect active tab
  includeAudible: false // Protect tabs playing audio
});

console.log(`Suspended: ${result.suspended.length}, Skipped: ${result.skipped.length}`);
```

**Dependencies**: chrome.tabs

**Exports**: suspendTabs

---

#### groupTabs.js

**Purpose**: Tab grouping with domain-based or custom naming

**Key Features**:
- Domain-based grouping (automatic organization)
- Custom name grouping (manual organization)
- Window boundary respect (perWindow option)
- Group reuse (adds to existing groups with matching names)
- Plan-then-execute pattern (supports dry-run preview)
- Complex focus management (prevents Chrome API quirks)

**When to Use**: For organizing tabs into Chrome's native tab groups

**Example**:
```javascript
import { groupTabs } from './services/execution/groupTabs.js';

// Group by domain within current window
const result = await groupTabs([123, 456, 789], {
  byDomain: true,
  perWindow: true,
  collapsed: false
});

console.log(`Created ${result.summary.groupsCreated} groups`);
```

**Dependencies**: chrome.tabs, chrome.tabGroups, chrome.windows

**Exports**: groupTabs

---

#### DeduplicationOrchestrator.js

**Purpose**: Unified duplicate tab removal with scope control

**Key Features**:
- Three scope modes: global (all windows), per-window (each isolated), window (specific only)
- Multiple keep strategies: oldest, newest, mru, lru, all, none
- URL normalization via selectTabs (consistent duplicate detection)
- Delegates closure to TabActionsService

**When to Use**: Any duplicate removal operation - provides consistent behavior across all surfaces

**Example**:
```javascript
import { deduplicate } from './services/execution/DeduplicationOrchestrator.js';

// Remove duplicates globally, keep oldest
const result = await deduplicate({
  scope: 'global',
  strategy: 'oldest',
  dryRun: false
});

const closed = result.filter(r => r.action === 'close' && r.success).length;
console.log(`Closed ${closed} duplicates`);
```

**Dependencies**: selectTabs (generateDupeKey), TabActionsService (closeTabs)

**Exports**: deduplicate, deduplicateGlobal, deduplicatePerWindow, deduplicateWindow

---

#### executeSnoozeOperations.js

**Purpose**: Orchestrates snooze operation execution from detection results

**Key Features**:
- Processes operations sequentially (windows first, then tabs)
- Delegates window operations to WindowService
- Delegates tab operations to SnoozeService
- Time validation (rejects past timestamps)
- Graceful error handling with partial success

**When to Use**: After detectSnoozeOperations - coordinates actual snooze execution

**Example**:
```javascript
import { detectSnoozeOperations } from './services/selection/detectSnoozeOperations.js';
import { executeSnoozeOperations } from './services/execution/executeSnoozeOperations.js';

const { operations, summary } = await detectSnoozeOperations([123, 456]);
const snoozeUntil = Date.now() + (2 * 60 * 60 * 1000); // 2 hours

const result = await executeSnoozeOperations({
  operations,
  snoozeUntil,
  options: { reason: 'manual', restorationMode: 'original' }
});

console.log(`Snoozed ${result.summary.tabsSnoozed} tabs`);
```

**Dependencies**: WindowService, SnoozeService

**Exports**: executeSnoozeOperations, validateOperations

---

#### ScheduledExportService.js

**Purpose**: Automatic backup system with scheduled snapshots

**Key Features**:
- Configurable frequency (hourly, daily, weekly)
- Automatic backup to Downloads folder
- Retention policy with automatic cleanup
- Storage-optimized (files on disk, metadata in storage)
- Fallback alarm system (handles missed schedules)
- Full restore capability

**When to Use**: For automatic backup scheduling - initialize once, runs in background

**Example**:
```javascript
import * as ScheduledExportService from './services/execution/ScheduledExportService.js';

await ScheduledExportService.initialize();

// Configure daily backups at 2 AM
await ScheduledExportService.updateSchedule({
  enabled: true,
  frequency: 'daily',
  time: '02:00',
  retention: 30, // Keep 30 days
  formats: ['json']
});

// Force backup now
const backup = await ScheduledExportService.performBackup();
console.log(`Backup: ${backup.filename}`);
```

**Dependencies**: ExportImportService (snapshot creation), chrome.alarms, chrome.storage, chrome.downloads

**Exports**: initialize, updateSchedule, performBackup, listBackups, deleteBackup, restoreFromBackup, getScheduleStatus, handleBackupAlarm, handleFallbackCheck

---

#### ExportImportService.js

**Purpose**: Multi-format data export/import with session restoration

**Key Features**:
- Three output formats: JSON (complete), CSV (spreadsheet), Markdown (human-readable)
- Three import scopes: new-windows, current-window, replace-all
- Complete session restoration (windows, groups, metadata)
- 137-line window creation logic (reused by WindowService)

**When to Use**: For manual exports, imports, or session restoration

**Example**:
```javascript
import { exportData, importData } from './services/ExportImportService.js';

// Export current session
const jsonData = await exportData({
  format: 'json',
  includeGroups: true,
  includeWindowMetadata: true
});

// Import session (new windows)
const result = await importData({
  data: jsonData,
  scope: 'new-windows',
  preserveGroups: true
});

console.log(`Restored ${result.windowsRestored} windows, ${result.tabsRestored} tabs`);
```

**Dependencies**: chrome.tabs, chrome.windows, chrome.downloads

**Exports**: exportData, importData

---

### Utility Services (Pure Functions)

#### snoozeFormatters.js

**Purpose**: UI text formatting for snooze operations

**Key Features**:
- Modal title formatting (concise)
- Description formatting (detailed)
- Operation count labels (compact for buttons)
- Restoration mode descriptions
- Pure functions (no side effects, deterministic)

**When to Use**: For displaying snooze operation summaries in UI

**Example**:
```javascript
import { formatSnoozeTitle, formatSnoozeDescription } from './services/utils/snoozeFormatters.js';

const { operations, summary } = await detectSnoozeOperations([123, 456]);

const title = formatSnoozeTitle({ operations, summary });
// → "Snooze 2 Tabs"

const description = formatSnoozeDescription({ operations, summary });
// → "This will snooze 2 tabs from the current window"
```

**Dependencies**: None (pure functions)

**Exports**: formatSnoozeTitle, formatSnoozeDescription, formatOperationCount, formatRestorationMode

---

## Quick Reference

| Need to... | Use This Service |
|------------|------------------|
| Select tabs by criteria | `selectTabs` |
| Detect window vs tab operations | `detectSnoozeOperations` |
| Close/pin/mute tabs | `TabActionsService` |
| Snooze tabs | `SnoozeService` → via `executeSnoozeOperations` |
| Snooze windows | `WindowService` → via `executeSnoozeOperations` |
| Bookmark tabs | `BookmarkService` |
| Suspend tabs (free memory) | `SuspensionService` |
| Group tabs | `groupTabs` |
| Remove duplicates | `DeduplicationOrchestrator` |
| Export/import session | `ExportImportService` |
| Schedule auto-backups | `ScheduledExportService` |
| Format snooze UI text | `snoozeFormatters` |

## Service Usage Patterns

### Pattern 1: Simple Operation

```javascript
// 1. Select tabs
import { selectTabs } from './services/selection/selectTabs.js';
const tabs = await selectTabs({ grouped: false });

// 2. Execute operation
import { groupTabs } from './services/execution/groupTabs.js';
await groupTabs(tabs.map(t => t.id), { byDomain: true });
```

### Pattern 2: Orchestrated Workflow

```javascript
// 1. Detection
import { detectSnoozeOperations } from './services/selection/detectSnoozeOperations.js';
const { operations, summary } = await detectSnoozeOperations(selectedTabIds);

// 2. Format UI
import { formatSnoozeTitle } from './services/utils/snoozeFormatters.js';
const title = formatSnoozeTitle({ operations, summary });

// 3. Execute via orchestrator
import { executeSnoozeOperations } from './services/execution/executeSnoozeOperations.js';
await executeSnoozeOperations({ operations, snoozeUntil, options });
```

### Pattern 3: Background Processing

```javascript
// Initialize once
import * as SnoozeService from './services/execution/SnoozeService.js';
await SnoozeService.initialize();

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('snooze_')) {
    SnoozeService.handleSnoozeAlarm(alarm);
  }
});
```

---

## Project Overview

TabMaster Pro is a Chrome extension for advanced tab management, built with vanilla JavaScript (no frameworks). The extension helps users manage 200+ tabs efficiently with features like snoozing, grouping, bulk operations, and analytics.

## Tech Stack & Constraints

- **Frontend**: Vanilla JavaScript, HTML5, CSS3 (no frameworks)
- **Styling**: Modern CSS with Grid, Flexbox, Custom Properties
- **APIs**: Chrome Extensions Manifest V3 APIs
- **Build**: No build tools needed, direct file loading
- **Storage**: chrome.storage.local for persistence
- **Charts**: Chart.js (via CDN) for analytics

## ⚠️ CRITICAL: Chrome Extension Limitations - DO NOT VIOLATE

### NEVER Use Dynamic Imports - They Will CRASH Chrome
**DO NOT USE `import()` or `await import()` ANYWHERE IN THE EXTENSION**

Chrome extensions do NOT support dynamic imports in service workers or content scripts. Using them will cause the extension to crash Chrome entirely, closing all windows.

❌ **NEVER DO THIS:**
```javascript
// This will CRASH Chrome and close all windows
const { groupTabs } = await import('../services/execution/groupTabs.js');
```

✅ **ALWAYS DO THIS:**
```javascript
// Static imports at the top of the file only
import { groupTabs } from '../services/execution/groupTabs.js';
```

### Other Critical Rules
- All imports MUST be static and at the top of the file
- Service workers cannot use dynamic module loading
- NEVER modify working production code directly - create parallel implementations
- Test changes incrementally - one small change at a time
- Keep original working files intact until new versions are proven

## Service Pattern Example

```javascript
// WRONG - mixing selection and execution
// popup.js
async function groupTabs() {
  const tabs = await chrome.tabs.query({ groupId: -1 }); // selection
  for (const tab of tabs) {
    // grouping logic here... (execution)
  }
}

// WRONG - duplicate selection logic
// dashboard.js
async function groupTabs() {
  const tabs = await chrome.tabs.query({ groupId: -1 }); // duplicate selection
  // grouping logic here...
}

// RIGHT - separated concerns
// services/selection/selectTabs.js
export async function selectUngroupedTabs(windowId) {
  const tabs = await chrome.tabs.query({ windowId, groupId: -1 });
  return tabs.map(t => t.id);
}

// services/execution/groupTabs.js
export async function groupTabs(tabIds, options) {
  // ONLY execution logic here
  // No selection, just group the provided tabs
}

// popup.js - bulk selection via filtering service
import { selectUngroupedTabs } from '/services/selection/selectTabs.js';
import { groupTabs } from '/services/execution/groupTabs.js';

const tabIds = await selectUngroupedTabs(windowId); // service does filtering
await groupTabs(tabIds, { byDomain: true });

// session.js - user-based selection at UI level
import { groupTabs } from '/services/execution/groupTabs.js';

const selectedTabIds = getCheckedTabs(); // UI tracks what user selected
await groupTabs(selectedTabIds, { byDomain: true });
```

## Async Listener Pattern (CRITICAL)

**NEVER use `async` directly on Chrome API event listeners** - this returns a Promise instead of true/undefined, causing non-deterministic behavior and race conditions.

### The Problem

```javascript
// ❌ WRONG - Returns Promise, causes race conditions
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  const result = await someAsyncOperation();
  sendResponse(result);
  return true; // Actually returns Promise.resolve(true) - BREAKS Chrome!
});

// ❌ WRONG - No return value, channel closes immediately
chrome.alarms.onAlarm.addListener(async (alarm) => {
  await handleAlarm(alarm);
  // Channel already closed, async work may be interrupted
});
```

### The Solution: safeAsyncListener

Use the `safeAsyncListener` utility from `/services/utils/listeners.js`:

```javascript
// ✅ CORRECT - For message listeners (need sendResponse)
import { safeAsyncListener } from './services/utils/listeners.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      const result = await someAsyncOperation();
      sendResponse({ success: true, data: result });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true; // Keeps channel open for async response
});

// ✅ CORRECT - For non-response listeners (alarms, tab events, etc.)
chrome.alarms.onAlarm.addListener(safeAsyncListener(async (alarm) => {
  if (alarm.name.startsWith('snooze_')) {
    await SnoozeService.handleAlarm(alarm);
  } else if (alarm.name === 'scheduled_backup') {
    await ScheduledExportService.handleAlarm(alarm);
  }
}));

// ✅ CORRECT - Tab event listeners
chrome.tabs.onCreated.addListener(safeAsyncListener(async (tab) => {
  await handleTabCreated(tab);
}));

// ✅ CORRECT - With custom error handling
chrome.windows.onRemoved.addListener(safeAsyncListener(async (windowId) => {
  await WindowService.cleanupOrphanedWindowMetadata();
}, {
  errorHandler: (error, context) => {
    console.error('Window cleanup failed:', error, context);
    sendToMonitoring(error);
  },
  logErrors: true
}));
```

### How safeAsyncListener Works

```javascript
export function safeAsyncListener(handler, options = {}) {
  const wrapped = (...args) => {
    // IIFE pattern - executes async code without returning Promise
    (async () => {
      try {
        await handler(...args);
      } catch (error) {
        // Error handling with context
        if (options.logErrors) {
          console.error('Listener error:', error, {
            handlerName: handler.name || 'anonymous',
            argsCount: args.length
          });
        }
        if (options.errorHandler) {
          options.errorHandler(error, context);
        }
      }
    })();
    // Returns undefined (implicit) - correct for non-message listeners
  };

  wrapped.__safeWrapped = true; // Prevents double-wrapping
  return wrapped;
}
```

### When to Use Each Pattern

| Listener Type | Pattern | Why |
|---------------|---------|-----|
| `chrome.runtime.onMessage` | Manual IIFE + `return true` | Needs `sendResponse()` callback |
| `chrome.alarms.onAlarm` | `safeAsyncListener` | No response needed |
| `chrome.tabs.onCreated` | `safeAsyncListener` | No response needed |
| `chrome.tabs.onUpdated` | `safeAsyncListener` | No response needed |
| `chrome.tabs.onRemoved` | `safeAsyncListener` | No response needed |
| `chrome.windows.onRemoved` | `safeAsyncListener` | No response needed |
| `chrome.storage.onChanged` | `safeAsyncListener` | No response needed |

### Detection and Prevention

```bash
# Find violations (should return 0 results)
grep -rn "\.addListener(async" tabmaster-pro/**/*.js

# Approved pattern
grep -rn "safeAsyncListener" tabmaster-pro/**/*.js
```

### Reference

- **Phase 1 Implementation**: All async listeners fixed in background-integrated.js
- **Utility**: `/services/utils/listeners.js`
- **Tests**: `/tests/listeners.test.js` (16 tests, all passing)
- **Background**: Architectural remediation work (v1.3.19)

## Testing

### Unit Tests

```bash
# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### E2E Tests with Playwright

**IMPORTANT:** Read `/tabmaster-pro/tests/e2e/README.md` before writing E2E tests.

Key points:
- Tests within a file **share the same browser context and IndexedDB**
- Each test gets a **new page** but keeps the **same profile**
- Tests run **sequentially** and can build on each other's state
- Each test file gets a **fresh ephemeral Chrome profile** that's cleaned up after

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test file
npx playwright test tests/e2e/sidepanel-tasks-view.spec.js --headed

# Run with debug mode
npx playwright test --debug
```

See the full E2E testing guide: `/tabmaster-pro/tests/e2e/README.md`

## Development Workflow

1. Identify duplicate/similar logic across files
2. Extract to service in `/lib/services/`
3. Update all callers to use the service
4. Delete the old implementations
5. Test with 200+ tabs scenario
6. Commit with clear message

## Performance Targets

- Popup load: < 100ms
- Tab list render: < 200ms for 200 tabs
- Search response: < 50ms
- Memory usage: < 50MB for 500 tabs
- Dashboard load: < 500ms

## Important Notes

- **NEVER** create duplicate implementations
- **ALWAYS** extract shared logic to services
- **DELETE** dead code immediately
- Test with 200+ tabs to ensure performance
- Keep accessibility in mind (keyboard navigation, ARIA)
- Follow existing code style (2-space indent, semicolons)
- Document complex logic with comments