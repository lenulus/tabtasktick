/**
 * Search & Filter Component
 *
 * Pure UI component for search and filter functionality
 * - Debounced search input (300ms delay)
 * - Filter components for collections and tasks
 * - Active filter count badge
 * - Filter state persistence
 * - NO business logic - just UI state management
 */

export class SearchFilter {
  constructor() {
    this.searchQuery = '';
    this.collectionsFilters = {
      state: 'all', // 'all' | 'active' | 'saved'
      tags: [],     // Array of selected tags
      sortBy: 'lastAccessed' // 'lastAccessed' | 'created' | 'name'
    };
    this.tasksFilters = {
      status: [],       // Array of selected statuses
      priority: [],     // Array of selected priorities
      collectionId: [], // Array of selected collection IDs
      dueDateRange: null, // { start: Date, end: Date } or null
      sortBy: 'dueDate' // 'dueDate' | 'priority' | 'created'
    };
    this.searchDebounceTimeout = null;
    this.onSearchChange = null;
    this.onFiltersChange = null;
    // Store available options for re-rendering
    this.availableTags = [];
    this.availableCollections = [];
  }

  /**
   * Initialize the search and filter UI
   */
  init() {
    this.setupSearchInput();
    this.loadFilterState();
  }

  /**
   * Setup search input with debouncing
   */
  setupSearchInput() {
    const searchInput = document.getElementById('global-search');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value;
      this.searchQuery = query;

      // Debounce search (300ms delay)
      clearTimeout(this.searchDebounceTimeout);
      this.searchDebounceTimeout = setTimeout(() => {
        if (this.onSearchChange) {
          this.onSearchChange(query);
        }
      }, 300);
    });

    // Clear button functionality
    searchInput.addEventListener('search', (e) => {
      // Triggered when user clicks X in search input
      if (e.target.value === '') {
        this.searchQuery = '';
        if (this.onSearchChange) {
          this.onSearchChange('');
        }
      }
    });
  }

  /**
   * Render collections filters
   */
  renderCollectionsFilters(availableTags = this.availableTags) {
    // Store tags for re-rendering when state filter changes
    this.availableTags = availableTags;

    const container = document.getElementById('collections-filters');
    if (!container) return;

    const html = `
      <div class="filter-section">
        <div class="filter-group">
          <label class="filter-label">State</label>
          <div class="filter-toggle-group">
            <button
              class="filter-toggle ${this.collectionsFilters.state === 'all' ? 'active' : ''}"
              data-filter="state"
              data-value="all"
            >
              All
            </button>
            <button
              class="filter-toggle ${this.collectionsFilters.state === 'active' ? 'active' : ''}"
              data-filter="state"
              data-value="active"
            >
              Active
            </button>
            <button
              class="filter-toggle ${this.collectionsFilters.state === 'saved' ? 'active' : ''}"
              data-filter="state"
              data-value="saved"
            >
              Saved
            </button>
          </div>
        </div>

        ${availableTags.length > 0 ? `
          <div class="filter-group">
            <label class="filter-label">Tags</label>
            <div class="filter-multi-select" id="collections-tags-filter">
              ${availableTags.map(tag => `
                <label class="filter-checkbox">
                  <input
                    type="checkbox"
                    data-filter="tags"
                    value="${this.escapeHtml(tag)}"
                    ${this.collectionsFilters.tags.includes(tag) ? 'checked' : ''}
                  >
                  <span>${this.escapeHtml(tag)}</span>
                </label>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="filter-group">
          <label class="filter-label">Sort by</label>
          <select class="filter-select" data-filter="sortBy">
            <option value="lastAccessed" ${this.collectionsFilters.sortBy === 'lastAccessed' ? 'selected' : ''}>
              Last Accessed
            </option>
            <option value="created" ${this.collectionsFilters.sortBy === 'created' ? 'selected' : ''}>
              Created
            </option>
            <option value="name" ${this.collectionsFilters.sortBy === 'name' ? 'selected' : ''}>
              Name
            </option>
          </select>
        </div>

        ${this.getActiveFilterCount('collections') > 0 ? `
          <button class="filter-clear-btn" data-clear-filters="collections">
            Clear Filters (${this.getActiveFilterCount('collections')})
          </button>
        ` : ''}
      </div>
    `;

    container.innerHTML = html;
    this.attachCollectionsFilterListeners();
  }

  /**
   * Render tasks filters
   */
  renderTasksFilters(collections = this.availableCollections) {
    // Store collections for re-rendering when filters change
    this.availableCollections = collections;

    const container = document.getElementById('tasks-filters');
    if (!container) return;

    const html = `
      <div class="filter-section">
        <div class="filter-group">
          <label class="filter-label">Status</label>
          <div class="filter-multi-select">
            ${['open', 'active', 'fixed', 'abandoned'].map(status => `
              <label class="filter-checkbox">
                <input
                  type="checkbox"
                  data-filter="status"
                  value="${status}"
                  ${this.tasksFilters.status.includes(status) ? 'checked' : ''}
                >
                <span>${this.capitalize(status)}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <div class="filter-group">
          <label class="filter-label">Priority</label>
          <div class="filter-multi-select">
            ${['low', 'medium', 'high', 'critical'].map(priority => `
              <label class="filter-checkbox">
                <input
                  type="checkbox"
                  data-filter="priority"
                  value="${priority}"
                  ${this.tasksFilters.priority.includes(priority) ? 'checked' : ''}
                >
                <span>${this.capitalize(priority)}</span>
              </label>
            `).join('')}
          </div>
        </div>

        ${collections.length > 0 ? `
          <div class="filter-group">
            <label class="filter-label">Collection</label>
            <div class="filter-multi-select" style="max-height: 200px; overflow-y: auto;">
              <label class="filter-checkbox">
                <input
                  type="checkbox"
                  data-filter="collection"
                  value="uncategorized"
                  ${this.tasksFilters.collectionId.includes('uncategorized') ? 'checked' : ''}
                >
                <span>Uncategorized</span>
              </label>
              ${collections.map(c => `
                <label class="filter-checkbox">
                  <input
                    type="checkbox"
                    data-filter="collection"
                    value="${c.id}"
                    ${this.tasksFilters.collectionId.includes(c.id) ? 'checked' : ''}
                  >
                  <span>${this.escapeHtml(c.name || 'Unnamed')}</span>
                </label>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="filter-group">
          <label class="filter-label">Sort by</label>
          <select class="filter-select" data-filter="sortBy">
            <option value="dueDate" ${this.tasksFilters.sortBy === 'dueDate' ? 'selected' : ''}>
              Due Date
            </option>
            <option value="priority" ${this.tasksFilters.sortBy === 'priority' ? 'selected' : ''}>
              Priority
            </option>
            <option value="created" ${this.tasksFilters.sortBy === 'created' ? 'selected' : ''}>
              Created
            </option>
          </select>
        </div>

        ${this.getActiveFilterCount('tasks') > 0 ? `
          <button class="filter-clear-btn" data-clear-filters="tasks">
            Clear Filters (${this.getActiveFilterCount('tasks')})
          </button>
        ` : ''}
      </div>
    `;

    container.innerHTML = html;
    this.attachTasksFilterListeners();
  }

  /**
   * Attach event listeners for collections filters
   */
  attachCollectionsFilterListeners() {
    const container = document.getElementById('collections-filters');
    if (!container) return;

    // State toggle buttons
    container.querySelectorAll('[data-filter="state"]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.collectionsFilters.state = btn.dataset.value;
        this.saveFilterState();
        this.renderCollectionsFilters(); // Re-render to update active states
        if (this.onFiltersChange) {
          this.onFiltersChange('collections', this.collectionsFilters);
        }
      });
    });

    // Tag checkboxes
    container.querySelectorAll('[data-filter="tags"]').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          if (!this.collectionsFilters.tags.includes(checkbox.value)) {
            this.collectionsFilters.tags.push(checkbox.value);
          }
        } else {
          this.collectionsFilters.tags = this.collectionsFilters.tags.filter(
            t => t !== checkbox.value
          );
        }
        this.saveFilterState();
        if (this.onFiltersChange) {
          this.onFiltersChange('collections', this.collectionsFilters);
        }
      });
    });

    // Sort select
    const sortSelect = container.querySelector('[data-filter="sortBy"]');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        this.collectionsFilters.sortBy = sortSelect.value;
        this.saveFilterState();
        if (this.onFiltersChange) {
          this.onFiltersChange('collections', this.collectionsFilters);
        }
      });
    }

    // Clear filters button
    const clearBtn = container.querySelector('[data-clear-filters="collections"]');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clearCollectionsFilters();
      });
    }
  }

  /**
   * Attach event listeners for tasks filters
   */
  attachTasksFilterListeners() {
    const container = document.getElementById('tasks-filters');
    if (!container) return;

    // Status checkboxes
    container.querySelectorAll('[data-filter="status"]').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          if (!this.tasksFilters.status.includes(checkbox.value)) {
            this.tasksFilters.status.push(checkbox.value);
          }
        } else {
          this.tasksFilters.status = this.tasksFilters.status.filter(
            s => s !== checkbox.value
          );
        }
        this.saveFilterState();
        if (this.onFiltersChange) {
          this.onFiltersChange('tasks', this.tasksFilters);
        }
      });
    });

    // Priority checkboxes
    container.querySelectorAll('[data-filter="priority"]').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          if (!this.tasksFilters.priority.includes(checkbox.value)) {
            this.tasksFilters.priority.push(checkbox.value);
          }
        } else {
          this.tasksFilters.priority = this.tasksFilters.priority.filter(
            p => p !== checkbox.value
          );
        }
        this.saveFilterState();
        if (this.onFiltersChange) {
          this.onFiltersChange('tasks', this.tasksFilters);
        }
      });
    });

    // Collection checkboxes
    container.querySelectorAll('[data-filter="collection"]').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          if (!this.tasksFilters.collectionId.includes(checkbox.value)) {
            this.tasksFilters.collectionId.push(checkbox.value);
          }
        } else {
          this.tasksFilters.collectionId = this.tasksFilters.collectionId.filter(
            c => c !== checkbox.value
          );
        }
        this.saveFilterState();
        if (this.onFiltersChange) {
          this.onFiltersChange('tasks', this.tasksFilters);
        }
      });
    });

    // Sort select
    const sortSelect = container.querySelector('[data-filter="sortBy"]');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        this.tasksFilters.sortBy = sortSelect.value;
        this.saveFilterState();
        if (this.onFiltersChange) {
          this.onFiltersChange('tasks', this.tasksFilters);
        }
      });
    }

    // Clear filters button
    const clearBtn = container.querySelector('[data-clear-filters="tasks"]');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clearTasksFilters();
      });
    }
  }

  /**
   * Clear all collections filters
   */
  clearCollectionsFilters() {
    this.collectionsFilters = {
      state: 'all',
      tags: [],
      sortBy: 'lastAccessed'
    };
    this.saveFilterState();
    this.renderCollectionsFilters(); // Re-render to clear UI
    if (this.onFiltersChange) {
      this.onFiltersChange('collections', this.collectionsFilters);
    }
  }

  /**
   * Clear all tasks filters
   */
  clearTasksFilters() {
    this.tasksFilters = {
      status: [],
      priority: [],
      collectionId: [],
      dueDateRange: null,
      sortBy: 'dueDate'
    };
    this.saveFilterState();
    this.renderTasksFilters(); // Re-render to clear UI
    if (this.onFiltersChange) {
      this.onFiltersChange('tasks', this.tasksFilters);
    }
  }

  /**
   * Get count of active filters for a view
   */
  getActiveFilterCount(view) {
    if (view === 'collections') {
      let count = 0;
      if (this.collectionsFilters.state !== 'all') count++;
      count += this.collectionsFilters.tags.length;
      return count;
    } else if (view === 'tasks') {
      let count = 0;
      count += this.tasksFilters.status.length;
      count += this.tasksFilters.priority.length;
      count += this.tasksFilters.collectionId.length;
      if (this.tasksFilters.dueDateRange) count++;
      return count;
    }
    return 0;
  }

  /**
   * Save filter state to chrome.storage.local
   */
  async saveFilterState() {
    try {
      await chrome.storage.local.set({
        'tabtasktick.filters.collections': this.collectionsFilters,
        'tabtasktick.filters.tasks': this.tasksFilters
      });
    } catch (error) {
      console.error('Failed to save filter state:', error);
    }
  }

  /**
   * Load filter state from chrome.storage.local
   */
  async loadFilterState() {
    try {
      const result = await chrome.storage.local.get([
        'tabtasktick.filters.collections',
        'tabtasktick.filters.tasks'
      ]);

      if (result['tabtasktick.filters.collections']) {
        this.collectionsFilters = result['tabtasktick.filters.collections'];
      }
      if (result['tabtasktick.filters.tasks']) {
        this.tasksFilters = result['tabtasktick.filters.tasks'];
      }
    } catch (error) {
      console.error('Failed to load filter state:', error);
    }
  }

  /**
   * Get current search query
   */
  getSearchQuery() {
    return this.searchQuery;
  }

  /**
   * Get current collections filters
   */
  getCollectionsFilters() {
    return { ...this.collectionsFilters };
  }

  /**
   * Get current tasks filters
   */
  getTasksFilters() {
    return { ...this.tasksFilters };
  }

  /**
   * Escape HTML for safe insertion
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Capitalize first letter
   */
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
