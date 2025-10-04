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

### 1.7 Engine Selector in Settings ❌
**Goal**: Allow switching between v1 and v2 engines across all surfaces for comparison

- [ ] **Settings UI**
  - [ ] Add engine selector dropdown (v1-legacy, v2-services)
  - [ ] Store selection in chrome.storage.local
  - [ ] Default to v1 for backward compatibility
  - [ ] Add description explaining differences
  - [ ] Show current engine version on settings page

- [ ] **Engine Loader Service**
  - [ ] Create `/lib/engineLoader.js` to abstract engine selection
  - [ ] `getActiveEngine()` - returns current engine module
  - [ ] `switchEngine(version)` - updates storage and reloads if needed
  - [ ] Emit events when engine changes

### 1.8 Wire Surfaces to Use Selected Engine ❌

**Order**: Popup → Dashboard → Session Manager → Background (rules)

- [ ] **Popup Integration**
  - [ ] Update "Group by Domain" button to use engineLoader
  - [ ] Update quick actions to use selected engine
  - [ ] Test with v1 vs v2 and verify same behavior
  - [ ] Handle errors gracefully with fallback

- [ ] **Dashboard Integration**
  - [ ] Update Groups view "Group by Domain" button
  - [ ] Update Rules page preview functionality
  - [ ] Add rule preview using v2 engine's previewRule()
  - [ ] Update analytics/stats to work with both engines
  - [ ] Test with 200+ tabs

- [ ] **Session Manager Integration**
  - [ ] Update bulk grouping operations
  - [ ] Update tab selection and execution flows
  - [ ] Test restore from saved sessions
  - [ ] Verify no breaking changes

- [ ] **Background Service Integration**
  - [ ] Update rule execution to use selected engine
  - [ ] Update scheduled rule runs
  - [ ] Update keyboard shortcut handlers (Ctrl+Shift+G)
  - [ ] Ensure backward compatibility with existing rules
  - [ ] Monitor performance with production workloads

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

## Phase 2: Snooze Service Consolidation ❌

### 2.1 Discovery ❌
- [ ] Find all snooze implementations
- [ ] Create comparison matrix (like tab grouping)
- [ ] Document canonical behavior

### 2.2 Service Implementation ❌
- [ ] Create `/services/SnoozeService.js`
- [ ] Single source for snooze/wake logic
- [ ] Handle all wake targets (same window, new window, etc.)

### 2.3 Update Callers ❌
- [ ] Background service
- [ ] Popup
- [ ] Dashboard snoozed view
- [ ] Rules engine snooze action
- [ ] Session manager (if implemented)

### 2.4 Remove Old Code ❌
- [ ] Delete `/lib/snooze.js` if redundant
- [ ] Remove inline implementations

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