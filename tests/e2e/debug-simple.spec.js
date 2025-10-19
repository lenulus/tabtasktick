import { test } from '@playwright/test';

test('debug tasks empty state', async ({ page }) => {
  // Navigate to the side panel HTML
  await page.goto('file:///Users/anthonylaforge/dev/bmpro/tabmaster-pro/sidepanel/panel.html');

  // Wait for page to load
  await page.waitForTimeout(2000);

  // Click Tasks tab if it exists
  await page.click('#view-tasks-btn').catch(() => {});
  await page.waitForTimeout(500);

  // Check DOM state
  const state = await page.evaluate(() => {
    const tasksView = document.getElementById('tasks-view');
    const tasksEmpty = document.getElementById('tasks-empty');

    return {
      tasksViewExists: !!tasksView,
      tasksViewHidden: tasksView?.hasAttribute('hidden'),
      tasksViewDisplay: window.getComputedStyle(tasksView).display,

      tasksEmptyExists: !!tasksEmpty,
      tasksEmptyClasses: tasksEmpty?.className,
      tasksEmptyDisplay: window.getComputedStyle(tasksEmpty).display,
      tasksEmptyVisibility: window.getComputedStyle(tasksEmpty).visibility,
    };
  });

  console.log('DOM State:', JSON.stringify(state, null, 2));

  // Take screenshot
  await page.screenshot({ path: 'test-results/tasks-debug.png', fullPage: true });

  await page.waitForTimeout(5000);
});
