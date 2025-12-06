export default {
  // Use custom jsdom environment with structuredClone support for fake-indexeddb
  testEnvironment: '<rootDir>/tests/jsdom-with-structuredclone.js',
  extensionsToTreatAsEsm: ['.jsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {},
  testMatch: [
    '<rootDir>/dashboard/tests/**/*.test.js',
    '<rootDir>/tests/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons']
  }
};