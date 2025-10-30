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
import { SearchFilter } from './search-filter.js';
import { PresentationControls } from './presentation-controls.js';
import { suggestEmoji } from '../services/utils/emoji-suggestions.js';
import {
  importCollections as importCollectionsService,
  formatImportSuccessMessage,
  formatImportErrorMessage
} from '../services/utils/collection-import-export-ui.js';
import { getCurrentTabSnapshot } from '../services/utils/tab-snapshot.js';
import { TabChipRenderer } from './components/tab-chip-renderer.js';

class SidePanelController {
  constructor() {
    this.currentView = 'collections'; // 'collections' or 'tasks'
    this.collectionsData = null;
    this.tasksData = null;
    this.searchQuery = '';
    this.filtersVisible = false;
    this.collectionsView = null;
    this.collectionDetailView = null;
    this.tasksView = null;
    this.searchFilter = null;
    this.presentationControls = null;
  }

  /**
   * Initialize the side panel
   */
  async init() {
    console.log('Initializing TabTaskTick Side Panel...');

    // Initialize components
    notifications.init();
    modal.init();

    // Initialize search filter
    this.searchFilter = new SearchFilter();
    this.searchFilter.init();

    // Setup filter callbacks
    this.searchFilter.onSearchChange = (query) => {
      this.searchQuery = query.toLowerCase();
      this.applyFiltersAndRender();
    };

    this.searchFilter.onFiltersChange = (view, filters) => {
      this.applyFiltersAndRender();
    };

    // Initialize presentation controls
    this.presentationControls = new PresentationControls();
    await this.presentationControls.init();

    // Setup presentation control callbacks
    this.presentationControls.onGroupByChange = (groupBy) => {
      this.applyFiltersAndRender();
    };

    this.presentationControls.onSortByChange = (sortBy) => {
      this.applyFiltersAndRender();
    };

    this.presentationControls.onSortDirectionChange = (direction) => {
      this.applyFiltersAndRender();
    };

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

    // Toggle filters button
    const toggleFiltersBtn = document.getElementById('toggle-filters-btn');
    toggleFiltersBtn?.addEventListener('click', () => {
      this.toggleFilters();
    });

    // Save window button
    const saveWindowBtn = document.getElementById('save-window-btn');
    saveWindowBtn?.addEventListener('click', () => {
      this.handleSaveWindow();
    });

    // Create task button (Phase 11)
    const createTaskBtn = document.getElementById('create-task-btn');
    createTaskBtn?.addEventListener('click', () => {
      this.handleCreateTask();
    });

    // Import collections button
    const importBtn = document.getElementById('import-collections-btn');
    importBtn?.addEventListener('click', () => {
      const fileInput = document.getElementById('import-file-input');
      if (fileInput) {
        fileInput.click();
      }
    });

    // Import file input
    const importFileInput = document.getElementById('import-file-input');
    importFileInput?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await this.handleImportCollections(file);
        // Reset input so same file can be selected again
        importFileInput.value = '';
      }
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
    const collectionsFilters = document.getElementById('collections-filters');
    const tasksFilters = document.getElementById('tasks-filters');

    // Toggle header action buttons based on view
    const saveWindowBtn = document.getElementById('save-window-btn');
    const createTaskBtn = document.getElementById('create-task-btn');

    if (viewName === 'collections') {
      collectionsView?.classList.add('active');
      tasksView?.classList.remove('active');
      tasksView?.setAttribute('hidden', '');
      collectionsView?.removeAttribute('hidden');
      collectionsBtn?.classList.add('active');
      tasksBtn?.classList.remove('active');
      collectionsBtn?.setAttribute('aria-selected', 'true');
      tasksBtn?.setAttribute('aria-selected', 'false');

      // Show Create Collection button, hide Create Task button
      saveWindowBtn?.classList.remove('hidden');
      createTaskBtn?.classList.add('hidden');

      // Show collections filters, hide tasks filters
      collectionsFilters?.classList.remove('hidden');
      tasksFilters?.classList.add('hidden');

      // Render collections filters with available tags
      if (this.searchFilter && this.filtersVisible) {
        const tags = this.extractUniqueTags(this.collectionsData || []);
        this.searchFilter.renderCollectionsFilters(tags);
      }
    } else {
      tasksView?.classList.add('active');
      collectionsView?.classList.remove('active');
      collectionsView?.setAttribute('hidden', '');
      tasksView?.removeAttribute('hidden');
      tasksBtn?.classList.add('active');
      collectionsBtn?.classList.remove('active');
      tasksBtn?.setAttribute('aria-selected', 'true');
      collectionsBtn?.setAttribute('aria-selected', 'false');

      // Show Create Task button, hide Create Collection button
      saveWindowBtn?.classList.add('hidden');
      createTaskBtn?.classList.remove('hidden');

      // Show tasks filters, hide collections filters
      tasksFilters?.classList.remove('hidden');
      collectionsFilters?.classList.add('hidden');

      // Render tasks filters with available collections
      if (this.searchFilter && this.filtersVisible) {
        this.searchFilter.renderTasksFilters(this.collectionsData || []);
      }
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
      // Pass current state filter to view so it knows whether to separate or unify
      const stateFilter = this.searchFilter?.getCollectionsFilters().state || 'all';
      this.collectionsView.render(filteredCollections, { stateFilter });
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

    // Get presentation options from presentation controls
    const presentationOptions = this.presentationControls
      ? this.presentationControls.getPresentationOptions()
      : { groupBy: 'collection', sortBy: 'priority', sortDirection: 'desc' };

    // Show content and delegate to TasksView with presentation options
    this.showContent('tasks');
    if (this.tasksView) {
      this.tasksView.render(filteredTasks, this.collectionsData || [], presentationOptions);
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
          Create a new collection from the current window with ${tabCount} tab${tabCount !== 1 ? 's' : ''} and ${folderCount} folder${folderCount !== 1 ? 's' : ''}.
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
          <label for="collection-icon">
            Icon
            <span id="emoji-suggestion-badge" class="emoji-suggestion-badge" style="display: none;">✨ Suggested</span>
          </label>
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
          <button type="submit" class="btn btn-primary">Create Collection</button>
        </div>
      </form>
    `;

    modal.open({
      title: 'Create Collection',
      content: formHtml
    });

    // Attach form handler after modal is created
    requestAnimationFrame(() => {
      const form = document.getElementById('save-window-form');
      const cancelBtn = form?.querySelector('[data-modal-cancel]');
      const nameInput = form?.querySelector('#collection-name');
      const iconInput = form?.querySelector('#collection-icon');
      const badge = document.getElementById('emoji-suggestion-badge');

      // Phase 4.2.7: Emoji suggestion logic
      let isEmojiSuggested = false;
      let debounceTimer = null;

      const updateEmojiSuggestion = () => {
        const name = nameInput?.value || '';
        if (name.trim()) {
          const suggested = suggestEmoji(name);
          if (!iconInput.value || isEmojiSuggested) {
            iconInput.value = suggested;
            isEmojiSuggested = true;
            badge.style.display = 'inline';
          }
        }
      };

      // Initial suggestion based on suggested name
      updateEmojiSuggestion();

      // Update suggestion as user types (debounced)
      nameInput?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(updateEmojiSuggestion, 300);
      });

      // Remove badge when user manually changes emoji
      iconInput?.addEventListener('input', () => {
        isEmojiSuggested = false;
        badge.style.display = 'none';
      });

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

      const response = await this.sendMessage('captureWindow', {
        windowId: currentWindow.id,
        metadata: params,
        keepActive: true
      });

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
   * Handle import collections from file
   */
  async handleImportCollections(file) {
    try {
      notifications.show('Importing collections...', 'info');

      const result = await importCollectionsService(file);

      if (result?.success) {
        const { imported, errors } = result;

        // Show success message
        if (imported.length > 0) {
          notifications.show(formatImportSuccessMessage(result), 'success');
        }

        // Show errors if any collections failed
        if (errors.length > 0) {
          notifications.show(formatImportErrorMessage(result, '; '), 'error');
        }

        // Refresh data if any collections were imported
        if (imported.length > 0) {
          await this.loadData();
        }
      } else {
        notifications.show('Failed to import collections', 'error');
      }
    } catch (error) {
      console.error('Error importing collections:', error);
      notifications.show(
        error.message || 'Failed to import collections',
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
  async showCreateTaskModal() {
    // Capture current tab snapshot before opening modal
    const currentTabSnapshot = await getCurrentTabSnapshot();

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

        <!-- Phase 11: Tab Association Section -->
        <div class="tab-association-section" id="tab-association-section">
          <label class="section-label">Context</label>
          <div class="tab-chip-container" id="tab-chip-container">
            ${currentTabSnapshot ? TabChipRenderer.renderTabChip(currentTabSnapshot, this.escapeHtml.bind(this)) : TabChipRenderer.renderEmptyTabState()}
          </div>
          <p class="helper-text">Quick access to this tab</p>
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

    // Attach form handler and tab chip handlers after modal is created
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

      // Setup tab chip interaction handlers
      TabChipRenderer.setupTabChipHandlers(
        '#tab-chip-container',
        currentTabSnapshot ? [currentTabSnapshot] : [],
        this.escapeHtml.bind(this),
        { multipleMode: false } // Single tab for create modal
      );
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

      // Phase 11: Include tab references if present
      const container = document.getElementById('tab-chip-container');
      if (container?.dataset.tabReferences) {
        try {
          params.tabReferences = JSON.parse(container.dataset.tabReferences);
        } catch (error) {
          console.warn('[Phase 11] Failed to parse tab references:', error);
          params.tabReferences = [];
        }
      } else {
        params.tabReferences = [];
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
   * Toggle filters panel visibility
   */
  toggleFilters() {
    this.filtersVisible = !this.filtersVisible;
    const filtersPanel = document.getElementById('filters-panel');
    const toggleBtn = document.getElementById('toggle-filters-btn');
    const collectionsFilters = document.getElementById('collections-filters');
    const tasksFilters = document.getElementById('tasks-filters');

    if (this.filtersVisible) {
      filtersPanel?.classList.remove('hidden');
      toggleBtn?.classList.add('active');

      // Show/hide appropriate filter containers
      if (this.currentView === 'collections') {
        collectionsFilters?.classList.remove('hidden');
        tasksFilters?.classList.add('hidden');
        const tags = this.extractUniqueTags(this.collectionsData || []);
        this.searchFilter?.renderCollectionsFilters(tags);
      } else {
        tasksFilters?.classList.remove('hidden');
        collectionsFilters?.classList.add('hidden');
        this.searchFilter?.renderTasksFilters(this.collectionsData || []);
      }
    } else {
      filtersPanel?.classList.add('hidden');
      toggleBtn?.classList.remove('active');
    }
  }

  /**
   * Apply filters and re-render current view
   */
  applyFiltersAndRender() {
    if (this.currentView === 'collections') {
      this.renderCollections();
    } else if (this.currentView === 'tasks') {
      this.renderTasks();
    }
  }

  /**
   * Filter collections by search query and filters
   */
  filterCollections(collections) {
    let filtered = [...collections];

    // Apply search query
    if (this.searchQuery && this.searchQuery.trim() !== '') {
      const query = this.searchQuery.trim();
      filtered = filtered.filter(collection => {
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

    // Apply filters from SearchFilter component
    if (this.searchFilter) {
      const filters = this.searchFilter.getCollectionsFilters();

      // Filter by state
      if (filters.state !== 'all') {
        filtered = filtered.filter(c => {
          const isActive = filters.state === 'active';
          return c.isActive === isActive;
        });
      }

      // Filter by tags
      if (filters.tags.length > 0) {
        filtered = filtered.filter(c => {
          return filters.tags.some(tag => c.tags?.includes(tag));
        });
      }

      // Sort collections
      filtered = this.sortCollections(filtered, filters.sortBy);
    }

    return filtered;
  }

  /**
   * Filter tasks by search query and filters
   */
  filterTasks(tasks) {
    let filtered = [...tasks];

    // Apply search query
    if (this.searchQuery && this.searchQuery.trim() !== '') {
      const query = this.searchQuery.trim();
      filtered = filtered.filter(task => {
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

    // Apply filters from SearchFilter component
    if (this.searchFilter) {
      const filters = this.searchFilter.getTasksFilters();

      // Filter by status
      if (filters.status.length > 0) {
        filtered = filtered.filter(t => filters.status.includes(t.status));
      }

      // Filter by priority
      if (filters.priority.length > 0) {
        filtered = filtered.filter(t => filters.priority.includes(t.priority));
      }

      // Filter by collection
      if (filters.collectionId.length > 0) {
        filtered = filtered.filter(t => {
          // Handle uncategorized tasks
          if (filters.collectionId.includes('uncategorized') && !t.collectionId) {
            return true;
          }
          // Handle specific collections
          return filters.collectionId.includes(t.collectionId);
        });
      }
    }

    // Sort tasks using presentation controls (sortBy moved from filters to presentation)
    if (this.presentationControls) {
      const sortBy = this.presentationControls.getSortBy();
      const sortDirection = this.presentationControls.getSortDirection();
      filtered = this.sortTasks(filtered, sortBy, sortDirection);
    }

    return filtered;
  }

  /**
   * Sort collections by criteria
   */
  sortCollections(collections, sortBy) {
    const sorted = [...collections];

    switch (sortBy) {
      case 'lastAccessed':
        return sorted.sort((a, b) => {
          const aTime = a.metadata?.lastAccessed || 0;
          const bTime = b.metadata?.lastAccessed || 0;
          return bTime - aTime; // Descending
        });

      case 'created':
        return sorted.sort((a, b) => {
          const aTime = a.metadata?.createdAt || 0;
          const bTime = b.metadata?.createdAt || 0;
          return bTime - aTime; // Descending
        });

      case 'name':
        return sorted.sort((a, b) => {
          const aName = (a.name || '').toLowerCase();
          const bName = (b.name || '').toLowerCase();
          return aName.localeCompare(bName); // Ascending
        });

      default:
        return sorted;
    }
  }

  /**
   * Sort tasks by criteria with direction support
   * @param {Array} tasks - Tasks to sort
   * @param {string} sortBy - 'priority'|'dueDate'|'created'|'alpha'
   * @param {string} sortDirection - 'asc'|'desc'
   */
  sortTasks(tasks, sortBy, sortDirection = 'desc') {
    const sorted = [...tasks];

    switch (sortBy) {
      case 'dueDate':
        sorted.sort((a, b) => {
          // Tasks with no due date go to the end
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate - b.dueDate; // Natural: earliest first
        });
        // Reverse if descending
        return sortDirection === 'desc' ? sorted.reverse() : sorted;

      case 'priority':
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        sorted.sort((a, b) => {
          const aPriority = priorityOrder[a.priority] ?? 999;
          const bPriority = priorityOrder[b.priority] ?? 999;
          return aPriority - bPriority; // Natural: critical first
        });
        // Reverse if ascending
        return sortDirection === 'asc' ? sorted.reverse() : sorted;

      case 'created':
        sorted.sort((a, b) => {
          const aTime = a.createdAt || 0;
          const bTime = b.createdAt || 0;
          return aTime - bTime; // Natural: oldest first
        });
        // Reverse if descending (newest first)
        return sortDirection === 'desc' ? sorted.reverse() : sorted;

      case 'alpha':
        sorted.sort((a, b) => {
          const aName = (a.summary || '').toLowerCase();
          const bName = (b.summary || '').toLowerCase();
          return aName.localeCompare(bName); // Natural: A → Z
        });
        // Reverse if descending (Z → A)
        return sortDirection === 'desc' ? sorted.reverse() : sorted;

      default:
        return sorted;
    }
  }

  /**
   * Extract unique tags from collections
   */
  extractUniqueTags(collections) {
    const tagsSet = new Set();
    collections.forEach(c => {
      c.tags?.forEach(tag => tagsSet.add(tag));
    });
    return Array.from(tagsSet).sort();
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

      case 'openSidePanelView':
        // Phase 4: Deep link from popup to specific view
        if (data?.view) {
          this.switchView(data.view);
        }
        break;

      case 'openSidePanelWithAction':
        // Phase 4: Deep link from popup with action (e.g., create collection modal)
        if (data?.panelAction === 'createCollection') {
          // Switch to collections view first
          this.switchView('collections');
          // Then open create collection modal
          setTimeout(() => {
            this.handleSaveWindow();
          }, 100);
        } else if (data?.panelAction === 'createTask') {
          // Switch to tasks view first
          this.switchView('tasks');
          // Then open create task modal
          setTimeout(() => {
            this.handleCreateTask();
          }, 100);
        }
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

  // Phase 11: Tab chip rendering moved to TabChipRenderer component
  // See: /sidepanel/components/tab-chip-renderer.js
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('[Panel] DOMContentLoaded - initializing...');
    const controller = new SidePanelController();
    await controller.init();
    console.log('[Panel] Initialization complete');

    // Expose controller globally for E2E testing
    // This allows tests to programmatically clear filters and manipulate state
    window.panelController = controller;
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
