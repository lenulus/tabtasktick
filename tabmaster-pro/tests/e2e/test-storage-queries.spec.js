/**
 * Test storage-queries import
 */

import { test, expect } from './fixtures/extension.js';

test('storage-queries imports', async ({ testPage }) => {
  const result = await testPage.evaluate(async () => {
    try {
      const module = await import('./services/utils/storage-queries.js');
      return {
        success: true,
        hasGetAllCollections: typeof module.getAllCollections === 'function',
        hasGetCollectionsByIndex: typeof module.getCollectionsByIndex === 'function'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack
      };
    }
  });

  console.log('storage-queries result:', result);
  expect(result.success).toBe(true);
});
