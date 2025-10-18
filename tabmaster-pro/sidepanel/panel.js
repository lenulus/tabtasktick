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

    // Apply search filter
    const filteredCollections = this.filterCollections(collections);

    // Show empty state if no collections after filtering
    if (filteredCollections.length === 0) {
      if (this.searchQuery) {
        // Show "no results" message when searching
        this.showNoSearchResults('collections');
      } else {
        this.showEmpty('collections');
      }
      return;
    }

    // Show content and delegate to CollectionsView
    this.showContent('collections');
    if (this.collectionsView) {
      this.collectionsView.render(filteredCollections);
    }
  }

  /**
   * Render tasks view
   */
  renderTasks() {
    const tasks = this.tasksData || [];

    // Apply search filter
    const filteredTasks = this.filterTasks(tasks);

    // Show empty state if no tasks after filtering
    if (filteredTasks.length === 0) {
      if (this.searchQuery) {
        // Show "no results" message when searching
        this.showNoSearchResults('tasks');
      } else {
        this.showEmpty('tasks');
      }
      return;
    }

    // Show content and delegate to TasksView
    this.showContent('tasks');
    if (this.tasksView) {
      this.tasksView.render(filteredTasks, this.collectionsData || []);
    }
  }

  /**
   * Handle save window action
   */
  async handleSaveWindow() {
    try {
      // Get current window info
      const currentWindow = await chrome.windows.getCurrent({ populate: true });
      const tabs = await chrome.tabs.query({ windowId: currentWindow.id });
      const tabGroups = await chrome.tabGroups.query({ windowId: currentWindow.id });

      // Suggest name from top domain
      const suggestedName = this.suggestCollectionName(tabs);

      // Show save window modal
      this.showSaveWindowModal(suggestedName, tabs.length, tabGroups.length);
    } catch (error) {
      console.error('Failed to save window:', error);
      notifications.error('Failed to save window');
    }
  }

  /**
   * Suggest collection name from top domain
   */
  suggestCollectionName(tabs) {
    if (!tabs || tabs.length === 0) {
      return 'New Collection';
    }

    // Count domains
    const domainCounts = {};
    for (const tab of tabs) {
      try {
        const url = new URL(tab.url);
        const domain = url.hostname.replace(/^www\./, '');
        domainCounts[domain] = (domainCounts[domain] || 0) + 1;
      } catch (e) {
        // Skip invalid URLs
      }
    }

    // Find top domain
    const topDomain = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    if (topDomain) {
      // Capitalize first letter of domain name
      const name = topDomain.split('.')[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    }

    return 'New Collection';
  }

  /**
   * Show save window modal
   */
  showSaveWindowModal(suggestedName, tabCount, folderCount) {
    const formHtml = `
      <form id="save-window-form" class="modal-form">
        <p style="color: var(--text-secondary); margin-bottom: var(--spacing-lg);">
          Save current window with ${tabCount} tab${tabCount !== 1 ? 's' : ''} and ${folderCount} folder${folderCount !== 1 ? 's' : ''}.
        </p>

        <div class="form-group">
          <label for="collection-name">Name *</label>
          <input
            type="text"
            id="collection-name"
            name="name"
            class="form-control"
            required
            maxlength="255"
            placeholder="Enter collection name"
            value="${this.escapeHtml(suggestedName)}"
          >
        </div>

        <div class="form-group">
          <label for="collection-description">Description</label>
          <textarea
            id="collection-description"
            name="description"
            class="form-control"
            rows="3"
            placeholder="What is this collection for?"
          ></textarea>
        </div>

        <div class="form-group">
          <label for="collection-icon">Icon</label>
          <input
            type="text"
            id="collection-icon"
            name="icon"
            class="form-control"
            maxlength="10"
            placeholder="📁 (optional emoji)"
          >
        </div>

        <div class="form-group">
          <label for="collection-tags">Tags (comma-separated)</label>
          <input
            type="text"
            id="collection-tags"
            name="tags"
            class="form-control"
            placeholder="work, project, research"
          >
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-modal-cancel>Cancel</button>
          <button type="submit" class="btn btn-primary">Save Window</button>
        </div>
      </form>
    `;

    modal.open({
      title: 'Save Current Window',
      content: formHtml
    });

    // Attach form handler after modal is created
    requestAnimationFrame(() => {
      const form = document.getElementById('save-window-form');
      const cancelBtn = form?.querySelector('[data-modal-cancel]');
      const nameInput = form?.querySelector('#collection-name');

      // Auto-select the name for easy editing
      nameInput?.select();

      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.saveWindow(new FormData(form));
      });

      cancelBtn?.addEventListener('click', () => {
        modal.close();
      });
    });
  }

  /**
   * Save window as collection
   */
  async saveWindow(formData) {
    try {
      const name = formData.get('name')?.trim();
      if (!name) {
        notifications.show('Collection name is required', 'error');
        return;
      }

      const params = {
        name,
        description: formData.get('description')?.trim() || '',
        icon: formData.get('icon')?.trim() || '📁',
        tags: formData.get('tags')
          ?.split(',')
          .map(t => t.trim())
          .filter(t => t.length > 0) || []
      };

      // Get current window ID
      const currentWindow = await chrome.windows.getCurrent();
      params.windowId = currentWindow.id;

      const response = await this.sendMessage('createCollection', { params });

      if (response.error) {
        throw new Error(response.error);
      }

      modal.close();

      // Show success notification
      const collection = response.collection;
      const tabCount = collection.metadata?.tabCount || 0;
      const folderCount = collection.metadata?.folderCount || 0;
      notifications.show(
        `✓ Saved ${collection.name} (${tabCount} tabs, ${folderCount} folders)`,
        'success'
      );

      // Refresh data
      await this.loadData();

      // Navigate to collection detail view
      if (this.collectionDetailView && collection.id) {
        this.collectionDetailView.show(collection.id);
      }
    } catch (error) {
      console.error('Error saving window:', error);
      notifications.show(
        error.message || 'Failed to save window',
        'error'
      );
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
   * Handle search input (debounced)
   */
  handleSearch(query) {
    this.searchQuery = query.toLowerCase();

    // Debounce search (300ms)
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.applySearch();
    }, 300);
  }

  /**
   * Apply search filter to current view
   */
  applySearch() {
    if (this.currentView === 'collections') {
      this.renderCollections();
    } else if (this.currentView === 'tasks') {
      this.renderTasks();
    }
  }

  /**
   * Filter collections by search query
   */
  filterCollections(collections) {
    if (!this.searchQuery || this.searchQuery.trim() === '') {
      return collections;
    }

    const query = this.searchQuery.trim();
    return collections.filter(collection => {
      // Search in name
      if (collection.name?.toLowerCase().includes(query)) {
        return true;
      }
      // Search in description
      if (collection.description?.toLowerCase().includes(query)) {
        return true;
      }
      // Search in tags
      if (collection.tags?.some(tag => tag.toLowerCase().includes(query))) {
        return true;
      }
      return false;
    });
  }

  /**
   * Filter tasks by search query
   */
  filterTasks(tasks) {
    if (!this.searchQuery || this.searchQuery.trim() === '') {
      return tasks;
    }

    const query = this.searchQuery.trim();
    return tasks.filter(task => {
      // Search in summary
      if (task.summary?.toLowerCase().includes(query)) {
        return true;
      }
      // Search in notes
      if (task.notes?.toLowerCase().includes(query)) {
        return true;
      }
      // Search in tags
      if (task.tags?.some(tag => tag.toLowerCase().includes(query))) {
        return true;
      }
      return false;
    });
  }

  /**
   * Handle messages from background
   */
  handleBackgroundMessage(message) {
    const { action, data } = message;

    switch (action) {
      case 'collection.created':
        // Reload collections with scroll position maintenance
        this.reloadWithScrollMaintenance('collections');
        // Highlight newly created collection
        if (data?.collectionId) {
          setTimeout(() => {
            this.highlightItem('collection', data.collectionId);
          }, 100);
        }
        break;

      case 'collection.updated':
      case 'collection.deleted':
        // Reload collections with scroll position maintenance
        this.reloadWithScrollMaintenance('collections');
        break;

      case 'task.created':
        // Reload tasks with scroll position maintenance
        this.reloadWithScrollMaintenance('tasks');
        // Highlight newly created task
        if (data?.taskId) {
          setTimeout(() => {
            this.highlightItem('task', data.taskId);
          }, 100);
        }
        break;

      case 'task.updated':
      case 'task.deleted':
        // Reload tasks with scroll position maintenance
        this.reloadWithScrollMaintenance('tasks');
        break;
    }
  }

  /**
   * Reload data while maintaining scroll position
   */
  async reloadWithScrollMaintenance(viewName) {
    const container = document.getElementById(`${viewName}-content`);
    const scrollTop = container?.scrollTop || 0;

    await this.loadData();

    // Restore scroll position
    requestAnimationFrame(() => {
      if (container) {
        container.scrollTop = scrollTop;
      }
    });
  }

  /**
   * Highlight an item briefly
   */
  highlightItem(type, id) {
    const selector = type === 'collection'
      ? `.collection-card[data-collection-id="${id}"]`
      : `.task-card[data-task-id="${id}"]`;

    const element = document.querySelector(selector);
    if (!element) return;

    // Add highlight class
    element.classList.add('highlighted');

    // Remove after animation
    setTimeout(() => {
      element.classList.remove('highlighted');
    }, 2000);

    // Scroll into view
    element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
   * Show no search results state
   */
  showNoSearchResults(view) {
    const contentContainer = document.getElementById(`${view}-content`);
    if (!contentContainer) return;

    const entityName = view === 'collections' ? 'collections' : 'tasks';
    contentContainer.innerHTML = `
      <div class="empty-state" style="display: flex;">
        <div class="empty-icon">🔍</div>
        <h3 class="empty-title">No ${entityName} found</h3>
        <p class="empty-description">
          No ${entityName} match your search query "${this.escapeHtml(this.searchQuery)}".
          Try a different search term.
        </p>
      </div>
    `;

    this.showContent(view);
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
