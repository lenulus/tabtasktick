/**
 * Test importing getCollectionsByIndex without calling it
 */

import { test, expect } from './fixtures/extension.js';

test('import getCollectionsByIndex (no call)', async ({ testPage }) => {
  const result = await testPage.evaluate(async () => {
    try {
      console.log('About to import getCollectionsByIndex');
      const { getCollectionsByIndex } = await import('./services/utils/storage-queries.js');
      console.log('Successfully imported getCollectionsByIndex');
      console.log('Type:', typeof getCollectionsByIndex);

      return {
        success: true,
        isFunction: typeof getCollectionsByIndex === 'function'
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
