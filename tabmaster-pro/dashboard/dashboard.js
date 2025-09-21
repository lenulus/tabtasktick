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

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  await initializeDashboard();
  setupEventListeners();
  setupNavigation();
  
  // Refresh data periodically
  setInterval(refreshData, 30000); // Every 30 seconds
});

async function initializeDashboard() {
  await loadOverviewData();
  initializeCharts();
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
  // Hide all views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  
  // Show selected view
  document.getElementById(view).classList.add('active');
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
  try {
    const stats = await sendMessage({ action: 'getStatistics' });
    const tabInfo = await sendMessage({ action: 'getTabInfo' });
    
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
    updateActivityChart();
    updateDomainsChart(stats.topDomains);
    
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
      <input type="checkbox" class="tab-checkbox" data-tab-id="${tab.id}">
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
      if (e.target.checked) {
        selectedTabs.add(tab.id);
        card.classList.add('selected');
      } else {
        selectedTabs.delete(tab.id);
        card.classList.remove('selected');
      }
      updateSelectedCount();
    });
    
    // Add click handler to open tab
    card.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-checkbox')) {
        chrome.tabs.update(tab.id, { active: true });
        chrome.windows.update(tab.windowId, { focused: true });
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
  // Initialize Chart.js charts
  const activityCtx = document.getElementById('activityChart');
  if (activityCtx) {
    charts.activity = new Chart(activityCtx.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: []
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }
  
  const domainsCtx = document.getElementById('domainsChart');
  if (domainsCtx) {
    charts.domains = new Chart(domainsCtx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: [],
        datasets: []
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
}

function updateActivityChart() {
  if (!charts.activity) return;
  
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
}

function updateDomainsChart(domains) {
  if (!charts.domains || !domains) return;
  
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
  
  // Bulk action buttons
  document.querySelectorAll('.bulk-action-btn').forEach(btn => {
    btn.addEventListener('click', () => executeBulkAction(btn.dataset.action));
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
  const tabIds = Array.from(selectedTabs);
  
  switch(action) {
    case 'close':
      await chrome.tabs.remove(tabIds);
      break;
    case 'snooze':
      // Would implement snooze for selected tabs
      break;
    case 'group':
      if (tabIds.length > 0) {
        await chrome.tabs.group({ tabIds });
      }
      break;
    case 'bookmark':
      // Would implement bookmark for selected tabs
      break;
  }
  
  selectedTabs.clear();
  closeBulkActionsModal();
  loadTabsView();
}

// ============================================================================
// Tab Management Functions
// ============================================================================

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
