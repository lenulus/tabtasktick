/**
 * @file TabService - Tab lifecycle management
 *
 * @description
 * TabService handles creation, updating, deletion, and retrieval of tabs
 * within folders in TabTaskTick. Tabs represent web resources (pages) that
 * can be active (open in Chrome) or saved (stored in IndexedDB).
 *
 * This service enforces business logic around tab management:
 * - Creating tabs with proper validation
 * - Updating tabs while preserving immutable fields (id, folderId)
 * - Retrieving tabs sorted by position
 * - Cascade deletion via storage utilities
 *
 * Business Rules:
 * - url: Required, non-empty string
 * - title: Required, non-empty string
 * - folderId: Required, must reference existing folder (FK)
 * - position: Required, 0-indexed ordering within folder
 * - note: Optional, max 255 characters
 * - isPinned: Optional, defaults to false
 * - tabId: Optional, Chrome runtime ID (ephemeral)
 * - favicon, lastAccess: Optional metadata
 *
 * Dual ID System:
 * - id: Storage ID (persistent, UUID, survives window close/restore)
 * - tabId: Chrome tab ID (ephemeral, only valid when collection is active)
 *
 * @module services/execution/TabService
 *
 * @architecture
 * - Layer: Execution Service
 * - Dependencies: storage-queries.js (CRUD utilities)
 * - Used By: CaptureWindowService, RestoreCollectionService, UI surfaces
 * - Storage: IndexedDB (via storage-queries.js)
 *
 * @example
 * // Create new tab in folder
 * import * as TabService from './services/execution/TabService.js';
 *
 * const tab = await TabService.createTab({
 *   folderId: 'folder_123',
 *   url: 'https://oauth.net/2/',
 *   title: 'OAuth 2.0',
 *   favicon: 'data:image/png;base64,...',
 *   note: 'Main spec',
 *   position: 0,
 *   isPinned: false
 * });
 *
 * @example
 * // Update tab note and position
 * const updated = await TabService.updateTab('tab_123', {
 *   note: 'Updated note',
 *   position: 5
 * });
 *
 * @example
 * // Map Chrome tab ID (on window restore)
 * const mapped = await TabService.updateTab('tab_123', {
 *   tabId: 567 // Chrome-assigned ID
 * });
 *
 * @example
 * // Get all tabs in folder (sorted by position)
 * const tabs = await TabService.getTabsByFolder('folder_123');
 */

import {
  getTab,
  getTabsByFolder as getTabsByFolderStorage,
  saveTab,
  deleteTab as deleteTabStorage
} from '../utils/storage-queries.js';

/**
 * Maximum note length (characters)
 * @constant
 */
const MAX_NOTE_LENGTH = 255;

/**
 * Creates a new tab within a folder.
 *
 * Generates unique storage ID and validates required fields. Tabs represent
 * web resources within a folder.
 *
 * Required fields:
 * - url: Full URL (non-empty)
 * - title: Page title (non-empty)
 * - folderId: Parent folder ID (FK)
 * - position: Order within folder (0-indexed)
 *
 * Optional fields:
 * - favicon: Data URI or URL for favicon
 * - note: User note (max 255 chars)
 * - isPinned: Pin status (default: false)
 * - lastAccess: Last access timestamp
 * - tabId: Chrome tab ID when active (ephemeral)
 *
 * @param {Object} params - Tab parameters
 * @param {string} params.folderId - Parent folder ID (FK, required)
 * @param {string} params.url - Full URL (required, non-empty)
 * @param {string} params.title - Page title (required, non-empty)
 * @param {number} params.position - Order within folder (required, 0-indexed)
 * @param {string} [params.favicon] - Favicon data URI or URL
 * @param {string} [params.note] - User note (max 255 chars)
 * @param {boolean} [params.isPinned] - Pin status (default: false)
 * @param {number} [params.lastAccess] - Last access timestamp
 * @param {number} [params.tabId] - Chrome tab ID (ephemeral)
 *
 * @returns {Promise<Object>} Created tab object
 * @returns {string} return.id - Generated storage ID (UUID)
 * @returns {string} return.folderId - Parent folder ID
 * @returns {string} return.url - Full URL
 * @returns {string} return.title - Page title
 * @returns {number} return.position - Position within folder
 * @returns {boolean} return.isPinned - Pin status
 *
 * @throws {Error} If url is missing or empty
 * @throws {Error} If title is missing or empty
 * @throws {Error} If folderId is missing
 * @throws {Error} If position is missing
 * @throws {Error} If note exceeds 255 characters
 * @throws {Error} If storage operation fails
 *
 * @example
 * // Create tab
 * const tab = await createTab({
 *   folderId: 'folder_123',
 *   url: 'https://example.com',
 *   title: 'Example',
 *   position: 0
 * });
 *
 * @example
 * // Create tab with metadata
 * const richTab = await createTab({
 *   folderId: 'folder_123',
 *   url: 'https://oauth.net/2/',
 *   title: 'OAuth 2.0',
 *   favicon: 'data:image/png;base64,...',
 *   note: 'Section 4.1 for auth code flow',
 *   position: 0,
 *   isPinned: true
 * });
 */
export async function createTab(params) {
  // Validation
  if (!params.url || params.url.trim() === '') {
    throw new Error('Tab URL is required');
  }

  if (!params.title || params.title.trim() === '') {
    throw new Error('Tab title is required');
  }

  if (!params.folderId) {
    throw new Error('Folder ID is required');
  }

  if (params.position === undefined || params.position === null) {
    throw new Error('Tab position is required');
  }

  if (params.note && params.note.length > MAX_NOTE_LENGTH) {
    throw new Error(`Note must be ${MAX_NOTE_LENGTH} characters or less`);
  }

  const id = crypto.randomUUID();

  const tab = {
    id,
    folderId: params.folderId,
    url: params.url,
    title: params.title,
    position: params.position,
    isPinned: params.isPinned !== undefined ? params.isPinned : false,
    // Optional fields (only include if provided)
    ...(params.favicon !== undefined && { favicon: params.favicon }),
    ...(params.note !== undefined && { note: params.note }),
    ...(params.lastAccess !== undefined && { lastAccess: params.lastAccess }),
    ...(params.tabId !== undefined && { tabId: params.tabId })
  };

  // Save to IndexedDB
  await saveTab(tab);

  return tab;
}

/**
 * Updates an existing tab with new values.
 *
 * Merges provided updates with existing tab data while preserving:
 * - id (immutable storage ID)
 * - folderId (immutable FK)
 *
 * Validation:
 * - Tab must exist
 * - url cannot be empty string
 * - title cannot be empty string
 * - note cannot exceed 255 characters
 *
 * Special handling:
 * - tabId can be set (window restore) or cleared (window close)
 *
 * @param {string} id - Tab storage ID
 * @param {Object} updates - Fields to update
 * @param {string} [updates.url] - New URL
 * @param {string} [updates.title] - New title
 * @param {string} [updates.favicon] - New favicon
 * @param {string} [updates.note] - New note (max 255 chars)
 * @param {number} [updates.position] - New position
 * @param {boolean} [updates.isPinned] - New pin status
 * @param {number} [updates.lastAccess] - New last access timestamp
 * @param {number|null} [updates.tabId] - New Chrome tab ID (or null to clear)
 *
 * @returns {Promise<Object>} Updated tab object
 *
 * @throws {Error} If tab not found
 * @throws {Error} If url is empty string
 * @throws {Error} If title is empty string
 * @throws {Error} If note exceeds 255 characters
 * @throws {Error} If storage operation fails
 *
 * @example
 * // Update note and position
 * const updated = await updateTab('tab_123', {
 *   note: 'Updated note',
 *   position: 5
 * });
 *
 * @example
 * // Map Chrome tab ID (window restore)
 * const mapped = await updateTab('tab_123', {
 *   tabId: 567
 * });
 *
 * @example
 * // Clear Chrome tab ID (window close)
 * const cleared = await updateTab('tab_123', {
 *   tabId: null
 * });
 */
export async function updateTab(id, updates) {
  // Get existing tab
  const existing = await getTab(id);
  if (!existing) {
    throw new Error(`Tab not found: ${id}`);
  }

  // Validate updates
  if (updates.url !== undefined && updates.url.trim() === '') {
    throw new Error('Tab URL cannot be empty');
  }

  if (updates.title !== undefined && updates.title.trim() === '') {
    throw new Error('Tab title cannot be empty');
  }

  if (updates.note !== undefined && updates.note.length > MAX_NOTE_LENGTH) {
    throw new Error(`Note must be ${MAX_NOTE_LENGTH} characters or less`);
  }

  // Merge updates with existing, preserving immutable fields
  const updated = {
    ...existing,
    ...updates,
    // Preserve immutable fields
    id: existing.id,
    folderId: existing.folderId // FK is immutable
  };

  // Save updated tab
  await saveTab(updated);

  return updated;
}

/**
 * Deletes a tab.
 *
 * Deletes tab from storage. Tabs are leaf nodes, so no cascade delete needed.
 * This is a thin wrapper for consistency with service pattern.
 *
 * Note: If tab is referenced by tasks (task.tabIds), those references should
 * be handled by TaskService (not automatic cascade).
 *
 * @param {string} id - Tab storage ID to delete
 *
 * @returns {Promise<void>}
 *
 * @throws {Error} If storage operation fails
 *
 * @example
 * // Delete tab
 * await deleteTab('tab_123');
 */
export async function deleteTab(id) {
  await deleteTabStorage(id);
}

/**
 * Gets all tabs for a folder, sorted by position.
 *
 * Returns tabs in display order (position ascending).
 *
 * @param {string} folderId - Folder ID
 *
 * @returns {Promise<Array>} Array of tab objects sorted by position
 *
 * @throws {Error} If storage operation fails
 *
 * @example
 * // Get tabs for folder
 * const tabs = await getTabsByFolder('folder_123');
 * // Returns: [{ position: 0, ... }, { position: 1, ... }, ...]
 */
export async function getTabsByFolder(folderId) {
  const tabs = await getTabsByFolderStorage(folderId);

  // Sort by position (ascending)
  return tabs.sort((a, b) => a.position - b.position);
}
