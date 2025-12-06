/**
 * @file FolderService - Folder lifecycle management
 *
 * @description
 * FolderService handles creation, updating, deletion, and retrieval of folders
 * within collections in TabTaskTick. Folders represent Chrome tab groups within
 * a collection.
 *
 * This service enforces business logic around folder management:
 * - Creating folders with proper validation
 * - Updating folders while preserving immutable fields (id, collectionId)
 * - Retrieving folders sorted by position
 * - Cascade deletion via storage utilities
 *
 * Business Rules:
 * - name: Required, non-empty string
 * - collectionId: Required, must reference existing collection (FK)
 * - color: Required, must be valid Chrome tab group color
 * - position: Required, 0-indexed ordering within collection
 * - collapsed: Optional, defaults to false
 *
 * @module services/execution/FolderService
 *
 * @architecture
 * - Layer: Execution Service
 * - Dependencies: storage-queries.js (CRUD utilities)
 * - Used By: CaptureWindowService, RestoreCollectionService, UI surfaces
 * - Storage: IndexedDB (via storage-queries.js)
 *
 * @example
 * // Create new folder in collection
 * import * as FolderService from './services/execution/FolderService.js';
 *
 * const folder = await FolderService.createFolder({
 *   collectionId: 'col_123',
 *   name: 'Documentation',
 *   color: 'blue',
 *   position: 0,
 *   collapsed: false
 * });
 *
 * @example
 * // Update folder name and color
 * const updated = await FolderService.updateFolder('folder_123', {
 *   name: 'Updated Name',
 *   color: 'red'
 * });
 *
 * @example
 * // Get all folders in collection (sorted by position)
 * const folders = await FolderService.getFoldersByCollection('col_123');
 */

import {
  getFolder,
  getFoldersByCollection as getFoldersByCollectionStorage,
  saveFolder,
  deleteFolder as deleteFolderStorage
} from '../utils/storage-queries.js';

/**
 * Valid Chrome tab group colors
 * @constant
 */
const VALID_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

/**
 * Creates a new folder within a collection.
 *
 * Generates unique ID and validates required fields. Folders represent Chrome tab
 * groups within a collection.
 *
 * Required fields:
 * - name: Folder name (non-empty)
 * - collectionId: Parent collection ID (FK)
 * - color: Chrome tab group color (see VALID_COLORS)
 * - position: Order within collection (0-indexed)
 *
 * Optional fields:
 * - collapsed: Collapse state in Chrome UI (default: false)
 *
 * @param {Object} params - Folder parameters
 * @param {string} params.collectionId - Parent collection ID (FK, required)
 * @param {string} params.name - Folder name (required, non-empty)
 * @param {string} params.color - Chrome tab group color (required, valid color)
 * @param {number} params.position - Order within collection (required, 0-indexed)
 * @param {boolean} [params.collapsed] - Collapse state (default: false)
 *
 * @returns {Promise<Object>} Created folder object
 * @returns {string} return.id - Generated UUID
 * @returns {string} return.collectionId - Parent collection ID
 * @returns {string} return.name - Folder name
 * @returns {string} return.color - Chrome tab group color
 * @returns {number} return.position - Position within collection
 * @returns {boolean} return.collapsed - Collapse state
 *
 * @throws {Error} If name is missing or empty
 * @throws {Error} If collectionId is missing
 * @throws {Error} If color is missing or invalid
 * @throws {Error} If position is missing
 * @throws {Error} If storage operation fails
 *
 * @example
 * // Create folder
 * const folder = await createFolder({
 *   collectionId: 'col_123',
 *   name: 'Documentation',
 *   color: 'blue',
 *   position: 0
 * });
 *
 * @example
 * // Create collapsed folder
 * const collapsed = await createFolder({
 *   collectionId: 'col_123',
 *   name: 'Archive',
 *   color: 'grey',
 *   position: 1,
 *   collapsed: true
 * });
 */
export async function createFolder(params) {
  // Validation
  if (!params.name || params.name.trim() === '') {
    throw new Error('Folder name is required');
  }

  if (!params.collectionId) {
    throw new Error('Collection ID is required');
  }

  if (!params.color) {
    throw new Error('Folder color is required');
  }

  if (!VALID_COLORS.includes(params.color)) {
    throw new Error(`Invalid folder color: ${params.color}. Must be one of: ${VALID_COLORS.join(', ')}`);
  }

  if (params.position === undefined || params.position === null) {
    throw new Error('Folder position is required');
  }

  const id = crypto.randomUUID();

  const folder = {
    id,
    collectionId: params.collectionId,
    name: params.name,
    color: params.color,
    collapsed: params.collapsed !== undefined ? params.collapsed : false,
    position: params.position
  };

  // Save to IndexedDB
  await saveFolder(folder);

  return folder;
}

/**
 * Updates an existing folder with new values.
 *
 * Merges provided updates with existing folder data while preserving:
 * - id (immutable)
 * - collectionId (immutable FK)
 *
 * Validation:
 * - Folder must exist
 * - name cannot be empty string
 * - color must be valid Chrome tab group color
 *
 * @param {string} id - Folder ID
 * @param {Object} updates - Fields to update
 * @param {string} [updates.name] - New folder name
 * @param {string} [updates.color] - New Chrome tab group color
 * @param {boolean} [updates.collapsed] - New collapse state
 * @param {number} [updates.position] - New position
 *
 * @returns {Promise<Object>} Updated folder object
 *
 * @throws {Error} If folder not found
 * @throws {Error} If name is empty string
 * @throws {Error} If color is invalid
 * @throws {Error} If storage operation fails
 *
 * @example
 * // Update name and color
 * const updated = await updateFolder('folder_123', {
 *   name: 'New Name',
 *   color: 'red'
 * });
 *
 * @example
 * // Collapse folder
 * const collapsed = await updateFolder('folder_123', {
 *   collapsed: true
 * });
 */
export async function updateFolder(id, updates) {
  // Get existing folder
  const existing = await getFolder(id);
  if (!existing) {
    throw new Error(`Folder not found: ${id}`);
  }

  // Validate updates
  if (updates.name !== undefined && updates.name.trim() === '') {
    throw new Error('Folder name cannot be empty');
  }

  if (updates.color !== undefined && !VALID_COLORS.includes(updates.color)) {
    throw new Error(`Invalid folder color: ${updates.color}. Must be one of: ${VALID_COLORS.join(', ')}`);
  }

  // Merge updates with existing, preserving immutable fields
  const updated = {
    ...existing,
    ...updates,
    // Preserve immutable fields
    id: existing.id,
    collectionId: existing.collectionId // FK is immutable
  };

  // Save updated folder
  await saveFolder(updated);

  return updated;
}

/**
 * Deletes a folder with cascade delete.
 *
 * Deletes folder and all related entities:
 * - All tabs in folder (cascade)
 *
 * Cascade delete is handled by storage utility (storage-queries.js).
 * This is a thin wrapper for consistency with service pattern.
 *
 * @param {string} id - Folder ID to delete
 *
 * @returns {Promise<void>}
 *
 * @throws {Error} If storage operation fails
 *
 * @example
 * // Delete folder (removes all tabs in folder)
 * await deleteFolder('folder_123');
 */
export async function deleteFolder(id) {
  await deleteFolderStorage(id);
}

/**
 * Gets all folders for a collection, sorted by position.
 *
 * Returns folders in display order (position ascending).
 *
 * @param {string} collectionId - Collection ID
 *
 * @returns {Promise<Array>} Array of folder objects sorted by position
 *
 * @throws {Error} If storage operation fails
 *
 * @example
 * // Get folders for collection
 * const folders = await getFoldersByCollection('col_123');
 * // Returns: [{ position: 0, ... }, { position: 1, ... }, ...]
 */
export async function getFoldersByCollection(collectionId) {
  const folders = await getFoldersByCollectionStorage(collectionId);

  // Sort by position (ascending)
  return folders.sort((a, b) => a.position - b.position);
}
