# TabMaster Pro - TODO

## Critical Issues

### Window Isolation Regression in Tab Grouping
**Status**: Test passes but with wrong behavior
**Priority**: High
**Affected**: v2 engine (v1 also broken currently, but earlier code worked)

**Problem**:
1. Tabs created in test window migrate to main window during grouping
2. Earlier versions of the code properly isolated tabs in test windows
3. Current fix queries across all windows, violating `perWindow=true` scoping

**Current Behavior**:
- Test `domain-grouping-reuse` PASSES ✅
- But all tabs move from test window (181866465) to main window (181866248)
- Groups are correctly reused (no duplicates)
- Tab counts are correct

**Root Cause**:
- `chrome.tabs.group()` API appears to move tabs between windows
- Current fix searches globally for existing groups (`chrome.tabGroups.query({})`)
- When reusing groups, sets `allowWindowMove: true` and uses `existingGroup.windowId`
- This breaks `perWindow=true` semantics

**What Needs Fixing**:
1. Understand why `chrome.tabs.group()` moves tabs out of their window
2. Restore window isolation - tabs should stay in their creation window
3. Respect `perWindow` option:
   - When `perWindow=true`: Only search for groups in target window
   - When `perWindow=false`: Allow cross-window group consolidation
4. Find what changed from earlier working code that handled this correctly

**Files Involved**:
- `/services/execution/groupTabs.js` - Main grouping logic
- `/lib/engine.v2.services.js` - Calls grouping with `perWindow: true`

**Test Case**:
- Scenario: `domain-grouping-reuse`
- Run with v2 engine selected in Test Runner
- Observe tabs migrating from test window to main window

**Next Steps**:
1. Check git history to find when window isolation broke
2. Compare with earlier working implementation
3. Investigate Chrome API docs for proper window-scoped grouping
4. Implement fix that respects window boundaries while preventing duplicate groups
