/**
 * Side Panel Controller
 *
 * THIN controller - all business logic in services via message passing
 * Coordinates:
 * - View switching (Collections ↔ Tasks)
 * - Component initialization
 * - Data loading and refresh
 */

import { notifications } from './components/notification.js';
import { modal } from './components/modal.js';
import { CollectionsView } from './collections-view.js';

class SidePanelController {
  constructor() {
    this.currentView = 'collections'; // 'collections' or 'tasks'
    this.collectionsData = null;
    this.tasksData = null;
    this.searchQuery = '';
    this.collectionsView = null;
  }

  /**
   * Initialize the side panel
   */
  async init() {
    console.log('Initializing TabTaskTick Side Panel...');

    // Initialize components
    notifications.init();
    modal.init();

    // Initialize views
    this.collectionsView = new CollectionsView(this);
    this.collectionsView.init();

    // Setup event listeners
    this.setupEventListeners();

    // Load persisted view preference
    await this.loadViewPreference();

    // Load initial data
    await this.loadData();

    console.log('Side Panel initialized successfully');
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // View switcher
    const collectionsBtn = document.getElementById('view-collections-btn');
    const tasksBtn = document.getElementById('view-tasks-btn');

    collectionsBtn?.addEventListener('click', () => {
      this.switchView('collections');
    });

    tasksBtn?.addEventListener('click', () => {
      this.switchView('tasks');
    });

    // Save window button
    const saveWindowBtn = document.getElementById('save-window-btn');
    saveWindowBtn?.addEventListener('click', () => {
      this.handleSaveWindow();
    });

    // Global search
    const searchInput = document.getElementById('global-search');
    searchInput?.addEventListener('input', (e) => {
      this.handleSearch(e.target.value);
    });

    // Empty state action buttons
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('empty-action-btn')) {
        const view = this.currentView;
        if (view === 'collections') {
          this.handleSaveWindow();
        } else if (view === 'tasks') {
          this.handleCreateTask();
        }
      }

      if (e.target.classList.contains('retry-btn')) {
        this.loadData();
      }
    });

    // Listen for data updates from background
    chrome.runtime.onMessage.addListener((message) => {
      this.handleBackgroundMessage(message);
    });
  }

  /**
   * Switch between views
   */
  async switchView(viewName) {
    if (this.currentView === viewName) {
      return;
    }

    this.currentView = viewName;

    // Update UI
    const collectionsView = document.getElementById('collections-view');
    const tasksView = document.getElementById('tasks-view');
    const collectionsBtn = document.getElementById('view-collections-btn');
    const tasksBtn = document.getElementById('view-tasks-btn');

    if (viewName === 'collections') {
      collectionsView?.classList.add('active');
      tasksView?.classList.remove('active');
      tasksView?.setAttribute('hidden', '');
      collectionsView?.removeAttribute('hidden');
      collectionsBtn?.classList.add('active');
      tasksBtn?.classList.remove('active');
      collectionsBtn?.setAttribute('aria-selected', 'true');
      tasksBtn?.setAttribute('aria-selected', 'false');
    } else {
      tasksView?.classList.add('active');
      collectionsView?.classList.remove('active');
      collectionsView?.setAttribute('hidden', '');
      tasksView?.removeAttribute('hidden');
      tasksBtn?.classList.add('active');
      collectionsBtn?.classList.remove('active');
      tasksBtn?.setAttribute('aria-selected', 'true');
      collectionsBtn?.setAttribute('aria-selected', 'false');
    }

    // Persist preference
    await this.saveViewPreference(viewName);
  }

  /**
   * Load data from background
   */
  async loadData() {
    try {
      // Show loading states
      this.showLoading('collections');
      this.showLoading('tasks');

      // Load collections and tasks in parallel
      const [collectionsResult, tasksResult] = await Promise.all([
        this.sendMessage('getCollections', {}),
        this.sendMessage('getTasks', {})
      ]);

      // Extract arrays from response objects
      this.collectionsData = collectionsResult?.collections || [];
      this.tasksData = tasksResult?.tasks || [];

      // Render views
      this.renderCollections();
      this.renderTasks();

      // Hide loading, show content
      this.showContent('collections');
      this.showContent('tasks');

    } catch (error) {
      console.error('Failed to load data:', error);
      this.showError('collections', error.message);
      this.showError('tasks', error.message);
    }
  }

  /**
   * Render collections view
   */
  renderCollections() {
    const collections = this.collectionsData || [];

    // Show empty state if no collections
    if (collections.length === 0) {
      this.showEmpty('collections');
      return;
    }

    // Delegate to CollectionsView
    if (this.collectionsView) {
      this.collectionsView.render(collections);
    }
  }

  /**
   * Render tasks view
   */
  renderTasks() {
    const tasks = this.tasksData || [];

    // Show empty state if no tasks
    if (tasks.length === 0) {
      this.showEmpty('tasks');
      return;
    }

    // TODO: Render task cards (Phase 3.3)
    // For now, just show placeholder
    const tasksContent = document.getElementById('tasks-content');
    if (tasksContent) {
      tasksContent.innerHTML = `<p style="padding: 12px; color: var(--text-secondary);">${tasks.length} task(s)</p>`;
    }
  }

  /**
   * Handle save window action
   */
  async handleSaveWindow() {
    try {
      // TODO: Implement full save window flow with modal (Phase 3.2)
      notifications.info('Save window feature coming in Phase 3.2');
    } catch (error) {
      console.error('Failed to save window:', error);
      notifications.error('Failed to save window');
    }
  }

  /**
   * Handle create task action
   */
  async handleCreateTask() {
    try {
      // TODO: Implement task creation (Phase 3.3)
      notifications.info('Create task feature coming in Phase 3.3');
    } catch (error) {
      console.error('Failed to create task:', error);
      notifications.error('Failed to create task');
    }
  }

  /**
   * Handle search input
   */
  handleSearch(query) {
    this.searchQuery = query.toLowerCase();
    // TODO: Implement search filtering (Phase 3.5)
    console.log('Search query:', this.searchQuery);
  }

  /**
   * Handle messages from background
   */
  handleBackgroundMessage(message) {
    const { action, data } = message;

    switch (action) {
      case 'collection.created':
      case 'collection.updated':
      case 'collection.deleted':
        // Reload collections
        this.loadData();
        break;

      case 'task.created':
      case 'task.updated':
      case 'task.deleted':
        // Reload tasks
        this.loadData();
        break;
    }
  }

  /**
   * Show loading state for a view
   */
  showLoading(view) {
    const loading = document.getElementById(`${view}-loading`);
    const error = document.getElementById(`${view}-error`);
    const empty = document.getElementById(`${view}-empty`);
    const content = document.getElementById(`${view}-content`);

    loading?.classList.remove('hidden');
    error?.classList.add('hidden');
    empty?.classList.add('hidden');
    content?.classList.add('hidden');
  }

  /**
   * Show content for a view
   */
  showContent(view) {
    const loading = document.getElementById(`${view}-loading`);
    const error = document.getElementById(`${view}-error`);
    const empty = document.getElementById(`${view}-empty`);
    const content = document.getElementById(`${view}-content`);

    loading?.classList.add('hidden');
    error?.classList.add('hidden');
    empty?.classList.add('hidden');
    content?.classList.remove('hidden');
  }

  /**
   * Show error state for a view
   */
  showError(view, message) {
    const loading = document.getElementById(`${view}-loading`);
    const error = document.getElementById(`${view}-error`);
    const empty = document.getElementById(`${view}-empty`);
    const content = document.getElementById(`${view}-content`);
    const errorMessage = error?.querySelector('.error-message');

    if (errorMessage) {
      errorMessage.textContent = message || 'An error occurred';
    }

    loading?.classList.add('hidden');
    error?.classList.remove('hidden');
    empty?.classList.add('hidden');
    content?.classList.add('hidden');
  }

  /**
   * Show empty state for a view
   */
  showEmpty(view) {
    const loading = document.getElementById(`${view}-loading`);
    const error = document.getElementById(`${view}-error`);
    const empty = document.getElementById(`${view}-empty`);
    const content = document.getElementById(`${view}-content`);

    loading?.classList.add('hidden');
    error?.classList.add('hidden');
    empty?.classList.remove('hidden');
    content?.classList.add('hidden');
  }

  /**
   * Send message to background
   */
  async sendMessage(action, params) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action, ...params }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Load view preference from storage
   */
  async loadViewPreference() {
    try {
      const result = await chrome.storage.local.get(['sidepanel_view']);
      const savedView = result.sidepanel_view;
      if (savedView === 'tasks') {
        await this.switchView('tasks');
      }
    } catch (error) {
      console.error('Failed to load view preference:', error);
    }
  }

  /**
   * Save view preference to storage
   */
  async saveViewPreference(view) {
    try {
      await chrome.storage.local.set({ sidepanel_view: view });
    } catch (error) {
      console.error('Failed to save view preference:', error);
    }
  }
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
  const controller = new SidePanelController();
  await controller.init();
});
