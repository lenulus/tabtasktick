# Phase 7.0: Migrate Tests to V2 API - Bootstrap Prompt

## Context for New Session

We attempted Phase 7.1 (Dead Code Removal) but failed because **tests still use v1's API**. We need to migrate tests to v2's API, THEN delete v1.

## Your Task

**Migrate all tests from v1's `evaluateRule()` to v2's `selectTabsMatchingRule()` API so tests pass with v2.**

## Bootstrap Instructions

Please read these files in order:

1. **Read the failure analysis:**
   ```
   @/Users/anthonylaforge/dev/bmpro/tabmaster-pro/docs/phase7-learnings.md
   ```
   This explains WHY Phase 7.1 failed and what we learned.

2. **Read the revised plan:**
   ```
   @/Users/anthonylaforge/dev/bmpro/tabmaster-pro/docs/phase7-revised-plan.md
   ```
   Focus on the **Phase 7.0: V2 Completion** section.

3. **Read the architecture principles:**
   ```
   @/Users/anthonylaforge/dev/bmpro/tabmaster-pro/CLAUDE.md
   ```
   Remember: "Dead code removal should have zero test regressions"

## The Problem

**Current State:**
- Baseline: 436/438 tests passing (with v1 as default)
- Tests use v1 API: `evaluateRule(rule, context)`
- v2 has different API: `selectTabsMatchingRule(rule, tabs, windows)`
- When we switch tests to v2, 29 tests fail (436 → 407 passing)

**Why Tests Fail:**
- Tests use v1's deprecated `evaluateRule()` which is synchronous
- Tests pass v1 DSL format: `{ subject: 'domain', operator: 'equals', value: 'x' }`
- v2's `selectTabsMatchingRule()` handles BOTH formats correctly (already working!)
- We just need to migrate the tests to use v2's API

## The Solution

**Migrate tests from v1 API → v2 API:**

### v1 API (OLD - deprecated):
```javascript
const matches = evaluateRule(rule, context);
// - Synchronous
// - Takes context object with tabs/windows/idx
// - Returns array of matched tabs
```

### v2 API (NEW - use this):
```javascript
const matches = await selectTabsMatchingRule(rule, context.tabs, context.windows);
// - Async (must await)
// - Takes tabs and windows directly
// - Returns array of matched tabs
// - Handles BOTH DSL formats (already works!)
```

## Files to Update

**4 test files need migration:**

1. **tests/disabled-rule-test.test.js**
   - 5 tests using `evaluateRule()` and `previewRule()`
   - Change to `selectTabsMatchingRule()`
   - Add `await` keyword

2. **tests/engine.test.js**
   - ~20 tests using `evaluateRule()`
   - Change to `selectTabsMatchingRule()`
   - Add `await` keyword

3. **tests/engine-compatibility.test.js**
   - 4 tests using `evaluateRule()`
   - Already has v2 path (line 93), just remove v1 path

4. **tests/predicate.test.js**
   - 1 test using `evaluateRule()`
   - Change to `selectTabsMatchingRule()`
   - Add `await` keyword

## Migration Pattern

### Before (v1 API):
```javascript
import { evaluateRule, buildIndices } from '../lib/engine.js';

test('should match tabs', () => {
  const rule = {
    when: { all: [{ subject: 'domain', operator: 'equals', value: 'example.com' }] }
  };
  const context = { tabs, windows, idx: buildIndices(tabs) };

  const matches = evaluateRule(rule, context);
  expect(matches).toHaveLength(1);
});
```

### After (v2 API):
```javascript
import { selectTabsMatchingRule } from '../services/selection/selectTabs.js';

test('should match tabs', async () => {  // Add async
  const rule = {
    when: { all: [{ subject: 'domain', operator: 'equals', value: 'example.com' }] }
  };

  const matches = await selectTabsMatchingRule(rule, tabs, windows);  // Add await
  expect(matches).toHaveLength(1);
});
```

### Key Changes:
1. ✅ Import from `services/selection/selectTabs.js` instead of `lib/engine.js`
2. ✅ Change `evaluateRule(rule, context)` → `selectTabsMatchingRule(rule, context.tabs, context.windows)`
3. ✅ Add `async` to test function
4. ✅ Add `await` before `selectTabsMatchingRule()`
5. ✅ Remove `buildIndices` usage (v2 doesn't need it - handles internally)

## Special Cases

### previewRule Migration

**Before:**
```javascript
const preview = previewRule(rule, context);
expect(preview.totalMatches).toBe(1);
```

**After:**
```javascript
const matches = await selectTabsMatchingRule(rule, tabs, windows);
expect(matches.length).toBe(1);  // Direct array length instead of preview object
```

### buildIndices is NOT needed

v2's `selectTabsMatchingRule()` builds indices internally. Remove all `buildIndices()` usage from tests.

## Success Criteria

Run the test suite:
```bash
npm test
```

**Must show:** `Tests: 2 skipped, 436 passed, 438 total`

That's the SAME as baseline - zero regressions.

## Validation Steps

1. **Update imports in all test files**
   ```bash
   # Should find 4 files
   grep -r "from '../lib/engine.js'" tests/
   ```

2. **Run individual test files**
   ```bash
   npm test tests/disabled-rule-test.test.js
   # Should pass all 5 tests

   npm test tests/engine.test.js
   # Should pass all tests

   npm test tests/predicate.test.js
   # Should pass all tests
   ```

3. **Run full suite**
   ```bash
   npm test
   # Must show: 436/438 passing
   ```

## Important Constraints

1. **Test behavior must not change** - Same assertions, same expectations
2. **No v1 API usage** - Must use v2's `selectTabsMatchingRule()`
3. **No hacks** - Straightforward API migration
4. **All tests must pass** - 436/438 (same as baseline)
5. **Document bugs/gaps found** - If you find legitimate v2 bugs (not DSL-related), document them but don't fix them yet

## What NOT to Do

❌ Don't modify v2's engine code
❌ Don't change test assertions/expectations
❌ Don't skip tests or mark them as failing
❌ Don't add try/catch to hide errors
❌ Don't mix v1 and v2 APIs in same test

## What TO Do

✅ Migrate tests to v2 API (`selectTabsMatchingRule`)
✅ Add `async/await` where needed
✅ Remove `buildIndices` usage
✅ Keep test logic identical
✅ Verify 436/438 tests passing
✅ **Document any v2 bugs/feature gaps found** (but don't fix them yet)

## Timeline

**Estimated:** 1-2 hours
**Phases:**
1. Update imports (15 min)
2. Migrate test functions (45 min)
3. Fix any issues (30 min)
4. Document any v2 bugs found (if any)

## If You Find V2 Bugs

**During migration, you may discover legitimate v2 bugs** (not related to DSL format support).

### What is a legitimate bug?
- v2's `selectTabsMatchingRule()` doesn't handle a specific condition correctly
- v2 returns wrong results for valid v2 DSL syntax
- v2 crashes or throws errors unexpectedly
- Missing functionality that v1 had (other than DSL format support)

### What is NOT a bug?
- v2 doesn't support v1's DSL format (`{ subject, operator, value }`) - **This is expected**
- Test needs to be updated to use v2 API - **This is your task**
- Test assertions need adjustment for v2's return format - **This is expected**

### If You Find a Real Bug:

1. **Document it clearly** in a comment at the end of the session:
   ```
   ## V2 Bugs/Gaps Found During Migration

   ### Bug 1: selectTabsMatchingRule doesn't handle XYZ
   - **Location:** services/selection/selectTabs.js:123
   - **Issue:** When condition has X, it returns Y instead of Z
   - **Test:** tests/engine.test.js:456
   - **Workaround:** [if any]

   ### Gap 2: Missing feature ABC
   - **Description:** v1 had feature ABC, v2 doesn't
   - **Impact:** Tests X, Y, Z will fail
   - **Recommended fix:** [your suggestion]
   ```

2. **Do NOT fix the bug** - Just document it
3. **Continue with migration** - Work around the bug if possible
4. **Report at end** - Let the user decide whether to fix bugs before proceeding

### Important:
**DSL format support is NOT a bug** - We're intentionally not supporting v1's `{ subject, operator, value }` format. Tests should be updated to use v2's format.

## Test Before Starting

Verify baseline:
```bash
npm test
# Should show: 436/438 passing
```

## Questions to Ask Before Starting

1. Which test files import from `engine.js`?
2. How many tests use `evaluateRule()`?
3. Does `selectTabsMatchingRule()` handle the DSL format tests use?
4. Are there any other v1 API functions to migrate?

## Ready?

Confirm you understand:
- The goal: Migrate tests from v1 API → v2 API
- The constraint: Zero test regressions (436/438 must pass)
- The approach: Change `evaluateRule()` → `selectTabsMatchingRule()`
- The validation: Run npm test, must show 436/438 passing

Then start by finding all test files that import from `engine.js`.
