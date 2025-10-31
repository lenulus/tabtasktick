/**
 * @file collectionExportBuilder - Shared utility for building collection export data
 *
 * @description
 * Provides a single source of truth for transforming collections into export format.
 * Used by both ExportImportService (for full backups) and CollectionExportService
 * (for individual collection exports) to ensure consistent export structure.
 *
 * This utility encapsulates:
 * - Collection data transformation
 * - Folder/tab structure building
 * - Task tab reference conversion
 * - Export format consistency
 *
 * @module services/utils/collectionExportBuilder
 *
 * @architecture
 * - Layer: Utility Service (Pure transformation)
 * - Dependencies: storage-queries (data fetching)
 * - Used By: ExportImportService, CollectionExportService
 * - Pattern: Shared utility for DRY principle
 */

import { getCompleteCollection, getTasksByCollection } from './storage-queries.js';

/**
 * Build export data for a single collection.
 *
 * Transforms a collection with all its folders, tabs, and tasks into
 * portable export format. This is the single source of truth for
 * collection export structure.
 *
 * @param {string} collectionId - Collection ID to export
 * @param {Object} [options] - Export options
 * @param {boolean} [options.includeTasks=true] - Include tasks in export
 * @param {boolean} [options.includeSettings=true] - Include collection settings
 * @param {boolean} [options.includeMetadata=false] - Include timestamps
 *
 * @returns {Promise<Object>} Export data structure
 * @returns {string} return.name - Collection name
 * @returns {string} return.description - Collection description
 * @returns {string} return.icon - Collection icon
 * @returns {string} return.color - Collection color
 * @returns {string[]} return.tags - Collection tags
 * @returns {Object} [return.settings] - Collection settings (if includeSettings)
 * @returns {Object} [return.metadata] - Timestamps (if includeMetadata)
 * @returns {Object[]} return.folders - Folders with nested tabs
 * @returns {Object[]} [return.ungroupedTabs] - Tabs without folders
 * @returns {Object[]} [return.tasks] - Tasks with tab references
 *
 * @throws {Error} If collection not found
 *
 * @example
 * const exportData = await buildCollectionExport('col_123', {
 *   includeTasks: true,
 *   includeSettings: true
 * });
 */
export async function buildCollectionExport(collectionId, options = {}) {
  // Default options
  const opts = {
    includeTasks: options.includeTasks !== false, // default true
    includeSettings: options.includeSettings !== false, // default true
    includeMetadata: options.includeMetadata === true // default false
  };

  // Get complete collection with folders and tabs
  const collection = await getCompleteCollection(collectionId);
  if (!collection) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  // Start with collection metadata
  const exportData = {
    name: collection.name,
    description: collection.description,
    icon: collection.icon,
    color: collection.color,
    tags: collection.tags || []
  };

  // Include settings if requested
  if (opts.includeSettings && collection.settings) {
    exportData.settings = collection.settings;
  }

  // Include metadata timestamps if requested
  if (opts.includeMetadata && collection.metadata) {
    exportData.metadata = {
      createdAt: collection.metadata.createdAt,
      lastAccessed: collection.metadata.lastAccessed
    };
  }

  // Process folders with tabs
  const folders = collection.folders || [];
  const ungroupedTabs = collection.ungroupedTabs || [];

  // Sort folders by position
  folders.sort((a, b) => a.position - b.position);

  // Build folders array with nested tabs
  exportData.folders = folders.map(folder => ({
    name: folder.name,
    color: folder.color,
    collapsed: folder.collapsed || false,
    position: folder.position,
    tabs: (folder.tabs || []).map(tab => ({
      url: tab.url,
      title: tab.title,
      favicon: tab.favicon,
      note: tab.note,
      position: tab.position,
      isPinned: tab.isPinned || false
    }))
  }));

  // Export ungrouped tabs if present
  if (ungroupedTabs.length > 0) {
    ungroupedTabs.sort((a, b) => a.position - b.position);
    exportData.ungroupedTabs = ungroupedTabs.map(tab => ({
      url: tab.url,
      title: tab.title,
      favicon: tab.favicon,
      note: tab.note,
      position: tab.position,
      isPinned: tab.isPinned || false
    }));
  }

  // Include tasks if requested
  if (opts.includeTasks) {
    const tasks = collection.tasks || [];

    if (tasks.length > 0) {
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

        // Convert tab IDs to folder/tab indices for portability
        if (task.tabIds && task.tabIds.length > 0) {
          taskExport.tabReferences = convertTabIdsToReferences(
            task.tabIds,
            folders
          );
        } else {
          taskExport.tabReferences = [];
        }

        // Include metadata if requested
        if (opts.includeMetadata) {
          taskExport.createdAt = task.createdAt;
          taskExport.completedAt = task.completedAt;
        }

        return taskExport;
      });
    }
  }

  return exportData;
}

/**
 * Build export data for multiple collections.
 *
 * Efficiently exports multiple collections by reusing the single
 * collection export logic.
 *
 * @param {string[]} collectionIds - Array of collection IDs
 * @param {Object} [options] - Export options (same as buildCollectionExport)
 * @returns {Promise<Object[]>} Array of export data structures
 */
export async function buildMultipleCollectionExports(collectionIds, options = {}) {
  const exports = [];

  for (const collectionId of collectionIds) {
    try {
      const exportData = await buildCollectionExport(collectionId, options);
      exports.push(exportData);
    } catch (error) {
      console.error(`Failed to export collection ${collectionId}:`, error);
      // Continue with other collections
    }
  }

  return exports;
}

/**
 * Convert tab IDs to folder/tab index references with fallback identifiers.
 *
 * Tasks reference tabs by ID in storage, but exports use indices for portability.
 * This function maps tab IDs to reference objects for recovery if indices change.
 *
 * THIS IS THE SINGLE SOURCE OF TRUTH for tab reference conversion.
 *
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
export function convertTabIdsToReferences(tabIds, folders) {
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