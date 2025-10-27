/**
 * @file CollectionExportService - Collection export to JSON
 *
 * @description
 * CollectionExportService handles exporting collections to portable JSON format.
 * This is different from TabMaster's session export - it exports collections with
 * folders, tabs, and tasks for backup, sharing, and migration.
 *
 * Export Format:
 * - Nested structure (folders contain tabs) for human readability
 * - Task tab references use folder/tab indices (not IDs) for portability
 * - Version field for forward/backward compatibility
 * - Optional inclusion of settings, metadata, tasks
 *
 * Features:
 * - Export single collection or multiple collections
 * - Configurable options (include tasks, settings, metadata)
 * - Automatic file download via chrome.downloads API
 * - Human-readable JSON with proper indentation
 * - Safe filename generation (sanitized, timestamped)
 *
 * @module services/execution/CollectionExportService
 *
 * @architecture
 * - Layer: Execution Service
 * - Dependencies: storage-queries.js (data access), chrome.downloads (file save)
 * - Used By: Background message handlers, UI surfaces
 * - Storage: Reads from IndexedDB, writes to filesystem
 *
 * @example
 * // Export single collection
 * import * as CollectionExportService from './services/execution/CollectionExportService.js';
 *
 * const result = await CollectionExportService.exportCollection('col_123', {
 *   includeTasks: true,
 *   includeSettings: true
 * });
 *
 * console.log(`Exported to: ${result.filename}`);
 *
 * @example
 * // Export multiple collections
 * const result = await CollectionExportService.exportCollections(
 *   ['col_123', 'col_456'],
 *   { includeTasks: false }
 * );
 */

import {
  getCollection,
  getFoldersByCollection,
  getTabsByFolder,
  getTasksByCollection
} from '../utils/storage-queries.js';

/**
 * Export format version (semver)
 * Increment on schema changes
 * @constant
 */
const EXPORT_VERSION = '1.0';

/**
 * Maximum filename length (characters)
 * @constant
 */
const MAX_FILENAME_LENGTH = 200;

/**
 * Export a single collection to JSON file.
 *
 * Exports collection with all folders, tabs, and optionally tasks to a
 * human-readable JSON file. Downloads file via chrome.downloads API.
 *
 * Export includes:
 * - Collection metadata (name, description, icon, color, tags)
 * - All folders with positions and colors
 * - All tabs within folders with URLs, titles, notes, positions
 * - Tasks (optional) with tab references converted to indices
 * - Settings (optional) like trackingEnabled, syncDebounceMs
 * - Metadata timestamps (optional) like createdAt, lastAccessed
 *
 * Options:
 * - includeTasks: Include tasks in export (default: true)
 * - includeSettings: Include collection settings (default: true)
 * - includeMetadata: Include timestamps (default: false)
 *
 * File naming: collection-{sanitized-name}-{timestamp}.json
 *
 * @param {string} collectionId - Collection ID to export
 * @param {Object} [options] - Export options
 * @param {boolean} [options.includeTasks=true] - Include tasks
 * @param {boolean} [options.includeSettings=true] - Include settings
 * @param {boolean} [options.includeMetadata=false] - Include timestamps
 *
 * @returns {Promise<Object>} Export result
 * @returns {string} return.filename - Downloaded filename
 * @returns {string} return.downloadUrl - Blob URL
 * @returns {number} return.downloadId - Chrome download ID
 * @returns {Object} return.data - Exported data object
 *
 * @throws {Error} If collection not found
 * @throws {Error} If chrome.downloads fails
 *
 * @example
 * // Export with tasks and settings
 * const result = await exportCollection('col_123', {
 *   includeTasks: true,
 *   includeSettings: true
 * });
 * console.log(`Saved as: ${result.filename}`);
 *
 * @example
 * // Export collection data only (no tasks, no metadata)
 * const minimal = await exportCollection('col_456', {
 *   includeTasks: false,
 *   includeSettings: false,
 *   includeMetadata: false
 * });
 */
export async function exportCollection(collectionId, options = {}) {
  // Default options
  const opts = {
    includeTasks: options.includeTasks !== false, // default true
    includeSettings: options.includeSettings !== false, // default true
    includeMetadata: options.includeMetadata === true // default false
  };

  // Get collection
  const collection = await getCollection(collectionId);
  if (!collection) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  // Build export data
  const exportData = await buildCollectionExport(collection, opts);

  // Wrap in export format
  const exportDoc = {
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    collections: [exportData]
  };

  // Generate filename
  const filename = generateFilename(collection.name);

  // Download file
  const downloadResult = await downloadJSON(exportDoc, filename);

  return {
    filename,
    downloadUrl: downloadResult.url,
    downloadId: downloadResult.downloadId,
    data: exportDoc
  };
}

/**
 * Export multiple collections to single JSON file.
 *
 * Exports array of collections with all their data. Useful for batch backup
 * or sharing entire workspace.
 *
 * @param {string[]} collectionIds - Array of collection IDs to export
 * @param {Object} [options] - Export options (same as exportCollection)
 *
 * @returns {Promise<Object>} Export result
 * @returns {string} return.filename - Downloaded filename
 * @returns {string} return.downloadUrl - Blob URL
 * @returns {number} return.downloadId - Chrome download ID
 * @returns {Object} return.data - Exported data object
 * @returns {number} return.count - Number of collections exported
 *
 * @throws {Error} If any collection not found
 * @throws {Error} If chrome.downloads fails
 *
 * @example
 * // Export all work collections
 * const result = await exportCollections(['col_1', 'col_2', 'col_3']);
 * console.log(`Exported ${result.count} collections`);
 */
export async function exportCollections(collectionIds, options = {}) {
  // Default options
  const opts = {
    includeTasks: options.includeTasks !== false,
    includeSettings: options.includeSettings !== false,
    includeMetadata: options.includeMetadata === true
  };

  // Build export data for each collection
  const collections = [];
  for (const id of collectionIds) {
    const collection = await getCollection(id);
    if (!collection) {
      throw new Error(`Collection not found: ${id}`);
    }

    const exportData = await buildCollectionExport(collection, opts);
    collections.push(exportData);
  }

  // Wrap in export format
  const exportDoc = {
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    collections
  };

  // Generate filename
  const filename = generateBatchFilename(collections.length);

  // Download file
  const downloadResult = await downloadJSON(exportDoc, filename);

  return {
    filename,
    downloadUrl: downloadResult.url,
    downloadId: downloadResult.downloadId,
    data: exportDoc,
    count: collections.length
  };
}

/**
 * Build export data for a single collection.
 *
 * Internal helper that constructs the nested export structure:
 * - Collection metadata
 * - Folders array with tabs nested inside
 * - Tasks array with tab references converted to indices
 *
 * @private
 * @param {Object} collection - Collection object from storage
 * @param {Object} options - Export options
 * @returns {Promise<Object>} Export data structure
 */
async function buildCollectionExport(collection, options) {
  // Start with collection metadata
  const exportData = {
    name: collection.name,
    description: collection.description,
    icon: collection.icon,
    color: collection.color,
    tags: collection.tags || []
  };

  // Include settings if requested
  if (options.includeSettings && collection.settings) {
    exportData.settings = collection.settings;
  }

  // Include metadata timestamps if requested
  if (options.includeMetadata && collection.metadata) {
    exportData.metadata = {
      createdAt: collection.metadata.createdAt,
      lastAccessed: collection.metadata.lastAccessed
    };
  }

  // Get folders with tabs
  const folders = await getFoldersByCollection(collection.id);
  folders.sort((a, b) => a.position - b.position);

  // Load tabs for each folder (needed for task tab reference conversion)
  for (const folder of folders) {
    const tabs = await getTabsByFolder(folder.id);
    tabs.sort((a, b) => a.position - b.position);
    folder.tabs = tabs; // Attach tabs to folder for reference lookup
  }

  // Build folders array with nested tabs for export
  exportData.folders = [];
  for (const folder of folders) {
    // Build tab array (strip internal fields)
    const tabsExport = folder.tabs.map(tab => ({
      url: tab.url,
      title: tab.title,
      favicon: tab.favicon,
      note: tab.note,
      position: tab.position,
      isPinned: tab.isPinned || false
    }));

    // Build folder object
    exportData.folders.push({
      name: folder.name,
      color: folder.color,
      collapsed: folder.collapsed || false,
      position: folder.position,
      tabs: tabsExport
    });
  }

  // Include tasks if requested
  if (options.includeTasks) {
    const tasks = await getTasksByCollection(collection.id);

    // Build task array with tab references converted to indices
    exportData.tasks = tasks.map(task => {
      const taskExport = {
        summary: task.summary,
        notes: task.notes,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        tags: task.tags || [],
        comments: task.comments || []
      };

      // Convert tab IDs to folder/tab indices
      if (task.tabIds && task.tabIds.length > 0) {
        taskExport.tabReferences = convertTabIdsToReferences(
          task.tabIds,
          folders
        );
      } else {
        taskExport.tabReferences = [];
      }

      // Include metadata if requested
      if (options.includeMetadata) {
        taskExport.createdAt = task.createdAt;
        taskExport.completedAt = task.completedAt;
      }

      return taskExport;
    });
  }

  return exportData;
}

/**
 * Convert tab IDs to folder/tab index references with fallback identifiers.
 *
 * Tasks reference tabs by ID in storage, but export uses indices for portability.
 * This function maps tab IDs to reference objects with:
 * - Primary: folderIndex, tabIndex (fast lookup)
 * - Fallback: url, title (for recovery if indices fail)
 *
 * @private
 * @param {string[]} tabIds - Array of tab IDs
 * @param {Object[]} folders - Folders with tabs (already loaded)
 * @returns {Object[]} Array of {folderIndex, tabIndex, url, title} references
 *
 * @example
 * // Input: ['tab_123', 'tab_456']
 * // Output: [
 * //   {folderIndex: 0, tabIndex: 2, url: 'https://a.com', title: 'Page A'},
 * //   {folderIndex: 1, tabIndex: 0, url: 'https://b.com', title: 'Page B'}
 * // ]
 */
function convertTabIdsToReferences(tabIds, folders) {
  const references = [];

  for (const tabId of tabIds) {
    // Find folder and tab index
    for (let folderIndex = 0; folderIndex < folders.length; folderIndex++) {
      const folder = folders[folderIndex];
      const tabIndex = folder.tabs?.findIndex(t => t.id === tabId);

      if (tabIndex !== undefined && tabIndex !== -1) {
        const tab = folder.tabs[tabIndex];

        // Include fallback identifiers for recovery
        references.push({
          folderIndex,
          tabIndex,
          url: tab.url,
          title: tab.title
        });
        break;
      }
    }
  }

  return references;
}

/**
 * Generate safe filename for single collection export.
 *
 * Format: collection-{sanitized-name}-{timestamp}.json
 * - Sanitizes name (removes special chars, replaces spaces)
 * - Truncates to max length
 * - Adds timestamp for uniqueness
 *
 * @private
 * @param {string} collectionName - Collection name
 * @returns {string} Safe filename
 *
 * @example
 * // Input: "Work Project 2024!"
 * // Output: "collection-work-project-2024-1698765432.json"
 */
function generateFilename(collectionName) {
  const timestamp = Date.now();

  // Sanitize name: lowercase, replace spaces/special chars with dashes
  const sanitized = collectionName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with dash
    .replace(/^-+|-+$/g, '') // Remove leading/trailing dashes
    .slice(0, 50); // Truncate

  // Build filename
  const filename = `collection-${sanitized}-${timestamp}.json`;

  // Ensure within max length
  return filename.slice(0, MAX_FILENAME_LENGTH);
}

/**
 * Generate safe filename for multiple collections export.
 *
 * Format: collections-export-{count}-{timestamp}.json
 *
 * @private
 * @param {number} count - Number of collections
 * @returns {string} Safe filename
 */
function generateBatchFilename(count) {
  const timestamp = Date.now();
  return `collections-export-${count}-${timestamp}.json`;
}

/**
 * Download JSON data as file using chrome.downloads API.
 *
 * Creates blob URL, initiates download, returns download metadata.
 *
 * @private
 * @param {Object} data - Data to export (will be JSON.stringify'd)
 * @param {string} filename - Filename for download
 * @returns {Promise<Object>} Download result
 * @returns {string} return.url - Blob URL
 * @returns {number} return.downloadId - Chrome download ID
 *
 * @throws {Error} If chrome.downloads fails
 */
async function downloadJSON(data, filename) {
  // Convert to JSON with pretty-printing
  const jsonString = JSON.stringify(data, null, 2);

  // Create blob
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  // Initiate download
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url,
        filename,
        saveAs: true // Prompt user for location
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          URL.revokeObjectURL(url);
          reject(new Error(`Download failed: ${chrome.runtime.lastError.message}`));
        } else {
          resolve({ url, downloadId });
        }
      }
    );
  });
}
