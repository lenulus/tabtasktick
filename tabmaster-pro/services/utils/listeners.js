/**
 * Utility functions for safe Chrome API listener patterns
 *
 * CRITICAL: Chrome API listeners have strict return value requirements.
 * Returning a Promise (from async functions) causes undefined behavior.
 *
 * See: CLAUDE.md and ARCHITECTURE-ACTION-PLAN.md for full details
 */

/**
 * Safe wrapper for async Chrome API listeners
 *
 * Prevents the common bug of using `async` directly on a listener,
 * which causes the listener to return Promise instead of true/undefined.
 *
 * Chrome expects:
 * - true (boolean) = async response coming, keep channel open
 * - undefined (no return) = synchronous, or pass through to other listeners
 * - NEVER Promise = causes race conditions and non-deterministic behavior
 *
 * @param {Function} handler - Async handler function to wrap
 * @returns {Function} - Safe listener that uses IIFE pattern
 *
 * @example
 * // WRONG - Returns Promise
 * chrome.runtime.onInstalled.addListener(async () => {
 *   await initializeExtension();
 * });
 *
 * // RIGHT - Uses safeAsyncListener
 * chrome.runtime.onInstalled.addListener(
 *   safeAsyncListener(async () => {
 *     await initializeExtension();
 *   })
 * );
 */
export function safeAsyncListener(handler) {
  return (...args) => {
    // Use IIFE to handle async without returning Promise
    (async () => {
      try {
        await handler(...args);
      } catch (error) {
        console.error('Listener error:', error);
      }
    })();
    // Return undefined (implicit) - don't claim ownership unless needed
  };
}

/**
 * Safe wrapper for async message listeners that need to send responses
 *
 * Use this for chrome.runtime.onMessage listeners that need to call sendResponse.
 * Automatically handles the async pattern and keeps the message channel open.
 *
 * @param {Function} handler - Async handler that returns response data
 * @returns {Function} - Safe message listener
 *
 * @example
 * chrome.runtime.onMessage.addListener(
 *   safeAsyncMessageListener(async (message, sender) => {
 *     if (message.action === 'getData') {
 *       const data = await fetchData();
 *       return { success: true, data };
 *     }
 *     return null; // Let other listeners handle
 *   })
 * );
 */
export function safeAsyncMessageListener(handler) {
  return (message, sender, sendResponse) => {
    (async () => {
      try {
        const result = await handler(message, sender);
        if (result !== null && result !== undefined) {
          sendResponse(result);
        }
      } catch (error) {
        console.error('Message listener error:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep channel open for async response
  };
}

/**
 * Check if a function is async
 * Useful for debugging and validation
 *
 * @param {Function} fn - Function to check
 * @returns {boolean} - True if function is async
 */
export function isAsyncFunction(fn) {
  return fn.constructor.name === 'AsyncFunction';
}
