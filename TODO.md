# TabTaskTick - Implementation TODO

## Project Status

**TabMaster Pro V2 Architecture**: ✅ COMPLETE (13 services, 457 tests)
- Services-first architecture proven and battle-tested
- Selection/execution separation established
- Message passing patterns working across all surfaces
- Production release: v1.2.6

**Current Development**: TabTaskTick (Collections + Tasks + Work Management)
- Branch: `main` (active development)
- Version: 1.3.0 (in development)
- Proposal: `/plans/TABTASKTICK-PRODUCT-PROPOSAL-V2.md`

**Evolution Path**: Tab Hygiene → Knowledge Organization → Work Management
- Stage 1 (Complete): Rules, deduplication, grouping, snoozing
- Stage 2 (This Release): Collections as persistent windows with folders
- Stage 3 (This Release): Tasks within collections referencing tabs

**Timeline**: 68-84 hours for MVP, 10 sprints

**Architecture Note**: This plan uses a normalized data model (4 separate object stores with foreign keys) instead of nested documents. This avoids race conditions on concurrent updates and improves query performance. See Architecture Refinements section below.

## Architecture Refinements

Following architecture-guardian review, key improvements from initial plan:

### 1. Normalized Data Model
**Change**: Store collections, folders, tabs, and tasks as separate object stores with foreign key relationships, instead of nesting folders/tabs inside collections.

**Why**:
- Avoids race conditions (updating one tab doesn't require loading entire collection)
- Better transaction control (update only what changes)
- Simpler queries (direct lookups by FK index)
- Follows relational data best practices

**Trade-off**: More complex queries when reassembling full collection hierarchy, but gains significant benefits in write performance and data integrity.

### 2. Storage Utilities, Not Services
**Change**: Create storage query utilities in `/services/utils/` instead of formal storage services layer.

**Why**:
- Utilities are called ONLY by execution services (enforced by architecture)
- Consistent with how chrome.storage.local is used in TabMaster
- Clear separation: utilities = data access, services = business logic
- Avoids creating parallel service architecture

**Pattern**: Execution services use utilities like `saveCollection()`, similar to how SnoozeService uses chrome.storage.local internally.

### 3. Extend WindowService Instead of New Service
**Change**: Add collection binding methods to existing WindowService instead of creating WindowTrackingService.

**Why**:
- WindowService already tracks window lifecycle via `chrome.windows.onRemoved`
- Reuses existing infrastructure (no duplication)
- Single source of truth for window management
- Follows DRY principle

**Implementation**: Add `bindCollectionToWindow()`, `unbindCollectionFromWindow()`, and `getCollectionForWindow()` methods to existing service.

### 4. Keep Collections + Tasks Together
**Decision**: Implement both Collections and Tasks in v1.3.0 (don't split into separate releases).

**Why**:
- Tasks are core to the value proposition (task-driven work)
- Splitting led to deprioritization in LinkStash proposal
- Users need both for meaningful workflow improvements
- Together they deliver the full vision: persistent windows + work context

---

## Architecture Overview

### Core Concepts

**Collections** = Persistent Windows
- Active: Has browser window with windowId, isActive=true
- Saved: No browser window, windowId=null, isActive=false
- Contains folders (Chrome tab groups) and tabs
- Contains tasks that reference specific tabs

**Folders** = Chrome Tab Groups
- Nested in collections (topical organization)
- Color, name, collapsed state, position

**Tabs** = Resources
- Nested in folders
- URL, title, favicon, note (255 chars max), position, pinned

**Tasks** = Work Items
- Belong to ONE collection (0..1)
- Reference MULTIPLE tabs (0..n) within that collection
- Status, priority, due date, comments
- Opening task → opens collection if saved, focuses referenced tabs

### Storage Architecture

**IndexedDB** (TabTaskTick data - Normalized Model):
- Database: `TabTaskTickDB` v1
- Object Store: `collections` (keyPath: 'id')
  - Fields: id, name, description, icon, color, tags, windowId, isActive, metadata
  - Indexes: isActive, tags (multiEntry), lastAccessed
- Object Store: `folders` (keyPath: 'id')
  - Fields: id, collectionId (FK), name, color, collapsed, position
  - Indexes: collectionId
- Object Store: `tabs` (keyPath: 'id')
  - Fields: id, folderId (FK), url, title, favicon, note, position, isPinned, tabId (runtime)
  - Indexes: folderId
- Object Store: `tasks` (keyPath: 'id')
  - Fields: id, collectionId (FK), summary, notes, status, priority, dueDate, tags, comments, tabIds (array), createdAt, completedAt
  - Indexes: collectionId, status, priority, dueDate, tags (multiEntry), createdAt

**chrome.storage.local** (TabMaster legacy):
- Rules, settings, snooze metadata (unchanged)

**Why Normalized**: Enables efficient partial updates (update one tab without loading entire collection), better transaction control, simpler queries, avoids race conditions on nested updates.

### Architecture Layers

**Utility Layer**: IndexedDB access helpers (db.js, transaction wrappers)
- NOT a service layer - just utilities for consistent DB access
- Only called by execution services

**Selection Services**: Query data via IndexedDB indexes
**Execution Services**: CRUD + business logic, uses utilities for storage
**Orchestration Services**: Coordinate multiple services (capture, restore, task execution)

---

## Implementation Phases

**Note**: Completed phases (Phases 1-3, 5-6) have been archived to [TODO-TT-HISTORY.md](./TODO-TT-HISTORY.md) for historical reference.

---

### Phase 4: Popup Enhancement (Discovery) ⏳
**Time Estimate**: 8-10 hours (increased from 6-8h per UX review)
**Priority**: MEDIUM
**Dependencies**: Phase 3 complete
**Status**: 🔴 Not Started

#### 4.1 Popup Layout Update (3-4h)
- [ ] Update `/popup/popup.html`:
  - Add "💡 Try Collections" banner at top (dismissible with X button)
  - Add "💾 Save This Window" button (prominent, large)
  - Add "Active Tasks" section (3-5 max, sorted by priority/due date)
  - Add "Active Collections" section (with 🟢 indicator and window info "Window #2")
  - Add "Recent Saved Collections" section (3-5 max, sorted by lastAccessed)
  - Add "Open Side Panel (Cmd+B)" prominent link/button
  - Keep existing TabMaster features below (collapsible section)
- [ ] Update `/popup/popup.css`:
  - Style new sections (consistent with existing popup)
  - Banner styling (light blue background, dismissible X, border)
  - Collection card styling (compact version with icon + metadata)
  - Task card styling (compact version with priority indicator)
  - Window info badge ("Window #2" in monospace font)
  - Active indicator (🟢 with subtle glow effect)
  - Responsive sizing (adapt to popup width constraints)

#### 4.2 Popup JS Updates (3-4h)
- [ ] Update `/popup/popup.js`:
  - Load active tasks via `getTasks` message (status='open' or 'active', sort by priority/dueDate, limit 5)
  - Load active collections via `getCollections` message (isActive=true, sort by lastAccessed)
  - Load recent saved collections via `getCollections` message (isActive=false, sort by lastAccessed, limit 5)
  - Get current window ID via chrome.windows.getCurrent() for window number display
  - Render collections with:
    - 🟢 indicator for active
    - Window info ("Window #2") for active collections
    - Metadata (tab count, task count)
    - Action buttons: "Focus" (active) / "Open" (saved)
  - Render tasks with:
    - Priority indicator (color-coded)
    - Collection badge (if present)
    - "Open" button → send `openTaskTabs` message
    - Truncated summary (max 40 chars)
  - Handle "Save This Window" button:
    - Send `createCollection` message with current window ID
    - Show loading state
    - Show success notification
    - Prompt to open side panel
  - Handle banner dismiss:
    - Save dismissal state in chrome.storage.local with timestamp
    - Don't show again for 7 days
    - Fade out animation
  - Handle "Open Side Panel" link:
    - Use chrome.sidePanel.open() API (or equivalent for Cmd+B)
    - Close popup automatically
  - Implement progressive discovery:
    - If no collections: Show banner + "Save This Window" emphasis
    - If has collections but no tasks: Show task creation prompt
    - If has both: Show active items only
  - Handle errors gracefully (connection lost, service worker asleep)
  - Loading states for all data fetches
- [ ] NO business logic - all operations via chrome.runtime.sendMessage()

#### 4.2.5 Popup Progressive Discovery (1-2h) **NEW**
- [ ] Implement first-time user flow:
  - Detect first popup open (check chrome.storage.local)
  - Show welcome tooltip on "Save This Window" button
  - Show arrow pointing to side panel link
  - Progressive badge counts ("1 collection created!")
- [ ] Implement onboarding sequence:
  - Step 1: "Save your first window" (highlight button)
  - Step 2: "Open side panel to manage" (highlight link)
  - Step 3: "Create tasks for your work" (after first collection)
  - Persist onboarding progress
  - Allow skipping with "Got it" button

#### 4.3 Integration Testing (1-2h)
- [ ] Test popup opens and shows new sections
- [ ] Test "Save This Window" creates collection
- [ ] Test banner dismissal persists
- [ ] Test active tasks display with "Open" button
- [ ] Test active collections display with 🟢 indicator
- [ ] Test recent saved collections display
- [ ] Test "Open Side Panel" link works
- [ ] Test existing TabMaster features still work

**Success Criteria**:
- [ ] Banner promotes Collections effectively
- [ ] "Save This Window" button prominent and working
- [ ] Active tasks display (max 5)
- [ ] Active collections display with window info
- [ ] Banner dismissal persists
- [ ] Existing TabMaster features unaffected
- [ ] NO business logic in popup/*.js (all via messages)

**Deliverables**:
- Updated `/popup/popup.html`
- Updated `/popup/popup.css`
- Updated `/popup/popup.js`

---

### Phase 7: Dashboard Integration ⏳
**Time Estimate**: 20-24 hours (increased from 12-14h per UX review)
**Priority**: MEDIUM
**Dependencies**: Phase 6 complete
**Status**: 🔴 Not Started
**Note**: Consider splitting into Phase 7a (Collections) and Phase 7b (Tasks) due to complexity

#### 7.1 Collections View (6-8h)
- [ ] Create `/dashboard/modules/views/collections.js` (~500 lines)
- [ ] Implement `loadCollectionsView()`:
  - Load collections via `getCollections` message
  - Render grid/list view toggle with collection cards
  - Group by state (Active / Saved / Archived) with collapsible sections
  - Show stats per collection (tab count, folder count, task count, last accessed)
  - Action buttons: "Open", "Edit", "Delete", "Archive", "Export"
  - Loading states (skeleton grid)
  - Empty states ("No collections yet")
- [ ] Implement collection detail modal:
  - Show folders and tabs in nested tree view
  - Show tasks in collection (with inline status updates)
  - Edit metadata inline (name, description, tags, icon, color)
  - **Drag-and-drop** to reorder folders/tabs (complex!):
    - Use native HTML5 drag-and-drop API
    - Visual feedback during drag (placeholder, ghost)
    - Update position via messages on drop
    - Handle inter-folder dragging
    - Handle edge cases (drag to same position, invalid drop targets)
  - Add/remove folders/tabs with modals
  - Keyboard navigation support
- [ ] Implement bulk operations:
  - Multi-select collections with checkboxes
  - Select all / deselect all
  - "Archive Selected", "Delete Selected", "Export Selected"
  - Confirmation modals for destructive actions
  - Progress indicators for bulk operations
  - Undo for accidental bulk deletes (5 second window)
- [ ] Implement advanced filters/search:
  - Search in name, description, tags (debounced)
  - Filter by state (active/saved/archived)
  - Filter by date range (created, last accessed)
  - Filter by tag (multi-select)
  - Sort by: name, created date, last accessed, tab count
  - Persist filter/sort state
  - Clear filters button
- [ ] NO business logic - all via chrome.runtime.sendMessage()

#### 7.2 Tasks View - Kanban Board (8-10h)
- [ ] Create `/dashboard/modules/views/tasks-kanban.js` (~500 lines)
- [ ] Implement `loadKanbanView()`:
  - Load tasks via `getTasks` message
  - Load collections via `getCollections` message (for display context)
  - Render Kanban board with 4 columns:
    - "Open" (status='open')
    - "Active" (status='active')
    - "Fixed" (status='fixed')
    - "Abandoned" (status='abandoned')
  - Show task cards with rich metadata:
    - Priority indicator (color-coded border)
    - Summary with truncation
    - Due date with overdue highlighting
    - Collection badge (clickable)
    - Tab references count ("→ 3 tabs")
    - Comment count (if > 0)
    - Tags (first 2, "+ N more")
  - **Drag-and-drop between columns** (complex!):
    - Use HTML5 drag-and-drop API or library (e.g., SortableJS)
    - Visual feedback (placeholder, ghost card, drop zones)
    - Update task status via message on drop
    - Optimistic UI update with rollback on error
    - Handle edge cases (drag to same column, invalid states)
    - Animate card movement
  - Filtering within Kanban:
    - Filter by collection (multi-select)
    - Filter by priority
    - Filter by tags
    - Search in summary/notes
  - Loading states (skeleton columns)
  - Empty states per column ("No open tasks")
- [ ] Implement task detail modal:
  - Full-screen or large modal
  - Edit all fields inline (summary, notes, priority, due date, tags, status)
  - Show collection with link to collection detail
  - Show referenced tabs with:
    - Folder context ("Documentation › API Docs")
    - ⭐ indicator if tab is primary reference
    - Remove tab reference button
    - Add more tab references (checkbox list from collection)
  - Comments section:
    - Display all comments with timestamps
    - Add new comment (textarea + submit)
    - Edit/delete own comments
    - Markdown support (basic)
  - Activity log (created, status changes, assignments)
  - Keyboard shortcuts (e.g., Cmd+Enter to save)
- [ ] NO business logic - all via chrome.runtime.sendMessage()

#### 7.2.5 Tasks View - Calendar (4-6h) **NEW**
- [ ] Create `/dashboard/modules/views/tasks-calendar.js` (~400 lines)
- [ ] Implement calendar view:
  - Month/week/day view toggle
  - Group tasks by due date on calendar grid
  - Show task count per day
  - Color-code by priority
  - Click day to see tasks in detail panel
  - **Drag tasks to change due date**:
    - Visual feedback during drag
    - Update dueDate via message on drop
    - Handle edge cases (drag to past, drag to no date)
  - Loading states
  - Empty states ("No tasks with due dates")
- [ ] Implement task hover preview:
  - Show task summary, priority, collection on hover
  - Quick actions (mark fixed, edit)
- [ ] NO business logic - all via chrome.runtime.sendMessage()

#### 7.2.7 Tasks Reporting (2-3h) **NEW**
- [ ] Create `/dashboard/modules/views/tasks-reporting.js` (~250 lines)
- [ ] Implement reporting dashboard:
  - Completed this week (grouped by day, bar chart)
  - Overdue tasks (list with collection context)
  - Tasks by collection (pie chart or bar chart)
  - Average completion time
  - Task velocity (tasks completed per week, line chart)
  - Export reports as CSV
- [ ] Charts using existing Chart.js from analytics
- [ ] NO business logic - all via chrome.runtime.sendMessage()

#### 7.3 Navigation Integration (1-2h)
- [ ] Update `/dashboard/dashboard.html`:
  - Add "Collections" to sidebar navigation
  - Add "Tasks" to sidebar navigation
  - Add icons (📁 Collections, ✓ Tasks)
- [ ] Update `/dashboard/dashboard.js`:
  - Add routes: `#collections`, `#tasks`
  - Default view: `#tabs` (no breaking changes)
  - Navigation between views

#### 7.4 Unified Search Enhancement (1-2h)
- [ ] Update dashboard search to include collections and tasks:
  - Search in collection name, description, tags
  - Search in task summary, notes, tags
  - Show results grouped by type (Tabs / Collections / Tasks)
  - Click result → navigate to detail view

#### 7.5 Integration Testing (2h)
- [ ] Test Collections view loads and displays
- [ ] Test Tasks view (Kanban board) loads
- [ ] Test calendar view for tasks
- [ ] Test creating/editing collections
- [ ] Test creating/editing tasks
- [ ] Test bulk operations (delete, archive)
- [ ] Test drag-and-drop (tasks between columns, reorder)
- [ ] Test unified search includes collections/tasks
- [ ] Test navigation between views
- [ ] Test with 100+ collections and 500+ tasks (performance)

**Success Criteria**:
- [ ] Collections view displays with grid/list toggle
- [ ] Tasks view displays as Kanban board and calendar
- [ ] Collection detail modal allows full editing
- [ ] Task detail modal allows full editing
- [ ] Drag-and-drop works (status changes, reordering)
- [ ] Bulk operations work (archive, delete, export)
- [ ] Unified search finds collections and tasks
- [ ] NO business logic in dashboard/*.js (all via messages)
- [ ] Performance acceptable (< 500ms load for 100 collections)

**Deliverables**:
- `/dashboard/modules/views/collections.js` (~500 lines, increased)
- `/dashboard/modules/views/tasks-kanban.js` (~500 lines) **NEW**
- `/dashboard/modules/views/tasks-calendar.js` (~400 lines) **NEW**
- `/dashboard/modules/views/tasks-reporting.js` (~250 lines) **NEW**
- Updated `/dashboard/dashboard.html`
- Updated `/dashboard/dashboard.js`

---

## Testing Strategy

### Unit Tests (300+ new tests)
- [ ] Phase 1: 65 tests (db, CollectionStorage, TaskStorage)
- [ ] Phase 2: 130 tests (selection, execution services)
- [ ] Phase 6: 55 tests (orchestration services)
- [ ] Total: 250+ unit tests for services
- [ ] Target: 100% coverage for business logic

### Integration Tests
- [ ] Multi-window scenarios (activate/restore in different windows)
- [ ] Service worker restart scenarios (IndexedDB persistence)
- [ ] Message passing across surfaces (popup, sidepanel, dashboard)
- [ ] Real-time updates (create in dashboard → appears in sidepanel)
- [ ] Performance with 100+ collections, 500+ tasks, 50+ tabs per collection

### Browser Integration Tests
- [ ] Add scenarios to test-panel:
  - "tabtasktick-basic-workflow" (save → close → restore)
  - "tabtasktick-task-workflow" (create task → open tabs → mark fixed)
  - "tabtasktick-persistence" (restart browser → collections restored)
- [ ] Manual testing checklist (all surfaces)

---

## Success Metrics

### MVP Launch (v1.3.0)
- [ ] Collections created with one-click "Save Window"
- [ ] Collections persist across browser restarts
- [ ] Tasks created with tab references
- [ ] Tasks open tabs automatically (restore collection if needed)
- [ ] Side panel provides quick access
- [ ] Dashboard provides full management
- [ ] All 300+ tests pass
- [ ] No regressions in existing TabMaster features
- [ ] Performance targets met:
  - [ ] Collection save < 200ms for 50 tabs
  - [ ] Collection restore < 3s for 50 tabs
  - [ ] Task tab open < 500ms
  - [ ] Side panel load < 300ms for 50 collections
  - [ ] Dashboard load < 500ms for 100 collections

### User Adoption (30 days post-launch)
- [ ] 70% of users save at least 1 collection in first week
- [ ] Average 3 active + 5 saved collections per user
- [ ] Collections opened/closed 5+ times per day
- [ ] Average open windows reduced from 5 → 2
- [ ] 50% of users create at least 1 task
- [ ] Average 8 active tasks per user

---

## Timeline & Milestones (UPDATED per UX review)

### Sprint 1-2: Foundation + Services ✅ COMPLETE
**Weeks 1-3** (22-28h):
- [x] Phase 1: IndexedDB + Storage (10-12h)
- [x] Phase 2: Core Services (12-16h)
- [x] Milestone: 691 passing tests, services fully functional ✅

### Sprint 3-5: Side Panel (24-29h)
**Weeks 4-7** (increased from 2 weeks):
- [ ] Phase 3: Side Panel UI (24-29h)
  - Includes Collection Detail View (new)
  - Includes Search & Filters Infrastructure (restored)
  - Includes UI State Management (new)
  - Includes notification/modal components (new)
- [ ] Milestone: Side panel working with Collections + Tasks views + detail views

### Sprint 6-7: Popup + Context Menus (14-18h)
**Weeks 8-9** (increased from 1 week):
- [ ] Phase 4: Popup Enhancement (8-10h)
  - Includes progressive discovery flow (new)
- [ ] Phase 5: Context Menus (6-8h)
  - Includes modal components (new)
- [ ] Milestone: Discovery flow complete with onboarding

### Sprint 8-9: Operations (12-14h)
**Weeks 10-11**:
- [ ] Phase 6: Orchestration Services (12-14h)
  - Includes enhanced error handling (new)
  - Includes edge case coverage (new)
- [ ] Milestone: Full workflow (capture → restore → task execution) working

### Sprint 10-13: Dashboard (20-24h)
**Weeks 12-15** (increased from 2 weeks to 4 weeks):
- [ ] Phase 7: Dashboard Integration (20-24h)
  - Phase 7a: Collections View (6-8h) with drag-drop
  - Phase 7b: Tasks Kanban (8-10h) with drag-drop
  - Phase 7c: Tasks Calendar (4-6h) (new)
  - Phase 7d: Tasks Reporting (2-3h) (new)
- [ ] Milestone: All surfaces complete, full feature parity

### Sprint 14: Testing & Polish (10-14h)
**Week 16**:
- [ ] Integration testing
- [ ] Performance optimization
- [ ] Bug fixes and refinement
- [ ] Documentation updates
- [ ] Release preparation

**Total Timeline**: 102-127 hours (13-16 weeks at 8h/week)
**Previous Estimate**: 68-84 hours (under-estimated by ~40%)
**Increase Rationale**: UX complexity (drag-drop, modals, state management, search/filters, progressive discovery, calendar views) not captured in original estimate

---

## Risk Management

### High Risk Items
1. **IndexedDB Quota** (Mitigation: quota monitoring, cleanup UI, limit 50MB)
2. **Window Restoration Performance** (Mitigation: batch operations, progress indicators)
3. **State Synchronization** (Mitigation: WindowTrackingService, chrome.tabs listeners)

### Medium Risk Items
1. **Service Worker Restarts** (Mitigation: lazy initialization, IndexedDB persistence)
2. **Tab Group Recreation** (Mitigation: store full state, test thoroughly)
3. **Nested Updates** (Mitigation: transaction handling, rollback on errors)

### Low Risk Items
1. **Message Passing** (Mitigation: proven pattern from TabMaster)
2. **UI Performance** (Mitigation: virtual scrolling, pagination)

---

## Architecture Compliance Checklist

- [ ] **One Behavior**: Same functionality across all surfaces ✅
- [ ] **Services-First**: All logic in `/services/*` ✅
- [ ] **No Magic**: Every option is explicit ✅
- [ ] **Deterministic**: Same inputs → same outputs ✅
- [ ] **Maintainable**: Small PRs, strong tests, clear docs ✅
- [ ] **Separation of Concerns**: Selection separate from Execution ✅
- [ ] **Message Passing**: UI → Message → Background → Service ✅
- [ ] **No Dynamic Imports**: Static imports only ✅
- [ ] **IndexedDB**: Indexed queries, transaction handling ✅
- [ ] **Error Handling**: Graceful degradation ✅

---

## Next Steps

1. **Start Phase 1**: Create `/docs/tabtasktick-data-models-v2.md`
2. **Setup IndexedDB**: Implement `/services/storage/db.js`
3. **Storage Services**: Build CollectionStorage and TaskStorage
4. **Write Tests First**: TDD approach for data integrity
5. **Commit Frequently**: Small, focused commits

---

## Resources

- **Proposal**: `/plans/TABTASKTICK-PRODUCT-PROPOSAL-V2.md`
- **Architecture**: `/docs/service-dependencies.md`
- **Patterns**: `/docs/service-usage-examples.md`
- **TabMaster Services**: Reference for patterns

---

**Last Updated**: 2025-10-13
**Status**: Ready to begin Phase 1
**Next Review**: After Phase 1 complete
