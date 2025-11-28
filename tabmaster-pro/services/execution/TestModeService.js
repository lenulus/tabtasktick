/**
 * TestModeService - Single source of truth for test mode state management
 *
 * Test mode is system configuration that affects business logic (rule execution).
 * This service ensures all test mode state changes go through a single point,
 * making the system deterministic and traceable.
 *
 * Used by:
 * - Popup UI (exit test mode button)
 * - Test Panel (test mode lifecycle)
 * - Background script (reads state, never writes directly)
 */

/**
 * Set test mode active or inactive
 * @param {boolean} active - Whether test mode should be active
 * @param {object} options - Additional options
 * @param {string} options.source - Source of the change (for logging/debugging)
 * @returns {Promise<object>} Result with success status and state info
 */
export async function setTestMode(active, options = {}) {
  const previousState = await chrome.storage.local.get('testModeActive');

  if (active === previousState.testModeActive) {
    return { success: true, changed: false };
  }

  // Update storage (triggers background listener for rule state management)
  await chrome.storage.local.set({
    testModeActive: active,
    testModeTimestamp: Date.now(),
    testModeSource: options.source || 'unknown'
  });

  // Log state change for debugging
  console.log(`Test mode ${active ? 'activated' : 'deactivated'} from ${options.source || 'unknown'}`);

  return {
    success: true,
    changed: true,
    previousState: previousState.testModeActive,
    currentState: active
  };
}

/**
 * Get current test mode status
 * @returns {Promise<object>} Test mode status with metadata
 */
export async function getTestModeStatus() {
  const { testModeActive, testModeTimestamp, testModeSource } =
    await chrome.storage.local.get(['testModeActive', 'testModeTimestamp', 'testModeSource']);

  return {
    active: !!testModeActive,
    timestamp: testModeTimestamp,
    source: testModeSource
  };
}

/**
 * Exit test mode (convenience method)
 * @param {object} options - Additional options
 * @returns {Promise<object>} Result of setTestMode call
 */
export async function exitTestMode(options = {}) {
  return setTestMode(false, { ...options, source: options.source || 'user_exit' });
}

/**
 * Enter test mode (convenience method)
 * @param {object} options - Additional options
 * @returns {Promise<object>} Result of setTestMode call
 */
export async function enterTestMode(options = {}) {
  return setTestMode(true, { ...options, source: options.source || 'test_panel' });
}
