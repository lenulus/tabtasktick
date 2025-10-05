# Chrome Extension API Lessons Learned

## Tab Groups API

### Critical Limitation: Groups Cannot Cross Windows

**Problem**: Chrome's tab groups are window-specific. When you move a tab to a different window, Chrome automatically ungroups it.

**Impact**: Moving grouped tabs between windows loses the grouping metadata (title, color).

**Solution**: Manually preserve and re-create groups after moving tabs:

```javascript
// 1. Capture group metadata BEFORE moving
const originalGroupId = tab.groupId;
let groupTitle = null;
let groupColor = null;

if (originalGroupId && originalGroupId !== -1) {
  const group = await chrome.tabGroups.get(originalGroupId);
  groupTitle = group.title;
  groupColor = group.color;
}

// 2. Move the tab (this will ungroup it)
await chrome.tabs.move(tab.id, {
  windowId: targetWindowId,
  index: -1
});

// 3. Re-create the group in the new window
if (groupTitle) {
  const newGroupId = await chrome.tabs.group({
    tabIds: [tab.id]
  });
  await chrome.tabGroups.update(newGroupId, {
    title: groupTitle,
    color: groupColor
  });
}
```

**Files Affected**:
- `lib/engine.v1.legacy.js:477-561`
- `lib/engine.v2.services.js:313-390`
- `lib/commands/ActionManager.js:323-437`

---

## Window Focus Manipulation

### Critical Limitation: Group Creation Happens in Focused Window

**Problem**: When you call `chrome.tabs.group()`, Chrome creates the group in the **currently focused window**, NOT in the window where the tabs actually are.

**Example of Broken Behavior**:
```javascript
// User is on Window A (dashboard)
// Tab is in Window B

// This will create the group in Window A (wrong!)
const groupId = await chrome.tabs.group({ tabIds: [tabInWindowB.id] });
```

**Impact**: Groups get created in the wrong window, breaking window isolation and causing confusing behavior.

**Solution**: Always focus the target window before creating groups, then restore focus:

```javascript
// 1. Store the original focused window
const currentWindow = await chrome.windows.getCurrent();
const originalFocusedWindowId = currentWindow.id;

// 2. Focus the target window where the tabs actually are
await chrome.windows.update(targetWindowId, { focused: true });

// 3. Create the group (now it will be in the correct window)
const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
await chrome.tabGroups.update(groupId, {
  title: 'My Group',
  color: 'blue'
});

// 4. CRITICAL: Restore focus to the original window
await chrome.windows.update(originalFocusedWindowId, { focused: true });
```

**Why Focus Restoration Matters**:
- User experience: Don't surprise users by switching windows
- Dashboard workflows: Keep focus on dashboard while managing tabs in other windows
- Automation: Allows background operations without disrupting user's current context

**Pattern Summary**:
```
Store original focus → Focus target → Perform operation → Restore focus
```

**Files Affected**:
- `services/execution/groupTabs.js:196-271` (group creation)
- `lib/engine.v1.legacy.js:477-561` (move with regroup)
- `lib/engine.v2.services.js:313-390` (move with regroup)
- `lib/commands/ActionManager.js:323-437` (move with regroup)

---

## Best Practices

### 1. Window Isolation Pattern

When performing operations on tabs in different windows:

```javascript
async function operateOnTabsInWindow(tabIds, targetWindowId) {
  // Store original context
  const originalWindow = await chrome.windows.getCurrent();

  try {
    // Focus target window if different
    if (originalWindow.id !== targetWindowId) {
      await chrome.windows.update(targetWindowId, { focused: true });
    }

    // Perform operations
    await chrome.tabs.group({ tabIds });

  } finally {
    // Always restore focus, even if operation fails
    if (originalWindow.id !== targetWindowId) {
      await chrome.windows.update(originalWindow.id, { focused: true });
    }
  }
}
```

### 2. Batch Operations with Multiple Windows

When operating on tabs across multiple windows:

```javascript
async function groupTabsAcrossWindows(tabsByWindow) {
  const originalWindow = await chrome.windows.getCurrent();

  for (const [windowId, tabs] of tabsByWindow.entries()) {
    // Focus each window sequentially
    await chrome.windows.update(windowId, { focused: true });

    // Create groups
    const groupId = await chrome.tabs.group({
      tabIds: tabs.map(t => t.id)
    });
    await chrome.tabGroups.update(groupId, { title: 'Group' });
  }

  // Restore original focus after all operations
  await chrome.windows.update(originalWindow.id, { focused: true });
}
```

### 3. Group Preservation Pattern

When moving multiple tabs from different groups:

```javascript
async function moveAndPreserveGroups(tabIds, targetWindowId) {
  // 1. Build group map BEFORE moving
  const groupMap = new Map(); // groupId -> { title, color, tabIds }

  for (const tabId of tabIds) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.groupId && tab.groupId !== -1) {
      if (!groupMap.has(tab.groupId)) {
        const group = await chrome.tabGroups.get(tab.groupId);
        groupMap.set(tab.groupId, {
          title: group.title,
          color: group.color,
          tabIds: []
        });
      }
      groupMap.get(tab.groupId).tabIds.push(tabId);
    }
  }

  // 2. Move tabs (this ungroups them)
  await chrome.tabs.move(tabIds, {
    windowId: targetWindowId,
    index: -1
  });

  // 3. Re-create groups in target window
  const originalWindow = await chrome.windows.getCurrent();

  if (groupMap.size > 0) {
    await chrome.windows.update(targetWindowId, { focused: true });

    for (const [oldGroupId, groupInfo] of groupMap.entries()) {
      const newGroupId = await chrome.tabs.group({
        tabIds: groupInfo.tabIds
      });
      await chrome.tabGroups.update(newGroupId, {
        title: groupInfo.title,
        color: groupInfo.color
      });
    }

    await chrome.windows.update(originalWindow.id, { focused: true });
  }
}
```

---

## Common Pitfalls

### ❌ Don't: Assume `createProperties.windowId` works

```javascript
// This parameter is ignored by Chrome!
const groupId = await chrome.tabs.group({
  tabIds: [tab.id],
  createProperties: { windowId: targetWindowId } // IGNORED!
});
```

### ✅ Do: Focus the window instead

```javascript
await chrome.windows.update(targetWindowId, { focused: true });
const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
```

---

### ❌ Don't: Forget to restore focus

```javascript
async function createGroup(tabIds, windowId) {
  await chrome.windows.update(windowId, { focused: true });
  await chrome.tabs.group({ tabIds });
  // User is now stuck on the wrong window!
}
```

### ✅ Do: Always restore original focus

```javascript
async function createGroup(tabIds, windowId) {
  const originalWindow = await chrome.windows.getCurrent();
  await chrome.windows.update(windowId, { focused: true });
  await chrome.tabs.group({ tabIds });
  await chrome.windows.update(originalWindow.id, { focused: true });
}
```

---

### ❌ Don't: Skip group preservation on moves

```javascript
// Moving tabs loses grouping!
await chrome.tabs.move(groupedTabIds, { windowId: newWindow.id });
// Tabs are now ungrouped
```

### ✅ Do: Capture and restore group metadata

```javascript
// Capture groups before moving
const groups = await captureGroupInfo(tabIds);

// Move tabs
await chrome.tabs.move(tabIds, { windowId: newWindow.id });

// Restore groups
await restoreGroups(groups, newWindow.id);
```

---

## Performance Considerations

### Focus Switching Has User-Visible Impact

- Each `chrome.windows.update({ focused: true })` causes a visible window switch
- Minimize focus switches by batching operations per window
- Consider showing a notification: "Creating groups..." to explain the flashing

### Optimization: Batch by Window

```javascript
// Bad: Switches focus for each tab
for (const tab of tabs) {
  await chrome.windows.update(tab.windowId, { focused: true });
  await chrome.tabs.group({ tabIds: [tab.id] });
  await chrome.windows.update(originalWindow.id, { focused: true });
}

// Good: Batch by window, switch once per window
const tabsByWindow = groupBy(tabs, t => t.windowId);

for (const [windowId, windowTabs] of tabsByWindow) {
  await chrome.windows.update(windowId, { focused: true });

  // Create all groups in this window
  for (const group of groupsInWindow) {
    await chrome.tabs.group({ tabIds: group.tabIds });
  }

  await chrome.windows.update(originalWindow.id, { focused: true });
}
```

---

## Testing Checklist

When implementing tab group features, always test:

- ✅ Creating groups in the same window as the UI
- ✅ Creating groups in a different window than the UI
- ✅ Moving individual grouped tabs between windows
- ✅ Moving entire groups between windows
- ✅ Moving tabs from multiple different groups to one window
- ✅ Focus returns to original window after operation
- ✅ Group metadata (title, color) is preserved
- ✅ Works with multiple windows (3+) open

---

## References

- Chrome Tabs API: https://developer.chrome.com/docs/extensions/reference/api/tabs
- Chrome TabGroups API: https://developer.chrome.com/docs/extensions/reference/api/tabGroups
- Chrome Windows API: https://developer.chrome.com/docs/extensions/reference/api/windows

---

## Related Issues

- Phase 1.8: Eliminate Duplicate Implementations (TODO.md:133-223)
- Phase 1.9: Missing Engine Actions (TODO.md:355-379)

**Last Updated**: 2025-10-05
