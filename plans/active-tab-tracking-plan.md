# Active Tab Tracking for Collection Restoration

## Overview

Preserve which tab was active when a collection window closes, so it can be restored to the correct focus state.

## Solution

**Multi-trigger approach:** Update `activeTabStorageId` at key moments in the collection lifecycle.

1. **On collection capture** - Record Chrome's active tab when the collection is first created. This is the initial state before any changes occur.

2. **On tab add/remove** - When tabs are added to or removed from a bound collection, update based on most recently accessed tab from `tabTimeData`. Persists to IndexedDB, surviving browser crashes.

3. **On `windows.onRemoved`** - Final capture before unbinding. Ensures we have the latest active tab.

The tab add/remove and window close triggers are in `background-integrated.js`, so extract to a **local function** within that file. The capture logic lives in `CaptureWindowService.js`.

**Note:** We do NOT update on every tab switch - only on collection membership changes and window events. This minimizes IndexedDB writes.

---

## Implementation

### Step 1: Update Collection Metadata Model

Add `activeTabStorageId` field to collection metadata.

**File:** `services/execution/CollectionService.js` (or wherever metadata is defined)

```javascript
metadata: {
  createdAt,
  lastAccessed,
  tabCount,
  folderCount,
  activeTabStorageId: null  // NEW: Tab storage ID of last active tab
}
```

### Step 2: Local Function for Active Tab Capture

**File:** `background-integrated.js` - add a local utility function

```javascript
/**
 * Update the activeTabStorageId for a collection based on the most recently accessed tab.
 * Called on tab activation and window close.
 */
async function updateCollectionActiveTab(collectionId) {
  const collectionData = await getCompleteCollection(collectionId);
  if (!collectionData) return;

  // Collect all tabs (from folders + ungrouped)
  const allTabs = [];
  for (const folder of collectionData.folders || []) {
    if (folder.tabs) allTabs.push(...folder.tabs);
  }
  if (collectionData.ungroupedTabs) {
    allTabs.push(...collectionData.ungroupedTabs);
  }

  // Find tab with most recent access
  let mostRecentTab = null;
  let maxAccessed = 0;

  for (const tab of allTabs) {
    if (!tab.tabId) continue;
    const timeData = tabTimeData.get(tab.tabId);
    if (timeData?.lastAccessed > maxAccessed) {
      maxAccessed = timeData.lastAccessed;
      mostRecentTab = tab;
    }
  }

  if (mostRecentTab) {
    await CollectionService.updateCollection(collectionId, {
      metadata: {
        ...collectionData.metadata,
        activeTabStorageId: mostRecentTab.id
      }
    });
  }
}
```

### Step 3: Call on Tab Add/Remove

**File:** `background-integrated.js` - where tabs are added to or removed from collections

```javascript
// After adding or removing a tab from a collection...
await updateCollectionActiveTab(collectionId);
```

This triggers on collection membership changes, not every tab switch.

### Step 4: Call on Window Close

**File:** `background-integrated.js` - in `chrome.windows.onRemoved` handler

```javascript
// Before unbinding collection...
if (boundCollection) {
  await updateCollectionActiveTab(boundCollection.id);
  // Then unbind...
}
```

### Step 5: Set Active Tab on Collection Capture

**File:** `services/execution/CaptureWindowService.js`

When a user captures a window as a new collection, we need to record which tab was active at that moment. This is the initial state - before any tab add/remove events occur.

**Why this matters:**
- User captures a window while viewing a specific tab
- If they close and restore immediately, they expect to return to that same tab
- Without this, the first tab would be activated instead

```javascript
// In captureWindow(), after creating tab entities:
const activeChromeTab = capturableTabs.find(t => t.active);
if (activeChromeTab) {
  // Match Chrome tab to our created tab entity by URL and position
  const activeTabEntity = tabs.find(t =>
    t.url === activeChromeTab.url && t.position === activeChromeTab.index
  );
  if (activeTabEntity) {
    collection.metadata.activeTabStorageId = activeTabEntity.id;
  }
}
```

**Note:** We match by URL + position (not just URL) because the same URL could appear multiple times in the window.

### Step 6: Restore Active Tab on Collection Restore

**File:** `services/execution/RestoreCollectionService.js`

```javascript
// After all tabs are created and we have the mapping of storageId -> chromeTabId
const activeStorageId = collection.metadata?.activeTabStorageId;
if (activeStorageId) {
  const chromeTabId = tabIdMapping.get(activeStorageId);
  if (chromeTabId) {
    await chrome.tabs.update(chromeTabId, { active: true });
  }
}
```

---

## Why This Works

1. **`tabTimeData` is reliable** - Seeded from Chrome's native `lastAccessed` on init, updated on tab activation. Survives service worker restarts with accurate historical data.
2. **Dual-trigger resilience** - Updating on tab add/remove and window close means data is persisted to IndexedDB, surviving browser crashes and system restarts.
3. **We know all tabs in the collection** - They're stored in IndexedDB with their Chrome `tabId`
4. **Minimal overhead** - Only writes on collection membership changes, not every tab switch

---

## Edge Cases

| Case | Handling |
|------|----------|
| No `tabTimeData` entry | Skip that tab (shouldn't happen - all tabs are seeded on init) |
| All tabs missing from `tabTimeData` | Don't set `activeTabStorageId` (restore will use default first tab) |
| `activeTabStorageId` tab deleted before restore | Activate first tab as fallback |

---

## Implementation Considerations

### Code Corrections Needed

The pseudocode in Step 2 references functions that don't exist:

| Referenced | Actual Approach |
|------------|-----------------|
| `getCollectionByWindowId(windowId)` | Use existing pattern: `selectCollections({})` then filter by `windowId` and `isActive` |
| `TabService.getTabsByCollection(collection.id)` | Use `getCompleteCollection(collectionId)` which returns folders + ungrouped tabs |

### Architecture Decision: Local Function

The logic is called from two places (tab add/remove handlers and `windows.onRemoved`), both in `background-integrated.js`. Per CLAUDE.md:

> "If two places have similar logic, it MUST move to `/services/*` and both call it"

Since both callers are in the same file, a **local function** (`updateCollectionActiveTab`) is appropriate - not a separate service file.

### `tabTimeData` Initialization (RESOLVED)

**Fixed in commit 1a4532d** - `tabTimeData` now seeds from Chrome's native `tab.lastAccessed` on service worker init:

```javascript
tabs.forEach(tab => {
  tabTimeData.set(tab.id, {
    created: now - (5 * 60 * 1000),
    lastActive: tab.active ? now : (tab.lastAccessed || now - (10 * 60 * 1000)),
    lastAccessed: tab.lastAccessed || now - (10 * 60 * 1000)  // Chrome's value with fallback
  });
});
```

**Result:** `tabTimeData` has accurate historical data immediately after service worker restart. The 10-minute fallback only applies if Chrome's value is null/undefined (rare).

### Restore Logic Notes

- Use the in-memory `tabIdMapping` from `createWindowWithTabsAndGroups` result
- Do NOT re-query IndexedDB for tab IDs
- Wrap activation in try/catch - this is non-fatal if it fails

---

## Estimated Effort

| Task | Time |
|------|------|
| Add metadata field | 15 min |
| Create `updateCollectionActiveTab` function | 20 min |
| Add call in tab add/remove handlers | 15 min |
| Add call in `windows.onRemoved` | 10 min |
| Set active tab on collection capture | 15 min |
| Restore activation logic | 20 min |
| Testing | 40 min |
| **Total** | **~2.25 hours** |

---

## Files to Modify

1. `background-integrated.js`
   - Add `updateCollectionActiveTab()` local function
   - Call from tab add/remove handlers (collection membership changes)
   - Call from `windows.onRemoved` handler
2. `services/execution/CaptureWindowService.js` - Set `activeTabStorageId` on collection capture
3. `services/execution/RestoreCollectionService.js` - Activate stored tab on restore
4. `services/execution/CollectionService.js` - Add `activeTabStorageId` to metadata (if schema enforcement exists)

---

## Documentation Reference

When implementing, add a comment referencing this design doc:

```javascript
/**
 * Update the activeTabStorageId for a collection.
 * See: /plans/active-tab-tracking-plan.md
 */
```

This helps future developers/agents understand the design decisions (dual-trigger approach, local function vs service, etc.).
