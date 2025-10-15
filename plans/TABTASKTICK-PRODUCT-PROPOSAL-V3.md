# TabTaskTick: Product Proposal v3.0

**Evolution from Tab Hygiene to Work Management**

---

## Executive Summary

TabTaskTick represents the evolution of TabMaster Pro from a tab hygiene tool into a comprehensive knowledge organization and work management system for browser-based work.

**Three-Stage Evolution**:
1. **Stage 1 - Hygiene** (Complete): Rules engine, deduplication, tab grouping, snoozing
2. **Stage 2 - Knowledge Org** (Proposed): Collections as persistent windows with folders
3. **Stage 3 - Work Management** (Proposed): Tasks within collections referencing specific tabs

**Core Innovation**: Collections ARE windows that can be saved/restored with full context. Tasks live within collections and reference specific tabs, providing work context for organized knowledge.

**Key Simplifications from v1/v2**:
- ✅ Collections are window-bounded (not abstract containers)
- ✅ Tasks belong to one collection (0..1 relationship)
- ✅ Tasks reference multiple tabs (0..n relationship)
- ✅ Removed subtasks from MVP (flat task list)
- ✅ Removed tab types (Primary/Reference)
- ✅ Simplified discovery flow (popup → side panel)
- ✅ **NEW v3**: Normalized data model (avoids race conditions)
- ✅ **NEW v3**: Storage utilities pattern (consistent with TabMaster)
- ✅ **NEW v3**: Extends WindowService (no duplicate window tracking)

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

## Data Model (Normalized - v3)

**V3 Architecture Change**: Normalized relational model instead of nested documents. Collections, folders, tabs, and tasks are stored as separate entities with foreign key relationships. This avoids race conditions on concurrent updates and enables efficient partial updates.

### Collection (Window)

```javascript
interface Collection {
  id: string;  // Primary key
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  tags: string[];

  // Window binding (when active)
  windowId?: number;  // Chrome window ID if currently open
  isActive: boolean;  // Is there a window for this collection?

  metadata: {
    createdAt: number;
    lastAccessed: number;
  };
}
```

**Key Changes**:
- Added `windowId` and `isActive` to track window binding
- **V3**: Removed nested `folders` array - folders stored separately with collectionId FK

**Storage**: IndexedDB object store `collections`, indexed by isActive, tags, lastAccessed

---

### Folder (Tab Group)

```javascript
interface Folder {
  id: string;          // Primary key
  collectionId: string;  // Foreign key → Collection
  name: string;
  color: string;        // Chrome TabGroup color
  collapsed: boolean;
  position: number;
}
```

**Key Changes**:
- **V3**: Added `collectionId` foreign key
- **V3**: Removed nested `tabs` array - tabs stored separately with folderId FK

**Storage**: IndexedDB object store `folders`, indexed by collectionId

---

### Tab (Resource)

```javascript
interface Tab {
  id: string;        // Primary key
  folderId: string;  // Foreign key → Folder
  url: string;
  title: string;
  favicon?: string;

  dupeKeyHash: string;  // Hash of normalized URL for dedup/context queries

  note?: string;      // Max 255 chars
  lastAccess?: number;

  position: number;
  isPinned?: boolean;

  // Runtime state (when collection is active)
  tabId?: number;     // Chrome tab ID if open
}
```

**Key Changes**:
- Removed `type` field (Primary/Reference) - too much cognitive load for unclear benefit
- **V3**: Added `folderId` foreign key
- **V3**: Added `dupeKeyHash` for efficient duplicate detection and context queries

**Storage**: IndexedDB object store `tabs`, indexed by folderId and dupeKeyHash

**Duplicate Detection Strategy**: Instead of a separate Resource entity (5th object store), we store a hash of the normalized URL directly on each Tab. This enables:
- O(1) duplicate detection via `dupeKeyHash` index
- "Also appears in" context queries (find all tabs with same hash)
- Minimal storage overhead (~16 bytes per tab for SHA-256 truncated hash)
- Reuses existing `normalizeUrlForDuplicates()` from TabMaster
- Hash collisions negligible (64-bit hash = ~1 in 10^19)

---

### Task (Work Item)

```javascript
interface Task {
  id: string;          // Primary key
  collectionId?: string;  // Foreign key → Collection (optional, 0..1)
  summary: string;
  notes?: string;

  // State
  status: 'open' | 'active' | 'fixed' | 'abandoned';
  priority: 'low' | 'medium' | 'high' | 'critical';
  dueDate?: number;
  tags: string[];

  // Tab References
  tabIds: string[];       // Array of Tab IDs (0..n)

  // Discussion (embedded)
  comments: Comment[];    // Embedded, not separate store

  // Tracking
  createdAt: number;
  completedAt?: number;
}
```

**Key Changes**:
- Removed `parentTaskId` (no subtasks in MVP)
- Changed `tabId` to `tabIds` array (task can reference multiple tabs)
- Task belongs to ONE collection only
- **V3**: collectionId is a foreign key (not a nested relationship)

**Storage**: IndexedDB object store `tasks`, indexed by collectionId, status, priority, dueDate, tags, createdAt

---

### Comment (Embedded in Tasks)

```javascript
interface Comment {
  id: string;
  text: string;
  createdAt: number;
}
```

**Storage**: Embedded in Task objects (not a separate object store)

---

### Relationships (Normalized Model)

**V3 Foreign Key Structure**:
```
Collection (1) ←─── Folder (0..n)      [via collectionId FK]
  Folder (1) ←─── Tab (0..n)           [via folderId FK]
Collection (1) ←─── Task (0..n)        [via collectionId FK]

Task (1) → Collection (0..1)           [via collectionId FK]
Task (1) → Tab (0..n)                  [via tabIds array]
Task (1) → Comment (0..n)              [embedded, not FK]
```

**Key Points**:
- Folders reference their parent collection (collectionId)
- Tabs reference their parent folder (folderId)
- Tasks reference their collection (collectionId, optional)
- Tasks reference tabs via ID array (not FK, can reference tabs from their collection)
- Comments are embedded in tasks (no separate storage)

**Cascade Delete Rules**:
- Deleting collection → cascades to folders → cascades to tabs
- Deleting collection → also deletes tasks with that collectionId
- Deleting folder → cascades to tabs in that folder
- Deleting tab → removes tab ID from any task.tabIds arrays

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

## Technical Architecture (v3 - Normalized Model)

### Storage Layer

**IndexedDB** (new TabTaskTick data - Normalized):
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
// Stores: Collection metadata (windowId, isActive, name, etc.)
// Does NOT store nested folders/tabs

// Object Store: 'folders'
{
  keyPath: 'id',
  indexes: {
    'collectionId': { unique: false }  // FK to collections
  }
}
// Stores: Folder metadata with collectionId foreign key

// Object Store: 'tabs'
{
  keyPath: 'id',
  indexes: {
    'folderId': { unique: false },     // FK to folders
    'dupeKeyHash': { unique: false }   // For dedup and context queries
  }
}
// Stores: Tab metadata with folderId FK and dupeKeyHash for efficient duplicate detection

// Object Store: 'tasks'
{
  keyPath: 'id',
  indexes: {
    'collectionId': { unique: false },  // FK to collections
    'status': { unique: false },
    'priority': { unique: false },
    'dueDate': { unique: false },
    'tags': { unique: false, multiEntry: true },
    'createdAt': { unique: false }
  }
}
// Stores: Task objects with collectionId FK, tabIds array, embedded comments
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

**Example Query Efficiency (Normalized Model)**:
```javascript
// chrome.storage.local (TabMaster legacy approach)
// Must load ALL tasks into memory, then filter in JavaScript
const { tasks } = await chrome.storage.local.get(['tasks']);
const activeTasks = tasks.filter(t => t.status === 'open' && t.collectionId === 'col_123');
// ❌ Loads 1000s of tasks into memory for every query

// IndexedDB normalized approach (TabTaskTick v3)
// Direct indexed query - only loads matching tasks
const activeTasks = await getTasksByCollection('col_123');
// ✅ Uses collectionId index - returns only related tasks
// Further filtering in-memory on already small dataset
```

**Normalized Model Benefits**:
```javascript
// Update single tab without loading entire collection
await updateTab(tabId, { note: "Important fix needed here" });
// ✅ Loads 1 tab, updates 1 tab, saves 1 tab

// vs Nested approach (v2)
const collection = await getCollection(collectionId);  // Load entire hierarchy
const folder = collection.folders.find(f => ...);
const tab = folder.tabs.find(t => t.id === tabId);
tab.note = "Important fix needed here";
await saveCollection(collection);  // Save entire hierarchy
// ❌ Loads/saves 50+ tabs to update 1 tab
```

**Hybrid Approach**:
- IndexedDB for TabTaskTick (new collections/folders/tabs/tasks data) - benefits from normalization and indexing
- chrome.storage.local for TabMaster (existing rules, settings, snooze) - simple key-value works fine
- No migration needed for existing users - both systems coexist

### Service Architecture (v3 - Normalized)

**Utility Layer** (IndexedDB Access):
- `/services/utils/db.js` - Database connection and transaction helpers
  - `getDB()` - Singleton connection to TabTaskTickDB
  - `withTransaction(stores, mode, fn)` - Transaction wrapper with rollback
  - NOT a service layer - just utilities for consistent DB access

- `/services/utils/storage-queries.js` - CRUD query helpers
  - `getCollection(id)`, `saveCollection()`, `deleteCollection()` (cascade to folders/tabs)
  - `getFolder(id)`, `getFoldersByCollection()`, `saveFolder()`, `deleteFolder()` (cascade to tabs)
  - `getTab(id)`, `getTabsByFolder()`, `saveTab()`, `deleteTab()`
  - `getTask(id)`, `getTasksByCollection()`, `saveTask()`, `deleteTask()`
  - Simple CRUD operations with foreign key support
  - Called ONLY by execution services (enforced by architecture)

**Selection Services**:
- `selectCollections(filters)` - Query collections via IndexedDB indexes
  - Filter by: active/saved (isActive index), tags (tags index), name
  - Sort by: lastAccessed (lastAccessed index), created
  - Delegates to storage utilities for data access

- `selectTasks(filters)` - Query tasks via IndexedDB indexes
  - Filter by: status, priority, tags, dueDate, collectionId
  - Sort by: dueDate, priority, created
  - Delegates to storage utilities for data access

**Execution Services**:
- `CollectionService` - CRUD + window binding
  - Business logic for collections
  - Uses storage utilities internally
  - `createCollection()`, `updateCollection()`, `deleteCollection()`
  - `bindToWindow()`, `unbindFromWindow()` - window binding logic

- `FolderService` - Manage folders (normalized model)
  - `createFolder(collectionId, params)` - Creates folder with FK
  - `updateFolder(folderId, updates)` - Direct update via storage utility
  - `deleteFolder(folderId)` - Cascades to tabs
  - Uses storage utilities for CRUD

- `TabService` - Manage tabs (normalized model)
  - `createTab(folderId, params)` - Creates tab with FK
  - `updateTab(tabId, updates)` - Direct update (no loading entire collection!)
  - `deleteTab(tabId)` - Direct delete
  - Uses storage utilities for CRUD

- `TaskService` - Task lifecycle
  - `createTask()`, `updateTask()`, `updateTaskStatus()`
  - `addComment()`, `linkTabsToTask()`
  - Uses storage utilities for CRUD

- **WindowService** (EXISTING - Extended)
  - **v3**: Add collection binding methods to existing service
  - `bindCollectionToWindow(collectionId, windowId)` - New method
  - `unbindCollectionFromWindow(collectionId)` - New method
  - Extends existing `chrome.windows.onRemoved` listener
  - No new service - reuses existing window management infrastructure

**Orchestration Services**:
- `CaptureWindowService` - Save window as collection
  - Captures window state, creates collection + folders + tabs
  - Uses CollectionService, FolderService, TabService

- `RestoreCollectionService` - Open saved collection as window
  - Restores window with all folders and tabs
  - Reuses ExportImportService window creation logic

- `TaskExecutionService` - Open tabs for task
  - Smart: restores collection if saved, focuses tabs if active
  - Coordinates RestoreCollectionService and chrome.tabs API

### Message Passing

```javascript
// Side Panel → Background
chrome.runtime.sendMessage({
  action: 'activateCollection',
  collectionId: 'col_123'
});

// Background → Service (static import at top of background.js)
import * as RestoreCollectionService from './services/execution/RestoreCollectionService.js';

// In message handler
const result = await RestoreCollectionService.restoreCollection('col_123');

// Background → Side Panel
sendResponse({
  success: true,
  windowId: result.windowId,
  collection: result.collection
});
```

**Important**: All imports must be static (at the top of files). Dynamic imports will crash Chrome.

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

## Implementation Plan (v3 - Normalized Model)

### Phase 1: Foundation (10-12h)

**IndexedDB Setup (Normalized Schema)**:
- Database schema definition (TabTaskTickDB v1)
- **4 Object Stores** (normalized):
  - `collections` (keyPath: id, indexes: isActive, tags, lastAccessed)
  - `folders` (keyPath: id, indexes: collectionId FK)
  - `tabs` (keyPath: id, indexes: folderId FK)
  - `tasks` (keyPath: id, indexes: collectionId, status, priority, dueDate, tags, createdAt)
- Migration utilities (future-proof for schema changes)
- Database initialization with all 4 stores

**Data Models (Normalized)**:
- Collection with `windowId` and `isActive` (no nested folders)
- Folder with `collectionId` FK (no nested tabs)
- Tab with `folderId` FK, removed `type` field
- Task with `collectionId` FK, `tabIds` array (no `parentTaskId`)
- Comment (embedded in tasks, not separate store)

**Storage Utilities** (NOT services):
- `/services/utils/db.js` - Connection + transaction helpers
  - `getDB()` - Singleton connection
  - `withTransaction(stores, mode, fn)` - Transaction wrapper
- `/services/utils/storage-queries.js` - CRUD helpers
  - Collection CRUD (with cascade delete to folders/tabs)
  - Folder CRUD (with cascade delete to tabs)
  - Tab CRUD (calculates `dupeKeyHash` on create/update)
  - Task CRUD
  - All use `withTransaction()` for atomic operations
  - `getTabsByDupeKey(hash)` - Find all tab instances of same page

**Unit Tests** (60+ tests):
- IndexedDB initialization with 4 stores
- Storage utilities (CRUD for all entities)
- Foreign key relationships (collectionId, folderId)
- Cascade deletes (collection → folders → tabs)
- Transaction rollback on errors
- Index query performance

**Deliverables**:
- `/docs/tabtasktick-data-models-v3.md` (normalized model with FKs)
- `/services/utils/db.js` (~200 lines)
- `/services/utils/storage-queries.js` (~300 lines)
- `/tests/db.test.js` (~20 tests)
- `/tests/storage-queries.test.js` (~40 tests)

### Phase 2: Core Services (12-16h)

**Services**:
- `CollectionService` with window operations
  - Business logic for collections
  - Uses storage utilities (not direct IndexedDB)
  - `createCollection()`, `updateCollection()`, `deleteCollection()`
  - `bindToWindow()`, `unbindFromWindow()`

- `FolderService` (normalized model)
  - `createFolder(collectionId, params)` - Creates with FK
  - `updateFolder(folderId, updates)` - Direct update via utility
  - `deleteFolder(folderId)` - Cascades to tabs
  - Uses storage utilities for all CRUD

- `TabService` (normalized model)
  - `createTab(folderId, params)` - Creates with FK
  - `updateTab(tabId, updates)` - Direct update (efficient!)
  - `deleteTab(tabId)` - Direct delete
  - Uses storage utilities for all CRUD

- `TaskService` (with tabIds array support)
  - Business logic for tasks
  - Comment management (embedded in task)
  - Status transitions with completedAt timestamps
  - Uses storage utilities for all CRUD

- `selectCollections` (IndexedDB queries via utilities)
  - Uses isActive index for active/saved filtering
  - Uses tags index for tag-based queries
  - Uses lastAccessed index for sorting
  - Delegates to storage utilities for data access

- `selectTasks` (IndexedDB queries via utilities)
  - Uses collectionId index for collection-specific queries
  - Uses status, priority, dueDate indexes for filtering
  - Delegates to storage utilities for data access

**Extend WindowService** (NOT new service):
- Add collection binding to EXISTING `/services/execution/WindowService.js`
- `bindCollectionToWindow(collectionId, windowId)` - New method
- `unbindCollectionFromWindow(collectionId)` - New method
- Extend existing `chrome.windows.onRemoved` listener
- Reuses existing window tracking infrastructure

**Background Handlers**:
- Message routing to services
- Error handling
- Initialize WindowService on startup (includes collection sync)

**Unit Tests** (130+ tests):
- Service operations (with storage utility mocks)
- Window binding/unbinding
- Window close detection via extended WindowService
- Direct folder/tab updates (no race conditions)
- Task status transitions
- Cascade delete verification

**Deliverables**:
- `/services/execution/CollectionService.js` (~300 lines)
- `/services/execution/FolderService.js` (~150 lines)
- `/services/execution/TabService.js` (~150 lines)
- `/services/execution/TaskService.js` (~250 lines)
- Updated `/services/execution/WindowService.js` (+80 lines)
- `/services/selection/selectCollections.js` (~200 lines)
- `/services/selection/selectTasks.js` (~200 lines)
- Unit tests (~130 tests, ~800 lines)

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

**Note**: The examples below show data **assembled for display**, not how it's stored. In v3's normalized model:
- Collections, folders, tabs, and tasks are stored in separate object stores
- Relationships use foreign keys (collectionId, folderId)
- UI services assemble the hierarchy by querying via FKs
- Storage is normalized, display is hierarchical

### Active Collection (Assembled for Display)

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

TabTaskTick v3 simplifies the mental model while preserving the core innovation: tasks know which tabs you need, and collections persist browser windows with full context.

**Key Improvements from v1/v2**:
- ✅ Collections are window-bounded (clear 1:1 relationship)
- ✅ Tasks belong to one collection (simpler relationships)
- ✅ Tasks reference multiple tabs (richer context)
- ✅ Removed subtasks (flat task list)
- ✅ Removed tab types (reduced cognitive load)
- ✅ Improved discovery (popup → side panel flow)
- ✅ IndexedDB storage (scalable, efficient, indexed queries)
- ✅ **v3**: Normalized data model (avoids race conditions, efficient updates)
- ✅ **v3**: Storage utilities pattern (consistent with TabMaster architecture)
- ✅ **v3**: Extends WindowService (no duplicate window tracking)

**Architecture Benefits (v3)**:
- Update single tab without loading entire collection (eliminates race conditions)
- Efficient partial updates via foreign key relationships
- Cascade deletes handled automatically (collection → folders → tabs)
- Storage utilities called only by services (enforced architecture boundary)
- Reuses existing WindowService infrastructure (DRY principle)

**Timeline**: 68-84 hours for MVP, 10 sprints, targeting v1.3.0 release.

**Status**: Ready for implementation with architectural refinements applied.

---

## Appendix: Future Considerations

### A. Progressive Save Behavior

**Context**: UX review raised concern about window close behavior creating accidental saved collections.

**Clarification for Implementation**:
- Only windows **explicitly saved as collections** persist
- Collections progressively sync as user works (not just on window close)
- Regular (unmarked) browser windows close normally and disappear
- Window close on a collection is just another sync point, not a "save" moment

**Implementation Detail**:
- Collections have `isActive: true` when window exists, `false` when closed
- Progressive sync updates collection state in IndexedDB as tabs/folders change
- Window close simply sets `isActive: false` and preserves existing state
- Users must explicitly choose "Save Window as Collection" - no accidental creation

**Status**: Core to MVP, clarified in documentation

---

### B. "Open Tabs" Interaction Pattern

**Context**: UX review noted ambiguity when "Open Tabs" on a task restores entire collection vs just task tabs.

**Architectural Trade-off**:
- **Option 1** (current): "Open Tabs" restores entire collection if saved
  - ✅ Tabs remain synchronized with collection
  - ✅ User gets full context (all folders)
  - ❌ May restore 50+ tabs when task only references 3

- **Option 2**: "Open Only These Tabs" creates tabs in current window
  - ✅ Only opens the 3 task tabs
  - ❌ Tabs not synchronized - changes don't save back to collection
  - ❌ Tabs live outside collection window context

**Decision**: Defer to Phase 3 (UI implementation)
- Build Option 1 initially (architecturally simpler)
- Test with real usage patterns
- Consider adding Option 2 as secondary action if confusion observed
- Label clearly: "Restore Collection (47 tabs)" vs "Open 3 tabs"

**Status**: Post-MVP refinement based on user feedback

---

### C. Scale Management via Rules Engine

**Context**: UX review noted 100+ collections will overwhelm filtering/search.

**Solution**: Leverage existing TabMaster rules engine for collection lifecycle management.

**Proposed Default Rules** (user-configurable):
1. **Auto-Archive Rule**
   - Trigger: Collection not accessed for 60 days
   - Action: Move to "Archived" section (hidden from main list)
   - User can disable or adjust timeframe

2. **Cleanup Suggestion Rule**
   - Trigger: Collection has no tasks + not accessed for 90 days
   - Action: Notification suggesting deletion
   - User can dismiss or delete

3. **Frecency Sorting Rule**
   - Trigger: Always active
   - Action: Sort collections by frequency + recency score
   - Surfaces most-used collections automatically

4. **Stale Task Alert Rule**
   - Trigger: Task open for 30+ days with no comments
   - Action: Badge on task ("review needed")
   - Helps users clean up forgotten tasks

**Implementation Timeline**:
- Phase 1-7: Core functionality without rules
- Post-MVP: Add collection-specific rules to existing engine
- Settings UI: "Collection Management Rules" section

**Status**: Post-MVP enhancement (v1.3.1 or v1.4.0)

---

### D. Additional UX Considerations

**From UX Architect Review** (for future refinement):

1. **Collection Folders** (hierarchical organization)
   - Allow grouping collections into folders (Work, Personal, Archive)
   - Addresses scale at 200+ collections
   - Post-MVP consideration

2. **Bulk Operations**
   - Multi-select collections for archive/delete
   - "Select all unused in 90 days" quick filters
   - Post-MVP consideration

3. **Task-Folder Visual Distinction**
   - Different icons/colors to clarify relationship
   - Implement during Phase 3 (UI) if time permits
   - Low priority (conceptually clear in proposal)

4. **Recently Closed Collections**
   - Browser history-style section for just-closed collections
   - Easy "undo" if user closes collection accidentally
   - Post-MVP consideration

5. **Collection Templates**
   - Pre-configured collections for common workflows
   - E.g., "Bug Investigation" (GitHub, Stack Overflow, docs)
   - Post-MVP consideration

**Status**: Documented for future product iterations

---

### E. Context View (UI Icebox - v1.3.1+)

**Concept**: Third side panel view showing context for the currently active tab.

**Problem Solved**: "Which tasks reference this page?" and "Where else does this page appear?"

**Mental Model**:
- **Collections View** → Project-level ("where things live")
- **Tasks View** → Work-level ("what I'm doing")
- **Context View** → Tab-level ("what's this page's role?")

**Trigger**: Appears when focused tab belongs to a collection.

**Example Layout**:
```
CONTEXT  (for: https://github.com/org/repo/pull/234)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 Collection: Project X 🟢
📂 Folder: Development (Red)

Also appears in (2):
  📁 Learning React › Examples
  📁 Project Y › References
  [View All]

⭐ Referenced by 2 Tasks:
  🔴 Fix auth bug (Active)
  ⚪ Review API changes (Open)
  [Add to New Task]

───────────────────────────
📝 Instance Note (this tab)
"Waiting on backend review"
[Edit Note]

💬 Related Comments (from tasks)
- AGL: Found issue in line 47 (Fix auth bug)
- JG: Fixed in PR #237 (Review API changes)
[View Task]

🎯 Quick Actions
[Open in Collection View]
[Focus Other Instances]
[Add to Existing Task]
```

**Key Interactions**:
- Inline note editing (instance-specific)
- "Also appears in" shows all collections/folders with this page
- "Referenced by" lists tasks that reference any instance of this page
- Quick task linking without navigation

**Technical Foundation**:
Uses `dupeKeyHash` index on tabs store:

```javascript
// When user focuses a tab
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await getTabByRuntimeId(tabId);
  if (!tab) return; // Not in a collection

  // Find all instances of this page (O(1) via index)
  const instances = await getTabsByDupeKey(tab.dupeKeyHash);

  // Find tasks referencing any instance
  const tasks = await getTasksReferencingTabs(instances.map(t => t.id));

  renderContext({ tab, instances, tasks });
});
```

**Query Helper**:
```javascript
// In storage-queries.js
async function getTabsByDupeKey(dupeKeyHash) {
  const db = await getDB();
  const tx = db.transaction('tabs', 'readonly');
  const index = tx.objectStore('tabs').index('dupeKeyHash');
  return await index.getAll(dupeKeyHash);
}
```

**Implementation Estimate**: 8-10 hours
- Add Context view tab to side panel
- `chrome.tabs.onActivated` listener
- Query helpers for instances + tasks
- UI rendering + quick actions

**Prerequisites**:
- Tab.dupeKeyHash field (included in v1.3.0)
- Core Collections + Tasks proven (validate MVP first)

**Decision Criteria for v1.3.1**:
- Do users actually manage duplicate pages across collections?
- Is task discovery via Collections→Tasks view insufficient?
- User feedback requests "what references this tab?"

**Status**: UI Icebox - deferred to post-MVP based on user feedback

---

**Prepared by**: TabMaster Pro Development Team
**Date**: December 2024
**Version**: 3.0 (Normalized Model with Architecture Refinements)
**Status**: Proposal - Ready for Implementation
