/**
 * @file CollectionImportService - Collection import from JSON
 *
 * @description
 * CollectionImportService handles importing collections from portable JSON format.
 * Validates schema, generates new UUIDs, resolves conflicts, and creates collections
 * with folders, tabs, and tasks in IndexedDB.
 *
 * Import Process:
 * 1. Parse and validate JSON structure
 * 2. Check schema version compatibility
 * 3. Validate required fields for each collection
 * 4. Generate new UUIDs for all entities (avoid ID conflicts)
 * 5. Handle name conflicts (append suffix)
 * 6. Convert task tab references from indices back to IDs
 * 7. Create collections as saved (isActive=false)
 * 8. Batch write to IndexedDB
 *
 * Conflict Resolution:
 * - Duplicate names: Append " (imported)" or " (imported 2)" etc.
 * - Duplicate URLs: Allowed (different collections can have same tabs)
 * - Invalid task tab references: Remove reference, log warning
 *
 * Validation Errors:
 * - Invalid JSON: Reject with parse error
 * - Missing required fields: Reject with validation error
 * - Unsupported version: Reject with version error
 *
 * @module services/execution/CollectionImportService
 *
 * @architecture
 * - Layer: Execution Service
 * - Dependencies: CollectionService, FolderService, TabService, TaskService
 * - Used By: Background message handlers, UI surfaces
 * - Storage: Writes to IndexedDB via execution services
 *
 * @example
 * // Import collections from JSON string
 * import * as CollectionImportService from './services/execution/CollectionImportService.js';
 *
 * const result = await CollectionImportService.importCollections(jsonString, {
 *   mode: 'merge',
 *   importTasks: true
 * });
 *
 * console.log(`Imported ${result.imported.length} collections`);
 * console.log(`Errors: ${result.errors.length}`);
 */

import * as CollectionService from './CollectionService.js';
import * as FolderService from './FolderService.js';
import * as TabService from './TabService.js';
import * as TaskService from './TaskService.js';
import { getAllCollections } from '../utils/storage-queries.js';

/**
 * Supported export format versions
 * @constant
 */
const SUPPORTED_VERSIONS = ['1.0'];

/**
 * Import collections from JSON data.
 *
 * Parses JSON, validates schema, generates new UUIDs, resolves conflicts,
 * and creates collections with all their data in IndexedDB.
 *
 * Process:
 * 1. Parse JSON (if string)
 * 2. Validate schema and version
 * 3. For each collection:
 *    - Validate required fields
 *    - Generate new UUIDs
 *    - Resolve name conflicts
 *    - Create collection, folders, tabs, tasks
 * 4. Return results with successes and errors
 *
 * Options:
 * - mode: 'merge' (add to existing) or 'replace' (delete all first)
 * - importTasks: Include tasks (default: true)
 * - importSettings: Include settings (default: true)
 *
 * @param {string|Object} data - JSON string or parsed object
 * @param {Object} [options] - Import options
 * @param {string} [options.mode='merge'] - Import mode: 'merge' or 'replace'
 * @param {boolean} [options.importTasks=true] - Import tasks
 * @param {boolean} [options.importSettings=true] - Import settings
 *
 * @returns {Promise<Object>} Import result
 * @returns {Object[]} return.imported - Successfully imported collection IDs and names
 * @returns {Object[]} return.errors - Import errors per collection
 * @returns {Object} return.stats - Import statistics
 *
 * @throws {Error} If JSON is invalid
 * @throws {Error} If schema version unsupported
 * @throws {Error} If mode is 'replace' and deletion fails
 *
 * @example
 * // Import from JSON string
 * const result = await importCollections(jsonString, { mode: 'merge' });
 * console.log(`Imported: ${result.imported.length}, Errors: ${result.errors.length}`);
 *
 * @example
 * // Import without tasks
 * const result = await importCollections(jsonData, {
 *   mode: 'merge',
 *   importTasks: false
 * });
 */
export async function importCollections(data, options = {}) {
  // Default options
  const opts = {
    mode: options.mode || 'merge',
    importTasks: options.importTasks !== false,
    importSettings: options.importSettings !== false
  };

  // Parse JSON if string
  let importDoc;
  try {
    importDoc = typeof data === 'string' ? JSON.parse(data) : data;
  } catch (error) {
    throw new Error(`Invalid JSON: ${error.message}`);
  }

  // Validate schema
  validateSchema(importDoc);

  // Handle replace mode (delete all existing collections)
  if (opts.mode === 'replace') {
    await deleteAllCollections();
  }

  // Get existing collections for name conflict detection
  const existingCollections = await getAllCollections();
  const existingNames = new Set(existingCollections.map(c => c.name));

  // Import each collection
  const results = {
    imported: [],
    errors: [],
    stats: {
      collectionsImported: 0,
      foldersImported: 0,
      tabsImported: 0,
      tasksImported: 0,
      warnings: []
    }
  };

  for (const collectionData of importDoc.collections) {
    try {
      // Import single collection
      const result = await importSingleCollection(
        collectionData,
        existingNames,
        opts
      );

      // Track success
      results.imported.push({
        id: result.collection.id,
        name: result.collection.name
      });

      // Update stats
      results.stats.collectionsImported++;
      results.stats.foldersImported += result.foldersCreated;
      results.stats.tabsImported += result.tabsCreated;
      results.stats.tasksImported += result.tasksCreated;
      results.stats.warnings.push(...result.warnings);

      // Add name to existing set (for subsequent imports)
      existingNames.add(result.collection.name);
    } catch (error) {
      // Track error
      results.errors.push({
        collectionName: collectionData.name || 'Unknown',
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Import a single collection.
 *
 * Internal helper that handles importing one collection with all its data.
 * Generates new UUIDs, creates entities in correct order, handles tab references.
 *
 * @private
 * @param {Object} collectionData - Collection data from import file
 * @param {Set<string>} existingNames - Set of existing collection names
 * @param {Object} options - Import options
 * @returns {Promise<Object>} Import result for this collection
 * @throws {Error} If validation fails or creation fails
 */
async function importSingleCollection(collectionData, existingNames, options) {
  // Validate required fields
  if (!collectionData.name || collectionData.name.trim() === '') {
    throw new Error('Collection name is required');
  }

  // Resolve name conflicts
  const name = resolveNameConflict(collectionData.name, existingNames);

  // Create collection (always as saved, isActive=false)
  const collectionParams = {
    name,
    description: collectionData.description,
    icon: collectionData.icon,
    color: collectionData.color,
    tags: collectionData.tags || []
  };

  // Include settings if requested
  if (options.importSettings && collectionData.settings) {
    collectionParams.settings = collectionData.settings;
  }

  const collection = await CollectionService.createCollection(collectionParams);

  // Create folders and tabs
  const warnings = [];
  let foldersCreated = 0;
  let tabsCreated = 0;

  // Track folder ID mapping (old index -> new folder ID)
  const folderIdMap = new Map();

  // Track tab ID mapping (old {folderIndex, tabIndex} -> new tab ID)
  const tabIdMap = new Map();

  // Validate folders array
  const folders = collectionData.folders || [];

  for (let folderIndex = 0; folderIndex < folders.length; folderIndex++) {
    const folderData = folders[folderIndex];

    // Validate folder
    if (!folderData.name || !folderData.color) {
      warnings.push(`Folder ${folderIndex} missing required fields, skipped`);
      continue;
    }

    // Create folder
    const folder = await FolderService.createFolder({
      collectionId: collection.id,
      name: folderData.name,
      color: folderData.color,
      position: folderData.position !== undefined ? folderData.position : folderIndex,
      collapsed: folderData.collapsed || false
    });

    foldersCreated++;
    folderIdMap.set(folderIndex, folder.id);

    // Create tabs in folder
    const tabs = folderData.tabs || [];
    for (let tabIndex = 0; tabIndex < tabs.length; tabIndex++) {
      const tabData = tabs[tabIndex];

      // Validate tab
      if (!tabData.url || !tabData.title) {
        warnings.push(`Tab ${tabIndex} in folder "${folderData.name}" missing required fields, skipped`);
        continue;
      }

      // Create tab
      const tab = await TabService.createTab({
        folderId: folder.id,
        url: tabData.url,
        title: tabData.title,
        favicon: tabData.favicon,
        note: tabData.note,
        position: tabData.position !== undefined ? tabData.position : tabIndex,
        isPinned: tabData.isPinned || false
      });

      tabsCreated++;

      // Store tab ID mapping
      const key = `${folderIndex}-${tabIndex}`;
      tabIdMap.set(key, tab.id);
    }
  }

  // Import tasks if requested
  let tasksCreated = 0;
  if (options.importTasks && collectionData.tasks) {
    for (const taskData of collectionData.tasks) {
      // Validate task
      if (!taskData.summary) {
        warnings.push('Task missing summary, skipped');
        continue;
      }

      // Convert tab references from indices to new tab IDs (with fallback to URL)
      const tabIds = [];
      if (taskData.tabReferences && Array.isArray(taskData.tabReferences)) {
        for (const ref of taskData.tabReferences) {
          const result = resolveTabReference(ref, tabIdMap, folderIdMap, collectionData.folders);

          if (result.tabId) {
            tabIds.push(result.tabId);

            // Warn if fallback was used
            if (result.usedFallback) {
              warnings.push(`Task "${taskData.summary}": Tab reference [${ref.folderIndex}, ${ref.tabIndex}] not found, matched by URL instead`);
            }
          } else {
            warnings.push(`Task "${taskData.summary}" references missing tab [${ref.folderIndex}, ${ref.tabIndex}], reference removed`);
          }
        }
      }

      // Create task
      await TaskService.createTask({
        collectionId: collection.id,
        summary: taskData.summary,
        notes: taskData.notes,
        status: taskData.status || 'open',
        priority: taskData.priority || 'medium',
        dueDate: taskData.dueDate,
        tags: taskData.tags || [],
        comments: taskData.comments || [],
        tabIds
      });

      tasksCreated++;
    }
  }

  return {
    collection,
    foldersCreated,
    tabsCreated,
    tasksCreated,
    warnings
  };
}

/**
 * Validate import schema.
 *
 * Checks for required top-level fields and version compatibility.
 *
 * @private
 * @param {Object} importDoc - Parsed import document
 * @throws {Error} If schema is invalid
 */
function validateSchema(importDoc) {
  // Check required fields
  if (!importDoc.version) {
    throw new Error('Import file missing version field');
  }

  if (!SUPPORTED_VERSIONS.includes(importDoc.version)) {
    throw new Error(`Unsupported import version: ${importDoc.version}. Supported: ${SUPPORTED_VERSIONS.join(', ')}`);
  }

  if (!importDoc.collections || !Array.isArray(importDoc.collections)) {
    throw new Error('Import file missing collections array');
  }

  if (importDoc.collections.length === 0) {
    throw new Error('Import file contains no collections');
  }
}

/**
 * Resolve name conflict by appending suffix.
 *
 * If name exists, appends " (imported)" or " (imported 2)" etc.
 * until a unique name is found.
 *
 * @private
 * @param {string} name - Desired name
 * @param {Set<string>} existingNames - Set of existing names
 * @returns {string} Unique name
 *
 * @example
 * // existingNames = ['Work', 'Work (imported)']
 * // resolveNameConflict('Work', existingNames) → 'Work (imported 2)'
 */
function resolveNameConflict(name, existingNames) {
  if (!existingNames.has(name)) {
    return name;
  }

  // Try "name (imported)"
  let candidate = `${name} (imported)`;
  if (!existingNames.has(candidate)) {
    return candidate;
  }

  // Try "name (imported 2)", "name (imported 3)", etc.
  let counter = 2;
  while (existingNames.has(candidate)) {
    candidate = `${name} (imported ${counter})`;
    counter++;

    // Safety limit
    if (counter > 1000) {
      throw new Error(`Unable to resolve name conflict for "${name}"`);
    }
  }

  return candidate;
}

/**
 * Resolve tab reference with fallback support.
 *
 * Attempts to resolve tab reference in this order:
 * 1. Index-based lookup (folderIndex, tabIndex) - fast path
 * 2. URL-based lookup (ref.url) - fallback for changed indices
 *
 * @private
 * @param {Object} ref - Tab reference from import file
 * @param {Map<string, string>} tabIdMap - Map of "folderIndex-tabIndex" to tab IDs
 * @param {Map<number, string>} folderIdMap - Map of folder indices to folder IDs
 * @param {Object[]} folders - Original folder data from import (for URL matching)
 * @returns {Object} Resolution result
 * @returns {string|null} return.tabId - Resolved tab ID or null
 * @returns {boolean} return.usedFallback - Whether fallback URL matching was used
 *
 * @example
 * const result = resolveTabReference(
 *   {folderIndex: 0, tabIndex: 1, url: 'https://example.com'},
 *   tabIdMap,
 *   folderIdMap,
 *   folders
 * );
 * if (result.tabId) {
 *   console.log(`Found tab: ${result.tabId}, used fallback: ${result.usedFallback}`);
 * }
 */
function resolveTabReference(ref, tabIdMap, folderIdMap, folders) {
  // Try index-based lookup first (fast path)
  const key = `${ref.folderIndex}-${ref.tabIndex}`;
  const tabId = tabIdMap.get(key);

  if (tabId) {
    return { tabId, usedFallback: false };
  }

  // If index lookup failed but we have URL, try URL-based fallback
  if (ref.url) {
    // Search all folders for a tab with matching URL
    for (const [indexKey, mappedTabId] of tabIdMap.entries()) {
      // Parse the index key to get folder/tab indices
      const [folderIdx, tabIdx] = indexKey.split('-').map(Number);

      // Get the original tab data from folders
      const folder = folders[folderIdx];
      if (folder && folder.tabs && folder.tabs[tabIdx]) {
        const tab = folder.tabs[tabIdx];

        // Match by URL
        if (tab.url === ref.url) {
          return { tabId: mappedTabId, usedFallback: true };
        }
      }
    }
  }

  // No match found
  return { tabId: null, usedFallback: false };
}

/**
 * Delete all existing collections (for replace mode).
 *
 * WARNING: Destructive operation, cannot be undone.
 * Only called when mode='replace'.
 *
 * @private
 * @returns {Promise<void>}
 */
async function deleteAllCollections() {
  const collections = await getAllCollections();

  for (const collection of collections) {
    await CollectionService.deleteCollection(collection.id);
  }
}
