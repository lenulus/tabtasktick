# Phase 8.3: Window Snooze UI Enhancement - Implementation Plan

**Date Created**: 2025-10-11
**Status**: Planning
**Prerequisites**: Phase 8.1 (WindowService), Phase 8.2 (DeduplicationOrchestrator)

## Overview

Complete the window snooze/restore user experience by integrating the existing SnoozeModal component into Dashboard and Popup with intelligent window detection. The context menu provides quick presets (1h, 3h, tomorrow), but Dashboard and Popup need access to the full range of custom durations and smart scheduling options.

**Key Principle**: Maximize window preservation - snooze complete windows as windows, individual tabs as tabs, with metadata to restore them to their original location when possible.

---

## Current State (Phase 8.1 Complete)

### What Works ✅
- `WindowService.snoozeWindow()` - Snoozes entire window with metadata
- `WindowService.restoreWindow()` - Restores snoozed window
- Context menu: "Snooze Window" with 3 presets (1h, 3h, tomorrow)
- Dashboard snoozed view: Shows snoozed windows with restore buttons
- SnoozeModal component: Sophisticated preset picker (6 presets + custom)

### What's Missing ❌
- Dashboard "Snooze" button doesn't use SnoozeModal (no custom durations)
- Dashboard doesn't detect when selection = entire window (snoozes as individual tabs)
- Popup has no "Snooze Window" functionality
- Individual snoozed tabs don't remember their source window
- No logic to restore individual tabs to their original window

---

## Problem Statement

**Context Menu Limitation**: Only 3 quick presets available

**User Need**: Access to full range of snooze options:
- Smart presets: Tomorrow 9 AM, After Lunch, End of Day, Next Week, Monday 9 AM, 1 Hour
- Custom date/time picker
- Precise control over wake time

**Current Dashboard Behavior**:
- User selects all tabs in a window → clicks "Snooze" → creates 10 individual snoozed tabs
- **Problem**: Loses window structure, creates clutter in snoozed view
- **Desired**: Detect complete window selection → snooze as single window

**Current Popup Behavior**:
- No way to snooze entire window
- **Desired**: "Snooze Window" button that opens SnoozeModal

---

## Smart Window Detection Algorithm

### Dashboard Snooze Button Logic

When user clicks "Snooze" on selected tabs:

```javascript
// 1. Group selected tabs by windowId
const tabsByWindow = groupBy(selectedTabs, 'windowId');

// 2. For each window, check if ALL tabs are selected
const operations = [];

for (const [windowId, tabs] of tabsByWindow.entries()) {
  const allTabsInWindow = await chrome.tabs.query({ windowId });

  if (tabs.length === allTabsInWindow.length) {
    // Complete window selected → snooze as window
    operations.push({
      type: 'window',
      windowId: windowId,
      tabs: tabs
    });
  } else {
    // Partial window selection → snooze as individual tabs
    operations.push({
      type: 'tabs',
      tabs: tabs,
      sourceWindowId: windowId  // Store for restoration
    });
  }
}

// 3. Show SnoozeModal with operation details
snoozeModal.show({
  operations: operations,
  // Title: "Snooze Window" | "Snooze 5 Tabs" | "Snooze Window + 3 Tabs"
});
```

### Example Scenarios

#### Scenario 1: Single Complete Window
**Selection**: All 10 tabs from Window 1
**Result**:
- Snooze as 1 window
- SnoozeModal title: "Snooze Window"
- Snoozed view: 1 window card with 10 tabs

#### Scenario 2: Partial Window
**Selection**: 5 of 10 tabs from Window 1
**Result**:
- Snooze as 5 individual tabs
- Store `sourceWindowId: 1` for each
- SnoozeModal title: "Snooze 5 Tabs"
- Snoozed view: 5 individual tab cards

#### Scenario 3: Multiple Complete Windows
**Selection**: All tabs from Window 1 (8 tabs) + all tabs from Window 2 (6 tabs)
**Result**:
- Snooze as 2 windows
- SnoozeModal title: "Snooze 2 Windows"
- Snoozed view: 2 window cards

#### Scenario 4: Mixed Selection (Critical Case)
**Selection**: All 8 tabs from Window 1 + 2 of 10 tabs from Window 2
**Result**:
- Snooze Window 1 as complete window (preserves structure)
- Snooze 2 individual tabs from Window 2 with `sourceWindowId: 2`
- SnoozeModal title: "Snooze Window + 2 Tabs"
- Snoozed view: 1 window card + 2 individual tab cards

#### Scenario 5: Cross-Window Partial Selection
**Selection**: 3 tabs from Window 1 + 2 tabs from Window 2 (neither complete)
**Result**:
- Snooze 5 individual tabs
- Store `sourceWindowId` for each (1, 1, 1, 2, 2)
- SnoozeModal title: "Snooze 5 Tabs"
- Snoozed view: 5 individual tab cards

---

## Window Restoration Logic

### Current Behavior (Phase 8.1)

**Snoozed Windows**:
- Stored with complete window metadata
- Restored via `WindowService.restoreWindow()` → creates new window with all tabs

**Individual Snoozed Tabs**:
- No window metadata stored
- Restored to "current window" or new window (not to original location)

### Enhanced Behavior (Phase 8.3)

**Individual Snoozed Tabs with Source Window**:

```javascript
async function restoreTabToSourceWindow(snoozedTab) {
  const { sourceWindowId, url, title } = snoozedTab;

  // 1. Check if source window still exists
  const windowExists = await chrome.windows.get(sourceWindowId)
    .then(() => true)
    .catch(() => false);

  if (windowExists) {
    // 2a. Source window exists → restore tab there
    const newTab = await chrome.tabs.create({
      windowId: sourceWindowId,
      url: url,
      active: false
    });

    return { success: true, windowId: sourceWindowId, tabId: newTab.id };
  } else {
    // 2b. Source window closed → restore to current window
    const currentWindow = await chrome.windows.getCurrent();
    const newTab = await chrome.tabs.create({
      windowId: currentWindow.id,
      url: url,
      active: false
    });

    return { success: true, windowId: currentWindow.id, tabId: newTab.id, fallback: true };
  }
}
```

**Fallback Strategy**:
1. Try to restore to `sourceWindowId` if it exists
2. If source window closed, restore to current window
3. If no current window, create new window

**User Experience**:
- User snoozes 3 tabs from Window 1
- User continues working in Window 1
- Tabs wake up → automatically return to Window 1 ✅
- User closed Window 1 → tabs restore to current window ✅

---

## Component Changes

### 1. SnoozeModal Enhancement

**File**: `/components/snooze-modal.js`

**Current Signature**:
```javascript
show(selectedTabs = [])
```

**New Signature**:
```javascript
show(options = {}) {
  const {
    type = 'tabs',           // 'tabs' | 'window' | 'windows' | 'mixed'
    selectedTabs = [],       // For type='tabs'
    windowId = null,         // For type='window'
    windowIds = [],          // For type='windows'
    operations = []          // For type='mixed'
  } = options;
}
```

**Title Logic**:
```javascript
function getTitle(options) {
  if (options.type === 'window') {
    return 'Snooze Window';
  } else if (options.type === 'windows') {
    return `Snooze ${options.windowIds.length} Windows`;
  } else if (options.type === 'mixed') {
    const windowCount = operations.filter(op => op.type === 'window').length;
    const tabCount = operations.filter(op => op.type === 'tabs')
      .reduce((sum, op) => sum + op.tabs.length, 0);

    if (windowCount > 0 && tabCount > 0) {
      return `Snooze ${windowCount} Window${windowCount > 1 ? 's' : ''} + ${tabCount} Tab${tabCount > 1 ? 's' : ''}`;
    } else if (windowCount > 0) {
      return `Snooze ${windowCount} Window${windowCount > 1 ? 's' : ''}`;
    } else {
      return `Snooze ${tabCount} Tab${tabCount > 1 ? 's' : ''}`;
    }
  } else {
    const count = options.selectedTabs.length || 1;
    return count === 1 ? 'Snooze Tab' : `Snooze ${count} Tabs`;
  }
}
```

**Callback Signature**:
```javascript
onSnooze(duration, options) {
  // duration: milliseconds until wake time
  // options: { type, selectedTabs, windowId, windowIds, operations }
}
```

### 2. Dashboard Integration

**File**: `/dashboard/dashboard.js`

**Current Snooze Button Handler**:
```javascript
// Simplified current behavior
async function handleSnooze() {
  const selectedTabs = getSelectedTabs();
  // TODO: Just sends message to snooze individual tabs
  await chrome.runtime.sendMessage({
    action: 'snoozeTabs',
    tabIds: selectedTabs.map(t => t.id),
    duration: '1h'  // Hardcoded - no modal!
  });
}
```

**New Snooze Button Handler**:
```javascript
async function handleSnooze() {
  const selectedTabs = getSelectedTabs();

  // 1. Detect operations (windows vs individual tabs)
  const operations = await detectSnoozeOperations(selectedTabs);

  // 2. Show SnoozeModal with detected operations
  const modal = new SnoozeModal();
  modal.show({
    type: operations.type,  // 'tabs' | 'window' | 'windows' | 'mixed'
    operations: operations.list
  });

  // 3. Handle snooze callback
  modal.onSnooze = async (duration) => {
    await executeSnoozeOperations(operations.list, duration);
    modal.hide();
    refreshDashboard();
  };
}

async function detectSnoozeOperations(selectedTabs) {
  const tabsByWindow = groupBy(selectedTabs, 'windowId');
  const operations = [];

  for (const [windowId, tabs] of Object.entries(tabsByWindow)) {
    const allTabsInWindow = await chrome.tabs.query({ windowId: parseInt(windowId) });

    if (tabs.length === allTabsInWindow.length) {
      // Complete window
      operations.push({ type: 'window', windowId: parseInt(windowId), tabs });
    } else {
      // Partial window - individual tabs
      operations.push({ type: 'tabs', tabs, sourceWindowId: parseInt(windowId) });
    }
  }

  // Determine overall type
  const hasWindows = operations.some(op => op.type === 'window');
  const hasTabs = operations.some(op => op.type === 'tabs');

  let type;
  if (hasWindows && hasTabs) {
    type = 'mixed';
  } else if (hasWindows) {
    type = operations.length === 1 ? 'window' : 'windows';
  } else {
    type = 'tabs';
  }

  return { type, list: operations };
}

async function executeSnoozeOperations(operations, duration) {
  for (const op of operations) {
    if (op.type === 'window') {
      // Snooze entire window
      await chrome.runtime.sendMessage({
        action: 'snoozeWindow',
        windowId: op.windowId,
        until: Date.now() + duration
      });
    } else {
      // Snooze individual tabs with source window metadata
      await chrome.runtime.sendMessage({
        action: 'snoozeTabs',
        tabIds: op.tabs.map(t => t.id),
        until: Date.now() + duration,
        sourceWindowId: op.sourceWindowId  // NEW: Store original window
      });
    }
  }
}
```

### 3. Popup Integration

**File**: `/popup/popup.js` and `/popup/popup.html`

**New Button in HTML**:
```html
<!-- Add after existing snooze button -->
<button id="snoozeWindowBtn" class="action-btn">
  <svg><!-- Window icon --></svg>
  Snooze Window
</button>
```

**New Handler in JS**:
```javascript
// Add event listener
document.getElementById('snoozeWindowBtn').addEventListener('click', handleSnoozeWindow);

async function handleSnoozeWindow() {
  const currentWindow = await chrome.windows.getCurrent();

  // Show SnoozeModal
  const modal = new SnoozeModal();
  modal.show({
    type: 'window',
    windowId: currentWindow.id
  });

  // Handle snooze callback
  modal.onSnooze = async (duration) => {
    await chrome.runtime.sendMessage({
      action: 'snoozeWindow',
      windowId: currentWindow.id,
      until: Date.now() + duration
    });

    modal.hide();
    window.close(); // Close popup after snoozing
  };
}
```

### 4. SnoozeService Enhancement

**File**: `/services/execution/SnoozeService.js`

**Current Individual Tab Snoozing**:
```javascript
async snoozeTab(tabId, until) {
  // Stores: { tabId, url, title, until, ... }
  // Missing: sourceWindowId
}
```

**Enhanced Individual Tab Snoozing**:
```javascript
async snoozeTab(tabId, until, options = {}) {
  const { sourceWindowId = null } = options;

  const tab = await chrome.tabs.get(tabId);

  const snoozedTab = {
    id: generateId(),
    tabId: tabId,
    url: tab.url,
    title: tab.title,
    favIconUrl: tab.favIconUrl,
    until: until,
    snoozedAt: Date.now(),
    sourceWindowId: sourceWindowId,  // NEW: Store for restoration
    // ... other metadata
  };

  this.snoozedTabs.set(snoozedTab.id, snoozedTab);
  await this.save();

  // Close the tab
  await chrome.tabs.remove(tabId);
}
```

**Enhanced Restoration**:
```javascript
async restoreTab(snoozedTabId) {
  const snoozedTab = this.snoozedTabs.get(snoozedTabId);
  if (!snoozedTab) return null;

  // 1. Get user's restoration preference
  const settings = await chrome.storage.local.get('settings');
  const restorationMode = settings?.settings?.snooze?.tabRestoration || 'original';

  let targetWindowId = null;
  let createdNewWindow = false;

  // 2. Determine target window based on user preference
  switch (restorationMode) {
    case 'original':
      // Try to restore to source window if it exists
      if (snoozedTab.sourceWindowId) {
        const windowExists = await chrome.windows.get(snoozedTab.sourceWindowId)
          .then(() => true)
          .catch(() => false);

        if (windowExists) {
          targetWindowId = snoozedTab.sourceWindowId;
          break;
        }
      }
      // Fall through to current if source doesn't exist

    case 'current':
      // Restore to currently focused window
      const currentWindow = await chrome.windows.getLastFocused();
      targetWindowId = currentWindow.id;
      break;

    case 'new':
      // Create a new window for this tab
      const newWindow = await chrome.windows.create({
        url: snoozedTab.url,
        focused: false
      });
      targetWindowId = newWindow.id;
      createdNewWindow = true;
      break;
  }

  // 3. Create tab in target window (unless we already created window)
  let newTab;
  if (!createdNewWindow) {
    newTab = await chrome.tabs.create({
      windowId: targetWindowId,
      url: snoozedTab.url,
      active: false
    });
  } else {
    // Window was created with the tab, get the tab
    const tabs = await chrome.tabs.query({ windowId: targetWindowId });
    newTab = tabs[0];
  }

  // 4. Cleanup
  this.snoozedTabs.delete(snoozedTabId);
  await this.save();

  return {
    tabId: newTab.id,
    windowId: targetWindowId,
    restoredToSource: targetWindowId === snoozedTab.sourceWindowId,
    restorationMode: restorationMode,
    createdNewWindow: createdNewWindow
  };
}
```

### 5. Background Message Handlers

**File**: `/background-integrated.js`

**Update snoozeTabs Handler**:
```javascript
case 'snoozeTabs':
  const { tabIds, until, sourceWindowId } = request;

  for (const tabId of tabIds) {
    await SnoozeService.snoozeTab(tabId, until, { sourceWindowId });
  }

  sendResponse({ success: true, count: tabIds.length });
  break;
```

**Existing snoozeWindow Handler** (already works from Phase 8.1):
```javascript
case 'snoozeWindow':
  const result = await WindowService.snoozeWindow(
    request.windowId,
    request.until
  );
  sendResponse(result);
  break;
```

---

## Testing Plan

### Unit Tests

**SnoozeService.test.js** - Add tests for `sourceWindowId`:
- [ ] Snooze tab with sourceWindowId stores metadata
- [ ] Restore to source window when it exists
- [ ] Fallback to current window when source closed
- [ ] Handle missing sourceWindowId (backward compatibility)

**WindowService.test.js** - Already has window snooze tests from Phase 8.1:
- [x] Snooze window stores all tabs and metadata
- [x] Restore window creates new window with all tabs

### Integration Tests (Manual)

**Dashboard Smart Detection**:
1. [ ] Select all tabs in Window 1 (10 tabs) → Click "Snooze" → Shows "Snooze Window"
2. [ ] Select 5 of 10 tabs in Window 1 → Click "Snooze" → Shows "Snooze 5 Tabs"
3. [ ] Select all tabs in Windows 1+2 → Click "Snooze" → Shows "Snooze 2 Windows"
4. [ ] Select all tabs in Window 1 + 2 tabs from Window 2 → Shows "Snooze Window + 2 Tabs"
5. [ ] Execute snooze → Verify correct operations (windows vs tabs)

**Dashboard Hierarchy View**:
1. [ ] Expand window in hierarchy → Select all tabs → Click "Snooze" → Detected as window
2. [ ] Use "Select All in Window" action → Click "Snooze" → Detected as window

**Popup Window Snooze**:
1. [ ] Click "Snooze Window" → SnoozeModal appears with correct title
2. [ ] Select preset → Window snoozed and popup closes
3. [ ] Verify snoozed window appears in dashboard snoozed view

**Source Window Restoration**:
1. [ ] Snooze 3 individual tabs from Window 1
2. [ ] Keep Window 1 open
3. [ ] Wait for tabs to wake (or manually restore)
4. [ ] Verify tabs restored to Window 1 ✅
5. [ ] Snooze 3 tabs from Window 2
6. [ ] Close Window 2
7. [ ] Restore tabs → Verify they go to current window (fallback) ✅

**SnoozeModal Presets**:
1. [ ] Verify all 6 presets work for tabs
2. [ ] Verify all 6 presets work for windows
3. [ ] Verify custom date/time picker works
4. [ ] Verify titles update correctly based on selection type

---

## Implementation Order

1. **Options Page - Settings UI** (30 min)
   - Add "Snooze Settings" section to options.html
   - Add tab restoration radio buttons
   - Add save/load logic for `settings.snooze.tabRestoration`
   - Set default to `'original'`
   - Test settings persistence

2. **SnoozeService Enhancement** (45 min)
   - Add `sourceWindowId` parameter to `snoozeTab()`
   - Update `restoreTab()` with user preference logic
   - Implement three restoration modes: original, current, new
   - Add unit tests for all three modes
   - Test backward compatibility (null sourceWindowId)

3. **SnoozeModal Enhancement** (45 min)
   - Update `show()` signature to accept options object
   - Add title generation logic for mixed operations
   - Update callback signature
   - Test with different operation types

4. **Dashboard Integration** (1.5 hours)
   - Implement `detectSnoozeOperations()` algorithm
   - Implement `executeSnoozeOperations()`
   - Update "Snooze" button handler
   - Test all 5 scenarios (especially scenario 4: mixed operations)

5. **Popup Integration** (30 min)
   - Add "Snooze Window" button to HTML
   - Add event handler
   - Load SnoozeModal component (add script tag)
   - Test window snoozing from popup

6. **Background Handlers** (15 min)
   - Update `snoozeTabs` to accept `sourceWindowId`
   - Verify `snoozeWindow` handler (already exists)

7. **Testing & Validation** (1 hour)
   - Run unit tests
   - Manual testing of all scenarios
   - Test all three restoration modes
   - Edge case testing (closed windows, multiple tabs)

**Total Estimated Time**: ~5 hours

---

## User Settings for Tab Restoration

### New Setting: Tab Restoration Behavior

**Location**: Options page under "Snooze" section

**Options**:
1. **"Restore to original window (if available)"** [default]
   - Individual snoozed tabs remember their `sourceWindowId`
   - On wake: Try to restore to source window
   - If source window closed: Fall back to current window
   - Best for users who want tabs to return "home"

2. **"Always restore to current window"**
   - Ignore `sourceWindowId` even if stored
   - Always restore to the currently focused window
   - Best for users who want tabs where they're working now

3. **"Always restore to new window"**
   - Create a new window for each restored tab
   - Useful for users who want isolated restoration
   - Best for users with strict window organization

**Storage Key**: `settings.snooze.tabRestoration`

**Default Value**: `'original'` (restore to original window if available)

**Settings UI**:
```html
<div class="setting-group">
  <h3>Snooze Settings</h3>

  <div class="setting-item">
    <label class="setting-label">Tab Restoration</label>
    <p class="setting-description">
      When individual tabs wake from snooze, where should they be restored?
    </p>

    <div class="radio-group">
      <label>
        <input type="radio" name="tabRestoration" value="original" checked>
        <span class="radio-label">Restore to original window (if available)</span>
        <span class="radio-hint">Tabs return to the window they came from</span>
      </label>

      <label>
        <input type="radio" name="tabRestoration" value="current">
        <span class="radio-label">Always restore to current window</span>
        <span class="radio-hint">Tabs open in your currently active window</span>
      </label>

      <label>
        <input type="radio" name="tabRestoration" value="new">
        <span class="radio-label">Always restore to new window</span>
        <span class="radio-hint">Each tab opens in its own new window</span>
      </label>
    </div>
  </div>
</div>
```

### Implementation Notes

**Default Behavior** (when setting not configured):
- Use `'original'` - matches user expectation that tabs return to where they came from
- Graceful degradation: If `sourceWindowId` is null (old snoozed tabs), fall back to current window

**Backward Compatibility**:
- Existing snoozed tabs without `sourceWindowId` will use current window fallback
- Setting applies to all future snooze operations

**User Education**:
- Tooltip in snoozed view: "Will restore to Window 1 (original window)" or "Will restore to current window" based on setting
- First-time snooze could show a brief explanation (optional)

---

## Open Questions

1. **SnoozeModal Component Loading**:
   - Popup currently doesn't include `snooze-modal.js` - need to add to `popup.html`
   - Check if CSS is also needed

2. **Dashboard Hierarchy View**:
   - Does hierarchy view have a "Select All in Window" action?
   - If not, should we add it?

3. **Current Window Detection**:
   - `chrome.windows.getCurrent()` returns the window the code is running in
   - For popup, this is the popup window (not useful)
   - Should use `chrome.windows.getLastFocused()` instead ✅

4. **Multiple Tab Restoration**:
   - If 5 tabs from Window 1 wake at same time:
     - Restore all 5 to Window 1 individually ✅ (simplest)
     - Respect user's restoration setting for each tab

---

## Success Criteria

- [ ] **Settings UI**: Tab restoration setting added to Options page
- [ ] **Settings UI**: Default is "Restore to original window (if available)"
- [ ] **Settings UI**: All three modes work correctly (original, current, new)
- [ ] **Dashboard**: "Snooze" button detects complete windows and snoozes them as windows
- [ ] **Dashboard**: "Snooze" button snoozes partial selections as individual tabs with sourceWindowId
- [ ] **Dashboard**: Mixed selections (scenario 4) snooze windows + individual tabs correctly
- [ ] **Popup**: "Snooze Window" button snoozes entire window with custom duration
- [ ] **Restoration**: Individual tabs restore according to user setting
- [ ] **Restoration**: 'original' mode restores to source window when it exists
- [ ] **Restoration**: 'original' mode falls back to current window when source closed
- [ ] **Restoration**: 'current' mode always restores to focused window
- [ ] **Restoration**: 'new' mode creates new window for each tab
- [ ] **SnoozeModal**: Shows correct titles for all operation types
- [ ] **SnoozeModal**: All 6 presets work for both tabs and windows
- [ ] **SnoozeModal**: Custom date/time picker works for both tabs and windows
- [ ] **SnoozeModal**: Loads correctly in both Dashboard and Popup
- [ ] **Backward Compatibility**: Old snoozed tabs without sourceWindowId restore correctly
- [ ] **Testing**: Zero regressions in existing snooze functionality
- [ ] **Testing**: All unit tests passing
- [ ] **Testing**: Manual validation of all test scenarios passing

---

## Future Enhancements (Out of Scope for Phase 8.3)

- [ ] "Restore to Source Window" manual action in snoozed view
- [ ] Group snoozed tabs by source window in snoozed view
- [ ] Keyboard shortcut for "Snooze Window"
- [ ] Snooze window via command palette
- [ ] Snooze multiple windows at once via multi-select
