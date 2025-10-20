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

export class TasksView {
  constructor(controller) {
    this.controller = controller;
    this.contentContainer = null;
    this.collections = null; // Cache for collection lookups
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
   * Render tasks with collections context
   */
  render(tasks, collections) {
    if (!tasks || tasks.length === 0) {
      this.renderEmpty();
      return;
    }

    // Cache collections for lookups
    this.collections = collections || [];

    // Group tasks
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

    // Attach event listeners
    this.attachEventListeners();
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
    const tabReferences = this.renderTabReferences(task.tabIds, task.collectionId);

    const actionButtons = isCompleted
      ? `<button class="btn btn-link task-action" data-action="view-collection" data-collection-id="${task.collectionId || ''}" ${!task.collectionId ? 'disabled' : ''}>View Collection</button>`
      : `
          <button class="btn btn-primary task-action" data-action="open-tabs" data-task-id="${task.id}">Open Tabs</button>
          <button class="btn btn-secondary task-action" data-action="mark-fixed" data-task-id="${task.id}">Mark Fixed</button>
          <button class="btn btn-link task-action" data-action="edit" data-task-id="${task.id}">Edit</button>
          ${task.collectionId ? `<button class="btn btn-link task-action" data-action="view-collection" data-collection-id="${task.collectionId}">View Collection</button>` : ''}
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
          ${tabReferences}
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
  renderTabReferences(tabIds, collectionId) {
    if (!tabIds || tabIds.length === 0) {
      return '';
    }

    // For now, just show count
    // In Phase 6, we'll fetch actual tab data and show names
    const tabCount = tabIds.length;
    const tabWord = tabCount === 1 ? 'tab' : 'tabs';

    return `
      <div class="task-tab-refs">
        → ${tabCount} ${tabWord}
      </div>
    `;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Task action buttons
    this.contentContainer?.addEventListener('click', async (e) => {
      const actionBtn = e.target.closest('.task-action');
      if (actionBtn) {
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
        }
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

      notifications.show(`Opened ${response.opened || 0} tabs`, 'success');

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
        taskId,
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
        taskId
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
   * Show edit task modal
   */
  showEditTaskModal(task) {
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

        <div class="form-group">
          <label for="task-notes">Notes</label>
          <textarea
            id="task-notes"
            name="notes"
            class="form-control"
            rows="4"
          >${this.escapeHtml(task.notes || '')}</textarea>
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

    // Attach form handler after modal is created
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

      const updates = {
        summary,
        notes: formData.get('notes')?.trim() || '',
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

      const response = await chrome.runtime.sendMessage({
        action: 'updateTask',
        taskId,
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
}
