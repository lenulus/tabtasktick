# Phase 2.7 Window Event Testing - Test Runner Guide

## Quick Start

The Phase 2.7 window event listener functionality can now be tested using the built-in Test Runner UI.

### 1. Open Test Panel

1. Load the extension in Chrome (`chrome://extensions/`)
2. Open the test panel:
   - Click extension icon → "Test Panel"
   - Or navigate to `chrome-extension://<extension-id>/test-panel/test-panel.html`

### 2. Run Phase 2.7 Test

1. Click "**Activate Test Mode**" button
2. Wait for test mode to initialize (creates isolated test window)
3. In the scenario list, find and check:
   - ✅ **Window Event Listeners**
4. Click "**Run Selected Tests**"

### 3. View Results

The test will automatically:
- ✅ Create a test collection
- ✅ Create a new window
- ✅ Bind collection to window
- ✅ Close window (triggers `chrome.windows.onRemoved`)
- ✅ Verify event fired and collection unbound
- ✅ Clean up test data

**Success indicators**:
- All steps show ✅ green checkmarks
- "Window close event fired and recorded" assertion passes
- Test summary shows "1 passed, 0 failed"

### 4. Deactivate Test Mode

After testing, click "**Deactivate Test Mode**" to clean up.

---

## What the Test Validates

The `window-event-listeners` scenario tests:

### ✅ Collection Creation
- Creates a test collection in IndexedDB
- Verifies collection saved with correct schema

### ✅ Window Binding
- Binds collection to a new Chrome window
- Verifies `collection.isActive = true`
- Verifies `collection.windowId` set correctly

### ✅ Window Close Event
- Closes window via `chrome.windows.remove()`
- **Verifies `chrome.windows.onRemoved` event fires**
- Checks `lastWindowRemovedEvent` storage flag set by background script

### ✅ Auto-Unbind
- Verifies background script unbinds collection
- Confirms `collection.isActive = false`
- Confirms `collection.windowId = null`

---

## Interpreting Results

### ✅ Test Passes
**Meaning**: Phase 2.7 implementation works correctly in production Chrome

- Window close event fires in background service worker
- Event listener wakes dormant service worker
- Collection automatically unbinds when window closes
- All storage operations persist correctly

### ❌ Test Fails

Check the **Test Results** panel for specific failure:

**"Window close event fired and recorded" fails**:
- Background script didn't receive event
- Check service worker console for errors
- Verify event listeners registered (see background-integrated.js:836-894)

**"Collection was unbound" assertion fails**:
- Event fired but unbind logic failed
- Check WindowService.unbindCollectionFromWindow()
- Verify IndexedDB write permissions

**Step execution errors**:
- Check browser console for detailed error stack trace
- Verify IndexedDB quota not exceeded
- Ensure no conflicting extensions

---

## Debugging

### View Detailed Logs

1. Set **Log Level** to "Debug"
2. Re-run test
3. Check **Logs** tab for:
   - Collection creation
   - Window creation
   - Binding operation
   - Window close
   - Event listener execution
   - Unbind operation

### Manual Verification

After test runs, you can manually check:

```javascript
// In service worker console:

// 1. Check event fired
const data = await chrome.storage.local.get('lastWindowRemovedEvent');
console.log(data.lastWindowRemovedEvent);
// Should show: { windowId: <number>, timestamp: <recent> }

// 2. Check collection state
const { selectCollections } = await import('./services/selection/selectCollections.js');
const cols = await selectCollections({});
console.log('Test collections:', cols.filter(c => c.name.includes('Window Event')));
// Should show isActive: false, windowId: null
```

---

## Comparison: Playwright vs Test Runner

| Aspect | Playwright E2E | Test Runner (Production) |
|--------|----------------|-------------------------|
| **Service Worker** | May not wake on events | ✅ Wakes correctly |
| **Event Firing** | Known issues | ✅ Works as expected |
| **Environment** | Simulated | ✅ Real Chrome |
| **Reliability** | Flaky (known Playwright issue) | ✅ Consistent |
| **Use Case** | CI/CD automation | ✅ Manual validation |

**Recommendation**: Use Test Runner for Phase 2.7 validation since Playwright has known issues with MV3 service worker events.

---

## Cleanup

Test mode automatically cleans up:
- ✅ Test collections
- ✅ Test windows
- ✅ Diagnostic storage flags

To manually clean up:

```javascript
// In service worker console:
await chrome.storage.local.remove('lastWindowRemovedEvent');

const { deleteCollection } = await import('./services/utils/storage-queries.js');
const { selectCollections } = await import('./services/selection/selectCollections.js');
const testCols = await selectCollections({});
for (const col of testCols.filter(c => c.name.includes('Window Event'))) {
  await deleteCollection(col.id);
}
```

---

## Extending the Test

To add more window event scenarios, edit `/lib/test-mode/test-mode.js`:

```javascript
{
  name: 'custom-window-test',
  description: 'Your custom test description',
  steps: [
    { action: 'createCollection', name: 'My Collection', captureAs: 'myCol' },
    { action: 'createWindow', captureAs: 'myWin' },
    { action: 'bindCollection', collectionId: 'myCol', windowId: 'myWin' },
    // Your custom steps...
  ]
}
```

Available actions:
- `createCollection` - Create a test collection
- `bindCollection` - Bind collection to window
- `closeWindow` - Close window (triggers event)
- `checkStorageFlag` - Verify event flag
- `checkCollectionState` - Verify collection state
- `wait` - Pause between steps
- `assert` - Custom assertions

See `/lib/test-mode/test-runner.js` lines 890-1010 for action implementations.
