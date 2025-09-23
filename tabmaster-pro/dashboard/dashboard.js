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

// ============================================================================
// State Management
// ============================================================================

let currentView = VIEWS.OVERVIEW;
let selectedTabs = new Set();
let tabsData = [];
let groupsData = [];
let snoozedData = [];
let charts = {};
let snoozeModal = null;
let previewCard = null;

// Selection state
const selectionState = {
  selectedTabs: new Set(),
  lastSelectedId: null,
  isSelectMode: false,
};

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  await initializeDashboard();
  setupEventListeners();
  setupNavigation();
  
  // Initialize snooze modal
  snoozeModal = new SnoozeModal();
  
  // Initialize Floating Action Button
  const fab = new FloatingActionButton(document.body);
  
  // Initialize preview card
  if (typeof TabPreviewCard !== 'undefined') {
    previewCard = new TabPreviewCard(document.body);
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
      if (charts.activity) charts.activity.resize();
      if (charts.domains) charts.domains.resize();
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
  currentView = view;
  
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

async function loadOverviewData() {
  console.log('Loading overview data...');
  try {
    const startTime = Date.now();
    const stats = await sendMessage({ action: 'getStatistics' });
    const tabInfo = await sendMessage({ action: 'getTabInfo' });
    console.log(`Data fetched in ${Date.now() - startTime}ms`);
    
    // Update stat cards
    document.getElementById('statTotalTabs').textContent = stats.totalTabs;
    document.getElementById('statTabsChange').textContent = '+0 today'; // Would need tracking
    
    document.getElementById('statGroups').textContent = tabInfo.groups?.length || 0;
    document.getElementById('statGroupsInfo').textContent = '0 collapsed'; // Would need tracking
    
    document.getElementById('statSnoozed').textContent = stats.snoozedTabs;
    updateNextWakeTime(stats.snoozedTabs);
    
    // Calculate active and suspended tabs
    const tabs = await chrome.tabs.query({});
    const activeTabs = tabs.filter(t => !t.discarded && (t.active || t.audible));
    const suspendedTabs = tabs.filter(t => t.discarded);
    
    document.getElementById('statActive').textContent = activeTabs.length;
    document.getElementById('statSuspended').textContent = `${suspendedTabs.length} suspended`;
    
    // Update charts with sample data
    console.log('Calling chart updates...');
    updateActivityChart();
    updateDomainsChart(stats.topDomains);
    console.log('Chart updates called');
    
    // Update recent activity
    await updateRecentActivity();
    
  } catch (error) {
    console.error('Failed to load overview data:', error);
  }
}

function updateNextWakeTime(snoozedCount) {
  if (snoozedCount > 0) {
    document.getElementById('statNextWake').textContent = 'Next in 2h'; // Would need actual calculation
  } else {
    document.getElementById('statNextWake').textContent = 'None scheduled';
  }
}


async function updateRecentActivity(filter = 'all') {
  // Get real activity log from background
  const activities = await sendMessage({ action: 'getActivityLog' });
  
  // Filter activities if needed
  let filteredActivities = activities || [];
  if (filter !== 'all') {
    filteredActivities = filteredActivities.filter(a => a.source === filter);
  }
  
  // Take only the most recent 5 activities
  const recentActivities = filteredActivities.slice(0, 5);
  
  // Format activities for display
  const formattedActivities = recentActivities.map(activity => ({
    icon: activity.icon,
    color: activity.color,
    text: activity.details,
    time: getTimeAgo(activity.timestamp),
    source: activity.source
  }));
  
  const container = document.getElementById('recentActivity');
  container.innerHTML = '';
  
  // Add filter buttons if not present
  const activitySection = container.closest('.activity-section');
  if (!activitySection || !activitySection.querySelector('#activityFilter')) {
    const filterContainer = document.createElement('div');
    filterContainer.id = 'activityFilter';
    filterContainer.style.cssText = 'display: flex; gap: 8px; margin-bottom: 12px;';
    filterContainer.innerHTML = `
      <button class="activity-filter-btn ${filter === 'all' ? 'active' : ''}" data-filter="all">All</button>
      <button class="activity-filter-btn ${filter === 'manual' ? 'active' : ''}" data-filter="manual">Manual</button>
      <button class="activity-filter-btn ${filter === 'auto' ? 'active' : ''}" data-filter="auto">Auto</button>
      <button class="activity-filter-btn ${filter === 'rule' ? 'active' : ''}" data-filter="rule">Rules</button>
    `;
    
    // Add event listeners for filter buttons
    filterContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('activity-filter-btn')) {
        updateRecentActivity(e.target.dataset.filter);
      }
    });
    
    // Insert after the section title
    const sectionTitle = activitySection?.querySelector('h3');
    if (sectionTitle) {
      sectionTitle.after(filterContainer);
    }
  } else {
    // Update active state of filter buttons
    document.querySelectorAll('.activity-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });
  }
  
  if (formattedActivities.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 20px;">
        <p style="margin: 0; color: #6c757d; text-align: center;">No recent activity</p>
      </div>
    `;
    return;
  }
  
  formattedActivities.forEach(activity => {
    const item = document.createElement('div');
    item.className = 'activity-item';
    item.innerHTML = `
      <div class="activity-icon" style="background: ${activity.color}20; color: ${activity.color};">
        ${getActivityIcon(activity.icon)}
      </div>
      <div class="activity-content">
        <div>${activity.text}</div>
        <div class="activity-time">${activity.time}</div>
      </div>
    `;
    container.appendChild(item);
  });
}


// ============================================================================
// Chart Functions
// ============================================================================

let activityChart = null;
let domainsChart = null;

function updateActivityChart() {
  const ctx = document.getElementById('activityChart');
  if (!ctx) return;

  // Get activity data from storage or background
  chrome.storage.local.get(['tabHistory'], (result) => {
    const history = result.tabHistory || [];
    const last7Days = getActivityDataForLast7Days(history);

    if (activityChart) {
      activityChart.destroy();
    }

    activityChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: last7Days.labels,
        datasets: [{
          label: 'Tabs Opened',
          data: last7Days.opened,
          borderColor: 'rgb(102, 126, 234)',
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          tension: 0.4
        }, {
          label: 'Tabs Closed',
          data: last7Days.closed,
          borderColor: 'rgb(245, 87, 108)',
          backgroundColor: 'rgba(245, 87, 108, 0.1)',
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  });
}

function getActivityDataForLast7Days(history) {
  const days = [];
  const opened = [];
  const closed = [];
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    days.push(dayName);

    // Count activities for this day
    const dayActivities = history.filter(h => {
      const actDate = new Date(h.timestamp);
      return actDate >= date && actDate < nextDate;
    });

    opened.push(dayActivities.filter(a => a.action === 'opened').length);
    closed.push(dayActivities.filter(a => a.action === 'closed').length);
  }

  return {
    labels: days,
    opened,
    closed
  };
}

function updateDomainsChart(topDomains) {
  const ctx = document.getElementById('domainsChart');
  if (!ctx) return;

  // If no data provided, get current tabs
  if (!topDomains || topDomains.length === 0) {
    chrome.tabs.query({}, (tabs) => {
      const domains = {};
      tabs.forEach(tab => {
        try {
          const url = new URL(tab.url);
          const domain = url.hostname.replace('www.', '');
          if (domain) {
            domains[domain] = (domains[domain] || 0) + 1;
          }
        } catch (e) {
          // Ignore invalid URLs
        }
      });

      // Sort and get top 5
      const sortedDomains = Object.entries(domains)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      renderDomainsChart(sortedDomains);
    });
  } else {
    renderDomainsChart(topDomains);
  }
}

function renderDomainsChart(domainData) {
  const ctx = document.getElementById('domainsChart');
  if (!ctx) return;

  if (domainsChart) {
    domainsChart.destroy();
  }

  const labels = domainData.map(d => Array.isArray(d) ? d[0] : d.domain);
  const data = domainData.map(d => Array.isArray(d) ? d[1] : d.count);

  domainsChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: [
          'rgba(102, 126, 234, 0.8)',
          'rgba(245, 87, 108, 0.8)',
          'rgba(240, 147, 251, 0.8)',
          'rgba(79, 172, 254, 0.8)',
          'rgba(250, 112, 154, 0.8)'
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

// ============================================================================
// Tabs View
// ============================================================================


async function loadTabsView() {
  // Store current filter values before they are potentially cleared
  const searchInput = document.getElementById('searchTabs');
  const filterInput = document.getElementById('filterTabs');
  const windowInput = document.getElementById('windowFilter');
  const sortInput = document.getElementById('sortTabs');
  
  const preservedFilterState = {
    searchTerm: searchInput ? searchInput.value : '',
    filterType: filterInput ? filterInput.value : 'all',
    windowId: windowInput ? windowInput.value : 'all',
    sortType: sortInput ? sortInput.value : 'default'
  };
  
  try {
    const tabs = await chrome.tabs.query({});
    const windows = await chrome.windows.getAll();
    const groups = await chrome.tabGroups.query({});
    
    // Get custom window names from storage (keyed by window signature)
    const { windowNames = {}, windowSignatures = {} } = await chrome.storage.local.get(['windowNames', 'windowSignatures']);
    
    // Create window color map with better color generation for many windows
    const windowColorMap = new Map();
    const windowNameMap = new Map();
    const windowSignatureMap = new Map();
    
    // Generate colors using HSL for even distribution
    
    // Sort windows by ID for consistent ordering
    const sortedWindows = windows.sort((a, b) => a.id - b.id);
    const currentWindowId = (await chrome.windows.getCurrent()).id;
    
    // Process each window
    sortedWindows.forEach((window, index) => {
      // Get tabs for this window
      const windowTabs = tabs.filter(t => t.windowId === window.id);
      const signature = getWindowSignature(windowTabs);
      windowSignatureMap.set(window.id, signature);
      
      // Assign color
      windowColorMap.set(window.id, generateWindowColor(index, windows.length));
      
      // Determine window name
      let windowName;
      
      // First check if we have a name for this window ID
      if (windowNames[window.id]) {
        windowName = windowNames[window.id];
      }
      // Then check if we recognize this window by its signature
      else if (signature && windowSignatures[signature]) {
        windowName = windowSignatures[signature];
        // Update the windowNames with current ID
        windowNames[window.id] = windowName;
      }
      // Otherwise generate smart default name based on content
      else {
        if (window.id === currentWindowId) {
          windowName = 'Current Window';
        } else if (windowTabs.length > 0) {
          // Try to generate a smart name based on window content
          const domains = windowTabs.map(t => {
            try {
              return new URL(t.url).hostname.replace('www.', '');
            } catch {
              return '';
            }
          }).filter(d => d);
          
          // Find most common domain
          const domainCounts = {};
          domains.forEach(d => {
            domainCounts[d] = (domainCounts[d] || 0) + 1;
          });
          
          const topDomain = Object.entries(domainCounts)
            .sort((a, b) => b[1] - a[1])[0];
          
          if (topDomain && topDomain[1] >= 2) {
            // If one domain appears multiple times, use it as the name
            windowName = topDomain[0].split('.')[0].charAt(0).toUpperCase() + 
                        topDomain[0].split('.')[0].slice(1) + ' Window';
          } else {
            windowName = `Window ${index + 1}`;
          }
        } else {
          windowName = `Window ${index + 1}`;
        }
      }
      
      windowNameMap.set(window.id, windowName);
    });
    
    // Get last accessed time from session storage if available
    const lastAccessData = await chrome.storage.session.get('tabLastAccess').catch(() => ({}));
    const tabLastAccess = lastAccessData.tabLastAccess || {};
    
    // Update last access for active tabs
    tabs.forEach(tab => {
      if (tab.active) {
        tabLastAccess[tab.id] = Date.now();
      }
    });
    
    // Save updated access times
    await chrome.storage.session.set({ tabLastAccess }).catch(() => {});
    
    // Create group map
    const groupMap = new Map();
    groups.forEach(group => {
      groupMap.set(group.id, {
        title: group.title || `Group ${group.id}`,
        color: group.color,
        collapsed: group.collapsed
      });
    });
    
    // Store window and group info globally
    window.windowInfo = { windowColorMap, windowNameMap, currentWindowId };
    window.groupInfo = groupMap;
    
    // Map tab data with real state information and window/group info
    tabsData = tabs.map(tab => ({
      ...tab,
      lastAccessed: tabLastAccess[tab.id] || (tab.active ? Date.now() : null),
      windowColor: windowColorMap.get(tab.windowId),
      windowName: windowNameMap.get(tab.windowId),
      groupName: tab.groupId > 0 ? groupMap.get(tab.groupId)?.title : null,
      groupColor: tab.groupId > 0 ? groupMap.get(tab.groupId)?.color : null
    }));
    
    // Populate window filter dropdown - AFTER tabsData is populated so counts work
    updateWindowFilterDropdown(sortedWindows, windowNameMap, currentWindowId);
    
    // Restore filter values after UI elements (like windowFilter) are repopulated
    if (searchInput) searchInput.value = preservedFilterState.searchTerm;
    if (filterInput) filterInput.value = preservedFilterState.filterType;
    if (windowInput) windowInput.value = preservedFilterState.windowId;
    if (sortInput) sortInput.value = preservedFilterState.sortType;
    
    // Save updated window mappings
    await chrome.storage.local.set({ 
      windowNames,
      windowSignatures: Object.fromEntries(
        Array.from(windowSignatureMap.entries()).map(([id, sig]) => {
          const name = windowNameMap.get(id);
          return [sig, name];
        }).filter(([sig, name]) => sig && !name.startsWith('Window '))
      )
    });
    
    // Apply current filter/sort if they exist (preserves state during refresh)
    if (document.getElementById('searchTabs') || document.getElementById('filterTabs')) {
      filterTabs();
    } else {
      renderTabs(tabsData);
    }
  } catch (error) {
    console.error('Failed to load tabs:', error);
  }
}

function updateTabCount(displayedCount, totalCount) {
  const tabCountEl = document.getElementById('tabCount');
  if (tabCountEl) {
    if (displayedCount === totalCount) {
      tabCountEl.textContent = `(${totalCount})`;
    } else {
      tabCountEl.textContent = `(${displayedCount} of ${totalCount})`;
    }
  }
}

function renderTabs(tabs) {
  // Get saved view preference or default to grid
  const savedView = localStorage.getItem('tabsViewMode') || 'grid';
  let currentView = document.querySelector('.view-toggle-btn.active')?.dataset.view || savedView;
  
  // If the saved view doesn't match current active, update the UI
  if (currentView !== savedView && document.querySelector(`.view-toggle-btn[data-view="${savedView}"]`)) {
    document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.view-toggle-btn[data-view="${savedView}"]`).classList.add('active');
    currentView = savedView;
  }
  
  // Show/hide the correct view containers
  const gridContainer = document.getElementById('tabsGrid');
  const treeContainer = document.getElementById('tabsTree');
  
  if (currentView === 'tree') {
    if (gridContainer) gridContainer.style.display = 'none';
    if (treeContainer) treeContainer.style.display = 'block';
  } else {
    if (gridContainer) gridContainer.style.display = 'grid';
    if (treeContainer) treeContainer.style.display = 'none';
  }
  
  // Update tab count display
  updateTabCount(tabs.length, tabsData.length);
  
  if (currentView === 'tree') {
    renderTreeView(tabs);
  } else {
    renderGridView(tabs);
  }
}

function renderGridView(tabs) {
  const grid = document.getElementById('tabsGrid');
  grid.innerHTML = '';
  
  if (tabs.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <h3>No tabs found</h3>
        <p>No tabs match your current filter</p>
      </div>
    `;
    return;
  }
  
  tabs.forEach(tab => {
    const card = document.createElement('div');
    card.className = 'tab-card';
    card.dataset.tabId = tab.id;
    
    // Restore selection state if tab was previously selected
    if (selectionState.selectedTabs.has(tab.id)) {
      card.classList.add('selected');
    }
    
    // Add window color as border
    if (tab.windowColor) {
      card.style.borderLeft = `4px solid ${tab.windowColor}`;
    }
    
    const badges = [];
    if (tab.pinned) badges.push('<span class="tab-badge pinned">Pinned</span>');
    if (tab.audible) badges.push('<span class="tab-badge audible">Playing</span>');
    
    // Filter out invalid favicon URLs
    const filterFaviconUrl = (url) => {
      if (!url) return '../icons/icon-16.png';
      // Skip chrome-extension:// URLs from other extensions
      if (url.startsWith('chrome-extension://') && !url.includes(chrome.runtime.id)) {
        return '../icons/icon-16.png';
      }
      // Skip invalid URLs
      if (url === 'chrome-extension://invalid/') {
        return '../icons/icon-16.png';
      }
      return url;
    };
    
    const safeFaviconUrl = filterFaviconUrl(getFaviconUrl(tab));
    
    card.innerHTML = `
      <div class="window-indicator" style="background: ${tab.windowColor || '#999'};" title="${tab.windowName || 'Unknown Window'}"></div>
      <label class="tab-select-wrapper">
        <input type="checkbox" class="tab-checkbox" data-tab-id="${tab.id}" ${selectionState.selectedTabs.has(tab.id) ? 'checked' : ''}>
        <span class="tab-select-indicator"></span>
      </label>
      <div class="tab-header">
        <img src="${safeFaviconUrl}" class="tab-favicon" data-fallback="../icons/icon-16.png">
        <div class="tab-title" title="${tab.title}">${tab.title}</div>
      </div>
      <div class="tab-url" title="${tab.url}">${new URL(tab.url).hostname}</div>
      ${badges.length > 0 ? `<div class="tab-badges">${badges.join('')}</div>` : ''}
      <div class="tab-hover-info">
        <span class="tab-state">${getTabState(tab)}</span>
        <span class="tab-access">• ${getLastAccessText(tab)}</span>
      </div>
    `;
    
    // Handle favicon errors silently
    const favicon = card.querySelector('.tab-favicon');
    if (favicon) {
      favicon.addEventListener('error', function(e) {
        // Prevent error from bubbling up and logging to console
        e.preventDefault();
        this.src = this.dataset.fallback || '../icons/icon-16.png';
      }, true);
    }
    
    // Add click handler for selection
    const checkbox = card.querySelector('.tab-checkbox');
    checkbox.addEventListener('change', (e) => {
      handleTabSelection(e.target, tab.id, card);
    });
    
    // Handle shift-click for range selection
    checkbox.addEventListener('click', (e) => {
      if (e.shiftKey && selectionState.lastSelectedId !== null) {
        e.preventDefault();
        handleRangeSelection(tab.id);
      }
    });
    
    // Add click handler to open tab
    card.addEventListener('click', (e) => {
      // Don't open tab if clicking on checkbox or its wrapper
      const isCheckboxArea = e.target.closest('.tab-select-wrapper') || 
                            e.target.classList.contains('tab-checkbox');
      if (!isCheckboxArea) {
        chrome.tabs.update(tab.id, { active: true });
        chrome.windows.update(tab.windowId, { focused: true });
      }
    });
    
    // Add hover handlers for inline info (disabled popup preview)
    // card.addEventListener('mouseenter', () => {
    //   if (previewCard) {
    //     // Pass the element first, then the tab object
    //     previewCard.show(card, tab);
    //   }
    // });
    // 
    // card.addEventListener('mouseleave', () => {
    //   if (previewCard) {
    //     previewCard.hide();
    //   }
    // });
    
    grid.appendChild(card);
  });
}


function renderTreeView(tabs) {
  const tree = document.getElementById('tabsTree');
  tree.innerHTML = '';
  
  if (tabs.length === 0) {
    tree.innerHTML = `
      <div class="empty-state">
        <h3>No tabs found</h3>
        <p>No tabs match your current filter</p>
      </div>
    `;
    return;
  }
  
  // Group tabs by window and then by group
  const windows = new Map();
  
  tabs.forEach(tab => {
    if (!windows.has(tab.windowId)) {
      windows.set(tab.windowId, {
        id: tab.windowId,
        name: tab.windowName || `Window ${tab.windowId}`,
        color: tab.windowColor || '#999',
        groups: new Map(),
        ungroupedTabs: []
      });
    }
    
    const window = windows.get(tab.windowId);
    
    if (tab.groupId && tab.groupId !== -1) {
      if (!window.groups.has(tab.groupId)) {
        window.groups.set(tab.groupId, {
          id: tab.groupId,
          name: tab.groupName || `Group ${tab.groupId}`,
          color: getGroupColor(tab.groupColor),
          tabs: []
        });
      }
      window.groups.get(tab.groupId).tabs.push(tab);
    } else {
      window.ungroupedTabs.push(tab);
    }
  });
  
  // Render tree structure
  windows.forEach((window, windowId) => {
    const windowEl = document.createElement('div');
    windowEl.className = 'tree-window';
    windowEl.dataset.windowId = windowId;
    
    // Calculate window selection state
    const allWindowTabs = [...Array.from(window.groups.values()).flatMap(g => g.tabs), ...window.ungroupedTabs];
    const selectedWindowTabs = allWindowTabs.filter(tab => selectionState.selectedTabs.has(tab.id));
    const windowCheckedState = selectedWindowTabs.length === allWindowTabs.length ? 'checked' : 
                                selectedWindowTabs.length > 0 ? 'indeterminate' : 'unchecked';
    
    // Window header
    const windowHeader = document.createElement('div');
    windowHeader.className = 'tree-window-header';
    windowHeader.dataset.windowId = windowId;
    const totalWindowTabs = Array.from(window.groups.values()).reduce((sum, g) => sum + g.tabs.length, 0) + window.ungroupedTabs.length;
    windowHeader.innerHTML = `
      <svg class="tree-expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
      <input type="checkbox" class="tree-select-checkbox" data-window-id="${windowId}" 
             ${windowCheckedState === 'checked' ? 'checked' : ''}
             title="Select all tabs in window">
      <div class="tree-window-color" style="background: ${window.color};"></div>
      <div class="tree-window-name">${window.name}</div>
      <div class="tree-window-count">${totalWindowTabs} tabs</div>
      <div class="tree-window-actions">
        <button class="tree-action-btn" title="Close window" data-action="close-window" data-window-id="${windowId}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;
    
    windowHeader.addEventListener('click', (e) => {
      // Don't toggle collapse if clicking on checkbox or actions
      if (e.target.type === 'checkbox' || e.target.closest('.tree-action-btn')) {
        return;
      }
      windowHeader.classList.toggle('collapsed');
    });
    
    windowEl.appendChild(windowHeader);
    
    // Window content
    const windowContent = document.createElement('div');
    windowContent.className = 'tree-window-content';
    
    // Render groups
    window.groups.forEach((group, groupId) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'tree-group';
      groupEl.dataset.groupId = groupId;
      
      // Calculate group selection state
      const selectedGroupTabs = group.tabs.filter(tab => selectionState.selectedTabs.has(tab.id));
      const groupCheckedState = selectedGroupTabs.length === group.tabs.length ? 'checked' : 
                                selectedGroupTabs.length > 0 ? 'indeterminate' : 'unchecked';
      
      // Group header
      const groupHeader = document.createElement('div');
      groupHeader.className = 'tree-group-header';
      groupHeader.dataset.groupId = groupId;
      groupHeader.dataset.windowId = windowId;
      groupHeader.innerHTML = `
        <svg class="tree-expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width: 14px; height: 14px;">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
        <input type="checkbox" class="tree-select-checkbox" data-group-id="${groupId}" 
               ${groupCheckedState === 'checked' ? 'checked' : ''}
               title="Select all tabs in group">
        <div class="tree-group-color" style="background: ${group.color};"></div>
        <div class="tree-group-name" contenteditable="false" data-group-id="${groupId}">${group.name}</div>
        <div class="tree-window-count">${group.tabs.length} tabs</div>
        <div class="tree-group-actions">
          <button class="tree-action-btn" title="Rename group" data-action="rename-group" data-group-id="${groupId}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="tree-action-btn" title="Close group" data-action="close-group" data-group-id="${groupId}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `;
      
      groupHeader.addEventListener('click', (e) => {
        // Don't toggle collapse if clicking on checkbox, name, or actions
        if (e.target.type === 'checkbox' || 
            e.target.closest('.tree-action-btn') ||
            e.target.classList.contains('tree-group-name')) {
          return;
        }
        groupHeader.classList.toggle('collapsed');
      });
      
      groupEl.appendChild(groupHeader);
      
      // Group tabs
      const groupContent = document.createElement('div');
      groupContent.className = 'tree-group-content';
      
      group.tabs.forEach(tab => {
        groupContent.appendChild(createTreeTab(tab));
      });
      
      groupEl.appendChild(groupContent);
      windowContent.appendChild(groupEl);
      
      // Set initial indeterminate state for group checkbox if needed
      const groupCheckbox = groupHeader.querySelector('.tree-select-checkbox');
      if (groupCheckedState === 'indeterminate') {
        groupCheckbox.indeterminate = true;
      }
      
      // Handle select all in group - attached after groupEl is in DOM
      groupCheckbox.addEventListener('change', (e) => {
        e.stopPropagation();
        const groupTabCheckboxes = groupEl.querySelectorAll('.tree-tab-checkbox');
        
        if (e.target.checked) {
          // Select all tabs in group
          group.tabs.forEach(tab => {
            selectionState.selectedTabs.add(tab.id);
          });
          // Update UI without re-rendering
          groupTabCheckboxes.forEach(checkbox => {
            checkbox.checked = true;
            checkbox.closest('.tree-tab').classList.add('selected');
          });
        } else {
          // Deselect all tabs in group
          group.tabs.forEach(tab => {
            selectionState.selectedTabs.delete(tab.id);
          });
          // Update UI without re-rendering  
          groupTabCheckboxes.forEach(checkbox => {
            checkbox.checked = false;
            checkbox.closest('.tree-tab').classList.remove('selected');
          });
        }
        
        updateBulkToolbar();
        // Update window checkbox state
        updateWindowCheckbox(windowEl);
      });
    });
    
    // Render ungrouped tabs
    if (window.ungroupedTabs.length > 0) {
      const ungroupedEl = document.createElement('div');
      ungroupedEl.className = 'tree-ungrouped';
      
      const ungroupedHeader = document.createElement('div');
      ungroupedHeader.className = 'tree-ungrouped-header';
      ungroupedHeader.textContent = 'Ungrouped Tabs';
      ungroupedEl.appendChild(ungroupedHeader);
      
      window.ungroupedTabs.forEach(tab => {
        ungroupedEl.appendChild(createTreeTab(tab));
      });
      
      windowContent.appendChild(ungroupedEl);
    }
    
    windowEl.appendChild(windowContent);
    tree.appendChild(windowEl);
    
    // Add drag and drop handlers for window
    windowHeader.addEventListener('dragover', handleDragOver);
    windowHeader.addEventListener('drop', handleDropOnWindow);
    
    // Add drag and drop handlers for groups
    window.groups.forEach((group, groupId) => {
      const groupHeader = windowEl.querySelector(`.tree-group-header[data-group-id="${groupId}"]`);
      if (groupHeader) {
        groupHeader.addEventListener('dragover', handleDragOver);
        groupHeader.addEventListener('drop', handleDropOnGroup);
      }
    });
    
    // Set initial indeterminate state for window checkbox if needed
    const windowCheckbox = windowHeader.querySelector('.tree-select-checkbox');
    if (windowCheckedState === 'indeterminate') {
      windowCheckbox.indeterminate = true;
    }
    
    // Handle select all in window - attached after windowEl is in DOM
    windowCheckbox.addEventListener('change', (e) => {
      e.stopPropagation();
      const allTabs = [...Array.from(window.groups.values()).flatMap(g => g.tabs), ...window.ungroupedTabs];
      const allTabCheckboxes = windowEl.querySelectorAll('.tree-tab-checkbox');
      const allGroupCheckboxes = windowEl.querySelectorAll('.tree-group-header .tree-select-checkbox');
      
      if (e.target.checked) {
        // Select all tabs
        allTabs.forEach(tab => {
          selectionState.selectedTabs.add(tab.id);
        });
        // Update UI without re-rendering
        allTabCheckboxes.forEach(checkbox => {
          checkbox.checked = true;
          checkbox.closest('.tree-tab').classList.add('selected');
        });
        // Check all group checkboxes
        allGroupCheckboxes.forEach(checkbox => {
          checkbox.checked = true;
          checkbox.indeterminate = false;
        });
      } else {
        // Deselect all tabs
        allTabs.forEach(tab => {
          selectionState.selectedTabs.delete(tab.id);
        });
        // Update UI without re-rendering
        allTabCheckboxes.forEach(checkbox => {
          checkbox.checked = false;
          checkbox.closest('.tree-tab').classList.remove('selected');
        });
        // Uncheck all group checkboxes
        allGroupCheckboxes.forEach(checkbox => {
          checkbox.checked = false;
          checkbox.indeterminate = false;
        });
      }
      updateBulkToolbar();
    });
  });
  
  // Add global event delegation for tree actions
  tree.addEventListener('click', async (e) => {
    const actionBtn = e.target.closest('.tree-action-btn');
    if (!actionBtn) return;
    
    const action = actionBtn.dataset.action;
    
    if (action === 'close-window') {
      const windowId = parseInt(actionBtn.dataset.windowId);
      if (confirm('Close this window and all its tabs?')) {
        await chrome.windows.remove(windowId);
        await loadTabsView();
      }
    } else if (action === 'close-group') {
      const groupId = parseInt(actionBtn.dataset.groupId);
      if (confirm('Close all tabs in this group?')) {
        const tabsToClose = tabs.filter(t => t.groupId === groupId).map(t => t.id);
        await chrome.tabs.remove(tabsToClose);
        await loadTabsView();
      }
    } else if (action === 'rename-group') {
      const groupId = parseInt(actionBtn.dataset.groupId);
      const nameEl = actionBtn.closest('.tree-group-header').querySelector('.tree-group-name');
      nameEl.contentEditable = true;
      nameEl.focus();
      
      // Select all text
      const range = document.createRange();
      range.selectNodeContents(nameEl);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      
      // Save on blur or enter
      const saveRename = async () => {
        nameEl.contentEditable = false;
        const newName = nameEl.textContent.trim();
        if (newName) {
          await chrome.tabGroups.update(groupId, { title: newName });
        }
      };
      
      nameEl.addEventListener('blur', saveRename, { once: true });
      nameEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          nameEl.blur();
        }
      }, { once: true });
    }
  });
}

// Drag and drop handlers
function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  
  // Add visual feedback
  this.classList.add('drop-target');
  
  // Clear other drop targets
  document.querySelectorAll('.drop-target').forEach(el => {
    if (el !== this) el.classList.remove('drop-target');
  });
}

async function handleDropOnWindow(e) {
  e.preventDefault();
  e.stopPropagation();
  
  this.classList.remove('drop-target');
  
  const data = JSON.parse(e.dataTransfer.getData('application/json'));
  const targetWindowId = parseInt(this.dataset.windowId);
  
  if (data.sourceWindowId === targetWindowId) {
    // Same window, just remove from group if in one
    if (data.sourceGroupId && data.sourceGroupId !== -1) {
      try {
        await chrome.tabs.ungroup(data.tabIds);
        showNotification(`Removed ${data.tabIds.length} tab(s) from group`, 'success');
        await loadTabsView();
      } catch (error) {
        console.error('Failed to ungroup tabs:', error);
        showNotification('Failed to ungroup tabs', 'error');
      }
    }
  } else {
    // Different window, move tabs
    try {
      await chrome.tabs.move(data.tabIds, {
        windowId: targetWindowId,
        index: -1
      });
      showNotification(`Moved ${data.tabIds.length} tab(s) to window`, 'success');
      clearSelection();
      await loadTabsView();
    } catch (error) {
      console.error('Failed to move tabs:', error);
      showNotification('Failed to move tabs', 'error');
    }
  }
}

async function handleDropOnGroup(e) {
  e.preventDefault();
  e.stopPropagation();
  
  this.classList.remove('drop-target');
  
  const data = JSON.parse(e.dataTransfer.getData('application/json'));
  const targetGroupId = parseInt(this.dataset.groupId);
  const targetWindowId = parseInt(this.dataset.windowId);
  
  try {
    // First move to target window if different
    if (data.sourceWindowId !== targetWindowId) {
      await chrome.tabs.move(data.tabIds, {
        windowId: targetWindowId,
        index: -1
      });
    }
    
    // Then add to group
    await chrome.tabs.group({
      tabIds: data.tabIds,
      groupId: targetGroupId
    });
    
    showNotification(`Added ${data.tabIds.length} tab(s) to group`, 'success');
    clearSelection();
    await loadTabsView();
  } catch (error) {
    console.error('Failed to move tabs to group:', error);
    showNotification('Failed to move tabs to group', 'error');
  }
}

function createTreeTab(tab) {
  const tabEl = document.createElement('div');
  tabEl.className = 'tree-tab';
  tabEl.draggable = true;
  tabEl.dataset.tabId = tab.id;
  tabEl.dataset.windowId = tab.windowId;
  tabEl.dataset.groupId = tab.groupId || -1;
  
  if (selectionState.selectedTabs.has(tab.id)) {
    tabEl.classList.add('selected');
  }
  
  const badges = [];
  if (tab.pinned) badges.push('<span class="tree-tab-badge pinned">Pin</span>');
  if (tab.audible) badges.push('<span class="tree-tab-badge audible">Audio</span>');
  
  // Filter out invalid favicon URLs
  const filterFaviconUrl = (url) => {
    if (!url) return '../icons/icon-16.png';
    if (url.startsWith('chrome-extension://') && !url.includes(chrome.runtime.id)) {
      return '../icons/icon-16.png';
    }
    if (url === 'chrome-extension://invalid/') {
      return '../icons/icon-16.png';
    }
    return url;
  };
  
  const safeFaviconUrl = filterFaviconUrl(getFaviconUrl(tab));
  
  tabEl.innerHTML = `
    <input type="checkbox" class="tree-tab-checkbox tab-checkbox" data-tab-id="${tab.id}" 
           ${selectionState.selectedTabs.has(tab.id) ? 'checked' : ''}>
    <img src="${safeFaviconUrl}" class="tree-tab-favicon" data-fallback="../icons/icon-16.png">
    <div class="tree-tab-title" title="${tab.title}">${tab.title}</div>
    <button class="tree-tab-goto" title="Go to tab">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
        <polyline points="15 3 21 3 21 9"></polyline>
        <line x1="10" y1="14" x2="21" y2="3"></line>
      </svg>
    </button>
    ${badges.length > 0 ? `<div class="tree-tab-badges">${badges.join('')}</div>` : ''}
  `;
  
  // Handle favicon errors
  const favicon = tabEl.querySelector('.tree-tab-favicon');
  favicon.addEventListener('error', function(e) {
    e.preventDefault();
    this.src = this.dataset.fallback || '../icons/icon-16.png';
  }, true);
  
  // Add checkbox handler
  const checkbox = tabEl.querySelector('.tab-checkbox');
  checkbox.addEventListener('change', (e) => {
    e.stopPropagation();
    if (e.target.checked) {
      selectionState.selectedTabs.add(tab.id);
      tabEl.classList.add('selected');
    } else {
      selectionState.selectedTabs.delete(tab.id);
      tabEl.classList.remove('selected');
    }
    updateBulkToolbar();
    
    // Update parent group/window checkbox states
    updateParentCheckboxes(tabEl);
  });
  
  // Make entire row clickable for selection (except checkbox and goto button)
  tabEl.addEventListener('click', (e) => {
    // Don't toggle if clicking checkbox or goto button
    if (e.target.classList.contains('tab-checkbox') || 
        e.target.closest('.tree-tab-goto')) {
      return;
    }
    e.stopPropagation();
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  });
  
  // Add click handler to goto button
  const gotoBtn = tabEl.querySelector('.tree-tab-goto');
  gotoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.tabs.update(tab.id, { active: true });
    chrome.windows.update(tab.windowId, { focused: true });
  });
  
  // Add drag and drop handlers
  tabEl.addEventListener('dragstart', (e) => {
    // If multiple tabs selected, drag them all
    const tabsToMove = selectionState.selectedTabs.has(tab.id) 
      ? Array.from(selectionState.selectedTabs)
      : [tab.id];
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({
      tabIds: tabsToMove,
      sourceWindowId: tab.windowId,
      sourceGroupId: tab.groupId
    }));
    
    tabEl.classList.add('dragging');
  });
  
  tabEl.addEventListener('dragend', (e) => {
    tabEl.classList.remove('dragging');
    // Remove all drop zone indicators
    document.querySelectorAll('.drop-target, .drop-before, .drop-after').forEach(el => {
      el.classList.remove('drop-target', 'drop-before', 'drop-after');
    });
  });
  
  return tabEl;
}

// Helper function to update parent checkboxes based on child selections
function updateParentCheckboxes(tabEl) {
  // Update group checkbox if tab is in a group
  const groupEl = tabEl.closest('.tree-group');
  if (groupEl) {
    const groupCheckbox = groupEl.querySelector('.tree-group-header .tree-select-checkbox');
    const allGroupTabs = groupEl.querySelectorAll('.tab-checkbox');
    const checkedGroupTabs = groupEl.querySelectorAll('.tab-checkbox:checked');
    
    if (checkedGroupTabs.length === 0) {
      groupCheckbox.checked = false;
      groupCheckbox.indeterminate = false;
    } else if (checkedGroupTabs.length === allGroupTabs.length) {
      groupCheckbox.checked = true;
      groupCheckbox.indeterminate = false;
    } else {
      groupCheckbox.checked = false;
      groupCheckbox.indeterminate = true;
    }
  }
  
  // Update window checkbox
  const windowEl = tabEl.closest('.tree-window');
  if (windowEl) {
    updateWindowCheckbox(windowEl);
  }
}

// Helper function to update window checkbox based on all child selections
function updateWindowCheckbox(windowEl) {
  const windowCheckbox = windowEl.querySelector('.tree-window-header .tree-select-checkbox');
  const allWindowTabs = windowEl.querySelectorAll('.tab-checkbox');
  const checkedWindowTabs = windowEl.querySelectorAll('.tab-checkbox:checked');
  
  if (checkedWindowTabs.length === 0) {
    windowCheckbox.checked = false;
    windowCheckbox.indeterminate = false;
  } else if (checkedWindowTabs.length === allWindowTabs.length) {
    windowCheckbox.checked = true;
    windowCheckbox.indeterminate = false;
  } else {
    windowCheckbox.checked = false;
    windowCheckbox.indeterminate = true;
  }
}

function updateWindowFilterDropdown(windows, windowNameMap, currentWindowId) {
  const windowFilter = document.getElementById('windowFilter');
  if (!windowFilter) return;
  
  // Clear existing options except 'All Windows'
  windowFilter.innerHTML = '<option value="all">All Windows</option>';
  
  // Add window options with custom names
  windows.forEach(window => {
    const option = document.createElement('option');
    option.value = window.id;
    const name = windowNameMap.get(window.id);
    const tabCount = tabsData.filter(t => t.windowId === window.id).length;
    option.textContent = `${name} (${tabCount} tabs)`;
    if (window.id === currentWindowId) {
      option.textContent = `⭐ ${option.textContent}`;
    }
    windowFilter.appendChild(option);
  });
  
  // Add rename option at the end
  const renameOption = document.createElement('option');
  renameOption.value = 'rename';
  renameOption.textContent = '✏️ Rename Windows...';
  renameOption.style.borderTop = '1px solid #ddd';
  windowFilter.appendChild(renameOption);
}

function filterTabs() {
  const searchTerm = document.getElementById('searchTabs').value.toLowerCase();
  const filterType = document.getElementById('filterTabs').value;
  const windowFilterValue = document.getElementById('windowFilter')?.value || 'all';
  const sortType = document.getElementById('sortTabs')?.value || 'default';
  
  // Handle rename option
  if (windowFilterValue === 'rename') {
    showRenameWindowsDialog();
    document.getElementById('windowFilter').value = 'all';
    return;
  }
  
  let filtered = tabsData;
  
  // Apply search filter
  if (searchTerm) {
    filtered = filtered.filter(tab => 
      tab.title.toLowerCase().includes(searchTerm) ||
      tab.url.toLowerCase().includes(searchTerm)
    );
  }
  
  // Apply window filter
  if (windowFilterValue !== 'all') {
    filtered = filtered.filter(tab => tab.windowId === parseInt(windowFilterValue));
  }
  
  // Apply type filter
  switch(filterType) {
    case 'active':
      filtered = filtered.filter(tab => tab.active);
      break;
    case 'suspended':
      filtered = filtered.filter(tab => tab.discarded);
      break;
    case 'pinned':
      filtered = filtered.filter(tab => tab.pinned);
      break;
    case 'audible':
      filtered = filtered.filter(tab => tab.audible);
      break;
    case 'muted':
      filtered = filtered.filter(tab => tab.mutedInfo && tab.mutedInfo.muted);
      break;
    case 'grouped':
      filtered = filtered.filter(tab => tab.groupId && tab.groupId !== -1);
      break;
    case 'ungrouped':
      filtered = filtered.filter(tab => !tab.groupId || tab.groupId === -1);
      break;
    case 'duplicates':
      const urls = new Map();
      filtered.forEach(tab => {
        if (!urls.has(tab.url)) {
          urls.set(tab.url, []);
        }
        urls.get(tab.url).push(tab);
      });
      filtered = [];
      urls.forEach(tabs => {
        if (tabs.length > 1) {
          filtered.push(...tabs);
        }
      });
      break;
  }
  
  sortAndRenderTabs(filtered, sortType);
}

function sortAndRenderTabs(tabs, sortType) {
  let sorted = [...tabs]; // Create a copy to avoid mutating original
  
  switch(sortType) {
    case 'window':
      // Group tabs by window
      sorted.sort((a, b) => {
        if (a.windowId !== b.windowId) {
          return a.windowId - b.windowId;
        }
        // Within same window, sort by index
        return a.index - b.index;
      });
      break;
      
    case 'recent':
      // Most recently used (active tabs first, then by last accessed)
      sorted.sort((a, b) => {
        if (a.active) return -1;
        if (b.active) return 1;
        return (b.lastAccessed || 0) - (a.lastAccessed || 0);
      });
      break;
      
    case 'oldest':
      // Least recently used
      sorted.sort((a, b) => {
        if (a.active) return 1;
        if (b.active) return -1;
        return (a.lastAccessed || 0) - (b.lastAccessed || 0);
      });
      break;
      
    case 'suspended':
      // Suspended tabs first (good for cleanup)
      sorted.sort((a, b) => {
        if (a.discarded && !b.discarded) return -1;
        if (!a.discarded && b.discarded) return 1;
        return 0;
      });
      break;
      
    case 'active':
      // Active/playing tabs first
      sorted.sort((a, b) => {
        const aScore = (a.active ? 4 : 0) + (a.audible ? 2 : 0) + (a.pinned ? 1 : 0);
        const bScore = (b.active ? 4 : 0) + (b.audible ? 2 : 0) + (b.pinned ? 1 : 0);
        return bScore - aScore;
      });
      break;
      
    case 'title':
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
      
    case 'domain':
      sorted.sort((a, b) => {
        const domainA = new URL(a.url).hostname;
        const domainB = new URL(b.url).hostname;
        return domainA.localeCompare(domainB);
      });
      break;
      
    case 'default':
    default:
      // Keep original order (by tab index)
      break;
  }
  
  renderTabs(sorted);
}

// ============================================================================
// Window Management
// ============================================================================

async function showRenameWindowsDialog() {
  const windows = await chrome.windows.getAll();
  const { windowNames = {} } = await chrome.storage.local.get('windowNames');
  const currentWindowId = (await chrome.windows.getCurrent()).id;
  
  // Create modal dialog
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;
  
  const dialog = document.createElement('div');
  dialog.className = 'rename-dialog';
  dialog.style.cssText = `
    background: white;
    border-radius: 8px;
    padding: 24px;
    max-width: 500px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  `;
  
  let windowInputs = [];
  
  // Sort windows by ID for consistent ordering
  const sortedWindows = windows.sort((a, b) => a.id - b.id);
  
  dialog.innerHTML = `
    <h2 style="margin: 0 0 20px 0; font-size: 20px;">Rename Windows</h2>
    <div style="margin-bottom: 20px;">
      ${sortedWindows.map((window, index) => {
        const tabCount = tabsData.filter(t => t.windowId === window.id).length;
        const defaultName = window.id === currentWindowId ? 'Current Window' : `Window ${index + 1}`;
        const currentName = windowNames[window.id] || '';
        windowInputs.push({ id: window.id, defaultName });
        
        return `
          <div style="margin-bottom: 16px; padding: 12px; border: 1px solid #e0e0e0; border-radius: 6px; background: ${window.id === currentWindowId ? '#f0f7ff' : '#fff'};">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
              <div style="width: 20px; height: 20px; border-radius: 4px; background: ${window.windowInfo?.windowColorMap?.get(window.id) || generateWindowColor(index, windows.length)};"></div>
              <span style="font-weight: 500;">${defaultName}</span>
              <span style="color: #666; font-size: 12px;">(${tabCount} tabs)</span>
              ${window.id === currentWindowId ? '<span style="background: #4285f4; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px;">CURRENT</span>' : ''}
            </div>
            <input 
              type="text" 
              data-window-id="${window.id}"
              placeholder="Custom name (optional)"
              value="${currentName}"
              style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;"
            />
          </div>
        `;
      }).join('')}
    </div>
    <div style="display: flex; gap: 12px; justify-content: flex-end;">
      <button id="cancelRename" style="padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">Cancel</button>
      <button id="saveRename" style="padding: 8px 16px; border: none; border-radius: 4px; background: #4285f4; color: white; cursor: pointer;">Save Names</button>
    </div>
  `;
  
  modal.appendChild(dialog);
  document.body.appendChild(modal);
  
  // Add event handlers - use querySelector to ensure we get the elements from the modal
  const cancelBtn = modal.querySelector('#cancelRename');
  const saveBtn = modal.querySelector('#saveRename');
  
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
  }
  
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
    const newWindowNames = {};
    const newWindowSignatures = {};
    
    // Collect all custom names
    modal.querySelectorAll('input[data-window-id]').forEach((input, index) => {
      const windowId = parseInt(input.dataset.windowId);
      const customName = input.value.trim();
      if (customName) {
        newWindowNames[windowId] = customName;
        
        // Also save by signature for persistence
        const windowTabs = tabsData.filter(t => t.windowId === windowId);
        const signature = getWindowSignature(windowTabs);
        if (signature) {
          newWindowSignatures[signature] = customName;
        }
      }
    });
    
    // Get existing signatures and merge
    const { windowSignatures = {} } = await chrome.storage.local.get('windowSignatures');
    
    // Save to storage
    await chrome.storage.local.set({ 
      windowNames: newWindowNames,
      windowSignatures: { ...windowSignatures, ...newWindowSignatures }
    });
    
    // Close dialog and reload view
    document.body.removeChild(modal);
    await loadTabsView();
    });
  }
  
  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

// ============================================================================
// Groups View
// ============================================================================

async function loadGroupsView() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const groups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    
    const groupsMap = new Map();
    
    // Initialize groups
    groups.forEach(group => {
      groupsMap.set(group.id, {
        ...group,
        tabs: []
      });
    });
    
    // Add tabs to groups
    tabs.forEach(tab => {
      if (tab.groupId && tab.groupId !== -1) {
        if (groupsMap.has(tab.groupId)) {
          groupsMap.get(tab.groupId).tabs.push(tab);
        }
      }
    });
    
    renderGroups(Array.from(groupsMap.values()));
  } catch (error) {
    console.error('Failed to load groups:', error);
  }
}

function renderGroups(groups) {
  const container = document.getElementById('groupsContainer');
  container.innerHTML = '';
  
  if (groups.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No tab groups</h3>
        <p>Create groups to organize your tabs better</p>
        <button class="btn btn-primary" id="autoGroupBtn">Auto-Group Tabs</button>
      </div>
    `;
    // Add event listener after creating the button
    document.getElementById('autoGroupBtn')?.addEventListener('click', autoGroupTabs);
    return;
  }
  
  groups.forEach(group => {
    const card = document.createElement('div');
    card.className = 'group-card';
    
    card.innerHTML = `
      <div class="group-header" data-group-id="${group.id}">
        <div class="group-title">
          <h3>${group.title || 'Untitled Group'}</h3>
          <span class="group-count">${group.tabs.length} tabs</span>
        </div>
        <div class="group-actions">
          <button class="group-action-btn" data-action="collapse" data-group-id="${group.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <button class="group-action-btn" data-action="close" data-group-id="${group.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="group-tabs ${group.collapsed ? 'collapsed' : ''}">
        ${group.tabs.map(tab => {
          // Filter out invalid favicon URLs
          const favIconUrl = (!tab.favIconUrl || 
                              tab.favIconUrl.startsWith('chrome-extension://') || 
                              tab.favIconUrl === 'chrome-extension://invalid/') 
                              ? '../icons/icon-16.png' 
                              : tab.favIconUrl;
          return `
          <div class="tab-card">
            <div class="tab-header">
              <img src="${favIconUrl}" class="tab-favicon" data-fallback="../icons/icon-16.png">
              <div class="tab-title">${tab.title}</div>
            </div>
          </div>
        `;
        }).join('')}
      </div>
    `;
    
    // Toggle collapse on header click
    const header = card.querySelector('.group-header');
    header.addEventListener('click', (e) => {
      if (!e.target.closest('.group-actions')) {
        const tabs = card.querySelector('.group-tabs');
        tabs.classList.toggle('collapsed');
      }
    });
    
    container.appendChild(card);
  });
  
  // Add event delegation for group actions
  container.addEventListener('click', (e) => {
    const button = e.target.closest('.group-action-btn');
    if (!button) return;
    
    const action = button.dataset.action;
    const groupId = parseInt(button.dataset.groupId);
    
    if (action === 'collapse') {
      collapseGroup(groupId);
    } else if (action === 'close') {
      closeGroup(groupId);
    }
  });
  
  // Handle favicon errors silently
  container.querySelectorAll('.tab-favicon').forEach(img => {
    img.addEventListener('error', function(e) {
      // Prevent error from bubbling up and logging to console
      e.preventDefault();
      this.src = this.dataset.fallback || '../icons/icon-16.png';
    }, true);
  });
}

// ============================================================================
// Snoozed View
// ============================================================================

async function loadSnoozedView() {
  try {
    const snoozedTabs = await sendMessage({ action: 'getSnoozedTabs' });
    renderSnoozedTimeline(snoozedTabs);
  } catch (error) {
    console.error('Failed to load snoozed tabs:', error);
  }
}

function renderSnoozedTimeline(snoozedTabs) {
  const timeline = document.getElementById('snoozedTimeline');
  timeline.innerHTML = '';
  
  if (snoozedTabs.length === 0) {
    timeline.innerHTML = `
      <div class="empty-state">
        <h3>No snoozed tabs</h3>
        <p>Snooze tabs to temporarily hide them and have them reopen later</p>
      </div>
    `;
    return;
  }
  
  // Group by wake time
  const groups = groupSnoozedByTime(snoozedTabs);
  
  // Add timeline line
  timeline.innerHTML = '<div class="timeline-line"></div>';
  
  Object.entries(groups).forEach(([timeLabel, tabs]) => {
    const section = document.createElement('div');
    section.className = 'timeline-section';
    
    section.innerHTML = `
      <div class="timeline-header">
        <div class="timeline-dot"></div>
        <div class="timeline-time">${timeLabel}</div>
      </div>
      <div class="timeline-tabs">
        ${tabs.map(tab => `
          <div class="tab-card">
            <div class="tab-header">
              <img src="${tab.favicon || '../icons/icon-16.png'}" class="tab-favicon">
              <div class="tab-title">${tab.title}</div>
            </div>
            <div class="tab-url">${tab.url}</div>
          </div>
        `).join('')}
      </div>
    `;
    
    timeline.appendChild(section);
  });
}

function groupSnoozedByTime(tabs) {
  const groups = {};
  const now = Date.now();
  
  tabs.forEach(tab => {
    const diff = tab.snoozeUntil - now;
    let label;
    
    if (diff <= 3600000) { // 1 hour
      label = 'Within 1 hour';
    } else if (diff <= 86400000) { // 1 day
      label = 'Today';
    } else if (diff <= 172800000) { // 2 days
      label = 'Tomorrow';
    } else if (diff <= 604800000) { // 1 week
      label = 'This week';
    } else {
      label = 'Later';
    }
    
    if (!groups[label]) {
      groups[label] = [];
    }
    groups[label].push(tab);
  });
  
  return groups;
}

// ============================================================================
// History View
// ============================================================================

async function loadHistoryView() {
  // Get real activity log from background
  const activities = await sendMessage({ action: 'getActivityLog' }) || [];
  
  // Group activities by date
  const groupedHistory = {};
  const now = Date.now();
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const yesterdayStart = todayStart - 86400000;
  const weekAgo = todayStart - 7 * 86400000;
  
  activities.forEach(activity => {
    let dateKey;
    
    if (activity.timestamp >= todayStart) {
      dateKey = 'Today';
    } else if (activity.timestamp >= yesterdayStart) {
      dateKey = 'Yesterday';
    } else if (activity.timestamp >= weekAgo) {
      const daysAgo = Math.floor((todayStart - activity.timestamp) / 86400000);
      dateKey = `${daysAgo} days ago`;
    } else {
      const date = new Date(activity.timestamp);
      dateKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    
    if (!groupedHistory[dateKey]) {
      groupedHistory[dateKey] = [];
    }
    
    groupedHistory[dateKey].push({
      action: activity.action,
      description: activity.details,
      timestamp: activity.timestamp,
      source: activity.source,
      color: activity.color,
      icon: activity.icon
    });
  });
  
  // Convert to array format for rendering
  const historyArray = Object.entries(groupedHistory).map(([date, items]) => ({
    date,
    items,
    sortKey: items[0]?.timestamp || 0
  }));
  
  // Sort by most recent date first
  historyArray.sort((a, b) => b.sortKey - a.sortKey);
  
  renderHistory(historyArray);
}

function renderHistory(history) {
  const container = document.getElementById('historyContainer');
  container.innerHTML = '';
  
  if (history.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No tab history</h3>
        <p>Your tab management activity will appear here as you use TabMaster Pro</p>
      </div>
    `;
    return;
  }
  
  history.forEach(day => {
    const dayCard = document.createElement('div');
    dayCard.className = 'history-day';
    
    const dayHeader = document.createElement('h3');
    dayHeader.textContent = day.date;
    dayCard.appendChild(dayHeader);
    
    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'history-items';
    
    day.items.forEach(item => {
      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      
      const badge = item.source === 'auto' ? '<span class="source-badge auto">Auto</span>' : 
                   item.source === 'rule' ? '<span class="source-badge rule">Rule</span>' : '';
      
      historyItem.innerHTML = `
        <div class="history-icon" style="color: ${item.color || '#666'};">
          ${getActivityIcon(item.icon || 'action')}
        </div>
        <div class="history-content">
          <div class="history-action">
            ${item.description}
            ${badge}
          </div>
          <div class="history-time">${new Date(item.timestamp).toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit'
          })}</div>
        </div>
      `;
      
      itemsContainer.appendChild(historyItem);
    });
    
    dayCard.appendChild(itemsContainer);
    container.appendChild(dayCard);
  });
}

// ============================================================================
// Analytics View
// ============================================================================

// ============================================================================
// Selection Management
// ============================================================================

function handleTabSelection(checkbox, tabId, tabCard) {
  if (checkbox.checked) {
    selectionState.selectedTabs.add(tabId);
    tabCard.classList.add('selected');
  } else {
    selectionState.selectedTabs.delete(tabId);
    tabCard.classList.remove('selected');
  }
  
  selectionState.lastSelectedId = tabId;
  updateBulkToolbar();
}

function handleRangeSelection(endId) {
  const allTabCards = Array.from(document.querySelectorAll('.tab-card'));
  const startIndex = allTabCards.findIndex(card => 
    parseInt(card.dataset.tabId) === selectionState.lastSelectedId
  );
  const endIndex = allTabCards.findIndex(card => 
    parseInt(card.dataset.tabId) === endId
  );
  
  if (startIndex === -1 || endIndex === -1) return;
  
  const [minIndex, maxIndex] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
  
  for (let i = minIndex; i <= maxIndex; i++) {
    const card = allTabCards[i];
    const tabId = parseInt(card.dataset.tabId);
    const checkbox = card.querySelector('.tab-checkbox');
    
    if (!selectionState.selectedTabs.has(tabId)) {
      selectionState.selectedTabs.add(tabId);
      card.classList.add('selected');
      checkbox.checked = true;
    }
  }
  
  updateBulkToolbar();
}

function selectAllTabs() {
  const allTabCards = document.querySelectorAll('.tab-card');
  
  allTabCards.forEach(card => {
    const tabId = parseInt(card.dataset.tabId);
    const checkbox = card.querySelector('.tab-checkbox');
    
    selectionState.selectedTabs.add(tabId);
    card.classList.add('selected');
    checkbox.checked = true;
  });
  
  updateBulkToolbar();
}

function clearSelection() {
  // Clear selections in grid view
  const allTabCards = document.querySelectorAll('.tab-card');
  allTabCards.forEach(card => {
    const checkbox = card.querySelector('.tab-checkbox');
    card.classList.remove('selected');
    if (checkbox) checkbox.checked = false;
  });
  
  // Clear selections in tree view
  const allTreeTabs = document.querySelectorAll('.tree-tab');
  allTreeTabs.forEach(tab => {
    const checkbox = tab.querySelector('.tab-checkbox');
    tab.classList.remove('selected');
    if (checkbox) checkbox.checked = false;
  });
  
  // Clear all parent checkboxes in tree view (windows and groups)
  const allParentCheckboxes = document.querySelectorAll('.tree-select-checkbox');
  allParentCheckboxes.forEach(checkbox => {
    checkbox.checked = false;
    checkbox.indeterminate = false;
  });
  
  selectionState.selectedTabs.clear();
  selectionState.lastSelectedId = null;
  updateBulkToolbar();
}

function updateBulkToolbar() {
  const toolbar = document.getElementById('bulkToolbar');
  const count = selectionState.selectedTabs.size;
  
  if (count > 0) {
    toolbar.hidden = false;
    document.getElementById('selectedCount').textContent = count;
    
    // Update old modal count too for backward compatibility
    const modalCount = document.querySelector('#bulkActionsModal #selectedCount');
    if (modalCount) modalCount.textContent = count;
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
  
  // Bulk actions
  document.getElementById('bulkActions')?.addEventListener('click', openBulkActions);
  
  // Create group
  document.getElementById('createGroup')?.addEventListener('click', createNewGroup);
  
  // Auto group
  document.getElementById('autoGroup')?.addEventListener('click', autoGroupTabs);
  
  // Wake all snoozed
  document.getElementById('wakeAll')?.addEventListener('click', wakeAllSnoozed);
  
  // Analytics period
  document.getElementById('analyticsPeriod')?.addEventListener('change', (e) => {
    loadAnalyticsView(); // Reload with new period
  });
  
  // Modal close buttons
  document.getElementById('closeBulkActions')?.addEventListener('click', closeBulkActionsModal);
  document.getElementById('closeQuickOrganize')?.addEventListener('click', closeQuickOrganizeModal);
  
  // Quick organize execute
  document.getElementById('executeOrganize')?.addEventListener('click', executeQuickOrganize);
  document.getElementById('cancelOrganize')?.addEventListener('click', closeQuickOrganizeModal);
  
  // Bulk action buttons (old modal)
  document.querySelectorAll('#bulkActionsModal .bulk-action-btn').forEach(btn => {
    btn.addEventListener('click', () => executeBulkAction(btn.dataset.action));
  });
  
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
    if ((e.ctrlKey || e.metaKey) && e.key === 'a' && currentView === 'tabs') {
      e.preventDefault();
      selectAllTabs();
    }
    if (e.key === 'Escape' && selectionState.selectedTabs.size > 0) {
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

function openBulkActions() {
  const modal = document.getElementById('bulkActionsModal');
  modal.classList.add('show');
  document.getElementById('selectedCount').textContent = selectedTabs.size;
}

function closeBulkActionsModal() {
  document.getElementById('bulkActionsModal').classList.remove('show');
}

function updateSelectedCount() {
  document.getElementById('selectedCount').textContent = selectedTabs.size;
}

async function executeBulkAction(action) {
  const selectedIds = Array.from(selectionState.selectedTabs);
  const count = selectedIds.length;
  
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
  await chrome.tabs.remove(tabIds);
  
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
  
  // Show enhanced snooze modal
  snoozeModal.show(selectedTabsData);
  
  // Set up modal callbacks
  snoozeModal.onSnooze = async (snoozeData) => {
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
  
  snoozeModal.onCancel = () => {
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
    document.getElementById('confirmCancel')?.addEventListener('click', handleCancel, { once: true });
    
    modal.classList.add('show');
  });
}

async function promptGroupName() {
  // For now, use a simple prompt. In a real implementation, create a proper dialog
  return prompt('Enter a name for the group:', 'New Group');
}

function showProgressIndicator(text = 'Processing...') {
  const overlay = document.getElementById('progressOverlay');
  const progressText = document.getElementById('progressText');
  progressText.textContent = text;
  overlay.style.display = 'flex';
}

function hideProgressIndicator() {
  document.getElementById('progressOverlay').style.display = 'none';
}

function showNotification(message, type = 'info') {
  // For now, use chrome notifications. In a real implementation, create toast notifications
  chrome.notifications.create({
    type: 'basic',
    iconUrl: '../icons/icon-128.png',
    title: 'TabMaster Pro',
    message: message
  });
}

async function createNewGroup() {
  const name = prompt('Enter group name:');
  if (!name) return;
  
  // Get selected tabs or current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs.length > 0) {
    const groupId = await chrome.tabs.group({ tabIds: [tabs[0].id] });
    await chrome.tabGroups.update(groupId, {
      title: name,
      color: 'blue'
    });
  }
  
  loadGroupsView();
}

async function collapseGroup(groupId) {
  try {
    const group = await chrome.tabGroups.get(groupId);
    await chrome.tabGroups.update(groupId, { collapsed: !group.collapsed });
    await loadGroupsView(); // Refresh the view
  } catch (error) {
    console.error('Failed to collapse group:', error);
  }
}

async function closeGroup(groupId) {
  try {
    // Get all tabs in this group
    const tabs = await chrome.tabs.query({ groupId });
    const tabIds = tabs.map(tab => tab.id);
    
    // Close all tabs in the group
    if (tabIds.length > 0) {
      await chrome.tabs.remove(tabIds);
    }
    
    await loadGroupsView(); // Refresh the view
  } catch (error) {
    console.error('Failed to close group:', error);
  }
}

async function autoGroupTabs() {
  await sendMessage({ action: 'groupByDomain' });
  loadGroupsView();
}

async function wakeAllSnoozed() {
  const snoozedTabs = await sendMessage({ action: 'getSnoozedTabs' });
  for (const tab of snoozedTabs) {
    await sendMessage({ action: 'restoreSnoozedTab', tabId: tab.id });
  }
  loadSnoozedView();
}

// Make functions globally accessible
window.collapseGroup = async (groupId) => {
  await chrome.tabGroups.update(groupId, { collapsed: true });
  loadGroupsView();
};

window.closeGroup = async (groupId) => {
  const tabs = await chrome.tabs.query({ groupId });
  const tabIds = tabs.map(t => t.id);
  await chrome.tabs.remove(tabIds);
  loadGroupsView();
};

window.autoGroupTabs = autoGroupTabs;

// ============================================================================
// Utility Functions
// ============================================================================

async function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

async function refreshData() {
  // Do not refresh if tabs are selected for a bulk action
  if (selectionState.selectedTabs.size > 0) {
    console.log('Skipping auto-refresh due to active tab selection.');
    return;
  }
  
  switch(currentView) {
    case 'overview':
      await loadOverviewData();
      break;
    case 'tabs':
      await loadTabsView();
      break;
    case 'groups':
      await loadGroupsView();
      break;
    case 'snoozed':
      await loadSnoozedView();
      break;
    case 'history':
      await loadHistoryView();
      break;
    case 'analytics':
      await loadAnalyticsView();
      break;
  }
}

// ============================================================================
// Rules View
// ============================================================================

let currentRules = [];
let editingRule = null;
let sampleRules = [];

async function loadRulesView() {
  console.log('Loading rules view...');

  try {
    // Load current rules from background
    const rules = await sendMessage({ action: 'getRules' });
    currentRules = rules || [];

    // Initialize sample rules (not auto-enabled)
    sampleRules = getSampleRules();

    // Update UI
    updateRulesUI();
    setupRulesEventListeners();

  } catch (error) {
    console.error('Failed to load rules:', error);
  }
}

function getSampleRules() {
  return [
    {
      id: 'sample_1',
      name: 'Close duplicate tabs',
      description: 'Automatically close duplicate tabs, keeping the first one',
      enabled: false,
      conditions: { type: 'duplicate' },
      actions: { type: 'close', keepFirst: true },
      priority: 1,
    },
    {
      id: 'sample_2',
      name: 'Group tabs by domain',
      description: 'Group tabs from the same domain when you have 3 or more',
      enabled: false,
      conditions: { type: 'domain_count', minCount: 3 },
      actions: { type: 'group', groupBy: 'domain' },
      priority: 2,
    },
    {
      id: 'sample_3',
      name: 'Snooze inactive articles',
      description: 'Snooze unread articles after 60 minutes of inactivity',
      enabled: false,
      conditions: {
        type: 'inactive',
        urlPatterns: ['medium.com', 'dev.to', 'hackernews', 'reddit.com'],
        timeCriteria: { inactive: 60 }
      },
      actions: { type: 'snooze', snoozeMinutes: 1440 },
      priority: 3,
      trigger: { type: 'event' }
    },
    {
      id: 'sample_4',
      name: 'Clean up inactive Chrome pages',
      description: 'Close common Chrome internal pages after 30 minutes of inactivity',
      enabled: false,
      conditions: {
        type: 'url_pattern',
        pattern: '^chrome://(extensions|downloads|settings|flags|history|bookmarks|newtab)',
        timeCriteria: { inactive: 30 }
      },
      actions: { type: 'close', saveToBookmarks: false },
      priority: 4,
      trigger: { type: 'event' }
    },
    {
      id: 'sample_5',
      name: 'Close inactive social media tabs',
      description: 'Close social media tabs after 60 minutes of inactivity',
      enabled: false,
      conditions: {
        type: 'category',
        categories: ['social'],
        timeCriteria: { inactive: 60 }
      },
      actions: { type: 'close', saveToBookmarks: false },
      priority: 5,
      trigger: { type: 'periodic', interval: 15 }
    },
    {
      id: 'sample_6',
      name: 'Group shopping tabs together',
      description: 'Automatically group all shopping sites into one tab group',
      enabled: false,
      conditions: {
        type: 'category',
        categories: ['shopping']
      },
      actions: { type: 'group', groupBy: 'category' },
      priority: 6,
      trigger: { type: 'event' }
    },
    {
      id: 'sample_7',
      name: 'Archive old research tabs',
      description: 'Close tabs older than 7 days that haven\'t been accessed in 24 hours',
      enabled: false,
      conditions: {
        type: 'duplicate',  // Match all tabs
        timeCriteria: { 
          age: 10080,  // 7 days
          notAccessed: 1440  // 24 hours
        }
      },
      actions: { type: 'close', saveToBookmarks: true },
      priority: 7,
      trigger: { type: 'periodic', interval: 60 }  // Check hourly
    },
    {
      id: 'sample_8',
      name: 'Suspend memory-heavy tabs',
      description: 'Suspend tabs from specific domains after 2 hours of inactivity',
      enabled: false,
      conditions: {
        type: 'age_and_domain',
        domains: ['youtube.com', 'netflix.com', 'twitch.tv', 'spotify.com'],
        timeCriteria: { inactive: 120 }  // 2 hours
      },
      actions: { type: 'suspend', excludePinned: true },
      priority: 8,
      trigger: { type: 'periodic', interval: 30 }  // Check every 30 minutes
    }
  ];
}

function updateRulesUI() {
  const rulesList = document.getElementById('rulesList');
  const emptyState = document.getElementById('rulesEmptyState');

  // Show/hide empty state
  if (currentRules.length === 0) {
    emptyState.style.display = 'flex';
    rulesList.style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    rulesList.style.display = 'block';
    rulesList.innerHTML = '';

    // Sort rules by priority
    const sortedRules = [...currentRules].sort((a, b) => a.priority - b.priority);

    sortedRules.forEach(rule => {
      const ruleCard = createRuleCard(rule);
      rulesList.appendChild(ruleCard);
    });
  }

  // Update sample rules in dropdown
  updateSampleRulesDropdown();
}

function createRuleCard(rule) {
  const card = document.createElement('div');
  card.className = `rule-card ${!rule.enabled ? 'disabled' : ''}`;
  card.dataset.ruleId = rule.id;
  card.draggable = true;

  card.innerHTML = `
    <div class="rule-header">
      <div class="rule-drag-handle" title="Drag to reorder">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="9" cy="5" r="1"></circle>
          <circle cx="9" cy="12" r="1"></circle>
          <circle cx="9" cy="19" r="1"></circle>
          <circle cx="15" cy="5" r="1"></circle>
          <circle cx="15" cy="12" r="1"></circle>
          <circle cx="15" cy="19" r="1"></circle>
        </svg>
      </div>
      <div class="rule-info">
        <h3>${rule.name}</h3>
      </div>
      <div class="rule-actions">
        <label class="switch rule-switch" title="${rule.enabled ? 'Disable rule' : 'Enable rule'}">
          <input type="checkbox" class="rule-toggle" data-action="toggle" data-rule-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
        <button class="btn-icon" data-action="test" title="Test this rule">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </button>
        <button class="btn-icon" data-action="edit" title="Edit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="btn-icon" data-action="delete" title="Delete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>
    <div class="rule-details">
      <div class="rule-condition">
        <strong>When:</strong> ${getConditionDescription(rule.conditions)}
      </div>
      <div class="rule-action">
        <strong>Then:</strong> ${getActionDescription(rule.actions)}
      </div>
      ${rule.trigger && rule.trigger.type === 'periodic' ? `
      <div class="rule-trigger">
        <strong>Runs:</strong> Every ${rule.trigger.interval} minutes
      </div>
      ` : ''}
    </div>
  `;

  return card;
}

function updateSampleRulesDropdown() {
  const sampleRuleItems = document.getElementById('sampleRuleItems');
  if (!sampleRuleItems) return;

  sampleRuleItems.innerHTML = '';

  // Filter out already installed samples
  const installedSampleIds = currentRules.map(r => r.originalSampleId).filter(Boolean);
  const availableSamples = sampleRules.filter(s => !installedSampleIds.includes(s.id));

  if (availableSamples.length === 0) {
    sampleRuleItems.innerHTML = '<div class="dropdown-item-text">All templates installed</div>';
  } else {
    availableSamples.forEach(sample => {
      const item = document.createElement('button');
      item.className = 'dropdown-item sample-rule-item';
      item.dataset.sampleId = sample.id;
      item.innerHTML = `
        <div class="dropdown-item-content">
          <strong>${sample.name}</strong>
          <small>${sample.description}</small>
        </div>
      `;
      sampleRuleItems.appendChild(item);
    });
  }
}

function getConditionDescription(conditions) {
  let description = '';
  
  // Base condition
  switch (conditions.type) {
    case 'duplicate':
      description = 'Duplicate tabs';
      break;
    case 'domain_count':
      description = `${conditions.minCount}+ tabs from same domain`;
      break;
    case 'inactive':
      description = conditions.urlPatterns && conditions.urlPatterns.length > 0 
        ? `Tabs from ${conditions.urlPatterns.join(', ')}`
        : 'All tabs';
      break;
    case 'age_and_domain':
      description = `Tabs from ${conditions.domains.join(', ')}`;
      break;
    case 'url_pattern':
      description = `URLs matching "${conditions.pattern}"`;
      break;
    case 'category':
      const categoryNames = conditions.categories ? conditions.categories.join(', ') : 'none';
      description = `Sites in categories: ${categoryNames}`;
      break;
    default:
      return 'Unknown condition';
  }
  
  // Add time criteria if present
  const timeParts = [];
  if (conditions.timeCriteria) {
    if (conditions.timeCriteria.inactive !== undefined) {
      timeParts.push(`inactive for ${conditions.timeCriteria.inactive} min`);
    }
    if (conditions.timeCriteria.age !== undefined) {
      timeParts.push(`older than ${conditions.timeCriteria.age} min`);
    }
    if (conditions.timeCriteria.notAccessed !== undefined) {
      timeParts.push(`not accessed for ${conditions.timeCriteria.notAccessed} min`);
    }
  }
  
  // Handle legacy format for backward compatibility
  if (conditions.inactiveMinutes && !conditions.timeCriteria) {
    timeParts.push(`inactive for ${conditions.inactiveMinutes} min`);
  }
  if (conditions.ageMinutes && !conditions.timeCriteria) {
    timeParts.push(`older than ${conditions.ageMinutes} min`);
  }
  
  if (timeParts.length > 0) {
    description += ` (${timeParts.join(', ')})`;
  }
  
  return description;
}

function getActionDescription(actions) {
  switch (actions.type) {
    case 'close':
      return `Close tabs ${actions.saveToBookmarks ? '(save to bookmarks)' : ''}`;
    case 'group':
      return `Group tabs by ${actions.groupBy}`;
    case 'snooze':
      return `Snooze for ${actions.snoozeMinutes} minutes`;
    case 'suspend':
      return `Suspend tabs ${actions.excludePinned ? '(exclude pinned)' : ''}`;
    default:
      return 'Unknown action';
  }
}

function setupRulesEventListeners() {
  // Dropdown toggle
  const dropdownBtn = document.getElementById('addRuleDropdown');
  const dropdownMenu = document.getElementById('addRuleMenu');

  if (dropdownBtn && !dropdownBtn.hasListener) {
    dropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownMenu.classList.toggle('show');
    });
    dropdownBtn.hasListener = true;

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      dropdownMenu.classList.remove('show');
    });

    dropdownMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // Add custom rule button
  const addCustomBtn = document.getElementById('addCustomRuleBtn');
  if (addCustomBtn && !addCustomBtn.hasListener) {
    addCustomBtn.addEventListener('click', () => {
      openRuleModal();
      dropdownMenu.classList.remove('show');
    });
    addCustomBtn.hasListener = true;
  }

  // Test all rules button
  const testAllBtn = document.getElementById('testAllRulesBtn');
  if (testAllBtn && !testAllBtn.hasListener) {
    testAllBtn.addEventListener('click', () => testAllRules());
    testAllBtn.hasListener = true;
  }

  // Create first rule button (in empty state) - triggers dropdown
  const createFirstBtn = document.getElementById('createFirstRuleBtn');
  if (createFirstBtn && !createFirstBtn.hasListener) {
    createFirstBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Position dropdown near the button for better UX in empty state
      const dropdownMenu = document.getElementById('addRuleMenu');
      const btnRect = createFirstBtn.getBoundingClientRect();
      dropdownMenu.style.position = 'fixed';
      dropdownMenu.style.top = `${btnRect.bottom + 8}px`;
      dropdownMenu.style.left = `${btnRect.left}px`;
      dropdownMenu.style.right = 'auto';
      dropdownMenu.classList.toggle('show');

      // Reset position when closed
      const resetPosition = () => {
        if (!dropdownMenu.classList.contains('show')) {
          dropdownMenu.style.position = '';
          dropdownMenu.style.top = '';
          dropdownMenu.style.left = '';
          dropdownMenu.style.right = '';
          document.removeEventListener('click', resetPosition);
        }
      };

      setTimeout(() => {
        document.addEventListener('click', resetPosition);
      }, 0);
    });
    createFirstBtn.hasListener = true;
  }

  // Modal buttons
  const closeModalBtn = document.getElementById('closeRuleModal');
  const cancelBtn = document.getElementById('cancelRuleBtn');
  const saveBtn = document.getElementById('saveRuleBtn');

  if (closeModalBtn && !closeModalBtn.hasListener) {
    closeModalBtn.addEventListener('click', closeRuleModal);
    closeModalBtn.hasListener = true;
  }

  if (cancelBtn && !cancelBtn.hasListener) {
    cancelBtn.addEventListener('click', closeRuleModal);
    cancelBtn.hasListener = true;
  }

  if (saveBtn && !saveBtn.hasListener) {
    saveBtn.addEventListener('click', saveRule);
    saveBtn.hasListener = true;
  }

  // Condition/Action selects
  const conditionSelect = document.getElementById('ruleCondition');
  const actionSelect = document.getElementById('ruleAction');

  if (conditionSelect && !conditionSelect.hasListener) {
    conditionSelect.addEventListener('change', updateConditionParams);
    conditionSelect.hasListener = true;
  }

  if (actionSelect && !actionSelect.hasListener) {
    actionSelect.addEventListener('change', updateActionParams);
    actionSelect.hasListener = true;
  }

  // Time criteria checkboxes
  const timeCheckboxes = ['useInactive', 'useAge', 'useNotAccessed'];
  timeCheckboxes.forEach(id => {
    const checkbox = document.getElementById(id);
    if (checkbox && !checkbox.hasListener) {
      checkbox.addEventListener('change', (e) => {
        const inputId = id.replace('use', '').toLowerCase() + 'Minutes';
        const input = document.getElementById(inputId);
        if (input) {
          input.disabled = !e.target.checked;
        }
      });
      checkbox.hasListener = true;
    }
  });

  // Trigger type select
  const triggerSelect = document.getElementById('triggerType');
  if (triggerSelect && !triggerSelect.hasListener) {
    triggerSelect.addEventListener('change', (e) => {
      const intervalDiv = document.getElementById('triggerInterval');
      intervalDiv.style.display = e.target.value === 'periodic' ? 'block' : 'none';
    });
    triggerSelect.hasListener = true;
  }

  // Rule card actions (use event delegation)
  const rulesList = document.getElementById('rulesList');
  if (rulesList && !rulesList.hasListener) {
    rulesList.addEventListener('click', handleRuleAction);
    rulesList.hasListener = true;
  }

  // Sample rule installations from dropdown
  const sampleRuleItems = document.getElementById('sampleRuleItems');
  if (sampleRuleItems && !sampleRuleItems.hasListener) {
    sampleRuleItems.addEventListener('click', async (e) => {
      const sampleItem = e.target.closest('.sample-rule-item');
      if (!sampleItem) return;

      const sampleId = sampleItem.dataset.sampleId;
      const sample = sampleRules.find(s => s.id === sampleId);

      if (sample) {
        await installSampleRule(sample);
        dropdownMenu.classList.remove('show');
      }
    });
    sampleRuleItems.hasListener = true;
  }

  // Quick actions
  const disableAllBtn = document.getElementById('disableAllRules');
  const enableAllBtn = document.getElementById('enableAllRules');

  if (disableAllBtn && !disableAllBtn.hasListener) {
    disableAllBtn.addEventListener('click', () => toggleAllRules(false));
    disableAllBtn.hasListener = true;
  }

  if (enableAllBtn && !enableAllBtn.hasListener) {
    enableAllBtn.addEventListener('click', () => toggleAllRules(true));
    enableAllBtn.hasListener = true;
  }

  // Setup drag and drop for rules
  setupRuleDragAndDrop();
}

async function handleRuleAction(e) {
  // Handle switch toggle separately
  if (e.target.classList.contains('rule-toggle')) {
    const ruleId = e.target.dataset.ruleId;
    await toggleRule(ruleId);
    return;
  }

  const button = e.target.closest('[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const ruleCard = button.closest('.rule-card');
  const ruleId = ruleCard.dataset.ruleId;

  switch (action) {
    case 'test':
      await testRule(ruleId);
      break;

    case 'edit':
      const rule = currentRules.find(r => r.id === ruleId);
      if (rule) openRuleModal(rule);
      break;

    case 'delete':
      if (confirm('Are you sure you want to delete this rule?')) {
        await deleteRule(ruleId);
      }
      break;
  }
}

async function installSampleRule(sample) {
  // Create a new rule from the sample
  const newRule = {
    ...sample,
    id: `rule_${Date.now()}`,
    originalSampleId: sample.id,
    enabled: false // Start disabled for safety
  };

  delete newRule.description; // Remove sample description

  try {
    await sendMessage({ action: 'updateRule', rule: newRule });
    await loadRulesView();
    showNotification(`Template "${sample.name}" added successfully`);
  } catch (error) {
    console.error('Failed to install sample rule:', error);
    showNotification('Failed to install rule', 'error');
  }
}

function openRuleModal(rule = null) {
  const modal = document.getElementById('ruleModal');
  const title = document.getElementById('ruleModalTitle');

  editingRule = rule;

  if (rule) {
    title.textContent = 'Edit Rule';
    document.getElementById('ruleName').value = rule.name;
    document.getElementById('ruleCondition').value = rule.conditions.type;
    document.getElementById('ruleAction').value = rule.actions.type;
    document.getElementById('ruleEnabled').checked = rule.enabled;
    
    // Load time criteria
    const timeCriteria = rule.conditions.timeCriteria || {};
    document.getElementById('useInactive').checked = timeCriteria.inactive !== undefined;
    document.getElementById('inactiveMinutes').value = timeCriteria.inactive || 60;
    document.getElementById('inactiveMinutes').disabled = timeCriteria.inactive === undefined;
    
    document.getElementById('useAge').checked = timeCriteria.age !== undefined;
    document.getElementById('ageMinutes').value = timeCriteria.age || 180;
    document.getElementById('ageMinutes').disabled = timeCriteria.age === undefined;
    
    document.getElementById('useNotAccessed').checked = timeCriteria.notAccessed !== undefined;
    document.getElementById('notAccessedMinutes').value = timeCriteria.notAccessed || 120;
    document.getElementById('notAccessedMinutes').disabled = timeCriteria.notAccessed === undefined;
    
    // Load trigger settings
    const trigger = rule.trigger || { type: 'event' };
    document.getElementById('triggerType').value = trigger.type;
    document.getElementById('intervalMinutes').value = trigger.interval || 15;
    document.getElementById('triggerInterval').style.display = trigger.type === 'periodic' ? 'block' : 'none';
    
  } else {
    title.textContent = 'Add New Rule';
    document.getElementById('ruleName').value = '';
    document.getElementById('ruleCondition').value = 'duplicate';
    document.getElementById('ruleAction').value = 'close';
    document.getElementById('ruleEnabled').checked = false; // Start disabled for safety
    
    // Reset time criteria
    document.getElementById('useInactive').checked = false;
    document.getElementById('inactiveMinutes').value = 60;
    document.getElementById('inactiveMinutes').disabled = true;
    
    document.getElementById('useAge').checked = false;
    document.getElementById('ageMinutes').value = 180;
    document.getElementById('ageMinutes').disabled = true;
    
    document.getElementById('useNotAccessed').checked = false;
    document.getElementById('notAccessedMinutes').value = 120;
    document.getElementById('notAccessedMinutes').disabled = true;
    
    // Reset trigger
    document.getElementById('triggerType').value = 'event';
    document.getElementById('intervalMinutes').value = 15;
    document.getElementById('triggerInterval').style.display = 'none';
  }

  updateConditionParams();
  updateActionParams();
  modal.classList.add('show');
}

function closeRuleModal() {
  const modal = document.getElementById('ruleModal');
  modal.classList.remove('show');
  editingRule = null;
}

function updateConditionParams() {
  const conditionType = document.getElementById('ruleCondition').value;
  const paramsContainer = document.getElementById('conditionParams');

  let html = '';

  switch (conditionType) {
    case 'domain_count':
      html = `
        <label>Minimum tab count from same domain</label>
        <input type="number" id="minCount" min="2" value="3">
      `;
      break;

    case 'inactive':
      html = `
        <label>URL patterns (comma-separated, optional)</label>
        <input type="text" id="urlPatterns" placeholder="e.g., medium.com, dev.to">
        <p class="help-text">Leave empty to match all tabs</p>
      `;
      break;

    case 'age_and_domain':
      html = `
        <label>Specific domains (comma-separated)</label>
        <input type="text" id="domains" placeholder="e.g., stackoverflow.com, github.com">
      `;
      break;

    case 'duplicate':
      // No additional parameters needed
      break;

    case 'url_pattern':
      html = `
        <label>URL pattern (regex)</label>
        <input type="text" id="urlPattern" placeholder="e.g., .*\\.github\\.com/.*">
        <p class="help-text">Use regular expressions. Example: .*\\.example\\.com/.* matches all example.com URLs</p>
      `;
      break;

    case 'category':
      html = `
        <label>Select categories</label>
        <div id="categoryCheckboxes" class="category-checkboxes">
          <label><input type="checkbox" value="social"> Social Media</label>
          <label><input type="checkbox" value="streaming_entertainment"> Streaming & Entertainment</label>
          <label><input type="checkbox" value="news_media"> News & Media</label>
          <label><input type="checkbox" value="shopping"> Shopping</label>
          <label><input type="checkbox" value="productivity_tools"> Productivity Tools</label>
          <label><input type="checkbox" value="reference_research"> Reference & Research</label>
          <label><input type="checkbox" value="tech_dev"> Tech & Development</label>
          <label><input type="checkbox" value="gaming"> Gaming</label>
          <label><input type="checkbox" value="finance"> Finance</label>
          <label><input type="checkbox" value="communication"> Communication</label>
          <label><input type="checkbox" value="entertainment"> Entertainment</label>
          <label><input type="checkbox" value="education"> Education</label>
          <label><input type="checkbox" value="travel"> Travel</label>
          <label><input type="checkbox" value="food_delivery"> Food Delivery</label>
          <label><input type="checkbox" value="health_fitness"> Health & Fitness</label>
          <label><input type="checkbox" value="government"> Government</label>
          <label><input type="checkbox" value="crypto"> Cryptocurrency</label>
          <label><input type="checkbox" value="sports"> Sports</label>
          <label><input type="checkbox" value="music"> Music</label>
        </div>
        <p class="help-text">Select one or more categories to match</p>
      `;
      break;
  }

  paramsContainer.innerHTML = html;

  // Load existing values if editing
  if (editingRule && editingRule.conditions.type === conditionType) {
    switch (conditionType) {
      case 'domain_count':
        if (document.getElementById('minCount'))
          document.getElementById('minCount').value = editingRule.conditions.minCount || 3;
        break;
      case 'inactive':
        if (document.getElementById('urlPatterns') && editingRule.conditions.urlPatterns)
          document.getElementById('urlPatterns').value = editingRule.conditions.urlPatterns.join(', ');
        break;
      case 'age_and_domain':
        if (document.getElementById('domains') && editingRule.conditions.domains)
          document.getElementById('domains').value = editingRule.conditions.domains.join(', ');
        break;
      
      case 'url_pattern':
        if (document.getElementById('urlPattern'))
          document.getElementById('urlPattern').value = editingRule.conditions.pattern || '';
        break;
      
      case 'category':
        if (editingRule.conditions.categories) {
          const checkboxes = document.querySelectorAll('#categoryCheckboxes input[type="checkbox"]');
          checkboxes.forEach(checkbox => {
            checkbox.checked = editingRule.conditions.categories.includes(checkbox.value);
          });
        }
        break;
    }
  }
}

function updateActionParams() {
  const actionType = document.getElementById('ruleAction').value;
  const paramsContainer = document.getElementById('actionParams');

  let html = '';

  switch (actionType) {
    case 'close':
      html = `
        <label>
          <input type="checkbox" id="saveToBookmarks" checked>
          Save to bookmarks before closing
        </label>
        <label>
          <input type="checkbox" id="keepFirst" checked>
          Keep the oldest tab when closing duplicates
        </label>
        <p class="help-text">When unchecked, keeps the newest tab instead</p>
      `;
      break;

    case 'group':
      html = `
        <label>Group by</label>
        <select id="groupBy">
          <option value="domain">Domain</option>
          <option value="category">Category</option>
        </select>
      `;
      break;

    case 'snooze':
      html = `
        <label>Snooze duration (minutes)</label>
        <input type="number" id="snoozeMinutes" min="5" value="120">
      `;
      break;

    case 'suspend':
      html = `
        <label>
          <input type="checkbox" id="excludePinned" checked>
          Exclude pinned tabs
        </label>
      `;
      break;
  }

  paramsContainer.innerHTML = html;

  // Load existing values if editing
  if (editingRule && editingRule.actions.type === actionType) {
    switch (actionType) {
      case 'close':
        if (document.getElementById('saveToBookmarks'))
          document.getElementById('saveToBookmarks').checked = editingRule.actions.saveToBookmarks !== false;
        if (document.getElementById('keepFirst'))
          document.getElementById('keepFirst').checked = editingRule.actions.keepFirst !== false;
        break;
      case 'group':
        if (document.getElementById('groupBy'))
          document.getElementById('groupBy').value = editingRule.actions.groupBy || 'domain';
        break;
      case 'snooze':
        if (document.getElementById('snoozeMinutes'))
          document.getElementById('snoozeMinutes').value = editingRule.actions.snoozeMinutes || 120;
        break;
      case 'suspend':
        if (document.getElementById('excludePinned'))
          document.getElementById('excludePinned').checked = editingRule.actions.excludePinned !== false;
        break;
    }
  }
}

async function saveRule() {
  const name = document.getElementById('ruleName').value.trim();

  if (!name) {
    alert('Please enter a rule name');
    return;
  }

  const conditionType = document.getElementById('ruleCondition').value;
  const actionType = document.getElementById('ruleAction').value;
  const enabled = document.getElementById('ruleEnabled').checked;

  // Priority will be set based on position (new rules go to end)
  const priority = editingRule?.priority || currentRules.length + 1;

  // Build conditions object
  const conditions = { type: conditionType };

  switch (conditionType) {
    case 'domain_count':
      conditions.minCount = parseInt(document.getElementById('minCount')?.value || 3);
      break;

    case 'inactive':
      const urlPatterns = document.getElementById('urlPatterns')?.value;
      if (urlPatterns) {
        conditions.urlPatterns = urlPatterns.split(',').map(p => p.trim()).filter(Boolean);
      }
      break;

    case 'age_and_domain':
      const domains = document.getElementById('domains')?.value;
      if (domains) {
        conditions.domains = domains.split(',').map(d => d.trim()).filter(Boolean);
      } else {
        alert('Please specify at least one domain');
        return;
      }
      break;
    
    case 'url_pattern':
      const pattern = document.getElementById('urlPattern')?.value?.trim();
      if (pattern) {
        try {
          // Validate regex
          new RegExp(pattern);
          conditions.pattern = pattern;
        } catch (e) {
          alert('Invalid regular expression: ' + e.message);
          return;
        }
      } else {
        alert('Please specify a URL pattern');
        return;
      }
      break;
    
    case 'category':
      const selectedCategories = [];
      const checkboxes = document.querySelectorAll('#categoryCheckboxes input[type="checkbox"]:checked');
      checkboxes.forEach(checkbox => {
        selectedCategories.push(checkbox.value);
      });
      if (selectedCategories.length === 0) {
        alert('Please select at least one category');
        return;
      }
      conditions.categories = selectedCategories;
      break;
  }

  // Build actions object
  const actions = { type: actionType };

  switch (actionType) {
    case 'close':
      actions.saveToBookmarks = document.getElementById('saveToBookmarks')?.checked !== false;
      actions.keepFirst = document.getElementById('keepFirst')?.checked !== false;
      break;

    case 'group':
      actions.groupBy = document.getElementById('groupBy')?.value || 'domain';
      break;

    case 'snooze':
      actions.snoozeMinutes = parseInt(document.getElementById('snoozeMinutes')?.value || 120);
      break;

    case 'suspend':
      actions.excludePinned = document.getElementById('excludePinned')?.checked !== false;
      break;
  }

  // Build time criteria if any are checked
  const timeCriteria = {};
  if (document.getElementById('useInactive').checked) {
    timeCriteria.inactive = parseInt(document.getElementById('inactiveMinutes').value);
  }
  if (document.getElementById('useAge').checked) {
    timeCriteria.age = parseInt(document.getElementById('ageMinutes').value);
  }
  if (document.getElementById('useNotAccessed').checked) {
    timeCriteria.notAccessed = parseInt(document.getElementById('notAccessedMinutes').value);
  }
  
  // Add time criteria to conditions if any were set
  if (Object.keys(timeCriteria).length > 0) {
    conditions.timeCriteria = timeCriteria;
  }
  
  // Build trigger object
  const triggerType = document.getElementById('triggerType').value;
  const trigger = { type: triggerType };
  if (triggerType === 'periodic') {
    trigger.interval = parseInt(document.getElementById('intervalMinutes').value);
  }

  const rule = {
    id: editingRule?.id || `rule_${Date.now()}`,
    name,
    enabled,
    conditions,
    actions,
    priority,
    trigger
  };

  try {
    await sendMessage({ action: 'updateRule', rule });
    await loadRulesView();
    closeRuleModal();
    showNotification('Rule saved successfully');
  } catch (error) {
    console.error('Failed to save rule:', error);
    alert('Failed to save rule');
  }
}

async function toggleRule(ruleId) {
  try {
    await sendMessage({ action: 'toggleRule', ruleId });
    await loadRulesView();
  } catch (error) {
    console.error('Failed to toggle rule:', error);
  }
}

async function deleteRule(ruleId) {
  currentRules = currentRules.filter(r => r.id !== ruleId);

  try {
    await sendMessage({ action: 'updateRules', rules: currentRules });
    updateRulesUI();
    showNotification('Rule deleted successfully');
  } catch (error) {
    console.error('Failed to delete rule:', error);
  }
}

async function toggleAllRules(enabled) {
  for (const rule of currentRules) {
    rule.enabled = enabled;
  }

  try {
    await sendMessage({ action: 'updateRules', rules: currentRules });
    updateRulesUI();
    showNotification(enabled ? 'All rules enabled' : 'All rules disabled');
  } catch (error) {
    console.error('Failed to toggle all rules:', error);
  }
}

async function testRule(ruleId) {
  const rule = currentRules.find(r => r.id === ruleId);
  if (!rule) return;

  try {
    // Get preview of what would happen
    const result = await sendMessage({
      action: 'previewRule',
      ruleId: ruleId
    });

    if (result.matchingTabs && result.matchingTabs.length > 0) {
      const message = `Rule "${rule.name}" would affect ${result.matchingTabs.length} tab(s):\n\n` +
        result.matchingTabs.slice(0, 5).map(t => `• ${t.title}`).join('\n') +
        (result.matchingTabs.length > 5 ? `\n... and ${result.matchingTabs.length - 5} more` : '') +
        `\n\nAction: ${getActionDescription(rule.actions)}` +
        '\n\nDo you want to run this rule now?';

      if (confirm(message)) {
        await sendMessage({ action: 'executeRule', ruleId: ruleId });
        showNotification(`Rule "${rule.name}" executed successfully`);

        // Refresh the view to show any changes
        await loadRulesView();
      }
    } else {
      showNotification(`No tabs match the conditions for rule "${rule.name}"`, 'info');
    }
  } catch (error) {
    console.error('Failed to test rule:', error);
    showNotification('Failed to test rule', 'error');
  }
}

async function testAllRules() {
  try {
    // Get preview of all rules
    const result = await sendMessage({ action: 'previewAllRules' });

    let totalAffected = 0;
    let summary = 'Rules Preview:\n\n';

    for (const ruleResult of result.results) {
      if (ruleResult.matchingTabs.length > 0) {
        totalAffected += ruleResult.matchingTabs.length;
        summary += `• ${ruleResult.rule.name}: ${ruleResult.matchingTabs.length} tab(s)\n`;
      }
    }

    if (totalAffected === 0) {
      showNotification('No tabs match any rule conditions', 'info');
      return;
    }

    summary += `\nTotal tabs affected: ${totalAffected}\n\nRun all enabled rules now?`;

    if (confirm(summary)) {
      await sendMessage({ action: 'executeAllRules' });
      showNotification(`All rules executed successfully`);

      // Refresh the view
      await loadRulesView();
    }
  } catch (error) {
    console.error('Failed to test rules:', error);
    showNotification('Failed to test rules', 'error');
  }
}

function setupRuleDragAndDrop() {
  const rulesList = document.getElementById('rulesList');
  if (!rulesList) return;

  let draggedElement = null;
  let draggedOverElement = null;

  rulesList.addEventListener('dragstart', (e) => {
    const ruleCard = e.target.closest('.rule-card');
    if (!ruleCard) return;

    draggedElement = ruleCard;
    ruleCard.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  rulesList.addEventListener('dragend', (e) => {
    const ruleCard = e.target.closest('.rule-card');
    if (!ruleCard) return;

    ruleCard.classList.remove('dragging');
    draggedElement = null;

    // Clean up any remaining drag-over classes
    document.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });
  });

  rulesList.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const ruleCard = e.target.closest('.rule-card');
    if (!ruleCard || ruleCard === draggedElement) return;

    // Remove previous drag-over class
    if (draggedOverElement && draggedOverElement !== ruleCard) {
      draggedOverElement.classList.remove('drag-over');
    }

    draggedOverElement = ruleCard;

    // Determine if we should insert before or after
    const rect = ruleCard.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;

    if (e.clientY < midpoint) {
      ruleCard.classList.add('drag-over-top');
      ruleCard.classList.remove('drag-over-bottom');
    } else {
      ruleCard.classList.add('drag-over-bottom');
      ruleCard.classList.remove('drag-over-top');
    }
  });

  rulesList.addEventListener('dragleave', (e) => {
    const ruleCard = e.target.closest('.rule-card');
    if (!ruleCard) return;

    // Only remove classes if we're actually leaving the card
    if (!ruleCard.contains(e.relatedTarget)) {
      ruleCard.classList.remove('drag-over-top', 'drag-over-bottom');
    }
  });

  rulesList.addEventListener('drop', async (e) => {
    e.preventDefault();

    const targetCard = e.target.closest('.rule-card');
    if (!targetCard || !draggedElement || targetCard === draggedElement) return;

    // Clean up visual feedback
    targetCard.classList.remove('drag-over-top', 'drag-over-bottom');

    // Determine insert position
    const rect = targetCard.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const insertBefore = e.clientY < midpoint;

    // Reorder in DOM
    if (insertBefore) {
      rulesList.insertBefore(draggedElement, targetCard);
    } else {
      rulesList.insertBefore(draggedElement, targetCard.nextSibling);
    }

    // Update priorities based on new order
    await updateRulePriorities();
  });
}

async function updateRulePriorities() {
  const ruleCards = document.querySelectorAll('.rule-card');
  const updatedRules = [];

  // Update each rule's priority based on its position
  ruleCards.forEach((card, index) => {
    const ruleId = card.dataset.ruleId;
    const rule = currentRules.find(r => r.id === ruleId);
    if (rule) {
      rule.priority = index + 1;
      updatedRules.push(rule);
    }
  });

  // Update currentRules array to match the new order
  currentRules = updatedRules;

  try {
    // Save the new order to background
    await sendMessage({ action: 'updateRules', rules: currentRules });
    console.log('Rule order updated successfully');
  } catch (error) {
    console.error('Failed to update rule order:', error);
    showNotification('Failed to save rule order', 'error');
    // Reload to restore correct order
    await loadRulesView();
  }
}

function showNotification(message, type = 'success') {
  // Simple notification implementation
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${type === 'error' ? '#dc3545' : type === 'info' ? '#17a2b8' : '#28a745'};
    color: white;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
