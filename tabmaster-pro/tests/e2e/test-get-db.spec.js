/**
 * Test getDB() function
 */

import { test, expect } from './fixtures/extension.js';

test('getDB() works', async ({ testPage }) => {
  const result = await testPage.evaluate(async () => {
    try {
      const { getDB } = await import('./services/utils/db.js');

      console.log('About to call getDB()...');
      const db = await getDB();
      console.log('getDB() returned:', db);

      return {
        success: true,
        dbName: db.name,
        version: db.version
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack
      };
    }
  });

  console.log('getDB result:', result);
  expect(result.success).toBe(true);
});
