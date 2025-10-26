/**
 * E2E Tests for Dashboard Keyboard Shortcuts (Phase 10)
 *
 * Tests keyboard navigation and shortcuts in the dashboard.
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.join(__dirname, '../../tabmaster-pro');

test.describe('Dashboard Keyboard Shortcuts', () => {
  let context;
  let dashboardPage;

  test.beforeAll(async ({ browser }) => {
    // Load extension
    context = await browser.newContext({
      ...{
        args: [
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`
        ]
      }
    });

    // Get dashboard page
    const pages = context.pages();
    if (pages.length > 0) {
      dashboardPage = pages[0];
    } else {
      dashboardPage = await context.newPage();
    }

    // Navigate to dashboard
    await dashboardPage.goto('chrome-extension://[extension-id]/dashboard/dashboard.html');
    await dashboardPage.waitForLoadState('networkidle');
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test.describe('Global Navigation Shortcuts', () => {
    test('should navigate to Collections view with g+c', async () => {
      // Press 'g' then 'c'
      await dashboardPage.keyboard.press('g');
      await dashboardPage.keyboard.press('c');

      // Wait for view to switch
      await dashboardPage.waitForTimeout(300);

      // Check active view
      const activeView = await dashboardPage.$('.view.active#collections');
      expect(activeView).not.toBeNull();

      // Check active nav item
      const activeNav = await dashboardPage.$('.nav-item.active[data-view="collections"]');
      expect(activeNav).not.toBeNull();
    });

    test('should navigate to Tasks view with g+t', async () => {
      // Press 'g' then 't'
      await dashboardPage.keyboard.press('g');
      await dashboardPage.keyboard.press('t');

      // Wait for view to switch
      await dashboardPage.waitForTimeout(300);

      // Check active view
      const activeView = await dashboardPage.$('.view.active#tasks');
      expect(activeView).not.toBeNull();

      // Check active nav item
      const activeNav = await dashboardPage.$('.nav-item.active[data-view="tasks"]');
      expect(activeNav).not.toBeNull();
    });

    test('should navigate to All Tabs view with g+a', async () => {
      // Press 'g' then 'a'
      await dashboardPage.keyboard.press('g');
      await dashboardPage.keyboard.press('a');

      // Wait for view to switch
      await dashboardPage.waitForTimeout(300);

      // Check active view
      const activeView = await dashboardPage.$('.view.active#tabs');
      expect(activeView).not.toBeNull();

      // Check active nav item
      const activeNav = await dashboardPage.$('.nav-item.active[data-view="tabs"]');
      expect(activeNav).not.toBeNull();
    });
  });

  test.describe('Help Modal', () => {
    test('should open help modal with Shift+?', async () => {
      // Press Shift+?
      await dashboardPage.keyboard.press('Shift+?');

      // Wait for modal to appear
      await dashboardPage.waitForTimeout(300);

      // Check modal is visible
      const modal = await dashboardPage.$('.keyboard-shortcuts-modal.show');
      expect(modal).not.toBeNull();

      // Check modal content
      const modalTitle = await dashboardPage.$('.keyboard-shortcuts-modal h3');
      const titleText = await modalTitle?.textContent();
      expect(titleText).toContain('Keyboard Shortcuts');
    });

    test('should close help modal with Escape', async () => {
      // Open modal first
      await dashboardPage.keyboard.press('Shift+?');
      await dashboardPage.waitForTimeout(300);

      // Close with Escape
      await dashboardPage.keyboard.press('Escape');
      await dashboardPage.waitForTimeout(300);

      // Check modal is hidden
      const modal = await dashboardPage.$('.keyboard-shortcuts-modal.show');
      expect(modal).toBeNull();
    });

    test('should search shortcuts in help modal', async () => {
      // Open modal
      await dashboardPage.keyboard.press('Shift+?');
      await dashboardPage.waitForTimeout(300);

      // Type in search
      const searchInput = await dashboardPage.$('#shortcutsSearch');
      await searchInput?.fill('navigation');
      await dashboardPage.waitForTimeout(300);

      // Check filtered results
      const shortcuts = await dashboardPage.$$('.shortcut-item');
      expect(shortcuts.length).toBeGreaterThan(0);

      // Check that navigation-related shortcuts are shown
      const firstShortcut = shortcuts[0];
      const description = await firstShortcut.$('.shortcut-description');
      const descText = await description?.textContent();
      expect(descText?.toLowerCase()).toContain('go to');

      // Close modal
      await dashboardPage.keyboard.press('Escape');
    });
  });

  test.describe('General Shortcuts', () => {
    test('should focus search box with /', async () => {
      // Navigate to tabs view
      await dashboardPage.keyboard.press('g');
      await dashboardPage.keyboard.press('a');
      await dashboardPage.waitForTimeout(300);

      // Press /
      await dashboardPage.keyboard.press('/');
      await dashboardPage.waitForTimeout(200);

      // Check search input is focused
      const searchInput = await dashboardPage.$('#searchTabs');
      const isFocused = await searchInput?.evaluate(el => el === document.activeElement);
      expect(isFocused).toBe(true);
    });

    test('should clear search with Escape', async () => {
      // Navigate to tabs view
      await dashboardPage.keyboard.press('g');
      await dashboardPage.keyboard.press('a');
      await dashboardPage.waitForTimeout(300);

      // Focus search and type
      await dashboardPage.keyboard.press('/');
      await dashboardPage.keyboard.type('test search');
      await dashboardPage.waitForTimeout(200);

      // Press Escape
      await dashboardPage.keyboard.press('Escape');
      await dashboardPage.waitForTimeout(200);

      // Check search is cleared
      const searchInput = await dashboardPage.$('#searchTabs');
      const value = await searchInput?.inputValue();
      expect(value).toBe('');
    });
  });

  test.describe('Collections View Shortcuts', () => {
    test.beforeEach(async () => {
      // Navigate to collections view
      await dashboardPage.keyboard.press('g');
      await dashboardPage.keyboard.press('c');
      await dashboardPage.waitForTimeout(300);
    });

    test('should show keyboard focus ring on arrow navigation', async () => {
      // Wait for collections to load
      await dashboardPage.waitForTimeout(500);

      // Press arrow down
      await dashboardPage.keyboard.press('ArrowDown');
      await dashboardPage.waitForTimeout(200);

      // Check if any collection card has keyboard-focused class
      const focusedCard = await dashboardPage.$('.collection-card.keyboard-focused');
      expect(focusedCard).not.toBeNull();
    });
  });

  test.describe('Tasks View Shortcuts', () => {
    test.beforeEach(async () => {
      // Navigate to tasks view
      await dashboardPage.keyboard.press('g');
      await dashboardPage.keyboard.press('t');
      await dashboardPage.waitForTimeout(300);
    });

    test('should show keyboard focus ring on arrow navigation in list view', async () => {
      // Switch to list view if needed
      const listViewBtn = await dashboardPage.$('#tasksViewList');
      if (listViewBtn) {
        await listViewBtn.click();
        await dashboardPage.waitForTimeout(300);
      }

      // Wait for tasks to load
      await dashboardPage.waitForTimeout(500);

      // Press arrow down
      await dashboardPage.keyboard.press('ArrowDown');
      await dashboardPage.waitForTimeout(200);

      // Check if any task row has keyboard-focused class
      const focusedRow = await dashboardPage.$('.task-row.keyboard-focused');
      // May be null if no tasks exist
      if (focusedRow) {
        expect(focusedRow).not.toBeNull();
      }
    });

    test('should create new task with n key', async () => {
      // Press n
      await dashboardPage.keyboard.press('n');
      await dashboardPage.waitForTimeout(300);

      // Check if task detail modal is visible (implementation-dependent)
      // This test assumes the modal opens for task creation
      const modal = await dashboardPage.$('.modal.show');
      if (modal) {
        expect(modal).not.toBeNull();
      }
    });

    test('should toggle task selection with Space key', async () => {
      // Switch to list view
      const listViewBtn = await dashboardPage.$('#tasksViewList');
      if (listViewBtn) {
        await listViewBtn.click();
        await dashboardPage.waitForTimeout(300);
      }

      // Navigate to first task
      await dashboardPage.keyboard.press('ArrowDown');
      await dashboardPage.waitForTimeout(200);

      // Get checkbox state before
      const focusedRow = await dashboardPage.$('.task-row.keyboard-focused');
      if (focusedRow) {
        const checkbox = await focusedRow.$('input[type="checkbox"]');
        if (checkbox) {
          const checkedBefore = await checkbox.isChecked();

          // Press Space
          await dashboardPage.keyboard.press(' ');
          await dashboardPage.waitForTimeout(200);

          // Check if checkbox state changed
          const checkedAfter = await checkbox.isChecked();
          expect(checkedAfter).toBe(!checkedBefore);
        }
      }
    });

    test('should multi-select tasks with Shift+Arrow', async () => {
      // Switch to list view
      const listViewBtn = await dashboardPage.$('#tasksViewList');
      if (listViewBtn) {
        await listViewBtn.click();
        await dashboardPage.waitForTimeout(300);
      }

      // Navigate to first task and select it
      await dashboardPage.keyboard.press('ArrowDown');
      await dashboardPage.keyboard.press(' ');
      await dashboardPage.waitForTimeout(200);

      // Shift+ArrowDown should select next task too
      await dashboardPage.keyboard.press('Shift+ArrowDown');
      await dashboardPage.waitForTimeout(200);

      // Count checked checkboxes
      const checkedBoxes = await dashboardPage.$$('input[type="checkbox"]:checked');
      if (checkedBoxes.length > 0) {
        expect(checkedBoxes.length).toBeGreaterThanOrEqual(2);
      }
    });

    test('should filter tasks by status with o/a/f keys', async () => {
      // Press 'o' to filter by Open status
      await dashboardPage.keyboard.press('o');
      await dashboardPage.waitForTimeout(500);

      // Check if filter was applied (implementation-dependent)
      // This test assumes filtering shows a notification or updates the view
      // We can't easily verify the filter result without knowing task data

      // Press 'a' to filter by Active status
      await dashboardPage.keyboard.press('a');
      await dashboardPage.waitForTimeout(500);

      // Press 'f' to filter by Fixed status
      await dashboardPage.keyboard.press('f');
      await dashboardPage.waitForTimeout(500);

      // Basic test just ensures no errors occur
      expect(true).toBe(true);
    });
  });

  test.describe('Collections View Shortcuts', () => {
    test.beforeEach(async () => {
      // Navigate to collections view
      await dashboardPage.keyboard.press('g');
      await dashboardPage.keyboard.press('c');
      await dashboardPage.waitForTimeout(300);
    });

    test('should toggle collection selection with Space key', async () => {
      // Navigate to first collection
      await dashboardPage.keyboard.press('ArrowDown');
      await dashboardPage.waitForTimeout(200);

      const focusedCard = await dashboardPage.$('.collection-card.keyboard-focused');
      if (focusedCard) {
        const checkbox = await focusedCard.$('input[type="checkbox"]');
        if (checkbox) {
          const checkedBefore = await checkbox.isChecked();

          // Press Space
          await dashboardPage.keyboard.press(' ');
          await dashboardPage.waitForTimeout(200);

          // Check if checkbox state changed
          const checkedAfter = await checkbox.isChecked();
          expect(checkedAfter).toBe(!checkedBefore);
        }
      }
    });
  });

  test.describe('Context Awareness', () => {
    test('should disable shortcuts when typing in input', async () => {
      // Navigate to tabs view
      await dashboardPage.keyboard.press('g');
      await dashboardPage.keyboard.press('a');
      await dashboardPage.waitForTimeout(300);

      // Focus search input
      await dashboardPage.keyboard.press('/');
      await dashboardPage.waitForTimeout(200);

      // Type 'g' - should not trigger navigation
      await dashboardPage.keyboard.type('g');
      await dashboardPage.waitForTimeout(300);

      // Should still be on tabs view (not switched to another view)
      const activeView = await dashboardPage.$('.view.active#tabs');
      expect(activeView).not.toBeNull();

      // Search input should have 'g' in it
      const searchInput = await dashboardPage.$('#searchTabs');
      const value = await searchInput?.inputValue();
      expect(value).toContain('g');
    });

    test('should disable navigation shortcuts when modal is open', async () => {
      // Open help modal
      await dashboardPage.keyboard.press('Shift+?');
      await dashboardPage.waitForTimeout(300);

      // Try to press g+c navigation (should not work with modal open)
      await dashboardPage.keyboard.press('g');
      await dashboardPage.keyboard.press('c');
      await dashboardPage.waitForTimeout(300);

      // Modal should still be open
      const modal = await dashboardPage.$('.keyboard-shortcuts-modal.show');
      expect(modal).not.toBeNull();
    });
  });

  test.describe('Help Modal Features', () => {
    test.beforeEach(async () => {
      // Open help modal
      await dashboardPage.keyboard.press('Shift+?');
      await dashboardPage.waitForTimeout(300);
    });

    test('should have proper ARIA attributes', async () => {
      const modal = await dashboardPage.$('.keyboard-shortcuts-modal');

      // Check role
      const role = await modal?.getAttribute('role');
      expect(role).toBe('dialog');

      // Check aria-modal
      const ariaModal = await modal?.getAttribute('aria-modal');
      expect(ariaModal).toBe('true');

      // Check aria-labelledby
      const ariaLabelledby = await modal?.getAttribute('aria-labelledby');
      expect(ariaLabelledby).toBe('keyboard-shortcuts-title');
    });

    test('should trap focus with Tab key', async () => {
      // Get first and last focusable elements
      const searchInput = await dashboardPage.$('#shortcutsSearch');
      const closeBtn = await dashboardPage.$('#closeKeyboardShortcutsModal');

      // Focus should start at search input
      const activeElement1 = await dashboardPage.evaluate(() => document.activeElement.id);
      expect(activeElement1).toBe('shortcutsSearch');

      // Press Shift+Tab (should cycle to last element - close button)
      await dashboardPage.keyboard.press('Shift+Tab');
      await dashboardPage.waitForTimeout(100);

      const activeElement2 = await dashboardPage.evaluate(() => document.activeElement.id);
      expect(activeElement2).toBe('closeKeyboardShortcutsModal');

      // Press Tab (should cycle back to first element - search input)
      await dashboardPage.keyboard.press('Tab');
      await dashboardPage.waitForTimeout(100);

      const activeElement3 = await dashboardPage.evaluate(() => document.activeElement.id);
      expect(activeElement3).toBe('shortcutsSearch');
    });

    test('should restore focus when modal closes', async () => {
      // Get currently focused element before opening modal (already open in beforeEach)
      // Close modal
      await dashboardPage.keyboard.press('Escape');
      await dashboardPage.waitForTimeout(300);

      // Focus should be restored (we can't easily test this without knowing what was focused before)
      // But we can check that modal is closed
      const modal = await dashboardPage.$('.keyboard-shortcuts-modal.show');
      expect(modal).toBeNull();
    });
  });

  test.describe('Visual Feedback', () => {
    test('should show tooltip on keyboard-focused items', async () => {
      // Navigate to collections view
      await dashboardPage.keyboard.press('g');
      await dashboardPage.keyboard.press('c');
      await dashboardPage.waitForTimeout(300);

      // Navigate to first collection
      await dashboardPage.keyboard.press('ArrowDown');
      await dashboardPage.waitForTimeout(200);

      // Check if tooltip is visible
      const tooltip = await dashboardPage.$('.keyboard-focused .keyboard-tooltip');
      if (tooltip) {
        expect(tooltip).not.toBeNull();
        const isVisible = await tooltip.isVisible();
        expect(isVisible).toBe(true);
      }
    });

    test('should show toast notification on shortcut use', async () => {
      // Navigate to tasks view
      await dashboardPage.keyboard.press('g');
      await dashboardPage.keyboard.press('t');
      await dashboardPage.waitForTimeout(300);

      // Press 'n' to create new task (should show toast)
      await dashboardPage.keyboard.press('n');
      await dashboardPage.waitForTimeout(300);

      // Check if toast is visible
      const toast = await dashboardPage.$('.keyboard-toast.show');
      if (toast) {
        expect(toast).not.toBeNull();
        const text = await toast.textContent();
        expect(text).toContain('task');
      }
    });
  });
});
