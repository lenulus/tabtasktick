/**
 * Unit tests for console-capture utility
 *
 * Tests:
 * - Level filtering (methods become noop or original based on level)
 * - Surface detection accuracy
 * - Storage change handling
 * - Initialization guard (prevents double-init)
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock chrome.storage.local
const mockStorage = {
  data: {},
  listeners: [],
  get: jest.fn(async (keys) => {
    const result = {};
    for (const key of keys) {
      if (key in mockStorage.data) {
        result[key] = mockStorage.data[key];
      }
    }
    return result;
  }),
  set: jest.fn(async (data) => {
    const changes = {};
    for (const [key, value] of Object.entries(data)) {
      const oldValue = mockStorage.data[key];
      mockStorage.data[key] = value;
      changes[key] = { oldValue, newValue: value };
    }
    // Notify listeners
    for (const listener of mockStorage.listeners) {
      listener(changes, 'local');
    }
  })
};

const mockStorageOnChanged = {
  addListener: jest.fn((listener) => {
    mockStorage.listeners.push(listener);
  }),
  removeListener: jest.fn((listener) => {
    const index = mockStorage.listeners.indexOf(listener);
    if (index > -1) {
      mockStorage.listeners.splice(index, 1);
    }
  })
};

// Set up global chrome mock
global.chrome = {
  storage: {
    local: mockStorage,
    onChanged: mockStorageOnChanged
  }
};

// Mock location for surface detection tests
const originalLocation = global.location;

// Import after setting up mocks
let consoleCapture;

// Track original console methods for verification
let originalConsoleLog;
let originalConsoleWarn;
let originalConsoleError;
let originalConsoleDebug;
let originalConsoleInfo;

describe('console-capture', () => {
  beforeEach(async () => {
    // Save original console methods
    originalConsoleLog = console.log;
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;
    originalConsoleDebug = console.debug;
    originalConsoleInfo = console.info;

    // Reset mocks
    mockStorage.data = {};
    mockStorage.listeners = [];
    mockStorage.get.mockClear();
    mockStorageOnChanged.addListener.mockClear();

    // Clear module cache to get fresh state
    jest.resetModules();

    // Re-import module to get fresh state
    consoleCapture = await import('../services/utils/console-capture.js');
    consoleCapture._resetForTesting();
  });

  afterEach(() => {
    if (consoleCapture) {
      consoleCapture._resetForTesting();
    }
    global.location = originalLocation;
  });

  describe('level filtering', () => {
    // Helper to check if a function is the noop
    const isNoop = (fn) => fn.name === 'noop';
    const isOriginal = (fn) => fn.name !== 'noop';

    it('should allow only warn and error when level is 2 (warn)', async () => {
      await consoleCapture.initConsoleCapture();
      consoleCapture._setEffectiveLevelForTesting(2); // warn level

      // debug, log, info should be noop
      expect(isNoop(console.debug)).toBe(true);
      expect(isNoop(console.log)).toBe(true);
      expect(isNoop(console.info)).toBe(true);

      // warn and error should be originals
      expect(isOriginal(console.warn)).toBe(true);
      expect(isOriginal(console.error)).toBe(true);
    });

    it('should allow all logs when level is 0 (debug)', async () => {
      await consoleCapture.initConsoleCapture();
      consoleCapture._setEffectiveLevelForTesting(0); // debug level

      // All should be originals
      expect(isOriginal(console.debug)).toBe(true);
      expect(isOriginal(console.log)).toBe(true);
      expect(isOriginal(console.info)).toBe(true);
      expect(isOriginal(console.warn)).toBe(true);
      expect(isOriginal(console.error)).toBe(true);
    });

    it('should allow only errors when level is 3 (error)', async () => {
      await consoleCapture.initConsoleCapture();
      consoleCapture._setEffectiveLevelForTesting(3); // error level

      expect(isNoop(console.debug)).toBe(true);
      expect(isNoop(console.log)).toBe(true);
      expect(isNoop(console.info)).toBe(true);
      expect(isNoop(console.warn)).toBe(true);
      expect(isOriginal(console.error)).toBe(true);
    });

    it('should treat log and info as same level (1)', async () => {
      await consoleCapture.initConsoleCapture();
      consoleCapture._setEffectiveLevelForTesting(1); // log/info level

      expect(isNoop(console.debug)).toBe(true);
      expect(isOriginal(console.log)).toBe(true);
      expect(isOriginal(console.info)).toBe(true);
      expect(isOriginal(console.warn)).toBe(true);
      expect(isOriginal(console.error)).toBe(true);
    });

    it('should not throw when calling filtered methods', async () => {
      await consoleCapture.initConsoleCapture();
      consoleCapture._setEffectiveLevelForTesting(3); // error only

      expect(() => {
        console.debug('test');
        console.log('test');
        console.info('test');
        console.warn('test');
      }).not.toThrow();
    });
  });

  describe('initialization', () => {
    it('should prevent double initialization', async () => {
      await consoleCapture.initConsoleCapture();
      const firstInitState = consoleCapture.isInitialized();

      await consoleCapture.initConsoleCapture();
      const secondInitState = consoleCapture.isInitialized();

      expect(firstInitState).toBe(true);
      expect(secondInitState).toBe(true);
      // Storage listener should only be added once
      expect(mockStorageOnChanged.addListener).toHaveBeenCalledTimes(1);
    });

    it('should load settings from storage on init', async () => {
      mockStorage.data = {
        developerMode: true,
        developerLogLevel: 0
      };

      await consoleCapture.initConsoleCapture();

      expect(mockStorage.get).toHaveBeenCalledWith(['developerMode', 'developerLogLevel']);
      expect(consoleCapture.getEffectiveLevel()).toBe(0); // debug level
    });

    it('should default to warn level when developerMode is off', async () => {
      mockStorage.data = {
        developerMode: false,
        developerLogLevel: 0 // Even if user set debug level
      };

      await consoleCapture.initConsoleCapture();

      expect(consoleCapture.getEffectiveLevel()).toBe(2); // warn level (forced)
    });

    it('should default to warn level when storage is empty', async () => {
      mockStorage.data = {};

      await consoleCapture.initConsoleCapture();

      expect(consoleCapture.getEffectiveLevel()).toBe(2); // warn level (default)
    });
  });

  describe('storage change handling', () => {
    it('should update level when developerMode changes', async () => {
      mockStorage.data = {
        developerMode: false,
        developerLogLevel: 0
      };

      await consoleCapture.initConsoleCapture();
      expect(consoleCapture.getEffectiveLevel()).toBe(2); // warn (forced when dev mode off)

      // Simulate storage change
      mockStorage.data = {
        developerMode: true,
        developerLogLevel: 0
      };

      // Trigger storage change listener
      for (const listener of mockStorage.listeners) {
        await listener({ developerMode: { newValue: true } }, 'local');
      }

      // Give async listener time to complete
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(consoleCapture.getEffectiveLevel()).toBe(0); // debug level
    });

    it('should update level when developerLogLevel changes', async () => {
      mockStorage.data = {
        developerMode: true,
        developerLogLevel: 2
      };

      await consoleCapture.initConsoleCapture();
      expect(consoleCapture.getEffectiveLevel()).toBe(2);

      // Simulate storage change
      mockStorage.data = {
        developerMode: true,
        developerLogLevel: 0
      };

      // Trigger storage change listener
      for (const listener of mockStorage.listeners) {
        await listener({ developerLogLevel: { newValue: 0 } }, 'local');
      }

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(consoleCapture.getEffectiveLevel()).toBe(0);
    });

    it('should ignore changes to unrelated storage keys', async () => {
      mockStorage.data = {
        developerMode: true,
        developerLogLevel: 1
      };

      await consoleCapture.initConsoleCapture();
      const initialLevel = consoleCapture.getEffectiveLevel();
      const initialGetCallCount = mockStorage.get.mock.calls.length;

      // Simulate unrelated storage change
      for (const listener of mockStorage.listeners) {
        await listener({ someOtherKey: { newValue: 'whatever' } }, 'local');
      }

      await new Promise(resolve => setTimeout(resolve, 20));

      // Should not reload settings
      expect(mockStorage.get.mock.calls.length).toBe(initialGetCallCount);
      expect(consoleCapture.getEffectiveLevel()).toBe(initialLevel);
    });

    it('should ignore changes to sync storage area', async () => {
      mockStorage.data = {
        developerMode: true,
        developerLogLevel: 1
      };

      await consoleCapture.initConsoleCapture();
      const initialGetCallCount = mockStorage.get.mock.calls.length;

      // Simulate sync storage change
      for (const listener of mockStorage.listeners) {
        await listener({ developerMode: { newValue: false } }, 'sync');
      }

      await new Promise(resolve => setTimeout(resolve, 20));

      // Should not reload settings for sync area
      expect(mockStorage.get.mock.calls.length).toBe(initialGetCallCount);
    });
  });

  describe('surface detection', () => {
    it('should return "unknown" or "background" for unrecognized paths', async () => {
      const surface = consoleCapture.getSurface();
      // In test environment, location is likely undefined or unmatched
      expect(['unknown', 'background']).toContain(surface);
    });
  });

  describe('getEffectiveLevel', () => {
    it('should return current effective level', async () => {
      consoleCapture._setEffectiveLevelForTesting(3);
      expect(consoleCapture.getEffectiveLevel()).toBe(3);

      consoleCapture._setEffectiveLevelForTesting(0);
      expect(consoleCapture.getEffectiveLevel()).toBe(0);
    });
  });

  describe('reset functionality', () => {
    it('should restore original console methods on reset', async () => {
      await consoleCapture.initConsoleCapture();
      consoleCapture._setEffectiveLevelForTesting(3); // Set to error only

      // console.log should be noop
      expect(console.log.name).toBe('noop');

      // Reset
      consoleCapture._resetForTesting();

      // Should be restored to original (not noop)
      expect(console.log.name).not.toBe('noop');
    });
  });

  describe('error handling', () => {
    it('should default to warn level if storage.get throws', async () => {
      mockStorage.get.mockRejectedValueOnce(new Error('Storage error'));

      await consoleCapture.initConsoleCapture();

      expect(consoleCapture.getEffectiveLevel()).toBe(2); // Default warn level
    });
  });
});
