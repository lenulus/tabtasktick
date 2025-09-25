// Mock Chrome APIs for testing

// Use our comprehensive chrome mock
import { chromeMock, resetChromeMocks } from './utils/chrome-mock.js';

global.chrome = chromeMock;

// Reset mocks before each test
global.beforeEach(() => {
  resetChromeMocks();
});