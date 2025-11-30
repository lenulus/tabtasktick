/**
 * Console log level filtering utility
 *
 * Uses reference swapping (not wrapping) to preserve caller info in DevTools.
 * Respects developer mode and log level settings from chrome.storage.
 *
 * Storage schema:
 * {
 *   developerMode: false,        // default off
 *   developerLogLevel: 2         // 0=debug, 1=log, 2=warn, 3=error (default warn)
 * }
 *
 * Log Level Behavior:
 * | Developer Mode | Effective Level | What's Visible        |
 * |----------------|-----------------|------------------------|
 * | OFF (default)  | 2 (warn)        | WARN, ERROR only       |
 * | ON             | User's choice   | Based on setting       |
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

/**
 * Load settings from storage and update effectiveLevel
 */
async function loadSettings() {
  try {
    const { developerMode, developerLogLevel } = await chrome.storage.local.get([
      'developerMode',
      'developerLogLevel'
    ]);
    // If dev mode off, force warn level; otherwise use saved level
    effectiveLevel = developerMode ? (developerLogLevel ?? 2) : 2;
  } catch {
    effectiveLevel = 2; // Default to warn on error
  }
  applyLogLevel();
}

/**
 * Set up listener for storage changes
 */
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

/**
 * Initialize console log level filtering - call this once per surface
 *
 * @example
 * import { initConsoleCapture } from './services/utils/console-capture.js';
 * await initConsoleCapture();
 */
export async function initConsoleCapture() {
  if (initialized) return;
  initialized = true;

  await loadSettings();
  listenForChanges();
}

/**
 * Get current effective log level
 * @returns {number} Current effective level (0=debug, 1=log/info, 2=warn, 3=error)
 */
export function getEffectiveLevel() {
  return effectiveLevel;
}

/**
 * Check if initialized
 * @returns {boolean} True if initialized
 */
export function isInitialized() {
  return initialized;
}

/**
 * Reset for testing purposes only
 * @private
 */
export function _resetForTesting() {
  initialized = false;
  effectiveLevel = 2;
  // Restore original console methods
  console.debug = ORIGINAL.debug;
  console.log = ORIGINAL.log;
  console.info = ORIGINAL.info;
  console.warn = ORIGINAL.warn;
  console.error = ORIGINAL.error;
}

/**
 * Set effective level directly (for testing only)
 * @private
 */
export function _setEffectiveLevelForTesting(level) {
  effectiveLevel = level;
  applyLogLevel();
}
