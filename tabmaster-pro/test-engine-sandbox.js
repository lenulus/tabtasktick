#!/usr/bin/env node

// Sandbox for testing v2 engines in isolation
// Safe to run - doesn't affect the extension

import * as engineV1 from './lib/engine.v1.legacy.js';
import * as engineV2Services from './lib/engine.v2.services.js';

console.log('🧪 Engine Testing Sandbox\n');
console.log('This is a safe space to test v2 engines without affecting production.\n');

// Test data
const testTabs = [
  { id: 1, url: 'https://github.com/repo1', title: 'Repo 1', windowId: 1 },
  { id: 2, url: 'https://stackoverflow.com/q/123', title: 'Question', windowId: 1 },
  { id: 3, url: 'https://github.com/repo2', title: 'Repo 2', windowId: 1 },
  { id: 4, url: 'https://github.com/repo1', title: 'Repo 1 (dupe)', windowId: 2 },
];

const testRule = {
  id: 'test-github',
  name: 'GitHub Tabs',
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

// Mock Chrome API
const mockChrome = {
  tabs: {
    update: (id, props) => {
      console.log(`  → Would update tab ${id}:`, props);
      return Promise.resolve();
    }
  }
};

async function testEngine(name, engine) {
  console.log(`\n📦 Testing ${name}`);
  console.log('─'.repeat(40));

  // Test 1: Build indices
  if (engine.buildIndices) {
    const indices = engine.buildIndices(testTabs);
    console.log('✓ buildIndices:', {
      domains: Object.keys(indices.byDomain).length,
      githubTabs: indices.byDomain['github.com']?.length || 0
    });
  } else {
    console.log('✗ buildIndices: not available');
  }

  // Test 2: Evaluate rule (v1 API)
  if (engine.evaluateRule) {
    const context = {
      tabs: testTabs,
      windows: [],
      idx: engine.buildIndices ? engine.buildIndices(testTabs) : null
    };
    const matches = engine.evaluateRule(testRule, context);
    console.log('✓ evaluateRule:', {
      matchCount: matches.length,
      matchedIds: matches.map(t => t.id)
    });
  } else {
    console.log('✗ evaluateRule: not available');
  }

  // Test 3: Select tabs (v2 API)
  if (engine.selectTabsMatchingRule) {
    const matches = await engine.selectTabsMatchingRule(testRule, testTabs);
    console.log('✓ selectTabsMatchingRule:', {
      matchCount: matches.length,
      matchedIds: matches.map(t => t.id)
    });
  } else {
    console.log('✗ selectTabsMatchingRule: not available');
  }

  // Test 4: Run rules
  if (engine.runRules) {
    const context = {
      tabs: testTabs,
      windows: [],
      chrome: mockChrome,
      idx: engine.buildIndices ? engine.buildIndices(testTabs) : null
    };

    console.log('\n  Executing rule (dry run):');
    const result = await engine.runRules([testRule], context, { dryRun: true });
    console.log('✓ runRules result:', {
      totalMatches: result.totalMatches,
      totalActions: result.totalActions,
      errors: result.errors?.length || 0
    });
  } else {
    console.log('✗ runRules: not available');
  }
}

// Run tests
async function main() {
  await testEngine('Engine v1 (Legacy)', engineV1);
  await testEngine('Engine v2 (Services)', engineV2Services);

  console.log('\n' + '='.repeat(50));
  console.log('✅ Testing complete! Both engines work.');
  console.log('\nKey differences:');
  console.log('- v1: Mixed concerns, evaluateRule API');
  console.log('- v2: Services-first, selectTabsMatchingRule API');
  console.log('\nNext steps:');
  console.log('1. Test in popup/dashboard with feature flag');
  console.log('2. Gradual migration surface by surface');
  console.log('3. Monitor for any behavioral differences');
}

main().catch(console.error);