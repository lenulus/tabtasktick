// Rule Factory - Generates test rules for unit tests

let ruleIdCounter = 1;

export function resetCounters() {
  ruleIdCounter = 1;
}

// Create a rule with new PRD format
export function createRule(overrides = {}) {
  const defaults = {
    id: `rule-${ruleIdCounter++}`,
    name: 'Test Rule',
    enabled: true,
    when: { eq: ['tab.url', 'https://example.com'] },
    then: [{ action: 'close' }],
    trigger: { on_action: true },
    flags: { skipPinned: true }
  };
  
  return { ...defaults, ...overrides };
}

// Create common rule patterns from the PRD
export function createPRDExamples() {
  return {
    timeboxNews: {
      name: 'Timebox News 1h',
      enabled: true,
      when: {
        all: [
          { in: ['tab.category', ['news']] },
          { gte: ['tab.age', '1h'] }
        ]
      },
      then: [{ action: 'snooze', for: '1d', wakeInto: 'same_window' }],
      trigger: { repeat_every: '1h' },
      flags: { skipPinned: true, log: true }
    },
    
    closeSoloWindows: {
      name: 'Close Solo Windows',
      enabled: true,
      when: {
        all: [
          { eq: ['window.tabCount', 1] },
          { gte: ['tab.age', '3d'] }
        ]
      },
      then: [{ action: 'close' }],
      trigger: { on_action: true },
      flags: { immediate: true }
    },
    
    gmailGroup: {
      name: 'Gmail Spawn Group',
      enabled: true,
      when: { eq: ['tab.origin', 'gmail'] },
      then: [{ action: 'group', name: 'Gmail Session', createIfMissing: true }],
      trigger: { immediate: true }
    },
    
    deduplicate: {
      name: 'Deduplicate',
      enabled: true,
      when: { is: ['tab.isDupe', true] },
      then: [{ action: 'close' }],
      trigger: { repeat_every: '30m' }
    },
    
    clampResearch: {
      name: 'Clamp Research Explosions',
      enabled: true,
      when: {
        all: [
          { gte: ['tab.countPerOrigin:domain', 8] },
          { gte: ['tab.age', '2h'] }
        ]
      },
      then: [
        { action: 'group', by: 'origin' },
        { action: 'snooze', for: '12h' }
      ],
      trigger: { repeat_every: '2h' }
    }
  };
}

// Create test rules with various condition types
export function createTestConditions() {
  return {
    // Simple conditions
    urlEquals: { eq: ['tab.url', 'https://example.com'] },
    domainContains: { contains: ['tab.domain', 'google'] },
    isPinned: { is: ['tab.isPinned', true] },
    isNotGrouped: { is: ['tab.isGrouped', false] },
    
    // Comparison conditions
    oldTab: { gte: ['tab.age', '24h'] },
    manyDupes: { gt: ['tab.countPerOrigin:domain', 5] },
    soloWindow: { eq: ['window.tabCount', 1] },
    
    // Array conditions
    inCategory: { in: ['tab.category', ['news', 'social']] },
    notInDomains: { nin: ['tab.domain', ['google.com', 'github.com']] },
    
    // Pattern matching
    regexMatch: { regex: ['tab.url', '/\\/api\\/v[0-9]+/'] },
    urlStarts: { startsWith: ['tab.url', 'https://docs.'] },
    urlEnds: { endsWith: ['tab.url', '.pdf'] },
    
    // Complex nested conditions
    complexAnd: {
      all: [
        { in: ['tab.category', ['shopping']] },
        { gte: ['tab.age', '30m'] },
        { is: ['tab.isPinned', false] }
      ]
    },
    
    complexOr: {
      any: [
        { eq: ['tab.domain', 'temporary.com'] },
        { contains: ['tab.title', '[DRAFT]'] },
        { gte: ['tab.age', '7d'] }
      ]
    },
    
    complexNested: {
      all: [
        { in: ['tab.category', ['dev', 'docs']] },
        {
          any: [
            { gte: ['tab.countPerOrigin:domain', 10] },
            {
              all: [
                { gte: ['tab.age', '1h'] },
                { is: ['tab.isGrouped', false] }
              ]
            }
          ]
        }
      ]
    },
    
    withNone: {
      none: [
        { eq: ['tab.domain', 'important.com'] },
        { is: ['tab.isPinned', true] },
        { contains: ['tab.title', 'KEEP'] }
      ]
    }
  };
}

// Create test actions
export function createTestActions() {
  return {
    close: [{ action: 'close' }],
    closeWithBookmark: [{ action: 'close', saveToBookmarks: true, bookmarkFolder: 'Closed Tabs' }],
    snoozeShort: [{ action: 'snooze', for: '30m', wakeInto: 'same_window' }],
    snoozeLong: [{ action: 'snooze', for: '7d', wakeInto: 'new_window' }],
    groupByDomain: [{ action: 'group', by: 'domain' }],
    groupByOrigin: [{ action: 'group', by: 'origin' }],
    groupNamed: [{ action: 'group', name: 'My Group', createIfMissing: true }],
    bookmark: [{ action: 'bookmark', folder: 'Rules Archive' }],
    multiAction: [
      { action: 'group', by: 'domain' },
      { action: 'bookmark', folder: 'Grouped Tabs' },
      { action: 'snooze', for: '1h' }
    ]
  };
}

// Create test triggers
export function createTestTriggers() {
  return {
    manual: { on_action: true },
    immediate: { immediate: true },
    repeat15m: { repeat_every: '15m' },
    repeat1h: { repeat_every: '1h' },
    repeat1d: { repeat_every: '1d' },
    onceToday: { once: new Date().toISOString() },
    onceTomorrow: { once: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }
  };
}

// Generate rules for performance testing
export function generateLargeRuleset(count = 50) {
  resetCounters();
  const rules = [];
  const conditions = Object.values(createTestConditions());
  const actions = Object.values(createTestActions());
  const triggers = Object.values(createTestTriggers());
  
  for (let i = 0; i < count; i++) {
    rules.push(createRule({
      name: `Performance Test Rule ${i}`,
      when: conditions[i % conditions.length],
      then: actions[i % actions.length],
      trigger: triggers[i % triggers.length],
      enabled: i % 3 !== 0 // ~67% enabled
    }));
  }
  
  return rules;
}

// Create rules that would conflict (for testing conflict detection)
export function createConflictingRules() {
  return [
    {
      id: 'conflict-1',
      name: 'Close old tabs',
      when: { gte: ['tab.age', '7d'] },
      then: [{ action: 'close' }],
      priority: 1
    },
    {
      id: 'conflict-2', 
      name: 'Snooze old tabs',
      when: { gte: ['tab.age', '7d'] },
      then: [{ action: 'snooze', for: '30d' }],
      priority: 2
    }
  ];
}

// Create rules in old format (for migration testing)
export function createOldFormatRules() {
  return [
    {
      id: 'old-1',
      name: 'Old inactive rule',
      conditions: {
        type: 'inactive',
        inactiveMinutes: 30,
        urlPatterns: ['reddit.com', 'twitter.com']
      },
      actions: { type: 'close' }
    },
    {
      id: 'old-2',
      name: 'Old age and domain rule',
      conditions: {
        type: 'age_and_domain',
        ageMinutes: 120,
        domains: ['temporary.com']
      },
      actions: { type: 'snooze', snoozeMinutes: 60 }
    },
    {
      id: 'old-3',
      name: 'Old category rule',
      conditions: {
        type: 'category',
        categories: ['news'],
        inactiveMinutes: 60
      },
      actions: { type: 'group', groupBy: 'category' }
    }
  ];
}