/**
 * Test the testPage fixture
 */

import { test, expect } from './fixtures/extension.js';

test.describe('Test Page', () => {
  test('test page loads successfully', async ({ testPage }) => {
    // Verify page title
    const title = await testPage.title();
    expect(title).toContain('Test Page');

    // Verify page ready signal
    const isReady = await testPage.evaluate(() => window.testPageReady);
    expect(isReady).toBe(true);

    console.log('Test page loaded successfully');
  });

  test('can import ES modules from test page', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      try {
        const { getDB } = await import('./services/utils/db.js');

        return {
          success: true,
          hasGetDB: typeof getDB === 'function'
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });

    expect(result.success).toBe(true);
    expect(result.hasGetDB).toBe(true);

    console.log('ES module import successful:', result);
  });
});
