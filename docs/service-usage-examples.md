# Service Usage Examples

Real-world examples showing how services work together to implement TabMaster Pro features.

## Table of Contents

1. [Window Snooze Workflow](#window-snooze-workflow)
2. [Tab Grouping by Domain](#tab-grouping-by-domain)
3. [Duplicate Tab Cleanup](#duplicate-tab-cleanup)
4. [Scheduled Backup System](#scheduled-backup-system)
5. [Old Tab Suspension](#old-tab-suspension)
6. [Bookmark and Close Workflow](#bookmark-and-close-workflow)

---

## Window Snooze Workflow

**Goal**: User snoozes an entire window for 2 hours

**Services**: `detectSnoozeOperations` → `executeSnoozeOperations` → `WindowService` → `SnoozeService`

```javascript
// 1. User selects all tabs in a window
const windowTabs = await chrome.tabs.query({ windowId: 123 });
const selectedTabIds = windowTabs.map(t => t.id);

// 2. Detection: Determine if this is a window or tab operation
import { detectSnoozeOperations } from './services/selection/detectSnoozeOperations.js';

const { operations, summary } = await detectSnoozeOperations(selectedTabIds);
// Result: operations = [{ type: 'window', windowId: 123, windowTitle: 'github.com (8 tabs)' }]

// 3. Format UI text
import { formatSnoozeTitle, formatSnoozeDescription } from './services/utils/snoozeFormatters.js';

const title = formatSnoozeTitle({ operations, summary });
// "Snooze Window: github.com (8 tabs)"

const description = formatSnoozeDescription({ operations, summary });
// "This will snooze 1 window (8 tabs)"

// 4. Execute snooze operation
import { executeSnoozeOperations } from './services/execution/executeSnoozeOperations.js';

const snoozeUntil = Date.now() + (2 * 60 * 60 * 1000); // 2 hours
const result = await executeSnoozeOperations({
  operations,
  snoozeUntil,
  options: {
    reason: 'user_requested',
    restorationMode: 'original'
  }
});

console.log(`Snoozed ${result.summary.tabsSnoozed} tabs in ${result.summary.windowsSnoozed} window`);
// Result: Window metadata saved, all tabs closed, alarm scheduled for 2 hours
```

**What happens under the hood:**

1. `executeSnoozeOperations` delegates window snooze to `WindowService.snoozeWindow()`
2. `WindowService` captures window metadata (position, state, focus)
3. `WindowService` delegates individual tab snoozing to `SnoozeService.snoozeTabs()`
4. `SnoozeService` stores tab metadata and schedules chrome.alarms
5. In 2 hours, `SnoozeService.handleSnoozeAlarm()` wakes the tabs
6. `WindowService.restoreWindow()` recreates the window with original metadata

---

## Tab Grouping by Domain

**Goal**: Group all ungrouped tabs by domain within current window

**Services**: `selectTabs` → `groupTabs`

```javascript
// 1. Select ungrouped tabs in current window
import { selectTabs } from './services/selection/selectTabs.js';

const ungroupedTabs = await selectTabs({
  currentWindow: true,
  grouped: false
});

console.log(`Found ${ungroupedTabs.length} ungrouped tabs`);

// 2. Group tabs by domain
import { groupTabs } from './services/execution/groupTabs.js';

const result = await groupTabs(
  ungroupedTabs.map(t => t.id),
  {
    byDomain: true,
    perWindow: true,  // Respect window boundaries
    collapsed: false
  }
);

console.log(`Created ${result.summary.groupsCreated} groups`);
console.log(`Reused ${result.summary.groupsReused} existing groups`);
console.log(`Total tabs grouped: ${result.summary.totalTabs}`);

// Example output:
// - Created "github.com" group with 5 tabs
// - Created "reddit.com" group with 3 tabs
// - Reused "google.com" group (already existed), added 2 tabs
```

**What happens under the hood:**

1. `selectTabs` queries Chrome API with native filters (window, groupId)
2. Returns standardized tab objects with consistent properties
3. `groupTabs` extracts domains from each tab URL
4. Groups tabs with matching domains together
5. Skips single-tab domains (no point grouping alone)
6. Reuses existing groups if they match domain names
7. Manages window focus to prevent Chrome API quirks

---

## Duplicate Tab Cleanup

**Goal**: Remove duplicate tabs globally, keeping oldest occurrence

**Services**: `selectTabs` → `DeduplicationOrchestrator` → `TabActionsService`

```javascript
// 1. Find duplicate tabs
import { selectTabs } from './services/selection/selectTabs.js';

const duplicates = await selectTabs({
  duplicates: true  // Only tabs that have duplicates
});

console.log(`Found ${duplicates.length} duplicate tabs`);

// 2. Deduplicate globally, keeping oldest
import { deduplicate } from './services/execution/DeduplicationOrchestrator.js';

const result = await deduplicate({
  scope: 'global',     // Across all windows
  strategy: 'oldest',  // Keep first occurrence
  dryRun: false
});

const closedCount = result.filter(r => r.action === 'close' && r.success).length;
const keptCount = result.filter(r => r.action === 'keep').length;

console.log(`Closed ${closedCount} duplicates, kept ${keptCount} originals`);
```

**What happens under the hood:**

1. `selectTabs` uses `normalizeUrlForDuplicates()` for URL comparison
2. URL normalization removes tracking params but preserves content IDs (YouTube videos, etc.)
3. Identifies tabs with identical normalized URLs
4. `DeduplicationOrchestrator` groups tabs by dupeKey
5. Sorts each group by creation time (for 'oldest' strategy)
6. Marks first tab as 'keep', others as 'close'
7. Delegates actual closure to `TabActionsService.closeTabs()`

---

## Scheduled Backup System

**Goal**: Enable automatic daily backups at 2 AM

**Services**: `ScheduledExportService` → `ExportImportService`

```javascript
// 1. Initialize scheduled export system
import * as ScheduledExportService from './services/execution/ScheduledExportService.js';

await ScheduledExportService.initialize();

// 2. Configure daily backups
const schedule = {
  enabled: true,
  frequency: 'daily',
  time: '02:00',        // 2 AM
  retention: 30,        // Keep 30 days
  formats: ['json']
};

await ScheduledExportService.updateSchedule(schedule);

// 3. Check next backup time
const status = await ScheduledExportService.getScheduleStatus();
console.log(`Next backup: ${new Date(status.nextBackupTime)}`);
console.log(`Last backup: ${new Date(status.lastBackupTime)}`);

// 4. Force backup now (testing)
const backupResult = await ScheduledExportService.performBackup();
console.log(`Backup saved: ${backupResult.filename}`);
console.log(`Size: ${backupResult.sizeKB} KB`);

// 5. List all backups
const backups = await ScheduledExportService.listBackups();
console.log(`Total backups: ${backups.length}`);
backups.forEach(backup => {
  console.log(`${backup.filename} - ${new Date(backup.timestamp)}`);
});

// 6. Restore from backup
const restoreFile = backups[0]; // Most recent
const restored = await ScheduledExportService.restoreFromBackup(restoreFile.downloadId);
console.log(`Restored ${restored.windowsRestored} windows, ${restored.tabsRestored} tabs`);
```

**What happens under the hood:**

1. `ScheduledExportService.initialize()` sets up chrome.alarms for scheduled backups
2. Creates fallback alarm (every 6 hours) to handle missed schedules
3. Alarm triggers → `handleBackupAlarm()` → `performBackup()`
4. `performBackup()` delegates to `ExportImportService.exportData()` for snapshot
5. Saves JSON to Downloads folder via chrome.downloads API
6. Stores only metadata (filename, timestamp, size) in chrome.storage.local
7. Automatic cleanup removes backups older than retention period
8. Restore operation uses `ExportImportService.importData()` to recreate session

---

## Old Tab Suspension

**Goal**: Suspend tabs older than 7 days, excluding pinned/active/audible

**Services**: `selectTabs` → `SuspensionService`

```javascript
// 1. Select old tabs with filters
import { selectTabs } from './services/selection/selectTabs.js';

const sevenDaysAgo = 7 * 24 * 60 * 60 * 1000;
const oldTabs = await selectTabs({
  maxAge: sevenDaysAgo,  // Not accessed in 7 days
  pinned: false,         // Exclude pinned
  audible: false,        // Exclude playing audio
  discarded: false       // Exclude already suspended
});

console.log(`Found ${oldTabs.length} old tabs to suspend`);

// 2. Suspend tabs with protection filters
import { suspendTabs } from './services/execution/SuspensionService.js';

const result = await suspendTabs(
  oldTabs.map(t => t.id),
  {
    includePinned: false,  // Skip pinned (double protection)
    includeActive: false,  // Skip active
    includeAudible: false  // Skip audible
  }
);

console.log(`Suspended: ${result.suspended.length}`);
console.log(`Skipped: ${result.skipped.length} (protected)`);
console.log(`Errors: ${result.errors.length}`);
```

**What happens under the hood:**

1. `selectTabs` applies native Chrome filters (pinned, audible, discarded)
2. Applies custom age filter using lastAccessed timestamp
3. Returns filtered tab IDs
4. `SuspensionService.suspendTabs()` iterates through tab IDs
5. Double-checks protection filters (defense in depth)
6. Calls `chrome.tabs.discard(tabId)` for each tab
7. Tab memory is freed, tab stays visible in strip
8. Chrome auto-reloads tab when user clicks it

---

## Bookmark and Close Workflow

**Goal**: Bookmark tabs to folder, then close them

**Services**: `selectTabs` → `BookmarkService` → `TabActionsService`

```javascript
// 1. Select tabs to bookmark (e.g., by domain)
import { selectTabs } from './services/selection/selectTabs.js';

const tabsToSave = await selectTabs({
  domain: ['github.com', 'stackoverflow.com'],
  grouped: false
});

console.log(`Found ${tabsToSave.length} tabs to bookmark`);

// 2. Bookmark tabs to named folder
import { bookmarkTabs } from './services/execution/BookmarkService.js';

const bookmarkResult = await bookmarkTabs(
  tabsToSave.map(t => t.id),
  {
    folder: 'Programming Resources'
  }
);

console.log(`Bookmarked: ${bookmarkResult.bookmarked.length} tabs`);
console.log(`Folder: ${bookmarkResult.details.folder} (ID: ${bookmarkResult.details.parentId})`);

// 3. Close bookmarked tabs
import { closeTabs } from './services/execution/TabActionsService.js';

const closeResult = await closeTabs(bookmarkResult.bookmarked);

console.log(`Closed: ${closeResult.closed.length} tabs`);
console.log(`Errors: ${closeResult.errors.length}`);
```

**What happens under the hood:**

1. `selectTabs` filters tabs by domain criteria
2. `BookmarkService.bookmarkTabs()` calls internal `findOrCreateFolder()`
3. Folder lookup searches chrome.bookmarks by exact title
4. If folder doesn't exist, creates it in "Other Bookmarks" (parentId '2')
5. Creates bookmark for each tab with URL and title
6. Returns array of successfully bookmarked tab IDs
7. `TabActionsService.closeTabs()` iterates through IDs
8. Calls `chrome.tabs.remove(tabId)` for each
9. Returns detailed results with successes and errors

---

## Cross-Service Patterns

### Pattern 1: Selection → Execution

Most workflows follow this pattern:

```javascript
// 1. Selection layer: WHAT to act on
const tabs = await selectTabs({ filters });

// 2. Execution layer: HOW to act
const result = await executionService(tabs.map(t => t.id), options);
```

**Why**: Separates concerns - selection is reusable across features, execution is action-specific.

### Pattern 2: Detection → Orchestration → Execution

Complex operations use orchestrators:

```javascript
// 1. Detection: Analyze user selection
const { operations, summary } = await detectSnoozeOperations(selectedTabIds);

// 2. Orchestration: Coordinate multiple services
const result = await executeSnoozeOperations({ operations, snoozeUntil, options });
// Internally delegates to WindowService and SnoozeService

// 3. Services execute specific operations
// WindowService handles window metadata
// SnoozeService handles tab storage and alarms
```

**Why**: Handles complex workflows with multiple steps and service coordination.

### Pattern 3: Stateless Formatters

UI formatters are pure functions:

```javascript
// Pure function - no side effects, no API calls
const title = formatSnoozeTitle({ operations, summary });

// Can be called anywhere, anytime, with same inputs → same outputs
```

**Why**: Easy testing, no coupling to services, reusable across UI surfaces.

---

## Service Call Chains

### Window Snooze

```
detectSnoozeOperations (selection)
  ↓
executeSnoozeOperations (orchestrator)
  ↓
WindowService.snoozeWindow (orchestrator)
  ↓
SnoozeService.snoozeTabs (execution)
  ↓
chrome.tabs.remove (Chrome API)
```

### Scheduled Backup

```
chrome.alarms (trigger)
  ↓
ScheduledExportService.handleBackupAlarm (orchestrator)
  ↓
ScheduledExportService.performBackup (execution)
  ↓
ExportImportService.exportData (data management)
  ↓
chrome.downloads.download (Chrome API)
```

### Deduplication

```
selectTabs({ duplicates: true }) (selection)
  ↓
DeduplicationOrchestrator.deduplicate (orchestrator)
  ↓
closeDuplicatesCore (internal)
  ↓
TabActionsService.closeTabs (execution)
  ↓
chrome.tabs.remove (Chrome API)
```

---

## Best Practices

### 1. Always Use Services, Never Direct Chrome APIs

❌ **Wrong**: Direct Chrome API calls in UI code
```javascript
// dashboard.js
await chrome.tabs.remove(tabId); // Duplicates logic
```

✅ **Right**: Call execution service
```javascript
// dashboard.js
import { closeTabs } from './services/execution/TabActionsService.js';
await closeTabs([tabId]);
```

### 2. Selection and Execution Are Separate

❌ **Wrong**: Mixing selection with execution
```javascript
async function closeOldTabs() {
  const tabs = await chrome.tabs.query({}); // selection
  for (const tab of tabs) {
    if (tab.lastAccessed < oldThreshold) { // more selection
      await chrome.tabs.remove(tab.id); // execution mixed in
    }
  }
}
```

✅ **Right**: Separate concerns
```javascript
// Selection
const oldTabs = await selectTabs({ maxAge: sevenDays });

// Execution
await closeTabs(oldTabs.map(t => t.id));
```

### 3. Use Orchestrators for Multi-Service Workflows

❌ **Wrong**: UI code coordinates multiple services
```javascript
// popup.js
const operations = await detectSnoozeOperations(tabIds);
for (const op of operations) {
  if (op.type === 'window') {
    await snoozeWindow(...); // Manual coordination
  } else {
    await snoozeTabs(...);
  }
}
```

✅ **Right**: Orchestrator handles coordination
```javascript
// popup.js
const operations = await detectSnoozeOperations(tabIds);
await executeSnoozeOperations({ operations, snoozeUntil, options });
// Orchestrator coordinates WindowService and SnoozeService internally
```

### 4. Formatters Stay Pure

❌ **Wrong**: Formatter with side effects
```javascript
function formatTitle(operations) {
  chrome.storage.local.set({ lastFormat: Date.now() }); // Side effect!
  return `Snooze ${operations.length} items`;
}
```

✅ **Right**: Pure formatter
```javascript
function formatTitle(operations) {
  return `Snooze ${operations.length} items`; // Pure
}
```

---

## Background Event Handling

**Goal**: Handle Chrome extension events in background service worker

**Services**: Various services + `safeAsyncListener` utility

### Alarm Events (SnoozeService, ScheduledExportService)

```javascript
// In background-integrated.js
import * as SnoozeService from './services/execution/SnoozeService.js';
import * as ScheduledExportService from './services/execution/ScheduledExportService.js';
import { safeAsyncListener } from './services/utils/listeners.js';

// Initialize services once
await SnoozeService.initialize();
await ScheduledExportService.initialize();

// Handle alarms - CRITICAL: Use safeAsyncListener for async handlers
chrome.alarms.onAlarm.addListener(safeAsyncListener(async (alarm) => {
  if (alarm.name.startsWith('snooze_')) {
    await SnoozeService.handleAlarm(alarm);
  } else if (alarm.name === 'scheduled_backup') {
    await ScheduledExportService.handleAlarm(alarm);
  } else if (alarm.name === 'backup_cleanup') {
    await ScheduledExportService.handleAlarm(alarm);
  }
}));
```

### Tab Events (Progressive Sync, Analytics)

```javascript
import { safeAsyncListener } from './services/utils/listeners.js';

// Tab created - track for analytics
chrome.tabs.onCreated.addListener(safeAsyncListener(async (tab) => {
  await recordTabCreation(tab);
  await updateTabStatistics();
}));

// Tab updated - track changes
chrome.tabs.onUpdated.addListener(safeAsyncListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    await handleTabURLChange(tabId, changeInfo.url);
  }
  if (changeInfo.audible !== undefined) {
    await handleTabAudioChange(tabId, changeInfo.audible);
  }
}));

// Tab removed - cleanup
chrome.tabs.onRemoved.addListener(safeAsyncListener(async (tabId, removeInfo) => {
  await cleanupTabMetadata(tabId);
  await updateTabStatistics();
}));
```

### Window Events

```javascript
import * as WindowService from './services/execution/WindowService.js';
import { safeAsyncListener } from './services/utils/listeners.js';

// Window removed - cleanup orphaned metadata
chrome.windows.onRemoved.addListener(safeAsyncListener(async (windowId) => {
  await WindowService.cleanupOrphanedWindowMetadata();
}, {
  errorHandler: (error, context) => {
    console.error('Window cleanup failed:', error, context);
  },
  logErrors: true
}));

// Window focus changed - track active window
chrome.windows.onFocusChanged.addListener(safeAsyncListener(async (windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    await recordActiveWindow(windowId);
  }
}));
```

### Message Listeners (Special Case)

Message listeners need `sendResponse()` callback, so they use manual IIFE pattern:

```javascript
// ❌ WRONG - Don't use safeAsyncListener for message listeners
chrome.runtime.onMessage.addListener(safeAsyncListener(async (message) => {
  // Can't use sendResponse here!
}));

// ✅ CORRECT - Manual IIFE pattern for message listeners
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.action === 'snoozeTab') {
        const result = await SnoozeService.snoozeTabs([message.tabId], message.snoozeUntil);
        sendResponse({ success: true, data: result });
      } else if (message.action === 'exportData') {
        const data = await ExportImportService.exportData(message.options);
        sendResponse({ success: true, data });
      } else {
        sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true; // Keep channel open for async response
});
```

### Why safeAsyncListener?

**Problem**: Using `async` directly on Chrome listeners returns a Promise instead of true/undefined:

```javascript
// ❌ WRONG - Returns Promise, causes race conditions
chrome.alarms.onAlarm.addListener(async (alarm) => {
  await handleAlarm(alarm);
  // Actually returns Promise.resolve(undefined) - BREAKS Chrome!
});
```

**Solution**: `safeAsyncListener` wraps the handler in an IIFE that doesn't return a Promise:

```javascript
// ✅ CORRECT - Returns undefined, runs async code safely
chrome.alarms.onAlarm.addListener(safeAsyncListener(async (alarm) => {
  await handleAlarm(alarm);
  // IIFE pattern ensures no Promise returned
}));
```

**Benefits**:
- ✅ No race conditions
- ✅ Automatic error handling with context
- ✅ Double-wrap protection
- ✅ Configurable error logging

---

## Testing Services

All services should be testable in isolation:

```javascript
// Mock Chrome API
const mockChrome = {
  tabs: {
    query: async () => [{ id: 1, url: 'https://example.com' }],
    remove: async (id) => { /* track for assertions */ }
  }
};

// Test with mock
import { closeTabs } from './services/execution/TabActionsService.js';

// Inject mock (if service supports dependency injection)
const result = await closeTabs([1], { chromeApi: mockChrome });

// Assert
assert.equal(result.closed.length, 1);
```

For services without DI, use test environment with real Chrome APIs (e.g., Playwright).
