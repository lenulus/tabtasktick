// Tasks List View Module
// Desktop-optimized table view with inline editing and keyboard navigation

import { escapeHtml, getTimeAgo } from '../core/utils.js';
import state from '../core/state.js';
import { showNotification } from '../core/shared-utils.js';
import {
  loadTasksData,
  filterTasks,
  sortTasks,
  showTaskDetailModal,
  setupBulkActions,
  handleBulkAction,
  renderEmptyState,
  setupTasksKeyboardShortcuts
} from './tasks-base.js';
import keyboardShortcuts from '../keyboard-shortcuts.js';
import { getSharedFiltersInstance } from './tasks-filters-shared.js';

// ============================================================================
// Main Load Function
// ============================================================================

export async function loadListView(filters = {}, sortConfig = {}) {
  console.log('Loading List view...', filters, sortConfig);

  try {
    const { tasks, collections } = await loadTasksData();

    // Get shared filters instance (creates on first call)
    const filtersInstance = getSharedFiltersInstance();

    // Initialize filters UI if not already done
    if (!filtersInstance.initialized) {
      await filtersInstance.init();
    }

    // Populate collection dropdown (always update in case collections changed)
    filtersInstance.populateCollections(collections);

    // Setup callback for filter changes (update each time to ensure correct view)
    filtersInstance.onFiltersChange = (appliedFilters) => {
      const sortConfig = state.get('taskSortConfig') || {};
      loadListView(appliedFilters, sortConfig);
    };

    // Use saved filters if no filters passed in
    if (Object.keys(filters).length === 0) {
      filters = filtersInstance.getFilters();
    }

    // Apply filters
    let filtered = filterTasks(tasks, filters);

    // Apply sorting
    if (sortConfig.sortBy) {
      filtered = sortTasks(filtered, sortConfig.sortBy, sortConfig.sortDirection);
    }

    // Store in state for later use
    state.set('filteredTasks', filtered);
    state.set('taskSortConfig', sortConfig);

    // Render the list
    renderListView(filtered, collections);

    // Setup event listeners
    setupListEventListeners(collections);

    // Setup bulk actions
    const selectedTasks = setupBulkActions('#tasksListContainer');
    state.set('selectedTasks', selectedTasks);

    // Phase 10: Setup keyboard shortcuts
    setupTasksKeyboardShortcuts(keyboardShortcuts);

    // Set focusable items for arrow key navigation
    setTimeout(() => {
      const taskRows = document.querySelectorAll('.task-row');
      keyboardShortcuts.setFocusableItems(taskRows);
    }, 100);

  } catch (error) {
    console.error('Error loading List view:', error);
    showNotification('Failed to load tasks', 'error');
    renderListError(error.message);
  }
}

// ============================================================================
// Rendering Functions
// ============================================================================

function renderListView(tasks, collections) {
  const container = document.getElementById('tasksListContainer');
  if (!container) {
    console.error('List container not found');
    return;
  }

  if (!tasks || tasks.length === 0) {
    container.innerHTML = renderEmptyState('empty');
    return;
  }

  // Create collection map for quick lookup
  const collectionMap = new Map(collections.map(c => [c.id, c]));

  // Get current sort config
  const sortConfig = state.get('taskSortConfig') || {};

  let html = `
    <div class="tasks-list-table-wrapper">
      <table class="tasks-list-table">
        <thead class="tasks-list-header">
          <tr>
            <th class="col-checkbox">
              <input type="checkbox" id="selectAllTasks" title="Select All">
            </th>
            <th class="col-drag">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </th>
            <th class="col-task sortable ${sortConfig.sortBy === 'alpha' ? 'sorted' : ''}" data-sort="alpha">
              Task
              ${renderSortIndicator('alpha', sortConfig)}
            </th>
            <th class="col-collection sortable" data-sort="collection">
              Collection
              ${renderSortIndicator('collection', sortConfig)}
            </th>
            <th class="col-priority sortable ${sortConfig.sortBy === 'priority' ? 'sorted' : ''}" data-sort="priority">
              Priority
              ${renderSortIndicator('priority', sortConfig)}
            </th>
            <th class="col-status">Status</th>
            <th class="col-due-date sortable ${sortConfig.sortBy === 'dueDate' ? 'sorted' : ''}" data-sort="dueDate">
              Due Date
              ${renderSortIndicator('dueDate', sortConfig)}
            </th>
            <th class="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody class="tasks-list-body">
  `;

  tasks.forEach((task, index) => {
    html += renderListRow(task, collectionMap, index);
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
}

function renderSortIndicator(columnSort, sortConfig) {
  if (sortConfig.sortBy !== columnSort) {
    return `<span class="sort-indicator"></span>`;
  }

  const icon = sortConfig.sortDirection === 'desc'
    ? '<span class="sort-indicator">▼</span>'
    : '<span class="sort-indicator">▲</span>';

  return icon;
}

function renderListRow(task, collectionMap, index) {
  const collection = collectionMap.get(task.collectionId);
  const collectionName = collection
    ? `${collection.isActive ? '🟢 ' : ''}${escapeHtml(collection.name)}`
    : '<span style="color: #999;">Uncategorized</span>';

  const dueDate = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString()
    : '-';

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
  const dueDateClass = isOverdue ? 'overdue' : '';

  const priorityColors = {
    critical: '#f5576c',
    high: '#fa709a',
    medium: '#667eea',
    low: '#4facfe'
  };

  const priorityColor = priorityColors[task.priority] || priorityColors.medium;

  return `
    <tr class="task-row"
        data-task-id="${task.id}"
        data-row-index="${index}"
        draggable="true"
        tabindex="0">
      <td class="col-checkbox">
        <input type="checkbox"
               class="task-checkbox"
               data-task-id="${task.id}">
      </td>
      <td class="col-drag">
        <span class="drag-handle" title="Drag to reorder">⋮</span>
      </td>
      <td class="col-task" data-field="summary">
        <span class="task-summary">${escapeHtml(task.summary)}</span>
        ${task.tabIds && task.tabIds.length > 0
          ? `<span class="tab-count-badge">${task.tabIds.length} tab${task.tabIds.length !== 1 ? 's' : ''}</span>`
          : ''}
      </td>
      <td class="col-collection">
        ${collectionName}
      </td>
      <td class="col-priority" data-field="priority">
        <span class="priority-badge-small" style="background-color: ${priorityColor}">
          ${task.priority}
        </span>
      </td>
      <td class="col-status" data-field="status">
        <span class="status-badge-small">
          ${task.status}
        </span>
      </td>
      <td class="col-due-date ${dueDateClass}" data-field="dueDate">
        ${dueDate}
      </td>
      <td class="col-actions">
        <div class="row-actions">
          <button class="btn-icon" data-action="edit" data-task-id="${task.id}" title="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="btn-icon" data-action="delete" data-task-id="${task.id}" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
          <button class="btn-icon" data-action="open-tabs" data-task-id="${task.id}" title="Open Tabs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `;
}

function renderListError(message) {
  const container = document.getElementById('tasksListContainer');
  if (!container) return;

  container.innerHTML = renderEmptyState('error', message);
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupListEventListeners(collections) {
  const container = document.getElementById('tasksListContainer');
  if (!container) return;

  // Column sorting
  container.addEventListener('click', (e) => {
    const header = e.target.closest('th.sortable');
    if (!header) return;

    const sortBy = header.dataset.sort;
    handleColumnSort(sortBy);
  });

  // Row actions
  container.addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const taskId = button.dataset.taskId;

    e.preventDefault();
    e.stopPropagation();

    await handleRowAction(action, taskId, collections);
  });

  // Select all checkbox
  const selectAllCheckbox = document.getElementById('selectAllTasks');
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      const checkboxes = container.querySelectorAll('.task-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  }

  // Double-click inline editing
  container.addEventListener('dblclick', (e) => {
    const cell = e.target.closest('td[data-field]');
    if (!cell) return;

    const field = cell.dataset.field;
    const row = cell.closest('.task-row');
    const taskId = row?.dataset.taskId;

    if (taskId) {
      handleInlineEdit(cell, field, taskId);
    }
  });

  // Keyboard navigation
  container.addEventListener('keydown', (e) => {
    handleKeyboardNavigation(e);
  });

  // Handle "Create Your First Task" button
  container.addEventListener('click', (e) => {
    if (e.target.id === 'createFirstTask' || e.target.closest('#createFirstTask')) {
      e.preventDefault();
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
    }
  });

  // Drag and drop for reordering
  setupRowDragAndDrop();

  // Listen for task updates
  window.addEventListener('taskCreated', () => {
    const filters = state.get('taskFilters') || {};
    const sortConfig = state.get('taskSortConfig') || {};
    loadListView(filters, sortConfig);
  });

  window.addEventListener('taskUpdated', () => {
    const filters = state.get('taskFilters') || {};
    const sortConfig = state.get('taskSortConfig') || {};
    loadListView(filters, sortConfig);
  });

  window.addEventListener('taskDeleted', () => {
    const filters = state.get('taskFilters') || {};
    const sortConfig = state.get('taskSortConfig') || {};
    loadListView(filters, sortConfig);
  });
}

// ============================================================================
// Column Sorting
// ============================================================================

function handleColumnSort(sortBy) {
  const currentConfig = state.get('taskSortConfig') || {};

  let sortDirection = 'asc';
  if (currentConfig.sortBy === sortBy) {
    // Toggle direction if clicking the same column
    sortDirection = currentConfig.sortDirection === 'asc' ? 'desc' : 'asc';
  }

  const newConfig = { sortBy, sortDirection };
  state.set('taskSortConfig', newConfig);

  // Reload with new sort
  const filters = state.get('taskFilters') || {};
  loadListView(filters, newConfig);
}

// ============================================================================
// Inline Editing
// ============================================================================

function handleInlineEdit(cell, field, taskId) {
  const tasks = state.get('tasks') || [];
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const currentValue = task[field];
  let input;

  // Create appropriate input based on field type
  switch (field) {
    case 'summary':
      input = document.createElement('input');
      input.type = 'text';
      input.value = currentValue || '';
      break;

    case 'priority':
      input = document.createElement('select');
      input.innerHTML = `
        <option value="low" ${currentValue === 'low' ? 'selected' : ''}>Low</option>
        <option value="medium" ${currentValue === 'medium' ? 'selected' : ''}>Medium</option>
        <option value="high" ${currentValue === 'high' ? 'selected' : ''}>High</option>
        <option value="critical" ${currentValue === 'critical' ? 'selected' : ''}>Critical</option>
      `;
      break;

    case 'status':
      input = document.createElement('select');
      input.innerHTML = `
        <option value="open" ${currentValue === 'open' ? 'selected' : ''}>Open</option>
        <option value="active" ${currentValue === 'active' ? 'selected' : ''}>Active</option>
        <option value="fixed" ${currentValue === 'fixed' ? 'selected' : ''}>Fixed</option>
        <option value="abandoned" ${currentValue === 'abandoned' ? 'selected' : ''}>Abandoned</option>
      `;
      break;

    case 'dueDate':
      input = document.createElement('input');
      input.type = 'date';
      input.value = currentValue ? new Date(currentValue).toISOString().split('T')[0] : '';
      break;

    default:
      return;
  }

  input.className = 'inline-edit-input';

  // Save original content
  const originalContent = cell.innerHTML;

  // Replace cell content with input
  cell.innerHTML = '';
  cell.appendChild(input);
  input.focus();

  // Save on blur or Enter
  const save = async () => {
    const newValue = input.value;

    // Revert if no change
    if (newValue === currentValue || (field === 'summary' && !newValue.trim())) {
      cell.innerHTML = originalContent;
      return;
    }

    try {
      const updates = { [field]: field === 'dueDate' && newValue ? new Date(newValue).toISOString() : newValue };

      const result = await chrome.runtime.sendMessage({
        action: 'updateTask',
        id: taskId,
        updates
      });

      if (result.success) {
        showNotification('Task updated', 'success');

        // Trigger refresh
        const event = new CustomEvent('taskUpdated', { detail: { taskId } });
        window.dispatchEvent(event);
      } else {
        showNotification('Failed to update task', 'error');
        cell.innerHTML = originalContent;
      }
    } catch (error) {
      console.error('Error updating task:', error);
      showNotification('Failed to update task', 'error');
      cell.innerHTML = originalContent;
    }
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      save();
    } else if (e.key === 'Escape') {
      cell.innerHTML = originalContent;
    }
  });
}

// ============================================================================
// Keyboard Navigation
// ============================================================================

function handleKeyboardNavigation(e) {
  const currentRow = document.activeElement.closest('.task-row');
  if (!currentRow) return;

  const currentIndex = parseInt(currentRow.dataset.rowIndex);
  const rows = Array.from(document.querySelectorAll('.task-row'));

  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault();
      if (currentIndex > 0) {
        rows[currentIndex - 1].focus();
      }
      break;

    case 'ArrowDown':
      e.preventDefault();
      if (currentIndex < rows.length - 1) {
        rows[currentIndex + 1].focus();
      }
      break;

    case 'Enter':
      e.preventDefault();
      const taskId = currentRow.dataset.taskId;
      const tasks = state.get('tasks') || [];
      const collections = state.get('collections') || [];
      const task = tasks.find(t => t.id === taskId);

      if (task) {
        showTaskDetailModal(task, collections);
      }
      break;
  }
}

// ============================================================================
// Drag and Drop for Reordering
// ============================================================================

let draggedRow = null;
let draggedTaskId = null;

function setupRowDragAndDrop() {
  const rows = document.querySelectorAll('.task-row');

  rows.forEach(row => {
    row.addEventListener('dragstart', handleRowDragStart);
    row.addEventListener('dragover', handleRowDragOver);
    row.addEventListener('drop', handleRowDrop);
    row.addEventListener('dragend', handleRowDragEnd);
  });
}

function handleRowDragStart(e) {
  draggedRow = e.target;
  draggedTaskId = e.target.dataset.taskId;

  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleRowDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }

  e.dataTransfer.dropEffect = 'move';

  const targetRow = e.target.closest('.task-row');
  if (!targetRow || targetRow === draggedRow) return;

  // Visual feedback - insert placeholder
  const tbody = targetRow.parentNode;
  const rect = targetRow.getBoundingClientRect();
  const midpoint = rect.top + rect.height / 2;

  if (e.clientY < midpoint) {
    tbody.insertBefore(draggedRow, targetRow);
  } else {
    tbody.insertBefore(draggedRow, targetRow.nextSibling);
  }

  return false;
}

function handleRowDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }

  return false;
}

function handleRowDragEnd(e) {
  e.target.classList.remove('dragging');

  // Note: Position updates would be saved here via message passing
  // For now, just visual reordering (persistence deferred)

  draggedRow = null;
  draggedTaskId = null;
}

// ============================================================================
// Row Actions
// ============================================================================

async function handleRowAction(action, taskId, collections) {
  const tasks = state.get('tasks') || [];
  const task = tasks.find(t => t.id === taskId);

  if (!task) {
    showNotification('Task not found', 'error');
    return;
  }

  try {
    switch (action) {
      case 'edit':
        showTaskDetailModal(task, collections);
        break;

      case 'delete':
        if (!confirm(`Delete task "${task.summary}"?`)) return;

        const result = await chrome.runtime.sendMessage({
          action: 'deleteTask',
          id: taskId
        });

        if (result.success) {
          showNotification('Task deleted', 'success');

          // Trigger refresh
          const event = new CustomEvent('taskDeleted', { detail: { taskId } });
          window.dispatchEvent(event);
        } else {
          showNotification('Failed to delete task', 'error');
        }
        break;

      case 'open-tabs':
        const openResult = await chrome.runtime.sendMessage({
          action: 'openTaskTabs',
          taskId
        });

        if (openResult.success) {
          showNotification(`Opened ${openResult.opened || 0} tab(s)`, 'success');
        } else {
          showNotification('Failed to open task tabs', 'error');
        }
        break;

      default:
        console.warn('Unknown action:', action);
    }
  } catch (error) {
    console.error('Error handling row action:', error);
    showNotification(`Failed to ${action} task`, 'error');
  }
}
