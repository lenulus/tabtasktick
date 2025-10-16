/**
 * Test calling selectCollections with data
 */

import { test, expect } from './fixtures/extension.js';

test('call selectCollections with data', async ({ testPage }) => {
  // Setup: save a test collection
  await testPage.evaluate(async () => {
    const { clearAllData } = await import('./services/utils/db.js');
    await clearAllData();

    const { saveCollection } = await import('./services/utils/storage-queries.js');
    await saveCollection({
      id: 'test_1',
      name: 'Test Active',
      isActive: true,
      tags: ['work'],
      metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
    });
  });
  console.log('✓ Saved test collection');

  // Test: call selectCollections
  const result = await testPage.evaluate(async () => {
    try {
      console.log('About to import selectCollections');
      const { selectCollections } = await import('./services/selection/selectCollections.js');
      console.log('Successfully imported, about to call with isActive:true');

      const collections = await selectCollections({ isActive: true });
      console.log('selectCollections returned:', collections.length);

      return {
        success: true,
        count: collections.length
      };
    } catch (error) {
      console.error('Call failed:', error);
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
