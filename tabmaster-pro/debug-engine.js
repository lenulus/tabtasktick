#!/usr/bin/env node

// Quick debug script to test condition matching

import * as engineV2Services from './lib/engine.v2.services.js';

// Mock chrome API
global.chrome = {
  tabs: {
    query: () => Promise.resolve([])
  },
  windows: {
    getAll: () => Promise.resolve([])
  }
};

const testTabs = [
  { id: 1, url: 'https://github.com/repo1', title: 'Repo 1' },
  { id: 2, url: 'https://stackoverflow.com/question', title: 'SO Question' },
  { id: 3, url: 'https://github.com/repo2', title: 'Repo 2' }
];

const testRule = {
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

async function debug() {
  console.log('Testing rule:', JSON.stringify(testRule.when, null, 2));
  console.log('\nTesting tabs:');
  testTabs.forEach(tab => console.log(`  ${tab.id}: ${tab.url}`));

  // Add domains to tabs for debugging
  testTabs.forEach(tab => {
    const url = new URL(tab.url);
    tab.domain = url.hostname.replace('www.', '');
    console.log(`    -> domain: ${tab.domain}`);
  });

  // Test selectTabsMatchingRule
  if (engineV2Services.selectTabsMatchingRule) {
    console.log('\n--- Testing selectTabsMatchingRule ---');
    const matches = await engineV2Services.selectTabsMatchingRule(testRule, testTabs);
    console.log('Matches found:', matches.length);
    matches.forEach(tab => console.log(`  ✓ Tab ${tab.id}: ${tab.url} (domain: ${tab.domain})`));
  }

  // Test evaluateRule (backward compat)
  if (engineV2Services.evaluateRule) {
    console.log('\n--- Testing evaluateRule ---');
    const context = {
      tabs: testTabs,
      windows: [],
      idx: engineV2Services.buildIndices ? engineV2Services.buildIndices(testTabs) : null
    };
    const matches = engineV2Services.evaluateRule(testRule, context);
    console.log('Matches found:', matches.length);
    matches.forEach(tab => console.log(`  ✓ Tab ${tab.id}: ${tab.url}`));
  }
}

debug().catch(console.error);