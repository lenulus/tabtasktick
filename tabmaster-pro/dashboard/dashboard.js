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
    
    document.getElementById('statMemory').textContent = `${stats.memoryEstimate.estimatedMB} MB`;
    document.getElementById('statMemoryPercent').textContent = `${Math.round(stats.memoryEstimate.percentage)}% of limit`;
    
    // Update charts with sample data
    console.log('Calling chart updates...');
    updateActivityChart();
    updateDomainsChart(stats.topDomains);
    console.log('Chart updates called');
    
    // Update recent activity
    updateRecentActivity();
    
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

function updateRecentActivity() {
  const activities = [
    { icon: 'close', color: '#e74c3c', text: 'Closed 5 duplicate tabs', time: '2 minutes ago' },
    { icon: 'group', color: '#667eea', text: 'Created group "Development"', time: '15 minutes ago' },
    { icon: 'snooze', color: '#4facfe', text: 'Snoozed 3 tabs', time: '1 hour ago' },
    { icon: 'rule', color: '#28a745', text: 'Rule "Clean Stack Overflow" triggered', time: '2 hours ago' },
  ];
  
  const container = document.getElementById('recentActivity');
  container.innerHTML = '';
  
  activities.forEach(activity => {
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

async function loadTabsView() {
  try {
    const tabs = await chrome.tabs.query({});
    tabsData = tabs;
    renderTabs(tabs);
  } catch (error) {
    console.error('Failed to load tabs:', error);
  }
}

function renderTabs(tabs) {
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
    
    const badges = [];
    if (tab.pinned) badges.push('<span class="tab-badge pinned">Pinned</span>');
    if (tab.audible) badges.push('<span class="tab-badge audible">Playing</span>');
    
    card.innerHTML = `
      <label class="tab-select-wrapper">
        <input type="checkbox" class="tab-checkbox" data-tab-id="${tab.id}">
        <span class="tab-select-indicator"></span>
      </label>
      <div class="tab-header">
        <img src="${tab.favIconUrl || '../icons/icon-16.png'}" class="tab-favicon" onerror="this.src='../icons/icon-16.png'">
        <div class="tab-title" title="${tab.title}">${tab.title}</div>
      </div>
      <div class="tab-url" title="${tab.url}">${new URL(tab.url).hostname}</div>
      ${badges.length > 0 ? `<div class="tab-badges">${badges.join('')}</div>` : ''}
    `;
    
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
      if (!e.target.classList.contains('tab-checkbox')) {
        chrome.tabs.update(tab.id, { active: true });
        chrome.windows.update(tab.windowId, { focused: true });
      }
    });
    
    // Add preview hover handlers
    card.addEventListener('mouseenter', () => {
      if (previewCard) {
        // Pass the element first, then the tab object
        previewCard.show(card, tab);
      }
    });
    
    card.addEventListener('mouseleave', () => {
      if (previewCard) {
        previewCard.hide();
      }
    });
    
    grid.appendChild(card);
  });
}

function filterTabs() {
  const searchTerm = document.getElementById('searchTabs').value.toLowerCase();
  const filterType = document.getElementById('filterTabs').value;
  
  let filtered = tabsData;
  
  // Apply search filter
  if (searchTerm) {
    filtered = filtered.filter(tab => 
      tab.title.toLowerCase().includes(searchTerm) ||
      tab.url.toLowerCase().includes(searchTerm)
    );
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
  
  renderTabs(filtered);
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
        <button class="btn btn-primary" onclick="autoGroupTabs()">Auto-Group Tabs</button>
      </div>
    `;
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
          <button class="group-action-btn" onclick="collapseGroup(${group.id})">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <button class="group-action-btn" onclick="closeGroup(${group.id})">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="group-tabs ${group.collapsed ? 'collapsed' : ''}">
        ${group.tabs.map(tab => `
          <div class="tab-card">
            <div class="tab-header">
              <img src="${tab.favIconUrl || '../icons/icon-16.png'}" class="tab-favicon">
              <div class="tab-title">${tab.title}</div>
            </div>
          </div>
        `).join('')}
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
  // This would load actual history from storage
  const sampleHistory = [
    {
      date: 'Today',
      items: [
        { action: 'Closed', count: 5, description: 'duplicate tabs' },
        { action: 'Snoozed', count: 3, description: 'news articles' },
        { action: 'Grouped', count: 8, description: 'GitHub tabs' }
      ]
    },
    {
      date: 'Yesterday',
      items: [
        { action: 'Closed', count: 12, description: 'Stack Overflow tabs' },
        { action: 'Created', count: 2, description: 'new groups' }
      ]
    }
  ];
  
  renderHistory(sampleHistory);
}

function renderHistory(history) {
  const container = document.getElementById('historyContainer');
  container.innerHTML = '';
  
  history.forEach(day => {
    const dayCard = document.createElement('div');
    dayCard.className = 'history-day';
    
    dayCard.innerHTML = `
      <h3>${day.date}</h3>
      <div class="history-items">
        ${day.items.map(item => `
          <div class="history-item">
            <div class="history-action">${item.action}</div>
            <div>${item.count} ${item.description}</div>
          </div>
        `).join('')}
      </div>
    `;
    
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
  
  // Search and filter
  document.getElementById('searchTabs')?.addEventListener('input', filterTabs);
  document.getElementById('filterTabs')?.addEventListener('change', filterTabs);
  
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
