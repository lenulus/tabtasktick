// Export/Import functionality for the dashboard

let importedData = null;

// Initialize export/import functionality
function initializeExportImport() {
  // Update tab counts
  updateTabCounts();

  // Export button
  const exportBtn = document.getElementById('exportDataBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', handleExport);
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

// Initialize when the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExportImport);
} else {
  initializeExportImport();
}

// Export for use in dashboard.js
window.initializeExportImport = initializeExportImport;