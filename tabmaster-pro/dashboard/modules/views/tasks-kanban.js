// Tasks Kanban View Module
// Kanban board with drag-and-drop status changes

import { escapeHtml } from '../core/utils.js';
import state from '../core/state.js';
import { showNotification } from '../core/shared-utils.js';
import {
  loadTasksData,
  filterTasks,
  showTaskDetailModal,
  renderPriorityBadge,
  renderStatusBadge,
  renderDueDate,
  renderEmptyState
} from './tasks-base.js';

// Kanban columns
const KANBAN_COLUMNS = [
  { id: 'open', title: 'Open', color: '#667eea' },
  { id: 'active', title: 'Active', color: '#4facfe' },
  { id: 'fixed', title: 'Fixed', color: '#43e97b' },
  { id: 'abandoned', title: 'Abandoned', color: '#999' }
];

// ============================================================================
// Main Load Function
// ============================================================================

export async function loadKanbanView(filters = {}) {
  console.log('Loading Kanban view...', filters);

  try {
    const { tasks, collections } = await loadTasksData();

    // Apply filters
    const filtered = filterTasks(tasks, filters);

    // Render the Kanban board
    renderKanbanBoard(filtered, collections);

    // Setup drag-and-drop
    setupDragAndDrop();

    // Setup event listeners
    setupKanbanEventListeners(collections);

  } catch (error) {
    console.error('Error loading Kanban view:', error);
    showNotification('Failed to load tasks', 'error');
    renderKanbanError(error.message);
  }
}

// ============================================================================
// Rendering Functions
// ============================================================================

function renderKanbanBoard(tasks, collections) {
  const container = document.getElementById('tasksKanbanContainer');
  if (!container) {
    console.error('Kanban container not found');
    return;
  }

  // Group tasks by status
  const tasksByStatus = KANBAN_COLUMNS.reduce((acc, column) => {
    acc[column.id] = tasks.filter(t => t.status === column.id);
    return acc;
  }, {});

  // Render board
  let html = '<div class="kanban-board">';

  KANBAN_COLUMNS.forEach(column => {
    const columnTasks = tasksByStatus[column.id] || [];

    html += `
      <div class="kanban-column" data-status="${column.id}">
        <div class="kanban-column-header" style="background-color: ${column.color}">
          <h3>${column.title}</h3>
          <span class="kanban-column-count">${columnTasks.length}</span>
        </div>
        <div class="kanban-column-content" data-status="${column.id}">
    `;

    if (columnTasks.length === 0) {
      html += `
        <div class="kanban-empty-state">
          <p>No ${column.title.toLowerCase()} tasks</p>
        </div>
      `;
    } else {
      columnTasks.forEach(task => {
        html += renderKanbanCard(task, collections);
      });
    }

    html += `
        </div>
      </div>
    `;
  });

  html += '</div>';

  container.innerHTML = html;
}

function renderKanbanCard(task, collections) {
  const collection = collections.find(c => c.id === task.collectionId);
  const collectionBadge = collection
    ? `<span class="collection-badge">
         ${collection.isActive ? '🟢 ' : ''}${escapeHtml(collection.name)}
       </span>`
    : '';

  const dueDateHtml = renderDueDate(task.dueDate);

  return `
    <div class="kanban-card"
         data-task-id="${task.id}"
         draggable="true">
      <div class="kanban-card-header">
        ${renderPriorityBadge(task.priority)}
        ${collectionBadge}
      </div>
      <div class="kanban-card-body">
        <h4 class="kanban-card-title">${escapeHtml(task.summary)}</h4>
        ${task.notes ? `<p class="kanban-card-notes">${escapeHtml(task.notes.substring(0, 100))}${task.notes.length > 100 ? '...' : ''}</p>` : ''}
      </div>
      <div class="kanban-card-footer">
        ${dueDateHtml}
        ${task.tabIds && task.tabIds.length > 0
          ? `<span class="tab-count">${task.tabIds.length} tab${task.tabIds.length !== 1 ? 's' : ''}</span>`
          : ''}
      </div>
      <div class="kanban-card-actions">
        <button class="btn-icon" data-action="edit" data-task-id="${task.id}" title="Edit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="btn-icon" data-action="open-tabs" data-task-id="${task.id}" title="Open Tabs">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </button>
      </div>
    </div>
  `;
}

function renderKanbanError(message) {
  const container = document.getElementById('tasksKanbanContainer');
  if (!container) return;

  container.innerHTML = renderEmptyState('error', message);
}

// ============================================================================
// Drag and Drop
// ============================================================================

let draggedCard = null;
let draggedTaskId = null;
let originalStatus = null;

function setupDragAndDrop() {
  const columns = document.querySelectorAll('.kanban-column-content');

  columns.forEach(column => {
    // Drag over - allow drop
    column.addEventListener('dragover', handleDragOver);

    // Drop - update status
    column.addEventListener('drop', handleDrop);

    // Drag leave - cleanup
    column.addEventListener('dragleave', handleDragLeave);
  });

  // Setup drag start on all cards
  const cards = document.querySelectorAll('.kanban-card');
  cards.forEach(card => {
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
  });
}

function handleDragStart(e) {
  draggedCard = e.target;
  draggedTaskId = e.target.dataset.taskId;

  // Find original status
  const column = e.target.closest('.kanban-column-content');
  originalStatus = column?.dataset.status;

  // Add dragging class for visual feedback
  e.target.classList.add('dragging');

  // Set drag data
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', e.target.innerHTML);
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');

  // Remove drop zone highlights
  document.querySelectorAll('.kanban-column-content').forEach(col => {
    col.classList.remove('drag-over');
  });

  draggedCard = null;
  draggedTaskId = null;
  originalStatus = null;
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault(); // Allow drop
  }

  e.dataTransfer.dropEffect = 'move';

  // Add visual feedback
  const column = e.currentTarget;
  column.classList.add('drag-over');

  return false;
}

function handleDragLeave(e) {
  const column = e.currentTarget;

  // Only remove if leaving the column (not just entering a child element)
  if (!column.contains(e.relatedTarget)) {
    column.classList.remove('drag-over');
  }
}

async function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation(); // Prevent browser default
  }

  const column = e.currentTarget;
  column.classList.remove('drag-over');

  if (!draggedCard || !draggedTaskId) {
    return false;
  }

  const newStatus = column.dataset.status;

  // Don't do anything if dropped in the same column
  if (newStatus === originalStatus) {
    return false;
  }

  // Optimistic UI update - move the card immediately
  column.appendChild(draggedCard);

  // Update the count badges
  updateColumnCounts();

  try {
    // Update the task status via backend
    const result = await chrome.runtime.sendMessage({
      action: 'updateTask',
      id: draggedTaskId,
      updates: { status: newStatus }
    });

    if (result.success) {
      showNotification(`Task moved to ${newStatus}`, 'success');
    } else {
      // Rollback on error
      await rollbackCardMove(draggedTaskId, originalStatus);
      showNotification('Failed to update task status', 'error');
    }
  } catch (error) {
    console.error('Error updating task status:', error);
    // Rollback on error
    await rollbackCardMove(draggedTaskId, originalStatus);
    showNotification('Failed to update task status', 'error');
  }

  return false;
}

function updateColumnCounts() {
  document.querySelectorAll('.kanban-column').forEach(column => {
    const status = column.dataset.status;
    const content = column.querySelector('.kanban-column-content');
    const count = content.querySelectorAll('.kanban-card').length;
    const countBadge = column.querySelector('.kanban-column-count');

    if (countBadge) {
      countBadge.textContent = count;
    }

    // Show/hide empty state
    const emptyState = content.querySelector('.kanban-empty-state');
    if (count === 0 && !emptyState) {
      content.innerHTML = `
        <div class="kanban-empty-state">
          <p>No ${status} tasks</p>
        </div>
      `;
    } else if (count > 0 && emptyState) {
      emptyState.remove();
    }
  });
}

async function rollbackCardMove(taskId, originalStatus) {
  console.log('Rolling back card move to:', originalStatus);

  // Find the card
  const card = document.querySelector(`[data-task-id="${taskId}"]`);
  if (!card) return;

  // Find the original column
  const originalColumn = document.querySelector(`.kanban-column-content[data-status="${originalStatus}"]`);
  if (!originalColumn) return;

  // Move it back
  originalColumn.appendChild(card);

  // Update counts
  updateColumnCounts();
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupKanbanEventListeners(collections) {
  const container = document.getElementById('tasksKanbanContainer');
  if (!container) return;

  // Delegate action buttons
  container.addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const taskId = button.dataset.taskId;

    e.preventDefault();
    e.stopPropagation();

    await handleKanbanAction(action, taskId, collections);
  });

  // Card click (not on buttons) - show detail modal
  container.addEventListener('click', (e) => {
    const card = e.target.closest('.kanban-card');
    if (!card) return;

    // Don't trigger if clicking on buttons
    if (e.target.closest('button')) return;

    const taskId = card.dataset.taskId;
    const tasks = state.get('tasks') || [];
    const task = tasks.find(t => t.id === taskId);

    if (task) {
      showTaskDetailModal(task, collections);
    }
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

  // Listen for task updates from detail modal
  window.addEventListener('taskCreated', () => {
    const filters = state.get('taskFilters') || {};
    loadKanbanView(filters);
  });

  window.addEventListener('taskUpdated', () => {
    const filters = state.get('taskFilters') || {};
    loadKanbanView(filters);
  });

  window.addEventListener('taskDeleted', () => {
    const filters = state.get('taskFilters') || {};
    loadKanbanView(filters);
  });
}

async function handleKanbanAction(action, taskId, collections) {
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

      case 'open-tabs':
        await handleOpenTaskTabs(taskId);
        break;

      default:
        console.warn('Unknown action:', action);
    }
  } catch (error) {
    console.error('Error handling Kanban action:', error);
    showNotification(`Failed to ${action} task`, 'error');
  }
}

async function handleOpenTaskTabs(taskId) {
  try {
    const result = await chrome.runtime.sendMessage({
      action: 'openTaskTabs',
      taskId
    });

    if (result.success) {
      showNotification(`Opened ${result.opened || 0} tab(s)`, 'success');
    } else {
      showNotification('Failed to open task tabs', 'error');
    }
  } catch (error) {
    console.error('Error opening task tabs:', error);
    showNotification('Failed to open task tabs', 'error');
  }
}
