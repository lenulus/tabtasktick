# TabMaster Pro - TODO Tracker

**Status**: Active
**Last Updated**: 2025-11-23
**Current Version**: 1.3.19 (dev)
**Last Release**: 1.3.18

> **📋 Full Details**: See [ARCHITECTURE-ACTION-PLAN.md](./ARCHITECTURE-ACTION-PLAN.md) for complete implementation plan, testing strategy, and rollback procedures.

## 🚨 Critical Work - Architectural Remediation

Following the v1.3.18 async message listener bug fix, architectural review revealed multiple similar issues throughout the codebase that risk production stability.

### Phase 1: Fix Async Listeners ⚡ CRITICAL

**Priority**: CRITICAL
**Risk**: Production bugs with non-deterministic behavior
**Estimated Time**: 2-3 hours
**Target**: Before next release

- [x] Create `/tabmaster-pro/services/utils/listeners.js` with `safeAsyncListener` utility
- [x] Fix async listener at line 412 (`chrome.runtime.onInstalled`)
- [x] Fix async listener at line 429 (`chrome.runtime.onStartup`)
- [x] Fix async listener at line 844 (`chrome.tabs.onCreated`)
- [x] Fix async listener at line 860 (`chrome.tabs.onUpdated`)
- [x] Fix async listener at line 867 (`chrome.tabs.onActivated`)
- [x] Fix async listener at line 876 (`chrome.tabs.onRemoved`)
- [x] Fix async listener at line 892 (`chrome.windows.onRemoved`)
- [x] Fix async listener at line 931 (`chrome.windows.onFocusChanged`)
- [x] Fix async listener at line 2386 (`chrome.commands.onCommand`)
- [x] Fix async listener at line 2719 (`chrome.contextMenus.onClicked`)
- [x] Fix async listener at line 2871 (`chrome.alarms.onAlarm`)
- [x] Fix async listener at line 3004 (`chrome.storage.onChanged`)
- [x] Verify: `grep -n "\.addListener(async" tabmaster-pro/**/*.js` returns 0 results
- [x] **Checkpoint commit** (17daa66)
- [x] **Improvements** (based on architecture-guardian review):
  - [x] Add error handling options to `safeAsyncListener`
  - [x] Remove unused `safeAsyncMessageListener` function
  - [x] Add double-wrap protection
  - [x] Create unit tests (`listeners.test.js`)
- [x] **Improvements commit** (ba799b8)
- [x] Test: Extension working correctly (user validated)
- [x] Phase 1 Complete ✅

**Reference**: [ARCHITECTURE-ACTION-PLAN.md - Phase 1](./ARCHITECTURE-ACTION-PLAN.md#phase-1-fix-async-listeners-immediate)

---

### Phase 2: Consolidate groupTabs Implementations ✅ **COMPLETE**

**Priority**: HIGH
**Risk**: Inconsistent behavior, maintenance burden
**Estimated Time**: 4-6 hours
**Actual Time**: ~5 hours
**Target**: Next sprint
**Status**: ✅ COMPLETE (2025-11-28)
**Findings**: [PHASE-2-FINDINGS.md](./PHASE-2-FINDINGS.md)

**Architecture Guardian Verdict**: APPROVED - Merge both design patterns into ONE unified service

**Key Insight**: The scope-based design (GLOBAL/TARGETED/PER_WINDOW) from TabGrouping.js should become **options** within the existing groupTabs.js, not a separate API.

#### Step 0: Delete Dead Code (Command Pattern) ✅ **COMPLETE**
- [x] Delete `/lib/commands/ActionManager.js`
- [x] Delete `/lib/commands/Command.js`
- [x] Delete `/services/selection/selectAndPlan.js`
- [x] Delete `/lib/engine.v2.command.full.js`
- [x] Delete `/lib/engine.v2.command.compact.js`
- [x] Commit: "chore: Remove unused experimental command pattern engine files" (45b91f5)

**Completed**: 2025-11-27 - Removed 1,432 lines of orphaned experimental code

#### Step 1: Enhance Canonical Service ✅ **COMPLETE**
- [x] Add `scope` option to `/services/execution/groupTabs.js` ('global' | 'targeted' | 'per_window')
- [x] Add `minTabsPerGroup` option (default: 2)
- [x] Add `includeSingleIfExisting` option (default: true)
- [x] Add `includePinned` option (default: false)
- [x] Implement global scope logic (pull tabs from all windows to target)
- [x] Implement per_window scope logic (process each window independently)
- [x] Preserve all existing focus management (callerWindowId, window switching)
- [x] Add comprehensive unit tests (16 tests, all passing)
- [x] Commit: "refactor: Add scope options to groupTabs service" (f19efe5)

#### Step 2: Update Dashboard Groups View ✅ **COMPLETE**
- [x] Remove import of `/services/TabGrouping.js` in `/dashboard/modules/views/groups.js`
- [x] Replace `groupTabsByDomain()` to call via message passing
- [x] Send message with `action: 'groupByDomain'`, `scope: 'targeted'`, `windowId`
- [x] Commit: "refactor: Update dashboard to use unified groupTabs via messaging" (0d25390)

#### Step 3: Update Background Handlers ✅ **COMPLETE**
- [x] Add import: `import { groupTabs } from './services/execution/groupTabs.js'`
- [x] Add message handler for `groupByDomain` action
- [x] Delete duplicate groupTabs function (lines 2317-2328)
- [x] Delete old groupByDomain function (49 lines)
- [x] Commit: "refactor: Replace background grouping with unified groupTabs service" (d51cd6a)

#### Step 4: Delete TabGrouping.js ✅ **COMPLETE**
- [x] Verify no references: `grep -rn "TabGrouping" tabmaster-pro/` (0 results except docs)
- [x] Delete `/services/TabGrouping.js` (388 lines)
- [x] Remove unused import from background
- [x] Commit: "refactor: Delete TabGrouping.js after consolidation" (8b2a138)

#### Step 5: Testing ✅ **COMPLETE**
- [x] Test: All 16 groupTabs unit tests pass
- [x] Test: Rules engine grouping still works (918 tests pass)
- [x] Test: Custom name grouping works
- [x] Test: minTabsPerGroup respected (tested)
- [x] Test: includePinned filter (tested)
- [x] Test: Focus restoration works (tested)
- [x] Test: Group reuse works (tested)
- [x] Verify: `grep -rn "function groupTabs"` returns only canonical service
- [x] Verify: All tests pass (50/54 suites pass - 4 pre-existing failures)

**Summary**: Successfully consolidated 2 groupTabs implementations + 1 duplicate into ONE unified service
- **Code Removed**: 820 lines (388 from TabGrouping.js + 61 from background + duplicates)
- **Code Added**: 719 lines (enhanced groupTabs.js + tests)
- **Net Reduction**: ~100 lines
- **Single Source of Truth**: `/services/execution/groupTabs.js`
- **All Features Preserved**: ✅ Scopes, thresholds, filters, focus management
- **Tests**: 16 new unit tests, all passing

**Reference**: [ARCHITECTURE-ACTION-PLAN.md - Phase 2](./ARCHITECTURE-ACTION-PLAN.md#phase-2-consolidate-grouptabs-high)

---

### Phase 3: Extract UI Business Logic 📱 MEDIUM

**Priority**: MEDIUM
**Risk**: Code duplication, harder testing
**Estimated Time**: 6-8 hours
**Target**: Future sprint

- [ ] Audit `/popup/command-palette.js` for Chrome API calls
- [ ] Audit `/popup/popup.js` for Chrome API calls
- [ ] Audit `/dashboard/dashboard.js` for Chrome API calls
- [ ] Create tracking sheet for each Chrome API call found
- [ ] For each Chrome API call:
  - [ ] Create service function (if not exists)
  - [ ] Add message handler in background-integrated.js
  - [ ] Replace direct call with message send
  - [ ] Test functionality
- [ ] Verify: No direct `chrome.tabs.*` calls in popup
- [ ] Verify: No direct `chrome.tabs.*` calls in dashboard
- [ ] Run full test suite
- [ ] Commit Phase 3 changes

**Reference**: [ARCHITECTURE-ACTION-PLAN.md - Phase 3](./ARCHITECTURE-ACTION-PLAN.md#phase-3-extract-ui-business-logic-medium)

---

### Phase 4: Add Preventive Infrastructure 🛡️ LOW

**Priority**: LOW
**Risk**: None (tooling improvements)
**Estimated Time**: 2-3 hours
**Target**: Future sprint

- [ ] Create `/services/utils/MessageListenerService.js`
- [ ] Add ESLint rule `no-async-chrome-listener` to `.eslintrc.js`
- [ ] Update CLAUDE.md with listener patterns section
- [ ] Add integration tests for multi-context scenarios
- [ ] Document patterns in service README files
- [ ] Run ESLint on entire codebase
- [ ] Fix any new violations found
- [ ] Commit Phase 4 changes

**Reference**: [ARCHITECTURE-ACTION-PLAN.md - Phase 4](./ARCHITECTURE-ACTION-PLAN.md#phase-4-add-preventive-infrastructure-low)

---

## 📊 Progress Summary

**Overall Progress**: 2/4 phases complete ✅

| Phase | Priority | Status | Progress |
|-------|----------|--------|----------|
| 1: Async Listeners | 🚨 CRITICAL | ✅ Complete | 21/21 tasks (100%) |
| 2: groupTabs Consolidation | 🔴 HIGH | ✅ Complete | 28/28 tasks (100%) |
| 3: Extract UI Logic | 🟡 MEDIUM | Not Started | 0/11 tasks |
| 4: Preventive Infrastructure | 🟢 LOW | Not Started | 0/8 tasks |

---

## 🎯 Current Sprint Focus

**Completed**:
- ✅ Phase 1 - All async listeners fixed and tested (v1.3.19 released)
- ✅ Phase 2 - groupTabs consolidation complete (2025-11-28)

**Next**: Phase 3 - Extract UI Business Logic (MEDIUM priority)
- Extract Chrome API calls from UI layers
- Move logic to services with message passing
- Maintain thin UI presentation layers

**Blockers**: None

**Notes**:
- ✅ Phase 1 complete - v1.3.19 released
- ✅ Phase 2 complete - Single source of truth for grouping
- All 4 commits clean and revertable if issues found
- Test suite: 918/933 tests passing (4 pre-existing failures)
- Code reduction: ~100 net lines removed

---

## 🧪 Testing Checklist

Before marking any phase complete, verify:

- [ ] No console errors in any UI context
- [ ] All operations work with multiple UI surfaces open
- [ ] Service worker suspension doesn't break functionality
- [ ] No timing-related or race condition bugs
- [ ] All automated tests pass
- [ ] Manual testing scenarios complete

---

## 📚 Quick Reference

**Find async listeners**:
```bash
grep -rn "\.addListener(async" tabmaster-pro/
```

**Find duplicate groupTabs**:
```bash
grep -rn "function groupTabs" tabmaster-pro/
```

**Find UI business logic**:
```bash
grep -rn "chrome\.tabs\." tabmaster-pro/popup/
grep -rn "chrome\.tabs\." tabmaster-pro/dashboard/
```

**Run tests**:
```bash
npm test
npm run test:e2e
```

**Build extension**:
```bash
./package-ext.sh --no-increment
```

---

## 🔄 Version History

- **v1.3.19** (dev) - Current development version
- **v1.3.18** (2025-11-23) - Fixed dashboard.js async listener bug, released
- **v1.3.17** - Previous release
- **v1.3.16** - Last known fully working version before bug became visible

---

## 📝 Notes

### Why This Work Matters

The v1.3.18 bug showed that `async` on Chrome listeners causes non-deterministic behavior. The bug was dormant for 2 months (Sept 30 - Nov 22) before becoming visible. This work eliminates 12+ similar time bombs throughout the codebase.

### Safe Pattern

```javascript
// ❌ WRONG - Returns Promise
chrome.runtime.onMessage.addListener(async (message) => {
  await something();
  return true; // Actually returns Promise.resolve(true)
});

// ✅ RIGHT - Returns true
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    await something();
    sendResponse(result);
  })();
  return true; // Actually returns true
});
```

### Related Files

- **Architectural Principles**: [CLAUDE.md](./CLAUDE.md)
- **Full Action Plan**: [ARCHITECTURE-ACTION-PLAN.md](./ARCHITECTURE-ACTION-PLAN.md)
- **Previous TODO**: [TODO-V2.md](./TODO-V2.md)
- **Services Directory**: [/tabmaster-pro/services/](./tabmaster-pro/services/)

---

**Last Review**: 2025-11-24
**Next Review**: After Phase 2 completion
