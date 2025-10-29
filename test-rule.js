/**
 * Test to verify "starts_with" and "last_access" rule matching bugs
 */

import { selectTabsMatchingRule } from './tabmaster-pro/services/selection/selectTabs.js';

// Test data
const now = Date.now();
const tabs = [
  {
    id: 1,
    url: 'https://meet.google.com/abc-defg-hij',
    title: 'Google Meet',
    windowId: 1,
    index: 0,
    pinned: false,
    groupId: -1,
    lastAccessed: now - (2 * 60 * 60 * 1000), // 2 hours ago
    active: false
  },
  {
    id: 2,
    url: 'https://calendar.google.com',
    title: 'Google Calendar',
    windowId: 1,
    index: 1,
    pinned: false,
    groupId: -1,
    lastAccessed: now - (30 * 60 * 1000), // 30 minutes ago
    active: false
  },
  {
    id: 3,
    url: 'https://github.com/example/repo',
    title: 'GitHub Repo',
    windowId: 1,
    index: 2,
    pinned: false,
    groupId: -1,
    lastAccessed: now - (3 * 60 * 60 * 1000), // 3 hours ago
    active: false
  }
];

const windows = [
  { id: 1, focused: true, type: 'normal' }
];

// Test 1: starts_with operator (camelCase)
console.log('\n=== Test 1: starts_with with camelCase ===');
const rule1 = {
  id: 'test-starts-with-camelcase',
  name: 'Test startsWith (camelCase)',
  when: {
    all: [
      { subject: 'url', operator: 'startsWith', value: 'https://meet.google.com/' }
    ]
  },
  actions: [{ type: 'close' }]
};

try {
  const matches1 = await selectTabsMatchingRule(rule1, tabs, windows);
  console.log(`✓ Matched ${matches1.length} tabs (expected 1):`, matches1.map(t => t.url));
  if (matches1.length !== 1) {
    console.error('❌ FAILED: Expected 1 match, got', matches1.length);
  } else if (matches1[0].id !== 1) {
    console.error('❌ FAILED: Expected tab 1, got tab', matches1[0].id);
  } else {
    console.log('✓ PASSED: Matched correct tab');
  }
} catch (error) {
  console.error('❌ ERROR:', error.message);
}

// Test 2: starts_with operator (underscore)
console.log('\n=== Test 2: starts_with with underscore ===');
const rule2 = {
  id: 'test-starts-with-underscore',
  name: 'Test starts_with (underscore)',
  when: {
    all: [
      { subject: 'url', operator: 'starts_with', value: 'https://meet.google.com/' }
    ]
  },
  actions: [{ type: 'close' }]
};

try {
  const matches2 = await selectTabsMatchingRule(rule2, tabs, windows);
  console.log(`✓ Matched ${matches2.length} tabs (expected 1):`, matches2.map(t => t.url));
  if (matches2.length !== 1) {
    console.error('❌ FAILED: Expected 1 match, got', matches2.length);
  } else if (matches2[0].id !== 1) {
    console.error('❌ FAILED: Expected tab 1, got tab', matches2[0].id);
  } else {
    console.log('✓ PASSED: Matched correct tab');
  }
} catch (error) {
  console.error('❌ ERROR:', error.message);
}

// Test 3: last_access > 1h (should match tabs 1 and 3)
console.log('\n=== Test 3: last_access > 1h ===');
const rule3 = {
  id: 'test-last-access',
  name: 'Test last_access',
  when: {
    all: [
      { subject: 'last_access', operator: 'gt', value: '1h' }
    ]
  },
  actions: [{ type: 'close' }]
};

try {
  const matches3 = await selectTabsMatchingRule(rule3, tabs, windows);
  console.log(`✓ Matched ${matches3.length} tabs (expected 2):`, matches3.map(t => `${t.id}: ${t.url}`));
  if (matches3.length !== 2) {
    console.error('❌ FAILED: Expected 2 matches, got', matches3.length);
  } else if (!matches3.find(t => t.id === 1) || !matches3.find(t => t.id === 3)) {
    console.error('❌ FAILED: Expected tabs 1 and 3, got', matches3.map(t => t.id));
  } else {
    console.log('✓ PASSED: Matched correct tabs');
  }
} catch (error) {
  console.error('❌ ERROR:', error.message);
}

// Test 4: last_access < 1h (should match tab 2)
console.log('\n=== Test 4: last_access < 1h ===');
const rule4 = {
  id: 'test-last-access-lt',
  name: 'Test last_access less than',
  when: {
    all: [
      { subject: 'last_access', operator: 'lt', value: '1h' }
    ]
  },
  actions: [{ type: 'close' }]
};

try {
  const matches4 = await selectTabsMatchingRule(rule4, tabs, windows);
  console.log(`✓ Matched ${matches4.length} tabs (expected 1):`, matches4.map(t => `${t.id}: ${t.url}`));
  if (matches4.length !== 1) {
    console.error('❌ FAILED: Expected 1 match, got', matches4.length);
  } else if (matches4[0].id !== 2) {
    console.error('❌ FAILED: Expected tab 2, got tab', matches4[0].id);
  } else {
    console.log('✓ PASSED: Matched correct tab');
  }
} catch (error) {
  console.error('❌ ERROR:', error.message);
}

console.log('\n=== Test Complete ===\n');
