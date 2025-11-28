// Migration utilities for converting old rule format to Rules Engine 2.0 format

/**
 * Migrate a single rule from old format to new format
 * @param {object} oldRule - Rule in old format
 * @returns {object} Rule in new format
 */
export function migrateRule(oldRule) {
  const newRule = {
    id: oldRule.id || generateRuleId(),
    name: oldRule.name || 'Migrated Rule',
    enabled: oldRule.enabled !== false,
    when: migrateConditions(oldRule.conditions),
    then: migrateActions(oldRule.actions),
    trigger: migrateTrigger(oldRule),
    flags: {
      skipPinned: oldRule.skipPinned !== false,
      log: true,
      immediate: oldRule.immediate || false
    },
    priority: oldRule.priority || 50
  };
  
  // Preserve any extra fields
  const knownFields = ['id', 'name', 'enabled', 'conditions', 'actions', 'priority', 'skipPinned', 'immediate', 'interval', 'lastRun'];
  for (const key in oldRule) {
    if (!knownFields.includes(key)) {
      newRule[key] = oldRule[key];
    }
  }
  
  return newRule;
}

/**
 * Migrate conditions from old format to new predicate format
 * @param {object} oldConditions - Old condition format
 * @returns {object} New condition format
 */
function migrateConditions(oldConditions) {
  if (!oldConditions) {
    return { all: [] };
  }
  
  switch (oldConditions.type) {
  case 'domain':
    if (oldConditions.operator === 'contains') {
      return { contains: ['tab.url', oldConditions.value] };
    }
    return { eq: ['tab.domain', oldConditions.value] };
      
  case 'age':
    const ageMs = parseAgeValue(oldConditions.value);
    return { gte: ['tab.age', `${Math.floor(ageMs / (60 * 1000))}m`] };
      
  case 'duplicate':
    return { is: ['tab.isDupe', true] };
      
  case 'memory':
    // Convert memory condition to a custom check
    return {
      all: [
        { gte: ['tab.memory', oldConditions.value * 1024 * 1024] } // Convert MB to bytes
      ]
    };
      
  case 'inactive':
    const inactiveMs = parseAgeValue(oldConditions.value);
    return { gte: ['tab.age', `${Math.floor(inactiveMs / (60 * 1000))}m`] };
      
  case 'grouped':
    return { is: ['tab.isGrouped', oldConditions.value === 'true'] };
      
  case 'pinned':
    return { is: ['tab.isPinned', oldConditions.value === 'true'] };
      
  case 'url':
    if (oldConditions.operator === 'contains') {
      return { contains: ['tab.url', oldConditions.value] };
    } else if (oldConditions.operator === 'regex') {
      return { regex: ['tab.url', oldConditions.value] };
    }
    return { eq: ['tab.url', oldConditions.value] };
      
  case 'title':
    if (oldConditions.operator === 'contains') {
      return { contains: ['tab.title', oldConditions.value] };
    }
    return { eq: ['tab.title', oldConditions.value] };
      
  case 'composite':
    // Handle composite conditions
    if (oldConditions.conditions && Array.isArray(oldConditions.conditions)) {
      const operator = oldConditions.operator || 'and';
      const migrated = oldConditions.conditions.map(c => migrateConditions(c));
        
      if (operator === 'or') {
        return { any: migrated };
      } else {
        return { all: migrated };
      }
    }
    break;
  }
  
  // Default fallback
  console.warn('Unknown condition type:', oldConditions.type);
  return { all: [] };
}

/**
 * Migrate actions from old format to new format
 * @param {object} oldActions - Old action format
 * @returns {array} New action format
 */
function migrateActions(oldActions) {
  if (!oldActions) {
    return [];
  }
  
  const actions = [];
  
  switch (oldActions.type) {
  case 'close':
    actions.push({ 
      action: 'close',
      keepFirst: oldActions.keepFirst
    });
    break;
      
  case 'group':
    if (oldActions.groupName) {
      actions.push({ 
        action: 'group',
        name: oldActions.groupName,
        createIfMissing: true
      });
    } else if (oldActions.groupBy) {
      actions.push({
        action: 'group',
        by: oldActions.groupBy // 'domain', 'origin', etc.
      });
    } else {
      actions.push({ action: 'group' });
    }
    break;
      
  case 'snooze':
    actions.push({
      action: 'snooze',
      for: oldActions.duration || oldActions.time || '2h',
      wakeInto: oldActions.wakeInto || 'same_window'
    });
    break;
      
  case 'bookmark':
    actions.push({
      action: 'bookmark',
      to: oldActions.folder || 'TabMaster Rules'
    });
    break;
      
  case 'suspend':
    // Suspend is not directly supported in new engine
    // Could be implemented as a custom action
    console.warn('Suspend action not yet implemented in new engine');
    break;
      
  case 'mute':
    // Mute could be implemented as a tab update
    console.warn('Mute action not yet implemented in new engine');
    break;
  }
  
  return actions;
}

/**
 * Migrate trigger configuration
 * @param {object} oldRule - Old rule with trigger info
 * @returns {object} New trigger format
 */
function migrateTrigger(oldRule) {
  const trigger = {};
  
  if (oldRule.immediate) {
    trigger.immediate = true;
  }
  
  if (oldRule.interval) {
    // Convert interval to repeat trigger
    const intervalMinutes = oldRule.interval;
    if (intervalMinutes < 60) {
      trigger.repeat_every = `${intervalMinutes}m`;
    } else if (intervalMinutes < 1440) {
      trigger.repeat_every = `${Math.floor(intervalMinutes / 60)}h`;
    } else {
      trigger.repeat_every = `${Math.floor(intervalMinutes / 1440)}d`;
    }
  }
  
  // Default to manual trigger if nothing else specified
  if (Object.keys(trigger).length === 0) {
    trigger.on_action = true;
  }
  
  return trigger;
}

/**
 * Parse age value from old format
 * @param {string|number} value - Age value like "30 minutes" or 30
 * @returns {number} Age in milliseconds
 */
function parseAgeValue(value) {
  if (typeof value === 'number') {
    // Assume minutes
    return value * 60 * 1000;
  }
  
  if (typeof value === 'string') {
    const match = value.match(/(\d+)\s*(minute|hour|day|min|hr|d|m|h)/i);
    if (match) {
      const num = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      
      switch (unit[0]) {
      case 'm':
        return num * 60 * 1000;
      case 'h':
        return num * 60 * 60 * 1000;
      case 'd':
        return num * 24 * 60 * 60 * 1000;
      }
    }
  }
  
  // Default to 30 minutes
  return 30 * 60 * 1000;
}

/**
 * Generate a unique rule ID
 * @returns {string} Rule ID
 */
function generateRuleId() {
  return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Migrate all rules from old format
 * @param {array} oldRules - Array of rules in old format
 * @returns {array} Array of rules in new format
 */
export function migrateAllRules(oldRules) {
  if (!Array.isArray(oldRules)) {
    return [];
  }
  
  return oldRules.map(rule => {
    try {
      return migrateRule(rule);
    } catch (error) {
      console.error('Failed to migrate rule:', rule.name, error);
      // Return a disabled placeholder rule
      return {
        id: rule.id || generateRuleId(),
        name: `MIGRATION FAILED: ${rule.name || 'Unknown'}`,
        enabled: false,
        when: { all: [] },
        then: [],
        trigger: { on_action: true },
        flags: { migrationError: true },
        originalRule: rule
      };
    }
  });
}

/**
 * Create default rules in new format
 * @returns {array} Array of default rules
 */
export function createDefaultRules() {
  return [
    {
      id: generateRuleId(),
      name: 'Close Duplicate Tabs',
      enabled: true,
      when: { is: ['tab.isDupe', true] },
      then: [{ action: 'close' }],
      trigger: { repeat_every: '30m' },
      flags: { skipPinned: true, log: true }
    },
    {
      id: generateRuleId(),
      name: 'Group Gmail Spawns',
      enabled: false,
      when: { eq: ['tab.origin', 'gmail'] },
      then: [{ action: 'group', name: 'Gmail Links' }],
      trigger: { immediate: true },
      flags: { skipPinned: true }
    },
    {
      id: generateRuleId(),
      name: 'Snooze Old News',
      enabled: false,
      when: {
        all: [
          { in: ['tab.category', ['news']] },
          { gte: ['tab.age', '2h'] }
        ]
      },
      then: [{ action: 'snooze', for: '1d' }],
      trigger: { repeat_every: '1h' },
      flags: { skipPinned: true }
    },
    {
      id: generateRuleId(),
      name: 'Close Solo Windows',
      enabled: false,
      when: {
        all: [
          { eq: ['window.tabCount', 1] },
          { gte: ['tab.age', '3d'] }
        ]
      },
      then: [{ action: 'close' }],
      trigger: { on_action: true },
      flags: { skipPinned: true }
    },
    {
      id: generateRuleId(), 
      name: 'Archive Research Explosions',
      enabled: false,
      when: {
        all: [
          { gte: ['tab.countPerOrigin:domain', 10] },
          { gte: ['tab.age', '1h'] }
        ]
      },
      then: [
        { action: 'group', by: 'domain' },
        { action: 'bookmark', to: 'Research Archive' }
      ],
      trigger: { repeat_every: '2h' },
      flags: { skipPinned: true }
    }
  ];
}