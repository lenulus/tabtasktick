# Export/Import Implementation Context for TabMaster Pro

## Starting Fresh - Implementation Phase

### Current Situation
We have a Chrome extension (TabMaster Pro) with broken export functionality and no import capability. Export currently returns `{"error": "Unknown action"}` because it's not implemented in `background-integrated.js` (only exists in old `background.js`).

### What Needs to Be Done

#### IMMEDIATE TASK: Fix Export in background-integrated.js
1. Export handler is missing from the message listener
2. Need to implement `exportData` function with:
   - Window scoping (current window vs all windows)
   - Multiple format support (JSON, CSV, Markdown)
   - Human-readable fields

#### The Plan (from `/plans/EXPORT-IMPORT-IMPLEMENTATION.md`)

**Export Formats to Implement:**

1. **JSON Format** (Default)
   - Full backup/restore capability
   - Includes: tabs, groups, rules, snoozed tabs, settings
   - Human-readable with redundant fields (IDs + names)
   - Readable timestamps ("1 hour ago" + ISO)
   - Can be manually edited

2. **CSV Format**
   - Active tabs only (NO snoozed tabs)
   - For spreadsheet analysis
   - Columns: Window, Group, Position, Title, URL, Domain, Pinned, Active, Created, Last Accessed

3. **Markdown Format**
   - Documentation export
   - Includes everything in readable format
   - Cannot be reimported

**Export Scope Options:**
- Current Window (just active window's tabs)
- All Windows (entire session)

**Export UI Needed:**
Modal with:
- Scope selector (Current Window: X tabs / All Windows: Y tabs)
- Format selector (JSON/CSV/Markdown)
- Include options (rules, snoozed, settings, bookmarks)

### File Structure Context

**Key Files:**
- `/background-integrated.js` - Active service worker (NEEDS export implementation)
- `/background.js` - Old file with export code to reference
- `/popup/popup.js` - Has export button handler at line 901
- `/popup/popup.html` - Has export button in footer

**Message Flow:**
1. User clicks Export button in popup
2. `popup.js` sends `{ action: 'exportData', options: {...} }`
3. `background-integrated.js` should handle this (currently doesn't)
4. Returns data to popup
5. Popup triggers download

### Code to Add to background-integrated.js

```javascript
// In message listener switch statement:
case 'exportData':
  return await exportData(request.options);

// New function to implement:
async function exportData(options = {}) {
  const {
    scope = 'all-windows', // or 'current-window'
    format = 'json', // or 'csv' or 'markdown'
    includeRules = true,
    includeSnoozed = true,
    includeSettings = true,
    currentWindowId = null
  } = options;

  // Get tabs based on scope
  const query = scope === 'current-window' && currentWindowId
    ? { windowId: currentWindowId }
    : {};

  const tabs = await chrome.tabs.query(query);
  const windows = await chrome.windows.getAll();
  const groups = await chrome.tabGroups.query(query);

  // Build export based on format
  switch (format) {
    case 'json':
      return buildJSONExport(tabs, windows, groups, options);
    case 'csv':
      return buildCSVExport(tabs, groups);
    case 'markdown':
      return buildMarkdownExport(tabs, windows, groups, options);
  }
}
```

### Implementation Priorities

**Phase 1 - Make Export Work (TODAY)**
1. [ ] Add exportData handler to background-integrated.js
2. [ ] Copy/adapt code from old background.js
3. [ ] Test basic JSON export works
4. [ ] Add scope support (current vs all windows)

**Phase 2 - Add Export UI (THIS WEEK)**
1. [ ] Create export options modal
2. [ ] Add format selector
3. [ ] Add scope selector with tab counts
4. [ ] Show what will be exported

**Phase 3 - Multiple Formats (THIS WEEK)**
1. [ ] Implement CSV builder
2. [ ] Implement Markdown builder
3. [ ] Add human-readable timestamps
4. [ ] Add redundant fields for clarity

**Phase 4 - Import UI (NEXT WEEK)**
1. [ ] Add Import button to popup
2. [ ] Create import modal with drag & drop
3. [ ] Add validation and preview
4. [ ] Support three import strategies:
   - New Window(s) - default, safest
   - Current Window - append to current
   - Replace All - full restoration

**Phase 5 - Import Logic (NEXT WEEK)**
1. [ ] Implement importData in background-integrated.js
2. [ ] Add validation and sanitization
3. [ ] Handle merge vs replace
4. [ ] Batch large imports

### Test Cases to Verify

1. Export current window with <50 tabs
2. Export all windows with 200+ tabs
3. Export as CSV and open in Excel
4. Export as Markdown and verify readable
5. Export JSON and manually edit, then reimport
6. Round-trip test (export → import → export should match)

### Success Criteria

- [ ] Export button downloads a file (not error JSON)
- [ ] User can choose scope (window vs all)
- [ ] User can choose format (JSON/CSV/MD)
- [ ] JSON includes human-readable fields
- [ ] CSV opens correctly in Excel/Sheets
- [ ] Markdown is fully readable documentation

### Questions Resolved

- **Snoozed tabs in CSV?** NO - CSV is for active tabs only
- **Snoozed tabs in JSON?** YES - In separate section for full backup
- **Human readable?** YES - Include redundant fields, readable timestamps
- **Window scoping?** YES - User selects current vs all windows

---

## STARTING POINT

Begin by:
1. Opening `/background-integrated.js`
2. Finding the message listener (around line 150-200)
3. Adding the exportData case
4. Implementing basic JSON export
5. Testing export button works

The complete plan with all details is in `/plans/EXPORT-IMPORT-IMPLEMENTATION.md`