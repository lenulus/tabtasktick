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

import { test, expect } from '@playwright/test';
import { getExtensionPage, sendMessage } from './fixtures/extension.js';

test.describe('Phase 6 - Orchestration Services', () => {
  test('full workflow: capture → save → restore → task execution', async ({ context }) => {
    // Get extension page for sending messages
    const page = await getExtensionPage(context);

    // Step 1: Create a window with some tabs to capture
    const testWindow = await context.newPage();
    await testWindow.goto('https://example.com');

    const windowInfo = await testWindow.evaluate(() => {
      return chrome.windows.getCurrent();
    });

    // Step 2: Capture window as collection
    const captureResult = await sendMessage(page, {
      action: 'captureWindow',
      windowId: windowInfo.id,
      metadata: {
        name: 'Test Collection',
        description: 'E2E test collection',
        tags: ['test']
      },
      keepActive: false // Save as inactive
    });

    expect(captureResult.success).toBe(true);
    expect(captureResult.collection).toBeDefined();
    expect(captureResult.stats.tabsCaptured).toBeGreaterThan(0);

    const collectionId = captureResult.collection.id;
    const capturedTabIds = captureResult.tabs.map(t => t.id);

    // Step 3: Create a task referencing the captured tabs
    const taskResult = await sendMessage(page, {
      action: 'createTask',
      params: {
        summary: 'Test Task',
        collectionId,
        tabIds: capturedTabIds.slice(0, 2), // Reference first 2 tabs
        status: 'open'
      }
    });

    expect(taskResult.success).toBe(true);
    expect(taskResult.task).toBeDefined();

    const taskId = taskResult.task.id;

    // Step 4: Verify collection is saved (not active)
    const collectionCheck = await sendMessage(page, {
      action: 'getCollection',
      id: collectionId
    });

    expect(collectionCheck.collection.isActive).toBe(false);
    expect(collectionCheck.collection.windowId).toBeNull();

    // Step 5: Restore collection
    const restoreResult = await sendMessage(page, {
      action: 'restoreCollection',
      collectionId,
      createNewWindow: true,
      focused: false
    });

    expect(restoreResult.success).toBe(true);
    expect(restoreResult.windowId).toBeDefined();
    expect(restoreResult.stats.tabsRestored).toBeGreaterThan(0);

    // Step 6: Verify collection is now active
    const activeCheck = await sendMessage(page, {
      action: 'getCollection',
      id: collectionId
    });

    expect(activeCheck.collection.isActive).toBe(true);
    expect(activeCheck.collection.windowId).toBe(restoreResult.windowId);

    // Step 7: Open task tabs
    const openResult = await sendMessage(page, {
      action: 'openTaskTabs',
      taskId
    });

    expect(openResult.success).toBe(true);
    expect(openResult.tabsOpened).toBeGreaterThan(0);
    expect(openResult.collectionRestored).toBe(false); // Already restored

    // Cleanup: close test window
    await testWindow.close();
  });

  test('message handlers: captureWindow', async ({ context }) => {
    const page = await getExtensionPage(context);

    // Create test window
    const testWindow = await context.newPage();
    await testWindow.goto('https://playwright.dev');

    const windowInfo = await testWindow.evaluate(() => {
      return chrome.windows.getCurrent();
    });

    // Capture window
    const result = await sendMessage(page, {
      action: 'captureWindow',
      windowId: windowInfo.id,
      metadata: { name: 'Playwright Window' },
      keepActive: true
    });

    expect(result.success).toBe(true);
    expect(result.collection).toBeDefined();
    expect(result.collection.name).toBe('Playwright Window');
    expect(result.collection.isActive).toBe(true);
    expect(result.folders).toBeInstanceOf(Array);
    expect(result.tabs).toBeInstanceOf(Array);
    expect(result.stats).toBeDefined();

    await testWindow.close();
  });

  test('message handlers: restoreCollection', async ({ context }) => {
    const page = await getExtensionPage(context);

    // First capture a window
    const testWindow = await context.newPage();
    await testWindow.goto('https://example.com');

    const windowInfo = await testWindow.evaluate(() => {
      return chrome.windows.getCurrent();
    });

    const captureResult = await sendMessage(page, {
      action: 'captureWindow',
      windowId: windowInfo.id,
      metadata: { name: 'Test' },
      keepActive: false
    });

    expect(captureResult.success).toBe(true);

    // Close the original window
    await testWindow.close();

    // Now restore it
    const restoreResult = await sendMessage(page, {
      action: 'restoreCollection',
      collectionId: captureResult.collection.id
    });

    expect(restoreResult.success).toBe(true);
    expect(restoreResult.windowId).toBeDefined();
    expect(restoreResult.stats.tabsRestored).toBeGreaterThan(0);
  });

  test('message handlers: openTaskTabs', async ({ context }) => {
    const page = await getExtensionPage(context);

    // Capture window
    const testWindow = await context.newPage();
    await testWindow.goto('https://example.com');

    const windowInfo = await testWindow.evaluate(() => {
      return chrome.windows.getCurrent();
    });

    const captureResult = await sendMessage(page, {
      action: 'captureWindow',
      windowId: windowInfo.id,
      metadata: { name: 'Task Test' },
      keepActive: true
    });

    // Create task
    const taskResult = await sendMessage(page, {
      action: 'createTask',
      params: {
        summary: 'Open Test',
        collectionId: captureResult.collection.id,
        tabIds: [captureResult.tabs[0].id]
      }
    });

    // Open task tabs
    const openResult = await sendMessage(page, {
      action: 'openTaskTabs',
      taskId: taskResult.task.id
    });

    expect(openResult.success).toBe(true);
    expect(openResult.tabsOpened).toBeGreaterThan(0);

    await testWindow.close();
  });

  test('message handlers: focusWindow', async ({ context }) => {
    const page = await getExtensionPage(context);

    const testWindow = await context.newPage();
    const windowInfo = await testWindow.evaluate(() => {
      return chrome.windows.getCurrent();
    });

    const result = await sendMessage(page, {
      action: 'focusWindow',
      windowId: windowInfo.id
    });

    expect(result.success).toBe(true);

    await testWindow.close();
  });
});
