// Export/Import functionality for the dashboard

let importedData = null;

// Initialize export/import functionality
function _initExportImport() {
  // Update tab counts
  updateTabCounts();

  // Export button
  const exportBtn = document.getElementById('exportDataBtn');
  console.log('initializeExportImport - exportDataBtn found:', !!exportBtn);
  if (exportBtn) {
    exportBtn.addEventListener('click', handleExport);
    console.log('Export button click listener attached');
  }

  // File upload handling
  const fileDropZone = document.getElementById('fileDropZone');
  const fileInput = document.getElementById('importFile');

  if (fileDropZone && fileInput) {
    fileDropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelect(e.target.files[0]);
      }
    });

    // Drag and drop support
    fileDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileDropZone.classList.add('drag-over');
    });

    fileDropZone.addEventListener('dragleave', () => {
      fileDropZone.classList.remove('drag-over');
    });

    fileDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      fileDropZone.classList.remove('drag-over');

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });
  }

  // Import buttons
  const confirmImportBtn = document.getElementById('confirmImport');
  const cancelImportBtn = document.getElementById('cancelImport');

  if (confirmImportBtn) {
    confirmImportBtn.addEventListener('click', handleImport);
  }

  if (cancelImportBtn) {
    cancelImportBtn.addEventListener('click', resetImport);
  }
}

// Update tab counts for export scope
async function updateTabCounts() {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    const currentWindowTabs = await chrome.tabs.query({ windowId: currentWindow.id });
    const allTabs = await chrome.tabs.query({});

    const currentWindowCount = document.getElementById('currentWindowTabCount');
    const allWindowsCount = document.getElementById('allWindowsTabCount');

    if (currentWindowCount) currentWindowCount.textContent = currentWindowTabs.length;
    if (allWindowsCount) allWindowsCount.textContent = allTabs.length;
  } catch (error) {
    console.error('Failed to update tab counts:', error);
  }
}

// Handle export
async function handleExport() {
  console.log('handleExport called');
  try {
    const scope = document.querySelector('input[name="exportScope"]:checked')?.value || 'all-windows';
    const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'json';

    // Get current window ID if needed
    let currentWindowId = null;
    if (scope === 'current-window') {
      const currentWindow = await chrome.windows.getCurrent();
      currentWindowId = currentWindow.id;
    }

    // Prepare options
    const options = {
      scope,
      format,
      currentWindowId,
      includeRules: document.getElementById('includeRules')?.checked ?? true,
      includeSnoozed: document.getElementById('includeSnoozed')?.checked ?? true,
      includeSettings: document.getElementById('includeSettings')?.checked ?? true,
      includeStatistics: document.getElementById('includeStatistics')?.checked ?? true
    };

    showNotification(`Exporting as ${format.toUpperCase()}...`, 'info');

    const response = await chrome.runtime.sendMessage({
      action: 'exportData',
      options
    });

    if (response.error) {
      throw new Error(response.error);
    }

    const data = response;

    // Determine file extension and MIME type
    let fileExtension, mimeType, content;

    switch (format) {
      case 'csv':
        fileExtension = 'csv';
        mimeType = 'text/csv';
        content = data.csv;
        break;
      case 'markdown':
        fileExtension = 'md';
        mimeType = 'text/markdown';
        content = data.markdown;
        break;
      case 'json':
      default:
        fileExtension = 'json';
        mimeType = 'application/json';
        content = JSON.stringify(data, null, 2);
        break;
    }

    // Create download
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const filename = `tabmaster-export-${new Date().toISOString().split('T')[0]}.${fileExtension}`;

    await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    });

    // Show summary
    if (format === 'json') {
      const summary = [];
      if (data.session) {
        summary.push(`${data.session.tabs.length} tabs`);
      }
      if (data.extensionData && data.extensionData.rules) {
        summary.push(`${data.extensionData.rules.length} rules`);
      }
      if (data.extensionData && data.extensionData.snoozedTabs) {
        summary.push(`${data.extensionData.snoozedTabs.length} snoozed tabs`);
      }
      showNotification(`Exported: ${summary.join(', ')}`, 'success');
    } else {
      showNotification(`Exported as ${format.toUpperCase()}`, 'success');
    }

  } catch (error) {
    console.error('Failed to export data:', error);
    showNotification('Export failed: ' + (error.message || 'Unknown error'), 'error');
  }
}

// Handle file selection for import
async function handleFileSelect(file) {
  try {
    // Validate file type
    if (!file.name.endsWith('.json')) {
      showNotification('Please select a JSON file', 'error');
      return;
    }

    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      showNotification('File too large (max 10MB)', 'error');
      return;
    }

    // Read and parse file
    const text = await file.text();
    const data = JSON.parse(text);

    // Validate structure
    if (!data.format || !data.session) {
      showNotification('Invalid TabMaster export file', 'error');
      return;
    }

    importedData = data;

    // Display file info
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = (file.size / 1024).toFixed(1) + ' KB';
    document.getElementById('fileFormat').textContent = data.format || 'Unknown';
    document.getElementById('fileInfo').style.display = 'block';

    // Display preview
    const summaryList = document.getElementById('importSummaryList');
    summaryList.innerHTML = '';

    // Count importable tabs (excluding restricted URLs)
    let importableTabCount = 0;
    let restrictedTabCount = 0;

    if (data.session && data.session.tabs) {
      data.session.tabs.forEach(tab => {
        if (tab.url && (
          tab.url.startsWith('chrome://') ||
          tab.url.startsWith('edge://') ||
          tab.url.startsWith('about:') ||
          tab.url.startsWith('chrome-extension://')
        )) {
          restrictedTabCount++;
        } else {
          importableTabCount++;
        }
      });
    }

    if (data.session) {
      const items = [];

      // Show importable tabs count with restricted note if needed
      if (data.session.tabs) {
        let tabInfo = `${importableTabCount} tabs`;
        if (data.session.windows && data.session.windows.length > 1) {
          tabInfo += ` in ${data.session.windows.length} window(s)`;
        }
        if (restrictedTabCount > 0) {
          tabInfo += ` (${restrictedTabCount} restricted URLs excluded)`;
        }
        items.push(tabInfo);
      }

      if (data.session.groups) items.push(`${data.session.groups.length} tab groups`);
      if (data.extensionData) {
        if (data.extensionData.rules) items.push(`${data.extensionData.rules.length} rules`);
        if (data.extensionData.snoozedTabs) items.push(`${data.extensionData.snoozedTabs.length} snoozed tabs`);
      }

      items.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        summaryList.appendChild(li);
      });
    }

    document.getElementById('importPreview').style.display = 'block';
    document.getElementById('importSettings').style.display = 'block';

    // Update warning based on importable tabs only
    const warning = document.getElementById('importWarning');
    if (importableTabCount > 50) {
      warning.textContent = `⚠️ This will open ${importableTabCount} tabs. Consider importing in smaller batches.`;
      warning.style.display = 'block';
    } else if (importableTabCount > 0) {
      warning.textContent = `This will open ${importableTabCount} tabs.`;
      warning.style.display = 'block';
    } else if (importableTabCount === 0 && restrictedTabCount > 0) {
      warning.textContent = `⚠️ All ${restrictedTabCount} tabs have restricted URLs and cannot be imported.`;
      warning.className = 'import-warning error';
      warning.style.display = 'block';
    } else {
      warning.style.display = 'none';
    }

    // Enable import button
    document.getElementById('confirmImport').disabled = false;

  } catch (error) {
    console.error('Failed to process file:', error);
    showNotification('Failed to read file: ' + error.message, 'error');
  }
}

// Handle import
async function handleImport() {
  if (!importedData) {
    showNotification('No file selected', 'error');
    return;
  }

  try {
    const options = {
      scope: document.querySelector('input[name="importScope"]:checked')?.value || 'new-windows',
      importGroups: document.getElementById('importGroups')?.checked ?? true,
      shouldImportRules: document.getElementById('importRules')?.checked ?? true,
      shouldImportSnoozed: document.getElementById('importSnoozed')?.checked ?? true,
      importSettings: document.getElementById('importSettings')?.checked ?? false
    };

    showNotification('Importing data...', 'info');

    const result = await chrome.runtime.sendMessage({
      action: 'importData',
      data: importedData,
      options
    });

    if (result.success) {
      const imported = result.imported || {};
      const summary = [];
      if (imported.windows) summary.push(`${imported.windows} window${imported.windows !== 1 ? 's' : ''}`);
      if (imported.tabs) summary.push(`${imported.tabs} tabs`);
      if (imported.groups) summary.push(`${imported.groups} groups`);
      if (imported.rules) summary.push(`${imported.rules} rules`);
      if (imported.snoozed) summary.push(`${imported.snoozed} snoozed tabs`);

      if (summary.length > 0) {
        showNotification(`Successfully imported: ${summary.join(', ')}`, 'success');
      } else {
        showNotification('Import completed but no items were imported', 'warning');
      }

      // Reset the import form
      resetImport();
    } else {
      showNotification('Import failed: ' + (result.error || 'Unknown error'), 'error');
    }

  } catch (error) {
    console.error('Failed to import data:', error);
    showNotification('Import failed: ' + error.message, 'error');
  }
}

// Reset import form
function resetImport() {
  importedData = null;
  document.getElementById('fileInfo').style.display = 'none';
  document.getElementById('importPreview').style.display = 'none';
  document.getElementById('importSettings').style.display = 'none';
  document.getElementById('confirmImport').disabled = true;
  document.getElementById('importFile').value = '';
  document.getElementById('importWarning').style.display = 'none';
}

// Show notification
function showNotification(message, type = 'info') {
  // Check if we're in the dashboard
  const existingToast = document.querySelector('.toast-container');
  if (existingToast) {
    // Use dashboard's toast notification
    const toast = document.createElement('div');
    toast.className = `toast toast-${type} show`;
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-message">${message}</span>
        <button class="toast-close">&times;</button>
      </div>
    `;
    existingToast.appendChild(toast);

    // Auto remove after 3 seconds
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);

    // Close button
    const closeBtn = toast.querySelector('.toast-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      });
    }
  } else {
    // Fallback to console
    console.log(`[${type.toUpperCase()}] ${message}`);
  }
}

// ============================================================================
// Scheduled Backups (Phase 8.4)
// ============================================================================

function _initScheduledBackups() {
  loadBackupConfiguration();
  loadBackupHistory();

  // Backup toggle
  const toggleBackups = document.getElementById('toggleBackups');
  if (toggleBackups) {
    toggleBackups.addEventListener('change', handleToggleBackups);
  }

  // Frequency selector
  const frequencySelect = document.getElementById('backupFrequency');
  if (frequencySelect) {
    frequencySelect.addEventListener('change', handleFrequencyChange);
  }

  // Time selector
  const timeInput = document.getElementById('backupTime');
  if (timeInput) {
    timeInput.addEventListener('change', handleTimeChange);
  }
}

async function loadBackupConfiguration() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getScheduledExportConfig'
    });

    const config = response?.config || { enabled: false, frequency: 'daily', retention: 7 };

    console.log('loadBackupConfiguration - received config:', config);

    // Update UI
    const toggleBackups = document.getElementById('toggleBackups');
    if (toggleBackups) {
      toggleBackups.checked = config.enabled;
    }

    const frequencySelect = document.getElementById('backupFrequency');
    if (frequencySelect) {
      frequencySelect.value = config.frequency;
    }

    const timeInput = document.getElementById('backupTime');
    if (timeInput) {
      if (config.time) {
        timeInput.value = config.time;
      } else {
        // Set to current time as default
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        timeInput.value = `${hours}:${minutes}`;
      }
    }

    // Update status
    updateBackupStatus(config);

  } catch (error) {
    console.error('Failed to load backup configuration:', error);
  }
}

function updateBackupStatus(config) {
  const nextBackupText = document.getElementById('nextBackupTime');

  console.log('updateBackupStatus - config:', config);

  if (!nextBackupText) {
    console.warn('updateBackupStatus - missing nextBackupTime element');
    return;
  }

  if (config.enabled) {

    // Calculate next backup time based on configured time
    const now = new Date();
    let nextRun = new Date();

    if (config.time) {
      const [hours, minutes] = config.time.split(':').map(Number);
      nextRun.setHours(hours, minutes, 0, 0);

      // If the time has already passed today, schedule for next period
      if (nextRun <= now) {
        if (config.frequency === 'weekly') {
          nextRun.setDate(nextRun.getDate() + 7);
        } else if (config.frequency === 'daily') {
          nextRun.setDate(nextRun.getDate() + 1);
        } else {
          // Hourly - next hour
          nextRun.setTime(now.getTime() + (60 * 60 * 1000));
        }
      }
    } else {
      // No time set, use lastRun if available
      const periods = {
        'hourly': 60,
        'daily': 60 * 24,
        'weekly': 60 * 24 * 7
      };

      const periodMinutes = periods[config.frequency];
      if (config.lastRun && periodMinutes) {
        nextRun = new Date(config.lastRun + (periodMinutes * 60 * 1000));
      } else {
        const periodName = { hourly: 'hour', daily: 'day', weekly: 'week' }[config.frequency];
        nextBackupText.textContent = `Every ${periodName}`;
        return;
      }
    }

    // Calculate time until next backup
    const msUntil = nextRun.getTime() - now.getTime();
    if (msUntil > 0) {
      const hoursUntil = Math.floor(msUntil / (1000 * 60 * 60));
      const minutesUntil = Math.floor(msUntil / (1000 * 60)) % 60;

      if (hoursUntil > 0) {
        nextBackupText.textContent = `Next backup in ${hoursUntil}h ${minutesUntil}m`;
      } else {
        nextBackupText.textContent = `Next backup in ${minutesUntil}m`;
      }
    } else {
      nextBackupText.textContent = 'Next backup soon';
    }
  } else {
    nextBackupText.textContent = '';
  }
}

async function handleToggleBackups(event) {
  const enabled = event.target.checked;

  try {
    const frequencySelect = document.getElementById('backupFrequency');
    const timeInput = document.getElementById('backupTime');

    const config = {
      enabled,
      frequency: frequencySelect?.value || 'daily',
      time: timeInput?.value || null,
      retention: 5 // Fixed at 5 backups
    };

    if (enabled) {
      await chrome.runtime.sendMessage({
        action: 'enableScheduledExports',
        config
      });

      // Trigger immediate first backup
      const backupResult = await chrome.runtime.sendMessage({
        action: 'triggerManualBackup'
      });

      if (backupResult.success) {
        showNotification('Automatic backups enabled - first backup created', 'success');
        await loadBackupHistory(); // Refresh history to show new backup
      } else {
        showNotification('Automatic backups enabled', 'success');
      }

      // Small delay to ensure config is saved with lastRun
      await new Promise(resolve => setTimeout(resolve, 100));
    } else {
      await chrome.runtime.sendMessage({
        action: 'disableScheduledExports'
      });
      showNotification('Automatic backups disabled', 'success');
    }

    await loadBackupConfiguration();

  } catch (error) {
    console.error('Failed to toggle backups:', error);
    showNotification('Failed to update backup settings', 'error');
    event.target.checked = !enabled;
  }
}

async function handleFrequencyChange() {
  const toggleBackups = document.getElementById('toggleBackups');
  if (!toggleBackups || !toggleBackups.checked) return;
  await saveBackupConfiguration();
}

async function handleTimeChange() {
  const toggleBackups = document.getElementById('toggleBackups');
  if (!toggleBackups || !toggleBackups.checked) return;

  // Save configuration and update alarms
  await saveBackupConfiguration();

  showNotification('Backup schedule updated', 'success');
}

async function saveBackupConfiguration() {
  try {
    const toggleBackups = document.getElementById('toggleBackups');
    const frequencySelect = document.getElementById('backupFrequency');
    const timeInput = document.getElementById('backupTime');

    const config = {
      enabled: toggleBackups?.checked || false,
      frequency: frequencySelect?.value || 'daily',
      time: timeInput?.value || null,
      retention: 5 // Fixed at 5 backups
    };

    await chrome.runtime.sendMessage({
      action: 'enableScheduledExports',
      config
    });

    // Reload configuration to get updated state and recalculate next backup time
    await loadBackupConfiguration();

  } catch (error) {
    console.error('Failed to save backup configuration:', error);
    showNotification('Failed to save settings', 'error');
  }
}

async function handleManualBackup() {
  const backupNowBtn = document.getElementById('backupNowBtn');

  try {
    if (backupNowBtn) {
      backupNowBtn.disabled = true;
      backupNowBtn.textContent = 'Creating backup...';
    }

    const response = await chrome.runtime.sendMessage({
      action: 'triggerManualBackup'
    });

    if (response.success) {
      showNotification('Backup created successfully', 'success');
      await loadBackupHistory();
    } else {
      throw new Error(response.error || 'Unknown error');
    }

  } catch (error) {
    console.error('Failed to create manual backup:', error);
    showNotification('Failed to create backup: ' + error.message, 'error');
  } finally {
    if (backupNowBtn) {
      backupNowBtn.disabled = false;
      backupNowBtn.textContent = 'Backup Now';
    }
  }
}

async function loadBackupHistory() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getBackupHistory'
    });

    const backups = response.backups || [];
    renderBackupHistory(backups);

    // Set up event delegation for backup action buttons
    const historyContainer = document.getElementById('backupHistoryList');
    if (historyContainer) {
      // Remove existing listener if any
      historyContainer.replaceWith(historyContainer.cloneNode(true));
      const newContainer = document.getElementById('backupHistoryList');

      newContainer.addEventListener('click', async (e) => {
        const button = e.target.closest('[data-action]');
        if (!button) return;

        const action = button.dataset.action;
        const downloadId = parseInt(button.dataset.downloadId, 10);

        if (action === 'show') {
          await showBackupInFolder(downloadId);
        }
      });
    }

  } catch (error) {
    console.error('Failed to load backup history:', error);
  }
}

function renderBackupHistory(backups) {
  const historyContainer = document.getElementById('backupHistoryList');

  if (!historyContainer) return;

  if (backups.length === 0) {
    historyContainer.innerHTML = `
      <div class="empty-state">
        <p>No backups yet</p>
        <p class="empty-state-hint">Click "Backup Now" or enable automatic backups</p>
      </div>
    `;
    return;
  }

  // Sort backups by timestamp (newest first) and limit to 3
  const sortedBackups = [...backups].sort((a, b) => b.timestamp - a.timestamp).slice(0, 3);

  // Render backups without grouping (just showing last 3)
  historyContainer.innerHTML = renderBackupGroup(sortedBackups);
}

function renderBackupGroup(backups) {
  return backups.map(backup => {
    const date = new Date(backup.timestamp);
    const dateString = date.toLocaleString();
    const sizeInMB = (backup.size / (1024 * 1024)).toFixed(1);
    const badge = backup.automatic ? '<span class="backup-badge auto">AUTO</span>' : '<span class="backup-badge manual">MANUAL</span>';

    return `
      <div class="backup-item" data-download-id="${backup.downloadId}">
        <div class="backup-info">
          <div class="backup-header">
            <div class="backup-name">${backup.filename}</div>
            ${badge}
          </div>
          <div class="backup-details">
            ${dateString} • ${backup.tabCount} tabs • ${backup.windowCount} windows • ${sizeInMB} MB
          </div>
        </div>
        <div class="backup-actions">
          <button class="btn-action btn-show" data-action="show" data-download-id="${backup.downloadId}" title="Show file in Downloads folder">
            📁 Show
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function showBackupInFolder(downloadId) {
  try {
    await chrome.downloads.show(downloadId);
  } catch (error) {
    try {
      await chrome.downloads.showDefaultFolder();
      showNotification('Backup file may have been moved. Check Downloads folder for files starting with "tabmaster-backup-"', 'info');
    } catch (e) {
      showNotification('Could not open Downloads folder', 'error');
    }
  }
}

// Export for dashboard.js
window.initializeExportImport = function() {
  _initExportImport();
  _initScheduledBackups();
};