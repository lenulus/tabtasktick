# Active Tab Tracking - Lessons Learned

## Summary

Multiple attempts to implement "restore previously active tab" failed due to compounding complexity in Chrome extension event handling, service worker lifecycle, and circular dependencies.

## What We Tried

Track which tab was active when a collection window closes, save it to IndexedDB, and restore focus to that tab when the collection is reopened.

## Failure Chain

### Issue 1: Event Ordering
**Problem**: `tabs.onRemoved` fires for each tab BEFORE `windows.onRemoved` fires. Our code deleted `tabTimeData` entries in `tabs.onRemoved`, so by the time `windows.onRemoved` ran, the data was gone.

**Attempted Fix**: Check `isWindowClosing` flag in `tabs.onRemoved` to skip deletion.

### Issue 2: Multiple Event Handlers
**Problem**: Two `windows.onRemoved` handlers exist:
- `ProgressiveSyncService` (module-level, fires reliably)
- `background-integrated.js` (may not fire if SW restarts)

ProgressiveSyncService unbinds the collection BEFORE background-integrated.js runs, so the active tab tracking code in background-integrated.js found no bound collection.

**Attempted Fix**: Move tracking logic to ProgressiveSyncService since it's the authoritative handler.

### Issue 3: Race Condition on Save
**Problem**: Saving `activeTabStorageId` before calling `unbindCollectionFromWindow`, but unbind internally reads/writes the collection, potentially overwriting our saved value.

**Attempted Fix**: Reorder operations - lookup tab first, unbind, THEN save activeTabStorageId after unbind completes.

### Issue 4: Programmatic Activation Triggers Events
**Problem**: During restore, calling `chrome.tabs.update(tabId, { active: true })` triggers `tabs.onActivated`. This overwrote `activeTabCache` with the restore-activated tab. If user closes without clicking other tabs, we save the wrong value (feedback loop).

**Attempted Fix**: Add `windowsBeingRestored` Set, mark window during restore, skip `tabs.onActivated` for marked windows.

### Issue 5: Circular Dependency (Fatal)
**Problem**: Importing ProgressiveSyncService into RestoreCollectionService to call `markWindowAsRestoring()` likely caused a circular dependency or initialization issue. Result: **tabs weren't created at all during restore** - only an empty window with "New Tab".

**No fix attempted** - reverted all changes at this point.

## Root Causes

1. **Chrome event ordering is implicit and complex** - No documentation guarantees the order of `tabs.onRemoved` vs `windows.onRemoved`, or that handlers fire in registration order.

2. **Multiple handlers for same event** - Having handlers in both ProgressiveSyncService and background-integrated.js creates coordination problems.

3. **Service worker lifecycle** - State must survive SW restarts. In-memory caches (`tabTimeData`, `activeTabCache`) are wiped, requiring IndexedDB persistence and careful seeding.

4. **Programmatic vs user actions are indistinguishable** - Chrome fires the same events whether user clicks a tab or code calls `chrome.tabs.update()`.

5. **Service dependency graph is fragile** - Adding imports between services can cause circular dependencies that fail silently.

## Complexity Assessment

This feature requires coordinating:
- In-memory caches (wiped on SW restart)
- IndexedDB persistence (async, can have race conditions)
- Multiple Chrome event handlers (fire in specific but undocumented order)
- Distinguishing programmatic vs user-initiated actions
- Two different codepaths (background-integrated.js and ProgressiveSyncService)

Each layer of complexity multiplied the failure modes.

## Alternative Approaches to Consider

### Option A: Capture-Only (Simplest)
Only save active tab when collection is first captured. Don't try to track changes. Accept that restored tab may not be the last one user was viewing.

**Pros**: Simple, no event coordination needed
**Cons**: Less useful - only preserves initial state

### Option B: Full Sync Integration
Make `activeTabStorageId` part of ProgressiveSyncService's normal sync flow. When `tabs.onActivated` fires for a tracked collection, queue an update to the collection's metadata.

**Pros**: Uses existing debounced sync infrastructure
**Cons**: Still needs to handle programmatic activation during restore

### Option C: Store at Collection Close Only
In `handleWindowRemoved` (ProgressiveSyncService), query `chrome.tabs.query({ windowId, active: true })` to get the active tab directly from Chrome, rather than maintaining a cache.

**Pros**: No cache to maintain, no race conditions with cache updates
**Cons**: Tab is already being removed when `windows.onRemoved` fires - may not be queryable

### Option D: Defer to User
Don't implement automatic restore. Instead, show "Last active: [tab title]" in the collection UI and let user click to focus it manually after restore.

**Pros**: No complex event coordination
**Cons**: Extra user action required

## Recommendations

1. **Don't mix ProgressiveSyncService imports into other execution services** - Keep the dependency graph simple.

2. **If attempting again, use Option B or C** - Work within ProgressiveSyncService's existing patterns rather than adding cross-service coordination.

3. **Add integration tests** - Unit tests passed but couldn't catch the circular dependency issue. E2E tests that actually restore collections would have caught this.

4. **Consider if the feature is worth the complexity** - The restore flow already works. Focusing the "wrong" tab is a minor UX issue compared to the risk of breaking restore entirely.
