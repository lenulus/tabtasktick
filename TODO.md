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
**Time Estimate**: 8-10 hours
**Priority**: MEDIUM
**Dependencies**: Phase 3 complete
**Status**: 🔴 Not Started
**Note**: Simplified popup to show counts/deep links. Smart emoji suggestion moved to side panel (section 4.2.7).

#### 4.1 Popup Layout Update (Simplified - Mirror Dashboard) (2-3h)
- [ ] Update `/popup/popup.html`:
  - Add "💡 Try Collections" banner at top (dismissible with X button)
  - Add **Counts & Deep Links Section** (mirror dashboard structure):
    - Collections count with deep link: "📁 12 Collections (5 active) → Open Collections"
    - Tasks count with deep link: "✓ 8 Tasks (3 open, 2 active) → Open Tasks"
    - Links open side panel to specific view
  - Add "💾 Save This Window" button → opens side panel with create collection modal
  - Keep existing TabMaster features below (collapsible section)
- [ ] Update `/popup/popup.css`:
  - Style counts section (large numbers, prominent icons)
  - Style deep links (clickable, hover effect)
  - Banner styling (light blue background, dismissible X, border)
  - "Save This Window" button styling (prominent CTA)
  - Responsive sizing (adapt to popup width constraints)

#### 4.2 Popup JS Updates (Simplified - Counts & Deep Links) (1-2h)
- [ ] Update `/popup/popup.js`:
  - Load collection counts via `getCollections` message:
    - Total count, active count, saved count
  - Load task counts via `getTasks` message:
    - Total count, open count, active count, fixed count
  - Render counts section:
    - Collections: "📁 12 Collections (5 active)" → clickable
    - Tasks: "✓ 8 Tasks (3 open, 2 active)" → clickable
  - Handle deep links:
    - Collections link → open side panel to Collections view
    - Tasks link → open side panel to Tasks view
    - "Save This Window" button → open side panel with create collection modal pre-populated
  - Handle banner dismiss:
    - Save dismissal state in chrome.storage.local with timestamp
    - Don't show again for 7 days
    - Fade out animation
  - Implement progressive discovery:
    - If no collections: Show banner + "Save This Window" emphasis
    - If has collections but no tasks: Show task creation prompt
    - If has both: Show counts only
  - Handle errors gracefully (connection lost, service worker asleep)
  - Loading states for counts
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

#### 4.2.6 Side Panel Deep Link Integration (1h) **NEW**
- [ ] Update side panel to handle deep link navigation:
  - Accept URL parameters or message payload: `view=collections` or `view=tasks`
  - Accept `createCollection=true` to open create collection modal
  - Pre-populate create collection modal with current window info (if opened from popup)
  - Switch to appropriate view on deep link
- [ ] Add message handlers in `/sidepanel/panel.js`:
  - `openSidePanelView` message handler (takes view name: 'collections', 'tasks')
  - `openCreateCollectionModal` message handler (takes optional windowId to pre-populate)
  - Handle focus (bring side panel to front if already open)

#### 4.2.7 Smart Emoji Suggestion (Side Panel) (2h) **NEW**
- [ ] Create `/services/utils/emoji-suggestions.js`:
  - **Keyword-to-emoji mappings** (60+ common categories):
    - Work: `work`, `job`, `office`, `business` → 💼
    - Code: `code`, `dev`, `programming`, `github` → 💻
    - Bug: `bug`, `fix`, `issue`, `error` → 🐛
    - Documentation: `docs`, `documentation`, `wiki` → 📚
    - Research: `research`, `learn`, `study`, `reading` → 🔬
    - Shopping: `shop`, `buy`, `purchase`, `amazon` → 🛒
    - Finance: `finance`, `money`, `banking`, `tax` → 💰
    - Health: `health`, `medical`, `doctor`, `fitness` → 🏥
    - Travel: `travel`, `vacation`, `trip`, `flight` → ✈️
    - Food: `food`, `recipe`, `cooking`, `restaurant` → 🍔
    - Home: `home`, `house`, `renovation`, `furniture` → 🏠
    - Personal: `personal`, `life`, `family` → 👤
    - Creative: `design`, `art`, `creative` → 🎨
    - Music: `music`, `spotify`, `playlist` → 🎵
    - Video: `video`, `youtube`, `watch` → 📹
    - Social: `social`, `friends`, `chat` → 💬
    - Education: `school`, `university`, `course`, `class` → 🎓
    - Project: `project`, `plan`, `organize` → 📋
    - Ideas: `idea`, `brainstorm`, `notes` → 💡
    - Urgent: `urgent`, `critical`, `asap` → 🚨
    - (Add 40+ more categories)
  - **Multi-word matching**: Check all words in name, prioritize first word
  - **Case-insensitive matching**: Normalize to lowercase
  - **Fallback to random**: If no keyword match, pick from popular emoji set (📁, 📂, 📌, 🔖, ⭐, 🎯, etc.)
  - **Export function**: `suggestEmoji(collectionName) → emoji string`
- [ ] Integrate into side panel collection creation:
  - Update create collection modal in `/sidepanel/collections-view.js`
  - Run `suggestEmoji()` on name input
  - Update emoji suggestion as user types (debounced 300ms)
  - Pre-fill emoji field with suggestion
  - Show "✨ Suggested" badge next to emoji
  - Allow user to change emoji (keep existing emoji picker)
  - Remove badge when user manually selects emoji
- [ ] Integrate into dashboard collection creation:
  - Same suggestion logic in "Create Collection" modal
  - Update `/dashboard/modules/views/collections.js`
  - Same UX as side panel (debounced, badge, picker override)
- [ ] Add to CaptureWindowService:
  - When creating collection from window, suggest emoji based on window title
  - Pass suggested emoji to collection creation
- [ ] Unit tests:
  - Test keyword matching (various categories)
  - Test multi-word names ("Work Project" → 💼)
  - Test case insensitivity ("WORK" → 💼)
  - Test fallback to random (no matching keywords)
  - Test name updates (typing "wor" → no match, "work" → 💼)
  - Test debouncing (rapid typing → only one suggestion)

**Smart Suggestions Examples**:
- "Work Project" → 💼
- "GitHub Issues" → 💻
- "Bug Fixes" → 🐛
- "Documentation Review" → 📚
- "Research OAuth" → 🔬
- "Amazon Shopping List" → 🛒
- "Tax Prep 2024" → 💰
- "House Renovation" → 🏠
- "Random Window" → 📁 (fallback)

**UX Benefits**:
- Reduces cognitive load (one less decision)
- Collections visually distinct (unique emojis)
- Users can still override (emoji picker available)
- Delightful micro-interaction (✨ badge)
- Works in both side panel and dashboard

#### 4.3 Integration Testing (1-2h)
- [ ] Test popup opens and shows counts section
- [ ] Test collections count displays correctly
- [ ] Test tasks count displays correctly
- [ ] Test deep links open side panel to correct view
- [ ] Test "Save This Window" button opens side panel with create modal
- [ ] Test create modal pre-populated with current window info
- [ ] Test emoji auto-suggestion in side panel (based on collection name)
- [ ] Test emoji suggestion updates as user types (debounced)
- [ ] Test emoji picker override (manual selection removes ✨ badge)
- [ ] Test fallback to random emoji (no keyword match)
- [ ] Test emoji suggestion in dashboard create modal
- [ ] Test banner dismissal persists
- [ ] Test progressive discovery (show banner when no collections)
- [ ] Test existing TabMaster features still work

**Success Criteria**:
- [ ] Banner promotes Collections effectively
- [ ] Counts section shows accurate numbers (collections, tasks)
- [ ] Deep links navigate to correct side panel views
- [ ] "Save This Window" button opens side panel with pre-populated create modal
- [ ] Emoji auto-suggested based on keywords (60+ categories)
- [ ] "✨ Suggested" badge shown for auto-suggested emojis
- [ ] Users can override suggested emoji in side panel and dashboard
- [ ] Emoji suggestion works in both side panel and dashboard
- [ ] Banner dismissal persists (7 days)
- [ ] Progressive discovery works (banner → counts)
- [ ] Existing TabMaster features unaffected
- [ ] NO business logic in popup/*.js (all via messages)

**Deliverables**:
- Updated `/popup/popup.html` (~40 lines simplified)
- Updated `/popup/popup.css` (~60 lines - counts section styling)
- Updated `/popup/popup.js` (~80 lines - counts, deep links)
- Updated `/sidepanel/panel.js` (+40 lines - deep link handlers)
- Updated `/sidepanel/collections-view.js` (+60 lines - emoji suggestion integration)
- `/services/utils/emoji-suggestions.js` (~150 lines - keyword mappings)
- Updated `/services/execution/CaptureWindowService.js` (+20 lines - emoji suggestion integration)
- Updated `/dashboard/modules/views/collections.js` (+30 lines - emoji suggestion in create modal)
- `/tests/emoji-suggestions.test.js` (~100 lines - unit tests)

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

### Phase 8: Progressive Collection Sync (Real-time Tracking)
**Time Estimate**: 10-14 hours
**Priority**: HIGH
**Dependencies**: Phase 6 complete
**Status**: 🔴 Not Started
**Reference**: V3 Proposal Appendix A (Progressive Save Behavior)

**Context**: Collections should progressively sync as users work, not just on window close. This keeps collection state current and enables real-time collaboration features in the future.

#### 8.1 Data Model Updates (1-2h)
- [ ] Add `settings` field to Collection model:
  ```javascript
  {
    id: string,
    name: string,
    // ... existing fields ...
    settings: {
      trackingEnabled: boolean,  // Default: true
      autoSync: boolean,         // Default: true (sync on every change)
      syncDebounceMs: number     // Default: 2000 (2s debounce)
    }
  }
  ```
- [ ] Update `/services/utils/storage-queries.js`:
  - Add settings field to collection schema
  - Migration for existing collections (add default settings)
- [ ] Update CollectionService:
  - Add `updateCollectionSettings(collectionId, settings)` method
  - Validate settings on update

#### 8.2 Progressive Sync Service (4-6h)
- [ ] Create `/services/execution/ProgressiveSyncService.js`:
  - **Tab tracking**:
    - `chrome.tabs.onCreated` → add tab to collection folder
    - `chrome.tabs.onRemoved` → remove tab from collection
    - `chrome.tabs.onMoved` → update tab position
    - `chrome.tabs.onUpdated` → sync URL/title/favicon/pinned changes
    - `chrome.tabs.onAttached` → handle tab moved between windows
    - `chrome.tabs.onDetached` → handle tab moved out of collection window
  - **Tab Group tracking**:
    - `chrome.tabGroups.onCreated` → create folder in collection
    - `chrome.tabGroups.onUpdated` → update folder (name/color/collapsed)
    - `chrome.tabGroups.onRemoved` → remove folder from collection
    - `chrome.tabGroups.onMoved` → update folder position
  - **Debounced batch updates**:
    - Queue changes in memory (avoid excessive IndexedDB writes)
    - Flush queue every N seconds (configurable per collection)
    - Immediate flush on critical events (window close, tab group delete)
  - **Conflict resolution**:
    - Handle rapid changes (e.g., user moves 50 tabs quickly)
    - Use transaction batching to ensure atomicity
    - Last-write-wins strategy for simple conflicts
  - **Performance optimization**:
    - Only track active collections (isActive=true)
    - Skip tracking if collection.settings.trackingEnabled=false
    - Batch reads/writes to minimize IndexedDB transactions
    - Cache collection settings in memory to avoid repeated lookups

#### 8.3 Background Integration (2-3h)
- [ ] Update `/tabmaster-pro/background-integrated.js`:
  - Import ProgressiveSyncService
  - Initialize service on startup
  - Register all Chrome event listeners
  - Add error handling and logging
  - Performance monitoring (track sync operations per second)
- [ ] Add sync status to window metadata:
  - Track last sync timestamp per collection
  - Track pending changes count
  - Expose via `getCollectionSyncStatus` message handler

#### 8.4 UI Affordances - Collection Settings (2-3h)
- [ ] Add tracking settings to Collection Detail modals:
  - **Side Panel** (`/sidepanel/collection-detail.js`):
    - Add "Settings" section (collapsible)
    - Toggle: "Track changes in real-time" (trackingEnabled)
    - Toggle: "Auto-sync" (autoSync) - disabled if tracking off
    - Slider: "Sync delay" (syncDebounceMs) - 0s to 10s
    - Info text: "When enabled, changes to tabs and groups sync automatically"
  - **Dashboard** (`/dashboard/modules/views/collections.js`):
    - Same settings in collection edit modal
    - Bulk operation: "Enable/Disable tracking for selected collections"
- [ ] Add sync status indicator:
  - Show last sync timestamp ("Synced 2 min ago")
  - Show pending changes badge ("3 changes pending")
  - Show sync in progress spinner
- [ ] Visual feedback:
  - Toast notification on successful sync (optional, user preference)
  - Warning icon if tracking disabled
  - Error badge if sync fails (with retry button)

#### 8.5 Edge Cases & Error Handling (1-2h)
- [ ] Handle Chrome API errors:
  - Tab/TabGroup API failures (retry with exponential backoff)
  - IndexedDB write failures (queue changes in chrome.storage.local)
  - Service worker restarts mid-sync (resume from last checkpoint)
- [ ] Handle user actions:
  - User closes collection while sync pending (flush immediately)
  - User disables tracking (stop listeners, clear queue)
  - User re-enables tracking (re-sync current state)
- [ ] Handle rapid changes:
  - Coalesce multiple updates to same tab (keep only latest)
  - Batch folder position changes
  - Prevent duplicate event processing
- [ ] Data integrity:
  - Validate collection exists before syncing
  - Validate window still bound to collection
  - Handle orphaned tabs (tab exists in collection but window closed)

#### 8.6 Testing (2-3h)
- [ ] Unit tests for ProgressiveSyncService:
  - Test debouncing logic (rapid changes → single update)
  - Test batch operations (50 tabs added → single transaction)
  - Test settings validation (invalid debounce values)
  - Test conflict resolution (concurrent updates)
- [ ] E2E tests (Playwright):
  - Create active collection
  - Add/remove tabs → verify collection syncs
  - Move tabs between groups → verify folder sync
  - Create/delete tab groups → verify folder sync
  - Disable tracking → verify no sync
  - Re-enable tracking → verify re-sync
  - Close window with pending changes → verify flush
  - Test with 100+ tabs (performance)
- [ ] Performance tests:
  - Measure sync latency (< 100ms for single tab change)
  - Measure batch sync time (< 500ms for 50 tabs)
  - Measure memory usage (queue should be bounded)
  - Test service worker restart recovery

**Success Criteria**:
- [ ] Active collections sync automatically as user works
- [ ] Tab/group changes reflected in IndexedDB within 2s (default debounce)
- [ ] Users can enable/disable tracking per collection
- [ ] No performance degradation with 10+ active collections
- [ ] Sync survives service worker restarts (queue persisted)
- [ ] UI shows sync status clearly
- [ ] All 40+ tests pass

**Deliverables**:
- `/services/execution/ProgressiveSyncService.js` (~400 lines)
- Updated `/services/execution/CollectionService.js` (+50 lines - settings methods)
- Updated `/services/utils/storage-queries.js` (+30 lines - settings field)
- Updated `/tabmaster-pro/background-integrated.js` (+80 lines - listener setup)
- Updated `/sidepanel/collection-detail.js` (+120 lines - settings UI)
- Updated `/dashboard/modules/views/collections.js` (+100 lines - settings modal)
- `/tests/progressive-sync.test.js` (~200 lines - unit tests)
- `/tests/e2e/progressive-sync.spec.js` (~300 lines - E2E tests)

**Performance Targets**:
- Single tab change sync: < 100ms
- Batch sync (50 tabs): < 500ms
- Memory overhead: < 5MB per active collection
- Service worker restart recovery: < 200ms

**Notes**:
- Default: tracking enabled, 2s debounce
- Users managing 100+ tabs may want longer debounce (reduce IndexedDB writes)
- Future: expose sync metrics in dashboard (operations/sec, total syncs, errors)

---

### Phase 9: Collection Import/Export
**Time Estimate**: 6-8 hours
**Priority**: HIGH
**Dependencies**: Phase 2 complete
**Status**: 🔴 Not Started

**Context**: Users need to backup collections, share with team members, and migrate between devices. This is different from the existing session import/export which handles TabMaster data.

#### 9.1 Collection Export Service (2-3h)
- [ ] Create `/services/execution/CollectionExportService.js`:
  - **Export single collection**:
    - Include all metadata (name, description, icon, color, tags, settings)
    - Include all folders with positions
    - Include all tabs with positions, notes, URLs
    - Include all tasks with comments, tab references
    - Export format: JSON (human-readable)
  - **Export multiple collections**:
    - Batch export (array of collections)
    - Preserves relationships (tasks reference correct tabs)
  - **Export options**:
    - Include/exclude tasks (default: include)
    - Include/exclude settings (default: include)
    - Include/exclude metadata (createdAt, lastAccessed)
  - **File naming**:
    - Single: `collection-{name}-{timestamp}.json`
    - Multiple: `collections-export-{timestamp}.json`
  - Uses chrome.downloads API to save file

#### 9.2 Collection Import Service (2-3h)
- [ ] Create `/services/execution/CollectionImportService.js`:
  - **Import single collection**:
    - Parse JSON file
    - Validate schema (required fields, data types)
    - Generate new UUIDs (avoid ID conflicts)
    - Preserve folder/tab positions
    - Recreate tasks with updated tab references
    - Set isActive=false (imported as saved collections)
  - **Import multiple collections**:
    - Batch import with progress tracking
    - Handle partial failures (some collections invalid)
  - **Conflict resolution**:
    - Duplicate names: append " (imported)" suffix
    - Duplicate URLs: allow (different collections can have same tabs)
    - Task references to missing tabs: warn user, remove invalid references
  - **Import options**:
    - Merge vs Replace (merge: add to existing, replace: delete all first)
    - Import tasks (default: true)
    - Import settings (default: true)
  - **Validation errors**:
    - Report invalid JSON
    - Report missing required fields
    - Report unsupported schema version
  - Uses chrome.downloads API to read file

#### 9.3 Background Message Handlers (1h)
- [ ] Update `/tabmaster-pro/background-integrated.js`:
  - Add `exportCollection` message handler:
    - Takes collectionId or array of collectionIds
    - Calls CollectionExportService
    - Returns download URL
  - Add `exportAllCollections` message handler:
    - Exports all collections (active + saved)
    - Calls CollectionExportService.exportMultiple
  - Add `importCollection` message handler:
    - Takes file data (JSON string)
    - Calls CollectionImportService
    - Returns imported collection IDs and errors
  - Error handling for all handlers

#### 9.4 UI Integration (1-2h)
- [ ] Update Dashboard Collections View:
  - Add "Export" button per collection card (dropdown menu)
  - Add "Export Selected" bulk action (when collections selected)
  - Add "Export All" button in toolbar
  - Add "Import Collection" button in toolbar
  - File picker dialog for import (accept=".json")
  - Progress modal for import (show progress, errors)
  - Success toast with count ("Imported 3 collections")
  - Error toast with details ("2 collections failed: invalid schema")
- [ ] Update Side Panel Collections View:
  - Add "Export" option in collection context menu
  - Add "Import Collection" button in header
  - Same file picker and progress UI as dashboard

#### 9.5 Testing (1-2h)
- [ ] Unit tests for CollectionExportService:
  - Export single collection with all data
  - Export multiple collections
  - Export options (exclude tasks, exclude settings)
  - File naming correctness
- [ ] Unit tests for CollectionImportService:
  - Import valid single collection
  - Import valid multiple collections
  - Handle invalid JSON
  - Handle missing required fields
  - Generate new UUIDs (no ID conflicts)
  - Conflict resolution (duplicate names)
  - Task reference validation (remove invalid refs)
- [ ] E2E tests (Playwright):
  - Export collection → import → verify identical data
  - Export all → import → verify all restored
  - Import collection with tasks → verify task references correct
  - Import duplicate name → verify suffix added
  - Import invalid JSON → verify error shown
  - Test with 50 collections (performance)

**Success Criteria**:
- [ ] Users can export individual collections to JSON files
- [ ] Users can export all collections in bulk
- [ ] Users can import collections from JSON files
- [ ] Import preserves all data (folders, tabs, tasks, settings)
- [ ] Import generates new UUIDs (no conflicts)
- [ ] Import handles errors gracefully with clear messages
- [ ] All 30+ tests pass

**Deliverables**:
- `/services/execution/CollectionExportService.js` (~200 lines)
- `/services/execution/CollectionImportService.js` (~250 lines)
- Updated `/tabmaster-pro/background-integrated.js` (+60 lines - message handlers)
- Updated `/dashboard/modules/views/collections.js` (+80 lines - export/import UI)
- Updated `/sidepanel/collections-view.js` (+40 lines - export/import UI)
- `/tests/collection-export.test.js` (~150 lines)
- `/tests/collection-import.test.js` (~200 lines)
- `/tests/e2e/collection-import-export.spec.js` (~250 lines)

**JSON Schema Example**:
```json
{
  "version": "1.0",
  "exportedAt": 1234567890,
  "collections": [
    {
      "name": "Project X",
      "description": "...",
      "icon": "📁",
      "color": "#667eea",
      "tags": ["work", "backend"],
      "settings": { "trackingEnabled": true, "syncDebounceMs": 2000 },
      "folders": [
        {
          "name": "Documentation",
          "color": "blue",
          "collapsed": false,
          "position": 0,
          "tabs": [
            {
              "url": "https://...",
              "title": "...",
              "note": "...",
              "position": 0,
              "isPinned": false
            }
          ]
        }
      ],
      "tasks": [
        {
          "summary": "Fix auth bug",
          "status": "open",
          "priority": "high",
          "tabReferences": [
            { "folderIndex": 0, "tabIndex": 0 }
          ],
          "comments": [...]
        }
      ]
    }
  ]
}
```

**Notes**:
- Export format uses nested structure for portability (easier to read/edit)
- Import converts to normalized storage model
- Task tab references use folder/tab indices in export, converted to IDs on import

---

### Phase 10: Dashboard Keyboard Controls
**Time Estimate**: 8-10 hours
**Priority**: MEDIUM
**Dependencies**: Phase 7 complete
**Status**: 🔴 Not Started

**Context**: Power users need keyboard shortcuts for fast task creation and actions in the dashboard. This is scoped to dashboard only, not global keyboard bindings.

#### 10.1 Keyboard Shortcuts System (2-3h)
- [ ] Create `/dashboard/modules/keyboard-shortcuts.js`:
  - **Keyboard event handler**:
    - Global keydown listener on dashboard
    - Key combination parser (Ctrl/Cmd + key)
    - Modal-aware (disable shortcuts when modal open)
    - Input-aware (disable shortcuts when typing in input/textarea)
  - **Shortcut registry**:
    - Register shortcut with key combo, action, description
    - Unregister shortcut
    - Check if shortcut available (not conflicting)
  - **Shortcut categories**:
    - Navigation (switch views)
    - Collections (create, open, focus)
    - Tasks (create, edit, change status)
    - General (search, help)

#### 10.2 Task Shortcuts (3-4h)
- [ ] Implement task keyboard shortcuts in dashboard:
  - **`n` or `c`**: Create new task (opens task modal)
  - **`e`**: Edit selected task (if one selected)
  - **`d`**: Delete selected task (with confirmation)
  - **`t`**: Open tabs for selected task
  - **`1-4`**: Change priority (1=low, 2=med, 3=high, 4=critical)
  - **`s`**: Cycle status (open → active → fixed)
  - **`o`**: Filter by status: Open
  - **`a`**: Filter by status: Active
  - **`f`**: Filter by status: Fixed
  - **`/`**: Focus search box
  - **`Esc`**: Clear search, deselect tasks, close modals
  - **`↑/↓`**: Navigate tasks (in list view)
  - **`Enter`**: Open task detail modal (when task focused)
  - **`Space`**: Toggle task selection (checkbox)
  - **`Shift+↑/↓`**: Multi-select tasks

#### 10.3 Collection Shortcuts (2h)
- [ ] Implement collection keyboard shortcuts in dashboard:
  - **`n` or `c`**: Create new collection (opens collection modal)
  - **`e`**: Edit selected collection
  - **`d`**: Delete selected collection (with confirmation)
  - **`o`**: Open selected collection (restore as window)
  - **`w`**: Focus window (if active collection)
  - **`x`**: Close window (if active collection)
  - **`/`**: Focus search box
  - **`Esc`**: Clear search, deselect collections
  - **`↑/↓`**: Navigate collections (in list view)
  - **`Enter`**: Open collection detail (when collection focused)
  - **`Space`**: Toggle collection selection (checkbox)

#### 10.4 Global Navigation Shortcuts (1h)
- [ ] Implement navigation shortcuts:
  - **`g` then `c`**: Go to Collections view
  - **`g` then `t`**: Go to Tasks view
  - **`g` then `a`**: Go to All Tabs view (existing TabMaster)
  - **`g` then `s`**: Go to Settings
  - **`?`**: Show keyboard shortcuts help modal

#### 10.5 Help Modal (2-3h)
- [ ] Create keyboard shortcuts help modal:
  - **Trigger**: `?` key or "Keyboard Shortcuts" menu item
  - **Layout**:
    - Modal with searchable shortcut list
    - Grouped by category (Tasks, Collections, Navigation, General)
    - Each shortcut shows: Key combo + Description
    - Visual keyboard key styling (like GitHub)
  - **Search**:
    - Filter shortcuts by name or key combo
    - Highlight matching text
  - **Styling**:
    - Desktop-optimized (matches dashboard design)
    - Purple gradient header
    - Keyboard key badges (rounded, bordered)
  - **Accessibility**:
    - Focus trap (can't tab outside modal)
    - Close with `Esc` or click outside
    - Screen reader support (aria-labels)
- [ ] Add "Keyboard Shortcuts" menu item to dashboard header (? icon)

#### 10.6 Visual Feedback (1h)
- [ ] Add visual indicators for keyboard navigation:
  - Focus ring on keyboard-navigated items (distinct from mouse hover)
  - Keyboard-selected items have blue outline
  - Show tooltip hints ("Press Enter to open")
  - Transient toast on shortcut use ("Task created (n)")
- [ ] Add keyboard icon badges to buttons (show shortcut on hover)

#### 10.7 Testing (1h)
- [ ] E2E tests (Playwright):
  - Test all task shortcuts (create, edit, delete, status, priority)
  - Test all collection shortcuts (create, edit, delete, open)
  - Test navigation shortcuts (g+c, g+t)
  - Test help modal (`?` opens, `Esc` closes, search works)
  - Test shortcuts disabled when modal open
  - Test shortcuts disabled when typing in input
  - Test arrow key navigation (up/down, multi-select)
  - Test focus ring visibility
- [ ] Accessibility tests:
  - Screen reader announces shortcuts
  - Focus trap in help modal works
  - All shortcuts accessible (no mouse required)

**Success Criteria**:
- [ ] All task shortcuts work in dashboard
- [ ] All collection shortcuts work in dashboard
- [ ] Navigation shortcuts work across views
- [ ] `?` opens help modal with searchable shortcuts
- [ ] Visual feedback for keyboard navigation (focus ring)
- [ ] Shortcuts disabled when typing in inputs
- [ ] Shortcuts disabled when modal open
- [ ] All 25+ tests pass

**Deliverables**:
- `/dashboard/modules/keyboard-shortcuts.js` (~300 lines)
- Updated `/dashboard/modules/views/tasks-list.js` (+150 lines - keyboard handlers)
- Updated `/dashboard/modules/views/tasks-kanban.js` (+100 lines - keyboard handlers)
- Updated `/dashboard/modules/views/collections.js` (+120 lines - keyboard handlers)
- `/dashboard/modules/help-modal.js` (~200 lines - shortcuts help)
- Updated `/dashboard/dashboard.js` (+80 lines - global shortcuts, help modal)
- Updated `/dashboard/dashboard.css` (+100 lines - focus ring, keyboard key styles)
- `/tests/e2e/dashboard-keyboard.spec.js` (~400 lines)

**Keyboard Shortcuts Summary**:

| Shortcut | Action | Context |
|----------|--------|---------|
| `n` or `c` | Create new task/collection | Tasks/Collections view |
| `e` | Edit selected | Any view |
| `d` | Delete selected | Any view |
| `t` | Open tabs for task | Tasks view |
| `1-4` | Set priority | Tasks view |
| `s` | Cycle status | Tasks view |
| `o/a/f` | Filter by status | Tasks view |
| `/` | Focus search | Any view |
| `Esc` | Clear/deselect/close | Any view |
| `↑/↓` | Navigate items | Any view |
| `Enter` | Open detail | Any view |
| `Space` | Toggle selection | Any view |
| `g+c` | Go to Collections | Global |
| `g+t` | Go to Tasks | Global |
| `?` | Show shortcuts help | Global |

**Notes**:
- Shortcuts follow GitHub/VS Code conventions where possible
- `g` then `X` pattern for navigation (inspired by Gmail)
- Single-letter shortcuts for common actions (n=new, e=edit, d=delete)
- Number keys for priority (fast triage)
- Focus ring distinct from mouse hover (accessibility)

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
- [ ] Collections sync automatically in real-time (progressive sync)
- [ ] Users can enable/disable tracking per collection
- [ ] Collections exportable/importable (backup, share, migrate)
- [ ] Emoji auto-suggested based on keywords (60+ categories)
- [ ] Tasks created with tab references
- [ ] Tasks open tabs automatically (restore collection if needed)
- [ ] Side panel provides quick access
- [ ] Dashboard provides full management
- [ ] Dashboard keyboard controls work (`?` help modal, fast task triage)
- [ ] All 400+ tests pass (progressive sync + import/export + keyboard + emoji)
- [ ] No regressions in existing TabMaster features
- [ ] Performance targets met:
  - [ ] Collection save < 200ms for 50 tabs
  - [ ] Collection restore < 3s for 50 tabs
  - [ ] Progressive sync < 100ms for single tab change
  - [ ] Progressive sync < 500ms for 50 tabs (batch)
  - [ ] Collection export < 500ms for single collection
  - [ ] Collection import < 1s for single collection
  - [ ] Emoji suggestion < 10ms (instant as user types)
  - [ ] Task tab open < 500ms
  - [ ] Side panel load < 300ms for 50 collections
  - [ ] Dashboard load < 500ms for 100 collections
  - [ ] Keyboard shortcut response < 50ms

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
  - Simplified popup with counts/deep links (new approach)
  - Progressive discovery flow (new)
  - Smart emoji suggestion in side panel (new)
- [ ] Phase 5: Context Menus (6-8h)
  - Includes modal components (new)
- [ ] Milestone: Discovery flow complete with counts/deep links and emoji suggestions

### Sprint 8-9: Operations (12-14h)
**Weeks 10-11**:
- [ ] Phase 6: Orchestration Services (12-14h)
  - Includes enhanced error handling (new)
  - Includes edge case coverage (new)
- [ ] Milestone: Full workflow (capture → restore → task execution) working

### Sprint 10-12: Dashboard ✅ COMPLETE
**Weeks 12-14** (revised down from 4 weeks to 3 weeks):
- [x] Phase 7: Dashboard Integration (14-18h)
  - Phase 7.1: Collections View (6-8h) with drag-drop
  - Phase 7.2: Tasks Dual View System (6-8h) - Kanban + List views
  - Phase 7.3: Navigation Integration (1-2h)
  - Phase 7.4: Unified Search Enhancement (1-2h)
  - **Deferred**: DAG hierarchy, calendar view, reporting (future release)
- [x] Milestone: All surfaces complete, desktop-optimized UX ✅

### Sprint 13: Progressive Sync (10-14h)
**Weeks 15-16**:
- [ ] Phase 8: Progressive Collection Sync (10-14h)
  - Phase 8.1: Data Model Updates (1-2h)
  - Phase 8.2: Progressive Sync Service (4-6h)
  - Phase 8.3: Background Integration (2-3h)
  - Phase 8.4: UI Affordances (2-3h)
  - Phase 8.5: Edge Cases & Error Handling (1-2h)
  - Phase 8.6: Testing (2-3h)
- [ ] Milestone: Collections sync in real-time, tracking on/off per collection

### Sprint 14: Import/Export (6-8h)
**Week 17**:
- [ ] Phase 9: Collection Import/Export (6-8h)
  - Phase 9.1: Collection Export Service (2-3h)
  - Phase 9.2: Collection Import Service (2-3h)
  - Phase 9.3: Background Message Handlers (1h)
  - Phase 9.4: UI Integration (1-2h)
  - Phase 9.5: Testing (1-2h)
- [ ] Milestone: Collections exportable/importable, shareable with team

### Sprint 15: Keyboard Controls (8-10h)
**Week 18**:
- [ ] Phase 10: Dashboard Keyboard Controls (8-10h)
  - Phase 10.1: Keyboard Shortcuts System (2-3h)
  - Phase 10.2: Task Shortcuts (3-4h)
  - Phase 10.3: Collection Shortcuts (2h)
  - Phase 10.4: Global Navigation Shortcuts (1h)
  - Phase 10.5: Help Modal (2-3h)
  - Phase 10.6: Visual Feedback (1h)
  - Phase 10.7: Testing (1h)
- [ ] Milestone: Power users can navigate dashboard without mouse, `?` help modal works

### Sprint 16: Testing & Polish (10-14h)
**Week 19**:
- [ ] Integration testing
- [ ] Performance optimization
- [ ] Bug fixes and refinement
- [ ] Documentation updates
- [ ] Release preparation

**Total Timeline**: 120-153 hours (15-19 weeks at 8h/week)
**Previous Estimate**: 122-155 hours
**Latest Revision**:
- Added Phase 9 (Import/Export) and Phase 10 (Keyboard Controls)
- Added Phase 4.2.7 (Smart Emoji Suggestion in Side Panel)
- Simplified Phase 4 popup to counts/deep links (reduced from 10-12h to 8-10h)
**Rationale**:
- Progressive sync is core to value proposition (collections stay current)
- Import/Export enables backup, sharing, migration between devices
- Keyboard controls critical for power users (fast task triage)
- Smart emoji suggestions reduce cognitive load (works in side panel + dashboard)
- Simplified popup mirrors dashboard structure (clearer mental model)

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

**Current Focus**: Phase 8 (Progressive Collection Sync)

1. **Phase 8**: Implement Progressive Collection Sync
   - Add `settings` field to Collection model
   - Create ProgressiveSyncService with Chrome event listeners
   - Add UI affordances for tracking enable/disable
   - Test with 100+ tab scenarios

2. **Phase 9**: Collection Import/Export
   - Implement CollectionExportService (JSON format)
   - Implement CollectionImportService (validation, UUID generation)
   - Add UI in dashboard and side panel

3. **Phase 10**: Dashboard Keyboard Controls
   - Keyboard shortcuts system
   - Task shortcuts (n, e, d, 1-4, s, etc.)
   - Collection shortcuts
   - `?` help modal with searchable shortcuts

4. **Testing & Polish**: Final integration testing and release prep

---

## Resources

- **Proposal**: `/plans/TABTASKTICK-PRODUCT-PROPOSAL-V2.md`
- **Architecture**: `/docs/service-dependencies.md`
- **Patterns**: `/docs/service-usage-examples.md`
- **TabMaster Services**: Reference for patterns

---

**Last Updated**: 2025-10-25
**Status**: Phase 7 complete, Phases 8-10 added (Progressive Sync + Import/Export + Keyboard Controls)
**Next Review**: After Phase 10 complete (ready for v1.3.0 release)
