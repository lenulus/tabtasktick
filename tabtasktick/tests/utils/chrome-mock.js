// Chrome API Mocks for Testing
// Provides mock implementations of Chrome Extension APIs used in the rules engine

import { jest } from '@jest/globals';

export const chromeMock = {
  tabs: {
    query: jest.fn(() => Promise.resolve([])),
    remove: jest.fn(() => Promise.resolve()),
    group: jest.fn(() => Promise.resolve(1)),
    ungroup: jest.fn(() => Promise.resolve()),
    update: jest.fn(() => Promise.resolve()),
    get: jest.fn(() => Promise.resolve()),
    move: jest.fn(() => Promise.resolve()),
    create: jest.fn(() => Promise.resolve({ id: 1 })),
    // Event listeners for ProgressiveSyncService
    onCreated: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    onRemoved: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    onMoved: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    onAttached: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    onDetached: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  },

  tabGroups: {
    get: jest.fn(() => Promise.resolve()),
    update: jest.fn(() => Promise.resolve()),
    query: jest.fn(() => Promise.resolve([])),
    TAB_GROUP_ID_NONE: -1,
    // Event listeners for ProgressiveSyncService
    onCreated: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    onRemoved: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    onMoved: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  },
  
  windows: {
    get: jest.fn(() => Promise.resolve()),
    getCurrent: jest.fn(() => Promise.resolve({ id: 1 })),
    getLastFocused: jest.fn(() => Promise.resolve({ id: 1 })),
    getAll: jest.fn(() => Promise.resolve([])),
    create: jest.fn(() => Promise.resolve({ id: 1 })),
    update: jest.fn(() => Promise.resolve()),
    // Event listener for ProgressiveSyncService
    onRemoved: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  },
  
  storage: {
    local: {
      get: jest.fn(() => Promise.resolve({})),
      set: jest.fn(() => Promise.resolve()),
      remove: jest.fn(() => Promise.resolve()),
      clear: jest.fn(() => Promise.resolve())
    },
    
    onChanged: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  },
  
  alarms: {
    create: jest.fn(),
    clear: jest.fn(() => Promise.resolve()),
    get: jest.fn(() => Promise.resolve()),
    getAll: jest.fn(() => Promise.resolve([])),
    onAlarm: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  },
  
  runtime: {
    lastError: null,
    id: 'test-extension-id',
    getURL: jest.fn(path => `chrome-extension://test-extension-id/${path}`),
    getManifest: jest.fn(() => ({ version: '1.0.0' })),
    sendMessage: jest.fn(() => Promise.resolve()),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  },
  
  bookmarks: {
    create: jest.fn(() => Promise.resolve({ id: '1' })),
    get: jest.fn(() => Promise.resolve([])),
    getTree: jest.fn(() => Promise.resolve([])),
    search: jest.fn(() => Promise.resolve([])),
    update: jest.fn(() => Promise.resolve()),
    remove: jest.fn(() => Promise.resolve())
  },
  
  idle: {
    queryState: jest.fn(() => Promise.resolve('active')),
    setDetectionInterval: jest.fn()
  },
  
  system: {
    memory: {
      getInfo: jest.fn(() => Promise.resolve({
        capacity: 8 * 1024 * 1024 * 1024, // 8GB
        availableCapacity: 4 * 1024 * 1024 * 1024 // 4GB
      }))
    }
  },

  downloads: {
    download: jest.fn(() => Promise.resolve(12345)),
    search: jest.fn(() => Promise.resolve([])),
    removeFile: jest.fn(() => Promise.resolve()),
    erase: jest.fn(() => Promise.resolve()),
    getFileIcon: jest.fn(() => Promise.resolve(''))
  }
};

// Helper to reset all mocks
export function resetChromeMocks() {
  Object.values(chromeMock).forEach(api => {
    if (typeof api === 'object' && api !== null) {
      Object.values(api).forEach(method => {
        if (method && typeof method.mockClear === 'function') {
          method.mockClear();
        } else if (method && typeof method === 'object' && method.addListener && typeof method.addListener.mockClear === 'function') {
          method.addListener.mockClear();
          if (method.removeListener && typeof method.removeListener.mockClear === 'function') {
            method.removeListener.mockClear();
          }
        }
      });
    }
  });
}

// Helper to setup mock responses
export function setupMockResponse(api, method, response) {
  const parts = api.split('.');
  let obj = chromeMock;
  
  for (const part of parts) {
    obj = obj[part];
  }
  
  if (obj && obj[method]) {
    obj[method].mockResolvedValue(response);
  }
}

// Helper to setup mock error
export function setupMockError(api, method, error) {
  const parts = api.split('.');
  let obj = chromeMock;
  
  for (const part of parts) {
    obj = obj[part];
  }
  
  if (obj && obj[method]) {
    obj[method].mockRejectedValue(error);
  }
}

// Make chrome globally available for tests
if (typeof global !== 'undefined') {
  global.chrome = chromeMock;
}

export default chromeMock;