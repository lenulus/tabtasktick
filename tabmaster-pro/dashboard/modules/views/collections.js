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

import modalService from '../core/modal-service.js';

import { EMOJI_CATEGORIES } from '../data/emoji-data.js';

import {
  exportCollection as exportCollectionService,
  exportAllCollections as exportAllCollectionsService,
  importCollections as importCollectionsService,
  formatImportSuccessMessage,
  formatImportErrorMessage,
  formatExportSuccessMessage
} from '../../services/utils/collection-import-export-ui.js';

// ============================================================================
// Main Load Function
// ============================================================================

export async function loadCollectionsView() {
  console.log('Loading collections view...');

  try {
    // Get collections and tasks data via message passing
    const collectionsResponse = await chrome.runtime.sendMessage({ action: 'getCollections' });
    const tasksResponse = await chrome.runtime.sendMessage({ action: 'getTasks' });
    const collections = collectionsResponse?.collections || [];
    const tasks = tasksResponse?.tasks || [];

    // Get windows for active state display
    const windows = await chrome.windows.getAll();
    const windowMap = new Map(windows.map(w => [w.id, w]));

    // Store in state
    state.set('collections', collections);
    state.set('collectionTasks', tasks);
    state.set('windowMap', windowMap);

    // Render the view
    renderCollectionsView(collections, tasks, windowMap);

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
        <button class="btn btn-secondary" id="exportAllCollections" title="Export all collections to JSON">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Export All
        </button>
        <button class="btn btn-primary" id="importCollections" title="Import collections from JSON file">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          Import
        </button>
        <input type="file" id="importFileInput" accept=".json" style="display: none;">
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
        <button class="btn btn-sm btn-secondary" data-action="export" data-collection-id="${collection.id}" title="Export this collection to JSON">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Export
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

  // Export All Collections button
  const exportAllBtn = document.getElementById('exportAllCollections');
  if (exportAllBtn) {
    exportAllBtn.addEventListener('click', async () => {
      await handleExportAllCollections();
    });
  }

  // Import Collections button
  const importBtn = document.getElementById('importCollections');
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      // Trigger file input click
      const fileInput = document.getElementById('importFileInput');
      if (fileInput) {
        fileInput.click();
      }
    });
  }

  // Import file input change
  const fileInput = document.getElementById('importFileInput');
  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await handleImportCollections(file);
        // Reset input so same file can be selected again
        fileInput.value = '';
      }
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
      case 'export':
        await handleExportCollection(collectionId);
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
  try {
    showNotification('Loading collection details...', 'info');

    // Get complete collection with all tabs, folders, and tasks
    const response = await chrome.runtime.sendMessage({
      action: 'getCompleteCollection',
      id: collectionId
    });

    if (response.success && response.collection) {
      showCollectionDetailsModal(response.collection);
    } else {
      showNotification('Failed to load collection details', 'error');
    }
  } catch (error) {
    console.error('Error loading collection details:', error);
    showNotification('Failed to load collection details', 'error');
  }
}

function showCollectionDetailsModal(collection) {
  // Create modal using ModalService if it doesn't exist
  if (!modalService.exists('collectionDetailsModal')) {
    modalService.create({
      id: 'collectionDetailsModal',
      title: 'Collection Details',
      size: 'lg',
      body: '<!-- Content will be populated dynamically -->',
      footer: '<button class="btn btn-secondary" id="closeCollectionDetails">Close</button>',
      events: {
        '#closeCollectionDetails': () => modalService.hide('collectionDetailsModal')
      }
    });
  }

  // Populate modal with collection data
  modalService.updateBody('collectionDetailsModal', renderCollectionDetails(collection));

  // Show modal
  modalService.show('collectionDetailsModal');
}

function renderCollectionDetails(collection) {
  const createdDate = collection.createdAt ? new Date(collection.createdAt).toLocaleString() : 'Unknown';
  const lastAccessed = collection.metadata?.lastAccessed
    ? getTimeAgo(collection.metadata.lastAccessed)
    : 'Never';

  const tabs = collection.tabs || [];
  const folders = collection.folders || [];
  const tasks = collection.tasks || [];

  let html = `
    <div class="collection-details">
      <!-- Header Section -->
      <div class="details-header">
        <div class="details-icon" style="background-color: ${collection.color || '#667eea'}">
          ${collection.icon || '📁'}
        </div>
        <div class="details-info">
          <h2>${escapeHtml(collection.name)}</h2>
          ${collection.description ? `<p class="details-description">${escapeHtml(collection.description)}</p>` : ''}
        </div>
      </div>

      <!-- Metadata Section -->
      <div class="details-section">
        <h4>Information</h4>
        <div class="details-grid">
          <div class="detail-item">
            <span class="detail-label">Status:</span>
            <span class="detail-value">${collection.isActive ? '🟢 Active' : '💾 Saved'}</span>
          </div>
          ${collection.windowId ? `
            <div class="detail-item">
              <span class="detail-label">Window:</span>
              <span class="detail-value">#${collection.windowId}</span>
            </div>
          ` : ''}
          <div class="detail-item">
            <span class="detail-label">Created:</span>
            <span class="detail-value">${createdDate}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Last Accessed:</span>
            <span class="detail-value">${lastAccessed}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Tabs:</span>
            <span class="detail-value">${tabs.length}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Folders:</span>
            <span class="detail-value">${folders.length}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Tasks:</span>
            <span class="detail-value">${tasks.length}</span>
          </div>
        </div>
      </div>

      <!-- Tags Section -->
      ${collection.tags && collection.tags.length > 0 ? `
        <div class="details-section">
          <h4>Tags</h4>
          <div class="details-tags">
            ${collection.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Tabs Section -->
      ${tabs.length > 0 ? `
        <div class="details-section">
          <h4>Tabs (${tabs.length})</h4>
          <div class="details-list">
            ${tabs.map(tab => `
              <div class="detail-list-item">
                <img src="${tab.favIconUrl || 'chrome://favicon/size/16@1x/' + tab.url}"
                     width="16" height="16"
                     onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22%3E%3Ctext y=%2212%22 font-size=%2212%22%3E🌐%3C/text%3E%3C/svg%3E'">
                <div class="detail-list-info">
                  <div class="detail-list-title">${escapeHtml(tab.title || 'Untitled')}</div>
                  <div class="detail-list-url">${escapeHtml(tab.url || '')}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Folders Section -->
      ${folders.length > 0 ? `
        <div class="details-section">
          <h4>Folders (${folders.length})</h4>
          <div class="details-list">
            ${folders.map(folder => `
              <div class="detail-list-item">
                <span class="folder-icon">📁</span>
                <div class="detail-list-info">
                  <div class="detail-list-title">${escapeHtml(folder.name || 'Untitled Folder')}</div>
                  ${folder.children ? `<div class="detail-list-url">${folder.children.length} items</div>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Tasks Section -->
      ${tasks.length > 0 ? `
        <div class="details-section">
          <h4>Tasks (${tasks.length})</h4>
          <div class="details-list">
            ${tasks.map(task => {
              const priorityColors = {
                critical: '#f5576c',
                high: '#fa709a',
                medium: '#667eea',
                low: '#4facfe'
              };
              const statusColors = {
                open: '#667eea',
                active: '#4facfe',
                fixed: '#43e97b',
                abandoned: '#999'
              };
              return `
                <div class="detail-list-item">
                  <div class="detail-list-info">
                    <div class="detail-list-title">${escapeHtml(task.summary)}</div>
                    <div class="detail-list-meta">
                      <span class="task-status-badge" style="background: ${statusColors[task.status] || statusColors.open}">
                        ${task.status}
                      </span>
                      <span class="task-priority-badge" style="background: ${priorityColors[task.priority] || priorityColors.medium}">
                        ${task.priority}
                      </span>
                      ${task.tabIds && task.tabIds.length > 0 ? `
                        <span class="task-meta">${task.tabIds.length} tab${task.tabIds.length !== 1 ? 's' : ''}</span>
                      ` : ''}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  return html;
}

async function handleEditCollection(collectionId) {
  const collections = state.get('collections') || [];
  const collection = collections.find(c => c.id === collectionId);

  if (!collection) {
    showNotification('Collection not found', 'error');
    return;
  }

  showEditCollectionModal(collection);
}

function showEditCollectionModal(collection) {
  // Create modal using ModalService if it doesn't exist
  if (!modalService.exists('editCollectionModal')) {
    const bodyHtml = `
        <input type="hidden" id="editCollectionId">

        <div class="form-group">
          <label for="editCollectionName">Name *</label>
          <input type="text" id="editCollectionName" class="form-control" placeholder="Collection name" required>
        </div>

        <div class="form-group">
          <label for="editCollectionDescription">Description</label>
          <textarea id="editCollectionDescription" class="form-control" rows="3" placeholder="Optional description"></textarea>
        </div>

        <div class="form-row">
          <div class="form-group" style="flex: 2;">
            <label for="editCollectionIcon">Icon</label>
            <input type="hidden" id="editCollectionIcon" value="📁">
            <div class="emoji-picker-container">
              <div class="emoji-current" id="currentEmoji">📁</div>
              <div class="emoji-grid-wrapper">
                <div class="emoji-categories">
                  <button type="button" class="emoji-category-btn active" data-category="folders">📁</button>
                  <button type="button" class="emoji-category-btn" data-category="work">💼</button>
                  <button type="button" class="emoji-category-btn" data-category="dev">💻</button>
                  <button type="button" class="emoji-category-btn" data-category="misc">🎯</button>
                </div>
                <div class="emoji-grid" id="emojiGrid">
                  <!-- Will be populated by JS -->
                </div>
              </div>
            </div>
          </div>

          <div class="form-group" style="flex: 1;">
            <label for="editCollectionColor">Color</label>
            <input type="color" id="editCollectionColor" class="form-control" value="#667eea">
          </div>
        </div>

        <div class="form-group">
          <label for="editCollectionTags">Tags (comma-separated)</label>
          <input type="text" id="editCollectionTags" class="form-control" placeholder="work, important, project">
        </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="cancelEditCollection">Cancel</button>
      <button class="btn btn-primary" id="saveEditCollection">Save Changes</button>
    `;

    modalService.create({
      id: 'editCollectionModal',
      title: 'Edit Collection',
      size: 'md',
      body: bodyHtml,
      footer: footerHtml,
      events: {
        '#cancelEditCollection': () => modalService.hide('editCollectionModal'),
        '#saveEditCollection': handleSaveEditCollection
      }
    });

    // Setup emoji picker after modal is created
    setupEmojiPicker();
  }

  // Populate modal with collection data
  document.getElementById('editCollectionId').value = collection.id;
  document.getElementById('editCollectionName').value = collection.name || '';
  document.getElementById('editCollectionDescription').value = collection.description || '';
  document.getElementById('editCollectionIcon').value = collection.icon || '📁';
  document.getElementById('editCollectionColor').value = collection.color || '#667eea';
  document.getElementById('editCollectionTags').value = (collection.tags || []).join(', ');

  // Update emoji picker current emoji
  const currentEmoji = document.getElementById('currentEmoji');
  if (currentEmoji) {
    currentEmoji.textContent = collection.icon || '📁';
  }

  // Show modal
  modalService.show('editCollectionModal');
}

function setupEmojiPicker() {
  const currentEmoji = document.getElementById('currentEmoji');
  const emojiGrid = document.getElementById('emojiGrid');
  const emojiInput = document.getElementById('editCollectionIcon');
  const categoryButtons = document.querySelectorAll('.emoji-category-btn');

  // Initialize with folders category
  renderEmojiGrid('folders');

  // Category switching
  categoryButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      categoryButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderEmojiGrid(btn.dataset.category);
    });
  });

  function renderEmojiGrid(category) {
    const emojis = EMOJI_CATEGORIES[category].emojis;
    emojiGrid.innerHTML = emojis.map(emoji =>
      `<button type="button" class="emoji-btn" data-emoji="${emoji}">${emoji}</button>`
    ).join('');

    // Add click handlers to emoji buttons
    emojiGrid.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const emoji = btn.dataset.emoji;
        currentEmoji.textContent = emoji;
        emojiInput.value = emoji;

        // Visual feedback
        emojiGrid.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }
}

async function handleSaveEditCollection() {
  const collectionId = document.getElementById('editCollectionId').value;
  const name = document.getElementById('editCollectionName').value.trim();

  if (!name) {
    showNotification('Collection name is required', 'error');
    return;
  }

  const tags = document.getElementById('editCollectionTags').value
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  const updates = {
    name,
    description: document.getElementById('editCollectionDescription').value.trim(),
    icon: document.getElementById('editCollectionIcon').value.trim() || '📁',
    color: document.getElementById('editCollectionColor').value,
    tags
  };

  try {
    const result = await chrome.runtime.sendMessage({
      action: 'updateCollection',
      id: collectionId,
      updates
    });

    if (result.success) {
      showNotification('Collection updated', 'success');
      modalService.hide('editCollectionModal');
      await loadCollectionsView(); // Refresh
    } else {
      showNotification('Failed to update collection', 'error');
    }
  } catch (error) {
    console.error('Error updating collection:', error);
    showNotification('Failed to update collection', 'error');
  }
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
      id: collectionId
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

async function handleExportCollection(collectionId) {
  try {
    showNotification('Exporting collection...', 'info');

    const result = await exportCollectionService(collectionId);

    if (result.success) {
      showNotification(formatExportSuccessMessage(result), 'success');
    } else {
      showNotification('Failed to export collection', 'error');
    }
  } catch (error) {
    console.error('Error exporting collection:', error);
    showNotification(`Export failed: ${error.message}`, 'error');
  }
}

async function handleExportAllCollections() {
  try {
    const collections = state.get('collections') || [];

    if (collections.length === 0) {
      showNotification('No collections to export', 'warning');
      return;
    }

    showNotification(`Exporting ${collections.length} collections...`, 'info');

    const result = await exportAllCollectionsService();

    if (result.success) {
      showNotification(formatExportSuccessMessage(result), 'success');
    } else {
      showNotification('Failed to export collections', 'error');
    }
  } catch (error) {
    console.error('Error exporting all collections:', error);
    showNotification(`Export failed: ${error.message}`, 'error');
  }
}

async function handleImportCollections(file) {
  try {
    showNotification('Importing collections...', 'info');

    const result = await importCollectionsService(file);

    if (result.success) {
      const { imported, errors, stats } = result;

      // Show success message
      if (imported.length > 0) {
        showNotification(formatImportSuccessMessage(result), 'success');
      }

      // Show errors if any collections failed
      if (errors.length > 0) {
        showNotification(formatImportErrorMessage(result, '\n'), 'error');
      }

      // Show warnings from import process
      if (stats.warnings && stats.warnings.length > 0) {
        console.warn('Import warnings:', stats.warnings);
      }

      // Refresh view if any collections were imported
      if (imported.length > 0) {
        await loadCollectionsView();
      }
    } else {
      showNotification('Failed to import collections', 'error');
    }
  } catch (error) {
    console.error('Error importing collections:', error);
    showNotification(`Import failed: ${error.message}`, 'error');
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
