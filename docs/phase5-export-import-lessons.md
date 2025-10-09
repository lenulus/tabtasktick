# Phase 5: Export/Import Service - Lessons Learned

## Executive Summary

**Current State (Main Branch):**
- Export/import logic duplicated across 4 files (~450 lines total)
- Background service has complete implementation (lines 1878-2695, ~817 lines)
- Dashboard has full UI implementation (390 lines)
- Session manager has stubbed handlers (TODO placeholders)
- Popup has export functionality only

**Feature Branch Implementation:**
- Created `/services/ExportImportService.js` (608 lines)
- Consolidates all export/import logic into single service
- Uses proper service pattern with explicit parameters
- Properly imports SnoozeService dependency

**Key Issues to Fix:**
1. Duplicate export/import logic across background and dashboard
2. Session manager has no working implementation (just TODOs)
3. Service needs to be integrated into background message handlers
4. Options page references export/import but has no implementation

**Recommended Approach:**
Extract service from feature branch, integrate into background, remove duplicates from all surfaces.

---

## Current Implementation Analysis (Main Branch)

### 1. Background Service (background-integrated.js)

**Lines: 1355-1362, 1878-2695 (~817 lines total)**

#### Message Handlers (Lines 1355-1362):
```javascript
case 'exportData':
  const exportResult = await exportData(request.options);
  sendResponse(exportResult);
  break;

case 'importData':
  const importResult = await importData(request.data, request.options);
  sendResponse(importResult);
  break;
```

#### Export Functions:

**`exportData(options)` - Lines 1878-1911 (~34 lines)**
- Entry point for all exports
- Handles scope (current-window vs all-windows)
- Routes to format-specific builders
- Parameters:
  - `scope`: 'all-windows' | 'current-window'
  - `format`: 'json' | 'csv' | 'markdown'
  - `includeRules`, `includeSnoozed`, `includeSettings`, `includeStatistics`: boolean
  - `currentWindowId`: number (for current-window scope)

**`buildJSONExport(tabs, windows, groups, options)` - Lines 1913-2041 (~129 lines)**
- Creates full JSON export structure
- Includes human-readable fields (createdReadable, lastAccessedReadable)
- Generates readable IDs (w123, t456, g789)
- Depends on:
  - `state.rules` (global)
  - `state.tabTimeData` (global)
  - `state.settings` (global)
  - `state.statistics` (global)
  - `SnoozeService.getSnoozedTabs()` (async)
- Helper functions used:
  - `getTimeAgo(timestamp, now)` - local helper
  - `getTimeUntil(timestamp, now)` - local helper
  - `getConditionsReadable(conditions)` - local helper
  - `getActionsReadable(actions)` - local helper

**`buildCSVExport(tabs, groups)` - Lines 2043-2084 (~42 lines)**
- Creates CSV format for active tabs only
- Columns: Window, Group, Position, Title, URL, Domain, Pinned, Active, Created, Last Accessed
- Uses `state.tabTimeData` (global)
- Returns: `{ csv: string, format: 'csv' }`

**`buildMarkdownExport(tabs, windows, groups, options)` - Lines 2086-2247 (~162 lines)**
- Creates human-readable documentation format
- Includes summary section
- Organizes by windows and groups
- Includes snoozed tabs and rules sections
- Depends on:
  - `state.rules` (global)
  - `SnoozeService.getSnoozedTabs()` (async)
- Returns: `{ markdown: string, format: 'markdown' }`

**Issues:**
1. **Tight coupling to global state** - Uses `state.rules`, `state.tabTimeData`, `state.settings`, `state.statistics` directly
2. **Hidden dependencies** - Not clear from function signature what global state is needed
3. **No parameter passing** - Global state access makes testing difficult
4. **Mixed concerns** - Helper functions for formatting embedded in same file

#### Import Functions:

**`importData(data, options)` - Lines 2253-2695 (~443 lines)**
- Full import implementation with validation
- Handles three import scopes:
  - `new-windows`: Create new windows for imported tabs (default, safest)
  - `current-window`: Import into current window
  - `replace-all`: Close all windows and replace with import
- Parameters:
  - `data`: Full export object
  - `options.scope`: 'new-windows' | 'current-window' | 'replace-all'
  - `options.importGroups`: boolean
  - `options.shouldImportRules`: boolean
  - `options.shouldImportSnoozed`: boolean
  - `options.importSettings`: boolean
- Batches tab creation (10 at a time) for performance
- Validates and skips restricted URLs (chrome://, edge://, about:)
- Properly handles window/group ID remapping
- Depends on:
  - `state.rules` (global) - for rule import/merge
  - `loadRules()` (global function)
  - `scheduler.setupRule(rule)` (global object)
  - `SnoozeService.getSnoozedTabs()`, `SnoozeService.initialize()` (async)

**Issues:**
1. **Very long function** - 443 lines doing multiple things
2. **Global dependencies** - Relies on `state`, `loadRules()`, `scheduler`
3. **Should be split** - Tab import, rule import, snoozed import are separate concerns
4. **No error recovery** - Partial failures don't clean up properly

### 2. Dashboard (dashboard/export-import.js + dashboard/dashboard.js)

**File: dashboard/export-import.js (390 lines)**

This is a **complete UI implementation** that handles all export/import interactions for the dashboard view.

#### Initialization (Lines 6-60):
```javascript
function initializeExportImport() {
  updateTabCounts();
  // Export button
  // File upload handling with drag & drop
  // Import preview and confirmation buttons
}
```

#### Export Implementation (Lines 79-170):

**`handleExport()` - Lines 79-170 (~92 lines)**
- Gets user selections (scope, format, options)
- Sends message to background: `{ action: 'exportData', options }`
- Creates download blob based on format (JSON/CSV/Markdown)
- Uses Chrome Downloads API
- Shows notification with export summary

**Features:**
- Tab count display (current window vs all windows)
- Export scope radio buttons
- Format selection (JSON/CSV/Markdown)
- Include options checkboxes (rules, snoozed, settings, statistics)
- Download filename: `tabmaster-export-YYYY-MM-DD.{ext}`

**Issues:**
1. **Duplicates background logic** - File creation and download should be thin UI layer
2. **Mixed business logic** - Summary calculation belongs in service
3. **Hardcoded strings** - MIME types, file extensions repeated

#### Import Implementation (Lines 172-344):

**`handleFileSelect(file)` - Lines 172-283 (~112 lines)**
- Validates file type (JSON only) and size (10MB limit)
- Parses and validates export structure
- Counts importable vs restricted tabs
- Shows import preview with summary
- Enables import button

**`handleImport()` - Lines 285-334 (~50 lines)**
- Gets user import options
- Sends message to background: `{ action: 'importData', data, options }`
- Shows success notification with counts
- Resets import form

**Features:**
- File drag & drop support
- Import preview with counts (tabs, groups, rules, snoozed)
- Import scope options (new-windows, current-window)
- Import checkboxes (groups, rules, snoozed, settings)
- Warning for large imports (>50 tabs)
- Restricted URL detection and exclusion

**Issues:**
1. **Client-side validation duplicated** - Background also validates
2. **Preview calculation** - Should come from service preview API
3. **No dry-run capability** - Can't preview what will happen before importing
4. **Restrictive file type** - Could support other formats in future

### 3. Popup (popup/popup.js)

**Export Only - Lines 879-950 (~72 lines)**

#### `handleExport()` - Lines 879-950:
```javascript
async function handleExport() {
  const scope = document.querySelector('input[name="exportScope"]:checked').value;
  const format = document.querySelector('input[name="exportFormat"]:checked').value;
  // ... get options ...
  const data = await sendMessage({ action: 'exportData', options });
  // ... create download ...
}
```

**Features:**
- Export scope selection
- Format selection
- Include options
- Download creation

**Issues:**
1. **Duplicate of dashboard export** - Almost identical code (92 lines in dashboard vs 72 in popup)
2. **No import capability** - Missing import UI entirely
3. **Should share code** - Export download logic should be in shared utility

**Notes:**
- Lines 1057-1100 have import handlers (`handleImport()`) but they're for a different feature (file import for rules/bookmarks)

### 4. Session Manager (session/session.js)

**Lines 1034-1050 (Stubbed TODOs)**

```javascript
async function handleImport() {
  // TODO: Implement import
  console.log('Import session');
}

async function handleExport() {
  // TODO: Implement export
  console.log('Export session');
}
```

**Event Listeners (Lines 376-378):**
```javascript
elements.import.addEventListener('click', handleImport);
elements.export.addEventListener('click', handleExport);
```

**Issues:**
1. **Not implemented** - Just console.log placeholders
2. **UI exists** - Buttons are wired up but do nothing
3. **No plan** - No TODO comments explaining what should happen
4. **Duplicate intention** - Will need same export/import as dashboard/popup

**What it should do:**
- Export: Open same modal as dashboard, use background service
- Import: Open same modal as dashboard, use background service
- OR: Use message passing to background which handles everything

### 5. Options Page (options/options.js)

**No Export/Import Implementation**

Searched file - no export/import functionality found. If it references export/import, it's not currently implemented.

---

## Feature Branch Analysis

### ExportImportService.js (608 lines)

**Location:** `/services/ExportImportService.js`

#### Dependencies:
```javascript
import * as SnoozeService from './execution/SnoozeService.js';
```

**Good:**
- Properly imports SnoozeService instead of using globals
- Uses ES6 module pattern

**Issues:**
- Still needs `state` object passed in (not a true service)
- Should accept all dependencies as parameters

#### Service API Design:

**Export API:**
```javascript
export async function exportData(options = {}, state, tabTimeData)
```

**Parameters:**
- `options`: Export configuration object
  - `scope`: 'all-windows' | 'current-window'
  - `format`: 'json' | 'csv' | 'markdown'
  - `currentWindowId`: number
  - `includeRules`, `includeSnoozed`, `includeSettings`, `includeStatistics`: boolean
- `state`: Application state object (rules, settings, statistics)
- `tabTimeData`: Map of tab timing information

**Return:** Export data object (format-dependent)

**Good:**
- Explicit parameters instead of global state access
- Clear separation of concerns
- Format-specific builders are internal helpers

**Issues:**
- Still requires `state` object (not fully decomposed)
- `tabTimeData` should be part of state or separate service
- No TypeScript types (would help document structure)

**Import API:**
```javascript
export async function importData(data, options = {}, state, loadRules, scheduler)
```

**Parameters:**
- `data`: Import data object (validated export)
- `options`: Import configuration
  - `scope`: 'new-windows' | 'current-window' | 'replace-all'
  - `importGroups`, `shouldImportRules`, `shouldImportSnoozed`, `importSettings`: boolean
- `state`: Application state object
- `loadRules`: Function to reload rules
- `scheduler`: Scheduler object for rule setup

**Return:** Result object with success/errors

**Good:**
- Explicit function parameters (testable!)
- Clear return structure
- Proper error collection

**Issues:**
- Takes function and object parameters (`loadRules`, `scheduler`) - tight coupling
- Should use dependency injection pattern
- `state` object still passed (not fully service-oriented)

#### Internal Helper Functions (Lines 5-76):

**Formatting Helpers:**
- `getTimeAgo(timestamp, now)` - Human readable "X days ago"
- `getTimeUntil(timestamp, now)` - Human readable "In X days"
- `getColorHex(colorName)` - Convert Chrome color names to hex
- `getConditionsReadable(conditions)` - Rule condition summary
- `getActionsReadable(actions)` - Rule action summary

**Good:**
- Reusable utility functions
- Pure functions (no side effects)
- Clear naming

**Issues:**
- Should be in separate utils module
- Could be shared with other services
- No unit tests visible

#### Format Builders:

**`buildJSONExport()` - Lines 78-198 (~121 lines)**
- Same logic as main branch
- Takes `state` and `tabTimeData` as parameters (better!)
- Returns full export structure

**`buildCSVExport()` - Lines 200-236 (~37 lines)**
- Same logic as main branch
- Takes `tabTimeData` as parameter
- Returns CSV string

**`buildMarkdownExport()` - Lines 238-317 (~80 lines)**
- Same logic as main branch
- Takes `state` as parameter
- Returns markdown string

**Improvements over main:**
- Parameters instead of globals
- More testable
- Clearer dependencies

#### Import Implementation:

**`importTabsAndGroups()` - Lines 348-485 (~138 lines)**
- Extracted from monolithic import function
- Handles tab/group import logic only
- Returns result object with counts and errors
- Batches tab creation (10 at a time)

**Good:**
- Single responsibility (tabs and groups only)
- Proper error collection
- Batching for performance

**`importRules()` - Lines 487-514 (~28 lines)**
- Extracted from monolithic import
- Handles rule import with merge logic
- Updates existing rules or adds new ones
- Returns result object

**Good:**
- Separated concern
- Clear merge strategy (update existing by name, add new)
- Proper error handling

**`importSnoozedTabs()` - Lines 516-539 (~24 lines)**
- Extracted from monolithic import
- Handles snoozed tab import
- Skips restricted URLs
- Returns result object

**Good:**
- Separated concern
- Validates URLs
- Uses SnoozeService for initialization

**Main `importData()` - Lines 541-609 (~69 lines)**
- Orchestrates all import sub-functions
- Handles scope-specific logic (replace-all)
- Collects all results
- Much cleaner than 443-line version!

**Good:**
- Much shorter (69 vs 443 lines)
- Delegates to specialized functions
- Clearer control flow
- Better error aggregation

---

## Architectural Issues to Fix

### Issue 1: Duplicate Export/Import Logic

**Problem:**
- Background has full implementation (817 lines)
- Dashboard duplicates export UI and download logic (390 lines)
- Popup duplicates export logic (72 lines)
- Session has stubbed handlers (TODOs)
- Total duplication: ~450 lines of UI/download logic

**Impact:**
- Changes must be made in 3+ places
- Inconsistent behavior between surfaces
- Testing requires checking all implementations
- Bug fixes miss some locations

**Solution:**
1. Create `/services/ExportImportService.js` with all business logic
2. Background imports service, handles messages
3. Dashboard/Popup/Session send messages to background
4. Keep only thin UI layer in each surface (form collection, file handling)

### Issue 2: Global State Dependencies

**Problem:**
```javascript
// Current: Hidden dependencies
async function buildJSONExport(tabs, windows, groups, options) {
  // Uses state.rules, state.tabTimeData, state.settings (not in signature!)
  const rules = state.rules;
  const timeData = state.tabTimeData;
  // ...
}
```

**Impact:**
- Hard to test (requires global state setup)
- Unclear what data is needed
- Cannot use in different contexts
- Tight coupling to background service

**Solution:**
```javascript
// Better: Explicit parameters
export async function exportData(options, state, tabTimeData) {
  // All dependencies visible in signature
  // Can be tested with mock objects
  // Clear what's needed
}
```

**Status:** Feature branch partially fixes this but still passes `state` object

### Issue 3: Monolithic Import Function

**Problem:**
- Main branch: Single 443-line `importData()` function
- Handles tabs, groups, rules, snoozed, settings all in one place
- Hard to understand, maintain, test
- No single responsibility

**Impact:**
- Adding new import features is risky
- Can't test individual import types
- Error in one part can break everything
- Hard to add dry-run/preview capability

**Solution (Feature Branch):**
- Split into: `importTabsAndGroups()`, `importRules()`, `importSnoozedTabs()`
- Main `importData()` orchestrates (69 lines)
- Each function has clear responsibility
- Better error isolation

### Issue 4: No Service Abstraction

**Problem:**
- Export/import logic embedded in background service worker
- Cannot reuse in other contexts (tests, CLI tools, etc.)
- Difficult to version/upgrade
- Tied to Chrome Extension APIs

**Impact:**
- Cannot unit test without Chrome API mocks
- Cannot provide export/import to other tools
- Hard to migrate to different platform
- Logic mixed with API calls

**Solution:**
- Extract pure business logic to service
- Service takes data, returns data (no Chrome APIs)
- Background service worker wraps service with Chrome API calls
- Service can be tested independently

### Issue 5: Missing Error Recovery

**Problem:**
```javascript
// Current: No rollback on partial failure
for (const window of windows) {
  await createWindow(); // If this fails halfway, previous windows remain
}
```

**Impact:**
- Failed imports leave partial state
- No way to undo partial operations
- User has mixed old/new state
- Difficult to retry

**Solution:**
1. Validate before executing
2. Collect all operations first
3. Execute atomically where possible
4. Provide rollback/cleanup on failure

**Status:** Not implemented in either version

### Issue 6: Unclear Service Dependencies

**Problem:**
```javascript
// Feature branch still has coupling
export async function importData(data, options, state, loadRules, scheduler) {
  // Why does import need scheduler?
  // Why pass loadRules function?
  // What if state structure changes?
}
```

**Impact:**
- Hard to understand what import does
- Tight coupling to background service internals
- Cannot evolve independently
- Testing requires complex mocks

**Solution:**
- Use dependency injection pattern
- Create interfaces for dependencies
- Pass only data, not functions
- Return operations to execute (don't execute directly)

### Issue 7: No Dry-Run/Preview API

**Problem:**
- Cannot preview import before executing
- No way to show user "what will happen"
- All-or-nothing import
- Cannot validate safely

**Impact:**
- Users can't see import consequences
- Risk of unintended data loss
- No confirmation with details
- Testing requires actual imports

**Solution:**
```javascript
export async function previewImport(data, options, state) {
  // Validate and analyze without executing
  return {
    wouldCreate: { windows: 2, tabs: 150, groups: 12 },
    wouldSkip: { restrictedUrls: 5 },
    conflicts: { rules: ['rule-1 already exists'] },
    warnings: ['Importing 150 tabs may take time']
  };
}
```

**Status:** Not implemented

---

## Good Patterns to Keep

### 1. Service API Design (Feature Branch)

**Pattern:**
```javascript
export async function exportData(options, state, tabTimeData) {
  // Explicit parameters
  // Clear return value
  // No hidden dependencies
}
```

**Why it's good:**
- Testable with mock inputs
- Clear contract
- Can evolve independently
- Self-documenting

### 2. Function Decomposition (Feature Branch)

**Pattern:**
```javascript
// Main function orchestrates
export async function importData(data, options, state, loadRules, scheduler) {
  // Delegates to specialized functions
  const tabsResult = await importTabsAndGroups(tabs, groups, windows, scope, importGroups);
  const rulesResult = await importRules(rules, state, loadRules, scheduler);
  const snoozedResult = await importSnoozedTabs(snoozedTabs);

  // Aggregates results
  return { success, imported, errors };
}

// Specialized functions handle details
async function importTabsAndGroups(...) { }
async function importRules(...) { }
async function importSnoozedTabs(...) { }
```

**Why it's good:**
- Single responsibility per function
- Easier to understand
- Can test individual pieces
- Can reuse parts

### 3. Error Collection Pattern (Feature Branch)

**Pattern:**
```javascript
const result = {
  success: false,
  imported: { windows: 0, tabs: 0, groups: 0 },
  errors: [],
  warnings: []
};

try {
  // ... operations ...
  result.errors.push(...importResult.errors);
} catch (error) {
  result.errors.push(error.message);
}

result.success = result.errors.length === 0;
return result;
```

**Why it's good:**
- Doesn't fail fast (collects all errors)
- Provides detailed feedback
- Distinguishes errors vs warnings
- Can show partial success

### 4. Batching Pattern (Both Versions)

**Pattern:**
```javascript
const BATCH_SIZE = 10;
for (let i = 0; i < items.length; i += BATCH_SIZE) {
  const batch = items.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(async item => {
    // Process item
  }));
  // Delay between batches
  if (i + BATCH_SIZE < items.length) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
```

**Why it's good:**
- Prevents rate limiting
- Reduces memory usage
- Better user experience (progress feedback possible)
- More reliable

### 5. URL Validation Pattern (Both Versions)

**Pattern:**
```javascript
const RESTRICTED_PROTOCOLS = ['chrome://', 'edge://', 'about:', 'chrome-extension://'];

if (RESTRICTED_PROTOCOLS.some(proto => url.startsWith(proto))) {
  result.errors.push(`Skipped restricted URL: ${url}`);
  continue;
}
```

**Why it's good:**
- Chrome won't allow these URLs to be created
- Prevents errors during import
- Gives user clear feedback
- Can count/report restricted URLs

### 6. Options Pattern (Both Versions)

**Pattern:**
```javascript
async function exportData(options = {}) {
  const {
    scope = 'all-windows',
    format = 'json',
    includeRules = true,
    includeSnoozed = true,
    currentWindowId = null
  } = options;
  // Use destructured values
}
```

**Why it's good:**
- Clear defaults
- Named parameters (easier to use)
- Optional parameters
- Self-documenting

### 7. Human-Readable Fields (Both Versions)

**Pattern:**
```javascript
const exportData = {
  // Machine-readable
  created: '2025-01-15T10:30:00.000Z',
  createdAt: 1736936400000,

  // Human-readable (redundant but helpful)
  createdReadable: '2 hours ago',
  createdDateReadable: 'January 15, 2025 at 10:30 AM',

  // Both ID types
  id: 't12345',
  tabId: 12345
};
```

**Why it's good:**
- Users can read export files
- Can manually edit JSON exports
- Useful for debugging
- Documentation value

---

## Implementation Plan for Clean Merge

### Step 1: Audit Complete ✅
- [x] Found all export/import in main branch
- [x] Documented current behavior
- [x] Analyzed feature branch service
- [x] Identified architectural issues

### Step 2: Extract Service from Feature Branch

**Actions:**
1. Checkout feature branch: `git checkout feature/export-import-service`
2. Copy service file:
   ```bash
   cp tabmaster-pro/services/ExportImportService.js /tmp/ExportImportService.js
   ```
3. Checkout main: `git checkout main`
4. Review and place in correct location:
   - Option A: `/services/ExportImportService.js` (standalone)
   - Option B: `/services/execution/ExportImportService.js` (execution pattern)
   - **Recommendation:** Option A - export/import is unique enough

**Files to modify:**
- Copy: `/services/ExportImportService.js` (608 lines)

**Testing:**
- Verify service file has no syntax errors
- Check imports (SnoozeService path correct?)

### Step 3: Refactor Service to Remove Tight Coupling

**Current signature:**
```javascript
export async function exportData(options, state, tabTimeData)
export async function importData(data, options, state, loadRules, scheduler)
```

**Improved signature:**
```javascript
export async function exportData(options, dependencies) {
  const {
    tabs = null,    // if null, will query chrome.tabs
    windows = null, // if null, will query chrome.windows
    groups = null,  // if null, will query chrome.tabGroups
    rules = [],
    settings = {},
    statistics = {},
    tabTimeData = new Map(),
    snoozedTabs = null // if null, will query SnoozeService
  } = dependencies;
  // ...
}

export async function importData(data, options, dependencies) {
  const {
    onRuleImported = (rule) => {},  // callback for rule import
    onTabCreated = (tab) => {},     // callback for progress
  } = dependencies;
  // ...
}
```

**Benefits:**
- No global state access
- Can pass mock data for testing
- Clear what's needed
- Can evolve independently

**Files to modify:**
- `/services/ExportImportService.js` - refactor signatures

**Testing:**
- Update background integration to use new signature
- Ensure all data flows correctly

### Step 4: Update Background Service

**Current (lines 1355-1362):**
```javascript
case 'exportData':
  const exportResult = await exportData(request.options);
  sendResponse(exportResult);
  break;

case 'importData':
  const importResult = await importData(request.data, request.options);
  sendResponse(importResult);
  break;
```

**New:**
```javascript
import * as ExportImportService from './services/ExportImportService.js';

// In message handler:
case 'exportData': {
  const dependencies = {
    rules: state.rules,
    settings: state.settings,
    statistics: state.statistics,
    tabTimeData: state.tabTimeData,
    // tabs, windows, groups will be queried by service
  };
  const result = await ExportImportService.exportData(request.options, dependencies);
  sendResponse(result);
  break;
}

case 'importData': {
  const dependencies = {
    onRuleImported: (rule) => {
      state.rules.push(rule);
      scheduler.setupRule(rule);
    }
  };
  const result = await ExportImportService.importData(request.data, request.options, dependencies);
  if (result.success) {
    await loadRules(); // Reload after import
  }
  sendResponse(result);
  break;
}
```

**Actions:**
1. Add import statement at top of background-integrated.js
2. Replace `await exportData(...)` with service call
3. Replace `await importData(...)` with service call
4. Remove old exportData function (lines 1878-1911)
5. Remove old buildJSONExport function (lines 1913-2041)
6. Remove old buildCSVExport function (lines 2043-2084)
7. Remove old buildMarkdownExport function (lines 2086-2247)
8. Remove old importData function (lines 2253-2695)
9. Remove helper functions (getTimeAgo, getTimeUntil, getConditionsReadable, getActionsReadable)

**Lines removed:** ~817 lines
**Lines added:** ~30 lines (service integration)
**Net reduction:** ~787 lines

**Files to modify:**
- `/background-integrated.js` - remove export/import functions, add service integration

**Testing:**
- Test export from popup (should work unchanged)
- Test export from dashboard (should work unchanged)
- Test import from dashboard
- Verify all formats (JSON, CSV, Markdown)
- Verify all scopes (current-window, all-windows)

### Step 5: Update Dashboard to Use Background

**Current:**
- `dashboard/export-import.js` (390 lines) does everything
- Has its own export handler, file handling, import logic

**New:**
- Remove business logic
- Keep only UI (form collection, file handling, download)
- Route everything through background messages

**Actions:**
1. Keep `initializeExportImport()` - UI setup
2. Keep `updateTabCounts()` - UI state
3. Simplify `handleExport()` - just send message and download
4. Simplify `handleFileSelect()` - just validate and preview
5. Simplify `handleImport()` - just send message
6. Keep `resetImport()` - UI state
7. Keep `showNotification()` - UI feedback

**Example refactor:**
```javascript
// OLD (92 lines)
async function handleExport() {
  // Get options
  // Send message
  // Process response
  // Build blob
  // Create download
  // Show summary
}

// NEW (30 lines)
async function handleExport() {
  // Get options
  const response = await chrome.runtime.sendMessage({
    action: 'exportData',
    options: getExportOptions()
  });

  if (response.error) {
    showNotification('Export failed: ' + response.error, 'error');
    return;
  }

  // Download (shared utility)
  downloadExport(response, getExportFormat());
}

// Shared utility in dashboard/modules/core/utils.js
function downloadExport(data, format) {
  const { content, mimeType, extension } = formatExportData(data, format);
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const filename = `tabmaster-export-${new Date().toISOString().split('T')[0]}.${extension}`;

  chrome.downloads.download({ url, filename, saveAs: true });
}
```

**Lines reduced:** ~200 lines (keep ~190 for UI)

**Files to modify:**
- `/dashboard/export-import.js` - simplify to thin UI layer

**Testing:**
- Test export from dashboard (all formats, scopes)
- Test import from dashboard (all options)
- Verify drag & drop still works
- Verify preview shows correct counts

### Step 6: Update Popup to Remove Duplication

**Current:**
- `popup/popup.js` has `handleExport()` (lines 879-950, ~72 lines)
- Duplicates dashboard export logic

**New:**
- Extract shared download utility
- Reduce handleExport to ~20 lines

**Actions:**
1. Create shared utility: `/popup/modules/exportUtils.js`
2. Move download logic to utility
3. Simplify `handleExport()` to use utility
4. Consider: Do we need export UI in popup? (Dashboard has full UI)

**Option A: Keep simplified export in popup**
```javascript
async function handleExport() {
  const response = await chrome.runtime.sendMessage({
    action: 'exportData',
    options: { scope: 'all-windows', format: 'json' }
  });
  downloadExport(response, 'json');
}
```

**Option B: Remove from popup, redirect to dashboard**
```javascript
function openExportUI() {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html#export') });
}
```

**Recommendation:** Option B - Dashboard has full UI, popup should be lightweight

**Files to modify:**
- `/popup/popup.js` - remove export or redirect to dashboard

**Testing:**
- Test export button in popup
- Verify navigation to dashboard works

### Step 7: Implement Session Manager Export/Import

**Current:**
- Stubbed handlers (TODO placeholders)

**New:**
- Open modal like dashboard
- Route through background service

**Actions:**
1. Create modal HTML in session.html
2. Implement handlers to open modal
3. Modal reuses dashboard export-import.js (or shares component)
4. OR: Message background and background opens dashboard

**Recommendation:** Use dashboard component (don't duplicate)

**Implementation:**
```javascript
async function handleExport() {
  // Open dashboard in export mode
  const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html#export');
  window.open(dashboardUrl, '_blank');
}

async function handleImport() {
  // Open dashboard in import mode
  const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html#import');
  window.open(dashboardUrl, '_blank');
}
```

**Files to modify:**
- `/session/session.js` - replace TODO with implementation

**Testing:**
- Click export in session manager
- Verify dashboard opens
- Click import in session manager
- Verify dashboard opens

### Step 8: Add Service Tests

**New files to create:**
```
/tests/services/ExportImportService.test.js
```

**Test cases:**
1. **Export JSON**
   - All windows
   - Current window
   - With/without rules, snoozed, settings
   - Human-readable fields present
2. **Export CSV**
   - Correct columns
   - Proper escaping
   - No snoozed tabs
3. **Export Markdown**
   - Readable format
   - All sections present
4. **Import**
   - Valid JSON import
   - Invalid format rejection
   - Restricted URL filtering
   - Batching behavior
   - Error collection

**Actions:**
1. Create test file
2. Write unit tests for each export format
3. Write unit tests for import validation
4. Write integration tests for round-trip (export → import)
5. Run tests: `npm test`

**Files to create:**
- `/tests/services/ExportImportService.test.js`

### Step 9: Documentation

**Update files:**
1. `/docs/EXPORT-IMPORT.md` - Update with service architecture
2. `/CLAUDE.md` - Add export/import service to architecture
3. `/README.md` - Update feature list if needed

**Actions:**
1. Document service API
2. Document message protocol (UI → background → service)
3. Document export formats
4. Document import options
5. Add examples

**Files to modify:**
- `/docs/EXPORT-IMPORT.md`
- `/CLAUDE.md`
- `/README.md` (if needed)

### Step 10: Cleanup and Final Testing

**Actions:**
1. Run full test suite: `npm test`
2. Test extension manually:
   - Export from popup → verify download
   - Export from dashboard → all formats
   - Import to dashboard → all options
   - Session manager → redirects work
3. Check for unused code:
   ```bash
   # Search for old function names
   grep -r "buildJSONExport\|buildCSVExport\|buildMarkdownExport" tabmaster-pro/
   ```
4. Remove any remaining duplicates
5. Verify no console errors
6. Verify no broken imports

**Testing checklist:**
- [ ] Extension loads without errors
- [ ] Export JSON works (popup)
- [ ] Export JSON works (dashboard)
- [ ] Export CSV works
- [ ] Export Markdown works
- [ ] Export current window works
- [ ] Export all windows works
- [ ] Import new windows works
- [ ] Import current window works
- [ ] Import with groups works
- [ ] Import with rules works
- [ ] Import with snoozed works
- [ ] Import skips restricted URLs
- [ ] Session manager export redirects
- [ ] Session manager import redirects
- [ ] No duplicate code remains
- [ ] All tests pass

---

## Estimated Complexity

**Time Estimate:** 4-6 hours

**Breakdown:**
- Step 2 (Extract service): 30 minutes
- Step 3 (Refactor service): 1 hour
- Step 4 (Update background): 1 hour
- Step 5 (Update dashboard): 1 hour
- Step 6 (Update popup): 30 minutes
- Step 7 (Session manager): 30 minutes
- Step 8 (Tests): 1 hour
- Step 9 (Documentation): 30 minutes
- Step 10 (Testing): 1 hour

**Files to Modify:** 6 files
- `/background-integrated.js` (remove 817 lines, add 30)
- `/dashboard/export-import.js` (simplify 390 → 190 lines)
- `/popup/popup.js` (remove ~72 lines or redirect)
- `/session/session.js` (implement ~20 lines)
- `/CLAUDE.md` (document)
- `/docs/EXPORT-IMPORT.md` (update)

**Files to Create:** 2 files
- `/services/ExportImportService.js` (608 lines)
- `/tests/services/ExportImportService.test.js` (new)

**Lines Removed:** ~1,279 lines (duplicates)
**Lines Added:** ~638 lines (service + integration)
**Net Reduction:** ~641 lines

**Risk Level:** Medium
- Service pattern is proven
- Existing implementations work (can reference)
- Message passing is unchanged
- Chrome APIs stay the same
- Main risk: Missing edge cases in refactor

**Mitigation:**
- Thorough testing before merge
- Keep feature branch for reference
- Test each step incrementally
- Verify round-trip (export → import) works

---

## Key Takeaways

1. **Duplication is expensive** - 817 lines in background + 390 in dashboard + 72 in popup = maintenance nightmare

2. **Services enable reuse** - One implementation, multiple surfaces

3. **Explicit parameters beat globals** - Testability and clarity

4. **Function decomposition matters** - 443 lines → 69 lines main + 3 helpers

5. **Error collection > fail fast** - Users need to see all issues

6. **Batching is essential** - Chrome APIs have rate limits

7. **Human-readable exports** - Users want to read/edit exports

8. **Separation of concerns** - UI layer should be thin

9. **Feature branch got it mostly right** - Just needs final polish

10. **Testing validates the refactor** - Write tests before removing old code

---

## Chrome Extension Constraints

### No Dynamic Imports ⚠️
**NEVER use `import()` or `await import()`** - Will crash Chrome

✅ **CORRECT:**
```javascript
import * as ExportImportService from './services/ExportImportService.js';
```

❌ **WRONG:**
```javascript
const { exportData } = await import('./services/ExportImportService.js'); // CRASHES!
```

### Static Imports Only
All imports must be at the top of the file, before any code execution.

---

## Next Steps

1. **Review this document** with team/stakeholders
2. **Decide on approach** - Approve implementation plan
3. **Execute Step 2** - Extract service from feature branch
4. **Test incrementally** - Each step should work before moving on
5. **Write tests early** - Step 8 can happen anytime after Step 2
6. **Document as you go** - Update docs with each change
7. **Final review** - Before merging to main

---

**Document Status:** Complete
**Last Updated:** 2025-01-15
**Author:** Claude (Sonnet 4.5)
**Related:** Phase 4 (Tab Suspension), EXPORT-IMPORT.md, ARCHITECTURE.md
