# Progressive Sync URL Tracking Fix

## Summary

Fixed three critical bugs in Progressive Sync that prevented proper tab tracking:

1. **URL changes lost**: Multiple rapid updates replaced each other in queue
2. **RestoreCollectionService**: Didn't return collection object, breaking tracking
3. **Window close deletes tabs**: Flushing queue on window close deleted tabs instead of preserving them

## The Problem

When a tab's URL changed, Chrome fires multiple `chrome.tabs.onUpdated` events in rapid succession:

1. **Event 1**: `{ url: "https://cnn.com" }`
2. **Event 2**: `{ title: "CNN - Breaking News" }`
3. **Event 3**: `{ favIconUrl: "https://cnn.com/favicon.ico" }`

The old code **replaced** queued changes entirely:

```javascript
if (existingIndex >= 0) {
  queue[existingIndex] = change; // ❌ Replaces entire change
}
```

This meant:
- Event 1 added URL to queue
- Event 2 **replaced** Event 1 (URL lost!)
- Event 3 **replaced** Event 2 (title lost!)
- Final result: Only favIconUrl was saved, URL and title were lost

## The Fix

Changed `queueChange()` to **merge** `TAB_UPDATED` changeInfo objects instead of replacing them:

```javascript
if (change.type === ChangeType.TAB_UPDATED) {
  queue[existingIndex] = {
    ...change,
    data: {
      ...change.data,
      changeInfo: {
        ...existing.data.changeInfo, // ✅ Preserve previous changes
        ...change.data.changeInfo    // ✅ Apply new changes
      }
    }
  };
}
```

Now:
- Event 1 adds: `{ url: "https://cnn.com" }`
- Event 2 merges: `{ url: "https://cnn.com", title: "CNN..." }`
- Event 3 merges: `{ url: "https://cnn.com", title: "CNN...", favIconUrl: "..." }`
- Final result: All fields preserved ✅

## Bug #3: Window Close Deletes All Tabs

### The Problem

When you closed a collection's window, all tabs were deleted from the collection instead of being preserved.

**Root cause**: The `handleWindowRemoved()` function was **flushing** the pending change queue, which processed any tab removals that occurred right before the window closed (even legitimate user actions within the debounce window).

### The Fix

Changed `handleWindowRemoved()` to **discard** the pending queue instead of flushing it:

```javascript
// OLD - Flush pending changes (WRONG!)
await flush(collectionId);

// NEW - Discard pending changes (CORRECT!)
state.changeQueue.delete(collectionId);
state.flushTimers.delete(collectionId);
```

**Why this is correct**:
- Closing a window = "save collection with last stable state"
- Pending changes (within debounce window) are ephemeral
- The collection should preserve its state from the last flush (2 seconds ago)
- This prevents tab deletions during window close from being synced

### Example Scenario

**Before the fix**:
1. User has collection with 3 tabs
2. User closes 1 tab
3. 1 second later, user closes the window (before flush timer)
4. ❌ All 3 tabs deleted from collection (tab removal + window close both processed)

**After the fix**:
1. User has collection with 3 tabs
2. User closes 1 tab
3. 1 second later, user closes the window (before flush timer)
4. ✅ Collection still has 3 tabs (pending removal was discarded)

## Files Changed

### `/services/execution/ProgressiveSyncService.js`

**queueChange() - Line 653-683**:
- Added special handling for `TAB_UPDATED` changes
- Merges changeInfo objects instead of replacing
- Preserves url, title, favicon, and other fields across multiple updates

**processTabUpdated() - Line 946-951**:
- Enhanced logging to show which fields are present in changeInfo
- Helps diagnose future merge issues

**handleWindowRemoved() - Line 600-638**:
- Changed from flushing to discarding pending changes on window close
- Clears change queue and cancels flush timer
- Preserves collection's last stable state instead of processing ephemeral changes
- Prevents tab deletions during window close from being synced

**Enhanced logging throughout**:
- `trackCollection()`: Logs when called
- `refreshSettings()`: Shows collection details and cache updates
- `loadSettingsCache()`: Lists all active collections
- `shouldTrack()`: Shows cache state and missing settings
- All event handlers use consistent logging format

### `/background-integrated.js`

**captureWindow handler - Line 2001-2042**:
- Added detailed logging before/after collection creation
- Shows whether `trackCollection()` is called
- Logs collection state (isActive, windowId, settings)
- Helps diagnose when collections aren't being tracked

### Other Changes

**Removed obsolete `autoSync` setting**:
- Cleaned up from `loadSettingsCache()` defaults
- Cleaned up from `refreshSettings()` defaults
- Now only uses `trackingEnabled` for tracking decisions

**Note**: Existing collections in IndexedDB may still have `autoSync: true` in their settings. This is harmless (we ignore it), but it's database cruft from the previous implementation.

## Testing

1. **Reload the extension** (chrome://extensions → reload TabMaster Pro)

2. **Test URL change**:
   - Open the collection's window
   - Navigate a tab to a new URL
   - Wait 5 seconds
   - Check the side panel - URL should be updated ✅

3. **Check logs** (debug-sync.html):
   ```
   Tab updated event fired: [tabId] { url: "https://cnn.com" }
   Merged TAB_UPDATED change in queue
     mergedChangeInfo: { url: "https://cnn.com", title: "...", favIconUrl: "..." }

   Flush timer fired
   Processing tab update
     hasUrl: true ✅
     hasTitle: true ✅
     hasFavIcon: true ✅

   Updated tab [tabId]
     oldUrl: "chrome://newtab/"
     newUrl: "https://cnn.com/" ✅
   ```

## Related Issues

- **Issue**: Settings cache was empty on collection creation
  - **Cause**: `trackCollection()` wasn't being called OR was failing silently
  - **Status**: Needs verification - check service worker console when creating collections
  - **Logs to look for**: `[background] ✓ Collection is active, calling trackCollection`

## Performance Impact

Negligible. We're now spreading two small objects during merge instead of replacing one. The operation is still O(1) and happens only when multiple updates occur within the debounce window (2 seconds).

## Backward Compatibility

- ✅ Existing collections continue to work
- ✅ Old `autoSync` setting in database is ignored (harmless)
- ✅ No database migration needed
