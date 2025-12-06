import { test, expect } from './fixtures/extension.js';

test('verify task persistence across page reloads', async ({ page, extensionId }) => {
  // Test 1: Create a task
  await page.goto(`chrome-extension://${extensionId}/sidepanel/panel.html`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);

  await page.locator('#view-tasks-btn').click();
  await page.waitForTimeout(500);

  await page.locator('#tasks-empty button').click();
  await page.waitForTimeout(500);

  await page.locator('#modal-container .modal').waitFor({ state: 'visible' });
  await page.locator('#new-task-summary').fill('Persistence Test Task');
  await page.locator('#new-task-priority').selectOption('high');

  const submitBtn = page.locator('#modal-container button[type="submit"]');
  await submitBtn.click();
  await page.waitForTimeout(1500);

  console.log('Task created, checking if visible...');

  const taskCard = page.locator('.task-card').first();
  await expect(taskCard).toBeVisible();
  console.log('✓ Task is visible after creation');

  // Check IndexedDB directly
  const dbCheck1 = await page.evaluate(async () => {
    const dbName = 'TabTaskTickDB';
    const request = indexedDB.open(dbName);

    return new Promise((resolve) => {
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['tasks'], 'readonly');
        const store = transaction.objectStore('tasks');
        const getAllRequest = store.getAll();

        getAllRequest.onsuccess = () => {
          resolve({
            success: true,
            taskCount: getAllRequest.result.length,
            tasks: getAllRequest.result.map(t => ({ id: t.id, summary: t.summary }))
          });
        };

        getAllRequest.onerror = () => {
          resolve({ success: false, error: getAllRequest.error });
        };
      };

      request.onerror = () => {
        resolve({ success: false, error: 'Failed to open DB' });
      };
    });
  });

  console.log('IndexedDB check after creation:', dbCheck1);

  // Test 2: Reload the page and check if task persists
  console.log('\nReloading page...');
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  console.log('Page reloaded, checking tasks view...');

  // Check IndexedDB again
  const dbCheck2 = await page.evaluate(async () => {
    const dbName = 'TabTaskTickDB';
    const request = indexedDB.open(dbName);

    return new Promise((resolve) => {
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['tasks'], 'readonly');
        const store = transaction.objectStore('tasks');
        const getAllRequest = store.getAll();

        getAllRequest.onsuccess = () => {
          resolve({
            success: true,
            taskCount: getAllRequest.result.length,
            tasks: getAllRequest.result.map(t => ({ id: t.id, summary: t.summary }))
          });
        };

        getAllRequest.onerror = () => {
          resolve({ success: false, error: getAllRequest.error });
        };
      };

      request.onerror = () => {
        resolve({ success: false, error: 'Failed to open DB' });
      };
    });
  });

  console.log('IndexedDB check after reload:', dbCheck2);

  // Switch to tasks view
  await page.locator('#view-tasks-btn').click();
  await page.waitForTimeout(1000);

  // Check if task is still visible
  const taskCardsAfterReload = await page.locator('.task-card').count();
  console.log('Task cards after reload:', taskCardsAfterReload);

  if (taskCardsAfterReload === 0) {
    const emptyStateVisible = await page.locator('#tasks-empty').isVisible();
    console.log('Empty state visible:', emptyStateVisible);
    throw new Error('Task did not persist across page reload!');
  }

  await expect(page.locator('.task-card').first()).toBeVisible();
  console.log('✓ Task persisted across reload');
});
