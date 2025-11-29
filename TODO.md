# TabMaster Pro - TODO

## Current Priority

### Implement Global Logging System

**Status**: Planned - Ready for implementation
**Documentation**: [/docs/logger-service-plan.md](./docs/logger-service-plan.md)
**Blocker For**: Production deployment (console.log cleanup)
**Architecture Review**: Completed 2025-01-29 (see below)

**Overview**:
Create global LoggerService with Developer Mode integration to replace scattered console.log statements with a proper logging system.

**Key Features**:
- **Dynamic scope registration** - Scopes auto-register on first use (no manual registry)
- **Developer Mode integration** - Logging UI only visible when enabled in Settings
- **Log levels** - DEBUG, INFO, WARN, ERROR with per-scope configuration
- **Ring buffer** - Last 1000 logs for diagnostics
- **Configuration persistence** - Settings survive service worker restarts

**Developer Mode Controls**:
- Settings panel "Developer Settings" section (hidden by default)
- Logging configuration UI (visible when Developer Mode enabled)
- Debug button in popup (hidden unless Developer Mode enabled)
- Test panel access (hidden unless Developer Mode enabled)

---

### Architecture Review Findings (MUST ADDRESS)

**Critical Issues** (fix before/during implementation):

1. **`shouldLog()` must be synchronous** - The plan shows async, but this causes performance issues and non-deterministic behavior. Developer mode cache must be pre-loaded and kept in sync via storage listener.

2. **Add error boundary to `Logger.log()`** - Logging failures should NEVER crash business logic. Wrap in try-catch with silent fail.

3. **Remove existing console override** - `background-integrated.js` (lines 124-151) has a console capture mechanism that must be removed when LoggerService takes over.

**Missing Considerations** (add to implementation):

- **Service worker restart handling** - Use `ensureInitialized()` pattern (like SnoozeService)
- **Buffer persistence** - Ring buffer is ephemeral; ERROR logs should persist to storage immediately
- **Scope validation** - Add format validation in `getLogger()` (lowercase, dot-separated)
- **Test isolation** - Add `__setTestConfig()` for unit tests to override config without async storage

---

### Implementation Phases (Revised)

**Phase 1: Core + UI Foundation**
- [ ] Create `/services/utils/LoggerService.js`
  - Logger class with debug/info/warn/error methods
  - **Synchronous** `shouldLog()` with cached dev mode state
  - Error boundary in `log()` method (silent fail)
  - Ring buffer implementation
  - Console output formatting with colors
  - Configuration persistence to chrome.storage
  - `ensureInitialized()` pattern for service worker restarts
  - Scope name validation (warn on invalid format)
- [ ] Add Developer Mode to Settings panel
  - Create "Developer Settings" section
  - Add toggle for Developer Mode
  - Wire to chrome.storage.local
- [ ] Add basic logging configuration UI
  - Global level selector
  - Scope override management
  - View/export/clear logs buttons
- [ ] Write unit tests
  - Level filtering (global and per-scope)
  - Scope registration
  - Buffer behavior (ring buffer overflow)
  - Configuration persistence
  - Developer mode integration (sync behavior)

**Phase 2: Critical Path Migration**
- [ ] Background script (`background-integrated.js`)
  - Scopes: `background`, `background.messages`, `background.alarms`
  - **Remove existing console override (lines 124-151)**
  - Replace console.log with logger calls
- [ ] Rules Engine (`lib/engine.v2.services.js`)
  - Scopes: `rules`, `rules.matching`, `rules.actions`
- [ ] SnoozeService (`services/execution/SnoozeService.js`)
  - Scopes: `snooze`, `snooze.alarm`
- [ ] WindowService (`services/execution/WindowService.js`)
  - Scope: `windows`
- [ ] Collection Services (`services/execution/Collection*.js`)
  - Scopes: `collections`, `collections.sync`, `collections.import`
- [ ] Tab Services (`services/execution/Tab*.js`)
  - Scopes: `tabs`, `tabs.grouping`, `tabs.dedup`
- [ ] Storage utilities (`services/utils/storage-queries.js`)
  - Scope: `storage`

**Phase 3: UI Layer Migration**
- [ ] Dashboard modules (`dashboard/modules/`)
  - Scopes: `ui.dashboard`, `ui.dashboard.views`, etc.
- [ ] Popup (`popup/popup.js`)
  - Scope: `ui.popup`
  - Wire debug button to Developer Mode visibility
  - Enhance debug info with recent logs
- [ ] Side panel (`sidepanel/`)
  - Scope: `ui.sidepanel`

**Phase 4: Verification & Polish**
- [ ] Verify no console.log calls remain
  - Run: `grep -r "console\.log" --include="*.js" tabmaster-pro/`
  - Only console.error for critical production errors allowed
- [ ] Performance benchmarking
  - Target: < 1ms overhead per log call
  - Benchmark buffer operations
- [ ] Documentation
  - Update README with logging instructions
  - Add developer guide for using LoggerService
  - Document scope naming conventions

---

### Success Criteria

- [ ] No console.log in production code paths
- [ ] All services use LoggerService
- [ ] Scopes register dynamically
- [ ] Developer Mode controls logging visibility
- [ ] Settings panel has logging configuration UI
- [ ] Debug button respects Developer Mode
- [ ] Test panel hidden unless Developer Mode enabled
- [ ] `shouldLog()` is synchronous (verified)
- [ ] Error boundary prevents logging from crashing app
- [ ] Performance < 1ms overhead per log call

---

## Archived

- **[TODO-cleanup.md](./TODO-cleanup.md)** - Architectural remediation phases (Phase 1-4), branching strategy, version history
