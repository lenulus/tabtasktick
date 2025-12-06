// Tasks Filters Module
// Manages filter UI state and persistence for tasks view

import { debounce } from '../core/utils.js';
import state from '../core/state.js';

export class TasksFilters {
  constructor() {
    this.filters = {
      search: '',
      status: [],
      priority: [],
      collection: []
    };
    this.onFiltersChange = null;
    this.initialized = false;
  }

  /**
   * Initialize the filters UI
   */
  async init() {
    if (this.initialized) return;

    // Load saved filter state
    await this.loadFilterState();

    // Setup event listeners
    this.setupSearchInput();
    this.setupToggleButton();
    this.setupClearButton();
    this.setupFilterCheckboxes();
    this.setupCollectionFilter();

    // Apply initial state to UI
    this.applyFilterStateToUI();

    this.initialized = true;
  }

  /**
   * Setup search input with debouncing
   */
  setupSearchInput() {
    const searchInput = document.getElementById('searchTasks');
    if (!searchInput) return;

    const debouncedSearch = debounce((value) => {
      this.filters.search = value.toLowerCase();
      this.saveFilterState();
      this.triggerFilterChange();
    }, 300);

    searchInput.addEventListener('input', (e) => {
      debouncedSearch(e.target.value);
    });

    // Set initial value
    searchInput.value = this.filters.search;
  }

  /**
   * Setup toggle filters button
   */
  setupToggleButton() {
    const toggleBtn = document.getElementById('toggleTasksFilters');
    const filterPanel = document.getElementById('tasksFilterPanel');

    if (!toggleBtn || !filterPanel) return;

    toggleBtn.addEventListener('click', () => {
      const isVisible = filterPanel.style.display !== 'none';
      filterPanel.style.display = isVisible ? 'none' : 'block';
    });
  }

  /**
   * Setup clear filters button
   */
  setupClearButton() {
    const clearBtn = document.getElementById('clearTasksFilters');
    if (!clearBtn) return;

    clearBtn.addEventListener('click', () => {
      this.clearFilters();
    });
  }

  /**
   * Setup filter checkboxes (status and priority)
   */
  setupFilterCheckboxes() {
    const filterPanel = document.getElementById('tasksFilterPanel');
    if (!filterPanel) return;

    // Status checkboxes
    filterPanel.querySelectorAll('[data-filter="status"]').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        this.handleCheckboxChange('status', checkbox.value, checkbox.checked);
      });
    });

    // Priority checkboxes
    filterPanel.querySelectorAll('[data-filter="priority"]').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        this.handleCheckboxChange('priority', checkbox.value, checkbox.checked);
      });
    });
  }

  /**
   * Setup collection multi-select
   */
  setupCollectionFilter() {
    const collectionSelect = document.getElementById('tasksCollectionFilter');
    if (!collectionSelect) return;

    collectionSelect.addEventListener('change', () => {
      const selectedOptions = Array.from(collectionSelect.selectedOptions);
      this.filters.collection = selectedOptions.map(opt => opt.value);
      this.saveFilterState();
      this.updateFilterBadge();
      this.triggerFilterChange();
    });
  }

  /**
   * Handle checkbox change
   */
  handleCheckboxChange(filterType, value, checked) {
    if (checked) {
      if (!this.filters[filterType].includes(value)) {
        this.filters[filterType].push(value);
      }
    } else {
      this.filters[filterType] = this.filters[filterType].filter(v => v !== value);
    }

    this.saveFilterState();
    this.updateFilterBadge();
    this.triggerFilterChange();
  }

  /**
   * Populate collection dropdown with available collections
   */
  populateCollections(collections) {
    const collectionSelect = document.getElementById('tasksCollectionFilter');
    if (!collectionSelect) return;

    // Keep "Uncategorized" option, add collections
    const options = ['<option value="">Uncategorized</option>'];

    collections.forEach(collection => {
      const isSelected = this.filters.collection.includes(collection.id);
      options.push(`
        <option value="${this.escapeHtml(collection.id)}" ${isSelected ? 'selected' : ''}>
          ${this.escapeHtml(collection.name || 'Unnamed')}
        </option>
      `);
    });

    collectionSelect.innerHTML = options.join('');
  }

  /**
   * Clear all filters
   */
  clearFilters() {
    // Reset filters
    this.filters = {
      search: '',
      status: [],
      priority: [],
      collection: []
    };

    // Update UI
    this.applyFilterStateToUI();

    // Save and trigger
    this.saveFilterState();
    this.updateFilterBadge();
    this.triggerFilterChange();
  }

  /**
   * Apply filter state to UI elements
   */
  applyFilterStateToUI() {
    // Search input
    const searchInput = document.getElementById('searchTasks');
    if (searchInput) {
      searchInput.value = this.filters.search;
    }

    // Status checkboxes
    const filterPanel = document.getElementById('tasksFilterPanel');
    if (filterPanel) {
      filterPanel.querySelectorAll('[data-filter="status"]').forEach(checkbox => {
        checkbox.checked = this.filters.status.includes(checkbox.value);
      });

      filterPanel.querySelectorAll('[data-filter="priority"]').forEach(checkbox => {
        checkbox.checked = this.filters.priority.includes(checkbox.value);
      });
    }

    // Collection select
    const collectionSelect = document.getElementById('tasksCollectionFilter');
    if (collectionSelect) {
      Array.from(collectionSelect.options).forEach(option => {
        option.selected = this.filters.collection.includes(option.value);
      });
    }

    this.updateFilterBadge();
  }

  /**
   * Update filter count badge
   */
  updateFilterBadge() {
    const count = this.getActiveFilterCount();
    const badge = document.getElementById('tasksFilterCount');
    const clearBtn = document.getElementById('clearTasksFilters');

    if (badge) {
      if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }

    if (clearBtn) {
      clearBtn.style.display = count > 0 ? 'inline-flex' : 'none';
    }
  }

  /**
   * Get count of active filters
   */
  getActiveFilterCount() {
    let count = 0;
    if (this.filters.search) count++;
    count += this.filters.status.length;
    count += this.filters.priority.length;
    count += this.filters.collection.length;
    return count;
  }

  /**
   * Get current filters
   */
  getFilters() {
    return { ...this.filters };
  }

  /**
   * Trigger filter change callback
   */
  triggerFilterChange() {
    if (this.onFiltersChange) {
      this.onFiltersChange(this.filters);
    }
  }

  /**
   * Save filter state to localStorage
   */
  async saveFilterState() {
    try {
      const key = 'tabtasktick.dashboard.tasksFilters';
      await chrome.storage.local.set({ [key]: this.filters });
    } catch (error) {
      console.error('Failed to save filter state:', error);
    }
  }

  /**
   * Load filter state from localStorage
   */
  async loadFilterState() {
    try {
      const key = 'tabtasktick.dashboard.tasksFilters';
      const result = await chrome.storage.local.get(key);

      if (result[key]) {
        this.filters = { ...this.filters, ...result[key] };
      }
    } catch (error) {
      console.error('Failed to load filter state:', error);
    }
  }

  /**
   * Escape HTML for safe insertion
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
