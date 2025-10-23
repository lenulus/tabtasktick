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

### Pattern: Debounced UI Re-render (Established Architecture Pattern)

When event handlers update state that affects UI visibility, use debounced re-renders to avoid destroying DOM elements during their own event processing.

**Use Cases**:
1. Checkbox handlers that update filter state → Show/hide "Clear" button
2. Button clicks that update state → Prevent destroying the button mid-click
3. Any state change that should update UI visibility

**Implementation**:
```javascript
class MyComponent {
  constructor() {
    // Add debounce timers
    this.renderTimeout = null;
  }

  scheduleRender() {
    // Clear any pending render
    clearTimeout(this.renderTimeout);

    // Schedule render for next event loop tick
    this.renderTimeout = setTimeout(() => {
      this.render();
    }, 0);
  }

  handleStateChange(event) {
    // 1. Update state immediately
    this.state.value = event.target.value;

    // 2. Save state in background (non-blocking)
    this.saveState().catch(err => console.error('Failed to save state:', err));

    // 3. Fire callbacks IMMEDIATELY (don't wait for re-render)
    if (this.onChange) {
      this.onChange(this.state);
    }

    // 4. Schedule debounced re-render (defers DOM manipulation)
    this.scheduleRender();
  }
}
```

**Why This Pattern**:
- **Prevents browser crashes**: DOM elements aren't destroyed during their own event handlers
- **Ensures UI updates**: State changes trigger appropriate UI visibility changes
- **Non-blocking**: Callbacks fire immediately, async operations run in background
- **Efficient**: Multiple rapid state changes only trigger one re-render

**Examples in Codebase**:
- `presentation-controls.js` (commit 88338a1) - Prevents destroying controls during saveState()
- `search-filter.js` (commit e887d70) - Shows/hides clear button after checkbox changes

**Anti-Pattern** (causes bugs):
```javascript
// ❌ BAD - synchronous re-render during event
handleCheckbox(event) {
  this.state.checked = event.target.checked;
  this.render(); // May destroy checkbox during its own event!
}

// ❌ BAD - no re-render at all
handleCheckbox(event) {
  this.state.checked = event.target.checked;
  // Forgot to re-render - UI never updates!
}
```

---

## Issues Discovered & Solutions

### Issue #1: Async/Await Race Condition ✅ FIXED

**Symptom**: Test #15 (sort by name) showed "Learning React" instead of "House Renovation" - only active collections displayed despite clearing filters.

**Root Cause**: `chrome.storage.local.remove()` wasn't awaited in `page.evaluate()`, causing race condition.

**Solution**: Changed `page.evaluate(() => {...})` to `page.evaluate(async () => {...})` and added `await` to storage operations.

**Commit**: 834b430 - "E2E: Fix async/await race condition in filter clearing"

**Architecture Review**: ✅ Approved by architecture-guardian

### Issue #2: Missing UI Re-render After State Changes ✅ FIXED

**Symptom**: Test #25 "should clear tasks filters" hangs for 30s then crashes browser. Tests #26-31 fail with "Test data missing!" (cascade failures from browser crash clearing IndexedDB).

**Root Cause**: Checkbox filter handlers in `search-filter.js` updated internal state but didn't trigger UI re-render. The "Clear Filters" button never appeared in the DOM. Test tried to click a non-existent button → hang → timeout → browser crash.

**Solution**: Added debounced re-render pattern (similar to presentation-controls.js fix):
```javascript
// In search-filter.js

// 1. Add debounce timers to constructor
constructor() {
  this.collectionsRenderTimeout = null;
  this.tasksRenderTimeout = null;
}

// 2. Add debounced re-render helpers
scheduleCollectionsRender() {
  clearTimeout(this.collectionsRenderTimeout);
  this.collectionsRenderTimeout = setTimeout(() => {
    this.renderCollectionsFilters();
  }, 0);
}

scheduleTasksRender() {
  clearTimeout(this.tasksRenderTimeout);
  this.tasksRenderTimeout = setTimeout(() => {
    this.renderTasksFilters();
  }, 0);
}

// 3. Update checkbox handlers to trigger re-render
handleTagCheckbox(event) {
  // Update state
  this.collectionsFilters.tags = getCheckedValues();

  // Save state in background (non-blocking)
  this.saveFilterState().catch(err => console.error(...));

  // Fire callback IMMEDIATELY
  if (this.onFiltersChange) {
    this.onFiltersChange('collections', this.collectionsFilters);
  }

  // Schedule debounced re-render (shows/hides clear button)
  this.scheduleCollectionsRender();
}

// 4. Update clear methods to use debounced re-render
clearTasksFilters() {
  // Clear state
  this.tasksFilters = { /* defaults */ };

  // Save + callback (same pattern)
  this.saveFilterState().catch(...);
  if (this.onFiltersChange) {
    this.onFiltersChange('tasks', this.tasksFilters);
  }

  // Defer re-render (avoids destroying button during click event)
  this.scheduleTasksRender();
}
```

**Pattern**: Fire callbacks immediately, defer DOM manipulation to next event loop tick.

**Commit**: e887d70 - "fix(e2e): Add debounced re-renders to filter checkboxes to show/hide clear button"

**Architecture Review**: ✅ Approved - follows established pattern from commit 88338a1

**Test Results**: Before: 24/31 passing (77%) → After: 31/31 passing (100%)

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

### 1. Use Shortened Test Runs for Efficient Debugging

When debugging a specific failing test, run only setup tests + the failing test to iterate quickly.

```bash
# Run only setup + test #25
npx playwright test tests/e2e/sidepanel-search-filters.spec.js \
  --grep "(setup|should clear tasks filters)"

# Generic pattern
npx playwright test path/to/test.spec.js \
  --grep "(setup|your failing test name)"
```

**Why**: Full test suite may take 1.5 minutes. Shortened runs complete in ~10 seconds, enabling rapid iteration during debugging.

**Critical for Cascade Failures**: When one test crashes the browser and causes subsequent tests to fail, shortened runs isolate the root cause test from cascade failures.

### 2. Understanding Browser Crash Cascade Failures

**Pattern**: Test hangs → timeout → browser crash → IndexedDB cleared → subsequent tests fail with "Test data missing!"

**Example**:
```
Test #25: ❌ Browser crash (root cause)
Test #26: ❌ "Test data missing!" (cascade)
Test #27: ❌ "Test data missing!" (cascade)
Test #28: ❌ "Test data missing!" (cascade)
...
```

**Debugging Strategy**:
1. Identify the FIRST failing test (test #25 in example)
2. Use shortened test run (setup + test #25 only)
3. Fix the root cause (browser crash)
4. All cascade failures resolve automatically

**Root Causes of Browser Crashes**:
- Destroying DOM elements during their own event handlers
- Infinite loops in event handlers
- Missing UI re-renders causing tests to click non-existent elements
- Excessive memory consumption

### 3. Add Diagnostic Logging

```javascript
test.beforeEach(async ({ page }, testInfo) => {
  console.log(`\n[${testInfo.title}] Starting test...`);

  const data = await verifyTestDataExists(page);
  console.log(`[${testInfo.title}] Test data: ${data.collections} collections, ${data.tasks} tasks`);
});
```

### 4. Take Screenshots on Failure

Playwright automatically saves screenshots to `test-results/`. Review them to see actual UI state at failure.

```bash
# View test results
open test-results/[test-name]/test-failed-1.png
```

### 5. Use `--headed` Mode

```bash
# Run tests in visible browser
npm run test:e2e:headed

# Run specific test with UI
npx playwright test tests/e2e/sidepanel-search-filters.spec.js --grep "sort by name" --headed
```

### 6. Add Wait Conditions

```javascript
// Wait for specific element state
await page.waitForSelector('.collection-card', { state: 'visible' });

// Wait for element count
await expect(page.locator('.collection-card')).toHaveCount(4);

// Wait for controller ready
await page.waitForFunction(() => window.panelController != null);
```

### 7. Inspect IndexedDB Directly

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
