// Mock Chrome APIs for testing

// Use our comprehensive chrome mock
import { chromeMock, resetChromeMocks } from './utils/chrome-mock.js';
import { randomUUID } from 'crypto';

global.chrome = chromeMock;

// Note: structuredClone is provided by our custom Jest environment
// (tests/jsdom-with-structuredclone.js) which exposes Node.js's native
// structuredClone to jsdom. This is required for fake-indexeddb to work.

// Polyfill crypto.randomUUID() for jsdom (available in Node.js)
if (!global.crypto) {
  global.crypto = {};
}
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = randomUUID;
}

// Reset mocks before each test
global.beforeEach(() => {
  resetChromeMocks();
});