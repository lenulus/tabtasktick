# Chrome Saved Tab Groups Limitation

## The Problem

When you restore a TabMaster Pro collection with folders (tab groups), Chrome may automatically save those groups to your bookmark bar. This causes accumulation of saved groups each time you open and close a collection.

**Example:**
1. You have a "CNN" collection with a "Slash" folder
2. You click "Open" → collection opens with "Slash" group
3. Chrome auto-saves "Slash" to bookmark bar
4. You close the window
5. You click "Open" again → new "Slash" group created
6. Chrome saves another "Slash" to bookmark bar
7. Result: Multiple "Slash" entries accumulating in bookmark bar

## Why This Happens

This is a **Chrome browser feature**, not a TabMaster Pro bug. Chrome has a setting:

**"Automatically pin new tab groups created on any device to the bookmarks bar"**

When TabMaster Pro restores a collection and creates tab groups (via `chrome.tabGroups.update()`), Chrome's auto-save feature treats them as saved groups and pins them to the bookmark bar if this setting is enabled.

## Why We Can't Fix It Programmatically

Chrome does not provide extension APIs to:

1. **Query saved tab groups** - We can't check if a group with that name already exists
2. **Detect if a group is "saved"** - No way to know if Chrome has saved a group
3. **Prevent auto-saving** - No API flag to say "don't save this group"
4. **Unsave groups** - Can't programmatically remove saved groups
5. **Intercept window closing** - `chrome.windows.onRemoved` fires AFTER the window is gone, too late to ungroup tabs

The Chrome Extension team has intentionally not exposed saved tab groups to extensions, likely because saved groups sync across devices and they don't want extensions modifying them without user knowledge.

### What We've Tried

**❌ Checking for existing groups before creating**
- No API to query saved groups that aren't currently open

**❌ Ungrouping tabs before window close**
- By the time `chrome.windows.onRemoved` fires, we can't access the window's tabs anymore

**❌ Passing a "don't save" flag**
- No such API parameter exists

**❌ Deleting saved groups programmatically**
- No API access to saved groups

## Available Solutions

### Solution 1: Disable Chrome's Auto-Save Setting (Recommended)

**Turn off automatic pinning:**

1. Open Chrome Settings
2. Go to **Appearance** section
3. Find: **"Automatically pin new tab groups created on any device to the bookmarks bar"**
4. Toggle it **OFF**

**Effect:**
- ✅ Stops accumulation of saved groups
- ✅ Groups still work normally in open windows
- ✅ You can still manually save groups if needed
- ✅ One-time setup, permanent solution

**Downside:**
- ❌ Disables auto-save for ALL tab groups (not just TabMaster Pro)

---

### Solution 2: Hide the Tab Groups Section

**Hide saved groups from bookmark bar:**

1. Right-click anywhere on the bookmarks bar
2. Uncheck **"Show Tab Groups"**

**Effect:**
- ✅ Saved groups are hidden (not visible in bookmark bar)
- ✅ Groups still accumulate, just not visible
- ✅ Quick visual fix

**Downside:**
- ❌ Doesn't actually stop accumulation
- ❌ Groups still sync across devices
- ❌ May impact performance with many saved groups

---

### Solution 3: Disable via Chrome Flags (Advanced)

**Disable the entire saved groups feature:**

1. Go to `chrome://flags`
2. Search for **"Tab Groups Save UI Update"**
3. Set to **Disabled**
4. Restart Chrome

**Effect:**
- ✅ Completely disables saved groups feature
- ✅ Stops all accumulation

**Downside:**
- ❌ Removes saved groups feature entirely (may break in future Chrome updates)
- ❌ Requires Chrome restart
- ❌ Experimental flag, may be removed by Chrome team

---

### Solution 4: Restore Without Groups (Future Option)

**Not yet implemented, but could be added:**

Restore collections with all tabs ungrouped by default, add a "Show Groups" button in the window to create groups on-demand.

**Effect:**
- ✅ No auto-saved groups (no groups created on restore)
- ✅ Faster restore times
- ✅ User controls when groups are visible

**Downside:**
- ❌ Loses visual grouping on initial restore
- ❌ Extra step to see folder organization
- ❌ Not yet implemented

---

## Recommendations

### For Most Users

**Use Solution 1** - Disable Chrome's auto-save setting. This is a one-time setup that permanently solves the problem without losing functionality.

### For Users Who Want Chrome's Feature

**Use Solution 2** - Hide the tab groups section from the bookmark bar. You'll still get Chrome's saved groups feature for non-TabMaster tabs.

### For Advanced Users

**Use Solution 3** - Disable via Chrome flags if you never want saved groups.

## How to Clean Up Existing Saved Groups

If you've already accumulated saved groups:

1. Right-click on a saved group in the bookmark bar
2. Select **"Delete group"** or **"Unpin group from bookmarks bar"**
3. Repeat for each duplicate

Or:

1. Show hidden saved groups by clicking the 4-square icon (if you've hidden them)
2. Right-click and delete/unpin unwanted groups

## Related Chrome Issues

This is a known issue in the extension developer community:

- **"No API access to saved tab groups"** - [Chromium Extensions Group](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/2RO1vp-8lqE)
- **"Can't detect if group is saved"** - Extensions have no way to know
- **"Saved groups can't be updated via API"** - Throws error if you try

The Chrome team is aware but has not provided API access to saved groups as of January 2025.

## FAQ

**Q: Why doesn't TabMaster Pro just prevent this?**
A: Chrome doesn't provide any API to prevent auto-saving. It's a global browser setting we can't override.

**Q: Can you detect existing saved groups and reuse them?**
A: No, Chrome doesn't expose saved groups to extensions. We can only see groups in currently open windows.

**Q: Why not ungroup tabs before closing the window?**
A: By the time we're notified the window closed (`chrome.windows.onRemoved`), the window is already gone and we can't access its tabs.

**Q: Could you add a "Close Collection" button that ungroups first?**
A: We could, but users would still close windows by clicking the X button. Can't force a specific close mechanism.

**Q: Does this affect collections without folders?**
A: No, only collections with folders (which become tab groups) are affected.

**Q: Will this be fixed in future Chrome versions?**
A: Unknown. Chrome would need to either:
  - Add API access to saved groups
  - Add a "don't save" flag to `chrome.tabGroups.update()`
  - Add a `beforeWindowClose` event where we could ungroup tabs

## Summary

This is a Chrome browser limitation, not a TabMaster Pro bug. The recommended solution is to **disable Chrome's "Automatically pin new tab groups" setting** in Chrome Settings → Appearance. This is a one-time configuration that permanently solves the problem while maintaining full collection functionality.
