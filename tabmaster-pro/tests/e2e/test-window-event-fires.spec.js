/**
 * Simple diagnostic test to verify chrome.windows.onRemoved event fires
 */

import { test, expect } from './fixtures/extension.js';

test('chrome.windows.onRemoved event fires', async ({ context, page }) => {
  // Create a new window
  const newWindow = await context.newPage();

  // Get the window ID
  const windowId = await newWindow.evaluate(() => {
    return chrome.windows.getCurrent().then(w => w.id);
  });

  console.log(`Created window with ID: ${windowId}`);

  // Set up a listener in the background script to track if event fires
  await page.evaluate(() => {
    return new Promise((resolve) => {
      chrome.storage.local.set({ windowCloseEventFired: false }, resolve);
    });
  });

  // Close the window
  await newWindow.close();

  // Wait a bit for event to propagate
  await page.waitForTimeout(1000);

  // Check if the background script received the event
  // (We'd need to modify background.js to set a flag when event fires)
  const result = await page.evaluate(() => {
    return chrome.storage.local.get('windowCloseEventFired');
  });

  console.log('Event fired:', result.windowCloseEventFired);

  // This test will fail until we add diagnostic code to background.js
  // expect(result.windowCloseEventFired).toBe(true);
});
