/**
 * Test save and query in single evaluate call
 */

import { test, expect } from './fixtures/extension.js';

test('save and query in single evaluate', async ({ testPage }) => {
  const result = await testPage.evaluate(async () => {
    try {
      // Clear
      const { clearAllData } = await import('./services/utils/db.js');
      await clearAllData();
      console.log('✓ Cleared data');

      // Save
      const { saveCollection } = await import('./services/utils/storage-queries.js');
      await saveCollection({
        id: 'test_1',
        name: 'Test Active',
        isActive: true,
        tags: ['work'],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });
      console.log('✓ Saved collection');

      // Query with selectCollections
      const { selectCollections } = await import('./services/selection/selectCollections.js');
      console.log('✓ Imported selectCollections');

      const collections = await selectCollections({ isActive: true });
      console.log('✓ Query returned:', collections.length);

      return {
        success: true,
        count: collections.length
      };
    } catch (error) {
      console.error('Error:', error);
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
  expect(result.count).toBe(1);
});
