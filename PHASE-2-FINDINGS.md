# Phase 2 Findings: groupTabs Consolidation

**Date**: 2025-11-24 (Updated 2025-11-27)
**Status**: Step 0 Complete, Proceeding with Implementation
**Architecture Guardian**: APPROVED with modifications

---

## Executive Summary

**Found**: 2 active groupTabs services + 1 simple duplicate + 1 dead code reference
- `/services/execution/groupTabs.js` (302 lines) - Option-based design
- `/services/TabGrouping.js` (437 lines) - Scope-based design (GLOBAL/TARGETED/PER_WINDOW)
- `/background-integrated.js:2317` - Simple duplicate (delete)
- `/lib/commands/ActionManager.js` - Dead code (marked for deletion in phase7-dead-code-removal.md)

**Decision**: Consolidate into ONE unified service at `/services/execution/groupTabs.js` that supports BOTH design patterns through explicit options.

---

## Historical Context

### Timeline
- **Oct 3, 2025**: `TabGrouping.js` created (commit dfd2013) to consolidate 6 implementations
  - Introduced explicit GLOBAL/TARGETED/PER_WINDOW scoping
  - Documented in TAB-GROUPING-MATRIX.md
  - Intentional design to solve multi-window grouping problems

- **Later**: `groupTabs.js` evolved independently with many Chrome API bug fixes
  - Focus management for window switching quirks
  - Plan-then-execute pattern
  - Custom name support

### Why Two Services Exist
1. `TabGrouping.js` - Created for scope-based domain grouping
2. `groupTabs.js` - Created for rules engine with option-based design
3. Both evolved in parallel, solving the same problem differently

---

## Design Pattern Comparison

### TabGrouping.js (Scope-based)
```javascript
groupTabsByDomain(scope, targetWindowId, opts)
// scope: 'global' | 'targeted' | 'per_window'
```

**Scopes**:
- `GLOBAL`: Pull all tabs from all windows → target window
- `TARGETED`: Group tabs only within specified window
- `PER_WINDOW`: Group tabs within each window independently

**Unique Features**:
- `minTabsPerGroup` (default 2)
- `includeSingleIfExisting` (add single tab to existing group)
- `includePinned` (default false)
- `specificTabIds` filter
- Explicit scope control

### groupTabs.js (Option-based)
```javascript
groupTabs(tabIds, options)
// options: { byDomain, customName, perWindow, collapsed, dryRun, callerWindowId }
```

**Unique Features**:
- `customName` - Group with custom name (not just domain)
- `perWindow` - Window boundary respect (boolean)
- `collapsed` - Collapse groups after creation
- `dryRun` - Preview mode
- `callerWindowId` - Focus restoration after grouping
- Complex focus management (prevents Chrome window stealing bugs)
- Plan-then-execute pattern

---

## Architecture Guardian Review

### Violations Identified
1. **Duplicate implementations**: Two services solving the same problem
2. **Simple duplicate**: background-integrated.js has inline implementation

### Recommended Solution
**ONE service** at `/services/execution/groupTabs.js` with unified API supporting both patterns.

### Key Insight
The scope-based design (GLOBAL/TARGETED/PER_WINDOW) should become **options** within the option-based design, not a separate API.

---

## Unified API Design

```javascript
export async function groupTabs(tabIds, options = {}) {
  const {
    // Grouping strategy
    byDomain = true,              // Group by domain (default)
    customName = null,            // Override with custom name

    // Scoping control (NEW - maps TabGrouping.js scopes)
    scope = 'targeted',           // 'global' | 'targeted' | 'per_window'
    targetWindowId = null,        // Required for global/targeted
    perWindow = true,             // Legacy compatibility

    // Group configuration
    collapsed = false,
    minTabsPerGroup = 2,          // NEW - from TabGrouping.js
    includeSingleIfExisting = true, // NEW - from TabGrouping.js

    // Tab filters
    includePinned = false,        // NEW - from TabGrouping.js

    // Execution control
    dryRun = false,
    callerWindowId = null,        // Focus management (KEEP)
  } = options;

  // Implementation uses existing focus management logic
  // Adds scope handling for global/per_window cases
}
```

---

## Mapping Between Patterns

### TabGrouping.js → Unified API

**GLOBAL scope**:
```javascript
// Before:
groupTabsByDomain('global', targetWindowId)

// After:
groupTabs(allTabIds, {
  scope: 'global',
  targetWindowId,
  byDomain: true
})
```

**TARGETED scope**:
```javascript
// Before:
groupTabsByDomain('targeted', windowId)

// After:
groupTabs(windowTabIds, {
  scope: 'targeted',
  targetWindowId: windowId,
  byDomain: true
})
```

**PER_WINDOW scope**:
```javascript
// Before:
groupTabsByDomain('per_window', null)

// After:
groupTabs(allTabIds, {
  scope: 'per_window',
  byDomain: true
})
```

---

## Current Usage Analysis

### groupTabs.js Users
1. **lib/engine.v2.services.js** (rules engine) ✅ Correct usage
   - Already uses option-based API
   - No changes needed

2. **lib/commands/ActionManager.js** ⚠️ DEAD CODE
   - File marked for deletion in phase7-dead-code-removal.md
   - Part of experimental Command pattern (never deployed)
   - Should delete BEFORE this refactor

### TabGrouping.js Users
1. **dashboard/modules/views/groups.js** 🔧 Needs update
   - Currently: `groupTabsByDomain(GroupingScope.TARGETED, windowId)`
   - Change to: Message passing to background → unified groupTabs

### Simple Duplicate
1. **background-integrated.js:2317** ❌ Delete
   - Basic inline implementation
   - Replace with service import

---

## Implementation Plan

### Step 0: Delete Dead Code (FIRST) ✅ **COMPLETE**
- [x] Delete `/lib/commands/ActionManager.js` (549 lines)
- [x] Delete `/lib/commands/Command.js` (306 lines)
- [x] Delete `/services/selection/selectAndPlan.js` (280 lines)
- [x] Delete `/lib/engine.v2.command.full.js` (180 lines)
- [x] Delete `/lib/engine.v2.command.compact.js` (117 lines)

**Completed**: 2025-11-27 in commit 45b91f5
**Total Removed**: 1,432 lines of orphaned experimental code
**Rationale**: Phase7-dead-code-removal.md documents these as experimental/unused. Clean slate before refactoring.

### Step 1: Enhance Canonical Service
**File**: `/services/execution/groupTabs.js`

**Add options**:
- `scope` - 'global' | 'targeted' | 'per_window' (default: 'targeted')
- `minTabsPerGroup` - Number (default: 2)
- `includeSingleIfExisting` - Boolean (default: true)
- `includePinned` - Boolean (default: false)

**Add logic**:
- Handle `scope === 'global'` (pull tabs from all windows to target)
- Handle `scope === 'per_window'` (process each window independently)
- Apply `minTabsPerGroup` threshold
- Filter pinned tabs if `includePinned === false`
- Skip groups with < minTabsPerGroup unless `includeSingleIfExisting` and group exists

**Preserve**:
- All existing focus management (critical for Chrome API bugs)
- Plan-then-execute pattern
- Custom name support
- callerWindowId logic

### Step 2: Update Dashboard Groups View
**File**: `/dashboard/modules/views/groups.js`

**Change**:
```javascript
// Remove import:
import { GroupingScope, groupTabsByDomain, getCurrentWindowId } from '../../../services/TabGrouping.js';

// Replace groupTabsByDomain function:
export async function groupTabsByDomain() {
  const currentWindow = await chrome.windows.getCurrent();

  const result = await chrome.runtime.sendMessage({
    action: 'groupByDomain',
    scope: 'targeted',
    windowId: currentWindow.id
  });

  await loadGroupsView();

  if (result.success) {
    showNotification(`Created ${result.summary.groupsCreated} groups`, 'success');
  }
}
```

### Step 3: Add Background Message Handler
**File**: `/background-integrated.js`

**Add import** (top of file):
```javascript
import { groupTabs } from './services/execution/groupTabs.js';
```

**Add message handler**:
```javascript
case 'groupByDomain':
  const windowId = request.windowId || request.scope === 'global'
    ? request.windowId
    : (await chrome.windows.getCurrent()).id;

  const tabs = await chrome.tabs.query(
    request.scope === 'global' ? {} : { windowId }
  );

  const result = await groupTabs(tabs.map(t => t.id), {
    byDomain: true,
    scope: request.scope || 'targeted',
    targetWindowId: windowId,
    callerWindowId: request.callerWindowId
  });

  sendResponse(result);
  break;
```

**Delete duplicate** (lines 2317-2328):
```javascript
// DELETE THIS:
async function groupTabs(tabIds, groupName) {
  if (tabIds.length === 0) return;
  const groupId = await chrome.tabs.group({ tabIds });
  // ... rest of duplicate implementation
}
```

### Step 4: Delete TabGrouping.js
**File**: `/services/TabGrouping.js`

- [ ] Verify no references remain: `grep -rn "TabGrouping" tabmaster-pro/`
- [ ] Delete entire file

### Step 5: Testing
- [ ] Dashboard "Group All by Domain" works (targeted scope)
- [ ] Rules engine grouping still works
- [ ] Custom name grouping works
- [ ] minTabsPerGroup respected (skip single-tab domains)
- [ ] includePinned works (pinned tabs excluded by default)
- [ ] Focus restoration works (no window stealing)
- [ ] Group reuse works (no duplicates)

---

## Features Preserved

### From groupTabs.js ✅
- Complex focus management (callerWindowId, window switching logic)
- Plan-then-execute pattern with dry-run
- Custom name support (`customName` option)
- Collapsed option
- All Chrome API bug workarounds

### From TabGrouping.js ✅
- GLOBAL scope (pull all tabs to target window)
- PER_WINDOW scope (group each window independently)
- TARGETED scope (group within specific window)
- `minTabsPerGroup` configuration
- `includeSingleIfExisting` option
- `includePinned` filter

### Removed Features ❌
- `specificTabIds` - Caller should filter tabIds before calling (selection concern)
- `getCurrentWindowId()` helper - Use chrome.windows.getCurrent() directly

---

## Success Criteria

- [ ] Only ONE groupTabs implementation exists: `/services/execution/groupTabs.js`
- [ ] All scope modes work: global, targeted, per_window
- [ ] Dashboard grouping works via message passing
- [ ] Rules engine grouping unchanged and working
- [ ] All features from both services preserved
- [ ] No window focus stealing bugs
- [ ] `grep -rn "TabGrouping" tabmaster-pro/` returns 0 results (except docs)
- [ ] Command pattern dead code deleted
- [ ] TODO.md updated
- [ ] All tests pass

---

## Rollback Plan

Commits should be separate and revertable:
1. Commit: Delete Command dead code
2. Commit: Enhance groupTabs.js with new options
3. Commit: Update dashboard groups view
4. Commit: Update background handlers
5. Commit: Delete TabGrouping.js

Each commit independently revertable if issues found.

---

**Next Action**: Delete Command pattern dead code (Step 0)
