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
import { CollectionDetailView } from './collection-detail.js';
import { TasksView } from './tasks-view.js';

class SidePanelController {
  constructor() {
    this.currentView = 'collections'; // 'collections' or 'tasks'
    this.collectionsData = null;
    this.tasksData = null;
    this.searchQuery = '';
    this.collectionsView = null;
    this.collectionDetailView = null;
    this.tasksView = null;
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

    this.collectionDetailView = new CollectionDetailView(this);
    this.collectionDetailView.init();

    this.tasksView = new TasksView(this);
    this.tasksView.init();

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
      console.log('[Panel] Loading data...');
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

      // Render views (they will handle showing empty/content states)
      this.renderCollections();
      this.renderTasks();

      console.log('[Panel] Data loaded and rendered');
    } catch (error) {
      console.error('[Panel] Failed to load data:', error);
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

    // Show content and delegate to CollectionsView
    this.showContent('collections');
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

    // Show content and delegate to TasksView
    this.showContent('tasks');
    if (this.tasksView) {
      this.tasksView.render(tasks, this.collectionsData || []);
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
      // Show task creation modal
      this.showCreateTaskModal();
    } catch (error) {
      console.error('Failed to create task:', error);
      notifications.error('Failed to create task');
    }
  }

  /**
   * Show create task modal
   */
  showCreateTaskModal() {
    const formHtml = `
      <form id="create-task-form" class="modal-form">
        <div class="form-group">
          <label for="new-task-summary">Summary *</label>
          <input
            type="text"
            id="new-task-summary"
            name="summary"
            class="form-control"
            required
            maxlength="255"
            placeholder="What do you need to do?"
          >
        </div>

        <div class="form-group">
          <label for="new-task-notes">Notes</label>
          <textarea
            id="new-task-notes"
            name="notes"
            class="form-control"
            rows="4"
            placeholder="Additional details..."
          ></textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="new-task-priority">Priority</label>
            <select id="new-task-priority" name="priority" class="form-control">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div class="form-group">
            <label for="new-task-collection">Collection</label>
            <select id="new-task-collection" name="collectionId" class="form-control">
              <option value="">Uncategorized</option>
              ${(this.collectionsData || []).map(c =>
                `<option value="${c.id}">${this.escapeHtml(c.name || 'Unnamed')}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <div class="form-group">
          <label for="new-task-due-date">Due Date</label>
          <input
            type="date"
            id="new-task-due-date"
            name="dueDate"
            class="form-control"
          >
        </div>

        <div class="form-group">
          <label for="new-task-tags">Tags (comma-separated)</label>
          <input
            type="text"
            id="new-task-tags"
            name="tags"
            class="form-control"
            placeholder="urgent, work, review"
          >
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-modal-cancel>Cancel</button>
          <button type="submit" class="btn btn-primary">Create Task</button>
        </div>
      </form>
    `;

    modal.open({
      title: 'Create New Task',
      content: formHtml
    });

    // Attach form handler after modal is created
    requestAnimationFrame(() => {
      const form = document.getElementById('create-task-form');
      const cancelBtn = form?.querySelector('[data-modal-cancel]');

      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.saveNewTask(new FormData(form));
      });

      cancelBtn?.addEventListener('click', () => {
        modal.close();
      });
    });
  }

  /**
   * Save new task
   */
  async saveNewTask(formData) {
    try {
      const summary = formData.get('summary')?.trim();
      if (!summary) {
        notifications.show('Summary is required', 'error');
        return;
      }

      const params = {
        summary,
        notes: formData.get('notes')?.trim() || '',
        priority: formData.get('priority') || 'medium',
        tags: formData.get('tags')
          ?.split(',')
          .map(t => t.trim())
          .filter(t => t.length > 0) || []
      };

      const collectionId = formData.get('collectionId');
      if (collectionId) {
        params.collectionId = collectionId;
      }

      const dueDateStr = formData.get('dueDate');
      if (dueDateStr) {
        params.dueDate = new Date(dueDateStr).getTime();
      }

      const response = await this.sendMessage('createTask', { params });

      if (response.error) {
        throw new Error(response.error);
      }

      modal.close();
      notifications.show('Task created successfully', 'success');

      // Refresh data
      await this.loadData();
    } catch (error) {
      console.error('Error saving new task:', error);
      notifications.show(
        error.message || 'Failed to create task',
        'error'
      );
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
  try {
    console.log('[Panel] DOMContentLoaded - initializing...');
    const controller = new SidePanelController();
    await controller.init();
    console.log('[Panel] Initialization complete');
  } catch (error) {
    console.error('[Panel] Initialization failed:', error);
    // Show error in UI
    document.body.innerHTML = `
      <div style="padding: 20px; color: red;">
        <h2>Initialization Error</h2>
        <pre>${error.message}\n${error.stack}</pre>
      </div>
    `;
  }
});
