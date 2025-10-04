export default [
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      '*.min.js',
      'vendor/**',
      'dist/**',
      'build/**',
      'tests/fixtures/**'
    ]
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        chrome: 'readonly',
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
        localStorage: 'readonly',
        sessionStorage: 'readonly'
      }
    },
    rules: {
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
  }
];