/**
 * Collection Detail View Component
 *
 * THIN component - all business logic via message passing to background
 * Shows detailed view of a single collection with:
 * - Collection header (name, description, tags, metadata)
 * - Tasks section FIRST (per proposal visual hierarchy)
 * - Folders section (collapsible) with tabs
 * - Action buttons and inline editing
 */

import { notifications } from './components/notification.js';
import { modal } from './components/modal.js';

export class CollectionDetailView {
  constructor(controller) {
    this.controller = controller;
    this.currentCollectionId = null;
    this.expandedFolders = new Set(); // Track which folders are expanded
    this.container = null;
  }

  /**
   * Initialize the view
   */
  init() {
    // Detail view will be rendered dynamically, no persistent container
  }

  /**
   * Show detail view for a collection
   */
  async show(collectionId) {
    try {
      this.currentCollectionId = collectionId;

      // Load collection data
      const collection = await this.loadCollection(collectionId);
      if (!collection) {
        notifications.error('Collection not found');
        return;
      }

      // Load folders and tabs
      const folders = await this.loadFolders(collectionId);
      const tabs = await this.loadTabs(folders);

      // Load tasks
      const tasks = await this.loadTasks(collectionId);

      // Render detail view
      this.render(collection, folders, tabs, tasks);
    } catch (error) {
      console.error('Failed to load collection detail:', error);
      notifications.error('Failed to load collection');
    }
  }

  /**
   * Hide detail view and return to collections list
   */
  hide() {
    this.currentCollectionId = null;
    this.expandedFolders.clear();

    // Show collections view again
    const collectionsView = document.getElementById('collections-content');
    if (collectionsView) {
      collectionsView.style.display = 'block';
    }

    // Remove detail view
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  /**
   * Load collection data
   */
  async loadCollection(collectionId) {
    const response = await this.controller.sendMessage('getCollection', { id: collectionId });
    return response?.collection || null;
  }

  /**
   * Load folders for collection
   */
  async loadFolders(collectionId) {
    const response = await this.controller.sendMessage('getFoldersByCollection', { collectionId });
    return response?.folders || [];
  }

  /**
   * Load tabs for folders
   */
  async loadTabs(folders) {
    const allTabs = [];
    for (const folder of folders) {
      const response = await this.controller.sendMessage('getTabsByFolder', { folderId: folder.id });
      const tabs = response?.tabs || [];
      allTabs.push(...tabs.map(tab => ({ ...tab, folderId: folder.id })));
    }
    return allTabs;
  }

  /**
   * Load tasks for collection
   */
  async loadTasks(collectionId) {
    const response = await this.controller.sendMessage('getTasks', {
      filters: { collectionId }
    });
    return response?.tasks || [];
  }

  /**
   * Render detail view
   */
  render(collection, folders, tabs, tasks) {
    // Hide collections list
    const collectionsView = document.getElementById('collections-content');
    if (collectionsView) {
      collectionsView.style.display = 'none';
    }

    // Create detail container
    const viewContainer = document.getElementById('collections-view');
    this.container = document.createElement('div');
    this.container.className = 'collection-detail-view';
    this.container.innerHTML = this.renderContent(collection, folders, tabs, tasks);

    viewContainer.appendChild(this.container);

    // Attach event listeners
    this.attachEventListeners();
  }

  /**
   * Render detail content
   */
  renderContent(collection, folders, tabs, tasks) {
    return `
      <div class="detail-header">
        <button class="btn-back" data-action="back">
          ← Back to Collections
        </button>
      </div>

      ${this.renderCollectionHeader(collection)}
      ${this.renderTasksSection(tasks, collection, tabs)}
      ${this.renderFoldersSection(folders, tabs)}
      ${this.renderCollectionActions(collection)}
    `;
  }

  /**
   * Render collection header
   */
  renderCollectionHeader(collection) {
    const icon = collection.icon || '📁';
    const name = this.escapeHtml(collection.name || 'Untitled Collection');
    const description = collection.description
      ? this.escapeHtml(collection.description)
      : '';

    const windowInfo = collection.isActive && collection.windowId
      ? `<span class="window-badge">Window #${collection.windowId}</span>`
      : '';

    return `
      <div class="collection-header-detail">
        <div class="collection-title-row">
          <div class="collection-icon-large">${icon}</div>
          <div class="collection-header-info">
            <h2 class="collection-name-large">
              ${collection.isActive ? '<span class="active-indicator">🟢</span>' : ''}
              ${name}
              ${windowInfo}
            </h2>
            ${description ? `<p class="collection-description-large">${description}</p>` : ''}
          </div>
        </div>

        ${collection.tags && collection.tags.length > 0 ? `
          <div class="collection-tags-large">
            ${collection.tags.map(tag =>
              `<span class="tag">${this.escapeHtml(tag)}</span>`
            ).join('')}
          </div>
        ` : ''}

        <div class="collection-metadata">
          <span class="meta-item">
            <span class="meta-label">Created:</span>
            <span class="meta-value">${this.formatDateTime(collection.createdAt)}</span>
          </span>
          <span class="meta-item">
            <span class="meta-label">Last accessed:</span>
            <span class="meta-value">${this.formatDateTime(collection.metadata?.lastAccessed)}</span>
          </span>
        </div>
      </div>
    `;
  }

  /**
   * Render tasks section (shown first per proposal)
   */
  renderTasksSection(tasks, collection, tabs) {
    // Group tasks by status
    const openTasks = tasks.filter(t => t.status === 'open');
    const activeTasks = tasks.filter(t => t.status === 'active');
    const completedTasks = tasks.filter(t => ['fixed', 'abandoned'].includes(t.status));

    return `
      <section class="detail-section tasks-section">
        <div class="section-header-detail">
          <h3 class="section-title-detail">
            ✓ Tasks
            <span class="section-count-detail">${tasks.length}</span>
          </h3>
          <button class="btn btn-primary btn-sm" data-action="create-task">
            + New Task
          </button>
        </div>

        <div class="tasks-container">
          ${tasks.length === 0 ? `
            <div class="empty-state-inline">
              <p>No tasks yet. Create one to track your work.</p>
            </div>
          ` : ''}

          ${openTasks.length > 0 ? `
            <div class="task-group">
              <h4 class="task-group-title">Open (${openTasks.length})</h4>
              ${openTasks.map(task => this.renderTaskCard(task, tabs)).join('')}
            </div>
          ` : ''}

          ${activeTasks.length > 0 ? `
            <div class="task-group">
              <h4 class="task-group-title">Active (${activeTasks.length})</h4>
              ${activeTasks.map(task => this.renderTaskCard(task, tabs)).join('')}
            </div>
          ` : ''}

          ${completedTasks.length > 0 ? `
            <div class="task-group">
              <h4 class="task-group-title">Completed (${completedTasks.length})</h4>
              ${completedTasks.map(task => this.renderTaskCard(task, tabs)).join('')}
            </div>
          ` : ''}
        </div>
      </section>
    `;
  }

  /**
   * Render task card
   */
  renderTaskCard(task, allTabs) {
    const priorityIcon = {
      critical: '🔴',
      high: '🔴',
      medium: '⚪',
      low: '⚪'
    }[task.priority || 'medium'];

    // Get referenced tabs
    const referencedTabs = (task.tabIds || [])
      .map(tabId => allTabs.find(t => t.id === tabId))
      .filter(Boolean);

    const tabsPreview = referencedTabs.length > 0
      ? `<div class="task-tabs-preview">
           → ${referencedTabs.slice(0, 2).map(t => this.escapeHtml(t.title || t.url)).join(', ')}
           ${referencedTabs.length > 2 ? `, +${referencedTabs.length - 2} more` : ''}
         </div>`
      : '';

    return `
      <div class="task-card-detail" data-task-id="${task.id}">
        <div class="task-header-detail">
          <span class="task-priority-icon">${priorityIcon}</span>
          <span class="task-summary">${this.escapeHtml(task.summary)}</span>
          <span class="task-status-badge status-${task.status}">${task.status}</span>
        </div>
        ${tabsPreview}
        <div class="task-actions-detail">
          <button class="btn-icon" data-action="open-task-tabs" data-task-id="${task.id}" title="Open tabs">
            📂
          </button>
          <button class="btn-icon" data-action="mark-fixed" data-task-id="${task.id}" title="Mark as fixed">
            ✓
          </button>
          <button class="btn-icon" data-action="edit-task" data-task-id="${task.id}" title="Edit task">
            ✏️
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render folders section
   */
  renderFoldersSection(folders, tabs) {
    return `
      <section class="detail-section folders-section">
        <div class="section-header-detail">
          <h3 class="section-title-detail">
            📂 Folders & Tabs
            <span class="section-count-detail">${folders.length} folders, ${tabs.length} tabs</span>
          </h3>
        </div>

        <div class="folders-container">
          ${folders.length === 0 ? `
            <div class="empty-state-inline">
              <p>No folders yet.</p>
            </div>
          ` : folders.map(folder => this.renderFolder(folder, tabs)).join('')}
        </div>
      </section>
    `;
  }

  /**
   * Render folder with tabs
   */
  renderFolder(folder, allTabs) {
    const folderTabs = allTabs.filter(t => t.folderId === folder.id);
    const isExpanded = this.expandedFolders.has(folder.id);

    return `
      <div class="folder-card" data-folder-id="${folder.id}">
        <div class="folder-header" data-action="toggle-folder" data-folder-id="${folder.id}">
          <span class="folder-toggle">${isExpanded ? '▼' : '▶'}</span>
          <span class="folder-name">${this.escapeHtml(folder.name || 'Untitled Folder')}</span>
          <span class="folder-count">${folderTabs.length} tabs</span>
        </div>

        <div class="folder-tabs ${isExpanded ? 'expanded' : 'collapsed'}">
          ${folderTabs.map(tab => this.renderTab(tab)).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render tab with inline note editing
   */
  renderTab(tab) {
    const favicon = tab.favicon || '📄';
    const title = this.escapeHtml(tab.title || tab.url);
    const note = tab.note ? this.escapeHtml(tab.note) : '';

    return `
      <div class="tab-item" data-tab-id="${tab.id}">
        <div class="tab-header-item">
          ${tab.isPinned ? '<span class="tab-pinned-icon">📌</span>' : ''}
          <img src="${favicon}" class="tab-favicon" onerror="this.style.display='none'" alt="">
          <span class="tab-title">${title}</span>
        </div>
        <div class="tab-note-container">
          <textarea
            class="tab-note-input"
            data-tab-id="${tab.id}"
            placeholder="Add note (255 chars max)..."
            maxlength="255"
            rows="1"
          >${note}</textarea>
          <span class="tab-note-chars">${note.length}/255</span>
        </div>
      </div>
    `;
  }

  /**
   * Render collection actions
   */
  renderCollectionActions(collection) {
    return `
      <div class="collection-actions-detail">
        ${collection.isActive ? `
          <button class="btn btn-secondary" data-action="focus-window">
            👁️ Focus Window
          </button>
          <button class="btn btn-secondary" data-action="close-window">
            ❌ Close Window
          </button>
        ` : `
          <button class="btn btn-primary" data-action="open-collection">
            📂 Open Collection
          </button>
        `}
        <button class="btn btn-secondary" data-action="edit-collection">
          ✏️ Edit Collection
        </button>
      </div>
    `;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    if (!this.container) return;

    this.container.addEventListener('click', async (e) => {
      const button = e.target.closest('[data-action]');
      if (!button) return;

      const action = button.dataset.action;

      switch (action) {
        case 'back':
          this.hide();
          break;
        case 'create-task':
          await this.handleCreateTask();
          break;
        case 'open-task-tabs':
          await this.handleOpenTaskTabs(button.dataset.taskId);
          break;
        case 'mark-fixed':
          await this.handleMarkFixed(button.dataset.taskId);
          break;
        case 'edit-task':
          await this.handleEditTask(button.dataset.taskId);
          break;
        case 'toggle-folder':
          this.handleToggleFolder(button.dataset.folderId);
          break;
        case 'focus-window':
          await this.handleFocusWindow();
          break;
        case 'close-window':
          await this.handleCloseWindow();
          break;
        case 'open-collection':
          await this.handleOpenCollection();
          break;
        case 'edit-collection':
          await this.handleEditCollection();
          break;
      }
    });

    // Tab note editing
    this.container.addEventListener('blur', async (e) => {
      if (e.target.classList.contains('tab-note-input')) {
        await this.handleSaveTabNote(e.target);
      }
    }, true);

    // Character count update
    this.container.addEventListener('input', (e) => {
      if (e.target.classList.contains('tab-note-input')) {
        const charsSpan = e.target.nextElementSibling;
        if (charsSpan) {
          charsSpan.textContent = `${e.target.value.length}/255`;
        }
      }
    });
  }

  /**
   * Handle create task
   */
  async handleCreateTask() {
    try {
      const form = this.createTaskForm();

      modal.open({
        title: 'Create Task',
        content: form,
        size: 'medium',
        actions: [
          {
            label: 'Cancel',
            variant: 'secondary',
            autoClose: true
          },
          {
            label: 'Create',
            variant: 'primary',
            onClick: async () => {
              await this.saveTask(null, form);
            }
          }
        ]
      });
    } catch (error) {
      console.error('Failed to create task:', error);
      notifications.error('Failed to create task');
    }
  }

  /**
   * Handle edit task
   */
  async handleEditTask(taskId) {
    try {
      const response = await this.controller.sendMessage('getTask', { id: taskId });
      const task = response?.task;

      if (!task) {
        notifications.error('Task not found');
        return;
      }

      const form = this.createTaskForm(task);

      modal.open({
        title: 'Edit Task',
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
              await this.saveTask(taskId, form);
            }
          }
        ]
      });
    } catch (error) {
      console.error('Failed to edit task:', error);
      notifications.error('Failed to edit task');
    }
  }

  /**
   * Create task form
   */
  createTaskForm(task = null) {
    const form = document.createElement('form');
    form.className = 'task-edit-form';
    form.innerHTML = `
      <div class="form-group">
        <label for="task-summary">Summary *</label>
        <input
          type="text"
          id="task-summary"
          name="summary"
          value="${task ? this.escapeHtml(task.summary) : ''}"
          required
          class="form-input"
        >
      </div>

      <div class="form-group">
        <label for="task-notes">Notes</label>
        <textarea
          id="task-notes"
          name="notes"
          class="form-textarea"
          rows="3"
        >${task ? this.escapeHtml(task.notes || '') : ''}</textarea>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="task-priority">Priority</label>
          <select id="task-priority" name="priority" class="form-select">
            <option value="low" ${task?.priority === 'low' ? 'selected' : ''}>Low</option>
            <option value="medium" ${!task || task.priority === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="high" ${task?.priority === 'high' ? 'selected' : ''}>High</option>
            <option value="critical" ${task?.priority === 'critical' ? 'selected' : ''}>Critical</option>
          </select>
        </div>

        <div class="form-group">
          <label for="task-status">Status</label>
          <select id="task-status" name="status" class="form-select">
            <option value="open" ${!task || task.status === 'open' ? 'selected' : ''}>Open</option>
            <option value="active" ${task?.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="fixed" ${task?.status === 'fixed' ? 'selected' : ''}>Fixed</option>
            <option value="abandoned" ${task?.status === 'abandoned' ? 'selected' : ''}>Abandoned</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label for="task-due-date">Due Date</label>
        <input
          type="date"
          id="task-due-date"
          name="dueDate"
          value="${task?.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''}"
          class="form-input"
        >
      </div>

      <div class="form-group">
        <label for="task-tags">Tags (comma-separated)</label>
        <input
          type="text"
          id="task-tags"
          name="tags"
          value="${task?.tags ? task.tags.join(', ') : ''}"
          class="form-input"
          placeholder="bug, feature, urgent"
        >
      </div>
    `;
    return form;
  }

  /**
   * Save task
   */
  async saveTask(taskId, form) {
    try {
      const formData = new FormData(form);
      const params = {
        summary: formData.get('summary'),
        notes: formData.get('notes') || null,
        priority: formData.get('priority'),
        status: formData.get('status'),
        dueDate: formData.get('dueDate') ? new Date(formData.get('dueDate')).getTime() : null,
        tags: formData.get('tags')
          ? formData.get('tags').split(',').map(t => t.trim()).filter(t => t)
          : [],
        collectionId: this.currentCollectionId
      };

      const action = taskId ? 'updateTask' : 'createTask';
      const response = await this.controller.sendMessage(action, taskId ? { id: taskId, updates: params } : { params });

      if (response?.success || response?.task) {
        notifications.success(taskId ? 'Task updated' : 'Task created');
        await this.show(this.currentCollectionId); // Refresh view
      } else {
        throw new Error(response?.error || 'Failed to save task');
      }
    } catch (error) {
      console.error('Failed to save task:', error);
      notifications.error('Failed to save task');
      throw error;
    }
  }

  /**
   * Handle open task tabs
   */
  async handleOpenTaskTabs(taskId) {
    try {
      // TODO: Phase 6 - Implement with TaskExecutionService
      notifications.info('Open task tabs feature coming in Phase 6');
    } catch (error) {
      console.error('Failed to open task tabs:', error);
      notifications.error('Failed to open task tabs');
    }
  }

  /**
   * Handle mark task as fixed
   */
  async handleMarkFixed(taskId) {
    try {
      const response = await this.controller.sendMessage('updateTask', {
        id: taskId,
        updates: { status: 'fixed' }
      });

      if (response?.success) {
        notifications.success('Task marked as fixed');
        await this.show(this.currentCollectionId); // Refresh view
      } else {
        throw new Error(response?.error || 'Failed to update task');
      }
    } catch (error) {
      console.error('Failed to mark task as fixed:', error);
      notifications.error('Failed to update task');
    }
  }

  /**
   * Handle toggle folder expansion
   */
  handleToggleFolder(folderId) {
    if (this.expandedFolders.has(folderId)) {
      this.expandedFolders.delete(folderId);
    } else {
      this.expandedFolders.add(folderId);
    }

    // Update UI
    const folderCard = this.container.querySelector(`[data-folder-id="${folderId}"]`);
    if (folderCard) {
      const toggle = folderCard.querySelector('.folder-toggle');
      const tabs = folderCard.querySelector('.folder-tabs');
      const isExpanded = this.expandedFolders.has(folderId);

      if (toggle) toggle.textContent = isExpanded ? '▼' : '▶';
      if (tabs) tabs.className = `folder-tabs ${isExpanded ? 'expanded' : 'collapsed'}`;
    }
  }

  /**
   * Handle save tab note
   */
  async handleSaveTabNote(textarea) {
    try {
      const tabId = textarea.dataset.tabId;
      const note = textarea.value.trim();

      const response = await this.controller.sendMessage('updateTab', {
        id: tabId,
        updates: { note: note || null }
      });

      if (response?.success) {
        // Show subtle success indicator
        textarea.style.borderColor = 'var(--success-color)';
        setTimeout(() => {
          textarea.style.borderColor = '';
        }, 1000);
      } else {
        throw new Error(response?.error || 'Failed to update tab note');
      }
    } catch (error) {
      console.error('Failed to save tab note:', error);
      notifications.error('Failed to save note');
    }
  }

  /**
   * Handle focus window
   */
  async handleFocusWindow() {
    try {
      const collection = await this.loadCollection(this.currentCollectionId);
      if (!collection || !collection.windowId) {
        notifications.error('Window not found');
        return;
      }

      await chrome.windows.update(collection.windowId, { focused: true });
      notifications.success('Window focused');
    } catch (error) {
      console.error('Failed to focus window:', error);
      notifications.error('Failed to focus window');
    }
  }

  /**
   * Handle close window
   */
  async handleCloseWindow() {
    try {
      const collection = await this.loadCollection(this.currentCollectionId);
      if (!collection || !collection.windowId) {
        notifications.error('Window not found');
        return;
      }

      await chrome.windows.remove(collection.windowId);
      notifications.success('Window closed - collection saved');
      this.hide();
      await this.controller.loadData();
    } catch (error) {
      console.error('Failed to close window:', error);
      notifications.error('Failed to close window');
    }
  }

  /**
   * Handle open collection
   */
  async handleOpenCollection() {
    try {
      // TODO: Phase 6 - Implement with RestoreCollectionService
      notifications.info('Open collection feature coming in Phase 6');
    } catch (error) {
      console.error('Failed to open collection:', error);
      notifications.error('Failed to open collection');
    }
  }

  /**
   * Handle edit collection
   */
  async handleEditCollection() {
    try {
      const collection = await this.loadCollection(this.currentCollectionId);
      if (!collection) {
        notifications.error('Collection not found');
        return;
      }

      const form = this.createCollectionEditForm(collection);

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
              await this.saveCollectionEdits(form);
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
   * Create collection edit form
   */
  createCollectionEditForm(collection) {
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

      <div class="form-group">
        <label for="edit-icon">Icon</label>
        <input
          type="text"
          id="edit-icon"
          name="icon"
          value="${this.escapeHtml(collection.icon || '📁')}"
          class="form-input"
          maxlength="2"
        >
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
    return form;
  }

  /**
   * Save collection edits
   */
  async saveCollectionEdits(form) {
    try {
      const formData = new FormData(form);
      const updates = {
        name: formData.get('name'),
        description: formData.get('description') || null,
        icon: formData.get('icon') || '📁',
        tags: formData.get('tags')
          ? formData.get('tags').split(',').map(t => t.trim()).filter(t => t)
          : []
      };

      const response = await this.controller.sendMessage('updateCollection', {
        id: this.currentCollectionId,
        updates
      });

      if (response?.success) {
        notifications.success('Collection updated');
        await this.show(this.currentCollectionId); // Refresh view
      } else {
        throw new Error(response?.error || 'Update failed');
      }
    } catch (error) {
      console.error('Failed to save collection:', error);
      notifications.error('Failed to save changes');
      throw error;
    }
  }

  /**
   * Format date/time
   */
  formatDateTime(timestamp) {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
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
