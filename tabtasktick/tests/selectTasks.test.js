/**
 * Integration tests for selectTasks.js
 *
 * Uses fake-indexeddb to test selection service against actual IndexedDB operations.
 * This validates both the selection logic and the underlying storage layer together.
 *
 * Pattern: Same as Phase 1 tests (db.test.js, storage-queries.test.js)
 */

import 'fake-indexeddb/auto';
import { closeDB } from '../services/utils/db.js';
import { saveTask } from '../services/utils/storage-queries.js';
import {
  selectTasks,
  getTasksByCollection,
  getUncategorizedTasks,
  getTasksByStatus,
  getOverdueTasks,
  getHighPriorityTasks,
  getCompletedTasks,
  searchTasks
} from '../services/selection/selectTasks.js';

describe('selectTasks - Integration Tests', () => {
  const now = Date.now();

  beforeEach(async () => {
    // Close any existing connection
    closeDB();

    // Clear all IndexedDB databases
    const databases = await indexedDB.databases();
    for (const db of databases) {
      indexedDB.deleteDatabase(db.name);
    }
  });

  afterEach(() => {
    closeDB();
  });

  // Test data helper
  async function createTestTasks() {
    const tasks = [
      {
        id: 'task_1',
        summary: 'Fix authentication bug',
        notes: 'Users logged out after 5min',
        status: 'active',
        priority: 'high',
        dueDate: now - 86400000, // Overdue (1 day ago)
        tags: ['bug', 'backend'],
        collectionId: 'col_1',
        tabIds: ['tab_1', 'tab_2'],
        comments: [],
        createdAt: 1000,
        completedAt: null
      },
      {
        id: 'task_2',
        summary: 'Write API docs',
        notes: null,
        status: 'open',
        priority: 'medium',
        dueDate: now + 86400000, // Due tomorrow
        tags: ['docs'],
        collectionId: 'col_1',
        tabIds: ['tab_3'],
        comments: [],
        createdAt: 2000,
        completedAt: null
      },
      {
        id: 'task_3',
        summary: 'Buy groceries',
        notes: 'Milk, eggs, bread',
        status: 'open',
        priority: 'low',
        dueDate: null, // No due date
        tags: ['personal'],
        collectionId: null, // Uncategorized
        tabIds: [],
        comments: [],
        createdAt: 3000,
        completedAt: null
      },
      {
        id: 'task_4',
        summary: 'Review PR #234',
        notes: null,
        status: 'fixed',
        priority: 'medium',
        dueDate: now - 172800000, // Completed 2 days ago
        tags: ['code-review'],
        collectionId: 'col_2',
        tabIds: ['tab_4', 'tab_5'],
        comments: [],
        createdAt: 4000,
        completedAt: now - 172800000
      },
      {
        id: 'task_5',
        summary: 'Critical security patch',
        notes: 'Apply CVE fix',
        status: 'open',
        priority: 'critical',
        dueDate: now + 3600000, // Due in 1 hour
        tags: ['security', 'urgent'],
        collectionId: 'col_1',
        tabIds: ['tab_6'],
        comments: [],
        createdAt: 5000,
        completedAt: null
      }
    ];

    for (const task of tasks) {
      await saveTask(task);
    }

    return tasks;
  }

  describe('Filter by collectionId', () => {
    test('returns tasks for specific collection', async () => {
      await createTestTasks();

      const result = await selectTasks({ collectionId: 'col_1' });

      expect(result).toHaveLength(3);
      expect(result.every(t => t.collectionId === 'col_1')).toBe(true);
      expect(result.map(t => t.id).sort()).toEqual(['task_1', 'task_2', 'task_5']);
    });

    test('returns uncategorized tasks when collectionId is null', async () => {
      // Uses collectionId index query with null - see KNOWN_LIMITATIONS.md
      await createTestTasks();

      const result = await selectTasks({ collectionId: null });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('task_3');
      expect(result[0].collectionId).toBe(null);
    });
  });

  describe('Filter by status', () => {
    test('returns tasks with single status', async () => {
      await createTestTasks();

      const result = await selectTasks({ status: 'open' });

      expect(result).toHaveLength(3);
      expect(result.every(t => t.status === 'open')).toBe(true);
    });

    test('returns tasks with multiple statuses', async () => {
      await createTestTasks();

      const result = await selectTasks({ status: ['open', 'active'] });

      expect(result).toHaveLength(4);
      expect(result.every(t => t.status === 'open' || t.status === 'active')).toBe(true);
    });

    test('combines collectionId and status filters', async () => {
      await createTestTasks();

      const result = await selectTasks({
        collectionId: 'col_1',
        status: 'open'
      });

      expect(result).toHaveLength(2);
      expect(result.every(t => t.collectionId === 'col_1' && t.status === 'open')).toBe(true);
      expect(result.map(t => t.id).sort()).toEqual(['task_2', 'task_5']);
    });
  });

  describe('Filter by priority', () => {
    test('returns tasks with single priority', async () => {
      await createTestTasks();

      const result = await selectTasks({ priority: 'critical' });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('task_5');
      expect(result[0].priority).toBe('critical');
    });

    test('returns tasks with multiple priorities', async () => {
      await createTestTasks();

      const result = await selectTasks({ priority: ['high', 'critical'] });

      expect(result).toHaveLength(2);
      expect(result.every(t => t.priority === 'high' || t.priority === 'critical')).toBe(true);
    });
  });

  describe('Filter by tags', () => {
    test('returns tasks with matching tag', async () => {
      await createTestTasks();

      const result = await selectTasks({ tags: ['backend'] });

      expect(result.length).toBeGreaterThan(0);
      expect(result.every(t => t.tags.includes('backend'))).toBe(true);
    });

    test('deduplicates tasks with multiple matching tags', async () => {
      await createTestTasks();

      // task_1 has both 'bug' and 'backend' tags
      const result = await selectTasks({ tags: ['bug', 'backend'] });

      // Should return task_1 only once
      const task1Count = result.filter(t => t.id === 'task_1').length;
      expect(task1Count).toBe(1);
    });
  });

  describe('Filter by due date', () => {
    test('filters by dueBefore', async () => {
      await createTestTasks();

      const result = await selectTasks({ dueBefore: now });

      expect(result).toHaveLength(2); // task_1 and task_4 are in the past
      expect(result.every(t => t.dueDate && t.dueDate <= now)).toBe(true);
    });

    test('filters by dueAfter', async () => {
      await createTestTasks();

      const result = await selectTasks({ dueAfter: now });

      expect(result).toHaveLength(2); // task_2 and task_5 are in the future
      expect(result.every(t => t.dueDate && t.dueDate >= now)).toBe(true);
    });

    test('combines dueBefore and dueAfter', async () => {
      // Uses getAllTasks() which depends on index queries
      await createTestTasks();

      const tomorrow = now + 86400000;
      const result = await selectTasks({
        dueAfter: now,
        dueBefore: tomorrow
      });

      expect(result).toHaveLength(2); // task_5 (due in 1 hour) and task_2 (due tomorrow)
      expect(result.map(t => t.id).sort()).toEqual(['task_2', 'task_5']);
    });
  });

  describe('Search filter', () => {
    test('searches in task summary', async () => {
      await createTestTasks();

      const result = await selectTasks({ search: 'authentication' });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('task_1');
    });

    test('searches in task notes', async () => {
      await createTestTasks();

      const result = await selectTasks({ search: 'logged out' });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('task_1');
    });

    test('is case-insensitive', async () => {
      await createTestTasks();

      const result = await selectTasks({ search: 'BUG' });

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Sorting', () => {
    test('sorts by dueDate ascending (default)', async () => {
      await createTestTasks();

      const result = await selectTasks({});

      // Order: task_4, task_1, task_5, task_2, task_3 (no due date = last)
      expect(result[0].id).toBe('task_4'); // Oldest due date
      expect(result[result.length - 1].id).toBe('task_3'); // No due date
    });

    test('sorts by dueDate descending', async () => {
      // Uses getAllTasks() which depends on index queries
      await createTestTasks();

      const result = await selectTasks({ sortBy: 'dueDate', sortOrder: 'desc' });

      // task_3 (no due date) should still be last
      expect(result[0].id).toBe('task_2'); // Latest due date
      expect(result[result.length - 1].id).toBe('task_3');
    });

    test('sorts by priority descending (critical first)', async () => {
      // Uses getAllTasks() which depends on index queries
      await createTestTasks();

      const result = await selectTasks({ sortBy: 'priority', sortOrder: 'desc' });

      expect(result[0].priority).toBe('critical');
      expect(result[1].priority).toBe('high');
      expect(result[result.length - 1].priority).toBe('low');
    });

    test('sorts by createdAt', async () => {
      await createTestTasks();

      const result = await selectTasks({ sortBy: 'createdAt', sortOrder: 'asc' });

      expect(result[0].id).toBe('task_1'); // createdAt: 1000
      expect(result[result.length - 1].id).toBe('task_5'); // createdAt: 5000
    });
  });

  describe('Convenience functions', () => {
    test('getTasksByCollection filters by collection', async () => {
      await createTestTasks();

      const result = await getTasksByCollection('col_1');

      expect(result).toHaveLength(3);
      expect(result.every(t => t.collectionId === 'col_1')).toBe(true);
    });

    test('getTasksByCollection accepts additional options', async () => {
      await createTestTasks();

      const result = await getTasksByCollection('col_1', { status: 'open' });

      expect(result).toHaveLength(2);
      expect(result.every(t => t.status === 'open')).toBe(true);
    });

    test('getUncategorizedTasks returns uncategorized tasks', async () => {
      // Uses collectionId index query with null - see KNOWN_LIMITATIONS.md
      await createTestTasks();

      const result = await getUncategorizedTasks();

      expect(result).toHaveLength(1);
      expect(result[0].collectionId).toBe(null);
    });

    test('getTasksByStatus filters by status', async () => {
      await createTestTasks();

      const result = await getTasksByStatus('open');

      expect(result).toHaveLength(3);
      expect(result.every(t => t.status === 'open')).toBe(true);
    });

    test('getOverdueTasks returns overdue tasks', async () => {
      await createTestTasks();

      const result = await getOverdueTasks();

      expect(result.every(t => t.dueDate && t.dueDate < now)).toBe(true);
    });

    test('getHighPriorityTasks returns high and critical tasks', async () => {
      await createTestTasks();

      const result = await getHighPriorityTasks();

      expect(result).toHaveLength(2);
      expect(result.every(t => t.priority === 'high' || t.priority === 'critical')).toBe(true);
    });

    test('getCompletedTasks returns fixed and abandoned tasks', async () => {
      await createTestTasks();

      const result = await getCompletedTasks();

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('fixed');
    });

    test('searchTasks searches by query', async () => {
      await createTestTasks();

      const result = await searchTasks('API');

      expect(result).toHaveLength(1);
      expect(result[0].summary).toContain('API');
    });
  });
});
