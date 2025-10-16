/**
 * Test getAllFromIndex function directly
 */

import { test, expect } from './fixtures/extension.js';

test('getAllFromIndex from db.js works', async ({ testPage }) => {
  const result = await testPage.evaluate(async () => {
    try {
      console.log('About to import getAllFromIndex from db.js');
      const { getAllFromIndex } = await import('./services/utils/db.js');
      console.log('Successfully imported getAllFromIndex');

      return {
        success: true,
        imported: typeof getAllFromIndex === 'function'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack
      };
    }
  });

  console.log('getAllFromIndex import result:', result);
  expect(result.success).toBe(true);
});
