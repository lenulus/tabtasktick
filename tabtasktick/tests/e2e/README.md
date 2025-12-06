# E2E Testing with Playwright

## Overview

TabMaster Pro uses Playwright for end-to-end testing of the Chrome extension. Tests run in a real Chromium browser with the extension loaded and have access to all Chrome APIs.

## Test Isolation Model

**IMPORTANT:** Tests use a **worker-scoped shared context** model:

### Within a Test File
- ✅ All tests **share the same browser context**
- ✅ All tests **share the same IndexedDB** (data persists between tests)
- ✅ Each test gets a **new page**, but the context/profile remains the same
- ✅ Tests run **sequentially** and can build on each other's state

### Between Test Files
- ✅ Each test file gets a **fresh ephemeral Chrome profile**
- ✅ Profile is automatically cleaned up after all tests complete
- ✅ No data leaks between different test files

## Writing Tests

### Basic Structure

```javascript
import { test, expect } from './fixtures/extension.js';

test('my test', async ({ page, extensionId }) => {
  // Navigate to extension page
  await page.goto(`chrome-extension://${extensionId}/sidepanel/panel.html`);

  // Test your extension
  await page.locator('#my-button').click();
  await expect(page.locator('#result')).toBeVisible();
});
```

### Available Fixtures

- `page` - A fresh page for each test (but shares the context)
- `context` - The shared browser context (worker-scoped)
- `extensionId` - The loaded extension's ID (e.g., `aljeeenhhocdhfomllnmmpmbhgomokio`)
- `serviceWorkerPage` - Access to the extension's service worker
- `testPage` - Pre-loaded test-page.html for ES module imports

### Sequential State Pattern

Since tests share state, you can build flows:

```javascript
test('step 1: create a task', async ({ page, extensionId }) => {
  // Creates a task in IndexedDB
  await createTask(page, 'My Task');
});

test('step 2: task persists', async ({ page, extensionId }) => {
  // This test gets a NEW page but SAME context
  // The task from step 1 will still be in IndexedDB
  await page.goto(`chrome-extension://${extensionId}/sidepanel/panel.html`);
  await expect(page.locator('.task-card')).toContainText('My Task');
});
```

### What NOT to Do

❌ **Don't assume tests start with empty state** (unless it's the first test in the file)
```javascript
// BAD - assumes no data exists
test('my test', async ({ page }) => {
  const count = await page.locator('.task-card').count();
  expect(count).toBe(0); // Will fail if previous tests created tasks!
});
```

✅ **Do check for specific data or use appropriate assertions**
```javascript
// GOOD - checks for specific expected state
test('my test', async ({ page }) => {
  const count = await page.locator('.task-card').count();
  expect(count).toBeGreaterThanOrEqual(1); // More flexible
});
```

❌ **Don't try to manually clean up between tests** - it won't work with the shared context
```javascript
// BAD - trying to clear data between tests
test.beforeEach(async ({ page }) => {
  // This doesn't make sense with shared context
  await clearAllData();
});
```

✅ **Do design tests as a flow or make each test independent**
```javascript
// GOOD - each test is self-contained
test('empty state shows when no tasks', async ({ page, extensionId }) => {
  // ... test the empty state
});

test('creating a task', async ({ page, extensionId }) => {
  // ... create a task (doesn't assume empty state)
});

test('task persistence', async ({ page, extensionId }) => {
  // ... verify tasks persist (expects data from previous test)
});
```

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test file
npx playwright test tests/e2e/sidepanel-tasks-view.spec.js

# Run with headed browser (see what's happening)
npx playwright test tests/e2e/sidepanel-tasks-view.spec.js --headed

# Run specific test by name
npx playwright test --grep "empty state"

# Run with debug mode
npx playwright test --debug

# View test report
npx playwright show-report
```

## Debugging Tips

### Console Logging

```javascript
test('debug test', async ({ page }) => {
  // Log from Node.js (test code)
  console.log('Running test...');

  // Log from browser (page context)
  page.on('console', msg => console.log('BROWSER:', msg.text()));
});
```

### Error Handlers

```javascript
test('error handling', async ({ page }) => {
  page.on('pageerror', error => {
    console.error('PAGE ERROR:', error.message);
  });

  page.on('crash', () => {
    console.error('PAGE CRASHED');
  });
});
```

### Evaluate in Browser Context

```javascript
test('inspect DOM', async ({ page }) => {
  const data = await page.evaluate(() => {
    return {
      taskCount: document.querySelectorAll('.task-card').length,
      url: window.location.href
    };
  });
  console.log('Page data:', data);
});
```

### Screenshots

```javascript
test('take screenshot', async ({ page }) => {
  await page.screenshot({
    path: 'test-results/my-screenshot.png',
    fullPage: true
  });
});
```

## Common Patterns

### Waiting for Elements

```javascript
// Wait for element to appear
await page.locator('#my-element').waitFor({ state: 'visible' });

// Wait for modal with timeout
await page.locator('.modal').waitFor({
  state: 'visible',
  timeout: 10000
});
```

### Filling Forms

```javascript
// Fill text input
await page.locator('#task-summary').fill('My Task');

// Select dropdown option
await page.locator('#task-priority').selectOption('high');

// Click checkbox
await page.locator('#task-complete').check();
```

### Assertions

```javascript
// Element visibility
await expect(page.locator('#tasks-view')).toBeVisible();

// Text content
await expect(page.locator('.task-card')).toContainText('My Task');

// Count
await expect(page.locator('.task-card')).toHaveCount(3);

// Numeric comparison
const count = await page.locator('.task-card').count();
expect(count).toBeGreaterThanOrEqual(1);
```

## Troubleshooting

### "Page closed" or "Target closed" errors
- Usually means the extension crashed or you're trying to interact with a closed page
- Add error handlers to see what's happening
- Check the browser console for extension errors

### "Element not found" errors
- Element might not be rendered yet - add `waitFor()`
- Check if you're on the right page/view
- Verify the selector is correct

### Tests fail in CI but pass locally
- Check for timing issues - increase timeouts
- Ensure tests don't depend on specific screen size
- Make sure tests are truly independent (don't rely on local state)

### Data not persisting between tests
- Verify you're using the shared context correctly
- Check that you're running with `--workers=1` (tests must run sequentially in same worker)
- Make sure the fixture is using `{ scope: 'worker' }`
