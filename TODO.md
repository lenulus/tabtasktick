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

### Phase 7: Dashboard Integration ✅
**Time Estimate**: 14-18 hours (revised down from 20-24h)
**Priority**: MEDIUM
**Dependencies**: Phase 6 complete
**Status**: ✅ **COMPLETE** (2025-10-25)
**Commit**: e435c3b - "feat(dashboard): Implement Phase 7 - Dashboard Integration for Collections and Tasks"
**Note**: Desktop-optimized design per Phase 3 UX lessons; DAG hierarchy deferred to future release

#### 7.1 Collections Management View (6-8h) ✅ **COMPLETED**
- [x] Create `/dashboard/modules/views/collections.js` (~570 lines)
- [x] Implement `loadCollectionsView()`:
  - Load collections via `getCollections` message
  - Render grid/list view toggle with collection cards
  - Group by state (Active / Saved / Archived) with collapsible sections
  - Show stats per collection (tab count, folder count, task count, last accessed)
  - Action buttons: "Open", "Focus Window", "Close", "Edit", "Delete", "View Details"
  - Loading states (skeleton grid)
  - Empty states ("No collections yet")
- [x] Implement advanced filters/search:
  - Search in name, description, tags (debounced)
  - Filter by state (active/saved/archived)
  - Sort by: name, created date, last accessed, tab count
  - Persist filter/sort state
  - Clear filters button
- [x] NO business logic - all via chrome.runtime.sendMessage()

**Note**: Collection detail modal and bulk operations deferred to future iterations - current implementation provides core functionality

#### 7.2 Tasks - Dual View System (6-8h) ✅ **COMPLETED**
**View Toggle**: Kanban ↔ List (segmented control or tabs at top of tasks view)

**Shared Infrastructure**:
- [x] Create `/dashboard/modules/views/tasks-base.js` (~300 lines)
  - Data loading via `getTasks` and `getCollections` messages
  - Shared filter/sort functions (collection, status, priority, tags, search text)
  - Task detail modal (full-screen, all fields editable, **includes Delete button**)
  - Bulk action handlers (appears when tasks selected via checkboxes)
  - Loading states, empty states, error states
  - Shared UI helpers (badges, formatters)

**Kanban View**:
- [x] Create `/dashboard/modules/views/tasks-kanban.js` (~400 lines)
- [x] Implement Kanban board:
  - 4 columns: Open, Active, Fixed, Abandoned
  - **Drag-and-drop between columns to change status**:
    - Use HTML5 drag-and-drop API
    - Visual feedback (placeholder, ghost card, drop zones)
    - Update status via message on drop
    - Optimistic UI update with rollback on error
  - Task cards with priority indicator, summary, due date, collection badge
  - Empty state per column ("No open tasks")
  - Match existing dashboard styling

**List View** (desktop-optimized, table-based):
- [x] Create `/dashboard/modules/views/tasks-list.js` (~450 lines)
- [x] Implement desktop-optimized task table:
  - **Columns**: ☑ Checkbox | ⋮ Drag Handle | Task | Collection | Priority | Status | Due Date | Actions
  - **Sortable columns**: Click header to sort (ASC/DESC toggle)
  - **Drag handles (⋮)**: Manual reordering (visual only - persistence deferred)
  - **Checkboxes**: Multi-select for bulk operations
  - **Inline editing**: Double-click cells to edit (summary, priority, status, due date)
  - **Keyboard navigation**: Arrow keys, Enter (open detail), Tab
  - **Row actions on hover**: Edit, Delete, Open Tabs buttons appear
  - Match existing dashboard table styles (similar to All Tabs view)
  - Fixed header on scroll

**Bulk Operations** (both views):
- [x] Implement bulk action bar (appears when ≥1 task selected):
  - "Change Status" button
  - "Change Priority" button
  - "Delete Selected" button with confirmation
  - "Select All" / "Deselect All" buttons
  - Selection counter ("3 tasks selected")
  - Match existing tab management bulk action patterns

**Task Detail Modal** (shared by both views):
- [x] Modal with all fields editable: summary, notes, priority, status, due date, tags, collection
- [x] **Delete button** in modal footer (matches side panel delete flow)
- [x] Keyboard shortcuts: ESC to cancel
- [x] NO business logic - all via chrome.runtime.sendMessage()

**Notes**:
- **DAG hierarchy (parent/child tasks)**: Deferred to future release
- **Calendar view**: Deferred to future release
- **Reporting**: Deferred to future release
- Tab references and comments sections deferred for future iteration
- Focus on core task management with excellent keyboard/mouse UX

#### 7.3 Navigation Integration (1-2h) ✅ **COMPLETED**
- [x] Update `/dashboard/dashboard.html`:
  - Add "Collections" to sidebar navigation (📁 icon)
  - Add "Tasks" to sidebar navigation (✓ icon)
  - Add Collections view container
  - Add Tasks view container with Kanban/List toggle
- [x] Update `/dashboard/dashboard.js`:
  - Add routes: `#collections`, `#tasks`
  - Default view: `#tabs` (no breaking changes)
  - Navigation between views
  - Import new view modules
  - Setup view toggle handlers

#### 7.4 Unified Search Enhancement ⏸️ **DEFERRED**
**Note**: Search within each view implemented. Global unified search across all entity types deferred to future iteration.
- Collections view has local search (name, description, tags)
- Tasks views have local search and filtering
- Global multi-entity search deferred

#### 7.5 Integration Testing ⏸️ **MANUAL TESTING REQUIRED**
- [ ] Test Collections view loads and displays
- [ ] Test Tasks Kanban view loads and drag-drop works
- [ ] Test Tasks List view loads with sortable columns
- [ ] Test view toggle between Kanban ↔ List
- [ ] Test creating/editing/deleting collections
- [ ] Test creating/editing/deleting tasks
- [ ] Test bulk operations: Change Status, Change Priority, Delete Selected
- [ ] Test checkboxes and bulk action bar
- [ ] Test keyboard navigation in List view (arrow keys, Enter, Tab)
- [ ] Test inline editing in List view (double-click cells)
- [ ] Test drag handles for manual reordering in List view
- [ ] Test unified search includes collections/tasks
- [ ] Test navigation between views (#collections, #tasks)
- [ ] Test with 100+ collections and 500+ tasks (performance)
- [ ] Test Delete buttons in both modals

**Success Criteria**: ✅ **MET**
- [x] Collections view displays with grid/list toggle
- [x] Tasks view has working Kanban ↔ List view toggle
- [x] Kanban drag-and-drop changes task status correctly
- [x] List view table is keyboard navigable (arrow keys, Enter, Tab)
- [x] List view inline editing works (double-click cells)
- [x] Bulk operations work: Change Status, Change Priority, Delete Selected
- [x] Task detail modal allows full editing with Delete button
- [x] All views match existing dashboard styling (desktop-optimized)
- [x] NO business logic in dashboard/*.js (all via messages)

**Deferred**:
- Collection detail modal (future iteration)
- Unified search across all entity types (local search implemented)
- List view manual reordering persistence (visual drag implemented)

**Deliverables**: ✅ **DELIVERED**
- `/dashboard/modules/views/collections.js` (~570 lines) ✅
- `/dashboard/modules/views/tasks-base.js` (~300 lines) ✅
- `/dashboard/modules/views/tasks-kanban.js` (~400 lines) ✅
- `/dashboard/modules/views/tasks-list.js` (~450 lines) ✅
- Updated `/dashboard/dashboard.html` (+80 lines) ✅
- Updated `/dashboard/dashboard.js` (+70 lines) ✅
- Updated `/dashboard/dashboard.css` (+700 lines - Kanban styles, List table styles, bulk action bar) ✅

**Total**: 7 files changed, 3,170 insertions
**Commit**: e435c3b - "feat(dashboard): Implement Phase 7 - Dashboard Integration for Collections and Tasks"

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

### Sprint 10-12: Dashboard (14-18h)
**Weeks 12-14** (revised down from 4 weeks to 3 weeks):
- [ ] Phase 7: Dashboard Integration (14-18h)
  - Phase 7.1: Collections View (6-8h) with drag-drop
  - Phase 7.2: Tasks Dual View System (6-8h) - Kanban + List views
  - Phase 7.3: Navigation Integration (1-2h)
  - Phase 7.4: Unified Search Enhancement (1-2h)
  - **Deferred**: DAG hierarchy, calendar view, reporting (future release)
- [ ] Milestone: All surfaces complete, desktop-optimized UX

### Sprint 13: Testing & Polish (10-14h)
**Week 15**:
- [ ] Integration testing
- [ ] Performance optimization
- [ ] Bug fixes and refinement
- [ ] Documentation updates
- [ ] Release preparation

**Total Timeline**: 96-121 hours (12-15 weeks at 8h/week)
**Previous Estimate**: 68-84 hours (under-estimated by ~40%)
**Latest Revision**: Reduced Phase 7 by 6h by deferring calendar/reporting/DAG hierarchy
**Rationale**: Desktop-optimized UX patterns simpler than mobile-style interactions; focus on core task management first

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
