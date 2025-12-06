import { test, expect } from './fixtures/extension.js';

test.describe('Side Panel - Tasks View', () => {

  test('tasks view shows empty state when no tasks exist', async ({ page, extensionId }) => {
    // Navigate to the side panel
    await page.goto(`chrome-extension://${extensionId}/sidepanel/panel.html`);

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Click Tasks tab
    const tasksBtn = page.locator('#view-tasks-btn');
    await expect(tasksBtn).toBeVisible();
    await tasksBtn.click();

    // Wait for view to switch
    await page.waitForTimeout(500);

    // Check that tasks view is visible
    const tasksView = page.locator('#tasks-view');
    await expect(tasksView).toBeVisible();

    // Check that empty state is visible
    const emptyState = page.locator('#tasks-empty');
    await expect(emptyState).toBeVisible();

    // Verify empty state title
    const emptyTitle = emptyState.locator('.empty-title');
    await expect(emptyTitle).toContainText('No tasks yet');

    // Verify "Create Your First Task" button exists
    const createBtn = emptyState.locator('button');
    await expect(createBtn).toContainText('Create Your First Task');
  });

  test('clicking "Create Your First Task" opens task modal', async ({ page, extensionId }) => {
    // Navigate to the side panel
    await page.goto(`chrome-extension://${extensionId}/sidepanel/panel.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Switch to Tasks view
    await page.locator('#view-tasks-btn').click();
    await page.waitForTimeout(500);

    // Click "Create Your First Task" button
    const createBtn = page.locator('#tasks-empty button');
    await createBtn.click();

    // Wait for modal to appear
    await page.waitForTimeout(500);

    // Check that modal container is visible
    const modalContainer = page.locator('#modal-container');
    await expect(modalContainer).toBeVisible();

    // Check for modal
    const modal = modalContainer.locator('.modal');
    await expect(modal).toBeVisible();

    // Verify modal title (it's in .modal-header, not .modal-content)
    const modalTitle = page.locator('#modal-title');
    await expect(modalTitle).toContainText('Create New Task');

    // Verify form fields exist
    await expect(page.locator('#new-task-summary')).toBeVisible();
    await expect(page.locator('#new-task-notes')).toBeVisible();
    await expect(page.locator('#new-task-priority')).toBeVisible();
    await expect(page.locator('#new-task-collection')).toBeVisible();
  });

  test('creating a task adds it to the list', async ({ page, extensionId }) => {
    // Navigate to the side panel
    await page.goto(`chrome-extension://${extensionId}/sidepanel/panel.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Switch to Tasks view
    await page.locator('#view-tasks-btn').click();
    await page.waitForTimeout(500);

    // Open task modal
    await page.locator('#tasks-empty button').click();
    await page.waitForTimeout(500);

    // Wait for modal to be visible
    await page.locator('#modal-container .modal').waitFor({ state: 'visible' });

    // Fill in task details
    await page.locator('#new-task-summary').fill('Test Task from E2E');
    await page.locator('#new-task-notes').fill('This is a test task created by Playwright');
    await page.locator('#new-task-priority').selectOption('high');

    // Submit form
    const submitBtn = page.locator('#modal-container button[type="submit"]');
    await submitBtn.click();

    // Wait for task to be created
    await page.waitForTimeout(1000);

    // Verify empty state is gone
    const emptyState = page.locator('#tasks-empty');
    await expect(emptyState).not.toBeVisible();

    // Verify tasks content is visible
    const tasksContent = page.locator('#tasks-content');
    await expect(tasksContent).toBeVisible();

    // Verify task card appears with correct summary
    const taskCard = page.locator('.task-card').first();
    await expect(taskCard).toBeVisible();

    // Check task title/summary is visible
    await expect(taskCard).toContainText('Test Task from E2E');
  });

  test('tasks persist across page loads', async ({ page, extensionId }) => {
    // This test verifies that the task created in test 3 persists in IndexedDB
    // Note: This test gets a fresh page, but shares the same browser context

    // Navigate to the panel (fresh page load)
    await page.goto(`chrome-extension://${extensionId}/sidepanel/panel.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Switch to Tasks view
    await page.locator('#view-tasks-btn').click();
    await page.waitForTimeout(500);

    // The task from test 3 should be visible (persistence test)
    const taskCards = page.locator('.task-card');
    const taskCount = await taskCards.count();

    // Should have at least 1 task from test 3
    expect(taskCount).toBeGreaterThanOrEqual(1);

    // Verify the first task is there
    await expect(taskCards.first()).toBeVisible();
    await expect(taskCards.first()).toContainText('Test Task from E2E');
  });

  test('Create Collection button is visible and clickable', async ({ page, extensionId }) => {
    // Navigate to the side panel
    await page.goto(`chrome-extension://${extensionId}/sidepanel/panel.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Switch to Collections view
    await page.locator('#view-collections-btn').click();
    await page.waitForTimeout(500);

    // Verify Create Collection button exists and is visible
    const createCollectionBtn = page.locator('#save-window-btn');
    await expect(createCollectionBtn).toBeVisible();
    await expect(createCollectionBtn).toBeEnabled();
    await expect(createCollectionBtn).toContainText('Create Collection');

    // Click Create Collection button
    await createCollectionBtn.click();
    await page.waitForTimeout(500);

    // Verify modal opens
    const modalContainer = page.locator('#modal-container');
    await expect(modalContainer).toBeVisible();

    const modal = modalContainer.locator('.modal');
    await expect(modal).toBeVisible();

    // Verify modal has correct title
    const modalTitle = page.locator('#modal-title');
    await expect(modalTitle).toContainText('Create Collection');

    // Verify form fields
    await expect(page.locator('#collection-name')).toBeVisible();
    await expect(page.locator('#collection-description')).toBeVisible();
    await expect(page.locator('#collection-icon')).toBeVisible();
    await expect(page.locator('#collection-tags')).toBeVisible();
  });

  test.skip('Create Collection captures tabs and folders from current window', async ({ page, context, extensionId }) => {
    // NOTE: This test is skipped because CaptureWindowService is not implemented yet (Phase 6.1)
    // Currently, Create Collection only creates empty collections
    // This test will be enabled when Phase 6.1 is implemented
    // Create a test page with multiple tabs
    const testPage1 = await context.newPage();
    await testPage1.goto('https://example.com');
    await testPage1.waitForLoadState('domcontentloaded');

    const testPage2 = await context.newPage();
    await testPage2.goto('https://github.com');
    await testPage2.waitForLoadState('domcontentloaded');

    const testPage3 = await context.newPage();
    await testPage3.goto('https://stackoverflow.com');
    await testPage3.waitForLoadState('domcontentloaded');

    // Navigate to side panel
    await page.goto(`chrome-extension://${extensionId}/sidepanel/panel.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Switch to Collections view
    await page.locator('#view-collections-btn').click();
    await page.waitForTimeout(500);

    // Click Create Collection
    await page.locator('#save-window-btn').click();
    await page.waitForTimeout(500);

    // Fill in form
    await page.locator('#collection-name').fill('Test Collection from Window');
    await page.locator('#collection-description').fill('Captured from E2E test');
    await page.locator('#collection-icon').fill('🧪');

    // Submit form
    const submitBtn = page.locator('#modal-container button[type="submit"]');
    await submitBtn.click();
    await page.waitForTimeout(2000);

    // Check IndexedDB directly to verify tabs and folders were captured
    const dbCheck = await page.evaluate(async () => {
      const dbName = 'TabTaskTickDB';
      const request = indexedDB.open(dbName);

      return new Promise((resolve) => {
        request.onsuccess = (event) => {
          const db = event.target.result;

          // Get collections
          const collectionTx = db.transaction(['collections'], 'readonly');
          const collectionStore = collectionTx.objectStore('collections');
          const getCollections = collectionStore.getAll();

          getCollections.onsuccess = () => {
            const collections = getCollections.result;
            const collection = collections.find(c => c.name === 'Test Collection from Window');

            if (!collection) {
              resolve({ success: false, error: 'Collection not found' });
              return;
            }

            // Get folders for this collection
            const folderTx = db.transaction(['folders'], 'readonly');
            const folderStore = folderTx.objectStore('folders');
            const getFolders = folderStore.getAll();

            getFolders.onsuccess = () => {
              const folders = getFolders.result.filter(f => f.collectionId === collection.id);

              // Get tabs for these folders
              const tabTx = db.transaction(['tabs'], 'readonly');
              const tabStore = tabTx.objectStore('tabs');
              const getTabs = tabStore.getAll();

              getTabs.onsuccess = () => {
                const folderIds = folders.map(f => f.id);
                const tabs = getTabs.result.filter(t => folderIds.includes(t.folderId));

                resolve({
                  success: true,
                  collection: { id: collection.id, name: collection.name },
                  folderCount: folders.length,
                  tabCount: tabs.length,
                  tabs: tabs.map(t => ({ url: t.url, title: t.title }))
                });
              };
            };
          };
        };

        request.onerror = () => {
          resolve({ success: false, error: 'Failed to open DB' });
        };
      });
    });

    console.log('Save Window DB check:', dbCheck);

    // Verify tabs were captured
    expect(dbCheck.success).toBe(true);
    expect(dbCheck.tabCount).toBeGreaterThanOrEqual(3); // Should have at least the 3 test tabs

    // Verify we captured the test pages
    const capturedUrls = dbCheck.tabs.map(t => t.url);
    expect(capturedUrls).toContain('https://example.com/');
    expect(capturedUrls).toContain('https://github.com/');
    expect(capturedUrls).toContain('https://stackoverflow.com/');

    // Clean up test pages
    await testPage1.close();
    await testPage2.close();
    await testPage3.close();
  });
});
