// Options Page JavaScript for TabMaster Pro

// Console capture for logging
import { initConsoleCapture, getEffectiveLevel } from '../services/utils/console-capture.js';
initConsoleCapture();

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadVersion();
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

    // Apply valid settings to UI
    const skipPinnedCheckbox = document.getElementById('skipPinnedByDefault');
    if (skipPinnedCheckbox) {
      skipPinnedCheckbox.checked = response.skipPinnedByDefault ?? true;
    }

    const restorationMode = document.getElementById('tabRestorationMode');
    if (restorationMode) {
      restorationMode.value = response.tabRestorationMode || 'original';
    }

    // Load developer settings
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

    if (developerModeCheckbox) {
      developerModeCheckbox.checked = developerMode || false;
    }
    if (developerLogLevelSelect) {
      developerLogLevelSelect.value = developerLogLevel ?? 2;
    }
    if (developerSettingsPanel) {
      developerSettingsPanel.classList.toggle('hidden', !developerMode);
    }
  } catch (error) {
    console.error('Failed to load developer settings:', error);
  }
}

async function saveSetting(key, value) {
  try {
    const response = await sendMessage({ action: 'getSettings' });
    const newSettings = { ...response, [key]: value };
    await sendMessage({ action: 'updateSettings', settings: newSettings });
    showSaveNotification();
  } catch (error) {
    console.error('Failed to save setting:', error);
    showNotification('Failed to save setting', 'error');
  }
}

// ============================================================================
// Version
// ============================================================================

async function loadVersion() {
  try {
    const manifest = chrome.runtime.getManifest();
    const versionElement = document.getElementById('versionNumber');
    if (versionElement) {
      versionElement.textContent = `Version ${manifest.version}`;
    }
  } catch (error) {
    console.error('Failed to load version:', error);
  }
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
    showNotification('Settings reset to defaults');
  } catch (error) {
    console.error('Failed to reset settings:', error);
    showNotification('Failed to reset settings', 'error');
  }
}

function openDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners() {
  // Tab Behavior settings
  const skipPinnedCheckbox = document.getElementById('skipPinnedByDefault');
  if (skipPinnedCheckbox) {
    skipPinnedCheckbox.addEventListener('change', (e) => {
      saveSetting('skipPinnedByDefault', e.target.checked);
    });
  }

  const restorationMode = document.getElementById('tabRestorationMode');
  if (restorationMode) {
    restorationMode.addEventListener('change', (e) => {
      saveSetting('tabRestorationMode', e.target.value);
    });
  }

  // Developer Mode settings
  const developerModeCheckbox = document.getElementById('developerMode');
  if (developerModeCheckbox) {
    developerModeCheckbox.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      await chrome.storage.local.set({ developerMode: enabled });
      const settingsPanel = document.getElementById('developerSettings');
      if (settingsPanel) {
        settingsPanel.classList.toggle('hidden', !enabled);
      }
      showSaveNotification();
    });
  }

  const developerLogLevel = document.getElementById('developerLogLevel');
  if (developerLogLevel) {
    developerLogLevel.addEventListener('change', async (e) => {
      await chrome.storage.local.set({ developerLogLevel: parseInt(e.target.value) });
      showSaveNotification();
    });
  }

  const testLogLevelsBtn = document.getElementById('testLogLevels');
  if (testLogLevelsBtn) {
    testLogLevelsBtn.addEventListener('click', () => {
      const timestamp = new Date().toLocaleTimeString();
      const effectiveLevel = getEffectiveLevel();
      const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

      console.log(`--- Test at ${timestamp} | Level: ${levelNames[effectiveLevel]} ---`);
      console.debug(`  [DEBUG] This message (level 0) ${effectiveLevel <= 0 ? '✓ visible' : '✗ filtered'}`);
      console.log(`  [LOG]   This message (level 1) ${effectiveLevel <= 1 ? '✓ visible' : '✗ filtered'}`);
      console.info(`  [INFO]  This message (level 1) ${effectiveLevel <= 1 ? '✓ visible' : '✗ filtered'}`);
      console.warn(`  [WARN]  This message (level 2) ${effectiveLevel <= 2 ? '\u2713 visible' : '\u2717 filtered'}`);
      console.error('  [ERROR] This message (level 3) \u2713 always visible');
      console.log('--- End test (DEBUG requires "Verbose" in DevTools) ---');

      showNotification(`Level: ${levelNames[effectiveLevel]}`);
    });
  }

  // Data Management
  const clearHistoryBtn = document.getElementById('clearHistory');
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', clearHistory);
  }

  const clearStorageBtn = document.getElementById('clearStorage');
  if (clearStorageBtn) {
    clearStorageBtn.addEventListener('click', clearAllData);
  }

  const resetSettingsBtn = document.getElementById('resetSettings');
  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', resetToDefaults);
  }

  const openDashboardBtn = document.getElementById('openDashboard');
  if (openDashboardBtn) {
    openDashboardBtn.addEventListener('click', openDashboard);
  }

  // Keyboard shortcuts link - copy to clipboard since chrome:// links don't work
  const shortcutsLink = document.getElementById('shortcutsLink');
  if (shortcutsLink) {
    shortcutsLink.addEventListener('click', (e) => {
      e.preventDefault();
      navigator.clipboard.writeText('chrome://extensions/shortcuts').then(() => {
        showNotification('URL copied! Paste in address bar.');
      }).catch(() => {
        showNotification('Open chrome://extensions/shortcuts manually');
      });
    });
  }
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
  if (notification) {
    notification.classList.add('show');
    setTimeout(() => {
      notification.classList.remove('show');
    }, 2000);
  }
}

function showNotification(message, type = 'success') {
  console.log(`${type}: ${message}`);
  // Use the save notification for now
  const notification = document.getElementById('saveNotification');
  if (notification) {
    notification.textContent = message;
    notification.classList.add('show');
    setTimeout(() => {
      notification.classList.remove('show');
      notification.textContent = 'Settings saved successfully!';
    }, 2000);
  }
}
