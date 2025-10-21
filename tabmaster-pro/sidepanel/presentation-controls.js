/**
 * Presentation Controls Component
 *
 * Pure UI component for Group By / Sort By controls
 * - Always-visible controls at top of tasks view
 * - Group By dropdown: Collection, Priority, Status, None
 * - Sort By dropdown: Priority, Due Date, Created, Alpha
 * - Sort Direction toggle: ↑ Ascending / ↓ Descending
 * - State persistence to chrome.storage.local
 * - NO business logic - just UI state management
 */

export class PresentationControls {
  constructor() {
    // Presentation state (defaults from design doc)
    this.groupBy = 'collection';     // 'collection' | 'priority' | 'status' | 'none'
    this.sortBy = 'priority';        // 'priority' | 'dueDate' | 'created' | 'alpha'
    this.sortDirection = 'desc';     // 'asc' | 'desc'

    // Event callbacks
    this.onGroupByChange = null;
    this.onSortByChange = null;
    this.onSortDirectionChange = null;
  }

  /**
   * Initialize the presentation controls UI
   */
  async init() {
    await this.loadState();
    this.render();
    this.setupEventListeners();
  }

  /**
   * Render the presentation controls UI
   */
  render() {
    const container = document.getElementById('presentation-controls');
    if (!container) return;

    const html = `
      <div class="presentation-controls">
        <div class="control-group">
          <label class="control-label" for="group-by-select">Group By:</label>
          <select id="group-by-select" class="control-select" aria-label="Group tasks by">
            <option value="collection" ${this.groupBy === 'collection' ? 'selected' : ''}>Collection</option>
            <option value="priority" ${this.groupBy === 'priority' ? 'selected' : ''}>Priority</option>
            <option value="status" ${this.groupBy === 'status' ? 'selected' : ''}>Status</option>
            <option value="none" ${this.groupBy === 'none' ? 'selected' : ''}>None</option>
          </select>
        </div>

        <div class="control-group">
          <label class="control-label" for="sort-by-select">Sort By:</label>
          <select id="sort-by-select" class="control-select" aria-label="Sort tasks by">
            <option value="priority" ${this.sortBy === 'priority' ? 'selected' : ''}>Priority</option>
            <option value="dueDate" ${this.sortBy === 'dueDate' ? 'selected' : ''}>Due Date</option>
            <option value="created" ${this.sortBy === 'created' ? 'selected' : ''}>Created</option>
            <option value="alpha" ${this.sortBy === 'alpha' ? 'selected' : ''}>Alpha</option>
          </select>
        </div>

        <div class="control-group">
          <button
            id="sort-direction-toggle"
            class="sort-direction-btn"
            aria-label="Toggle sort direction"
            title="${this.sortDirection === 'asc' ? 'Ascending' : 'Descending'}"
          >
            ${this.sortDirection === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  /**
   * Setup event listeners for controls
   */
  setupEventListeners() {
    // Group By dropdown
    const groupBySelect = document.getElementById('group-by-select');
    if (groupBySelect) {
      groupBySelect.addEventListener('change', async (e) => {
        const newGroupBy = e.target.value;
        if (newGroupBy !== this.groupBy) {
          this.groupBy = newGroupBy;
          await this.saveState();
          if (this.onGroupByChange) {
            this.onGroupByChange(this.groupBy);
          }
        }
      });
    }

    // Sort By dropdown
    const sortBySelect = document.getElementById('sort-by-select');
    if (sortBySelect) {
      sortBySelect.addEventListener('change', async (e) => {
        const newSortBy = e.target.value;
        if (newSortBy !== this.sortBy) {
          this.sortBy = newSortBy;
          await this.saveState();
          if (this.onSortByChange) {
            this.onSortByChange(this.sortBy);
          }
        }
      });
    }

    // Sort Direction toggle button
    const sortDirectionBtn = document.getElementById('sort-direction-toggle');
    if (sortDirectionBtn) {
      sortDirectionBtn.addEventListener('click', async () => {
        // Toggle direction
        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';

        // Update button UI
        sortDirectionBtn.textContent = this.sortDirection === 'asc' ? '↑' : '↓';
        sortDirectionBtn.title = this.sortDirection === 'asc' ? 'Ascending' : 'Descending';

        await this.saveState();
        if (this.onSortDirectionChange) {
          this.onSortDirectionChange(this.sortDirection);
        }
      });
    }
  }

  /**
   * Save presentation state to chrome.storage.local
   */
  async saveState() {
    try {
      await chrome.storage.local.set({
        'tabtasktick.tasks.groupBy': this.groupBy,
        'tabtasktick.tasks.sortBy': this.sortBy,
        'tabtasktick.tasks.sortDirection': this.sortDirection
      });
    } catch (error) {
      console.error('Failed to save presentation state:', error);
    }
  }

  /**
   * Load presentation state from chrome.storage.local
   */
  async loadState() {
    try {
      const result = await chrome.storage.local.get([
        'tabtasktick.tasks.groupBy',
        'tabtasktick.tasks.sortBy',
        'tabtasktick.tasks.sortDirection'
      ]);

      // Load saved state or use defaults
      this.groupBy = result['tabtasktick.tasks.groupBy'] || 'collection';
      this.sortBy = result['tabtasktick.tasks.sortBy'] || 'priority';
      this.sortDirection = result['tabtasktick.tasks.sortDirection'] || 'desc';
    } catch (error) {
      console.error('Failed to load presentation state:', error);
      // Keep defaults if load fails
    }
  }

  /**
   * Get current groupBy value
   * @returns {string} 'collection' | 'priority' | 'status' | 'none'
   */
  getGroupBy() {
    return this.groupBy;
  }

  /**
   * Get current sortBy value
   * @returns {string} 'priority' | 'dueDate' | 'created' | 'alpha'
   */
  getSortBy() {
    return this.sortBy;
  }

  /**
   * Get current sortDirection value
   * @returns {string} 'asc' | 'desc'
   */
  getSortDirection() {
    return this.sortDirection;
  }

  /**
   * Get all presentation options as object
   * @returns {Object} { groupBy, sortBy, sortDirection }
   */
  getPresentationOptions() {
    return {
      groupBy: this.groupBy,
      sortBy: this.sortBy,
      sortDirection: this.sortDirection
    };
  }
}
