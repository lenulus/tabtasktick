// Rule Builder - Programmatically creates test rules

export class RuleBuilder {
  constructor(testMode) {
    this.testMode = testMode;
    this.ruleCounter = 0;
  }

  /**
   * Build a complete rule from configuration
   * @param {object} config - Rule configuration
   * @returns {object} Complete rule object
   */
  buildRule(config) {
    const {
      name = `Test Rule ${++this.ruleCounter}`,
      description = 'Auto-generated test rule',
      enabled = true,
      when,
      then,
      trigger = null,
      flags = {}
    } = config;

    // Ensure we have an ID
    const id = config.id || `test_rule_${Date.now()}_${this.ruleCounter}`;

    // Build the rule
    const rule = {
      id,
      name,
      description,
      enabled,
      when: this.buildConditions(when),
      then: this.buildActions(then),
      flags: {
        test: true, // Mark as test rule
        ...flags
      },
      createdAt: Date.now(),
      createdBy: 'TestMode'
    };

    // Add trigger if specified
    if (trigger) {
      rule.trigger = this.buildTrigger(trigger);
    }

    return rule;
  }

  /**
   * Build conditions in predicate format
   * @param {object} conditions - Conditions configuration
   * @returns {object} Predicate-format conditions
   */
  buildConditions(conditions) {
    if (!conditions) {
      return { all: [] };
    }

    // If already in predicate format, return as-is
    if (this.isPredicateFormat(conditions)) {
      return conditions;
    }

    // Convert from simplified format
    if (Array.isArray(conditions)) {
      return {
        all: conditions.map(cond => this.buildCondition(cond))
      };
    }

    // Handle junction objects
    if (conditions.all || conditions.any || conditions.none) {
      return {
        all: conditions.all ? conditions.all.map(c => this.buildCondition(c)) : undefined,
        any: conditions.any ? conditions.any.map(c => this.buildCondition(c)) : undefined,
        none: conditions.none ? conditions.none.map(c => this.buildCondition(c)) : undefined
      };
    }

    // Single condition
    return {
      all: [this.buildCondition(conditions)]
    };
  }

  /**
   * Build a single condition
   * @param {object} condition - Condition configuration
   * @returns {object} Predicate-format condition
   */
  buildCondition(condition) {
    // If already in predicate format, return as-is
    if (this.isPredicateCondition(condition)) {
      return condition;
    }

    // Handle nested junctions
    if (condition.all || condition.any || condition.none) {
      return this.buildConditions(condition);
    }

    // Convert from simplified format
    const { subject, operator, value } = condition;
    
    // Map subject to path
    const path = this.mapSubjectToPath(subject);
    
    // Build predicate condition
    return this.buildPredicateCondition(operator, path, value);
  }

  /**
   * Check if conditions are in predicate format
   */
  isPredicateFormat(conditions) {
    const predicateKeys = ['all', 'any', 'none'];
    const keys = Object.keys(conditions);
    return keys.length > 0 && keys.every(k => predicateKeys.includes(k));
  }

  /**
   * Check if a condition is in predicate format
   */
  isPredicateCondition(condition) {
    const predicateOperators = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 
                               'contains', 'not_contains', 'starts_with', 
                               'ends_with', 'regex', 'not_regex', 'in', 
                               'not_in', 'is'];
    const keys = Object.keys(condition);
    return keys.length === 1 && predicateOperators.includes(keys[0]);
  }

  /**
   * Map subject names to paths
   */
  mapSubjectToPath(subject) {
    const mappings = {
      'url': 'tab.url',
      'title': 'tab.title',
      'domain': 'tab.domain',
      'duplicate': 'tab.isDupe',
      'isDuplicate': 'tab.isDupe',
      'pinned': 'tab.isPinned',
      'muted': 'tab.isMuted',
      'audible': 'tab.isAudible',
      'age': 'tab.age',
      'memory': 'tab.memory',
      'category': 'tab.category',
      'groupId': 'tab.groupId',
      'windowId': 'tab.windowId',
      'tabCount': 'window.tabCount',
      'domainCount': 'tab.countPerOrigin:domain',
      'dupeCount': 'tab.countPerOrigin:dupeKey'
    };

    return mappings[subject] || subject;
  }

  /**
   * Build predicate condition
   */
  buildPredicateCondition(operator, path, value) {
    const operatorMap = {
      'equals': 'eq',
      'notEquals': 'neq',
      'greaterThan': 'gt',
      'greaterThanOrEquals': 'gte',
      'lessThan': 'lt',
      'lessThanOrEquals': 'lte',
      'contains': 'contains',
      'notContains': 'not_contains',
      'startsWith': 'starts_with',
      'endsWith': 'ends_with',
      'matches': 'regex',
      'notMatches': 'not_regex',
      'in': 'in',
      'notIn': 'not_in',
      'is': 'is'
    };

    const predicateOp = operatorMap[operator] || operator;
    return { [predicateOp]: [path, value] };
  }

  /**
   * Build actions
   * @param {Array|object} actions - Actions configuration
   * @returns {Array} Array of action objects
   */
  buildActions(actions) {
    if (!actions) {
      throw new Error('Rule must have at least one action');
    }

    const actionArray = Array.isArray(actions) ? actions : [actions];
    return actionArray.map(action => this.buildAction(action));
  }

  /**
   * Build a single action
   * @param {object|string} action - Action configuration
   * @returns {object} Action object
   */
  buildAction(action) {
    // String shorthand
    if (typeof action === 'string') {
      return { action };
    }

    // Ensure action has required fields
    const { 
      action: actionType,
      type, // Support old format
      ...params 
    } = action;

    return {
      action: actionType || type,
      ...params
    };
  }

  /**
   * Build trigger configuration
   * @param {object|string} trigger - Trigger configuration
   * @returns {object} Trigger object
   */
  buildTrigger(trigger) {
    // String shorthand for repeat triggers
    if (typeof trigger === 'string') {
      return {
        repeat: trigger
      };
    }

    // Immediate trigger shorthand
    if (trigger === true) {
      return {
        immediate: true
      };
    }

    // Handle special FUTURE: markers for scheduled triggers
    if (trigger && trigger.once && typeof trigger.once === 'string' && trigger.once.startsWith('FUTURE:')) {
      const delayMs = parseInt(trigger.once.substring(7));
      return {
        ...trigger,
        once: new Date(Date.now() + delayMs).toISOString()
      };
    }

    return trigger;
  }

  /**
   * Create common rule templates
   */
  createDuplicateRule(options = {}) {
    return this.buildRule({
      name: options.name || 'Close Duplicate Tabs',
      description: 'Closes duplicate tabs keeping the oldest',
      when: {
        all: [
          { eq: ['tab.isDupe', true] }
        ]
      },
      then: [
        { action: 'close' }
      ],
      ...options
    });
  }

  createGroupByDomainRule(options = {}) {
    const minTabs = options.minTabs || 2;
    
    return this.buildRule({
      name: options.name || 'Group by Domain',
      description: `Groups tabs when ${minTabs} or more from same domain`,
      when: {
        all: [
          { gte: ['tab.countPerOrigin:domain', minTabs] }
        ]
      },
      then: [
        { action: 'group', by: 'domain' }
      ],
      ...options
    });
  }

  createSnoozeOldTabsRule(options = {}) {
    const age = options.age || '2h';
    const snoozeDuration = options.snoozeDuration || '24h';
    
    return this.buildRule({
      name: options.name || 'Snooze Old Tabs',
      description: `Snooze tabs older than ${age}`,
      when: {
        all: [
          { gt: ['tab.age', age] },
          { eq: ['tab.isPinned', false] }
        ]
      },
      then: [
        { action: 'snooze', for: snoozeDuration }
      ],
      ...options
    });
  }

  createMemoryManagementRule(options = {}) {
    const threshold = options.threshold || 50000000; // 50MB
    
    return this.buildRule({
      name: options.name || 'Memory Management',
      description: 'Suspend high-memory tabs',
      when: {
        all: [
          { gt: ['tab.memory', threshold] },
          { eq: ['tab.isPinned', false] },
          { eq: ['tab.isActive', false] }
        ]
      },
      then: [
        { action: 'suspend' }
      ],
      trigger: {
        repeat: '5m'
      },
      ...options
    });
  }

  createComplexRule(options = {}) {
    return this.buildRule({
      name: options.name || 'Complex Test Rule',
      description: 'Tests nested conditions and multiple actions',
      when: {
        any: [
          {
            all: [
              { contains: ['tab.url', 'youtube.com'] },
              { eq: ['tab.isAudible', true] },
              { eq: ['tab.isPinned', false] }
            ]
          },
          {
            all: [
              { regex: ['tab.url', '/github\\.com\\/.*\\/pull/'] },
              { gt: ['tab.age', '1d'] }
            ]
          },
          {
            none: [
              { in: ['tab.domain', ['google.com', 'gmail.com']] },
              { eq: ['tab.isPinned', true] }
            ]
          }
        ]
      },
      then: [
        { action: 'bookmark', to: 'Auto-Saved' },
        { action: 'close' }
      ],
      ...options
    });
  }

  /**
   * Create rule with immediate trigger
   */
  createImmediateRule(options = {}) {
    return this.buildRule({
      name: options.name || 'Immediate Trigger Rule',
      description: 'Triggers immediately on tab events',
      trigger: {
        immediate: true,
        debounce: options.debounce || '2s'
      },
      when: options.when || {
        all: [
          { contains: ['tab.url', 'trigger-test'] }
        ]
      },
      then: options.then || [
        { action: 'group', name: 'Triggered Tabs' }
      ],
      ...options
    });
  }

  /**
   * Create rule with scheduled trigger
   */
  createScheduledRule(options = {}) {
    const when = options.when || new Date(Date.now() + 60000).toISOString(); // 1 minute from now
    
    return this.buildRule({
      name: options.name || 'Scheduled Rule',
      description: `Executes at ${when}`,
      trigger: {
        once: when
      },
      when: options.conditions || {
        all: []  // Match all tabs
      },
      then: options.then || [
        { action: 'group', name: 'Scheduled Group' }
      ],
      ...options
    });
  }

  /**
   * Create rule for performance testing
   */
  createPerformanceTestRule(tabCount = 100) {
    return this.buildRule({
      name: `Performance Test - ${tabCount} tabs`,
      description: 'Rule for performance testing',
      when: {
        all: [
          { contains: ['tab.url', 'perf-test'] }
        ]
      },
      then: [
        { action: 'group', by: 'domain' }
      ],
      flags: {
        performanceTest: true,
        expectedTabCount: tabCount
      }
    });
  }
}