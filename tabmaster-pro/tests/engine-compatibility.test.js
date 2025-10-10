// Engine Test Suite
// Tests the V2 Services engine (V1 removed in Phase 7.2)

import { jest } from '@jest/globals';

// Import V2 engine
import * as engine from '../lib/engine.v2.services.js';

const getEngine = () => engine;

describe('Engine Tests [V2 Services]', () => {
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

      // Test selectTabsMatchingRule
      if (engine.selectTabsMatchingRule) {
        const matches = await engine.selectTabsMatchingRule(rule, tabs);
        console.log(`[${SELECTED_ENGINE}] selectTabsMatchingRule found ${matches.length} matches`);
        expect(matches).toHaveLength(2);
        expect(matches.map(t => t.id)).toEqual([1, 3]);
      } else {
        console.log(`[${SELECTED_ENGINE}] does not have selectTabsMatchingRule, skipping`);
      }
    });

    test('should execute rules with runRules', async () => {
      const engine = getEngine();

      if (!engine.runRules) {
        console.log(`[${SELECTED_ENGINE}] does not have runRules, skipping`);
        return;
      }

      const tabs = [
        { id: 1, url: 'https://old-site.com', title: 'Old', createdAt: Date.now() - 8 * 24 * 60 * 60 * 1000 },
        { id: 2, url: 'https://new-site.com', title: 'New', createdAt: Date.now() - 1000 }
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

      if (engine.selectTabsMatchingRule) {
        const matches = await engine.selectTabsMatchingRule(rule, tabs);
        console.log(`[${SELECTED_ENGINE}] found ${matches.length} duplicate(s)`);
        // Should find at least one duplicate
        expect(matches.length).toBeGreaterThan(0);
      }
    });
  });
});

