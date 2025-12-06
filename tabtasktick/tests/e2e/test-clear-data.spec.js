/**
 * Test clearAllData() function
 */

import { test, expect } from './fixtures/extension.js';

test('clearAllData() works', async ({ testPage }) => {
  const result = await testPage.evaluate(async () => {
    try {
      const { clearAllData } = await import('./services/utils/db.js');

      console.log('About to call clearAllData()...');
      await clearAllData();
      console.log('clearAllData() completed');

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack
      };
    }
  });

  console.log('clearAllData result:', result);
  expect(result.success).toBe(true);
});
