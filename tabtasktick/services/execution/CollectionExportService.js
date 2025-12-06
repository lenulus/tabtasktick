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

import { getCollection } from '../utils/storage-queries.js';
import { buildCollectionExport, buildMultipleCollectionExports } from '../utils/collectionExportBuilder.js';

/**
 * Export format version (semver)
 * Increment on schema changes
 *
 * Version History:
 * - 1.0: Initial format (folders with tabs, tasks)
 * - 1.1: Added ungroupedTabs field for tabs without folders
 * @constant
 */
const EXPORT_VERSION = '1.1';

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
  // Validate collection exists
  const collection = await getCollection(collectionId);
  if (!collection) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  // Use shared builder for export data
  const exportData = await buildCollectionExport(collectionId, options);

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
  // Validate all collections exist first
  for (const id of collectionIds) {
    const collection = await getCollection(id);
    if (!collection) {
      throw new Error(`Collection not found: ${id}`);
    }
  }

  // Use shared builder for all collections
  const collections = await buildMultipleCollectionExports(collectionIds, options);

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

// Removed buildCollectionExport and convertTabIdsToReferences - now using shared implementations from collectionExportBuilder.js

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

  // Create data URL (service workers don't support URL.createObjectURL)
  // Base64 encode to ensure proper encoding of special characters
  const base64 = btoa(unescape(encodeURIComponent(jsonString)));
  const dataUrl = `data:application/json;base64,${base64}`;

  // Initiate download
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url: dataUrl,
        filename,
        saveAs: true // Prompt user for location
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Download failed: ${chrome.runtime.lastError.message}`));
        } else {
          resolve({ url: dataUrl, downloadId });
        }
      }
    );
  });
}
