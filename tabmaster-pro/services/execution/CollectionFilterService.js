/**
 * @file CollectionFilterService - Centralized filter state management for collections
 *
 * @description
 * The CollectionFilterService manages business rules for collection filter state transitions.
 * It ensures consistent filter behavior when collections change state (saved ↔ active).
 * This service encapsulates the logic that was previously spread across UI components,
 * providing a single source of truth for filter state management.
 *
 * Business Rules:
 * - When opening a saved collection (saved → active), if filter is "saved", switch to "all"
 *   This ensures users see the collection they just opened (now active)
 * - When closing an active collection (active → saved), if filter is "active", switch to "all"
 *   This ensures users see the collection they just closed (now saved)
 *
 * @module services/execution/CollectionFilterService
 *
 * @architecture
 * - Layer: Execution Service (Business Logic)
 * - Dependencies: None (pure business logic)
 * - Used By: UI components (collections-view.js)
 * - Storage: Delegates to searchFilter for persistence
 *
 * @example
 * // When opening a saved collection
 * import { handleCollectionOpened } from './services/execution/CollectionFilterService.js';
 *
 * if (searchFilter) {
 *   await handleCollectionOpened(searchFilter);
 * }
 *
 * @example
 * // When closing an active collection
 * import { handleCollectionClosed } from './services/execution/CollectionFilterService.js';
 *
 * if (searchFilter) {
 *   await handleCollectionClosed(searchFilter);
 * }
 */

/**
 * Handles filter state transition when a saved collection is opened.
 *
 * When a saved collection is opened (becomes active), if the current filter
 * is set to "saved", it automatically switches to "all" so the user can see
 * the newly active collection they just opened.
 *
 * @param {Object} searchFilter - The search filter instance with getCollectionsFilters and saveFilterState methods
 * @returns {Promise<boolean>} True if filter was changed, false otherwise
 *
 * @example
 * // In UI after successfully opening a collection
 * const filterChanged = await handleCollectionOpened(searchFilter);
 * if (filterChanged) {
 *   console.log('Filter switched from "saved" to "all"');
 * }
 */
export async function handleCollectionOpened(searchFilter) {
  if (!searchFilter) {
    return false;
  }

  const filters = searchFilter.getCollectionsFilters();

  // If filter was set to "saved", switch to "all" to show the newly opened collection
  // Otherwise users won't see the collection they just opened (it's now Active)
  if (filters.state === 'saved') {
    // Update filter to show all collections
    searchFilter.collectionsFilters.state = 'all';
    await searchFilter.saveFilterState();
    return true;
  }

  return false;
}

/**
 * Handles filter state transition when an active collection is closed.
 *
 * When an active collection is closed (becomes saved), if the current filter
 * is set to "active", it automatically switches to "all" so the user can see
 * the newly saved collection they just closed.
 *
 * @param {Object} searchFilter - The search filter instance with getCollectionsFilters and saveFilterState methods
 * @returns {Promise<boolean>} True if filter was changed, false otherwise
 *
 * @example
 * // In UI after successfully closing a collection's window
 * const filterChanged = await handleCollectionClosed(searchFilter);
 * if (filterChanged) {
 *   console.log('Filter switched from "active" to "all"');
 * }
 */
export async function handleCollectionClosed(searchFilter) {
  if (!searchFilter) {
    return false;
  }

  const filters = searchFilter.getCollectionsFilters();

  // If filter was set to "active", switch to "all" to show the newly saved collection
  // Otherwise users won't see the collection they just closed (it's now Saved)
  if (filters.state === 'active') {
    // Update filter to show all collections
    searchFilter.collectionsFilters.state = 'all';
    await searchFilter.saveFilterState();
    return true;
  }

  return false;
}

/**
 * Gets the current collection filter state.
 *
 * Utility function to retrieve the current filter state without modifying it.
 * Useful for debugging or conditional logic based on current filter.
 *
 * @param {Object} searchFilter - The search filter instance
 * @returns {string|null} Current filter state ('all', 'active', 'saved') or null if no filter
 *
 * @example
 * const currentState = getCollectionFilterState(searchFilter);
 * console.log(`Current filter: ${currentState}`); // 'all', 'active', 'saved', or null
 */
export function getCollectionFilterState(searchFilter) {
  if (!searchFilter) {
    return null;
  }

  const filters = searchFilter.getCollectionsFilters();
  return filters?.state || null;
}

/**
 * Sets the collection filter state directly.
 *
 * Allows explicit setting of filter state. Use sparingly - prefer the
 * business rule functions (handleCollectionOpened/Closed) for state transitions.
 *
 * @param {Object} searchFilter - The search filter instance
 * @param {string} state - New filter state ('all', 'active', 'saved')
 * @returns {Promise<boolean>} True if filter was changed, false if already at that state
 *
 * @example
 * // Force filter to show all collections
 * await setCollectionFilterState(searchFilter, 'all');
 */
export async function setCollectionFilterState(searchFilter, state) {
  if (!searchFilter || !state) {
    return false;
  }

  const filters = searchFilter.getCollectionsFilters();

  // No change needed if already at target state
  if (filters.state === state) {
    return false;
  }

  // Update filter state
  searchFilter.collectionsFilters.state = state;
  await searchFilter.saveFilterState();
  return true;
}