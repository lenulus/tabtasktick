/**
 * TaskExecutionService Tests
 *
 * Tests for task execution orchestration. Uses real storage utilities
 * with fake-indexeddb and mocked Chrome APIs for integration testing.
 */

import 'fake-indexeddb/auto';
import { closeDB } from '../services/utils/db.js';
import * as TaskExecutionService from '../services/execution/TaskExecutionService.js';
import * as CaptureWindowService from '../services/execution/CaptureWindowService.js';
import * as TaskService from '../services/execution/TaskService.js';

describe('TaskExecutionService', () => {
  beforeEach(async () => {
    // Close any existing connection and clear all databases
    closeDB();
    const databases = await indexedDB.databases();
    for (const db of databases) {
      indexedDB.deleteDatabase(db.name);
    }
  });

  afterEach(() => {
    closeDB();
  });

  describe('openTaskTabs', () => {
    test('opens task tabs in active collection', async () => {
      // Capture window to create collection
      chrome.windows.get.mockResolvedValue({ id: 123 });
      chrome.tabs.query.mockResolvedValue([
        {
          id: 1,
          url: 'https://github.com/repo1',
          title: 'Repo 1',
          index: 0,
          groupId: -1,
          pinned: false
        },
        {
          id: 2,
          url: 'https://github.com/repo2',
          title: 'Repo 2',
          index: 1,
          groupId: -1,
          pinned: false
        }
      ]);
      chrome.tabGroups.query.mockResolvedValue([]);

      const captured = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Test Collection' },
        keepActive: true // Keep as active
      });

      // Create task referencing these tabs
      const task = await TaskService.createTask({
        summary: 'Test Task',
        collectionId: captured.collection.id,
        tabIds: [captured.tabs[0].id, captured.tabs[1].id]
      });

      // Mock chrome.tabs.update for focusing
      chrome.tabs.update.mockResolvedValue({});

      // Open task tabs
      const result = await TaskExecutionService.openTaskTabs(task.id);

      // Verify tabs were focused
      expect(result.tabsOpened).toBe(2);
      expect(result.tabsMissing).toBe(0);
      expect(result.collectionRestored).toBe(false); // Already active
      expect(result.windowId).toBe(123);
      expect(chrome.tabs.update).toHaveBeenCalledTimes(2);
    });

    test('restores saved collection before opening tabs', async () => {
      // Capture window as saved collection
      chrome.windows.get.mockResolvedValue({ id: 123 });
      chrome.tabs.query.mockResolvedValue([
        {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
          index: 0,
          groupId: -1,
          pinned: false
        }
      ]);
      chrome.tabGroups.query.mockResolvedValue([]);

      const captured = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Saved Collection' },
        keepActive: false // Save as inactive
      });

      // Create task
      const task = await TaskService.createTask({
        summary: 'Test Task',
        collectionId: captured.collection.id,
        tabIds: [captured.tabs[0].id]
      });

      // Mock restoration
      let newTabId = 200;
      chrome.tabs.create.mockImplementation(() =>
        Promise.resolve({ id: newTabId++, windowId: 456 })
      );
      chrome.windows.create.mockResolvedValue({ id: 456 });
      chrome.tabs.query.mockResolvedValue([]);
      chrome.tabs.update.mockResolvedValue({});

      // Open task tabs
      const result = await TaskExecutionService.openTaskTabs(task.id);

      // Verify collection was restored
      expect(result.collectionRestored).toBe(true);
      expect(result.windowId).toBe(456);
      expect(chrome.windows.create).toHaveBeenCalled();
    });

    test('warns about missing tabs', async () => {
      // Capture window
      chrome.windows.get.mockResolvedValue({ id: 123 });
      chrome.tabs.query.mockResolvedValue([
        {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
          index: 0,
          groupId: -1,
          pinned: false
        }
      ]);
      chrome.tabGroups.query.mockResolvedValue([]);

      const captured = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Test' },
        keepActive: true
      });

      // Create task with non-existent tab ID
      const task = await TaskService.createTask({
        summary: 'Test Task',
        collectionId: captured.collection.id,
        tabIds: [captured.tabs[0].id, 'nonexistent-tab-id']
      });

      chrome.tabs.update.mockResolvedValue({});

      // Open task tabs
      const result = await TaskExecutionService.openTaskTabs(task.id);

      // Verify warning about missing tab
      expect(result.tabsOpened).toBe(1);
      expect(result.tabsMissing).toBe(1);
      expect(result.warnings).toContain('Tab no longer exists: nonexistent-tab-id');
    });

    test('handles task with no tabs', async () => {
      // Create task without tabs
      const task = await TaskService.createTask({
        summary: 'Empty Task',
        tabIds: []
      });

      const result = await TaskExecutionService.openTaskTabs(task.id);

      expect(result.tabsOpened).toBe(0);
      expect(result.tabsMissing).toBe(0);
      expect(result.warnings).toContain('Task has no tabs to open');
    });

    test('throws error if taskId missing', async () => {
      await expect(
        TaskExecutionService.openTaskTabs()
      ).rejects.toThrow('Task ID is required');
    });

    test('throws error if task not found', async () => {
      await expect(
        TaskExecutionService.openTaskTabs('nonexistent')
      ).rejects.toThrow('Task not found');
    });

    test('throws error if collection not found', async () => {
      // Create task with invalid collection ID
      const task = await TaskService.createTask({
        summary: 'Test Task',
        collectionId: 'nonexistent-collection',
        tabIds: ['tab1']
      });

      await expect(
        TaskExecutionService.openTaskTabs(task.id)
      ).rejects.toThrow('Collection not found');
    });

    test('handles tab focus failure gracefully', async () => {
      // Capture window
      chrome.windows.get.mockResolvedValue({ id: 123 });
      chrome.tabs.query.mockResolvedValue([
        {
          id: 1,
          url: 'https://example.com',
          title: 'Example',
          index: 0,
          groupId: -1,
          pinned: false
        }
      ]);
      chrome.tabGroups.query.mockResolvedValue([]);

      const captured = await CaptureWindowService.captureWindow({
        windowId: 123,
        metadata: { name: 'Test' },
        keepActive: true
      });

      const task = await TaskService.createTask({
        summary: 'Test Task',
        collectionId: captured.collection.id,
        tabIds: [captured.tabs[0].id]
      });

      // Mock chrome.tabs.update to fail
      chrome.tabs.update.mockRejectedValue(new Error('Tab closed'));

      // Open task tabs
      const result = await TaskExecutionService.openTaskTabs(task.id);

      // Should handle error gracefully
      expect(result.tabsOpened).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
