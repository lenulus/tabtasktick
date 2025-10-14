# TabTaskTick: Product Proposal v2.0

**Evolution from Tab Hygiene to Work Management**

---

## Executive Summary

TabTaskTick represents the evolution of TabMaster Pro from a tab hygiene tool into a comprehensive knowledge organization and work management system for browser-based work.

**Three-Stage Evolution**:
1. **Stage 1 - Hygiene** (Complete): Rules engine, deduplication, tab grouping, snoozing
2. **Stage 2 - Knowledge Org** (Proposed): Collections as persistent windows with folders
3. **Stage 3 - Work Management** (Proposed): Tasks within collections referencing specific tabs

**Core Innovation**: Collections ARE windows that can be saved/restored with full context. Tasks live within collections and reference specific tabs, providing work context for organized knowledge.

**Key Simplifications from v1**:
- ✅ Collections are window-bounded (not abstract containers)
- ✅ Tasks belong to one collection (0..1 relationship)
- ✅ Tasks reference multiple tabs (0..n relationship)
- ✅ Removed subtasks from MVP (flat task list)
- ✅ Removed tab types (Primary/Reference)
- ✅ Simplified discovery flow (popup → side panel)

**Target Users**: Knowledge workers managing 50-200 tabs who maintain separate systems for bookmarks, tasks, and browser tabs.

**Expected Impact**:
- Reduce open tab count by 60% (200 → 80 tabs)
- Replace 3 disconnected tools (tab manager + task manager + bookmarks)
- Enable task-driven work: click task → relevant tabs open

---

## Product Vision

### The Problem Space

**Current State**: Knowledge workers maintain three disconnected systems:
1. **Browser Windows** (5+ open): Makeshift projects, consume memory, fear of closing
2. **Bookmarks** (100-1000s): Dead storage, no context, never maintained
3. **Task Manager** (external): Manual link tracking, copy/paste URLs, no integration

**User Pain Points**:
- "I keep 5 windows open for different projects because closing them feels like losing context"
- "My task list says 'Fix auth bug' but I have to hunt for the 3 tabs I need"
- "Bookmarks are where links go to die - I save them and never look again"

**The Gap**: No system makes browser windows persistent OR connects tasks to specific browser tabs.

### The Solution: TabTaskTick

**Core Concept**: Collections ARE saved windows. Tasks live in collections and reference specific tabs.

**Collection** = Persistent Window
- When active: Has actual browser window with tabs open
- When inactive: Saved state, can be restored as window
- Contains folders (tab groups) and tabs
- Has tasks that reference specific tabs within it

**Mental Model**:
```
Active Collection (Window #2)
├─ Browser Window exists with tabs open
├─ Folders = Chrome Tab Groups
├─ Tabs = Chrome Tabs
└─ Tasks reference specific tabs in THIS collection

Saved Collection
├─ No browser window (closed)
├─ Stored state (folders, tabs, tasks)
└─ Can be restored → becomes Active Collection
```

**Task** = Work item within a collection
- Belongs to ONE collection (or none for uncategorized tasks)
- References MULTIPLE tabs within that collection
- Has status, priority, due date, comments
- Opening task → opens referenced tabs

**Key Insight**: If a task references many tabs in a folder, it's essentially "work on this folder." Tasks and folders serve complementary purposes:
- **Folders**: Organize tabs by topic/type (Documentation, Development, Resources)
- **Tasks**: Organize work by objective (Fix bug, Write docs, Research feature)

---

## Data Model (Simplified)

### Collection (Window)

```javascript
interface Collection {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  tags: string[];

  folders: Folder[];  // 0..n Tab Groups

  // Window binding (when active)
  windowId?: number;  // Chrome window ID if currently open
  isActive: boolean;  // Is there a window for this collection?

  metadata: {
    createdAt: number;
    lastAccessed: number;
  };
}
```

**Key Change**: Added `windowId` and `isActive` to track window binding.

### Folder (Tab Group)

```javascript
interface Folder {
  id: string;
  name: string;
  color: string;      // Chrome TabGroup color
  collapsed: boolean;
  position: number;

  tabs: Tab[];        // 0..n Tabs
}
```

**No changes** from v1.

### Tab (Resource - Simplified)

```javascript
interface Tab {
  id: string;
  url: string;
  title: string;
  favicon?: string;

  note?: string;      // Max 255 chars
  lastAccess?: number;

  position: number;
  isPinned?: boolean;

  // Runtime state (when collection is active)
  tabId?: number;     // Chrome tab ID if open
}
```

**Key Change**: Removed `type` field (Primary/Reference) - too much cognitive load for unclear benefit.

### Task (Work Item - Simplified)

```javascript
interface Task {
  id: string;
  summary: string;
  notes?: string;

  // State
  status: 'open' | 'active' | 'fixed' | 'abandoned';
  priority: 'low' | 'medium' | 'high' | 'critical';
  dueDate?: number;
  tags: string[];

  // Relationships (SIMPLIFIED)
  collectionId?: string;  // 0..1 - Belongs to ONE collection
  tabIds: string[];       // 0..n - References MULTIPLE tabs

  // Discussion
  comments: Comment[];

  // Tracking
  createdAt: number;
  completedAt?: number;
}
```

**Key Changes**:
- Removed `parentTaskId` (no subtasks in MVP)
- Changed `tabId` to `tabIds` array (task can reference multiple tabs)
- Task belongs to ONE collection only

### Comment

```javascript
interface Comment {
  id: string;
  text: string;
  createdAt: number;
}
```

**No changes** from v1.

### Relationships (Simplified)

```
Collection (1) → Folder (0..n)
Folder (1) → Tab (0..n)
Collection (1) → Task (0..n)       // Tasks belong to ONE collection

Task (1) → Collection (0..1)       // Task in one collection (or uncategorized)
Task (1) → Tab (0..n)              // Task references multiple tabs
Task (1) → Comment (0..n)
```

**Key Simplifications**:
- Tasks belong to ONE collection (not cross-collection)
- Tasks reference MULTIPLE tabs (not just one)
- No subtask relationships (flat task list)

---

## Mental Model Clarity

### Collection States

**Active Collection**:
```
Collection "Project X"
├─ windowId: 1234 (Chrome Window ID)
├─ isActive: true
├─ Browser Window exists
│  ├─ Tab Group "Documentation" (Blue)
│  │  ├─ Tab: API Docs (tabId: 567)
│  │  └─ Tab: README (tabId: 568)
│  └─ Tab Group "Development" (Red)
│     └─ Tab: GitHub PR (tabId: 569)
└─ Tasks
   └─ "Fix auth bug" → references tabs 567, 569
```

**Saved Collection**:
```
Collection "Project X"
├─ windowId: null
├─ isActive: false
├─ Stored state (no browser window)
│  ├─ Folder "Documentation"
│  │  ├─ Tab: API Docs (url saved)
│  │  └─ Tab: README (url saved)
│  └─ Folder "Development"
│     └─ Tab: GitHub PR (url saved)
└─ Tasks
   └─ "Fix auth bug" → references tab IDs (not live)
```

### Operations

**Save Window as Collection**:
1. User has Window #2 open with 15 tabs in 3 tab groups
2. Clicks "Save Window as Collection"
3. System creates Collection linked to Window #2
4. `windowId: 2`, `isActive: true`
5. User can now close window → Collection becomes inactive (`isActive: false`)

**Restore Collection**:
1. User selects saved Collection "Project X" (`isActive: false`)
2. Clicks "Open"
3. System creates new browser window with all folders (as tab groups) and tabs
4. `windowId: <new>`, `isActive: true`
5. Collection is now active (bound to that window)

**Close Collection**:
1. User closes browser window for active Collection
2. System detects window close
3. Updates Collection: `windowId: null`, `isActive: false`
4. Collection state saved (all folders, tabs, tasks preserved)

**Work on Task**:
1. User selects task "Fix auth bug" in Collection "Project X"
2. Task references 3 tabs: API Docs, GitHub PR, Stack Overflow
3. If collection inactive: Opens collection (creates window with all tabs)
4. If collection active: Focuses tabs referenced by task
5. User works, adds comment, marks task fixed

### Task-Folder Relationship

**Question**: If a task references many tabs in a folder, is it the same as the folder?

**Answer**: No - they serve different purposes:

**Folder**: Topical organization
- "Documentation" folder has 10 tabs (all docs-related)
- User browses all docs, adds more docs over time
- Organizational container

**Task**: Work objective
- "Write API documentation" task references 3 tabs from "Documentation" folder
- User only needs those 3 tabs to complete the task
- Not all docs, just the ones relevant to this work
- Task also might reference 1 tab from "Development" folder (the code being documented)

**Example**:
```
Collection "Project X"
├─ Folder "Documentation" (10 tabs)
│  ├─ API Docs ⭐
│  ├─ Architecture Guide ⭐
│  ├─ User Guide
│  ├─ FAQ
│  └─ ... 6 more tabs
├─ Folder "Development" (8 tabs)
│  ├─ Main.js ⭐
│  └─ ... 7 more tabs
└─ Tasks
   └─ "Document authentication system" (references 3 tabs)
      ├─ API Docs (Documentation folder)
      ├─ Architecture Guide (Documentation folder)
      └─ Main.js (Development folder)
```

Task references 3 specific tabs across 2 folders - not the same as a folder.

---

## User Interface Architecture

### Discovery Flow (Improved)

**Problem from v1**: Side panel is primary interface but users won't discover it.

**Solution**: Use popup as discovery surface.

**New User Flow**:
1. User installs TabTaskTick (upgraded from TabMaster Pro)
2. Opens popup → sees existing TabMaster features + new "Collections" section
3. Popup shows: "💡 Try Collections: Save your open windows" banner
4. User clicks "Save Current Window" in popup
5. Collection created → Notification: "Saved Project X! Open Side Panel to manage it (Cmd+B)"
6. User opens side panel → sees Collections view with first collection
7. Banner: "💡 Add tasks to track your work in this collection"
8. Progressive discovery: Collections first, then tasks

**Popup as Gateway**:
- Shows banner prompting Collections usage
- Shows active tasks (after user creates first task)
- Shows recent collections (quick access)
- Links to side panel for full interface

### Primary Interface: Chrome Side Panel

**Collections View**:
```
COLLECTIONS                     [+ Save Window]

🔍 Search collections...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTIVE (2 collections)

📁 Project X (Window #2) 🟢
   15 tabs, 3 folders
   Tasks: 3 open, 1 active
   Last used: 2 min ago

   [Focus Window] [Close] [View Tasks]

📁 Learning React (Window #3) 🟢
   48 tabs, 4 folders
   Tasks: 2 open

   [Focus Window] [Close] [View Tasks]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAVED (8 collections)

📁 House Renovation
   23 tabs, 3 folders
   Tasks: 5 open
   Last used: 2 days ago

   [Open] [Edit] [Delete]

📁 Tax Prep 2024
   12 tabs, 2 folders
   No tasks
   Last used: 3 months ago

   [Open] [Archive]

... 6 more collections
```

**Key Features**:
- Active collections shown first (with window indicator 🟢)
- "Focus Window" button for active collections
- "Open" button for saved collections
- Task count per collection
- Last used timestamp

**Collection Detail View**:
```
📁 Project X (Window #2) 🟢

Description: Authentication system overhaul
Tags: work, backend, urgent
Created: 3 weeks ago • Last used: today

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASKS (4)

🔴 HIGH - Due Friday
☐ Fix auth bug (Active)
  References: 3 tabs
  → API Docs, GitHub PR #234, Stack Overflow
  2 comments • Created 3 days ago
  [Open Tabs] [Mark Fixed]

⚪ MEDIUM - Due Dec 20
☐ Write API documentation
  References: 2 tabs
  → API Docs, Architecture Guide
  [Open Tabs]

... 2 more tasks
[+ New Task]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FOLDERS (3)

📂 Documentation (Blue) • 5 tabs
  📄 API Docs ⭐ (referenced by 2 tasks)
  📄 Architecture Guide ⭐
  📄 User Guide
  ... 2 more tabs
  [Expand to edit]

📂 Development (Red) • 8 tabs
  📄 GitHub PR #234 ⭐ (referenced by 1 task)
  ... 7 more tabs

📂 Resources (Green) • 2 tabs
  ... [collapsed]

[Focus Window] [Close Window] [Edit]
```

**Key Features**:
- Tasks shown FIRST (what you're working on)
- Tab references shown per task with folder context
- ⭐ indicator when tab referenced by task
- Folders collapsible
- Quick actions: Open Tabs, Mark Fixed

**Task View**:
```
MY TASKS                        [+ New Task]

View: [All] [By Collection]
Sort: [Due Date ▼]
Filter: [Status ▼] [Priority ▼]

🔍 Search tasks...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UNCATEGORIZED (2 tasks)

🔴 CRITICAL - Due Today
☐ Buy groceries
  No collection
  [Mark Done]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROJECT X (3 tasks) 🟢 Active

🔴 HIGH - Due Friday
☐ Fix auth bug (Active)
  → 3 tabs: API Docs, PR #234, Stack Overflow
  [Open Tabs] [View Collection]

⚪ MEDIUM - Due Dec 20
☐ Write API docs
  → 2 tabs: API Docs, Architecture Guide
  [Open Tabs]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LEARNING REACT (2 tasks) 🟢 Active

⚪ MEDIUM - Due Dec 18
☐ Study hooks patterns
  → 5 tabs in Tutorials folder
  [Open Tabs]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Completed this week (5):
✓ Research OAuth patterns (Mon)
✓ Review PR #123 (Tue)
...

[Group by: Collection ▼]
```

**Key Features**:
- Uncategorized section (tasks without collection)
- Active collections marked with 🟢
- Tab references shown (count + first few)
- "Open Tabs" button (opens collection if needed, focuses tabs)
- "View Collection" link (navigates to collection detail)
- Completed section (reporting)

### Secondary Interface: Popup (Enhanced)

```
┌─────────────────────────────────┐
│ TabTaskTick                     │
├─────────────────────────────────┤
│ 💡 Try Collections (Side Panel) │
│    Save your windows → Cmd+B    │
├─────────────────────────────────┤
│ 💾 Save This Window             │
├─────────────────────────────────┤
│ My Active Tasks (3)             │
│   🔴 Fix auth bug               │
│      [Open] (in Project X)      │
│   ⚪ Write API docs             │
│      [Open]                     │
│                                 │
│ Active Collections (2)          │
│   📁 Project X 🟢 (Window #2)   │
│      [Focus] [Close]            │
│   📁 Learning React 🟢          │
│      [Focus]                    │
│                                 │
│ Recent Saved (3)                │
│   📁 House Renovation           │
│      [Open]                     │
│   📁 Tax Prep 2024              │
│                                 │
│ [Open Side Panel] (Cmd+B)       │
├─────────────────────────────────┤
│ TabMaster Features:             │
│ 🗂️  Group by Domain            │
│ 💤 Snooze Tabs                  │
│ 🗑️  Close Duplicates           │
└─────────────────────────────────┘
```

**Key Features**:
- Banner promoting Collections + Side Panel
- "Save This Window" prominent button
- Active tasks (3-5 max) with "Open" action
- Active collections with 🟢 indicator and window info
- Recent saved collections
- Link to open side panel
- Existing TabMaster features below

### Context Menus

**Tab Context Menu** (right-click on tab):
```
┌────────────────────────────────┐
│ Add to Collection              │
│   ↳ Project X (current)        │
│   ↳ Learning React             │
│   ↳ + New Collection           │
│                                │
│ Create Task for Tab            │
│                                │
│ Add Note to Tab                │
│                                │
│ ───────────────────────        │
│ [Existing TabMaster actions]   │
│ Snooze Tab                     │
│ Add to Rule                    │
└────────────────────────────────┘
```

**Page Context Menu** (right-click on page):
```
┌────────────────────────────────┐
│ Save Page to Collection        │
│   ↳ Project X                  │
│   ↳ Learning React             │
│   ↳ + New Collection           │
│                                │
│ Create Task for Page           │
│                                │
│ ───────────────────────        │
│ [Browser default actions]      │
└────────────────────────────────┘
```

**Toolbar Icon Context Menu** (right-click extension icon):
```
┌────────────────────────────────┐
│ Save Window as Collection      │
│ Open Side Panel (Cmd+B)        │
│                                │
│ ───────────────────────        │
│ Open Dashboard                 │
│ Options                        │
└────────────────────────────────┘
```

**Key Simplifications**:
- Removed "Set as Primary/Reference Tab" (removed feature)
- Removed "Add to Collection Note" (selection context menu)
- Cleaner, focused actions

### Dashboard Integration

**Collections Tab**:
- Grid/list view of all collections
- Filter by active/saved/archived
- Full editing (rename, reorganize folders, edit tabs)
- Bulk operations (archive, export)
- Advanced search/filtering

**Tasks Tab**:
- Kanban board (Open / Active / Fixed)
- Calendar view (by due date)
- Reporting (completed this week, time tracking)
- Bulk operations
- Advanced filtering (tags, collections, priorities)

---

## Interaction Flows (Revised)

### Flow 1: Save Current Window (Simplified)

1. User has Window #2 open with 15 tabs in 3 tab groups
2. **Option A**: Clicks popup → "Save This Window"
3. **Option B**: Right-clicks toolbar icon → "Save Window as Collection"
4. Modal appears:
   - Name: "Project X" (auto-suggested from tab content)
   - Icon: 📁 (emoji picker)
   - Tags: "work, backend" (optional)
   - Description: (optional)
5. Click "Save" → Collection created
   - `windowId: 2`, `isActive: true`
   - 3 folders created (from tab groups)
   - All tabs captured with notes field empty
6. Notification: "✓ Saved Project X (15 tabs, 3 folders). Open Side Panel (Cmd+B) to manage tasks."
7. User can continue working OR close window (collection becomes saved)

**Key Change**: Clarified that collection is immediately bound to window.

### Flow 2: Work on Task (Revised)

1. User opens side panel (Cmd+B)
2. Switches to "Tasks" view
3. Sees task "Fix auth bug" (High, Active, due Friday)
   - In collection "Project X" (currently saved, not active)
4. Clicks "Open Tabs"
5. System checks: Collection is saved (`isActive: false`)
6. System restores collection:
   - Creates new window with all 15 tabs
   - Recreates 3 tab groups
   - Updates collection: `windowId: <new>`, `isActive: true`
7. System focuses the 3 tabs referenced by task (API Docs, GitHub PR, Stack Overflow)
8. User works on task
9. User adds comment in side panel: "Found issue in line 47"
10. User clicks "Mark Fixed"
11. Task status updated, `completedAt` set
12. Task moves to "Completed this week" section

**Key Change**: Made it explicit that opening tabs on a saved collection restores the entire collection as a window.

### Flow 3: Create Task (Simplified)

1. User on GitHub PR page in active collection "Project X"
2. Right-clicks page → "Create Task for Page"
3. Modal appears:
   - Summary: "Review PR #234" (from page title)
   - Collection: "Project X" (auto-detected from current window)
   - Priority: Medium (default)
   - Due Date: [date picker]
   - Notes: (optional)
   - Referenced tabs: [checkbox list of tabs in collection]
     - ☑ GitHub PR #234 (current page, pre-selected)
     - ☐ API Docs
     - ☐ Local Dev Server
4. User checks additional tabs: API Docs
5. Click "Create"
6. Task created with `tabIds: [PR #234, API Docs]`
7. Task appears in side panel task list
8. Notification: "✓ Task created: Review PR #234"

**Key Change**: Made it clear task references multiple tabs (not just one).

### Flow 4: Close Collection

1. User has active collection "Project X" (Window #2, 15 tabs)
2. **Option A**: Closes browser window normally
3. **Option B**: In side panel, clicks "Close" on collection
4. System detects window close
5. Updates collection:
   - `windowId: null`
   - `isActive: false`
   - All folders, tabs, tasks preserved
6. Notification: "✓ Project X saved (15 tabs). Reopen anytime from Collections."
7. Collection appears in "SAVED" section of side panel

**Key Change**: Made window closing explicit and tied to collection state.

---

## Technical Architecture (Updated)

### Storage Layer

**IndexedDB** (new TabTaskTick data):
```javascript
// Database: 'TabTaskTickDB', version: 1

// Object Store: 'collections'
{
  keyPath: 'id',
  indexes: {
    'isActive': { unique: false },
    'tags': { unique: false, multiEntry: true },
    'lastAccessed': { unique: false }
  }
}
// Stores: Collection objects with windowId, isActive, folders, tabs

// Object Store: 'tasks'
{
  keyPath: 'id',
  indexes: {
    'collectionId': { unique: false },
    'status': { unique: false },
    'priority': { unique: false },
    'dueDate': { unique: false },
    'tags': { unique: false, multiEntry: true },
    'createdAt': { unique: false }
  }
}
// Stores: Task objects with collectionId, tabIds array, comments
```

**chrome.storage.local** (existing TabMaster data):
```javascript
chrome.storage.local = {
  // Existing TabMaster data (unchanged)
  rules: Rule[],
  settings: Settings,
  snoozedTabs: SnoozedTab[],
  windowMetadata: WindowMetadata[]
}
```

**Why IndexedDB?**
- ✅ Scalable storage (50MB+, vs 10MB limit)
- ✅ Efficient querying (indexed lookups, no full scans)
- ✅ Relational data (designed for collections → tasks → tabs)
- ✅ Better performance with hundreds of collections/tasks
- ✅ Transactional updates (atomic operations)

**Example Query Efficiency**:
```javascript
// chrome.storage.local (TabMaster legacy approach)
// Must load ALL tasks into memory, then filter in JavaScript
const { tasks } = await chrome.storage.local.get(['tasks']);
const activeTasks = tasks.filter(t => t.status === 'open' && t.collectionId === 'col_123');
// ❌ Loads 1000s of tasks into memory for every query

// IndexedDB (TabTaskTick approach)
// Direct indexed query - only loads matching tasks
const activeTasks = await TaskStorage.getTasksByCollectionAndStatus('col_123', 'open');
// ✅ Uses compound index (collectionId + status) - instant lookup
```

**Hybrid Approach**:
- IndexedDB for TabTaskTick (new collections/tasks data) - benefits from indexing
- chrome.storage.local for TabMaster (existing rules, settings, snooze) - simple key-value works fine
- No migration needed for existing users - both systems coexist

### Service Architecture

**Selection Services**:
- `selectCollections(filters)` - Query collections via IndexedDB indexes
  - Filter by: active/saved (isActive index), tags (tags index), name
  - Sort by: lastAccessed (lastAccessed index), created
  - Uses IndexedDB cursors for efficient filtering
- `selectTasks(filters)` - Query tasks via IndexedDB indexes
  - Filter by: status (status index), priority (priority index), tags (tags index), dueDate (dueDate index), collectionId (collectionId index)
  - Sort by: dueDate, priority, created
  - Compound queries use multiple indexes

**Storage Services**:
- `CollectionStorage` - IndexedDB operations for collections
  - `getCollection(id)` - Get by primary key
  - `getAllCollections()` - Get all collections
  - `getActiveCollections()` - Use isActive index
  - `getCollectionsByTag(tag)` - Use tags index
  - `saveCollection(collection)` - Put operation
  - `deleteCollection(id)` - Delete operation
  - Handles transactions for atomic updates

- `TaskStorage` - IndexedDB operations for tasks
  - `getTask(id)` - Get by primary key
  - `getAllTasks()` - Get all tasks
  - `getTasksByCollection(collectionId)` - Use collectionId index
  - `getTasksByStatus(status)` - Use status index
  - `saveTask(task)` - Put operation
  - `deleteTask(id)` - Delete operation
  - Handles transactions for atomic updates

**Execution Services**:
- `CollectionService` - CRUD + window binding
  - `createCollection(collection)` - Create with optional windowId → CollectionStorage.saveCollection()
  - `updateCollection(id, updates)` → CollectionStorage.saveCollection()
  - `deleteCollection(id)` → CollectionStorage.deleteCollection()
  - `activateCollection(id)` - Create window from saved collection
  - `deactivateCollection(id)` - Close window, preserve state
  - `bindToWindow(collectionId, windowId)` - Link collection to window
  - `unbindFromWindow(collectionId)` - Unlink on window close

- `FolderService` - Manage folders (nested in collections)
  - `addFolder(collectionId, folder)` - Updates collection in IndexedDB
  - `updateFolder(collectionId, folderId, updates)` - Updates collection
  - `deleteFolder(collectionId, folderId)` - Updates collection

- `TabService` - Manage tabs (nested in folders)
  - `addTab(collectionId, folderId, tab)` - Updates collection in IndexedDB
  - `updateTab(collectionId, folderId, tabId, updates)` - Updates collection
  - `deleteTab(collectionId, folderId, tabId)` - Updates collection

- `TaskService` - Task lifecycle
  - `createTask(task)` - With collectionId and tabIds → TaskStorage.saveTask()
  - `updateTask(id, updates)` → TaskStorage.saveTask()
  - `updateTaskStatus(id, status)` - Sets completedAt → TaskStorage.saveTask()
  - `addComment(taskId, comment)` - Updates task in IndexedDB
  - `linkTabsToTask(taskId, tabIds)` - Updates task in IndexedDB

**Orchestration Services**:
- `CaptureWindowService` - Save window as collection
  - `captureWindow(windowId, metadata)` - Creates collection bound to window
  - Captures tab groups as folders
  - Sets `windowId` and `isActive: true`

- `RestoreCollectionService` - Open saved collection as window
  - `restoreCollection(collectionId, options)` - Creates window with all tabs
  - Recreates tab groups
  - Updates `windowId` and `isActive: true`

- `TaskExecutionService` - Open tabs for task
  - `openTaskTabs(taskId)` - Opens collection if needed, focuses task tabs
  - If collection saved: calls `restoreCollection()`
  - If collection active: focuses tabs via `chrome.tabs.update()`

**New Service**: `WindowTrackingService`
- Listens to `chrome.windows.onRemoved`
- When window closes, finds collection with that `windowId`
- Updates collection: `windowId: null`, `isActive: false`

### Message Passing

```javascript
// Side Panel → Background
chrome.runtime.sendMessage({
  action: 'activateCollection',
  collectionId: 'col_123'
});

// Background → Service
const RestoreCollectionService = await import('./services/RestoreCollectionService.js');
const result = await RestoreCollectionService.restoreCollection('col_123');

// Background → Side Panel
sendResponse({
  success: true,
  windowId: result.windowId,
  collection: result.collection
});
```

### Window Lifecycle Management

**On Window Open** (user opens collection):
1. User clicks "Open" on saved collection
2. `RestoreCollectionService.restoreCollection(id)`
3. Creates new window: `chrome.windows.create()`
4. Creates tabs with folders as tab groups
5. Updates collection: `windowId: <new>`, `isActive: true`
6. Returns windowId to UI

**On Window Close** (user closes window):
1. User closes browser window
2. `chrome.windows.onRemoved` event fires
3. `WindowTrackingService` receives event
4. Finds collection with matching `windowId`
5. Updates collection: `windowId: null`, `isActive: false`
6. Notifies user: "Collection saved"

**Edge Case**: User closes tab in active collection
- Tab removed from Chrome
- Collection's folder still has tab metadata
- Tab's `tabId` set to null
- Next time collection restored, tab reopens

---

## Implementation Plan (Revised)

### Phase 1: Foundation (10-12h)

**IndexedDB Setup**:
- Database schema definition (TabTaskTickDB v1)
- Object stores: collections, tasks
- Indexes: isActive, tags, lastAccessed, collectionId, status, priority, dueDate
- Migration utilities (future-proof for schema changes)
- Database initialization service

**Data Models**:
- Collection with `windowId` and `isActive`
- Folder (no changes)
- Tab (removed `type` field)
- Task (removed `parentTaskId`, changed `tabId` to `tabIds`)
- Comment (no changes)

**Storage Services** (IndexedDB wrappers):
- `db.js` - IndexedDB connection and initialization
- `CollectionStorage.js` - CRUD operations for collections
  - Uses isActive, tags, lastAccessed indexes
  - Transaction handling for atomic updates
- `TaskStorage.js` - CRUD operations for tasks
  - Uses collectionId, status, priority, dueDate, tags indexes
  - Transaction handling for atomic updates

**Unit Tests** (50+ tests):
- IndexedDB initialization and schema
- Collection storage (CRUD, indexes, window binding)
- Task storage (CRUD, indexes, multi-tab references)
- Transaction rollback on errors
- Index query performance

**Deliverables**:
- `/docs/tabtasktick-data-models-v2.md`
- `/services/storage/db.js`
- `/services/storage/CollectionStorage.js`
- `/services/storage/TaskStorage.js`
- `/tests/db.test.js`
- `/tests/CollectionStorage.test.js`
- `/tests/TaskStorage.test.js`

### Phase 2: Core Services (12-16h)

**Services**:
- `CollectionService` with window operations
  - Wraps CollectionStorage with business logic
  - `activateCollection()`, `deactivateCollection()`
  - `bindToWindow()`, `unbindFromWindow()`
  - Delegates to IndexedDB via CollectionStorage

- `FolderService` (nested operations)
  - Loads collection from IndexedDB
  - Modifies folders array
  - Saves back to IndexedDB via CollectionStorage

- `TabService` (nested operations)
  - Loads collection from IndexedDB
  - Modifies tabs within folders
  - Saves back to IndexedDB via CollectionStorage

- `TaskService` (with tabIds array support)
  - Wraps TaskStorage with business logic
  - Comment management (nested in task)
  - Status transitions with completedAt timestamps
  - Delegates to IndexedDB via TaskStorage

- `selectCollections` (IndexedDB queries)
  - Uses isActive index for active/saved filtering
  - Uses tags index for tag-based queries
  - Uses lastAccessed index for sorting
  - Efficient cursor-based filtering

- `selectTasks` (IndexedDB queries)
  - Uses collectionId index for collection-specific queries
  - Uses status, priority, dueDate indexes for filtering
  - Compound queries combining multiple indexes

**Window Tracking**:
- WindowTrackingService
- Listen to `chrome.windows.onRemoved`
- Update collection in IndexedDB on window close

**Background Handlers**:
- Message routing to services
- Error handling

**Unit Tests** (60+ tests):
- Service operations (with IndexedDB mocks)
- Window binding/unbinding
- Window close detection
- Nested folder/tab updates
- Task status transitions

**Deliverables**:
- `/services/execution/CollectionService.js`
- `/services/execution/FolderService.js`
- `/services/execution/TabService.js`
- `/services/execution/TaskService.js`
- `/services/execution/WindowTrackingService.js`
- `/services/selection/selectCollections.js`
- `/services/selection/selectTasks.js`
- Unit tests

### Phase 3: Side Panel UI (14-16h)

**Collections View**:
- Active/Saved section split
- 🟢 indicator for active collections
- "Focus Window" / "Open" buttons
- Collection detail view with tasks first
- Folder collapse/expand

**Task View**:
- Uncategorized section
- By Collection grouping
- 🟢 indicator for active collections
- "Open Tabs" button (smart: restores collection if needed)
- Completed section

**Tab Switcher**:
- Toggle between Collections and Tasks views
- Persistent state

**Search/Filter**:
- Search collections by name/tags
- Search tasks by summary/tags
- Filter tasks by status/priority/collection

**Deliverables**:
- `/sidepanel/panel.html`
- `/sidepanel/panel.css`
- `/sidepanel/panel.js`
- `/sidepanel/collections-view.js`
- `/sidepanel/task-view.js`
- `/sidepanel/collection-detail.js`

### Phase 4: Popup Enhancement (6-8h)

**New Features**:
- "💡 Try Collections" banner (dismissible)
- "Save This Window" button
- Active Tasks section (3-5 max)
- Active Collections section (with 🟢 and window info)
- Recent Saved Collections (3-5 max)
- "Open Side Panel" button

**Integration**:
- Message passing to background
- State sync with side panel
- Existing TabMaster features preserved

**Deliverables**:
- `/popup/popup.html` (enhanced)
- `/popup/popup.css` (enhanced)
- `/popup/popup.js` (enhanced)

### Phase 5: Context Menus (4-6h)

**Tab Context Menu**:
- Add to Collection
- Create Task for Tab
- Add Note to Tab

**Page Context Menu**:
- Save Page to Collection
- Create Task for Page

**Toolbar Context Menu**:
- Save Window as Collection
- Open Side Panel

**Deliverables**:
- Context menu handlers in background
- Modal components for quick actions

### Phase 6: Operations (10-12h)

**CaptureWindowService**:
- Save window as collection (with window binding)
- Capture tab groups as folders
- Set `windowId` and `isActive`

**RestoreCollectionService**:
- Restore saved collection as window
- Recreate tab groups
- Update window binding

**TaskExecutionService**:
- Open tabs referenced by task
- Smart: restore collection if saved
- Focus tabs if collection active

**WindowTrackingService**:
- Monitor window close events
- Update collection state
- Show notifications

**Integration Tests**:
- Full workflows (save → close → restore)
- Task execution (open tabs)
- Window tracking

**Deliverables**:
- `/services/execution/CaptureWindowService.js`
- `/services/execution/RestoreCollectionService.js`
- `/services/execution/TaskExecutionService.js`
- `/services/execution/WindowTrackingService.js`
- Integration tests

### Phase 7: Dashboard Integration (12-14h)

**Collections Tab**:
- Grid/list view
- Full editing (folders, tabs, metadata)
- Bulk operations
- Advanced search/filtering

**Tasks Tab**:
- Kanban board view
- Calendar view
- Reporting (completed this week)
- Bulk operations

**Deliverables**:
- `/dashboard/modules/views/collections.js`
- `/dashboard/modules/views/tasks.js`
- `/dashboard/modules/collection-editor.js`
- `/dashboard/modules/task-detail.js`

---

**Total Timeline: 68-84 hours for MVP**

**Phasing**:
- Sprint 1-2: Phase 1-2 (Foundation + Services) - 22-28h
  - Phase 1: IndexedDB setup and storage layer (10-12h)
  - Phase 2: Core services and window tracking (12-16h)
- Sprint 3-4: Phase 3 (Side Panel) - 14-16h
- Sprint 5: Phase 4 (Popup) - 6-8h
- Sprint 6: Phase 5 (Context Menus) - 4-6h
- Sprint 7-8: Phase 6 (Operations) - 10-12h
- Sprint 9-10: Phase 7 (Dashboard) - 12-14h

---

## Success Metrics

### Stage 2: Collections (v1.3.0 Launch)

**Adoption**:
- 70% of users save at least 1 window as collection in first week
- Average 3 active collections + 5 saved collections after 1 month
- Collections opened/closed 5+ times per day

**Behavior Change**:
- Average open windows reduced from 5 → 2 (60% reduction)
- Average tabs per window reduced from 40 → 15
- Users confidently close windows (know they can restore)

**Window Binding**:
- 95% success rate on window close → collection save
- 95% success rate on collection restore → window creation
- Average restore time < 3 seconds for 20-tab collection

### Stage 3: Tasks (v1.3.0 Launch + 1 month)

**Task Adoption**:
- 50% of users create at least 1 task in first week
- Average 8 active tasks per user
- 80% of tasks linked to collections
- 60% of tasks reference 2+ tabs

**Workflow**:
- "Open Tabs" action used 10+ times per day
- Tasks marked "Fixed" within 3 days on average
- Users complete 10-15 tasks per week

**Integration**:
- 90% of active collections have at least 1 task
- Comments added to 20% of tasks
- Task tags used for clustering (project-x, bug, feature)

**Retention**:
- 7-day retention: 80%
- 30-day retention: 60%
- Daily active users: 40% of installed base

---

## Competitive Differentiation

**vs Tab Managers** (OneTab, Session Buddy):
- ✅ Collections are window-bounded (not abstract)
- ✅ Tasks integrated with specific tabs
- ✅ Window lifecycle managed automatically

**vs Workspaces** (Workona, Tab Stash):
- ✅ Tasks live in collections (work context)
- ✅ Clear active/saved state (window binding)
- ✅ Proven TabMaster foundation (13 services, 457 tests)

**vs Task Managers** (Todoist, Things):
- ✅ Browser-integrated (no context switching)
- ✅ Tasks open tabs automatically
- ✅ Tasks reference multiple tabs (rich context)

**vs Arc Browser**:
- ✅ No browser lock-in (Chrome extension)
- ✅ Tasks integrated at tab level
- ✅ Explicit window binding (no confusion)

---

## Key Simplifications from v1

### Mental Model

**v1 Problem**: Collections described as both "window containers" AND "organizational only"
**v2 Solution**: Collections ARE windows (can be active or saved)

### Task Relationships

**v1 Problem**: Tasks could reference tabs from multiple collections (cross-collection work)
**v2 Solution**: Tasks belong to ONE collection, reference multiple tabs within that collection

### Subtasks

**v1 Problem**: Recursive subtasks in data model but no clear UI pattern
**v2 Solution**: Removed subtasks from MVP (flat task list)

### Tab Types

**v1 Problem**: Primary vs Reference distinction unclear
**v2 Solution**: Removed tab types (all tabs equal, just have notes)

### Discovery

**v1 Problem**: Side panel is primary but users won't find it
**v2 Solution**: Popup promotes Collections with banner, guides to side panel

### Storage

**v1 Problem**: chrome.storage.local (10MB limit, no indexes, awkward for relational data)
**v2 Solution**: IndexedDB for TabTaskTick data (scalable, indexed, efficient queries), keep chrome.storage for TabMaster legacy data

---

## Risks & Mitigations (Updated)

### Technical Risks

**Risk 1: Window Tracking Reliability**
- What if window close event missed?
- **Mitigation**: Periodic sync (every 5min) checks windowId validity
- If window gone but `isActive: true`, update to `false`

**Risk 2: Window ID Collisions**
- What if user manually creates window with same ID?
- **Mitigation**: Chrome window IDs are unique and sequential
- Very unlikely collision, but validate on binding

**Risk 3: Tab Group Recreation**
- What if tab groups don't recreate correctly?
- **Mitigation**: Store full tab group state (color, collapsed, position)
- Test thoroughly with edge cases (empty groups, pinned tabs)

### UX Risks (Reduced from v1)

**Risk 1: Users don't understand window binding**
- **Mitigation**: Clear visual indicators (🟢 for active)
- Notifications on window close: "Collection saved"
- Help text in empty state

**Risk 2: Users create too many collections**
- **Mitigation**: Archive feature (move old collections out of main view)
- Search/filter essential from day 1
- "Last used" timestamps guide cleanup

**Risk 3: Task-Folder confusion**
- **Mitigation**: Clear UI distinction (folders in Collections view, tasks in Tasks view)
- Help text: "Folders organize tabs by topic, tasks organize work by objective"

---

## Appendix: Example Data

### Active Collection

```json
{
  "id": "col_123",
  "name": "Project X",
  "tags": ["work", "backend", "urgent"],
  "windowId": 1234,
  "isActive": true,
  "folders": [
    {
      "id": "folder_1",
      "name": "Documentation",
      "color": "blue",
      "collapsed": false,
      "position": 0,
      "tabs": [
        {
          "id": "tab_1",
          "url": "https://oauth.net/2/",
          "title": "OAuth 2.0 Spec",
          "note": "Main spec - Section 4.1 for auth code flow",
          "position": 0,
          "tabId": 567
        }
      ]
    }
  ],
  "metadata": {
    "createdAt": 1702000000000,
    "lastAccessed": 1702345600000
  }
}
```

### Task with Multiple Tab References

```json
{
  "id": "task_1",
  "summary": "Fix authentication token expiry bug",
  "notes": "Users logged out after 5min. Extend token refresh window to 10min.",
  "status": "active",
  "priority": "high",
  "dueDate": 1702432000000,
  "tags": ["project-x", "bug", "backend"],
  "collectionId": "col_123",
  "tabIds": ["tab_1", "tab_3", "tab_5"],
  "comments": [
    {
      "id": "comment_1",
      "text": "Narrowed down to token refresh logic in auth service",
      "createdAt": 1702300000000
    }
  ],
  "createdAt": 1702250000000
}
```

---

## Conclusion

TabTaskTick v2 simplifies the mental model while preserving the core innovation: tasks know which tabs you need, and collections persist browser windows with full context.

**Key Improvements from v1**:
- ✅ Collections are window-bounded (clear 1:1 relationship)
- ✅ Tasks belong to one collection (simpler relationships)
- ✅ Tasks reference multiple tabs (richer context)
- ✅ Removed subtasks (flat task list)
- ✅ Removed tab types (reduced cognitive load)
- ✅ Improved discovery (popup → side panel flow)
- ✅ IndexedDB storage (scalable, efficient, indexed queries)

**Timeline**: 68-84 hours for MVP, 10 sprints, targeting v1.3.0 release.

**Status**: Ready for implementation.

---

**Prepared by**: TabMaster Pro Development Team
**Date**: December 2024
**Version**: 2.0
**Status**: Proposal - Ready for Implementation
