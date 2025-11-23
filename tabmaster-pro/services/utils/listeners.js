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
 * @param {Object} options - Configuration options
 * @param {Function} options.errorHandler - Custom error handler (default: console.error)
 * @param {boolean} options.logErrors - Whether to log errors (default: true)
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
 *
 * // With custom error handling
 * chrome.runtime.onInstalled.addListener(
 *   safeAsyncListener(async () => {
 *     await initializeExtension();
 *   }, {
 *     errorHandler: (error, context) => {
 *       sendToMonitoring(error, context);
 *     }
 *   })
 * );
 */
export function safeAsyncListener(handler, options = {}) {
  // Prevent double-wrapping
  if (handler.__safeWrapped) {
    console.warn('Handler already wrapped with safeAsyncListener - skipping double-wrap');
    return handler;
  }

  const {
    errorHandler = null,
    logErrors = true
  } = options;

  const wrapped = (...args) => {
    // Use IIFE to handle async without returning Promise
    (async () => {
      try {
        await handler(...args);
      } catch (error) {
        const context = {
          handlerName: handler.name || 'anonymous',
          argsCount: args.length,
          timestamp: Date.now()
        };

        // Log error if enabled
        if (logErrors) {
          console.error('Listener error:', error, context);
        }

        // Call custom error handler if provided
        if (errorHandler) {
          try {
            errorHandler(error, context);
          } catch (handlerError) {
            console.error('Error in custom error handler:', handlerError);
          }
        }
      }
    })();
    // Return undefined (implicit) - don't claim ownership unless needed
  };

  // Mark as wrapped to prevent double-wrapping
  wrapped.__safeWrapped = true;

  return wrapped;
}

/**
 * Check if a function is async
 * Useful for debugging and validation
 *
 * @param {Function} fn - Function to check
 * @returns {boolean} - True if function is async
 */
export function isAsyncFunction(fn) {
  return fn && fn.constructor && fn.constructor.name === 'AsyncFunction';
}
