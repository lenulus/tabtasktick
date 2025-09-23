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
- ❌ Create centralized state module
- ❌ Create storage service wrapper
- ❌ Migrate global variables to state

#### Milestone 3: Chrome API Service (~2 hours)
- ❌ Create Chrome API wrapper service
- ❌ Add error handling and retries
- ❌ Update all direct chrome.* calls

#### Milestone 4: Extract Components (~4 hours)
- ❌ Extract TabCard component
- ❌ Extract Filters component
- ❌ Extract BulkActions toolbar
- ❌ Extract Modal manager
- ❌ Extract Charts component

#### Milestone 5: Extract Simple Views (~3 hours)
- ❌ Extract History view module
- ❌ Extract Snoozed view module
- ❌ Extract Groups view module

#### Milestone 6: Extract Complex Views (~4 hours)
- ❌ Extract Tabs view module
- ❌ Extract Overview view module
- ❌ Extract Rules view module

#### Milestone 7: Router & Navigation (~2 hours)
- ❌ Create simple router module
- ❌ Add view lifecycle management
- ❌ Update navigation to use router

#### Milestone 8: Event System (~2 hours)
- ❌ Create event bus for module communication
- ❌ Refactor global event handlers
- ❌ Add event namespacing

#### Milestone 9: Final Integration (~3 hours)
- ❌ Slim down dashboard.js to <500 lines
- ❌ Performance optimization
- ❌ Full test suite run

#### Milestone 10: Polish & Cleanup (~2 hours)
- ❌ Code quality checks
- ❌ Error handling improvements
- ❌ Documentation updates

### High Priority (P1)
1. Implement unified time-based triggers [Spec: SPEC-002]
   - Tab time tracking (created, lastActive, lastAccessed)
   - Time criteria as optional modifiers for all conditions
   - Periodic rule checking with chrome.alarms
   - Update UI to support time criteria consistently
2. Make popup stats clickable with navigation to dashboard
3. Add "Create Rule" button to popup
4. Fix virtual scrolling for performance with 200+ tabs
5. Add domain include/exclude filters to domain_count rule

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
- ✅ Implemented tree view with full selection support
- ✅ Added drag-and-drop between windows and groups
- ✅ Created Move dialog for off-screen window targets
- ✅ Fixed Clear button to properly deselect all items
- ✅ Added suspended/muted/grouped filters
- ✅ Implemented bulk action activity logging
- ✅ Added tab event listeners for history tracking
- ✅ Fixed tree view persistence and initial load issues
- ✅ Added "go to tab" button in tree view
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