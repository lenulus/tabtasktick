# TabTaskTick — Systems Design Document

## 1. System Overview

TabTaskTick is a Chrome extension for advanced tab management (200+ tabs), built with vanilla JavaScript on Manifest V3. It manages tabs, rules-based automation, snooze/wake scheduling, collections (persistent workspaces stored in IndexedDB), and tasks — all coordinated through a single background service worker.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        UI SURFACES (Thin)                           │
│                                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  ┌──────────────┐  │
│  │  Popup   │  │  Side Panel  │  │ Dashboard │  │  Test Panel  │  │
│  │ (4 msgs) │  │  (8 msgs)    │  │ (40+ msgs)│  │  (2 msgs)    │  │
│  └────┬─────┘  └──────┬───────┘  └─────┬─────┘  └──────┬───────┘  │
│       │               │                │                │          │
└───────┼───────────────┼────────────────┼────────────────┼──────────┘
        │               │                │                │
        └───────────────┴───────┬────────┴────────────────┘
                                │
              chrome.runtime.sendMessage({ action, ...params })
              ──────────────────────────────────────────────────
              sendResponse(result)  ←  return true (keep channel)
                                │
┌───────────────────────────────┼─────────────────────────────────────┐
│                   SERVICE WORKER (Coordinator)                      │
│                   background-integrated.js                          │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Message Router: ~100 action cases (switch statement)       │   │
│  │  Pattern: (async () => { ... sendResponse(result) })()      │   │
│  │           return true; // keep channel open                 │   │
│  └────────────────────────────┬────────────────────────────────┘   │
│                               │                                     │
│  ┌────────────────────────────┼────────────────────────────────┐   │
│  │  Chrome Event Listeners (all wrapped in safeAsyncListener)  │   │
│  │  tabs.onCreated/Updated/Removed/Activated                   │   │
│  │  windows.onRemoved/onFocusChanged                           │   │
│  │  alarms.onAlarm, commands.onCommand                         │   │
│  │  contextMenus.onClicked, storage.onChanged                  │   │
│  └────────────────────────────┬────────────────────────────────┘   │
│                               │                                     │
│  ┌────────────────────────────┴────────────────────────────────┐   │
│  │  In-Memory State:                                           │   │
│  │  • state.rules[], state.settings, state.statistics          │   │
│  │  • state.activityLog[], tabTimeData Map, consoleLogs[]      │   │
│  │  • Scheduler instance (alarm coordination)                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ direct function calls
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        SERVICE LAYER                                │
│                                                                     │
│  ┌─────────────────┐  ┌──────────────────────────────────────────┐  │
│  │ Selection Layer  │  │ Execution Layer (Services)                │  │
│  │ (read-only)      │  │                                          │  │
│  │                  │  │  Leaf Services        Composite Services  │  │
│  │ selectTabs       │  │  (storage/Chrome      (depend on other   │  │
│  │ selectCollections│  │   APIs only)           services — their   │  │
│  │ selectTasks      │  │                        domain requires    │  │
│  │ detectSnooze     │  │  CollectionService     it)                │  │
│  │ Operations       │  │  FolderService                            │  │
│  │                  │  │  TabService          WindowService        │  │
│  │                  │  │  TaskService         CaptureWindowSvc     │  │
│  │                  │  │  TabActionsService   RestoreCollectionSvc │  │
│  │                  │  │  SnoozeService       executeSnoozeOps     │  │
│  │                  │  │  SuspensionService   DeduplicationOrch.   │  │
│  │                  │  │  groupTabs           ScheduledExportSvc   │  │
│  │                  │  │  ProgressiveSync     TaskExecutionSvc     │  │
│  └────────┬─────────┘  └──────────────────────┬───────────────────┘  │
│           │                                    │                     │
│           └────────────────────────────────────┘                     │
│                                 │                                   │
│  ┌──────────────────────────────┴──────────────────────────────┐   │
│  │  Storage Layer (utilities, zero business logic)             │   │
│  │                                                             │   │
│  │  storage-queries.js ──→ db.js ──→ IndexedDB                │   │
│  │  (CRUD + cascades)     (transactions)  (TabTaskTickDB v4)  │   │
│  │                                                             │   │
│  │  Stores: collections | folders | tabs | tasks               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Utility Layer (pure functions, zero side effects)          │   │
│  │  snoozeFormatters | activityFormatter | domainUtils         │   │
│  │  emoji-suggestions | windowCreation | tab-snapshot          │   │
│  │  safeAsyncListener | console-capture                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Rules Engine — the true orchestrator (lib/)                │   │
│  │  engine.v2.services.js ──→ Selection + Execution services   │   │
│  │  scheduler.js ──→ chrome.alarms (trigger scheduling)        │   │
│  │                                                             │   │
│  │  Domain-agnostic: takes declarative rules, dispatches to    │   │
│  │  whatever selection + execution services the rules specify  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘

External Dependencies:
  chrome.tabs | chrome.windows | chrome.tabGroups | chrome.alarms
  chrome.storage.local | chrome.downloads | chrome.contextMenus
  chrome.sidePanel | chrome.notifications | chrome.commands
  IndexedDB (TabTaskTickDB v4)
```

---

## 2. UI Surfaces

All surfaces are **thin presentation layers** — they own UI rendering and user interaction, but delegate all business logic to the service worker via message passing.

### 2.1 Popup (`popup/popup.html`)

**Role**: Quick-access launcher. Navigation hub, not a workspace.

**Message volume**: 4 `sendMessage` calls total — nearly all for navigation (opening side panel, swapping panel HTML).

**Direct imports**: Only utility services — `snoozeFormatters` (UI text), `SidePanelNavigationService` (storage handoff), `console-capture`.

**Key interaction**: The popup writes a pending action to `chrome.storage.local` via `SidePanelNavigationService.setPendingAction()` *before* calling `chrome.sidePanel.open()`, solving the race condition where the side panel isn't ready to receive messages at the moment it's opened.

### 2.2 Side Panel (`sidepanel/panel.html`)

**Role**: Primary workspace. Collections browser, task manager.

**Architecture**: Component-based — `SidePanelController` coordinates `CollectionsView`, `CollectionDetailView`, `TasksView`, `SearchFilter`, `PresentationControls`, plus a local `state-manager.js`.

**Message volume**: ~8 `sendMessage` calls, mostly collection/task CRUD.

**Direct imports**: Utility-only — `emoji-suggestions`, `tab-snapshot`, `CollectionFilterService` (pure business logic, no mutations), `SidePanelNavigationService.consumePendingAction()`.

**Inbound listener**: Listens for broadcast messages from the background (e.g., sync updates). Does NOT call `sendResponse` — broadcast-only pattern.

### 2.3 Dashboard (`dashboard/dashboard.html`)

**Role**: Power-user management. Rules editor, analytics, all-tabs view, snoozed tabs, history, collections, tasks (list + kanban).

**Architecture**: Module-based with a shared reactive state store (`modules/core/state.js`). 10+ view modules in `modules/views/`.

**Message volume**: ~40+ `sendMessage` calls across all views. This is the most message-heavy surface, reflecting its breadth.

**Direct imports**: Utility-only — `activityFormatter`, `WindowNameService`, `console-capture`.

**Inbound listener**: Listens for `openRuleModal` from background (context menu "Create Rule" flow). The background uses `chrome.tabs.sendMessage(dashboardTabId, ...)` for this targeted delivery.

### 2.4 Test Panel (`test-panel/test-panel.html`)

**Role**: Alternate side panel for running the automated test suite against the live extension.

**Message volume**: 2 `sendMessage` calls (`getConsoleLogs`, engine selection).

**Direct imports**: `lib/test-mode/test-mode.js` (test framework).

---

## 3. Communication Architecture

### 3.1 Primary Channel: Message Passing

All business logic flows through a single message handler in the service worker:

```javascript
// background-integrated.js:1141
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      switch (request.action) {
        case 'closeTabs':       /* delegate to service */ break;
        case 'createCollection': /* delegate to service */ break;
        // ... ~100 cases total
        default: sendResponse({ error: 'Unknown action' });
      }
    } catch (error) {
      sendResponse({ error: error.message });
    }
  })();
  return true; // Keep channel open for async response
});
```

**Why IIFE + `return true`**: Chrome's `onMessage` listener must return *exactly* the boolean `true` to keep the response channel open for async operations. An `async` function returns `Promise.resolve(true)` instead, which Chrome doesn't understand. See [Section 7.1](#71-the-safeasynclistener-pattern) for the full incident.

### 3.2 Message Action Taxonomy (~100 actions)

| Domain | Actions | Pattern |
|--------|---------|---------|
| **Tab Read** (9) | `getTabs`, `getTabInfo`, `getStatistics`, `getTab`, `getTabsByFolder`, `getUngroupedTabs`, `getAllWindows`, `getCurrentWindow`, `getTabTimeData` | Thin → query service or Chrome API |
| **Tab Write** (8) | `closeTabs`, `groupTabs`, `moveToWindow`, `ungroupTabs`, `groupByDomain`, `suspendInactiveTabs`, `focusTab`, `focusWindow` | Thin → execution service or engine |
| **Rules** (12) | `getRules`, `addRule`, `updateRule`, `toggleRule`, `updateRules`, `deleteRule`, `previewRule`, `executeRule`, `executeAllRules`, `getSchedulerStatus`, `getRule`, `getScheduledTriggers` | Mixed — CRUD is thin, preview/execute build engine context |
| **Snooze** (10) | `snoozeTabs`, `detectSnoozeOperations`, `executeSnoozeOperations`, `getSnoozedTabs`, `wakeSnoozedTab`, `wakeAllSnoozed`, `deleteSnoozedTab`, `restoreWindow`, `deleteWindow`, `snoozeCurrent` | Thin → SnoozeService / WindowService |
| **Collections** (8) | `createCollection`, `updateCollection`, `deleteCollection`, `getCollection`, `getCollections`, `getCompleteCollection`, `updateCollectionSettings`, `captureWindow`, `restoreCollection` | Thin → CollectionService / composite services |
| **Folders/Tabs/Tasks** (12) | `createFolder`, `updateFolder`, `deleteFolder`, `createTab`, `updateTab`, `deleteTab`, `createTask`, `updateTask`, `deleteTask`, `getTasks`, `getTask`, `openTaskTabs` | Thin → CRUD services |
| **Progressive Sync** (8) | `getSyncStatus`, `syncCollectionFromWindow`, `flushSync`, `checkProgressiveSyncInit`, `getProgressiveSyncCache`, `checkCollectionSync`, `refreshProgressiveSyncCache`, `getProgressiveSyncPending` | Thin → ProgressiveSyncService |
| **Export/Import** (10) | `exportData`, `importData`, `getScheduledExportConfig`, `enableScheduledExports`, `triggerManualBackup`, `getBackupHistory`, `exportCollection`, `importCollections`, `exportAllCollections`, `validateBackup` | Thin → Export/Import services |
| **Settings/Logging** (5) | `getSettings`, `updateSettings`, `getActivityLog`, `clearActivityLog`, `getConsoleLogs` | Thin → in-memory state |

**~80% of handlers are thin pass-throughs** — they translate the message into a service call and forward the response. The "thick" handlers assemble engine context, build temporary rules, or coordinate multiple services inline.

### 3.3 Secondary Channel: Storage Handoff

Used when timing makes message passing unreliable:

```
Popup                                    Side Panel
  │                                        │
  ├─ storage.local.set({                   │
  │    sidepanel_pending_action: {         │
  │      action: 'createCollection',       │
  │      timestamp, ttl: 5000             │
  │    }                                   │
  │  })                                    │
  │                                        │
  ├─ chrome.sidePanel.open(windowId)  ───→ │ (panel initializes)
  │                                        │
  ├─ sendMessage('openSidePanelWithAction')│ (fallback for
  │                                        │  already-open panels)
  │                                        │
  │                                        ├─ consumePendingAction()
  │                                        │   reads + deletes from storage
  │                                        ├─ executes action
```

**Why**: `chrome.sidePanel.open()` creates a new page context. The panel's `onMessage` listener isn't registered until after the page loads and its module scripts execute. A message sent immediately after `open()` would be lost. The storage-based handoff with TTL provides a reliable rendezvous.

### 3.4 Tertiary Channel: Background → Dashboard Direct

For the "Create Rule from Context Menu" flow, the background sends directly to a known dashboard tab:

```
Background (context menu click)
  ├─ chrome.tabs.sendMessage(dashboardTabId, { action: 'openRuleModal', rule })
  │                                           │
  │  OR (if dashboard isn't open yet)         │
  │                                           │
  ├─ chrome.tabs.create({ url: dashboard })   │
  ├─ waits for 'dashboardReady' message  ←────┤ (dashboard sends on load)
  └─ sends rule template                      │
  └─ storage.local.set({ pendingRuleTemplate })│ (fallback)
```

### 3.5 Chrome Event Listeners

The service worker registers 11 event listeners (all wrapped in `safeAsyncListener`):

| Event | Handler Purpose |
|-------|-----------------|
| `runtime.onInstalled` | Full initialization — DB, services, scheduler, context menus |
| `runtime.onStartup` | Reload state + start monitoring |
| `tabs.onCreated` | Time tracking, tab history, immediate rule triggers |
| `tabs.onUpdated` | Immediate rule triggers on URL changes |
| `tabs.onActivated` | Update `tabTimeData` last-active timestamps |
| `tabs.onRemoved` | Cleanup `tabTimeData`, track closure in history |
| `windows.onRemoved` | Unbind collections from closed windows |
| `windows.onFocusChanged` | Update collection `lastAccessed` timestamps |
| `commands.onCommand` | Keyboard shortcuts (Ctrl+Shift+S/G/D) |
| `contextMenus.onClicked` | Context menu actions (snooze, group, rule, export) |
| `alarms.onAlarm` | Snooze wake-ups, scheduled backups, rule repeat triggers |
| `storage.onChanged` | Test mode enter/exit (snapshot + restore production rules) |

Plus `ProgressiveSyncService` registers its own module-level listeners for tab/tabGroup events (redundant with background listeners for reliability during service worker restarts).

---

## 4. Service Layer Architecture

### 4.1 Service Classification and Dependency Direction

Services fall into two categories — **leaf** and **composite** — not into separate architectural layers. The distinction is about dependency scope, not about hierarchy:

- **Leaf services** own a domain and depend only on storage utilities or Chrome APIs. They have no knowledge of other services. (CollectionService, TabActionsService, SnoozeService, groupTabs, etc.)
- **Composite services** own a broader domain that inherently requires coordinating leaf services. WindowService needs SnoozeService because window snooze *is* tab snooze + metadata. CaptureWindowService needs CollectionService + FolderService + TabService because capturing a window *is* creating those entities. They're not generically "orchestrating" — they're services whose domain is wider.

The **rules engine** is the actual orchestrator. It's the only component that is domain-agnostic: it takes declarative rule definitions, delegates selection to the selection layer, and dispatches actions to whatever execution services the rules specify. No other component does this.

```
     ┌─────────────────────────────────────────────┐
     │  Rules Engine (the orchestrator)             │
     │  Domain-agnostic: declarative rules →        │
     │  selection + execution dispatch              │
     │  Calls: Selection services, Execution svcs   │
     └────────────────────┬────────────────────────┘
                          │ dispatches to ↓
     ┌────────────────────┴────────────────────────┐
     │  Execution Services                          │
     │                                              │
     │  Composite (broader domain):                 │
     │    WindowService, CaptureWindowService,      │
     │    RestoreCollectionService, etc.             │
     │    → call leaf services because their         │
     │      domain requires it                      │
     │                                              │
     │  Leaf (single domain):                       │
     │    CollectionService, TabActionsService,      │
     │    SnoozeService, groupTabs, etc.             │
     │    → depend only on storage/Chrome APIs       │
     └────────────────────┬────────────────────────┘
                          │ calls ↓
     ┌────────────────────┴────────────────────────┐
     │  Selection Services (read-only filtering)    │
     │  selectTabs, selectCollections, selectTasks,  │
     │  detectSnoozeOperations                      │
     │  → depend only on storage/Chrome APIs         │
     │  → NEVER call execution services              │
     └────────────────────┬────────────────────────┘
                          │ calls ↓
     ┌────────────────────┴────────────────────────┐
     │  Storage Utilities (zero business logic)     │
     │  storage-queries.js → db.js → IndexedDB      │
     └─────────────────────────────────────────────┘
```

**Dependency rules**:
- Selection → Execution: **forbidden** (read-only layer cannot mutate)
- Leaf service → composite service: **forbidden** (would create cycles; one exception: SnoozeService → WindowService for cleanup only)
- Any service → IndexedDB directly: **forbidden** (must go through storage-queries → db.withTransaction)
- UI → any service directly: **forbidden** (must go through message passing → background → service)

### 4.2 The Selection / Execution Separation

This is the core architectural decision. Every operation is decomposed into two independent concerns:

**Selection** answers *what to act on*:
```javascript
// Selection: "which tabs are duplicates?"
const dupes = await selectTabs({ duplicates: true });

// Selection: "is this a window operation or individual tabs?"
const { operations } = await detectSnoozeOperations(selectedTabIds);

// Selection: "which collections are active?"
const active = await selectCollections({ isActive: true });
```

**Execution** answers *how to act on them*:
```javascript
// Execution: "close these specific tabs"
await TabActionsService.closeTabs(dupeIds);

// Execution: "snooze these operations"
await executeSnoozeOperations({ operations, snoozeUntil, options });

// Execution: "group these tab IDs by domain"
await groupTabs(tabIds, { byDomain: true });
```

**Why this matters**: The same execution service is reused across all entry points without modification:

| Entry Point | Selection | Execution |
|------------|-----------|-----------|
| User clicks "Close Selected" | UI tracks checkbox state | `TabActionsService.closeTabs(ids)` |
| User clicks "Close Duplicates" | `selectTabs({ duplicates: true })` | `TabActionsService.closeTabs(ids)` |
| Rule fires "close old tabs" | `engine → selectTabsMatchingRule()` | `TabActionsService.closeTabs(ids)` |
| Context menu "Remove Duplicates" | `DeduplicationOrchestrator` | `TabActionsService.closeTabs(ids)` |

Without this separation, every surface would duplicate selection logic — and the duplicates would drift out of sync.

### 4.3 Storage Layer Design

**Dual storage tiers**, serving different purposes:

| Storage | Purpose | Data |
|---------|---------|------|
| `chrome.storage.local` | Transient operational state that must survive service worker restarts | Rules, settings, statistics, snoozed tab metadata, window metadata, scheduler triggers, activity log |
| IndexedDB (`TabTaskTickDB` v4) | Persistent normalized user data | Collections, folders, tabs, tasks |

**IndexedDB schema**:

```
collections ─────────────── PK: id (UUID)
  │  Indices: isActive, tags (multiEntry), lastAccessed
  │
  ├─── folders ──────────── PK: id (UUID)
  │      │  Index: collectionId
  │      │
  │      └─── tabs ──────── PK: id (UUID)
  │             Indices: folderId, collectionId, tabId (Chrome runtime ID)
  │
  └─── tasks ────────────── PK: id (UUID)
         Indices: collectionId, status, priority, dueDate, tags, createdAt
```

**Transaction wrapper** — every storage operation goes through:
```javascript
// storage-queries.js
export async function saveCollection(collection) {
  return withTransaction(['collections'], 'readwrite', async (tx) => {
    const store = tx.objectStore('collections');
    await store.put(collection);
  });
}
```

`withTransaction()` in `db.js` provides automatic rollback on exception and prevents orphaned transactions. This is a mandatory rule — no service ever calls `store.put()` without the wrapper.

**Cascade deletes** — `deleteCollection` cascades across all 4 stores in a single transaction:
```
deleteCollection(id) → single readwrite transaction:
  1. delete from collections
  2. get all folders where collectionId = id → delete each
  3. for each folder: get all tabs where folderId = folder.id → delete each
  4. get all tabs where collectionId = id (ungrouped) → delete each
  5. get all tasks where collectionId = id → delete each
```

### 4.4 Rules Engine (The Orchestrator)

The rules engine (`lib/engine.v2.services.js`) is the only true orchestrator in the system. Unlike composite services (which own a specific domain), the engine is **domain-agnostic** — it takes declarative rule definitions and dispatches to whatever services the rules specify. It implements no selection or execution logic itself.

```
Rule Definition                  Engine                        Services
┌──────────────┐    ┌──────────────────────────┐    ┌────────────────────┐
│ when:        │    │                          │    │                    │
│   all:       │───→│ selectTabsMatchingRule() │───→│ selectTabs         │
│     - domain │    │   (delegates selection)   │    │ (selection layer)  │
│     - age    │    │                          │    │                    │
│              │    │                          │    │                    │
│ then:        │    │                          │    │                    │
│   - close    │───→│ executeActions()         │───→│ TabActionsService  │
│   - group    │    │   (dispatches to         │    │ groupTabs          │
│              │    │    execution services)    │    │ SnoozeService      │
└──────────────┘    └──────────────────────────┘    └────────────────────┘
```

**Trigger scheduling** (`lib/scheduler.js`):
- `immediate` triggers: Debounced (default 2s) — fire on tab events
- `repeat` triggers: Use `chrome.alarms` (minimum 1 minute, Chrome constraint) — periodic execution
- `once` triggers: Scheduled to specific timestamp, persisted in `chrome.storage` for recovery after service worker restart

---

## 5. Key Workflows

### 5.1 Window Snooze (Deepest Call Chain)

```
User selects tabs in popup/dashboard
  │
  ▼
detectSnoozeOperations(tabIds)              ← Selection Layer
  │  Groups by windowId, checks if all tabs
  │  in window are selected → window operation
  │  Returns: { operations: [{ type: 'window', windowId }], summary }
  ▼
executeSnoozeOperations({ operations })     ← Composite Service
  │  Iterates operations sequentially
  │  Window ops → WindowService
  │  Tab ops → SnoozeService directly
  ▼
WindowService.snoozeWindow(windowId)        ← Composite Service
  │  1. Captures window metadata (position, state, focus)
  │  2. Stores metadata in chrome.storage.local
  │  3. Delegates tab snoozing ↓
  ▼
SnoozeService.snoozeTabs(tabIds, until)     ← Execution Layer
  │  1. Captures each tab's metadata (URL, title, favicon, group)
  │  2. Stores in chrome.storage.local
  │  3. Creates chrome.alarm per tab
  │  4. Closes tabs via chrome.tabs.remove()
  ▼
[2 hours later] chrome.alarms fires
  ▼
SnoozeService.handleAlarm(alarm)
  │  Restores individual tabs
  ▼
WindowService.restoreWindow(windowSnoozeId)
  │  Recreates window with original metadata
  │  Reuses ExportImportService's 137-line window creation logic
  ▼
windowCreation.createWindowWithTabsAndGroups()  ← Utility
  │  Creates window, opens tabs, recreates groups
```

**Depth**: 6 layers — UI → Detection (selection) → Composite service → Composite service → Leaf service → Chrome API

### 5.2 Collection Capture → Progressive Sync → Restore

```
User clicks "Save Window as Collection"
  │
  ▼
CaptureWindowService.captureWindow(windowId)    ← Composite Service
  │  1. Reads all tabs + tab groups from Chrome
  │  2. Maps Chrome groups → folders, tabs → tabs
  │  3. Creates collection via CollectionService
  │  4. Creates folders via FolderService
  │  5. Creates tabs via TabService
  │  6. Binds collection to window via WindowService
  ▼
ProgressiveSyncService.trackCollection(id)      ← Execution
  │  Begins monitoring this window's tab events
  │  Changes batched + debounced → flushed to IndexedDB
  │
  │  [User adds/removes/moves tabs normally]
  │  chrome.tabs.onCreated → queue change
  │  chrome.tabs.onRemoved → queue change
  │  debounce timer fires → flush to IndexedDB
  │
  ▼
[Later] User clicks "Restore Collection"
  ▼
RestoreCollectionService.restoreCollection(id)  ← Composite Service
  │  1. Reads complete collection from IndexedDB
  │  2. Creates new window via windowCreation utility
  │  3. Maps DB tabs back to Chrome tabs
  │  4. Recreates groups from folders
  │  5. Binds collection to new window
  │  6. Starts progressive sync for new window
```

### 5.3 Rule Execution via Engine

```
Scheduler trigger fires (alarm or debounced immediate)
  │
  ▼
onSchedulerTrigger({ ruleId, type })
  │  Lazy-loads rules from storage if state is empty
  │  (handles service worker restart)
  ▼
executeRule(ruleId, triggerType, testMode)
  │  1. Gets all tabs + windows from Chrome
  │  2. Enhances tabs with timeData, categories
  │  3. Builds context: { tabs, windows, chrome, idx }
  │     idx = { byDomain, byOrigin, byDupeKey, byCategory }
  ▼
engine.runRules([rule], context, { dryRun: false })
  │  1. Calls selectTabsMatchingRule(rule, context) → matched tabs
  │  2. For each action in rule.then:
  │     dispatches to appropriate execution service
  │  3. Aggregates results
  ▼
[Results flow back up, statistics updated, activity logged]
```

---

## 6. Service Worker Lifecycle

### 6.1 MV3 Constraints

Chrome Manifest V3 service workers are **ephemeral** — Chrome may terminate them at any time after 5 minutes of inactivity. The architecture handles this:

**State recovery on restart**:
```javascript
// background-integrated.js:2876 — Runs on EVERY script load
(async function initializeOnLoad() {
  await loadRules();           // from chrome.storage.local
  await loadSettings();        // from chrome.storage.local
  await loadStatistics();      // from chrome.storage.local
  await loadActivityLog();     // from chrome.storage.local
  await initializeScheduler(); // re-registers chrome.alarms
})();
```

**Lazy initialization pattern** (SnoozeService, ScheduledExportService):
```javascript
async function ensureInitialized() {
  if (isInitialized) return;
  // Load state from chrome.storage.local
  // Re-register alarms
  isInitialized = true;
}
// Called at the start of every public method
```

**No dynamic imports** — Chrome service workers crash on `import()`. All 30+ service imports are static at the top of `background-integrated.js`.

### 6.2 Startup Sequence

```
Service worker script loads
  │
  ├─ Static imports: all services loaded
  │
  ├─ IIFE: initializeOnLoad()
  │   ├─ loadRules(), loadSettings(), loadStatistics()
  │   ├─ loadActivityLog(), loadDomainCategories()
  │   └─ initializeScheduler()
  │       ├─ scheduler.init() → reads scheduledTriggers from storage
  │       ├─ Fires any past-due triggers via setTimeout(fn, 0)
  │       └─ setupRule() for each enabled rule (isRestart: true)
  │
  ├─ runtime.onInstalled (first install only)
  │   ├─ initializeDB() → IndexedDB schema setup/migration
  │   ├─ WindowService.rebuildCollectionCache()
  │   ├─ ProgressiveSyncService.initialize()
  │   ├─ setupContextMenus()
  │   └─ checkAndMigrateTabs() → legacy rule format migration
  │
  └─ runtime.onStartup (every browser launch)
      ├─ setupContextMenus()
      ├─ initializeDB(), rebuildCollectionCache()
      ├─ ProgressiveSyncService.initialize()
      └─ startMonitoring()
```

---

## 7. Critical Design Decisions

### 7.1 The `safeAsyncListener` Pattern

**The incident**: In v1.3.18 (Sept 30, 2025), a standard `async` listener was added to the dashboard:

```javascript
// BROKEN — looks correct but returns Promise.resolve(true), not true
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === 'openRuleModal') {
    await loadRulesView();
    sendResponse({ success: true });
  }
  return true;
});
```

Chrome's message routing only understands `true` (keep channel open) or `undefined` (pass to next listener). A Promise is neither. The channel closes prematurely.

**The symptom**: The bug was **non-deterministic and context-dependent**. It only manifested when the dashboard and popup were open simultaneously — the dashboard's broken listener intercepted messages meant for the background, and the channel died before the background could respond. The popup showed zero values for all statistics. The bug lay dormant for 8 weeks.

**The fix**: A 4-phase architectural remediation:

1. **Immediate**: Created `safeAsyncListener` utility — wraps async handlers in an IIFE that returns `undefined`:
   ```javascript
   export function safeAsyncListener(handler) {
     const wrapped = (...args) => {
       (async () => { await handler(...args); })();
       // Returns undefined implicitly — never a Promise
     };
     wrapped.__safeWrapped = true; // prevent double-wrap
     return wrapped;
   }
   ```
   Wrapped all 11 async listeners in `background-integrated.js`.

2. **Testing**: 48-test unit test suite in `tests/listeners.test.js`.

3. **Documentation**: Added CRITICAL section to `CLAUDE.md` and all service documentation.

4. **Prevention**: Custom ESLint rule (`no-async-chrome-listener`) that errors on `chrome.*.*.addListener(async ...)` — catches violations at lint time.

**Two-tier pattern**:

| Listener Type | Pattern | Reason |
|---------------|---------|--------|
| `chrome.runtime.onMessage` | Manual IIFE + `return true` | Needs `sendResponse` callback |
| All other Chrome events | `safeAsyncListener(async () => {...})` | Fire-and-forget, no response |

### 7.2 Two Storage Tiers

| Decision | Rationale |
|----------|-----------|
| **chrome.storage.local** for rules, snoozed tabs, settings | Must survive service worker restarts. Can be read synchronously-ish on startup. chrome.alarms metadata needs storage.local. |
| **IndexedDB** for collections, folders, tabs, tasks | Normalized relational data. Needs indices, transactions, cascade deletes. Storage.local's flat key-value model can't handle this efficiently. |

The tiers are strictly separated. No service reads from both tiers in a single operation (except the export system, which assembles a complete snapshot).

### 7.3 No Framework, No Build Step

The extension uses vanilla JavaScript with ES modules (`type="module"` on all scripts). No React, no bundler, no transpilation.

**Why**: Chrome extensions load files directly. A build step adds complexity (source maps for debugging service workers, HMR that doesn't work in extension contexts, bundler-generated code that's hard to inspect in Chrome's devtools). The performance targets (popup < 100ms, 200-tab render < 200ms) are achievable without a framework.

**Trade-off**: Views use string template literals for rendering, which ESLint can't statically analyze for function usage (this caused a production incident where "unused" imports were deleted but were actually called inside template literals — see CLAUDE.md).

### 7.4 Engine Routes All Tab Actions

Even manual user actions (close selected tabs, group by domain) are routed through the rules engine via `executeActionViaEngine()`:

```javascript
// A user clicking "Close" on 3 tabs creates a temporary rule:
const tempRule = {
  id: `temp-close-${Date.now()}`,
  when: { any: tabIds.map(id => ({ subject: 'id', operator: 'equals', value: id })) },
  then: [{ action: 'close' }]
};
await engine.runRules([tempRule], context, { dryRun: false, forceExecution: true });
```

**Why**: Single code path for tab enhancement (categories, time data, indices), action dispatch, and result aggregation. Without this, manual actions and rule actions would diverge in behavior.

**Trade-off**: Slightly higher overhead for simple operations. Acceptable because tab operations are not latency-sensitive (user doesn't notice 10ms vs 50ms for closing tabs).

### 7.5 The One Circular Dependency

```
WindowService → SnoozeService (core snooze operations)
SnoozeService → WindowService.cleanupOrphanedWindowMetadata (periodic cleanup only)
```

**Why accepted**: Different concerns — SnoozeService manages tab-level snooze/wake, WindowService manages window-level orchestration. The reverse dependency is a single named import for a cleanup utility, not a deep coupling. Both services are lazy-initialized, so there's no initialization deadlock.

**All other dependency relationships are strictly unidirectional.** TabTaskTick's collection services have zero circular dependencies (enforced by the storage layer abstraction — all services depend down to storage-queries.js, never laterally).

---

## 8. Data Flow Patterns

### Pattern 1: Simple CRUD (Most Common)

```
Surface → sendMessage({ action: 'createCollection', params })
       → Background switch case
       → CollectionService.createCollection(params)
       → storage-queries.saveCollection(collection)
       → db.withTransaction(['collections'], 'readwrite', ...)
       → IndexedDB put
       ← sendResponse({ success: true, collection })
```

### Pattern 2: Bulk Operation (Selection + Execution)

```
Surface → sendMessage({ action: 'closeTabs', tabIds })
       → Background builds temp rule with tab ID conditions
       → engine.runRules([tempRule], context)
       → selectTabsMatchingRule() identifies matching tabs
       → TabActionsService.closeTabs(matchedIds)
       → chrome.tabs.remove(ids)
       ← sendResponse({ success, result })
```

### Pattern 3: Detection → Composite Service → Leaf Service

```
Surface → sendMessage({ action: 'detectSnoozeOperations', tabIds })
       → detectSnoozeOperations(tabIds)
       ← { operations, summary }

Surface → sendMessage({ action: 'executeSnoozeOperations', operations })
       → executeSnoozeOperations({ operations })
       → [for window ops] WindowService.snoozeWindow()
         → SnoozeService.snoozeTabs()
       → [for tab ops] SnoozeService.snoozeTabs()
       ← sendResponse({ success, summary })
```

### Pattern 4: Event-Driven (No UI Trigger)

```
chrome.alarms.onAlarm fires
  → safeAsyncListener wraps handler
  → [snooze alarm] SnoozeService.handleAlarm()
    → Restores tabs, potentially restores window
  → [rule alarm] onSchedulerTrigger()
    → executeRule() → engine.runRules() → services
  → [backup alarm] ScheduledExportService.handleAlarm()
    → ExportImportService.exportData() → chrome.downloads
```

---

## 9. Scalability Characteristics

| Dimension | Design | Limit |
|-----------|--------|-------|
| **Tab count** | Single-pass statistics calculation, indexed lookups by domain/dupeKey/category | Tested with 500+ tabs |
| **Rule count** | Rules stored flat in chrome.storage.local, iterated sequentially | Practical limit ~100 rules |
| **Collection size** | IndexedDB with indices, pagination via storage-queries | Tested with collections of 100+ tabs |
| **Service worker restarts** | Lazy init, alarm persistence, storage recovery | Seamless — user doesn't notice restarts |
| **Concurrent surfaces** | Message channel stays open via `return true`, no shared mutable state between surfaces | All 4 surfaces can be open simultaneously |
| **Progressive sync throughput** | Debounced change queue per collection, batch flush | Handles rapid tab open/close without overwhelming IndexedDB |

---

## 10. Testing Architecture

| Layer | Strategy | Tool |
|-------|----------|------|
| **Storage utilities** | Unit tests with `fake-indexeddb` (no Chrome mocks needed) | Jest |
| **Selection services** | Unit tests with mocked `storage-queries.js` | Jest |
| **Execution services** | Unit tests with mocked storage + Chrome APIs | Jest |
| **Composite services** | Integration tests with mocked downstream services | Jest |
| **Rules engine** | Unit tests with synthetic tab/rule data | Jest |
| **Listeners utility** | Unit tests verifying return values and error handling | Jest (48 tests) |
| **Message handlers** | E2E tests against real Chrome with extension loaded | Playwright |
| **Full workflows** | E2E tests — capture/restore/sync collections, snooze/wake | Playwright |

**Test counts**: 691 unit tests (Jest), 22+ E2E tests (Playwright).

**Known limitation**: `fake-indexeddb` has broken index query support — index-based lookups always return empty. The code detects this at runtime and falls back to full-scan + JS filter. Production code paths are unaffected.

---

## 11. Summary of Architectural Invariants

1. **Surfaces are thin** — UI rendering only, zero business logic, all mutations via message passing
2. **Services own all logic** — one implementation per behavior, shared across all entry points
3. **Selection and execution are separate layers** — what to act on vs. how to act on it
4. **All Chrome listeners use `safeAsyncListener`** — except `onMessage` (manual IIFE + `return true`)
5. **All IndexedDB access goes through `storage-queries.js → db.withTransaction()`** — no direct `store.put()`
6. **No dynamic imports anywhere** — Chrome MV3 service workers crash on `import()`
7. **Dependency arrows point downward** — Engine → Services (composite → leaf) → Selection → Storage
8. **One circular dependency** (SnoozeService ↔ WindowService) — shallow, justified, monitored
9. **Two storage tiers** — `chrome.storage.local` for operational state, IndexedDB for user data
10. **Dead code is deleted immediately** — not commented out, not deferred
