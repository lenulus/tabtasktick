# Local ESLint Plugin

Custom ESLint rules for TabMaster Pro architectural integrity.

## Rules

### `no-async-chrome-listener`

**Status**: ✅ Active (error level)

Prevents async functions from being used directly as Chrome API event listener callbacks.

#### Why This Rule Exists

Using `async` directly on Chrome event listeners causes non-deterministic behavior:

```javascript
// ❌ WRONG - Returns Promise instead of true/undefined
chrome.tabs.onCreated.addListener(async (tab) => {
  await doSomething();
});
```

The async function returns a `Promise`, not `true` or `undefined`, breaking Chrome's message channel semantics and causing race conditions in service workers.

#### Correct Patterns

**For non-message listeners** (alarms, tab events, window events, etc.):

```javascript
import { safeAsyncListener } from './services/utils/listeners.js';

chrome.tabs.onCreated.addListener(safeAsyncListener(async (tab) => {
  await doSomething();
}));
```

**For `chrome.runtime.onMessage`** (needs `sendResponse` callback):

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      const result = await processMessage(message);
      sendResponse({ success: true, data: result });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true; // Keep channel open for async response
});
```

#### Testing the Rule

Run the test file to verify the rule detects violations:

```bash
cd tabmaster-pro
npx eslint eslint-plugin-local/no-async-chrome-listener.test.js --no-ignore
```

Expected output: 3 errors detected (lines 14, 19, 24)

#### Implementation Details

- **File**: `eslint-plugin-local/no-async-chrome-listener.js`
- **Type**: AST walker (detects `CallExpression` nodes)
- **Detection**: Checks if `chrome.*.*. addListener()` has async callback
- **Exemption**: Allows `safeAsyncListener(async ...)` wrapper

#### References

- **Documentation**: `/CLAUDE.md` lines 680-805
- **Utility**: `/services/utils/listeners.js`
- **Tests**: `/tests/listeners.test.js`
- **Phase 1**: v1.3.19 - Fixed all async listener violations
- **Phase 4**: Added this ESLint rule to prevent regressions

## Usage

The plugin is automatically loaded in `eslint.config.js`:

```javascript
import localPlugin from './eslint-plugin-local/index.js';

export default [
  {
    plugins: {
      local: localPlugin
    },
    rules: {
      'local/no-async-chrome-listener': 'error'
    }
  }
];
```

## Adding New Rules

1. Create rule file: `eslint-plugin-local/my-new-rule.js`
2. Export rule with `meta` and `create` properties
3. Import in `eslint-plugin-local/index.js`
4. Add to `rules` object in index
5. Enable in `eslint.config.js`

See `no-async-chrome-listener.js` for example structure.
