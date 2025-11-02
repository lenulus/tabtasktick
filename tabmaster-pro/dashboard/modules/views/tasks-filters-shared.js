/**
 * Shared TasksFilters Singleton
 *
 * Provides a single shared instance of TasksFilters across all task views
 * to prevent duplicate event listeners and maintain filter state consistency
 * when switching between kanban and list views.
 */

import { TasksFilters } from './tasks-filters.js';

// Singleton instance
let sharedFiltersInstance = null;

/**
 * Get or create the shared filters instance
 * @returns {TasksFilters} The singleton filters instance
 */
export function getSharedFiltersInstance() {
  if (!sharedFiltersInstance) {
    sharedFiltersInstance = new TasksFilters();
  }
  return sharedFiltersInstance;
}

/**
 * Reset the shared instance (useful for testing)
 */
export function resetSharedFiltersInstance() {
  sharedFiltersInstance = null;
}
