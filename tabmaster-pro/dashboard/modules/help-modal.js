/**
 * Keyboard Shortcuts Help Modal
 *
 * Shows all available keyboard shortcuts with search functionality
 */

import keyboardShortcuts from './keyboard-shortcuts.js';

class KeyboardShortcutsHelpModal {
  constructor() {
    this.modal = null;
    this.searchInput = null;
    this.shortcutsList = null;
    this.allShortcuts = [];
    this.init();
  }

  /**
   * Initialize the help modal
   */
  init() {
    this.createModal();
    this.attachEventListeners();
  }

  /**
   * Create the modal DOM structure
   */
  createModal() {
    const modalHtml = `
      <div class="modal keyboard-shortcuts-modal"
           id="keyboardShortcutsModal"
           role="dialog"
           aria-modal="true"
           aria-labelledby="keyboard-shortcuts-title">
        <div class="modal-content modal-lg">
          <div class="modal-header">
            <h3 id="keyboard-shortcuts-title">Keyboard Shortcuts</h3>
            <button class="close-btn"
                    id="closeKeyboardShortcutsModal"
                    aria-label="Close keyboard shortcuts help">&times;</button>
          </div>
          <div class="modal-body">
            <div class="shortcuts-search">
              <input
                type="text"
                id="shortcutsSearch"
                placeholder="Search shortcuts..."
                class="search-input"
                aria-label="Search keyboard shortcuts"
              >
            </div>
            <div class="shortcuts-container"
                 id="shortcutsContainer"
                 role="region"
                 aria-label="Keyboard shortcuts list">
              <!-- Shortcuts will be populated here -->
            </div>
          </div>
        </div>
      </div>
    `;

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Get references
    this.modal = document.getElementById('keyboardShortcutsModal');
    this.searchInput = document.getElementById('shortcutsSearch');
    this.shortcutsContainer = document.getElementById('shortcutsContainer');

    // Store focusable elements for focus trap
    this.focusableElements = null;
    this.firstFocusableElement = null;
    this.lastFocusableElement = null;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Close button
    const closeBtn = document.getElementById('closeKeyboardShortcutsModal');
    closeBtn.addEventListener('click', () => this.hide());

    // Search input
    this.searchInput.addEventListener('input', (e) => {
      this.filterShortcuts(e.target.value);
    });

    // Click outside to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.hide();
      }
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal.classList.contains('show')) {
        this.hide();
      }
    });

    // Focus trap - Tab key handling
    this.modal.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && this.modal.classList.contains('show')) {
        this.handleTabKey(e);
      }
    });
  }

  /**
   * Handle Tab key for focus trap
   * @param {KeyboardEvent} e - Keyboard event
   */
  handleTabKey(e) {
    if (!this.firstFocusableElement || !this.lastFocusableElement) return;

    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === this.firstFocusableElement) {
        e.preventDefault();
        this.lastFocusableElement.focus();
      }
    } else {
      // Tab
      if (document.activeElement === this.lastFocusableElement) {
        e.preventDefault();
        this.firstFocusableElement.focus();
      }
    }
  }

  /**
   * Show the help modal
   */
  show() {
    // Save currently focused element to restore later
    this.previouslyFocusedElement = document.activeElement;

    // Load shortcuts
    this.loadShortcuts();

    // Render shortcuts
    this.renderShortcuts(this.allShortcuts);

    // Show modal
    this.modal.classList.add('show');

    // Setup focus trap
    this.setupFocusTrap();

    // Focus search input
    setTimeout(() => {
      this.searchInput.focus();
    }, 100);
  }

  /**
   * Hide the help modal
   */
  hide() {
    this.modal.classList.remove('show');
    this.searchInput.value = '';

    // Restore focus to previously focused element
    if (this.previouslyFocusedElement) {
      this.previouslyFocusedElement.focus();
      this.previouslyFocusedElement = null;
    }
  }

  /**
   * Setup focus trap for the modal
   */
  setupFocusTrap() {
    // Get all focusable elements in the modal
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    this.focusableElements = this.modal.querySelectorAll(focusableSelector);

    if (this.focusableElements.length > 0) {
      this.firstFocusableElement = this.focusableElements[0];
      this.lastFocusableElement = this.focusableElements[this.focusableElements.length - 1];
    }
  }

  /**
   * Load shortcuts from the keyboard shortcuts manager
   */
  loadShortcuts() {
    this.allShortcuts = keyboardShortcuts.getAllShortcuts();
  }

  /**
   * Render shortcuts
   * @param {Array} shortcuts - Array of shortcuts to render
   */
  renderShortcuts(shortcuts) {
    if (shortcuts.length === 0) {
      this.shortcutsContainer.innerHTML = `
        <div class="empty-state" style="padding: 40px; text-align: center;">
          <p>No shortcuts found</p>
        </div>
      `;
      return;
    }

    // Group shortcuts by category
    const grouped = this.groupByCategory(shortcuts);

    // Render each category
    let html = '';
    for (const [category, categoryShortcuts] of Object.entries(grouped)) {
      html += this.renderCategory(category, categoryShortcuts);
    }

    this.shortcutsContainer.innerHTML = html;
  }

  /**
   * Group shortcuts by category
   * @param {Array} shortcuts - Array of shortcuts
   * @returns {Object} Shortcuts grouped by category
   */
  groupByCategory(shortcuts) {
    const grouped = {};

    shortcuts.forEach(shortcut => {
      const category = shortcut.category || 'general';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(shortcut);
    });

    // Sort categories
    const categoryOrder = ['navigation', 'tasks', 'collections', 'general'];
    const sorted = {};
    categoryOrder.forEach(cat => {
      if (grouped[cat]) {
        sorted[cat] = grouped[cat];
      }
    });

    // Add any remaining categories
    for (const [cat, shortcuts] of Object.entries(grouped)) {
      if (!sorted[cat]) {
        sorted[cat] = shortcuts;
      }
    }

    return sorted;
  }

  /**
   * Render a category of shortcuts
   * @param {string} category - Category name
   * @param {Array} shortcuts - Array of shortcuts in this category
   * @returns {string} HTML string
   */
  renderCategory(category, shortcuts) {
    const categoryTitle = this.formatCategoryTitle(category);

    const shortcutsHtml = shortcuts.map(shortcut => {
      return this.renderShortcut(shortcut);
    }).join('');

    return `
      <div class="shortcuts-category">
        <h4 class="category-title">${categoryTitle}</h4>
        <div class="shortcuts-list">
          ${shortcutsHtml}
        </div>
      </div>
    `;
  }

  /**
   * Render a single shortcut
   * @param {Object} shortcut - Shortcut object
   * @returns {string} HTML string
   */
  renderShortcut(shortcut) {
    const keys = this.formatShortcutKeys(shortcut.key, shortcut);
    const description = shortcut.description || 'No description';
    const context = shortcut.context ? ` <span class="shortcut-context">(${shortcut.context})</span>` : '';

    return `
      <div class="shortcut-item">
        <div class="shortcut-keys">
          ${keys}
        </div>
        <div class="shortcut-description">
          ${description}${context}
        </div>
      </div>
    `;
  }

  /**
   * Format shortcut keys for display
   * @param {string} key - Key combination
   * @param {Object} shortcut - Shortcut object with modifier flags
   * @returns {string} Formatted HTML string
   */
  formatShortcutKeys(key, shortcut) {
    const parts = [];

    // Add modifier keys
    if (shortcut.requireCtrl) parts.push('Ctrl');
    if (shortcut.requireMeta) parts.push('⌘');
    if (shortcut.requireShift) parts.push('Shift');
    if (shortcut.requireAlt) parts.push('Alt');

    // Handle sequences (e.g., 'g>c')
    if (key.includes('>')) {
      const sequenceKeys = key.split('>');
      sequenceKeys.forEach((k, i) => {
        parts.push(k.toUpperCase());
        if (i < sequenceKeys.length - 1) {
          parts.push('then');
        }
      });
    } else {
      // Add main key
      parts.push(this.formatKeyName(key));
    }

    // Render as keyboard keys
    return parts.map((part, i) => {
      if (part === 'then') {
        return '<span class="key-separator">then</span>';
      }
      return `<kbd class="keyboard-key">${part}</kbd>`;
    }).join(' ');
  }

  /**
   * Format key name for display
   * @param {string} key - Key name
   * @returns {string} Formatted key name
   */
  formatKeyName(key) {
    const keyMap = {
      'arrowup': '↑',
      'arrowdown': '↓',
      'arrowleft': '←',
      'arrowright': '→',
      'escape': 'Esc',
      'enter': 'Enter',
      'space': 'Space',
      'delete': 'Del',
      'backspace': 'Backspace',
      '/': '/',
      '?': '?'
    };

    return keyMap[key.toLowerCase()] || key.toUpperCase();
  }

  /**
   * Format category title
   * @param {string} category - Category name
   * @returns {string} Formatted category title
   */
  formatCategoryTitle(category) {
    const titleMap = {
      navigation: 'Navigation',
      tasks: 'Tasks',
      collections: 'Collections',
      general: 'General'
    };

    return titleMap[category] || category.charAt(0).toUpperCase() + category.slice(1);
  }

  /**
   * Filter shortcuts based on search query
   * @param {string} query - Search query
   */
  filterShortcuts(query) {
    if (!query.trim()) {
      this.renderShortcuts(this.allShortcuts);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const filtered = this.allShortcuts.filter(shortcut => {
      const keyMatch = shortcut.key.toLowerCase().includes(lowerQuery);
      const descMatch = shortcut.description.toLowerCase().includes(lowerQuery);
      const categoryMatch = shortcut.category.toLowerCase().includes(lowerQuery);

      return keyMatch || descMatch || categoryMatch;
    });

    this.renderShortcuts(filtered);
  }
}

// Create and export instance
const helpModal = new KeyboardShortcutsHelpModal();

export default helpModal;
export { KeyboardShortcutsHelpModal };
