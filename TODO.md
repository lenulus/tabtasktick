# TabMaster Pro - Refactoring TODO

## Overview
Systematic cleanup to achieve services-first architecture with single source of truth for all functionality.

## Core Principles (from CLAUDE.md)
- **One behavior** across all surfaces
- **Services-first**: all logic in `/services/*`, surfaces are thin
- **No magic**: explicit parameters, no hidden defaults
- **Deterministic**: same inputs → same outputs
- **Maintainable**: remove dead code immediately

---

## Phase 1: Tab Grouping Service Consolidation ⚠️

### 1.1 Service Implementation ✅
- [x] Create `/services/TabGrouping.js` with canonical implementation
- [x] Add configurable options (minTabsPerGroup, includePinned, etc.)
- [x] Implement three scopes: GLOBAL, TARGETED, PER_WINDOW
- [x] Add dry-run support for previewing changes
- [x] Deterministic color assignment via domain hash

### 1.2 Update Callers ✅
- [x] **Background** (`background-integrated.js:1292`)
  - [x] Import from `/services/TabGrouping.js`
  - [x] Remove import from `/lib/tabGroupingService.js`
  - [x] Keep statistics update and activity logging (side effects stay in caller)

- [x] **Dashboard** (`dashboard/modules/views/groups.js:199`)
  - [x] Import from `/services/TabGrouping.js`
  - [x] Remove import from `/lib/tabGroupingService.js`
  - [x] Keep notification display (side effects stay in caller)

- [x] **Session Manager** (`session/session.js:902`)
  - [x] Complete rewrite to use service
  - [x] Map selected tabIds to TARGETED scope with specific window
  - [x] Remove entire local implementation

- [x] **Rules Engine** (`lib/engine.js:244`)
  - [x] Import service at top of file
  - [x] Replace entire 'group' case with service call
  - [x] Uses groupTabsByDomain with specificTabIds for now
  - [ ] TODO: Batch process all matching tabs in one call

### 1.3 Remove Old Code ✅
- [x] Delete `/lib/tabGroupingService.js` completely
- [x] Remove getDomain and getColorForDomain from session.js
- [x] Simplify engine.js to call service
- [x] Clean up any dead imports

### 1.4 Split Selection from Execution ✅
- [x] Create `/services/selection/selectTabs.js` service
  - [x] Generalized `selectTabs(filters)` method with all criteria
  - [x] `matchesFilter(tab, filters)` for single tab testing
  - [x] Common filter presets
  - [x] Handle "all ungrouped in window"
  - [x] Handle "by domain"
  - [x] Handle "matching condition"
- [x] Create `/services/execution/groupTabs.js` service
  - [x] `groupTabs(tabIds, options)` - execution only
  - [x] Remove selection logic
  - [x] Only handle execution
  - [x] Add dry-run support
  - [x] Support custom names and by-domain grouping

### 1.5 Simplify Rules Engine ✅
- [x] **SelectionService Enhancement**
  - [x] Add `selectTabsMatchingRule(rule)` - pass rule object directly
  - [x] Move condition evaluation from engine to SelectionService
  - [x] Move context building (indices, duplicates) to SelectionService
  - [x] Add support for all rule condition types
- [x] **Engine Simplification**
  - [x] Reduce to thin orchestrator: select → execute → log
  - [x] Remove all selection/matching logic
  - [x] Remove index building
  - [x] Achieved: 356 lines (from 618), with backward compat

### 1.6 Command Pattern Architecture ✅
- [x] **Command Infrastructure**
  - [x] Create Command class with validation and preview
  - [x] Support for all action types (close, group, snooze, etc.)
  - [x] Conflict detection between commands
  - [x] Priority-based command ordering
- [x] **ActionManager**
  - [x] Create command dispatcher
  - [x] Register service-backed handlers
  - [x] Support dry-run and preview modes
  - [x] Add event hooks for debugging
- [x] **Service Integration**
  - [x] Create selectAndPlan service for command generation
  - [x] Migrate all action logic to handlers
  - [x] Ensure atomicity of operations
- [x] **Engine Refactor**
  - [x] Created engine-v2.js using Command Pattern (174 lines)
  - [x] Created engine-compact.js (111 lines - goal achieved!)
  - [x] Clean separation: Select → Commands → Execute

### 1.6 V2 Engine Validation ✅
- [x] Create comprehensive test suite with 9 scenarios
- [x] Fix duration parsing for time-based rules
- [x] Fix nested condition evaluation (recursive any/all)
- [x] Add regex operator support
- [x] Add bookmark folder support
- [x] Fix age calculation (createdAt vs lastAccessed)
- [x] Fix window isolation regression
- [x] Add domain category classification
- [x] Add window focus management to Test Runner
- [x] All 9/9 test scenarios passing

### 1.7 Engine Selector in Settings ✅
**Goal**: Allow switching between v1 and v2 engines across all surfaces for comparison

- [x] **Settings UI**
  - [x] Add engine selector dropdown (v1-legacy, v2-services)
  - [x] Store selection in chrome.storage.local
  - [x] Default to v2 (v1 kept for validation only)
  - [x] Add description explaining differences
  - [x] Show current engine version on settings page

- [x] **Engine Loader Service**
  - [x] Create `/lib/engineLoader.js` to abstract engine selection
  - [x] `getActiveEngine()` - returns current engine module
  - [x] `setActiveEngineVersion()` - updates storage and reloads if needed
  - [x] `onEngineChanged()` - emit events when engine changes

**Implementation** (commit 3aa6fb8):
- Created `/lib/engineLoader.js` with full engine abstraction
- Added engine selector dropdown to Settings page
- Live updates across all contexts via storage events
- Clean UI with status badge and descriptions

### 1.8 Eliminate Duplicate Implementations - Force Single Code Path ⚠️

**Goal**: Remove all duplicate business logic from surfaces. All operations must go through:
**Surface → Message → Background → Engine**

**Why**:
- Single source of truth for all tab operations
- Centralized testing (test the engine once, not 4 implementations)
- Less fragile - changes in one place, consistent everywhere
- Engine selector works across all surfaces automatically

**Pattern**:
1. Find inline implementations in surfaces (grouping, snoozing, closing, etc.)
2. Delete the duplicate code
3. Replace with message to background
4. Background handler uses `getEngine()` and runs operation through engine

---

- [x] **Popup** ✅
  - [x] Already uses message passing (`{ action: 'groupByDomain' }`)
  - [x] Background handler uses `getEngine()` (background-integrated.js:1304)
  - [x] No duplicate implementations found
  - **Status**: Complete - already follows single code path pattern

- [ ] **Dashboard** ❌
  - [x] **Audit Complete** - Found 10 duplicate Chrome API calls
  - **Duplicate Implementations Found:**
    - `groups.js:26` - `chrome.tabs.ungroup()` in `ungroupAllTabs()`
    - `groups.js:193` - `chrome.tabs.remove()` in `closeGroup()`
    - `dashboard.js:479-519` - `closeTabs()` - direct `chrome.tabs.remove()`
    - `dashboard.js:521-537` - `groupTabs()` - direct `chrome.tabs.group()`
    - `dashboard.js:539-562` - `bookmarkTabs()` - direct `chrome.bookmarks.create()`
    - `dashboard.js:564-589` - `moveToWindow()` - direct `chrome.tabs.move()`
    - `tabs.js:688` - Tree view close group - direct `chrome.tabs.remove()`
    - `tabs.js:751,762,789,796` - Drag-and-drop - direct Chrome APIs
  - **Implementation Plan:**
    - [ ] Create background message handlers for: `closeTabs`, `groupTabs`, `bookmarkTabs`, `moveToWindow`
    - [ ] Replace dashboard implementations with `chrome.runtime.sendMessage()` calls
    - [ ] Update tree view actions to use message passing
    - [ ] Keep drag-and-drop Chrome API calls (UI interaction, not business logic)
    - [ ] Test all bulk actions with 200+ tabs

- [ ] **Session Manager** ❌
  - [x] **Audit Complete** - Found 5 duplicate implementations
  - **Duplicate Implementations Found:**
    - `session.js:768-771` - `closeTabs()` - direct `chrome.tabs.remove()`
    - `session.js:773-799` - `groupTabs()` - direct `chrome.tabs.group()`
    - `session.js:801-804` - `snoozeTabs()` - stub (TODO)
    - `session.js:824-840` - `moveTabsToWindow()` - direct `chrome.tabs.move()`
    - `session.js:842-901` - `deduplicateTabs()` + `closeSoloTabs()` - direct implementations
  - **Implementation Plan:**
    - [ ] Replace `closeTabs()` with message to background
    - [ ] Replace `groupTabs()` with message to background
    - [ ] Replace `snoozeTabs()` with message to background (use SnoozeService)
    - [ ] Replace `moveTabsToWindow()` with message to background
    - [ ] Replace `deduplicateTabs()` and `closeSoloTabs()` with engine-based approach
    - [ ] Test session restore and bulk actions

- [ ] **Background Service - Remaining Actions** ⚠️
  - [x] Manual actions (groupByDomain, closeDuplicates) use `getEngine()` ✅
  - [x] Scheduled rule runs (line 381-442) - Already uses `getEngine()` ✅
  - [ ] **Keyboard shortcuts (line 1424-1450)** - Need to route through engine
    - Currently calls `groupTabsByDomain()` and `findAndCloseDuplicates()` directly
    - Should use helper: `executeActionViaEngine(action, params)`
  - [ ] **Context menu handlers (line 1618-1639)** - Mixed implementation
    - Snooze already uses `SnoozeService` ✅
    - Rule creation bypasses engine - needs fixing
  - [ ] Create helper function `executeActionViaEngine()` for consistent engine routing
  - [ ] Monitor performance with production workloads
  - [x] **CRITICAL: Fix closeDuplicates to use engine instead of duplicate implementation**
    - **Solution**: Refactored `findAndCloseDuplicates()` to use `engine.runRules()` with temporary rule
    - **Implementation**: Creates temp rule with `conditions: {}` (match all) and `action: close-duplicates`
    - **Benefit**: Ensures Test Runner behavior matches manual button behavior (consistency principle)
    - **Files Changed**:
      - `background-integrated.js:1270-1309` - Now uses engine.runRules() instead of inline duplicate detection
      - `services/selection/selectTabs.js` - Enhanced `normalizeUrlForDuplicates()` to remove ALL query params
      - `services/selection/selectTabs.js:452-471` - Fixed `matchesRule()` to handle empty conditions object
  - [x] **CRITICAL: Fix getStatistics to work with v2 engine**
    - **Solution**: Created `getTabStatistics()` service in `services/selection/selectTabs.js`
    - **Implementation**: Single-pass calculation with performance instrumentation
    - **Fixes Applied**:
      - Groups count now uses `chrome.tabGroups.query()` instead of counting tabs
      - Duplicate detection via `normalizeUrlForDuplicates()` (removes query params, fragments, trailing slashes)
      - Removed inline duplicate detection from `background-integrated.js:598-610`
      - Removed `getDuplicateTabsCount()` from `popup/popup.js`
    - **Files Changed**:
      - `services/selection/selectTabs.js:858-941` - New `getTabStatistics()` service
      - `background-integrated.js:602-610` - Now calls service instead of inline logic
      - `popup/popup.js` - Removed duplicate getDuplicateTabsCount() function

---

### Code Examples - Before & After

**BEFORE (Dashboard - Duplicate Implementation):**
```javascript
// dashboard.js:479-519
async function closeTabs(tabIds) {
  await chrome.tabs.remove(tabIds); // Direct Chrome API call
  chrome.runtime.sendMessage({
    action: 'logBulkActivity',
    type: 'close',
    count: tabIds.length
  });
}
```

**AFTER (Dashboard - Message Passing):**
```javascript
// dashboard.js
async function closeTabs(tabIds) {
  await chrome.runtime.sendMessage({
    action: 'closeTabs',
    tabIds: tabIds
  });
}
```

**Background Message Handler:**
```javascript
// background-integrated.js
case 'closeTabs':
  await executeActionViaEngine('close', message.tabIds);
  sendResponse({ success: true });
  break;
```

**Helper Function in Background:**
```javascript
// background-integrated.js
async function executeActionViaEngine(action, tabIds, params = {}) {
  const engine = getEngine();

  // Create temporary rule for this action
  const tempRule = {
    id: `temp-${action}-${Date.now()}`,
    name: `Manual ${action} action`,
    enabled: true,
    conditions: {}, // Match provided tabIds only
    then: [{ action, ...params }]
  };

  // Build context with specific tab filter
  const context = await buildContext();
  context.tabs = context.tabs.filter(t => tabIds.includes(t.id));

  // Execute through engine
  const result = await engine.runRules([tempRule], context);

  return result;
}
```

---

### Implementation Strategy - Detailed Steps

**Phase A: Create Helper Infrastructure in Background** ✅
- [x] Create `executeActionViaEngine(action, tabIds, params)` helper in background
  - Takes action type, tab IDs, and parameters
  - Creates temporary rule for the action
  - Runs through `getEngine().runRules()` with tab filter
  - Returns results with consistent format
  - **File**: `background-integrated.js:885-945`
- [x] Add message handlers in background for:
  - `closeTabs` - route to engine with 'close' action (line 1116-1119)
  - `groupTabs` - route to engine with 'group' action (line 1121-1127)
  - `bookmarkTabs` - route to engine with 'bookmark' action (line 1137-1142)
  - `moveToWindow` - route to engine with 'move' action (line 1144-1150)
  - `ungroupTabs` - direct Chrome API (line 1152-1157)
  - `snoozeTabs` - already routes to SnoozeService ✅ (line 1129-1135)

**Phase B: Update Dashboard** ✅
- [x] Replace `dashboard.js:479-485` `closeTabs()` with message call
- [x] Replace `dashboard.js:487-502` `groupTabs()` with message call
- [x] Replace `dashboard.js:504-512` `bookmarkTabs()` with message call
- [x] Replace `dashboard.js:514-524` `moveToWindow()` with message call
- [x] Update `groups.js:11-37` `ungroupAllTabs()` with message call
- [x] Update `groups.js:192-207` `closeGroup()` with message call
- [x] Update `tabs.js:684-694` tree view close group with message call
- [x] Kept drag-and-drop Chrome APIs (UI-specific interactions, not business logic)
- [ ] Test all bulk operations with 200+ tabs

**Phase C: Update Session Manager** ✅
- [x] Replace `session.js:768-774` `closeTabs()` with message call
- [x] Replace `session.js:776-786` `groupTabs()` with message call
- [x] Implement `session.js:788-796` `snoozeTabs()` with message call to SnoozeService
- [x] Replace `session.js:798-806` `bookmarkTabs()` with message call
- [x] Replace `session.js:808-817` `moveTabsToWindow()` with message call
- [x] Replace `session.js:819-831` `deduplicateTabs()` - routes to closeDuplicates
- [x] Replace `session.js:833-871` `closeSoloTabs()` - uses message for closeTabs
- [ ] Test session restore and all bulk actions

**Phase D: Fix Background Shortcuts & Menus** ✅
- [x] Update keyboard shortcuts (background-integrated.js:1510-1538):
  - `group_by_domain` - routes through `groupByDomain()` which uses `getEngine()` ✅
  - `close_duplicates` - routes through `findAndCloseDuplicates()` which uses `getEngine()` ✅
  - `quick_snooze` - uses `quickSnoozeCurrent()` which uses SnoozeService ✅
- [x] Verify context menu handlers (background-integrated.js:1618-1639):
  - Snooze handlers use SnoozeService ✅
  - Rule creation uses `createRuleForTab()` (creates rule, not duplicate logic) ✅

**Phase E: Testing & Validation** ✅
- [ ] Test popup "Group by Domain" (v1 and v2)
- [ ] Test dashboard bulk actions (v1 and v2)
- [ ] Test session manager actions (v1 and v2)
- [ ] Test keyboard shortcuts (v1 and v2)
- [ ] Test with 200+ tabs across multiple windows
- [ ] Verify engine selector switches work everywhere
- [ ] Performance comparison: v1 vs v2
- [ ] No breaking changes in user workflows

---

- [ ] **Rules Page Visualization**
  - [ ] Add "Preview Rule" button using selected engine
  - [ ] Show matched tabs before execution
  - [ ] Display execution plan (what will happen)
  - [ ] Use v2 engine's dry-run capability
  - [ ] Show diff between v1 and v2 previews (optional)

### 1.9 Production Validation ❌
- [ ] Test popup "Group by Domain" button (v1 and v2)
- [ ] Test dashboard Groups view "Group by Domain" button (v1 and v2)
- [ ] Test keyboard shortcut (Ctrl+Shift+G) (v1 and v2)
- [ ] Test rules engine group action (v1 and v2)
- [ ] Test session manager bulk grouping (v1 and v2)
- [ ] Test with 200+ tabs across multiple windows
- [ ] Performance comparison: v1 vs v2 execution time
- [ ] Memory usage comparison
- [ ] Verify no breaking changes in user workflows

---

## Phase 2: Snooze Service Consolidation ✅

### 2.1 Discovery ✅
- [x] Find all snooze implementations
- [x] Create comparison matrix (like tab grouping)
- [x] Document canonical behavior

### 2.2 Service Implementation ✅
- [x] Create `/services/execution/SnoozeService.js`
- [x] Single source for snooze/wake logic
- [x] Handle all wake targets and timing (chrome.alarms with fallback)
- [x] Dependency injection pattern for testability

### 2.3 Update Callers ✅
- [x] Background service
- [x] Popup (via message passing)
- [x] Dashboard snoozed view (via message passing)
- [x] Rules engine snooze action (v1 and v2)
- [x] ActionManager (command pattern)

### 2.4 Remove Old Code ✅
- [x] Removed all duplicate snooze implementations (~400 lines → 213 line service)
- [x] Eliminated 4 duplicate implementations across codebase

**Completed**: Merged from `snooze-service-refactor` branch
- Created comprehensive discovery document (`docs/snooze-service-discovery.md`)
- Assessment document (`docs/snooze-service-assessment.md`)
- All surfaces now use SnoozeService via background
- Updated Jest tests to use service
- 47% code reduction with improved testability

---

## Phase 3: Duplicate Detection Service ❌

### 3.1 Discovery ❌
- [ ] Find all duplicate detection logic
- [ ] Document different algorithms (URL normalization, params handling)
- [ ] Define canonical behavior

### 3.2 Service Implementation ❌
- [ ] Create `/services/DuplicateService.js`
- [ ] Consistent URL normalization
- [ ] Handle edge cases (fragments, query params, trailing slashes)

### 3.3 Update Callers ❌
- [ ] Background closeDuplicates
- [ ] Dashboard duplicate detection
- [ ] Session manager deduplicate
- [ ] Rules engine duplicate conditions

---

## Phase 4: Tab Suspension Service ❌

### 4.1 Discovery ❌
- [ ] Find all suspension/discard logic
- [ ] Check for chrome.tabs.discard usage
- [ ] Document current behavior

### 4.2 Service Implementation ❌
- [ ] Create `/services/SuspensionService.js`
- [ ] Handle memory monitoring
- [ ] Respect pinned/active/playing tabs

### 4.3 Update Callers ❌
- [ ] Background service
- [ ] Rules engine suspend action
- [ ] Quick actions

---

## Phase 5: Export/Import Service ❌

### 5.1 Discovery ❌
- [ ] Find all export implementations
- [ ] Find all import implementations
- [ ] Document formats and differences

### 5.2 Service Implementation ❌
- [ ] Create `/services/ExportImportService.js`
- [ ] Single format definition
- [ ] Handle all data types (tabs, groups, rules, settings)

### 5.3 Update Callers ❌
- [ ] Dashboard export/import
- [ ] Session manager export/import
- [ ] Popup export button

---

## Phase 6: Rules Engine Cleanup ❌

### 6.1 Action Handlers ❌
- [ ] Extract each action to use appropriate service
- [ ] Remove all inline business logic
- [ ] Keep only orchestration in engine.js

### 6.2 Condition Evaluators ❌
- [ ] Review for duplicate logic
- [ ] Extract complex conditions to services

---

## Phase 7: Dead Code Removal ❌

### 7.1 Unused Files ❌
- [ ] Audit all files in `/lib/`
- [ ] Check for unused imports
- [ ] Delete preview.js if truly unused
- [ ] Clean up test files

### 7.2 Commented Code ❌
- [ ] Remove all commented-out code blocks
- [ ] Remove TODO comments for completed work
- [ ] Remove console.logs from production code

---

## Phase 8: Documentation ❌

### 8.1 Service Documentation ❌
- [ ] Document each service API
- [ ] Add JSDoc comments
- [ ] Create service usage examples

### 8.2 Update Architecture Docs ❌
- [ ] Update CLAUDE.md with service list
- [ ] Create service dependency diagram
- [ ] Document data flow

---

## Testing Checklist (Run after each phase)

- [ ] Extension loads without errors
- [ ] Popup opens and functions work
- [ ] Dashboard loads and views work
- [ ] Keyboard shortcuts work
- [ ] Context menus work
- [ ] Rules execute properly
- [ ] No console errors in:
  - [ ] Background service worker
  - [ ] Popup
  - [ ] Dashboard
  - [ ] Session manager
- [ ] Memory usage acceptable with 200+ tabs
- [ ] All automated tests pass

---

## Success Metrics

- **Zero duplicate implementations** of any feature
- **All business logic** in `/services/*`
- **Surfaces < 100 lines** of orchestration code
- **No inline logic** in rules engine actions
- **100% deterministic** behavior
- **No magic** - all options explicit

---

## Notes

- Start with Phase 1 (Tab Grouping) as it's already analyzed
- Each phase should be a separate PR
- Run full test checklist after each phase
- Delete old code immediately after migration
- If uncertain about behavior, check the canonical behavior doc