/**
 * Minimal test to debug Phase 6 import issues
 */

import { test, expect } from './fixtures/extension.js';

test.describe('Phase 6 - Minimal Debug Test', () => {
  test.beforeEach(async ({ testPage }) => {
    console.log('[BEFOREEACH] Starting beforeEach hook...');
    await testPage.evaluate(async () => {
      console.log('[BEFOREEACH-EVAL] Inside evaluate, about to import db.js...');
      const { clearAllData } = await import('./services/utils/db.js');
      console.log('[BEFOREEACH-EVAL] Successfully imported, calling clearAllData...');
      await clearAllData();
      console.log('[BEFOREEACH-EVAL] Successfully cleared data');
    });
    console.log('[BEFOREEACH] Finished beforeEach hook');
  });

  test('can import db.js without errors', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      try {
        console.log('[DEBUG] About to import db.js...');
        const { clearAllData } = await import('./services/utils/db.js');
        console.log('[DEBUG] Successfully imported db.js');

        console.log('[DEBUG] About to call clearAllData...');
        await clearAllData();
        console.log('[DEBUG] Successfully called clearAllData');

        return { success: true };
      } catch (error) {
        console.error('[DEBUG] Error occurred:', error);
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    });

    console.log('[TEST] Result:', result);

    if (!result.success) {
      console.error('[TEST] Import failed:', result.error);
      console.error('[TEST] Stack:', result.stack);
    }

    expect(result.success).toBe(true);
  });

  test('can call chrome.windows.getAll', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      try {
        console.log('[DEBUG] About to call chrome.windows.getAll...');
        const windows = await chrome.windows.getAll();
        console.log('[DEBUG] Successfully got windows:', windows.length);

        return {
          success: true,
          windowCount: windows.length
        };
      } catch (error) {
        console.error('[DEBUG] Error occurred:', error);
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    });

    console.log('[TEST] Result:', result);
    expect(result.success).toBe(true);
  });
});
