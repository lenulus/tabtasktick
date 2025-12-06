/**
 * Test full flow: clear -> save -> query
 */

import { test, expect } from './fixtures/extension.js';

test('full flow works', async ({ testPage }) => {
  const result = await testPage.evaluate(async () => {
    try {
      // Step 1: Clear
      const { clearAllData } = await import('./services/utils/db.js');
      await clearAllData();
      console.log('✓ Cleared data');

      // Step 2: Save
      const { saveCollection } = await import('./services/utils/storage-queries.js');
      await saveCollection({
        id: 'test_1',
        name: 'Test Collection',
        isActive: true,
        tags: [],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });
      console.log('✓ Saved collection');

      // Step 3: Query
      const { selectCollections } = await import('./services/selection/selectCollections.js');
      const collections = await selectCollections({ isActive: true });
      console.log('✓ Queried:', collections.length);

      return {
        success: true,
        count: collections.length,
        names: collections.map(c => c.name)
      };
    } catch (error) {
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
  expect(result.names).toContain('Test Collection');
});
