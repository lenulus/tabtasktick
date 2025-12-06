/**
 * @file collection-import-export-ui.js - Shared UI helpers for collection import/export
 *
 * @description
 * Provides shared functions for collection import/export UI operations.
 * Eliminates duplicate code across Dashboard, Side Panel, and other UI surfaces.
 *
 * This module handles:
 * - Sending export/import messages to background
 * - Processing and formatting results
 * - Providing consistent default options
 *
 * Each UI surface can call these functions and handle notifications/refresh
 * according to their own patterns.
 *
 * @module services/utils/collection-import-export-ui
 *
 * @architecture
 * - Layer: Utility Service (UI Helper)
 * - Dependencies: chrome.runtime (messaging)
 * - Used By: Dashboard, Side Panel (all collection UI surfaces)
 *
 * @example
 * // In Dashboard
 * import { exportCollection } from './services/utils/collection-import-export-ui.js';
 *
 * const result = await exportCollection('col_123');
 * if (result.success) {
 *   showNotification(`Exported to ${result.filename}`, 'success');
 * }
 */

/**
 * Export a single collection.
 *
 * Sends export message to background service with default options.
 * Returns result object with filename and download metadata.
 *
 * @param {string} collectionId - Collection ID to export
 * @param {Object} [options] - Export options (overrides defaults)
 * @param {boolean} [options.includeTasks=true] - Include tasks in export
 * @param {boolean} [options.includeSettings=true] - Include settings in export
 * @param {boolean} [options.includeMetadata=false] - Include timestamps in export
 *
 * @returns {Promise<Object>} Export result
 * @returns {boolean} return.success - Whether export succeeded
 * @returns {string} return.filename - Downloaded filename
 * @returns {string} return.downloadUrl - Blob URL
 * @returns {number} return.downloadId - Chrome download ID
 *
 * @throws {Error} If collection not found or export fails
 *
 * @example
 * const result = await exportCollection('col_123');
 * console.log(`Exported to ${result.filename}`);
 */
export async function exportCollection(collectionId, options = {}) {
  const defaultOptions = {
    includeTasks: true,
    includeSettings: true,
    includeMetadata: false
  };

  return chrome.runtime.sendMessage({
    action: 'exportCollection',
    collectionId,
    options: { ...defaultOptions, ...options }
  });
}

/**
 * Export all collections.
 *
 * Sends exportAllCollections message to background service.
 * Returns result with count of collections exported.
 *
 * @param {Object} [options] - Export options (same as exportCollection)
 *
 * @returns {Promise<Object>} Export result
 * @returns {boolean} return.success - Whether export succeeded
 * @returns {string} return.filename - Downloaded filename
 * @returns {number} return.count - Number of collections exported
 * @returns {string} return.downloadUrl - Blob URL
 * @returns {number} return.downloadId - Chrome download ID
 *
 * @throws {Error} If export fails
 *
 * @example
 * const result = await exportAllCollections();
 * console.log(`Exported ${result.count} collections`);
 */
export async function exportAllCollections(options = {}) {
  const defaultOptions = {
    includeTasks: true,
    includeSettings: true,
    includeMetadata: false
  };

  return chrome.runtime.sendMessage({
    action: 'exportAllCollections',
    options: { ...defaultOptions, ...options }
  });
}

/**
 * Maximum allowed file size for import (10 MB).
 * @constant
 */
const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Validate import file before processing.
 *
 * Checks:
 * - File exists
 * - File size <= 10MB
 * - File extension is .json
 *
 * @private
 * @param {File} file - File to validate
 * @throws {Error} If validation fails
 */
function validateImportFile(file) {
  // Check file exists
  if (!file) {
    throw new Error('No file selected');
  }

  // Check file size
  if (file.size > MAX_IMPORT_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    const maxMB = (MAX_IMPORT_FILE_SIZE / (1024 * 1024)).toFixed(0);
    throw new Error(`File too large: ${sizeMB}MB (max ${maxMB}MB)`);
  }

  // Check file extension
  if (!file.name.toLowerCase().endsWith('.json')) {
    throw new Error('Invalid file type. Please select a JSON file (.json)');
  }
}

/**
 * Validate JSON format before sending to background.
 *
 * Performs basic JSON parsing to catch obvious errors early.
 * Background will do full schema validation.
 *
 * @private
 * @param {string} text - JSON text to validate
 * @throws {Error} If JSON is invalid
 */
function validateImportJSON(text) {
  // Check not empty
  if (!text || text.trim().length === 0) {
    throw new Error('File is empty');
  }

  // Check valid JSON
  try {
    JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON format: ${error.message}`);
  }
}

/**
 * Import collections from file.
 *
 * Reads file as text, sends to background for import, returns structured result.
 *
 * Performs validation before import:
 * - File size must be <= 10MB
 * - File must have .json extension
 * - Content must be valid JSON
 *
 * Result includes:
 * - imported: Array of successfully imported collections
 * - errors: Array of import errors per collection
 * - stats: Import statistics (counts, warnings)
 *
 * @param {File} file - JSON file to import
 * @param {Object} [options] - Import options (overrides defaults)
 * @param {string} [options.mode='merge'] - Import mode: 'merge' or 'replace'
 * @param {boolean} [options.importTasks=true] - Import tasks
 * @param {boolean} [options.importSettings=true] - Import settings
 *
 * @returns {Promise<Object>} Import result
 * @returns {boolean} return.success - Whether import succeeded
 * @returns {Object[]} return.imported - Successfully imported collections
 * @returns {Object[]} return.errors - Import errors per collection
 * @returns {Object} return.stats - Import statistics
 *
 * @throws {Error} If file validation fails
 * @throws {Error} If file read fails or JSON is invalid
 *
 * @example
 * const file = event.target.files[0];
 * const result = await importCollections(file);
 *
 * if (result.success && result.imported.length > 0) {
 *   console.log(`Imported: ${result.imported.map(c => c.name).join(', ')}`);
 * }
 */
export async function importCollections(file, options = {}) {
  const defaultOptions = {
    mode: 'merge',
    importTasks: true,
    importSettings: true
  };

  // Validate file before processing
  validateImportFile(file);

  // Read file as text
  const text = await file.text();

  // Validate JSON format
  validateImportJSON(text);

  // Send to background for import
  return chrome.runtime.sendMessage({
    action: 'importCollections',
    data: text,
    options: { ...defaultOptions, ...options }
  });
}

/**
 * Format import success message.
 *
 * Generates human-readable success message from import result.
 * Used by UI surfaces to show consistent notification text.
 *
 * @param {Object} result - Import result from importCollections
 * @returns {string} Formatted success message
 *
 * @example
 * const msg = formatImportSuccessMessage(result);
 * // → "Imported 3 collections: Work, Personal, Archive"
 */
export function formatImportSuccessMessage(result) {
  const { imported } = result;
  const count = imported.length;
  const names = imported.map(c => c.name).join(', ');

  return `Imported ${count} collection${count > 1 ? 's' : ''}: ${names}`;
}

/**
 * Format import error message.
 *
 * Generates human-readable error message from import result.
 * Used by UI surfaces to show consistent error notifications.
 *
 * @param {Object} result - Import result from importCollections
 * @param {string} [separator='\n'] - Separator between errors (default newline)
 * @returns {string} Formatted error message
 *
 * @example
 * const msg = formatImportErrorMessage(result);
 * // → "2 collections failed to import:\nWork: Missing required field\nPersonal: Invalid data"
 */
export function formatImportErrorMessage(result, separator = '\n') {
  const { errors } = result;
  const count = errors.length;
  const errorList = errors.map(e => `${e.collectionName}: ${e.error}`).join(separator);

  return `${count} collection${count > 1 ? 's' : ''} failed to import:${separator}${errorList}`;
}

/**
 * Format export success message.
 *
 * Generates human-readable success message from export result.
 *
 * @param {Object} result - Export result from exportCollection or exportAllCollections
 * @returns {string} Formatted success message
 *
 * @example
 * const msg = formatExportSuccessMessage(result);
 * // → "Exported to collection-work-1234567890.json"
 */
export function formatExportSuccessMessage(result) {
  if (result.count !== undefined) {
    // exportAllCollections result
    return `Exported ${result.count} collections to ${result.filename}`;
  } else {
    // exportCollection result
    return `Exported to ${result.filename}`;
  }
}
