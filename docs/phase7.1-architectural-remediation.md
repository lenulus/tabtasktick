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

## Fix #2: Extract URL Utilities

### Priority: HIGH
### Complexity: SIMPLE
### Estimated Time: 45 mins

### Current State

**Location**: `/lib/engine.v2.services.js` lines 335-357 in `buildIndices` function

**Duplicate Logic**:
- `extractDomain(url)` - extracts hostname from URL
- `normalizeUrl(url)` - removes tracking params, hash, lowercases

**Similar Logic Exists In**:
- `/services/selection/selectTabs.js` - has its own URL normalization

### Target State

**New File**: `/lib/utils/urlUtils.js` (~50 lines with tests)

**API Design**:
```javascript
/**
 * Extract domain from URL
 * @param {string} url - Full URL
 * @returns {string} Hostname without www
 */
export function extractDomain(url)

/**
 * Normalize URL for comparison
 * @param {string} url - Full URL
 * @returns {string} Normalized URL (no tracking params, no hash, lowercase)
 */
export function normalizeUrl(url)

/**
 * Generate duplicate detection key
 * @param {string} url - Full URL
 * @returns {string} Duplicate key for grouping
 */
export function generateDupeKey(url)
```

### Implementation Steps

#### Step 1: Create Utilities (20 mins)

1. Create `/lib/utils/urlUtils.js`
2. Move `extractDomain` from engine.v2.services.js:335-343
3. Move `normalizeUrl` from engine.v2.services.js:346-357
4. Add `generateDupeKey` as alias to `normalizeUrl`
5. Add JSDoc comments
6. Export all functions

#### Step 2: Add Utility Tests (15 mins)

Create `/tests/lib/utils/urlUtils.test.js`

**Test Coverage**:
- extractDomain: valid URLs, www removal, edge cases
- normalizeUrl: tracking params, hash removal, case normalization
- generateDupeKey: same as normalizeUrl

**Example Test**:
```javascript
test('should extract domain without www', () => {
  expect(extractDomain('https://www.example.com/path')).toBe('example.com');
  expect(extractDomain('https://example.com')).toBe('example.com');
});

test('should remove tracking params', () => {
  const url = 'https://example.com?utm_source=test&id=123';
  const normalized = normalizeUrl(url);
  expect(normalized).not.toContain('utm_source');
  expect(normalized).toContain('id=123');
});
```

#### Step 3: Update buildIndices (5 mins)

**File**: `/lib/engine.v2.services.js`

**Changes**:
1. Add import:
   ```javascript
   import { extractDomain, normalizeUrl } from '../utils/urlUtils.js';
   ```

2. Replace inline functions (lines 335-357) with imported functions

3. Keep the deprecated warning

**Expected reduction**: No line count change (just replaces inline with imports)

#### Step 4: Run Tests (5 mins)

```bash
npm test
npm test -- tests/lib/utils/urlUtils.test.js
```

**Success Criteria**:
- All tests passing
- buildIndices still works (backward compatibility)
- No duplicate implementations

### Risk Assessment: LOW

**What Could Break**:
- buildIndices output format changes
- URL normalization differences

**Mitigation**:
- Extract exact logic (no modifications)
- Tests verify same output
- Easy rollback (single commit)

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
| closeDuplicates.js | 100% |
| urlUtils.js | 100% |
| engine.v2.services.js | Maintain 95%+ |

---

## Implementation Order

### Recommended Sequence

```
1. Fix #1: DuplicateService (2 hours)
   ├─ Create service file
   ├─ Add tests
   ├─ Update engine
   └─ Verify tests pass

2. Fix #2: URL Utilities (45 mins)
   ├─ Create utilities file
   ├─ Add tests
   ├─ Update buildIndices
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

| Metric | Before | Target |
|--------|--------|--------|
| Engine LOC | 460 | ~380 |
| Duplicate implementations | 2 | 0 |
| Test coverage | 99.2% | >99% |
| Architectural violations | 2 | 0 |

---

## References

- **Architecture Review**: architecture-guardian assessment (2025-10-10)
- **TODO.md**: Phase 7.1 section
- **CLAUDE.md**: Services-First principles
- **Phase 7.1 Complete**: Commit bf7c15b
