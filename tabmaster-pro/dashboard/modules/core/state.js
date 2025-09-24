/**
 * Centralized state management for TabMaster Pro Dashboard
 * Provides a single source of truth for all application state
 */

import { VIEWS } from './constants.js';

// Private state object
const state = {
  // View state
  currentView: VIEWS.OVERVIEW,
  
  // Tab data
  tabsData: [],
  selectedTabs: new Set(),
  groupsData: [],
  snoozedData: [],
  
  // UI components
  charts: {},
  snoozeModal: null,
  previewCard: null,
  
  // Selection state
  selectionState: {
    selecting: false,
    allSelected: false,
    bulkBarActive: false
  },
  
  // Charts
  activityChart: null,
  domainsChart: null,
  
  // Rules engine
  currentRules: [],
  editingRule: null,
  sampleRules: [],
  
  // Settings
  settings: {
    theme: 'light',
    autoSuspend: false,
    suspendAfter: 30,
    notifications: true
  }
};

// State change listeners
const listeners = new Map();

/**
 * Get current state or specific property
 * @param {string} [path] - Optional dot-notation path to specific property
 * @returns {*} State value
 */
export function getState(path = null) {
  if (!path) return { ...state };
  
  const keys = path.split('.');
  let value = state;
  
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return undefined;
    }
  }
  
  // Return copy for objects/arrays to prevent direct mutation
  if (typeof value === 'object' && value !== null) {
    if (value instanceof Set) {
      return new Set(value);
    } else if (value instanceof Map) {
      return new Map(value);
    } else if (Array.isArray(value)) {
      return [...value];
    } else {
      return { ...value };
    }
  }
  
  return value;
}

/**
 * Update state with new values
 * @param {string|object} pathOrUpdates - Path to update or object with multiple updates
 * @param {*} [value] - Value to set (if path is string)
 */
export function setState(pathOrUpdates, value) {
  const updates = typeof pathOrUpdates === 'string' 
    ? { [pathOrUpdates]: value }
    : pathOrUpdates;
  
  const changedPaths = [];
  
  for (const [path, newValue] of Object.entries(updates)) {
    const keys = path.split('.');
    let target = state;
    
    // Navigate to parent of target property
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in target)) {
        target[key] = {};
      }
      target = target[key];
    }
    
    // Set the value
    const lastKey = keys[keys.length - 1];
    const oldValue = target[lastKey];
    
    if (oldValue !== newValue) {
      target[lastKey] = newValue;
      changedPaths.push(path);
    }
  }
  
  // Notify listeners
  if (changedPaths.length > 0) {
    notifyListeners(changedPaths, updates);
  }
}

/**
 * Subscribe to state changes
 * @param {string|string[]} paths - Path(s) to watch (or '*' for all changes)
 * @param {Function} callback - Function to call on state change
 * @returns {Function} Unsubscribe function
 */
export function subscribe(paths, callback) {
  const pathArray = Array.isArray(paths) ? paths : [paths];
  const id = Symbol('listener');
  
  listeners.set(id, {
    paths: pathArray,
    callback
  });
  
  // Return unsubscribe function
  return () => listeners.delete(id);
}

/**
 * Notify listeners about state changes
 * @private
 */
function notifyListeners(changedPaths, updates) {
  for (const { paths, callback } of listeners.values()) {
    const shouldNotify = paths.includes('*') || 
      paths.some(path => changedPaths.some(changed => 
        changed === path || changed.startsWith(path + '.')
      ));
    
    if (shouldNotify) {
      callback(updates, changedPaths);
    }
  }
}

/**
 * Batch multiple state updates
 * @param {Function} updateFn - Function that performs multiple setState calls
 */
export function batchUpdate(updateFn) {
  // Store original notifyListeners
  const originalNotify = notifyListeners;
  const batchedChanges = {};
  const batchedPaths = new Set();
  
  // Temporarily replace notifyListeners to collect changes
  window._notifyListeners = notifyListeners;
  window.notifyListeners = (paths, updates) => {
    Object.assign(batchedChanges, updates);
    paths.forEach(path => batchedPaths.add(path));
  };
  
  try {
    updateFn();
  } finally {
    // Restore original notifyListeners
    notifyListeners = window._notifyListeners;
    delete window._notifyListeners;
    
    // Notify once with all changes
    if (batchedPaths.size > 0) {
      originalNotify(Array.from(batchedPaths), batchedChanges);
    }
  }
}

/**
 * Reset state to initial values
 * @param {string[]} [paths] - Specific paths to reset, or all if not provided
 */
export function resetState(paths = null) {
  const initialState = {
    currentView: VIEWS.OVERVIEW,
    tabsData: [],
    selectedTabs: new Set(),
    groupsData: [],
    snoozedData: [],
    charts: {},
    snoozeModal: null,
    previewCard: null,
    selectionState: {
      selecting: false,
      allSelected: false,
      bulkBarActive: false
    },
    activityChart: null,
    domainsChart: null,
    currentRules: [],
    editingRule: null,
    sampleRules: [],
    settings: {
      theme: 'light',
      autoSuspend: false,
      suspendAfter: 30,
      notifications: true
    }
  };
  
  if (paths) {
    const updates = {};
    for (const path of paths) {
      const keys = path.split('.');
      let value = initialState;
      for (const key of keys) {
        value = value?.[key];
      }
      if (value !== undefined) {
        updates[path] = value;
      }
    }
    setState(updates);
  } else {
    setState(initialState);
  }
}

// Special methods for Set operations on selectedTabs
export const selectedTabsAPI = {
  add(tabId) {
    const selectedTabs = getState('selectedTabs');
    selectedTabs.add(tabId);
    setState('selectedTabs', new Set(selectedTabs));
  },
  
  delete(tabId) {
    const selectedTabs = getState('selectedTabs');
    selectedTabs.delete(tabId);
    setState('selectedTabs', new Set(selectedTabs));
  },
  
  clear() {
    setState('selectedTabs', new Set());
  },
  
  has(tabId) {
    return getState('selectedTabs').has(tabId);
  },
  
  toggle(tabId) {
    if (this.has(tabId)) {
      this.delete(tabId);
    } else {
      this.add(tabId);
    }
  },
  
  get size() {
    return getState('selectedTabs').size;
  }
};

// Export state management API
export default {
  get: getState,
  set: setState,
  subscribe,
  batchUpdate,
  reset: resetState,
  selectedTabs: selectedTabsAPI
};