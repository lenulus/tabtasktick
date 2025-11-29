# LoggerService Implementation Plan

## Overview

Global logging system for TabMaster Pro with dynamic scope registration, log levels, and Developer Mode integration.

**Design Source**: Architecture-guardian review (Session: 2025-01-29)

## Core Requirements

### 1. Services-First Architecture
- Single source of truth for logging configuration
- Service located at `/services/utils/LoggerService.js`
- No console.log statements in production code paths
- All logging goes through LoggerService

### 2. Dynamic Scope Registration
Scopes register themselves automatically on first use:

```javascript
// Auto-registers scope on first call
const logger = getLogger('rules.matching');
logger.info('Rule matched', { tabCount: 5 });

// No manual scope definition required
// No central registry to maintain
```

**Benefits**:
- Zero configuration overhead
- Scopes emerge naturally from codebase structure
- No central list to keep in sync
- Easy to refactor (scope names just change)

### 3. Developer Mode Integration

**Settings Panel** (`dashboard/modules/views/settings.js`):
```javascript
{
  "developerMode": {
    "enabled": false,  // OFF by default for end users
    "features": {
      "testPanel": true,      // Show test panel link
      "logConfig": true,      // Show logging configuration UI
      "debugButton": true,    // Show debug button in popup
      "consoleOutput": true   // Enable console.log output
    }
  }
}
```

**Logging Behavior**:
- **Developer Mode OFF**: Only WARN and ERROR logs to console
- **Developer Mode ON**: Respects configured log levels (DEBUG, INFO, WARN, ERROR)

**UI Integration**:
- Settings panel shows "Developer Settings" section
- Logging configuration only visible when Developer Mode enabled
- Test panel link hidden unless Developer Mode enabled
- Debug button in popup hidden unless Developer Mode enabled

## API Design

### Core API

```javascript
import { getLogger } from './services/utils/LoggerService.js';

// Get logger for a scope (auto-registers)
const logger = getLogger('snooze');

// Log at different levels
logger.debug('Detailed debug info', { tabIds: [1, 2, 3] });
logger.info('Operation completed', { duration: 123 });
logger.warn('Unexpected state', { expected: 'foo', actual: 'bar' });
logger.error('Operation failed', { error: err.message, stack: err.stack });
```

### Configuration API

```javascript
import * as LoggerService from './services/utils/LoggerService.js';

// Initialize (call once at startup)
await LoggerService.initialize();

// Update configuration (persists to storage)
await LoggerService.updateConfig({
  globalLevel: LogLevel.DEBUG,
  scopes: {
    'rules': LogLevel.DEBUG,
    'snooze': LogLevel.INFO
  }
});

// Get recent logs for diagnostics
const logs = LoggerService.getRecentLogs({
  scope: 'rules',
  level: LogLevel.ERROR,
  limit: 50
});

// Get statistics
const stats = LoggerService.getLogStats();
// Returns: { totalLogs, byLevel, byScope, oldestLog, newestLog }
```

## Log Levels

```javascript
export const LogLevel = {
  DEBUG: 0,   // Verbose debugging information
  INFO: 1,    // General informational messages
  WARN: 2,    // Warning messages (always shown)
  ERROR: 3,   // Error messages (always shown)
  OFF: 4      // Disable logging for a scope
};
```

## Architecture

### Core Components

```javascript
// /services/utils/LoggerService.js

// Configuration
const DEFAULT_CONFIG = {
  enabled: true,
  globalLevel: LogLevel.INFO,
  scopes: {},  // Empty - scopes auto-register
  bufferSize: 1000,
  persistBuffer: false,
  formatTimestamps: true,
  includeStackTrace: true
};

// Logger class (created per scope)
class Logger {
  constructor(scope) {
    this.scope = scope;
  }

  debug(message, data) { this.log(LogLevel.DEBUG, message, data); }
  info(message, data) { this.log(LogLevel.INFO, message, data); }
  warn(message, data) { this.log(LogLevel.WARN, message, data); }
  error(message, data) { this.log(LogLevel.ERROR, message, data); }

  log(level, message, data) {
    if (!shouldLog(this.scope, level)) return;

    const entry = createLogEntry(level, this.scope, message, data);
    addToBuffer(entry);
    outputToConsole(entry);

    if (level >= LogLevel.ERROR) {
      persistCriticalLog(entry);
    }
  }
}

// Factory function (public API)
export function getLogger(scope) {
  if (!state.loggers.has(scope)) {
    state.loggers.set(scope, new Logger(scope));
    // Auto-register scope with default level
    if (!state.config.scopes[scope]) {
      state.config.scopes[scope] = state.config.globalLevel;
    }
  }
  return state.loggers.get(scope);
}
```

### Developer Mode Integration

```javascript
async function shouldLog(scope, level) {
  // Check if developer mode is enabled
  const devMode = await isDeveloperModeEnabled();

  if (!devMode && level < LogLevel.WARN) {
    return false;  // Only WARN/ERROR in production
  }

  // Check global level
  if (level < state.config.globalLevel) return false;

  // Check scope-specific level
  const scopeLevel = state.config.scopes[scope] || state.config.globalLevel;
  if (level < scopeLevel) return false;

  return true;
}

// Cache developer mode state for performance
let devModeCache = null;

async function isDeveloperModeEnabled() {
  if (devModeCache === null) {
    const { developerMode } = await chrome.storage.local.get('developerMode');
    devModeCache = developerMode?.enabled || false;
  }
  return devModeCache;
}

// Invalidate cache when developer mode changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.developerMode) {
    devModeCache = changes.developerMode.newValue?.enabled || false;
  }
});
```

### Ring Buffer Implementation

```javascript
const state = {
  config: { ...DEFAULT_CONFIG },
  loggers: new Map(),
  buffer: [],
  bufferIndex: 0,
  initialized: false
};

function addToBuffer(entry) {
  if (state.buffer.length < state.config.bufferSize) {
    state.buffer.push(entry);
  } else {
    // Circular buffer - overwrite oldest
    state.buffer[state.bufferIndex] = entry;
    state.bufferIndex = (state.bufferIndex + 1) % state.config.bufferSize;
  }
}

export function getRecentLogs(options = {}) {
  const { limit = 100, scope = null, level = null, since = null } = options;

  let logs = [...state.buffer];

  if (scope) {
    logs = logs.filter(log => log.scope.startsWith(scope));
  }

  if (level !== null) {
    logs = logs.filter(log => log.level >= level);
  }

  if (since) {
    logs = logs.filter(log => log.timestamp >= since);
  }

  return logs.slice(-limit);
}
```

### Console Output Formatting

```javascript
function outputToConsole(entry) {
  const { level, scope, message, data, timestamp } = entry;

  // Format: [12:34:56] [INFO] [rules.matching] Message
  const prefix = `[${formatTime(timestamp)}] [${getLevelName(level)}] [${scope}]`;

  const method = getConsoleMethod(level);
  const style = getPrefixStyle(level);

  if (data) {
    console[method](`%c${prefix}%c ${message}`, style, 'color: inherit', data);
  } else {
    console[method](`%c${prefix}%c ${message}`, style, 'color: inherit');
  }
}

function getPrefixStyle(level) {
  const styles = {
    [LogLevel.DEBUG]: 'color: #888',
    [LogLevel.INFO]: 'color: #4A90E2',
    [LogLevel.WARN]: 'color: #F5A623; font-weight: bold',
    [LogLevel.ERROR]: 'color: #D0021B; font-weight: bold'
  };
  return styles[level] || '';
}

function getConsoleMethod(level) {
  if (level >= LogLevel.ERROR) return 'error';
  if (level >= LogLevel.WARN) return 'warn';
  if (level >= LogLevel.INFO) return 'info';
  return 'log';
}
```

## Settings Panel UI

### Developer Settings Section

```html
<section class="settings-section">
  <h2>Developer Settings</h2>

  <!-- Developer Mode Toggle -->
  <div class="setting-item">
    <label>
      <input type="checkbox" id="developerModeToggle">
      Enable Developer Mode
    </label>
    <p class="setting-description">
      Enables advanced features: test panel, logging configuration, and debug tools.
    </p>
  </div>

  <!-- Developer Features (hidden unless Developer Mode enabled) -->
  <div id="devModeFeatures" style="display: none">

    <!-- Logging Configuration -->
    <div class="setting-group">
      <h3>Logging Configuration</h3>

      <div class="setting-item">
        <label for="globalLogLevel">Global Log Level</label>
        <select id="globalLogLevel">
          <option value="0">DEBUG (Verbose)</option>
          <option value="1" selected>INFO (Normal)</option>
          <option value="2">WARN (Warnings Only)</option>
          <option value="3">ERROR (Errors Only)</option>
          <option value="4">OFF (Disabled)</option>
        </select>
      </div>

      <div class="setting-item">
        <h4>Scope Overrides</h4>
        <div id="scopeOverrides">
          <!-- Dynamically populated with registered scopes -->
          <!-- Format: scope name | level dropdown | remove button -->
        </div>
        <button id="addScopeOverride">+ Add Scope Override</button>
      </div>

      <div class="setting-item">
        <button id="viewLogs">View Recent Logs</button>
        <button id="exportLogs">Export Logs</button>
        <button id="clearLogs">Clear Log Buffer</button>
      </div>
    </div>

    <!-- Test Panel Access -->
    <div class="setting-group">
      <h3>Testing</h3>
      <button id="openTestPanel" class="primary-button">
        Open Test Panel
      </button>
      <p class="setting-description">
        Launch automated test runner for rules engine validation.
      </p>
    </div>

  </div>
</section>
```

### JavaScript Integration

```javascript
// Load developer mode state
async function loadDeveloperSettings() {
  const { developerMode } = await chrome.storage.local.get('developerMode');
  const enabled = developerMode?.enabled || false;

  document.getElementById('developerModeToggle').checked = enabled;
  document.getElementById('devModeFeatures').style.display = enabled ? 'block' : 'none';

  if (enabled) {
    await loadLoggingConfig();
  }
}

// Toggle developer mode
document.getElementById('developerModeToggle').addEventListener('change', async (e) => {
  const enabled = e.target.checked;

  await chrome.storage.local.set({
    developerMode: {
      enabled,
      features: {
        testPanel: true,
        logConfig: true,
        debugButton: true,
        consoleOutput: true
      }
    }
  });

  document.getElementById('devModeFeatures').style.display = enabled ? 'block' : 'none';

  if (enabled) {
    await loadLoggingConfig();
  }
});

// Load logging configuration
async function loadLoggingConfig() {
  const config = await LoggerService.getConfig();

  // Set global level
  document.getElementById('globalLogLevel').value = config.globalLevel;

  // Populate scope overrides
  const scopeOverrides = document.getElementById('scopeOverrides');
  scopeOverrides.innerHTML = '';

  for (const [scope, level] of Object.entries(config.scopes)) {
    scopeOverrides.appendChild(createScopeOverrideRow(scope, level));
  }
}

// Update global log level
document.getElementById('globalLogLevel').addEventListener('change', async (e) => {
  await LoggerService.updateConfig({
    globalLevel: parseInt(e.target.value)
  });
});
```

## Popup Debug Button Rewiring

### Current State
```javascript
// popup.js - current debug button
document.getElementById('debugBtn')?.addEventListener('click', copyDebugInfo);

async function copyDebugInfo() {
  const storage = await chrome.storage.local.get(null);
  const debugInfo = {
    totalTabs: elements.totalTabs.textContent,
    rules: state.rules.length,
    activityLog: storage.activityLog?.length || 0,
    // ... more fields
  };

  navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
}
```

### Updated Implementation
```javascript
// popup.js - enhanced debug button

// Show/hide based on developer mode
async function updateDebugButtonVisibility() {
  const { developerMode } = await chrome.storage.local.get('developerMode');
  const enabled = developerMode?.enabled || false;

  const debugBtn = document.getElementById('debugBtn');
  if (debugBtn) {
    debugBtn.style.display = enabled ? 'block' : 'none';
  }
}

// Call on popup load
document.addEventListener('DOMContentLoaded', async () => {
  await updateDebugButtonVisibility();
  // ... rest of initialization
});

// Enhanced debug info with logs
async function copyDebugInfo() {
  const storage = await chrome.storage.local.get(null);
  const recentLogs = await LoggerService.getRecentLogs({ limit: 100 });
  const logStats = await LoggerService.getLogStats();

  const debugInfo = {
    // Existing fields
    totalTabs: elements.totalTabs.textContent,
    rules: state.rules.length,
    activityLog: storage.activityLog?.length || 0,
    statistics: storage.statistics,
    testModeActive: storage.testModeActive,
    scheduledTriggers: storage.scheduledTriggers?.length || 0,

    // New logging fields
    developerMode: storage.developerMode?.enabled || false,
    logConfig: await LoggerService.getConfig(),
    logStats: logStats,
    recentLogs: recentLogs.map(log => ({
      timestamp: log.timestamp,
      level: getLevelName(log.level),
      scope: log.scope,
      message: log.message
    }))
  };

  navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
  alert('Debug info copied to clipboard!');
}
```

## Migration Strategy

### Phase 1: Core Implementation (Week 1)
**Goal**: Create LoggerService and Developer Mode infrastructure

- [ ] Create `/services/utils/LoggerService.js` with core functionality
  - Logger class with debug/info/warn/error methods
  - Dynamic scope registration
  - Ring buffer implementation
  - Console output formatting
  - Configuration persistence

- [ ] Add Developer Mode to Settings panel
  - Create "Developer Settings" section
  - Add toggle for Developer Mode
  - Wire to chrome.storage.local

- [ ] Integrate Developer Mode with LoggerService
  - Add shouldLog() check for Developer Mode
  - Cache Developer Mode state
  - Listen for Developer Mode changes

- [ ] Write unit tests
  - Level filtering
  - Scope registration
  - Buffer behavior
  - Configuration persistence

### Phase 2: High-Priority Services (Week 2)
**Goal**: Migrate core business logic services

- [ ] Rules Engine (`lib/engine.v2.services.js`)
  - Scope: `rules`, `rules.matching`, `rules.actions`
  - Replace console.log with logger calls
  - Test rule execution with logging enabled/disabled

- [ ] SnoozeService (`services/execution/SnoozeService.js`)
  - Scope: `snooze`, `snooze.alarm`
  - Replace console.log with logger calls

- [ ] Collection Services (`services/execution/Collection*.js`)
  - Scopes: `collections`, `collections.sync`, `collections.import`
  - Replace console.log with logger calls

- [ ] ProgressiveSyncService
  - Scope: `collections.sync`
  - Migrate from internal buffer to LoggerService

### Phase 3: Background & Core Services (Week 3)
**Goal**: Migrate background script and core services

- [ ] Background script (`background-integrated.js`)
  - Scopes: `background`, `background.messages`, `background.alarms`
  - Replace console.log with logger calls
  - Keep essential production logging (errors, warnings)

- [ ] WindowService (`services/execution/WindowService.js`)
  - Scope: `windows`

- [ ] Tab Services (`services/execution/Tab*.js`)
  - Scopes: `tabs`, `tabs.grouping`, `tabs.dedup`

- [ ] Storage utilities (`services/utils/storage-queries.js`)
  - Scope: `storage`

### Phase 4: UI Modules (Week 4)
**Goal**: Migrate UI layers

- [ ] Dashboard modules (`dashboard/modules/`)
  - Scopes: `ui.dashboard`, `ui.dashboard.views`, etc.
  - Replace console.log with logger calls

- [ ] Popup (`popup/popup.js`)
  - Scope: `ui.popup`
  - Wire debug button to Developer Mode
  - Enhance debug info with logs

- [ ] Side panel (`sidepanel/`)
  - Scope: `ui.sidepanel`

### Phase 5: Cleanup & Polish (Week 5)
**Goal**: Finalize and ship

- [ ] Add logging configuration UI to Settings panel
  - Global level selector
  - Scope override management
  - View/export/clear logs buttons

- [ ] Remove all remaining console.* calls
  - Verify with grep: `grep -r "console\\.log" --include="*.js"`
  - Only console.error for critical production errors

- [ ] Add developer UI enhancements
  - Log viewer modal
  - Export logs to file
  - Real-time log streaming (optional)

- [ ] Performance optimization
  - Benchmark logging overhead
  - Optimize buffer operations
  - Minimize storage writes

- [ ] Documentation
  - Update README with logging instructions
  - Add developer guide for using LoggerService
  - Document scope naming conventions

## Testing Requirements

### Unit Tests (`tests/LoggerService.test.js`)

```javascript
describe('LoggerService', () => {
  describe('Level Filtering', () => {
    test('respects global log level');
    test('respects per-scope overrides');
    test('defaults to global level for new scopes');
  });

  describe('Dynamic Scope Registration', () => {
    test('auto-registers scope on first getLogger call');
    test('reuses existing logger for same scope');
    test('scopes inherit global level by default');
  });

  describe('Ring Buffer', () => {
    test('maintains up to bufferSize entries');
    test('overwrites oldest entries when full');
    test('filters by scope correctly');
    test('filters by level correctly');
  });

  describe('Developer Mode Integration', () => {
    test('only shows WARN/ERROR when dev mode OFF');
    test('respects configured levels when dev mode ON');
    test('updates behavior when dev mode changes');
  });

  describe('Configuration', () => {
    test('persists config to chrome.storage');
    test('restores config on initialization');
    test('handles service worker restarts');
  });
});
```

### Integration Tests

```javascript
describe('LoggerService Integration', () => {
  test('Rules engine logging works correctly');
  test('Snooze service logging respects levels');
  test('Developer Mode toggle affects all modules');
  test('Debug button shows recent logs');
  test('Settings panel updates logger config');
});
```

## Expected Scope Taxonomy

Based on codebase analysis, these scopes will emerge naturally:

```
Core Services:
- rules
- rules.matching
- rules.actions
- rules.scheduling
- snooze
- snooze.alarm
- snooze.restore
- collections
- collections.sync
- collections.capture
- collections.restore
- collections.import
- collections.export

Execution Services:
- tabs
- tabs.grouping
- tabs.dedup
- tabs.suspend
- windows
- windows.snooze
- windows.restore
- bookmarks
- storage
- storage.migration

Background:
- background
- background.messages
- background.alarms
- background.lifecycle
- lifecycle
- lifecycle.install
- lifecycle.update

UI:
- ui
- ui.dashboard
- ui.dashboard.tabs
- ui.dashboard.collections
- ui.popup
- ui.sidepanel
- ui.modal

Testing:
- test-mode
- test-mode.runner
- test-mode.assertions
```

## Security Considerations

1. **No sensitive data in logs**: Never log passwords, tokens, or PII
2. **Developer Mode required**: Prevents log pollution in production
3. **Buffer size limits**: Prevents memory exhaustion
4. **No remote logging**: All logs stay local
5. **User control**: Users can disable logging entirely

## Performance Considerations

1. **Level check first**: Skip all work if log won't output
2. **Cached dev mode**: Avoid storage read on every log call
3. **Lazy initialization**: Only initialize when first logger requested
4. **Async buffer writes**: Don't block on buffer operations
5. **No stack traces for INFO/DEBUG**: Only capture for errors

## Success Criteria

- [ ] No console.log statements in production code paths
- [ ] All services use LoggerService
- [ ] Scopes register dynamically (no manual list)
- [ ] Developer Mode controls logging visibility
- [ ] Settings panel allows log level configuration
- [ ] Debug button respects Developer Mode
- [ ] Test panel link hidden unless Developer Mode enabled
- [ ] Unit tests pass with >90% coverage
- [ ] No performance degradation (< 1ms overhead per log call)
- [ ] Documentation complete

## References

- Architecture-guardian review: Session 2025-01-29
- ProgressiveSyncService pattern: `/services/execution/ProgressiveSyncService.js`
- CLAUDE.md architectural principles
- Services-First architecture documentation
