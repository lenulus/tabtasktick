// Tasks Base Module
// Shared infrastructure for Kanban and List views

import {
  debounce,
  getTimeAgo,
  escapeHtml
} from '../core/utils.js';

import state from '../core/state.js';

import {
  showNotification
} from '../core/shared-utils.js';

import modalService from '../core/modal-service.js';

// ============================================================================
// Data Loading
// ============================================================================

export async function loadTasksData() {
  try {
    const [tasksResponse, collectionsResponse] = await Promise.all([
      chrome.runtime.sendMessage({ action: 'getTasks' }),
      chrome.runtime.sendMessage({ action: 'getCollections' })
    ]);

    const tasks = tasksResponse?.tasks || [];
    const collections = collectionsResponse?.collections || [];

    state.set('tasks', tasks);
    state.set('collections', collections);

    return { tasks, collections };
  } catch (error) {
    console.error('Error loading tasks data:', error);
    throw error;
  }
}

// ============================================================================
// Task Filtering
// ============================================================================

export function filterTasks(tasks, filters) {
  return tasks.filter(task => {
    // Search filter
    if (filters.search) {
      const searchable = [
        task.summary,
        task.notes,
        ...(task.tags || [])
      ].join(' ').toLowerCase();

      if (!searchable.includes(filters.search.toLowerCase())) {
        return false;
      }
    }

    // Status filter
    if (filters.status && filters.status.length > 0) {
      if (!filters.status.includes(task.status)) {
        return false;
      }
    }

    // Priority filter
    if (filters.priority && filters.priority.length > 0) {
      if (!filters.priority.includes(task.priority)) {
        return false;
      }
    }

    // Collection filter (supports both array and single value)
    if (filters.collection) {
      const collections = Array.isArray(filters.collection) ? filters.collection : [filters.collection];

      if (collections.length > 0) {
        let matched = false;

        for (const collection of collections) {
          if (collection === 'uncategorized' || collection === '') {
            // Match uncategorized tasks
            if (!task.collectionId) {
              matched = true;
              break;
            }
          } else {
            // Match specific collection
            if (task.collectionId === collection) {
              matched = true;
              break;
            }
          }
        }

        if (!matched) return false;
      }
    }

    return true;
  });
}

// ============================================================================
// Task Sorting
// ============================================================================

export function sortTasks(tasks, sortBy, sortDirection = 'asc') {
  const sorted = [...tasks];

  sorted.sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'priority':
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        comparison = (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
        break;

      case 'dueDate':
        const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        comparison = aDate - bDate;
        break;

      case 'created':
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;

      case 'alpha':
        comparison = a.summary.localeCompare(b.summary);
        break;

      default:
        comparison = 0;
    }

    return sortDirection === 'desc' ? -comparison : comparison;
  });

  return sorted;
}

// ============================================================================
// Task Detail Modal
// ============================================================================

export function showTaskDetailModal(task, collections) {
  // Create modal using ModalService if it doesn't exist
  if (!modalService.exists('taskDetailModal')) {
    const bodyHtml = `
        <input type="hidden" id="taskDetailId">

        <div class="form-group">
          <label for="taskDetailSummary">Summary</label>
          <input type="text" id="taskDetailSummary" class="form-control" placeholder="Task summary">
        </div>

        <div class="form-group">
          <label for="taskDetailNotes">Notes</label>
          <textarea id="taskDetailNotes" class="form-control" rows="4" placeholder="Task notes"></textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="taskDetailStatus">Status</label>
            <select id="taskDetailStatus" class="form-control">
              <option value="open">Open</option>
              <option value="active">Active</option>
              <option value="fixed">Fixed</option>
              <option value="abandoned">Abandoned</option>
            </select>
          </div>

          <div class="form-group">
            <label for="taskDetailPriority">Priority</label>
            <select id="taskDetailPriority" class="form-control">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div class="form-group">
            <label for="taskDetailDueDate">Due Date</label>
            <input type="date" id="taskDetailDueDate" class="form-control">
          </div>
        </div>

        <div class="form-group">
          <label for="taskDetailCollection">Collection</label>
          <select id="taskDetailCollection" class="form-control">
            <option value="">Uncategorized</option>
          </select>
        </div>

        <div class="form-group">
          <label for="taskDetailTags">Tags (comma-separated)</label>
          <input type="text" id="taskDetailTags" class="form-control" placeholder="tag1, tag2, tag3">
        </div>
    `;

    const footerHtml = `
      <button class="btn btn-danger" id="deleteTaskBtn">Delete</button>
      <button class="btn btn-secondary" id="cancelTaskDetailBtn">Cancel</button>
      <button class="btn btn-primary" id="saveTaskDetailBtn">Save</button>
    `;

    modalService.create({
      id: 'taskDetailModal',
      title: 'Task Details',
      size: 'lg',
      body: bodyHtml,
      footer: footerHtml,
      events: {
        '#cancelTaskDetailBtn': hideTaskDetailModal,
        '#saveTaskDetailBtn': handleSaveTaskDetail,
        '#deleteTaskBtn': handleDeleteTask
      }
    });
  }

  // Populate modal with task data
  document.getElementById('taskDetailId').value = task.id;
  document.getElementById('taskDetailSummary').value = task.summary || '';
  document.getElementById('taskDetailNotes').value = task.notes || '';
  document.getElementById('taskDetailStatus').value = task.status || 'open';
  document.getElementById('taskDetailPriority').value = task.priority || 'medium';
  document.getElementById('taskDetailDueDate').value = task.dueDate || '';
  document.getElementById('taskDetailTags').value = (task.tags || []).join(', ');

  // Populate collection dropdown
  const collectionSelect = document.getElementById('taskDetailCollection');
  collectionSelect.innerHTML = '<option value="">Uncategorized</option>';
  collections.forEach(collection => {
    const option = document.createElement('option');
    option.value = collection.id;
    option.textContent = collection.name;
    if (collection.id === task.collectionId) {
      option.selected = true;
    }
    collectionSelect.appendChild(option);
  });

  // Show modal
  modalService.show('taskDetailModal');
}

export function hideTaskDetailModal() {
  modalService.hide('taskDetailModal');
}

async function handleSaveTaskDetail() {
  const taskId = document.getElementById('taskDetailId').value;
  const summary = document.getElementById('taskDetailSummary').value.trim();

  if (!summary) {
    showNotification('Summary is required', 'error');
    return;
  }

  const tags = document.getElementById('taskDetailTags').value
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  const taskData = {
    summary,
    notes: document.getElementById('taskDetailNotes').value.trim(),
    status: document.getElementById('taskDetailStatus').value,
    priority: document.getElementById('taskDetailPriority').value,
    dueDate: document.getElementById('taskDetailDueDate').value || null,
    collectionId: document.getElementById('taskDetailCollection').value || null,
    tags,
    tabIds: []
  };

  // Check if this is a new task or an update
  const tasks = state.get('tasks') || [];
  const existingTask = tasks.find(t => t.id === taskId);
  const isNewTask = !existingTask;

  try {
    let result;

    if (isNewTask) {
      // Create new task
      result = await chrome.runtime.sendMessage({
        action: 'createTask',
        params: {
          id: taskId,
          ...taskData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });

      if (result.success) {
        showNotification('Task created', 'success');
      }
    } else {
      // Update existing task
      result = await chrome.runtime.sendMessage({
        action: 'updateTask',
        id: taskId,
        updates: taskData
      });

      if (result.success) {
        showNotification('Task updated', 'success');
      }
    }

    if (result.success) {
      hideTaskDetailModal();

      // Trigger refresh
      const event = new CustomEvent(isNewTask ? 'taskCreated' : 'taskUpdated', { detail: { taskId } });
      window.dispatchEvent(event);
    } else {
      showNotification(`Failed to ${isNewTask ? 'create' : 'update'} task`, 'error');
    }
  } catch (error) {
    console.error(`Error ${isNewTask ? 'creating' : 'updating'} task:`, error);
    showNotification(`Failed to ${isNewTask ? 'create' : 'update'} task`, 'error');
  }
}

async function handleDeleteTask() {
  const taskId = document.getElementById('taskDetailId').value;
  const summary = document.getElementById('taskDetailSummary').value;

  if (!confirm(`Delete task "${summary}"?`)) {
    return;
  }

  try {
    const result = await chrome.runtime.sendMessage({
      action: 'deleteTask',
      id: taskId
    });

    if (result.success) {
      showNotification('Task deleted', 'success');
      hideTaskDetailModal();

      // Trigger refresh
      const event = new CustomEvent('taskDeleted', { detail: { taskId } });
      window.dispatchEvent(event);
    } else {
      showNotification('Failed to delete task', 'error');
    }
  } catch (error) {
    console.error('Error deleting task:', error);
    showNotification('Failed to delete task', 'error');
  }
}

// ============================================================================
// Bulk Actions
// ============================================================================

export function setupBulkActions(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  const bulkBar = document.getElementById('tasksBulkBar');
  if (!bulkBar) return;

  // Track selected tasks
  const selectedTasks = new Set();

  // Checkbox delegation
  container.addEventListener('change', (e) => {
    if (e.target.classList.contains('task-checkbox')) {
      const taskId = e.target.dataset.taskId;

      if (e.target.checked) {
        selectedTasks.add(taskId);
      } else {
        selectedTasks.delete(taskId);
      }

      updateBulkBar(selectedTasks, bulkBar);
    }
  });

  return selectedTasks;
}

function updateBulkBar(selectedTasks, bulkBar) {
  const count = selectedTasks.size;
  const countSpan = bulkBar.querySelector('.bulk-count');

  if (count > 0) {
    bulkBar.style.display = 'flex';
    if (countSpan) {
      countSpan.textContent = `${count} task${count !== 1 ? 's' : ''} selected`;
    }
  } else {
    bulkBar.style.display = 'none';
  }
}

export async function handleBulkAction(action, selectedTaskIds) {
  if (selectedTaskIds.size === 0) {
    showNotification('No tasks selected', 'warning');
    return;
  }

  const taskIds = Array.from(selectedTaskIds);

  try {
    switch (action) {
      case 'changeStatus': {
        const status = prompt('Enter status (open/active/fixed/abandoned):');
        if (!status) return;

        await bulkUpdateTasks(taskIds, { status });
        break;
      }

      case 'changePriority': {
        const priority = prompt('Enter priority (low/medium/high/critical):');
        if (!priority) return;

        await bulkUpdateTasks(taskIds, { priority });
        break;
      }

      case 'delete': {
        if (!confirm(`Delete ${taskIds.length} task(s)?`)) return;

        await bulkDeleteTasks(taskIds);
        break;
      }

      default:
        showNotification(`Unknown action: ${action}`, 'error');
    }
  } catch (error) {
    console.error('Error in bulk action:', error);
    showNotification(`Failed to ${action} tasks`, 'error');
  }
}

async function bulkUpdateTasks(taskIds, updates) {
  let successCount = 0;

  for (const taskId of taskIds) {
    try {
      await chrome.runtime.sendMessage({
        action: 'updateTask',
        id: taskId,
        updates
      });
      successCount++;
    } catch (error) {
      console.error(`Error updating task ${taskId}:`, error);
    }
  }

  showNotification(`Updated ${successCount} of ${taskIds.length} tasks`, 'success');

  // Trigger refresh
  const event = new CustomEvent('tasksUpdated');
  window.dispatchEvent(event);
}

async function bulkDeleteTasks(taskIds) {
  let successCount = 0;

  for (const taskId of taskIds) {
    try {
      await chrome.runtime.sendMessage({
        action: 'deleteTask',
        id: taskId
      });
      successCount++;
    } catch (error) {
      console.error(`Error deleting task ${taskId}:`, error);
    }
  }

  showNotification(`Deleted ${successCount} of ${taskIds.length} tasks`, 'success');

  // Trigger refresh
  const event = new CustomEvent('tasksUpdated');
  window.dispatchEvent(event);
}

// ============================================================================
// Shared UI Helpers
// ============================================================================

export function renderPriorityBadge(priority) {
  const priorityColors = {
    critical: '#f5576c',
    high: '#fa709a',
    medium: '#667eea',
    low: '#4facfe'
  };

  const color = priorityColors[priority] || priorityColors.medium;
  const emoji = priority === 'critical' || priority === 'high' ? '🔴' : '⚪';

  return `<span class="priority-badge" style="background-color: ${color}; color: white;">
    ${emoji} ${priority.charAt(0).toUpperCase() + priority.slice(1)}
  </span>`;
}

export function renderStatusBadge(status) {
  const statusColors = {
    open: '#667eea',
    active: '#4facfe',
    fixed: '#43e97b',
    abandoned: '#999'
  };

  const color = statusColors[status] || statusColors.open;

  return `<span class="status-badge" style="background-color: ${color}; color: white;">
    ${status.charAt(0).toUpperCase() + status.slice(1)}
  </span>`;
}

export function renderDueDate(dueDate) {
  if (!dueDate) return '';

  const due = new Date(dueDate);
  const now = new Date();
  const isOverdue = due < now;

  return `<span class="due-date ${isOverdue ? 'overdue' : ''}">
    ${isOverdue ? '⚠️ ' : ''}${getTimeAgo(due.getTime())}
  </span>`;
}

export function renderEmptyState(type, message = '') {
  let html = '';

  if (type === 'empty') {
    html = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M9 11l3 3L22 4"></path>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
        </svg>
        <h3>No Tasks Yet</h3>
        <p>Create tasks to track your work in collections.</p>
        <button class="btn btn-primary" id="createFirstTask">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Create Your First Task
        </button>
      </div>
    `;
  } else if (type === 'error') {
    html = `
      <div class="empty-state error">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <h3>Failed to Load Tasks</h3>
        <p>${escapeHtml(message || 'An error occurred while loading tasks.')}</p>
        <button class="btn btn-primary" onclick="window.location.reload()">Retry</button>
      </div>
    `;
  } else if (type === 'no-results') {
    html = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
        <h3>No Results Found</h3>
        <p>Try adjusting your search or filter criteria.</p>
      </div>
    `;
  }

  return html;
}

// ============================================================================
// Keyboard Shortcuts (Phase 10)
// ============================================================================

export function setupTasksKeyboardShortcuts(keyboardShortcuts) {
  // Create New Task (n or c)
  keyboardShortcuts.register('n', async () => {
    const collections = state.get('collections') || [];
    const newTask = {
      id: crypto.randomUUID(),
      summary: '',
      notes: '',
      status: 'open',
      priority: 'medium',
      dueDate: null,
      collectionId: null,
      tags: [],
      tabIds: []
    };
    showTaskDetailModal(newTask, collections);
    keyboardShortcuts.showShortcutToast('Create new task (n)');
  }, {
    category: 'tasks',
    description: 'Create new task',
    context: 'tasks'
  });

  keyboardShortcuts.register('c', async () => {
    const collections = state.get('collections') || [];
    const newTask = {
      id: crypto.randomUUID(),
      summary: '',
      notes: '',
      status: 'open',
      priority: 'medium',
      dueDate: null,
      collectionId: null,
      tags: [],
      tabIds: []
    };
    showTaskDetailModal(newTask, collections);
  }, {
    category: 'tasks',
    description: 'Create new task',
    context: 'tasks'
  });

  // Edit Selected Task (e)
  keyboardShortcuts.register('e', () => {
    const focusedItem = keyboardShortcuts.getFocusedItem();
    if (focusedItem) {
      const taskId = focusedItem.dataset.taskId;
      if (taskId) {
        const tasks = state.get('tasks') || [];
        const collections = state.get('collections') || [];
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          showTaskDetailModal(task, collections);
        }
      }
    }
  }, {
    category: 'tasks',
    description: 'Edit selected task',
    context: 'tasks'
  });

  // Delete Selected Task (d)
  keyboardShortcuts.register('d', async () => {
    const focusedItem = keyboardShortcuts.getFocusedItem();
    if (focusedItem) {
      const taskId = focusedItem.dataset.taskId;
      if (taskId) {
        if (confirm('Are you sure you want to delete this task?')) {
          try {
            await chrome.runtime.sendMessage({
              action: 'deleteTask',
              taskId
            });
            showNotification('Task deleted', 'success');
            // Reload current view
            const currentView = state.get('tasksViewPreference') || 'kanban';
            if (currentView === 'kanban') {
              const { loadKanbanView } = await import('./tasks-kanban.js');
              loadKanbanView();
            } else {
              const { loadListView } = await import('./tasks-list.js');
              loadListView();
            }
          } catch (error) {
            console.error('Failed to delete task:', error);
            showNotification('Failed to delete task', 'error');
          }
        }
      }
    }
  }, {
    category: 'tasks',
    description: 'Delete selected task',
    context: 'tasks'
  });

  // Set Priority (1-4)
  const priorities = ['low', 'medium', 'high', 'critical'];
  priorities.forEach((priority, index) => {
    keyboardShortcuts.register((index + 1).toString(), async () => {
      const focusedItem = keyboardShortcuts.getFocusedItem();
      if (focusedItem) {
        const taskId = focusedItem.dataset.taskId;
        if (taskId) {
          try {
            await chrome.runtime.sendMessage({
              action: 'updateTask',
              id: taskId,
              updates: { priority }
            });
            showNotification(`Priority set to ${priority}`, 'success');
            // Reload current view
            const currentView = state.get('tasksViewPreference') || 'kanban';
            if (currentView === 'kanban') {
              const { loadKanbanView } = await import('./tasks-kanban.js');
              loadKanbanView();
            } else {
              const { loadListView } = await import('./tasks-list.js');
              loadListView();
            }
          } catch (error) {
            console.error('Failed to update priority:', error);
            showNotification('Failed to update priority', 'error');
          }
        }
      }
    }, {
      category: 'tasks',
      description: `Set priority to ${priority}`,
      context: 'tasks'
    });
  });

  // Cycle Status (s)
  keyboardShortcuts.register('s', async () => {
    const focusedItem = keyboardShortcuts.getFocusedItem();
    if (focusedItem) {
      const taskId = focusedItem.dataset.taskId;
      if (taskId) {
        const tasks = state.get('tasks') || [];
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          const statusCycle = ['open', 'active', 'fixed'];
          const currentIndex = statusCycle.indexOf(task.status);
          const nextStatus = statusCycle[(currentIndex + 1) % statusCycle.length];

          try {
            await chrome.runtime.sendMessage({
              action: 'updateTask',
              id: taskId,
              updates: { status: nextStatus }
            });
            showNotification(`Status changed to ${nextStatus}`, 'success');
            // Reload current view
            const currentView = state.get('tasksViewPreference') || 'kanban';
            if (currentView === 'kanban') {
              const { loadKanbanView } = await import('./tasks-kanban.js');
              loadKanbanView();
            } else {
              const { loadListView } = await import('./tasks-list.js');
              loadListView();
            }
          } catch (error) {
            console.error('Failed to update status:', error);
            showNotification('Failed to update status', 'error');
          }
        }
      }
    }
  }, {
    category: 'tasks',
    description: 'Cycle status (open → active → fixed)',
    context: 'tasks'
  });

  // Enter - Open detail modal
  keyboardShortcuts.register('enter', () => {
    const focusedItem = keyboardShortcuts.getFocusedItem();
    if (focusedItem) {
      const taskId = focusedItem.dataset.taskId;
      if (taskId) {
        const tasks = state.get('tasks') || [];
        const collections = state.get('collections') || [];
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          showTaskDetailModal(task, collections);
        }
      }
    }
  }, {
    category: 'tasks',
    description: 'Open task detail',
    context: 'tasks'
  });

  // Open tabs for selected task (t)
  keyboardShortcuts.register('t', async () => {
    const focusedItem = keyboardShortcuts.getFocusedItem();
    if (focusedItem) {
      const taskId = focusedItem.dataset.taskId;
      if (taskId) {
        const tasks = state.get('tasks') || [];
        const task = tasks.find(t => t.id === taskId);
        if (task && task.tabIds && task.tabIds.length > 0) {
          try {
            // Focus the tabs associated with this task
            // THIN - delegate to TabActionsService via message passing
            for (const tabId of task.tabIds) {
              try {
                const result = await chrome.runtime.sendMessage({
                  action: 'focusTab',
                  tabId: tabId
                });
                if (result.success) {
                  break; // Focus first valid tab
                }
              } catch (e) {
                console.warn(`Tab ${tabId} not found`);
              }
            }
            showNotification(`Opened tabs for task`, 'success');
          } catch (error) {
            console.error('Failed to open tabs:', error);
            showNotification('Failed to open tabs', 'error');
          }
        } else {
          showNotification('No tabs associated with this task', 'info');
        }
      }
    }
  }, {
    category: 'tasks',
    description: 'Open tabs for selected task',
    context: 'tasks'
  });

  // Filter by status: Open (o)
  keyboardShortcuts.register('o', () => {
    applyTaskStatusFilter('open');
  }, {
    category: 'tasks',
    description: 'Filter by status: Open',
    context: 'tasks'
  });

  // Filter by status: Active (a) - only when not conflicting with global navigation
  // Since 'a' is used in 'g+a', we need to check if we're in a sequence
  keyboardShortcuts.register('a', () => {
    applyTaskStatusFilter('active');
  }, {
    category: 'tasks',
    description: 'Filter by status: Active',
    context: 'tasks'
  });

  // Filter by status: Fixed (f)
  keyboardShortcuts.register('f', () => {
    applyTaskStatusFilter('fixed');
  }, {
    category: 'tasks',
    description: 'Filter by status: Fixed',
    context: 'tasks'
  });

  // Space - Toggle task selection
  keyboardShortcuts.register(' ', (e) => {
    e.preventDefault();
    const focusedItem = keyboardShortcuts.getFocusedItem();
    if (focusedItem) {
      const taskId = focusedItem.dataset.taskId;
      if (taskId) {
        const checkbox = focusedItem.querySelector('input[type="checkbox"]');
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
  }, {
    category: 'tasks',
    description: 'Toggle task selection',
    context: 'tasks'
  });

  // Shift+ArrowDown - Multi-select down
  keyboardShortcuts.register('arrowdown', (e) => {
    if (e.shiftKey) {
      e.preventDefault();
      multiSelectTask('down');
    } else {
      e.preventDefault();
      keyboardShortcuts.navigateFocusable('down');
    }
  }, {
    category: 'tasks',
    description: 'Navigate down (Shift to multi-select)',
    context: 'tasks',
    requireShift: false // Handle shift manually
  });

  // Shift+ArrowUp - Multi-select up
  keyboardShortcuts.register('arrowup', (e) => {
    if (e.shiftKey) {
      e.preventDefault();
      multiSelectTask('up');
    } else {
      e.preventDefault();
      keyboardShortcuts.navigateFocusable('up');
    }
  }, {
    category: 'tasks',
    description: 'Navigate up (Shift to multi-select)',
    context: 'tasks',
    requireShift: false // Handle shift manually
  });

  console.log('Tasks keyboard shortcuts registered');
}

// Helper function to apply task status filter
function applyTaskStatusFilter(status) {
  const currentView = state.get('tasksViewPreference') || 'kanban';

  // Update filter in state
  const currentFilters = state.get('taskFilters') || {};
  currentFilters.status = [status];
  state.set('taskFilters', currentFilters);

  // Reload view with filter
  if (currentView === 'kanban') {
    import('./tasks-kanban.js').then(({ loadKanbanView }) => {
      loadKanbanView(currentFilters);
    });
  } else {
    import('./tasks-list.js').then(({ loadListView }) => {
      loadListView(currentFilters);
    });
  }

  showNotification(`Filtering by status: ${status}`, 'info');
}

// Helper function for multi-select
function multiSelectTask(direction) {
  const focusedItem = keyboardShortcuts.getFocusedItem();

  if (focusedItem) {
    // Select current item
    const currentCheckbox = focusedItem.querySelector('input[type="checkbox"]');
    if (currentCheckbox && !currentCheckbox.checked) {
      currentCheckbox.checked = true;
      currentCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // Navigate to next/previous
  keyboardShortcuts.navigateFocusable(direction);

  // Select new focused item
  setTimeout(() => {
    const newFocusedItem = keyboardShortcuts.getFocusedItem();
    if (newFocusedItem) {
      const newCheckbox = newFocusedItem.querySelector('input[type="checkbox"]');
      if (newCheckbox && !newCheckbox.checked) {
        newCheckbox.checked = true;
        newCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }, 50);
}
