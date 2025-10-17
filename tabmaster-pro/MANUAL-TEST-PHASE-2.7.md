# Phase 2.7 Manual Testing Guide

## Window Event Listener Integration - Live Extension Testing

This guide helps you validate that `chrome.windows.onRemoved` and `chrome.windows.onFocusChanged` event listeners work correctly in the production Chrome extension.

---

## Prerequisites

1. Load the extension in Chrome:
   ```bash
   # Navigate to chrome://extensions/
   # Enable "Developer mode"
   # Click "Load unpacked"
   # Select: /Users/anthonylaforge/dev/bmpro/tabmaster-pro
   ```

2. Open the service worker console:
   - Go to `chrome://extensions/`
   - Find "TabMaster Pro"
   - Click "service worker" link under "Inspect views"
   - This opens DevTools for the background service worker

---

## Test 1: Window Close Event (`chrome.windows.onRemoved`)

### Setup

1. **Create a test collection**:
   - Open extension popup or dashboard
   - Create a new collection called "Test Window Close"
   - Note the collection ID (check IndexedDB or console)

2. **Bind collection to a window**:
   ```javascript
   // In service worker console:
   const WindowService = await import('./services/execution/WindowService.js');

   // Create a new window
   const window = await chrome.windows.create({
     url: 'https://example.com',
     focused: false
   });

   console.log('Created window:', window.id);

   // Bind collection to window
   await WindowService.bindCollectionToWindow('test-collection-id', window.id);
   console.log('Collection bound to window');
   ```

### Execute Test

1. **Close the window** (click the X or use Alt+F4)

2. **Check service worker console** for Phase 2.7 logs:
   ```
   [Phase 2.7] chrome.windows.onRemoved fired for window <ID>
   [Phase 2.7] Found X total collections
   [Phase 2.7] Found Y active collections
   [Phase 2.7] Bound collection for window <ID>: test-collection-id
   [Phase 2.7] Window <ID> closing, unbinding collection test-collection-id
   [Phase 2.7] Collection test-collection-id unbound from closed window <ID>
   ```

3. **Verify in storage**:
   ```javascript
   // In service worker console:
   const eventData = await chrome.storage.local.get('lastWindowRemovedEvent');
   console.log('Last window close event:', eventData.lastWindowRemovedEvent);
   // Should show: { windowId: <ID>, timestamp: <recent timestamp> }
   ```

4. **Verify collection unbound**:
   ```javascript
   // In service worker console:
   const { selectCollections } = await import('./services/selection/selectCollections.js');
   const collections = await selectCollections({ id: 'test-collection-id' });
   console.log('Collection after unbind:', collections[0]);

   // Should show:
   // - isActive: false
   // - windowId: null
   ```

### ✅ Success Criteria

- Service worker console shows all Phase 2.7 log messages
- `lastWindowRemovedEvent` contains correct windowId
- Collection's `isActive` is `false`
- Collection's `windowId` is `null`

---

## Test 2: Window Focus Event (`chrome.windows.onFocusChanged`)

### Setup

1. **Create and bind a collection** (same as Test 1):
   ```javascript
   // In service worker console:
   const WindowService = await import('./services/execution/WindowService.js');

   const window = await chrome.windows.create({
     url: 'https://example.com',
     focused: false
   });

   await WindowService.bindCollectionToWindow('test-collection-id', window.id);
   ```

2. **Note current timestamp**:
   ```javascript
   const beforeFocus = Date.now();
   console.log('Before focus:', beforeFocus);
   ```

### Execute Test

1. **Focus the window** (click on it or Alt+Tab to it):
   ```javascript
   // Or programmatically:
   await chrome.windows.update(window.id, { focused: true });
   ```

2. **Wait 1 second** for event to process

3. **Check collection's lastAccessed timestamp**:
   ```javascript
   const { selectCollections } = await import('./services/selection/selectCollections.js');
   const collections = await selectCollections({ id: 'test-collection-id' });
   const collection = collections[0];

   console.log('Before focus:', beforeFocus);
   console.log('After focus:', collection.metadata.lastAccessed);
   console.log('Updated:', collection.metadata.lastAccessed > beforeFocus);
   ```

### ✅ Success Criteria

- Collection's `lastAccessed` timestamp is greater than `beforeFocus`
- Timestamp is recent (within last few seconds)

---

## Test 3: Orphaned Collection Cleanup (`rebuildCollectionCache`)

### Setup

1. **Create a collection bound to non-existent window**:
   ```javascript
   // In service worker console:
   const { saveCollection } = await import('./services/utils/storage-queries.js');

   await saveCollection({
     id: 'orphaned-collection',
     name: 'Orphaned Collection',
     isActive: true,
     windowId: 999999, // Non-existent window
     tags: [],
     metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
   });

   console.log('Created orphaned collection');
   ```

### Execute Test

1. **Rebuild cache**:
   ```javascript
   const WindowService = await import('./services/execution/WindowService.js');
   await WindowService.rebuildCollectionCache();
   console.log('Cache rebuilt');
   ```

2. **Check console for orphaned collection warning**:
   ```
   Detected orphaned collection orphaned-collection bound to non-existent window 999999
   Unbinding 1 orphaned collections: ["orphaned-collection"]
   Orphaned collections cleaned up
   ```

3. **Verify collection was unbound**:
   ```javascript
   const { selectCollections } = await import('./services/selection/selectCollections.js');
   const collections = await selectCollections({ id: 'orphaned-collection' });
   console.log('Orphaned collection:', collections[0]);

   // Should show:
   // - isActive: false
   // - windowId: null
   ```

### ✅ Success Criteria

- Console shows "Detected orphaned collection" warning
- Console shows "Unbinding N orphaned collections"
- Collection's `isActive` is `false`
- Collection's `windowId` is `null`

---

## Test 4: Service Worker Wake-Up Test

This validates that events wake up a dormant service worker.

### Setup

1. **Bind a collection to a window** (same as Test 1)

2. **Wait for service worker to go dormant**:
   - Wait 30 seconds with no extension activity
   - The service worker indicator in `chrome://extensions/` should show "inactive"
   - Or manually stop it: Go to `chrome://serviceworker-internals/` and click "Stop"

### Execute Test

1. **Close the window** (click X)

2. **Check if service worker wakes up**:
   - Go to `chrome://extensions/`
   - Service worker should show "active" again
   - Or click "service worker" to open console

3. **Verify event fired**:
   ```javascript
   // In service worker console (after it wakes):
   const eventData = await chrome.storage.local.get('lastWindowRemovedEvent');
   console.log('Event data:', eventData.lastWindowRemovedEvent);

   // Should show recent timestamp (within last few seconds)
   ```

### ✅ Success Criteria

- Service worker transitions from "inactive" to "active" when window closes
- `lastWindowRemovedEvent` shows recent timestamp
- Collection is unbound (verify with selectCollections)

---

## Debugging Tips

### If events don't fire:

1. **Check event listener registration**:
   ```javascript
   // In service worker console:
   console.log('Listeners registered:', chrome.windows.onRemoved.hasListeners());
   ```

2. **Check service worker is running**:
   - Go to `chrome://extensions/`
   - Look for "service worker (active)" under TabMaster Pro
   - If inactive, click "service worker" to wake it

3. **Check for errors**:
   - Open service worker console
   - Look for red error messages
   - Check if imports failed

### If collection doesn't unbind:

1. **Verify collection exists and is bound**:
   ```javascript
   const { selectCollections } = await import('./services/selection/selectCollections.js');
   const all = await selectCollections({});
   console.log('All collections:', all);
   ```

2. **Check IndexedDB directly**:
   - Open DevTools → Application → IndexedDB
   - Find "TabTaskTickDB" → "collections"
   - Inspect collection record

3. **Enable debug logging**:
   - Check `state.settings.debugMode` in service worker console
   - Set to `true` if needed

---

## Expected Behavior Summary

| Event | Wakes Service Worker? | Updates Collection? | Storage Flag Set? |
|-------|----------------------|---------------------|------------------|
| `windows.onRemoved` | ✅ Yes | ✅ Yes (unbinds) | ✅ Yes (`lastWindowRemovedEvent`) |
| `windows.onFocusChanged` | ✅ Yes | ✅ Yes (lastAccessed) | ❌ No |
| Cache rebuild | N/A (manual call) | ✅ Yes (unbinds orphaned) | ❌ No |

---

## Cleanup

After testing, remove test collections:

```javascript
const { deleteCollection } = await import('./services/utils/storage-queries.js');
await deleteCollection('test-collection-id');
await deleteCollection('orphaned-collection');
console.log('Test collections deleted');
```

Remove diagnostic storage:

```javascript
await chrome.storage.local.remove('lastWindowRemovedEvent');
console.log('Diagnostic data cleared');
```
