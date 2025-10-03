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

### 1.2 Update Callers ❌
- [ ] **Background** (`background-integrated.js:1292`)
  - [ ] Import from `/services/TabGrouping.js`
  - [ ] Remove import from `/lib/tabGroupingService.js`
  - [ ] Keep statistics update and activity logging (side effects stay in caller)

- [ ] **Dashboard** (`dashboard/modules/views/groups.js:199`)
  - [ ] Import from `/services/TabGrouping.js`
  - [ ] Remove import from `/lib/tabGroupingService.js`
  - [ ] Keep notification display (side effects stay in caller)

- [ ] **Session Manager** (`session/session.js:902`)
  - [ ] Complete rewrite to use service
  - [ ] Map selected tabIds to TARGETED scope with specific window
  - [ ] Remove entire local implementation

- [ ] **Rules Engine** (`lib/engine.js:244`)
  - [ ] Import service at top of file
  - [ ] Replace entire 'group' case with service call
  - [ ] Map action.by to appropriate scope
  - [ ] Handle single tab case properly

### 1.3 Remove Old Code ❌
- [ ] Delete `/lib/tabGroupingService.js` completely
- [ ] Remove groupTabsByDomain from session.js
- [ ] Remove inline grouping logic from engine.js
- [ ] Clean up any dead imports

### 1.4 Testing ❌
- [ ] Test popup "Group by Domain" button
- [ ] Test dashboard Groups view "Group by Domain" button
- [ ] Test keyboard shortcut (Ctrl+Shift+G)
- [ ] Test rules engine group action
- [ ] Test session manager bulk grouping
- [ ] Test with 200+ tabs across multiple windows

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