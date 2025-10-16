/**
 * Test importing selectCollections without calling it
 */

import { test, expect } from './fixtures/extension.js';

test('import selectCollections (no call)', async ({ testPage }) => {
  const result = await testPage.evaluate(async () => {
    try {
      console.log('About to import selectCollections');
      const { selectCollections } = await import('./services/selection/selectCollections.js');
      console.log('Successfully imported selectCollections');
      console.log('Type:', typeof selectCollections);

      return {
        success: true,
        isFunction: typeof selectCollections === 'function'
      };
    } catch (error) {
      console.error('Import failed:', error);
      return {
        success: false,
        error: error.message,
        stack: error.stack
      };
    }
  });

  console.log('Result:', result);
  if (!result.success) {
    console.error('Error:', result.error);
    console.error('Stack:', result.stack);
  }
  expect(result.success).toBe(true);
});
