# TabTaskTick: Formal Product Proposal

**Evolution from Tab Hygiene to Work Management**

---

## Executive Summary

TabTaskTick represents the evolution of TabMaster Pro from a tab hygiene tool into a comprehensive knowledge organization and work management system for browser-based work.

**Three-Stage Evolution**:
1. **Stage 1 - Hygiene** (Complete): Rules engine, deduplication, tab grouping, snoozing
2. **Stage 2 - Knowledge Org** (Proposed): Collections with folders and tabs
3. **Stage 3 - Work Management** (Proposed): Tasks linked to collections and specific tabs

**Core Innovation**: Bridging the gap between disorganized browser tabs and static bookmarks by creating living collections with embedded work context (tasks) that reference specific tabs.

**Market Positioning**: First browser extension to integrate knowledge organization (collections) with task management (work context) at the tab level.

**Target Users**: Knowledge workers managing 50-200 tabs across research, development, writing, and project work who currently maintain separate systems for bookmarks, tasks, and browser tabs.

**Expected Impact**:
- Reduce open tab count by 60% (200 → 80 tabs)
- Eliminate context switching between task manager and browser
- Replace manual "links document" + "snippets doc" workflow with integrated system
- Enable contextual work: tasks know which tabs you need

---

## Product Vision

### The Problem Space

**Current State**: Knowledge workers maintain three disconnected systems:
1. **Browser Tabs** (50-200 open): Makeshift organization, constant hunting, memory overhead
2. **Bookmarks** (100-1000s): Dead storage, no context, hard to find, never maintained
3. **Task Manager** (external): Todos with manual link tracking, constant copy/paste

**User Pain Points**:
- "I keep 5 windows open for different projects because closing them feels like losing context"
- "I have a links document with 500 entries but can never find what I need"
- "My task list says 'Fix auth bug' but I have to hunt for the 3 tabs I need"
- "Bookmarks are where links go to die - I save them and never look again"

**The Gap**: No system bridges knowledge organization (what you know) with work execution (what you're doing).

### The Solution: TabTaskTick

**Core Concept**: Collections are living knowledge bases; tasks are work contexts that reference specific resources.

**Collection** = Window-like container with organized folders (tab groups) and tabs
- Organized knowledge with hierarchy (folders for grouping)
- Rich metadata per tab (notes, importance, last accessed)
- Can be opened/closed without losing organization

**Task** = Work item with priority, status, and direct tab references
- Links to specific tabs in collections
- Has subtasks (recursive) and discussion (comments)
- Opening task → opens relevant tabs automatically
- Tasks can span multiple collections (cross-project work)

**Integration Point**: Tasks reference tabs, providing work context for organized knowledge.

---

## Three-Stage Evolution

### Stage 1: Hygiene (Shipped - TabMaster Pro v1.2.6)

**Purpose**: Clean up tab chaos with automation

**Features**:
- Rules engine: Auto-close, group, snooze, bookmark tabs by patterns
- Deduplication: Remove duplicate tabs globally or per-window
- Tab grouping: Organize by domain, manual groups
- Tab snoozing: Defer tabs for later with automatic wake-up
- Window operations: Snooze/restore entire windows
- Analytics: Tab statistics, usage patterns

**Value Delivered**: Automated hygiene, reduced tab count, better organization

**Limitations**:
- No persistent organization (groups disappear when tabs close)
- No context for why tabs exist
- No connection to actual work being done

### Stage 2: Knowledge Organization (Proposed - v1.3.0)

**Purpose**: Organize knowledge with persistent collections

**Features**:
- **Collections**: Container for related resources (like a window)
  - Name, description, icon, color, tags
  - Metadata: created, last accessed

- **Folders**: Organize tabs within collection (like tab groups)
  - Name, color, collapsed state
  - One collection can have multiple folders

- **Tabs**: Individual resources with rich metadata
  - Type: Primary (key resource) or Reference (supporting)
  - Note: 255 char context about why it matters
  - Title, URL, favicon, last accessed

- **Operations**:
  - "Save Window as Collection" → Captures current window with tab groups
  - "Open Collection" → Recreates window with folders as tab groups
  - Search/filter collections by tags, name, content
  - Drag & drop organization

**Value Delivered**:
- Persistent organization (survives closing tabs/windows)
- Rich context per resource (notes, importance)
- Hierarchy (folders for grouping)
- Searchable knowledge base

**Example Use Cases**:
- "Learning React": 48 links organized in folders (Hooks, Context, Performance)
- "Project X": 15 tabs in folders (Documentation, Development, Resources)
- "House Renovation": 23 tabs in folders (Contractors, Inspiration, Planning)

### Stage 3: Work Management (Proposed - v1.3.0)

**Purpose**: Connect work (tasks) to knowledge (collections/tabs)

**Features**:
- **Tasks**: Work items with full lifecycle
  - Summary, detailed notes
  - Status: Open, Active, Fixed, Abandoned
  - Priority: Low, Medium, High, Critical
  - Due date
  - Tags (for projects, work types, clustering)
  - Created/completed dates (for reporting)

- **Task Relationships**:
  - Collection reference (0..1): Task belongs to a collection
  - Tab reference (0..1): Task references a specific tab
  - Parent task (0..1): Task can be subtask of another

- **Discussion**:
  - Comments (0..n): Threaded discussion on tasks
  - Timestamped, persistent

- **Task-Driven Operations**:
  - "Start Task" → Opens referenced tab(s) automatically
  - Task list shows which tabs are needed
  - "Complete Task" → Marks done, tracks completion time

- **Two Primary Views**:
  - **Task View**: See all work (uncategorized + by collection)
  - **Collections View**: See knowledge org with related tasks

**Value Delivered**:
- Work context: Tasks know which tabs you need
- No manual hunting: Click task → relevant tabs open
- Cross-collection work: Tasks can reference tabs from multiple collections
- Progress tracking: What did I complete this week?
- Focus: See only tasks for current collection

**Example Workflows**:

**Workflow 1: Knowledge Worker**
1. Has 200 tabs across 5 windows (research for various projects)
2. Creates collections for each project with folders for organization
3. Creates tasks: "Write auth section" → references 3 specific tabs
4. Opens task → relevant tabs appear, editor tab also opens
5. Marks complete → Can report "Completed 5 writing tasks this week"

**Workflow 2: Developer**
1. Maintains "Project X" collection (15 tabs in 3 folders)
2. Task: "Fix auth bug" (High, due Friday)
   - References: API Docs, GitHub PR, Stack Overflow post
3. Clicks task → 3 tabs open automatically
4. Adds comment: "Issue is token expiry, changing refresh window"
5. Creates subtask: "Write test for token refresh"
6. Marks task Fixed → Completion tracked with timestamps

**Workflow 3: Cross-Project Research**
1. Task: "Research authentication patterns"
2. References:
   - 3 tabs from "Project X" collection
   - 2 tabs from "Learning" collection
   - 1 tab from "Resources" collection
3. Click task → All 6 tabs open (even from different collections)
4. Complete research, mark Fixed
5. Report shows: "Completed 3 research tasks this week"

---

## Data Model

### Collection (Window container)

```javascript
interface Collection {
  id: string;                    // UUID
  name: string;                  // "Project X"
  description?: string;          // Long-form context
  icon?: string;                 // Emoji or icon
  color?: string;                // Visual identifier
  tags: string[];                // ["work", "backend", "urgent"]

  folders: Folder[];             // 0..n TabGroups

  metadata: {
    createdAt: number;           // Timestamp
    lastAccessed: number;        // Last opened
  };
}
```

### Folder (TabGroup container)

```javascript
interface Folder {
  id: string;                    // UUID
  name: string;                  // "Documentation"
  color: string;                 // Chrome TabGroup color
  collapsed: boolean;            // UI state
  position: number;              // Order in collection

  tabs: Tab[];                   // 0..n Tabs in folder
}
```

### Tab (Resource)

```javascript
interface Tab {
  id: string;                    // UUID
  url: string;                   // Full URL
  title: string;                 // Page title
  favicon?: string;              // Icon URL

  type: 'primary' | 'reference'; // Importance
  note?: string;                 // Max 255 chars context
  lastAccess?: number;           // Last viewed

  position: number;              // Order in folder
  isPinned?: boolean;            // Pin state

  // Runtime metadata (not persisted)
  isOpen?: boolean;              // Currently open?
  tabId?: number;                // Browser tab ID
  windowId?: number;             // Browser window ID
}
```

### Task (Work item)

```javascript
interface Task {
  id: string;                    // UUID
  summary: string;               // Title/one-liner
  notes?: string;                // Long-form description

  // State
  status: 'open' | 'active' | 'fixed' | 'abandoned';
  priority: 'low' | 'medium' | 'high' | 'critical';
  dueDate?: number;              // Timestamp
  tags: string[];                // ["project-x", "bug", "backend"]

  // Relationships
  collectionId?: string;         // 0..1 Belongs to collection
  tabId?: string;                // 0..1 References specific tab
  parentTaskId?: string;         // 0..1 Subtask of another task

  // Discussion
  comments: Comment[];           // 0..n Threaded discussion

  // Tracking
  createdAt: number;             // When opened
  completedAt?: number;          // When fixed/abandoned
}
```

### Comment (Discussion thread)

```javascript
interface Comment {
  id: string;                    // UUID
  text: string;                  // Comment body
  createdAt: number;             // Timestamp
  // Future: userId for multi-user
}
```

### Relationships

```
Collection (1) → Folder (0..n)
Folder (1) → Tab (0..n)

Task (1) → Collection (0..1)  // Task belongs to collection
Task (1) → Tab (0..1)          // Task references specific tab
Task (1) → Task (0..n)         // Task has subtasks (recursive)
Task (1) → Comment (0..n)      // Task has comments
```

---

## User Interface Architecture

### Primary Interface: Chrome Side Panel

**Chrome Side Panel API**: Persistent panel alongside browser content (Chrome 114+)

**Benefits**:
- Always accessible (no popup opening/closing)
- Stays open while user switches tabs
- Larger canvas for complex UI (300-400px width)
- Persistent state (no reload on tab switch)

**Side Panel Structure**:
```
manifest.json:
{
  "side_panel": {
    "default_path": "sidepanel/panel.html"
  }
}
```

**Tab Structure in Side Panel**:
```
┌─────────────────────────────────┐
│ TabTaskTick                     │
├─────────────────────────────────┤
│ [Collections] [Tasks]           │  ← Tab switcher
├─────────────────────────────────┤
│                                 │
│ [Current view content]          │
│                                 │
│                                 │
│                                 │
│                                 │
└─────────────────────────────────┘
```

### 1. Collections View (Side Panel)

**Primary Use**: Browse and organize knowledge

**Layout**:
```
COLLECTIONS

🔍 Search collections...        [+ New]

┌─────────────────────────────────────────┐
│ 📁 Project X (3 folders, 15 tabs)      │
│   Last used: today • Tags: work         │
│                                         │
│   Tasks (3):                            │
│     🔴 Fix auth bug (Active, due Fri)  │
│     ⚪ Write API docs (Open)           │
│                                         │
│   📂 Documentation (Blue, 2 tabs)       │
│     📄 API Docs [Primary]              │
│        "Main auth reference"           │
│     📄 README [Reference]              │
│                                         │
│   📂 Development (Red, 2 tabs)         │
│     📄 GitHub PR #234 [Primary] ⭐     │
│        "Auth fix - review"             │
│        Referenced by: Fix auth bug     │
│                                         │
│   [Open Window] [Edit]                 │
└─────────────────────────────────────────┘
```

**Features**:
- Search by name, tags, tab content
- Show related tasks at top
- Folders collapsible/expandable
- Tab indicators (Primary/Reference, task refs)
- Quick actions per collection

**Interactions**:
- Click collection → Expand/collapse details
- Click "Open Window" → Opens collection as new window with tab groups
- Click folder → Expand/collapse folder
- Click tab → Opens tab in current or new window
- Click task → Navigates to task detail
- Right-click collection → Context menu (Edit, Delete, Duplicate)

### 2. Task View (Side Panel)

**Primary Use**: See and manage work

**Layout**:
```
MY TASKS

View: [All] [By Collection]
Sort: [Due Date ▼]
Filter: [Status ▼] [Priority ▼]

🔍 Search tasks...              [+ New]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UNCATEGORIZED (2)

🔴 CRITICAL - Due Today
☐ Buy groceries
  [Mark Done]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROJECT X (3)

🔴 HIGH - Due Dec 15
☐ Fix auth bug (Active)
  → Tab: PR #234 (Development)
  → 2 comments, 2 subtasks
  [Open Tab] [Details]

⚪ MEDIUM - Due Dec 20
☐ Write API docs
  → Tab: API Docs
  [Open Tab]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Completed this week (5):
✓ Research OAuth (Mon)
✓ Review PR #123 (Tue)
...

[Group by: Collection ▼]
```

**Features**:
- Uncategorized section (tasks without collection)
- By Collection grouping
- Subtask indicators
- Tab references with folder context
- Comment count
- Quick actions (Open Tab, Mark Done)
- Reporting section

**Interactions**:
- Click task → Expand to show details inline OR open detail view
- Click "Open Tab" → Opens referenced tab
- Click "Mark Done" → Updates status to Fixed
- Click "Details" → Opens full task detail view
- Right-click task → Context menu (Edit, Delete, Change Status)

### 3. Secondary Interface: Popup (Enhanced)

**Current Popup**: Quick actions menu for tab operations

**Enhancements for TabTaskTick**:

```
┌─────────────────────────────────┐
│ TabTaskTick                     │
├─────────────────────────────────┤
│ Quick Actions                   │
│                                 │
│ 💾 Save Window as Collection   │
│ 📋 My Active Tasks (3)          │  ← NEW
│   🔴 Fix auth bug               │
│   ⚪ Write API docs             │
│   ⚪ Update tests               │
│                                 │
│ Recent Collections              │  ← NEW
│   📁 Project X                  │
│   📁 Learning React             │
│                                 │
│ ─────────────────────────       │
│ Existing TabMaster Features:    │
│ 🗂️  Group by Domain            │
│ 💤 Snooze Tabs                  │
│ 🗑️  Close Duplicates           │
│ 📊 Statistics                   │
└─────────────────────────────────┘
```

**New Popup Features**:
- **My Active Tasks**: Show 3-5 active/high priority tasks
  - Click task → Opens referenced tab
  - Quick status change
- **Recent Collections**: Last 3-5 accessed collections
  - Click collection → Opens in side panel OR opens window
- **Save Window**: One-click capture current window

**Design Goal**: Popup remains lightweight for quick actions, side panel is primary interface for deep work.

### 4. Context Menus (Enhanced)

**Tab Context Menu** (right-click on tab):
```
┌────────────────────────────────┐
│ Add to Collection              │  ← NEW
│   ↳ Project X                  │
│   ↳ Learning React             │
│   ↳ + New Collection           │
│                                │
│ Create Task for This Tab       │  ← NEW
│                                │
│ Set as Primary Tab             │  ← NEW
│ Set as Reference Tab           │  ← NEW
│ Add Note to Tab                │  ← NEW
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
│ Save Page to Collection        │  ← NEW
│   ↳ Project X                  │
│   ↳ Learning React             │
│   ↳ + New Collection           │
│                                │
│ Create Task for This Page      │  ← NEW
│                                │
│ ───────────────────────        │
│ [Existing TabMaster actions]   │
└────────────────────────────────┘
```

**Selection Context Menu** (right-click on selected text):
```
┌────────────────────────────────┐
│ Add to Collection Note         │  ← NEW
│   ↳ Select collection...       │
│                                │
│ Create Task from Selection     │  ← NEW
│   "Fix the authentication..."  │
│                                │
│ ───────────────────────        │
│ [Browser default actions]      │
│ Copy                           │
│ Search Google                  │
└────────────────────────────────┘
```

**Window Context Menu** (toolbar icon right-click):
```
┌────────────────────────────────┐
│ Save Window as Collection      │  ← NEW
│ Open Side Panel                │  ← NEW
│                                │
│ ───────────────────────        │
│ [Existing TabMaster actions]   │
│ Open Dashboard                 │
│ Options                        │
└────────────────────────────────┘
```

### 5. Dashboard Integration

**New Dashboard Tabs**:
- **Collections**: Full collection management (existing Tabs/Groups/Rules pattern)
- **Tasks**: Advanced task views and reporting

**Dashboard Collections View**:
- Grid/list view of collections
- Full editing capabilities (rename, reorganize folders, edit tabs)
- Bulk operations
- Advanced filtering/search
- Collection templates

**Dashboard Tasks View**:
- Kanban board (Open / Active / Fixed / Abandoned)
- Calendar view (tasks by due date)
- Reporting (completed this week, time tracking)
- Advanced filters (tags, collections, priorities)
- Bulk operations (mark multiple as done, change priorities)

### UI Flow Examples

**Flow 1: Save Current Window**
1. User has 15 tabs open in 3 tab groups
2. Right-click toolbar icon → "Save Window as Collection"
3. Modal appears:
   - Name: "Project X" (auto-suggested from tab titles)
   - Icon: 📁 (picker)
   - Tags: "work, backend" (auto-suggested)
4. Click "Save" → Collection created with 3 folders (from tab groups)
5. Notification: "Saved Project X (15 tabs, 3 folders)"
6. User can now close window confidently

**Flow 2: Work on Task**
1. User opens side panel (Cmd+B or toolbar icon)
2. Switches to "Tasks" view
3. Sees "Fix auth bug" task (High, Active, due Friday)
4. Clicks "Open Tab" → GitHub PR tab opens
5. Adds comment in side panel: "Found issue in line 47"
6. Creates subtask: "Write test for token refresh"
7. After fixing, clicks "Mark Fixed"
8. Task moves to "Completed this week" section

**Flow 3: Create Task from Tab**
1. User on GitHub PR page
2. Right-click page → "Create Task for This Page"
3. Modal appears:
   - Summary: "Review PR #234" (from page title)
   - Collection: "Project X" (auto-detected from open collections)
   - Priority: Medium
   - Due: [picker]
4. Click "Create" → Task created, linked to current tab
5. Task appears in side panel task list

---

## Technical Architecture

### Storage Layer

**chrome.storage.local** (not IndexedDB):
- Collections metadata (<10KB each)
- Tasks, comments
- Folder structure
- 10MB quota = 1000+ collections

```javascript
chrome.storage.local = {
  collections: Collection[],
  tasks: Task[],
  // Existing TabMaster data...
  rules: Rule[],
  settings: Settings
}
```

### Service Architecture (V2 Pattern)

**Selection Services** (read-only filtering):
- `selectCollections(filters)` - Query collections
- `selectTasks(filters)` - Query tasks by status, priority, tags, etc.

**Execution Services** (state modification):
- `CollectionService` - CRUD operations
  - `createCollection(collection)`
  - `updateCollection(id, updates)`
  - `deleteCollection(id)`
- `FolderService` - Manage folders in collections
  - `addFolder(collectionId, folder)`
  - `updateFolder(id, updates)`
  - `deleteFolder(id)`
- `TabService` - Manage tabs in folders
  - `addTab(folderId, tab)`
  - `updateTab(id, updates)` - Update type, note
  - `deleteTab(id)`
- `TaskService` - Task lifecycle
  - `createTask(task)`
  - `updateTask(id, updates)`
  - `updateTaskStatus(id, status)` - Sets completedAt
  - `addComment(taskId, comment)`
  - `addSubtask(parentId, subtask)`
  - `linkTaskToTab(taskId, collectionId, tabId)`

**Orchestration Services**:
- `CaptureWindowService` - Save window as collection
- `RestoreCollectionService` - Open collection as window with tab groups
- `TaskExecutionService` - Open tabs referenced by task

### Message Passing (Cross-Context Communication)

```javascript
// Side Panel → Background
chrome.runtime.sendMessage({
  action: 'createCollection',
  collection: { ... }
});

// Background → Service
const CollectionService = await import('./services/CollectionService.js');
const result = await CollectionService.createCollection(collection);

// Background → Side Panel
sendResponse({ success: true, collection: result });
```

### UI Surfaces

**Side Panel** (primary interface):
- Collections View
- Tasks View
- Always accessible, persistent state
- 300-400px width canvas

**Popup** (quick actions):
- Active tasks (3-5)
- Recent collections (3-5)
- Save window button
- Existing TabMaster quick actions

**Dashboard** (full management):
- Collections tab (full editing)
- Tasks tab (advanced views, reporting)
- Existing TabMaster tabs (Tabs, Groups, Rules, Settings, Analytics)

**Context Menus** (quick capture):
- Tab: Add to collection, create task
- Page: Save to collection, create task
- Selection: Add to note, create task
- Toolbar: Save window, open side panel

---

## Implementation Plan

### Phase 1: Foundation (8-10h)
- Define data models (Collection, Folder, Tab, Task, Comment)
- Create CollectionStorage service (chrome.storage.local)
- Create TaskStorage service
- Write unit tests (40+ tests)

**Deliverables**:
- `/docs/tabtasktick-data-models.md`
- `/services/storage/CollectionStorage.js`
- `/services/storage/TaskStorage.js`
- `/tests/CollectionStorage.test.js`
- `/tests/TaskStorage.test.js`

### Phase 2: Core Services (14-18h)
- CollectionService, FolderService, TabService
- TaskService (CRUD, subtasks, comments)
- selectCollections, selectTasks (filtering/sorting)
- Background message handlers

**Deliverables**:
- `/services/execution/CollectionService.js`
- `/services/execution/FolderService.js`
- `/services/execution/TabService.js`
- `/services/execution/TaskService.js`
- `/services/selection/selectCollections.js`
- `/services/selection/selectTasks.js`
- Unit tests (60+ tests)

### Phase 3: Side Panel UI (12-14h)
- Side panel HTML/CSS/JS
- Collections View (folders, tabs, collapse/expand)
- Task View (uncategorized + by collection)
- Search and filtering
- Tab switcher between views

**Deliverables**:
- `/sidepanel/panel.html`
- `/sidepanel/panel.css`
- `/sidepanel/panel.js`
- `/sidepanel/collections-view.js`
- `/sidepanel/task-view.js`

### Phase 4: Dashboard Integration (14-16h)
- Collections tab (full management)
- Tasks tab (advanced views)
- Collection editor (folders, tabs, metadata)
- Task detail view (subtasks, comments)
- Reporting (completed this week)

**Deliverables**:
- `/dashboard/modules/views/collections.js`
- `/dashboard/modules/views/tasks.js`
- `/dashboard/modules/collection-editor.js`
- `/dashboard/modules/task-detail.js`

### Phase 5: Popup & Context Menus (6-8h)
- Enhanced popup with active tasks and recent collections
- Context menu: Add to collection
- Context menu: Create task for tab/page
- Context menu: Add note to tab
- Context menu: Save window

**Deliverables**:
- `/popup/popup.js` (enhanced)
- `/popup/popup.html` (enhanced)
- Context menu handlers in background

### Phase 6: Operations (8-10h)
- Capture window as collection (with tab groups)
- Restore collection as window (recreate tab groups)
- Open tab from task
- Task-driven tab opening
- Link/unlink tasks to tabs

**Deliverables**:
- `/services/execution/CaptureWindowService.js`
- `/services/execution/RestoreCollectionService.js`
- `/services/execution/TaskExecutionService.js`
- Integration tests

**Total Timeline: 62-76 hours for MVP**

**Phasing**:
- Sprint 1-2: Phase 1-2 (Foundation + Services) - 22-28h
- Sprint 3-4: Phase 3 (Side Panel) - 12-14h
- Sprint 5-6: Phase 4 (Dashboard) - 14-16h
- Sprint 7: Phase 5 (Popup & Menus) - 6-8h
- Sprint 8: Phase 6 (Operations) - 8-10h

---

## Success Metrics

### Stage 2: Knowledge Organization (v1.3.0 Launch)

**Adoption**:
- 70% of users create at least 1 collection in first week
- Average 5 collections per active user after 1 month
- 40% of users have 10+ collections after 3 months

**Behavior Change**:
- Average open tabs reduced from 150 → 60 (60% reduction)
- Average windows reduced from 5 → 2 (60% reduction)
- Collections opened 3+ times per day (active usage)

**Quality**:
- Average 12 tabs per collection (healthy size)
- 70% of collections have folders (using organization)
- Average 2.5 folders per collection

### Stage 3: Work Management (v1.3.0 Launch + 1 month)

**Task Adoption**:
- 50% of users create at least 1 task in first week
- Average 8 active tasks per user (healthy backlog)
- 60% of tasks linked to collections
- 40% of tasks reference specific tabs

**Workflow**:
- Tasks marked "Fixed" within 3 days on average
- "Open Tab from Task" action used 5+ times per day
- Users complete 10-15 tasks per week

**Integration**:
- 80% of collections have at least 1 related task
- Cross-collection tasks represent 20% of all tasks
- Comments added to 30% of tasks (discussion happening)

**Retention**:
- 7-day retention: 80% (users return within week)
- 30-day retention: 60% (sustained usage)
- Daily active users: 40% of installed base

### User Feedback (Qualitative)

**Expected Quotes**:
- "Finally can close browser windows without anxiety"
- "My task list actually knows which tabs I need"
- "Replaced Notion + Todoist + 200 tabs with this"
- "I can find things from 3 months ago in 10 seconds"

---

## Competitive Analysis

### Current Market

**Tab Managers** (OneTab, Tab Session Manager, Workona):
- Focus: Save/restore tab groups
- Limitation: No task integration, no rich metadata, flat structure

**Task Managers** (Todoist, Things 3, Notion):
- Focus: Task management with manual link tracking
- Limitation: Not browser-integrated, copy/paste links, no auto-open

**Knowledge Managers** (Notion, Obsidian, Roam):
- Focus: Note-taking with linked references
- Limitation: Not tab-integrated, separate from actual work environment

**Arc Browser**:
- Focus: Spaces (window-like containers) with auto-archive
- Limitation: Can't name windows, no task integration, browser lock-in

### TabTaskTick Differentiation

**Unique Position**: Only tool that integrates:
1. Browser-native organization (collections = windows, folders = tab groups)
2. Rich knowledge metadata (tab types, notes, context)
3. Task management with direct tab references
4. Cross-collection task capability

**Moats**:
- Deep Chrome API integration (tab groups, windows, alarms, side panel)
- Proven V2 architecture (13 services, 457 tests)
- Task → Tab → Collection relationship (unique data model)
- Browser-based workflow (no context switching)

**Why Users Will Switch**:
- Replaces 3 tools (tab manager + task manager + bookmark manager)
- Zero friction: Tasks open tabs automatically
- Context preserved: Notes, organization, relationships
- Browser-native: No separate app/window

---

## Risks & Mitigations

### Technical Risks

**Risk 1: Chrome API Limitations**
- Can't name windows (user confusion about which window)
- **Mitigation**: Collections are organizational only, not window-bound
- User opens collection → can choose window or create new

**Risk 2: Storage Quota (10MB chrome.storage.local)**
- Heavy users could hit limit with 100+ collections
- **Mitigation**:
  - Collections are small (~10KB each = 1000 collections in quota)
  - Monitor quota, warn at 80%
  - Cleanup UI for old/unused collections

**Risk 3: Service Worker Restarts**
- Chrome kills service workers after 30s idle
- **Mitigation**:
  - Lazy initialization pattern (proven in SnoozeService)
  - All state persisted to chrome.storage.local
  - No in-memory-only state

**Risk 4: Side Panel Compatibility**
- Side Panel API requires Chrome 114+ (June 2023)
- **Mitigation**:
  - Fallback to popup for older Chrome versions
  - Check chrome.sidePanel API availability
  - Most users on evergreen Chrome (auto-updates)

### UX Risks

**Risk 1: Complexity Overload**
- Too many concepts (collections, folders, tabs, tasks, subtasks)
- **Mitigation**:
  - Progressive disclosure (start simple)
  - Template collections for onboarding
  - "Quick save window" one-click action

**Risk 2: Adoption Curve**
- Users may not understand value until they use tasks
- **Mitigation**:
  - Collections useful standalone (Stage 2 value)
  - Task suggestion: "Create task for this collection?"
  - Examples/templates showing task integration

**Risk 3: Scale Issues**
- UI breaks with 100+ collections or 50+ tasks
- **Mitigation**:
  - Search/filter essential from day 1
  - Pagination/virtual scrolling for large lists
  - Archive feature for old collections

### Market Risks

**Risk 1: User Behavior Change**
- Requires changing habits (window hoarding → collections)
- **Mitigation**:
  - Low friction: "Save this window" one button
  - Familiar patterns: Windows → Collections, TabGroups → Folders
  - Clear value prop: Close tabs without losing context

**Risk 2: Competitive Response**
- Established players (Workona, Arc) could copy
- **Mitigation**:
  - First mover advantage with task integration
  - Deep Chrome API integration (harder to replicate)
  - V2 architecture allows rapid iteration

---

## Go-to-Market Strategy

### Launch Phases

**v1.3.0 - MVP Launch** (Stage 2 + 3):
- Blog post: "From Tab Chaos to Work Context"
- ProductHunt launch: "Task manager that knows your tabs"
- Reddit: r/productivity, r/chrome, r/webdev
- HackerNews: "Show HN: Browser task manager with tab references"

**v1.3.1 - Iteration** (+1 month):
- User feedback incorporation
- Performance optimization
- Bug fixes

**v1.4.0 - Power Features** (+3 months):
- Advanced task features (recurring, templates)
- Collection templates
- Import from other tools
- Export/backup enhancements

### Positioning

**Primary Message**: "Your task list should know which tabs you need"

**Secondary Messages**:
- "Stop hoarding browser windows"
- "Organize 200 tabs without losing context"
- "Close tabs confidently - everything's saved"

**User Stories**:
- Developer: "My 'Fix auth bug' task opens the 3 tabs I need automatically"
- Researcher: "I have 50 collections with 20 tabs each, organized and searchable"
- Writer: "Each article I'm writing is a task linked to research tabs"

---

## Appendix: Example Data

### Example Collection

```json
{
  "id": "col_123",
  "name": "Project X - Authentication Overhaul",
  "description": "Complete rewrite of auth system using OAuth 2.0",
  "tags": ["work", "backend", "urgent", "project-x"],
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
          "title": "OAuth 2.0 — OAuth",
          "type": "primary",
          "note": "Main spec - refer to Section 4.1 for authorization code flow",
          "position": 0
        },
        {
          "id": "tab_2",
          "url": "https://github.com/org/api-docs",
          "title": "API Documentation",
          "type": "primary",
          "note": "Our API docs - auth section needs updating after implementation",
          "position": 1
        }
      ]
    },
    {
      "id": "folder_2",
      "name": "Development",
      "color": "red",
      "collapsed": false,
      "position": 1,
      "tabs": [
        {
          "id": "tab_3",
          "url": "https://github.com/org/repo/pull/234",
          "title": "PR #234: Implement OAuth 2.0",
          "type": "primary",
          "note": "Main implementation PR - review before merge, check backward compat",
          "position": 0
        },
        {
          "id": "tab_4",
          "url": "http://localhost:3000",
          "title": "Local Dev Server",
          "type": "primary",
          "note": "Test environment for auth flow",
          "position": 1
        }
      ]
    },
    {
      "id": "folder_3",
      "name": "Reference",
      "color": "green",
      "collapsed": true,
      "position": 2,
      "tabs": [
        {
          "id": "tab_5",
          "url": "https://stackoverflow.com/questions/...",
          "title": "OAuth token refresh patterns",
          "type": "reference",
          "note": "Good examples of refresh token handling",
          "position": 0
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

### Example Task

```json
{
  "id": "task_1",
  "summary": "Fix authentication token expiry bug",
  "notes": "Users getting logged out after 5 minutes. Token refresh window too short. Need to extend from 5min to 10min and add better error handling.",
  "status": "active",
  "priority": "high",
  "dueDate": 1702432000000,
  "tags": ["project-x", "bug", "backend", "urgent"],
  "collectionId": "col_123",
  "tabId": "tab_3",
  "comments": [
    {
      "id": "comment_1",
      "text": "Started investigation - narrowed down to token refresh logic in auth service",
      "createdAt": 1702300000000
    },
    {
      "id": "comment_2",
      "text": "Discussed with team - agreed on 10min window, will also add retry logic",
      "createdAt": 1702350000000
    }
  ],
  "createdAt": 1702250000000
}
```

### Example Task with Subtasks

```json
{
  "id": "task_2",
  "summary": "Complete auth system overhaul",
  "notes": "Full implementation of OAuth 2.0 authentication",
  "status": "open",
  "priority": "high",
  "dueDate": 1702600000000,
  "tags": ["project-x", "feature", "backend"],
  "collectionId": "col_123",
  "comments": [],
  "createdAt": 1702200000000
}

// Subtasks reference parent
{
  "id": "task_3",
  "summary": "Implement authorization code flow",
  "status": "fixed",
  "priority": "high",
  "parentTaskId": "task_2",
  "collectionId": "col_123",
  "tabId": "tab_3",
  "completedAt": 1702300000000
}

{
  "id": "task_4",
  "summary": "Add token refresh logic",
  "status": "active",
  "priority": "high",
  "parentTaskId": "task_2",
  "collectionId": "col_123",
  "tabId": "tab_3"
}
```

---

## Conclusion

TabTaskTick represents a fundamental evolution in how knowledge workers manage browser-based work. By bridging the gap between knowledge organization (collections) and work execution (tasks), we create a unified system that eliminates context switching and manual link tracking.

**Three-Stage Evolution**:
1. ✅ **Hygiene** (Shipped): Automated tab management
2. 🚀 **Knowledge Org** (Proposed): Persistent collections with folders
3. 🚀 **Work Management** (Proposed): Tasks linked to specific tabs

**Unique Value**: First tool to integrate browser organization with task management at the tab level, delivered through Chrome's native Side Panel API for persistent, always-accessible interface.

**Market Opportunity**: Replace 3 disconnected tools (tab manager + task manager + bookmarks) with one integrated system.

**Technical Foundation**: Built on proven V2 architecture with 13 services, 457 tests, and services-first design.

**Timeline**: 62-76 hours for MVP, 8 sprints, targeting v1.3.0 release.

---

**Prepared by**: TabMaster Pro Development Team
**Date**: December 2024
**Version**: 1.0
**Status**: Proposal - Awaiting Approval
