/**
 * Chrome Storage API wrapper for TabMaster Pro
 * Provides a consistent interface for storage operations with error handling
 */

// Storage keys used throughout the application
export const STORAGE_KEYS = {
  TABS_DATA: 'tabsData',
  GROUPS_DATA: 'groupsData',
  SNOOZED_TABS: 'snoozedTabs',
  SETTINGS: 'settings',
  RULES: 'rules',
  ACTIVITY_LOG: 'activityLog',
  LAST_SYNC: 'lastSync',
  USER_PREFERENCES: 'userPreferences'
};

/**
 * Get data from chrome.storage.local
 * @param {string|string[]} keys - Storage key(s) to retrieve
 * @returns {Promise<Object>} Retrieved data
 */
export async function get(keys) {
  try {
    const result = await chrome.storage.local.get(keys);
    return result;
  } catch (error) {
    console.error('Storage get error:', error);
    throw new Error(`Failed to retrieve data: ${error.message}`);
  }
}

/**
 * Set data in chrome.storage.local
 * @param {Object} data - Key-value pairs to store
 * @returns {Promise<void>}
 */
export async function set(data) {
  try {
    await chrome.storage.local.set(data);
  } catch (error) {
    console.error('Storage set error:', error);
    throw new Error(`Failed to save data: ${error.message}`);
  }
}

/**
 * Remove data from chrome.storage.local
 * @param {string|string[]} keys - Storage key(s) to remove
 * @returns {Promise<void>}
 */
export async function remove(keys) {
  try {
    await chrome.storage.local.remove(keys);
  } catch (error) {
    console.error('Storage remove error:', error);
    throw new Error(`Failed to remove data: ${error.message}`);
  }
}

/**
 * Clear all data from chrome.storage.local
 * @returns {Promise<void>}
 */
export async function clear() {
  try {
    await chrome.storage.local.clear();
  } catch (error) {
    console.error('Storage clear error:', error);
    throw new Error(`Failed to clear storage: ${error.message}`);
  }
}

/**
 * Get storage usage information
 * @returns {Promise<{bytesInUse: number, quota: number}>}
 */
export async function getStorageInfo() {
  try {
    const bytesInUse = await chrome.storage.local.getBytesInUse();
    const quota = chrome.storage.local.QUOTA_BYTES || 10485760; // 10MB default
    
    return {
      bytesInUse,
      quota,
      percentUsed: (bytesInUse / quota) * 100
    };
  } catch (error) {
    console.error('Storage info error:', error);
    return {
      bytesInUse: 0,
      quota: 10485760,
      percentUsed: 0
    };
  }
}

/**
 * Listen for storage changes
 * @param {Function} callback - Function to call when storage changes
 * @param {string[]} [watchKeys] - Specific keys to watch (all if not provided)
 * @returns {Function} Function to remove the listener
 */
export function onChange(callback, watchKeys = null) {
  const listener = (changes, areaName) => {
    if (areaName !== 'local') return;
    
    // Filter changes if specific keys are being watched
    if (watchKeys) {
      const filteredChanges = {};
      let hasRelevantChanges = false;
      
      for (const key of watchKeys) {
        if (key in changes) {
          filteredChanges[key] = changes[key];
          hasRelevantChanges = true;
        }
      }
      
      if (hasRelevantChanges) {
        callback(filteredChanges);
      }
    } else {
      callback(changes);
    }
  };
  
  chrome.storage.onChanged.addListener(listener);
  
  // Return function to remove listener
  return () => chrome.storage.onChanged.removeListener(listener);
}

/**
 * Transaction-like operation for multiple storage operations
 * @param {Function} operations - Async function containing storage operations
 * @returns {Promise<*>} Result of the operations
 */
export async function transaction(operations) {
  // Get current state for rollback if needed
  const backup = await chrome.storage.local.get();
  
  try {
    const result = await operations();
    return result;
  } catch (error) {
    // Attempt to restore previous state
    try {
      await chrome.storage.local.clear();
      await chrome.storage.local.set(backup);
    } catch (restoreError) {
      console.error('Failed to restore storage state:', restoreError);
    }
    throw error;
  }
}

/**
 * Storage utilities for specific data types
 */
export const utils = {
  /**
   * Get tabs data with default empty array
   * @returns {Promise<Array>}
   */
  async getTabs() {
    const { [STORAGE_KEYS.TABS_DATA]: tabs = [] } = await get(STORAGE_KEYS.TABS_DATA);
    return tabs;
  },
  
  /**
   * Save tabs data
   * @param {Array} tabs - Tabs array to save
   * @returns {Promise<void>}
   */
  async saveTabs(tabs) {
    await set({ [STORAGE_KEYS.TABS_DATA]: tabs });
  },
  
  /**
   * Get groups data with default empty array
   * @returns {Promise<Array>}
   */
  async getGroups() {
    const { [STORAGE_KEYS.GROUPS_DATA]: groups = [] } = await get(STORAGE_KEYS.GROUPS_DATA);
    return groups;
  },
  
  /**
   * Save groups data
   * @param {Array} groups - Groups array to save
   * @returns {Promise<void>}
   */
  async saveGroups(groups) {
    await set({ [STORAGE_KEYS.GROUPS_DATA]: groups });
  },
  
  /**
   * Get settings with defaults
   * @returns {Promise<Object>}
   */
  async getSettings() {
    const { [STORAGE_KEYS.SETTINGS]: settings = {} } = await get(STORAGE_KEYS.SETTINGS);
    return {
      theme: 'light',
      autoSuspend: false,
      suspendAfter: 30,
      notifications: true,
      ...settings
    };
  },
  
  /**
   * Save settings (merges with existing)
   * @param {Object} settings - Settings to save
   * @returns {Promise<void>}
   */
  async saveSettings(settings) {
    const current = await this.getSettings();
    await set({ 
      [STORAGE_KEYS.SETTINGS]: { ...current, ...settings }
    });
  }
};

// Export storage API
export default {
  get,
  set,
  remove,
  clear,
  getStorageInfo,
  onChange,
  transaction,
  utils,
  KEYS: STORAGE_KEYS
};