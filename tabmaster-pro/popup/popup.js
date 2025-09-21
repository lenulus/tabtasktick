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
  memoryValue: document.getElementById('memoryValue'),
  memoryFill: document.getElementById('memoryFill'),
  
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
  
  // Footer
  settingsBtn: document.getElementById('settingsBtn'),
  commandPalette: document.getElementById('commandPalette'),
  dashboard: document.getElementById('dashboard'),
  export: document.getElementById('export'),
  help: document.getElementById('help'),
  
  // Badge
  duplicateBadge: document.getElementById('duplicateBadge'),
};

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  await loadStatistics();
  await loadRules();
  await loadSnoozedTabs();
  setupEventListeners();
  
  // Refresh data every 5 seconds
  setInterval(async () => {
    await loadStatistics();
    await loadSnoozedTabs();
  }, 5000);
});

// ============================================================================
// Data Loading Functions
// ============================================================================

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
    
    // Update memory usage
    const memory = stats.memoryEstimate;
    if (memory.isRealData) {
      // Show real system memory data
      elements.memoryValue.textContent = `${memory.estimatedMB} MB (System: ${memory.percentage}%)`;
      elements.memoryFill.style.width = `${memory.percentage}%`;
      
      // Add title tooltip with more details
      elements.memoryFill.parentElement.title = `Chrome: ~${memory.estimatedMB}MB\nSystem: ${memory.totalSystemGB}GB total, ${memory.availableSystemGB}GB free\nPer tab: ~${memory.perTabMB}MB`;
    } else {
      // Show estimation
      elements.memoryValue.textContent = `~${memory.estimatedMB} MB (est.)`;
      elements.memoryFill.style.width = `${memory.percentage}%`;
      elements.memoryFill.parentElement.title = `Estimated based on ${stats.totalTabs} tabs\nPer tab: ~${memory.perTabMB}MB`;
    }
    
    if (memory.percentage > 80) {
      elements.memoryFill.classList.add('warning');
    } else if (memory.percentage > 60) {
      elements.memoryFill.classList.add('caution');
    } else {
      elements.memoryFill.classList.remove('warning', 'caution');
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
  
  // Show/hide section
  if (snoozedTabs.length === 0) {
    elements.snoozedSection.style.display = 'none';
    return;
  }
  
  elements.snoozedSection.style.display = 'block';
  elements.snoozedList.innerHTML = '';
  
  // Sort by snooze time
  snoozedTabs.sort((a, b) => a.snoozeUntil - b.snoozeUntil);
  
  snoozedTabs.forEach(tab => {
    const tabEl = document.createElement('div');
    tabEl.className = 'snoozed-tab';
    
    const timeRemaining = getTimeRemaining(tab.snoozeUntil);
    const favicon = tab.favicon || '../icons/icon-16.png';
    
    tabEl.innerHTML = `
      <img src="${favicon}" class="snoozed-favicon" onerror="this.src='../icons/icon-16.png'">
      <div class="snoozed-info">
        <div class="snoozed-title" title="${tab.title}">${tab.title}</div>
        <div class="snoozed-time">Opens in ${timeRemaining}</div>
      </div>
    `;
    
    // Add click event to restore immediately
    tabEl.addEventListener('click', () => restoreSnoozedTab(tab.id));
    
    elements.snoozedList.appendChild(tabEl);
  });
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
  
  // Snooze Options
  document.querySelectorAll('.snooze-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const minutes = parseInt(e.target.dataset.minutes);
      handleSnoozeCurrent(minutes);
    });
  });
  
  // Footer Actions
  elements.settingsBtn.addEventListener('click', openSettings);
  elements.commandPalette.addEventListener('click', openCommandPalette);
  elements.dashboard.addEventListener('click', openDashboard);
  elements.export.addEventListener('click', handleExport);
  elements.help.addEventListener('click', openHelp);
  
  // Close snooze options when clicking outside
  document.addEventListener('click', (e) => {
    if (!elements.snoozeCurrent.contains(e.target) && 
        !elements.snoozeOptions.contains(e.target)) {
      elements.snoozeOptions.classList.add('hidden');
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
  elements.snoozeOptions.classList.toggle('hidden');
}

async function handleSnoozeCurrent(minutes) {
  try {
    await sendMessage({ action: 'snoozeCurrent', minutes });
    showNotification(`Tab snoozed for ${getReadableDuration(minutes)}`, 'success');
    elements.snoozeOptions.classList.add('hidden');
    
    // Close popup after snoozing
    setTimeout(() => window.close(), 1000);
  } catch (error) {
    console.error('Failed to snooze tab:', error);
    showNotification('Failed to snooze tab', 'error');
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
    await sendMessage({ action: 'restoreSnoozedTab', tabId });
    await loadSnoozedTabs();
    showNotification('Tab restored', 'success');
  } catch (error) {
    console.error('Failed to restore tab:', error);
    showNotification('Failed to restore tab', 'error');
  }
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

// ============================================================================
// Error Handling
// ============================================================================

window.addEventListener('error', (event) => {
  console.error('Popup error:', event.error);
  showNotification('An error occurred', 'error');
});
