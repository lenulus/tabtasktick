// Tests for rule migration utilities

import { describe, test, expect } from '@jest/globals';
import { migrateRule, migrateAllRules, createDefaultRules } from '../lib/migrate-rules.js';

describe('Rule Migration', () => {
  test('should migrate simple domain rule', () => {
    const oldRule = {
      id: 'rule1',
      name: 'Block Social Media',
      enabled: true,
      conditions: {
        type: 'domain',
        value: 'facebook.com'
      },
      actions: {
        type: 'close'
      },
      priority: 10
    };
    
    const newRule = migrateRule(oldRule);
    
    expect(newRule).toMatchObject({
      id: 'rule1',
      name: 'Block Social Media',
      enabled: true,
      when: { eq: ['tab.domain', 'facebook.com'] },
      then: [{ action: 'close' }],
      trigger: { on_action: true },
      priority: 10
    });
  });
  
  test('should migrate age condition', () => {
    const oldRule = {
      name: 'Close Old Tabs',
      conditions: {
        type: 'age',
        value: 120 // 120 minutes
      },
      actions: {
        type: 'close'
      }
    };
    
    const newRule = migrateRule(oldRule);
    
    expect(newRule.when).toEqual({ gte: ['tab.age', '120m'] });
  });
  
  test('should migrate duplicate condition', () => {
    const oldRule = {
      name: 'Remove Duplicates',
      conditions: {
        type: 'duplicate'
      },
      actions: {
        type: 'close',
        keepFirst: true
      }
    };
    
    const newRule = migrateRule(oldRule);
    
    expect(newRule.when).toEqual({ is: ['tab.isDupe', true] });
    expect(newRule.then).toEqual([{ 
      action: 'close',
      keepFirst: true
    }]);
  });
  
  test('should migrate group action with name', () => {
    const oldRule = {
      name: 'Group Work Tabs',
      conditions: {
        type: 'domain',
        value: 'github.com'
      },
      actions: {
        type: 'group',
        groupName: 'Work'
      }
    };
    
    const newRule = migrateRule(oldRule);
    
    expect(newRule.then).toEqual([{
      action: 'group',
      name: 'Work',
      createIfMissing: true
    }]);
  });
  
  test('should migrate snooze action', () => {
    const oldRule = {
      name: 'Snooze News',
      conditions: {
        type: 'url',
        operator: 'contains',
        value: 'news.com'
      },
      actions: {
        type: 'snooze',
        duration: '3h'
      }
    };
    
    const newRule = migrateRule(oldRule);
    
    expect(newRule.when).toEqual({ contains: ['tab.url', 'news.com'] });
    expect(newRule.then).toEqual([{
      action: 'snooze',
      for: '3h',
      wakeInto: 'same_window'
    }]);
  });
  
  test('should migrate periodic trigger', () => {
    const oldRule = {
      name: 'Periodic Cleanup',
      conditions: { type: 'duplicate' },
      actions: { type: 'close' },
      interval: 30 // 30 minutes
    };
    
    const newRule = migrateRule(oldRule);
    
    expect(newRule.trigger).toEqual({ repeat_every: '30m' });
  });
  
  test('should migrate immediate trigger', () => {
    const oldRule = {
      name: 'Immediate Group',
      conditions: { type: 'domain', value: 'gmail.com' },
      actions: { type: 'group' },
      immediate: true
    };
    
    const newRule = migrateRule(oldRule);
    
    expect(newRule.trigger).toEqual({ immediate: true });
    expect(newRule.flags.immediate).toBe(true);
  });
  
  test('should migrate composite conditions', () => {
    const oldRule = {
      name: 'Complex Rule',
      conditions: {
        type: 'composite',
        operator: 'and',
        conditions: [
          { type: 'domain', value: 'example.com' },
          { type: 'age', value: 60 }
        ]
      },
      actions: { type: 'close' }
    };
    
    const newRule = migrateRule(oldRule);
    
    expect(newRule.when).toEqual({
      all: [
        { eq: ['tab.domain', 'example.com'] },
        { gte: ['tab.age', '60m'] }
      ]
    });
  });
  
  test('should handle OR composite conditions', () => {
    const oldRule = {
      name: 'Either Or Rule',
      conditions: {
        type: 'composite',
        operator: 'or',
        conditions: [
          { type: 'domain', value: 'facebook.com' },
          { type: 'domain', value: 'twitter.com' }
        ]
      },
      actions: { type: 'close' }
    };
    
    const newRule = migrateRule(oldRule);
    
    expect(newRule.when).toEqual({
      any: [
        { eq: ['tab.domain', 'facebook.com'] },
        { eq: ['tab.domain', 'twitter.com'] }
      ]
    });
  });
  
  test('should preserve unknown fields', () => {
    const oldRule = {
      name: 'Custom Rule',
      conditions: { type: 'duplicate' },
      actions: { type: 'close' },
      customField: 'customValue',
      metadata: { created: '2023-01-01' }
    };
    
    const newRule = migrateRule(oldRule);
    
    expect(newRule.customField).toBe('customValue');
    expect(newRule.metadata).toEqual({ created: '2023-01-01' });
  });
  
  test('should generate ID if missing', () => {
    const oldRule = {
      name: 'No ID Rule',
      conditions: { type: 'duplicate' },
      actions: { type: 'close' }
    };
    
    const newRule = migrateRule(oldRule);
    
    expect(newRule.id).toBeDefined();
    expect(newRule.id).toMatch(/^rule_\d+_[a-z0-9]+$/);
  });
  
  test('should handle invalid rules gracefully', () => {
    const invalidRules = [
      {
        name: 'Invalid Rule 1',
        conditions: { type: 'unknown_type' },
        actions: { type: 'close' }
      },
      {
        name: 'Invalid Rule 2',
        conditions: { type: 'domain', value: 'test.com' },
        actions: { type: 'unknown_action' }
      }
    ];
    
    const migrated = migrateAllRules(invalidRules);
    
    expect(migrated).toHaveLength(2);
    expect(migrated[0].when).toBeDefined();
    expect(migrated[1].then).toBeDefined();
  });
  
  test('should convert hour intervals correctly', () => {
    const oldRule = {
      name: 'Hourly Check',
      conditions: { type: 'duplicate' },
      actions: { type: 'close' },
      interval: 120 // 2 hours
    };
    
    const newRule = migrateRule(oldRule);
    
    expect(newRule.trigger).toEqual({ repeat_every: '2h' });
  });
  
  test('should convert day intervals correctly', () => {
    const oldRule = {
      name: 'Daily Check',
      conditions: { type: 'duplicate' },
      actions: { type: 'close' },
      interval: 1440 // 1 day
    };
    
    const newRule = migrateRule(oldRule);
    
    expect(newRule.trigger).toEqual({ repeat_every: '1d' });
  });
});

describe('Default Rules', () => {
  test('should create valid default rules', () => {
    const defaults = createDefaultRules();
    
    expect(defaults).toBeInstanceOf(Array);
    expect(defaults.length).toBeGreaterThan(0);
    
    for (const rule of defaults) {
      expect(rule.id).toBeDefined();
      expect(rule.name).toBeDefined();
      expect(rule.when).toBeDefined();
      expect(rule.then).toBeDefined();
      expect(rule.trigger).toBeDefined();
    }
  });
  
  test('should include duplicate removal rule', () => {
    const defaults = createDefaultRules();
    const dupeRule = defaults.find(r => r.name === 'Close Duplicate Tabs');
    
    expect(dupeRule).toBeDefined();
    expect(dupeRule.when).toEqual({ is: ['tab.isDupe', true] });
    expect(dupeRule.then).toEqual([{ action: 'close' }]);
    expect(dupeRule.enabled).toBe(true);
  });
  
  test('should include gmail grouping rule', () => {
    const defaults = createDefaultRules();
    const gmailRule = defaults.find(r => r.name === 'Group Gmail Spawns');
    
    expect(gmailRule).toBeDefined();
    expect(gmailRule.when).toEqual({ eq: ['tab.origin', 'gmail'] });
    expect(gmailRule.trigger.immediate).toBe(true);
    expect(gmailRule.enabled).toBe(false);
  });
  
  test('should include news snoozing rule', () => {
    const defaults = createDefaultRules();
    const newsRule = defaults.find(r => r.name === 'Snooze Old News');
    
    expect(newsRule).toBeDefined();
    expect(newsRule.when.all).toBeDefined();
    expect(newsRule.when.all).toHaveLength(2);
    expect(newsRule.then[0].action).toBe('snooze');
  });
});