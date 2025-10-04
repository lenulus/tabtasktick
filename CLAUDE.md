# TabMaster Pro - Architecture & Implementation Guide

## Core Architecture Principles

### Non-Negotiable Goals

1. **One Behavior**: Same functionality across all surfaces (dashboard/popup, background/worker, rules runner)
2. **Services-First**: All logic lives in shared services; surfaces are thin presentation layers
3. **No Magic**: Every side effect is an explicit call; every option is a parameter
4. **Deterministic**: Same inputs → same outputs; handle collisions predictably
5. **Maintainable**: Small PRs, strong tests, clear docs, remove dead code immediately
6. **Separation of Concerns**: Selection (what to act on) is separate from Execution (how to act)

### Implementation Rules

- **If two places have similar logic, it MUST move to `/services/*` and both call it**
- **NO duplicate implementations** - everything has one source of truth
- **Surfaces (popup, dashboard, etc) are THIN** - they only handle UI, not business logic
- **Services handle ALL business logic** - surfaces just call services
- **Every option is explicit** - no hidden defaults or magic behavior
- **Dead code is deleted immediately** - not commented out or left around

### Separation of Concerns Pattern

- **UI Layer**: Handles user-based selection
  - User clicks, checkbox selections, list selections
  - Returns selected entity IDs
  - Stays THIN - no business logic

- **Selection Services**: Handle bulk selection by filtering (business logic)
  - Filtering patterns (all ungrouped, by domain, by age, duplicates, etc.)
  - Return arrays of entity IDs
  - Example: `selectUngroupedTabs(windowId)`

- **Execution Services**: Handle operations on provided entities
  - Take entity IDs and perform operations
  - No selection logic, only execution
  - Example: `groupTabs(tabIds, options)`

- **Usage**:
  - **Bulk operations**: UI → Selection Service (filtering) → Execution Service
  - **User selections**: UI (user picks items) → Execution Service
  - **Rules engine**: Does matching (custom filtering) → Execution Service

### Directory Structure

```
/services/               # ALL shared business logic
  ├── selection/         # Selection services (what to act on)
  │   ├── selectTabs.js      # Tab selection patterns
  │   ├── selectBookmarks.js # Bookmark selection patterns
  │   └── ...
  ├── execution/         # Execution services (how to act)
  │   ├── groupTabs.js       # Tab grouping execution
  │   ├── snoozeTabs.js      # Tab snoozing execution
  │   └── ...
  └── TabGrouping.js     # Current combined service (to be split)

/popup/                  # THIN presentation layer
/dashboard/              # THIN presentation layer
/background.js           # THIN coordinator - calls services
/lib/engine.js          # Rules engine - does selection, calls execution services
```

## Project Overview

TabMaster Pro is a Chrome extension for advanced tab management, built with vanilla JavaScript (no frameworks). The extension helps users manage 200+ tabs efficiently with features like snoozing, grouping, bulk operations, and analytics.

## Tech Stack & Constraints

- **Frontend**: Vanilla JavaScript, HTML5, CSS3 (no frameworks)
- **Styling**: Modern CSS with Grid, Flexbox, Custom Properties
- **APIs**: Chrome Extensions Manifest V3 APIs
- **Build**: No build tools needed, direct file loading
- **Storage**: chrome.storage.local for persistence
- **Charts**: Chart.js (via CDN) for analytics

## ⚠️ CRITICAL: Chrome Extension Limitations - DO NOT VIOLATE

### NEVER Use Dynamic Imports - They Will CRASH Chrome
**DO NOT USE `import()` or `await import()` ANYWHERE IN THE EXTENSION**

Chrome extensions do NOT support dynamic imports in service workers or content scripts. Using them will cause the extension to crash Chrome entirely, closing all windows.

❌ **NEVER DO THIS:**
```javascript
// This will CRASH Chrome and close all windows
const { groupTabs } = await import('../services/execution/groupTabs.js');
```

✅ **ALWAYS DO THIS:**
```javascript
// Static imports at the top of the file only
import { groupTabs } from '../services/execution/groupTabs.js';
```

### Other Critical Rules
- All imports MUST be static and at the top of the file
- Service workers cannot use dynamic module loading
- NEVER modify working production code directly - create parallel implementations
- Test changes incrementally - one small change at a time
- Keep original working files intact until new versions are proven

## Service Pattern Example

```javascript
// WRONG - mixing selection and execution
// popup.js
async function groupTabs() {
  const tabs = await chrome.tabs.query({ groupId: -1 }); // selection
  for (const tab of tabs) {
    // grouping logic here... (execution)
  }
}

// WRONG - duplicate selection logic
// dashboard.js
async function groupTabs() {
  const tabs = await chrome.tabs.query({ groupId: -1 }); // duplicate selection
  // grouping logic here...
}

// RIGHT - separated concerns
// services/selection/selectTabs.js
export async function selectUngroupedTabs(windowId) {
  const tabs = await chrome.tabs.query({ windowId, groupId: -1 });
  return tabs.map(t => t.id);
}

// services/execution/groupTabs.js
export async function groupTabs(tabIds, options) {
  // ONLY execution logic here
  // No selection, just group the provided tabs
}

// popup.js - bulk selection via filtering service
import { selectUngroupedTabs } from '/services/selection/selectTabs.js';
import { groupTabs } from '/services/execution/groupTabs.js';

const tabIds = await selectUngroupedTabs(windowId); // service does filtering
await groupTabs(tabIds, { byDomain: true });

// session.js - user-based selection at UI level
import { groupTabs } from '/services/execution/groupTabs.js';

const selectedTabIds = getCheckedTabs(); // UI tracks what user selected
await groupTabs(selectedTabIds, { byDomain: true });
```

## Testing Commands

```bash
# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Development Workflow

1. Identify duplicate/similar logic across files
2. Extract to service in `/lib/services/`
3. Update all callers to use the service
4. Delete the old implementations
5. Test with 200+ tabs scenario
6. Commit with clear message

## Performance Targets

- Popup load: < 100ms
- Tab list render: < 200ms for 200 tabs
- Search response: < 50ms
- Memory usage: < 50MB for 500 tabs
- Dashboard load: < 500ms

## Important Notes

- **NEVER** create duplicate implementations
- **ALWAYS** extract shared logic to services
- **DELETE** dead code immediately
- Test with 200+ tabs to ensure performance
- Keep accessibility in mind (keyboard navigation, ARIA)
- Follow existing code style (2-space indent, semicolons)
- Document complex logic with comments