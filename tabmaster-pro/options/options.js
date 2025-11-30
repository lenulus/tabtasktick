// Options Page JavaScript for TabMaster Pro

import {
  getActiveEngineVersion,
  setActiveEngineVersion,
  getAvailableEngines,
  getEngineInfo,
  onEngineChanged
} from '../lib/engineLoader.js';

// Console capture for logging
import { initConsoleCapture, getEffectiveLevel } from '../services/utils/console-capture.js';
initConsoleCapture();

// ============================================================================
// State Management
// ============================================================================

let currentSettings = {};
let currentRules = [];
let editingRule = null;
let whitelistDomains = [];

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadRules();
  await loadStatistics();
  setupEventListeners();
  setupTabNavigation();
});

// ============================================================================
// Tab Navigation
// ============================================================================

function setupTabNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  const panels = document.querySelectorAll('.tab-panel');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Update active panel
      panels.forEach(panel => {
        if (panel.id === targetTab) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      });
    });
  });
}

// ============================================================================
// Settings Management
// ============================================================================

async function loadSettings() {
  try {
    const response = await sendMessage({ action: 'getSettings' });
    currentSettings = response;
    
    // Apply settings to UI
    document.getElementById('autoCloseEnabled').checked = currentSettings.autoCloseEnabled;
    document.getElementById('autoGroupEnabled').checked = currentSettings.autoGroupEnabled;
    document.getElementById('duplicateDetection').checked = currentSettings.duplicateDetection;
    document.getElementById('skipPinnedByDefault').checked = currentSettings.skipPinnedByDefault ?? true;
    document.getElementById('maxTabsWarning').value = currentSettings.maxTabsWarning || 100;
    document.getElementById('defaultSnoozeMinutes').value = currentSettings.defaultSnoozeMinutes || 60;
    document.getElementById('tabRestorationMode').value = currentSettings.tabRestorationMode || 'original';
    
    // Memory threshold
    const memoryThreshold = document.getElementById('memoryThreshold');
    const memoryThresholdValue = document.getElementById('memoryThresholdValue');
    memoryThreshold.value = currentSettings.memoryThreshold || 80;
    memoryThresholdValue.textContent = `${memoryThreshold.value}%`;
    
    // Tab Preview settings
    const previewSettings = currentSettings.tabPreviewSettings || {
      enabled: true,
      showScreenshots: true,
      hoverDelay: 300
    };
    document.getElementById('previewEnabled').checked = previewSettings.enabled;
    document.getElementById('previewScreenshots').checked = previewSettings.showScreenshots;
    document.getElementById('previewDelay').value = previewSettings.hoverDelay;
    document.getElementById('previewDelayValue').textContent = `${previewSettings.hoverDelay}ms`;
    
    // Load engine selector
    await loadEngineSelector();

    // Load whitelist
    const whitelist = currentSettings.whitelist || [];
    whitelistDomains = whitelist;
    updateWhitelistUI();

    // Load developer settings (stored directly in chrome.storage.local)
    await loadDeveloperSettings();

  } catch (error) {
    console.error('Failed to load settings:', error);
    showNotification('Failed to load settings', 'error');
  }
}

/**
 * Load and apply developer settings from chrome.storage.local
 */
async function loadDeveloperSettings() {
  try {
    const { developerMode, developerLogLevel } = await chrome.storage.local.get([
      'developerMode',
      'developerLogLevel'
    ]);

    const developerModeCheckbox = document.getElementById('developerMode');
    const developerLogLevelSelect = document.getElementById('developerLogLevel');
    const developerSettingsPanel = document.getElementById('developerSettings');

    developerModeCheckbox.checked = developerMode || false;
    developerLogLevelSelect.value = developerLogLevel ?? 2;
    developerSettingsPanel.classList.toggle('hidden', !developerMode);
  } catch (error) {
    console.error('Failed to load developer settings:', error);
  }
}

async function saveSettings() {
  const newSettings = {
    autoCloseEnabled: document.getElementById('autoCloseEnabled').checked,
    autoGroupEnabled: document.getElementById('autoGroupEnabled').checked,
    duplicateDetection: document.getElementById('duplicateDetection').checked,
    skipPinnedByDefault: document.getElementById('skipPinnedByDefault').checked,
    maxTabsWarning: parseInt(document.getElementById('maxTabsWarning').value),
    defaultSnoozeMinutes: parseInt(document.getElementById('defaultSnoozeMinutes').value),
    tabRestorationMode: document.getElementById('tabRestorationMode').value,
    memoryThreshold: parseInt(document.getElementById('memoryThreshold').value),
    whitelist: whitelistDomains,
    tabPreviewSettings: {
      enabled: document.getElementById('previewEnabled').checked,
      showScreenshots: document.getElementById('previewScreenshots').checked,
      hoverDelay: parseInt(document.getElementById('previewDelay').value)
    }
  };
  
  try {
    await sendMessage({ action: 'updateSettings', settings: newSettings });
    currentSettings = newSettings;
    showSaveNotification();
  } catch (error) {
    console.error('Failed to save settings:', error);
    showNotification('Failed to save settings', 'error');
  }
}

// ============================================================================
// Rules Management
// ============================================================================

async function loadRules() {
  try {
    const rules = await sendMessage({ action: 'getRules' });
    currentRules = rules;
    updateRulesUI();
  } catch (error) {
    console.error('Failed to load rules:', error);
  }
}

function updateRulesUI() {
  const container = document.getElementById('rulesContainer');
  container.innerHTML = '';
  
  if (currentRules.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #6c757d;">
        <p>No rules configured yet.</p>
        <p>Click "Add Rule" to create your first automation rule.</p>
      </div>
    `;
    return;
  }
  
  currentRules.forEach(rule => {
    const ruleCard = document.createElement('div');
    ruleCard.className = `rule-card ${!rule.enabled ? 'disabled' : ''}`;
    
    ruleCard.innerHTML = `
      <div class="rule-header">
        <div class="rule-title">
          <span>${rule.name}</span>
          <span class="rule-badge ${!rule.enabled ? 'inactive' : ''}">
            ${rule.enabled ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div class="rule-actions">
          <button class="rule-btn" data-action="edit" data-rule-id="${rule.id}">Edit</button>
          <button class="rule-btn" data-action="toggle" data-rule-id="${rule.id}">
            ${rule.enabled ? 'Disable' : 'Enable'}
          </button>
          <button class="rule-btn" data-action="delete" data-rule-id="${rule.id}">Delete</button>
        </div>
      </div>
      <div class="rule-details">
        <div>Condition: ${getConditionDescription(rule.conditions)}</div>
        <div>Action: ${getActionDescription(rule.actions)}</div>
        <div>Priority: ${rule.priority}</div>
      </div>
    `;
    
    container.appendChild(ruleCard);
  });
}

function getConditionDescription(conditions) {
  switch (conditions.type) {
  case 'duplicate':
    return 'Duplicate tabs';
  case 'domain_count':
    return `More than ${conditions.minCount} tabs from same domain`;
  case 'inactive':
    return `Inactive for ${conditions.inactiveMinutes} minutes`;
  case 'age_and_domain':
    return `Tabs older than ${conditions.ageMinutes} minutes from ${conditions.domains.join(', ')}`;
  case 'memory':
    return `Memory usage exceeds ${conditions.thresholdPercent}%`;
  case 'url_pattern':
    return `URLs matching "${conditions.pattern}"${conditions.inactiveMinutes ? ` inactive for ${conditions.inactiveMinutes} minutes` : ''}`;
  case 'category':
    const categoryNames = conditions.categories ? conditions.categories.join(', ') : 'none';
    return `Sites in categories: ${categoryNames}${conditions.inactiveMinutes ? ` inactive for ${conditions.inactiveMinutes} minutes` : ''}`;
  default:
    return 'Unknown condition';
  }
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

// Rule Editor Modal
function openRuleModal(rule = null) {
  const modal = document.getElementById('ruleModal');
  const title = document.getElementById('ruleModalTitle');
  
  editingRule = rule;
  
  if (rule) {
    title.textContent = 'Edit Rule';
    document.getElementById('ruleName').value = rule.name;
    document.getElementById('ruleCondition').value = rule.conditions.type;
    document.getElementById('ruleAction').value = rule.actions.type;
    document.getElementById('rulePriority').value = rule.priority;
  } else {
    title.textContent = 'Add New Rule';
    document.getElementById('ruleName').value = '';
    document.getElementById('ruleCondition').value = 'duplicate';
    document.getElementById('ruleAction').value = 'close';
    document.getElementById('rulePriority').value = '10';
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
        <label>Minimum tab count</label>
        <input type="number" id="minCount" min="2" value="3">
      `;
    break;
    
  case 'inactive':
    html = `
        <label>Inactive duration (minutes)</label>
        <input type="number" id="inactiveMinutes" min="5" value="60">
        <label>URL patterns (comma-separated)</label>
        <input type="text" id="urlPatterns" placeholder="e.g., medium.com, dev.to">
      `;
    break;
    
  case 'age_and_domain':
    html = `
        <label>Age (minutes)</label>
        <input type="number" id="ageMinutes" min="5" value="180">
        <label>Domains (comma-separated)</label>
        <input type="text" id="domains" placeholder="e.g., stackoverflow.com">
      `;
    break;
    
  case 'memory':
    html = `
        <label>Memory threshold (%)</label>
        <input type="number" id="thresholdPercent" min="50" max="100" value="80">
      `;
    break;
  }
  
  paramsContainer.innerHTML = html;
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
}

async function saveRule() {
  const name = document.getElementById('ruleName').value.trim();
  
  if (!name) {
    alert('Please enter a rule name');
    return;
  }
  
  const conditionType = document.getElementById('ruleCondition').value;
  const actionType = document.getElementById('ruleAction').value;
  const priority = parseInt(document.getElementById('rulePriority').value);
  
  // Build conditions object
  const conditions = { type: conditionType };
  
  switch (conditionType) {
  case 'domain_count':
    conditions.minCount = parseInt(document.getElementById('minCount')?.value || 3);
    break;
    
  case 'inactive':
    conditions.inactiveMinutes = parseInt(document.getElementById('inactiveMinutes')?.value || 60);
    const urlPatterns = document.getElementById('urlPatterns')?.value;
    if (urlPatterns) {
      conditions.urlPatterns = urlPatterns.split(',').map(p => p.trim());
    }
    break;
    
  case 'age_and_domain':
    conditions.ageMinutes = parseInt(document.getElementById('ageMinutes')?.value || 180);
    const domains = document.getElementById('domains')?.value;
    if (domains) {
      conditions.domains = domains.split(',').map(d => d.trim());
    }
    break;
    
  case 'memory':
    conditions.thresholdPercent = parseInt(document.getElementById('thresholdPercent')?.value || 80);
    break;
  }
  
  // Build actions object
  const actions = { type: actionType };
  
  switch (actionType) {
  case 'close':
    actions.saveToBookmarks = document.getElementById('saveToBookmarks')?.checked || false;
    actions.keepFirst = true;
    break;
    
  case 'group':
    actions.groupBy = document.getElementById('groupBy')?.value || 'domain';
    break;
    
  case 'snooze':
    actions.snoozeMinutes = parseInt(document.getElementById('snoozeMinutes')?.value || 120);
    break;
    
  case 'suspend':
    actions.excludePinned = document.getElementById('excludePinned')?.checked || false;
    break;
  }
  
  const rule = {
    id: editingRule?.id || crypto.randomUUID(),
    name,
    enabled: editingRule?.enabled !== false,
    conditions,
    actions,
    priority
  };
  
  try {
    await sendMessage({ action: 'updateRule', rule });
    await loadRules();
    closeRuleModal();
    showSaveNotification();
  } catch (error) {
    console.error('Failed to save rule:', error);
    alert('Failed to save rule');
  }
}

async function toggleRule(ruleId) {
  try {
    await sendMessage({ action: 'toggleRule', ruleId });
    await loadRules();
    showSaveNotification();
  } catch (error) {
    console.error('Failed to toggle rule:', error);
  }
}

async function deleteRule(ruleId) {
  if (!confirm('Are you sure you want to delete this rule?')) {
    return;
  }
  
  currentRules = currentRules.filter(r => r.id !== ruleId);
  
  try {
    await sendMessage({ action: 'updateRules', rules: currentRules });
    updateRulesUI();
    showSaveNotification();
  } catch (error) {
    console.error('Failed to delete rule:', error);
  }
}

function editRule(ruleId) {
  const rule = currentRules.find(r => r.id === ruleId);
  if (rule) {
    openRuleModal(rule);
  }
}

// ============================================================================
// Whitelist Management
// ============================================================================

function updateWhitelistUI() {
  const list = document.getElementById('whitelistDomains');
  list.innerHTML = '';
  
  whitelistDomains.forEach(domain => {
    const li = document.createElement('li');
    li.innerHTML = `
      ${domain}
      <button class="remove-btn" data-domain="${domain}">&times;</button>
    `;
    
    li.querySelector('.remove-btn').addEventListener('click', () => {
      removeFromWhitelist(domain);
    });
    
    list.appendChild(li);
  });
}

function addToWhitelist() {
  const input = document.getElementById('whitelistInput');
  const domain = input.value.trim().toLowerCase();
  
  if (!domain) return;
  
  if (!whitelistDomains.includes(domain)) {
    whitelistDomains.push(domain);
    updateWhitelistUI();
    saveSettings();
  }
  
  input.value = '';
}

function removeFromWhitelist(domain) {
  whitelistDomains = whitelistDomains.filter(d => d !== domain);
  updateWhitelistUI();
  saveSettings();
}

// ============================================================================
// Statistics
// ============================================================================

async function loadStatistics() {
  try {
    const stats = await sendMessage({ action: 'getStatistics' });
    
    document.getElementById('lifetimeTabsClosed').textContent = 
      stats.statistics.tabsClosed.toLocaleString();
    document.getElementById('lifetimeTabsSnoozed').textContent = 
      stats.statistics.tabsSnoozed.toLocaleString();
    document.getElementById('lifetimeTabsGrouped').textContent = 
      stats.statistics.tabsGrouped.toLocaleString();
    document.getElementById('lifetimeDuplicatesRemoved').textContent = 
      stats.statistics.duplicatesRemoved.toLocaleString();
    
  } catch (error) {
    console.error('Failed to load statistics:', error);
  }
}

// ============================================================================
// Import/Export
// ============================================================================

async function exportSettings() {
  try {
    const data = await sendMessage({ action: 'exportData' });
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tabmaster-settings-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('Settings exported successfully');
  } catch (error) {
    console.error('Failed to export settings:', error);
    showNotification('Failed to export settings', 'error');
  }
}

async function importSettings() {
  const fileInput = document.getElementById('importFile');
  fileInput.click();
}

async function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    await sendMessage({ action: 'importData', data });
    
    // Reload everything
    await loadSettings();
    await loadRules();
    await loadStatistics();
    
    showNotification('Settings imported successfully');
  } catch (error) {
    console.error('Failed to import settings:', error);
    showNotification('Failed to import settings. Invalid file format.', 'error');
  }
  
  // Clear file input
  event.target.value = '';
}

// ============================================================================
// Data Management
// ============================================================================

async function clearHistory() {
  if (!confirm('Are you sure you want to clear all history?')) {
    return;
  }

  try {
    await sendMessage({ action: 'clearActivityLog' });
    await loadStatistics();
    showNotification('History cleared successfully');
  } catch (error) {
    console.error('Failed to clear history:', error);
    showNotification('Failed to clear history', 'error');
  }
}

async function clearAllData() {
  if (!confirm('Are you sure you want to clear all data? This cannot be undone.')) {
    return;
  }
  
  try {
    await chrome.storage.local.clear();
    await loadSettings();
    await loadRules();
    await loadStatistics();
    showNotification('All data cleared successfully');
  } catch (error) {
    console.error('Failed to clear data:', error);
    showNotification('Failed to clear data', 'error');
  }
}

async function resetToDefaults() {
  if (!confirm('Are you sure you want to reset all settings to defaults?')) {
    return;
  }
  
  try {
    await sendMessage({ action: 'resetToDefaults' });
    await loadSettings();
    await loadRules();
    showNotification('Settings reset to defaults');
  } catch (error) {
    console.error('Failed to reset settings:', error);
    showNotification('Failed to reset settings', 'error');
  }
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners() {
  // General Settings
  document.getElementById('autoCloseEnabled').addEventListener('change', saveSettings);
  document.getElementById('autoGroupEnabled').addEventListener('change', saveSettings);
  document.getElementById('duplicateDetection').addEventListener('change', saveSettings);
  document.getElementById('skipPinnedByDefault').addEventListener('change', saveSettings);
  document.getElementById('maxTabsWarning').addEventListener('change', saveSettings);
  document.getElementById('defaultSnoozeMinutes').addEventListener('change', saveSettings);
  document.getElementById('tabRestorationMode').addEventListener('change', saveSettings);
  
  // Memory threshold slider
  const memoryThreshold = document.getElementById('memoryThreshold');
  const memoryThresholdValue = document.getElementById('memoryThresholdValue');
  memoryThreshold.addEventListener('input', () => {
    memoryThresholdValue.textContent = `${memoryThreshold.value}%`;
  });
  memoryThreshold.addEventListener('change', saveSettings);
  
  // Tab Preview settings
  document.getElementById('previewEnabled').addEventListener('change', saveSettings);
  document.getElementById('previewScreenshots').addEventListener('change', saveSettings);
  
  const previewDelay = document.getElementById('previewDelay');
  const previewDelayValue = document.getElementById('previewDelayValue');
  previewDelay.addEventListener('input', () => {
    previewDelayValue.textContent = `${previewDelay.value}ms`;
  });
  previewDelay.addEventListener('change', saveSettings);

  // Developer Mode settings
  document.getElementById('developerMode').addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    await chrome.storage.local.set({ developerMode: enabled });
    document.getElementById('developerSettings').classList.toggle('hidden', !enabled);
    showSaveNotification();
  });

  document.getElementById('developerLogLevel').addEventListener('change', async (e) => {
    await chrome.storage.local.set({ developerLogLevel: parseInt(e.target.value) });
    showSaveNotification();
  });

  document.getElementById('testLogLevels').addEventListener('click', () => {
    const timestamp = new Date().toLocaleTimeString();
    const effectiveLevel = getEffectiveLevel();
    const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

    console.log(`--- Test at ${timestamp} | Level: ${levelNames[effectiveLevel]} ---`);
    console.debug(`  [DEBUG] This message (level 0) ${effectiveLevel <= 0 ? '✓ visible' : '✗ filtered'}`);
    console.log(`  [LOG]   This message (level 1) ${effectiveLevel <= 1 ? '✓ visible' : '✗ filtered'}`);
    console.info(`  [INFO]  This message (level 1) ${effectiveLevel <= 1 ? '✓ visible' : '✗ filtered'}`);
    console.warn(`  [WARN]  This message (level 2) ${effectiveLevel <= 2 ? '✓ visible' : '✗ filtered'}`);
    console.error(`  [ERROR] This message (level 3) ✓ always visible`);
    console.log(`--- End test (DEBUG requires "Verbose" in DevTools) ---`);

    showNotification(`Level: ${levelNames[effectiveLevel]}`);
  });

  // Rules
  document.getElementById('addRuleBtn').addEventListener('click', () => openRuleModal());
  document.getElementById('closeRuleModal').addEventListener('click', closeRuleModal);
  document.getElementById('cancelRuleBtn').addEventListener('click', closeRuleModal);
  document.getElementById('saveRuleBtn').addEventListener('click', saveRule);
  
  document.getElementById('ruleCondition').addEventListener('change', updateConditionParams);
  document.getElementById('ruleAction').addEventListener('change', updateActionParams);
  
  // Event delegation for rule action buttons
  document.getElementById('rulesContainer').addEventListener('click', async (e) => {
    if (e.target.classList.contains('rule-btn')) {
      const action = e.target.dataset.action;
      const ruleId = e.target.dataset.ruleId;
      
      switch (action) {
      case 'edit':
        editRule(ruleId);
        break;
      case 'toggle':
        await toggleRule(ruleId);
        break;
      case 'delete':
        await deleteRule(ruleId);
        break;
      }
    }
  });
  
  // Whitelist
  document.getElementById('addWhitelistBtn').addEventListener('click', addToWhitelist);
  document.getElementById('whitelistInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addToWhitelist();
    }
  });
  
  // Import/Export
  document.getElementById('importBtn').addEventListener('click', importSettings);
  document.getElementById('exportBtn').addEventListener('click', exportSettings);
  document.getElementById('importFile').addEventListener('change', handleImportFile);
  
  // Data Management
  document.getElementById('clearHistory').addEventListener('click', clearHistory);
  document.getElementById('clearStorage').addEventListener('click', clearAllData);
  document.getElementById('resetSettings').addEventListener('click', resetToDefaults);
  
  // About
  document.getElementById('privacyLink').addEventListener('click', (e) => {
    e.preventDefault();
    alert('TabMaster Pro does not collect or transmit any personal data. All data is stored locally in your browser.');
  });
  
  // Handle Escape key for modal
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('ruleModal');
      if (modal && modal.classList.contains('show')) {
        closeRuleModal();
      }
    }
  });
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

function showSaveNotification() {
  const notification = document.getElementById('saveNotification');
  notification.classList.add('show');
  
  setTimeout(() => {
    notification.classList.remove('show');
  }, 2000);
}

function showNotification(message, type = 'success') {
  console.log(`${type}: ${message}`);
  // Could implement a more sophisticated notification system here
}

// Make functions globally accessible for inline handlers
window.editRule = editRule;
window.toggleRule = toggleRule;
window.deleteRule = deleteRule;

// ============================================================================
// Engine Selector Management
// ============================================================================

async function loadEngineSelector() {
  try {
    // Get current active engine
    const activeVersion = await getActiveEngineVersion();

    // Update selector
    const selector = document.getElementById('activeEngine');
    selector.value = activeVersion;

    // Update info display
    updateEngineInfo(activeVersion);

    // Setup change listener
    selector.addEventListener('change', async (e) => {
      const newVersion = e.target.value;
      await handleEngineChange(newVersion);
    });

    // Listen for engine changes from other contexts
    onEngineChanged((newVersion) => {
      selector.value = newVersion;
      updateEngineInfo(newVersion);
      showNotification(`Engine switched to ${newVersion}`, 'info');
    });

  } catch (error) {
    console.error('Failed to load engine selector:', error);
    showNotification('Failed to load engine settings', 'error');
  }
}

async function handleEngineChange(newVersion) {
  try {
    await setActiveEngineVersion(newVersion);
    updateEngineInfo(newVersion);
    showSaveNotification();

    // Show info message about engine change
    const info = getEngineInfo(newVersion);
    showNotification(`Switched to ${info.name}: ${info.description}`, 'success');

  } catch (error) {
    console.error('Failed to change engine:', error);
    showNotification('Failed to change engine', 'error');

    // Revert selector
    const currentVersion = await getActiveEngineVersion();
    document.getElementById('activeEngine').value = currentVersion;
  }
}

function updateEngineInfo(version) {
  const info = getEngineInfo(version);

  if (!info) {
    document.getElementById('engineInfoTitle').textContent = 'Unknown Engine';
    document.getElementById('engineInfoDescription').textContent = 'Engine not found';
    return;
  }

  document.getElementById('engineInfoTitle').textContent = info.name;
  document.getElementById('engineInfoDescription').textContent = info.description;

  // Update status badge
  const statusBadge = document.getElementById('engineStatusBadge');
  statusBadge.textContent = 'Active';
  statusBadge.className = 'status-badge active';
}
