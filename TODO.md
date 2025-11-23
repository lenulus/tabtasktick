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
- [ ] Test: Install/uninstall extension
- [ ] Test: Create/update/remove tabs
- [ ] Test: Trigger alarms
- [ ] Test: Context menus
- [ ] Test: Change settings
- [x] Verify: `grep -n "\.addListener(async" tabmaster-pro/**/*.js` returns 0 results
- [ ] Commit Phase 1 changes

**Reference**: [ARCHITECTURE-ACTION-PLAN.md - Phase 1](./ARCHITECTURE-ACTION-PLAN.md#phase-1-fix-async-listeners-immediate)

---

### Phase 2: Consolidate groupTabs Implementations 🔧 HIGH

**Priority**: HIGH
**Risk**: Inconsistent behavior, maintenance burden
**Estimated Time**: 4-6 hours
**Target**: Next sprint

- [ ] Document features in `/services/execution/groupTabs.js` (canonical)
- [ ] Document features in `/services/TabGrouping.js`
- [ ] Document features in `/dashboard/dashboard.js:635`
- [ ] Document features in `/background-integrated.js:2314`
- [ ] Create feature comparison matrix
- [ ] Merge all features into `/services/execution/groupTabs.js`
- [ ] Update background-integrated.js to use service
- [ ] Update dashboard.js to call via message passing
- [ ] Delete `/services/TabGrouping.js`
- [ ] Delete local groupTabs in `/dashboard/dashboard.js:635`
- [ ] Delete duplicate in `/background-integrated.js:2314`
- [ ] Test: Group by domain
- [ ] Test: Group by name
- [ ] Test: Group across windows
- [ ] Test: Group with colors
- [ ] Test: Collapse groups
- [ ] Verify: `grep -rn "function groupTabs" tabmaster-pro/` returns only service
- [ ] Update documentation
- [ ] Commit Phase 2 changes

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

**Overall Progress**: 0/4 phases complete (Phase 1: 14/20 tasks)

| Phase | Priority | Status | Progress |
|-------|----------|--------|----------|
| 1: Async Listeners | 🚨 CRITICAL | In Progress | 14/20 tasks (70%) |
| 2: groupTabs Consolidation | 🔴 HIGH | Not Started | 0/17 tasks |
| 3: Extract UI Logic | 🟡 MEDIUM | Not Started | 0/11 tasks |
| 4: Preventive Infrastructure | 🟢 LOW | Not Started | 0/8 tasks |

---

## 🎯 Current Sprint Focus

**Immediate**: Phase 1 - Fix all async listeners before next release

**Blockers**: None

**Notes**:
- Phase 1 must complete before v1.3.19 release
- Each phase should be committed separately for rollback safety
- Test with popup + dashboard + sidepanel all open simultaneously
- Watch for console errors in all UI contexts

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

**Last Review**: 2025-11-23
**Next Review**: After Phase 1 completion
