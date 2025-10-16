// Mock Chrome APIs for testing

// Use our comprehensive chrome mock
import { chromeMock, resetChromeMocks } from './utils/chrome-mock.js';

global.chrome = chromeMock;

// Note: structuredClone is provided by our custom Jest environment
// (tests/jsdom-with-structuredclone.js) which exposes Node.js's native
// structuredClone to jsdom. This is required for fake-indexeddb to work.

// Reset mocks before each test
global.beforeEach(() => {
  resetChromeMocks();
});