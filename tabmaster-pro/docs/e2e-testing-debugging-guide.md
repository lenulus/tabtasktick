# E2E Testing & Debugging Guide

## Overview

This guide documents patterns, issues, and solutions discovered while debugging Playwright E2E tests for the TabTaskTick side panel search & filter functionality.

**Session Date**: 2025-10-19
**Test File**: `tests/e2e/sidepanel-search-filters.spec.js`
**Status**: Partial completion - 14/31 tests passing, remaining tests need IndexedDB investigation

---

## Key Architectural Principles for E2E Tests

### 1. Test Isolation is Critical

**Problem**: Playwright E2E tests share browser context and IndexedDB within each test file.

**Impact**: UI state (filters, sorts, view selections) and data changes persist between tests, causing pollution.

**Solution Pattern**:
```javascript
test.beforeEach(async ({ page }) => {
  // 1. Navigate to fresh page
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');

  // 2. Wait for controller initialization
  await page.waitForFunction(() => window.controllerReady, { timeout: 5000 });

  // 3. Clear BOTH storage AND in-memory state
  await page.evaluate(async () => {
    // CRITICAL: Must be async and await storage operations
    await chrome.storage.local.remove(['filter.keys']);

    // Clear in-memory UI state
    window.controller.resetFilters();
    window.controller.render();
  });

  // 4. Wait for UI to stabilize
  await page.waitForTimeout(500);
});
```

### 2. Always Await Async Operations in page.evaluate()

**Critical Bug Pattern**:
```javascript
// ❌ WRONG - Creates race condition
await page.evaluate(() => {
  chrome.storage.local.remove([...]); // Async but not awaited!
  controller.render(); // May run before storage clear completes
});

// ✅ CORRECT - Properly sequenced
await page.evaluate(async () => {
  await chrome.storage.local.remove([...]); // Properly awaited
  controller.render(); // Runs after storage is cleared
});
```

**Why This Matters**: `chrome.storage.local` operations are asynchronous. Not awaiting them causes race conditions where subsequent operations may execute before storage operations complete, leading to unpredictable test failures.

### 3. Test Data vs UI State are Separate Concerns

**Test Data**: Lives in IndexedDB, created by setup tests
- Collections, tasks, folders, tabs
- Persists across tests in same file
- Should NOT be cleared between tests (except by explicit cleanup)

**UI State**: Lives in component memory + chrome.storage.local
- Active filters, sorts, view selections
- MUST be cleared between tests to prevent pollution
- Separate from test data

**Example**:
```javascript
// Setup test creates data ONCE
test('setup: create test collections', async ({ page }) => {
  await page.evaluate(async () => {
    const db = await openDB('TabTaskTickDB');
    await db.put('collections', testCollection);
  });
});

// Each test clears UI state but keeps data
test.beforeEach(async ({ page }) => {
  await page.evaluate(async () => {
    // Clear UI state only
    await chrome.storage.local.remove(['filters']);
    window.controller.clearFilters();

    // Do NOT clear IndexedDB test data
  });
});
```

---

## Common Test Patterns

### Pattern: View Guards

Prevent test pollution from previous tests that switched views.

```javascript
async function ensureCollectionsView(page) {
  const btn = page.locator('#view-collections-btn');
  const isSelected = await btn.getAttribute('aria-selected');
  if (isSelected !== 'true') {
    await btn.click();
    await page.waitForTimeout(300); // Wait for view transition
  }
}
```

**Why**: Tests run sequentially and share state. Previous test might have switched to Tasks view.

### Pattern: Data Verification

Prevent tests from hanging when test data is missing.

```javascript
async function verifyTestDataExists(page) {
  const data = await page.evaluate(async () => {
    const db = await openDB('TabTaskTickDB');
    const collections = await db.count('collections');
    const tasks = await db.count('tasks');
    return { collections, tasks };
  });

  if (data.collections === 0 && data.tasks === 0) {
    throw new Error(`Test data missing! Setup tests must run first.`);
  }

  return data;
}
```

**Why**: If setup tests don't run or data gets corrupted, tests hang waiting for elements that never appear.

### Pattern: Filter State Clearing

Clear both persisted and in-memory filter state.

```javascript
await page.evaluate(async () => {
  // 1. Clear persisted state
  await chrome.storage.local.remove([
    'tabtasktick.filters.collections',
    'tabtasktick.filters.tasks'
  ]);

  // 2. Clear in-memory state
  const controller = window.panelController;
  if (controller?.searchFilter) {
    controller.searchFilter.clearCollectionsFilters();
    controller.searchFilter.clearTasksFilters();
    controller.applyFiltersAndRender();
  }
});

await page.waitForTimeout(500); // Wait for re-render
```

**Why**: Storage clearing alone doesn't reset active UI filters already applied to the view.

---

## Issues Discovered & Solutions

### Issue #1: Async/Await Race Condition ✅ FIXED

**Symptom**: Test #15 (sort by name) showed "Learning React" instead of "House Renovation" - only active collections displayed despite clearing filters.

**Root Cause**: `chrome.storage.local.remove()` wasn't awaited in `page.evaluate()`, causing race condition.

**Solution**: Changed `page.evaluate(() => {...})` to `page.evaluate(async () => {...})` and added `await` to storage operations.

**Commit**: 834b430 - "E2E: Fix async/await race condition in filter clearing"

**Architecture Review**: ✅ Approved by architecture-guardian

### Issue #2: Test Data Deletion (Status: 🔴 INVESTIGATING)

**Symptom**: Tests #16-31 fail with "Test data missing! Found: 0 collections, 0 tasks"

**Context**: After fixing async/await issue, test #15 now appears to delete all IndexedDB data, causing subsequent tests to fail.

**Hypothesis**: Test #15 has a workaround (clicking "All" button, verifying 4 collections) that times out and may trigger unexpected IndexedDB operations.

**Investigation Needed**:
1. Check if `verifyTestDataExists()` timeout causes test to corrupt database
2. Review test #15's explicit "All" button click logic
3. Verify `clearCollectionsFilters()` doesn't inadvertently affect IndexedDB
4. Check if test failure cleanup is deleting database

**Debugging Steps**:
```javascript
// Add diagnostic logging in beforeEach
test.beforeEach(async ({ page }, testInfo) => {
  console.log(`[${testInfo.title}] Starting...`);

  // Log data state before and after operations
  const before = await verifyTestDataExists(page);
  console.log(`[${testInfo.title}] Data before: ${before.collections} collections`);

  // ... clear filters ...

  const after = await verifyTestDataExists(page);
  console.log(`[${testInfo.title}] Data after: ${after.collections} collections`);
});
```

### Issue #3: Controller Exposure in Production Code ⚠️ NEEDS IMPROVEMENT

**Current State**: `window.panelController` is exposed globally for all users

**Problem**: Violates encapsulation, increases attack surface

**Recommended Fix** (per architecture-guardian):
```javascript
// In panel.js
const urlParams = new URLSearchParams(window.location.search);
const isTestMode = urlParams.get('test_mode') === 'true';

if (isTestMode) {
  window.__testController = controller;
  console.log('[Panel] Test mode enabled');
}

// In tests
await page.goto(`chrome-extension://${extensionId}/sidepanel/panel.html?test_mode=true`);
```

**Status**: Deferred to future PR

---

## Test File Structure Best Practices

### Recommended Organization

```javascript
// 1. Helper functions at top
async function ensureCollectionsView(page) { ... }
async function ensureTasksView(page) { ... }
async function verifyTestDataExists(page) { ... }

// 2. Test suite with proper beforeEach
test.describe('Feature Tests', () => {
  test.beforeEach(async ({ page, extensionId }, testInfo) => {
    // Setup logic here
  });

  // 3. Setup tests FIRST (run once, create data)
  test('setup: create test data', async ({ page }) => { ... });

  // 4. Feature tests (rely on setup data)
  test('should filter by name', async ({ page }) => { ... });
  test('should sort by date', async ({ page }) => { ... });
});
```

### Setup Test Pattern

```javascript
test('setup: create test collections', async ({ page }) => {
  const created = await page.evaluate(async () => {
    const db = await indexedDB.open('TabTaskTickDB');
    return new Promise((resolve) => {
      const tx = db.transaction(['collections'], 'readwrite');
      const store = tx.objectStore('collections');

      const collections = [/* test data */];
      let count = 0;

      collections.forEach(c => {
        const req = store.add(c);
        req.onsuccess = () => count++;
      });

      tx.oncomplete = () => resolve(count);
    });
  });

  // Verify creation succeeded
  await page.reload();
  const cards = page.locator('.collection-card');
  await expect(cards).toHaveCount(4);
});
```

---

## Debugging Techniques

### 1. Add Diagnostic Logging

```javascript
test.beforeEach(async ({ page }, testInfo) => {
  console.log(`\n[${testInfo.title}] Starting test...`);

  const data = await verifyTestDataExists(page);
  console.log(`[${testInfo.title}] Test data: ${data.collections} collections, ${data.tasks} tasks`);
});
```

### 2. Take Screenshots on Failure

Playwright automatically saves screenshots to `test-results/`. Review them to see actual UI state at failure.

```bash
# View test results
open test-results/[test-name]/test-failed-1.png
```

### 3. Use `--headed` Mode

```bash
# Run tests in visible browser
npm run test:e2e:headed

# Run specific test with UI
npx playwright test tests/e2e/sidepanel-search-filters.spec.js --grep "sort by name" --headed
```

### 4. Add Wait Conditions

```javascript
// Wait for specific element state
await page.waitForSelector('.collection-card', { state: 'visible' });

// Wait for element count
await expect(page.locator('.collection-card')).toHaveCount(4);

// Wait for controller ready
await page.waitForFunction(() => window.panelController != null);
```

### 5. Inspect IndexedDB Directly

```javascript
const dbState = await page.evaluate(async () => {
  const request = indexedDB.open('TabTaskTickDB');
  return new Promise((resolve) => {
    request.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction(['collections'], 'readonly');
      const store = tx.objectStore('collections');
      const getAll = store.getAll();

      getAll.onsuccess = () => {
        resolve({
          count: getAll.result.length,
          data: getAll.result.map(c => ({ id: c.id, name: c.name }))
        });
      };
    };
  });
});

console.log('IndexedDB state:', dbState);
```

---

## Performance Considerations

### Timeout Configuration

```javascript
// Playwright config
export default {
  timeout: 30000, // 30s per test
  expect: {
    timeout: 5000   // 5s for assertions
  }
};

// Per-test timeout
test('slow test', async ({ page }) => {
  test.setTimeout(60000); // 60s for this test only
});
```

### Wait Time Guidelines

- **Page load**: 1000ms after `waitForLoadState('domcontentloaded')`
- **View transition**: 300ms after clicking view switcher
- **Filter application**: 200-300ms after changing filter
- **Re-render**: 500ms after programmatic state change
- **Debounced search**: 350ms (300ms debounce + 50ms buffer)

**Why Variable**: Different operations have different complexity. Test data count and browser performance affect timing.

---

## Architecture Guardian Recommendations

### 1. Async Operations Must Be Awaited

```javascript
// ❌ Race condition
await page.evaluate(() => {
  chrome.storage.local.remove([...]);
});

// ✅ Properly sequenced
await page.evaluate(async () => {
  await chrome.storage.local.remove([...]);
});
```

### 2. Test Hooks Should Be Conditional

```javascript
// ❌ Always exposed
window.panelController = controller;

// ✅ Test mode only
if (isTestMode) {
  window.__testController = controller;
}
```

### 3. Extract Test Helpers

Create `/tests/e2e/helpers/sidepanel-helpers.js`:
```javascript
export async function ensureCollectionsView(page) { ... }
export async function clearFilterState(page) { ... }
export async function verifyTestDataExists(page) { ... }
```

Import in tests:
```javascript
import { ensureCollectionsView, clearFilterState } from './helpers/sidepanel-helpers.js';
```

---

## Known Limitations

### 1. Playwright Service Worker Event Testing

**Issue**: Playwright doesn't properly wake service workers on Chrome events (window.onRemoved, etc.)

**Workaround**: Use Test Runner scenarios in production Chrome for window event testing.

**Reference**: `/PHASE-2.7-TEST-RUNNER-GUIDE.md`

### 2. Test Data Persistence

**Issue**: IndexedDB data persists across tests in same file. Can't fully isolate tests without performance penalty.

**Mitigation**: Use `test.describe.serial()` to ensure tests run in order and setup tests run first.

### 3. Timing Sensitivity

**Issue**: Fixed timeouts (`waitForTimeout`) are brittle and vary across machines.

**Best Practice**: Use `waitForFunction()` or `waitForSelector()` with conditions instead of fixed waits.

```javascript
// ❌ Brittle
await page.waitForTimeout(1000);
const count = await page.locator('.card').count();

// ✅ Robust
await expect(page.locator('.card')).toHaveCount(4);
```

---

## Next Steps for Testing Infrastructure

### Immediate (Current Session Follow-up)

1. ✅ Fix async/await race condition (DONE - commit 834b430)
2. 🔴 Debug test #15 IndexedDB deletion issue
3. 🟡 Apply consistent "All" button click pattern to affected tests
4. 🟡 Verify all 31 tests pass

### Short Term

1. Extract test helpers to `/tests/e2e/helpers/sidepanel-helpers.js`
2. Make controller exposure conditional on `?test_mode=true`
3. Add more diagnostic logging to track data state
4. Create test data fixtures for consistent setup

### Long Term

1. Create specialized testing sub-agent (see: Testing Sub-Agent Specification below)
2. Implement test isolation improvements (separate IndexedDB per test?)
3. Add visual regression testing for UI state
4. Create E2E test template for new features

---

## Testing Sub-Agent Specification

See: `/docs/testing-sub-agent-spec.md` (created separately)

**Purpose**: Encode debugging methodology and architectural patterns into a specialized agent for:
- Executing E2E tests
- Debugging test failures systematically
- Making targeted code fixes
- Maintaining clean separation between test execution, debugging, and fixing

**Key Capabilities**:
1. Run tests and interpret Playwright output
2. Analyze screenshots and error messages
3. Apply debugging techniques (logging, waits, state inspection)
4. Make code changes following architectural principles
5. Verify fixes work before committing

---

## References

- **Test File**: `/tests/e2e/sidepanel-search-filters.spec.js`
- **Playwright Config**: `/playwright.config.js`
- **Test Fixtures**: `/tests/e2e/fixtures/extension.js`
- **E2E README**: `/tests/e2e/README.md`
- **Phase 2.7 Manual Testing**: `/MANUAL-TEST-PHASE-2.7.md`
- **Test Runner Guide**: `/PHASE-2.7-TEST-RUNNER-GUIDE.md`
- **Architecture Guardian Review**: Commit 834b430

---

**Last Updated**: 2025-10-19
**Status**: Active debugging session, async/await fix committed
**Next Review**: After resolving test #15 IndexedDB deletion issue
