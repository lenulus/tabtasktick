/**
 * Keyboard Shortcuts System for Dashboard
 *
 * Handles keyboard navigation and shortcuts for power users.
 * Provides modal-aware and input-aware shortcut handling.
 */

class KeyboardShortcutsManager {
  constructor() {
    this.shortcuts = new Map();
    this.sequenceBuffer = [];
    this.sequenceTimeout = null;
    this.sequenceTimeoutMs = 1000; // 1 second for sequence completion
    this.enabled = true;
    this.focusedItemIndex = -1;
    this.focusableItems = [];

    // Initialize
    this.setupGlobalListener();
  }

  /**
   * Register a keyboard shortcut
   * @param {string} key - Key or key combination (e.g., 'n', 'Ctrl+a', 'g>c')
   * @param {Function} handler - Function to call when shortcut is triggered
   * @param {Object} options - Additional options (category, description, context)
   */
  register(key, handler, options = {}) {
    const {
      category = 'general',
      description = '',
      context = null, // null = global, or specify view name
      requireCtrl = false,
      requireMeta = false,
      requireShift = false,
      requireAlt = false
    } = options;

    const shortcut = {
      key: key.toLowerCase(),
      handler,
      category,
      description,
      context,
      requireCtrl,
      requireMeta,
      requireShift,
      requireAlt,
      isSequence: key.includes('>')
    };

    this.shortcuts.set(key.toLowerCase(), shortcut);
  }

  /**
   * Unregister a keyboard shortcut
   * @param {string} key - Key to unregister
   */
  unregister(key) {
    this.shortcuts.delete(key.toLowerCase());
  }

  /**
   * Check if a shortcut is registered
   * @param {string} key - Key to check
   * @returns {boolean}
   */
  isRegistered(key) {
    return this.shortcuts.has(key.toLowerCase());
  }

  /**
   * Get all shortcuts by category
   * @param {string} category - Category to filter by
   * @returns {Array} Array of shortcuts
   */
  getShortcutsByCategory(category) {
    const shortcuts = [];
    for (const [key, shortcut] of this.shortcuts) {
      if (shortcut.category === category) {
        shortcuts.push({ key, ...shortcut });
      }
    }
    return shortcuts;
  }

  /**
   * Get all shortcuts
   * @returns {Array} Array of all shortcuts
   */
  getAllShortcuts() {
    const shortcuts = [];
    for (const [key, shortcut] of this.shortcuts) {
      shortcuts.push({ key, ...shortcut });
    }
    return shortcuts;
  }

  /**
   * Setup global keyboard event listener
   */
  setupGlobalListener() {
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  /**
   * Handle keydown events
   * @param {KeyboardEvent} e - Keyboard event
   */
  handleKeyDown(e) {
    if (!this.enabled) return;

    // Check if we should ignore this event
    if (this.shouldIgnoreEvent(e)) return;

    const key = e.key.toLowerCase();
    const hasCtrl = e.ctrlKey;
    const hasMeta = e.metaKey;
    const hasShift = e.shiftKey;
    const hasAlt = e.altKey;

    // Handle sequence shortcuts (e.g., 'g>c' for go to collections)
    if (this.sequenceBuffer.length > 0) {
      this.handleSequence(key, e);
      return;
    }

    // Check for sequence start
    if (this.isSequenceStart(key)) {
      this.startSequence(key);
      e.preventDefault();
      return;
    }

    // Check for direct shortcuts
    const shortcut = this.findMatchingShortcut(key, hasCtrl, hasMeta, hasShift, hasAlt);
    if (shortcut) {
      e.preventDefault();
      shortcut.handler(e);
    }
  }

  /**
   * Check if event should be ignored (typing in input, modal open, etc.)
   * @param {KeyboardEvent} e - Keyboard event
   * @returns {boolean}
   */
  shouldIgnoreEvent(e) {
    const target = e.target;
    const tagName = target.tagName.toLowerCase();

    // Ignore if typing in input or textarea
    if (tagName === 'input' || tagName === 'textarea' || target.isContentEditable) {
      // Except for Escape key (always allow)
      return e.key !== 'Escape';
    }

    // Ignore if modal is open (except for shortcuts that work in modals)
    const modalOpen = document.querySelector('.modal.show') !== null;
    if (modalOpen && e.key !== 'Escape') {
      return true;
    }

    return false;
  }

  /**
   * Check if key is the start of a sequence
   * @param {string} key - Key pressed
   * @returns {boolean}
   */
  isSequenceStart(key) {
    // Check if any registered shortcut starts with this key
    for (const [shortcutKey] of this.shortcuts) {
      if (shortcutKey.includes('>') && shortcutKey.startsWith(key + '>')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Start a key sequence
   * @param {string} key - First key in sequence
   */
  startSequence(key) {
    this.sequenceBuffer = [key];

    // Clear any existing timeout
    if (this.sequenceTimeout) {
      clearTimeout(this.sequenceTimeout);
    }

    // Set timeout to clear sequence buffer
    this.sequenceTimeout = setTimeout(() => {
      this.sequenceBuffer = [];
    }, this.sequenceTimeoutMs);
  }

  /**
   * Handle sequence continuation
   * @param {string} key - Next key in sequence
   * @param {KeyboardEvent} e - Keyboard event
   */
  handleSequence(key, e) {
    this.sequenceBuffer.push(key);
    const sequenceKey = this.sequenceBuffer.join('>');

    // Check if this completes a sequence
    const shortcut = this.shortcuts.get(sequenceKey);
    if (shortcut) {
      e.preventDefault();
      shortcut.handler(e);
      this.sequenceBuffer = [];
      clearTimeout(this.sequenceTimeout);
      return;
    }

    // Check if this could be part of a longer sequence
    const couldBeLonger = Array.from(this.shortcuts.keys()).some(
      k => k.startsWith(sequenceKey + '>')
    );

    if (!couldBeLonger) {
      // Not a valid sequence, clear buffer
      this.sequenceBuffer = [];
      clearTimeout(this.sequenceTimeout);
    }
  }

  /**
   * Find a matching shortcut
   * @param {string} key - Key pressed
   * @param {boolean} hasCtrl - Ctrl key pressed
   * @param {boolean} hasMeta - Meta key pressed
   * @param {boolean} hasShift - Shift key pressed
   * @param {boolean} hasAlt - Alt key pressed
   * @returns {Object|null} Matching shortcut or null
   */
  findMatchingShortcut(key, hasCtrl, hasMeta, hasShift, hasAlt) {
    const currentView = this.getCurrentView();

    for (const [shortcutKey, shortcut] of this.shortcuts) {
      // Skip sequence shortcuts
      if (shortcut.isSequence) continue;

      // Check if key matches
      if (shortcut.key !== key) continue;

      // Check modifiers
      if (shortcut.requireCtrl && !hasCtrl) continue;
      if (shortcut.requireMeta && !hasMeta) continue;
      if (shortcut.requireShift && !hasShift) continue;
      if (shortcut.requireAlt && !hasAlt) continue;

      // Check context (view-specific shortcuts)
      if (shortcut.context && shortcut.context !== currentView) continue;

      return shortcut;
    }

    return null;
  }

  /**
   * Get current view
   * @returns {string} Current view name
   */
  getCurrentView() {
    const activeView = document.querySelector('.view.active');
    return activeView ? activeView.id : null;
  }

  /**
   * Enable keyboard shortcuts
   */
  enable() {
    this.enabled = true;
  }

  /**
   * Disable keyboard shortcuts
   */
  disable() {
    this.enabled = false;
  }

  /**
   * Clear all shortcuts
   */
  clear() {
    this.shortcuts.clear();
  }

  /**
   * Navigate focusable items with arrow keys
   * @param {string} direction - 'up' or 'down'
   */
  navigateFocusable(direction) {
    if (this.focusableItems.length === 0) return;

    if (direction === 'down') {
      this.focusedItemIndex = Math.min(
        this.focusedItemIndex + 1,
        this.focusableItems.length - 1
      );
    } else if (direction === 'up') {
      this.focusedItemIndex = Math.max(this.focusedItemIndex - 1, 0);
    }

    this.updateFocusRing();
  }

  /**
   * Update focus ring on current focused item
   */
  updateFocusRing() {
    // Remove focus from all items
    this.focusableItems.forEach(item => {
      item.classList.remove('keyboard-focused');
      this.removeTooltip(item);
    });

    // Add focus to current item
    if (this.focusedItemIndex >= 0 && this.focusedItemIndex < this.focusableItems.length) {
      const item = this.focusableItems[this.focusedItemIndex];
      item.classList.add('keyboard-focused');
      item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

      // Add tooltip hint
      this.addTooltip(item);
    }
  }

  /**
   * Add keyboard tooltip to focused item
   * @param {Element} item - DOM element to add tooltip to
   */
  addTooltip(item) {
    // Don't add tooltip if one already exists
    if (item.querySelector('.keyboard-tooltip')) return;

    const tooltip = document.createElement('div');
    tooltip.className = 'keyboard-tooltip';
    tooltip.textContent = 'Press Enter to open • Space to select';
    item.style.position = 'relative';
    item.appendChild(tooltip);
  }

  /**
   * Remove keyboard tooltip from item
   * @param {Element} item - DOM element to remove tooltip from
   */
  removeTooltip(item) {
    const tooltip = item.querySelector('.keyboard-tooltip');
    if (tooltip) {
      tooltip.remove();
    }
  }

  /**
   * Set focusable items for arrow key navigation
   * @param {Array} items - Array of DOM elements
   */
  setFocusableItems(items) {
    this.focusableItems = Array.from(items);
    this.focusedItemIndex = -1;
  }

  /**
   * Get currently focused item
   * @returns {Element|null}
   */
  getFocusedItem() {
    if (this.focusedItemIndex >= 0 && this.focusedItemIndex < this.focusableItems.length) {
      return this.focusableItems[this.focusedItemIndex];
    }
    return null;
  }

  /**
   * Clear focused item
   */
  clearFocus() {
    this.focusableItems.forEach(item => {
      item.classList.remove('keyboard-focused');
    });
    this.focusedItemIndex = -1;
  }

  /**
   * Show transient toast notification for shortcut use
   * @param {string} message - Message to display (e.g., "Task created (n)")
   * @param {number} duration - Duration in ms (default 2000)
   */
  showShortcutToast(message, duration = 2000) {
    // Create toast container if it doesn't exist
    let container = document.getElementById('keyboard-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'keyboard-toast-container';
      container.className = 'keyboard-toast-container';
      document.body.appendChild(container);
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = 'keyboard-toast';
    toast.textContent = message;
    container.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after duration
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}

// Create global instance
const keyboardShortcuts = new KeyboardShortcutsManager();

// Export
export default keyboardShortcuts;
export { KeyboardShortcutsManager };
