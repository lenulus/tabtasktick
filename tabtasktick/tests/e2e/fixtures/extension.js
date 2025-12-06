/**
 * Playwright fixtures for Chrome extension testing
 *
 * Provides utilities to load and test the TabMaster Pro extension
 * in a real Chromium browser with actual Chrome APIs.
 *
 * Usage:
 * import { test, expect } from './fixtures/extension.js';
 *
 * test('my extension test', async ({ page, extensionId, serviceWorkerPage }) => {
 *   // page: A blank page to work with
 *   // extensionId: The loaded extension's ID
 *   // serviceWorkerPage: Access to the service worker context
 * });
 */

import { test as base, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extension path (3 levels up from tests/e2e/fixtures/)
const extensionPath = path.resolve(__dirname, '../../..');

/**
 * Extended test with extension-specific fixtures
 */
export const test = base.extend({
  /**
   * Shared browser context with worker scope
   * All tests in a file share this context (and IndexedDB)
   */
  sharedContext: [async ({}, use) => {
    // Create an ephemeral temporary user data directory for this test worker
    // All tests in the file share this directory, then it's cleaned up
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-chrome-'));

    // Launch persistent context with extension
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false, // Extensions require headful mode
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
      // Disable service worker timeout for debugging
      serviceWorkers: 'allow',
      // Add viewport
      viewport: { width: 1280, height: 720 },
      // Slow down by 100ms per operation for visibility
      slowMo: 100,
    });

    await use(context);
    await context.close();

    // Clean up the ephemeral user data directory
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to clean up temp directory ${userDataDir}:`, error);
    }
  }, { scope: 'worker' }],

  /**
   * Use sharedContext as the default context
   */
  context: async ({ sharedContext }, use) => {
    await use(sharedContext);
  },

  /**
   * Extension ID fixture
   * Automatically retrieves the loaded extension's ID
   */
  extensionId: async ({ sharedContext }, use) => {
    // Background page for Manifest V3 is the service worker
    let [serviceWorker] = sharedContext.serviceWorkers();

    // Wait for service worker if not immediately available
    if (!serviceWorker) {
      serviceWorker = await sharedContext.waitForEvent('serviceworker');
    }

    const extensionId = serviceWorker.url().split('/')[2];
    await use(extensionId);
  },

  /**
   * Service Worker page fixture
   * Provides access to the extension's background service worker
   */
  serviceWorkerPage: async ({ sharedContext }, use) => {
    let [serviceWorker] = sharedContext.serviceWorkers();

    if (!serviceWorker) {
      serviceWorker = await sharedContext.waitForEvent('serviceworker');
    }

    await use(serviceWorker);
  },

  /**
   * Page fixture
   * Provides a blank page for testing
   */
  page: async ({ sharedContext }, use) => {
    const page = await sharedContext.newPage();
    await use(page);
    await page.close();
  },

  /**
   * Test page fixture
   * Loads test-page.html from the extension for ES module imports
   */
  testPage: async ({ sharedContext, extensionId }, use) => {
    const page = await sharedContext.newPage();

    try {
      // Navigate to the extension's test page
      const url = `chrome-extension://${extensionId}/test-page.html`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      await use(page);
    } catch (error) {
      console.error('testPage fixture error:', error);
      throw error;
    } finally {
      await page.close();
    }
  },
});

export { expect } from '@playwright/test';
