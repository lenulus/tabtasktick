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
- 🚧 Move rules from settings to dashboard (better discoverability)
- ⚠️ Fix Edit/Disable/Delete functionality (currently broken)
- ⚠️ Remove or disable dangerous default rules (5 pre-populated rules)
- ❌ Create custom rules
- ❌ Rule conditions (URL patterns, time, memory)
- ❌ Rule actions (close, group, snooze)
- ❌ Rule scheduling
- ❌ Rule templates
- ❌ Rule import/export

### Command Palette
- ❌ Quick command access (Ctrl+Shift+P)
- ❌ Fuzzy search
- ❌ Recent commands
- ❌ Custom commands
- ❌ Keyboard navigation

### Bookmarks Integration
- ❌ Save tab groups as bookmarks
- ❌ Import bookmarks as tabs
- ❌ Bookmark folder sync
- ❌ Auto-bookmark before close

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

### High Priority (P1)
1. Complete tree view for All Tabs dashboard
2. Move rules engine to dashboard for better discoverability
3. Fix rules Edit/Disable/Delete functionality
4. Make popup stats clickable with navigation to dashboard
5. Replace popup memory stat with meaningful metric
6. Remove/disable dangerous default rules

### Medium Priority (P2)
1. Fix virtual scrolling for performance with 200+ tabs
2. Complete import functionality
3. Add undo functionality for destructive actions
4. Command palette
5. Dark mode support
6. Bookmark integration

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