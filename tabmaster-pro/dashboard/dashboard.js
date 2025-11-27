// Dashboard JavaScript for TabMaster Pro

// Import utilities
import { 
  debounce, 
  formatBytes, 
  getTimeAgo, 
  getActivityIcon, 
  getGroupColor, 
  getTabState, 
  getLastAccessText,
  getWindowSignature,
  generateWindowColor,
  getFaviconUrl,
  getColorForDomain,
  escapeHtml,
  sortTabs
} from './modules/core/utils.js';

import { 
  VIEWS, 
  TAB_STATES, 
  ACTIVITY_TYPES, 
  SORT_TYPES, 
  FILTER_TYPES, 
  STORAGE_KEYS,
  LIMITS 
} from './modules/core/constants.js';

import state from './modules/core/state.js';

// Import shared utilities
import {
  handleTabSelection,
  clearSelection,
  showNotification,
  showRenameWindowsDialog,
  selectionState
} from './modules/core/shared-utils.js';

// Phase 8.3: Snooze formatters for SnoozeModal component
// Note: Detection and execution services are called via message passing (background handlers)
// Only formatters are imported here for the modal component to use
import { formatSnoozeTitle, formatSnoozeDescription } from '../services/utils/snoozeFormatters.js';

// Window name service for consistent window name handling
import { getWindowNames } from '../services/utils/WindowNameService.js';

// Phase 10: Keyboard shortcuts system
import keyboardShortcuts from './modules/keyboard-shortcuts.js';
import helpModal from './modules/help-modal.js';

// Tasks view modules
import { showTaskDetailModal, handleBulkAction } from './modules/views/tasks-base.js';

// Import view modules
import { 
  loadTabsView, 
  updateTabCount, 
  renderTabs, 
  renderGridView, 
  renderTreeView,
  updateWindowFilterDropdown,
  filterTabs,
  sortAndRenderTabs 
} from './modules/views/tabs.js';
import { loadOverviewData, cleanupCharts } from './modules/views/overview.js';
import { 
  loadRulesView, 
  updateRulesUI, 
  setupRulesEventListeners,
  handleRuleAction,
  installSampleRule,
  openRuleModal,
  closeRuleModal,
  saveRule,
  toggleRule,
  deleteRule,
  toggleAllRules,
  testRule,
  testAllRules,
  setupRuleDragAndDrop,
  updateRulePriorities
} from './modules/views/rules.js';
import { loadGroupsView, groupTabsByDomain, ungroupAllTabs } from './modules/views/groups.js';
import { loadSnoozedView } from './modules/views/snoozed.js';
import { loadHistoryView } from './modules/views/history.js';
import { loadCollectionsView } from './modules/views/collections.js';
import { loadKanbanView } from './modules/views/tasks-kanban.js';
import { loadListView } from './modules/views/tasks-list.js';

// ============================================================================
// State Management
// ============================================================================

// Note: All state is now managed through the state module
// Access state with: state.get('propertyName')
// Update state with: state.set('propertyName', value)
// Subscribe to changes with: state.subscribe(['propertyName'], callback)

// ============================================================================
// Initialization
// ============================================================================

// Store modal instances outside of state to preserve their methods
let snoozeModalInstance = null;

// Use window.addEventListener to ensure all scripts are loaded
window.addEventListener('load', async () => {
  await initializeDashboard();
  setupEventListeners();
  setupNavigation();

  // Handle deep linking from URL parameters
  handleDeepLink();

  // Initialize snooze modal - should be available after window load
  if (typeof SnoozeModal !== 'undefined') {
    console.log('Initializing SnoozeModal');
    snoozeModalInstance = new SnoozeModal();
  } else {
    console.error('SnoozeModal class not found after window load');
  }

  // Phase 10: Initialize keyboard shortcuts
  setupKeyboardShortcuts();

  // Refresh data periodically
  setInterval(refreshData, 30000); // Every 30 seconds
  
  // Handle window resize with debouncing
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      // Resize charts if they exist
      const activityChart = state.get('activityChart');
      const domainsChart = state.get('domainsChart');
      if (activityChart && typeof activityChart.resize === 'function') {
        activityChart.resize();
      }
      if (domainsChart && typeof domainsChart.resize === 'function') {
        domainsChart.resize();
      }
    }, 250);
  });
});

async function initializeDashboard() {
  await loadOverviewData();
}


// ============================================================================
// Navigation
// ============================================================================

function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.dataset.view;
      switchView(view);

      // Update active state
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
    });
  });

  // Setup stat card navigation (overview page deep links)
  const statCards = document.querySelectorAll('.stat-card-link');
  statCards.forEach(card => {
    card.addEventListener('click', () => {
      const navigate = card.dataset.navigate;
      if (navigate) {
        // Special case: "duplicates" navigates to tabs view with duplicates filter
        if (navigate === 'duplicates') {
          switchView('tabs', 'duplicates');
          // Update nav active state to show Tabs as active
          navItems.forEach(nav => {
            nav.classList.toggle('active', nav.dataset.view === 'tabs');
          });
          window.location.hash = 'tabs';
        } else {
          switchView(navigate);
          // Update nav active state
          navItems.forEach(nav => {
            nav.classList.toggle('active', nav.dataset.view === navigate);
          });
          window.location.hash = navigate;
        }
      }
    });
  });
}

function handleDeepLink() {
  // Get filter from URL params (e.g., ?filter=duplicates)
  const urlParams = new URLSearchParams(window.location.search);
  const filter = urlParams.get('filter');

  // Get view from URL hash (e.g., #groups)
  const hash = window.location.hash.substring(1);

  // Switch to the specified view if provided
  if (hash) {
    console.log('Deep link detected - view:', hash, 'filter:', filter);
    switchView(hash, filter);

    // Update nav active state
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(nav => {
      if (nav.dataset.view === hash) {
        nav.classList.add('active');
      } else {
        nav.classList.remove('active');
      }
    });
  }
}

function switchView(view, filter = null) {
  console.log('Switching to view:', view, 'with filter:', filter);
  
  // Cleanup previous view
  const previousView = state.get('currentView');
  if (previousView === 'overview' && view !== 'overview') {
    // Cleanup charts when leaving overview
    cleanupCharts();
  }
  
  // Hide all views
  const allViews = document.querySelectorAll('.view');
  console.log('Found views:', allViews.length);
  allViews.forEach(v => v.classList.remove('active'));
  
  // Show selected view
  const targetView = document.getElementById(view);
  if (!targetView) {
    console.error('View not found:', view);
    return;
  }
  targetView.classList.add('active');
  state.set('currentView', view);
  
  // Load view-specific data
  switch(view) {
    case 'overview':
      loadOverviewData(filter);
      break;
    case 'tabs':
      loadTabsView(filter);
      break;
    case 'groups':
      loadGroupsView();
      break;
    case 'snoozed':
      loadSnoozedView();
      break;
    case 'history':
      loadHistoryView();
      break;
    case 'rules':
      loadRulesView();
      break;
    case 'export-import':
      if (typeof initializeExportImport === 'function') {
        initializeExportImport();
      }
      break;
    case 'collections':
      loadCollectionsView();
      break;
    case 'tasks':
      // Load with current view preference (Kanban or List)
      const tasksViewPreference = state.get('tasksViewPreference') || 'kanban';
      if (tasksViewPreference === 'kanban') {
        loadKanbanView();
      } else {
        loadListView();
      }
      setupTasksViewToggle();
      break;
  }
}

// ============================================================================
// Overview View
// ============================================================================





// ============================================================================
// Tabs View
// ============================================================================

// Tabs view functions are now imported from modules/views/tabs.js


// ============================================================================
// Window Management
// ============================================================================



function selectAllTabs() {
  const allTabCards = document.querySelectorAll('.tab-card');
  
  allTabCards.forEach(card => {
    const tabId = parseInt(card.dataset.tabId);
    const checkbox = card.querySelector('.tab-checkbox');
    
    state.selectedTabs.add(tabId);
    card.classList.add('selected');
    checkbox.checked = true;
  });
  
  updateBulkToolbar();
}

function updateBulkToolbar() {
  const toolbar = document.getElementById('bulkToolbar');
  const count = state.selectedTabs.size;
  
  if (count > 0) {
    toolbar.hidden = false;
    document.getElementById('selectedCount').textContent = count;
    
  } else {
    toolbar.hidden = true;
  }
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners() {
  // Settings button
  document.getElementById('openSettings')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Keyboard Shortcuts button
  document.getElementById('openKeyboardShortcuts')?.addEventListener('click', () => {
    helpModal.show();
  });

  // Quick Organize
  document.getElementById('quickOrganize')?.addEventListener('click', openQuickOrganize);
  
  // Refresh
  document.getElementById('refreshData')?.addEventListener('click', refreshData);
  
  // Search, filter and sort
  document.getElementById('searchTabs')?.addEventListener('input', filterTabs);
  document.getElementById('filterTabs')?.addEventListener('change', filterTabs);
  document.getElementById('windowFilter')?.addEventListener('change', filterTabs);
  document.getElementById('sortTabs')?.addEventListener('change', filterTabs);
  
  // View toggle
  document.querySelectorAll('.view-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active state
      document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Show/hide views
      const view = btn.dataset.view;
      document.querySelectorAll('.view-content').forEach(content => {
        content.style.display = content.dataset.view === view ? 'block' : 'none';
      });
      
      // Save preference
      localStorage.setItem('tabsViewMode', view);
      
      // Re-render with current filters
      filterTabs();
    });
  });
  
  
  // Ungroup all
  document.getElementById('ungroupAll')?.addEventListener('click', ungroupAllTabs);
  
  // Group by domain
  document.getElementById('groupByDomain')?.addEventListener('click', groupTabsByDomain);
  
  // Wake all snoozed
  document.getElementById('wakeAll')?.addEventListener('click', wakeAllSnoozed);
  
  // Analytics period
  document.getElementById('analyticsPeriod')?.addEventListener('change', (e) => {
    // loadAnalyticsView(); // TODO: implement analytics view
  });
  
  // Modal close buttons
  document.getElementById('closeQuickOrganize')?.addEventListener('click', closeQuickOrganizeModal);
  
  // Quick organize execute
  document.getElementById('executeOrganize')?.addEventListener('click', executeQuickOrganize);
  document.getElementById('cancelOrganize')?.addEventListener('click', closeQuickOrganizeModal);
  
  
  // Bulk toolbar buttons
  document.getElementById('selectAll')?.addEventListener('click', selectAllTabs);
  document.getElementById('clearSelection')?.addEventListener('click', clearSelection);
  
  // Bulk action buttons in toolbar
  document.querySelectorAll('.bulk-toolbar .bulk-action-btn').forEach(btn => {
    btn.addEventListener('click', () => executeBulkAction(btn.dataset.action));
  });
  
  // Confirmation modal
  document.getElementById('confirmCancel')?.addEventListener('click', () => {
    document.getElementById('confirmModal').classList.remove('show');
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'a' && state.get('currentView') === 'tabs') {
      e.preventDefault();
      selectAllTabs();
    }
    if (e.key === 'Escape' && state.selectedTabs.size > 0) {
      clearSelection();
    }
  });

  // Collections view - Save Current Window button
  document.getElementById('saveCurrentWindow')?.addEventListener('click', async () => {
    const currentWindow = await chrome.windows.getCurrent();
    showNotification('Saving current window...', 'info');

    try {
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
        loadCollectionsView(); // Refresh
      } else {
        showNotification('Failed to create collection', 'error');
      }
    } catch (error) {
      console.error('Error creating collection:', error);
      showNotification('Failed to create collection', 'error');
    }
  });

  // Tasks view - Create New Task button
  document.getElementById('createNewTask')?.addEventListener('click', async () => {
    // This will be handled by the task detail modal from tasks-base.js
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
  });

  // Tasks view - Bulk action buttons
  document.querySelectorAll('#tasksBulkBar .bulk-action-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const selectedTasks = state.get('selectedTasks') || new Set();
      await handleBulkAction(btn.dataset.action, selectedTasks);
    });
  });
}

// ============================================================================
// Tasks View Toggle
// ============================================================================

function setupTasksViewToggle() {
  const kanbanBtn = document.getElementById('tasksViewKanban');
  const listBtn = document.getElementById('tasksViewList');
  const kanbanContainer = document.getElementById('tasksKanbanContainer');
  const listContainer = document.getElementById('tasksListContainer');

  if (!kanbanBtn || !listBtn) return;

  kanbanBtn.addEventListener('click', () => {
    // Update buttons
    kanbanBtn.classList.add('active');
    listBtn.classList.remove('active');

    // Update containers
    kanbanContainer.style.display = 'block';
    kanbanContainer.classList.add('active');
    listContainer.style.display = 'none';
    listContainer.classList.remove('active');

    // Save preference
    state.set('tasksViewPreference', 'kanban');

    // Load Kanban view
    loadKanbanView();
  });

  listBtn.addEventListener('click', () => {
    // Update buttons
    listBtn.classList.add('active');
    kanbanBtn.classList.remove('active');

    // Update containers
    listContainer.style.display = 'block';
    listContainer.classList.add('active');
    kanbanContainer.style.display = 'none';
    kanbanContainer.classList.remove('active');

    // Save preference
    state.set('tasksViewPreference', 'list');

    // Load List view
    loadListView();
  });
}

// ============================================================================
// Modal Functions
// ============================================================================

function openQuickOrganize() {
  const modal = document.getElementById('quickOrganizeModal');
  modal.classList.add('show');
  
  // Analyze current tabs
  analyzeTabs();
}

function closeQuickOrganizeModal() {
  document.getElementById('quickOrganizeModal').classList.remove('show');
}

async function analyzeTabs() {
  const stats = await sendMessage({ action: 'getStatistics' });
  
  document.getElementById('dupeCount').textContent = `(${stats.duplicates} found)`;
  document.getElementById('domainGroupCount').textContent = '(3 groups)'; // Would calculate
  document.getElementById('inactiveCount').textContent = '(8 tabs)'; // Would calculate
  document.getElementById('heavyCount').textContent = '(2 tabs)'; // Would calculate
}

async function executeQuickOrganize() {
  const closeDupes = document.getElementById('orgCloseDupes').checked;
  const groupDomains = document.getElementById('orgGroupDomains').checked;
  const snoozeInactive = document.getElementById('orgSnoozeInactive').checked;
  const suspendHeavy = document.getElementById('orgSuspendHeavy').checked;
  
  if (closeDupes) {
    await sendMessage({ action: 'closeDuplicates' });
  }
  
  if (groupDomains) {
    // Get current window ID to restore focus after grouping
    const currentWindow = await chrome.windows.getCurrent();
    await sendMessage({
      action: 'groupByDomain',
      callerWindowId: currentWindow.id
    });
  }
  
  // Would implement other actions
  
  closeQuickOrganizeModal();
  refreshData();
}


async function executeBulkAction(action) {
  console.log('executeBulkAction called with action:', action);
  // Get the actual Set from state
  const selectedTabs = state.get('selectedTabs');
  const selectedIds = Array.from(selectedTabs);
  const count = selectedIds.length;
  console.log('Selected IDs:', selectedIds, 'Count:', count);
  
  if (count === 0) return;
  
  // Check if confirmation needed (only for close action)
  if (count > 10 && action === 'close') {
    const confirmed = await showConfirmDialog(action, count);
    if (!confirmed) return;
  }
  
  // Show progress for large operations
  if (count > 50) {
    showProgressIndicator(`Processing ${count} tabs...`);
  }
  
  try {
    switch(action) {
      case 'close':
        await closeTabs(selectedIds);
        showNotification(`Closed ${count} tabs`, 'success');
        break;
        
      case 'snooze':
        await showSnoozeDialog(selectedIds);
        break;
        
      case 'group':
        await groupTabs(selectedIds);
        break;
        
      case 'bookmark':
        await bookmarkTabs(selectedIds);
        showNotification(`Bookmarked ${count} tabs`, 'success');
        break;
        
      case 'move':
        await showMoveToWindowDialog(selectedIds);
        // Don't clear selection or refresh here - dialog handles it
        return;
    }
    
    // Clear selection after success (except for move which handles its own)
    clearSelection();
    
    // Refresh the view
    if (action !== 'snooze' && action !== 'move') { // Snooze and move have their own dialogs
      await loadTabsView();
    }
    
  } catch (error) {
    console.error(`Failed to ${action} tabs:`, error);
    showNotification(`Failed to ${action} tabs: ${error.message}`, 'error');
  } finally {
    hideProgressIndicator();
  }
}

// ============================================================================
// Tab Management Functions
// ============================================================================

async function closeTabs(tabIds) {
  // Route through background → engine for single source of truth
  await chrome.runtime.sendMessage({
    action: 'closeTabs',
    tabIds: tabIds
  });
}

async function groupTabs(tabIds) {
  if (tabIds.length === 0) return;

  // Prompt for group name
  const name = await promptGroupName();

  // Get current window ID to restore focus after grouping
  const currentWindow = await chrome.windows.getCurrent();

  // Route through background → engine for single source of truth
  await chrome.runtime.sendMessage({
    action: 'groupTabs',
    tabIds: tabIds,
    groupName: name || 'Untitled',
    color: 'blue',
    callerWindowId: currentWindow.id
  });

  showNotification(`Created group "${name || 'Untitled'}" with ${tabIds.length} tabs`, 'success');
}

async function bookmarkTabs(tabIds) {
  // Route through background → engine for single source of truth
  const folderName = `TabMaster Export - ${new Date().toLocaleString()}`;
  await chrome.runtime.sendMessage({
    action: 'bookmarkTabs',
    tabIds: tabIds,
    folder: folderName
  });
}

async function moveToWindow(tabIds, targetWindowId) {
  // Route through background → engine for single source of truth
  const result = await chrome.runtime.sendMessage({
    action: 'moveToWindow',
    tabIds: tabIds,
    targetWindowId: targetWindowId
  });

  // Return the window ID (either new or existing)
  return result?.windowId || targetWindowId;
}

async function showMoveToWindowDialog(tabIds) {
  // Get all windows
  const windows = await chrome.windows.getAll({ populate: true });
  const currentWindowId = (await chrome.windows.getCurrent()).id;
  
  // Get window names from service
  const windowNames = await getWindowNames();
  const { windowInfo } = window;
  
  // Get current tab info to determine source window
  const firstTabId = Array.isArray(tabIds) ? tabIds[0] : tabIds;
  const sourceTab = await chrome.tabs.get(firstTabId);
  const sourceWindowId = sourceTab.windowId;
  
  // Create dialog HTML
  const dialogHtml = `
    <div class="modal-overlay" id="moveWindowDialog">
      <div class="modal-content" style="max-width: 400px;">
        <div class="modal-header">
          <h2>Move ${tabIds.length} tab${tabIds.length > 1 ? 's' : ''} to...</h2>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body" style="padding: 20px;">
          <div class="window-list" style="display: flex; flex-direction: column; gap: 8px;">
            ${windows.map(window => {
              const name = windowInfo?.windowNameMap?.get(window.id) || 
                          windowNames[window.id] || 
                          (window.id === currentWindowId ? 'Current Window' : `Window ${window.id}`);
              const tabCount = window.tabs ? window.tabs.length : 0;
              const isSource = window.id === sourceWindowId;
              const windowColor = windowInfo?.windowColorMap?.get(window.id) || '#999';
              
              return `
                <button class="window-option" 
                        data-window-id="${window.id}"
                        style="padding: 12px; border: 1px solid #e0e0e0; border-radius: 8px; 
                               background: white; text-align: left; cursor: pointer; display: flex;
                               align-items: center; gap: 10px; transition: all 0.2s;
                               ${isSource ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
                        ${isSource ? 'disabled' : ''}>
                  <div style="width: 12px; height: 12px; border-radius: 50%; background: ${windowColor}; flex-shrink: 0;"></div>
                  <div style="flex: 1;">
                    <div style="font-weight: 500;">${name}</div>
                    <div style="font-size: 12px; color: #666; margin-top: 4px;">
                      ${tabCount} tab${tabCount !== 1 ? 's' : ''}
                      ${isSource ? ' (current location)' : ''}
                    </div>
                  </div>
                </button>
              `;
            }).join('')}
            <button class="window-option" 
                    data-window-id="new"
                    style="padding: 12px; border: 2px dashed #667eea; border-radius: 8px; 
                           background: #f8f9ff; text-align: left; cursor: pointer; display: flex;
                           align-items: center; gap: 10px; transition: all 0.2s;">
              <div style="width: 12px; height: 12px; display: flex; align-items: center; 
                          justify-content: center; color: #667eea; font-weight: bold;">+</div>
              <div style="flex: 1;">
                <div style="font-weight: 500; color: #667eea;">Create New Window</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Add dialog to DOM
  document.body.insertAdjacentHTML('beforeend', dialogHtml);
  
  // Add event listeners
  const dialog = document.getElementById('moveWindowDialog');
  const closeBtn = dialog.querySelector('.modal-close');
  
  closeBtn.addEventListener('click', () => dialog.remove());
  
  // Add hover effect for non-disabled buttons
  dialog.querySelectorAll('.window-option:not([disabled])').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#f8f9fa';
      btn.style.borderColor = '#667eea';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = btn.dataset.windowId === 'new' ? '#f8f9ff' : 'white';
      btn.style.borderColor = btn.dataset.windowId === 'new' ? '#667eea' : '#e0e0e0';
    });
  });
  
  // Handle window selection
  dialog.querySelectorAll('.window-option:not([disabled])').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetWindowId = btn.dataset.windowId === 'new' ? 'new' : parseInt(btn.dataset.windowId);
      
      try {
        const movedToId = await moveToWindow(tabIds, targetWindowId);
        const windowName = targetWindowId === 'new' ? 'new window' : 
                          (windowInfo?.windowNameMap?.get(movedToId) || 
                           windowNames[movedToId] || 
                           `Window ${movedToId}`);
        
        showNotification(`Moved ${tabIds.length} tab${tabIds.length > 1 ? 's' : ''} to ${windowName}`, 'success');
        clearSelection();
        await loadTabsView();
      } catch (error) {
        console.error('Failed to move tabs:', error);
        showNotification('Failed to move tabs', 'error');
      }
      
      dialog.remove();
    });
  });
  
  // Handle escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      dialog.remove();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
  
  // Handle clicking outside
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      dialog.remove();
    }
  });
}

async function showSnoozeDialog(tabIds) {
  // Phase 8.3: Use message passing for ONE execution path (architecture fix)
  try {
    // THIN UI Layer: Send message to background for detection (business logic)
    const { operations, summary } = await sendMessage({
      action: 'detectSnoozeOperations',
      tabIds
    });

    if (operations.length === 0) {
      showNotification('No tabs to snooze', 'warning');
      return;
    }

    // Try to initialize if not already done
    if (!snoozeModalInstance && typeof SnoozeModal !== 'undefined') {
      console.log('Initializing SnoozeModal on demand');
      snoozeModalInstance = new SnoozeModal();

      // Expose formatters to window for SnoozeModal
      // These are loaded via module script in dashboard.html
      if (window.formatSnoozeTitle) {
        // Formatters already loaded
      }
    }

    if (!snoozeModalInstance || typeof snoozeModalInstance.show !== 'function') {
      console.error('SnoozeModal not initialized properly');
      showNotification('Snooze feature is not available', 'error');
      return;
    }

    // Show modal with operations and summary (new format)
    snoozeModalInstance.show({ operations, summary });

    // Set up modal callbacks
    snoozeModalInstance.onSnooze = async (snoozeData) => {
      try {
        const { timestamp, operations, summary } = snoozeData;

        // THIN UI Layer: Send message to background for execution (ONE execution path)
        const result = await sendMessage({
          action: 'executeSnoozeOperations',
          operations,
          snoozeUntil: timestamp,
          options: {
            reason: 'manual',
            // restorationMode will be pulled from settings by background handler
          }
        });

        if (result.success) {
          const minutes = Math.floor((timestamp - Date.now()) / 60000);
          const { windowCount, individualTabCount, totalTabs } = summary;

          let message;
          if (windowCount > 0 && individualTabCount === 0) {
            message = `Snoozed ${windowCount} window${windowCount !== 1 ? 's' : ''} for ${getReadableDuration(minutes)}`;
          } else {
            message = `Snoozed ${totalTabs} tab${totalTabs !== 1 ? 's' : ''} for ${getReadableDuration(minutes)}`;
          }

          showNotification(message, 'success');
        } else {
          showNotification(`Snooze completed with ${result.errors.length} error(s)`, 'warning');
        }

        // Clear selection and reload data
        clearSelection();
        await refreshData();
      } catch (error) {
        console.error('Failed to snooze:', error);
        showNotification('Failed to snooze', 'error');
      }
    };

    snoozeModalInstance.onCancel = () => {
      // Modal handles its own cleanup
    };
  } catch (error) {
    console.error('Failed to detect snooze operations:', error);
    showNotification('Failed to prepare snooze', 'error');
  }
}

function getReadableDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}

// ============================================================================
// Dialog Functions
// ============================================================================

function showConfirmDialog(action, count) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirmModal');
    const title = document.getElementById('confirmTitle');
    const message = document.getElementById('confirmMessage');
    const proceedBtn = document.getElementById('confirmProceed');
    
    title.textContent = `Confirm ${action}`;
    message.textContent = `Are you sure you want to ${action} ${count} tabs? This action cannot be undone.`;
    
    const handleProceed = () => {
      modal.classList.remove('show');
      proceedBtn.removeEventListener('click', handleProceed);
      resolve(true);
    };
    
    const handleCancel = () => {
      modal.classList.remove('show');
      resolve(false);
    };
    
    proceedBtn.addEventListener('click', handleProceed, { once: true });
    document.getElementById('confirmCancel').addEventListener('click', handleCancel, { once: true });
    
    // Handle clicking outside the modal
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        handleCancel();
      }
    }, { once: true });
    
    modal.classList.add('show');
  });
}



// ============================================================================
// Helper Functions
// ============================================================================

async function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

async function refreshData() {
  const view = state.get("currentView") || "overview";
  switch(view) {
    case "overview":
      await loadOverviewData();
      break;
    case "tabs":
      await loadTabsView();
      break;
    case "groups":
      await loadGroupsView();
      break;
    case "snoozed":
      await loadSnoozedView();
      break;
    case "history":
      await loadHistoryView();
      break;
    case "rules":
      await loadRulesView();
      break;
  }
}

async function promptGroupName() {
  return new Promise((resolve) => {
    const name = prompt("Enter a name for the group:");
    resolve(name);
  });
}

function showProgressIndicator(message) {
  // Create progress overlay
  const overlay = document.createElement("div");
  overlay.id = "progressOverlay";
  overlay.className = "progress-overlay";
  overlay.innerHTML = `
    <div class="progress-content">
      <div class="spinner"></div>
      <div class="progress-message">${message}</div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function hideProgressIndicator() {
  const overlay = document.getElementById("progressOverlay");
  if (overlay) {
    overlay.remove();
  }
}


async function wakeAllSnoozed() {
  try {
    await sendMessage({ action: "wakeAllSnoozed" });
    showNotification("All snoozed tabs have been restored", "success");
    await refreshData();
  } catch (error) {
    console.error("Failed to wake snoozed tabs:", error);
    showNotification("Failed to wake snoozed tabs", "error");
  }
}

// ============================================================================
// Keyboard Shortcuts Setup (Phase 10)
// ============================================================================

function setupKeyboardShortcuts() {
  // Global Navigation Shortcuts
  keyboardShortcuts.register('g>c', () => {
    switchView('collections');
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(nav => {
      if (nav.dataset.view === 'collections') {
        navItems.forEach(n => n.classList.remove('active'));
        nav.classList.add('active');
      }
    });
  }, {
    category: 'navigation',
    description: 'Go to Collections view'
  });

  keyboardShortcuts.register('g>t', () => {
    switchView('tasks');
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(nav => {
      if (nav.dataset.view === 'tasks') {
        navItems.forEach(n => n.classList.remove('active'));
        nav.classList.add('active');
      }
    });
  }, {
    category: 'navigation',
    description: 'Go to Tasks view'
  });

  keyboardShortcuts.register('g>a', () => {
    switchView('tabs');
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(nav => {
      if (nav.dataset.view === 'tabs') {
        navItems.forEach(n => n.classList.remove('active'));
        nav.classList.add('active');
      }
    });
  }, {
    category: 'navigation',
    description: 'Go to All Tabs view'
  });

  keyboardShortcuts.register('g>s', () => {
    chrome.runtime.openOptionsPage();
  }, {
    category: 'navigation',
    description: 'Go to Settings'
  });

  // Help Modal
  keyboardShortcuts.register('?', () => {
    helpModal.show();
  }, {
    category: 'general',
    description: 'Show keyboard shortcuts help',
    requireShift: true
  });

  // Search Focus
  keyboardShortcuts.register('/', () => {
    const searchInput = document.querySelector('.search-input:not([style*="display: none"])');
    if (searchInput) {
      searchInput.focus();
    }
  }, {
    category: 'general',
    description: 'Focus search box'
  });

  // Escape - Clear search, deselect items, close modals
  keyboardShortcuts.register('escape', () => {
    // Clear search
    const searchInput = document.querySelector('.search-input:not([style*="display: none"])');
    if (searchInput && searchInput.value) {
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input'));
      return;
    }

    // Clear selection
    const selectedTabs = state.get('selectedTabs');
    if (selectedTabs && selectedTabs.size > 0) {
      clearSelection();
      return;
    }

    // Close modals
    const modal = document.querySelector('.modal.show');
    if (modal) {
      modal.classList.remove('show');
    }

    // Clear keyboard focus
    keyboardShortcuts.clearFocus();
  }, {
    category: 'general',
    description: 'Clear search / Deselect / Close modal'
  });

  console.log('Keyboard shortcuts initialized');
}

// ============================================================================
// Message Handling
// ============================================================================

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openRuleModal' && message.rule) {
    // Handle async operations in IIFE to avoid returning a Promise
    (async () => {
      // Switch to rules view if not already there
      if (state.get('currentView') !== 'rules') {
        switchView('rules');
        await loadRulesView();
      }

      // Open the rule modal with the provided template
      openRuleModal(message.rule);

      sendResponse({ success: true });
    })();

    return true; // Keep the message channel open for async response
  }
  // Don't return anything - let other listeners handle this message
});

// Notify background that dashboard is ready
chrome.runtime.sendMessage({ action: 'dashboardReady' }).catch(() => {
  // Ignore errors if background isn't listening
});

// Check for pending rule template on load
(async () => {
  const { pendingRuleTemplate } = await chrome.storage.local.get('pendingRuleTemplate');
  if (pendingRuleTemplate) {
    // Clear it from storage
    await chrome.storage.local.remove('pendingRuleTemplate');

    // Switch to rules view
    if (state.get('currentView') !== 'rules') {
      switchView('rules');
      await loadRulesView();
    }

    // Open modal with template
    setTimeout(() => {
      openRuleModal(pendingRuleTemplate);
    }, 500); // Small delay to ensure rules view is fully loaded
  }
})();
