/**
 * @file TaskService - Task lifecycle management
 *
 * @description
 * TaskService handles creation, updating, deletion, and retrieval of tasks
 * within collections in TabTaskTick. Tasks are work items that can reference
 * tabs and belong to collections (or be uncategorized).
 *
 * This service enforces business logic around task management:
 * - Creating tasks with proper validation
 * - Updating tasks while preserving immutable fields (id, createdAt)
 * - Managing task status transitions and completion timestamps
 * - Comment management (embedded array)
 * - Tab reference validation (FK enforcement)
 *
 * Business Rules:
 * - summary: Required, non-empty string
 * - collectionId: Optional FK (null for uncategorized tasks)
 * - tabIds: Array of tab storage IDs (many-to-many references)
 * - status: 'open' | 'active' | 'fixed' | 'abandoned' (default: 'open')
 * - priority: 'low' | 'medium' | 'high' | 'critical' (default: 'medium')
 * - completedAt: Set automatically when status becomes 'fixed' or 'abandoned'
 * - comments: Embedded array of { id, text, createdAt }
 *
 * Foreign Key Validation:
 * - If collectionId is set, tabIds must reference tabs in that collection
 * - If collectionId is null, tabIds validation is skipped
 *
 * @module services/execution/TaskService
 *
 * @architecture
 * - Layer: Execution Service
 * - Dependencies: storage-queries.js (CRUD utilities)
 * - Used By: UI surfaces, task management features
 * - Storage: IndexedDB (via storage-queries.js)
 *
 * @example
 * // Create new task in collection
 * import * as TaskService from './services/execution/TaskService.js';
 *
 * const task = await TaskService.createTask({
 *   summary: 'Fix authentication bug',
 *   collectionId: 'col_123',
 *   priority: 'high',
 *   tags: ['bug', 'backend'],
 *   tabIds: ['tab_1', 'tab_2']
 * });
 *
 * @example
 * // Create uncategorized task
 * const uncategorized = await TaskService.createTask({
 *   summary: 'Research new framework',
 *   collectionId: null
 * });
 *
 * @example
 * // Update task and mark as fixed
 * const updated = await TaskService.updateTask('task_123', {
 *   status: 'fixed',
 *   notes: 'Resolved by extending token refresh window'
 * });
 *
 * @example
 * // Add comment to task
 * const withComment = await TaskService.addComment('task_123', 'Fixed in PR #234');
 */

import {
  getTask,
  getTasksByCollection as getTasksByCollectionStorage,
  saveTask,
  deleteTask as deleteTaskStorage
} from '../utils/storage-queries.js';
import { getCollection } from '../utils/storage-queries.js';
import { getFoldersByCollection } from '../utils/storage-queries.js';
import { getTab } from '../utils/storage-queries.js';

/**
 * Valid task status values
 * @constant
 */
const VALID_STATUSES = ['open', 'active', 'fixed', 'abandoned'];

/**
 * Valid task priority values
 * @constant
 */
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];

/**
 * Creates a new task.
 *
 * Generates unique ID and validates required fields. Tasks can belong to a
 * collection or be uncategorized (collectionId: null).
 *
 * Required fields:
 * - summary: Task summary (non-empty)
 *
 * Optional fields:
 * - notes: Long-form notes (markdown supported)
 * - status: Task status (default: 'open')
 * - priority: Task priority (default: 'medium')
 * - dueDate: Due date timestamp
 * - tags: Array of tag strings (default: [])
 * - collectionId: Parent collection ID (FK, null for uncategorized)
 * - tabIds: Array of tab storage IDs (default: [])
 *
 * @param {Object} params - Task parameters
 * @param {string} params.summary - Task summary (required, non-empty)
 * @param {string} [params.notes] - Long-form notes
 * @param {string} [params.status] - Task status (default: 'open')
 * @param {string} [params.priority] - Task priority (default: 'medium')
 * @param {number} [params.dueDate] - Due date timestamp
 * @param {string[]} [params.tags] - Tag array (default: [])
 * @param {string|null} [params.collectionId] - Parent collection ID (default: null)
 * @param {string[]} [params.tabIds] - Tab storage IDs (default: [])
 *
 * @returns {Promise<Object>} Created task object
 * @returns {string} return.id - Generated UUID
 * @returns {string} return.summary - Task summary
 * @returns {string} return.status - Task status
 * @returns {string} return.priority - Task priority
 * @returns {string|null} return.collectionId - Parent collection ID or null
 * @returns {string[]} return.tabIds - Tab storage IDs
 * @returns {string[]} return.tags - Tags
 * @returns {Array} return.comments - Comments array (empty on creation)
 * @returns {number} return.createdAt - Creation timestamp
 *
 * @throws {Error} If summary is missing or empty
 * @throws {Error} If status is invalid
 * @throws {Error} If priority is invalid
 * @throws {Error} If storage operation fails
 *
 * @example
 * // Create task with required fields
 * const task = await createTask({
 *   summary: 'Fix bug'
 * });
 *
 * @example
 * // Create task with all fields
 * const richTask = await createTask({
 *   summary: 'Implement OAuth',
 *   notes: 'Use authorization code flow',
 *   status: 'active',
 *   priority: 'high',
 *   dueDate: Date.now() + 86400000,
 *   tags: ['feature', 'backend'],
 *   collectionId: 'col_123',
 *   tabIds: ['tab_1', 'tab_2']
 * });
 */
export async function createTask(params) {
  // Validation
  if (!params.summary || params.summary.trim() === '') {
    throw new Error('Task summary is required');
  }

  const status = params.status || 'open';
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid task status: ${status}. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  const priority = params.priority || 'medium';
  if (!VALID_PRIORITIES.includes(priority)) {
    throw new Error(`Invalid task priority: ${priority}. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  const task = {
    id,
    summary: params.summary,
    status,
    priority,
    tags: params.tags || [],
    collectionId: params.collectionId !== undefined ? params.collectionId : null,
    tabIds: params.tabIds || [],
    comments: [],
    createdAt: now,
    // Optional fields (only include if provided)
    ...(params.notes !== undefined && { notes: params.notes }),
    ...(params.dueDate !== undefined && { dueDate: params.dueDate })
  };

  // Save to IndexedDB
  await saveTask(task);

  return task;
}

/**
 * Updates an existing task with new values.
 *
 * Merges provided updates with existing task data while preserving:
 * - id (immutable)
 * - createdAt (immutable)
 * - completedAt (set automatically on status transition)
 *
 * Special handling:
 * - Sets completedAt when status changes to 'fixed' or 'abandoned'
 * - Validates tabIds reference tabs in collection (if collectionId present)
 *
 * Validation:
 * - Task must exist
 * - summary cannot be empty string
 * - status must be valid value
 * - priority must be valid value
 * - tags must be array
 * - tabIds must be array and reference valid tabs
 *
 * @param {string} id - Task ID
 * @param {Object} updates - Fields to update
 * @param {string} [updates.summary] - New task summary
 * @param {string} [updates.notes] - New notes
 * @param {string} [updates.status] - New status
 * @param {string} [updates.priority] - New priority
 * @param {number} [updates.dueDate] - New due date
 * @param {string[]} [updates.tags] - New tags array
 * @param {string[]} [updates.tabIds] - New tab IDs array
 *
 * @returns {Promise<Object>} Updated task object
 *
 * @throws {Error} If task not found
 * @throws {Error} If summary is empty string
 * @throws {Error} If status is invalid
 * @throws {Error} If priority is invalid
 * @throws {Error} If tags is not array
 * @throws {Error} If tabIds is not array
 * @throws {Error} If tabIds reference invalid tabs
 * @throws {Error} If storage operation fails
 *
 * @example
 * // Update summary and priority
 * const updated = await updateTask('task_123', {
 *   summary: 'Updated summary',
 *   priority: 'high'
 * });
 *
 * @example
 * // Mark task as fixed
 * const fixed = await updateTask('task_123', {
 *   status: 'fixed'
 * });
 * console.log(fixed.completedAt); // Timestamp set automatically
 */
export async function updateTask(id, updates) {
  // Get existing task
  const existing = await getTask(id);
  if (!existing) {
    throw new Error(`Task not found: ${id}`);
  }

  // Validate updates
  if (updates.summary !== undefined && updates.summary.trim() === '') {
    throw new Error('Task summary cannot be empty');
  }

  if (updates.status !== undefined && !VALID_STATUSES.includes(updates.status)) {
    throw new Error(`Invalid task status: ${updates.status}. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  if (updates.priority !== undefined && !VALID_PRIORITIES.includes(updates.priority)) {
    throw new Error(`Invalid task priority: ${updates.priority}. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }

  if (updates.tags !== undefined && !Array.isArray(updates.tags)) {
    throw new Error('Tags must be an array');
  }

  if (updates.tabIds !== undefined && !Array.isArray(updates.tabIds)) {
    throw new Error('Tab IDs must be an array');
  }

  // Validate tabIds reference tabs in collection (if collectionId is set)
  if (updates.tabIds !== undefined) {
    const collectionId = updates.collectionId !== undefined ? updates.collectionId : existing.collectionId;

    if (collectionId !== null) {
      // Get all folders in collection to find valid tab IDs
      const folders = await getFoldersByCollection(collectionId);
      const validTabIds = new Set();

      for (const folder of folders) {
        // Get all tabs in folder
        const { getTabsByFolder } = await import('../utils/storage-queries.js');
        const tabs = await getTabsByFolder(folder.id);
        for (const tab of tabs) {
          validTabIds.add(tab.id);
        }
      }

      // Validate each tab ID
      for (const tabId of updates.tabIds) {
        if (!validTabIds.has(tabId)) {
          throw new Error(`Invalid tab reference: ${tabId} does not belong to collection ${collectionId}`);
        }
      }
    }
    // If collectionId is null, skip validation (uncategorized task)
  }

  // Merge updates with existing, preserving immutable fields
  const updated = {
    ...existing,
    ...updates,
    // Preserve immutable fields
    id: existing.id,
    createdAt: existing.createdAt
  };

  // Set completedAt if status changes to 'fixed' or 'abandoned'
  const newStatus = updates.status !== undefined ? updates.status : existing.status;
  if ((newStatus === 'fixed' || newStatus === 'abandoned') && !existing.completedAt) {
    updated.completedAt = Date.now();
  }

  // Save updated task
  await saveTask(updated);

  return updated;
}

/**
 * Deletes a task.
 *
 * Deletes task from storage. Tasks don't cascade delete (no children).
 * This is a thin wrapper for consistency with service pattern.
 *
 * Note: Task references in UI should handle missing tasks gracefully.
 *
 * @param {string} id - Task ID to delete
 *
 * @returns {Promise<void>}
 *
 * @throws {Error} If storage operation fails
 *
 * @example
 * // Delete task
 * await deleteTask('task_123');
 */
export async function deleteTask(id) {
  await deleteTaskStorage(id);
}

/**
 * Adds a comment to a task.
 *
 * Generates comment ID and appends to task.comments array.
 * Comments are embedded (not separate object store).
 *
 * @param {string} taskId - Task ID
 * @param {string} text - Comment text (required, non-empty)
 *
 * @returns {Promise<Object>} Updated task with new comment
 *
 * @throws {Error} If task not found
 * @throws {Error} If comment text is empty
 * @throws {Error} If storage operation fails
 *
 * @example
 * // Add comment to task
 * const updated = await addComment('task_123', 'Fixed in PR #234');
 * console.log(updated.comments.length); // 1
 */
export async function addComment(taskId, text) {
  // Validation
  if (!text || text.trim() === '') {
    throw new Error('Comment text is required');
  }

  // Get existing task
  const existing = await getTask(taskId);
  if (!existing) {
    throw new Error(`Task not found: ${taskId}`);
  }

  // Create comment object
  const comment = {
    id: crypto.randomUUID(),
    text,
    createdAt: Date.now()
  };

  // Add comment to comments array
  const comments = [...existing.comments, comment];

  // Update task with new comment
  const updated = await updateTask(taskId, { comments });

  return updated;
}

/**
 * Gets all tasks for a collection, sorted by creation time (newest first).
 *
 * Returns tasks in reverse chronological order.
 *
 * @param {string} collectionId - Collection ID
 *
 * @returns {Promise<Array>} Array of task objects sorted by createdAt (newest first)
 *
 * @throws {Error} If storage operation fails
 *
 * @example
 * // Get tasks for collection
 * const tasks = await getTasksByCollection('col_123');
 * // Returns: [{ createdAt: newest, ... }, { createdAt: older, ... }, ...]
 */
export async function getTasksByCollection(collectionId) {
  const tasks = await getTasksByCollectionStorage(collectionId);

  // Sort by createdAt (newest first)
  return tasks.sort((a, b) => b.createdAt - a.createdAt);
}
