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
} from '../../../services/utils/collection-import-export-ui.js';

import keyboardShortcuts from '../keyboard-shortcuts.js';

import { t, tPlural } from '../../../services/utils/i18n.js';

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
    // THIN - delegate to background for window queries
    const windowsResponse = await chrome.runtime.sendMessage({ action: 'getAllWindows' });
    const windows = windowsResponse?.windows || [];
    const windowMap = new Map(windows.map(w => [w.id, w]));

    // Store in state
    state.set('collections', collections);
    state.set('collectionTasks', tasks);
    state.set('windowMap', windowMap);

    // Render the view
    renderCollectionsView(collections, tasks, windowMap);

    // Setup event listeners
    setupCollectionsEventListeners();

    // Load sync status for active collections
    loadSyncStatusForActiveCollections(collections);

    // Phase 10: Setup keyboard shortcuts
    setupCollectionsKeyboardShortcuts();

    // Set focusable items for arrow key navigation
    setTimeout(() => {
      const collectionCards = document.querySelectorAll('.collection-card');
      keyboardShortcuts.setFocusableItems(collectionCards);
    }, 100);

  } catch (error) {
    console.error('Error loading collections:', error);
    showNotification(t('dashboard_collections_errorTitle'), 'error');
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
               placeholder="${t('dashboard_collections_searchPlaceholder')}">
        <select class="filter-select" id="filterCollections">
          <option value="all">${t('dashboard_collections_filterAll')}</option>
          <option value="active">${t('dashboard_collections_filterActive')}</option>
          <option value="saved">${t('dashboard_collections_filterSaved')}</option>
          <option value="archived">${t('dashboard_collections_filterArchived')}</option>
        </select>
        <select class="filter-select" id="sortCollections">
          <option value="lastAccessed">${t('dashboard_collections_sortLastAccessed')}</option>
          <option value="name">${t('dashboard_collections_sortName')}</option>
          <option value="created">${t('dashboard_collections_sortCreated')}</option>
          <option value="tabCount">${t('dashboard_collections_sortTabCount')}</option>
        </select>
        <div class="view-toggle" style="display: inline-flex; gap: 2px; background: #f0f0f0; border-radius: 6px; padding: 2px;">
          <button class="view-toggle-btn active" data-view="grid" title="${t('dashboard_tabs_gridViewTitle')}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          </button>
          <button class="view-toggle-btn" data-view="list" title="${t('dashboard_collections_listViewTitle')}">
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
        <button class="btn btn-secondary" id="exportAllCollections" title="${t('dashboard_collections_exportAllTitle')}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          ${t('dashboard_collections_exportAll')}
        </button>
        <button class="btn btn-primary" id="importCollections" title="${t('dashboard_collections_importTitle')}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          ${t('dashboard_collections_import')}
        </button>
        <input type="file" id="importFileInput" accept=".json" style="display: none;">
      </div>
    </div>

    <div class="collections-content" id="collectionsContent">
  `;

  // Render active collections
  if (active.length > 0) {
    html += renderCollectionSection('active-collections', t('dashboard_collections_sectionActive'), active, taskCounts, windowMap, true);
  }

  // Render saved collections
  if (saved.length > 0) {
    html += renderCollectionSection('saved-collections', t('dashboard_collections_sectionSaved'), saved, taskCounts, windowMap, false);
  }

  // Render archived collections (collapsed by default)
  if (archived.length > 0) {
    html += renderCollectionSection('archived', t('dashboard_collections_sectionArchived'), archived, taskCounts, windowMap, false, true);
  }

  html += '</div>'; // Close collections-content

  container.innerHTML = html;
}

function renderCollectionSection(sectionId, title, collections, taskCounts, windowMap, isActive, isCollapsed = false) {
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
    : t('dashboard_collections_never');

  // Get window info for active collections
  let windowBadge = '';
  if (isActive && collection.windowId) {
    const window = windowMap.get(collection.windowId);
    if (window) {
      windowBadge = `<span class="window-badge">${t('dashboard_collections_windowBadge', String(collection.windowId))}</span>`;
    }
  }

  const tags = collection.tags && collection.tags.length > 0
    ? collection.tags.slice(0, 3).map(tag =>
      `<span class="tag">${escapeHtml(tag)}</span>`
    ).join('')
    : '';

  const moreTags = collection.tags && collection.tags.length > 3
    ? `<span class="tag more">${t('dashboard_collections_moreTags', String(collection.tags.length - 3))}</span>`
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
            ${escapeHtml(collection.description || t('dashboard_collections_noDescription'))}
          </p>
        </div>
      </div>

      <div class="collection-stats">
        <div class="stat">
          <span class="stat-value">${tabCount}</span>
          <span class="stat-label">${t('dashboard_collections_statTabs')}</span>
        </div>
        <div class="stat">
          <span class="stat-value">${folderCount}</span>
          <span class="stat-label">${t('dashboard_collections_statFolders')}</span>
        </div>
        <div class="stat">
          <span class="stat-value">${taskCount}</span>
          <span class="stat-label">${t('dashboard_collections_statTasks')}</span>
        </div>
        <div class="stat">
          <span class="stat-value">${lastAccessed}</span>
          <span class="stat-label">${t('dashboard_collections_statAccessed')}</span>
        </div>
      </div>

      ${isActive ? `
        <div class="sync-status-dashboard" data-sync-status="${collection.id}">
          <div class="sync-stat">
            <span class="sync-label">${t('dashboard_collections_syncLastLabel')}</span>
            <span class="sync-value" data-sync-last="${collection.id}">${t('dashboard_collections_syncLoading')}</span>
          </div>
          <div class="sync-stat">
            <span class="sync-label">${t('dashboard_collections_syncPendingLabel')}</span>
            <span class="sync-value" data-sync-pending="${collection.id}">${t('dashboard_collections_syncPendingPlaceholder')}</span>
          </div>
        </div>
      ` : ''}

      ${tags || moreTags ? `<div class="collection-tags">${tags}${moreTags}</div>` : ''}

      <div class="collection-actions">
        ${isActive
    ? `<button class="btn btn-sm btn-secondary" data-action="focus" data-collection-id="${collection.id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              ${t('dashboard_collections_focusWindow')}
            </button>
            <button class="btn btn-sm btn-secondary" data-action="close" data-collection-id="${collection.id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              ${t('common_close')}
            </button>`
    : `<button class="btn btn-sm btn-primary" data-action="open" data-collection-id="${collection.id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              ${t('dashboard_collections_open')}
            </button>`}
        <button class="btn btn-sm btn-secondary" data-action="view-details" data-collection-id="${collection.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          ${t('dashboard_collections_details')}
        </button>
        <button class="btn btn-sm btn-secondary" data-action="edit" data-collection-id="${collection.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
          ${t('common_edit')}
        </button>
        <button class="btn btn-sm btn-secondary" data-action="delete" data-collection-id="${collection.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          ${t('common_delete')}
        </button>
        <button class="btn btn-sm btn-secondary" data-action="export" data-collection-id="${collection.id}" title="${t('dashboard_collections_exportCardTitle')}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          ${t('dashboard_collections_export')}
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
        <h3>${t('dashboard_collections_emptyTitle')}</h3>
        <p>${t('dashboard_collections_emptyText')}</p>
        <button class="btn btn-primary" id="createFirstCollection">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          ${t('dashboard_collections_saveCurrentWindow')}
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
        <h3>${t('dashboard_collections_errorTitle')}</h3>
        <p>${escapeHtml(message || t('dashboard_collections_errorDefault'))}</p>
        <button class="btn btn-primary" id="retryLoadCollections">${t('dashboard_collections_retry')}</button>
      </div>
    `;
  }

  container.innerHTML = html;

  // Add event listener for retry button (CSP-compliant)
  const retryBtn = document.getElementById('retryLoadCollections');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => window.location.reload());
  }
}

// ============================================================================
// Event Listeners
// ============================================================================

// AbortController for persistent event listeners
// Allows clean removal of listeners when view re-renders
let listenerController = null;

function setupCollectionsEventListeners() {
  const container = document.getElementById('collectionsContainer');
  if (!container) return;

  // Clean up old listeners if they exist
  if (listenerController) {
    listenerController.abort();
  }

  // Create new controller for this set of listeners
  listenerController = new AbortController();
  const signal = listenerController.signal;

  // Delegate favicon error handling (CSP-compliant)
  container.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG' && e.target.classList.contains('favicon-img')) {
      e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22%3E%3Ctext y=%2212%22 font-size=%2212%22%3E🌐%3C/text%3E%3C/svg%3E';
    }
  }, { signal, capture: true });

  // Delegate all collection action buttons
  container.addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const collectionId = button.dataset.collectionId;

    e.preventDefault();
    e.stopPropagation();

    await handleCollectionAction(action, collectionId);
  }, { signal });

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
  }, { signal });

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
    showNotification(t('dashboard_collections_actionFailed'), 'error');
  }
}

async function handleOpenCollection(collectionId) {
  try {
    showNotification(t('dashboard_collections_restoring'), 'info');

    const result = await chrome.runtime.sendMessage({
      action: 'restoreCollection',
      collectionId,
      options: { createNewWindow: true }
    });

    if (result.success) {
      showNotification(t('dashboard_collections_openedInWindow', String(result.windowId)), 'success');
      await loadCollectionsView(); // Refresh
    } else {
      showNotification(t('dashboard_collections_openFailed'), 'error');
    }
  } catch (error) {
    console.error('Error opening collection:', error);
    showNotification(t('dashboard_collections_openFailed'), 'error');
  }
}

async function handleFocusWindow(collectionId) {
  try {
    const collections = state.get('collections') || [];
    const collection = collections.find(c => c.id === collectionId);

    if (!collection || !collection.windowId) {
      showNotification(t('dashboard_collections_notActive'), 'error');
      return;
    }

    // THIN - delegate to WindowService via message passing
    const result = await chrome.runtime.sendMessage({
      action: 'focusWindow',
      windowId: collection.windowId
    });

    if (result.success) {
      showNotification(t('dashboard_collections_windowFocused'), 'success');
    } else {
      showNotification(t('dashboard_collections_focusFailed'), 'error');
    }
  } catch (error) {
    console.error('Error focusing window:', error);
    showNotification(t('dashboard_collections_focusFailed'), 'error');
  }
}

async function handleCloseWindow(collectionId) {
  try {
    const collections = state.get('collections') || [];
    const collection = collections.find(c => c.id === collectionId);

    if (!collection || !collection.windowId) {
      showNotification(t('dashboard_collections_notActive'), 'error');
      return;
    }

    if (!confirm(t('dashboard_collections_confirmCloseWindow', collection.name))) {
      return;
    }

    // THIN - delegate to WindowService via message passing
    const result = await chrome.runtime.sendMessage({
      action: 'closeWindow',
      windowId: collection.windowId
    });

    if (result.success) {
      showNotification(t('dashboard_collections_windowClosedSaved'), 'success');
      // Refresh view
      setTimeout(() => loadCollectionsView(), 500);
    } else {
      showNotification(t('dashboard_collections_closeFailed'), 'error');
    }
  } catch (error) {
    console.error('Error closing window:', error);
    showNotification(t('dashboard_collections_closeFailed'), 'error');
  }
}

async function handleViewDetails(collectionId) {
  try {
    showNotification(t('dashboard_collections_loadingDetails'), 'info');

    // Get complete collection with all tabs, folders, and tasks
    const response = await chrome.runtime.sendMessage({
      action: 'getCompleteCollection',
      id: collectionId
    });

    if (response.success && response.collection) {
      showCollectionDetailsModal(response.collection);
    } else {
      showNotification(t('dashboard_collections_detailsFailed'), 'error');
    }
  } catch (error) {
    console.error('Error loading collection details:', error);
    showNotification(t('dashboard_collections_detailsFailed'), 'error');
  }
}

function showCollectionDetailsModal(collection) {
  // Create modal using ModalService if it doesn't exist
  if (!modalService.exists('collectionDetailsModal')) {
    modalService.create({
      id: 'collectionDetailsModal',
      title: t('dashboard_collections_detailsTitle'),
      size: 'lg',
      body: '<!-- Content will be populated dynamically -->',
      footer: `<button class="btn btn-secondary" id="closeCollectionDetails">${t('common_close')}</button>`,
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
  const createdDate = collection.createdAt ? new Date(collection.createdAt).toLocaleString() : t('dashboard_collections_unknown');
  const lastAccessed = collection.metadata?.lastAccessed
    ? getTimeAgo(collection.metadata.lastAccessed)
    : t('dashboard_collections_never');

  const tabs = collection.tabs || [];
  const folders = collection.folders || [];
  const tasks = collection.tasks || [];

  const html = `
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
        <h4>${t('dashboard_collections_information')}</h4>
        <div class="details-grid">
          <div class="detail-item">
            <span class="detail-label">${t('dashboard_collections_statusLabel')}</span>
            <span class="detail-value">${collection.isActive ? t('dashboard_collections_statusActive') : t('dashboard_collections_statusSaved')}</span>
          </div>
          ${collection.windowId ? `
            <div class="detail-item">
              <span class="detail-label">${t('dashboard_collections_windowLabel')}</span>
              <span class="detail-value">#${collection.windowId}</span>
            </div>
          ` : ''}
          <div class="detail-item">
            <span class="detail-label">${t('dashboard_collections_createdLabel')}</span>
            <span class="detail-value">${createdDate}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t('dashboard_collections_lastAccessedLabel')}</span>
            <span class="detail-value">${lastAccessed}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t('dashboard_collections_tabsLabel')}</span>
            <span class="detail-value">${tabs.length}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t('dashboard_collections_foldersLabel')}</span>
            <span class="detail-value">${folders.length}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">${t('dashboard_collections_tasksLabel')}</span>
            <span class="detail-value">${tasks.length}</span>
          </div>
        </div>
      </div>

      <!-- Tags Section -->
      ${collection.tags && collection.tags.length > 0 ? `
        <div class="details-section">
          <h4>${t('dashboard_collections_tags')}</h4>
          <div class="details-tags">
            ${collection.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Folders & Tabs Section (Hierarchical) -->
      ${folders.length > 0 || collection.ungroupedTabs?.length > 0 ? `
        <div class="details-section">
          <h4>${t('dashboard_collections_foldersAndTabs')}</h4>
          <div class="details-list">
            ${folders.map(folder => `
              <div class="folder-section">
                <div class="folder-header">
                  <span class="folder-icon">📁</span>
                  <strong>${escapeHtml(folder.name || t('dashboard_collections_untitledFolder'))}</strong>
                  <span class="folder-count">${t('dashboard_collections_folderTabCount', String(folder.tabs?.length || 0))}</span>
                </div>
                ${folder.tabs && folder.tabs.length > 0 ? `
                  <div class="folder-tabs">
                    ${folder.tabs.map(tab => `
                      <div class="detail-list-item nested">
                        <img src="${tab.favIconUrl || 'chrome://favicon/size/16@1x/' + tab.url}"
                             width="16" height="16"
                             class="favicon-img">
                        <div class="detail-list-info">
                          <div class="detail-list-title">${escapeHtml(tab.title || t('dashboard_collections_untitled'))}</div>
                          <div class="detail-list-url">${escapeHtml(tab.url || '')}</div>
                          ${tab.note ? `<div class="detail-list-note">📝 ${escapeHtml(tab.note)}</div>` : ''}
                        </div>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            `).join('')}
            ${collection.ungroupedTabs && collection.ungroupedTabs.length > 0 ? `
              <div class="folder-section">
                <div class="folder-header">
                  <span class="folder-icon">📄</span>
                  <strong>${t('dashboard_collections_ungrouped')}</strong>
                  <span class="folder-count">${t('dashboard_collections_folderTabCount', String(collection.ungroupedTabs.length))}</span>
                </div>
                <div class="folder-tabs">
                  ${collection.ungroupedTabs.map(tab => `
                    <div class="detail-list-item nested">
                      <img src="${tab.favIconUrl || 'chrome://favicon/size/16@1x/' + tab.url}"
                           width="16" height="16"
                           class="favicon-img">
                      <div class="detail-list-info">
                        <div class="detail-list-title">${escapeHtml(tab.title || t('dashboard_collections_untitled'))}</div>
                        <div class="detail-list-url">${escapeHtml(tab.url || '')}</div>
                        ${tab.note ? `<div class="detail-list-note">📝 ${escapeHtml(tab.note)}</div>` : ''}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}

      <!-- Tasks Section -->
      ${tasks.length > 0 ? `
        <div class="details-section">
          <h4>${t('dashboard_collections_tasksHeading', String(tasks.length))}</h4>
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
                        <span class="task-meta">${tPlural('dashboard_collections_taskTabCount', task.tabIds.length)}</span>
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
    showNotification(t('dashboard_collections_notFound'), 'error');
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
          <label for="editCollectionName">${t('dashboard_collections_formName')}</label>
          <input type="text" id="editCollectionName" class="form-control" placeholder="${t('dashboard_collections_formNamePlaceholder')}" required>
        </div>

        <div class="form-group">
          <label for="editCollectionDescription">${t('dashboard_collections_formDescription')}</label>
          <textarea id="editCollectionDescription" class="form-control" rows="3" placeholder="${t('dashboard_collections_formDescriptionPlaceholder')}"></textarea>
        </div>

        <div class="form-row">
          <div class="form-group" style="flex: 2;">
            <label for="editCollectionIcon">${t('dashboard_collections_formIcon')}</label>
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
            <label for="editCollectionColor">${t('dashboard_collections_formColor')}</label>
            <input type="color" id="editCollectionColor" class="form-control" value="#667eea">
          </div>
        </div>

        <div class="form-group">
          <label for="editCollectionTags">${t('dashboard_collections_formTags')}</label>
          <input type="text" id="editCollectionTags" class="form-control" placeholder="${t('dashboard_collections_formTagsPlaceholder')}">
        </div>

        <div class="form-group">
          <label class="section-label">${t('dashboard_collections_syncSettingsLabel')}</label>
          <div class="settings-section">
            <div class="setting-row-dashboard">
              <label class="checkbox-label">
                <input type="checkbox" id="editTrackingEnabled">
                <span>${t('dashboard_collections_enableTracking')}</span>
              </label>
              <small class="setting-help">${t('dashboard_collections_enableTrackingHelp')}</small>
            </div>

            <div class="setting-row-dashboard">
              <label for="editSyncDebounce">${t('dashboard_collections_syncDelay')}</label>
              <div class="slider-row">
                <input type="range" id="editSyncDebounce" min="0" max="10" step="0.5" value="2" class="sync-slider">
                <span id="editSyncDebounceValue">2.0s</span>
              </div>
              <small class="setting-help">${t('dashboard_collections_syncDelayHelp')}</small>
            </div>
          </div>
        </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="cancelEditCollection">${t('common_cancel')}</button>
      <button class="btn btn-primary" id="saveEditCollection">${t('dashboard_collections_saveChanges')}</button>
    `;

    modalService.create({
      id: 'editCollectionModal',
      title: t('dashboard_collections_editTitle'),
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

  // Populate progressive sync settings
  const settings = collection.settings || {
    trackingEnabled: true,
    syncDebounceMs: 2000
  };
  document.getElementById('editTrackingEnabled').checked = settings.trackingEnabled ?? true;

  const syncDebounceSeconds = (settings.syncDebounceMs || 2000) / 1000;
  document.getElementById('editSyncDebounce').value = syncDebounceSeconds;
  document.getElementById('editSyncDebounceValue').textContent = `${syncDebounceSeconds.toFixed(1)}s`;
  document.getElementById('editSyncDebounce').disabled = !settings.trackingEnabled;

  // Setup settings event listeners
  setupEditSettingsHandlers();

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

function setupEditSettingsHandlers() {
  const trackingCheckbox = document.getElementById('editTrackingEnabled');
  const syncSlider = document.getElementById('editSyncDebounce');
  const syncValue = document.getElementById('editSyncDebounceValue');

  if (!trackingCheckbox || !syncSlider || !syncValue) return;

  // Handle tracking enabled toggle
  trackingCheckbox.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    syncSlider.disabled = !enabled;
  });

  // Handle sync delay slider
  syncSlider.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    syncValue.textContent = `${value.toFixed(1)}s`;
  });
}

async function handleSaveEditCollection() {
  const collectionId = document.getElementById('editCollectionId').value;
  const name = document.getElementById('editCollectionName').value.trim();

  if (!name) {
    showNotification(t('dashboard_collections_nameRequired'), 'error');
    return;
  }

  const tags = document.getElementById('editCollectionTags').value
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0);

  // Get progressive sync settings
  const trackingEnabled = document.getElementById('editTrackingEnabled').checked;
  const syncDebounceSeconds = parseFloat(document.getElementById('editSyncDebounce').value);
  const syncDebounceMs = Math.round(syncDebounceSeconds * 1000);

  const updates = {
    name,
    description: document.getElementById('editCollectionDescription').value.trim(),
    icon: document.getElementById('editCollectionIcon').value.trim() || '📁',
    color: document.getElementById('editCollectionColor').value,
    tags,
    settings: {
      trackingEnabled,
      syncDebounceMs
    }
  };

  try {
    const result = await chrome.runtime.sendMessage({
      action: 'updateCollection',
      id: collectionId,
      updates
    });

    if (result.success) {
      showNotification(t('dashboard_collections_updated'), 'success');
      modalService.hide('editCollectionModal');
      await loadCollectionsView(); // Refresh
    } else {
      showNotification(t('dashboard_collections_updateFailed'), 'error');
    }
  } catch (error) {
    console.error('Error updating collection:', error);
    showNotification(t('dashboard_collections_updateFailed'), 'error');
  }
}

async function handleDeleteCollection(collectionId) {
  try {
    const collections = state.get('collections') || [];
    const collection = collections.find(c => c.id === collectionId);

    if (!collection) {
      showNotification(t('dashboard_collections_notFound'), 'error');
      return;
    }

    if (!confirm(t('dashboard_collections_confirmDelete', collection.name))) {
      return;
    }

    const result = await chrome.runtime.sendMessage({
      action: 'deleteCollection',
      id: collectionId
    });

    if (result.success) {
      showNotification(t('dashboard_collections_deleted'), 'success');
      await loadCollectionsView(); // Refresh
    } else {
      showNotification(t('dashboard_collections_deleteFailed'), 'error');
    }
  } catch (error) {
    console.error('Error deleting collection:', error);
    showNotification(t('dashboard_collections_deleteFailed'), 'error');
  }
}

async function handleCreateCollection() {
  try {
    // THIN - delegate to background for window queries
    const windowResponse = await chrome.runtime.sendMessage({ action: 'getCurrentWindow' });
    const currentWindow = windowResponse.window;

    showNotification(t('dashboard_collections_savingWindow'), 'info');

    const result = await chrome.runtime.sendMessage({
      action: 'captureWindow',
      windowId: currentWindow.id,
      metadata: {
        name: `Window ${currentWindow.id}`,
        description: 'Captured from dashboard'
      }
    });

    if (result.success) {
      showNotification(t('dashboard_collections_created'), 'success');
      await loadCollectionsView(); // Refresh
    } else {
      showNotification(t('dashboard_collections_createFailed'), 'error');
    }
  } catch (error) {
    console.error('Error creating collection:', error);
    showNotification(t('dashboard_collections_createFailed'), 'error');
  }
}

async function handleExportCollection(collectionId) {
  try {
    showNotification(t('dashboard_collections_exporting'), 'info');

    const result = await exportCollectionService(collectionId);

    if (result.success) {
      showNotification(formatExportSuccessMessage(result), 'success');
    } else {
      showNotification(t('dashboard_collections_exportFailed'), 'error');
    }
  } catch (error) {
    console.error('Error exporting collection:', error);
    showNotification(t('dashboard_collections_exportFailedMsg', error.message), 'error');
  }
}

async function handleExportAllCollections() {
  try {
    const collections = state.get('collections') || [];

    if (collections.length === 0) {
      showNotification(t('dashboard_collections_noneToExport'), 'warning');
      return;
    }

    showNotification(tPlural('dashboard_collections_exportingCount', collections.length), 'info');

    const result = await exportAllCollectionsService();

    if (result.success) {
      showNotification(formatExportSuccessMessage(result), 'success');
    } else {
      showNotification(t('dashboard_collections_exportAllFailed'), 'error');
    }
  } catch (error) {
    console.error('Error exporting all collections:', error);
    showNotification(t('dashboard_collections_exportFailedMsg', error.message), 'error');
  }
}

async function handleImportCollections(file) {
  try {
    showNotification(t('dashboard_collections_importing'), 'info');

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
      showNotification(t('dashboard_collections_importFailed'), 'error');
    }
  } catch (error) {
    console.error('Error importing collections:', error);
    showNotification(t('dashboard_collections_importFailedMsg', error.message), 'error');
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
  const filtered = collections.filter(collection => {
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
  loadSyncStatusForActiveCollections(filtered); // Reload sync status
}

// ============================================================================
// Sync Status Loading
// ============================================================================

/**
 * Load sync status for all active collections
 */
async function loadSyncStatusForActiveCollections(collections) {
  const activeCollections = collections.filter(c => c.isActive);

  for (const collection of activeCollections) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getSyncStatus',
        collectionId: collection.id
      });

      if (!response) continue;

      // Update last sync display
      const lastSyncEl = document.querySelector(`[data-sync-last="${collection.id}"]`);
      if (lastSyncEl) {
        if (response.lastSyncTime) {
          const timeAgo = formatSyncTimeAgo(response.lastSyncTime);
          lastSyncEl.textContent = timeAgo;
          lastSyncEl.title = new Date(response.lastSyncTime).toLocaleString();
        } else {
          lastSyncEl.textContent = t('dashboard_collections_never');
        }
      }

      // Update pending changes display
      const pendingEl = document.querySelector(`[data-sync-pending="${collection.id}"]`);
      if (pendingEl) {
        const count = response.pendingChanges || 0;
        pendingEl.textContent = count.toString();
        if (count > 0) {
          pendingEl.classList.add('has-pending-changes');
        } else {
          pendingEl.classList.remove('has-pending-changes');
        }
      }
    } catch (error) {
      console.error(`Failed to load sync status for ${collection.id}:`, error);
    }
  }
}

/**
 * Format sync time ago (compact for dashboard)
 */
function formatSyncTimeAgo(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 10000) return t('dashboard_collections_syncJustNow');
  if (diff < 60000) return t('dashboard_collections_syncSecondsAgo', String(Math.floor(diff / 1000)));
  if (diff < 3600000) return t('dashboard_collections_syncMinutesAgo', String(Math.floor(diff / 60000)));
  if (diff < 86400000) return t('dashboard_collections_syncHoursAgo', String(Math.floor(diff / 3600000)));
  return t('dashboard_collections_syncDaysAgo', String(Math.floor(diff / 86400000)));
}

// ============================================================================
// Keyboard Shortcuts (Phase 10)
// ============================================================================

function setupCollectionsKeyboardShortcuts() {
  // Create New Collection (n or c)
  keyboardShortcuts.register('n', async () => {
    await handleCreateCollection();
  }, {
    category: 'collections',
    description: 'Create new collection',
    context: 'collections'
  });

  keyboardShortcuts.register('c', async () => {
    await handleCreateCollection();
  }, {
    category: 'collections',
    description: 'Create new collection',
    context: 'collections'
  });

  // Edit Selected Collection (e)
  keyboardShortcuts.register('e', () => {
    const focusedItem = keyboardShortcuts.getFocusedItem();
    if (focusedItem) {
      const collectionId = focusedItem.dataset.collectionId;
      if (collectionId) {
        handleEditCollection(collectionId);
      }
    }
  }, {
    category: 'collections',
    description: 'Edit selected collection',
    context: 'collections'
  });

  // Delete Selected Collection (d)
  keyboardShortcuts.register('d', () => {
    const focusedItem = keyboardShortcuts.getFocusedItem();
    if (focusedItem) {
      const collectionId = focusedItem.dataset.collectionId;
      if (collectionId) {
        handleDeleteCollection(collectionId);
      }
    }
  }, {
    category: 'collections',
    description: 'Delete selected collection',
    context: 'collections'
  });

  // Open Selected Collection (o)
  keyboardShortcuts.register('o', async () => {
    const focusedItem = keyboardShortcuts.getFocusedItem();
    if (focusedItem) {
      const collectionId = focusedItem.dataset.collectionId;
      if (collectionId) {
        try {
          const result = await chrome.runtime.sendMessage({
            action: 'restoreCollection',
            id: collectionId
          });
          if (result.success) {
            showNotification(t('dashboard_collections_opened'), 'success');
            await loadCollectionsView();
          } else {
            showNotification(t('dashboard_collections_openFailed'), 'error');
          }
        } catch (error) {
          console.error('Error opening collection:', error);
          showNotification(t('dashboard_collections_openFailed'), 'error');
        }
      }
    }
  }, {
    category: 'collections',
    description: 'Open selected collection',
    context: 'collections'
  });

  // Focus Window (w) - for active collections
  keyboardShortcuts.register('w', async () => {
    const focusedItem = keyboardShortcuts.getFocusedItem();
    if (focusedItem) {
      const collectionId = focusedItem.dataset.collectionId;
      if (collectionId) {
        // Reuse shared handler to avoid duplication
        await handleFocusWindow(collectionId);
      }
    }
  }, {
    category: 'collections',
    description: 'Focus window (active collections)',
    context: 'collections'
  });

  // Close Window (x) - for active collections
  keyboardShortcuts.register('x', async () => {
    const focusedItem = keyboardShortcuts.getFocusedItem();
    if (focusedItem) {
      const collectionId = focusedItem.dataset.collectionId;
      if (collectionId) {
        // Reuse shared handler to avoid duplication
        await handleCloseWindow(collectionId);
      }
    }
  }, {
    category: 'collections',
    description: 'Close window (active collections)',
    context: 'collections'
  });

  // Arrow keys navigation
  keyboardShortcuts.register('arrowdown', (e) => {
    e.preventDefault();
    keyboardShortcuts.navigateFocusable('down');
  }, {
    category: 'collections',
    description: 'Navigate down',
    context: 'collections'
  });

  keyboardShortcuts.register('arrowup', (e) => {
    e.preventDefault();
    keyboardShortcuts.navigateFocusable('up');
  }, {
    category: 'collections',
    description: 'Navigate up',
    context: 'collections'
  });

  // Enter - View details
  keyboardShortcuts.register('enter', () => {
    const focusedItem = keyboardShortcuts.getFocusedItem();
    if (focusedItem) {
      const collectionId = focusedItem.dataset.collectionId;
      if (collectionId) {
        handleViewDetails(collectionId);
      }
    }
  }, {
    category: 'collections',
    description: 'View collection details',
    context: 'collections'
  });

  // Space - Toggle collection selection
  keyboardShortcuts.register(' ', (e) => {
    e.preventDefault();
    const focusedItem = keyboardShortcuts.getFocusedItem();
    if (focusedItem) {
      const collectionId = focusedItem.dataset.collectionId;
      if (collectionId) {
        const checkbox = focusedItem.querySelector('input[type="checkbox"]');
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
  }, {
    category: 'collections',
    description: 'Toggle collection selection',
    context: 'collections'
  });

  console.log('Collections keyboard shortcuts registered');
}
