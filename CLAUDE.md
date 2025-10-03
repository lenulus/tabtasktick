# TabMaster Pro - Architecture & Implementation Guide

## Core Architecture Principles

### Non-Negotiable Goals

1. **One Behavior**: Same functionality across all surfaces (dashboard/popup, background/worker, rules runner)
2. **Services-First**: All logic lives in shared services; surfaces are thin presentation layers
3. **No Magic**: Every side effect is an explicit call; every option is a parameter
4. **Deterministic**: Same inputs → same outputs; handle collisions predictably
5. **Maintainable**: Small PRs, strong tests, clear docs, remove dead code immediately

### Implementation Rules

- **If two places have similar logic, it MUST move to `/lib/services/*` and both call it**
- **NO duplicate implementations** - everything has one source of truth
- **Surfaces (popup, dashboard, etc) are THIN** - they only handle UI, not business logic
- **Services handle ALL business logic** - surfaces just call services
- **Every option is explicit** - no hidden defaults or magic behavior
- **Dead code is deleted immediately** - not commented out or left around

### Directory Structure

```
/lib/services/           # ALL shared business logic
  ├── tabGroupingService.js  # Single source for grouping logic
  ├── snoozeService.js       # Single source for snooze logic
  └── ...                    # Other centralized services

/popup/                  # THIN presentation layer
/dashboard/              # THIN presentation layer
/background.js           # THIN coordinator - calls services
/lib/engine.js          # Rules engine - calls services
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

## Service Pattern Example

```javascript
// WRONG - logic in multiple places
// popup.js
async function groupTabs() {
  const tabs = await chrome.tabs.query({});
  // grouping logic here...
}

// dashboard.js
async function groupTabs() {
  const tabs = await chrome.tabs.query({});
  // similar grouping logic here...
}

// RIGHT - single service
// lib/services/tabGroupingService.js
export async function groupTabsByDomain(scope, targetWindowId) {
  // ALL grouping logic here
}

// popup.js
import { groupTabsByDomain } from '/lib/services/tabGroupingService.js';
await groupTabsByDomain('TARGETED', windowId);

// dashboard.js
import { groupTabsByDomain } from '/lib/services/tabGroupingService.js';
await groupTabsByDomain('TARGETED', windowId);
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