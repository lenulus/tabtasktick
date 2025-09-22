// Dashboard JavaScript for TabMaster Pro

// ============================================================================
// State Management
// ============================================================================

let currentView = 'overview';
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
  // Wait for Chart.js to be available
  await waitForChartJS();
  initializeCharts();
  await loadOverviewData();
}

async function waitForChartJS(maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    if (typeof Chart !== 'undefined') {
      console.log('Chart.js loaded');
      return;
    }
    console.log(`Waiting for Chart.js... attempt ${i + 1}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  console.warn('Chart.js failed to load after maximum attempts');
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
    case 'analytics':
      loadAnalyticsView();
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

function getActivityIcon(type) {
  const icons = {
    close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    group: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>',
    snooze: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
    rule: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"></path></svg>',
  };
  return icons[type] || '';
}

// ============================================================================
// Tabs View
// ============================================================================

// Helper to generate a window signature based on its tabs
function getWindowSignature(tabs) {
  // Create a signature from the first few pinned/important tabs
  const pinnedUrls = tabs
    .filter(t => t.pinned)
    .slice(0, 3)
    .map(t => new URL(t.url).hostname)
    .sort()
    .join('|');
  
  const topDomains = tabs
    .slice(0, 5)
    .map(t => new URL(t.url).hostname)
    .sort()
    .join('|');
    
  return pinnedUrls || topDomains;
}

async function loadTabsView() {
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
    const generateWindowColor = (index, total) => {
      const hue = (index * 360 / Math.max(8, total)) % 360;
      const saturation = 60 + (index % 3) * 15; // Vary saturation between 60-90%
      const lightness = 50 + (index % 2) * 10; // Vary lightness between 50-60%
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    };
    
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

function getTabState(tab) {
  if (tab.discarded) return '💤 Suspended';
  if (tab.active) return '👁 Active';
  if (tab.audible) return '🔊 Playing';
  if (tab.pinned) return '📌 Pinned';
  return 'Loaded';
}

function getLastAccessText(tab) {
  if (tab.active) return 'Now';
  if (!tab.lastAccessed) return 'Unknown';
  
  const now = Date.now();
  const diff = now - tab.lastAccessed;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
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
    const getFaviconUrl = (url) => {
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
    
    const safeFaviconUrl = getFaviconUrl(tab.favIconUrl);
    
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

function getGroupColor(chromeColor) {
  const colors = {
    'grey': '#5f6368',
    'blue': '#1a73e8',
    'red': '#d93025',
    'yellow': '#f9ab00',
    'green': '#188038',
    'pink': '#e91e63',
    'purple': '#9c27b0',
    'cyan': '#00acc1',
    'orange': '#ff6d00'
  };
  return colors[chromeColor] || '#5f6368';
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

function createTreeTab(tab) {
  const tabEl = document.createElement('div');
  tabEl.className = 'tree-tab';
  if (selectionState.selectedTabs.has(tab.id)) {
    tabEl.classList.add('selected');
  }
  
  const badges = [];
  if (tab.pinned) badges.push('<span class="tree-tab-badge pinned">Pin</span>');
  if (tab.audible) badges.push('<span class="tree-tab-badge audible">Audio</span>');
  
  // Filter out invalid favicon URLs
  const getFaviconUrl = (url) => {
    if (!url) return '../icons/icon-16.png';
    if (url.startsWith('chrome-extension://') && !url.includes(chrome.runtime.id)) {
      return '../icons/icon-16.png';
    }
    if (url === 'chrome-extension://invalid/') {
      return '../icons/icon-16.png';
    }
    return url;
  };
  
  const safeFaviconUrl = getFaviconUrl(tab.favIconUrl);
  
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
    case 'pinned':
      filtered = filtered.filter(tab => tab.pinned);
      break;
    case 'audible':
      filtered = filtered.filter(tab => tab.audible);
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
  
  // Helper function for color generation
  function generateWindowColor(index, total) {
    const hue = (index * 360 / Math.max(8, total)) % 360;
    const saturation = 60 + (index % 3) * 15;
    const lightness = 50 + (index % 2) * 10;
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }
  
  // Add event handlers
  document.getElementById('cancelRename').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  document.getElementById('saveRename').addEventListener('click', async () => {
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

async function loadAnalyticsView() {
  // Load analytics data
  const stats = await sendMessage({ action: 'getStatistics' });
  
  // Update metrics
  document.getElementById('avgTabs').textContent = Math.round(stats.totalTabs);
  document.getElementById('peakTabs').textContent = stats.totalTabs; // Would need tracking
  document.getElementById('tabsClosed').textContent = stats.statistics.tabsClosed;
  document.getElementById('timeSaved').textContent = '2.5 hrs'; // Would need calculation
  
  // Update charts
  updatePatternsChart();
  updateMemoryTrendChart();
  updateDomainDistChart(stats.topDomains);
  
  // Generate insights
  generateInsights(stats);
}

function generateInsights(stats) {
  const insights = [];
  
  if (stats.totalTabs > 50) {
    insights.push({
      type: 'warning',
      text: 'You have over 50 tabs open. Consider using auto-grouping to organize them better.'
    });
  }
  
  if (stats.duplicates > 5) {
    insights.push({
      type: 'tip',
      text: `Found ${stats.duplicates} duplicate tabs. Enable auto-close duplicates to save memory.`
    });
  }
  
  if (stats.memoryEstimate.percentage > 70) {
    insights.push({
      type: 'warning',
      text: 'High memory usage detected. Consider suspending inactive tabs.'
    });
  }
  
  insights.push({
    type: 'success',
    text: `You've saved ${stats.statistics.tabsClosed} tabs from cluttering your browser!`
  });
  
  renderInsights(insights);
}

function renderInsights(insights) {
  const container = document.getElementById('insightsList');
  container.innerHTML = '';
  
  insights.forEach(insight => {
    const item = document.createElement('div');
    item.className = 'insight-item';
    
    const icon = insight.type === 'warning' ? '⚠️' : insight.type === 'tip' ? '💡' : '✅';
    
    item.innerHTML = `
      <div class="insight-icon ${insight.type}">${icon}</div>
      <div class="insight-content">${insight.text}</div>
    `;
    
    container.appendChild(item);
  });
}

// ============================================================================
// Charts
// ============================================================================

function initializeCharts() {
  // Check if Chart.js is loaded
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded, skipping chart initialization');
    return;
  }
  
  // Only initialize if charts don't exist
  if (charts.activity || charts.domains) {
    console.log('Charts already initialized, skipping');
    return;
  }
  
  // Initialize Chart.js charts
  const activityCtx = document.getElementById('activityChart');
  if (activityCtx) {
    try {
      charts.activity = new Chart(activityCtx.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: []
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        aspectRatio: 2,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        },
        layout: {
          padding: {
            top: 10,
            bottom: 10
          }
        }
      }
    });
    } catch (error) {
      console.error('Failed to initialize activity chart:', error);
    }
  }
  
  const domainsCtx = document.getElementById('domainsChart');
  if (domainsCtx) {
    try {
      charts.domains = new Chart(domainsCtx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: [],
        datasets: []
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        aspectRatio: 1.5,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 10,
              font: {
                size: 12
              }
            }
          }
        },
        layout: {
          padding: {
            top: 10,
            bottom: 10
          }
        }
      }
    });
    } catch (error) {
      console.error('Failed to initialize domains chart:', error);
    }
  }
}

function updateActivityChart() {
  console.log('Updating activity chart...', { chart: !!charts.activity, chartJS: typeof Chart !== 'undefined' });
  if (!charts.activity || typeof Chart === 'undefined') return;
  
  try {
    // Sample data - would be real tracking data
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const data = [45, 52, 38, 65, 48, 35, 40];
    
    charts.activity.data = {
      labels: labels,
      datasets: [{
        label: 'Tabs',
        data: data,
        borderColor: '#667eea',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        tension: 0.4
      }]
    };
    
    charts.activity.update();
    console.log('Activity chart updated successfully');
  } catch (error) {
    console.error('Failed to update activity chart:', error);
  }
}

function updateDomainsChart(domains) {
  console.log('Updating domains chart...', { chart: !!charts.domains, domains: domains?.length || 0 });
  if (!charts.domains || typeof Chart === 'undefined') return;
  
  // Handle empty or missing data
  if (!domains || domains.length === 0) {
    console.log('No domain data available');
    domains = [{ domain: 'No data', count: 1 }];
  }
  
  try {
    const labels = domains.map(d => d.domain);
    const data = domains.map(d => d.count);
    const colors = [
      '#667eea',
      '#764ba2',
      '#f093fb',
      '#f5576c',
      '#4facfe'
    ];
    
    charts.domains.data = {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderWidth: 0
      }]
    };
    
    charts.domains.update();
    console.log('Domains chart updated successfully');
  } catch (error) {
    console.error('Failed to update domains chart:', error);
  }
}

function updatePatternsChart() {
  // Would implement patterns chart
}

function updateMemoryTrendChart() {
  // Would implement memory trend chart
}

function updateDomainDistChart(domains) {
  // Would implement domain distribution chart
}

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
  const allTabCards = document.querySelectorAll('.tab-card');
  
  allTabCards.forEach(card => {
    const checkbox = card.querySelector('.tab-checkbox');
    card.classList.remove('selected');
    checkbox.checked = false;
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
  document.getElementById('openSettings').addEventListener('click', () => {
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
  
  // Check if confirmation needed
  if (count > 10 && (action === 'close' || action === 'move')) {
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
        await moveToWindow(selectedIds);
        showNotification(`Moved ${count} tabs to new window`, 'success');
        break;
    }
    
    // Clear selection after success
    clearSelection();
    
    // Refresh the view
    if (action !== 'snooze') { // Snooze has its own dialog
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

async function moveToWindow(tabIds) {
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
    document.getElementById('confirmCancel').addEventListener('click', handleCancel, { once: true });
    
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
