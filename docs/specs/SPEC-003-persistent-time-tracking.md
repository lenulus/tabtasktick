# SPEC-003: Persistent Tab Time Tracking

## Problem
Chrome's tabs API doesn't provide time-based metadata (created, lastActive, lastAccessed). Our current implementation tracks this in memory but loses data on extension restart.

## Current Implementation
- Uses `tabTimeData` Map to store timestamps
- Tracks: created, lastActive, lastAccessed
- Updates on tab events (create, activate, update)
- Makes assumptions for pre-existing tabs

## Proposed Enhancement: Persistent Storage

### 1. Store Time Data in chrome.storage.local

```javascript
// Save time data periodically
async function saveTabTimeData() {
  const dataToSave = {};
  tabTimeData.forEach((timeData, tabId) => {
    dataToSave[tabId] = timeData;
  });
  
  await chrome.storage.local.set({ tabTimeData: dataToSave });
}

// Save every 5 minutes
setInterval(saveTabTimeData, 5 * 60 * 1000);

// Also save on significant events
chrome.tabs.onRemoved.addListener(async (tabId) => {
  tabTimeData.delete(tabId);
  await saveTabTimeData();
});
```

### 2. Restore on Startup

```javascript
async function initializeTabTimeTracking() {
  // Load saved data first
  const { tabTimeData: saved } = await chrome.storage.local.get('tabTimeData');
  
  // Get current tabs
  const tabs = await chrome.tabs.query({});
  const now = Date.now();
  
  tabs.forEach(tab => {
    if (saved && saved[tab.id]) {
      // Use saved data, update lastActive if currently active
      tabTimeData.set(tab.id, {
        ...saved[tab.id],
        lastActive: tab.active ? now : saved[tab.id].lastActive
      });
    } else {
      // New tab or no saved data
      tabTimeData.set(tab.id, {
        created: now - (5 * 60 * 1000),
        lastActive: tab.active ? now : now - (10 * 60 * 1000),
        lastAccessed: now - (10 * 60 * 1000)
      });
    }
  });
  
  // Clean up data for tabs that no longer exist
  const currentTabIds = new Set(tabs.map(t => t.id));
  for (const [tabId] of tabTimeData) {
    if (!currentTabIds.has(tabId)) {
      tabTimeData.delete(tabId);
    }
  }
  
  await saveTabTimeData();
}
```

### 3. Storage Optimization

To prevent storage bloat:
- Limit to last 1000 tabs
- Remove data for tabs closed > 30 days ago
- Compress timestamps (store as offsets from a base time)

### 4. Migration Path

1. Check for in-memory only data
2. Save to storage if not already saved
3. Mark as migrated

## Benefits

1. **Persistence** - Time tracking survives extension restarts
2. **Accuracy** - Real creation times instead of guesses
3. **History** - Can track tabs even after they're closed (for analytics)

## Considerations

1. **Storage Limits** - chrome.storage.local has limits (5MB)
2. **Performance** - Need efficient save/load strategies
3. **Privacy** - Users may want to clear this data

## Implementation Priority

Medium - Current in-memory solution works but has limitations. Persistence would improve accuracy and enable better long-term rules.