import { test, expect } from './fixtures/extension.js';

test('debug: inspect task modal DOM structure', async ({ page, extensionId }) => {
  // Navigate to the side panel
  await page.goto(`chrome-extension://${extensionId}/sidepanel/panel.html`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);

  // Switch to Tasks view
  await page.locator('#view-tasks-btn').click();
  await page.waitForTimeout(500);

  // Open task modal
  await page.locator('#tasks-empty button').click();
  await page.waitForTimeout(1000);

  // Wait for modal to be visible
  await page.locator('#modal-container .modal').waitFor({ state: 'visible' });

  // Introspect the DOM
  const domStructure = await page.evaluate(() => {
    const modal = document.querySelector('#modal-container .modal');
    if (!modal) return { error: 'Modal not found' };

    // Get all form elements
    const formElements = {};
    const inputs = modal.querySelectorAll('input, textarea, select');
    inputs.forEach((el) => {
      formElements[el.id || el.name || 'unnamed'] = {
        tag: el.tagName,
        type: el.type,
        id: el.id,
        name: el.name,
        visible: el.offsetParent !== null,
        disabled: el.disabled,
        readonly: el.readOnly
      };
    });

    return {
      modalHTML: modal.innerHTML.substring(0, 1000), // First 1000 chars
      formElements,
      taskSummaryExists: !!document.getElementById('task-summary'),
      taskNotesExists: !!document.getElementById('task-notes'),
      taskPriorityExists: !!document.getElementById('task-priority'),
      taskStatusExists: !!document.getElementById('task-status'),
    };
  });

  console.log('Modal DOM Structure:', JSON.stringify(domStructure, null, 2));

  // Try to find task-summary with different strategies
  const summaryById = await page.locator('#task-summary').count();
  const summaryByName = await page.locator('[name="summary"]').count();
  const anyTextarea = await page.locator('textarea').count();
  const anyInput = await page.locator('input[type="text"]').count();

  console.log('Element counts:', {
    summaryById: summaryById,
    summaryByName: summaryByName,
    anyTextarea: anyTextarea,
    anyInputText: anyInput
  });

  // Get priority options
  const priorityOptions = await page.evaluate(() => {
    const select = document.getElementById('new-task-priority');
    if (!select) return { error: 'Priority select not found' };
    return Array.from(select.options).map(opt => ({
      value: opt.value,
      text: opt.text
    }));
  });

  console.log('Priority options:', priorityOptions);

  // Take screenshot
  await page.screenshot({ path: 'test-results/task-modal-dom-debug.png', fullPage: true });

  // Keep window open for inspection
  await page.waitForTimeout(5000);
});
