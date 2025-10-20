/**
 * E2E Tests: Side Panel Search & Filters
 *
 * Tests the search and filter functionality in the TabTaskTick side panel
 */

import { test, expect } from './fixtures/extension.js';

/**
 * Helper to ensure we're on collections view
 * Prevents test pollution from previous tests that switched to tasks view
 */
async function ensureCollectionsView(page) {
  const collectionsBtn = page.locator('#view-collections-btn');
  const isSelected = await collectionsBtn.getAttribute('aria-selected');
  if (isSelected !== 'true') {
    await collectionsBtn.click();
    await page.waitForTimeout(300);
  }
}

/**
 * Helper to ensure we're on tasks view
 */
async function ensureTasksView(page) {
  const tasksBtn = page.locator('#view-tasks-btn');
  const isSelected = await tasksBtn.getAttribute('aria-selected');
  if (isSelected !== 'true') {
    await tasksBtn.click();
    await page.waitForTimeout(300);
  }
}

/**
 * Helper to verify test data exists in IndexedDB
 * Prevents tests from hanging when data is missing
 */
async function verifyTestDataExists(page) {
  const dataExists = await page.evaluate(async () => {
    const dbName = 'TabTaskTickDB';
    const request = indexedDB.open(dbName);

    return new Promise((resolve) => {
      request.onsuccess = (event) => {
        const db = event.target.result;
        const tx = db.transaction(['collections', 'tasks'], 'readonly');

        const collectionsStore = tx.objectStore('collections');
        const tasksStore = tx.objectStore('tasks');

        const collectionsCount = collectionsStore.count();
        const tasksCount = tasksStore.count();

        Promise.all([
          new Promise(r => { collectionsCount.onsuccess = () => r(collectionsCount.result); }),
          new Promise(r => { tasksCount.onsuccess = () => r(tasksCount.result); })
        ]).then(([collections, tasks]) => {
          resolve({ collections, tasks });
        });
      };

      request.onerror = () => resolve({ collections: 0, tasks: 0 });
    });
  });

  if (dataExists.collections === 0 && dataExists.tasks === 0) {
    throw new Error(`Test data missing! Setup tests must run first. Found: ${dataExists.collections} collections, ${dataExists.tasks} tasks`);
  }

  return dataExists;
}

test.describe('Side Panel Search & Filters', () => {
  test.beforeEach(async ({ page, extensionId }, testInfo) => {
    // Navigate to the side panel
    await page.goto(`chrome-extension://${extensionId}/sidepanel/panel.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Clear persisted filter state AND in-memory UI state to prevent test pollution
    if (!testInfo.title.startsWith('setup:')) {
      // Wait for panel controller to be available
      await page.waitForFunction(() => window.panelController != null, { timeout: 5000 });

      // DIAGNOSTIC: Log filter state BEFORE clearing
      const filtersBefore = await page.evaluate(() => {
        return {
          collections: window.panelController?.searchFilter?.getCollectionsFilters(),
          tasks: window.panelController?.searchFilter?.getTasksFilters()
        };
      });
      console.log(`[${testInfo.title}] Filters BEFORE clear:`, JSON.stringify(filtersBefore, null, 2));

      // CRITICAL: Must use async function and await storage.remove() to prevent race conditions
      await page.evaluate(async () => {
        // Clear storage persistence (properly awaited to ensure completion)
        await chrome.storage.local.remove([
          'tabtasktick.filters.collections',
          'tabtasktick.filters.tasks'
        ]);

        // Clear in-memory UI state by calling clear methods
        // This is crucial - storage clear alone doesn't reset active UI filters
        const panelController = window.panelController;
        if (panelController && panelController.searchFilter) {
          panelController.searchFilter.clearCollectionsFilters();
          panelController.searchFilter.clearTasksFilters();
          // Trigger re-render with cleared filters
          panelController.applyFiltersAndRender();
        }
      });

      await page.waitForTimeout(500); // Wait for re-render

      // DIAGNOSTIC: Log filter state AFTER clearing
      const filtersAfter = await page.evaluate(() => {
        return {
          collections: window.panelController?.searchFilter?.getCollectionsFilters(),
          tasks: window.panelController?.searchFilter?.getTasksFilters()
        };
      });
      console.log(`[${testInfo.title}] Filters AFTER clear:`, JSON.stringify(filtersAfter, null, 2));

      // Verify data exists
      const data = await verifyTestDataExists(page);
      console.log(`[${testInfo.title}] Test data: ${data.collections} collections, ${data.tasks} tasks`);
    }
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
      await ensureCollectionsView(page);

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
      await ensureCollectionsView(page);

      const searchInput = page.locator('#global-search');
      await searchInput.fill('React');

      await page.waitForTimeout(350);

      const collectionCards = page.locator('.collection-card');
      await expect(collectionCards).toHaveCount(1);
      await expect(collectionCards.first()).toContainText('Learning React');
    });

    test('should filter collections by tags', async ({ page }) => {
      await ensureCollectionsView(page);

      const searchInput = page.locator('#global-search');
      await searchInput.fill('personal');

      await page.waitForTimeout(350);

      // Should show Tax Prep and House Renovation
      const collectionCards = page.locator('.collection-card');
      await expect(collectionCards).toHaveCount(2);
    });

    test('should filter tasks by summary', async ({ page }) => {
      await ensureTasksView(page);

      const searchInput = page.locator('#global-search');
      await searchInput.fill('groceries');

      await page.waitForTimeout(350);

      // Should show only "Buy groceries"
      const taskCards = page.locator('.task-card');
      await expect(taskCards).toHaveCount(1);
      await expect(taskCards.first()).toContainText('Buy groceries');
    });

    test('should filter tasks by notes', async ({ page }) => {
      await ensureTasksView(page);

      const searchInput = page.locator('#global-search');
      await searchInput.fill('useeffect');

      await page.waitForTimeout(350);

      // Should show only "Study hooks patterns" which has "useEffect" in notes
      const taskCards = page.locator('.task-card');
      await expect(taskCards).toHaveCount(1);
      await expect(taskCards.first()).toContainText('Study hooks patterns');
    });

    test('should show no results message when search has no matches', async ({ page }) => {
      await ensureCollectionsView(page);

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
      await ensureCollectionsView(page);

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
      await ensureCollectionsView(page);

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
      await ensureCollectionsView(page);

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
      await ensureCollectionsView(page);

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
      await ensureCollectionsView(page);

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
      await ensureCollectionsView(page);

      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      // CRITICAL: First ensure "All" state filter is active (clear any Active/Saved filter from previous tests)
      const allBtn = page.locator('[data-filter="state"][data-value="all"]');
      await allBtn.click();
      await page.waitForTimeout(300); // Wait for filter to apply and UI to re-render

      // Verify we now have all 4 collections showing
      const collectionCards = page.locator('.collection-card');
      await expect(collectionCards).toHaveCount(4);

      // Select name sort
      await page.selectOption('[data-filter="sortBy"]', 'name');
      await page.waitForTimeout(200);

      // Should be alphabetically sorted (all 4 collections)
      await expect(collectionCards.nth(0)).toContainText('House Renovation');
      await expect(collectionCards.nth(1)).toContainText('Learning React');
      await expect(collectionCards.nth(2)).toContainText('Project Alpha');
      await expect(collectionCards.nth(3)).toContainText('Tax Prep 2024');
    });

    test('should sort collections by created date', async ({ page }) => {
      await ensureCollectionsView(page);

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
      await ensureCollectionsView(page);

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
      await ensureTasksView(page);

      await page.click('#toggle-filters-btn');
      await page.waitForTimeout(100);

      // Select 'active' status
      await page.locator('[data-filter="status"][value="active"]').check();
      await page.waitForTimeout(100);

      // Should show 2 active tasks
      const taskCards = page.locator('.task-card');
      await expect(taskCards).toHaveCount(2);
      // Check that both expected tasks are present
      await expect(taskCards.filter({ hasText: 'Fix auth bug' })).toHaveCount(1);
      await expect(taskCards.filter({ hasText: 'Study hooks patterns' })).toHaveCount(1);
    });

    test('should filter tasks by multiple statuses', async ({ page }) => {
      await ensureTasksView(page);

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
      await ensureTasksView(page);

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
      await ensureTasksView(page);

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
      await ensureTasksView(page);

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
      await ensureTasksView(page);

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
      await ensureTasksView(page);

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
      await ensureTasksView(page);

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
      await ensureCollectionsView(page);

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
      await ensureTasksView(page);

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
      await ensureCollectionsView(page);

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
      await ensureCollectionsView(page);

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
      await ensureTasksView(page);

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
      await ensureCollectionsView(page);

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
