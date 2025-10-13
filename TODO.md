# TabMaster Pro + LinkStash - Implementation TODO

## Project Status

**TabMaster Pro V2 Architecture**: ✅ COMPLETE (Phases 1-9)
- 13 services fully documented with comprehensive JSDoc
- Services-first architecture proven and battle-tested
- Selection/execution separation established
- Message passing patterns working across all surfaces
- Multi-window support with robust test infrastructure
- 457 automated tests passing + 9 browser integration scenarios
- Production release: v1.2.6

**Current Development**: LinkStash Integration (Collections & Workspaces)
- Branch: `1.3` (feature development)
- Version: 1.3.0 (in development)
- Main branch: `main` (1.2.x - bug fixes only)

**Branching Strategy**:
- `main`: 1.2.x line - bug fixes and maintenance for current release
- `1.3`: Feature development branch for LinkStash (Collections & Workspaces)
- When ready: Rebase 1.3 changes onto main for release
- Development happens on `1.3`, releases ship from `main`

**Next: LinkStash Implementation** - Building Collections & Workspaces on V2 foundation

---

## Overview: LinkStash Implementation Strategy

**Goal**: Add Collections & Workspaces feature to TabMaster Pro without breaking existing architecture

**Approach**: Follow proven V2 patterns from Phases 1-9
- Use chrome.storage.local (not IndexedDB) for collection metadata
- Reuse existing service patterns (WindowService, SnoozeService, ScheduledExportService)
- Build services first, UI surfaces thin
- Message passing for cross-process communication
- Test infrastructure already in place (multi-window support from Phase 8.0)

**Timeline**: 40-60 hours for MVP (Phases 1-5), 80-120 hours including advanced features (Phases 6-7)

**Architecture Fitness**: 9/10 - Excellent foundation, minimal architecture changes needed

---

## LinkStash Implementation Phases

### Phase 1: Foundation - Storage & Data Models ⏳
**Time Estimate**: 6-8 hours
**Priority**: CRITICAL - Must complete first
**Dependencies**: None (builds on existing chrome.storage patterns)

**Architecture Decision**: Use chrome.storage.local, NOT IndexedDB
- **Rationale**:
  - Current architecture uses chrome.storage.local for all metadata (SnoozeService, ScheduledExportService)
  - Better MV3 service worker compatibility (survives restarts)
  - No IndexedDB complexity (schema migrations, async queries, quota)
  - Collections metadata is small (<10KB per collection)
  - Chrome storage quota is 10MB (room for 1000+ collections)
  - Screenshots can use chrome.downloads (like ExportImportService)

#### Tasks

1. **Define Collection Data Model** (1h)
   - [x] Read existing data models (SnoozeService tab metadata, WindowService metadata)
   - [ ] Create `/docs/linkstash-data-models.md`
   - [ ] Define Collection interface with states (dormant/active/working)
   - [ ] Define CollectionLink interface with tab state
   - [ ] Document storage keys and structure
   - [ ] Review with architecture-guardian agent

2. **Create CollectionStorage Service** (2-3h)
   - [ ] Create `/services/storage/CollectionStorage.js` (~150 lines)
   - [ ] Implement `saveCollection(collection)` - save to chrome.storage.local
   - [ ] Implement `getCollection(id)` - retrieve from storage
   - [ ] Implement `queryCollections(filters)` - filter collections array
   - [ ] Implement `deleteCollection(id)` - remove from storage
   - [ ] Add storage change listeners for cache invalidation
   - [ ] Follow SnoozeService lazy initialization pattern for service worker restarts

3. **Create Collection ID Generation** (0.5h)
   - [ ] Use `crypto.randomUUID()` (like WindowService uses for snoozeId)
   - [ ] Add timestamp prefix for sorting: `col_${Date.now()}_${uuid}`
   - [ ] Document ID format in data models doc

4. **Add Storage Quota Monitoring** (1h)
   - [ ] Create `getStorageQuota()` helper in CollectionStorage
   - [ ] Warn at 80% quota usage (8MB of 10MB)
   - [ ] Add quota display to Settings page (reuse existing storage stats)
   - [ ] Plan for cleanup: oldest dormant collections first

5. **Create Screenshot Storage Pattern** (1-2h)
   - [ ] Reuse ExportImportService pattern (chrome.downloads API)
   - [ ] `saveScreenshot(collectionId, dataUrl)` → downloads folder
   - [ ] Store download ID in collection metadata
   - [ ] `loadScreenshot(collectionId)` → retrieve from downloads
   - [ ] Handle download not found (graceful degradation)

6. **Unit Tests** (1-2h)
   - [ ] Create `/tests/CollectionStorage.test.js`
   - [ ] Test CRUD operations (25 tests like BookmarkService.test.js)
   - [ ] Test filtering and querying
   - [ ] Test quota monitoring
   - [ ] Test service worker restart scenario
   - [ ] Mock chrome.storage.local API

**Success Criteria**:
- [ ] Collections can be saved/loaded from chrome.storage.local
- [ ] Storage quota monitoring works
- [ ] Screenshot storage integrated with chrome.downloads
- [ ] All unit tests pass
- [ ] Service worker restarts don't lose state
- [ ] No chrome.storage quota violations

**Files Created**:
- `/docs/linkstash-data-models.md` (~5KB)
- `/services/storage/CollectionStorage.js` (~150 lines)
- `/tests/CollectionStorage.test.js` (~40 tests, ~200 lines)

---

### Phase 2: Core Collection Services ⏳
**Time Estimate**: 10-14 hours
**Priority**: HIGH
**Dependencies**: Phase 1 complete
**Pattern**: Follow WindowService + SnoozeService orchestration pattern

#### Tasks

1. **Create Selection Service** (2-3h)
   - [ ] Create `/services/selection/selectCollections.js` (~200 lines)
   - [ ] Implement `selectCollections(filters)` - query with filters
     - Filter by: state (dormant/active/working)
     - Filter by: tags (array contains)
     - Filter by: search query (name/description match)
     - Filter by: hasActiveTabs (working state check)
   - [ ] Follow selectTabs.js pattern exactly (proven in Phase 1.4)
   - [ ] Add `selectLinksInCollection(collectionId, filters)` - filter links
   - [ ] Return standardized Collection[] array
   - [ ] Add 15 unit tests (like selectTabs.test.js)

2. **Create CollectionService (Orchestrator)** (3-4h)
   - [ ] Create `/services/execution/CollectionService.js` (~300 lines)
   - [ ] Follow WindowService orchestrator pattern (Phase 8.1)
   - [ ] Implement `createCollection(params)` - create new collection
     - Required: name, links[]
     - Optional: description, tags, icon, color, state
     - Generate ID via crypto.randomUUID()
     - Default state: 'dormant'
     - Save via CollectionStorage
     - Return created collection
   - [ ] Implement `updateCollection(id, updates)` - update existing
     - Merge updates with existing data
     - Validate state transitions
     - Save via CollectionStorage
   - [ ] Implement `deleteCollection(id)` - remove collection
     - Clean up storage
     - Clean up screenshots via chrome.downloads
     - Notify UI surfaces via chrome.runtime.sendMessage
   - [ ] Implement `addLinksToCollection(id, links)` - add new links
     - Append to links array
     - Update position indexes
     - Save collection
   - [ ] Add error handling (collection not found, storage quota, etc.)

3. **Create CollectionStateMachine** (2-3h)
   - [ ] Create `/services/execution/CollectionStateMachine.js` (~150 lines)
   - [ ] Define valid state transitions:
     - dormant → active (activate collection)
     - active → working (start task)
     - working → active (pause work)
     - active → dormant (deactivate)
     - working → dormant (deactivate)
   - [ ] Implement `transition(collectionId, fromState, toState, options)`
     - Validate transition is allowed
     - Execute state-specific logic
     - Update collection state
     - Return transition result
   - [ ] Handle invalid transitions gracefully (error, not crash)

4. **Create CollectionTabTracker** (2-3h)
   - [ ] Create `/services/execution/CollectionTabTracker.js` (~200 lines)
   - [ ] Track which tabs belong to which collections (active/working)
   - [ ] Implement `trackTab(collectionId, linkId, tabId)` - map link → tab
   - [ ] Implement `untrackTab(tabId)` - remove mapping
   - [ ] Implement `getTabsForCollection(collectionId)` - query mappings
   - [ ] Implement `getCollectionForTab(tabId)` - reverse lookup
   - [ ] Listen to chrome.tabs.onRemoved - update collection state when tabs close
   - [ ] Listen to chrome.tabs.onUpdated - update link state (URL changes)
   - [ ] Store mappings in chrome.storage.local (persist across restarts)
   - [ ] Handle service worker restarts (reload mappings)

5. **Add Background Message Handlers** (1-2h)
   - [ ] Update `/tabmaster-pro/background-integrated.js`
   - [ ] Add message handlers (follow Phase 8.1 WindowService pattern):
     - `case 'createCollection'` → CollectionService.createCollection()
     - `case 'updateCollection'` → CollectionService.updateCollection()
     - `case 'deleteCollection'` → CollectionService.deleteCollection()
     - `case 'getCollections'` → selectCollections()
     - `case 'getCollection'` → CollectionStorage.getCollection()
     - `case 'addLinksToCollection'` → CollectionService.addLinksToCollection()
   - [ ] Add error handling and sendResponse() for all handlers
   - [ ] Initialize CollectionTabTracker on startup

6. **Unit Tests** (2h)
   - [ ] Create `/tests/CollectionService.test.js` (~30 tests)
   - [ ] Test createCollection with various params
   - [ ] Test updateCollection edge cases
   - [ ] Test deleteCollection cleanup
   - [ ] Create `/tests/CollectionStateMachine.test.js` (~15 tests)
   - [ ] Test valid/invalid transitions
   - [ ] Create `/tests/CollectionTabTracker.test.js` (~20 tests)
   - [ ] Test tab tracking and cleanup
   - [ ] Test service worker restart scenario

**Success Criteria**:
- [ ] Collections can be created/updated/deleted via services
- [ ] State transitions validated and enforced
- [ ] Tab tracking works when tabs open/close externally
- [ ] All message handlers respond correctly
- [ ] Service worker restarts don't break tab tracking
- [ ] All 65+ unit tests pass

**Files Created**:
- `/services/selection/selectCollections.js` (~200 lines)
- `/services/execution/CollectionService.js` (~300 lines)
- `/services/execution/CollectionStateMachine.js` (~150 lines)
- `/services/execution/CollectionTabTracker.js` (~200 lines)
- `/tests/CollectionService.test.js` (~30 tests, ~200 lines)
- `/tests/CollectionStateMachine.test.js` (~15 tests, ~100 lines)
- `/tests/CollectionTabTracker.test.js` (~20 tests, ~150 lines)

---

### Phase 3: Side Panel UI ⏳
**Time Estimate**: 8-10 hours
**Priority**: HIGH
**Dependencies**: Phase 2 complete
**Pattern**: THIN surface with message passing (follow dashboard pattern)

#### Tasks

1. **Create Side Panel HTML/CSS** (2-3h)
   - [ ] Create `/sidepanel/panel.html` (~200 lines)
   - [ ] Reuse dashboard CSS patterns (consistent styling)
   - [ ] Create side panel layout:
     - Header with search and "New Collection" button
     - Sections: WORKING / ACTIVE / DORMANT
     - Collection cards with icon, name, tab count, state indicator
     - "Open" button per collection
   - [ ] Create `/sidepanel/panel.css` (~150 lines)
   - [ ] Responsive design (250px min width, works at any height)
   - [ ] Follow TabMaster Pro color scheme (--primary, --secondary, etc.)

2. **Create Side Panel JS (THIN)** (3-4h)
   - [ ] Create `/sidepanel/panel.js` (~300 lines)
   - [ ] Class: `LinkStashPanel` (follow dashboard module pattern)
   - [ ] Initialize:
     - Load collections via `chrome.runtime.sendMessage({ action: 'getCollections' })`
     - Setup event listeners (buttons, search)
     - Listen for background messages (collection.created, collection.updated, etc.)
   - [ ] Implement `saveCurrentWindow()`:
     - Get current window tabs via chrome.tabs.query()
     - Suggest name from top domain (like existing tab grouping)
     - Send `createCollection` message to background
     - Show success notification
   - [ ] Implement `handleCollectionClick()`:
     - Send `activateWorkspace` message to background (Phase 5 feature)
     - Show loading indicator during activation
   - [ ] Implement `renderCollections(collections)`:
     - Group by state (working/active/dormant)
     - Render collection cards with metadata
     - Add action buttons (Open, Edit, Delete)
   - [ ] Implement search/filter UI (filter locally, no backend)
   - [ ] NO business logic - all operations via message passing

3. **Update manifest.json** (0.5h)
   - [ ] Add side_panel configuration:
     ```json
     "side_panel": {
       "default_path": "sidepanel/panel.html"
     }
     ```
   - [ ] Add side panel open action to toolbar icon (optional click → open panel)

4. **Add Quick Save Feature** (1-2h)
   - [ ] Create `/sidepanel/quick-save.js` (~100 lines)
   - [ ] Add "Quick Save" button in side panel header
   - [ ] Show modal with:
     - Auto-suggested name (from tabs)
     - Icon picker (emoji selector)
     - Tag input (comma-separated)
     - "Save" and "Cancel" buttons
   - [ ] On save: send `createCollection` message
   - [ ] Show confirmation toast

5. **Integration Testing** (1-2h)
   - [ ] Test side panel opens via toolbar icon
   - [ ] Test loading collections from background
   - [ ] Test saving current window as collection
   - [ ] Test quick save flow
   - [ ] Test search/filter functionality
   - [ ] Test real-time updates (create collection in dashboard → appears in panel)
   - [ ] Test with 50+ collections (scrolling, performance)

**Success Criteria**:
- [ ] Side panel opens from toolbar icon
- [ ] Collections load and display correctly
- [ ] "Save Window" creates collection with correct tabs
- [ ] Quick save modal works with name suggestions
- [ ] Search filters collections locally
- [ ] Real-time updates work across surfaces
- [ ] No business logic in sidepanel/*.js (all via messages)
- [ ] UI responsive and consistent with TabMaster style

**Files Created**:
- `/sidepanel/panel.html` (~200 lines)
- `/sidepanel/panel.css` (~150 lines)
- `/sidepanel/panel.js` (~300 lines)
- `/sidepanel/quick-save.js` (~100 lines)

---

### Phase 4: Dashboard Integration ⏳
**Time Estimate**: 8-10 hours
**Priority**: HIGH
**Dependencies**: Phase 3 complete
**Pattern**: Add new dashboard view (follow tabs/groups/rules pattern)

#### Tasks

1. **Create Collections View Module** (3-4h)
   - [ ] Create `/dashboard/modules/views/collections.js` (~400 lines)
   - [ ] Follow existing view pattern (tabs.js, groups.js)
   - [ ] Implement `loadCollectionsView()`:
     - Send `getCollections` message to background
     - Group by state (working/active/reference/dormant)
     - Render collection grid with cards
   - [ ] Implement collection card rendering:
     - Icon, name, description
     - Tab count, state badge
     - Last accessed time
     - Action buttons (Activate, Edit, Delete)
   - [ ] Implement `showCollectionDetails(collectionId)`:
     - Modal with links list
     - Link metadata (URL, title, role, pinned)
     - Edit capabilities (rename links, reorder, delete)
     - Task list (if Phase 6 implemented)
   - [ ] Implement bulk actions:
     - Select multiple collections (checkboxes)
     - "Delete Selected" button
     - "Export Selected" button
   - [ ] NO business logic - all operations via messages

2. **Add Collections Navigation** (1h)
   - [ ] Update `/dashboard/dashboard.html`:
     - Add "Collections" to sidebar navigation
     - Add icon (📚 or 📁)
   - [ ] Update `/dashboard/dashboard.js`:
     - Add route: `#collections` → `loadCollectionsView()`
     - Default view on first load: `#tabs` (no breaking changes)
   - [ ] Test navigation between views

3. **Create Collection Editor** (2-3h)
   - [ ] Create `/dashboard/modules/collection-editor.js` (~300 lines)
   - [ ] Show modal for editing collection:
     - Name, description, icon, color, tags
     - Links list with drag-and-drop reorder
     - Link details: URL, title, role (primary/reference/related)
     - Pin link checkbox
     - Delete link button
     - Add new link input
   - [ ] On save: send `updateCollection` message
   - [ ] Validate inputs (name required, valid URLs)
   - [ ] Show save/cancel buttons

4. **Add Context Menu Actions** (1-2h)
   - [ ] Update `/tabmaster-pro/background-integrated.js`:
   - [ ] Add context menu items:
     - "Save Tab to Collection" → submenu with recent collections
     - "Create Collection from Group" → convert tab group
     - "Add to Workspace" → add to active workspace
   - [ ] Follow Phase 8.1 WindowService context menu pattern
   - [ ] Context menu handlers (THIN):
     - Get selected tab/group
     - Call CollectionService via direct import (same process)
     - Show notification on success

5. **Unified Search Enhancement** (1-2h)
   - [ ] Update dashboard search to include collections:
     - Search in collection name
     - Search in collection description
     - Search in link URLs/titles within collections
   - [ ] Show collection results in search dropdown
   - [ ] Click result → navigate to collection details

6. **Integration Testing** (1h)
   - [ ] Test Collections view loads and displays
   - [ ] Test navigation between tabs/groups/collections views
   - [ ] Test creating collection from dashboard
   - [ ] Test editing collection (name, links, metadata)
   - [ ] Test deleting collection
   - [ ] Test bulk operations (select + delete multiple)
   - [ ] Test context menu actions
   - [ ] Test unified search includes collections
   - [ ] Test with 100+ collections (performance)

**Success Criteria**:
- [ ] Collections view added to dashboard sidebar
- [ ] Collection cards display with proper styling
- [ ] Collection editor modal works (edit name, links, metadata)
- [ ] Context menu "Save to Collection" works
- [ ] Unified search finds collections by name/description
- [ ] Bulk actions work (delete, export)
- [ ] No business logic in dashboard/*.js (all via messages)
- [ ] Performance acceptable with 100+ collections

**Files Created**:
- `/dashboard/modules/views/collections.js` (~400 lines)
- `/dashboard/modules/collection-editor.js` (~300 lines)

**Files Modified**:
- `/dashboard/dashboard.html` (add nav item)
- `/dashboard/dashboard.js` (add route)
- `/tabmaster-pro/background-integrated.js` (add context menus)

---

### Phase 5: Workspace Activation ⏳
**Time Estimate**: 6-8 hours
**Priority**: MEDIUM
**Dependencies**: Phase 4 complete
**Pattern**: Follow SnoozeService alarm + WindowService orchestration pattern

#### Tasks

1. **Create ActivateWorkspace Service** (3-4h)
   - [ ] Create `/services/execution/ActivateWorkspace.js` (~250 lines)
   - [ ] Follow WindowService pattern (Phase 8.1)
   - [ ] Implement `activateWorkspace(collectionId, options)`:
     - Options: openPinned (default true), createNewWindow (default false), restorationMode
     - Get collection from CollectionStorage
     - Validate collection exists
     - Determine target window (new or current)
     - Store original focused window for restoration (follow WindowService pattern)
     - Open links as tabs:
       - If openPinned=true: only pinned links
       - If openPinned=false: all links
       - Use chrome.tabs.create() with windowId, pinned, active=false
     - Update collection state to 'working'
     - Track tabs via CollectionTabTracker (linkId → tabId)
     - Update workingState: { windowId, openTabs, activated: Date.now() }
     - Restore original window focus (follow WindowService pattern)
     - Return { collection, tabs }

2. **Create DeactivateWorkspace Service** (1-2h)
   - [ ] Create `/services/execution/DeactivateWorkspace.js` (~150 lines)
   - [ ] Implement `deactivateWorkspace(collectionId, options)`:
     - Options: preserveState (default true), closeWindow (default false)
     - Get collection from CollectionStorage
     - If preserveState: capture tab state (scroll, form data) - Phase 6 feature
     - Get tabs from CollectionTabTracker
     - Close tabs via chrome.tabs.remove()
     - If closeWindow: close window via chrome.windows.remove()
     - Update collection state to 'dormant'
     - Clear workingState
     - Untrack tabs via CollectionTabTracker
     - Return { closed: tabCount }

3. **Create SaveWorkspaceState Service** (1-2h)
   - [ ] Create `/services/execution/SaveWorkspaceState.js` (~150 lines)
   - [ ] Implement `saveWorkspaceState(collectionId)`:
     - Get collection from CollectionStorage
     - Get tabs from CollectionTabTracker
     - For each tab:
       - Update link.tabState.lastAccessed = Date.now()
       - Capture basic state (no scroll/form data in MVP)
     - Update collection metadata.lastAccessed
     - Save collection via CollectionStorage
     - Return { saved: linkCount }

4. **Add Background Message Handlers** (0.5h)
   - [ ] Update `/tabmaster-pro/background-integrated.js`:
   - [ ] Add message handlers:
     - `case 'activateWorkspace'` → ActivateWorkspace.activateWorkspace()
     - `case 'deactivateWorkspace'` → DeactivateWorkspace.deactivateWorkspace()
     - `case 'saveWorkspaceState'` → SaveWorkspaceState.saveWorkspaceState()
   - [ ] Handle callerWindowId for focus restoration

5. **Update UI Surfaces** (1-2h)
   - [ ] Update sidepanel/panel.js:
     - "Open" button → send `activateWorkspace` message
     - Show loading indicator during activation
     - Handle success/error responses
   - [ ] Update dashboard/modules/views/collections.js:
     - "Activate" button → send `activateWorkspace` message
     - "Close Workspace" button → send `deactivateWorkspace` message
     - Show state transitions visually (dormant → working)
   - [ ] Add keyboard shortcut (optional):
     - Cmd+Shift+W: Save current window as workspace
     - Cmd+Shift+A: Activate last workspace

6. **Unit Tests** (1-2h)
   - [ ] Create `/tests/ActivateWorkspace.test.js` (~20 tests)
   - [ ] Test activation with various options
   - [ ] Test window focus restoration
   - [ ] Test tab tracking integration
   - [ ] Create `/tests/DeactivateWorkspace.test.js` (~15 tests)
   - [ ] Test deactivation and cleanup
   - [ ] Test state preservation
   - [ ] Create `/tests/SaveWorkspaceState.test.js` (~10 tests)
   - [ ] Test state capture and save

7. **Integration Testing** (1h)
   - [ ] Test activating workspace from sidepanel
   - [ ] Test activating workspace from dashboard
   - [ ] Test workspace opens in correct window
   - [ ] Test window focus restored to original
   - [ ] Test deactivating workspace closes tabs
   - [ ] Test saving workspace state updates lastAccessed
   - [ ] Test with 30+ tabs in workspace (performance)

**Success Criteria**:
- [ ] Activating workspace opens tabs correctly
- [ ] Window focus restored to caller after activation
- [ ] Deactivating workspace closes tabs and updates state
- [ ] Tab tracking works (collection → tabs mapping)
- [ ] Workspace state saved on deactivation
- [ ] Performance acceptable (< 800ms for 20 tabs)
- [ ] All 45+ unit tests pass
- [ ] No breaking changes to existing features

**Files Created**:
- `/services/execution/ActivateWorkspace.js` (~250 lines)
- `/services/execution/DeactivateWorkspace.js` (~150 lines)
- `/services/execution/SaveWorkspaceState.js` (~150 lines)
- `/tests/ActivateWorkspace.test.js` (~20 tests, ~150 lines)
- `/tests/DeactivateWorkspace.test.js` (~15 tests, ~100 lines)
- `/tests/SaveWorkspaceState.test.js` (~10 tests, ~80 lines)

---

## Phase 6: Task System (OPTIONAL - Defer to v2.0) 🔜
**Time Estimate**: 20-30 hours
**Priority**: LOW (after MVP validation)
**Dependencies**: Phase 5 complete

**Scope**: Context-aware task management integrated with collections
- Task-link relationships (which links needed for task)
- Task states (pending/active/blocked/completed)
- Work session tracking
- Time estimates vs actual
- Auto-open/close links when starting/completing tasks
- Task notifications and reminders

**Recommendation**: Ship MVP (Phases 1-5) first, validate with users, then add Tasks in v2.0 based on feedback

**Rationale**:
- Collections with states (dormant/active/working) already provide significant value
- Task system adds complexity (task-link mapping, notifications, time tracking)
- Need to validate collection usage patterns before adding tasks
- Can design better task system after understanding real usage

---

## Phase 7: Rule Engine Integration (OPTIONAL - Defer to v2.0) 🔜
**Time Estimate**: 8-12 hours
**Priority**: LOW (after MVP validation)
**Dependencies**: Phase 5 complete

**Scope**: Rules can act on collections
- New action: `saveToCollection` (auto-save matching tabs to collection)
- New action: `addToCollection` (add matching tabs to existing collection)
- New condition: `inCollection` (tab is in a collection)
- Collection-scoped rules (rules that only run for specific collections)

**Recommendation**: Ship MVP first, add rules integration in v2.0 after usage patterns known

**Rationale**:
- Need to understand how users organize collections first
- Rule patterns will emerge from real usage (e.g., "auto-save research tabs")
- Can design better rule conditions after seeing collection patterns
- Engine integration is straightforward (follow Phase 6 pattern from refactor)

---

## Success Criteria

### MVP (Phases 1-5)
- [ ] Collections can be created from current window (one-click)
- [ ] Collections can be organized by state (dormant/active/working)
- [ ] Workspaces can be activated (open all tabs in collection)
- [ ] Workspaces can be deactivated (close all tabs, save state)
- [ ] Collections persist across browser restarts
- [ ] Side panel provides quick access to collections
- [ ] Dashboard provides full collection management
- [ ] Storage quota monitoring prevents data loss
- [ ] Performance targets met:
  - [ ] Collection activation < 500ms for 20 tabs
  - [ ] State save < 200ms for 30 links
  - [ ] Collection query < 50ms for 100 collections
  - [ ] Workspace switch < 800ms (close + open)
- [ ] All automated tests pass (150+ new tests)
- [ ] No regressions in existing TabMaster features
- [ ] Zero architectural violations

### Advanced Features (Phases 6-7)
- [ ] Tasks can be created with link context
- [ ] Tasks auto-open required links on start
- [ ] Rules can save tabs to collections automatically
- [ ] Collections can have auto-organization rules

---

## Out of Scope (Deferred to Future Releases)

### Not in MVP (Phases 1-5)
- ❌ Task system (defer to Phase 6)
- ❌ Rule engine integration (defer to Phase 7)
- ❌ Scroll position capture (defer to Phase 6)
- ❌ Form data preservation (defer to Phase 6)
- ❌ Split view workspaces (defer to v2.1)
- ❌ Scheduled workspace activation (defer to v2.1)
- ❌ Cloud sync (defer to v2.2)
- ❌ AI-powered organization (defer to v2.3)
- ❌ Collaboration/sharing (defer to v3.0)

### Explicitly Deferred Features
- **Scroll Position Capture**: Requires content scripts, adds complexity
- **Form Data Preservation**: Security concerns, needs careful design
- **Split View**: Chrome API limitations, may not be possible
- **Cloud Sync**: Infrastructure costs, auth complexity
- **AI Organization**: Requires API integration, token costs
- **Collaboration**: Multi-user support, sharing infrastructure

---

## Migration Strategy

### For Existing Users
1. **Tab Groups → Collections** (Phase 5 optional task)
   - One-time migration: convert all tab groups to collections
   - Preserve group names, colors, collapsed state
   - Auto-tag as `from-tab-group`

2. **Bookmarks → Collections** (Phase 5 optional task)
   - Import bookmark folders as collections
   - Preserve folder hierarchy as tags
   - State: 'dormant' (not active)

3. **Backward Compatibility**
   - Existing features continue to work unchanged
   - Collections are additive, not replacement
   - Users can use tab groups OR collections OR both

---

## Testing Strategy

### Unit Tests (150+ new tests)
- [ ] CollectionStorage (40 tests)
- [ ] CollectionService (30 tests)
- [ ] CollectionStateMachine (15 tests)
- [ ] CollectionTabTracker (20 tests)
- [ ] ActivateWorkspace (20 tests)
- [ ] DeactivateWorkspace (15 tests)
- [ ] SaveWorkspaceState (10 tests)

### Integration Tests
- [ ] Multi-window scenarios (reuse Phase 8.0 infrastructure)
- [ ] Service worker restart scenarios
- [ ] Message passing across surfaces
- [ ] Real-time updates (create in dashboard → appears in sidepanel)
- [ ] Performance with 100+ collections, 30+ tabs per workspace

### Browser Integration Tests
- [ ] Test Runner scenarios (add 3 new scenarios to test-panel):
  - "collection-basic-workflow" (create → activate → deactivate)
  - "collection-multi-window" (activate in new window)
  - "collection-persistence" (restart browser → collections restored)
- [ ] Manual testing checklist (all surfaces)

---

## Timeline & Milestones

### Sprint 1: Foundation (Phase 1)
**Week 1**: 6-8 hours
- [ ] Data models defined
- [ ] CollectionStorage service complete
- [ ] 40 unit tests passing

### Sprint 2: Core Services (Phase 2)
**Week 2**: 10-14 hours
- [ ] All 4 services implemented
- [ ] Background message handlers added
- [ ] 65 unit tests passing

### Sprint 3: UI Surfaces (Phases 3-4)
**Week 3**: 16-20 hours
- [ ] Side panel complete
- [ ] Dashboard integration complete
- [ ] Context menus working

### Sprint 4: Workspace Features (Phase 5)
**Week 4**: 6-8 hours
- [ ] Activation/deactivation working
- [ ] State persistence complete
- [ ] 45 unit tests passing

### Sprint 5: Testing & Polish
**Week 5**: 10-14 hours
- [ ] All integration tests passing
- [ ] Performance optimization
- [ ] Bug fixes and refinement

**Total MVP Timeline**: 48-64 hours (5-7 weeks at 8-10h/week)

---

## Risk Management

### High Risk Items
1. **State Synchronization** (Mitigation: chrome.tabs listeners in background)
2. **Workspace Switching Performance** (Mitigation: Promise.all(), progress indicator)

### Medium Risk Items
1. **Storage Quota Management** (Mitigation: quota monitoring, cleanup UI)
2. **Chrome API Limitations** (Mitigation: lazy initialization, error handling)

### Low Risk Items
1. **Service Worker Restarts** (Mitigation: proven pattern from SnoozeService)
2. **Window Focus Management** (Mitigation: proven pattern from WindowService)

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
- [ ] **Storage Patterns**: Follow chrome.storage.local pattern ✅
- [ ] **Error Handling**: Graceful degradation ✅

---

## Next Steps

1. **Review with architecture-guardian agent** (Phase 1 data models)
2. **Create Phase 1 feature branch**: `git checkout -b feature/linkstash-phase1`
3. **Start with data models doc**: `/docs/linkstash-data-models.md`
4. **Implement CollectionStorage service**: Follow SnoozeService pattern
5. **Write tests first**: TDD approach for data integrity
6. **Commit frequently**: Small, focused commits with clear messages

---

## Resources

- **Architecture Reference**: `/docs/service-dependencies.md`
- **Service Patterns**: `/docs/service-usage-examples.md`
- **Phase 8 Lessons**: Window operations, multi-window support
- **Storage Patterns**: SnoozeService, ScheduledExportService
- **Orchestration Patterns**: WindowService, executeSnoozeOperations
- **LinkStash Plans**: `/plans/LINKSTASH-*.md` (reference only, this TODO is canonical)

---

**Last Updated**: 2025-10-12
**Status**: Ready to begin Phase 1
**Next Review**: After Phase 1 complete
