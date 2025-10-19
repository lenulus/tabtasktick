import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Tasks View Simple Debug', () => {
  test('load panel HTML and check Tasks tab', async ({ page }) => {
    // Load the panel HTML as a file URL
    const panelPath = path.join(__dirname, '../../tabmaster-pro/sidepanel/panel.html');
    const fileUrl = `file://${panelPath}`;

    console.log('Loading panel from:', fileUrl);

    await page.goto(fileUrl);
    await page.waitForLoadState('domcontentloaded');

    // Wait for any dynamic content
    await page.waitForTimeout(1000);

    // Take initial screenshot
    await page.screenshot({ path: 'test-results/panel-initial.png', fullPage: true });

    // Check if Tasks tab exists
    const tasksBtn = await page.locator('#view-tasks-btn');
    const exists = await tasksBtn.count();
    console.log('Tasks button found:', exists > 0);

    if (exists > 0) {
      // Click Tasks tab
      await tasksBtn.click();
      await page.waitForTimeout(500);

      // Check visibility of different states
      const states = {
        loading: await page.locator('#tasks-loading').isVisible(),
        error: await page.locator('#tasks-error').isVisible(),
        empty: await page.locator('#tasks-empty').isVisible(),
        content: await page.locator('#tasks-content').isVisible(),
      };

      console.log('Tasks view states:', states);

      // Check for hidden class
      const loadingHidden = await page.locator('#tasks-loading').evaluate(el => el.classList.contains('hidden'));
      const errorHidden = await page.locator('#tasks-error').evaluate(el => el.classList.contains('hidden'));
      const emptyHidden = await page.locator('#tasks-empty').evaluate(el => el.classList.contains('hidden'));
      const contentHidden = await page.locator('#tasks-content').evaluate(el => el.classList.contains('hidden'));

      console.log('Hidden classes:', {
        loading: loadingHidden,
        error: errorHidden,
        empty: emptyHidden,
        content: contentHidden
      });

      // Get console logs
      const logs = [];
      page.on('console', msg => logs.push(msg.text()));

      // Take screenshot after clicking
      await page.screenshot({ path: 'test-results/tasks-view-clicked.png', fullPage: true });

      console.log('Console logs:', logs);
    }
  });
});
