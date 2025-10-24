/**
 * @file TaskExecutionService - Task execution orchestration
 *
 * @description
 * TaskExecutionService handles opening task tabs and managing their associated
 * collections. When a task references tabs in a saved collection, the service
 * automatically restores the collection as a window before focusing the tabs.
 *
 * The service coordinates multiple operations:
 * - Fetching task and collection data
 * - Restoring saved collections (via RestoreCollectionService)
 * - Focusing tabs in active collections
 * - Creating new tabs for uncategorized tasks
 *
 * State Management:
 * - Detects whether collection is active or saved
 * - Restores saved collections before accessing tabs
 * - Handles tasks without collections (uncategorized)
 * - Focuses tabs using Chrome API (active/highlight)
 *
 * Edge Cases Handled:
 * - Task not found - clear error
 * - Collection not found - clear error
 * - Tabs no longer exist - warning
 * - No tabs referenced - warning
 * - Collection restoration failures - propagate error
 *
 * @module services/execution/TaskExecutionService
 *
 * @architecture
 * - Layer: Orchestration Service
 * - Dependencies: RestoreCollectionService, TaskService, storage-queries
 * - Used By: Background message handlers, UI surfaces
 * - Storage: IndexedDB (read-only via selection services)
 *
 * @example
 * // Open task tabs (restores collection if needed)
 * import * as TaskExecutionService from './services/execution/TaskExecutionService.js';
 *
 * const result = await TaskExecutionService.openTaskTabs('task_123');
 *
 * console.log(`Opened ${result.tabsOpened} tabs in window ${result.windowId}`);
 *
 * @example
 * // Open uncategorized task
 * const result = await TaskExecutionService.openTaskTabs('task_456');
 * console.log(`Created ${result.tabsCreated} new tabs`);
 */

import * as RestoreCollectionService from './RestoreCollectionService.js';
import { getTask } from '../utils/storage-queries.js';
import { getCollection, getCompleteCollection } from '../utils/storage-queries.js';

/**
 * Opens tabs referenced by a task.
 *
 * Orchestrates the process of opening task tabs with intelligent handling
 * of collection state:
 * - If task has collection + collection is saved → restore collection first
 * - If task has collection + collection is active → focus tabs directly
 * - If task has no collection → create tabs in current window
 *
 * Process:
 * 1. Fetch task from storage
 * 2. Check if task has collection
 * 3. If collection is saved, restore it via RestoreCollectionService
 * 4. Map task.tabIds to Chrome tab IDs
 * 5. Focus tabs using chrome.tabs.update()
 * 6. Return stats on opened tabs
 *
 * Stats returned:
 * - tabsOpened: Number of tabs successfully focused/created
 * - tabsMissing: Number of tab IDs that no longer exist
 * - collectionRestored: Whether collection was restored
 * - windowId: Window containing opened tabs
 * - warnings: Array of warning messages
 *
 * @param {string} taskId - Task ID to open tabs for (required)
 *
 * @returns {Promise<Object>} Execution result
 * @returns {number} return.tabsOpened - Tabs successfully opened/focused
 * @returns {number} return.tabsMissing - Tabs that no longer exist
 * @returns {boolean} return.collectionRestored - Whether collection was restored
 * @returns {number} [return.windowId] - Window ID (if collection-based task)
 * @returns {string[]} return.warnings - Warning messages
 *
 * @throws {Error} If taskId is missing
 * @throws {Error} If task not found
 * @throws {Error} If collection restoration fails
 *
 * @example
 * // Open task with saved collection
 * const result = await openTaskTabs('task_123');
 * // Result: { tabsOpened: 3, tabsMissing: 0, collectionRestored: true, windowId: 456 }
 *
 * @example
 * // Open task with active collection
 * const result = await openTaskTabs('task_456');
 * // Result: { tabsOpened: 2, tabsMissing: 1, collectionRestored: false, windowId: 789 }
 *
 * @example
 * // Open uncategorized task
 * const result = await openTaskTabs('task_789');
 * // Result: { tabsOpened: 1, tabsMissing: 0, collectionRestored: false }
 */
export async function openTaskTabs(taskId) {
  // Validation
  if (!taskId) {
    throw new Error('Task ID is required');
  }

  const warnings = [];

  // Step 1: Fetch task
  const task = await getTask(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  // Step 2: Check if task has tabs to open
  if (!task.tabIds || task.tabIds.length === 0) {
    warnings.push('Task has no tabs to open');
    return {
      tabsOpened: 0,
      tabsMissing: 0,
      collectionRestored: false,
      warnings
    };
  }

  // Step 3: Handle uncategorized tasks (no collection)
  if (!task.collectionId) {
    return await openUncategorizedTaskTabs(task, warnings);
  }

  // Step 4: Fetch collection
  const collection = await getCollection(task.collectionId);
  if (!collection) {
    throw new Error(`Collection not found: ${task.collectionId}`);
  }

  // Step 5: Handle saved collection (restore it first)
  let windowId = collection.windowId;
  let collectionRestored = false;

  if (!collection.isActive) {
    // Restore collection as new window
    const restoreResult = await RestoreCollectionService.restoreCollection({
      collectionId: collection.id
    });

    windowId = restoreResult.windowId;
    collectionRestored = true;
  }

  // Step 6: Get complete collection with tabs
  const completeCollection = await getCompleteCollection(collection.id);
  const { folders } = completeCollection;

  // Flatten tabs from folders
  const allTabs = [];
  for (const folder of folders) {
    if (folder.tabs) {
      allTabs.push(...folder.tabs);
    }
  }

  // Step 7: Map task tab IDs to Chrome tab IDs
  const chromeTabIds = [];
  const missingTabIds = [];

  for (const taskTabId of task.tabIds) {
    const tab = allTabs.find(t => t.id === taskTabId);
    if (tab && tab.tabId) {
      chromeTabIds.push(tab.tabId);
    } else {
      missingTabIds.push(taskTabId);
      warnings.push(`Tab no longer exists: ${taskTabId}`);
    }
  }

  // Step 8: Focus tabs
  let tabsOpened = 0;

  for (const chromeTabId of chromeTabIds) {
    try {
      await chrome.tabs.update(chromeTabId, { active: true });
      tabsOpened++;
    } catch (error) {
      warnings.push(`Failed to focus tab ${chromeTabId}: ${error.message}`);
    }
  }

  return {
    tabsOpened,
    tabsMissing: missingTabIds.length,
    collectionRestored,
    windowId,
    warnings
  };
}

/**
 * Opens tabs for uncategorized tasks (no collection).
 *
 * Creates new tabs in the current window for tasks that don't belong to
 * a collection. This is a simpler flow since there's no collection restoration.
 *
 * Process:
 * 1. Get current window
 * 2. For each tab ID, fetch tab metadata from storage
 * 3. Create new tab with URL in current window
 * 4. Return stats
 *
 * Note: task.tabIds for uncategorized tasks contain storage tab IDs that
 * may not have associated Chrome tab IDs (they're saved URLs, not active tabs).
 *
 * @param {Object} task - Task object
 * @param {string[]} warnings - Warnings array to append to
 *
 * @returns {Promise<Object>} Execution result
 *
 * @private
 */
async function openUncategorizedTaskTabs(task, warnings) {
  // For uncategorized tasks, tab IDs may not map to active tabs
  // We need to create new tabs with the URLs

  // Get current window
  const currentWindow = await chrome.windows.getCurrent();
  const windowId = currentWindow.id;

  let tabsOpened = 0;

  // For uncategorized tasks, we'd need to store tab URLs directly
  // Since the current data model stores task.tabIds as references to storage tabs,
  // we'll need to fetch those tabs to get URLs

  // Import getTab from storage-queries
  const { getTab } = await import('../utils/storage-queries.js');

  for (const tabId of task.tabIds) {
    try {
      const tab = await getTab(tabId);
      if (tab && tab.url) {
        await chrome.tabs.create({
          windowId,
          url: tab.url,
          active: false
        });
        tabsOpened++;
      } else {
        warnings.push(`Tab data not found: ${tabId}`);
      }
    } catch (error) {
      warnings.push(`Failed to open tab ${tabId}: ${error.message}`);
    }
  }

  // Focus window
  await chrome.windows.update(windowId, { focused: true });

  return {
    tabsOpened,
    tabsMissing: 0,
    collectionRestored: false,
    windowId,
    warnings
  };
}
