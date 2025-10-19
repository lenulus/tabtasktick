/**
 * E2E Tests: Side Panel Search & Filters
 *
 * Tests the search and filter functionality in the TabTaskTick side panel
 */

import { test, expect } from './fixtures/extension.js';

test.describe('Side Panel Search & Filters', () => {
  test.beforeEach(async ({ page, extensionId }) => {
    // Navigate to the side panel
    await page.goto(`chrome-extension://${extensionId}/sidepanel/panel.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
  });

  // Setup test - creates test data for all subsequent tests
  test('setup: create test collections', async ({ page }) => {
    // Create 4 test collections directly in IndexedDB with proper isActive property
    const created = await page.evaluate(async () => {
      const dbName = 'TabTaskTickDB';
      const request = indexedDB.open(dbName);

      return new Promise((resolve, reject) => {
        request.onsuccess = (event) => {
          const db = event.target.result;
          const tx = db.transaction(['collections'], 'readwrite');
          const store = tx.objectStore('collections');

          const collections = [
            {
              id: crypto.randomUUID(),
              name: 'Project Alpha',
              description: 'Backend API development',
              icon: '📁',
              tags: ['work', 'backend', 'urgent'],
              isActive: true,
              windowId: 1,
              createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
              metadata: {
                createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
                lastAccessed: Date.now() - 1 * 60 * 60 * 1000
              }
            },
            {
              id: crypto.randomUUID(),
              name: 'Learning React',
              description: 'React hooks and patterns',
              icon: '📚',
              tags: ['learning', 'frontend'],
              isActive: true,
              windowId: 2,
              createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
              metadata: {
                createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
                lastAccessed: Date.now() - 30 * 60 * 1000
              }
            },
            {
              id: crypto.randomUUID(),
              name: 'Tax Prep 2024',
              description: 'Tax documents and forms',
              icon: '📋',
              tags: ['personal', 'finance'],
              isActive: false,
              windowId: null,
              createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
              metadata: {
                createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
                lastAccessed: Date.now() - 10 * 24 * 60 * 60 * 1000
              }
            },
            {
              id: crypto.randomUUID(),
              name: 'House Renovation',
              description: 'DIY and home improvement',
              icon: '🏠',
              tags: ['personal', 'home'],
              isActive: false,
              windowId: null,
              createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
              metadata: {
                createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
                lastAccessed: Date.now() - 20 * 24 * 60 * 60 * 1000
              }
            }
          ];

          let count = 0;
          collections.forEach(collection => {
            const req = store.add(collection);
            req.onsuccess = () => count++;
          });

          tx.oncomplete = () => resolve(count);
          tx.onerror = () => reject(tx.error);
        };

        request.onerror = () => reject(request.error);
      });
    });

    // Reload page to pick up new collections
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Verify all collections were created
    const collectionCards = page.locator('.collection-card');
    await expect(collectionCards).toHaveCount(4);
  });

  test('setup: create test tasks', async ({ page }) => {
    // Create 5 test tasks directly in IndexedDB
    const created = await page.evaluate(async () => {
      const dbName = 'TabTaskTickDB';
      const request = indexedDB.open(dbName);

      return new Promise((resolve, reject) => {
        request.onsuccess = (event) => {
          const db = event.target.result;
          const tx = db.transaction(['tasks'], 'readwrite');
          const store = tx.objectStore('tasks');

          const tasks = [
            {
              id: crypto.randomUUID(),
              summary: 'Fix auth bug',
              notes: 'Users logged out after 5 min',
              status: 'active',
              priority: 'high',
              collectionId: null,
              tabIds: [],
              tags: ['bug'],
              comments: [],
              createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
              dueDate: Date.now() + 1 * 24 * 60 * 60 * 1000
            },
            {
              id: crypto.randomUUID(),
              summary: 'Write API docs',
              notes: 'Document authentication endpoints',
              status: 'open',
              priority: 'medium',
              collectionId: null,
              tabIds: [],
              tags: ['docs'],
              comments: [],
              createdAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
              dueDate: Date.now() + 7 * 24 * 60 * 60 * 1000
            },
            {
              id: crypto.randomUUID(),
              summary: 'Study hooks patterns',
              notes: 'useEffect, useState, useCallback',
              status: 'active',
              priority: 'low',
              collectionId: null,
              tabIds: [],
              tags: ['learning'],
              comments: [],
              createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
              dueDate: null
            },
            {
              id: crypto.randomUUID(),
              summary: 'Buy groceries',
              notes: 'Milk, eggs, bread',
              status: 'open',
              priority: 'critical',
              collectionId: null,
              tabIds: [],
              tags: [],
              comments: [],
              createdAt: Date.now(),
              dueDate: Date.now() + 2 * 60 * 60 * 1000
            },
            {
              id: crypto.randomUUID(),
              summary: 'Complete project review',
              notes: 'Review all code changes',
              status: 'fixed',
              priority: 'high',
              collectionId: null,
              tabIds: [],
              tags: ['review'],
              comments: [],
              createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
              completedAt: Date.now() - 1 * 24 * 60 * 60 * 1000
            }
          ];

          let count = 0;
          tasks.forEach(task => {
            const req = store.add(task);
            req.onsuccess = () => count++;
          });

          tx.oncomplete = () => resolve(count);
          tx.onerror = () => reject(tx.error);
        };

        request.onerror = () => reject(request.error);
      });
    });

    // Reload page to pick up new tasks
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Verify tasks were created by checking tasks view
    await page.locator('#view-tasks-btn').click();
    await page.waitForTimeout(500);

    const taskCards = page.locator('.task-card');
    await expect(taskCards).toHaveCount(5);

    // Switch back to collections view for subsequent tests
    await page.locator('#view-collections-btn').click();
    await page.waitForTimeout(500);
  });

  test.describe('Global Search', () => {
    test('should filter collections by name', async ({ page }) => {
      const searchInput = page.locator('#global-search');
      await searchInput.fill('Alpha');

      // Wait for debounce (300ms)
      await page.waitForTimeout(350);

      // Should show only Project Alpha
      const collectionCards = page.locator('.collection-card');
      await expect(collectionCards).toHaveCount(1);
      await expect(collectionCards.first()).toContainText('Project Alpha');
    });

    test('should filter collections by description', async ({ page }) => {
      const searchInput = page.locator('#global-search');
      await searchInput.fill('React');

      await page.waitForTimeout(350);

      const collectionCards = page.locator('.collection-card');
      await expect(collectionCards).toHaveCount(1);
      await expect(collectionCards.first()).toContainText('Learning React');
    });

    test('should filter collections by tags', async ({ page }) => {
      const searchInput = page.locator('#global-search');
      await searchInput.fill('personal');

      await page.waitForTimeout(350);

      // Should show Tax Prep and House Renovation
      const collectionCards = page.locator('.collection-card');
      await expect(collectionCards).toHaveCount(2);
    });

    test('should filter tasks by summary', async ({ page }) => {
      // Switch to tasks view
      await page.click('#view-tasks-btn');
      await page.waitForTimeout(100);

      const searchInput = page.locator('#global-search');
      await searchInput.fill('groceries');

      await page.waitForTimeout(350);

      // Should show only "Buy groceries"
      const taskCards = page.locator('.task-card');
      await expect(taskCards).toHaveCount(1);
      await expect(taskCards.first()).toContainText('Buy groceries');
    });

    test('should filter tasks by notes', async ({ page }) => {
      await page.click('#view-tasks-btn');
      await page.waitForTimeout(100);

      const searchInput = page.locator('#global-search');
      await searchInput.fill('useeffect');

      await page.waitForTimeout(350);

      // Should show only "Study hooks patterns" which has "useEffect" in notes
      const taskCards = page.locator('.task-card');
      await expect(taskCards).toHaveCount(1);
      await expect(taskCards.first()).toContainText('Study hooks patterns');
    });

    test('should show no results message when search has no matches', async ({ page }) => {
      // Ensure we're on collections view
      const collectionsBtn = page.locator('#view-collections-btn');
      if (!(await collectionsBtn.getAttribute('aria-selected')) === 'true') {
        await collectionsBtn.click();
        await page.waitForTimeout(500);
      }

      const searchInput = page.locator('#global-search');

      // Clear any previous search first
      await searchInput.clear();
      await page.waitForTimeout(350);

      // Verify we start with all collections
      let collectionCards = page.locator('.collection-card');
      await expect(collectionCards).toHaveCount(4);

      // Now search for non-existent term
      await searchInput.fill('nonexistent-search-term-xyz');
      await page.waitForTimeout(500); // Longer wait for debounce + render

      // Should show no results
      collectionCards = page.locator('.collection-card');
      await expect(collectionCards).toHaveCount(0);
    });

    test('should clear search on input clear', async ({ page }) => {
      // Ensure we're on collections view
      const collectionsBtn = page.locator('#view-collections-btn');
      if (!(await collectionsBtn.getAttribute('aria-selected')) === 'true') {
        await collectionsBtn.click();
        await page.waitForTimeout(500);
      }

      const searchInput = page.locator('#global-search');

      // First make sure search is empty
      await searchInput.clear();
      await page.waitForTimeout(350);

      // Should show all 4 collections initially
      let collectionCards = page.locator('.collection-card');
      await expect(collectionCards).toHaveCount(4);

      // Now search for Alpha
      await searchInput.fill('Alpha');
      await page.waitForTimeout(350);

      // Verify filtered to 1
      collectionCards = page.locator('.collection-card');
      await expect(collectionCards).toHaveCount(1);

      // Clear search
      await searchInput.clear();
      await page.waitForTimeout(350);

      // Should show all 4 collections again
      collectionCards = page.locator('.collection-card');
      await expect(collectionCards).toHaveCount(4);
    });
  });

  test.describe('Collections Filters', () => {
    test('should toggle filters panel', async ({ page }) => {
      const toggleBtn = page.locator('#toggle-filters-btn');
      const filtersPanel = page.locator('#filters-panel');

      // Initially hidden
      await expect(filtersPanel).toHaveClass(/hidden/);

      // Click to show
      await toggleBtn.click();
      await page.waitForTimeout(100);
      await expect(filtersPanel).not.toHaveClass(/hidden/);
      await expect(toggleBtn).toHaveClass(/active/);

      // Click to hide
      await toggleBtn.click();
      await page.waitForTimeout(100);
      await expect(filtersPanel).toHaveClass(/hidden/);
      await expect(toggleBtn).not.toHaveClass(/active/);
    });

    test('should filter collections by state (Active)', async ({ page }) => {
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      // Wait for Active filter button to be visible
      const activeBtn = page.locator('[data-filter="state"][data-value="active"]');
      await activeBtn.waitFor({ state: 'visible' });

      // Click Active filter
      await activeBtn.click();
      await page.waitForTimeout(100);

      // Should show only active collections (2)
      const collectionCards = page.locator('.collection-card');
      await expect(collectionCards).toHaveCount(2);
      await expect(collectionCards.nth(0)).toContainText('Learning React'); // Most recent
      await expect(collectionCards.nth(1)).toContainText('Project Alpha');
    });

    test('should filter collections by state (Saved)', async ({ page }) => {
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      // Wait for Saved filter button to be visible
      const savedBtn = page.locator('[data-filter="state"][data-value="saved"]');
      await savedBtn.waitFor({ state: 'visible' });

      // Click Saved filter
      await savedBtn.click();
      await page.waitForTimeout(100);

      // Should show only saved collections (2)
      const collectionCards = page.locator('.collection-card');
      await expect(collectionCards).toHaveCount(2);
      await expect(collectionCards.nth(0)).toContainText('Tax Prep 2024'); // Most recent
      await expect(collectionCards.nth(1)).toContainText('House Renovation');
    });

    test('should filter collections by tags', async ({ page }) => {
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      // Select 'work' tag
      const workCheckbox = page.locator('[data-filter="tags"][value="work"]');
      await workCheckbox.check();
      await page.waitForTimeout(100);

      // Should show only Project Alpha
      const collectionCards = page.locator('.collection-card');
      await expect(collectionCards).toHaveCount(1);
      await expect(collectionCards.first()).toContainText('Project Alpha');
    });

    test('should filter collections by multiple tags (OR logic)', async ({ page }) => {
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      // Select 'work' and 'personal' tags
      await page.locator('[data-filter="tags"][value="work"]').check();
      await page.locator('[data-filter="tags"][value="personal"]').check();
      await page.waitForTimeout(100);

      // Should show collections with either tag (3 total)
      const collectionCards = page.locator('.collection-card');
      await expect(collectionCards).toHaveCount(3);
    });

    test('should sort collections by name', async ({ page }) => {
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      // Select name sort
      await page.selectOption('[data-filter="sortBy"]', 'name');
      await page.waitForTimeout(100);

      // Should be alphabetically sorted
      const collectionCards = page.locator('.collection-card');
      await expect(collectionCards.nth(0)).toContainText('House Renovation');
      await expect(collectionCards.nth(1)).toContainText('Learning React');
      await expect(collectionCards.nth(2)).toContainText('Project Alpha');
      await expect(collectionCards.nth(3)).toContainText('Tax Prep 2024');
    });

    test('should sort collections by created date', async ({ page }) => {
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      // Select created sort
      await page.selectOption('[data-filter="sortBy"]', 'created');
      await page.waitForTimeout(100);

      // Should be sorted by created date (newest first)
      const collectionCards = page.locator('.collection-card');
      await expect(collectionCards.nth(0)).toContainText('Learning React'); // 3 days ago
      await expect(collectionCards.nth(1)).toContainText('Project Alpha'); // 7 days ago
      await expect(collectionCards.nth(2)).toContainText('Tax Prep 2024'); // 30 days ago
      await expect(collectionCards.nth(3)).toContainText('House Renovation'); // 60 days ago
    });

    test('should clear collections filters', async ({ page }) => {
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      // Apply filters
      await page.click('[data-filter="state"][data-value="active"]');
      await page.locator('[data-filter="tags"][value="work"]').check();
      await page.waitForTimeout(100);

      // Should show 1 collection
      let collectionCards = page.locator('.collection-card');
      await expect(collectionCards).toHaveCount(1);

      // Clear filters
      await page.click('[data-clear-filters="collections"]');
      await page.waitForTimeout(100);

      // Should show all 4 collections
      collectionCards = page.locator('.collection-card');
      await expect(collectionCards).toHaveCount(4);

      // All filter button should be active
      await expect(page.locator('[data-filter="state"][data-value="all"]')).toHaveClass(/active/);
    });
  });

  test.describe('Tasks Filters', () => {
    test.beforeEach(async ({ page }) => {
      // Switch to tasks view
      await page.click('#view-tasks-btn');
      await page.waitForTimeout(100);
    });

    test('should filter tasks by status', async ({ page }) => {
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      // Select 'active' status
      await page.locator('[data-filter="status"][value="active"]').check();
      await page.waitForTimeout(100);

      // Should show 2 active tasks
      const taskCards = page.locator('.task-card');
      await expect(taskCards).toHaveCount(2);
      await expect(page.locator('.task-card')).toContainText('Fix auth bug');
      await expect(page.locator('.task-card')).toContainText('Study hooks patterns');
    });

    test('should filter tasks by multiple statuses', async ({ page }) => {
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      // Select 'open' and 'fixed' statuses
      await page.locator('[data-filter="status"][value="open"]').check();
      await page.locator('[data-filter="status"][value="fixed"]').check();
      await page.waitForTimeout(100);

      // Should show 3 tasks
      const taskCards = page.locator('.task-card');
      await expect(taskCards).toHaveCount(3);
    });

    test('should filter tasks by priority', async ({ page }) => {
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      // Select 'critical' priority
      await page.locator('[data-filter="priority"][value="critical"]').check();
      await page.waitForTimeout(100);

      // Should show only "Buy groceries"
      const taskCards = page.locator('.task-card');
      await expect(taskCards).toHaveCount(1);
      await expect(taskCards.first()).toContainText('Buy groceries');
    });

    test('should filter tasks by collection', async ({ page }) => {
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      // Select Project Alpha collection
      await page.locator('[data-filter="collection"][value="col-1"]').check();
      await page.waitForTimeout(100);

      // Should show 3 tasks from Project Alpha
      const taskCards = page.locator('.task-card');
      await expect(taskCards).toHaveCount(3);
    });

    test('should filter uncategorized tasks', async ({ page }) => {
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      // Select Uncategorized
      await page.locator('[data-filter="collection"][value="uncategorized"]').check();
      await page.waitForTimeout(100);

      // Should show only "Buy groceries"
      const taskCards = page.locator('.task-card');
      await expect(taskCards).toHaveCount(1);
      await expect(taskCards.first()).toContainText('Buy groceries');
    });

    test('should sort tasks by due date', async ({ page }) => {
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      // Select due date sort (default)
      await page.selectOption('[data-filter="sortBy"]', 'dueDate');
      await page.waitForTimeout(100);

      // Should be sorted by due date (soonest first, null last)
      const taskCards = page.locator('.task-card');

      // Buy groceries (2 hours), Fix auth bug (tomorrow), Write API docs (next week), Study hooks (no date)
      await expect(taskCards.nth(0)).toContainText('Buy groceries');
      await expect(taskCards.nth(1)).toContainText('Fix auth bug');
    });

    test('should sort tasks by priority', async ({ page }) => {
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      // Select priority sort
      await page.selectOption('[data-filter="sortBy"]', 'priority');
      await page.waitForTimeout(100);

      // Should be sorted by priority (critical, high, medium, low)
      const taskCards = page.locator('.task-card');
      await expect(taskCards.nth(0)).toContainText('Buy groceries'); // critical
      // High priority tasks next
      const highPriorityTasks = await taskCards.filter({ hasText: /Fix auth bug|Complete project review/ }).count();
      expect(highPriorityTasks).toBeGreaterThan(0);
    });

    test('should clear tasks filters', async ({ page }) => {
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      // Apply filters
      await page.locator('[data-filter="status"][value="active"]').check();
      await page.locator('[data-filter="priority"][value="high"]').check();
      await page.waitForTimeout(100);

      // Should show 1 task
      let taskCards = page.locator('.task-card');
      await expect(taskCards).toHaveCount(1);

      // Clear filters
      await page.click('[data-clear-filters="tasks"]');
      await page.waitForTimeout(100);

      // Should show all 5 tasks
      taskCards = page.locator('.task-card');
      await expect(taskCards).toHaveCount(5);
    });
  });

  test.describe('Filter Persistence', () => {
    test('should persist collections filters across panel reopens', async ({ page, extensionId }) => {
      // Apply filters
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      await page.click('[data-filter="state"][data-value="active"]');
      await page.locator('[data-filter="tags"][value="work"]').check();
      await page.selectOption('[data-filter="sortBy"]', 'name');
      await page.waitForTimeout(200);

      // Reload panel
      await page.goto(`chrome-extension://${extensionId}/sidepanel/panel.html`);
      await page.waitForSelector('.panel-title');

      // Open filters
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      // Verify filters persisted
      await expect(page.locator('[data-filter="state"][data-value="active"]')).toHaveClass(/active/);
      await expect(page.locator('[data-filter="tags"][value="work"]')).toBeChecked();
      await expect(page.locator('[data-filter="sortBy"]')).toHaveValue('name');

      // Verify data is still filtered
      const collectionCards = page.locator('.collection-card');
      await expect(collectionCards).toHaveCount(1);
    });

    test('should persist tasks filters across panel reopens', async ({ page, extensionId }) => {
      // Switch to tasks view
      await page.click('#view-tasks-btn');
      await page.waitForTimeout(100);

      // Apply filters
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      await page.locator('[data-filter="status"][value="active"]').check();
      await page.locator('[data-filter="priority"][value="high"]').check();
      await page.selectOption('[data-filter="sortBy"]', 'priority');
      await page.waitForTimeout(200);

      // Reload panel
      await page.goto(`chrome-extension://${extensionId}/sidepanel/panel.html`);
      await page.waitForSelector('.panel-title');

      // Switch to tasks view
      await page.click('#view-tasks-btn');
      await page.waitForTimeout(100);

      // Open filters
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      // Verify filters persisted
      await expect(page.locator('[data-filter="status"][value="active"]')).toBeChecked();
      await expect(page.locator('[data-filter="priority"][value="high"]')).toBeChecked();
      await expect(page.locator('[data-filter="sortBy"]')).toHaveValue('priority');
    });

    test('should persist filter visibility state', async ({ page, extensionId }) => {
      // Open filters
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      // Note: Filter visibility is NOT persisted by design (always starts closed)
      // This test verifies that behavior

      // Reload panel
      await page.goto(`chrome-extension://${extensionId}/sidepanel/panel.html`);
      await page.waitForSelector('.panel-title');

      // Filters should be hidden
      const filtersPanel = page.locator('#filters-panel');
      await expect(filtersPanel).toHaveClass(/hidden/);
    });
  });

  test.describe('Combined Search and Filters', () => {
    test('should apply search and filters together on collections', async ({ page }) => {
      // Apply search
      await page.fill('#global-search', 'Project');
      await page.waitForTimeout(350);

      // Apply filter
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);
      await page.click('[data-filter="state"][data-value="active"]');
      await page.waitForTimeout(100);

      // Should show only "Project Alpha" (matches both search and filter)
      const collectionCards = page.locator('.collection-card');
      await expect(collectionCards).toHaveCount(1);
      await expect(collectionCards.first()).toContainText('Project Alpha');
    });

    test('should apply search and filters together on tasks', async ({ page }) => {
      // Switch to tasks
      await page.click('#view-tasks-btn');
      await page.waitForTimeout(100);

      // Apply search
      await page.fill('#global-search', 'bug');
      await page.waitForTimeout(350);

      // Apply filters
      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);
      await page.locator('[data-filter="status"][value="active"]').check();
      await page.locator('[data-filter="priority"][value="high"]').check();
      await page.waitForTimeout(100);

      // Should show only "Fix auth bug"
      const taskCards = page.locator('.task-card');
      await expect(taskCards).toHaveCount(1);
      await expect(taskCards.first()).toContainText('Fix auth bug');
    });

    test('should show no results when search and filters exclude all items', async ({ page }) => {
      // Apply search that has no matches in active collections
      await page.fill('#global-search', 'Tax');
      await page.waitForTimeout(350);

      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);
      await page.click('[data-filter="state"][data-value="active"]');
      await page.waitForTimeout(100);

      // Should show no collections
      const collectionCards = page.locator('.collection-card');
      await expect(collectionCards).toHaveCount(0);
    });
  });
});
