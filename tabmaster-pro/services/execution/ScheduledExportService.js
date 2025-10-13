/**
 * @file Manages automatic backup system with scheduled exports to Downloads folder.
 * Creates full snapshots via chrome.downloads API for disaster recovery.
 *
 * Architecture:
 * - Delegates snapshot creation to ExportImportService
 * - Uses chrome.downloads for unlimited file storage
 * - Tracks only metadata in chrome.storage.local (<5KB)
 * - Follows SnoozeService alarm patterns
 */

import * as ExportImportService from '../ExportImportService.js';

// Storage keys
const CONFIG_KEY = 'scheduled_export_config';
const HISTORY_KEY = 'backup_history';

// Alarm names
const ALARM_NAME = 'scheduled_backup';
const ALARM_CLEANUP = 'scheduled_backup_cleanup';

// Default configuration
const DEFAULT_CONFIG = {
  enabled: false,
  frequency: 'daily', // 'hourly', 'daily', 'weekly'
  time: null, // Time of day for daily/weekly backups (HH:MM format, null = use current time)
  retention: 5, // Keep last 5 backups (fixed)
  lastRun: null
};

// Service state
let isInitialized = false;

/**
 * Lazy initialization for service worker restarts
 */
async function ensureInitialized() {
  if (!isInitialized) {
    await initialize();
  }
}

/**
 * Initializes the ScheduledExportService.
 * Sets up alarm listeners and loads configuration.
 */
export async function initialize() {
  console.log('ScheduledExportService: Initializing...');

  // Load config and setup alarms if enabled
  const config = await getScheduledExportConfig();
  if (config.enabled) {
    await setupAlarms(config.frequency, config.time);
  }

  isInitialized = true;
  console.log('ScheduledExportService: Initialized');
}

/**
 * Enables scheduled backups with the provided configuration
 * @param {Object} config - Configuration object
 * @param {boolean} config.enabled - Whether backups are enabled
 * @param {string} config.frequency - Backup frequency ('hourly', 'daily', 'weekly')
 * @param {number} config.retention - Number of backups to keep (0 = unlimited)
 * @returns {Promise<void>}
 */
export async function enableScheduledExports(config) {
  await ensureInitialized();

  const newConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    enabled: true
  };

  await chrome.storage.local.set({ [CONFIG_KEY]: newConfig });
  await setupAlarms(newConfig.frequency, newConfig.time);

  console.log('ScheduledExportService: Enabled with frequency:', newConfig.frequency, 'at', newConfig.time);
}

/**
 * Disables scheduled backups
 * @returns {Promise<void>}
 */
export async function disableScheduledExports() {
  await ensureInitialized();

  const config = await getScheduledExportConfig();
  config.enabled = false;

  await chrome.storage.local.set({ [CONFIG_KEY]: config });

  // Clear alarms
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.clear(ALARM_CLEANUP);

  console.log('ScheduledExportService: Disabled');
}

/**
 * Gets the current backup configuration
 * @returns {Promise<Object>} Current configuration
 */
export async function getScheduledExportConfig() {
  const data = await chrome.storage.local.get(CONFIG_KEY);
  return data[CONFIG_KEY] || DEFAULT_CONFIG;
}

/**
 * Manually triggers a backup immediately
 * @param {Object} state - Export state from background
 * @param {Map} tabTimeData - Tab time tracking data
 * @returns {Promise<Object>} Result with downloadId and metadata
 */
export async function triggerManualBackup(state, tabTimeData) {
  await ensureInitialized();

  console.log('ScheduledExportService: Manual backup triggered');

  try {
    const result = await performScheduledExport(false, state, tabTimeData); // false = manual backup
    return { success: true, ...result };
  } catch (error) {
    console.error('ScheduledExportService: Manual backup failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Gets the list of tracked backup downloads
 * @returns {Promise<Array>} Array of backup metadata
 */
export async function getBackupHistory() {
  await ensureInitialized();
  const data = await chrome.storage.local.get(HISTORY_KEY);
  return data[HISTORY_KEY] || [];
}

/**
 * Deletes a backup from tracking and optionally from disk
 * @param {number} downloadId - Chrome download ID
 * @param {boolean} deleteFile - Whether to also delete the file from disk
 * @returns {Promise<void>}
 */
export async function deleteBackup(downloadId, deleteFile = false) {
  await ensureInitialized();

  const history = await getBackupHistory();
  const filtered = history.filter(b => b.downloadId !== downloadId);

  await chrome.storage.local.set({ [HISTORY_KEY]: filtered });

  if (deleteFile) {
    try {
      // Remove file from disk
      await chrome.downloads.removeFile(downloadId);
      // Remove from download history
      await chrome.downloads.erase({ id: downloadId });
      console.log(`ScheduledExportService: Deleted backup file for downloadId ${downloadId}`);
    } catch (error) {
      console.log(`ScheduledExportService: Could not delete file for downloadId ${downloadId}:`, error.message);
    }
  }

  console.log(`ScheduledExportService: Removed backup ${downloadId} from tracking`);
}

/**
 * Handles alarm events for scheduled backups
 * @param {Object} alarm - Chrome alarm object
 * @returns {Promise<void>}
 */
export async function handleAlarm(alarm) {
  await ensureInitialized();

  if (alarm.name === ALARM_NAME) {
    console.log('ScheduledExportService: Scheduled backup alarm fired');
    const config = await getScheduledExportConfig();

    if (config.enabled) {
      await performScheduledExport(true); // true = automatic backup
    }
  } else if (alarm.name === ALARM_CLEANUP) {
    console.log('ScheduledExportService: Cleanup alarm fired');
    await cleanupOldBackups();
  }
}

/**
 * Sets up chrome.alarms for scheduled backups
 * @param {string} frequency - Backup frequency
 * @param {string|null} time - Time of day in HH:MM format (for daily/weekly), null = use current time
 * @returns {Promise<void>}
 */
async function setupAlarms(frequency, time = null) {
  // Clear existing alarms
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.clear(ALARM_CLEANUP);

  const now = new Date();

  // Parse time (HH:MM format) or use current time
  let hours, minutes;
  if (time) {
    [hours, minutes] = time.split(':').map(Number);
  } else {
    hours = now.getHours();
    minutes = now.getMinutes();
  }

  // Calculate next occurrence
  const nextRun = new Date();
  nextRun.setHours(hours, minutes, 0, 0);

  // If the time has already passed today, schedule for the next period
  if (nextRun <= now) {
    if (frequency === 'weekly') {
      nextRun.setDate(nextRun.getDate() + 7);
    } else if (frequency === 'daily') {
      nextRun.setDate(nextRun.getDate() + 1);
    } else {
      // For hourly, start next hour
      nextRun.setTime(now.getTime() + (60 * 60 * 1000));
    }
  }

  const periods = {
    'hourly': 60,
    'daily': 60 * 24,
    'weekly': 60 * 24 * 7
  };

  const periodInMinutes = periods[frequency];
  if (periodInMinutes) {
    await chrome.alarms.create(ALARM_NAME, {
      periodInMinutes,
      when: nextRun.getTime()
    });

    const timeStr = time || `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    console.log(`ScheduledExportService: Alarm set for ${frequency} backups at ${timeStr} (first run: ${nextRun.toLocaleString()})`);
  }

  // Daily cleanup check
  await chrome.alarms.create(ALARM_CLEANUP, {
    periodInMinutes: 60 * 24,
    when: Date.now() + (60 * 24 * 60 * 1000) // First run in 24 hours
  });
}

/**
 * Performs the actual backup export
 * @param {boolean} automatic - Whether this is an automatic backup
 * @param {Object} state - Export state (for manual backups, passed from background)
 * @param {Map} tabTimeData - Tab time data (for manual backups)
 * @returns {Promise<Object>} Result with downloadId and metadata
 */
async function performScheduledExport(automatic = true, state = null, tabTimeData = null) {
  console.log(`ScheduledExportService: Starting ${automatic ? 'automatic' : 'manual'} backup...`);

  // Step 1: Create full snapshot by delegating to ExportImportService
  const exportData = await createFullSnapshot(state, tabTimeData);

  // Step 2: Download snapshot to Downloads folder
  const downloadResult = await downloadSnapshot(exportData, automatic);

  // Step 3: Update last run time
  const config = await getScheduledExportConfig();
  config.lastRun = Date.now();
  await chrome.storage.local.set({ [CONFIG_KEY]: config });

  // Step 4: Trigger cleanup if needed
  const history = await getBackupHistory();
  if (config.retention > 0 && history.length >= config.retention) {
    await cleanupOldBackups();
  }

  console.log(`ScheduledExportService: Backup complete (downloadId: ${downloadResult.downloadId})`);

  return downloadResult;
}

/**
 * Creates a full snapshot of the current session
 * Delegates to ExportImportService for actual export logic
 * @param {Object} state - Export state (passed from background for manual backups, null for automatic)
 * @param {Map} tabTimeData - Tab time data (passed from background for manual backups, null for automatic)
 * @returns {Promise<Object>} Full export data
 */
async function createFullSnapshot(state = null, tabTimeData = null) {
  // If state not provided (automatic backup from alarm), fetch it via message
  if (!state) {
    const response = await chrome.runtime.sendMessage({
      action: 'getExportState'
    });

    if (!response || !response.state) {
      throw new Error('Failed to get export state from background');
    }

    state = response.state;
    tabTimeData = response.tabTimeData;
  }

  // Create FULL export with ALL data using ExportImportService
  const exportData = await ExportImportService.exportData(
    {
      scope: 'all-windows',
      format: 'json',
      includeRules: true,
      includeSnoozed: true,
      includeSettings: true,
      includeStatistics: true
    },
    state,
    tabTimeData
  );

  return exportData;
}

/**
 * Downloads a snapshot to the Downloads folder
 * @param {Object} exportData - Full export data
 * @param {boolean} automatic - Whether this is an automatic backup
 * @returns {Promise<Object>} Download metadata with downloadId
 */
async function downloadSnapshot(exportData, automatic) {
  // Convert snapshot to JSON string
  const jsonString = JSON.stringify(exportData, null, 2);

  // Generate filename with timestamp
  const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `tabmaster-backup-${date}.json`;

  // Create data URL (service workers don't have URL.createObjectURL)
  const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);

  // Download to Downloads folder (no saveAs = automatic save)
  const downloadId = await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: false, // Auto-save to Downloads
    conflictAction: 'uniquify' // Add number if file exists
  });

  // Track download metadata
  const metadata = {
    downloadId,
    timestamp: Date.now(),
    filename,
    size: jsonString.length, // Size in bytes
    tabCount: exportData.session.tabs.length,
    windowCount: exportData.session.windows.length,
    automatic
  };

  await trackDownload(metadata);

  return metadata;
}

/**
 * Tracks a download in backup history
 * @param {Object} metadata - Download metadata
 * @returns {Promise<void>}
 */
async function trackDownload(metadata) {
  const history = await getBackupHistory();
  history.push(metadata);
  await chrome.storage.local.set({ [HISTORY_KEY]: history });

  console.log(`ScheduledExportService: Tracked backup - ${metadata.filename}`);
}

/**
 * Cleans up old backups based on retention policy
 * @returns {Promise<void>}
 */
async function cleanupOldBackups() {
  const config = await getScheduledExportConfig();
  const history = await getBackupHistory();

  if (config.retention === 0 || history.length <= config.retention) {
    console.log('ScheduledExportService: No cleanup needed');
    return;
  }

  // Sort by timestamp, oldest first
  history.sort((a, b) => a.timestamp - b.timestamp);

  // Identify backups to delete and keep
  const toKeep = history.slice(-config.retention);
  const toDelete = history.slice(0, -config.retention);

  console.log(`ScheduledExportService: Cleaning up ${toDelete.length} old backups`);

  // Delete old downloads from disk
  for (const backup of toDelete) {
    try {
      // Remove file from Downloads folder
      await chrome.downloads.removeFile(backup.downloadId);
      // Remove from download history
      await chrome.downloads.erase({ id: backup.downloadId });
      console.log(`ScheduledExportService: Deleted old backup - ${backup.filename}`);
    } catch (error) {
      console.log(`ScheduledExportService: Could not delete backup file ${backup.filename}:`, error.message);
    }
  }

  // Update stored history to only keep recent backups
  await chrome.storage.local.set({ [HISTORY_KEY]: toKeep });

  console.log(`ScheduledExportService: Cleanup complete, kept ${toKeep.length} backups`);
}

/**
 * Validates that a backup file still exists
 * @param {Object} backup - Backup metadata
 * @returns {Promise<Object>} Validation result
 */
export async function validateBackup(backup) {
  const downloads = await chrome.downloads.search({ id: backup.downloadId });

  if (downloads.length === 0) {
    return {
      exists: false,
      inHistory: false
    };
  }

  const download = downloads[0];
  return {
    exists: download.exists !== false,
    inHistory: true,
    path: download.filename,
    fileSize: download.fileSize,
    state: download.state
  };
}
