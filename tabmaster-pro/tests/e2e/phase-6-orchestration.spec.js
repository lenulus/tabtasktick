/**
 * Phase 6 E2E Tests - Orchestration Services Integration
 *
 * Tests the complete workflow of:
 * 1. Capturing a window as a collection
 * 2. Creating a task referencing collection tabs
 * 3. Restoring a saved collection
 * 4. Opening task tabs (with automatic restoration)
 *
 * These tests validate the integration between all Phase 6 services
 * and message handlers.
 */

import { test, expect } from './fixtures/extension.js';

test.describe('Phase 6 - Orchestration Services', () => {
  test.beforeEach(async ({ testPage }) => {
    // Clear all data before each test to ensure isolation
    await testPage.evaluate(async () => {
      const { clearAllData } = await import('./services/utils/db.js');
      await clearAllData();
    });
  });

  test('full workflow: capture → save → restore → task execution', async ({ testPage, context }) => {
    // Step 1: Create a test window with tabs to capture
    const testWindow = await context.newPage();
    await testWindow.goto('https://example.com');
    await testWindow.waitForLoadState('load');

    const windowId = await testWindow.evaluate(() => {
      return chrome.windows.getCurrent().then(w => w.id);
    });

    // Step 2: Capture window as collection using background message handler
    const captureResult = await testPage.evaluate(async (winId) => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'captureWindow',
          windowId: winId,
          metadata: {
            name: 'Test Collection',
            description: 'E2E test collection',
            tags: ['test']
          },
          keepActive: false // Save as inactive
        }, resolve);
      });
    }, windowId);

    expect(captureResult.success).toBe(true);
    expect(captureResult.collection).toBeDefined();
    expect(captureResult.stats.tabsCaptured).toBeGreaterThan(0);

    const collectionId = captureResult.collection.id;
    const capturedTabIds = captureResult.tabs.map(t => t.id);

    // Step 3: Create a task referencing the captured tabs
    const taskResult = await testPage.evaluate(async (data) => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'createTask',
          params: {
            summary: 'Test Task',
            collectionId: data.collectionId,
            tabIds: data.tabIds.slice(0, 2), // Reference first 2 tabs
            status: 'open'
          }
        }, resolve);
      });
    }, { collectionId, tabIds: capturedTabIds });

    expect(taskResult.success).toBe(true);
    expect(taskResult.task).toBeDefined();

    const taskId = taskResult.task.id;

    // Step 4: Verify collection is saved (not active)
    const collectionCheck = await testPage.evaluate(async (id) => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'getCollection',
          id
        }, resolve);
      });
    }, collectionId);

    expect(collectionCheck.collection.isActive).toBe(false);
    expect(collectionCheck.collection.windowId).toBeNull();

    // Close the test window to truly make the collection saved
    await testWindow.close();

    // Step 5: Restore collection
    const restoreResult = await testPage.evaluate(async (id) => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'restoreCollection',
          collectionId: id,
          createNewWindow: true,
          focused: false
        }, resolve);
      });
    }, collectionId);

    expect(restoreResult.success).toBe(true);
    expect(restoreResult.windowId).toBeDefined();
    expect(restoreResult.stats.tabsRestored).toBeGreaterThan(0);

    // Step 6: Verify collection is now active
    const activeCheck = await testPage.evaluate(async (id) => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'getCollection',
          id
        }, resolve);
      });
    }, collectionId);

    expect(activeCheck.collection.isActive).toBe(true);
    expect(activeCheck.collection.windowId).toBe(restoreResult.windowId);

    // Step 7: Open task tabs
    const openResult = await testPage.evaluate(async (id) => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'openTaskTabs',
          taskId: id
        }, resolve);
      });
    }, taskId);

    expect(openResult.success).toBe(true);
    expect(openResult.tabsOpened).toBeGreaterThan(0);
    expect(openResult.collectionRestored).toBe(false); // Already restored
  });

  test('message handlers: captureWindow', async ({ testPage, context }) => {
    // Create test window
    const testWindow = await context.newPage();
    await testWindow.goto('https://playwright.dev');
    await testWindow.waitForLoadState('load');

    const windowId = await testWindow.evaluate(() => {
      return chrome.windows.getCurrent().then(w => w.id);
    });

    // Capture window
    const result = await testPage.evaluate(async (winId) => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'captureWindow',
          windowId: winId,
          metadata: { name: 'Playwright Window' },
          keepActive: true
        }, resolve);
      });
    }, windowId);

    expect(result.success).toBe(true);
    expect(result.collection).toBeDefined();
    expect(result.collection.name).toBe('Playwright Window');
    expect(result.collection.isActive).toBe(true);
    expect(result.folders).toBeInstanceOf(Array);
    expect(result.tabs).toBeInstanceOf(Array);
    expect(result.stats).toBeDefined();

    await testWindow.close();
  });

  test('message handlers: restoreCollection', async ({ testPage, context }) => {
    // First capture a window
    const testWindow = await context.newPage();
    await testWindow.goto('https://example.com');
    await testWindow.waitForLoadState('load');

    const windowId = await testWindow.evaluate(() => {
      return chrome.windows.getCurrent().then(w => w.id);
    });

    const captureResult = await testPage.evaluate(async (winId) => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'captureWindow',
          windowId: winId,
          metadata: { name: 'Test' },
          keepActive: false
        }, resolve);
      });
    }, windowId);

    expect(captureResult.success).toBe(true);

    // Close the original window
    await testWindow.close();

    // Now restore it
    const restoreResult = await testPage.evaluate(async (id) => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'restoreCollection',
          collectionId: id
        }, resolve);
      });
    }, captureResult.collection.id);

    expect(restoreResult.success).toBe(true);
    expect(restoreResult.windowId).toBeDefined();
    expect(restoreResult.stats.tabsRestored).toBeGreaterThan(0);
  });

  test('message handlers: openTaskTabs', async ({ testPage, context }) => {
    // Capture window
    const testWindow = await context.newPage();
    await testWindow.goto('https://example.com');
    await testWindow.waitForLoadState('load');

    const windowId = await testWindow.evaluate(() => {
      return chrome.windows.getCurrent().then(w => w.id);
    });

    const captureResult = await testPage.evaluate(async (winId) => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'captureWindow',
          windowId: winId,
          metadata: { name: 'Task Test' },
          keepActive: true
        }, resolve);
      });
    }, windowId);

    // Create task
    const taskResult = await testPage.evaluate(async (data) => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'createTask',
          params: {
            summary: 'Open Test',
            collectionId: data.collectionId,
            tabIds: [data.tabId]
          }
        }, resolve);
      });
    }, { collectionId: captureResult.collection.id, tabId: captureResult.tabs[0].id });

    // Open task tabs
    const openResult = await testPage.evaluate(async (id) => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'openTaskTabs',
          taskId: id
        }, resolve);
      });
    }, taskResult.task.id);

    expect(openResult.success).toBe(true);
    expect(openResult.tabsOpened).toBeGreaterThan(0);

    await testWindow.close();
  });
});
