/**
 * Detailed step-by-step debugging
 */

import { test, expect } from './fixtures/extension.js';

test('detailed debug of import sequence', async ({ testPage }) => {
  // Test page should log to both browser console and return values
  testPage.on('console', msg => console.log(`Browser: ${msg.text()}`));

  const result = await testPage.evaluate(async () => {
    const logs = [];

    try {
      logs.push('Step 1: Starting');

      logs.push('Step 2: About to import db.js');
      const db = await import('./services/utils/db.js');
      logs.push(`Step 3: Imported db.js, has clearAllData: ${typeof db.clearAllData}`);

      logs.push('Step 4: About to call clearAllData');
      await db.clearAllData();
      logs.push('Step 5: clearAllData completed');

      logs.push('Step 6: About to import storage-queries.js');
      const sq = await import('./services/utils/storage-queries.js');
      logs.push(`Step 7: Imported storage-queries.js, has saveCollection: ${typeof sq.saveCollection}`);

      logs.push('Step 8: About to save collection');
      await sq.saveCollection({
        id: 'test_1',
        name: 'Test',
        isActive: true,
        tags: [],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });
      logs.push('Step 9: Saved collection');

      logs.push('Step 10: About to import selectCollections.js');
      const sc = await import('./services/selection/selectCollections.js');
      logs.push(`Step 11: Imported selectCollections.js, has selectCollections: ${typeof sc.selectCollections}`);

      return { success: true, logs };
    } catch (error) {
      logs.push(`ERROR: ${error.message}`);
      return { success: false, error: error.message, stack: error.stack, logs };
    }
  });

  console.log('=== EXECUTION LOG ===');
  if (result.logs) {
    result.logs.forEach(log => console.log(log));
  }
  console.log('=== END LOG ===');

  if (!result.success) {
    console.error('Error:', result.error);
    console.error('Stack:', result.stack);
  }

  expect(result.success).toBe(true);
});
