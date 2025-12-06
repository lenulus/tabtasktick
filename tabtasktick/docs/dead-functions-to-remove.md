# Dead Functions To Remove

**Date**: 2025-11-28
**Category**: Functions defined but never called
**User Concern**: "It's a promise to do something but no backing implementation"

## Verified Dead Functions (Safe to Remove)

### dashboard/export-import.js
- `handleManualBackup` (line 618) - Function defined, never called

### popup/popup.js
- `handleExport` (line 1301) - Function defined, never called
- `handleFileSelect` (line 1401) - Function defined, never called
- `handleImport` (line 1479) - Function defined, never called

### options/options.js
- `getAvailableEngines` (line 6) - Import only, safe to remove

### test-panel/test-panel.js
- `getAutoCleanupSetting` (line 681) - Function defined, never called

### dashboard/modules/views/rules.js
- `parseDSL` (line 6 import)
- `serializeRuleToDSL` (line 6 import)
- `validateDSL` (line 6 import)
- `formatDSL` (line 6 import)
- `createHighlightedOverlay` (line 7 import)
- `getIncompatibilityReason` (line 12)
- `convertRuleToNewFormat` (line 2162)
- `convertRuleFromNewFormat` (line 2262)

### dashboard/modules/views/tasks-base.js
- `handleBulkAction` (line 13) - Exported but never called
- `renderStatusBadge` (line 12 import)

### dashboard/modules/views/tasks-list.js
- `getTimeAgo` (line 4 import)

### dashboard/modules/views/tasks-kanban.js
- `getTasksByCollection` (line 24 import)

### dashboard/modules/views/collections.js
- `getCollection` (line 76 import)
- `getTab` (line 78 import)

### dashboard/modules/views/history.js
- `getFolder` (line 56)
- `getTab` (line 59)

### dashboard/modules/views/snoozed.js
- `getValueFromPath` (line 788)

### dashboard/modules/views/tabs.js
- `FILTER_TYPES` (line 9 import) - leftover from earlier cleanup
- `LIMITS` (line 10 import) - leftover from earlier cleanup

### Various files
- `state` imports that are unused (multiple files)
- `ProgressiveSyncService` import (line 1 of some file)

## FALSE POSITIVES (Keep These)

### background-integrated.js
- `closeTabs` (line 2214) - ✅ Called via message handler `case 'closeTabs':`
- `bookmarkTabs` (line 2279) - ✅ Called via message handler `case 'bookmarkTabs':`

These are string-dispatched functions, so ESLint can't see the connection.

## Removal Strategy

1. Remove function definitions (actual dead code)
2. Remove unused imports
3. Clean up any unused state imports
4. Test to ensure nothing breaks

## Estimated Impact

- ~15-20 function definitions removed
- ~10-15 unused imports removed
- Cleaner codebase, no "broken promises"
