/**
 * Tasks View Component
 *
 * THIN component - all business logic via message passing to background
 * Renders task cards with:
 * - Grouping: UNCATEGORIZED → By Collection → COMPLETED
 * - Priority indicators (color-coded)
 * - Status badges
 * - Tab references with folder context
 * - Action buttons (Open Tabs, Mark Fixed, Edit, View Collection)
 * - Real-time updates from background messages
 */

import { notifications } from './components/notification.js';
import { modal } from './components/modal.js';
import { TabChipRenderer } from './components/tab-chip-renderer.js';

export class TasksView {
  constructor(controller) {
    this.controller = controller;
    this.contentContainer = null;
    this.collections = null; // Cache for collection lookups
    this.eventListenersAttached = false; // Track if event listeners are already attached
  }

  /**
   * Initialize the view
   */
  init() {
    this.contentContainer = document.getElementById('tasks-content');

    if (!this.contentContainer) {
      console.error('Tasks view container not found');
    }
  }

  /**
   * Render tasks with grouping and sorting options
   * @param {Array} tasks - Tasks to render (already sorted by panel.js controller)
   * @param {Array} collections - Collections for lookups
   * @param {Object} options - Presentation options from presentation-controls.js
   * @param {string} options.groupBy - 'collection'|'priority'|'status'|'none'
   * @param {string} options.sortBy - 'priority'|'dueDate'|'created'|'alpha' (for reference, sorting done by controller)
   * @param {string} options.sortDirection - 'asc'|'desc' (for reference, sorting done by controller)
   */
  render(tasks, collections, options = {}) {
    if (!tasks || tasks.length === 0) {
      this.renderEmpty();
      return;
    }

    // Cache collections for lookups
    this.collections = collections || [];

    // Default options (fallback to collection grouping for backwards compatibility)
    const groupBy = options.groupBy || 'collection';
    const sortBy = options.sortBy || 'priority';
    const sortDirection = options.sortDirection || 'desc';

    // Render based on grouping mode
    if (groupBy === 'none') {
      // Flat list - no grouping
      this.renderUnifiedList(tasks);
    } else {
      // Grouped rendering
      this.renderGroups(tasks, groupBy);
    }

    // Attach event listeners
    this.attachEventListeners();
  }

  /**
   * Render tasks as flat list (no grouping)
   * Used when groupBy='none'
   */
  renderUnifiedList(tasks) {
    const html = `
      <section class="task-section unified-list">
        <div class="tasks-list">
          ${tasks.map(task => this.renderTaskCard(task, false)).join('')}
        </div>
      </section>
    `;
    this.contentContainer.innerHTML = html;
  }

  /**
   * Render tasks with grouping
   * @param {Array} tasks - Tasks to render
   * @param {string} groupBy - 'collection'|'priority'|'status'
   */
  renderGroups(tasks, groupBy) {
    if (groupBy === 'collection') {
      this.renderGroupsByCollection(tasks);
    } else if (groupBy === 'priority') {
      this.renderGroupsByPriority(tasks);
    } else if (groupBy === 'status') {
      this.renderGroupsByStatus(tasks);
    }
  }

  /**
   * Render tasks grouped by collection (original behavior)
   */
  renderGroupsByCollection(tasks) {
    // Group tasks by collection
    const groups = this.groupTasks(tasks);

    // Render groups
    const html = [];

    // 1. Uncategorized (no collectionId) - shown first
    if (groups.uncategorized.length > 0) {
      html.push(this.renderTaskSection('uncategorized', 'Uncategorized', groups.uncategorized, true));
    }

    // 2. By Collection (sorted by last accessed)
    const sortedCollections = Object.entries(groups.byCollection)
      .sort((a, b) => {
        const collectionA = this.getCollection(a[0]);
        const collectionB = this.getCollection(b[0]);
        const timeA = collectionA?.metadata?.lastAccessed || collectionA?.createdAt || 0;
        const timeB = collectionB?.metadata?.lastAccessed || collectionB?.createdAt || 0;
        return timeB - timeA;
      });

    for (const [collectionId, collectionTasks] of sortedCollections) {
      const collection = this.getCollection(collectionId);
      if (collection) {
        const collectionName = collection.name || 'Unnamed Collection';
        const isActive = collection.isActive;
        html.push(this.renderTaskSection(collectionId, collectionName, collectionTasks, false, isActive));
      }
    }

    // 3. Completed (collapsible section)
    if (groups.completed.length > 0) {
      html.push(this.renderCompletedSection(groups.completed));
    }

    this.contentContainer.innerHTML = html.join('');
  }

  /**
   * Render tasks grouped by priority
   */
  renderGroupsByPriority(tasks) {
    const groups = {
      critical: [],
      high: [],
      medium: [],
      low: [],
      none: []
    };

    for (const task of tasks) {
      const priority = task.priority || 'none';
      if (groups[priority]) {
        groups[priority].push(task);
      } else {
        groups.none.push(task);
      }
    }

    const html = [];
    const priorities = [
      { key: 'critical', label: 'Critical', emoji: '🔴' },
      { key: 'high', label: 'High Priority', emoji: '🟠' },
      { key: 'medium', label: 'Medium Priority', emoji: '🟡' },
      { key: 'low', label: 'Low Priority', emoji: '🟢' },
      { key: 'none', label: 'No Priority', emoji: '⚪' }
    ];

    for (const { key, label, emoji } of priorities) {
      if (groups[key].length > 0) {
        html.push(this.renderTaskSection(key, `${emoji} ${label}`, groups[key], false));
      }
    }

    this.contentContainer.innerHTML = html.join('');
  }

  /**
   * Render tasks grouped by status
   */
  renderGroupsByStatus(tasks) {
    const groups = {
      open: [],
      active: [],
      fixed: [],
      abandoned: []
    };

    for (const task of tasks) {
      const status = task.status || 'open';
      if (groups[status]) {
        groups[status].push(task);
      }
    }

    const html = [];
    const statuses = [
      { key: 'open', label: 'Open', emoji: '📋' },
      { key: 'active', label: 'Active', emoji: '🔵' },
      { key: 'fixed', label: 'Fixed', emoji: '✅' },
      { key: 'abandoned', label: 'Abandoned', emoji: '❌' }
    ];

    for (const { key, label, emoji } of statuses) {
      if (groups[key].length > 0) {
        html.push(this.renderTaskSection(key, `${emoji} ${label}`, groups[key], false));
      }
    }

    this.contentContainer.innerHTML = html.join('');
  }

  /**
   * Group tasks by category
   */
  groupTasks(tasks) {
    const groups = {
      uncategorized: [],
      byCollection: {},
      completed: []
    };

    for (const task of tasks) {
      // Completed tasks (fixed or abandoned)
      if (task.status === 'fixed' || task.status === 'abandoned') {
        groups.completed.push(task);
        continue;
      }

      // Uncategorized (no collectionId)
      if (!task.collectionId) {
        groups.uncategorized.push(task);
        continue;
      }

      // By collection
      if (!groups.byCollection[task.collectionId]) {
        groups.byCollection[task.collectionId] = [];
      }
      groups.byCollection[task.collectionId].push(task);
    }

    return groups;
  }

  /**
   * Get collection by ID
   */
  getCollection(collectionId) {
    if (!this.collections) return null;
    return this.collections.find(c => c.id === collectionId);
  }

  /**
   * Render empty state
   */
  renderEmpty() {
    if (this.contentContainer) {
      this.contentContainer.innerHTML = '';
    }
  }

  /**
   * Render a task section
   */
  renderTaskSection(sectionId, sectionTitle, tasks, isUncategorized = false, isActive = false) {
    // Tasks are already sorted by panel.js controller according to user's sortBy filter
    // DO NOT re-sort here - respect the order from controller
    const activeIndicator = isActive ? '<span class="active-indicator">🟢</span>' : '';

    return `
      <section class="task-section" data-section-id="${sectionId}">
        <h2 class="section-header">
          <span class="section-title">${sectionTitle}${activeIndicator}</span>
          <span class="section-count">${tasks.length}</span>
        </h2>
        <div class="tasks-list">
          ${tasks.map(task => this.renderTaskCard(task, isUncategorized)).join('')}
        </div>
      </section>
    `;
  }

  /**
   * Render completed section (collapsible)
   */
  renderCompletedSection(tasks) {
    // Tasks are already sorted by panel.js controller according to user's sortBy filter
    // DO NOT re-sort here - respect the order from controller
    return `
      <section class="task-section task-section-collapsible collapsed" data-section-id="completed">
        <h2 class="section-header clickable" data-toggle-section="completed">
          <span class="section-title">
            <span class="collapse-icon">▶</span>
            Completed
          </span>
          <span class="section-count">${tasks.length}</span>
        </h2>
        <div class="tasks-list">
          ${tasks.map(task => this.renderTaskCard(task, false, true)).join('')}
        </div>
      </section>
    `;
  }

  /**
   * Render a single task card
   */
  renderTaskCard(task, isUncategorized = false, isCompleted = false) {
    const priorityClass = this.getPriorityClass(task.priority);
    const priorityIcon = this.getPriorityIcon(task.priority);
    const statusBadge = this.getStatusBadge(task.status);
    const dueDateHtml = this.renderDueDate(task.dueDate);
    const collectionBadge = isUncategorized ? '' : this.renderCollectionBadge(task.collectionId);
    // Phase 11: Use new tabReferences field, fallback to old tabIds
    const tabRefs = task.tabReferences || [];
    const tabReferenceBadge = TabChipRenderer.renderTabReferenceBadge(tabRefs, task.id, this.escapeHtml.bind(this));

    const actionButtons = isCompleted
      ? `
          <button class="btn btn-link task-action" data-action="view-collection" data-collection-id="${task.collectionId || ''}" ${!task.collectionId ? 'disabled' : ''}>View Collection</button>
          <button class="btn btn-danger task-action" data-action="delete" data-task-id="${task.id}">Delete</button>
        `
      : `
          <button class="btn btn-primary task-action" data-action="open-tabs" data-task-id="${task.id}">Open Tabs</button>
          <button class="btn btn-secondary task-action" data-action="mark-fixed" data-task-id="${task.id}">Mark Fixed</button>
          <button class="btn btn-link task-action" data-action="edit" data-task-id="${task.id}">Edit</button>
          ${task.collectionId ? `<button class="btn btn-link task-action" data-action="view-collection" data-collection-id="${task.collectionId}">View Collection</button>` : ''}
          <button class="btn btn-danger task-action" data-action="delete" data-task-id="${task.id}">Delete</button>
        `;

    return `
      <div class="task-card ${priorityClass}" data-task-id="${task.id}">
        <div class="task-header">
          <div class="task-meta">
            ${priorityIcon}
            ${statusBadge}
            ${collectionBadge}
          </div>
          ${dueDateHtml}
        </div>
        <div class="task-body">
          <h3 class="task-summary">${this.escapeHtml(task.summary)}</h3>
          ${tabReferenceBadge}
        </div>
        <div class="task-actions">
          ${actionButtons}
        </div>
      </div>
    `;
  }

  /**
   * Get priority CSS class
   */
  getPriorityClass(priority) {
    const map = {
      critical: 'priority-critical',
      high: 'priority-high',
      medium: 'priority-medium',
      low: 'priority-low'
    };
    return map[priority] || map.medium;
  }

  /**
   * Get priority icon
   */
  getPriorityIcon(priority) {
    if (priority === 'critical' || priority === 'high') {
      return '<span class="priority-icon priority-high-icon">🔴</span>';
    }
    return '<span class="priority-icon priority-low-icon">⚪</span>';
  }

  /**
   * Get status badge HTML
   */
  getStatusBadge(status) {
    const statusLabels = {
      open: 'Open',
      active: 'Active',
      fixed: 'Fixed',
      abandoned: 'Abandoned'
    };
    const label = statusLabels[status] || statusLabels.open;
    return `<span class="status-badge status-${status}">${label}</span>`;
  }

  /**
   * Render due date
   */
  renderDueDate(dueDate) {
    if (!dueDate) return '';

    const now = Date.now();
    const isOverdue = dueDate < now;
    const dueDateStr = new Date(dueDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: dueDate - now > 365 * 24 * 60 * 60 * 1000 ? 'numeric' : undefined
    });

    return `
      <div class="task-due-date ${isOverdue ? 'overdue' : ''}">
        ${isOverdue ? '⚠️ ' : ''}Due ${dueDateStr}
      </div>
    `;
  }

  /**
   * Render collection badge
   */
  renderCollectionBadge(collectionId) {
    if (!collectionId) return '';

    const collection = this.getCollection(collectionId);
    if (!collection) return '';

    const isActive = collection.isActive;
    const activeIndicator = isActive ? ' 🟢' : '';

    return `
      <span class="collection-badge" data-collection-id="${collectionId}">
        ${this.escapeHtml(collection.name || 'Unnamed')}${activeIndicator}
      </span>
    `;
  }

  /**
   * Render tab references
   */
  /**
   * Render tab reference badge for task cards (Phase 11)
   * Clickable badge that opens associated tabs
   */
  renderTabReferenceBadge(tabReferences, taskId) {
    if (!tabReferences || tabReferences.length === 0) {
      return '';
    }

    const tabCount = tabReferences.length;
    const tabWord = tabCount === 1 ? 'tab' : 'tabs';
    const firstRef = tabReferences[0];
    const favicon = firstRef.favIconUrl || getFallbackFavicon(firstRef.url);

    return `
      <button class="tab-reference-badge" data-action="open-tabs" data-task-id="${taskId}" title="Open ${tabCount} associated ${tabWord}">
        <img class="favicon" src="${this.escapeHtml(favicon)}" width="12" height="12" alt="" onerror="this.src='chrome://favicon/'">
        <span class="tab-count">${tabCount} ${tabWord}</span>
      </button>
    `;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Only attach listeners once to prevent duplicate handlers
    if (this.eventListenersAttached) {
      return;
    }

    this.eventListenersAttached = true;

    // Task action buttons
    this.contentContainer?.addEventListener('click', async (e) => {
      const actionBtn = e.target.closest('.task-action');
      if (actionBtn) {
        e.preventDefault();
        e.stopPropagation();

        const action = actionBtn.dataset.action;
        const taskId = actionBtn.dataset.taskId;
        const collectionId = actionBtn.dataset.collectionId;

        switch (action) {
          case 'open-tabs':
            await this.handleOpenTabs(taskId);
            break;
          case 'mark-fixed':
            await this.handleMarkFixed(taskId);
            break;
          case 'edit':
            await this.handleEditTask(taskId);
            break;
          case 'view-collection':
            this.handleViewCollection(collectionId);
            break;
          case 'delete':
            await this.handleDeleteTask(taskId);
            break;
        }
        return; // Prevent further event processing
      }

      // Toggle completed section
      const toggleHeader = e.target.closest('[data-toggle-section]');
      if (toggleHeader) {
        const sectionId = toggleHeader.dataset.toggleSection;
        const section = this.contentContainer.querySelector(`[data-section-id="${sectionId}"]`);
        if (section) {
          section.classList.toggle('collapsed');
        }
      }
    });
  }

  /**
   * Handle opening task tabs
   * Phase 6 feature - placeholder for now
   */
  async handleOpenTabs(taskId) {
    try {
      notifications.show('Opening task tabs...', 'info');

      const response = await chrome.runtime.sendMessage({
        action: 'openTaskTabs',
        taskId
      });

      if (response.error) {
        throw new Error(response.error);
      }

      // Phase 11: response.tabsOpened (not response.opened)
      const tabsOpened = response.tabsOpened || 0;
      notifications.show(`Opened ${tabsOpened} tab${tabsOpened === 1 ? '' : 's'}`, 'success');

      // Refresh data
      await this.controller.loadData();
    } catch (error) {
      console.error('Error opening task tabs:', error);
      notifications.show(
        error.message || 'Failed to open task tabs',
        'error'
      );
    }
  }

  /**
   * Handle marking task as fixed
   */
  async handleMarkFixed(taskId) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'updateTask',
        id: taskId,
        updates: {
          status: 'fixed'
        }
      });

      if (response.error) {
        throw new Error(response.error);
      }

      // Show success with undo notification
      notifications.show('Task marked as fixed', 'success');

      // Refresh data
      await this.controller.loadData();
    } catch (error) {
      console.error('Error marking task as fixed:', error);
      notifications.show(
        error.message || 'Failed to mark task as fixed',
        'error'
      );
    }
  }

  /**
   * Handle editing task
   */
  async handleEditTask(taskId) {
    try {
      // Get task data
      const response = await chrome.runtime.sendMessage({
        action: 'getTask',
        id: taskId
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const task = response.task;

      // Show edit modal
      this.showEditTaskModal(task);
    } catch (error) {
      console.error('Error loading task for edit:', error);
      notifications.show(
        error.message || 'Failed to load task',
        'error'
      );
    }
  }

  /**
   * Handle delete task
   */
  async handleDeleteTask(taskId) {
    try {
      // Get task data for confirmation
      const response = await chrome.runtime.sendMessage({
        action: 'getTask',
        id: taskId
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const task = response.task;

      // Show confirmation modal
      const confirmed = await this.showDeleteConfirmation(task);
      if (!confirmed) return;

      // Delete the task via message
      const deleteResponse = await chrome.runtime.sendMessage({
        action: 'deleteTask',
        id: taskId
      });

      if (deleteResponse && deleteResponse.success) {
        notifications.success(`Task "${task.summary}" deleted`);
        // Reload data
        await this.controller.loadData();
      } else {
        throw new Error(deleteResponse?.error || 'Delete failed');
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
      notifications.error('Failed to delete task');
    }
  }

  /**
   * Show delete confirmation modal
   */
  async showDeleteConfirmation(task) {
    return new Promise((resolve) => {
      const collectionInfo = task.collectionId
        ? `<p>This task is part of the collection. The collection will not be affected.</p>`
        : '';

      modal.open({
        title: 'Delete Task',
        content: `
          <p>Are you sure you want to delete this task?</p>
          <p class="task-summary-preview"><strong>"${this.escapeHtml(task.summary)}"</strong></p>
          ${collectionInfo}
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
   * Show edit task modal
   */
  async showEditTaskModal(task) {
    // Build collection options
    const collectionOptions = this.collections
      ? this.collections.map(c => `
          <option value="${c.id}" ${task.collectionId === c.id ? 'selected' : ''}>
            ${this.escapeHtml(c.name)}
          </option>
        `).join('')
      : '';

    // Phase 11: Render existing tab references or empty state
    const tabReferencesHtml = await TabChipRenderer.renderTabReferences(
      task.tabReferences || [],
      this.escapeHtml.bind(this)
    );

    const formHtml = `
      <form id="edit-task-form" class="modal-form">
        <div class="form-group">
          <label for="task-summary">Summary *</label>
          <input
            type="text"
            id="task-summary"
            name="summary"
            class="form-control"
            value="${this.escapeHtml(task.summary)}"
            required
            maxlength="255"
          >
        </div>

        <!-- Phase 11: Tab Association Section -->
        <div class="tab-association-section" id="tab-association-section">
          <label class="section-label">Context</label>
          <div class="tab-chip-container" id="tab-chip-container">
            ${tabReferencesHtml}
          </div>
          <p class="helper-text">Quick access to tabs</p>
        </div>

        <div class="form-group">
          <label for="task-notes">Notes</label>
          <textarea
            id="task-notes"
            name="notes"
            class="form-control"
            rows="4"
          >${this.escapeHtml(task.notes || '')}</textarea>
        </div>

        <div class="form-group">
          <label for="task-collection">Collection</label>
          <select id="task-collection" name="collectionId" class="form-control">
            <option value="" ${!task.collectionId ? 'selected' : ''}>Uncategorized</option>
            ${collectionOptions}
          </select>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="task-priority">Priority</label>
            <select id="task-priority" name="priority" class="form-control">
              <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Low</option>
              <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="high" ${task.priority === 'high' ? 'selected' : ''}>High</option>
              <option value="critical" ${task.priority === 'critical' ? 'selected' : ''}>Critical</option>
            </select>
          </div>

          <div class="form-group">
            <label for="task-status">Status</label>
            <select id="task-status" name="status" class="form-control">
              <option value="open" ${task.status === 'open' ? 'selected' : ''}>Open</option>
              <option value="active" ${task.status === 'active' ? 'selected' : ''}>Active</option>
              <option value="fixed" ${task.status === 'fixed' ? 'selected' : ''}>Fixed</option>
              <option value="abandoned" ${task.status === 'abandoned' ? 'selected' : ''}>Abandoned</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label for="task-due-date">Due Date</label>
          <input
            type="date"
            id="task-due-date"
            name="dueDate"
            class="form-control"
            value="${task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''}"
          >
        </div>

        <div class="form-group">
          <label for="task-tags">Tags (comma-separated)</label>
          <input
            type="text"
            id="task-tags"
            name="tags"
            class="form-control"
            value="${(task.tags || []).join(', ')}"
          >
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-modal-cancel>Cancel</button>
          <button type="submit" class="btn btn-primary">Save Changes</button>
        </div>
      </form>
    `;

    modal.open({
      title: 'Edit Task',
      content: formHtml
    });

    // Attach form handler and tab chip handlers after modal is created
    requestAnimationFrame(() => {
      const form = document.getElementById('edit-task-form');
      const cancelBtn = form?.querySelector('[data-modal-cancel]');

      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.saveTaskEdits(task.id, new FormData(form));
      });

      cancelBtn?.addEventListener('click', () => {
        modal.close();
      });

      // Setup tab chip interaction handlers
      TabChipRenderer.setupTabChipHandlers(
        '#tab-chip-container',
        task.tabReferences || [],
        this.escapeHtml.bind(this),
        { multipleMode: true } // Multiple tabs allowed in edit modal
      );
    });
  }

  /**
   * Save task edits
   */
  async saveTaskEdits(taskId, formData) {
    try {
      const summary = formData.get('summary')?.trim();
      if (!summary) {
        notifications.show('Summary is required', 'error');
        return;
      }

      const collectionId = formData.get('collectionId') || null;

      const updates = {
        summary,
        notes: formData.get('notes')?.trim() || '',
        collectionId: collectionId === '' ? null : collectionId,
        priority: formData.get('priority'),
        status: formData.get('status'),
        tags: formData.get('tags')
          ?.split(',')
          .map(t => t.trim())
          .filter(t => t.length > 0) || []
      };

      const dueDateStr = formData.get('dueDate');
      if (dueDateStr) {
        updates.dueDate = new Date(dueDateStr).getTime();
      } else {
        updates.dueDate = null;
      }

      // Phase 11: Include updated tab references
      const container = document.getElementById('tab-chip-container');
      if (container?.dataset.tabReferences) {
        try {
          updates.tabReferences = JSON.parse(container.dataset.tabReferences);
        } catch (error) {
          console.warn('[Phase 11] Failed to parse tab references:', error);
          updates.tabReferences = [];
        }
      } else {
        updates.tabReferences = [];
      }

      const response = await chrome.runtime.sendMessage({
        action: 'updateTask',
        id: taskId,
        updates
      });

      if (response.error) {
        throw new Error(response.error);
      }

      modal.close();
      notifications.show('Task updated successfully', 'success');

      // Refresh data
      await this.controller.loadData();
    } catch (error) {
      console.error('Error saving task edits:', error);
      notifications.show(
        error.message || 'Failed to save task edits',
        'error'
      );
    }
  }

  /**
   * Handle viewing collection
   */
  handleViewCollection(collectionId) {
    if (!collectionId) return;

    // Switch to collections view and navigate to collection detail
    this.controller.switchView('collections');

    // Trigger collection detail view
    setTimeout(() => {
      this.controller.collectionDetailView?.showCollectionDetail(collectionId);
    }, 100);
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

  // Phase 11: Tab chip rendering moved to TabChipRenderer component
  // See: /sidepanel/components/tab-chip-renderer.js
  // The following methods are DEPRECATED and should be removed:
  // - renderTabReferences()
  // - renderTabChip()
  // - renderEmptyTabState()
  // - setupTabChipHandlers()
  // - renderTabReferenceBadge()

  /**
   * @deprecated Use TabChipRenderer.renderTabReferences() instead
   * Render tab references HTML (for edit modal)
   * Phase 11: Tab-Task Association
   */
  async renderTabReferences(tabReferences) {
    if (!tabReferences || tabReferences.length === 0) {
      return this.renderEmptyTabState();
    }

    // Check which tabs are still open
    const referencesWithStatus = await Promise.all(
      tabReferences.map(async (ref) => ({
        ...ref,
        isOpen: await isTabOpen(ref.chromeTabId)
      }))
    );

    return referencesWithStatus.map(ref => this.renderTabChip(ref)).join('');
  }

  /**
   * Render single tab chip
   * Phase 11: Tab-Task Association
   */
  renderTabChip(tabRef) {
    const favicon = tabRef.favIconUrl || getFallbackFavicon(tabRef.url);
    const title = formatTabTitle(tabRef.title || tabRef.url, 35);
    const isActive = tabRef.isOpen !== false; // Assume open if not checked

    return `
      <div class="tab-chip ${isActive ? 'active' : 'inactive'}" data-tab-ref='${JSON.stringify(tabRef).replace(/'/g, "&#39;")}'>
        <img class="favicon" src="${this.escapeHtml(favicon)}" width="16" height="16" alt="" onerror="this.src='chrome://favicon/'">
        <span class="tab-title">${this.escapeHtml(title)}</span>
        ${!isActive ? '<span class="status-badge">Closed</span>' : ''}
        <button class="remove-btn" aria-label="Remove tab reference" title="Remove tab reference">×</button>
      </div>
    `;
  }

  /**
   * Render empty tab state (unlinked)
   * Phase 11: Tab-Task Association
   */
  renderEmptyTabState() {
    return `
      <button class="add-current-tab-btn subtle" id="add-current-tab-btn">
        <span class="icon">🔗</span>
        <span>Link to current tab</span>
      </button>
    `;
  }

  /**
   * Setup tab chip interaction handlers (for edit modal)
   * Phase 11: Tab-Task Association
   */
  setupTabChipHandlers(existingReferences) {
    const container = document.getElementById('tab-chip-container');
    if (!container) return;

    let currentReferences = [...existingReferences];

    // Store references in container for access during form submission
    container.dataset.tabReferences = JSON.stringify(currentReferences);

    // Handle clicks on container (event delegation)
    container.addEventListener('click', async (e) => {
      // Handle remove button click
      const removeBtn = e.target.closest('.remove-btn');
      if (removeBtn) {
        const chip = removeBtn.closest('.tab-chip');
        if (chip) {
          try {
            const tabRef = JSON.parse(chip.dataset.tabRef);
            // Remove this reference from array
            currentReferences = currentReferences.filter(
              ref => ref.chromeTabId !== tabRef.chromeTabId
            );
            container.dataset.tabReferences = JSON.stringify(currentReferences);

            // Re-render
            container.innerHTML = currentReferences.length > 0
              ? currentReferences.map(ref => this.renderTabChip(ref)).join('')
              : this.renderEmptyTabState();
          } catch (error) {
            console.warn('[Phase 11] Failed to parse tab ref:', error);
          }
        }
        return;
      }

      // Handle add current tab button click
      const addBtn = e.target.closest('.add-current-tab-btn');
      if (addBtn) {
        const snapshot = await getCurrentTabSnapshot();
        if (snapshot) {
          // Add to references (avoid duplicates by chromeTabId)
          const exists = currentReferences.some(ref => ref.chromeTabId === snapshot.chromeTabId);
          if (!exists) {
            currentReferences.push(snapshot);
            container.dataset.tabReferences = JSON.stringify(currentReferences);
            container.innerHTML = currentReferences.map(ref => this.renderTabChip(ref)).join('');
          } else {
            notifications.show('This tab is already linked', 'info');
          }
        } else {
          notifications.show('No active tab found', 'warning');
        }
      }
    });
  }
}
