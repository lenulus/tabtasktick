# Export/Import Implementation Plan
**Status**: 🚧 In Progress
**Last Updated**: 2024-01-28
**Priority**: HIGH

## Overview
Implement robust export/import functionality with window/session scoping for TabMaster Pro. Users should be able to backup and restore their tabs, rules, and settings with granular control over scope.

## Current Issues
- ❌ Export returns "Unknown action" error - not implemented in background-integrated.js
- ❌ No import UI exists
- ❌ No import functionality implemented
- ❌ No tests for export/import
- ❌ No scoping options (window vs all windows)

## Export Format Philosophy

### Why Human-Readable?
1. **Debugging**: Users can inspect and understand their data
2. **Manual Editing**: Fix issues without reimporting
3. **Transparency**: Build trust by showing exactly what's stored
4. **Interoperability**: Other tools can parse the data
5. **Documentation**: Exports serve as session documentation

### Format Use Cases

| Format | Best For | Includes | Can Import? | Human Editable? |
|--------|----------|----------|-------------|-----------------|
| JSON | Full backup/restore | Everything (tabs, groups, snoozed, rules) | ✅ Full | ✅ With editor |
| CSV | Analysis, reports | Active tabs only | ⚠️ As new tabs | ✅ Excel/Sheets |
| Markdown | Sharing, docs | Everything (read-only) | ❌ | ✅ Any editor |

### Key Design Principles
- **Redundancy is OK**: Include both `groupId` and `groupName` for clarity
- **Readable Dates**: Include both ISO and human-readable timestamps
- **Descriptive Fields**: Use `position` instead of `index`
- **Context Clues**: Include parent names (window title in groups)
- **Self-Documenting**: Field names should be obvious

## Implementation Status

### Phase 1: Fix Export with Scoping ⏳
**Status**: Not Started
**Estimated**: 2 hours

#### Tasks:
- [ ] Add exportData handler to background-integrated.js
- [ ] Implement scope selection (Current Window / All Windows)
- [ ] Update export data structure to v2.0.0
- [ ] Add export options UI
- [ ] Test with 200+ tabs

#### Export Scope Options:
```javascript
{
  scope: 'current-window' | 'all-windows',
  includeRules: boolean,        // Always all rules (not scoped)
  includeSnoozed: boolean,       // Always all snoozed (not scoped)
  includeSettings: boolean,      // Always all settings (not scoped)
  includeBookmarks: boolean,     // Optional
  includeStatistics: boolean     // Optional
}
```

#### Export Modal Design:
```
┌─────────────────────────────────────┐
│ Export TabMaster Data               │
├─────────────────────────────────────┤
│ Scope:                              │
│ ◉ Current Window (47 tabs)          │
│ ○ All Windows (234 tabs)            │
│                                      │
│ Include:                            │
│ ☑ Tab Groups & Organization         │
│ ☑ Rules & Automation                │
│ ☑ Snoozed Tabs                     │
│ ☑ Settings & Preferences           │
│ ☐ Bookmarks                        │
│ ☐ Usage Statistics                 │
│                                      │
│ Export Format:                      │
│ ◉ TabMaster JSON (.json)           │
│ ○ CSV - Tabs only (.csv)           │
│ ○ Markdown - Documentation (.md)   │
│                                      │
│ [Cancel]              [Export]      │
└─────────────────────────────────────┘
```

### Phase 2: Create Import UI ⏳
**Status**: Not Started
**Estimated**: 3 hours

#### Tasks:
- [ ] Add Import button to popup footer
- [ ] Create import modal component
- [ ] Add drag & drop support
- [ ] Implement file validation UI
- [ ] Add scope preview

#### Import Modal Design:
```
┌─────────────────────────────────────┐
│ Import TabMaster Data               │
├─────────────────────────────────────┤
│ ┌───────────────────────────────┐   │
│ │     📁 Drop file here or      │   │
│ │        click to browse         │   │
│ └───────────────────────────────┘   │
│                                      │
│ File: export-2024-01-28.json       │
│ Size: 1.2 MB | Version: 2.0.0      │
│                                      │
│ Contains:                           │
│ • 234 tabs in 5 windows            │
│ • 12 tab groups                    │
│ • 8 custom rules                   │
│ • 15 snoozed tabs                  │
│                                      │
│ Import to:                          │
│ ◉ New Window(s)                    │
│ ○ Current Window                   │
│ ○ Replace All Windows              │
│                                      │
│ Options:                            │
│ ☑ Import tab groups                │
│ ☑ Import rules (merge)             │
│ ☑ Import snoozed tabs              │
│ ☐ Import settings (override)       │
│                                      │
│ ⚠️ This will open 234 tabs         │
│                                      │
│ [Cancel]              [Import]      │
└─────────────────────────────────────┘
```

### Phase 3: Implement Import Logic ⏳
**Status**: Not Started
**Estimated**: 4 hours

#### Tasks:
- [ ] Create importData function in background-integrated.js
- [ ] Implement scope strategies
- [ ] Add merge logic for rules
- [ ] Handle tab group restoration
- [ ] Implement batching for large imports

#### Import Scope Strategies:

**1. New Window(s) - Default & Safest**
```javascript
// Creates new window(s) preserving original structure
// Doesn't affect existing tabs
// Preserves window boundaries from export
```

**2. Current Window**
```javascript
// Adds tabs to current window
// Merges groups if names match
// Appends to end of current tabs
```

**3. Replace All Windows**
```javascript
// Closes all existing windows
// Recreates exact session state
// Full restoration mode
```

### Phase 4: Export Formats ⏳
**Status**: Not Started

#### Format 1: TabMaster JSON (Full Featured)
**Purpose**: Complete backup/restore, migration, sharing sessions

```javascript
{
  // Metadata - Human readable
  "format": "TabMaster Export v2.0",
  "created": "2024-01-28T10:30:00Z",
  "createdReadable": "January 28, 2024 at 10:30 AM",
  "scope": "all-windows", // or "current-window"
  "description": "234 tabs across 5 windows", // Human summary
  "browser": "Chrome 120.0.0.0",
  "extension": {
    "name": "TabMaster Pro",
    "version": "1.2.0"
  },

  // Session Data (scoped by export choice)
  "session": {
    "summary": "5 windows, 234 tabs, 12 groups", // Human readable
    "windows": [{
      "id": "w1",
      "title": "Main Window - 47 tabs", // Human readable
      "focused": true,
      "state": "maximized",
      "type": "normal",
      "tabCount": 47,
      "tabs": ["t1", "t2", "t3"] // Reference array
    }],

    "tabs": [{
      "id": "t1",
      "windowId": "w1",
      "groupId": "g1",
      "groupName": "Work", // Duplicate for readability
      "url": "https://github.com/user/repo",
      "title": "GitHub - user/repo: Project description",
      "domain": "github.com", // For easy filtering
      "favicon": "data:image/png;base64,...",
      "pinned": false,
      "position": 0, // Human-friendly index
      "active": true,
      "audible": false,
      "muted": false,
      "createdAt": "2024-01-28T09:15:00Z",
      "createdReadable": "1 hour ago",
      "lastAccessedAt": "2024-01-28T10:20:00Z",
      "lastAccessedReadable": "10 minutes ago"
    }],

    "groups": [{
      "id": "g1",
      "windowId": "w1",
      "windowTitle": "Main Window", // For context
      "name": "Work",
      "color": "blue",
      "colorHex": "#1a73e8", // Actual color
      "collapsed": false,
      "tabCount": 15,
      "tabIds": ["t1", "t2", "t3"] // For reference
    }]
  },

  // Extension Data (never scoped - always all)
  "extensionData": {
    "rules": [{
      "id": "rule1",
      "name": "Close duplicate tabs",
      "description": "Automatically close duplicate tabs",
      "enabled": true,
      "trigger": "immediate",
      "conditions": {...}, // Full conditions
      "conditionsReadable": "When duplicate tabs exist",
      "actions": [{
        "type": "close",
        "readable": "Close the duplicate tab"
      }]
    }],

    "snoozedTabs": [{
      "url": "https://example.com",
      "title": "Example Page",
      "wakeTime": "2024-01-29T14:00:00Z",
      "wakeTimeReadable": "Tomorrow at 2:00 PM",
      "reason": "Read later",
      "snoozedAt": "2024-01-28T10:00:00Z",
      "snoozedReadable": "30 minutes ago"
    }],

    "settings": {
      "theme": "dark",
      "autoGroup": true,
      "notifications": true
      // All settings with descriptions
    }
  }
}
```

#### Format 2: CSV Export (Active Tabs Only)
**Purpose**: Spreadsheet analysis, bulk URL management, reporting

```csv
"Window","Group","Position","Title","URL","Domain","Pinned","Active","Created","Last Accessed"
"Main Window","Work","1","GitHub - user/repo","https://github.com/user/repo","github.com","false","true","2024-01-28 09:15:00","2024-01-28 10:20:00"
"Main Window","Work","2","Pull requests","https://github.com/pulls","github.com","false","false","2024-01-28 09:16:00","2024-01-28 10:15:00"
"Main Window","Personal","3","Gmail","https://mail.google.com","mail.google.com","true","false","2024-01-28 08:00:00","2024-01-28 10:25:00"
```

**Note**: Snoozed tabs are NOT included in CSV exports because:
- They're not active browser tabs
- Would confuse spreadsheet analysis
- Can't have window/position data
- Better suited for JSON backup if needed

Features:
- Human-readable headers
- Quoted fields for safety
- ISO dates in readable format
- Can be edited in Excel/Google Sheets
- Can be re-imported (creates new tabs)

#### Format 3: Markdown Documentation
**Purpose**: Documentation, sharing, review

```markdown
# TabMaster Export - January 28, 2024

## Summary
- **Total Tabs**: 234 across 5 windows
- **Tab Groups**: 12 groups
- **Snoozed Tabs**: 15 tabs
- **Active Rules**: 8 rules

## Windows

### Main Window (47 tabs)
**Groups**: Work (15), Personal (8), Research (12), Ungrouped (12)

#### Work Group
1. [GitHub - user/repo](https://github.com/user/repo)
2. [Pull requests](https://github.com/pulls)
3. [Issues · user/repo](https://github.com/user/repo/issues)

#### Personal Group
1. [Gmail](https://mail.google.com) 📌
2. [Calendar](https://calendar.google.com)

### Secondary Window (28 tabs)
...

## Snoozed Tabs
| Title | URL | Wake Time | Reason |
|-------|-----|-----------|---------|
| Article to read | https://... | Tomorrow 2:00 PM | Read later |

## Active Rules
1. **Close duplicate tabs** - Runs immediately when duplicates detected
2. **Group by domain** - Groups tabs when 3+ from same domain
```

Features:
- Fully human-readable
- Clickable links
- Emoji indicators (📌 for pinned)
- Table formatting
- Can be shared as documentation

### Phase 5: Validation & Error Handling ⏳
**Status**: Not Started
**Estimated**: 2 hours

#### Tasks:
- [ ] Implement file format validation
- [ ] Add version compatibility checking
- [ ] Create sanitization for URLs
- [ ] Add size limits (10MB max)
- [ ] Implement recovery from partial imports

#### Validation Rules:
```javascript
const ValidationRules = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  supportedVersions: ['1.0.0', '2.0.0'],
  requiredFields: ['version', 'session', 'extensionData'],
  urlProtocols: ['http:', 'https:', 'file:', 'chrome:', 'edge:'],
  maxTabs: 1000,
  maxRules: 100
};
```

### Phase 6: Testing ⏳
**Status**: Not Started
**Estimated**: 3 hours

#### Test Scenarios:
- [ ] Export current window (< 50 tabs)
- [ ] Export all windows (200+ tabs)
- [ ] Import to new window
- [ ] Import to current window
- [ ] Replace all windows
- [ ] Merge rules (duplicates)
- [ ] Handle corrupt files
- [ ] Handle oversized files
- [ ] Version migration (1.0 → 2.0)
- [ ] Round-trip integrity

#### Test File Structure:
```
tests/
  export-import/
    fixtures/
      valid-export-v1.json
      valid-export-v2.json
      corrupt-export.json
      oversized-export.json
    export.test.js
    import.test.js
    validation.test.js
    integration.test.js
```

### Phase 7: Performance Optimization ⏳
**Status**: Not Started
**Estimated**: 2 hours

#### Tasks:
- [ ] Batch tab creation (chunks of 10)
- [ ] Use requestIdleCallback for large operations
- [ ] Add progress indicators
- [ ] Implement chunked file reading
- [ ] Optimize memory usage

#### Performance Targets:
- Export 500 tabs: < 2 seconds
- Import 500 tabs: < 10 seconds
- File validation: < 500ms
- UI remains responsive during operations

## API Design

### Export API:
```javascript
// From popup/dashboard
chrome.runtime.sendMessage({
  action: 'exportData',
  options: {
    scope: 'current-window', // or 'all-windows'
    includeRules: true,
    includeSnoozed: true,
    includeSettings: true,
    includeBookmarks: false,
    includeStatistics: false
  }
});

// Response
{
  success: true,
  data: {...}, // The export data
  stats: {
    windows: 1,
    tabs: 47,
    groups: 3,
    rules: 8,
    snoozed: 12
  }
}
```

### Import API:
```javascript
// From popup/dashboard
chrome.runtime.sendMessage({
  action: 'importData',
  data: {...}, // The parsed JSON
  options: {
    scope: 'new-windows', // or 'current-window' or 'replace-all'
    importGroups: true,
    importRules: true,
    mergeRules: true, // false = replace
    importSnoozed: true,
    importSettings: false
  }
});

// Response
{
  success: true,
  imported: {
    windows: 5,
    tabs: 234,
    groups: 12,
    rules: 8,
    snoozed: 15
  },
  errors: [], // Any non-fatal errors
  warnings: [] // Any warnings
}
```

## Edge Cases

1. **Circular References**: Tab A opened by Tab B opened by Tab A
2. **Missing Favicons**: Use generic icon
3. **Restricted URLs**: chrome://, edge://, about:
4. **Duplicate Rule IDs**: Generate new IDs on import
5. **Group Name Conflicts**: Append number (Work, Work 2)
6. **Memory Pressure**: Batch and use idle callbacks
7. **Suspended Tabs**: Restore as suspended
8. **Private Windows**: Skip or warn user

## Success Metrics

- ✅ Export works for both current window and all windows
- ✅ Import provides three scope options
- ✅ Round-trip preserves all data
- ✅ Handles 500+ tabs without freezing
- ✅ Clear error messages for failures
- ✅ Validates files before import
- ✅ Tests cover main scenarios
- ✅ Performance meets targets

## Implementation Order

1. **Week 1** (This Week)
   - Fix export with scoping (Phase 1)
   - Create import UI (Phase 2)
   - Basic import logic (Phase 3)

2. **Week 2**
   - Complete import strategies
   - Add validation (Phase 5)
   - Create test suite (Phase 6)

3. **Week 3**
   - Performance optimization (Phase 7)
   - Edge case handling
   - Documentation

## Rollback Plan

If issues arise:
1. Keep old background.js export as fallback
2. Add feature flag for new import/export
3. Provide data recovery tool
4. Allow manual JSON editing tool

## Future Enhancements

1. **Cloud Sync**: Google Drive, Dropbox integration
2. **Auto-backup**: Scheduled exports
3. **Selective Import**: Choose specific tabs/windows
4. **Format Support**: Import from OneTab, Session Buddy
5. **Compression**: Use gzip for large exports
6. **Encryption**: Password protect exports
7. **Diff View**: Show what will change before import
8. **Undo Import**: Restore previous state

## Notes

- Window scoping is critical for users with multiple projects/contexts
- Default to safest option (new windows) for import
- Always preserve data integrity over performance
- Make operations cancelable when possible
- Provide clear feedback during long operations

---

## Implementation Tracking

### Completed ✅
- [x] Created comprehensive plan
- [x] Defined data structure v2.0.0
- [x] Designed UI mockups

### In Progress 🚧
- [ ] Fixing export with scoping

### Blocked 🚫
None

### Next Steps
1. Implement exportData in background-integrated.js
2. Add scope selection to export UI
3. Test with current window export

---

*This document is actively maintained. Update the status sections as implementation progresses.*