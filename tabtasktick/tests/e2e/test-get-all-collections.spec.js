/**
 * Test getAllCollections function
 */

import { test, expect } from './fixtures/extension.js';

test('getAllCollections works', async ({ testPage }) => {
  const result = await testPage.evaluate(async () => {
    try {
      const { getAllCollections } = await import('./services/utils/storage-queries.js');
      console.log('Imported getAllCollections');

      const collections = await getAllCollections();
      console.log('getAllCollections returned:', collections.length);

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

  console.log('getAllCollections result:', result);
  expect(result.success).toBe(true);
});
