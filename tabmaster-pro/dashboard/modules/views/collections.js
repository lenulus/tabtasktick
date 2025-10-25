// Collections View Module
// Handles the collections management view with grid/list display modes

import {
  debounce,
  getTimeAgo,
  escapeHtml
} from '../core/utils.js';

import state from '../core/state.js';

import {
  showNotification
} from '../core/shared-utils.js';

// ============================================================================
// Main Load Function
// ============================================================================

export async function loadCollectionsView() {
  console.log('Loading collections view...');

  try {
    // Get collections and tasks data via message passing
    const collections = await chrome.runtime.sendMessage({ action: 'getCollections' });
    const tasks = await chrome.runtime.sendMessage({ action: 'getTasks' });

    // Get windows for active state display
    const windows = await chrome.windows.getAll();
    const windowMap = new Map(windows.map(w => [w.id, w]));

    // Store in state
    state.set('collections', collections || []);
    state.set('collectionTasks', tasks || []);
    state.set('windowMap', windowMap);

    // Render the view
    renderCollectionsView(collections || [], tasks || [], windowMap);

    // Setup event listeners
    setupCollectionsEventListeners();

  } catch (error) {
    console.error('Error loading collections:', error);
    showNotification('Failed to load collections', 'error');
    renderEmptyState('error', error.message);
  }
}

// ============================================================================
// Rendering Functions
// ============================================================================

function renderCollectionsView(collections, tasks, windowMap) {
  const container = document.getElementById('collectionsContainer');
  if (!container) {
    console.error('Collections container not found');
    return;
  }

  // Handle empty state
  if (!collections || collections.length === 0) {
    renderEmptyState('empty');
    return;
  }

  // Group collections by state
  const active = collections.filter(c => c.isActive);
  const saved = collections.filter(c => !c.isActive && !c.metadata?.archived);
  const archived = collections.filter(c => c.metadata?.archived);

  // Count tasks per collection
  const taskCounts = new Map();
  tasks.forEach(task => {
    if (task.collectionId) {
      taskCounts.set(task.collectionId, (taskCounts.get(task.collectionId) || 0) + 1);
    }
  });

  // Render sections
  let html = `
    <div class="collections-header">
      <div class="collections-controls">
        <input type="text"
               class="search-input"
               id="searchCollections"
               placeholder="Search collections...">
        <select class="filter-select" id="filterCollections">
          <option value="all">All Collections</option>
          <option value="active">Active</option>
          <option value="saved">Saved</option>
          <option value="archived">Archived</option>
        </select>
        <select class="filter-select" id="sortCollections">
          <option value="lastAccessed">Last Accessed</option>
          <option value="name">Name (A-Z)</option>
          <option value="created">Created Date</option>
          <option value="tabCount">Tab Count</option>
        </select>
        <div class="view-toggle" style="display: inline-flex; gap: 2px; background: #f0f0f0; border-radius: 6px; padding: 2px;">
          <button class="view-toggle-btn active" data-view="grid" title="Grid View">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          </button>
          <button class="view-toggle-btn" data-view="list" title="List View">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div class="collections-content" id="collectionsContent">
  `;

  // Render active collections
  if (active.length > 0) {
    html += renderCollectionSection('Active Collections', active, taskCounts, windowMap, true);
  }

  // Render saved collections
  if (saved.length > 0) {
    html += renderCollectionSection('Saved Collections', saved, taskCounts, windowMap, false);
  }

  // Render archived collections (collapsed by default)
  if (archived.length > 0) {
    html += renderCollectionSection('Archived', archived, taskCounts, windowMap, false, true);
  }

  html += '</div>'; // Close collections-content

  container.innerHTML = html;
}

function renderCollectionSection(title, collections, taskCounts, windowMap, isActive, isCollapsed = false) {
  const sectionId = title.toLowerCase().replace(/\s+/g, '-');

  let html = `
    <div class="collection-section">
      <div class="collection-section-header ${isCollapsed ? 'collapsed' : ''}" data-section="${sectionId}">
        <h3>
          <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
          ${escapeHtml(title)} <span class="count">(${collections.length})</span>
        </h3>
      </div>
      <div class="collection-section-content ${isCollapsed ? 'hidden' : ''}" id="${sectionId}-content">
        <div class="collections-grid">
  `;

  collections.forEach(collection => {
    html += renderCollectionCard(collection, taskCounts.get(collection.id) || 0, windowMap, isActive);
  });

  html += `
        </div>
      </div>
    </div>
  `;

  return html;
}

function renderCollectionCard(collection, taskCount, windowMap, isActive) {
  const icon = collection.icon || '📁';
  const color = collection.color || '#667eea';
  const tabCount = collection.metadata?.tabCount || 0;
  const folderCount = collection.metadata?.folderCount || 0;
  const lastAccessed = collection.metadata?.lastAccessed
    ? getTimeAgo(collection.metadata.lastAccessed)
    : 'Never';

  // Get window info for active collections
  let windowBadge = '';
  if (isActive && collection.windowId) {
    const window = windowMap.get(collection.windowId);
    if (window) {
      windowBadge = `<span class="window-badge">Window #${collection.windowId}</span>`;
    }
  }

  const tags = collection.tags && collection.tags.length > 0
    ? collection.tags.slice(0, 3).map(tag =>
        `<span class="tag">${escapeHtml(tag)}</span>`
      ).join('')
    : '';

  const moreTags = collection.tags && collection.tags.length > 3
    ? `<span class="tag more">+${collection.tags.length - 3} more</span>`
    : '';

  return `
    <div class="collection-card" data-collection-id="${collection.id}">
      <div class="collection-card-header">
        <div class="collection-icon" style="background-color: ${color}">
          ${icon}
        </div>
        <div class="collection-info">
          <h4 class="collection-name">
            ${escapeHtml(collection.name)}
            ${isActive ? '<span class="active-indicator">🟢</span>' : ''}
            ${windowBadge}
          </h4>
          <p class="collection-description">
            ${escapeHtml(collection.description || 'No description')}
          </p>
        </div>
      </div>

      <div class="collection-stats">
        <div class="stat">
          <span class="stat-value">${tabCount}</span>
          <span class="stat-label">tabs</span>
        </div>
        <div class="stat">
          <span class="stat-value">${folderCount}</span>
          <span class="stat-label">folders</span>
        </div>
        <div class="stat">
          <span class="stat-value">${taskCount}</span>
          <span class="stat-label">tasks</span>
        </div>
        <div class="stat">
          <span class="stat-value">${lastAccessed}</span>
          <span class="stat-label">accessed</span>
        </div>
      </div>

      ${tags || moreTags ? `<div class="collection-tags">${tags}${moreTags}</div>` : ''}

      <div class="collection-actions">
        ${isActive
          ? `<button class="btn btn-sm btn-secondary" data-action="focus" data-collection-id="${collection.id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              Focus Window
            </button>
            <button class="btn btn-sm btn-secondary" data-action="close" data-collection-id="${collection.id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              Close
            </button>`
          : `<button class="btn btn-sm btn-primary" data-action="open" data-collection-id="${collection.id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              Open
            </button>`}
        <button class="btn btn-sm btn-secondary" data-action="view-details" data-collection-id="${collection.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          Details
        </button>
        <button class="btn btn-sm btn-secondary" data-action="edit" data-collection-id="${collection.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
          Edit
        </button>
        <button class="btn btn-sm btn-secondary" data-action="delete" data-collection-id="${collection.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          Delete
        </button>
      </div>
    </div>
  `;
}

function renderEmptyState(type, message = '') {
  const container = document.getElementById('collectionsContainer');
  if (!container) return;

  let html = '';

  if (type === 'empty') {
    html = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
        <h3>No Collections Yet</h3>
        <p>Collections help you organize your browser windows and tasks. Create your first collection to get started!</p>
        <button class="btn btn-primary" id="createFirstCollection">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Save Current Window
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
        <h3>Failed to Load Collections</h3>
        <p>${escapeHtml(message || 'An error occurred while loading collections.')}</p>
        <button class="btn btn-primary" onclick="window.location.reload()">Retry</button>
      </div>
    `;
  }

  container.innerHTML = html;
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupCollectionsEventListeners() {
  const container = document.getElementById('collectionsContainer');
  if (!container) return;

  // Delegate all collection action buttons
  container.addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const collectionId = button.dataset.collectionId;

    e.preventDefault();
    e.stopPropagation();

    await handleCollectionAction(action, collectionId);
  });

  // Section collapse/expand
  container.addEventListener('click', (e) => {
    const header = e.target.closest('.collection-section-header');
    if (!header) return;

    const section = header.dataset.section;
    const content = document.getElementById(`${section}-content`);

    if (content) {
      header.classList.toggle('collapsed');
      content.classList.toggle('hidden');
    }
  });

  // Search, filter, sort
  const searchInput = document.getElementById('searchCollections');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
      filterAndRenderCollections();
    }, 300));
  }

  const filterSelect = document.getElementById('filterCollections');
  if (filterSelect) {
    filterSelect.addEventListener('change', () => {
      filterAndRenderCollections();
    });
  }

  const sortSelect = document.getElementById('sortCollections');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      filterAndRenderCollections();
    });
  }

  // View toggle (grid/list)
  const viewToggles = container.querySelectorAll('.view-toggle-btn');
  viewToggles.forEach(btn => {
    btn.addEventListener('click', () => {
      viewToggles.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const view = btn.dataset.view;
      const contentContainer = document.querySelector('.collections-content');
      if (contentContainer) {
        contentContainer.dataset.view = view;
      }
    });
  });

  // Create first collection button
  const createBtn = document.getElementById('createFirstCollection');
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      await handleCreateCollection();
    });
  }
}

// ============================================================================
// Action Handlers
// ============================================================================

async function handleCollectionAction(action, collectionId) {
  console.log('Collection action:', action, collectionId);

  try {
    switch (action) {
      case 'open':
        await handleOpenCollection(collectionId);
        break;
      case 'focus':
        await handleFocusWindow(collectionId);
        break;
      case 'close':
        await handleCloseWindow(collectionId);
        break;
      case 'view-details':
        await handleViewDetails(collectionId);
        break;
      case 'edit':
        await handleEditCollection(collectionId);
        break;
      case 'delete':
        await handleDeleteCollection(collectionId);
        break;
      default:
        console.warn('Unknown action:', action);
    }
  } catch (error) {
    console.error('Error handling collection action:', error);
    showNotification(`Failed to ${action} collection`, 'error');
  }
}

async function handleOpenCollection(collectionId) {
  try {
    showNotification('Restoring collection...', 'info');

    const result = await chrome.runtime.sendMessage({
      action: 'restoreCollection',
      collectionId,
      options: { createNewWindow: true }
    });

    if (result.success) {
      showNotification(`Collection opened in window ${result.windowId}`, 'success');
      await loadCollectionsView(); // Refresh
    } else {
      showNotification('Failed to open collection', 'error');
    }
  } catch (error) {
    console.error('Error opening collection:', error);
    showNotification('Failed to open collection', 'error');
  }
}

async function handleFocusWindow(collectionId) {
  try {
    const collections = state.get('collections') || [];
    const collection = collections.find(c => c.id === collectionId);

    if (!collection || !collection.windowId) {
      showNotification('Collection is not active', 'error');
      return;
    }

    await chrome.windows.update(collection.windowId, { focused: true });
    showNotification('Window focused', 'success');
  } catch (error) {
    console.error('Error focusing window:', error);
    showNotification('Failed to focus window', 'error');
  }
}

async function handleCloseWindow(collectionId) {
  try {
    const collections = state.get('collections') || [];
    const collection = collections.find(c => c.id === collectionId);

    if (!collection || !collection.windowId) {
      showNotification('Collection is not active', 'error');
      return;
    }

    if (!confirm(`Close window and save collection "${collection.name}"?`)) {
      return;
    }

    await chrome.windows.remove(collection.windowId);
    showNotification('Window closed, collection saved', 'success');

    // Refresh view
    setTimeout(() => loadCollectionsView(), 500);
  } catch (error) {
    console.error('Error closing window:', error);
    showNotification('Failed to close window', 'error');
  }
}

async function handleViewDetails(collectionId) {
  // TODO: Implement detail view modal (Phase 7.1 requirement)
  showNotification('Detail view coming soon', 'info');
  console.log('View details for collection:', collectionId);
}

async function handleEditCollection(collectionId) {
  // TODO: Implement edit modal (Phase 7.1 requirement)
  showNotification('Edit modal coming soon', 'info');
  console.log('Edit collection:', collectionId);
}

async function handleDeleteCollection(collectionId) {
  try {
    const collections = state.get('collections') || [];
    const collection = collections.find(c => c.id === collectionId);

    if (!collection) {
      showNotification('Collection not found', 'error');
      return;
    }

    if (!confirm(`Delete collection "${collection.name}"? This will also delete all associated tasks.`)) {
      return;
    }

    const result = await chrome.runtime.sendMessage({
      action: 'deleteCollection',
      collectionId
    });

    if (result.success) {
      showNotification('Collection deleted', 'success');
      await loadCollectionsView(); // Refresh
    } else {
      showNotification('Failed to delete collection', 'error');
    }
  } catch (error) {
    console.error('Error deleting collection:', error);
    showNotification('Failed to delete collection', 'error');
  }
}

async function handleCreateCollection() {
  try {
    const currentWindow = await chrome.windows.getCurrent();

    showNotification('Saving current window...', 'info');

    const result = await chrome.runtime.sendMessage({
      action: 'captureWindow',
      windowId: currentWindow.id,
      metadata: {
        name: `Window ${currentWindow.id}`,
        description: 'Captured from dashboard'
      }
    });

    if (result.success) {
      showNotification('Collection created!', 'success');
      await loadCollectionsView(); // Refresh
    } else {
      showNotification('Failed to create collection', 'error');
    }
  } catch (error) {
    console.error('Error creating collection:', error);
    showNotification('Failed to create collection', 'error');
  }
}

// ============================================================================
// Filtering and Sorting
// ============================================================================

function filterAndRenderCollections() {
  const collections = state.get('collections') || [];
  const tasks = state.get('collectionTasks') || [];
  const windowMap = state.get('windowMap') || new Map();

  const searchTerm = document.getElementById('searchCollections')?.value.toLowerCase() || '';
  const filterType = document.getElementById('filterCollections')?.value || 'all';
  const sortType = document.getElementById('sortCollections')?.value || 'lastAccessed';

  // Filter
  let filtered = collections.filter(collection => {
    // Search filter
    if (searchTerm) {
      const searchable = [
        collection.name,
        collection.description,
        ...(collection.tags || [])
      ].join(' ').toLowerCase();

      if (!searchable.includes(searchTerm)) {
        return false;
      }
    }

    // Type filter
    if (filterType === 'active' && !collection.isActive) return false;
    if (filterType === 'saved' && (collection.isActive || collection.metadata?.archived)) return false;
    if (filterType === 'archived' && !collection.metadata?.archived) return false;

    return true;
  });

  // Sort
  filtered.sort((a, b) => {
    switch (sortType) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'created':
        return new Date(b.createdAt) - new Date(a.createdAt);
      case 'tabCount':
        return (b.metadata?.tabCount || 0) - (a.metadata?.tabCount || 0);
      case 'lastAccessed':
      default:
        return (b.metadata?.lastAccessed || 0) - (a.metadata?.lastAccessed || 0);
    }
  });

  renderCollectionsView(filtered, tasks, windowMap);
  setupCollectionsEventListeners(); // Re-attach listeners
}
