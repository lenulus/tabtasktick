/**
 * E2E Tests for selectTasks.js
 *
 * ⚠️ THESE TESTS CANNOT CURRENTLY RUN ⚠️
 *
 * Issue: Playwright's testPage fixture cannot load chrome-extension:// URLs
 * with ES module support. Service workers don't support dynamic imports.
 *
 * Decision (per architecture-guardian review): Accept Jest limitation,
 * use manual testing for index queries. See /tests/KNOWN_LIMITATIONS.md
 *
 * These tests remain as documentation of what SHOULD be tested when
 * the infrastructure limitation is resolved.
 *
 * Status: Preserved for future use when Playwright extension testing matures
 */

import { test, expect } from './fixtures/extension.js';

test.describe('selectTasks - IndexedDB Compound Index Queries', () => {
  test.beforeEach(async ({ testPage }) => {
    // Clear IndexedDB before each test
    await testPage.evaluate(async () => {
      const { clearAllData } = await import('./services/utils/db.js');
      await clearAllData();
    });
  });

  test('selects tasks by collectionId index', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveTask } = await import('./services/utils/storage-queries.js');
      const { selectTasks } = await import('./services/selection/selectTasks.js');

      // Create tasks in different collections
      await saveTask({
        id: 'task_1',
        collectionId: 'col_1',
        summary: 'Task in Collection 1',
        status: 'open',
        priority: 'medium',
        tags: [],
        createdAt: Date.now()
      });

      await saveTask({
        id: 'task_2',
        collectionId: 'col_1',
        summary: 'Another Task in Collection 1',
        status: 'active',
        priority: 'high',
        tags: [],
        createdAt: Date.now()
      });

      await saveTask({
        id: 'task_3',
        collectionId: 'col_2',
        summary: 'Task in Collection 2',
        status: 'open',
        priority: 'low',
        tags: [],
        createdAt: Date.now()
      });

      await saveTask({
        id: 'uncategorized',
        collectionId: null,
        summary: 'Uncategorized Task',
        status: 'open',
        priority: 'medium',
        tags: [],
        createdAt: Date.now()
      });

      // Test collectionId index query
      const col1Tasks = await selectTasks({ collectionId: 'col_1' });
      const col2Tasks = await selectTasks({ collectionId: 'col_2' });
      const uncategorizedTasks = await selectTasks({ collectionId: null });

      return {
        col1Count: col1Tasks.length,
        col1Summaries: col1Tasks.map(t => t.summary).sort(),
        col2Count: col2Tasks.length,
        col2Summaries: col2Tasks.map(t => t.summary),
        uncategorizedCount: uncategorizedTasks.length,
        uncategorizedSummaries: uncategorizedTasks.map(t => t.summary)
      };
    });

    expect(result.col1Count).toBe(2);
    expect(result.col1Summaries).toEqual(['Another Task in Collection 1', 'Task in Collection 1']);
    expect(result.col2Count).toBe(1);
    expect(result.col2Summaries).toEqual(['Task in Collection 2']);
    expect(result.uncategorizedCount).toBe(1);
    expect(result.uncategorizedSummaries).toEqual(['Uncategorized Task']);
  });

  test('selects tasks by status index', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveTask } = await import('./services/utils/storage-queries.js');
      const { selectTasks } = await import('./services/selection/selectTasks.js');

      const now = Date.now();

      await saveTask({
        id: 'open_1',
        collectionId: 'col_1',
        summary: 'Open Task',
        status: 'open',
        priority: 'medium',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'active_1',
        collectionId: 'col_1',
        summary: 'Active Task',
        status: 'active',
        priority: 'high',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'fixed_1',
        collectionId: 'col_1',
        summary: 'Fixed Task',
        status: 'fixed',
        priority: 'medium',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'abandoned_1',
        collectionId: 'col_1',
        summary: 'Abandoned Task',
        status: 'abandoned',
        priority: 'low',
        tags: [],
        createdAt: now
      });

      // Test status index query
      const openTasks = await selectTasks({ status: 'open' });
      const activeTasks = await selectTasks({ status: 'active' });
      const fixedTasks = await selectTasks({ status: 'fixed' });

      // Test multiple statuses
      const inProgressTasks = await selectTasks({ status: ['open', 'active'] });

      return {
        openCount: openTasks.length,
        activeCount: activeTasks.length,
        fixedCount: fixedTasks.length,
        inProgressCount: inProgressTasks.length,
        inProgressSummaries: inProgressTasks.map(t => t.summary).sort()
      };
    });

    expect(result.openCount).toBe(1);
    expect(result.activeCount).toBe(1);
    expect(result.fixedCount).toBe(1);
    expect(result.inProgressCount).toBe(2);
    expect(result.inProgressSummaries).toEqual(['Active Task', 'Open Task']);
  });

  test('selects tasks by priority index', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveTask } = await import('./services/utils/storage-queries.js');
      const { selectTasks } = await import('./services/selection/selectTasks.js');

      const now = Date.now();

      await saveTask({
        id: 'low_1',
        collectionId: 'col_1',
        summary: 'Low Priority',
        status: 'open',
        priority: 'low',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'medium_1',
        collectionId: 'col_1',
        summary: 'Medium Priority',
        status: 'open',
        priority: 'medium',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'high_1',
        collectionId: 'col_1',
        summary: 'High Priority',
        status: 'open',
        priority: 'high',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'critical_1',
        collectionId: 'col_1',
        summary: 'Critical Priority',
        status: 'open',
        priority: 'critical',
        tags: [],
        createdAt: now
      });

      // Test priority index query
      const highPriorityTasks = await selectTasks({ priority: 'high' });

      // Test multiple priorities
      const urgentTasks = await selectTasks({ priority: ['high', 'critical'] });

      return {
        highCount: highPriorityTasks.length,
        urgentCount: urgentTasks.length,
        urgentSummaries: urgentTasks.map(t => t.summary).sort()
      };
    });

    expect(result.highCount).toBe(1);
    expect(result.urgentCount).toBe(2);
    expect(result.urgentSummaries).toEqual(['Critical Priority', 'High Priority']);
  });

  test('selects tasks by tags index (multi-entry)', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveTask } = await import('./services/utils/storage-queries.js');
      const { selectTasks } = await import('./services/selection/selectTasks.js');

      const now = Date.now();

      await saveTask({
        id: 'bug_1',
        collectionId: 'col_1',
        summary: 'Bug Fix Task',
        status: 'open',
        priority: 'high',
        tags: ['bug', 'urgent'],
        createdAt: now
      });

      await saveTask({
        id: 'feature_1',
        collectionId: 'col_1',
        summary: 'Feature Task',
        status: 'open',
        priority: 'medium',
        tags: ['feature', 'enhancement'],
        createdAt: now
      });

      await saveTask({
        id: 'bug_2',
        collectionId: 'col_1',
        summary: 'Another Bug',
        status: 'active',
        priority: 'critical',
        tags: ['bug', 'regression'],
        createdAt: now
      });

      // Test tags index query
      const bugTasks = await selectTasks({ tags: ['bug'] });
      const urgentTasks = await selectTasks({ tags: ['urgent'] });
      const featureTasks = await selectTasks({ tags: ['feature'] });

      return {
        bugCount: bugTasks.length,
        bugSummaries: bugTasks.map(t => t.summary).sort(),
        urgentCount: urgentTasks.length,
        featureCount: featureTasks.length
      };
    });

    expect(result.bugCount).toBe(2);
    expect(result.bugSummaries).toEqual(['Another Bug', 'Bug Fix Task']);
    expect(result.urgentCount).toBe(1);
    expect(result.featureCount).toBe(1);
  });

  test('combines collectionId and status filters', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveTask } = await import('./services/utils/storage-queries.js');
      const { selectTasks } = await import('./services/selection/selectTasks.js');

      const now = Date.now();

      await saveTask({
        id: 'col1_open',
        collectionId: 'col_1',
        summary: 'Collection 1 Open',
        status: 'open',
        priority: 'medium',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'col1_active',
        collectionId: 'col_1',
        summary: 'Collection 1 Active',
        status: 'active',
        priority: 'high',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'col2_open',
        collectionId: 'col_2',
        summary: 'Collection 2 Open',
        status: 'open',
        priority: 'low',
        tags: [],
        createdAt: now
      });

      // Test combined filter
      const col1OpenTasks = await selectTasks({
        collectionId: 'col_1',
        status: 'open'
      });

      return {
        count: col1OpenTasks.length,
        summaries: col1OpenTasks.map(t => t.summary)
      };
    });

    expect(result.count).toBe(1);
    expect(result.summaries).toEqual(['Collection 1 Open']);
  });

  test('combines collectionId, status, and priority filters', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveTask } = await import('./services/utils/storage-queries.js');
      const { selectTasks } = await import('./services/selection/selectTasks.js');

      const now = Date.now();

      await saveTask({
        id: 'match',
        collectionId: 'col_1',
        summary: 'Matches All Filters',
        status: 'open',
        priority: 'high',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'no_match_priority',
        collectionId: 'col_1',
        summary: 'Wrong Priority',
        status: 'open',
        priority: 'low',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'no_match_status',
        collectionId: 'col_1',
        summary: 'Wrong Status',
        status: 'fixed',
        priority: 'high',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'no_match_collection',
        collectionId: 'col_2',
        summary: 'Wrong Collection',
        status: 'open',
        priority: 'high',
        tags: [],
        createdAt: now
      });

      // Test triple compound filter
      const tasks = await selectTasks({
        collectionId: 'col_1',
        status: 'open',
        priority: 'high'
      });

      return {
        count: tasks.length,
        summaries: tasks.map(t => t.summary)
      };
    });

    expect(result.count).toBe(1);
    expect(result.summaries).toEqual(['Matches All Filters']);
  });

  test('filters by dueDate range', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveTask } = await import('./services/utils/storage-queries.js');
      const { selectTasks } = await import('./services/selection/selectTasks.js');

      const now = Date.now();
      const tomorrow = now + (24 * 60 * 60 * 1000);
      const nextWeek = now + (7 * 24 * 60 * 60 * 1000);
      const nextMonth = now + (30 * 24 * 60 * 60 * 1000);

      await saveTask({
        id: 'due_tomorrow',
        collectionId: 'col_1',
        summary: 'Due Tomorrow',
        status: 'open',
        priority: 'high',
        tags: [],
        dueDate: tomorrow,
        createdAt: now
      });

      await saveTask({
        id: 'due_next_week',
        collectionId: 'col_1',
        summary: 'Due Next Week',
        status: 'open',
        priority: 'medium',
        tags: [],
        dueDate: nextWeek,
        createdAt: now
      });

      await saveTask({
        id: 'due_next_month',
        collectionId: 'col_1',
        summary: 'Due Next Month',
        status: 'open',
        priority: 'low',
        tags: [],
        dueDate: nextMonth,
        createdAt: now
      });

      await saveTask({
        id: 'no_due_date',
        collectionId: 'col_1',
        summary: 'No Due Date',
        status: 'open',
        priority: 'medium',
        tags: [],
        createdAt: now
      });

      // Due within next 3 days
      const soonTasks = await selectTasks({
        dueBefore: now + (3 * 24 * 60 * 60 * 1000)
      });

      // Due between 5 and 10 days from now
      const mediumTasks = await selectTasks({
        dueAfter: now + (5 * 24 * 60 * 60 * 1000),
        dueBefore: now + (10 * 24 * 60 * 60 * 1000)
      });

      return {
        soonCount: soonTasks.length,
        soonSummaries: soonTasks.map(t => t.summary),
        mediumCount: mediumTasks.length,
        mediumSummaries: mediumTasks.map(t => t.summary)
      };
    });

    expect(result.soonCount).toBe(1);
    expect(result.soonSummaries).toEqual(['Due Tomorrow']);
    expect(result.mediumCount).toBe(1);
    expect(result.mediumSummaries).toEqual(['Due Next Week']);
  });

  test('filters by search text (summary and notes)', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveTask } = await import('./services/utils/storage-queries.js');
      const { selectTasks } = await import('./services/selection/selectTasks.js');

      const now = Date.now();

      await saveTask({
        id: 'auth_task',
        collectionId: 'col_1',
        summary: 'Fix authentication bug',
        notes: 'OAuth2 token refresh issue',
        status: 'open',
        priority: 'high',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'api_task',
        collectionId: 'col_1',
        summary: 'Update API endpoint',
        notes: 'Add authentication header validation',
        status: 'open',
        priority: 'medium',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'ui_task',
        collectionId: 'col_1',
        summary: 'Redesign login page',
        notes: 'New UI components',
        status: 'open',
        priority: 'low',
        tags: [],
        createdAt: now
      });

      // Search by summary
      const summaryResults = await selectTasks({ search: 'authentication' });

      // Search by notes
      const notesResults = await selectTasks({ search: 'oauth' });

      return {
        summaryCount: summaryResults.length,
        summarySummaries: summaryResults.map(t => t.summary).sort(),
        notesCount: notesResults.length,
        notesSummaries: notesResults.map(t => t.summary)
      };
    });

    // "authentication" matches summary and notes
    expect(result.summaryCount).toBe(2);
    expect(result.summarySummaries).toEqual(['Fix authentication bug', 'Update API endpoint']);

    // "oauth" matches notes only
    expect(result.notesCount).toBe(1);
    expect(result.notesSummaries).toEqual(['Fix authentication bug']);
  });

  test('sorts by dueDate (asc)', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveTask } = await import('./services/utils/storage-queries.js');
      const { selectTasks } = await import('./services/selection/selectTasks.js');

      const now = Date.now();

      await saveTask({
        id: 'task_3',
        collectionId: 'col_1',
        summary: 'Due Last',
        status: 'open',
        priority: 'low',
        tags: [],
        dueDate: now + 3000,
        createdAt: now
      });

      await saveTask({
        id: 'task_1',
        collectionId: 'col_1',
        summary: 'Due First',
        status: 'open',
        priority: 'high',
        tags: [],
        dueDate: now + 1000,
        createdAt: now
      });

      await saveTask({
        id: 'task_2',
        collectionId: 'col_1',
        summary: 'Due Second',
        status: 'open',
        priority: 'medium',
        tags: [],
        dueDate: now + 2000,
        createdAt: now
      });

      await saveTask({
        id: 'task_no_due',
        collectionId: 'col_1',
        summary: 'No Due Date',
        status: 'open',
        priority: 'medium',
        tags: [],
        createdAt: now
      });

      const tasks = await selectTasks({
        sortBy: 'dueDate',
        sortOrder: 'asc'
      });

      return {
        summaries: tasks.map(t => t.summary)
      };
    });

    // Tasks with dueDate come first (sorted), tasks without come last
    expect(result.summaries).toEqual(['Due First', 'Due Second', 'Due Last', 'No Due Date']);
  });

  test('sorts by priority (desc = critical first)', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveTask } = await import('./services/utils/storage-queries.js');
      const { selectTasks } = await import('./services/selection/selectTasks.js');

      const now = Date.now();

      await saveTask({
        id: 'low',
        collectionId: 'col_1',
        summary: 'Low Priority',
        status: 'open',
        priority: 'low',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'critical',
        collectionId: 'col_1',
        summary: 'Critical Priority',
        status: 'open',
        priority: 'critical',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'medium',
        collectionId: 'col_1',
        summary: 'Medium Priority',
        status: 'open',
        priority: 'medium',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'high',
        collectionId: 'col_1',
        summary: 'High Priority',
        status: 'open',
        priority: 'high',
        tags: [],
        createdAt: now
      });

      const tasks = await selectTasks({
        sortBy: 'priority',
        sortOrder: 'desc'
      });

      return {
        summaries: tasks.map(t => t.summary)
      };
    });

    expect(result.summaries).toEqual(['Critical Priority', 'High Priority', 'Medium Priority', 'Low Priority']);
  });

  test('sorts by createdAt (desc)', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveTask } = await import('./services/utils/storage-queries.js');
      const { selectTasks } = await import('./services/selection/selectTasks.js');

      const now = Date.now();

      await saveTask({
        id: 'oldest',
        collectionId: 'col_1',
        summary: 'Oldest Task',
        status: 'open',
        priority: 'medium',
        tags: [],
        createdAt: now - 3000
      });

      await saveTask({
        id: 'middle',
        collectionId: 'col_1',
        summary: 'Middle Task',
        status: 'open',
        priority: 'medium',
        tags: [],
        createdAt: now - 2000
      });

      await saveTask({
        id: 'newest',
        collectionId: 'col_1',
        summary: 'Newest Task',
        status: 'open',
        priority: 'medium',
        tags: [],
        createdAt: now - 1000
      });

      const tasks = await selectTasks({
        sortBy: 'createdAt',
        sortOrder: 'desc'
      });

      return {
        summaries: tasks.map(t => t.summary)
      };
    });

    expect(result.summaries).toEqual(['Newest Task', 'Middle Task', 'Oldest Task']);
  });

  test('convenience wrapper: getTasksByCollection()', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveTask } = await import('./services/utils/storage-queries.js');
      const { getTasksByCollection } = await import('./services/selection/selectTasks.js');

      const now = Date.now();

      await saveTask({
        id: 'col1_task',
        collectionId: 'col_1',
        summary: 'Collection 1 Task',
        status: 'open',
        priority: 'medium',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'col2_task',
        collectionId: 'col_2',
        summary: 'Collection 2 Task',
        status: 'open',
        priority: 'medium',
        tags: [],
        createdAt: now
      });

      const col1Tasks = await getTasksByCollection('col_1');
      const col1OpenTasks = await getTasksByCollection('col_1', { status: 'open' });

      return {
        col1Count: col1Tasks.length,
        col1Summaries: col1Tasks.map(t => t.summary),
        col1OpenCount: col1OpenTasks.length
      };
    });

    expect(result.col1Count).toBe(1);
    expect(result.col1Summaries).toEqual(['Collection 1 Task']);
    expect(result.col1OpenCount).toBe(1);
  });

  test('convenience wrapper: getUncategorizedTasks()', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveTask } = await import('./services/utils/storage-queries.js');
      const { getUncategorizedTasks } = await import('./services/selection/selectTasks.js');

      const now = Date.now();

      await saveTask({
        id: 'categorized',
        collectionId: 'col_1',
        summary: 'Categorized Task',
        status: 'open',
        priority: 'medium',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'uncategorized',
        collectionId: null,
        summary: 'Uncategorized Task',
        status: 'open',
        priority: 'high',
        tags: [],
        createdAt: now
      });

      const tasks = await getUncategorizedTasks();

      return {
        count: tasks.length,
        summaries: tasks.map(t => t.summary)
      };
    });

    expect(result.count).toBe(1);
    expect(result.summaries).toEqual(['Uncategorized Task']);
  });

  test('convenience wrapper: getTasksByStatus()', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveTask } = await import('./services/utils/storage-queries.js');
      const { getTasksByStatus } = await import('./services/selection/selectTasks.js');

      const now = Date.now();

      await saveTask({
        id: 'open_task',
        collectionId: 'col_1',
        summary: 'Open Task',
        status: 'open',
        priority: 'medium',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'active_task',
        collectionId: 'col_1',
        summary: 'Active Task',
        status: 'active',
        priority: 'high',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'fixed_task',
        collectionId: 'col_1',
        summary: 'Fixed Task',
        status: 'fixed',
        priority: 'low',
        tags: [],
        createdAt: now
      });

      const openTasks = await getTasksByStatus('open');
      const inProgressTasks = await getTasksByStatus(['open', 'active']);

      return {
        openCount: openTasks.length,
        openSummaries: openTasks.map(t => t.summary),
        inProgressCount: inProgressTasks.length,
        inProgressSummaries: inProgressTasks.map(t => t.summary).sort()
      };
    });

    expect(result.openCount).toBe(1);
    expect(result.openSummaries).toEqual(['Open Task']);
    expect(result.inProgressCount).toBe(2);
    expect(result.inProgressSummaries).toEqual(['Active Task', 'Open Task']);
  });

  test('convenience wrapper: getOverdueTasks()', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveTask } = await import('./services/utils/storage-queries.js');
      const { getOverdueTasks } = await import('./services/selection/selectTasks.js');

      const now = Date.now();
      const yesterday = now - (24 * 60 * 60 * 1000);
      const tomorrow = now + (24 * 60 * 60 * 1000);

      await saveTask({
        id: 'overdue',
        collectionId: 'col_1',
        summary: 'Overdue Task',
        status: 'open',
        priority: 'high',
        tags: [],
        dueDate: yesterday,
        createdAt: now - 5000
      });

      await saveTask({
        id: 'not_overdue',
        collectionId: 'col_1',
        summary: 'Not Overdue',
        status: 'open',
        priority: 'medium',
        tags: [],
        dueDate: tomorrow,
        createdAt: now - 3000
      });

      const overdueTasks = await getOverdueTasks();

      return {
        count: overdueTasks.length,
        summaries: overdueTasks.map(t => t.summary)
      };
    });

    expect(result.count).toBe(1);
    expect(result.summaries).toEqual(['Overdue Task']);
  });

  test('convenience wrapper: getHighPriorityTasks()', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveTask } = await import('./services/utils/storage-queries.js');
      const { getHighPriorityTasks } = await import('./services/selection/selectTasks.js');

      const now = Date.now();

      await saveTask({
        id: 'low',
        collectionId: 'col_1',
        summary: 'Low Priority',
        status: 'open',
        priority: 'low',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'high',
        collectionId: 'col_1',
        summary: 'High Priority',
        status: 'open',
        priority: 'high',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'critical',
        collectionId: 'col_1',
        summary: 'Critical Priority',
        status: 'open',
        priority: 'critical',
        tags: [],
        createdAt: now
      });

      const tasks = await getHighPriorityTasks();

      return {
        count: tasks.length,
        summaries: tasks.map(t => t.summary)
      };
    });

    expect(result.count).toBe(2);
    // Should be sorted by priority desc (critical first)
    expect(result.summaries).toEqual(['Critical Priority', 'High Priority']);
  });

  test('convenience wrapper: getCompletedTasks()', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveTask } = await import('./services/utils/storage-queries.js');
      const { getCompletedTasks } = await import('./services/selection/selectTasks.js');

      const now = Date.now();

      await saveTask({
        id: 'open',
        collectionId: 'col_1',
        summary: 'Open Task',
        status: 'open',
        priority: 'medium',
        tags: [],
        createdAt: now - 3000
      });

      await saveTask({
        id: 'fixed',
        collectionId: 'col_1',
        summary: 'Fixed Task',
        status: 'fixed',
        priority: 'high',
        tags: [],
        createdAt: now - 2000
      });

      await saveTask({
        id: 'abandoned',
        collectionId: 'col_1',
        summary: 'Abandoned Task',
        status: 'abandoned',
        priority: 'low',
        tags: [],
        createdAt: now - 1000
      });

      const tasks = await getCompletedTasks();

      return {
        count: tasks.length,
        summaries: tasks.map(t => t.summary)
      };
    });

    expect(result.count).toBe(2);
    // Should be sorted by createdAt desc (newest first)
    expect(result.summaries).toEqual(['Abandoned Task', 'Fixed Task']);
  });

  test('convenience wrapper: searchTasks()', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveTask } = await import('./services/utils/storage-queries.js');
      const { searchTasks } = await import('./services/selection/selectTasks.js');

      const now = Date.now();

      await saveTask({
        id: 'auth_task',
        collectionId: 'col_1',
        summary: 'Fix authentication',
        status: 'open',
        priority: 'high',
        tags: [],
        createdAt: now
      });

      await saveTask({
        id: 'api_task',
        collectionId: 'col_1',
        summary: 'Update API',
        status: 'open',
        priority: 'medium',
        tags: [],
        createdAt: now
      });

      const results = await searchTasks('auth');

      return {
        count: results.length,
        summaries: results.map(t => t.summary)
      };
    });

    expect(result.count).toBe(1);
    expect(result.summaries).toEqual(['Fix authentication']);
  });

  test('handles empty results gracefully', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { selectTasks } = await import('./services/selection/selectTasks.js');

      // No data in database
      const tasks = await selectTasks({ collectionId: 'nonexistent' });

      return {
        count: tasks.length,
        isArray: Array.isArray(tasks)
      };
    });

    expect(result.isArray).toBe(true);
    expect(result.count).toBe(0);
  });

  test('deduplicates results when querying multiple tags', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveTask } = await import('./services/utils/storage-queries.js');
      const { selectTasks } = await import('./services/selection/selectTasks.js');

      const now = Date.now();

      // Task with multiple matching tags
      await saveTask({
        id: 'multi_tag',
        collectionId: 'col_1',
        summary: 'Multi Tag Task',
        status: 'open',
        priority: 'high',
        tags: ['bug', 'urgent', 'critical'],
        createdAt: now
      });

      await saveTask({
        id: 'single_tag',
        collectionId: 'col_1',
        summary: 'Single Tag Task',
        status: 'open',
        priority: 'medium',
        tags: ['bug'],
        createdAt: now
      });

      // Query with multiple tags that would match the same task
      const tasks = await selectTasks({
        tags: ['bug', 'urgent']
      });

      return {
        count: tasks.length,
        summaries: tasks.map(t => t.summary).sort(),
        ids: tasks.map(t => t.id).sort()
      };
    });

    // Should return 2 unique tasks, not 3 (multi_tag shouldn't be duplicated)
    expect(result.count).toBe(2);
    expect(result.summaries).toEqual(['Multi Tag Task', 'Single Tag Task']);
    expect(result.ids).toEqual(['multi_tag', 'single_tag']);
  });
});
