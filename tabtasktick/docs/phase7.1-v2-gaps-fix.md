# Phase 7.1: Fix V2 Gaps Before V1 Removal

**Date:** 2025-10-09
**Status:** Ready to Start
**Prerequisites:** Phase 7.0 complete (tests migrated to v2 API)

## Context

Phase 7.0 successfully migrated all tests from v1 to v2 API. Tests pass with **3 critical gaps** in v2 that must be fixed before we can safely remove v1 engine code.

**Current State:**
- ✅ Tests migrated: 428/432 passing (4 skipped due to gaps)
- ✅ Gaps documented in `docs/phase7.0-gaps-analysis.md`
- ⚠️ V2 missing critical features that v1 has

## The 3 Gaps to Fix

### **Gap #2: Missing `skipPinned` Option** 🟠 HIGH PRIORITY

**Problem:** V2's `selectTabsMatchingRule()` doesn't accept options parameter, can't skip pinned tabs.

**Risk:** Users' pinned tabs could be accidentally closed/modified (DATA LOSS)

**Solution:** Two-tier design (global setting + per-rule override)

**Files to Modify:**
1. `services/selection/selectTabs.js:398` - Add options parameter
2. `background-integrated.js:78` - Add `skipPinnedByDefault: true` to settings
3. Update all callers to pass skipPinned option

**Estimated Effort:** 2-3 hours

---

### **Gap #3: No `window.*` Property Support** 🟡 MEDIUM PRIORITY

**Problem:** V2 can't match tabs based on window properties (v1 could).

**Use Cases:**
- Close stranded tabs in lone windows (`window.tabCount === 1`)
- Group crowded windows (`window.tabCount >= 20`)
- Suspend background windows (`window.focused === false`)

**Solution:** Add window context lookup to condition evaluator

**Files to Modify:**
1. `services/selection/selectTabs.js:675` - Update `evaluateSingleCondition()`

**Estimated Effort:** 1-2 hours

---

### **Gap #4: Enhance Duplicate Keep Strategies** 🟢 LOW PRIORITY

**Problem:** Missing MRU/LRU strategies (v1 only had oldest/newest/none).

**Current:**
- ✅ `oldest` - Keep first created
- ✅ `newest` - Keep last created
- ✅ `none` - Close all duplicates

**Add:**
- ⭐ `mru` - Keep most recently used
- ⭐ `lru` - Keep least recently used
- ⭐ `all` - Keep all (no-op for conditional logic)

**Files to Modify:**
1. `lib/engine.v2.services.js:138-153` - Update sort and keep logic

**Estimated Effort:** 1 hour

---

## Implementation Order

### Step 1: Fix Gap #2 (skipPinned) - MUST FIX
This is a **data loss risk** - users' pinned tabs are not protected in v2.

### Step 2: Fix Gap #3 (window.*) - SHOULD FIX
This restores **feature parity** with v1 - power user feature.

### Step 3: Fix Gap #4 (MRU/LRU) - OPTIONAL
This is an **enhancement** - current duplicate handling works, this adds options.

---

## Detailed Implementation Plans

### **Gap #2: skipPinned Implementation**

#### Part A: Add Global Setting
```javascript
// In background-integrated.js:78
settings: {
  skipPinnedByDefault: true,  // Safe default: protect pinned tabs
  autoCloseEnabled: true,
  autoGroupEnabled: true,
  // ... existing settings
}
```

#### Part B: Update V2 Function
```javascript
// In services/selection/selectTabs.js:398
export async function selectTabsMatchingRule(
  rule,
  tabs = null,
  windows = null,
  options = {}  // ← Add this
) {
  // ... existing context building ...

  for (const tab of tabs) {
    // Add skipPinned check
    if (options.skipPinned && tab.pinned) {
      continue;
    }

    const isMatch = matchesRuleWithContext(tab, rule, context, windows);
    if (isMatch) {
      matches.push(tab);
    }
  }

  return matches;
}
```

#### Part C: Update Callers
Context-aware skipPinned behavior:

```javascript
// Auto-run rules (background)
const skipPinned = rule.flags?.skipPinned ?? state.settings.skipPinnedByDefault;

// Manual operations on user-selected tabs
const skipPinned = false;  // Always honor selection

// UI bulk operations (dashboard/popup)
const skipPinned = state.settings.skipPinnedByDefault;
```

#### Part D: Unskip Tests
Once implemented, remove `.skip` from:
- `tests/engine.test.js:119` - "should skip pinned tabs when configured"
- `tests/engine.test.js:463` - "should show skip pinned in preview"

---

### **Gap #3: window.* Properties Implementation**

Update condition evaluator to support window properties:

```javascript
// In services/selection/selectTabs.js:675
function evaluateSingleCondition(tab, condition, context) {
  const { subject, operator, value } = condition;

  let actualValue;

  // Handle window.* properties
  if (subject.startsWith('window.')) {
    const windowProp = subject.replace('window.', '');
    const window = context.windows?.find(w => w.id === tab.windowId);
    actualValue = window?.[windowProp];
  }
  // Handle tab.* properties (existing logic)
  else {
    actualValue = mappedTab[subject];
    // ... existing nested property logic ...
  }

  return evaluateOperator(actualValue, operator, value);
}
```

**Available Window Properties:**
- `id`, `focused`, `state`, `type`, `incognito`, `alwaysOnTop`, `tabCount`

**Unskip Test:**
- `tests/engine.test.js:140` - "should match based on window tab count"

---

### **Gap #4: MRU/LRU Keep Strategies Implementation**

```javascript
// In lib/engine.v2.services.js:138-153
const sortedDupes = [...dupeTabs].sort((a, b) => {
  if (keepStrategy === 'oldest' || keepStrategy === 'newest') {
    // Sort by creation time
    const aTime = a.createdAt || a.id;
    const bTime = b.createdAt || b.id;
    return aTime - bTime;
  }
  else if (keepStrategy === 'mru' || keepStrategy === 'lru') {
    // Sort by last access time (with fallbacks)
    const aAccess = a.lastAccessed || a.createdAt || a.id || 0;
    const bAccess = b.lastAccessed || b.createdAt || b.id || 0;
    return aAccess - bAccess;  // LRU first, MRU last
  }
  return 0;
});

if (keepStrategy === 'all') {
  // Keep all - don't close any (no-op)
  tabsToClose = [];
}
else if (keepStrategy === 'none') {
  // Keep none - close all
  tabsToClose = sortedDupes;
}
else if (keepStrategy === 'oldest' || keepStrategy === 'lru') {
  // Keep first in sorted array
  tabsToClose = sortedDupes.slice(1);
}
else if (keepStrategy === 'newest' || keepStrategy === 'mru') {
  // Keep last in sorted array
  tabsToClose = sortedDupes.slice(0, -1);
}
```

---

## Success Criteria

After fixing all gaps:

- [ ] All 432 tests passing (0 skipped)
- [ ] `npm test` shows 436/438 (same as v1 baseline)
- [ ] skipPinned option works in v2
- [ ] window.* properties work in rules
- [ ] MRU/LRU keep strategies work
- [ ] No console errors
- [ ] Production testing: all manual operations work

---

## After Gaps Fixed

Once all gaps are fixed and tests pass, proceed to:

**Phase 7.2: Delete V1 Engine** (see `docs/phase7-revised-plan.md`)
- Delete 4 deprecated engine files (~1,706 lines)
- Update imports to v2-services only
- Simplify engineLoader.js
- Must show 436/438 tests passing (zero regressions)

---

## Reference Documents

All Phase 7 documentation:

1. **`phase7-learnings.md`** - Why original Phase 7.1 failed
2. **`phase7-revised-plan.md`** - The 3-phase strategy (7.0 → 7.1 → 7.2)
3. **`phase7.0-prompt.md`** - Bootstrap instructions for test migration
4. **`phase7.0-gaps-analysis.md`** - Detailed gap analysis (most comprehensive)
5. **`phase7.1-v2-gaps-fix.md`** - **THIS FILE** - Action plan for fixes

**→ Start here for implementation details**

---

## Quick Start

To begin fixing gaps:

1. **Read:** `phase7.0-gaps-analysis.md` (sections for gaps #2, #3, #4)
2. **Implement:** Start with Gap #2 (highest priority)
3. **Test:** Run `npm test` after each gap fixed
4. **Verify:** Unskip relevant tests and confirm they pass

**Estimated Total Time:** 4-6 hours to fix all 3 gaps
