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
import { loadOverviewData } from './modules/views/overview.js';
import { 
  loadRulesView, 
  updateRulesUI, 
  setupRulesEventListeners,
  handleRuleAction,
  installSampleRule,
  openRuleModal,
  closeRuleModal,
  updateConditionParams,
  updateActionParams,
  saveRule,
  toggleRule,
  deleteRule,
  toggleAllRules,
  testRule,
  testAllRules,
  setupRuleDragAndDrop,
  updateRulePriorities
} from './modules/views/rules.js';
import { loadGroupsView, autoGroupTabs } from './modules/views/groups.js';
import { loadSnoozedView } from './modules/views/snoozed.js';
import { loadHistoryView } from './modules/views/history.js';

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
  
  // Initialize snooze modal - should be available after window load
  if (typeof SnoozeModal !== 'undefined') {
    console.log('Initializing SnoozeModal');
    snoozeModalInstance = new SnoozeModal();
  } else {
    console.error('SnoozeModal class not found after window load');
  }
  
  // Initialize Floating Action Button
  if (typeof FloatingActionButton !== 'undefined') {
    const fab = new FloatingActionButton(document.body);
  }
  
  // Initialize preview card
  if (typeof TabPreviewCard !== 'undefined') {
    const previewCard = new TabPreviewCard(document.body);
    state.set('previewCard', previewCard);
    window.previewCard = previewCard; // Make available globally
    console.log('Preview card initialized');
  } else {
    console.error('TabPreviewCard not found - preview.js may not be loaded');
  }
  
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
}

function switchView(view) {
  console.log('Switching to view:', view);
  
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
      loadOverviewData();
      break;
    case 'tabs':
      loadTabsView();
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
  
  
  // Create group
  document.getElementById('createGroup')?.addEventListener('click', createNewGroup);
  
  // Auto group
  document.getElementById('autoGroup')?.addEventListener('click', autoGroupTabs);
  
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
    await sendMessage({ action: 'groupByDomain' });
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
  // Get the window IDs of tabs we're closing
  const tabs = await chrome.tabs.query({});
  const closingTabs = tabs.filter(tab => tabIds.includes(tab.id));
  const windowsToCheck = new Set(closingTabs.map(tab => tab.windowId));
  
  // Count tabs per window before closing
  const windowTabCounts = new Map();
  tabs.forEach(tab => {
    if (!windowTabCounts.has(tab.windowId)) {
      windowTabCounts.set(tab.windowId, 0);
    }
    windowTabCounts.set(tab.windowId, windowTabCounts.get(tab.windowId) + 1);
  });
  
  // Check if we're closing all tabs in any window
  const windowsBeingClosed = [];
  windowsToCheck.forEach(windowId => {
    const tabsInWindow = tabs.filter(tab => tab.windowId === windowId);
    const tabsBeingClosed = tabsInWindow.filter(tab => tabIds.includes(tab.id));
    if (tabsInWindow.length === tabsBeingClosed.length) {
      windowsBeingClosed.push(windowId);
    }
  });
  
  await chrome.tabs.remove(tabIds);
  
  // If we closed all tabs in a window, Chrome will close that window
  // Add a small delay to ensure Chrome has time to close the window
  if (windowsBeingClosed.length > 0) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Send message to background to log this bulk action
  chrome.runtime.sendMessage({
    action: 'logBulkActivity',
    type: 'close',
    count: tabIds.length,
    source: 'bulk'
  });
}

async function groupTabs(tabIds) {
  if (tabIds.length === 0) return;
  
  // Create new group
  const groupId = await chrome.tabs.group({ tabIds });
  
  // Prompt for group name
  const name = await promptGroupName();
  if (name) {
    await chrome.tabGroups.update(groupId, { 
      title: name,
      color: 'blue' // Default color
    });
  }
  
  showNotification(`Created group "${name || 'Untitled'}" with ${tabIds.length} tabs`, 'success');
}

async function bookmarkTabs(tabIds) {
  // Create folder for bookmarks
  const folder = await chrome.bookmarks.create({
    parentId: '1', // Bookmarks bar
    title: `TabMaster Export - ${new Date().toLocaleString()}`
  });
  
  // Get tab details
  const tabs = await chrome.tabs.query({});
  const selectedTabs = tabs.filter(tab => tabIds.includes(tab.id));
  
  // Create bookmarks
  for (const tab of selectedTabs) {
    try {
      await chrome.bookmarks.create({
        parentId: folder.id,
        title: tab.title || 'Untitled',
        url: tab.url
      });
    } catch (error) {
      console.error('Failed to bookmark tab:', tab.url, error);
    }
  }
}

async function moveToWindow(tabIds, targetWindowId) {
  if (targetWindowId === 'new') {
    // Create new window with first tab
    const firstTab = tabIds.shift();
    const newWindow = await chrome.windows.create({
      tabId: firstTab,
      focused: false
    });
    
    // Move remaining tabs
    if (tabIds.length > 0) {
      await chrome.tabs.move(tabIds, {
        windowId: newWindow.id,
        index: -1
      });
    }
    return newWindow.id;
  } else {
    // Move to existing window
    await chrome.tabs.move(tabIds, {
      windowId: targetWindowId,
      index: -1
    });
    return targetWindowId;
  }
}

async function showMoveToWindowDialog(tabIds) {
  // Get all windows
  const windows = await chrome.windows.getAll({ populate: true });
  const currentWindowId = (await chrome.windows.getCurrent()).id;
  
  // Get window names from our stored data
  const { windowNames = {} } = await chrome.storage.local.get(['windowNames']);
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
  // Get tab details for the selected tabs
  const tabs = await chrome.tabs.query({});
  const selectedTabsData = tabs.filter(tab => tabIds.includes(tab.id));
  
  // Try to initialize if not already done
  if (!snoozeModalInstance && typeof SnoozeModal !== 'undefined') {
    console.log('Initializing SnoozeModal on demand');
    snoozeModalInstance = new SnoozeModal();
  }
  
  if (!snoozeModalInstance || typeof snoozeModalInstance.show !== 'function') {
    console.error('SnoozeModal not initialized properly');
    showNotification('Snooze feature is not available', 'error');
    return;
  }
  
  snoozeModalInstance.show(selectedTabsData);
  
  // Set up modal callbacks
  snoozeModalInstance.onSnooze = async (snoozeData) => {
    try {
      const { timestamp, presetId, tabIds: snoozeTabIds, tabCount } = snoozeData;
      const minutes = Math.floor((timestamp - Date.now()) / 60000);
      
      await sendMessage({
        action: 'snoozeTabs',
        tabIds: tabIds,
        minutes: minutes
      });
      
      const tabText = tabCount === 1 ? 'tab' : `${tabCount} tabs`;
      showNotification(`Snoozed ${tabText} for ${getReadableDuration(minutes)}`, 'success');
      
      // Clear selection and reload data
      clearSelection();
      await refreshData();
    } catch (error) {
      console.error('Failed to snooze tabs:', error);
      showNotification('Failed to snooze tabs', 'error');
    }
  };
  
  snoozeModalInstance.onCancel = () => {
    // Modal handles its own cleanup
  };
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

async function createNewGroup() {
  const name = await promptGroupName();
  if (!name) return;
  
  try {
    // Create an empty group
    const groupId = await chrome.tabs.group({ tabIds: [] });
    await chrome.tabGroups.update(groupId, { title: name, color: "blue" });
    
    showNotification(`Created group "${name}"`, "success");
    await refreshData();
  } catch (error) {
    console.error("Failed to create group:", error);
    showNotification("Failed to create group", "error");
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
