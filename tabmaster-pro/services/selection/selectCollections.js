/**
 * Collection Selection Service
 *
 * Filters collections using IndexedDB indexes for efficient queries.
 * Follows the same pattern as selectTabs.js but operates on IndexedDB.
 *
 * Architecture:
 * - Selection layer (read-only, no mutations)
 * - Uses storage utilities from /services/utils/
 * - Returns Collection[] arrays based on filter criteria
 *
 * @module services/selection/selectCollections
 */

import { getAllCollections, getCollectionsByIndex } from '../utils/storage-queries.js';

/**
 * Select collections based on filter criteria
 *
 * @param {Object} filters - Filter criteria
 * @param {boolean|null} [filters.isActive] - true=active, false=saved, null=all
 * @param {string[]} [filters.tags] - Array of tags (matches any)
 * @param {string} [filters.search] - Search in name/description (case-insensitive)
 * @param {number} [filters.lastAccessedAfter] - Min lastAccessed timestamp
 * @param {number} [filters.lastAccessedBefore] - Max lastAccessed timestamp
 * @param {string} [filters.sortBy='lastAccessed'] - Sort field: 'lastAccessed', 'createdAt', 'name'
 * @param {string} [filters.sortOrder='desc'] - Sort direction: 'asc' or 'desc'
 * @returns {Promise<Collection[]>} Filtered and sorted collections
 *
 * @example
 * // Get all active collections
 * const active = await selectCollections({ isActive: true });
 *
 * @example
 * // Get saved collections with 'work' tag, sorted by name
 * const work = await selectCollections({
 *   isActive: false,
 *   tags: ['work'],
 *   sortBy: 'name',
 *   sortOrder: 'asc'
 * });
 *
 * @example
 * // Search collections accessed in last 7 days
 * const recent = await selectCollections({
 *   search: 'project',
 *   lastAccessedAfter: Date.now() - (7 * 24 * 60 * 60 * 1000)
 * });
 */
export async function selectCollections(filters = {}) {
  const {
    isActive = null,
    tags = null,
    search = null,
    lastAccessedAfter = null,
    lastAccessedBefore = null,
    sortBy = 'lastAccessed',
    sortOrder = 'desc'
  } = filters;

  let collections = [];

  // Strategy: Use most selective index first
  // Priority: isActive > tags > all collections

  if (isActive !== null) {
    // Use isActive index (most common filter)
    collections = await getCollectionsByIndex('isActive', isActive);
  } else if (tags && tags.length > 0) {
    // Use tags index (multi-entry, returns duplicates if collection has multiple matching tags)
    // We'll deduplicate after fetching
    const collectionsWithTags = [];
    for (const tag of tags) {
      const tagMatches = await getCollectionsByIndex('tags', tag);
      collectionsWithTags.push(...tagMatches);
    }
    // Deduplicate by id
    const seen = new Set();
    collections = collectionsWithTags.filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  } else {
    // No index applicable, get all collections
    collections = await getAllCollections();
  }

  // Apply post-fetch filters (not indexed)

  // Filter by isActive (if not already used as index)
  if (isActive !== null && tags && tags.length > 0) {
    // We used tags index, now filter by isActive
    collections = collections.filter(c => c.isActive === isActive);
  }

  // Filter by tags (if isActive was used as primary index)
  if (tags && tags.length > 0 && isActive !== null) {
    collections = collections.filter(c =>
      c.tags && c.tags.some(t => tags.includes(t))
    );
  }

  // Search filter (name/description text match)
  if (search) {
    const searchLower = search.toLowerCase();
    collections = collections.filter(c => {
      const nameMatch = c.name && c.name.toLowerCase().includes(searchLower);
      const descMatch = c.description && c.description.toLowerCase().includes(searchLower);
      return nameMatch || descMatch;
    });
  }

  // lastAccessed date range filters
  if (lastAccessedAfter !== null) {
    collections = collections.filter(c =>
      c.metadata.lastAccessed >= lastAccessedAfter
    );
  }

  if (lastAccessedBefore !== null) {
    collections = collections.filter(c =>
      c.metadata.lastAccessed <= lastAccessedBefore
    );
  }

  // Sort collections
  collections = sortCollections(collections, sortBy, sortOrder);

  return collections;
}

/**
 * Sort collections by specified field and order
 *
 * @private
 * @param {Collection[]} collections - Collections to sort
 * @param {string} sortBy - Field to sort by
 * @param {string} sortOrder - 'asc' or 'desc'
 * @returns {Collection[]} Sorted collections (mutates array)
 */
function sortCollections(collections, sortBy, sortOrder) {
  const multiplier = sortOrder === 'asc' ? 1 : -1;

  collections.sort((a, b) => {
    let aVal, bVal;

    switch (sortBy) {
      case 'lastAccessed':
        aVal = a.metadata.lastAccessed;
        bVal = b.metadata.lastAccessed;
        break;
      case 'createdAt':
        aVal = a.metadata.createdAt;
        bVal = b.metadata.createdAt;
        break;
      case 'name':
        aVal = (a.name || '').toLowerCase();
        bVal = (b.name || '').toLowerCase();
        return multiplier * aVal.localeCompare(bVal);
      default:
        // Default to lastAccessed
        aVal = a.metadata.lastAccessed;
        bVal = b.metadata.lastAccessed;
    }

    return multiplier * (aVal - bVal);
  });

  return collections;
}

/**
 * Get all active collections (convenience wrapper)
 *
 * @returns {Promise<Collection[]>} Active collections sorted by lastAccessed
 *
 * @example
 * const activeCollections = await getActiveCollections();
 */
export async function getActiveCollections() {
  return selectCollections({ isActive: true });
}

/**
 * Get all saved (inactive) collections (convenience wrapper)
 *
 * @returns {Promise<Collection[]>} Saved collections sorted by lastAccessed
 *
 * @example
 * const savedCollections = await getSavedCollections();
 */
export async function getSavedCollections() {
  return selectCollections({ isActive: false });
}

/**
 * Search collections by name or description
 *
 * @param {string} query - Search query
 * @returns {Promise<Collection[]>} Matching collections
 *
 * @example
 * const results = await searchCollections('authentication');
 */
export async function searchCollections(query) {
  return selectCollections({ search: query });
}

/**
 * Get collections by tag(s)
 *
 * @param {string|string[]} tags - Single tag or array of tags
 * @returns {Promise<Collection[]>} Collections with matching tags
 *
 * @example
 * const workCollections = await getCollectionsByTags(['work', 'urgent']);
 */
export async function getCollectionsByTags(tags) {
  const tagArray = Array.isArray(tags) ? tags : [tags];
  return selectCollections({ tags: tagArray });
}
