# Phase 8 Continuation Session Prompt

## Context Summary

You are continuing work on **TabMaster Pro**, a Chrome extension for advanced tab management. You're picking up where Phase 8.0-8.3 left off.

## What's Been Completed

### Phase 8.0: Multi-Window Test Infrastructure ✅ (5 hours)
- **Files Created**:
  - `/tests/utils/window-test-helpers.js` - 11 helper functions for creating mock windows/tabs
  - `/tests/window-operations.test.js` - 26 Jest unit tests for multi-window scenarios
- **Enhancements**:
  - Test runner supports multi-window test scenarios (3 integration tests in test-panel)
  - Window-level assertions (assertWindowExists, assertWindowTabCount, assertWindowState)
  - Fixed window query scope (search all windows, not just test window)
- **Status**: 443 tests passing, zero architectural violations

### Phase 8.1: WindowService + Basic Operations ✅ (4 hours)
- **Files Created**:
  - `/services/execution/WindowService.js` (283 lines)
    - `getAllWindows()` - Get all windows with tabs
    - `getWindowMetadata()` - Get window properties (position, size, state)
    - `snoozeWindow()` - Snooze entire window with metadata preservation
    - `restoreWindow()` - Restore via ExportImportService delegation (reuses 137 lines)
    - `deduplicateWindow()` - Window-scoped duplicate removal
    - `getWindowStats()` - Window statistics
    - `getWindowDuplicateCount()` - Count duplicates in window
  - `/tests/WindowService.test.js` - 7 unit tests covering all functions
- **Files Modified**:
  - `/services/execution/SnoozeService.js` - Added `windowSnoozeId` parameter support (backward compatible)
  - `/background-integrated.js` - Added context menu items and handlers (THIN - delegate to WindowService)
- **Context Menu Integration**:
  - "Snooze Window" with submenu (1h, 3h, tomorrow)
  - "Remove Duplicates in Window"
- **Critical Bug Fixes**:
  - Fixed dedupe closing all tabs (was missing dupeKey property)
  - Fixed Wake All not recreating windows (now detects windowSnoozeId)
  - Fixed window auto-close error (wrapped chrome.windows.remove in try-catch)
  - Fixed alarm cleanup on manual restore (clears alarms + removes from storage)
- **Status**: All tests passing, production release v1.2.3

### Phase 8.2: Window-Scoped Deduplication ⚠️ (1 hour - partially complete)
- **Completed**:
  - Window-scoped deduplication via context menu
  - `WindowService.deduplicateWindow()` adds dupeKey before calling closeDuplicates
  - Tested and working (keeps one of each URL per window)
- **Deferred** (low priority):
  - Rules engine integration (`scope: 'window'` in action schema)
  - Dedicated window-dedupe.test.js (basic coverage in WindowService.test.js)

### Phase 8.3: Window Snooze/Restore UI ✅ (2 hours - mostly complete)
- **Files Modified**:
  - `/dashboard/modules/views/snoozed.js` - Window snooze cards with visual grouping
  - `/dashboard/dashboard.css` - Window snooze card styling (116 lines)
  - `/background-integrated.js` - Added restoreWindow/deleteWindow handlers
- **Dashboard Features**:
  - Window snooze cards with gradient styling and blue border
  - Tab preview (first 3 tabs with favicons)
  - "+X more" indicator for additional tabs
  - "Restore Window" button (blue)
  - "Delete All" button (red)
  - Dark theme support
- **Background Handlers**:
  - `wakeAllSnoozed` - Detects windowSnoozeId and recreates windows
  - `restoreWindow` - Delegates to WindowService
  - `deleteWindow` - Removes all tabs + metadata
- **Deferred** (context menu is sufficient):
  - Dashboard tabs view integration (window action buttons)
  - Duration picker modal

## What's Remaining in Phase 8

### Phase 8.4: Scheduled Export Snapshots ❌ (8-10 hours - LOW PRIORITY)
**Status**: Deferred indefinitely due to low demand

This would add automatic backup functionality:
- Scheduled exports using chrome.alarms
- Automatic cleanup of old snapshots
- Storage quota monitoring
- Settings UI for frequency/retention
- Snapshot management (restore, delete, manual trigger)

**Recommendation**: Only implement if users explicitly request this feature.

## Current Architecture Status

### Services-First Architecture (✅ Maintained)
- **WindowService** delegates to:
  - `ExportImportService.importData()` for window restoration (DRY - reuses 137 lines)
  - `SnoozeService.snoozeTabs()` for tab snoozing
  - `closeDuplicates()` for deduplication
- **All handlers are THIN** (3-5 lines, delegate to services)
- **No duplicate implementations** - single source of truth maintained

### Test Coverage
- **Total**: 443 tests passing
- **Window-specific**: 33 tests (26 in window-operations.test.js + 7 in WindowService.test.js)
- **Zero failures**, zero architectural violations

### Recent Commits
- `85ad92c` - Phase 8.1: Window operations with bug fixes
- `0ae30bd` - Fix: Clear alarms when manually restoring snoozed windows
- `87db90a` - Docs: Update TODO.md with Phase 8.1-8.3 completion status
- **Tag**: `v1.2.3` - Production release with all Phase 8.1-8.3 features

## Files You Should Review

### Core Implementation
1. `/services/execution/WindowService.js` - Main window operations service
2. `/services/execution/SnoozeService.js` - Lines 38-91 (windowSnoozeId support)
3. `/background-integrated.js` - Lines 1780-1813 (context menu), 1999-2060 (handlers), 1280-1320 (wakeAllSnoozed)

### UI Implementation
4. `/dashboard/modules/views/snoozed.js` - Lines 25-143 (window snooze rendering), 249-323 (event handlers)
5. `/dashboard/dashboard.css` - Lines 2566-2681 (window snooze card styles)

### Tests
6. `/tests/WindowService.test.js` - 7 unit tests
7. `/tests/window-operations.test.js` - 26 multi-window tests
8. `/tests/utils/window-test-helpers.js` - Test helper functions

### Documentation
9. `/docs/phase8-window-operations.md` - Full Phase 8 design doc
10. `/TODO.md` - Lines 1044-1224 (Phase 8 status and timeline)
11. `@CLAUDE.md` - Architecture principles (services-first, THIN handlers, DRY)

## Potential Next Steps (If Continuing Phase 8)

### Option A: Complete Phase 8.2 (Rules Engine Integration)
**Time**: ~3-4 hours
**Value**: LOW (context menu covers most use cases)

Tasks:
- Add `scope: 'window' | 'global'` parameter to closeDuplicates action schema
- Update rules engine to pass windowScope to closeDuplicates
- Create dedicated window-dedupe.test.js with cross-window scenarios
- Update docs with rules engine examples

### Option B: Enhance Phase 8.3 (Dashboard Integration)
**Time**: ~2-3 hours
**Value**: MEDIUM (improves discoverability)

Tasks:
- Add window action buttons to Dashboard tabs view
- Duration picker modal for custom snooze times
- Window dedupe button in tabs view
- Bulk window operations (snooze/restore multiple windows)

### Option C: Implement Phase 8.4 (Scheduled Exports)
**Time**: ~8-10 hours
**Value**: LOW (feature request needed first)

Tasks:
- Create ScheduledExportService with chrome.alarms integration
- Settings UI for export configuration
- Snapshot management UI
- Storage quota monitoring
- Automatic cleanup of old snapshots

### Option D: Move to Phase 9 (Documentation)
**Time**: ~4-6 hours
**Value**: HIGH (improves maintainability)

Tasks:
- Document all service APIs with JSDoc
- Create service dependency diagram
- Update CLAUDE.md with service list
- Create usage examples for each service
- Document data flow and state management

## Recommended Approach

Based on current status and pragmatic scoping:

1. **Skip Phase 8.4** (low demand, high complexity)
2. **Consider Phase 8.2 completion only if**: Users request window-scoped deduplication in rules
3. **Consider Phase 8.3 enhancements only if**: Users report difficulty discovering window features
4. **Prioritize Phase 9**: Documentation improves long-term maintainability

## Important Constraints

### Chrome Extension Limitations
- **NEVER use dynamic imports** (`import()` or `await import()`) - crashes Chrome
- All imports MUST be static at top of file
- Service workers cannot use dynamic module loading
- Test changes incrementally - one small change at a time

### Architecture Rules (Non-Negotiable)
- **Services-first**: All business logic in `/services/*`
- **THIN handlers**: UI/background code only calls services (3-5 lines max)
- **No duplicate implementations**: Extract shared logic to services
- **Separation of concerns**: Selection (what) vs Execution (how)
- **DRY principle**: Reuse existing services (like ExportImportService)

### Testing Requirements
- Run `npm test` before committing (must pass all 443 tests)
- Add tests for new functionality
- Manual testing for UI changes
- Zero architectural violations tolerated

## Quick Start Commands

```bash
# Review current status
cat TODO.md | grep -A 30 "Phase 8"

# Run tests
cd /Users/anthonylaforge/dev/bmpro/tabmaster-pro
npm test

# Check test coverage
npm run test:coverage

# Build for testing
cd /Users/anthonylaforge/dev/bmpro
./build-extension.sh

# Release build
./build-extension.sh --release
```

## Key Decisions Made

1. **Pragmatic Scoping**: Focused on high-value features (context menu over complex dashboard UI)
2. **Service Reuse**: WindowService delegates to ExportImportService (saved ~2 hours, maintained DRY)
3. **Context Menu First**: Provides immediate user value without complex UI
4. **Dashboard Enhancement**: Visual grouping for snoozed windows (high UX value, low complexity)
5. **Deferred Rules Integration**: Low demand for window-scoped rules

## Success Metrics

- **Time Efficiency**: 12h actual vs 24-34h estimated (50% savings)
- **Quality**: 443 tests passing, zero violations
- **Architecture**: Services-first maintained, no technical debt
- **User Value**: Context menu + dashboard provide complete workflow
- **Production Ready**: v1.2.3 released with all features

---

## Your Task

Continue from where Phase 8.1-8.3 left off. Choose one of the options above (A, B, C, or D) based on:
- User demand
- Technical value
- Time constraints
- Maintainability impact

Follow the architecture rules strictly. Test thoroughly. Maintain the services-first approach.
