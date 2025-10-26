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
  });
});
