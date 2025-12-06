# Logging System Plan v2 - Console Log Level Filtering

## Overview

Replace the over-engineered LoggerService approach with a simple reference-swap pattern that filters console output while preserving caller info in DevTools.

## Goals

1. Filter console.log/warn/error based on log level setting
2. Developer Mode toggle controls debug feature visibility
3. Adjustable log level when Developer Mode is ON
4. Conservative defaults (WARN/ERROR only) when Developer Mode is OFF
5. Preserve caller info in DevTools (file:line shown correctly)
6. Minimal overhead - reference swap, no wrapping

## Architecture

### Storage Schema

```javascript
{
  developerMode: false,        // default off
  developerLogLevel: 2         // 0=debug, 1=info, 2=warn, 3=error (default warn)
}
```

### Log Level Behavior

| Developer Mode | Effective Level | What's Captured |
|----------------|-----------------|-----------------|
| OFF (default)  | 2 (warn)        | WARN, ERROR only |
| ON             | User's choice   | Based on setting |

## Implementation

### Phase 1: Console Capture Utility

**New file:** `/services/utils/console-capture.js`

```javascript
/**
 * Console log level filtering utility
 *
 * Uses reference swapping (not wrapping) to preserve caller info in DevTools.
 * Respects developer mode and log level settings from chrome.storage.
 */

import { safeAsyncListener } from './listeners.js';

// Keep bound originals so `this` is correct and call sites are preserved
const ORIGINAL = {
  debug: (console.debug || console.log).bind(console),
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
};

// Single shared noop for filtered methods
function noop() {}

// Log levels: debug=0, log=1, info=1, warn=2, error=3
const LEVELS = { debug: 0, log: 1, info: 1, warn: 2, error: 3 };

// State
let effectiveLevel = 2; // Default to warn (conservative)

/**
 * Apply log level by swapping console method references
 * Methods below threshold become noop, others are restored to original
 */
function applyLogLevel() {
  console.debug = (LEVELS.debug >= effectiveLevel) ? ORIGINAL.debug : noop;
  console.log = (LEVELS.log >= effectiveLevel) ? ORIGINAL.log : noop;
  console.info = (LEVELS.info >= effectiveLevel) ? ORIGINAL.info : noop;
  console.warn = (LEVELS.warn >= effectiveLevel) ? ORIGINAL.warn : noop;
  console.error = (LEVELS.error >= effectiveLevel) ? ORIGINAL.error : noop;
}

// Load settings from storage
async function loadSettings() {
  try {
    const { developerMode, developerLogLevel } = await chrome.storage.local.get([
      'developerMode',
      'developerLogLevel'
    ]);
    effectiveLevel = developerMode ? (developerLogLevel ?? 2) : 2;
  } catch {
    effectiveLevel = 2;
  }
  applyLogLevel();
}

// Listen for settings changes
function listenForChanges() {
  chrome.storage.onChanged.addListener(safeAsyncListener(async (changes, area) => {
    if (area === 'local') {
      if (changes.developerMode || changes.developerLogLevel) {
        await loadSettings();
      }
    }
  }));
}

// Initialization guard
let initialized = false;

export async function initConsoleCapture() {
  if (initialized) return;
  initialized = true;
  await loadSettings();
  listenForChanges();
}

export function getEffectiveLevel() {
  return effectiveLevel;
}
```

### Phase 2: Developer Mode in Settings

**File:** `/options/options.html` - Add to settings section:

```html
<div class="setting-group">
  <h3>Developer Options</h3>

  <div class="setting-row">
    <label>
      <input type="checkbox" id="developerMode">
      Developer Mode
    </label>
    <p class="setting-description">Enable debugging features and detailed logging</p>
  </div>

  <div id="developerSettings" class="developer-settings hidden">
    <div class="setting-row">
      <label for="logLevel">Log Level</label>
      <select id="logLevel">
        <option value="0">DEBUG (verbose)</option>
        <option value="1">INFO</option>
        <option value="2" selected>WARN</option>
        <option value="3">ERROR (minimal)</option>
      </select>
    </div>
  </div>
</div>
```

**File:** `/options/options.js` - Add handlers:

```javascript
// Developer Mode toggle
document.getElementById('developerMode').addEventListener('change', async (e) => {
  const enabled = e.target.checked;
  await chrome.storage.local.set({ developerMode: enabled });
  document.getElementById('developerSettings').classList.toggle('hidden', !enabled);
});

// Log level selector
document.getElementById('logLevel').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ developerLogLevel: parseInt(e.target.value) });
});

// Load on page init
async function loadDeveloperSettings() {
  const { developerMode, developerLogLevel } = await chrome.storage.local.get([
    'developerMode',
    'developerLogLevel'
  ]);
  document.getElementById('developerMode').checked = developerMode || false;
  document.getElementById('logLevel').value = developerLogLevel ?? 2;
  document.getElementById('developerSettings').classList.toggle('hidden', !developerMode);
}
```

### Phase 3: Popup UI Changes

**File:** `/popup/popup.js`

On popup load, check developer mode and hide/show elements:

```javascript
async function setupDeveloperFeatures() {
  const { developerMode } = await chrome.storage.local.get('developerMode');

  const debugButton = document.getElementById('copyDebugLogs');
  const testPanelButton = document.getElementById('openTestPanel');

  if (debugButton) {
    debugButton.style.display = developerMode ? '' : 'none';
  }
  if (testPanelButton) {
    testPanelButton.style.display = developerMode ? '' : 'none';
  }
}

// Call during popup init
setupDeveloperFeatures();
```

### Phase 4: Integration Points

**Each surface entry point** needs to import and init:

| Surface | File | Add |
|---------|------|-----|
| Background | `background-integrated.js` | `import { initConsoleCapture } from './services/utils/console-capture.js'; initConsoleCapture();` |
| Popup | `popup/popup.js` | Same import pattern |
| Dashboard | `dashboard/dashboard.js` | Same import pattern |
| Sidepanel | `sidepanel/sidepanel.js` | Same import pattern |
| Options | `options/options.js` | Same import pattern |

### Phase 5: Background Message Handler

Update `background-integrated.js`:

**At top of file (static import - NEVER use dynamic imports per CLAUDE.md):**
```javascript
import { getRecentLogs } from './services/utils/console-capture.js';
```

**In message handler:**
```javascript
case 'getRecentLogs':
  sendResponse({ logs: getRecentLogs() });
  break;
```

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `/services/utils/console-capture.js` | NEW | Console capture utility |
| `/options/options.html` | MODIFY | Add Developer Mode UI |
| `/options/options.js` | MODIFY | Add Developer Mode handlers |
| `/popup/popup.js` | MODIFY | Hide/show debug buttons |
| `/popup/popup.html` | MODIFY | Ensure debug buttons have IDs |
| `/background-integrated.js` | MODIFY | Import console-capture, update getRecentLogs |
| `/dashboard/dashboard.js` | MODIFY | Import console-capture |
| `/sidepanel/sidepanel.js` | MODIFY | Import console-capture |

## Limitations (Accepted)

- **No buffer capture** - The original plan included a `recentLogs` buffer, but this was removed in favor of preserving caller info in DevTools. Wrapping console methods causes DevTools to show `console-capture.js:XX` instead of the actual caller file:line. The reference swap approach (swapping console methods between bound originals and `noop`) preserves caller info.
- **DevTools for all debugging** - Open DevTools on service worker (`chrome://extensions` → "service worker" link) or UI surfaces for full console access. No in-app log viewer.

## What We're NOT Doing

- No complex LoggerService with ring buffers and scopes
- No messaging between surfaces for logging (performance overhead)
- No initialization complexity or ensureInitialized patterns
- No centralized log buffer (each surface has its own)
- No configuration persistence beyond developerMode and developerLogLevel
- No persistent log storage (chrome.storage would add I/O overhead)

## Testing

1. Toggle Developer Mode ON - verify debug buttons appear in popup
2. Toggle Developer Mode OFF - verify debug buttons hidden
3. Set log level to DEBUG - verify console.debug captured
4. Set log level to ERROR - verify only errors captured
5. Check background logs via getRecentLogs message
6. Verify no performance impact during normal usage

## Unit Tests for Utility

Add `/tests/console-capture.test.js`:
- Level filtering (reference swap to noop vs original)
- `loadSettings()` handles missing/malformed storage
- Initialization guard prevents double-init
- Storage change listener updates effective level

## Architecture Review Applied

Fixes from architecture-guardian review:

1. **Fixed dynamic import** - Phase 5 now shows static import at top of file
2. **Added safeAsyncListener** - Storage change listener uses proper async pattern
3. **Added initialization guard** - Prevents double-init on service worker restart
4. **Added getEffectiveLevel()** - Enables conditional expensive logging
