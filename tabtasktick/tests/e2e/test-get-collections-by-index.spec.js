/**
 * Test getCollectionsByIndex function
 */

import { test, expect } from './fixtures/extension.js';

test('getCollectionsByIndex works', async ({ testPage }) => {
  // First save a collection
  await testPage.evaluate(async () => {
    const { clearAllData } = await import('./services/utils/db.js');
    await clearAllData();

    const { saveCollection } = await import('./services/utils/storage-queries.js');
    await saveCollection({
      id: 'test_1',
      name: 'Test Active Collection',
      isActive: true,
      tags: ['work'],
      metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
    });
  });
  console.log('✓ Saved test collection');

  // Now test getCollectionsByIndex
  const result = await testPage.evaluate(async () => {
    try {
      const { getCollectionsByIndex } = await import('./services/utils/storage-queries.js');
      console.log('Imported getCollectionsByIndex');

      const collections = await getCollectionsByIndex('isActive', true);
      console.log('getCollectionsByIndex returned:', collections.length);

      return {
        success: true,
        count: collections.length,
        hasCollection: collections.length > 0
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack
      };
    }
  });

  console.log('getCollectionsByIndex result:', result);
  expect(result.success).toBe(true);
  expect(result.count).toBe(1);
});
