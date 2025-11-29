# TabMaster Pro - TODO

## Current Priority

### Implement Simple Logging System

**Status**: Planned - Ready for implementation
**Documentation**: [/docs/logging-plan-v2.md](./tabmaster-pro/docs/logging-plan-v2.md)
**Blocker For**: Production deployment (console.log cleanup)

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

**Phase 1: Console Capture Utility**
- [ ] Create `/services/utils/console-capture.js`
  - Surface detection from location.pathname
  - Console override (debug/log/info/warn/error)
  - Log buffer (500 entries max)
  - Cached effectiveLevel (no storage query per log)
  - `safeAsyncListener` for storage changes
  - Initialization guard (prevent double-init)
  - Exports: `initConsoleCapture()`, `getRecentLogs()`, `getSurface()`, `getEffectiveLevel()`
- [ ] Write unit tests (`/tests/console-capture.test.js`)
  - Level filtering
  - Surface detection
  - Storage change handling
  - Initialization guard

**Phase 2: Developer Mode in Settings**
- [ ] Add Developer Mode UI to options page
  - Checkbox toggle for Developer Mode
  - Log level dropdown (visible when ON)
  - Store in chrome.storage.local: `{ developerMode, developerLogLevel }`
- [ ] Wire up event handlers

**Phase 3: Popup UI Changes**
- [ ] Hide/show debug features based on Developer Mode
  - "Copy Debug Logs" button
  - "Open Test Panel" button
- [ ] Read developerMode from storage on popup load

**Phase 4: Integration**
- [ ] Import and init in each surface:
  - `background-integrated.js`
  - `popup/popup.js`
  - `dashboard/dashboard.js`
  - `sidepanel/sidepanel.js`
  - `options/options.js`
- [ ] Update `getRecentLogs` message handler in background

**Phase 5: Verification**
- [ ] Test Developer Mode ON/OFF behavior
- [ ] Test log level changes
- [ ] Verify no performance regression
- [ ] Verify background logs retrievable via messaging

---

### Success Criteria

- [ ] Developer Mode OFF: only WARN/ERROR captured, debug buttons hidden
- [ ] Developer Mode ON: configurable level, debug buttons visible
- [ ] Each surface auto-detects and tags logs
- [ ] No storage queries during log capture (cached level)
- [ ] No messaging overhead (each surface has own buffer)
- [ ] Background logs accessible via getRecentLogs message
- [ ] Test panel in sidepanel (doesn't interfere with tests)

---

## Archived

- **[TODO-cleanup.md](./TODO-cleanup.md)** - Architectural remediation phases (Phase 1-4), branching strategy, version history
- **[/docs/logger-service-plan.md](./tabmaster-pro/docs/logger-service-plan.md)** - Original over-engineered plan (reverted)
