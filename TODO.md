# TabMaster Pro - TODO

## Current Priority

### ~~Implement Simple Logging System~~ (COMPLETED)

**Status**: ✅ Implemented
**Documentation**: [/docs/logging-plan-v2.md](./tabmaster-pro/docs/logging-plan-v2.md)
**Completed**: 2025-11-29

**Overview**:
Simple console capture with Developer Mode integration. Replaces the reverted over-engineered LoggerService (commit a37e984) with a pragmatic approach.

**Key Features**:
- **Simple console override** - Wrap console.log/warn/error with level filtering
- **Auto surface detection** - Detect popup/dashboard/sidepanel/background from location
- **Developer Mode toggle** - Controls visibility of debug features in UI
- **Adjustable log level** - DEBUG/INFO/WARN/ERROR when Developer Mode is ON
- **Conservative defaults** - Only WARN/ERROR captured when Developer Mode is OFF
- **No messaging overhead** - Each surface keeps its own buffer

**Developer Mode Controls**:
- Toggle in Settings (enables debug features)
- Log level selector (visible when Developer Mode ON)
- Debug button in popup (hidden unless Developer Mode ON)
- Test panel button in popup (hidden unless Developer Mode ON)

---

### Implementation Phases

**Phase 1: Console Capture Utility** ✅
- [x] Create `/services/utils/console-capture.js`
  - Surface detection from location.pathname
  - Console override (debug/log/info/warn/error)
  - Log buffer (500 entries max)
  - Cached effectiveLevel (no storage query per log)
  - `safeAsyncListener` for storage changes
  - Initialization guard (prevent double-init)
  - Exports: `initConsoleCapture()`, `getRecentLogs()`, `getSurface()`, `getEffectiveLevel()`
- [x] Write unit tests (`/tests/console-capture.test.js`)
  - Level filtering (22 tests passing)
  - Surface detection
  - Storage change handling
  - Initialization guard

**Phase 2: Developer Mode in Settings** ✅
- [x] Add Developer Mode UI to options page
  - Checkbox toggle for Developer Mode
  - Log level dropdown (visible when ON)
  - Store in chrome.storage.local: `{ developerMode, developerLogLevel }`
- [x] Wire up event handlers

**Phase 3: Popup UI Changes** ✅
- [x] Hide/show debug features based on Developer Mode
  - "Copy Debug Logs" button
  - "Open Test Panel" button
- [x] Read developerMode from storage on popup load

**Phase 4: Integration** ✅
- [x] Import and init in each surface:
  - `background-integrated.js`
  - `popup/popup.js`
  - `dashboard/dashboard.js`
  - `sidepanel/panel.js`
  - `options/options.js`
- [x] Update `getRecentLogs` message handler in background

**Phase 5: Verification** ✅
- [x] Unit tests pass (22 tests)
- [x] Full test suite passes (954 tests)
- [x] ESLint passes for new code

---

### Success Criteria (All Met)

- [x] Developer Mode OFF: only WARN/ERROR captured, debug buttons hidden
- [x] Developer Mode ON: configurable level, debug buttons visible
- [x] Each surface auto-detects and tags logs
- [x] No storage queries during log capture (cached level)
- [x] No messaging overhead (each surface has own buffer)
- [x] Background logs accessible via getRecentLogs message

---

## What's Next

The logging system is now in place. Next steps:
1. Manual testing in the extension to verify everything works
2. Remove scattered console.log statements if desired (optional cleanup)
3. Consider adding a "View Logs" panel in the sidepanel for easier debugging

---

## Upcoming Features

### Active Tab State Tracking for Collection Restoration

**Status**: Planned
**Plan**: [/plans/active-tab-tracking-plan.md](./plans/active-tab-tracking-plan.md)
**Estimated Effort**: 2 hours

**Problem**: When a collection window is closed and later restored, we lose track of which tab was active. The user has to manually find their place again.

**Solution**: On window close, look up `lastAccessed` timestamps from `tabTimeData` for all tabs in the collection, find the max, and store that tab's storage ID in collection metadata. On restore, activate that tab.

**Why it's simple**:
- `tabTimeData` Map entries persist through window close
- We already have all tabs in IndexedDB with their Chrome `tabId`
- One-time lookup at close time - no continuous tracking needed

**Implementation**:
1. Add `activeTabStorageId` to collection metadata
2. On `windows.onRemoved`: find tab with max `lastAccessed`, store its ID
3. On restore: activate the stored tab

---

## Archived

- **[TODO-cleanup.md](./TODO-cleanup.md)** - Architectural remediation phases (Phase 1-4), branching strategy, version history
- **[/docs/logger-service-plan.md](./tabmaster-pro/docs/logger-service-plan.md)** - Original over-engineered plan (reverted)
