import { test } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, '../../tabmaster-pro');

test('debug tasks empty state', async ({ context }) => {
  // Load extension
  await context.addInitScript(() => {
    // Mock chrome APIs if needed
  });

  // Navigate to the side panel HTML directly
  const page = await context.newPage();
  const panelUrl = `file://${path.join(extensionPath, 'sidepanel/panel.html')}`;

  console.log('Loading panel from:', panelUrl);
  await page.goto(panelUrl);

  // Wait for initialization
  await page.waitForTimeout(2000);

  // Click Tasks tab
  const tasksBtn = page.locator('#view-tasks-btn');
  if (await tasksBtn.count() > 0) {
    await tasksBtn.click();
    await page.waitForTimeout(500);
  }

  // Check all state elements
  const tasksView = page.locator('#tasks-view');
  const tasksLoading = page.locator('#tasks-loading');
  const tasksError = page.locator('#tasks-error');
  const tasksEmpty = page.locator('#tasks-empty');
  const tasksContent = page.locator('#tasks-content');

  console.log('\n=== DOM State ===');
  console.log('tasks-view exists:', await tasksView.count() > 0);
  console.log('tasks-view visible:', await tasksView.isVisible().catch(() => false));
  console.log('tasks-view hidden attr:', await tasksView.getAttribute('hidden'));

  console.log('\ntasks-loading exists:', await tasksLoading.count() > 0);
  console.log('tasks-loading visible:', await tasksLoading.isVisible().catch(() => false));
  console.log('tasks-loading classes:', await tasksLoading.getAttribute('class'));

  console.log('\ntasks-error exists:', await tasksError.count() > 0);
  console.log('tasks-error visible:', await tasksError.isVisible().catch(() => false));
  console.log('tasks-error classes:', await tasksError.getAttribute('class'));

  console.log('\ntasks-empty exists:', await tasksEmpty.count() > 0);
  console.log('tasks-empty visible:', await tasksEmpty.isVisible().catch(() => false));
  console.log('tasks-empty classes:', await tasksEmpty.getAttribute('class'));

  console.log('\ntasks-content exists:', await tasksContent.count() > 0);
  console.log('tasks-content visible:', await tasksContent.isVisible().catch(() => false));
  console.log('tasks-content classes:', await tasksContent.getAttribute('class'));

  // Take screenshot
  await page.screenshot({ path: 'test-results/tasks-empty-debug.png', fullPage: true });

  // Get computed styles
  const emptyStyles = await tasksEmpty.evaluate(el => ({
    display: window.getComputedStyle(el).display,
    visibility: window.getComputedStyle(el).visibility,
    opacity: window.getComputedStyle(el).opacity
  }));

  console.log('\ntasks-empty computed styles:', emptyStyles);

  await page.waitForTimeout(5000); // Keep browser open
});
