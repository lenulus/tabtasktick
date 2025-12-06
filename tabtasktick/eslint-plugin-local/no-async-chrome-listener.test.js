/**
 * Test suite for no-async-chrome-listener ESLint rule
 *
 * Run with: cd tabmaster-pro && npx eslint eslint-plugin-local/no-async-chrome-listener.test.js --no-ignore
 */

import { safeAsyncListener } from '../services/utils/listeners.js';

// ========================================
// THESE SHOULD FAIL (if rule is disabled)
// ========================================

// ❌ Direct async arrow function
chrome.tabs.onCreated.addListener(async (tab) => {
  await doSomething();
});

// ❌ Direct async function expression
chrome.alarms.onAlarm.addListener(async function(alarm) {
  await handleAlarm(alarm);
});

// ❌ Async on nested Chrome API
chrome.runtime.onInstalled.addListener(async (details) => {
  await initialize();
});

// ========================================
// THESE SHOULD PASS
// ========================================

// ✅ Using safeAsyncListener
chrome.tabs.onCreated.addListener(safeAsyncListener(async (tab) => {
  await doSomething();
}));

// ✅ Manual IIFE pattern for onMessage
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const result = await processMessage(message);
    sendResponse({ success: true, data: result });
  })();
  return true;
});

// ✅ Non-async listener
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log('Tab removed:', tabId);
});

// ✅ Non-Chrome listener (should be ignored)
window.addEventListener('load', async () => {
  await loadApp();
});

// Dummy functions to make the code valid
async function doSomething() {}
async function handleAlarm() {}
async function initialize() {}
async function processMessage() {}
async function loadApp() {}
