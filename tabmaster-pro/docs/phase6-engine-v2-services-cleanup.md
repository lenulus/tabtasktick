# Phase 6: Engine v2 Services Cleanup - REVISED SCOPE

## Scope Clarification

**ONLY FOCUSING ON**: `lib/engine.v2.services.js` (574 lines)

**NOT IN SCOPE** (officially deprecated):
- ❌ `lib/engine.js` - Legacy, to be removed later
- ❌ `lib/engine.v1.legacy.js` - Legacy, to be removed later
- ❌ `lib/engine.v2.command.full.js` - Experimental, to be removed later
- ❌ `lib/engine.v2.command.compact.js` - Experimental, to be removed later

This dramatically simplifies Phase 6 - we're only cleaning up the ONE production engine.

---

## Current State Analysis: engine.v2.services.js

### What's Good ✅

1. **Already uses SelectionService** (line 9, 39)
   ```javascript
   import { selectTabsMatchingRule } from '../services/selection/selectTabs.js';
   // ...
   const matches = await selectTabsMatchingRule(rule, context.tabs, context.windows);
   ```
   ✅ Selection is properly delegated to service

2. **Already uses SnoozeService** (line 10, 284)
   ```javascript
   import * as SnoozeService from '../services/execution/SnoozeService.js';
   // ...
   await SnoozeService.snoozeTabs([tab.id], snoozeUntil, `rule: ${context.ruleName}`);
   ```
   ✅ Snooze properly delegated to service

3. **Already uses SuspensionService** (line 11, 269)
   ```javascript
   import * as SuspensionService from '../services/execution/SuspensionService.js';
   // ...
   const result = await SuspensionService.suspendTabs([tab.id], action.params);
   ```
   ✅ Suspension properly delegated to service

4. **Already uses groupTabs service** (line 13)
   ```javascript
   import { groupTabs } from '../services/execution/groupTabs.js';
   ```
   ✅ But NOT USED in executeAction - that's the problem!

5. **Clean orchestration** (lines 22-85)
   - Thin runRules function
   - Delegates selection to service
   - Executes actions
   - Returns clean results
   ✅ Good architecture

### What's Bad ❌

#### Problem #1: Inline Chrome API Calls (5 actions)

**Location**: `executeAction` function (lines 232-416)

| Action | Lines | Chrome API Call | Should Use |
|--------|-------|-----------------|------------|
| close | 237-240 | `chrome.tabs.remove()` | TabActionsService.closeTabs() |
| pin | 242-246 | `chrome.tabs.update()` | TabActionsService.pinTabs() |
| unpin | 248-252 | `chrome.tabs.update()` | TabActionsService.unpinTabs() |
| mute | 254-258 | `chrome.tabs.update()` | TabActionsService.muteTabs() |
| unmute | 260-264 | `chrome.tabs.update()` | TabActionsService.unmuteTabs() |

**Total**: 28 lines of simple Chrome API calls that should be services

#### Problem #2: Bookmark Logic (31 lines)

**Location**: Lines 288-319

**Issue**: Has TODO comment (line 289) but never extracted:
```javascript
// TODO: Move to BookmarkService
if (!dryRun && context.chrome?.bookmarks) {
  // 31 lines of folder lookup/creation logic
  const bookmarks = await context.chrome.bookmarks.search({ title: action.to });
  // ... complex folder management
  await context.chrome.bookmarks.create({ ... });
}
```

**Should be**:
```javascript
return await BookmarkService.bookmarkTabs([tab.id], { folder: action.to });
```

#### Problem #3: Move Action (90 lines!)

**Location**: Lines 321-411

**Issue**: Massive inline implementation with:
- Group preservation logic (lines 330-343)
- New window creation (lines 345-377)
- Existing window move (lines 379-409)
- Window focus management (lines 348, 359, 370, 388, 392, 403)

This is complex business logic that should be in a service.

**Should be**:
```javascript
return await TabActionsService.moveTabsToWindow([tab.id], {
  windowId: action.windowId || action.to,
  preserveGroup: action.preserveGroup !== false
});
```

#### Problem #4: Group Action Missing

**Location**: executeAction switch statement

**Issue**: Group action is NOT in the switch statement! The import exists (line 13) but is never used.

**Missing**:
```javascript
case 'group':
  return await groupTabs([tab.id], {
    name: action.name,
    byDomain: action.by === 'domain',
    // ... other options
  });
```

This means group actions in v2 engine **don't work at all**!

#### Problem #5: Helper Function Not Extracted

**Location**: Lines 421-431

```javascript
function parseDuration(duration) {
  // 11 lines of duration parsing
}
```

**Should be**: Moved to `/lib/utils/time.js` for reusability

---

## Revised Implementation Plan

### Phase 6.1: Create Missing Services

#### 6.1.1 Create TabActionsService ✅
**File**: `/services/execution/TabActionsService.js` (~150 lines)

**API**:
```javascript
// Simple actions
export async function closeTabs(tabIds)
export async function pinTabs(tabIds)
export async function unpinTabs(tabIds)
export async function muteTabs(tabIds)
export async function unmuteTabs(tabIds)

// Complex action
export async function moveTabsToWindow(tabIds, options = {})
  // options: { windowId, preserveGroup }
  // Handles: new window creation, group preservation, focus management
```

**Why one service**:
- Simple actions (close/pin/mute) are trivial wrappers
- Move is complex but related to tab lifecycle
- Single import keeps engine clean

#### 6.1.2 Create BookmarkService ✅
**File**: `/services/execution/BookmarkService.js` (~80 lines)

**API**:
```javascript
export async function bookmarkTabs(tabIds, options = {})
  // options: { folder, parentId }

// Internal helper
async function findOrCreateFolder(folderName)
```

**Extracts**: Lines 288-319 from engine

#### 6.1.3 Create Time Utilities ✅
**File**: `/lib/utils/time.js` (~20 lines)

**API**:
```javascript
export function parseDuration(duration)
  // '1h' -> 3600000
  // '30m' -> 1800000
  // '2d' -> 172800000
```

**Extracts**: Lines 421-431 from engine

---

### Phase 6.2: Update engine.v2.services.js

**File**: `lib/engine.v2.services.js`

#### Step 1: Add Imports
```javascript
import {
  closeTabs, pinTabs, unpinTabs, muteTabs, unmuteTabs,
  moveTabsToWindow
} from '../services/execution/TabActionsService.js';
import { bookmarkTabs } from '../services/execution/BookmarkService.js';
import { parseDuration } from '../lib/utils/time.js';
```

#### Step 2: Replace executeAction Switch

**BEFORE** (149 lines, 232-416):
```javascript
async function executeAction(action, tab, context, dryRun) {
  switch (actionType) {
    case 'close':
      if (!dryRun) await context.chrome.tabs.remove(tab.id);
      return { success: true, details: { closed: tab.id } };

    // ... 28 lines of simple Chrome API calls
    // ... 31 lines of bookmark logic
    // ... 90 lines of move logic
  }
}
```

**AFTER** (~40 lines):
```javascript
async function executeAction(action, tab, context, dryRun) {
  const actionType = action.action || action.type;

  // Engine handles dry-run before calling services
  if (dryRun) {
    return { success: true, dryRun: true, action: actionType, tabId: tab.id };
  }

  switch (actionType) {
    case 'close':
      return await closeTabs([tab.id]);

    case 'pin':
      return await pinTabs([tab.id]);

    case 'unpin':
      return await unpinTabs([tab.id]);

    case 'mute':
      return await muteTabs([tab.id]);

    case 'unmute':
      return await unmuteTabs([tab.id]);

    case 'suspend':
    case 'discard':
      return await SuspensionService.suspendTabs([tab.id], action.params);

    case 'snooze':
      const duration = parseDuration(action.for || '1h');
      const snoozeUntil = Date.now() + duration;
      return await SnoozeService.snoozeTabs(
        [tab.id],
        snoozeUntil,
        `rule: ${context.ruleName || 'v2_rule'}`
      );

    case 'group':
      return await groupTabs([tab.id], {
        name: action.name,
        byDomain: action.by === 'domain' || action.group_by === 'domain',
        createIfMissing: action.createIfMissing !== false,
        windowId: tab.windowId // Ensure grouping in correct window
      });

    case 'bookmark':
      return await bookmarkTabs([tab.id], { folder: action.to });

    case 'move':
      return await moveTabsToWindow([tab.id], {
        windowId: action.windowId || action.to,
        preserveGroup: action.preserveGroup !== false
      });

    default:
      return { success: false, error: `Unknown action: ${actionType}` };
  }
}
```

#### Step 3: Delete Helper Function
- Delete `parseDuration` function (lines 421-431)
- Replaced by import from `/lib/utils/time.js`

---

## Expected Results

### Code Changes

| File | Before | After | Change |
|------|--------|-------|--------|
| engine.v2.services.js | 574 lines | ~465 lines | -109 lines |
| TabActionsService.js (new) | 0 | ~150 lines | +150 lines |
| BookmarkService.js (new) | 0 | ~80 lines | +80 lines |
| time.js (new) | 0 | ~20 lines | +20 lines |
| **Total** | **574 lines** | **715 lines** | **+141 lines** |

**Note**: We're adding lines, not reducing! But this is GOOD because:
- ✅ Business logic is now in services (testable, reusable)
- ✅ Engine is thinner (orchestration only)
- ✅ No duplication (services can be used everywhere)
- ✅ Better separation of concerns

### Architectural Improvements

**Before**:
- ❌ 149 lines of business logic in engine
- ❌ 5 inline Chrome API calls
- ❌ Complex move logic (90 lines) in engine
- ❌ Group action missing entirely
- ❌ Not testable without mocking Chrome

**After**:
- ✅ ~40 lines of pure orchestration in engine
- ✅ All Chrome API calls in services
- ✅ Complex logic extracted to services
- ✅ Group action implemented
- ✅ Services testable independently

---

## Critical Bug Fixes

### Bug #1: Group Action Not Implemented
**Severity**: CRITICAL
**Impact**: Group actions in rules don't work with v2 engine
**Fix**: Add group case to switch statement

### Bug #2: Move Action Has Inline Business Logic
**Severity**: HIGH
**Impact**: Violates services-first, not reusable
**Fix**: Extract to TabActionsService.moveTabsToWindow()

### Bug #3: Bookmark TODO Never Implemented
**Severity**: MEDIUM
**Impact**: Violates services-first (has TODO comment)
**Fix**: Extract to BookmarkService.bookmarkTabs()

---

## Testing Strategy

### 1. Service Unit Tests

**New test files**:
- `tests/TabActionsService.test.js` - Test all tab actions
- `tests/BookmarkService.test.js` - Test bookmark creation
- `tests/time.test.js` - Test duration parsing

**Coverage**: All service methods, error cases, edge cases

### 2. Engine Integration Tests

**Update**: `tests/engine.test.js`
- Test that engine delegates to services
- Test all action types work
- Test dry-run mode
- Test error handling

### 3. Test Runner Scenarios

**Run**: All 9 scenarios in `lib/test-mode/test-mode.js`
- Verify all pass with v2 engine
- Compare behavior before/after refactor
- Ensure no regressions

### 4. Production Testing

**Manual tests**:
- [ ] Create rule with group action - verify it works
- [ ] Create rule with move action - verify group preservation
- [ ] Create rule with bookmark action - verify folder creation
- [ ] Test all simple actions (close, pin, mute)
- [ ] Verify dry-run mode shows preview

---

## Migration Path (Safe & Incremental)

### Step 1: Create Services (SAFE - No Breaking Changes)
1. Create TabActionsService.js
2. Create BookmarkService.js
3. Create time.js utilities
4. Add comprehensive tests
5. **Commit** - services exist but not used yet

### Step 2: Update Engine (MEDIUM RISK)
1. Add service imports to engine.v2.services.js
2. Replace executeAction switch statement
3. Delete parseDuration helper
4. **Test thoroughly** - run all test scenarios
5. **Commit** - engine now uses services

### Step 3: Verify (LOW RISK)
1. Run `npm test` - all tests must pass
2. Load extension - verify no console errors
3. Test rule execution - verify all actions work
4. Compare v1 vs v2 behavior - should be identical
5. **Deploy to production** - monitor for issues

---

## Risks and Mitigations

### Risk #1: Breaking Group Actions
**Mitigation**:
- Group actions are currently BROKEN (not in switch)
- Adding them can only improve situation
- Test extensively with grouping rules

### Risk #2: Move Action Behavior Change
**Mitigation**:
- Extract exact same logic to service
- No behavior changes, just moved
- Service has same focus management, group preservation

### Risk #3: Service API Mismatches
**Mitigation**:
- Design services to match current behavior exactly
- Add compatibility wrappers if needed
- Comprehensive tests before deploying

---

## Success Criteria

✅ All services created with tests
✅ All services pass unit tests (100% coverage)
✅ Engine delegates ALL actions to services
✅ No Chrome API calls in engine (except via services)
✅ Group action now works in v2 engine
✅ All 9 Test Runner scenarios pass
✅ `npm test` passes (all suites)
✅ Extension loads without errors
✅ No regressions in rule execution
✅ Dry-run mode works correctly

---

## Architecture Guardian Review Summary

Based on revised scope (only v2.services engine):

### Severity: MEDIUM → LOW

**Reduced Risk**:
- Only touching ONE engine file
- Other engines deprecated, can ignore
- Much smaller scope than original plan

**Remaining Issues**:
- ❌ CRITICAL: Group action missing (easy fix)
- ❌ HIGH: Move action inline (90 lines to extract)
- ⚠️ MEDIUM: Bookmark TODO (31 lines to extract)
- ⚠️ LOW: Simple actions inline (28 lines to extract)

**Recommendation**: **APPROVE - PROCEED WITH PHASE 6.1**

This is now a straightforward refactor:
1. Create 3 small services (~250 lines total)
2. Update 1 engine file (574 → 465 lines)
3. Fix critical bug (group action missing)
4. Extract business logic to services

**Estimated Time**: 4-6 hours for complete implementation
**Risk Level**: LOW (only touching v2 engine, others deprecated)

---

## Next Steps

1. ✅ Revised planning complete (this document)
2. ⚠️ Begin Phase 6.1: Create services
   - TabActionsService.js
   - BookmarkService.js
   - time.js utilities
3. ⚠️ Add comprehensive tests for new services
4. ⚠️ Phase 6.2: Update engine.v2.services.js
5. ⚠️ Test extensively, verify no regressions
6. ⚠️ Deploy and monitor

**Status**: Ready to begin Phase 6.1
**Approval**: Pending your go-ahead
