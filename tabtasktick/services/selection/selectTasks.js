/**
 * Task Selection Service
 *
 * Filters tasks using IndexedDB indexes for efficient queries.
 * Supports compound filters (e.g., collectionId + status).
 *
 * Architecture:
 * - Selection layer (read-only, no mutations)
 * - Uses storage utilities from /services/utils/
 * - Returns Task[] arrays based on filter criteria
 *
 * @module services/selection/selectTasks
 */

import { getAllTasks, getTasksByIndex } from '../utils/storage-queries.js';

/**
 * Select tasks based on filter criteria
 *
 * @param {Object} filters - Filter criteria
 * @param {string} [filters.collectionId] - Filter by specific collection (null for uncategorized)
 * @param {string|string[]} [filters.status] - Status filter: 'open', 'active', 'fixed', 'abandoned' (or array)
 * @param {string|string[]} [filters.priority] - Priority filter: 'low', 'medium', 'high', 'critical' (or array)
 * @param {string[]} [filters.tags] - Array of tags (matches any)
 * @param {number} [filters.dueBefore] - Max due date timestamp
 * @param {number} [filters.dueAfter] - Min due date timestamp
 * @param {string} [filters.search] - Search in summary/notes (case-insensitive)
 * @param {string} [filters.sortBy='dueDate'] - Sort field: 'dueDate', 'priority', 'createdAt'
 * @param {string} [filters.sortOrder='asc'] - Sort direction: 'asc' or 'desc'
 * @returns {Promise<Task[]>} Filtered and sorted tasks
 *
 * @example
 * // Get all open tasks for a collection
 * const tasks = await selectTasks({
 *   collectionId: 'col_123',
 *   status: 'open'
 * });
 *
 * @example
 * // Get high priority tasks due soon
 * const urgent = await selectTasks({
 *   priority: ['high', 'critical'],
 *   dueBefore: Date.now() + (24 * 60 * 60 * 1000),
 *   sortBy: 'dueDate'
 * });
 *
 * @example
 * // Get all uncategorized tasks
 * const uncategorized = await selectTasks({
 *   collectionId: null
 * });
 */
export async function selectTasks(filters = {}) {
  const {
    collectionId = undefined,
    status = null,
    priority = null,
    tags = null,
    dueBefore = null,
    dueAfter = null,
    search = null,
    sortBy = 'dueDate',
    sortOrder = 'asc'
  } = filters;

  let tasks = [];

  // Normalize status and priority to arrays for consistent filtering
  const statusArray = status ? (Array.isArray(status) ? status : [status]) : null;
  const priorityArray = priority ? (Array.isArray(priority) ? priority : [priority]) : null;

  // Strategy: Use most selective index first
  // Priority: collectionId > status > priority > tags > all tasks

  if (collectionId !== undefined) {
    // Use collectionId index (most common filter, includes null for uncategorized)
    tasks = await getTasksByIndex('collectionId', collectionId);
  } else if (statusArray && statusArray.length === 1) {
    // Use status index (single status only)
    tasks = await getTasksByIndex('status', statusArray[0]);
  } else if (priorityArray && priorityArray.length === 1) {
    // Use priority index (single priority only)
    tasks = await getTasksByIndex('priority', priorityArray[0]);
  } else if (tags && tags.length > 0) {
    // Use tags index (multi-entry, deduplicate results)
    const tasksWithTags = [];
    for (const tag of tags) {
      const tagMatches = await getTasksByIndex('tags', tag);
      tasksWithTags.push(...tagMatches);
    }
    // Deduplicate by id
    const seen = new Set();
    tasks = tasksWithTags.filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  } else {
    // No selective index applicable, get all tasks
    tasks = await getAllTasks();
  }

  // Apply post-fetch filters

  // Filter by collectionId (if not used as primary index)
  if (collectionId !== undefined && (statusArray || priorityArray || tags)) {
    tasks = tasks.filter(t => t.collectionId === collectionId);
  }

  // Filter by status (if not used as primary index or multiple statuses)
  if (statusArray && statusArray.length > 0) {
    if (collectionId !== undefined || statusArray.length > 1 || priorityArray || tags) {
      tasks = tasks.filter(t => statusArray.includes(t.status));
    }
  }

  // Filter by priority (if not used as primary index or multiple priorities)
  if (priorityArray && priorityArray.length > 0) {
    if (collectionId !== undefined || statusArray || priorityArray.length > 1 || tags) {
      tasks = tasks.filter(t => priorityArray.includes(t.priority));
    }
  }

  // Filter by tags (if not used as primary index)
  if (tags && tags.length > 0 && (collectionId !== undefined || statusArray || priorityArray)) {
    tasks = tasks.filter(t =>
      t.tags && t.tags.some(tag => tags.includes(tag))
    );
  }

  // Due date range filters
  if (dueBefore !== null) {
    tasks = tasks.filter(t => t.dueDate && t.dueDate <= dueBefore);
  }

  if (dueAfter !== null) {
    tasks = tasks.filter(t => t.dueDate && t.dueDate >= dueAfter);
  }

  // Search filter (summary/notes text match)
  if (search) {
    const searchLower = search.toLowerCase();
    tasks = tasks.filter(t => {
      const summaryMatch = t.summary && t.summary.toLowerCase().includes(searchLower);
      const notesMatch = t.notes && t.notes.toLowerCase().includes(searchLower);
      return summaryMatch || notesMatch;
    });
  }

  // Sort tasks
  tasks = sortTasks(tasks, sortBy, sortOrder);

  return tasks;
}

/**
 * Sort tasks by specified field and order
 *
 * Priority ordering: critical > high > medium > low
 *
 * @private
 * @param {Task[]} tasks - Tasks to sort
 * @param {string} sortBy - Field to sort by
 * @param {string} sortOrder - 'asc' or 'desc'
 * @returns {Task[]} Sorted tasks (mutates array)
 */
function sortTasks(tasks, sortBy, sortOrder) {
  const multiplier = sortOrder === 'asc' ? 1 : -1;

  // Priority weights for sorting
  const priorityWeight = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1
  };

  tasks.sort((a, b) => {
    let aVal, bVal;

    switch (sortBy) {
    case 'dueDate':
      // Special handling for null due dates - always sort last regardless of order
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;  // a is null, sort last
      if (!b.dueDate) return -1; // b is null, sort last

      aVal = a.dueDate;
      bVal = b.dueDate;
      break;
    case 'priority':
      aVal = priorityWeight[a.priority] || 0;
      bVal = priorityWeight[b.priority] || 0;
      break;
    case 'createdAt':
      aVal = a.createdAt;
      bVal = b.createdAt;
      break;
    default:
      // Default to dueDate
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;

      aVal = a.dueDate;
      bVal = b.dueDate;
    }

    return multiplier * (aVal - bVal);
  });

  return tasks;
}

/**
 * Get tasks for a specific collection
 *
 * @param {string} collectionId - Collection ID
 * @param {Object} [options] - Additional filter options
 * @returns {Promise<Task[]>} Tasks in collection
 *
 * @example
 * const tasks = await getTasksByCollection('col_123', { status: 'open' });
 */
export async function getTasksByCollection(collectionId, options = {}) {
  return selectTasks({ ...options, collectionId });
}

/**
 * Get uncategorized tasks (no collection)
 *
 * @param {Object} [options] - Additional filter options
 * @returns {Promise<Task[]>} Uncategorized tasks
 *
 * @example
 * const uncategorized = await getUncategorizedTasks();
 */
export async function getUncategorizedTasks(options = {}) {
  return selectTasks({ ...options, collectionId: null });
}

/**
 * Get tasks by status
 *
 * @param {string|string[]} status - Status or array of statuses
 * @param {Object} [options] - Additional filter options
 * @returns {Promise<Task[]>} Tasks with matching status
 *
 * @example
 * const openTasks = await getTasksByStatus('open');
 * const activeTasks = await getTasksByStatus(['open', 'active']);
 */
export async function getTasksByStatus(status, options = {}) {
  return selectTasks({ ...options, status });
}

/**
 * Get overdue tasks (dueDate in the past)
 *
 * @param {Object} [options] - Additional filter options
 * @returns {Promise<Task[]>} Overdue tasks
 *
 * @example
 * const overdue = await getOverdueTasks({ status: ['open', 'active'] });
 */
export async function getOverdueTasks(options = {}) {
  return selectTasks({
    ...options,
    dueBefore: Date.now(),
    sortBy: 'dueDate',
    sortOrder: 'asc'
  });
}

/**
 * Get high priority tasks
 *
 * @param {Object} [options] - Additional filter options
 * @returns {Promise<Task[]>} High and critical priority tasks
 *
 * @example
 * const urgent = await getHighPriorityTasks();
 */
export async function getHighPriorityTasks(options = {}) {
  return selectTasks({
    ...options,
    priority: ['high', 'critical'],
    sortBy: 'priority',
    sortOrder: 'desc'
  });
}

/**
 * Get completed tasks (fixed or abandoned)
 *
 * @param {Object} [options] - Additional filter options
 * @returns {Promise<Task[]>} Completed tasks
 *
 * @example
 * const completed = await getCompletedTasks({ sortBy: 'createdAt' });
 */
export async function getCompletedTasks(options = {}) {
  return selectTasks({
    ...options,
    status: ['fixed', 'abandoned'],
    sortBy: 'createdAt',
    sortOrder: 'desc'
  });
}

/**
 * Search tasks by summary or notes
 *
 * @param {string} query - Search query
 * @param {Object} [options] - Additional filter options
 * @returns {Promise<Task[]>} Matching tasks
 *
 * @example
 * const results = await searchTasks('authentication');
 */
export async function searchTasks(query, options = {}) {
  return selectTasks({ ...options, search: query });
}
