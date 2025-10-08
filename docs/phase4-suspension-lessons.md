# Phase 4: Tab Suspension Service - Lessons Learned

## Overview

Phase 4 was implemented by another AI tool in branch `feature/tab-suspension-service`. This document captures what worked, what didn't, and how to implement it correctly against the current main branch.

**Branch**: `feature/tab-suspension-service`
**Commit**: `803dd91` - "Feat: Implement Tab Suspension Service"
**Status**: Not merged - conflicts with main branch architecture

---

## What Worked Well ✅

### 1. Service API Design
The `SuspensionService.js` itself is well-designed and follows established patterns:

```javascript
// Clean, focused API
export async function suspendTabs(tabIds, options = {}) {
  const finalOptions = { ...defaultOptions, ...options };
  // ... implementation
  return { suspended, skipped, errors };
}
```

**Good aspects**:
- Single responsibility (execution only, no selection)
- Clear options pattern matching SnoozeService
- Structured return value with arrays for each outcome
- Proper error handling per tab
- Dependency injection ready (checks for `chrome.tabs` availability)

### 2. Options Pattern
Well-thought-out options that respect user intent:
```javascript
const defaultOptions = {
  includePinned: false,    // Don't suspend pinned tabs by default
  includeActive: false,    // Don't suspend active tab by default
  includeAudible: false,   // Don't suspend tabs playing audio by default
};
```

This matches the pattern established by:
- SnoozeService (includePinned, includeActive)
- groupTabs (includePinned, etc.)

### 3. Return Structure
```javascript
return {
  suspended: [1, 2, 3],           // Successfully suspended tab IDs
  skipped: [4, 5],                // Skipped due to options
  errors: [{ tabId: 6, error: "..." }]  // Failed with reason
};
```

This enables:
- Clear reporting to user ("Suspended 3 tabs, skipped 2")
- Debugging (errors with context)
- Testing (can verify each category)

### 4. Engine Integration
All three engines were updated:
- `lib/engine.js` (main engine)
- `lib/engine.v1.legacy.js` (legacy)
- `lib/engine.v2.services.js` (services-based)
- `lib/commands/ActionManager.js` (command pattern)

This ensures suspend actions work everywhere.

### 5. Message Passing Pattern
Popup was correctly updated to use message passing:
```javascript
// BEFORE: Direct Chrome API calls
const tabs = await chrome.tabs.query({ active: false, currentWindow: true });
for (const tab of inactiveTabs) {
  await chrome.tabs.discard(tab.id);
}

// AFTER: Message to background
const result = await sendMessage({ action: 'suspendInactiveTabs' });
```

This follows the Surface → Message → Background pattern.

### 6. Test Fixes
Fixed persistent test failure by creating manual mock for SnoozeService in Jest config:
```javascript
// jest.config.mjs
moduleNameMapper: {
  '^.*/services/execution/SnoozeService\\.js$': '<rootDir>/tests/mocks/SnoozeService.js'
}
```

All 25 test suites passing (358 tests).

---

## What Didn't Work ❌

### 1. **CRITICAL: Created Duplicate normalize.js File**

**Problem**: The branch created a new `/lib/normalize.js` (220 lines) and changed all imports to use it:

```javascript
// Changed in all engines:
- import { normalizeUrl, extractDomain, generateDupeKey, extractOrigin } from '../services/selection/selectTabs.js';
+ import { normalizeUrl, extractDomain, generateDupeKey, extractOrigin } from './normalize.js';
```

**Why this is wrong**:
- Main branch commit `25a21b6` (3 commits ago): "Consolidate URL normalization to single source of truth in **selectTabs.js**"
- TODO.md Phase 3 is marked complete ✅ with normalization in `selectTabs.js`
- This creates a **duplicate implementation** after explicit consolidation
- Violates Core Principle #2: "NO duplicate implementations - everything has one source of truth"

**Root cause**: The other AI tool likely worked from an older branch and didn't rebase before implementing.

**Impact**: Would require significant rework to merge - all imports would conflict.

---

### 2. **Pattern Violation: Hardcoded Selection Logic in Background**

**Problem**: Background handler mixes selection and execution:

```javascript
case 'suspendInactiveTabs':
  // SELECTION LOGIC (shouldn't be here)
  const inactiveTabs = await chrome.tabs.query({ active: false, pinned: false });
  const inactiveTabIds = inactiveTabs.map(tab => tab.id);

  // EXECUTION (correct)
  const suspensionResult = await SuspensionService.suspendTabs(inactiveTabIds);
  sendResponse({ success: true, suspended: suspensionResult.suspended.length });
  break;
```

**Why this is wrong**:
- Hardcodes "inactive + non-pinned" as the only suspension pattern
- Violates Separation of Concerns (selection should be separate)
- Doesn't use the established `executeActionViaEngine()` helper
- Won't respect engine selector (v1 vs v2)
- Can't be used by rules engine (different code path)

**Correct pattern** (from main branch TODO.md Phase 1.8):
```javascript
case 'suspendInactiveTabs':
  await executeActionViaEngine('suspend', tabIds, params);
  sendResponse({ success: true });
  break;
```

Or better yet, use a temporary rule:
```javascript
case 'suspendInactiveTabs':
  const engine = getEngine();
  const tempRule = {
    id: 'temp-suspend-inactive',
    conditions: {
      all: [
        { subject: 'active', operator: 'equals', value: false },
        { subject: 'pinned', operator: 'equals', value: false }
      ]
    },
    then: [{ action: 'suspend' }]
  };
  const result = await engine.runRules([tempRule], await buildContext());
  sendResponse({ success: true, suspended: result.totalActions });
  break;
```

---

### 3. **Incomplete: Missing Surface Audit**

**Problem**: Only updated popup, but didn't audit dashboard or session manager.

**Missing from commit**:
- No search for existing `chrome.tabs.discard()` calls in dashboard
- No search for suspension logic in session manager
- No mention of these surfaces in commit message

**TODO.md Phase 4 checklist should include**:
```markdown
- [x] Background service
- [x] Popup (via message passing)
- [x] Rules engine snooze action (v1 and v2)
- [x] ActionManager (command pattern)
- [ ] Dashboard (audit for suspension logic)    ← MISSING
- [ ] Session manager (audit for suspension)    ← MISSING
```

**Expected process** (from Phase 1.8):
1. Grep for `chrome.tabs.discard` across all files
2. Document each location
3. Create plan to replace with service/message passing
4. Test all surfaces

---

### 4. **Scope Creep: Unrelated Operator Name Changes**

**Problem**: The dashboard `rules.js` file has 20+ lines of changes unrelated to suspension:

```javascript
// Changed operators from legacy to new format:
- { subject: 'duplicate', operator: 'is', value: true }
+ { subject: 'duplicate', operator: 'equals', value: true }

- { subject: 'age', operator: 'gt', value: 30 * 60 * 1000 }
+ { subject: 'age', operator: 'greater_than', value: 30 * 60 * 1000 }
```

**Why this is wrong**:
- These changes are unrelated to tab suspension
- Makes code review harder (what's actually suspension-related?)
- Should be a separate commit: "Fix: Update sample rules to use new operator names"
- May already be fixed in main branch (need to check)

**Note**: Main branch commit `a2a0372` is "Fix: All legacy operators in sample rules and migrations" - this likely conflicts.

---

### 5. **Missing: Test Runner Integration**

**Problem**: No mention of adding suspension to Test Runner for validation.

**Expected** (from TODO.md Phase 1.10):
```markdown
- [ ] Add suspension action to Test Runner
- [ ] Test with v1 engine
- [ ] Test with v2 engine
- [ ] Verify behavior matches manual action
```

The Test Runner (lib/test-mode/test-runner.js) is used to validate that v1 and v2 engines produce identical results. Suspension should be added to the test scenarios.

---

## Key Insights & Patterns

### 1. Always Rebase Before Implementing
The normalize.js conflict could have been avoided by:
```bash
git checkout feature/tab-suspension-service
git fetch origin
git rebase origin/main
# Conflicts would surface immediately
```

**Lesson**: Before implementing a feature, ensure the branch is up-to-date with main.

### 2. Use Established Helper Functions
Main branch has `executeActionViaEngine()` helper specifically for this pattern:
```javascript
async function executeActionViaEngine(action, tabIds, params = {}) {
  const engine = getEngine();
  const tempRule = { /* ... */ };
  const result = await engine.runRules([tempRule], context);
  return result;
}
```

**Lesson**: Check for existing helpers before implementing new patterns.

### 3. Complete Surface Audit is Non-Negotiable
From CLAUDE.md:
> **If two places have similar logic, it MUST move to `/services/*` and both call it**

**Required process**:
1. `git grep "chrome.tabs.discard"` - find all occurrences
2. Document each location in TODO.md
3. Plan replacement for each
4. Test each surface
5. Mark complete only when all surfaces use service

**Lesson**: "It works in popup" ≠ "Phase complete". All surfaces must be updated.

### 4. One Concern Per Commit
The operator name changes should have been:
- Separate discovery ("are operators still broken?")
- Separate commit if needed
- Or dropped if already fixed

**Lesson**: Keep commits focused. If you notice unrelated issues, create a new task.

### 5. Documentation-Driven Implementation
Successful phases (1, 2, 3) all had:
- Discovery document first
- Assessment document
- Implementation plan
- Then code changes

**Lesson**: Rush to code = architectural conflicts. Plan first, code second.

---

## Implementation Plan for Main Branch

### Step 1: Grep for Existing Suspension Logic
```bash
git grep -n "chrome.tabs.discard" -- "*.js" "*.html"
git grep -n "suspend" -- "popup/*.js" "dashboard/*.js" "session/*.js"
```

Document findings in TODO.md.

### Step 2: Create SuspensionService.js
Copy the good parts from feature branch:
- Clean API: `suspendTabs(tabIds, options)`
- Options: `includePinned`, `includeActive`, `includeAudible`
- Return: `{ suspended, skipped, errors }`

**Critical**: Use existing imports:
```javascript
// CORRECT (main branch pattern):
import { /* no imports needed - standalone service */ } from '...';

// The service uses chrome.tabs.discard() directly
// No normalization needed for suspension
```

### Step 3: Update Engines
Add to all three engines:
```javascript
import * as SuspensionService from '../services/execution/SuspensionService.js';

case 'suspend':
case 'discard':
  if (!dryRun) {
    const result = await SuspensionService.suspendTabs([tab.id], action.params);
    if (result.errors.length > 0) {
      return { success: false, error: result.errors[0].error };
    }
  }
  return { success: true, details: { suspended: tab.id } };
```

Files to update:
- `lib/engine.js`
- `lib/engine.v1.legacy.js`
- `lib/engine.v2.services.js`
- `lib/commands/ActionManager.js`

### Step 4: Add Background Message Handler
Use the `executeActionViaEngine()` helper for consistency with engine selector:

```javascript
case 'suspendInactiveTabs':
  await executeActionViaEngine('suspend', null, {
    includeActive: false,
    includePinned: false,
    windowId: request.windowId || chrome.windows.WINDOW_ID_CURRENT
  });
  sendResponse({ success: true });
  break;
```

**Why this pattern**:
- Respects engine selector (v1 vs v2)
- Uses same code path as rules engine
- Consistent with other manual actions (groupByDomain, closeDuplicates)
- Single source of truth for suspension logic

### Step 5: Update Popup
Replace direct Chrome API calls with message passing:
```javascript
async function handleSuspendInactive() {
  try {
    const button = elements.suspendInactive;
    button.disabled = true;

    const result = await sendMessage({
      action: 'suspendInactiveTabs',
      windowId: (await chrome.windows.getCurrent()).id
    });

    if (result.suspended > 0) {
      showNotification(
        `Suspended ${result.suspended} inactive tab${result.suspended > 1 ? 's' : ''}`,
        'success'
      );
    } else {
      showNotification('No inactive tabs to suspend', 'info');
    }

    await loadStatistics();
  } catch (error) {
    console.error('Failed to suspend tabs:', error);
    showNotification('Failed to suspend tabs', 'error');
  } finally {
    elements.suspendInactive.disabled = false;
  }
}
```

### Step 6: Audit Dashboard & Session Manager
Check for:
- Any existing suspension UI/buttons
- Any `chrome.tabs.discard()` calls
- Any "suspend" or "discard" action handlers

Update TODO.md with findings.

### Step 7: Add to Test Runner
Add suspension test scenario to `lib/test-mode/test-runner.js`:
```javascript
{
  name: 'Suspend Inactive Tabs (30+ min)',
  rule: {
    id: 'test-suspend-inactive',
    name: 'Suspend Inactive Tabs',
    enabled: true,
    conditions: {
      all: [
        { subject: 'active', operator: 'equals', value: false },
        { subject: 'age', operator: 'greater_than', value: 30 * 60 * 1000 }
      ]
    },
    then: [{ action: 'suspend' }]
  },
  expectedBehavior: 'Suspends inactive tabs older than 30 minutes'
}
```

### Step 8: Testing Checklist
- [ ] Extension loads without errors
- [ ] Popup "Suspend Inactive" button works
- [ ] Background handler works via message
- [ ] Rules engine suspend action works (v1)
- [ ] Rules engine suspend action works (v2)
- [ ] Test Runner scenario passes for both engines
- [ ] Dashboard suspension (if exists) works
- [ ] Session manager suspension (if exists) works
- [ ] npm test passes (all 25+ suites)
- [ ] No console errors in any surface

### Step 9: Update TODO.md
Mark Phase 4 complete:
```markdown
## Phase 4: Tab Suspension Service ✅

### 4.1 Discovery ✅
- [x] Found all suspension/discard logic
- [x] Documented in phase4-suspension-lessons.md
- [x] Chrome.tabs.discard usage mapped

### 4.2 Service Implementation ✅
- [x] Created `/services/execution/SuspensionService.js`
- [x] Options: includePinned, includeActive, includeAudible
- [x] Return structure: suspended, skipped, errors

### 4.3 Update Callers ✅
- [x] Background service (via executeActionViaEngine)
- [x] Popup (via message passing)
- [x] Rules engine suspend action (v1, v2, ActionManager)
- [x] Dashboard (audit complete - no suspension logic found)
- [x] Session manager (audit complete - no suspension logic found)

### 4.4 Testing ✅
- [x] Added to Test Runner
- [x] All tests passing
- [x] v1/v2 engine behavior consistent
```

---

## Comparison: Feature Branch vs Clean Implementation

| Aspect | Feature Branch | Clean Implementation |
|--------|---------------|---------------------|
| Service API | ✅ Good | ✅ Same (copy it) |
| normalize.js | ❌ Duplicate file | ✅ Use selectTabs.js |
| Background handler | ❌ Hardcoded selection | ✅ executeActionViaEngine |
| Surface audit | ❌ Incomplete | ✅ All surfaces checked |
| Operator changes | ❌ Mixed in | ✅ Separate concern |
| Test Runner | ❌ Not added | ✅ Included |
| Git history | ❌ Conflicts with main | ✅ Clean apply |

---

## Conclusion

The feature branch got 70% right (service design, options pattern, return structure, engine integration) but missed critical architectural requirements:

1. Created duplicate implementation (normalize.js)
2. Didn't use established patterns (executeActionViaEngine)
3. Incomplete surface audit

**Recommendation**: Extract the good parts (SuspensionService.js API design) and reimplement cleanly on main branch following the implementation plan above.

**Time estimate**:
- Service creation: 5 min (copy and adjust imports)
- Engine updates: 10 min (4 files)
- Background handler: 5 min
- Popup update: 5 min
- Surface audit: 10 min
- Test Runner: 5 min
- Testing: 15 min
- **Total: ~1 hour** for clean, complete implementation

---

## References

- Feature branch: `feature/tab-suspension-service` (commit `803dd91`)
- Main branch normalization: commit `25a21b6`
- TODO.md Phase 1.8: Pattern for eliminating duplicates
- CLAUDE.md: Core Architecture Principles
- Similar successful work: Phase 2 (SnoozeService) - followed discovery → plan → implement pattern
