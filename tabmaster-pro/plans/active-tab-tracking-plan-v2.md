# Active Tab Tracking for Collection Restoration - Plan v2

## Feature Summary

When a user closes a collection window, remember which tab was active. When reopening that collection, restore focus to that same tab (by URL match, since Chrome tab IDs are ephemeral).

## Lessons Learned from Failed Attempts

The previous implementation attempts failed due to several architectural violations:

### 1. Circular Dependency (Fatal)
Importing `ProgressiveSyncService` into `RestoreCollectionService` caused a circular dependency chain that broke tab creation entirely. This violates the project's service boundaries.

### 2. Competing Event Handlers
Two `windows.onRemoved` handlers exist:
- `background-integrated.js` (line 877) - for diagnostics and immediate response
- `ProgressiveSyncService.js` (line 444) - for reliability during service worker restarts

Adding a third handler in RestoreCollectionService created race conditions.

### 3. Chrome Event Ordering
`tabs.onRemoved` fires for each tab BEFORE `windows.onRemoved` fires for the window. By the time `windows.onRemoved` fires, all tabs are already gone from Chrome's API - we cannot query which tab was active.

### 4. Programmatic Tab Activation Pollution
During collection restore, `createWindowWithTabsAndGroups` creates tabs sequentially. Each tab creation may trigger `tabs.onActivated`, potentially overwriting the cached "last active tab" value before the restore completes.

### 5. Service Worker Restart State Loss
Any in-memory cache (`Map`, local variable) is lost when the service worker restarts. The implementation must persist state to storage.

---

## Recommended Approach: Collection Metadata Storage

### Core Insight

The simplest solution that respects service boundaries:
1. **Track active tab in `tabs.onActivated`** - store in collection metadata
2. **Store by URL, not tab ID** - URLs persist across sessions; Chrome tab IDs don't
3. **Use existing collection metadata** - no new storage keys or services
4. **Activate matching tab during restore** - simple URL lookup after restore completes

### Why This Works

1. **No circular dependencies** - only uses existing imports
2. **No new event handlers** - uses existing `tabs.onActivated` handler in `background-integrated.js`
3. **No race conditions** - active tab is tracked continuously, not captured at close time
4. **Survives service worker restarts** - stored in IndexedDB via collection metadata
5. **Simple restoration** - just find tab by URL and activate it

---

## Implementation Plan

### Phase 1: Add Active Tab URL to Collection Metadata

**File: `/services/execution/CollectionService.js`**

Add a new method to update the active tab URL:

```javascript
/**
 * Updates the last active tab URL for a collection.
 * Called from tabs.onActivated handler.
 *
 * @param {string} collectionId - Collection ID
 * @param {string} url - URL of the active tab
 * @returns {Promise<void>}
 */
export async function updateActiveTabUrl(collectionId, url) {
  const existing = await getCollection(collectionId);
  if (!existing) {
    console.warn(`updateActiveTabUrl: Collection ${collectionId} not found`);
    return;
  }

  // Skip system URLs (chrome://, chrome-extension://, etc.)
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
    return;
  }

  const updated = {
    ...existing,
    metadata: {
      ...existing.metadata,
      lastActiveTabUrl: url,
      lastAccessed: Date.now()
    }
  };

  await saveCollection(updated);
}
```

**Rationale:**
- Uses existing `saveCollection` from storage-queries
- No new dependencies
- Stores in `metadata.lastActiveTabUrl` which follows existing pattern
- Filters out system URLs that shouldn't be restored

### Phase 2: Update tabs.onActivated Handler

**File: `/background-integrated.js`**

Modify the existing `tabs.onActivated` handler (line 852):

```javascript
chrome.tabs.onActivated.addListener(safeAsyncListener(async (activeInfo) => {
  // Existing time tracking logic
  const timeData = tabTimeData.get(activeInfo.tabId);
  if (timeData) {
    timeData.lastActive = Date.now();
  }

  // NEW: Track active tab URL for collection restoration
  try {
    // Check if this tab belongs to a tracked collection
    const collection = await WindowService.getCollectionForWindow(activeInfo.windowId);
    if (collection && collection.isActive) {
      // Get tab URL
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab && tab.url) {
        await CollectionService.updateActiveTabUrl(collection.id, tab.url);
      }
    }
  } catch (error) {
    // Tab may have been removed or window closed - ignore silently
    if (!error.message?.includes('No tab with id') &&
        !error.message?.includes('No window with id')) {
      console.error('[Active Tab Tracking] Error:', error);
    }
  }
}));
```

**Rationale:**
- Uses existing `WindowService.getCollectionForWindow()` - already imported
- Uses existing `CollectionService` - already imported
- Wraps in try-catch for graceful degradation
- Silent handling for expected "tab not found" errors during window close

### Phase 3: Activate Tab During Restore

**File: `/services/execution/RestoreCollectionService.js`**

Add activation logic after restore completes:

```javascript
export async function restoreCollection(options) {
  // ... existing restoration logic (lines 137-299) ...

  // NEW: After successful restore, activate the last active tab
  const lastActiveTabUrl = updatedCollection.metadata?.lastActiveTabUrl;
  if (lastActiveTabUrl && result.windowId) {
    try {
      // Find tab in new window that matches the URL
      const tabs = await chrome.tabs.query({ windowId: result.windowId });
      const matchingTab = tabs.find(tab => tab.url === lastActiveTabUrl);

      if (matchingTab) {
        await chrome.tabs.update(matchingTab.id, { active: true });
        console.log(`[RestoreCollection] Activated tab: ${lastActiveTabUrl}`);
      }
    } catch (error) {
      // Non-fatal - just log and continue
      console.warn('[RestoreCollection] Failed to activate last active tab:', error);
    }
  }

  return {
    collection: updatedCollection,
    collectionId,
    windowId: result.windowId,
    tabs: restoredTabs,
    stats: {
      tabsRestored: result.stats.tabsCreated,
      tabsSkipped: result.stats.tabsSkipped,
      groupsRestored: result.stats.groupsCreated,
      warnings: result.stats.warnings
    }
  };
}
```

**Rationale:**
- No new imports needed (chrome.tabs is globally available)
- Runs AFTER all tabs are created - no pollution from sequential tab creation
- Uses exact URL matching - simple and reliable
- Graceful failure - if tab not found, restore still succeeds
- Logs for debugging but doesn't throw

---

## Alternative Approaches Considered

### Option A: Track in ProgressiveSyncService (Rejected)

**Why rejected:**
- ProgressiveSyncService already handles many tab events
- Adding active tab tracking would increase its responsibility
- Risk of circular dependency if RestoreCollectionService needs to read from it
- ProgressiveSyncService flushes changes with debounce - might lose recent activation

### Option B: Separate Storage Key (Rejected)

**Why rejected:**
- Creates another storage location to manage
- Must coordinate cleanup with collection deletion
- Collection metadata already exists and is the natural place

### Option C: Track Tab ID Instead of URL (Rejected)

**Why rejected:**
- Chrome tab IDs are ephemeral - destroyed when window closes
- Would require mapping from old tab ID to new tab ID
- More complex and error-prone than URL matching

### Option D: Use tabs.onRemoved to Capture Active Tab (Rejected)

**Why rejected:**
- By the time we know a window is closing (via isWindowClosing), the active tab may already be removed
- Chrome doesn't guarantee ordering of tab removal events
- Race condition between multiple tabs.onRemoved events

---

## Edge Cases and Handling

| Edge Case | Handling |
|-----------|----------|
| Active tab URL was a system URL (chrome://) | Filter out in updateActiveTabUrl |
| Collection restored but URL no longer exists | Tab not found - graceful fallback to Chrome's default (first tab) |
| Multiple tabs with same URL | First match activated - acceptable behavior |
| Service worker restart during restore | metadata.lastActiveTabUrl persisted in IndexedDB |
| User manually activates different tab before close | Most recent activation tracked - expected behavior |
| Collection has no prior active tab recorded | No activation attempted - Chrome's default behavior |
| Window has been moved/resized | Handled by existing window creation - orthogonal concern |

---

## Testing Strategy

### Unit Tests

**File: `/tests/CollectionService.test.js`**

```javascript
describe('updateActiveTabUrl', () => {
  it('should store URL in collection metadata', async () => {
    const collection = await CollectionService.createCollection({ name: 'Test' });
    await CollectionService.updateActiveTabUrl(collection.id, 'https://example.com');

    const updated = await getCollection(collection.id);
    expect(updated.metadata.lastActiveTabUrl).toBe('https://example.com');
  });

  it('should skip system URLs', async () => {
    const collection = await CollectionService.createCollection({ name: 'Test' });
    await CollectionService.updateActiveTabUrl(collection.id, 'chrome://extensions');

    const updated = await getCollection(collection.id);
    expect(updated.metadata.lastActiveTabUrl).toBeUndefined();
  });

  it('should handle non-existent collection gracefully', async () => {
    // Should not throw
    await CollectionService.updateActiveTabUrl('col_invalid', 'https://example.com');
  });
});
```

### E2E Tests

**File: `/tests/e2e/active-tab-restoration.spec.js`**

```javascript
test('restores last active tab when reopening collection', async ({ context, page }) => {
  // 1. Create collection with multiple tabs
  // 2. Activate a specific tab (not the first one)
  // 3. Close the window
  // 4. Restore the collection
  // 5. Verify the same tab is now active
});

test('handles missing tab gracefully', async ({ context, page }) => {
  // 1. Create collection, activate a tab, close window
  // 2. Manually modify collection to have a URL that won't exist
  // 3. Restore collection
  // 4. Verify restore succeeds (first tab active by default)
});
```

---

## Implementation Checklist

- [ ] Add `updateActiveTabUrl` method to CollectionService
- [ ] Update `tabs.onActivated` handler in background-integrated.js
- [ ] Add tab activation logic to RestoreCollectionService.restoreCollection
- [ ] Add unit tests for updateActiveTabUrl
- [ ] Add E2E tests for full restoration flow
- [ ] Test with service worker restart mid-flow
- [ ] Test with 50+ tabs to verify no performance regression
- [ ] Update CLAUDE.md if any new patterns established

---

## Estimated Effort

| Task | Estimate |
|------|----------|
| CollectionService.updateActiveTabUrl | 30 min |
| Update tabs.onActivated handler | 30 min |
| RestoreCollectionService activation | 30 min |
| Unit tests | 1 hour |
| E2E tests | 1 hour |
| Integration testing | 1 hour |
| **Total** | **4-5 hours** |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Performance impact from frequent saves | Low | Low | Only saves on tab activation, debounced by user behavior |
| URL matching fails for dynamic URLs | Medium | Low | Graceful fallback to Chrome default |
| Existing tests break | Low | Medium | Changes are additive, not modifying existing behavior |
| Storage quota issues | Very Low | Low | Only stores one URL string per collection |

---

## Conclusion

This approach is architecturally sound because it:

1. **Respects service boundaries** - Each service does one thing
2. **Uses existing infrastructure** - collection metadata, existing event handler
3. **Has no circular dependencies** - CollectionService has no knowledge of RestoreCollectionService
4. **Is deterministic** - Same URL always matches same tab
5. **Fails gracefully** - Non-fatal errors don't break restore
6. **Survives restarts** - Persisted in IndexedDB

The simplicity of storing `lastActiveTabUrl` in collection metadata, tracking it on every tab activation, and matching it during restore avoids all the complexity that caused previous attempts to fail.
