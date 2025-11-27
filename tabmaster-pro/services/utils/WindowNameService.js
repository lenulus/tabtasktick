/**
 * @file WindowNameService - Window naming utilities
 *
 * Single source of truth for window name storage and retrieval.
 * Consolidates window name logic previously duplicated across
 * dashboard.js, tabs.js, and shared-utils.js.
 */

const STORAGE_KEY = 'windowNames';
const SIGNATURES_KEY = 'windowSignatures';

/**
 * Get all window names from storage.
 * @returns {Promise<Object>} Map of windowId -> name
 */
export async function getWindowNames() {
  const { [STORAGE_KEY]: names = {} } = await chrome.storage.local.get([STORAGE_KEY]);
  return names;
}

/**
 * Get window names and signatures from storage.
 * @returns {Promise<{windowNames: Object, windowSignatures: Object}>}
 */
export async function getWindowNamesAndSignatures() {
  const result = await chrome.storage.local.get([STORAGE_KEY, SIGNATURES_KEY]);
  return {
    windowNames: result[STORAGE_KEY] || {},
    windowSignatures: result[SIGNATURES_KEY] || {}
  };
}

/**
 * Save all window names to storage.
 * @param {Object} names - Map of windowId -> name
 */
export async function setWindowNames(names) {
  await chrome.storage.local.set({ [STORAGE_KEY]: names });
}

/**
 * Save window names and signatures to storage.
 * @param {Object} names - Map of windowId -> name
 * @param {Object} signatures - Map of signature -> name
 */
export async function setWindowNamesAndSignatures(names, signatures) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: names,
    [SIGNATURES_KEY]: signatures
  });
}

/**
 * Set or delete a single window name.
 * @param {number} windowId - Chrome window ID
 * @param {string|null} name - Name to set, or null/empty to delete
 */
export async function setWindowName(windowId, name) {
  const names = await getWindowNames();
  if (name && name.trim()) {
    names[windowId] = name.trim();
  } else {
    delete names[windowId];
  }
  await setWindowNames(names);
}

/**
 * Get name for a specific window.
 * @param {number} windowId - Chrome window ID
 * @returns {Promise<string|null>} Window name or null
 */
export async function getWindowName(windowId) {
  const names = await getWindowNames();
  return names[windowId] || null;
}

/**
 * Update multiple window names at once.
 * @param {Object} updates - Map of windowId -> name (null to delete)
 */
export async function updateWindowNames(updates) {
  const names = await getWindowNames();
  for (const [windowId, name] of Object.entries(updates)) {
    if (name && name.trim()) {
      names[windowId] = name.trim();
    } else {
      delete names[windowId];
    }
  }
  await setWindowNames(names);
}
