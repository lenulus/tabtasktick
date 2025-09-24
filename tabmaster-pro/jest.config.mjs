export default {
  // Use native ES modules
  testEnvironment: 'jsdom',
  extensionsToTreatAsEsm: ['.js'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {},
  testMatch: [
    '<rootDir>/dashboard/tests/**/*.test.js',
    '<rootDir>/tests/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};