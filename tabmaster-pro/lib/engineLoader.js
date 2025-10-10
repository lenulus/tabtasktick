// lib/engineLoader.js
// Engine loader - V2 Services only (V1 removed in Phase 7.2)

const STORAGE_KEY = 'activeEngine';
const DEFAULT_ENGINE = 'v2-services';

// Available engines (V2 only)
const ENGINES = {
  'v2-services': {
    name: 'V2 Services',
    description: 'Services-first architecture - production engine',
    path: './engine.v2.services.js',
    module: null // Lazy loaded
  }
};

/**
 * Get the currently active engine version from storage
 * @returns {Promise<string>} Engine version key (e.g., 'v1-legacy', 'v2-services')
 */
export async function getActiveEngineVersion() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || DEFAULT_ENGINE;
}

/**
 * Set the active engine version in storage
 * @param {string} version - Engine version key
 * @returns {Promise<void>}
 */
export async function setActiveEngineVersion(version) {
  if (!ENGINES[version]) {
    throw new Error(`Unknown engine version: ${version}`);
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: version });

  // Emit storage change event so other contexts can react
  chrome.runtime.sendMessage({
    type: 'ENGINE_CHANGED',
    version: version
  }).catch(() => {
    // Ignore errors if no listeners
  });
}

/**
 * Get the active engine module (lazy loaded)
 * @returns {Promise<object>} Engine module with runRules, executeActions, etc.
 */
export async function getActiveEngine() {
  const version = await getActiveEngineVersion();
  const engineConfig = ENGINES[version];

  if (!engineConfig) {
    console.warn(`Engine ${version} not found, falling back to ${DEFAULT_ENGINE}`);
    return getEngineByVersion(DEFAULT_ENGINE);
  }

  return getEngineByVersion(version);
}

/**
 * Get a specific engine by version (for testing/comparison)
 * @param {string} version - Engine version key
 * @returns {Promise<object>} Engine module
 */
export async function getEngineByVersion(version) {
  const engineConfig = ENGINES[version];

  if (!engineConfig) {
    throw new Error(`Unknown engine version: ${version}`);
  }

  // Lazy load the module if not already loaded
  if (!engineConfig.module) {
    engineConfig.module = await import(engineConfig.path);
  }

  return engineConfig.module;
}

/**
 * Get list of available engines for UI
 * @returns {Array<{key: string, name: string, description: string}>}
 */
export function getAvailableEngines() {
  return Object.entries(ENGINES).map(([key, config]) => ({
    key,
    name: config.name,
    description: config.description
  }));
}

/**
 * Get engine info for display
 * @param {string} version - Engine version key
 * @returns {object|null} Engine info or null if not found
 */
export function getEngineInfo(version) {
  const config = ENGINES[version];
  if (!config) return null;

  return {
    version,
    name: config.name,
    description: config.description
  };
}

/**
 * Listen for engine changes (for UI updates)
 * @param {Function} callback - Called with new version when engine changes
 */
export function onEngineChanged(callback) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'ENGINE_CHANGED') {
      callback(message.version);
    }
  });

  // Also listen to storage changes (in case changed from another context)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[STORAGE_KEY]) {
      callback(changes[STORAGE_KEY].newValue);
    }
  });
}
