// Popup JavaScript for TabMaster Pro

// ============================================================================
// DOM Elements
// ============================================================================

const elements = {
  // Statistics
  totalTabs: document.getElementById('totalTabs'),
  groupedTabs: document.getElementById('groupedTabs'),
  snoozedTabs: document.getElementById('snoozedTabs'),
  duplicates: document.getElementById('duplicates'),
  
  // Action Buttons
  closeDuplicates: document.getElementById('closeDuplicates'),
  groupByDomain: document.getElementById('groupByDomain'),
  snoozeCurrent: document.getElementById('snoozeCurrent'),
  suspendInactive: document.getElementById('suspendInactive'),
  
  // Sections
  snoozeOptions: document.getElementById('snoozeOptions'),
  rulesList: document.getElementById('rulesList'),
  domainsList: document.getElementById('domainsList'),
  snoozedList: document.getElementById('snoozedList'),
  snoozedSection: document.getElementById('snoozedSection'),
  snoozedCount: document.getElementById('snoozedCount'),
  
  // Header
  settingsBtn: document.getElementById('settingsBtn'),
  debugBtn: document.getElementById('debugBtn'),

  // Footer
  commandPalette: document.getElementById('commandPalette'),
  dashboard: document.getElementById('dashboard'),
  export: document.getElementById('export'),
  help: document.getElementById('help'),
  
  // Badge
  duplicateBadge: document.getElementById('duplicateBadge'),

  // Snoozed tabs
  wakeAllBtn: document.getElementById('wakeAllBtn'),
};

// ============================================================================
// Global Variables
// ============================================================================

let snoozeModal = null;
let currentTab = null;
let previewCard = null;

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  await loadStatistics();
  await loadRules();
  await loadSnoozedTabs();
  await loadCurrentTab();
  setupEventListeners();
  
  // Initialize snooze modal
  snoozeModal = new SnoozeModal();
  
  // Initialize Floating Action Button
  const fab = new FloatingActionButton(document.body);
  
  // Initialize preview card
  previewCard = new TabPreviewCard(document.body);
  window.previewCard = previewCard; // Make available globally for other components
  
  // Refresh data every 5 seconds
  setInterval(async () => {
    await loadStatistics();
    await loadSnoozedTabs();
  }, 5000);
});

// ============================================================================
// Data Loading Functions
// ============================================================================

async function loadCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
  } catch (error) {
    console.error('Failed to load current tab:', error);
  }
}

async function loadStatistics() {
  try {
    const stats = await sendMessage({ action: 'getStatistics' });
    
    // Update counts
    elements.totalTabs.textContent = stats.totalTabs;
    elements.groupedTabs.textContent = stats.groupedTabs;
    elements.snoozedTabs.textContent = stats.snoozedTabs;
    elements.duplicates.textContent = stats.duplicates;
    
    // Update duplicate badge
    if (stats.duplicates > 0) {
      elements.duplicateBadge.textContent = stats.duplicates;
      elements.duplicateBadge.classList.add('show');
    } else {
      elements.duplicateBadge.classList.remove('show');
    }
    
    // Update top domains
    updateDomainsList(stats.topDomains);
    
  } catch (error) {
    console.error('Failed to load statistics:', error);
    showNotification('Failed to load statistics', 'error');
  }
}

async function loadRules() {
  try {
    const rules = await sendMessage({ action: 'getRules' });
    updateRulesList(rules);
  } catch (error) {
    console.error('Failed to load rules:', error);
  }
}

async function loadSnoozedTabs() {
  try {
    const snoozedTabs = await sendMessage({ action: 'getSnoozedTabs' });
    updateSnoozedList(snoozedTabs);
  } catch (error) {
    console.error('Failed to load snoozed tabs:', error);
  }
}

// ============================================================================
// UI Update Functions
// ============================================================================

function updateRulesList(rules) {
  elements.rulesList.innerHTML = '';
  
  if (rules.length === 0) {
    elements.rulesList.innerHTML = `
      <div class="empty-state">
        <p>No active rules</p>
      </div>
    `;
    return;
  }
  
  rules.forEach(rule => {
    const ruleEl = document.createElement('div');
    ruleEl.className = `rule-item ${!rule.enabled ? 'disabled' : ''}`;
    ruleEl.innerHTML = `
      <div class="rule-name">
        <div class="rule-indicator ${!rule.enabled ? 'inactive' : ''}"></div>
        <span>${rule.name}</span>
      </div>
      <button class="rule-toggle" data-rule-id="${rule.id}" title="${rule.enabled ? 'Disable' : 'Enable'}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          ${rule.enabled ? 
            '<rect x="2" y="10" width="20" height="4" rx="2"></rect>' : 
            '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line>'}
        </svg>
      </button>
    `;
    
    // Add toggle event listener
    const toggleBtn = ruleEl.querySelector('.rule-toggle');
    toggleBtn.addEventListener('click', () => toggleRule(rule.id));
    
    elements.rulesList.appendChild(ruleEl);
  });
}

function updateDomainsList(domains) {
  elements.domainsList.innerHTML = '';
  
  if (!domains || domains.length === 0) {
    elements.domainsList.innerHTML = `
      <div class="empty-state">
        <p>No domains to display</p>
      </div>
    `;
    return;
  }
  
  domains.forEach(domain => {
    const domainEl = document.createElement('div');
    domainEl.className = 'domain-item';
    domainEl.innerHTML = `
      <span class="domain-name" title="${domain.domain}">${domain.domain}</span>
      <span class="domain-count">${domain.count}</span>
    `;
    elements.domainsList.appendChild(domainEl);
  });
}

function updateSnoozedList(snoozedTabs) {
  // Update count
  elements.snoozedCount.textContent = snoozedTabs.length;

  // Show/hide section and wake all button
  if (snoozedTabs.length === 0) {
    elements.snoozedSection.style.display = 'none';
    return;
  }

  elements.snoozedSection.style.display = 'block';

  // Show/hide wake all button
  if (elements.wakeAllBtn) {
    elements.wakeAllBtn.style.display = snoozedTabs.length > 0 ? 'flex' : 'none';
  }
  elements.snoozedList.innerHTML = '';
  
  // Sort by wake time (backend uses wakeTime, not snoozeUntil)
  snoozedTabs.sort((a, b) => (a.wakeTime || a.snoozeUntil || 0) - (b.wakeTime || b.snoozeUntil || 0));
  
  // Group tabs by time period
  const groups = groupSnoozedTabsByPeriod(snoozedTabs);
  
  groups.forEach(group => {
    // Add group header
    const groupHeader = document.createElement('div');
    groupHeader.className = 'snoozed-group-header';
    groupHeader.innerHTML = `
      <span class="group-title">${group.title}</span>
      <span class="group-count">(${group.tabs.length})</span>
    `;
    elements.snoozedList.appendChild(groupHeader);
    
    // Add tabs in group
    group.tabs.forEach(tab => {
      const tabEl = document.createElement('div');
      tabEl.className = 'snoozed-tab';
      
      const timeRemaining = getTimeRemaining(tab.wakeTime || tab.snoozeUntil);
      const favicon = tab.favicon || '../icons/icon-16.png';
      
      tabEl.innerHTML = `
        <img src="${favicon}" class="snoozed-favicon" onerror="this.src='../icons/icon-16.png'">
        <div class="snoozed-info">
          <div class="snoozed-title" title="${tab.title}">${tab.title}</div>
          <div class="snoozed-time">${timeRemaining}</div>
        </div>
        <div class="snoozed-actions">
          <button class="snoozed-action wake-btn" data-tab-id="${tab.id}" title="Wake now">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </button>
          <button class="snoozed-action reschedule-btn" data-tab-id="${tab.id}" title="Reschedule">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="1 4 1 10 7 10"></polyline>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            </svg>
          </button>
          <button class="snoozed-action delete-btn" data-tab-id="${tab.id}" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `;
      
      // Add action event listeners
      const wakeBtn = tabEl.querySelector('.wake-btn');
      const rescheduleBtn = tabEl.querySelector('.reschedule-btn');
      const deleteBtn = tabEl.querySelector('.delete-btn');

      wakeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        restoreSnoozedTab(tab.id || tab.url); // Use URL as fallback ID
      });

      rescheduleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        rescheduleSnoozedTab(tab);
      });

      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Delete snoozed tab "${tab.title}"?`)) {
          await deleteSnoozedTab(tab.id || tab.url);
        }
      });
      
      // Add preview hover handlers
      tabEl.addEventListener('mouseenter', () => {
        if (previewCard) {
          previewCard.show(tab.id, tabEl);
        }
      });
      
      tabEl.addEventListener('mouseleave', () => {
        if (previewCard) {
          previewCard.hide();
        }
      });
      
      elements.snoozedList.appendChild(tabEl);
    });
  });
}

function groupSnoozedTabsByPeriod(tabs) {
  const now = Date.now();
  const groups = {
    soon: { title: 'Next Hour', tabs: [] },
    today: { title: 'Today', tabs: [] },
    tomorrow: { title: 'Tomorrow', tabs: [] },
    later: { title: 'Later', tabs: [] }
  };
  
  tabs.forEach(tab => {
    const diff = (tab.wakeTime || tab.snoozeUntil || 0) - now;
    const hours = diff / (1000 * 60 * 60);
    
    if (hours <= 1) {
      groups.soon.tabs.push(tab);
    } else if (hours <= 24) {
      groups.today.tabs.push(tab);
    } else if (hours <= 48) {
      groups.tomorrow.tabs.push(tab);
    } else {
      groups.later.tabs.push(tab);
    }
  });
  
  // Return only non-empty groups
  return Object.values(groups).filter(g => g.tabs.length > 0);
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners() {
  // Quick Actions
  elements.closeDuplicates.addEventListener('click', handleCloseDuplicates);
  elements.groupByDomain.addEventListener('click', handleGroupByDomain);
  elements.snoozeCurrent.addEventListener('click', handleSnoozeCurrentToggle);
  elements.suspendInactive.addEventListener('click', handleSuspendInactive);
  
  // Header Actions
  elements.settingsBtn.addEventListener('click', openSettings);
  elements.debugBtn?.addEventListener('click', copyDebugInfo);

  // Snoozed tabs actions
  elements.wakeAllBtn?.addEventListener('click', handleWakeAll);

  // Footer Actions
  elements.commandPalette.addEventListener('click', openCommandPalette);
  elements.dashboard.addEventListener('click', openDashboard);
  elements.export.addEventListener('click', handleExport);
  elements.help.addEventListener('click', openHelp);
  
  // Test panel button
  document.getElementById('testPanel')?.addEventListener('click', async () => {
    try {
      // Get the current window ID
      const currentWindow = await chrome.windows.getCurrent();
      
      // Open side panel with proper options
      await chrome.sidePanel.open({ windowId: currentWindow.id });
      
      // Close popup after opening side panel
      window.close();
    } catch (error) {
      console.error('Failed to open test panel:', error);
      // Fallback: try without options
      try {
        await chrome.sidePanel.open({});
        window.close();
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
      }
    }
  });
}

// ============================================================================
// Action Handlers
// ============================================================================

async function handleCloseDuplicates() {
  try {
    const button = elements.closeDuplicates;
    button.disabled = true;
    
    const count = await sendMessage({ action: 'closeDuplicates' });
    
    if (count > 0) {
      showNotification(`Closed ${count} duplicate tab${count > 1 ? 's' : ''}`, 'success');
    } else {
      showNotification('No duplicate tabs found', 'info');
    }
    
    await loadStatistics();
  } catch (error) {
    console.error('Failed to close duplicates:', error);
    showNotification('Failed to close duplicates', 'error');
  } finally {
    elements.closeDuplicates.disabled = false;
  }
}

async function handleGroupByDomain() {
  try {
    const button = elements.groupByDomain;
    button.disabled = true;
    
    const count = await sendMessage({ action: 'groupByDomain' });
    
    if (count > 0) {
      showNotification(`Created ${count} group${count > 1 ? 's' : ''}`, 'success');
    } else {
      showNotification('No tabs to group', 'info');
    }
    
    await loadStatistics();
  } catch (error) {
    console.error('Failed to group tabs:', error);
    showNotification('Failed to group tabs', 'error');
  } finally {
    elements.groupByDomain.disabled = false;
  }
}

function handleSnoozeCurrentToggle() {
  // Check if bulk selection is active
  const selectedTabs = getSelectedTabs();
  
  if (selectedTabs.length > 0) {
    // Bulk snooze
    snoozeModal.show(selectedTabs);
  } else if (currentTab) {
    // Single tab snooze
    snoozeModal.show([currentTab]);
  }
  
  // Set up modal callbacks
  snoozeModal.onSnooze = async (snoozeData) => {
    await handleSnoozeTabs(snoozeData);
  };
  
  snoozeModal.onCancel = () => {
    // Modal handles its own cleanup
  };
}

async function handleSnoozeTabs(snoozeData) {
  try {
    const { timestamp, presetId, tabIds, tabCount } = snoozeData;
    const minutes = Math.floor((timestamp - Date.now()) / 60000);
    
    if (tabIds.length === 1 && tabIds[0] === currentTab?.id) {
      // Single current tab
      await sendMessage({ action: 'snoozeCurrent', minutes });
    } else {
      // Multiple tabs or specific tabs
      await sendMessage({ action: 'snoozeTabs', tabIds, minutes });
    }
    
    const tabText = tabCount === 1 ? 'Tab' : `${tabCount} tabs`;
    showNotification(`${tabText} snoozed for ${getReadableDuration(minutes)}`, 'success');
    
    // Clear selection if bulk snooze
    if (tabCount > 1) {
      clearSelection();
    }
    
    // Refresh statistics
    await loadStatistics();
    await loadSnoozedTabs();
    
    // Close popup after single tab snooze
    if (tabCount === 1 && tabIds[0] === currentTab?.id) {
      setTimeout(() => window.close(), 1000);
    }
  } catch (error) {
    console.error('Failed to snooze tabs:', error);
    showNotification('Failed to snooze tabs', 'error');
  }
}

async function rescheduleSnoozedTab(tab) {
  // Show modal for rescheduling
  snoozeModal.show([tab]);

  snoozeModal.onSnooze = async (snoozeData) => {
    try {
      // First remove the tab without opening it
      const tabId = tab.id || tab.url; // Use URL as fallback ID
      await sendMessage({ action: 'removeSnoozedTab', tabId });

      // Then create new snoozed entry with new time
      const newSnoozedTab = {
        ...tab,
        id: tab.id || Math.random().toString(36).substr(2, 9), // Ensure it has an ID
        wakeTime: snoozeData.timestamp,
        snoozeReason: snoozeData.presetId || 'custom'
      };

      await sendMessage({ action: 'addSnoozedTab', tab: newSnoozedTab });

      showNotification('Tab rescheduled', 'success');
      await loadSnoozedTabs();
    } catch (error) {
      console.error('Failed to reschedule tab:', error);
      showNotification('Failed to reschedule tab', 'error');
    }
  };
}

function getSelectedTabs() {
  // Check if we're in the dashboard context with bulk selection
  // For the popup, we'll only handle the current tab
  // The dashboard handles bulk selection through its own implementation
  return [];
}

function clearSelection() {
  // Not needed in popup context
  // Dashboard handles its own selection clearing
}

async function handleWakeAll() {
  try {
    const result = await sendMessage({ action: 'wakeAllSnoozed' });
    const count = result.count || 0;

    if (count > 0) {
      showNotification(`Restored ${count} snoozed tab${count === 1 ? '' : 's'}`, 'success');
      // Refresh the snoozed tabs list
      await loadSnoozedTabs();
      await loadStatistics();
    } else {
      showNotification('No snoozed tabs to restore', 'info');
    }
  } catch (error) {
    console.error('Failed to wake all snoozed tabs:', error);
    showNotification('Failed to wake snoozed tabs', 'error');
  }
}

async function handleSuspendInactive() {
  try {
    const button = elements.suspendInactive;
    button.disabled = true;
    
    // Get inactive tabs (simplified version)
    const tabs = await chrome.tabs.query({ active: false, currentWindow: true });
    const inactiveTabs = tabs.filter(tab => !tab.pinned);
    
    if (inactiveTabs.length === 0) {
      showNotification('No inactive tabs to suspend', 'info');
      return;
    }
    
    // Discard inactive tabs
    for (const tab of inactiveTabs) {
      try {
        await chrome.tabs.discard(tab.id);
      } catch (error) {
        console.error(`Failed to discard tab ${tab.id}:`, error);
      }
    }
    
    showNotification(`Suspended ${inactiveTabs.length} inactive tab${inactiveTabs.length > 1 ? 's' : ''}`, 'success');
    await loadStatistics();
  } catch (error) {
    console.error('Failed to suspend tabs:', error);
    showNotification('Failed to suspend tabs', 'error');
  } finally {
    elements.suspendInactive.disabled = false;
  }
}

async function toggleRule(ruleId) {
  try {
    await sendMessage({ action: 'toggleRule', ruleId });
    await loadRules();
    showNotification('Rule updated', 'success');
  } catch (error) {
    console.error('Failed to toggle rule:', error);
    showNotification('Failed to update rule', 'error');
  }
}

async function restoreSnoozedTab(tabId) {
  try {
    console.log('Attempting to restore snoozed tab:', tabId);
    const response = await sendMessage({ action: 'restoreSnoozedTab', tabId });
    console.log('Restore response:', response);

    if (response && response.success) {
      await loadSnoozedTabs();
      showNotification('Tab restored', 'success');
    } else {
      console.error('Restore failed:', response);
      showNotification(`Failed to restore tab: ${response?.error || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    console.error('Failed to restore tab:', error);
    showNotification('Failed to restore tab', 'error');
  }
}

async function deleteSnoozedTab(tabId) {
  try {
    console.log('Attempting to delete snoozed tab:', tabId);
    const response = await sendMessage({ action: 'deleteSnoozedTab', tabId });
    console.log('Delete response:', response);

    if (response && response.success) {
      await loadSnoozedTabs();
      showNotification('Snoozed tab deleted', 'success');
    } else {
      console.error('Delete failed:', response);
      showNotification(`Failed to delete tab: ${response?.error || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    console.error('Failed to delete tab:', error);
    showNotification('Failed to delete tab', 'error');
  }
}

// ============================================================================
// Debug Information
// ============================================================================

async function copyDebugInfo() {
  try {
    // Collect all debug information
    const debugInfo = {
      timestamp: new Date().toISOString(),
      browser: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        manifest: chrome.runtime.getManifest()
      },
      permissions: {},
      state: {},
      errors: [],
      diagnostics: {}
    };

    // Check permissions
    try {
      const permissions = await chrome.permissions.getAll();
      debugInfo.permissions = permissions;
    } catch (e) {
      debugInfo.errors.push({ context: 'permissions', error: e.message });
    }

    // Get snoozed tabs with full details
    try {
      const snoozedTabs = await sendMessage({ action: 'getSnoozedTabs' });
      debugInfo.state.snoozedTabs = {
        count: snoozedTabs?.length || 0,
        tabs: snoozedTabs?.map(tab => ({
          id: tab.id,
          url: tab.url,
          title: tab.title,
          wakeTime: tab.wakeTime,
          snoozeUntil: tab.snoozeUntil,
          wakeInto: tab.wakeInto,
          snoozeReason: tab.snoozeReason,
          favicon: tab.favicon || tab.favIconUrl,
          hasId: !!tab.id,
          hasWakeTime: !!tab.wakeTime,
          hasSnoozeUntil: !!tab.snoozeUntil,
          wakeTimeDate: tab.wakeTime ? new Date(tab.wakeTime).toISOString() : null,
          snoozeUntilDate: tab.snoozeUntil ? new Date(tab.snoozeUntil).toISOString() : null,
          isOverdue: tab.wakeTime ? tab.wakeTime < Date.now() : false
        }))
      };
    } catch (e) {
      debugInfo.errors.push({ context: 'getSnoozedTabs', error: e.message, stack: e.stack });
    }

    // Get current tabs with details
    try {
      const tabs = await chrome.tabs.query({});
      const windows = await chrome.windows.getAll();
      const groups = await chrome.tabGroups?.query({}) || [];

      debugInfo.state.tabs = {
        total: tabs.length,
        byWindow: tabs.reduce((acc, tab) => {
          acc[tab.windowId] = (acc[tab.windowId] || 0) + 1;
          return acc;
        }, {}),
        byStatus: {
          active: tabs.filter(t => t.active).length,
          pinned: tabs.filter(t => t.pinned).length,
          muted: tabs.filter(t => t.mutedInfo?.muted).length,
          discarded: tabs.filter(t => t.discarded).length,
          audible: tabs.filter(t => t.audible).length,
          grouped: tabs.filter(t => t.groupId !== -1).length
        },
        windows: windows.map(w => ({
          id: w.id,
          type: w.type,
          state: w.state,
          focused: w.focused,
          tabsCount: w.tabs?.length
        })),
        groups: groups.map(g => ({
          id: g.id,
          title: g.title,
          color: g.color,
          collapsed: g.collapsed,
          windowId: g.windowId
        })),
        duplicates: await getDuplicateTabsCount(tabs)
      };
    } catch (e) {
      debugInfo.errors.push({ context: 'chrome.tabs.query', error: e.message, stack: e.stack });
    }

    // Get storage data with sizes
    try {
      const storage = await chrome.storage.local.get(null);
      debugInfo.state.storage = {
        keys: Object.keys(storage),
        sizes: {},
        rules: {
          count: storage.rules?.length || 0,
          enabled: storage.rules?.filter(r => r.enabled).length || 0,
          withTriggers: storage.rules?.filter(r => r.trigger).length || 0
        },
        snoozedTabsInStorage: storage.snoozedTabs?.length || 0,
        activityLog: storage.activityLog?.length || 0,
        statistics: storage.statistics,
        settings: storage.settings,
        testModeActive: storage.testModeActive || false,
        scheduledTriggers: storage.scheduledTriggers?.length || 0
      };

      // Calculate approximate sizes
      for (const key of Object.keys(storage)) {
        try {
          debugInfo.state.storage.sizes[key] = JSON.stringify(storage[key]).length;
        } catch (e) {
          debugInfo.state.storage.sizes[key] = 'Error calculating size';
        }
      }

      // Get total storage usage
      if (chrome.storage.local.getBytesInUse) {
        debugInfo.state.storage.totalBytes = await chrome.storage.local.getBytesInUse();
        debugInfo.state.storage.quotaBytes = chrome.storage.local.QUOTA_BYTES;
        debugInfo.state.storage.usagePercent = ((debugInfo.state.storage.totalBytes / chrome.storage.local.QUOTA_BYTES) * 100).toFixed(2) + '%';
      }
    } catch (e) {
      debugInfo.errors.push({ context: 'chrome.storage.local', error: e.message, stack: e.stack });
    }

    // Test various message handlers
    debugInfo.diagnostics.messageTests = {};

    // Test ping
    try {
      const pingStart = Date.now();
      const testResult = await sendMessage({ action: 'ping' });
      debugInfo.diagnostics.messageTests.ping = {
        success: !!testResult,
        responseTime: Date.now() - pingStart,
        response: testResult
      };
    } catch (e) {
      debugInfo.diagnostics.messageTests.ping = { error: e.message };
    }

    // Test getRules
    try {
      const rulesResult = await sendMessage({ action: 'getRules' });
      debugInfo.diagnostics.messageTests.getRules = {
        success: true,
        count: rulesResult?.length || 0
      };
    } catch (e) {
      debugInfo.diagnostics.messageTests.getRules = { error: e.message };
    }

    // Test getStatistics
    try {
      const statsResult = await sendMessage({ action: 'getStatistics' });
      debugInfo.diagnostics.messageTests.getStatistics = {
        success: true,
        hasData: !!statsResult
      };
    } catch (e) {
      debugInfo.diagnostics.messageTests.getStatistics = { error: e.message };
    }

    // Check for alarms
    try {
      const alarms = await chrome.alarms.getAll();
      debugInfo.state.alarms = alarms.map(a => ({
        name: a.name,
        scheduledTime: new Date(a.scheduledTime).toISOString(),
        periodInMinutes: a.periodInMinutes
      }));
    } catch (e) {
      debugInfo.errors.push({ context: 'chrome.alarms', error: e.message });
    }

    // Get recent console errors from background
    try {
      const logsResult = await sendMessage({ action: 'getRecentLogs' });
      debugInfo.diagnostics.recentBackgroundLogs = logsResult?.logs || [];
    } catch (e) {
      // Background might not have this handler, which is OK
      debugInfo.diagnostics.recentBackgroundLogs = 'Not available';
    }


    // Format as JSON
    const debugText = JSON.stringify(debugInfo, null, 2);

    // Copy to clipboard
    await navigator.clipboard.writeText(debugText);

    showNotification('Debug info copied to clipboard', 'success');
    console.log('Debug info:', debugInfo);

  } catch (error) {
    console.error('Failed to collect debug info:', error);
    showNotification('Failed to copy debug info', 'error');
  }
}

// Helper function to count duplicate tabs
async function getDuplicateTabsCount(tabs) {
  const urlCounts = {};
  let duplicates = 0;

  for (const tab of tabs) {
    if (!tab.url || tab.pinned) continue;
    const normalizedUrl = tab.url.replace(/\/$/, '').split('#')[0];
    urlCounts[normalizedUrl] = (urlCounts[normalizedUrl] || 0) + 1;
  }

  for (const count of Object.values(urlCounts)) {
    if (count > 1) duplicates += (count - 1);
  }

  return duplicates;
}

// ============================================================================
// Settings and Navigation
// ============================================================================

function openSettings() {
  chrome.runtime.openOptionsPage();
}

function openDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
}

function openCommandPalette() {
  // Send message to background to open command palette
  chrome.runtime.sendMessage({ action: 'openCommandPalette' });
  window.close();
}

async function handleExport() {
  try {
    // Show what's being exported
    showNotification('Exporting tabs, settings, and rules...', 'info');
    
    const data = await sendMessage({ action: 'exportData' });
    
    // Create download
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const filename = `tabmaster-export-${new Date().toISOString().split('T')[0]}.json`;
    
    await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    });
    
    // Show summary of what was exported
    const summary = [];
    if (data.currentSession) {
      summary.push(`${data.currentSession.tabCount} tabs`);
    }
    if (data.extension.rules) {
      summary.push(`${data.extension.rules.length} rules`);
    }
    if (data.extension.snoozedTabs) {
      summary.push(`${data.extension.snoozedTabs.length} snoozed tabs`);
    }
    
    showNotification(`Exported: ${summary.join(', ')}`, 'success');
  } catch (error) {
    console.error('Failed to export data:', error);
    showNotification('Export failed: ' + (error.message || 'Unknown error'), 'error');
  }
}

function openHelp() {
  chrome.tabs.create({ url: 'https://github.com/yourusername/tabmaster-pro/wiki' });
}

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

function getTimeRemaining(timestamp) {
  const now = Date.now();
  const diff = timestamp - now;
  
  if (diff <= 0) return 'now';
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}

function getReadableDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}

function showNotification(message, type = 'info') {
  // Remove existing notifications
  const existing = document.querySelector('.notification');
  if (existing) {
    existing.remove();
  }
  
  // Create new notification
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Expose globally for FAB component
window.showNotification = showNotification;

// ============================================================================
// Error Handling
// ============================================================================

window.addEventListener('error', (event) => {
  console.error('Popup error:', event.error);
  showNotification('An error occurred', 'error');
});
