# Phase 7.1 Architectural Remediation Plan

**Status**: Ready for Implementation
**Created**: 2025-10-10
**Priority**: HIGH - Must complete before Phase 7.2
**Estimated Time**: 4.5 hours

## Overview

After completing Phase 7.1 (V1 Engine Removal), an architectural review by architecture-guardian identified violations of the Services-First principle. This plan addresses those violations to restore full architectural compliance.

## Architecture Guardian Review Results

**Assessment**: APPROVED WITH MODIFICATIONS (7/10)
**Violations Found**: 2 critical, 1 already resolved
**Action Required**: Extract business logic from engine to services

## Violations Identified

### ✅ Fix #3: Stale References - ALREADY COMPLETE
Grep search confirmed no references to deleted files remain. No action needed.

### ⚠️ Fix #1: Business Logic in Engine - CRITICAL

**Issue**: The `close-duplicates` implementation contains 80+ lines of business logic directly in `engine.v2.services.js` (lines 113-194)

**Why This Matters**: Violates Services-First principle - engine should only orchestrate, not contain business logic

**Required Action**: Extract to `services/execution/closeDuplicates.js`

### ⚠️ Fix #2: Duplicate Implementation - HIGH

**Issue**: The deprecated `buildIndices` function contains URL normalization logic that duplicates `SelectionService`

**Why This Matters**: Violates DRY principle and "single source of truth"

**Required Action**: Extract to `lib/utils/urlUtils.js` and make `buildIndices` a thin wrapper

---

## Fix #1: Extract close-duplicates to DuplicateService

### Priority: CRITICAL
### Complexity: MEDIUM
### Estimated Time: 2 hours

### Current State

**Location**: `/lib/engine.v2.services.js` lines 113-194 (82 lines)

**Logic**:
- Groups tabs by dupeKey
- Determines which tabs to close based on keep strategy
- Strategies: 'all', 'none', 'oldest', 'newest', 'mru', 'lru'
- Sorts tabs by creation time or last access time
- Closes designated duplicates via chrome.tabs.remove

### Target State

**New File**: `/services/execution/closeDuplicates.js` (~120 lines with tests)

**API Design**:
```javascript
/**
 * Close duplicate tabs based on keep strategy
 * @param {Array} tabs - Tabs with dupeKey property
 * @param {string} strategy - Keep strategy: 'oldest', 'newest', 'mru', 'lru', 'all', 'none'
 * @param {boolean} dryRun - If true, return preview without executing
 * @returns {Promise<Array>} Results array with { tabId, action, success, details }
 */
export async function closeDuplicates(tabs, strategy = 'oldest', dryRun = false)
```

### Implementation Steps

#### Step 1: Create the Service (30 mins)

1. Create `/services/execution/closeDuplicates.js`
2. Copy lines 114-192 from engine.v2.services.js
3. Wrap in `closeDuplicates` function
4. Add JSDoc comments
5. Export function

**Key changes**:
- Accept `dryRun` parameter (engine handles this currently)
- Return array of result objects
- No dependency on engine context

#### Step 2: Add Service Tests (45 mins)

Create `/tests/services/execution/closeDuplicates.test.js`

**Test Coverage**:
- Strategy: 'oldest' - keeps oldest tab
- Strategy: 'newest' - keeps newest tab
- Strategy: 'mru' - keeps most recently used
- Strategy: 'lru' - keeps least recently used
- Strategy: 'all' - keeps all (closes none)
- Strategy: 'none' - closes all
- Single-tab groups (no duplicates) - closes none
- Dry-run mode - returns preview without closing
- Error handling - tab removal fails

**Example Test**:
```javascript
test('should keep oldest and close newer duplicates', async () => {
  const tabs = [
    { id: 1, dupeKey: 'example.com', createdAt: 1000 },
    { id: 2, dupeKey: 'example.com', createdAt: 2000 },
    { id: 3, dupeKey: 'example.com', createdAt: 3000 }
  ];

  const results = await closeDuplicates(tabs, 'oldest', false);

  expect(results).toHaveLength(2);
  expect(results[0].tabId).toBe(2);
  expect(results[1].tabId).toBe(3);
  expect(chrome.tabs.remove).toHaveBeenCalledWith(2);
  expect(chrome.tabs.remove).toHaveBeenCalledWith(3);
});
```

#### Step 3: Update Engine (30 mins)

**File**: `/lib/engine.v2.services.js`

**Changes**:
1. Add import at top:
   ```javascript
   import { closeDuplicates } from '../services/execution/closeDuplicates.js';
   ```

2. Replace lines 113-194 with service call:
   ```javascript
   if (action.action === 'close-duplicates' || action.type === 'close-duplicates') {
     const strategy = action.keep || 'oldest';
     const dupeResults = await closeDuplicates(tabs, strategy, dryRun);
     results.push(...dupeResults);
     continue;
   }
   ```

3. Delete lines 114-192 (old implementation)

**Expected reduction**: 460 lines → ~390 lines

#### Step 4: Run Tests (15 mins)

```bash
npm test
npm test -- tests/services/execution/closeDuplicates.test.js
npm test -- tests/engine.test.js
```

**Success Criteria**:
- All 397 tests passing
- New service tests passing (9 new tests)
- No console errors
- Engine tests still pass

### Risk Assessment: MEDIUM

**What Could Break**:
- Duplicate detection stops working
- Keep strategies behave differently
- Performance regression

**Mitigation**:
- Extract exact logic (no modifications)
- Comprehensive test coverage for all strategies
- Integration tests with real duplicate scenarios
- Easy rollback (single commit)

---

## Fix #2: Remove buildIndices and Migrate to SelectionService

### Priority: HIGH
### Complexity: MEDIUM
### Estimated Time: 90 mins (revised from 45 mins)

### Current State

**Problem**: Duplicate URL normalization implementations violate DRY principle

**Location 1**: `/lib/engine.v2.services.js` lines 250-300 - `buildIndices` function
- Simple normalization (removes utm_* params, hash, lowercase)
- Used by 4 locations in background-integrated.js
- Marked as deprecated but still actively used

**Location 2**: `/services/selection/selectTabs.js` - `buildRuleContext` function
- Sophisticated normalization (preserves YouTube `v`, Google `q`, etc.)
- Production V2 implementation
- Used by SelectionService

**Current Usage of buildIndices**:
- `background-integrated.js:478` - Manual rule execution
- `background-integrated.js:602` - Rule preview
- `background-integrated.js:699` - Execute all rules
- `background-integrated.js:950` - Temporary rules (executeActionViaEngine)
- `background-integrated.js:1351` - Test assertions (analyzeDuplicates)

### Target State

**Delete**: `buildIndices` from engine entirely
**Migrate**: All background.js usage to SelectionService
**Result**: Single source of truth for URL normalization

### Why This Approach?

1. **Services-First Architecture**: Background should use services, not deprecated engine functions
2. **Single Source of Truth**: SelectionService `buildRuleContext` is the production implementation
3. **Better Normalization**: SelectionService preserves important params (YouTube videos, Google searches)
4. **Removes Dead Code**: Eliminates deprecated function that was kept for V1 compatibility

### Implementation Steps

#### Step 1: Audit buildIndices Usage (15 mins)

Map all 5 usage locations in background-integrated.js:
- Line 478: `getStatistics()` - needs tab indices
- Line 602: `previewRule()` - needs context with indices
- Line 699: `executeAllRules()` - needs context with indices
- Line 950: `executeActionViaEngine()` - only for V1 check, can be removed
- Line 1351: `analyzeDuplicates()` - test helper, needs dupeKey grouping

#### Step 2: Create Helper in Background (30 mins)

**Add to background-integrated.js**:
```javascript
import { buildRuleContext } from './services/selection/selectTabs.js';

/**
 * Build context for engine execution
 * Replaces deprecated buildIndices with SelectionService
 */
function buildContextForEngine(tabs, windows = null) {
  // Use SelectionService to build context (adds dupeKey, domain, etc.)
  const context = buildRuleContext(tabs, windows || []);

  // Return structure compatible with old buildIndices format
  return {
    byDomain: context.byDomain,
    byOrigin: context.byOrigin,
    byDupeKey: context.byDupeKey,
    byCategory: context.byCategory,
    duplicates: context.duplicates,
    domainCounts: context.domainCounts
  };
}
```

#### Step 3: Update Background Usage (30 mins)

**Replace all 5 buildIndices calls**:

1. **Line 478** (getStatistics):
   ```javascript
   // OLD
   const idx = buildIndices(tabs);

   // NEW
   const idx = buildContextForEngine(tabs);
   ```

2. **Line 602** (previewRule):
   ```javascript
   // OLD
   const idx = buildIndices(tabs);

   // NEW
   const idx = buildContextForEngine(tabs);
   ```

3. **Line 699** (executeAllRules):
   ```javascript
   // OLD
   const idx = buildIndices(tabs);

   // NEW
   const idx = buildContextForEngine(tabs);
   ```

4. **Line 950** (executeActionViaEngine):
   ```javascript
   // OLD
   if (buildIndices && typeof buildIndices === 'function') {
     const filteredTabs = allTabs.filter(t => tabIds.includes(t.id));
     context.idx = buildIndices(filteredTabs);
   }

   // NEW
   // Remove entire block - V2 doesn't need idx in context
   // SelectionService adds dupeKey directly to tabs
   ```

5. **Line 1351** (analyzeDuplicates):
   ```javascript
   // OLD
   const { buildIndices: buildIndicesForTest } = getEngine();
   const testIndices = buildIndicesForTest(testTabs);

   // NEW
   const testIndices = buildContextForEngine(testTabs);
   ```

#### Step 4: Remove buildIndices from Engine (5 mins)

**File**: `/lib/engine.v2.services.js`

**Delete lines 250-300**:
- Remove entire `buildIndices` function
- Remove `extractDomain` helper
- Remove `normalizeUrl` helper

**Update evaluateRule** (line 311):
```javascript
// OLD
context.idx = buildIndices(context.tabs);

// NEW
// Remove line - evaluateRule is deprecated anyway
```

#### Step 5: Update getEngine() (5 mins)

**File**: `background-integrated.js` line 17-23

```javascript
// OLD
return {
  runRules: engine.runRules,
  previewRule: engine.previewRule,
  buildIndices: engine.buildIndices,
  executeActions: engine.executeActions
};

// NEW
return {
  runRules: engine.runRules,
  previewRule: engine.previewRule,
  executeActions: engine.executeActions
};
```

#### Step 6: Run Tests (5 mins)

```bash
npm test
```

**Success Criteria**:
- All 410 tests passing
- No imports of buildIndices remain
- Background functions work correctly
- Duplicate detection uses SelectionService normalization

### Risk Assessment: MEDIUM

**What Could Break**:
- Background statistics calculations
- Rule preview functionality
- Execute all rules functionality
- Test assertions in analyzeDuplicates

**Mitigation**:
- SelectionService `buildRuleContext` returns same structure
- Tabs get dupeKey added by SelectionService (same as before)
- Test in browser before committing
- Easy rollback (single commit)

**Testing Required**:
- ✅ Popup "Close Duplicates" button
- ✅ Dashboard statistics display
- ✅ Rule preview in Rules page
- ✅ Execute all rules functionality
- ✅ Test Runner assertions

---

## Testing Strategy

### Test Execution Order

1. **Baseline** (before changes):
   ```bash
   npm test
   # Expected: 396/397 passing
   ```

2. **After Fix #1** (DuplicateService):
   ```bash
   npm test
   # Expected: 405/406 passing (9 new tests)
   ```

3. **After Fix #2** (URL utilities):
   ```bash
   npm test
   # Expected: 410/411 passing (5 new utility tests)
   ```

### Integration Test Scenarios

**Scenario 1**: Close duplicates with MRU strategy
```javascript
const rule = {
  when: { all: [{ subject: 'isDupe', operator: 'equals', value: true }] },
  then: [{ action: 'close-duplicates', keep: 'mru' }]
};
// Should keep most recently used duplicate
```

**Scenario 2**: Mixed actions including duplicates
```javascript
const rule = {
  then: [
    { action: 'group', by: 'domain' },
    { action: 'close-duplicates', keep: 'oldest' }
  ]
};
// Should group first, then close duplicates
```

### Coverage Requirements

| Component | Target Coverage |
|-----------|----------------|
| closeDuplicates.js | 100% ✅ |
| buildRuleContext (SelectionService) | Maintain 95%+ |
| engine.v2.services.js | Maintain 95%+ |

---

## Implementation Order

### Recommended Sequence

```
1. Fix #1: DuplicateService (2 hours) ✅ COMPLETE
   ├─ Create service file ✅
   ├─ Add tests ✅
   ├─ Update engine ✅
   └─ Verify tests pass ✅

2. Fix #2: Remove buildIndices (90 mins)
   ├─ Create buildContextForEngine helper in background
   ├─ Replace 5 buildIndices calls
   ├─ Delete buildIndices from engine
   ├─ Update getEngine()
   └─ Verify tests pass

3. Final Testing (30 mins)
   ├─ Full regression test suite
   ├─ Test with 200+ tabs
   └─ Performance validation

4. Documentation (15 mins)
   └─ Update TODO.md
```

**Total Time**: 4.5 hours

### Why This Order?

1. **Fix #1 First**: Highest priority, most complex - tackle when fresh
2. **Fix #2 Second**: Simpler, builds on utilities pattern
3. **Sequential Only**: Both modify engine.v2.services.js - avoid conflicts

---

## Rollback Plan

### For Fix #1 (DuplicateService)

```bash
git revert HEAD  # Revert the commit
npm test         # Verify tests pass
```

**Monitor for**:
- Duplicate detection failures
- Performance regression >20ms
- Test failures

### For Fix #2 (URL Utilities)

```bash
git revert HEAD  # Revert utilities extraction
npm test         # Verify backward compatibility
```

**Monitor for**:
- buildIndices output changes
- URL normalization differences

### Emergency Rollback

If multiple issues:
```bash
git checkout bf7c15b  # Last stable commit
git checkout -b hotfix/restore-stable
```

---

## Success Criteria

### Pre-Merge Checklist

- [ ] All tests passing (410/411 expected)
- [ ] No console errors in extension
- [ ] Duplicate detection works with all strategies
- [ ] buildIndices maintains backward compatibility
- [ ] No performance regression
- [ ] Code coverage maintained or improved
- [ ] No new ESLint warnings
- [ ] CLAUDE.md principles followed

### Success Metrics

| Metric | Before | After Fix #1 | Target (After Fix #2) |
|--------|--------|--------------|----------------------|
| Engine LOC | 460 | 384 ✅ | ~330 |
| Duplicate implementations | 2 | 1 | 0 |
| Test coverage | 99.2% | 99.5% ✅ | >99% |
| Architectural violations | 2 | 1 | 0 |
| closeDuplicates tests | 0 | 14 ✅ | 14 |

---

## References

- **Architecture Review**: architecture-guardian assessment (2025-10-10)
- **TODO.md**: Phase 7.1 section
- **CLAUDE.md**: Services-First principles
- **Phase 7.1 Complete**: Commit bf7c15b
