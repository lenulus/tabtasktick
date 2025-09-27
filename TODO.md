# TabMaster Pro - TODO

## Overview
This document tracks the implementation status of TabMaster Pro features and remaining work items.

**Status Legend:**
- ✅ Complete
- 🚧 In Progress
- ⚠️ Partial/Needs Work
- ❌ Not Started

---

## Core Features

### 1. Tab Management
- ✅ View all tabs with filtering and sorting
- ✅ Tab selection with checkboxes
- ✅ Window indicators and grouping
- ✅ Real-time tab count display
- ✅ Smart window naming and persistence
- ✅ Tab state indicators (active, suspended, pinned, audible)
- ✅ Search functionality
- ✅ Bulk selection with shift-click
- ✅ Tree view mode (Window > Groups > Tabs hierarchy)
- ⚠️ Virtual scrolling for 200+ tabs performance
- ❌ Tab preview on hover (abandoned due to Chrome API limitations)

### Tree View Enhancements
- ✅ Fix selection checkboxes visibility in tree view
- ✅ Select all tabs in window/group
- ✅ Drag and drop tabs between groups within window
- ✅ Drag and drop tabs to different windows
- ❌ Create new group from selected tabs
- ✅ Rename tab groups inline
- ✅ Close entire window action
- ✅ Close entire group action
- ❌ Collapse/expand all windows/groups
- ✅ Move selected tabs to new window (via dialog)
- ❌ Merge all windows
- ❌ Sort tabs within group (by title, URL, etc.)

### 2. Tab Groups
- ✅ View existing tab groups
- ✅ Group tabs by domain
- ✅ Collapse/expand groups (in dashboard)
- ✅ Close entire groups
- ✅ Visual group indicators
- ✅ Rename groups inline (in tree view)
- ✅ Drag-and-drop between groups
- ❌ Group templates/presets
- ✅ Ungroup tabs (drag to window header)
- ❌ Group color picker
- ❌ Save group as bookmark folder

### 3. Snooze Functionality
- ✅ Basic snooze implementation
- ✅ Snooze for specific durations
- ✅ View snoozed tabs
- ✅ Wake snoozed tabs
- ⚠️ Enhanced snooze UI with presets
- ❌ Add "message to future self" field when snoozing
- ❌ Display snooze message/reason when tab wakes
- ❌ Recurring snooze schedules
- ❌ Smart wake suggestions

### 4. Import/Export
- ✅ Export tabs to JSON
- ✅ Export with metadata
- ⚠️ Import functionality (basic implementation exists)
- ❌ Export to other formats (CSV, bookmarks)
- ❌ Selective import/export

### 5. Activity Tracking
- ✅ Real-time activity logging
- ✅ Activity persistence in storage
- ✅ Recent activity display in overview
- ✅ Full history view with date grouping
- ✅ Filter by source (manual/auto/rule)
- ✅ Activity icons and colors
- ✅ Bulk action logging (tracks multi-tab operations)
- ✅ Tab event tracking (open, close, group)
- ❌ Activity statistics/trends
- ❌ Activity export

### 6. Quick Actions (FAB)
- ✅ Floating action button
- ✅ Quick action menu
- ✅ Close duplicates
- ✅ Group by domain
- ✅ Suspend inactive tabs
- ⚠️ Action preview counts
- ❌ Undo functionality
- ❌ Custom quick actions

---

## UI/UX Improvements

### Dashboard
- ✅ Overview with real statistics
- ✅ Tab management view
- ✅ Groups view
- ✅ Snoozed tabs view
- ✅ History view with real data
- ✅ Analytics with charts
- ✅ Responsive layout
- ✅ Empty states
- ✅ Window filtering and indicators
- ✅ Tree view for All Tabs (hierarchical display)
- ❌ Dark mode support (auto-detect browser preference)
- ❌ Match browser's light/dark mode setting
- ❌ Manual dark mode toggle option
- ❌ Customizable dashboard layout

### Popup (Extension Interface)
- ✅ Basic stats display
- ✅ Quick actions
- 🚧 Replace meaningless memory usage with useful metric
- 🚧 Add navigation links from stats to dashboard views
  - "X Open Tabs" → Dashboard All Tabs
  - "Grouped" → Dashboard All Tabs (filtered)
  - "Snoozed" → Dashboard Snoozed view
  - "Duplicates" → Dashboard All Tabs (duplicates filter)
- ❌ Add "Create Rule" button or link to rules management

### Performance
- ✅ Efficient DOM updates
- ✅ 30-second auto-refresh
- ⚠️ Virtual scrolling for large lists
- ❌ Web Workers for heavy operations
- ❌ IndexedDB for large datasets
- ❌ Lazy loading for inactive views

---

## Advanced Features (Not Started)

### Rules Engine
- ✅ Move rules from settings to dashboard (better discoverability)
- ✅ Fix Edit/Disable/Delete functionality (currently broken)
- ✅ Remove or disable dangerous default rules (5 pre-populated rules)
- ✅ Create custom rules
- ✅ Rule conditions (URL patterns, time, memory) - Basic implementation
- ✅ Rule actions (close, group, snooze)
- ⚠️ Rule conditions inconsistent time handling [Spec: SPEC-002]
- ❌ Rule scheduling (periodic triggers)
- ❌ Rule templates (beyond sample rules)
- ❌ Rule import/export

### Command Palette
- ❌ Quick command access (Ctrl+Shift+P)
- ❌ Fuzzy search
- ❌ Recent commands
- ❌ Custom commands
- ❌ Keyboard navigation

### Bookmarks Integration
- ❌ Setting to choose target bookmark folder
- ❌ Create/select bookmark folder for bulk operations
- ❌ Remember last used bookmark folder
- ❌ Save tab groups as bookmarks
- ❌ Import bookmarks as tabs
- ❌ Bookmark folder sync
- ❌ Auto-bookmark before close
- ❌ Organize bookmarks by date/session

### Smart Suggestions
- ❌ AI-powered tab organization
- ❌ Duplicate detection improvements
- ❌ Memory optimization suggestions
- ❌ Usage pattern analysis

---

## Bug Fixes & Polish

### Known Issues
- ⚠️ Memory estimates are not accurate (removed, replaced with active/suspended count)
- ⚠️ Filter/sort state resets need improvement
- ⚠️ Some keyboard shortcuts may conflict
- ❌ Error handling needs improvement
- ❌ Loading states for async operations

### Testing Needed
- ❌ Test with 200+ tabs
- ❌ Test with 10+ windows
- ❌ Test snooze reliability
- ❌ Test import with large files
- ❌ Cross-browser testing (if applicable)

---

## Documentation

- ✅ Basic README
- ✅ CLAUDE.md development guide
- ⚠️ User documentation
- ❌ API documentation
- ❌ Video tutorials
- ❌ FAQ section

---

## Next Priority Items

### Critical Priority (P0) - Dashboard Refactoring [Spec: SPEC-003, SPEC-004]
Dashboard.js has grown to 4000+ lines and needs modular refactoring for maintainability.

#### Milestone 1: Foundation Setup (~2 hours)
- ✅ Create module directory structure
- ✅ Setup ES6 module loader in dashboard.html
- ✅ Extract core utilities to modules/core/utils.js
- ⚠️ Add tests for utility functions (ES module issues with Jest)

#### Milestone 2: State Management (~3 hours)
- ✅ Create centralized state module
- ✅ Create storage service wrapper
- ✅ Migrate global variables to state
- ✅ Add state change events/callbacks
- ✅ Create state-listeners.js with examples
- ✅ Update all global variable references to use state module

#### REVISED PLAN - FOCUS ON WHAT ACTUALLY REDUCES FILE SIZE

**Goal**: Reduce dashboard.js from 3950 lines to <500 lines

**What Actually Works:**
1. ✅ Extract view functions to modules/views/
   - loadTabsView() (~800+ lines) → modules/views/tabs.js
   - loadOverviewData() (~300 lines) → modules/views/overview.js  
   - loadRulesView() (~200+ lines) → modules/views/rules.js
   - loadGroupsView() (~130 lines) → modules/views/groups.js
   - loadSnoozedView() (~90 lines) → modules/views/snoozed.js
   - loadHistoryView() (~100 lines) → modules/views/history.js
   - This alone removes ~1600+ lines from dashboard.js

2. ✅ Extract large helper functions that these views use
   - renderGridView(), renderTreeView() 
   - Any other large functions specific to views

3. ✅ Leave everything else as-is
   - No routers, no event buses, no component abstractions
   - Just move the big chunks of code out

**What We're NOT Doing (because it's pointless):**
- ❌ SKIP Chrome API wrappers - adds complexity, no size reduction
- ❌ SKIP Component extraction - no reusable components exist
- ❌ SKIP Router system - overengineering for simple view switching  
- ❌ SKIP Event bus - current event handling works fine
- ❌ SKIP Any other "architectural improvements" that don't reduce file size

### Rules Engine 2.0 [Spec: rules-prd.md] ✅ PHASE 1 COMPLETE
#### Phase 1: Core Engine - Test Infrastructure & Modules ✅
- ✅ Create test infrastructure (chrome-mock.js, tab-factory.js, rule-factory.js, test-helpers.js)
- ✅ Create normalize.js module with tests for URL deduplication (32 tests passing)
- ✅ Create predicate.js module with tests for condition compilation (27 tests passing)
- ✅ Create engine.js with tests for rule evaluation and dry-run (27 tests passing)
  - ✅ buildIndices for efficient rule evaluation
  - ✅ evaluateRule with condition matching
  - ✅ executeActions with dry-run support
  - ✅ runRules for batch processing
  - ✅ previewRule for UI integration
  - ✅ Support for all actions: close, group, snooze, bookmark
  - ✅ Action ordering and skip logic (closed tabs)
  - ✅ Error handling with graceful failures
- ✅ Create scheduler.js with tests for trigger system (23 tests passing)
  - ✅ Immediate triggers with configurable debouncing
  - ✅ Repeat triggers with interval support ('30m', '1h', '2d')
  - ✅ Once triggers with ISO date/time scheduling
  - ✅ Persistence support for surviving restarts
  - ✅ Rule setup integration
  - ✅ Status reporting and control methods
- ✅ Integrate scheduler and engine with background.js
  - ✅ Created background-integrated.js with full Rules Engine 2.0 integration
  - ✅ Supports all triggers: immediate (via tab events), repeat, once, manual
  - ✅ Full message handler API for rules, preview, scheduler status
  - ✅ Bookmark action implemented with folder creation
  - ✅ Activity logging and statistics tracking
- ✅ Migrate existing rules to new format (18 tests passing)
  - ✅ Created migrate-rules.js with comprehensive migration logic
  - ✅ Handles all old condition types (domain, age, duplicate, etc.)
  - ✅ Converts actions to new format
  - ✅ Migrates triggers (immediate, interval → repeat_every)
  - ✅ Preserves unknown fields and handles errors gracefully
  - ✅ Includes default rules in new format

#### Phase 2: DSL Support ✅ COMPLETE
- ✅ Create dsl.js parser/serializer with comprehensive tests (31 tests passing)
- ✅ Add DSL import/export to rules view with validation tests (13 tests passing)
- ✅ Create DSL syntax highlighting (18 tests passing)
- ✅ Test DSL round-trip conversion and error handling

#### Phase 3: UI Enhancement
- ⚠️ Session View (Note: Existing dashboard tabs view already has bulk management)
  - ✅ Created separate session.html page (may be redundant with existing tabs view)
  - ❌ Consider integrating rules dry-run into existing tabs view instead
- ✅ Build advanced conditions editor with input validation tests [Spec: SPEC-006]
  - ✅ Created conditions-builder.js with visual condition builder
  - ✅ Support for ALL/ANY/NONE junctions and nested groups
  - ✅ Per-condition NOT toggle
  - ✅ Dynamic operators based on subject type
  - ✅ Smart value inputs (text, number, duration, boolean, category)
  - ✅ Live preview of conditions
  - ✅ Integrated with rule modal
  - ✅ Validation before save
- ❌ Add action ordering UI with drag-drop tests
- ❌ Create categories manager with mapping tests
- ❌ Add dry-run preview panel with rendering tests

#### Phase 4: Safety & Polish
- ❌ Implement undo system with restoration tests
- ❌ Add virtual scrolling with performance tests
- ❌ Create performance test suite for 200+ tabs
- ❌ Add e2e tests for PRD scenarios

### High Priority (P1)
1. Complete Rules Engine 2.0 implementation
2. Make popup stats clickable with navigation to dashboard
3. Add "Create Rule" button to popup
4. Fix virtual scrolling for performance with 200+ tabs
5. Implement unified time-based triggers [Spec: SPEC-002]

### Medium Priority (P2)
1. Complete import functionality
2. Add undo functionality for destructive actions
3. Command palette
4. Dark mode support
5. Bookmark integration

### Low Priority (P3)
1. Smart suggestions
2. Advanced analytics
3. Custom themes
4. Plugin system

---

## Recently Completed (Current Session)
### Rules Engine 2.0 - Phase 3 UI Work:
- ✅ **Implemented Advanced Conditions Editor** [Spec: SPEC-006]:
  - ✅ Created conditions-builder.js module with full visual builder
  - ✅ Support for ALL/ANY/NONE junctions with unlimited nesting  
  - ✅ Per-condition NOT toggle for negation
  - ✅ Dynamic operators based on subject type
  - ✅ Smart value inputs (text, number, duration, boolean, category, etc.)
  - ✅ Live preview showing human-readable conditions
  - ✅ Full validation before save
  - ✅ Integrated with rule modal (replaced old dropdown system)
  - ✅ Added action management UI (add/remove/configure actions)
  - ✅ Updated trigger UI for immediate/repeat/once/manual
  - ✅ Created supporting CSS (conditions-builder.css, rules-modal.css)
  - ✅ Conversion functions for old rule format to new format

- ⚠️ **Session View Implementation**:
  - ✅ Created separate session management page (session.html/js/css)
  - Note: May be redundant since dashboard tabs view already has bulk management
  - Recommendation: Integrate rules dry-run into existing tabs view instead

### Previous Session Completions:
- ✅ **COMPLETED RULES ENGINE 2.0 PHASE 1** (225 tests passing total)
- ✅ **COMPLETED RULES ENGINE 2.0 PHASE 2** (DSL Support)
- ✅ Improved spacing and visual design in tree view
- ✅ Moved rules engine to dashboard
- ✅ Fixed critical issues from debugging session
- ✅ Added UUID generation for rule IDs
- ✅ Implemented url_pattern condition type with regex support
- ✅ Built domain categorization system (190 domains, 20 categories)
- ✅ Added category condition type to rules engine
- ✅ Implemented category selection UI with checkboxes
- ✅ Added sample rules for social media and shopping categories
- ✅ Created SPEC-002 for unified time-based triggers
- ✅ **COMPLETED RULES ENGINE 2.0 PHASE 2** (62 tests passing):
  - ✅ Created dsl.js: Full DSL parser/serializer (665 lines)
  - ✅ Implemented tokenizer for all DSL elements
  - ✅ Built recursive parser for complex conditions
  - ✅ Added bidirectional DSL ↔ JSON conversion
  - ✅ Created dashboard integration with import/export
  - ✅ Added DSL modal with validation and formatting
  - ✅ Implemented syntax highlighting with overlay technique (342 lines)
  - ✅ Wrote comprehensive documentation (DSL-SYNTAX.md)
  - ✅ All DSL features: conditions, operators, grouping, actions, triggers, flags
  - ✅ Safety features: validation, disabled imports, error reporting

## Recently Completed (Last Session)
- ✅ Fixed console errors and CSP violations
- ✅ Fixed FAB menu styling issues
- ✅ Added real activity tracking system
- ✅ Replaced fake recent activity with real data
- ✅ Replaced fake history with real activity log
- ✅ Added window indicators and smart naming
- ✅ Fixed window dropdown counts
- ✅ Replaced memory stat with active/suspended tabs
- ✅ Added consistent empty states

---

## Notes
- Tab preview feature was abandoned due to Chrome API security limitations (can only capture visible tabs)
- Memory tracking was removed as it wasn't providing accurate or useful information
- Focus is on practical tab management rather than system metrics
- Performance with 200+ tabs remains a key requirement