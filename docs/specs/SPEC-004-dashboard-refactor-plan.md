# SPEC-004: Dashboard Refactoring Implementation Plan

## Overview
Step-by-step plan to refactor dashboard.js from 4019 lines into modular components.

## Milestones & Tasks

### Milestone 1: Foundation Setup ⏱️ ~2 hours
Create the module structure and core utilities without breaking existing functionality.

**Tasks:**
1. Create module directory structure
   - [ ] Create `dashboard/modules/core/`
   - [ ] Create `dashboard/modules/views/`
   - [ ] Create `dashboard/modules/components/`
   - [ ] Create `dashboard/modules/services/`
   - [ ] Create `dashboard/tests/` for module tests

2. Setup module loader
   - [ ] Update dashboard.html to use `type="module"` for dashboard.js
   - [ ] Create module entry points with exports
   - [ ] Test ES6 module loading works in Chrome extension

3. Extract core utilities
   - [ ] Create `modules/core/utils.js` with: debounce, formatBytes, getTimeAgo, etc.
   - [ ] Create `modules/core/constants.js` for shared constants
   - [ ] Update dashboard.js to import from utils
   - [ ] Add tests for utility functions

### Milestone 2: State Management ⏱️ ~3 hours
Extract state management and create a simple state store.

**Tasks:**
1. Create state module
   - [ ] Create `modules/core/state.js` with centralized state
   - [ ] Define state shape for all views
   - [ ] Add state getter/setter methods
   - [ ] Add state change events/callbacks

2. Create storage service
   - [ ] Create `modules/services/storage.js`
   - [ ] Extract all chrome.storage operations
   - [ ] Add caching layer for frequently accessed data
   - [ ] Add tests for storage operations

3. Migrate global variables
   - [ ] Move tabsData, groupsData, etc. to state module
   - [ ] Update all references to use state module
   - [ ] Remove global variables from dashboard.js

### Milestone 3: Chrome API Service ⏱️ ~2 hours
Wrap all Chrome API calls in a service layer.

**Tasks:**
1. Create Chrome API wrapper
   - [ ] Create `modules/services/chrome-api.js`
   - [ ] Wrap tabs API methods
   - [ ] Wrap tabGroups API methods
   - [ ] Wrap windows API methods
   - [ ] Add error handling and retries

2. Update all Chrome API calls
   - [ ] Replace direct chrome.* calls with service methods
   - [ ] Add consistent error handling
   - [ ] Add loading states

### Milestone 4: Extract Components ⏱️ ~4 hours
Extract reusable UI components.

**Tasks:**
1. Tab Card Component
   - [ ] Create `modules/components/tab-card.js`
   - [ ] Extract tab rendering logic
   - [ ] Support both grid and tree views
   - [ ] Add tests for component

2. Filter Controls Component
   - [ ] Create `modules/components/filters.js`
   - [ ] Extract search, window filter, sort controls
   - [ ] Add filter state management
   - [ ] Add tests for filter logic

3. Bulk Actions Toolbar
   - [ ] Create `modules/components/bulk-actions.js`
   - [ ] Extract selection management
   - [ ] Extract bulk operation handlers
   - [ ] Add tests for bulk operations

4. Modal Manager
   - [ ] Create `modules/components/modals.js`
   - [ ] Extract modal show/hide logic
   - [ ] Create base modal class
   - [ ] Refactor all modals to use base class

5. Chart Components
   - [ ] Create `modules/components/charts.js`
   - [ ] Extract chart initialization
   - [ ] Extract chart data preparation
   - [ ] Add chart update methods

### Milestone 5: Extract Views - Phase 1 (Simple Views) ⏱️ ~3 hours
Start with the simpler views that have less interdependencies.

**Tasks:**
1. History View
   - [ ] Create `modules/views/history.js`
   - [ ] Extract loadHistoryView function
   - [ ] Extract history rendering logic
   - [ ] Add pagination support
   - [ ] Add tests

2. Snoozed View
   - [ ] Create `modules/views/snoozed.js`
   - [ ] Extract loadSnoozedView function
   - [ ] Extract timeline rendering
   - [ ] Add wake/remove handlers
   - [ ] Add tests

3. Groups View
   - [ ] Create `modules/views/groups.js`
   - [ ] Extract loadGroupsView function
   - [ ] Extract group management logic
   - [ ] Add drag & drop handlers
   - [ ] Add tests

### Milestone 6: Extract Views - Phase 2 (Complex Views) ⏱️ ~4 hours
Extract the more complex views with multiple features.

**Tasks:**
1. Tabs View
   - [ ] Create `modules/views/tabs.js`
   - [ ] Extract loadTabsView function
   - [ ] Extract grid/tree view renderers
   - [ ] Extract drag & drop logic
   - [ ] Extract window management
   - [ ] Add tests

2. Overview View
   - [ ] Create `modules/views/overview.js`
   - [ ] Extract loadOverviewData function
   - [ ] Extract metrics calculation
   - [ ] Extract chart data preparation
   - [ ] Add tests

3. Rules View
   - [ ] Create `modules/views/rules.js`
   - [ ] Extract loadRulesView function
   - [ ] Extract rule management logic
   - [ ] Extract rule editor modal
   - [ ] Extract rule preview/test logic
   - [ ] Add tests

### Milestone 7: Router & Navigation ⏱️ ~2 hours
Create a simple router for view management.

**Tasks:**
1. Create Router
   - [ ] Create `modules/core/router.js`
   - [ ] Extract navigation logic
   - [ ] Add URL hash support
   - [ ] Add view lifecycle (mount/unmount)
   - [ ] Add navigation guards

2. Update Navigation
   - [ ] Update setupNavigation to use router
   - [ ] Add view lazy loading
   - [ ] Add transition animations
   - [ ] Update active states

### Milestone 8: Event System ⏱️ ~2 hours
Create a centralized event system for module communication.

**Tasks:**
1. Create Event Bus
   - [ ] Create `modules/core/events.js`
   - [ ] Add pub/sub implementation
   - [ ] Define event types
   - [ ] Add event debugging

2. Refactor Event Handlers
   - [ ] Move from global handlers to module events
   - [ ] Add event namespacing
   - [ ] Clean up event listeners on unmount
   - [ ] Add tests

### Milestone 9: Final Integration ⏱️ ~3 hours
Clean up dashboard.js and ensure everything works together.

**Tasks:**
1. Slim Down dashboard.js
   - [ ] Remove all extracted code
   - [ ] Keep only initialization logic
   - [ ] Import and wire up all modules
   - [ ] Should be < 500 lines

2. Performance Optimization
   - [ ] Add lazy loading for views
   - [ ] Add code splitting hints
   - [ ] Optimize bundle size
   - [ ] Add performance monitoring

3. Testing & Documentation
   - [ ] Run full test suite
   - [ ] Update documentation
   - [ ] Add module dependency graph
   - [ ] Add developer guide

### Milestone 10: Polish & Cleanup ⏱️ ~2 hours
Final touches and cleanup.

**Tasks:**
1. Code Quality
   - [ ] Run linter on all modules
   - [ ] Ensure consistent code style
   - [ ] Remove dead code
   - [ ] Add JSDoc comments

2. Error Handling
   - [ ] Add global error handler
   - [ ] Add error boundaries for views
   - [ ] Add user-friendly error messages
   - [ ] Add error reporting

3. Migration Guide
   - [ ] Document breaking changes
   - [ ] Add upgrade guide
   - [ ] Update CLAUDE.md
   - [ ] Create architecture diagram

## Success Metrics

1. **Code Organization**
   - dashboard.js < 500 lines ✓
   - No module > 300 lines ✓
   - Clear separation of concerns ✓

2. **Test Coverage**
   - Each module has tests ✓
   - >80% coverage for critical paths ✓
   - All utilities tested ✓

3. **Performance**
   - No regression in load time ✓
   - Memory usage same or better ✓
   - Smooth view transitions ✓

4. **Developer Experience**
   - Easy to find code ✓
   - Easy to add features ✓
   - Easy to debug ✓

## Risk Mitigation

1. **Gradual Migration**: Each milestone keeps the extension working
2. **Feature Flags**: Can toggle between old/new implementations
3. **Rollback Plan**: Git tags at each milestone
4. **Testing**: Comprehensive tests before moving forward
5. **User Testing**: Test with 200+ tabs at each milestone

## Timeline Estimate

Total: ~30 hours of focused work
- Can be done over 1-2 weeks with regular development
- Each milestone is independent after foundation
- Can pause between milestones

## Notes

- Start with Milestone 1-3 (foundation) as they're prerequisites
- Milestones 4-6 can be done in parallel by multiple developers
- Keep existing functionality working at all times
- Add feature flags if needed for gradual rollout