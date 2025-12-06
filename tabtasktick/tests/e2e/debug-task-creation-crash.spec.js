import { test, expect } from './fixtures/extension.js';

test('debug: investigate page closing after task creation', async ({ page, extensionId, serviceWorkerPage }) => {
  // Set up error listeners
  page.on('pageerror', error => {
    console.error('PAGE ERROR:', error.message);
    console.error('Stack:', error.stack);
  });

  page.on('crash', () => {
    console.error('PAGE CRASHED');
  });

  page.on('close', () => {
    console.error('PAGE CLOSED');
  });

  serviceWorkerPage.on('pageerror', error => {
    console.error('SERVICE WORKER ERROR:', error.message);
  });

  // Navigate to the side panel
  await page.goto(`chrome-extension://${extensionId}/sidepanel/panel.html`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);

  console.log('Panel loaded successfully');

  // Switch to Tasks view
  await page.locator('#view-tasks-btn').click();
  await page.waitForTimeout(500);

  console.log('Switched to Tasks view');

  // Open task modal
  await page.locator('#tasks-empty button').click();
  await page.waitForTimeout(500);

  console.log('Opened task modal');

  // Wait for modal to be visible
  await page.locator('#modal-container .modal').waitFor({ state: 'visible' });

  console.log('Modal is visible');

  // Fill in task details
  await page.locator('#new-task-summary').fill('Debug Test Task');
  await page.locator('#new-task-notes').fill('Testing for crashes');
  await page.locator('#new-task-priority').selectOption('high');

  console.log('Filled in task form');

  // Submit form
  const submitBtn = page.locator('#modal-container button[type="submit"]');
  await submitBtn.click();

  console.log('Clicked submit button');

  // Wait and watch for crashes
  await page.waitForTimeout(2000);

  console.log('Waiting 2 seconds after submit...');

  // Check if page is still alive
  const isAlive = await page.evaluate(() => {
    return {
      url: window.location.href,
      ready: document.readyState,
      hasBody: !!document.body
    };
  }).catch(err => {
    console.error('Page evaluation failed:', err.message);
    return null;
  });

  console.log('Page state after task creation:', isAlive);

  // Try to interact with the page
  if (isAlive) {
    const taskCards = await page.locator('.task-card').count();
    console.log('Task cards found:', taskCards);
  }

  // Keep window open for manual inspection
  await page.waitForTimeout(5000);
});
