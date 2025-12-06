/**
 * Test selectCollections by itself
 */

import { test, expect } from './fixtures/extension.js';

test('selectCollections works', async ({ testPage }) => {
  const result = await testPage.evaluate(async () => {
    try {
      const { selectCollections } = await import('./services/selection/selectCollections.js');
      console.log('Imported selectCollections');

      const collections = await selectCollections({ isActive: true });
      console.log('Query completed, count:', collections.length);

      return {
        success: true,
        count: collections.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack
      };
    }
  });

  console.log('selectCollections result:', result);
  if (!result.success) {
    console.error('Error:', result.error);
    console.error('Stack:', result.stack);
  }
  expect(result.success).toBe(true);
});
