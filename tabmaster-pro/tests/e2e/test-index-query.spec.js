/**
 * Simple test to verify IndexedDB index queries work
 */

import { test, expect } from './fixtures/extension.js';

test('IndexedDB index query works', async ({ testPage }) => {
  // Step 1: Can we import?
  const step1 = await testPage.evaluate(async () => {
    try {
      const dbModule = await import('./services/utils/db.js');
      return { success: true, hasClearAllData: typeof dbModule.clearAllData === 'function' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  console.log('Step 1 (import):', step1);
  expect(step1.success).toBe(true);

  // Step 2: Can we call clearAllData?
  const step2 = await testPage.evaluate(async () => {
    try {
      const { clearAllData } = await import('./services/utils/db.js');
      await clearAllData();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message, stack: error.stack };
    }
  });
  console.log('Step 2 (clearAllData):', step2);
  expect(step2.success).toBe(true);

  // Step 3: Can we saveCollection?
  const step3 = await testPage.evaluate(async () => {
    try {
      const { saveCollection } = await import('./services/utils/storage-queries.js');
      await saveCollection({
        id: 'test_1',
        name: 'Test Active Collection',
        isActive: true,
        tags: [],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message, stack: error.stack };
    }
  });
  console.log('Step 3 (saveCollection):', step3);
  expect(step3.success).toBe(true);

  // Step 4: Can we query?
  const step4 = await testPage.evaluate(async () => {
    try {
      const { selectCollections } = await import('./services/selection/selectCollections.js');
      const collections = await selectCollections({ isActive: true });
      return {
        success: true,
        count: collections.length,
        names: collections.map(c => c.name)
      };
    } catch (error) {
      return { success: false, error: error.message, stack: error.stack };
    }
  });
  console.log('Step 4 (selectCollections):', step4);
  expect(step4.success).toBe(true);

  console.log('Result:', result);
  expect(result.success).toBe(true);
  expect(result.count).toBe(1);
  expect(result.names).toContain('Test Active Collection');
});
