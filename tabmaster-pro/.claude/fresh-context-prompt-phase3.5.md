# Fresh Context Prompt: Phase 3.5 Implementation

**Date**: 2025-10-21
**Phase**: 3.5 - Search & Filters Infrastructure
**Status**: Design complete, ready for implementation (BLOCKER: test setup failure)

## 🎯 Objective

Implement Phase 3.5 Search & Filters with the approved **Group By / Sort By** design pattern, following the architecture documented in `/docs/GROUPBY-SORTBY-DESIGN.md`.

## 📚 Required Reading (Load These First)

1. **`@CLAUDE.md`** - Core architecture principles (services-first, no shortcuts)
2. **`@docs/GROUPBY-SORTBY-DESIGN.md`** - Complete design specification for Group By / Sort By pattern
3. **`@TODO.md`** (lines 871-974) - Phase 3.5 implementation tasks
4. **`@tabmaster-pro/tests/e2e/README.md`** - E2E testing patterns and best practices

## ⚠️ Known Issue: E2E Test Setup Failure

**Test #48 "setup: create test tasks" is currently failing**, causing downstream test failures.

**Strategy**: Implement Phase 3.5 features FIRST, then fix E2E tests to validate the new implementation. Don't get stuck debugging tests before building the feature.

**Details moved to**: See "Step 7: Fix E2E Tests (LAST)" section below for investigation steps.

## 🧭 Design Decision Summary

During E2E testing, we discovered a fundamental UX conflict: **Test #69 expected global sort, but UI groups tasks by collection**. This revealed the need to separate:

### Group By (Visual Organization)
- **Options**: Collection, Priority, Status, None
- **Purpose**: Creates visual sections with headers
- **Default**: Collection (shows project context)

### Sort By (Ordering)
- **Options**: Priority, Due Date, Created, Alpha
- **Direction**: Ascending (↑) or Descending (↓)
- **Purpose**: Orders tasks within groups (or globally if Group By = None)
- **Default**: Priority (High → Low)

### Key Principles
- ✅ **Independent controls** - No side effects (selecting sort doesn't change grouping)
- ✅ **Always visible** - User always sees current Group By and Sort By state
- ✅ **Persistent** - Saved to `chrome.storage.local`
- ✅ **Predictable** - Same inputs → same outputs

## 🔍 Existing Code Audit Required

**Before implementing**, check if Phase 3.5 code already exists from pre-design implementation:

1. **Does `/tabmaster-pro/sidepanel/search-filter.js` exist?**
   - If YES: Read it, identify conflicts with new design
   - If NO: Create from scratch

2. **Check `/tabmaster-pro/sidepanel/tasks-view.js`**:
   - Does `render()` already accept groupBy/sortBy options?
   - Is there existing grouping logic that conflicts with new design?
   - Is the duplicate `sortTasks()` method removed? (should be - commit 2054357)

3. **Check `/tabmaster-pro/sidepanel/panel.js`**:
   - Does `renderTasks()` already pass grouping options to view?
   - Is there SearchFilter initialization code?

4. **Present findings to user** before modifying working code

## ✅ Recent Commits (Ready to Push)

1. **81640b3**: Fix test #23-24 timeout (scroll + specific selector for sortBy dropdown)
2. **2054357**: Remove duplicate sorting from tasks-view.js (architecture violation fix)

## 📋 Implementation Checklist

### Step 1: Audit Existing Code
- [ ] Check for existing Phase 3.5 implementation
- [ ] Identify conflicts with new design
- [ ] Map reusable components vs refactor candidates
- [ ] Get user approval before modifying working code

### Step 2: Implement Group By / Sort By Controls
- [ ] Create or refactor `/sidepanel/search-filter.js`:
  - Group By dropdown (Collection, Priority, Status, None)
  - Sort By dropdown (Priority, Due Date, Created, Alpha)
  - Direction toggle (↑ ↓)
  - State persistence to `chrome.storage.local`
  - Event emitters to notify panel.js of changes

### Step 3: Update Tasks View
- [ ] Modify `/sidepanel/tasks-view.js`:
  - Update `render(tasks, collections, { groupBy, sortBy, sortDirection })`
  - Implement `renderUnifiedList()` for `groupBy: 'none'` (flat list)
  - Implement `renderGroups()` supporting Collection, Priority, Status
  - Respect controller's sort order (NO re-sorting in view)

### Step 4: Update Panel Controller
- [ ] Modify `/sidepanel/panel.js`:
  - Initialize SearchFilter
  - Get groupBy, sortBy, sortDirection from SearchFilter
  - Pass options to `tasksView.render()`

### Step 5: Verify Architecture Compliance
- [ ] Use `architecture-guardian` agent to review changes
- [ ] Ensure no business logic in UI components
- [ ] Verify services-first pattern maintained
- [ ] Check for duplicate logic violations

### Step 6: Commit Implementation
- [ ] Use `git-commit-helper` to commit Phase 3.5 changes
- [ ] Reference `/docs/GROUPBY-SORTBY-DESIGN.md` in commit message
- [ ] Include previous commits: 81640b3 (test timeout fix) and 2054357 (architecture fix)

### Step 7: Fix E2E Tests (LAST - Don't Get Stuck Here)

**Current Issue**: Test #48 "setup: create test tasks" is failing with:
```
Error: Test data missing! Setup tests must run first. Found: 0 collections, 0 tasks
```

**Root Cause**: Likely async/timing issue in test data creation
**Impact**: All 31 tests in `sidepanel-search-filters.spec.js` fail after setup

**Investigation Steps**:
1. Read `/tabmaster-pro/tests/e2e/sidepanel-search-filters.spec.js` (lines 244-350)
2. Check test #47 (setup: create test collections) - is it passing?
3. Check test #48 (setup: create test tasks) - what's the failure mode?
4. Review IndexedDB transaction handling in test helpers
5. Check for race conditions in task creation modal flow

**Update Tests for New UI**:
- [ ] Use `e2e-playwright-test-debugger` agent to fix test #48 setup
- [ ] Update test #69 to explicitly set `groupBy: 'none'` before testing global sort
- [ ] Update all 31 tests to work with new Group By/Sort By controls
- [ ] Ensure tests verify independent controls (no side effects)
- [ ] Verify all 31 tests pass

## 🛠️ Storage Schema

```javascript
// chrome.storage.local keys
{
  'tabtasktick.tasks.groupBy': 'collection',      // Collection|Priority|Status|None
  'tabtasktick.tasks.sortBy': 'priority',         // priority|dueDate|created|alpha
  'tabtasktick.tasks.sortDirection': 'desc'       // asc|desc
}
```

## 🤖 Available Sub-Agents for Context Efficiency

These specialized agents already exist and can help optimize context usage:

### 1. `Explore` (thoroughness: "medium")
**When**: First, before implementation
**Why**: Fast codebase exploration to find existing Phase 3.5 code
**Task**: "Find all files related to Phase 3.5 search/filter implementation: search-filter.js, any Group By/Sort By UI code, filter state management. Report what exists and where."

### 2. `architecture-guardian`
**When**: After implementation, before committing
**Why**: Proactive review to catch architecture violations
**Task**: "Review Phase 3.5 Group By/Sort By implementation for architecture compliance. Check: no business logic in UI, services-first pattern, no duplicate logic, proper separation of concerns."

### 3. `git-commit-helper`
**When**: After architecture review passes
**Why**: Handles git operations systematically
**Task**: "Commit Phase 3.5 implementation with clear message referencing /docs/GROUPBY-SORTBY-DESIGN.md"

### 4. `e2e-playwright-test-debugger`
**When**: LAST - after implementation is committed
**Why**: Specializes in systematic test debugging, manages context efficiently
**Task**: "Fix test #48 'setup: create test tasks' failure (likely async/timing issue), then update all 31 tests in sidepanel-search-filters.spec.js to work with new Group By/Sort By UI."

## 🎬 Suggested Session Flow

```
1. Load context documents (@CLAUDE.md, @docs/GROUPBY-SORTBY-DESIGN.md, @TODO.md)
2. Launch Explore agent → Find existing Phase 3.5 code
3. Present audit findings to user → Get approval on approach
4. Implement Group By/Sort By controls (or refactor existing)
5. Update tasks-view.js and panel.js
6. Test manually in browser (load extension, verify UI works)
7. Launch architecture-guardian → Verify compliance
8. Launch git-commit-helper → Commit implementation
9. Launch e2e-playwright-test-debugger → Fix test #48 and update all tests
10. Verify all 31 tests pass
```

## ⚠️ Critical Constraints

- **NO dynamic imports** - Use static imports only (Chrome extension limitation)
- **NO shortcuts** - Fix failing tests, don't comment them out
- **NO business logic in UI** - All logic in services, UI is thin
- **NO side effects** - Group By and Sort By are independent
- **ASK before cutting** - Get explicit approval before removing features

## 📖 Key Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `/docs/GROUPBY-SORTBY-DESIGN.md` | ALL | Complete design specification |
| `/TODO.md` | 871-974 | Phase 3.5 implementation tasks |
| `/tabmaster-pro/tests/e2e/sidepanel-search-filters.spec.js` | 244-350 | Test #48 (blocker) |
| `/tabmaster-pro/sidepanel/tasks-view.js` | 143-206 | View rendering (duplicate sortTasks removed) |
| `/tabmaster-pro/sidepanel/panel.js` | 842-873 | Controller sorting logic |

## 🎯 Success Criteria

- [ ] Group By and Sort By controls are implemented and independent (no side effects)
- [ ] User preferences persist across sessions via chrome.storage.local
- [ ] Architecture guardian approves implementation
- [ ] No business logic in UI components
- [ ] Implementation committed with clear documentation
- [ ] E2E tests updated and passing (done AFTER implementation)

---

**Generated**: 2025-10-21
**Last Updated**: After discovering test #48 blocker during E2E debugging
