# Playwright E2E Testing for TabMaster Pro

## Overview

TabMaster Pro uses Playwright for end-to-end (E2E) testing of the Chrome extension with **real Chrome APIs and IndexedDB**. This solves the fake-indexeddb index query issues we encountered with Jest unit tests.

## Why Playwright?

- ✅ **Official Chrome Extension Support**: [Playwright docs](https://playwright.dev/docs/chrome-extensions)
- ✅ **Real Browser Environment**: Tests run in actual Chromium with real Chrome APIs
- ✅ **Real IndexedDB**: No more fake-indexeddb compatibility issues
- ✅ **Service Worker Access**: Can test background scripts directly
- ✅ **Headful Testing**: Extensions require non-headless mode (visual feedback)

## Installation

```bash
# Install Playwright
npm install --save-dev @playwright/test

# Install Chromium browser
npx playwright install chromium
```

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI (interactive mode)
npm run test:e2e:ui

# Run in headed mode (see browser)
npm run test:e2e:headed

# Run with debugger
npm run test:e2e:debug

# View test report
npm run test:e2e:report
```

## Test Structure

```
tests/e2e/
├── fixtures/
│   └── extension.js          # Extension loading fixtures
├── extension-loads.spec.js   # Smoke tests
├── indexeddb-basic.spec.js   # IndexedDB tests
└── test-page.spec.js         # Test page fixture tests
```

## Writing Tests

### Basic Extension Test

```javascript
import { test, expect } from './fixtures/extension.js';

test('extension loads correctly', async ({ extensionId }) => {
  // Extension ID is automatically available
  expect(extensionId).toBeTruthy();
  expect(extensionId).toMatch(/^[a-z]{32}$/);
});
```

### Service Worker Test

```javascript
test('can execute in service worker', async ({ serviceWorkerPage }) => {
  const result = await serviceWorkerPage.evaluate(() => {
    return {
      hasChrome: typeof chrome !== 'undefined',
      hasIndexedDB: typeof indexedDB !== 'undefined'
    };
  });

  expect(result.hasChrome).toBe(true);
  expect(result.hasIndexedDB).toBe(true);
});
```

### Test Page Test (For ES Modules)

**Important**: Service workers cannot use dynamic `import()`. Use the testPage fixture instead:

```javascript
test('index queries work', async ({ testPage }) => {
  const result = await testPage.evaluate(async () => {
    // Dynamic imports work in page context
    const { saveCollection, getCollectionsByIndex } =
      await import('./services/utils/storage-queries.js');

    // Save test data
    await saveCollection({
      id: 'test_1',
      name: 'Test',
      isActive: true,
      tags: [],
      metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
    });

    // Query using index (this is what failed in fake-indexeddb!)
    const results = await getCollectionsByIndex('isActive', true);

    return {
      count: results.length,
      names: results.map(c => c.name)
    };
  });

  expect(result.count).toBe(1);
  expect(result.names).toEqual(['Test']);
});
```

## Available Fixtures

### `context`
Browser context with extension loaded. Automatically manages Chrome profile.

### `extensionId`
The loaded extension's ID (32-character lowercase string).

### `serviceWorkerPage`
Access to the extension's background service worker. Use for:
- Testing background script logic
- Accessing chrome APIs
- **Not for dynamic imports** (Service Worker limitation)

### `page`
A blank page in the extension context.

### `testPage`
Loads `test-page.html` from the extension. Use for:
- Testing with ES module imports
- UI component testing
- Complex IndexedDB operations

## Configuration

See `playwright.config.js`:

```javascript
export default {
  testDir: './tests/e2e',
  workers: 1,  // Sequential execution (avoids Chrome profile conflicts)
  timeout: 30000,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
};
```

## Troubleshooting

### Module Import Errors in Extension Pages

**⚠️ CRITICAL LESSON LEARNED**

- **Error**: ES modules fail to import silently, page crashes
- **Symptom**: `Target page, context or browser has been closed`
- **Cause**: Missing `web_accessible_resources` in manifest.json
- **Solution**: Add to manifest.json:
  ```json
  "web_accessible_resources": [
    {
      "resources": ["services/*/*.js", "test-page.html"],
      "matches": ["<all_urls>"],
      "extension_ids": ["*"]
    }
  ]
  ```

Chrome extensions require explicit `web_accessible_resources` declaration for ES modules to be importable from extension pages. Without this, module imports silently fail and crash the page with no console errors.

**Debugging Strategy:**
1. If testPage crashes, check browser console for module errors
2. Verify manifest.json has `web_accessible_resources`
3. Test imports work with minimal reproduction (see `test-detailed-debug.spec.js`)

### Tests Timeout

- **Cause**: Extension loading or page navigation hangs
- **Solution**: Check `test-results/` for screenshots
- **Command**: `npm run test:e2e:headed` to watch in browser

### Profile Conflicts

- **Error**: `Failed to create a ProcessSingleton`
- **Cause**: Multiple tests trying to use same Chrome profile
- **Solution**: Already fixed with `workers: 1` in config
- **Cleanup**: `rm -rf .playwright-user-data`

### Service Worker Import Errors

- **Error**: `import() is disallowed on ServiceWorkerGlobalScope`
- **Cause**: Dynamic imports don't work in service workers
- **Solution**: Use `testPage` fixture instead of `serviceWorkerPage`

### Extension Not Loading

- **Check**: `manifest.json` is valid
- **Check**: Extension path in fixtures is correct (3 levels up from fixtures/)
- **Debug**: Run with `--debug` flag to step through

## Best Practices

1. **Use testPage for Complex Tests**: Service workers have limitations
2. **Clean State Between Tests**: Use `clearAllData()` from db.js
3. **Sequential Execution**: Keep `workers: 1` to avoid profile conflicts
4. **Visual Feedback**: Use headed mode during development
5. **Screenshots**: Playwright automatically captures on failure

## Known Limitations

1. **Headless Mode**: Chrome extensions require headful mode (browser window visible)
2. **Service Worker Imports**: Cannot use dynamic `import()` - use testPage instead
3. **Parallel Execution**: Must run sequentially due to Chrome profile locking

## Next Steps

1. Write E2E tests for Phase 2 services (Collections, Tasks)
2. Test selection services with real IndexedDB indexes
3. Add tests for UI components (popup, dashboard)
4. Integrate with CI/CD (requires headed mode support)

## Resources

- [Playwright Chrome Extensions Docs](https://playwright.dev/docs/chrome-extensions)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/reference/)
