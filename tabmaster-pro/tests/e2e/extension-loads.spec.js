/**
 * Smoke test - Verify extension loads successfully
 *
 * This is the simplest possible test to verify Playwright
 * can load and interact with the Chrome extension.
 */

import { test, expect } from './fixtures/extension.js';

test.describe('Extension Loading', () => {
  test('extension loads with valid ID', async ({ extensionId }) => {
    // Verify extension loaded
    expect(extensionId).toBeTruthy();
    expect(extensionId).toMatch(/^[a-z]{32}$/); // Chrome extension ID format
    console.log('Extension ID:', extensionId);
  });

  test('service worker is accessible', async ({ serviceWorkerPage, extensionId }) => {
    // Check service worker URL
    const url = serviceWorkerPage.url();
    expect(url).toContain(extensionId);
    expect(url).toContain('background'); // background.js or background-integrated.js

    console.log('Service Worker URL:', url);
  });

  test('can execute code in service worker context', async ({ serviceWorkerPage }) => {
    // Execute simple JavaScript in service worker
    const result = await serviceWorkerPage.evaluate(() => {
      return {
        hasChrome: typeof chrome !== 'undefined',
        hasBrowser: typeof browser !== 'undefined',
        hasIndexedDB: typeof indexedDB !== 'undefined',
        chromeVersion: navigator.userAgent
      };
    });

    expect(result.hasChrome).toBe(true);
    expect(result.hasIndexedDB).toBe(true);

    console.log('Environment check:', result);
  });
});
