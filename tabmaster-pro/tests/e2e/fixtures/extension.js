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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extension path (3 levels up from tests/e2e/fixtures/)
const extensionPath = path.resolve(__dirname, '../../..');

/**
 * Extended test with extension-specific fixtures
 */
export const test = base.extend({
  /**
   * Browser context with extension loaded
   */
  context: async ({}, use) => {
    // Create a temporary user data directory for this test run
    const userDataDir = path.join(__dirname, '../../../.playwright-user-data');

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
  },

  /**
   * Extension ID fixture
   * Automatically retrieves the loaded extension's ID
   */
  extensionId: async ({ context }, use) => {
    // Background page for Manifest V3 is the service worker
    let [serviceWorker] = context.serviceWorkers();

    // Wait for service worker if not immediately available
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker');
    }

    const extensionId = serviceWorker.url().split('/')[2];
    await use(extensionId);
  },

  /**
   * Service Worker page fixture
   * Provides access to the extension's background service worker
   */
  serviceWorkerPage: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();

    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker');
    }

    await use(serviceWorker);
  },

  /**
   * Page fixture
   * Provides a blank page for testing
   */
  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
    await page.close();
  },

  /**
   * Test page fixture
   * Loads test-page.html from the extension for ES module imports
   */
  testPage: async ({ context, extensionId }, use) => {
    const page = await context.newPage();

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
