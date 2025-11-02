/**
 * @file ScheduledExportService - Automatic backup system with scheduled snapshots
 *
 * @description
 * The ScheduledExportService provides automatic periodic backups of TabMaster Pro data
 * to the user's Downloads folder. It implements a "set and forget" backup system that
 * creates full snapshots (tabs, windows, groups, rules, settings, snoozed tabs) at
 * configurable intervals (hourly, daily, weekly) with automatic cleanup of old backups.
 *
 * The service follows a storage-optimized architecture: backup files are saved to disk
 * via chrome.downloads API (unlimited storage), while only lightweight metadata (~1KB
 * per backup) is tracked in chrome.storage.local. This allows tracking dozens of backups
 * without hitting Chrome's storage quota.
 *
 * Key features include manual on-demand backups, retention policy enforcement (keeps last
 * 5 backups by default), chrome.alarms persistence across browser restarts, and lazy
 * initialization to handle service worker restarts. The service delegates actual snapshot
 * creation to ExportImportService (reuses existing export logic) and manages only the
 * scheduling, download tracking, and cleanup concerns.
 *
 * Implemented during Phase 8.4 to provide disaster recovery for power users managing
 * 200+ tabs across multiple windows.
 *
 * @module services/execution/ScheduledExportService
 *
 * @architecture
 * - Layer: Execution Service (Orchestrator)
 * - Dependencies:
 *   - ExportImportService (snapshot creation - reuses export logic)
 *   - chrome.downloads (file storage - unlimited)
 *   - chrome.alarms (scheduling - persists across restarts)
 *   - chrome.storage.local (metadata only - <5KB)
 * - Used By: Background message handlers, Dashboard backup UI
 * - Pattern: Orchestrator - delegates execution, manages scheduling
 *
 * @example
 * // Enable daily backups at 2:00 AM
 * import * as ScheduledExportService from './services/execution/ScheduledExportService.js';
 *
 * await ScheduledExportService.enableScheduledExports({
 *   frequency: 'daily',
 *   time: '02:00',
 *   retention: 5
 * });
 *
 * @example
 * // Trigger manual backup immediately
 * const result = await ScheduledExportService.triggerManualBackup(state, tabTimeData);
 * if (result.success) {
 *   console.log(`Backup saved: ${result.filename}`);
 * }
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
 * Initializes the ScheduledExportService on extension startup.
 *
 * Loads saved configuration from storage and sets up chrome.alarms if backups
 * are enabled. Must be called once during background service worker initialization
 * (both onInstalled and onStartup events).
 *
 * The service implements lazy initialization to handle service worker restarts,
 * but explicit initialization is recommended for proper alarm setup.
 *
 * @returns {Promise<void>}
 *
 * @example
 * // In background service worker
 * import * as ScheduledExportService from './services/execution/ScheduledExportService.js';
 *
 * chrome.runtime.onInstalled.addListener(async () => {
 *   await ScheduledExportService.initialize();
 * });
 *
 * chrome.runtime.onStartup.addListener(async () => {
 *   await ScheduledExportService.initialize();
 * });
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
 * Enables scheduled backups with specified configuration.
 *
 * Sets up chrome.alarms to trigger periodic backups at the configured frequency
 * and time. Alarms persist across browser restarts. Configuration is saved to
 * chrome.storage.local for persistence.
 *
 * @param {Object} config - Backup configuration
 * @param {boolean} config.enabled - Whether backups are enabled (forced to true)
 * @param {string} config.frequency - Backup frequency: 'hourly', 'daily', or 'weekly'
 * @param {string} [config.time=null] - Time of day in HH:MM format (e.g., '02:00' for 2 AM). If null, uses current time.
 * @param {number} [config.retention=5] - Number of recent backups to keep (older ones auto-deleted)
 *
 * @returns {Promise<void>}
 *
 * @example
 * // Daily backups at 2:00 AM, keep last 7
 * await enableScheduledExports({
 *   frequency: 'daily',
 *   time: '02:00',
 *   retention: 7
 * });
 *
 * @example
 * // Hourly backups starting now, keep last 24
 * await enableScheduledExports({
 *   frequency: 'hourly',
 *   time: null, // uses current time
 *   retention: 24
 * });
 *
 * @example
 * // Weekly backups every Sunday at midnight
 * await enableScheduledExports({
 *   frequency: 'weekly',
 *   time: '00:00',
 *   retention: 4
 * });
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
 * Disables scheduled backups and clears alarms.
 *
 * Stops all scheduled backups by clearing chrome.alarms and updating configuration.
 * Existing backup files and metadata are preserved - only future automatic backups
 * are prevented. Manual backups can still be triggered.
 *
 * @returns {Promise<void>}
 *
 * @example
 * // Stop automatic backups
 * await disableScheduledExports();
 * console.log('Automatic backups disabled (existing backups preserved)');
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
 * Retrieves current backup configuration from storage.
 *
 * Returns configuration including enabled status, frequency, time, retention policy,
 * and timestamp of last successful backup. If no configuration exists, returns default
 * configuration (disabled, daily, no time set, retain 5 backups).
 *
 * @returns {Promise<Object>} Backup configuration
 * @returns {boolean} return.enabled - Whether scheduled backups are enabled
 * @returns {string} return.frequency - Backup frequency ('hourly', 'daily', 'weekly')
 * @returns {string|null} return.time - Scheduled time in HH:MM format (null = use current time)
 * @returns {number} return.retention - Number of backups to keep
 * @returns {number|null} return.lastRun - Timestamp of last backup (null if never run)
 *
 * @example
 * // Check current backup settings
 * const config = await getScheduledExportConfig();
 * if (config.enabled) {
 *   console.log(`Backups run ${config.frequency} at ${config.time}, keeping ${config.retention} backups`);
 * }
 */
export async function getScheduledExportConfig() {
  const data = await chrome.storage.local.get(CONFIG_KEY);
  return data[CONFIG_KEY] || DEFAULT_CONFIG;
}

/**
 * Triggers an immediate manual backup (bypasses schedule).
 *
 * Creates a full snapshot and downloads it to the Downloads folder immediately,
 * regardless of schedule settings. Useful for "Backup Now" buttons in UI or
 * before major operations. The backup is tracked in history and counts toward
 * retention policy (may trigger cleanup of old backups).
 *
 * @param {Object} state - Export state from background (rules, settings, etc.)
 * @param {Map} tabTimeData - Tab time tracking data (lastAccessed times)
 *
 * @returns {Promise<Object>} Backup result
 * @returns {boolean} return.success - Whether backup succeeded
 * @returns {number} [return.downloadId] - Chrome download ID (if successful)
 * @returns {string} [return.filename] - Generated filename (if successful)
 * @returns {number} [return.size] - Backup size in bytes (if successful)
 * @returns {number} [return.tabCount] - Number of tabs backed up (if successful)
 * @returns {number} [return.windowCount] - Number of windows backed up (if successful)
 * @returns {string} [return.error] - Error message (if failed)
 *
 * @example
 * // Trigger backup from background message handler
 * const result = await triggerManualBackup(state, tabTimeData);
 * if (result.success) {
 *   console.log(`Manual backup saved: ${result.filename} (${result.tabCount} tabs)`);
 * } else {
 *   console.error(`Backup failed: ${result.error}`);
 * }
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
 * Retrieves list of tracked backup downloads from storage.
 *
 * Returns metadata for all tracked backups (not the actual files). Each entry
 * includes download ID, timestamp, filename, size, tab count, window count, and
 * whether the backup was automatic or manual. Useful for displaying backup history
 * in Dashboard UI.
 *
 * @returns {Promise<Array>} Array of backup metadata objects
 * @returns {number} return[].downloadId - Chrome download ID
 * @returns {number} return[].timestamp - Unix timestamp when backup was created
 * @returns {string} return[].filename - Filename (e.g., 'tabmaster-backup-2025-01-15T14-30-00.json')
 * @returns {number} return[].size - Backup size in bytes
 * @returns {number} return[].tabCount - Number of tabs in backup
 * @returns {number} return[].windowCount - Number of windows in backup
 * @returns {boolean} return[].automatic - Whether backup was automatic (true) or manual (false)
 *
 * @example
 * // Display backup history in UI
 * const backups = await getBackupHistory();
 * backups.forEach(backup => {
 *   const date = new Date(backup.timestamp);
 *   const sizeMB = (backup.size / 1024 / 1024).toFixed(2);
 *   console.log(`${date.toLocaleString()}: ${backup.tabCount} tabs, ${sizeMB} MB`);
 * });
 */
export async function getBackupHistory() {
  await ensureInitialized();
  const data = await chrome.storage.local.get(HISTORY_KEY);
  return data[HISTORY_KEY] || [];
}

/**
 * Deletes a backup from tracking and optionally from disk.
 *
 * Removes backup metadata from storage. If deleteFile=true, also removes the
 * actual backup file from the Downloads folder and Chrome's download history.
 * This is used for manual deletion ("Delete" button in UI) or automatic cleanup
 * (retention policy enforcement).
 *
 * @param {number} downloadId - Chrome download ID to delete
 * @param {boolean} [deleteFile=false] - Whether to also delete file from Downloads folder
 *
 * @returns {Promise<void>}
 *
 * @example
 * // Remove from tracking only (keep file)
 * await deleteBackup(123, false);
 *
 * @example
 * // Remove from tracking and delete file
 * await deleteBackup(123, true);
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
 * Handles chrome.alarms events for scheduled backups and cleanup.
 *
 * This function should be called from the chrome.alarms.onAlarm listener in the
 * background service worker. It processes two types of alarms:
 *
 * 1. Scheduled backup alarm (ALARM_NAME) - triggers automatic backup if enabled
 * 2. Cleanup alarm (ALARM_CLEANUP) - runs daily cleanup of old backups per retention policy
 *
 * Alarms persist across browser restarts and service worker restarts via chrome.alarms API.
 *
 * @param {Object} alarm - Chrome alarm object with name property
 * @param {string} alarm.name - Alarm identifier
 *
 * @returns {Promise<void>}
 *
 * @example
 * // In background service worker
 * import * as ScheduledExportService from './services/execution/ScheduledExportService.js';
 *
 * chrome.alarms.onAlarm.addListener(async (alarm) => {
 *   await ScheduledExportService.handleAlarm(alarm);
 * });
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
      includeStatistics: true,
      includeCollections: true // Include collections and tasks from IndexedDB
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
 * Validates that a backup file still exists in the Downloads folder.
 *
 * Checks if the backup file referenced by metadata still exists on disk and in
 * Chrome's download history. Useful for detecting manually deleted files or
 * detecting when files were moved/renamed outside of TabMaster Pro.
 *
 * Returns detailed status including file existence, download history presence,
 * file path, size, and download state.
 *
 * @param {Object} backup - Backup metadata object (from getBackupHistory)
 * @param {number} backup.downloadId - Chrome download ID to validate
 *
 * @returns {Promise<Object>} Validation result
 * @returns {boolean} return.exists - Whether file exists on disk
 * @returns {boolean} return.inHistory - Whether download ID exists in Chrome history
 * @returns {string} [return.path] - Full file path (if in history)
 * @returns {number} [return.fileSize] - Actual file size in bytes (if in history)
 * @returns {string} [return.state] - Download state: 'complete', 'interrupted', etc. (if in history)
 *
 * @example
 * // Check if backup file still exists
 * const backups = await getBackupHistory();
 * const backup = backups[0];
 * const validation = await validateBackup(backup);
 * if (!validation.exists) {
 *   console.log('Backup file was deleted manually');
 * }
 *
 * @example
 * // Validate all backups and find missing files
 * const backups = await getBackupHistory();
 * for (const backup of backups) {
 *   const validation = await validateBackup(backup);
 *   if (!validation.exists) {
 *     console.warn(`Missing: ${backup.filename}`);
 *   }
 * }
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
