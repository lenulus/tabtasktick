/**
 * ESLint rule: no-async-chrome-listener
 *
 * Detects async functions used directly in Chrome API event listeners.
 * This prevents non-deterministic behavior from Promises being returned instead of true/undefined.
 *
 * ❌ WRONG:
 * chrome.tabs.onCreated.addListener(async (tab) => { ... });
 * chrome.alarms.onAlarm.addListener(async function(alarm) { ... });
 *
 * ✅ CORRECT:
 * chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
 *   (async () => { ... })();
 *   return true;
 * });
 *
 * chrome.alarms.onAlarm.addListener(safeAsyncListener(async (alarm) => { ... }));
 */

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow async functions as direct Chrome API event listener callbacks',
      category: 'Best Practices',
      recommended: true
    },
    messages: {
      asyncChromeListener: '🚨 FORBIDDEN: Chrome event listeners must not use async directly. Use safeAsyncListener() from /services/utils/listeners.js or manual IIFE pattern for onMessage. See CLAUDE.md lines 680-805.'
    },
    schema: []
  },

  create(context) {
    /**
     * Checks if a node represents chrome.*.*.addListener() call
     */
    function isChromeListenerCall(node) {
      if (node.type !== 'CallExpression') return false;

      const callee = node.callee;
      if (callee.type !== 'MemberExpression') return false;
      if (callee.property.type !== 'Identifier') return false;
      if (callee.property.name !== 'addListener') return false;

      // Walk up the object chain to find 'chrome' at the root
      let obj = callee.object;
      while (obj) {
        if (obj.type === 'Identifier' && obj.name === 'chrome') {
          return true;
        }
        if (obj.type === 'MemberExpression') {
          obj = obj.object;
        } else {
          break;
        }
      }

      return false;
    }

    /**
     * Checks if a function is async
     */
    function isAsync(node) {
      return (
        (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') &&
        node.async === true
      );
    }

    /**
     * Checks if the argument is wrapped in safeAsyncListener
     */
    function isWrappedInSafeListener(callExpression) {
      const arg = callExpression.arguments[0];
      if (!arg) return false;

      // Check if it's safeAsyncListener(async ...)
      if (arg.type === 'CallExpression') {
        const callee = arg.callee;
        if (callee.type === 'Identifier' && callee.name === 'safeAsyncListener') {
          return true;
        }
      }

      return false;
    }

    return {
      CallExpression(node) {
        // Only check chrome.*.*.addListener() calls
        if (!isChromeListenerCall(node)) return;

        // Check if wrapped in safeAsyncListener - this is OK
        if (isWrappedInSafeListener(node)) return;

        // Check if the first argument is an async function
        const listener = node.arguments[0];
        if (!listener) return;

        if (isAsync(listener)) {
          context.report({
            node: listener,
            messageId: 'asyncChromeListener'
          });
        }
      }
    };
  }
};
