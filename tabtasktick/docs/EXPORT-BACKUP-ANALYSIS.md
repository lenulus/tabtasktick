# TabMaster Pro Export & Backup Analysis

## Executive Summary

The export and backup system in TabMaster Pro has **two separate implementations**:

1. **Main Session Backup** (ExportImportService + ScheduledExportService)
   - Exports browser tabs, windows, groups, rules, settings, snoozed tabs
   - Used for session restoration and disaster recovery
   - **DOES NOT include collections or tasks**

2. **Collection Export** (CollectionExportService + CollectionImportService)
   - Exports individual collections with folders, tabs, and tasks
   - Separate from main backup system
   - Tasks are ONLY exported as part of collection exports

## Current Export Coverage

### What IS Included in Main Backups

#### ExportImportService.exportData()
**File**: `/services/ExportImportService.js`

**Data Included**:
```javascript
exportData = {
  format: 'TabMaster Export v2.0',
  created: exportDate,
  session: {
    windows: [...],      // Window metadata and structure
    tabs: [...],         // All tabs with URLs, titles, favicons, timing
    groups: [...]        // Tab groups with colors and titles
  },
  extensionData: {
    rules: [...],        // Automation rules (optional)
    snoozedTabs: [...],  // Snoozed tabs with wake times (optional)
    settings: {...},     // Extension settings (optional)
    statistics: {...}    // Usage statistics (optional)
  }
}
```

**Export Options**:
```javascript
{
  scope: 'all-windows' | 'current-window',
  format: 'json' | 'csv' | 'markdown',
  includeRules: true | false,
  includeSnoozed: true | false,
  includeSettings: true | false,
  includeStatistics: true | false,
  currentWindowId: null | windowId
}
```

**Tab Data Exported** (lines 161-195):
- id, tabId, windowId, groupId, groupName
- url, title, domain, favicon
- pinned, position, active, audible, muted
- createdAt, lastAccessedAt (with human-readable versions)

**Group Data Exported** (lines 198-213):
- id, groupId, windowId, windowTitle
- name, color, collapsed
- tabCount, tabIds

#### ScheduledExportService.performScheduledExport()
**File**: `/services/execution/ScheduledExportService.js` (lines 459-482)

**Creates FULL backup** using ExportImportService:
```javascript
const exportData = await ExportImportService.exportData(
  {
    scope: 'all-windows',
    format: 'json',
    includeRules: true,
    includeSnoozed: true,
    includeSettings: true,
    includeStatistics: true
  },
  state,
  tabTimeData
);
```

**Backup Storage**:
- Actual snapshot files: Downloaded to `~/Downloads/` folder via `chrome.downloads` API
- Metadata tracking: `chrome.storage.local` stores only:
  - downloadId, timestamp, filename, size, tabCount, windowCount, automatic flag
  - Total storage: < 5KB per backup

**Retention Policy**:
- Default: Keep last 5 backups
- Automatic cleanup removes old files

### What IS NOT Included in Main Backups

**❌ Collections** - Not exported at all in main backup
**❌ Folders** - Not exported in main backup (only collection-specific)
**❌ Tasks** - Not exported in main backup (only collection-specific)

---

## Collection & Task Export System

### CollectionExportService.exportCollection()
**File**: `/services/execution/CollectionExportService.js`

**Separate from main backup** - Only exports a single collection or multiple collections

**Data Included** (lines 243-346):
```javascript
{
  version: '1.1',
  exportedAt: timestamp,
  collections: [
    {
      name, description, icon, color, tags,
      settings: {...},           // Collection-specific settings (optional)
      metadata: {...},           // createdAt, lastAccessed (optional)
      folders: [
        {
          name, color, collapsed, position,
          tabs: [
            { url, title, favicon, note, position, isPinned },
            ...
          ]
        }
      ],
      ungroupedTabs: [           // NEW in v1.1
        { url, title, favicon, note, position, isPinned },
        ...
      ],
      tasks: [                   // TASKS INCLUDED HERE
        {
          summary, notes, status, priority, dueDate,
          tags, comments,
          tabReferences: [        // Index-based references
            { folderIndex, tabIndex, url, title }  // With fallback
          ],
          createdAt, completedAt // (optional metadata)
        }
      ]
    }
  ]
}
```

**Export Options** (lines 128-132):
```javascript
{
  includeTasks: true | false,     // Default: true
  includeSettings: true | false,  // Default: true
  includeMetadata: true | false   // Default: false
}
```

**Task Export Details** (lines 310-343):
- Tasks are converted from tab IDs to index-based references
- References include fallback URL/title for recovery
- **Tasks are ONLY exported with their collection**

### CollectionImportService.importCollections()
**File**: `/services/execution/CollectionImportService.js`

**Imports collections WITH tasks** (lines 325-369):
- Validates schema version (1.0, 1.1)
- Resolves tab references from indices back to IDs
- Creates collections, folders, tabs, and tasks atomically
- Conflict resolution: Appends " (imported)" or " (imported 2)" to duplicate names
- Import options:
  ```javascript
  {
    mode: 'merge' | 'replace',
    importTasks: true | false,    // Default: true
    importSettings: true | false  // Default: true
  }
  ```

---

## Storage Structure

### Chrome Storage (chrome.storage.local)

**Session Data** (TabMaster):
```
state.rules              // Automation rules
state.settings          // Extension settings
state.statistics        // Usage stats
state.snoozedTabs      // Snoozed tabs
tabTimeData (Map)      // Tab creation/access times
```

**Scheduled Export Metadata**:
```javascript
{
  'scheduled_export_config': {
    enabled: true,
    frequency: 'daily',
    time: '02:00',
    retention: 5,
    lastRun: timestamp
  },
  'backup_history': [
    { downloadId, timestamp, filename, size, tabCount, windowCount, automatic }
  ]
}
```

### IndexedDB (TabTaskTick Collections)

**Stores**: collections, folders, tabs, tasks

**Collections Table**:
```javascript
{
  id: string (UUID),
  name: string,
  description: string,
  icon: string,
  color: string,
  tags: [string],
  settings: {...},
  metadata: { createdAt, lastAccessed, tabCount, folderCount },
  isActive: boolean
}
```

**Tasks Table**:
```javascript
{
  id: string (UUID),
  collectionId: string | null,  // FK to collections
  summary: string (required),
  notes: string,
  status: 'open' | 'active' | 'fixed' | 'abandoned',
  priority: 'low' | 'medium' | 'high' | 'critical',
  dueDate: timestamp,
  tags: [string],
  comments: [{ id, text, createdAt }],
  tabIds: [string],             // DEPRECATED
  tabReferences: [              // NEW in Phase 11
    { id, url, title, favicon, notes }
  ],
  createdAt: timestamp,
  completedAt: timestamp
}
```

---

## Export Flow Diagram

```
USER INTERACTION
    │
    ├─ Session Export Button (Dashboard)
    │  └─ Send 'exportData' message
    │     └─ background-integrated.js (line 1665)
    │        └─ ExportImportService.exportData()
    │           └─ Exports tabs, windows, groups, rules, snoozed, settings
    │           └─ Returns JSON/CSV/Markdown
    │           └─ Browser downloads file
    │
    ├─ Scheduled Backup (Daily/Hourly/Weekly)
    │  └─ chrome.alarms event
    │     └─ background-integrated.js (alarm handler)
    │        └─ ScheduledExportService.handleAlarm()
    │           └─ ScheduledExportService.performScheduledExport()
    │              └─ ExportImportService.exportData() [FULL]
    │              └─ chrome.downloads.download()
    │              └─ Track metadata in storage
    │
    ├─ Collection Export (Dashboard Collections)
    │  └─ Send 'exportCollection' message
    │     └─ background-integrated.js (line 2095)
    │        └─ CollectionExportService.exportCollection()
    │           └─ Gets collection, folders, tabs, tasks from IndexedDB
    │           └─ Converts tab IDs to index references
    │           └─ Returns JSON with all collection data
    │           └─ Browser downloads file
    │
    └─ Collection Import
       └─ Send 'importCollections' message
          └─ background-integrated.js (line 2122)
             └─ CollectionImportService.importCollections()
                └─ Validates and creates collections, folders, tabs, tasks
                └─ Converts tab references back to IDs
```

---

## Message Handlers in background-integrated.js

### Session Export/Import (Lines 1665-1685)
```javascript
case 'exportData':
  const exportResult = await ExportImportService.exportData(
    request.options, state, tabTimeData
  );
  sendResponse(exportResult);
  break;

case 'importData':
  const importResult = await ExportImportService.importData(
    request.data, request.options, state, loadRules, scheduler
  );
  sendResponse(importResult);
  break;
```

### Scheduled Backup Operations (Lines 1687-1730)
```javascript
case 'getScheduledExportConfig':
case 'enableScheduledExports':
case 'disableScheduledExports':
case 'triggerManualBackup':
case 'getBackupHistory':
case 'deleteBackup':
case 'validateBackup':
```

### Collection Export/Import (Lines 2095-2128)
```javascript
case 'exportCollection':
  const collectionExportResult = 
    await CollectionExportService.exportCollection(
      request.collectionId, request.options || {}
    );
  sendResponse({ success: true, ...collectionExportResult });
  break;

case 'exportCollections':
case 'exportAllCollections':
case 'importCollections':
  // Similar handlers
```

---

## Gap Analysis: What's Missing

### Gap 1: Collections NOT in Main Session Backup
**Problem**: When user exports main session, collections and tasks are NOT included
**Impact**: 
- Users who restore from main backup lose all collections
- Collections require separate export/import workflow
- No integrated backup solution for complete data

**Current Workaround**:
- Collections must be exported separately via `exportAllCollections`
- User must manually export before backup OR after restore

### Gap 2: Task Storage Fragmentation
**Current State**:
- Tasks belong to collections (stored in IndexedDB)
- Tasks can only be exported with their collection
- No global task export/import
- Uncategorized tasks (collectionId=null) exist but unclear if exported

**Questions**:
1. Are uncategorized tasks (collectionId=null) exported in main backup? **NO**
2. Can tasks be exported without their collection? **NO**
3. Are task references properly restored? **YES** - via index-based fallback

### Gap 3: Scheduled Backup Does NOT Include Collections/Tasks
**Problem**: Automatic backups exclude collections and tasks
**Impact**:
- Daily backups miss your task data
- Restore from automatic backup = lose all collections/tasks
- True disaster recovery requires manual collection exports

**Current Implementation** (ScheduledExportService.createFullSnapshot, line 507):
```javascript
const exportData = await ExportImportService.exportData(
  {
    scope: 'all-windows',
    format: 'json',
    includeRules: true,
    includeSnoozed: true,
    includeSettings: true,
    includeStatistics: true
    // ⚠️ NO collections/tasks - would need separate handling
  },
  state,
  tabTimeData
);
```

### Gap 4: No Unified Export Format
**Current State**:
- Session format: `{ format, session: {}, extensionData: {} }`
- Collection format: `{ version, exportedAt, collections: [] }`
- No format that includes both

**Impact**:
- Users need multiple files for complete backup
- Import logic doesn't know how to handle mixed data
- No "export everything" option

---

## Export Version History

### Session Export Version
- Current: **v2.0**
- Tracks tabs, windows, groups, rules, snoozed tabs, settings, statistics
- Can be imported to 'new-windows', 'current-window', or 'replace-all'

### Collection Export Version
- Current: **v1.1**
- v1.0: Initial format with folders and tasks
- v1.1: Added `ungroupedTabs` field for tabs without folders
- Supported in import: ['1.0', '1.1']

---

## Data Completeness by Export Type

| Data | Session Export | Scheduled Backup | Collection Export |
|------|---|---|---|
| Tabs | ✅ | ✅ | ✅ (collection only) |
| Windows | ✅ | ✅ | ❌ |
| Tab Groups | ✅ | ✅ | ❌ |
| Collections | ❌ | ❌ | ✅ |
| Folders | ❌ | ❌ | ✅ |
| Tasks | ❌ | ❌ | ✅ |
| Rules | ✅ | ✅ | ❌ |
| Snoozed Tabs | ✅ | ✅ | ❌ |
| Settings | ✅ | ✅ | ✅ (collection) |
| Statistics | ✅ | ✅ | ❌ |

---

## UI Integration Points

### Dashboard Export/Import (dashboard/export-import.js)
- **Exports sessions** via `exportData` message
- **Imports sessions** via `importData` message
- **Scheduled backups** UI (getBackupHistory, enableScheduledExports, etc.)
- **Does NOT export collections** (separate UI in Collections page)

### Collections Page
- **Exports collections** via `exportCollection` message
- **Imports collections** via `importCollections` message
- **Tasks exported with collections** automatically
- Separate from session backup UI

---

## Recommendations for Complete Backup

### For Users
1. **Export Session** (main backup): Dashboard → Export/Import
2. **Export Collections** (separate): Collections page → Export all
3. **Store both files** for complete disaster recovery
4. **Enable scheduled backups** for session data only

### For Development
1. **Enhance ScheduledExportService** to optionally include collections/tasks
2. **Create unified export format** that includes both session and collections
3. **Add "export everything" option** to Dashboard
4. **Document the two-file workflow** for users
5. **Consider IndexedDB backup** alongside chrome.downloads backups

---

## Code References

| Component | File | Key Functions |
|-----------|------|---|
| Session Export | `/services/ExportImportService.js` | `exportData()`, `importData()` |
| Scheduled Backup | `/services/execution/ScheduledExportService.js` | `performScheduledExport()`, `createFullSnapshot()` |
| Collection Export | `/services/execution/CollectionExportService.js` | `exportCollection()`, `exportCollections()` |
| Collection Import | `/services/execution/CollectionImportService.js` | `importCollections()` |
| Message Router | `/background-integrated.js` | Lines 1665-1730, 2095-2128 |
| Dashboard UI | `/dashboard/export-import.js` | `handleExport()`, `handleImport()` |
| Storage | `/services/utils/storage-queries.js` | CRUD operations |

