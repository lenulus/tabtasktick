# Testing Progressive Sync URL Tracking

## Setup

1. **Reload the extension** to get the updated logging:
   - Go to `chrome://extensions`
   - Click the reload icon for TabMaster Pro

2. **Open the debug page**:
   - Navigate to `chrome-extension://[your-extension-id]/debug-sync.html`
   - Or open it from the extension's folder

## Test Procedure

### Step 1: Verify Service Initialization

1. Click "Check If Initialized"
2. Verify you see: `{ "success": true, "initialized": true }`

### Step 2: Create or Check Active Collection

1. Open a new window
2. Create a collection from this window (or use an existing active collection)
3. In debug-sync.html, click "List Active Collections"
4. Verify your collection appears with:
   - `isActive: true`
   - `trackingEnabled: true`
   - A valid `windowId`

### Step 3: Check Service Worker Console (IMPORTANT!)

Before testing URL changes, we need to check if `trackCollection` was called when you created the collection:

1. **Open service worker console**:
   - Go to `chrome://extensions`
   - Find TabMaster Pro
   - Click "service worker" link (opens console)

2. **Create a NEW collection**:
   - Go back to the dashboard
   - Clear the console (in service worker)
   - Create a collection from a window

3. **Look for these logs in the service worker console**:
   ```
   [background] captureWindow requested: {...}
   [background] captureWindow complete - result: {...}
   [background] ✓ Collection is active, calling trackCollection for [id]
   [background] ✓ trackCollection completed successfully
   ```

4. **If you see "✗ NOT tracking collection"**: This is the bug! The collection has `isActive: false` or `windowId: null`

### Step 4: Test URL Change

1. In `debug-sync.html`, click "Clear Logs"
2. In your collection's window, navigate to a new URL in an existing tab
   - For example, if you have a tab open to `example.com`, navigate it to `google.com`
3. **Wait 5 seconds** (default debounce is 2 seconds)
4. Click "Fetch Logs"

### Step 5: Analyze Logs

Look for these log entries in order:

1. **Event Fired**:
   ```
   Tab updated event fired: [tabId]
   ```
   - With `changeInfo` showing the new URL
   - If missing: Chrome event listener isn't firing

2. **Tracking Check** (this is critical!):
   ```
   shouldTrack([collectionId]): true
   ```
   - With `trackingEnabled: true` and valid `windowId`
   - **If you see "No settings in cache"**: This is the bug! The collection wasn't added to the cache.
   - **If you see `trackingEnabled: false`**: Edit collection settings to enable tracking

3. **Change Queued**:
   ```
   Queueing TAB_UPDATED for tab [tabId]
   ```
   - With `changeInfo` showing the new URL

4. **Change Added**:
   ```
   Added change to queue for [collectionId]
   ```

5. **Flush Scheduled**:
   ```
   Scheduling flush for [collectionId] in 2000ms
   ```

6. **Flush Executed** (after 2 seconds):
   ```
   Flush timer fired for [collectionId]
   Flushing X changes for collection [collectionId]
   ```

7. **Processing Update**:
   ```
   Processing tab update for tab [tabId]
   Found existing tab in IndexedDB
   Updated tab [tabId] in collection [collectionId]
   ```
   - With old URL → new URL transition

## Common Issues

### Issue 1: "No settings in cache"

This is the critical bug! You'll see:
```
shouldTrack([collectionId]): No settings in cache
```

**Cause**: `trackCollection()` was never called, or it failed silently

**How to verify**:
1. Clear logs and reload the extension
2. Create a NEW collection from a window
3. Immediately click "Fetch Logs"
4. Look for these entries:
   ```
   trackCollection called for [collectionId]
   refreshSettings called for collection [collectionId]
   Collection found: {...}
   Settings cache updated for [collectionId]: {...}
   Now tracking collection [collectionId]
   ```

**If you DON'T see these logs**: The bug is in the captureWindow message handler - it's not calling `trackCollection()`

**If you DO see these logs but still get "No settings in cache"**: There's a timing issue or the collection ID is mismatched

### Issue 2: "No collection found for window"
**Cause**: Window isn't mapped to an active collection
**Fix**: Ensure you created a collection from this window and it's marked as active

### Issue 3: `trackingEnabled: false`
**Cause**: Collection has tracking disabled in settings
**Fix**:
- Click "Check Collection" and enter your collection ID
- Verify `trackingEnabled: true` in settings
- If false, edit collection settings to enable tracking

### Issue 4: "Tab [tabId] not found in IndexedDB, cannot update"
**Cause**: Tab wasn't captured when collection was created
**Fix**:
- Tab might have been opened after collection creation
- Try closing and reopening the tab (will trigger TAB_CREATED)
- Or recapture the window

### Issue 5: Logs show update but changes don't persist
**Cause**: Update might not be saving correctly
**Fix**: Check browser console for IndexedDB errors

## Verification

After the test, verify the URL was updated:

1. Open the side panel
2. Navigate to your collection
3. Find the tab you changed
4. Verify the URL shows the new value

## Copy Logs

If the issue persists, click "Copy Logs to Clipboard" and share them for analysis.
