/**
 * Playwright Configuration for Chrome Extension Testing
 *
 * See: https://playwright.dev/docs/chrome-extensions
 */

import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',

  // Test timeout
  timeout: 30000,

  // Expect timeout for assertions
  expect: {
    timeout: 5000,
  },

  // Run tests sequentially for extension testing (to avoid profile conflicts)
  fullyParallel: false,

  // Fail fast on CI
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Use single worker to avoid Chrome profile conflicts
  workers: 1,

  // Reporter to use
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }]
  ],

  // Shared settings for all projects
  use: {
    // Base URL for page.goto() calls
    baseURL: 'chrome-extension://placeholder',

    // Collect trace on failure
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on retry
    video: 'retain-on-failure',
  },

  // Chrome extension testing requires Chromium
  projects: [
    {
      name: 'chromium-extension',
      use: {
        channel: 'chromium',
        // Extension path will be set by fixtures
      },
    },
  ],
});
