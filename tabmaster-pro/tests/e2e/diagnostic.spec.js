/**
 * Diagnostic test to debug import issues
 */

import { test, expect } from './fixtures/extension.js';

test('diagnostic: can testPage execute basic code', async ({ testPage }) => {
  const result = await testPage.evaluate(() => {
    return {
      url: window.location.href,
      hasIndexedDB: typeof indexedDB !== 'undefined',
      canAccessDOM: typeof document !== 'undefined'
    };
  });

  console.log('Basic test result:', result);
  expect(result.hasIndexedDB).toBe(true);
  expect(result.canAccessDOM).toBe(true);
  expect(result.url).toContain('chrome-extension://');
});

test('diagnostic: can testPage import db module', async ({ testPage }) => {
  try {
    const result = await testPage.evaluate(async () => {
      try {
        const module = await import('./services/utils/db.js');
        return {
          success: true,
          hasInitialize: typeof module.initialize === 'function'
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    });

    console.log('Import test result:', result);
    expect(result.success).toBe(true);
  } catch (error) {
    console.error('Failed to evaluate:', error);
    throw error;
  }
});
