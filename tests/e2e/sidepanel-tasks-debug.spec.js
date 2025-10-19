import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.join(__dirname, '../../tabmaster-pro');

test.describe('Side Panel Tasks View Debug', () => {
  let context;
  let extensionId;

  test.beforeAll(async ({ browserName }) => {
    // Skip non-Chromium browsers
    if (browserName !== 'chromium') {
      test.skip();
    }
  });

  test.beforeEach(async ({ browser }) => {
    // Load extension
    context = await browser.newContext({
      permissions: ['tabs', 'storage', 'alarms'],
    });

    // Load the extension
    const background = await context.newPage();
    await background.goto(`chrome://extensions`);

    // Get extension ID
    const extensions = await background.evaluate(() => {
      const ext = document.querySelector('extensions-manager');
      if (!ext || !ext.shadowRoot) return [];
      const items = ext.shadowRoot.querySelector('extensions-item-list');
      if (!items || !items.shadowRoot) return [];
      const list = items.shadowRoot.querySelectorAll('extensions-item');
      return Array.from(list).map(item => ({
        id: item.id,
        name: item.shadowRoot?.querySelector('#name')?.textContent || ''
      }));
    });

    console.log('Available extensions:', extensions);
  });

  test.afterEach(async () => {
    await context?.close();
  });

  test('should load side panel and check Tasks view state', async () => {
    // Create a new page and navigate to side panel
    const page = await context.newPage();

    // Navigate to a page first (side panel needs a tab)
    await page.goto('https://example.com');

    // Wait a bit for extension to initialize
    await page.waitForTimeout(1000);

    // Try to open side panel via the extension
    // First, let's check if we can access the side panel HTML directly
    const sidePanelUrl = `chrome-extension://${extensionId}/tabmaster-pro/sidepanel/panel.html`;

    console.log('Attempting to load side panel:', sidePanelUrl);
    await page.goto(sidePanelUrl);

    // Wait for the page to load
    await page.waitForLoadState('domcontentloaded');

    // Check if the page loaded
    const title = await page.title();
    console.log('Page title:', title);

    // Check if tasks view exists
    const tasksView = await page.locator('#tasks-view').count();
    console.log('Tasks view found:', tasksView > 0);

    // Click on Tasks tab
    await page.click('#view-tasks-btn');
    await page.waitForTimeout(500);

    // Check what's visible
    const tasksLoading = await page.locator('#tasks-loading').isVisible();
    const tasksError = await page.locator('#tasks-error').isVisible();
    const tasksEmpty = await page.locator('#tasks-empty').isVisible();
    const tasksContent = await page.locator('#tasks-content').isVisible();

    console.log('Tasks view state:', {
      loading: tasksLoading,
      error: tasksError,
      empty: tasksEmpty,
      content: tasksContent
    });

    // Check for console errors
    const consoleMessages = [];
    page.on('console', msg => consoleMessages.push(`${msg.type()}: ${msg.text()}`));

    await page.waitForTimeout(1000);

    console.log('Console messages:', consoleMessages);

    // Take a screenshot for debugging
    await page.screenshot({ path: 'test-results/tasks-view-debug.png', fullPage: true });

    // Check if empty state is visible
    expect(tasksEmpty).toBe(true);
  });
});
