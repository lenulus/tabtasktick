/**
 * @file CollectionService - Collection lifecycle management
 *
 * @description
 * CollectionService handles creation, updating, deletion, and window binding for
 * collections in TabTaskTick. Collections are persistent windows that can be active
 * (bound to a browser window) or saved (stored in IndexedDB without a window).
 *
 * This service enforces business logic around collection state transitions:
 * - Creating collections with proper metadata initialization
 * - Updating collections while preserving immutable fields
 * - Window binding/unbinding (active ↔ saved state transitions)
 * - Cascade deletion via storage utilities
 *
 * State management follows a strict model:
 * - isActive + windowId are managed ONLY via bindToWindow/unbindFromWindow
 * - Direct updates to these fields are ignored (use dedicated methods)
 * - lastAccessed timestamp updated on all modifications
 * - createdAt timestamp immutable after creation
 *
 * @module services/execution/CollectionService
 *
 * @architecture
 * - Layer: Execution Service
 * - Dependencies: storage-queries.js (CRUD utilities, no business logic)
 * - Used By: CaptureWindowService, RestoreCollectionService, UI surfaces
 * - Storage: IndexedDB (via storage-queries.js)
 *
 * @example
 * // Create new saved collection
 * import * as CollectionService from './services/execution/CollectionService.js';
 *
 * const collection = await CollectionService.createCollection({
 *   name: 'Project Research',
 *   description: 'OAuth 2.0 implementation docs',
 *   icon: '🔐',
 *   color: '#FF5722',
 *   tags: ['work', 'backend']
 * });
 *
 * @example
 * // Create active collection bound to window
 * const activeCollection = await CollectionService.createCollection({
 *   name: 'Active Project',
 *   windowId: 123
 * });
 *
 * @example
 * // Update collection metadata
 * const updated = await CollectionService.updateCollection('col_123', {
 *   name: 'Updated Name',
 *   tags: ['work', 'urgent']
 * });
 *
 * @example
 * // Bind saved collection to window (activate)
 * const activated = await CollectionService.bindToWindow('col_123', 456);
 *
 * @example
 * // Unbind collection from window (save)
 * const saved = await CollectionService.unbindFromWindow('col_123');
 */

import {
  getCollection,
  saveCollection,
  deleteCollection as deleteCollectionStorage
} from '../utils/storage-queries.js';

/**
 * Creates a new collection with metadata initialization.
 *
 * Generates unique ID, sets creation/access timestamps, and validates required fields.
 * Collections can be created as active (with windowId) or saved (without windowId).
 *
 * Required fields:
 * - name: User-visible collection name
 *
 * Optional fields:
 * - description: Long-form description (markdown supported)
 * - icon: Emoji icon (e.g., '📁')
 * - color: Hex color code (e.g., '#4285F4')
 * - tags: Array of tag strings (default: [])
 * - windowId: Chrome window ID if binding on creation (makes isActive=true)
 * - settings: Progressive sync settings (default: tracking enabled, 2s debounce)
 *
 * State initialization:
 * - id: Generated via crypto.randomUUID()
 * - isActive: true if windowId provided, false otherwise
 * - metadata.createdAt: Current timestamp
 * - metadata.lastAccessed: Current timestamp
 * - settings: Default progressive sync settings
 *
 * @param {Object} params - Collection parameters
 * @param {string} params.name - Collection name (required, non-empty)
 * @param {string} [params.description] - Description text
 * @param {string} [params.icon] - Emoji icon
 * @param {string} [params.color] - Hex color code
 * @param {string[]} [params.tags] - Tag array (default: [])
 * @param {number} [params.windowId] - Chrome window ID (optional, makes active)
 * @param {Object} [params.settings] - Progressive sync settings (optional)
 *
 * @returns {Promise<Object>} Created collection object
 * @returns {string} return.id - Generated UUID
 * @returns {string} return.name - Collection name
 * @returns {boolean} return.isActive - Window binding state
 * @returns {number|null} return.windowId - Chrome window ID or null
 * @returns {Object} return.metadata - Timestamp metadata
 * @returns {Object} return.settings - Progressive sync settings
 *
 * @throws {Error} If name is missing or empty
 * @throws {Error} If storage operation fails
 *
 * @example
 * // Create saved collection
 * const collection = await createCollection({
 *   name: 'Research Project',
 *   tags: ['work', 'backend']
 * });
 * console.log(collection.isActive); // false
 *
 * @example
 * // Create active collection with custom settings
 * const active = await createCollection({
 *   name: 'Active Work',
 *   windowId: 123,
 *   settings: {
 *     trackingEnabled: true,
 *     autoSync: true,
 *     syncDebounceMs: 5000
 *   }
 * });
 * console.log(active.isActive); // true
 * console.log(active.windowId); // 123
 */
export async function createCollection(params) {
  // Validation
  if (!params.name || params.name.trim() === '') {
    throw new Error('Collection name is required');
  }

  const now = Date.now();
  const id = crypto.randomUUID();

  // Default progressive sync settings
  const defaultSettings = {
    trackingEnabled: true,   // Enable real-time tracking by default
    autoSync: true,          // Auto-sync changes by default
    syncDebounceMs: 2000     // 2 second debounce by default
  };

  const collection = {
    id,
    name: params.name,
    description: params.description || undefined,
    icon: params.icon || undefined,
    color: params.color || undefined,
    tags: params.tags || [],
    windowId: params.windowId || null,
    isActive: !!params.windowId, // Active if windowId provided
    settings: params.settings ? { ...defaultSettings, ...params.settings } : defaultSettings,
    metadata: {
      createdAt: now,
      lastAccessed: now
    }
  };

  // Save to IndexedDB
  await saveCollection(collection);

  return collection;
}

/**
 * Updates an existing collection with new values.
 *
 * Merges provided updates with existing collection data while preserving:
 * - id (immutable)
 * - isActive (use bindToWindow/unbindFromWindow)
 * - windowId (use bindToWindow/unbindFromWindow)
 * - metadata.createdAt (immutable)
 *
 * Always updates:
 * - metadata.lastAccessed (current timestamp)
 *
 * Validation:
 * - Collection must exist
 * - name cannot be empty string
 * - tags must be array if provided
 *
 * @param {string} id - Collection ID
 * @param {Object} updates - Fields to update
 * @param {string} [updates.name] - New collection name
 * @param {string} [updates.description] - New description
 * @param {string} [updates.icon] - New icon
 * @param {string} [updates.color] - New color
 * @param {string[]} [updates.tags] - New tags array
 *
 * @returns {Promise<Object>} Updated collection object
 *
 * @throws {Error} If collection not found
 * @throws {Error} If name is empty string
 * @throws {Error} If tags is not an array
 * @throws {Error} If storage operation fails
 *
 * @example
 * // Update name and tags
 * const updated = await updateCollection('col_123', {
 *   name: 'New Name',
 *   tags: ['urgent', 'work']
 * });
 *
 * @example
 * // Attempting to update isActive is ignored
 * const result = await updateCollection('col_123', {
 *   name: 'Valid Update',
 *   isActive: true  // Ignored - use bindToWindow instead
 * });
 * console.log(result.isActive); // Unchanged
 */
export async function updateCollection(id, updates) {
  // Get existing collection
  const existing = await getCollection(id);
  if (!existing) {
    throw new Error(`Collection not found: ${id}`);
  }

  // Validate updates
  if (updates.name !== undefined && updates.name.trim() === '') {
    throw new Error('Collection name cannot be empty');
  }

  if (updates.tags !== undefined && !Array.isArray(updates.tags)) {
    throw new Error('Tags must be an array');
  }

  // Merge updates with existing, preserving immutable fields
  const updated = {
    ...existing,
    ...updates,
    // Preserve immutable fields
    id: existing.id,
    isActive: existing.isActive, // Use bindToWindow/unbindFromWindow
    windowId: existing.windowId, // Use bindToWindow/unbindFromWindow
    metadata: {
      ...existing.metadata,
      createdAt: existing.metadata.createdAt, // Immutable
      lastAccessed: Date.now() // Always update
    }
  };

  // Save updated collection
  await saveCollection(updated);

  return updated;
}

/**
 * Deletes a collection with cascade delete.
 *
 * Deletes collection and all related entities:
 * - All folders in collection (cascade)
 * - All tabs in folders (cascade)
 * - All tasks in collection
 *
 * Cascade delete is handled by storage utility (storage-queries.js).
 * This is a thin wrapper for consistency with service pattern.
 *
 * @param {string} id - Collection ID to delete
 *
 * @returns {Promise<void>}
 *
 * @throws {Error} If storage operation fails
 *
 * @example
 * // Delete collection (removes all folders, tabs, tasks)
 * await deleteCollection('col_123');
 */
export async function deleteCollection(id) {
  await deleteCollectionStorage(id);
}

/**
 * Binds a collection to a Chrome window (activates collection).
 *
 * State transition: SAVED → ACTIVE
 * - Sets windowId to provided Chrome window ID
 * - Sets isActive to true
 * - Updates lastAccessed timestamp
 *
 * Used when:
 * - Opening a saved collection (creates new window, then binds)
 * - Capturing an existing window as collection (binds to that window)
 * - Rebinding collection to different window
 *
 * @param {string} collectionId - Collection ID to bind
 * @param {number} windowId - Chrome window ID to bind to
 *
 * @returns {Promise<Object>} Updated collection object
 * @returns {number} return.windowId - Now set to provided windowId
 * @returns {boolean} return.isActive - Now true
 *
 * @throws {Error} If collection not found
 * @throws {Error} If storage operation fails
 *
 * @example
 * // Activate saved collection by binding to new window
 * const newWindowId = 456;
 * const activated = await bindToWindow('col_123', newWindowId);
 * console.log(activated.isActive); // true
 * console.log(activated.windowId); // 456
 *
 * @example
 * // Rebind to different window
 * const rebound = await bindToWindow('col_123', 789);
 * console.log(rebound.windowId); // 789 (changed)
 */
export async function bindToWindow(collectionId, windowId) {
  // Get existing collection
  const existing = await getCollection(collectionId);
  if (!existing) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  // Update window binding
  const updated = {
    ...existing,
    windowId,
    isActive: true,
    metadata: {
      ...existing.metadata,
      lastAccessed: Date.now()
    }
  };

  // Save updated collection
  await saveCollection(updated);

  return updated;
}

/**
 * Unbinds a collection from its Chrome window (saves collection).
 *
 * State transition: ACTIVE → SAVED
 * - Sets windowId to null
 * - Sets isActive to false
 * - Updates lastAccessed timestamp
 *
 * Used when:
 * - User closes window containing collection
 * - Manually saving active collection
 *
 * Idempotent: Safe to call on already-saved collections.
 *
 * @param {string} collectionId - Collection ID to unbind
 *
 * @returns {Promise<Object>} Updated collection object
 * @returns {null} return.windowId - Now null
 * @returns {boolean} return.isActive - Now false
 *
 * @throws {Error} If collection not found
 * @throws {Error} If storage operation fails
 *
 * @example
 * // Save active collection (window closed)
 * const saved = await unbindFromWindow('col_123');
 * console.log(saved.isActive); // false
 * console.log(saved.windowId); // null
 *
 * @example
 * // Idempotent - safe to call on saved collection
 * await unbindFromWindow('col_already_saved');
 * // No error, collection remains saved
 */
export async function unbindFromWindow(collectionId) {
  // Get existing collection
  const existing = await getCollection(collectionId);
  if (!existing) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  // Update window binding
  const updated = {
    ...existing,
    windowId: null,
    isActive: false,
    metadata: {
      ...existing.metadata,
      lastAccessed: Date.now()
    }
  };

  // Save updated collection
  await saveCollection(updated);

  return updated;
}

/**
 * Updates collection progressive sync settings.
 *
 * Allows fine-grained control over real-time tracking behavior:
 * - trackingEnabled: Enable/disable Chrome event listeners for this collection
 * - autoSync: Enable/disable automatic syncing (requires trackingEnabled)
 * - syncDebounceMs: Delay before flushing queued changes (0-10000ms)
 *
 * Validation:
 * - syncDebounceMs must be 0-10000 (0s to 10s)
 * - autoSync requires trackingEnabled (disabled if tracking off)
 *
 * @param {string} collectionId - Collection ID
 * @param {Object} settings - Settings to update
 * @param {boolean} [settings.trackingEnabled] - Enable real-time tracking
 * @param {boolean} [settings.autoSync] - Enable auto-sync (requires trackingEnabled)
 * @param {number} [settings.syncDebounceMs] - Sync delay in milliseconds (0-10000)
 *
 * @returns {Promise<Object>} Updated collection object
 *
 * @throws {Error} If collection not found
 * @throws {Error} If syncDebounceMs out of range (0-10000)
 * @throws {Error} If storage operation fails
 *
 * @example
 * // Disable tracking for collection
 * const updated = await updateCollectionSettings('col_123', {
 *   trackingEnabled: false
 * });
 *
 * @example
 * // Increase debounce for high-churn collection
 * const updated = await updateCollectionSettings('col_123', {
 *   syncDebounceMs: 5000  // 5 seconds
 * });
 *
 * @example
 * // Manual sync mode (tracking on, auto-sync off)
 * const updated = await updateCollectionSettings('col_123', {
 *   trackingEnabled: true,
 *   autoSync: false
 * });
 */
export async function updateCollectionSettings(collectionId, settings) {
  // Get existing collection
  const existing = await getCollection(collectionId);
  if (!existing) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  // Validate settings
  if (settings.syncDebounceMs !== undefined) {
    if (typeof settings.syncDebounceMs !== 'number' || settings.syncDebounceMs < 0 || settings.syncDebounceMs > 10000) {
      throw new Error('syncDebounceMs must be between 0 and 10000 (milliseconds)');
    }
  }

  // Merge settings with existing
  const updatedSettings = {
    ...existing.settings,
    ...settings
  };

  // If tracking disabled, also disable autoSync
  if (updatedSettings.trackingEnabled === false) {
    updatedSettings.autoSync = false;
  }

  // Update collection with new settings
  const updated = {
    ...existing,
    settings: updatedSettings,
    metadata: {
      ...existing.metadata,
      lastAccessed: Date.now()
    }
  };

  // Save updated collection
  await saveCollection(updated);

  return updated;
}
