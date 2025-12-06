/**
 * Custom Jest environment that adds structuredClone to jsdom
 *
 * Fixes fake-indexeddb compatibility issue where jsdom doesn't expose
 * Node.js's native structuredClone (available in Node 17+).
 *
 * Solution from: https://github.com/dumbmatter/fakeIndexedDB/issues/88
 */

// Use CommonJS for Jest environment compatibility
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const JSDOMEnvironment = require('jest-environment-jsdom').default;

class JSDOMEnvironmentWithStructuredClone extends JSDOMEnvironment {
  constructor(...args) {
    super(...args);

    // Add Node.js's native structuredClone to the jsdom global scope
    // This is required for fake-indexeddb to properly clone indexed objects
    this.global.structuredClone = structuredClone;
  }
}

export default JSDOMEnvironmentWithStructuredClone;
