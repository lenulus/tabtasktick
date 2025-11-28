import localPlugin from './eslint-plugin-local/index.js';

export default [
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      '*.min.js',
      'vendor/**',
      'dist/**',
      'build/**',
      'tests/fixtures/**',
      'eslint-plugin-local/**'
    ]
  },
  // Main config for all files
  {
    files: ['**/*.js'],
    plugins: {
      local: localPlugin
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Chrome Extension APIs
        chrome: 'readonly',

        // Browser APIs
        console: 'readonly',
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        indexedDB: 'readonly',
        crypto: 'readonly',
        performance: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        MutationObserver: 'readonly',
        AbortController: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FormData: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        self: 'readonly',
        HTMLElement: 'readonly',
        structuredClone: 'readonly',

        // Library globals (loaded via CDN)
        Chart: 'readonly',

        // Node.js globals (for scripts that run in both contexts)
        process: 'readonly',
        module: 'readonly',
        define: 'readonly',

        // Built-in types
        Promise: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        WeakMap: 'readonly',
        WeakSet: 'readonly',
        Date: 'readonly',
        Math: 'readonly',
        JSON: 'readonly',
        RegExp: 'readonly',
        Array: 'readonly',
        Object: 'readonly',
        String: 'readonly',
        Number: 'readonly',
        Boolean: 'readonly',
        Error: 'readonly',
        TypeError: 'readonly',
        RangeError: 'readonly',
        SyntaxError: 'readonly',
        EvalError: 'readonly',
        ReferenceError: 'readonly',
        URIError: 'readonly',
        Intl: 'readonly',
        globalThis: 'readonly',

        // Jest/Testing globals
        expect: 'readonly',
        test: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
        global: 'readonly'
      }
    },
    rules: {
      // CRITICAL: Architectural integrity rules
      'local/no-async-chrome-listener': 'error',

      // CRITICAL: Ban dynamic imports - they crash Chrome extensions
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression',
          message: '🚨 FORBIDDEN: Dynamic import() will CRASH Chrome! Use static imports at top of file only.'
        },
        {
          selector: 'CallExpression[callee.name="require"]',
          message: '🚨 FORBIDDEN: require() is not allowed in ES modules. Use static imports.'
        }
      ],

      // Security rules
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-implied-eval': 'error',
      'no-script-url': 'error',

      // Code style
      'indent': ['error', 2],
      'semi': ['error', 'always'],
      'quotes': ['error', 'single', { 'avoidEscape': true }],

      // Best practices
      'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],
      'no-console': 'off',
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-undef': 'error',
      'no-redeclare': 'error'
    }
  },
  // Test files config - allow dynamic imports (they run in Node.js, not Chrome)
  {
    files: ['tests/**/*.js', '**/*.test.js', '**/*.spec.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="require"]',
          message: '🚨 FORBIDDEN: require() is not allowed in ES modules. Use static imports.'
        }
      ]
    }
  },
  // Webpage context files - allow dynamic imports (dashboard, options, test panels)
  {
    files: ['lib/engineLoader.js', 'lib/test-mode/**/*.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="require"]',
          message: '🚨 FORBIDDEN: require() is not allowed in ES modules. Use static imports.'
        }
      ]
    }
  },
  // Chart.js is minified vendor code - disable all rules
  {
    files: ['lib/chart.min.js'],
    rules: {
      'no-var': 'off',
      'no-undef': 'off',
      'no-restricted-syntax': 'off'
    }
  }
];