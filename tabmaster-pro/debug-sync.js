import * as ProgressiveSyncService from './services/execution/ProgressiveSyncService.js';
import { getAllCollections } from './services/utils/storage-queries.js';

// 1. Check initialization
document.getElementById('checkInit').addEventListener('click', async () => {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkProgressiveSyncInit' });
    document.getElementById('initResult').textContent = JSON.stringify(response, null, 2);
  } catch (error) {
    document.getElementById('initResult').textContent = `Error: ${error.message}`;
  }
});

// 2. List active collections
document.getElementById('listActive').addEventListener('click', async () => {
  try {
    const collections = await getAllCollections();
    const active = collections.filter(c => c.isActive);

    const result = active.map(c => ({
      id: c.id,
      name: c.name,
      windowId: c.windowId,
      isActive: c.isActive,
      settings: c.settings
    }));

    document.getElementById('activeResult').textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    document.getElementById('activeResult').textContent = `Error: ${error.message}`;
  }
});

// 3. Check settings cache
document.getElementById('checkCache').addEventListener('click', async () => {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getProgressiveSyncCache' });
    document.getElementById('cacheResult').textContent = JSON.stringify(response, null, 2);
  } catch (error) {
    document.getElementById('cacheResult').textContent = `Error: ${error.message}`;
  }
});

// 4. Check specific collection
document.getElementById('checkCollection').addEventListener('click', async () => {
  const collectionId = document.getElementById('collectionId').value.trim();
  if (!collectionId) {
    document.getElementById('collectionResult').textContent = 'Please enter a collection ID';
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'checkCollectionSync',
      collectionId
    });
    document.getElementById('collectionResult').textContent = JSON.stringify(response, null, 2);
  } catch (error) {
    document.getElementById('collectionResult').textContent = `Error: ${error.message}`;
  }
});

// 5. Manual sync test
document.getElementById('refreshCache').addEventListener('click', async () => {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'refreshProgressiveSyncCache' });
    document.getElementById('syncTestResult').textContent =
      `Cache refreshed. Found ${response.activeCollectionCount} active collections.\n` +
      `Now open a new tab in your collection's window and wait 5 seconds.`;
  } catch (error) {
    document.getElementById('syncTestResult').textContent = `Error: ${error.message}`;
  }
});

document.getElementById('checkPending').addEventListener('click', async () => {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getProgressiveSyncPending' });
    document.getElementById('syncTestResult').textContent = JSON.stringify(response, null, 2);
  } catch (error) {
    document.getElementById('syncTestResult').textContent = `Error: ${error.message}`;
  }
});

// 6. View logs
let currentLogs = '';

document.getElementById('fetchLogs').addEventListener('click', async () => {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getProgressiveSyncLogs',
      limit: 500
    });

    if (response.success && response.logs.length > 0) {
      const formatted = response.logs.map(log => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const levelTag = log.level.toUpperCase().padEnd(5);
        const dataStr = log.data ? '\n  ' + JSON.stringify(log.data, null, 2).split('\n').join('\n  ') : '';
        return `[${time}] ${levelTag} ${log.message}${dataStr}`;
      }).join('\n\n');

      currentLogs = formatted;
      document.getElementById('logsResult').textContent =
        `Showing ${response.logs.length} log entries:\n\n${formatted}`;
    } else {
      document.getElementById('logsResult').textContent =
        'No logs available. Try opening a tab in your collection window first.';
    }
  } catch (error) {
    document.getElementById('logsResult').textContent = `Error: ${error.message}`;
  }
});

document.getElementById('clearLogs').addEventListener('click', async () => {
  try {
    await chrome.runtime.sendMessage({ action: 'clearProgressiveSyncLogs' });
    document.getElementById('logsResult').textContent = 'Logs cleared. New activity will be captured.';
    currentLogs = '';
  } catch (error) {
    document.getElementById('logsResult').textContent = `Error: ${error.message}`;
  }
});

document.getElementById('copyLogs').addEventListener('click', async () => {
  if (!currentLogs) {
    alert('No logs to copy. Click "Fetch Logs" first.');
    return;
  }

  try {
    await navigator.clipboard.writeText(currentLogs);
    document.getElementById('copyLogs').textContent = 'Copied! ✓';
    setTimeout(() => {
      document.getElementById('copyLogs').textContent = 'Copy Logs to Clipboard';
    }, 2000);
  } catch (error) {
    alert('Failed to copy. Please select and copy manually.');
  }
});
