/**
 * Raw IndexedDB test without our services
 */

import { test, expect } from './fixtures/extension.js';

test('raw IndexedDB works', async ({ testPage }) => {
  const result = await testPage.evaluate(async () => {
    return new Promise((resolve) => {
      const request = indexedDB.open('TestDB', 1);

      request.onerror = () => {
        resolve({ success: false, error: 'Failed to open DB' });
      };

      request.onsuccess = () => {
        const db = request.result;
        db.close();
        resolve({ success: true, dbName: db.name });
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        db.createObjectStore('test', { keyPath: 'id' });
      };
    });
  });

  console.log('Raw IndexedDB result:', result);
  expect(result.success).toBe(true);
});
