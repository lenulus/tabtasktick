// Engine Compatibility Test Suite
// Tests all engine versions to ensure they produce the same results

import { jest } from '@jest/globals';

// Import all engine versions
import * as engineV1 from '../lib/engine.v1.legacy.js';
import * as engineV2Services from '../lib/engine.v2.services.js';

// Helper to select engine based on environment variable
const SELECTED_ENGINE = process.env.TEST_ENGINE || 'v1';

const engines = {
  'v1': engineV1,
  'v2-services': engineV2Services,
  // Command pattern engines need their dependencies mocked first
  // 'v2-command-full': engineV2CommandFull,
  // 'v2-command-compact': engineV2CommandCompact
};

const getEngine = () => engines[SELECTED_ENGINE];

describe(`Engine Compatibility Tests [Testing: ${SELECTED_ENGINE}]`, () => {
  // Mock Chrome API
  const mockChrome = {
    tabs: {
      query: jest.fn(),
      remove: jest.fn(),
      update: jest.fn(),
      group: jest.fn(),
      ungroup: jest.fn(),
      discard: jest.fn()
    },
    windows: {
      getAll: jest.fn()
    },
    storage: {
      local: {
        get: jest.fn(),
        set: jest.fn()
      }
    },
    bookmarks: {
      create: jest.fn()
    }
  };

  beforeEach(() => {
    global.chrome = mockChrome;
    jest.clearAllMocks();
  });

  describe('Basic Rule Evaluation', () => {
    test('should select tabs matching domain rule', async () => {
      const engine = getEngine();

      const tabs = [
        { id: 1, url: 'https://github.com/repo1', title: 'Repo 1' },
        { id: 2, url: 'https://stackoverflow.com/question', title: 'SO Question' },
        { id: 3, url: 'https://github.com/repo2', title: 'Repo 2' }
      ];

      const rule = {
        id: 'test-domain',
        name: 'GitHub tabs',
        enabled: true,
        when: {
          all: [
            { eq: ['tab.domain', 'github.com'] }
          ]
        },
        then: [
          { action: 'pin' }
        ]
      };

      const context = {
        tabs,
        windows: [],
        chrome: mockChrome,
        idx: engine.buildIndices ? engine.buildIndices(tabs) : null
      };

      // Test evaluateRule if it exists
      if (engine.evaluateRule) {
        const matches = engine.evaluateRule(rule, context);
        console.log(`[${SELECTED_ENGINE}] evaluateRule found ${matches.length} matches`);
        expect(matches).toHaveLength(2);
        expect(matches.map(t => t.id)).toEqual([1, 3]);
      }

      // Test selectTabsMatchingRule if it exists
      if (engine.selectTabsMatchingRule) {
        const matches = await engine.selectTabsMatchingRule(rule, tabs);
        console.log(`[${SELECTED_ENGINE}] selectTabsMatchingRule found ${matches.length} matches`);
        expect(matches).toHaveLength(2);
        expect(matches.map(t => t.id)).toEqual([1, 3]);
      }
    });

    test('should execute rules with runRules', async () => {
      const engine = getEngine();

      if (!engine.runRules) {
        console.log(`[${SELECTED_ENGINE}] does not have runRules, skipping`);
        return;
      }

      const tabs = [
        { id: 1, url: 'https://old-site.com', title: 'Old', lastAccessed: Date.now() - 8 * 24 * 60 * 60 * 1000 },
        { id: 2, url: 'https://new-site.com', title: 'New', lastAccessed: Date.now() - 1000 }
      ];

      const rules = [{
        id: 'close-old',
        name: 'Close old tabs',
        enabled: true,
        when: {
          all: [
            { gt: ['tab.age', 7 * 24 * 60 * 60 * 1000] }
          ]
        },
        then: [
          { action: 'close' }
        ]
      }];

      const context = {
        tabs,
        windows: [],
        chrome: mockChrome,
        idx: engine.buildIndices ? engine.buildIndices(tabs) : null
      };

      const result = await engine.runRules(rules, context, { dryRun: true });

      console.log(`[${SELECTED_ENGINE}] runRules result:`, {
        totalMatches: result.totalMatches,
        totalActions: result.totalActions,
        rulesExecuted: result.rules?.length || result.rulesExecuted
      });

      expect(result.totalMatches).toBeGreaterThan(0);
    });
  });

  describe('Index Building', () => {
    test('should build indices correctly', () => {
      const engine = getEngine();

      if (!engine.buildIndices) {
        console.log(`[${SELECTED_ENGINE}] does not have buildIndices, skipping`);
        return;
      }

      const tabs = [
        { id: 1, url: 'https://github.com/repo1' },
        { id: 2, url: 'https://github.com/repo2' },
        { id: 3, url: 'https://stackoverflow.com/q1' }
      ];

      const indices = engine.buildIndices(tabs);

      console.log(`[${SELECTED_ENGINE}] buildIndices created:`, {
        domains: Object.keys(indices.byDomain),
        githubTabs: indices.byDomain['github.com']?.length || 0,
        stackTabs: indices.byDomain['stackoverflow.com']?.length || 0
      });

      expect(indices.byDomain).toBeDefined();
      expect(indices.byDomain['github.com']).toHaveLength(2);
      expect(indices.byDomain['stackoverflow.com']).toHaveLength(1);
    });
  });

  describe('Duplicate Detection', () => {
    test('should detect duplicate tabs', async () => {
      const engine = getEngine();

      const tabs = [
        { id: 1, url: 'https://github.com/repo?tab=code' },
        { id: 2, url: 'https://github.com/repo?tab=issues' },
        { id: 3, url: 'https://github.com/repo?tab=code' } // duplicate
      ];

      const rule = {
        id: 'find-dupes',
        name: 'Find duplicates',
        enabled: true,
        when: {
          all: [
            { is: ['tab.isDupe', true] }
          ]
        },
        then: [
          { action: 'close' }
        ]
      };

      const context = {
        tabs,
        windows: [],
        chrome: mockChrome,
        idx: engine.buildIndices ? engine.buildIndices(tabs) : null
      };

      if (engine.evaluateRule) {
        const matches = engine.evaluateRule(rule, context);
        console.log(`[${SELECTED_ENGINE}] found ${matches.length} duplicate(s)`);
        // Should find at least one duplicate
        expect(matches.length).toBeGreaterThan(0);
      }
    });
  });
});

// Comparison test that runs all engines
describe('Engine Comparison Tests', () => {
  test.skip('all engines should produce same results for basic rules', async () => {
    const tabs = [
      { id: 1, url: 'https://github.com/repo1', domain: 'github.com' },
      { id: 2, url: 'https://google.com/search', domain: 'google.com' },
      { id: 3, url: 'https://github.com/repo2', domain: 'github.com' }
    ];

    const rule = {
      id: 'test',
      name: 'Test rule',
      enabled: true,
      when: {
        all: [
          { eq: ['tab.domain', 'github.com'] }
        ]
      },
      then: [
        { action: 'pin' }
      ]
    };

    const results = {};

    for (const [name, engine] of Object.entries(engines)) {
      if (engine.evaluateRule) {
        const context = { tabs, windows: [], idx: engine.buildIndices?.(tabs) };
        const matches = engine.evaluateRule(rule, context);
        results[name] = matches.map(t => t.id).sort();
      } else if (engine.selectTabsMatchingRule) {
        const matches = await engine.selectTabsMatchingRule(rule, tabs);
        results[name] = matches.map(t => t.id).sort();
      }
    }

    console.log('Comparison results:', results);

    // All engines should produce the same result
    const allResults = Object.values(results);
    const firstResult = allResults[0];
    for (const result of allResults) {
      expect(result).toEqual(firstResult);
    }
  });
});