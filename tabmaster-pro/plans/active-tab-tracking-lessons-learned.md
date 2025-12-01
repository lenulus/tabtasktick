# Active Tab Tracking - Lessons Learned

## Summary

Multiple implementation attempts for "Active Tab Tracking for Collection Restoration" failed due to architectural violations and Chrome API constraints. This document captures the failure chain to prevent repeating these mistakes.

---

## Feature Goal

When a user closes a collection window, remember which tab was active. When reopening that collection, restore focus to that tab.

---

## Failed Approaches

### Attempt 1: Capture Active Tab on Window Close

**Approach:** Listen to `windows.onRemoved`, query the active tab, store it.

**Why It Failed:**
- Chrome's `windows.onRemoved` fires AFTER the window and all its tabs are destroyed
- By the time the event fires, `chrome.tabs.query({ windowId, active: true })` returns empty
- There's no `windows.onBeforeRemoved` or similar pre-close event

**Root Cause:** Misunderstanding of Chrome event lifecycle.

---

### Attempt 2: Use tabs.onRemoved with isWindowClosing Flag

**Approach:** In `tabs.onRemoved`, check `removeInfo.isWindowClosing`. If true, this is the last tab - capture the active tab before it's removed.

**Why It Failed:**
- `tabs.onRemoved` fires for EACH tab being removed during window close
- When `isWindowClosing: true`, ALL tabs are already being removed concurrently
- No guarantee of ordering - the active tab might not be the last one processed
- By the time we see `isWindowClosing`, the tab is already gone from Chrome's API

**Root Cause:** Chrome removes all tabs simultaneously, not sequentially.

---

### Attempt 3: Track in ProgressiveSyncService Window Handler

**Approach:** Since `ProgressiveSyncService.handleWindowRemoved` already processes window closures, add active tab capture there.

**Why It Failed:**
- Same fundamental problem: `handleWindowRemoved` fires after tabs are gone
- ProgressiveSyncService intentionally DISCARDS pending changes on window close (to preserve collection state)
- Adding tab capture would contradict this design decision

**Root Cause:** Wrong place - ProgressiveSyncService is for sync, not for capturing closure state.

---

### Attempt 4: Real-time Tracking via tabs.onActivated in ProgressiveSyncService

**Approach:** Add `tabs.onActivated` listener in ProgressiveSyncService to continuously track the active tab.

**Why It Failed:**
- **Circular Dependency:** RestoreCollectionService needed to read `lastActiveTabUrl` from storage
- Importing ProgressiveSyncService into RestoreCollectionService caused:
  ```
  RestoreCollectionService → ProgressiveSyncService → WindowService → ... → RestoreCollectionService
  ```
- This circular import caused the entire module loading to fail
- **Result:** Tab creation broke completely - no tabs could be created

**Root Cause:** Violated service boundary architecture.

---

### Attempt 5: Shared In-Memory Cache

**Approach:** Create a shared `activeTabCache` Map in a utility module, write from `tabs.onActivated`, read from RestoreCollectionService.

**Why It Failed:**
- Service workers lose ALL in-memory state on restart
- Between window close and window restore, Chrome likely restarted the service worker
- The cache was empty when RestoreCollectionService tried to read

**Root Cause:** Ignored service worker lifecycle constraints.

---

### Attempt 6: Store in chrome.storage.local

**Approach:** Store `activeTabCache` in `chrome.storage.local` from `tabs.onActivated`.

**Why It Failed (partially):**
- Storage persistence worked, but...
- **Pollution during restore:** When RestoreCollectionService creates tabs, each new tab triggers `tabs.onActivated`
- The first tab created becomes active, overwriting the stored value
- By the time restore finishes, `lastActiveTabUrl` points to the first restored tab, not the original

**Root Cause:** Didn't account for programmatic tab activation during restore.

---

### Attempt 7: Suppress Tracking During Restore

**Approach:** Set a "restore in progress" flag, skip `tabs.onActivated` updates while flag is set.

**Why It Failed:**
- Flag was stored in memory - lost on service worker restart
- Flag stored in `chrome.storage.local` introduced race conditions
- Multiple restore operations happening concurrently created flag conflicts

**Root Cause:** Global mutable state + async operations = race conditions.

---

### Attempt 8: Two Competing windows.onRemoved Handlers

**Discovery:** During debugging, realized there are TWO `windows.onRemoved` handlers:
1. `background-integrated.js` (line 877) - handles unbinding
2. `ProgressiveSyncService.js` (line 444) - handles discarding changes

**Problem:**
- Adding a third handler created unpredictable ordering
- No guarantee which handler runs first
- The handlers have different purposes and different timing needs

**Root Cause:** Architecture didn't anticipate need for ordered window-close handling.

---

## Key Insights

### 1. Chrome Event Timing Is Not Negotiable

Chrome's event lifecycle is:
1. User closes window
2. ALL tabs are removed (tabs.onRemoved fires for each, possibly concurrently)
3. Window is removed (windows.onRemoved fires)

There is no "before close" event. Any state capture must happen BEFORE close is initiated.

### 2. Service Worker State Is Ephemeral

Anything stored in JavaScript memory (Maps, Sets, variables) will be lost when:
- Service worker goes idle (after ~30 seconds of inactivity)
- Service worker crashes
- Chrome restarts

Solution: Use IndexedDB or chrome.storage for anything that must persist.

### 3. Circular Dependencies Are Fatal

In ES modules, circular imports cause one module to see `undefined` exports from the other. This isn't a warning - it breaks functionality completely.

Service dependency graph must be acyclic:
```
UI → Orchestration Services → Execution Services → Selection Services → Storage
                                                                        ↓
                                                                    Chrome APIs
```

### 4. Event Handler Proliferation Creates Chaos

Multiple handlers for the same event without coordination leads to:
- Unpredictable ordering
- Race conditions
- Duplicate processing
- State inconsistencies

Solution: Single handler per event that dispatches to services.

### 5. Tab Creation Triggers Tab Events

When RestoreCollectionService creates tabs, it triggers:
- `tabs.onCreated` for each tab
- `tabs.onActivated` when a tab becomes active (including first created tab)
- `tabs.onUpdated` as tabs load

Any tracking logic must account for these programmatic events vs user events.

---

## What Finally Worked: Continuous URL Tracking in Collection Metadata

See `active-tab-tracking-plan-v2.md` for the successful approach:

1. **Track on every tab activation** - Store URL (not tab ID) in collection.metadata
2. **Store in IndexedDB** - Survives service worker restarts
3. **Use existing handler** - Modify `tabs.onActivated` in background-integrated.js
4. **Activate after restore completes** - Match URL to find tab, activate it
5. **No circular dependencies** - CollectionService doesn't import RestoreCollectionService
6. **Graceful degradation** - If URL not found, use Chrome's default (first tab)

---

## Checklist for Future Chrome Event Features

Before implementing any feature that relies on Chrome events:

- [ ] Check Chrome's event documentation for WHEN the event fires (before/during/after action)
- [ ] Verify what data is available at event time (tabs may be gone by windows.onRemoved)
- [ ] Identify ALL existing handlers for the same event
- [ ] Plan for service worker restarts - where will state be persisted?
- [ ] Consider whether programmatic actions will trigger the same events
- [ ] Draw the service dependency graph - check for cycles
- [ ] Identify race conditions with concurrent operations

---

## References

- Chrome tabs API: https://developer.chrome.com/docs/extensions/reference/tabs/
- Chrome windows API: https://developer.chrome.com/docs/extensions/reference/windows/
- Service worker lifecycle: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Project architecture: `/CLAUDE.md`
