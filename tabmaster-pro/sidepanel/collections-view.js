/**
 * Collections View Component
 *
 * THIN component - all business logic via message passing to background
 * Renders collection cards with:
 * - Active/Saved grouping
 * - Collection metadata (icon, name, description, counts)
 * - Action buttons (Focus/Open, View Tasks, Edit, Close)
 * - Real-time updates from background messages
 */

import { notifications } from './components/notification.js';
import { modal } from './components/modal.js';
import { EmojiPicker } from './components/emoji-picker.js';
import {
  exportCollection as exportCollectionService,
  formatExportSuccessMessage
} from '../services/utils/collection-import-export-ui.js';
import { handleCollectionOpened, handleCollectionClosed } from '../services/execution/CollectionFilterService.js';

export class CollectionsView {
  constructor(controller) {
    this.controller = controller;
    this.activeContainer = null;
    this.savedContainer = null;
    this.eventListenersAttached = false; // Track if event listeners are already attached
  }

  /**
   * Initialize the view
   */
  init() {
    this.activeContainer = document.getElementById('active-collections');
    this.savedContainer = document.getElementById('saved-collections');

    if (!this.activeContainer || !this.savedContainer) {
      console.error('Collections view containers not found');
    }

    // Attach event listeners once during initialization
    this.attachEventListeners();
  }

  /**
   * Render collections
   * @param {Array} collections - Already filtered and sorted by panel.js
   * @param {Object} options - Rendering options
   * @param {string} options.stateFilter - Current state filter ('all', 'active', 'saved')
   */
  render(collections, options = {}) {
    if (!collections || collections.length === 0) {
      this.renderEmpty();
      return;
    }

    // Always separate active and saved collections for proper section rendering
    // The stateFilter is applied earlier in panel.js filterCollections()
    // So collections array here is already filtered - we just need to group them
    const active = collections.filter(c => c.isActive);
    const saved = collections.filter(c => !c.isActive);

    // Update counts
    this.updateCounts(active.length, saved.length);

    // Render cards
    this.renderCollectionGroup(this.activeContainer, active);
    this.renderCollectionGroup(this.savedContainer, saved);
  }

  /**
   * Update collection counts
   */
  updateCounts(activeCount, savedCount) {
    const activeCountEl = document.getElementById('active-count');
    const savedCountEl = document.getElementById('saved-count');

    if (activeCountEl) activeCountEl.textContent = activeCount;
    if (savedCountEl) savedCountEl.textContent = savedCount;
  }

  /**
   * Render empty state
   */
  renderEmpty() {
    this.updateCounts(0, 0);
    if (this.activeContainer) this.activeContainer.innerHTML = '';
    if (this.savedContainer) this.savedContainer.innerHTML = '';
  }

  /**
   * Render a group of collections
   */
  renderCollectionGroup(container, collections) {
    if (!container) return;

    if (collections.length === 0) {
      container.innerHTML = '';
      return;
    }

    // Collections are already sorted by panel.js (via sortCollections method)
    // Respect the controller's sort order - DO NOT re-sort here
    container.innerHTML = collections.map(c => this.renderCollectionCard(c)).join('');

    // Event listeners are attached once in init() - no need to re-attach here
  }

  /**
   * Render a single collection card
   */
  renderCollectionCard(collection) {
    const icon = collection.icon || '📁';
    const name = this.escapeHtml(collection.name || 'Untitled Collection');
    const description = collection.description
      ? this.escapeHtml(collection.description)
      : '';

    // Check individual collection's active status
    const isActive = collection.isActive;

    // Get metadata counts (will be implemented in Phase 6 with proper counting)
    const tabCount = collection.metadata?.tabCount || 0;
    const folderCount = collection.metadata?.folderCount || 0;

    // Format last accessed time
    const lastAccessed = this.formatRelativeTime(collection.metadata?.lastAccessed || collection.createdAt);

    // Window info for active collections
    const windowInfo = isActive && collection.windowId
      ? `<span class="window-badge">Window #${collection.windowId}</span>`
      : '';

    return `
      <div class="collection-card" data-collection-id="${collection.id}">
        <div class="collection-header">
          <div class="collection-icon">${icon}</div>
          <div class="collection-info">
            <div class="collection-title">
              ${isActive ? '<span class="active-indicator">🟢</span>' : ''}
              <h3 class="collection-name">${name}</h3>
              ${windowInfo}
            </div>
            ${description ? `<p class="collection-description">${description}</p>` : ''}
          </div>
        </div>

        <div class="collection-meta">
          <span class="meta-item" title="Tabs">
            <span class="meta-icon">📄</span>
            <span class="meta-value">${tabCount}</span>
          </span>
          <span class="meta-item" title="Folders">
            <span class="meta-icon">📂</span>
            <span class="meta-value">${folderCount}</span>
          </span>
          <span class="meta-item meta-time" title="Last accessed">
            <span class="meta-icon">🕒</span>
            <span class="meta-value">${lastAccessed}</span>
          </span>
        </div>

        ${collection.tags && collection.tags.length > 0 ? `
          <div class="collection-tags">
            ${collection.tags.slice(0, 3).map(tag =>
              `<span class="tag">${this.escapeHtml(tag)}</span>`
            ).join('')}
            ${collection.tags.length > 3 ? `<span class="tag-more">+${collection.tags.length - 3}</span>` : ''}
          </div>
        ` : ''}

        <div class="collection-actions">
          <button class="btn btn-primary btn-sm action-view-details" data-action="view-details">
            👁️ View Details
          </button>
          ${isActive ? `
            <button class="btn btn-secondary btn-sm action-focus" data-action="focus">
              Focus Window
            </button>
          ` : `
            <button class="btn btn-secondary btn-sm action-open" data-action="open">
              📂 Open
            </button>
          `}
          <button class="btn btn-secondary btn-sm action-edit" data-action="edit">
            ✏️ Edit
          </button>
          ${isActive ? `
            <button class="btn btn-secondary btn-sm action-close" data-action="close">
              ❌ Close
            </button>
          ` : ''}
          <button class="btn btn-danger btn-sm action-delete" data-action="delete">
            🗑️ Delete
          </button>
          <button class="btn btn-secondary btn-sm action-export" data-action="export" title="Export this collection">
            💾 Export
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners to collection cards
   */
  attachEventListeners(container) {
    // Only attach listeners once to prevent duplicate handlers
    if (this.eventListenersAttached) {
      return;
    }
    this.eventListenersAttached = true;

    // Use event delegation on the parent containers instead of each render
    const attachToContainer = (cnt) => {
      if (!cnt) return;
      cnt.addEventListener('click', async (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const card = button.closest('.collection-card');
        if (!card) return;

        const collectionId = card.dataset.collectionId;
        const action = button.dataset.action;

        switch (action) {
          case 'view-details':
            await this.handleViewDetails(collectionId);
            break;
          case 'focus':
            await this.handleFocusWindow(collectionId);
            break;
          case 'open':
            await this.handleOpenCollection(collectionId);
            break;
          case 'tasks':
            await this.handleViewTasks(collectionId);
            break;
          case 'edit':
            await this.handleEditCollection(collectionId);
            break;
          case 'close':
            await this.handleCloseCollection(collectionId);
            break;
          case 'delete':
            await this.handleDeleteCollection(collectionId);
            break;
          case 'export':
            await this.handleExportCollection(collectionId);
            break;
        }
      });
    };

    // Attach to both containers once
    attachToContainer(this.activeContainer);
    attachToContainer(this.savedContainer);
  }

  /**
   * Handle view details action
   */
  async handleViewDetails(collectionId) {
    try {
      // Notify controller to show detail view
      if (this.controller.collectionDetailView) {
        await this.controller.collectionDetailView.show(collectionId);
      } else {
        notifications.error('Detail view not available');
      }
    } catch (error) {
      console.error('Failed to show details:', error);
      notifications.error('Failed to show collection details');
    }
  }

  /**
   * Handle focus window action
   */
  async handleFocusWindow(collectionId) {
    try {
      // Get collection to find windowId
      const collection = this.controller.collectionsData.find(c => c.id === collectionId);
      if (!collection || !collection.windowId) {
        notifications.error('Window not found');
        return;
      }

      // Focus the window
      await chrome.windows.update(collection.windowId, { focused: true });
      notifications.success('Window focused');
    } catch (error) {
      console.error('Failed to focus window:', error);
      notifications.error('Failed to focus window');
    }
  }

  /**
   * Handle open collection action
   */
  async handleOpenCollection(collectionId) {
    try {
      const result = await this.controller.sendMessage('restoreCollection', {
        collectionId,
        createNewWindow: true,
        focused: true
      });

      if (result?.success) {
        notifications.success('Collection opened in new window');

        // Handle filter state transition (business logic delegated to service)
        if (this.controller.searchFilter) {
          await handleCollectionOpened(this.controller.searchFilter);
        }

        // Refresh to show updated active state
        await this.controller.loadData();
      } else {
        notifications.error('Failed to open collection');
      }
    } catch (error) {
      console.error('Failed to open collection:', error);
      notifications.error('Failed to open collection');
    }
  }

  /**
   * Handle view tasks action
   */
  async handleViewTasks(collectionId) {
    try {
      // Switch to tasks view and filter by collection
      await this.controller.switchView('tasks');
      // TODO: Phase 3.3 - Implement task filtering by collection
      notifications.info('Viewing tasks for collection');
    } catch (error) {
      console.error('Failed to view tasks:', error);
      notifications.error('Failed to view tasks');
    }
  }

  /**
   * Handle edit collection action
   */
  async handleEditCollection(collectionId) {
    try {
      const collection = this.controller.collectionsData.find(c => c.id === collectionId);
      if (!collection) {
        notifications.error('Collection not found');
        return;
      }

      // Create edit form
      const form = this.createEditForm(collection);

      // Show modal
      modal.open({
        title: 'Edit Collection',
        content: form,
        size: 'medium',
        actions: [
          {
            label: 'Cancel',
            variant: 'secondary',
            autoClose: true
          },
          {
            label: 'Save',
            variant: 'primary',
            onClick: async () => {
              await this.saveCollectionEdits(collectionId, form);
            }
          }
        ]
      });
    } catch (error) {
      console.error('Failed to edit collection:', error);
      notifications.error('Failed to edit collection');
    }
  }

  /**
   * Handle close collection action
   */
  async handleCloseCollection(collectionId) {
    try {
      const collection = this.controller.collectionsData.find(c => c.id === collectionId);
      if (!collection || !collection.windowId) {
        notifications.error('Window not found');
        return;
      }

      // Close the window
      await chrome.windows.remove(collection.windowId);
      notifications.success('Window closed - collection saved');

      // Handle filter state transition (business logic delegated to service)
      if (this.controller.searchFilter) {
        await handleCollectionClosed(this.controller.searchFilter);
      }

      // Reload data (window close event will update collection)
      await this.controller.loadData();
    } catch (error) {
      console.error('Failed to close window:', error);
      notifications.error('Failed to close window');
    }
  }

  /**
   * Handle delete collection action
   */
  async handleDeleteCollection(collectionId) {
    try {
      const collection = this.controller.collectionsData.find(c => c.id === collectionId);
      if (!collection) {
        notifications.error('Collection not found');
        return;
      }

      // Show confirmation modal
      const confirmed = await this.showDeleteConfirmation(collection);
      if (!confirmed) return;

      // Delete the collection via message
      const response = await chrome.runtime.sendMessage({
        action: 'deleteCollection',
        collectionId
      });

      if (response && response.success) {
        notifications.success(`Collection "${collection.name}" deleted`);
        // Reload data
        await this.controller.loadData();
      } else {
        throw new Error(response?.error || 'Delete failed');
      }
    } catch (error) {
      console.error('Failed to delete collection:', error);
      notifications.error('Failed to delete collection');
    }
  }

  /**
   * Show delete confirmation modal
   */
  async showDeleteConfirmation(collection) {
    return new Promise((resolve) => {
      const isActive = collection.isActive;
      const warningText = isActive
        ? '<p class="warning-text">⚠️ This collection is currently active. The window will remain open but the collection data will be permanently deleted.</p>'
        : '';

      modal.open({
        title: 'Delete Collection',
        content: `
          <p>Are you sure you want to delete "<strong>${this.escapeHtml(collection.name)}</strong>"?</p>
          ${warningText}
          <p>This will permanently delete:</p>
          <ul>
            <li>All folders and tabs in this collection</li>
            <li>All tasks associated with this collection</li>
          </ul>
          <p class="danger-text">This action cannot be undone.</p>
        `,
        actions: [
          {
            label: 'Cancel',
            className: 'btn-secondary',
            onClick: () => {
              modal.close();
              resolve(false);
            }
          },
          {
            label: 'Delete',
            className: 'btn-danger',
            onClick: () => {
              modal.close();
              resolve(true);
            }
          }
        ]
      });
    });
  }

  /**
   * Create edit form
   */
  createEditForm(collection) {
    const form = document.createElement('form');
    form.className = 'collection-edit-form';
    form.innerHTML = `
      <div class="form-group">
        <label for="edit-name">Name</label>
        <input
          type="text"
          id="edit-name"
          name="name"
          value="${this.escapeHtml(collection.name || '')}"
          required
          class="form-input"
        >
      </div>

      <div class="form-group">
        <label for="edit-description">Description</label>
        <textarea
          id="edit-description"
          name="description"
          class="form-textarea"
          rows="3"
        >${this.escapeHtml(collection.description || '')}</textarea>
      </div>

      <div class="form-group" id="icon-group">
        <label for="edit-icon">Icon</label>
      </div>

      <div class="form-group">
        <label for="edit-tags">Tags (comma-separated)</label>
        <input
          type="text"
          id="edit-tags"
          name="tags"
          value="${collection.tags ? collection.tags.join(', ') : ''}"
          class="form-input"
          placeholder="work, research, personal"
        >
      </div>
    `;

    // Add emoji picker component
    const emojiPicker = new EmojiPicker({
      inputId: 'edit-icon',
      initialEmoji: collection.icon || '📁'
    });

    const iconGroup = form.querySelector('#icon-group');
    iconGroup.appendChild(emojiPicker.create());

    return form;
  }

  /**
   * Save collection edits
   */
  async saveCollectionEdits(collectionId, form) {
    try {
      const formData = new FormData(form);
      const updates = {
        name: formData.get('name'),
        description: formData.get('description') || null,
        icon: formData.get('edit-icon') || '📁',
        tags: formData.get('tags')
          ? formData.get('tags').split(',').map(t => t.trim()).filter(t => t)
          : []
      };

      // Send update message
      const response = await this.controller.sendMessage('updateCollection', {
        id: collectionId,
        updates
      });

      if (response?.success) {
        notifications.success('Collection updated');
        await this.controller.loadData();
      } else {
        throw new Error(response?.error || 'Update failed');
      }
    } catch (error) {
      console.error('Failed to save collection:', error);
      notifications.error('Failed to save changes');
      throw error; // Re-throw to prevent modal close
    }
  }

  /**
   * Handle export collection action
   */
  async handleExportCollection(collectionId) {
    try {
      notifications.info('Exporting collection...');

      const result = await exportCollectionService(collectionId);

      if (result?.success) {
        notifications.success(formatExportSuccessMessage(result));
      } else {
        notifications.error('Failed to export collection');
      }
    } catch (error) {
      console.error('Failed to export collection:', error);
      notifications.error(`Export failed: ${error.message}`);
    }
  }

  /**
   * Format relative time
   */
  formatRelativeTime(timestamp) {
    if (!timestamp) return 'Never';

    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
