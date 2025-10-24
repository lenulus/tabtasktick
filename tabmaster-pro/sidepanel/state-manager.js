/**
 * Centralized UI state management for side panel
 * Coordinates loading, error, empty, and content states across views
 * NO business logic - pure UI state coordination
 */

class StateManager {
  constructor() {
    this.state = {
      // View state
      activeView: 'collections', // 'collections' | 'tasks'

      // Per-view loading states
      loading: {
        collections: false,
        tasks: false
      },

      // Per-view error states
      errors: {
        collections: null,
        tasks: null
      },

      // Per-view empty states
      empty: {
        collections: false,
        tasks: false
      },

      // Scroll positions (for restoration)
      scrollPositions: {
        collections: 0,
        tasks: 0
      }
    };

    // Listeners for state changes
    this.listeners = new Set();
  }

  // Subscribe to state changes
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Notify all listeners of state change
  _notify() {
    this.listeners.forEach(listener => listener(this.state));
  }

  // Get current state
  getState() {
    return { ...this.state };
  }

  // Set active view
  setActiveView(view) {
    if (this.state.activeView !== view) {
      // Save current scroll position
      this._saveScrollPosition();

      this.state.activeView = view;
      this._notify();

      // Restore scroll position after view renders
      requestAnimationFrame(() => this._restoreScrollPosition());
    }
  }

  // Loading states
  setLoading(view, isLoading) {
    this.state.loading[view] = isLoading;

    // Clear errors when starting to load
    if (isLoading) {
      this.state.errors[view] = null;
    }

    this._notify();
  }

  // Error states
  setError(view, error) {
    this.state.errors[view] = error;
    this.state.loading[view] = false;
    this._notify();
  }

  // Clear error
  clearError(view) {
    this.state.errors[view] = null;
    this._notify();
  }

  // Empty states
  setEmpty(view, isEmpty) {
    this.state.empty[view] = isEmpty;
    this._notify();
  }

  // State transitions

  /**
   * Transition from Loading to Success state
   * @param {string} view - View name ('collections' or 'tasks')
   * @param {boolean} hasData - Whether data was returned
   */
  transitionToSuccess(view, hasData) {
    this.state.loading[view] = false;
    this.state.errors[view] = null;
    this.state.empty[view] = !hasData;
    this._notify();
  }

  /**
   * Transition from Loading to Error state
   * @param {string} view - View name ('collections' or 'tasks')
   * @param {Error} error - Error object
   */
  transitionToError(view, error) {
    this.state.loading[view] = false;
    this.state.errors[view] = this._formatError(error);
    this._notify();
  }

  /**
   * Transition from Empty to Has Data state
   * @param {string} view - View name ('collections' or 'tasks')
   */
  transitionToHasData(view) {
    this.state.empty[view] = false;
    this._notify();
  }

  /**
   * Format error with user-friendly message and retry option
   * @private
   * @param {Error} error - Raw error object
   * @returns {Object} Formatted error with type, message, retry, and suggestion
   */
  _formatError(error) {
    // Network/connection errors
    if (error.message?.includes('Could not establish connection') ||
        error.message?.includes('Extension context invalidated')) {
      return {
        type: 'connection',
        message: 'Connection lost. The extension may have restarted.',
        retry: true,
        suggestion: 'Click Retry to reload data.'
      };
    }

    // Quota errors
    if (error.message?.includes('quota') ||
        error.message?.includes('QUOTA_EXCEEDED')) {
      return {
        type: 'quota',
        message: 'Storage full.',
        retry: false,
        suggestion: 'Delete old collections to free up space.'
      };
    }

    // Not found errors
    if (error.message?.includes('not found') ||
        error.message?.includes('does not exist')) {
      return {
        type: 'not_found',
        message: 'Item no longer exists.',
        retry: false,
        suggestion: 'It may have been deleted.'
      };
    }

    // Permission errors
    if (error.message?.includes('permission') ||
        error.message?.includes('denied')) {
      return {
        type: 'permission',
        message: 'Permission denied.',
        retry: false,
        suggestion: 'Check extension permissions in chrome://extensions'
      };
    }

    // Generic error
    return {
      type: 'unknown',
      message: error.message || 'An error occurred.',
      retry: true,
      suggestion: 'Click Retry to try again.'
    };
  }

  /**
   * Save scroll position for current view
   * @private
   */
  _saveScrollPosition() {
    const container = this._getViewContainer(this.state.activeView);
    if (container) {
      this.state.scrollPositions[this.state.activeView] = container.scrollTop;
    }
  }

  /**
   * Restore scroll position for current view
   * @private
   */
  _restoreScrollPosition() {
    const container = this._getViewContainer(this.state.activeView);
    if (container) {
      container.scrollTop = this.state.scrollPositions[this.state.activeView] || 0;
    }
  }

  /**
   * Get DOM container for a view
   * @private
   * @param {string} view - View name
   * @returns {HTMLElement|null} Container element
   */
  _getViewContainer(view) {
    if (view === 'collections') {
      return document.getElementById('collections-view');
    } else if (view === 'tasks') {
      return document.getElementById('tasks-view');
    }
    return null;
  }

  // Render helpers (for UI components to use)

  /**
   * Should show loading spinner?
   * @param {string} view - View name
   * @returns {boolean} True if loading
   */
  isLoading(view) {
    return this.state.loading[view];
  }

  /**
   * Should show error message?
   * @param {string} view - View name
   * @returns {boolean} True if has error
   */
  hasError(view) {
    return this.state.errors[view] !== null;
  }

  /**
   * Get error details
   * @param {string} view - View name
   * @returns {Object|null} Error object with type, message, retry, suggestion
   */
  getError(view) {
    return this.state.errors[view];
  }

  /**
   * Should show empty state?
   * @param {string} view - View name
   * @returns {boolean} True if empty (and not loading/error)
   */
  isEmpty(view) {
    return this.state.empty[view] && !this.state.loading[view] && !this.state.errors[view];
  }

  /**
   * Should show content?
   * @param {string} view - View name
   * @returns {boolean} True if has content (not loading/error/empty)
   */
  shouldShowContent(view) {
    return !this.state.loading[view] && !this.state.errors[view] && !this.state.empty[view];
  }

  /**
   * Get active view
   * @returns {string} Active view name
   */
  getActiveView() {
    return this.state.activeView;
  }

  /**
   * Reset state for a view (useful for testing or cleanup)
   * @param {string} view - View name
   */
  resetView(view) {
    this.state.loading[view] = false;
    this.state.errors[view] = null;
    this.state.empty[view] = false;
    this.state.scrollPositions[view] = 0;
    this._notify();
  }

  /**
   * Reset all state (useful for testing)
   */
  reset() {
    this.state = {
      activeView: 'collections',
      loading: {
        collections: false,
        tasks: false
      },
      errors: {
        collections: null,
        tasks: null
      },
      empty: {
        collections: false,
        tasks: false
      },
      scrollPositions: {
        collections: 0,
        tasks: 0
      }
    };
    this._notify();
  }
}

// Export singleton instance
export const stateManager = new StateManager();
