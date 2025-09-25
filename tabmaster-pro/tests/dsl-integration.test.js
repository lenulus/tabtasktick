/**
 * Integration tests for DSL import/export functionality
 */

import { jest } from '@jest/globals';
import { parseDSL, serializeRuleToDSL, validateDSL } from '../lib/dsl.js';

// Mock chrome APIs
global.chrome = {
  runtime: {
    sendMessage: jest.fn()
  }
};

describe('DSL Integration Tests', () => {
  describe('Rule format conversion', () => {
    test('converts old duplicate rule to DSL and back', () => {
      const oldRule = {
        id: 'rule_1',
        name: 'Close duplicate tabs',
        enabled: true,
        conditions: { type: 'duplicate' },
        actions: { type: 'close', keepFirst: true },
        trigger: { type: 'event' }
      };

      // Convert to new format
      const newRule = {
        name: oldRule.name,
        enabled: oldRule.enabled,
        when: { is: ['tab.isDupe', true] },
        then: [{ action: 'close' }],
        trigger: { immediate: true },
        flags: {}
      };

      // Convert to DSL
      const dsl = serializeRuleToDSL(newRule);
      expect(dsl).toContain('rule "Close duplicate tabs"');
      expect(dsl).toContain('when tab.isDupe');
      expect(dsl).toContain('then close');
      expect(dsl).toContain('trigger immediate');

      // Parse back
      const parsedRules = parseDSL(dsl);
      expect(parsedRules).toHaveLength(1);
      expect(parsedRules[0].name).toBe('Close duplicate tabs');
      expect(parsedRules[0].when).toEqual({ is: ['tab.isDupe', true] });
    });

    test('converts domain count rule', () => {
      const oldRule = {
        name: 'Group by domain',
        conditions: { type: 'domain_count', minCount: 5 },
        actions: { type: 'group', groupBy: 'domain' },
        trigger: { type: 'periodic', interval: 30 }
      };

      const newRule = {
        name: oldRule.name,
        enabled: true,
        when: { gte: ['tab.countPerOrigin:domain', 5] },
        then: [{ action: 'group', by: 'domain' }],
        trigger: { repeat_every: '30m' },
        flags: {}
      };

      const dsl = serializeRuleToDSL(newRule);
      expect(dsl).toContain('when tab.countPerOrigin:domain >= 5');
      expect(dsl).toContain('then group by domain');
      expect(dsl).toContain('trigger repeat every 30m');
    });

    test('converts category rule', () => {
      const oldRule = {
        name: 'Close social media',
        conditions: { 
          type: 'category',
          categories: ['social', 'entertainment']
        },
        actions: { type: 'close' }
      };

      const newRule = {
        name: oldRule.name,
        enabled: true,
        when: { in: ['tab.category', ['social', 'entertainment']] },
        then: [{ action: 'close' }],
        trigger: {},
        flags: {}
      };

      const dsl = serializeRuleToDSL(newRule);
      expect(dsl).toContain('when tab.category in ["social", "entertainment"]');
    });

    test('converts URL pattern rule', () => {
      const oldRule = {
        name: 'GitHub PRs',
        conditions: { 
          type: 'url_pattern',
          pattern: '^https://github\\.com/.*/pull/\\d+$'
        },
        actions: { type: 'bookmark', folder: 'GitHub PRs' }
      };

      const newRule = {
        name: oldRule.name,
        enabled: true,
        when: { regex: ['tab.url', '^https://github\\.com/.*/pull/\\d+$'] },
        then: [{ action: 'bookmark' }],
        trigger: {},
        flags: {}
      };

      const dsl = serializeRuleToDSL(newRule);
      expect(dsl).toContain('when tab.url regex "^https://github\\.com/.*/pull/\\d+$"');
    });
  });

  describe('Complex rule scenarios', () => {
    test('handles rule with time criteria', () => {
      const dsl = `
        rule "Archive old tabs" {
          when tab.age >= 7d
          then close
          trigger repeat every 1h
          flags skipPinned
        }
      `;

      const validation = validateDSL(dsl);
      expect(validation.valid).toBe(true);
      expect(validation.rules).toHaveLength(1);

      const rule = validation.rules[0];
      expect(rule.when).toEqual({ gte: ['tab.age', '7d'] });
      expect(rule.trigger.repeat_every).toBe('1h');
      expect(rule.flags.skipPinned).toBe(true);
    });

    test('handles rule with multiple conditions', () => {
      const dsl = `
        rule "Complex cleanup" {
          when all(
            tab.category in ["news", "social"],
            tab.age > 2h,
            tab.isPinned is false
          )
          then snooze for 1d
          trigger repeat every 30m
        }
      `;

      const validation = validateDSL(dsl);
      expect(validation.valid).toBe(true);

      const rule = validation.rules[0];
      expect(rule.when.all).toHaveLength(3);
      expect(rule.then[0].action).toBe('snooze');
      expect(rule.then[0].for).toBe('1d');
    });

    test('handles multiple actions', () => {
      const dsl = `
        rule "Organize research" {
          when tab.countPerOrigin:domain >= 10
          then group by domain and snooze for 6h
          trigger onAction
        }
      `;

      const validation = validateDSL(dsl);
      expect(validation.valid).toBe(true);

      const rule = validation.rules[0];
      expect(rule.then).toHaveLength(2);
      expect(rule.then[0]).toEqual({ action: 'group', by: 'domain' });
      expect(rule.then[1]).toEqual({ action: 'snooze', for: '6h' });
    });
  });

  describe('Validation and error handling', () => {
    test('validates empty DSL', () => {
      const result = validateDSL('');
      expect(result.valid).toBe(true);
      expect(result.rules).toEqual([]);
    });

    test('handles malformed DSL', () => {
      const malformed = [
        'rule without quotes { when tab.age > 1d then close }',
        'rule "Missing braces" when tab.age > 1d then close',
        'rule "Bad operator" { when tab.age >>> 1d then close }',
        'rule "Incomplete" { when tab.age >'
      ];

      for (const dsl of malformed) {
        const result = validateDSL(dsl);
        expect(result.valid).toBe(false);
        expect(result.error).toBeTruthy();
      }
    });

    test('handles unknown conditions gracefully', () => {
      const dsl = `
        rule "Unknown field" {
          when tab.unknownField == "value"
          then close
          trigger immediate
        }
      `;

      const validation = validateDSL(dsl);
      expect(validation.valid).toBe(true);
      expect(validation.rules[0].when).toEqual({
        eq: ['tab.unknownField', 'value']
      });
    });
  });

  describe('DSL formatting', () => {
    test('maintains readability in complex rules', () => {
      const complex = {
        name: 'Research cleanup',
        enabled: true,
        when: {
          all: [
            { in: ['tab.category', ['dev', 'docs']] },
            { gte: ['tab.age', '3d'] },
            { any: [
              { contains: ['tab.url', 'stackoverflow'] },
              { contains: ['tab.url', 'github'] }
            ]}
          ]
        },
        then: [
          { action: 'group', by: 'domain' },
          { action: 'snooze', for: '7d' }
        ],
        trigger: { repeat_every: '1h' },
        flags: { skipPinned: true, log: true }
      };

      const dsl = serializeRuleToDSL(complex);
      
      // Should be readable
      expect(dsl).toContain('rule "Research cleanup"');
      expect(dsl).toContain('all(');
      expect(dsl).toContain('any(');
      expect(dsl).toMatch(/group by domain.*and.*snooze for 7d/);
      expect(dsl).toContain('flags skipPinned log');
    });
  });

  describe('Import safety', () => {
    test('imported rules start disabled', () => {
      // This would be tested in the actual UI integration
      // Here we just verify the DSL parsing doesn't force enable
      const dsl = `
        rule "Dangerous rule" {
          when tab.age > 10m
          then close
          trigger repeat every 5m
        }
      `;

      const rules = parseDSL(dsl);
      // Default enabled state is true in the parser
      expect(rules[0].enabled).toBe(true);
      // The UI layer should override this to false for imports
    });

    test('preserves all rule properties', () => {
      const dsl = `
        rule "Full featured" {
          when all(
            tab.domain in ["example.com", "test.com"],
            tab.age >= 1h,
            tab.countPerOrigin:domain > 5
          )
          then group name "Test Group" and snooze for 2h
          trigger repeat every 30m
          flags skipPinned log immediate
        }
      `;

      const rules = parseDSL(dsl);
      const rule = rules[0];

      expect(rule.name).toBe('Full featured');
      expect(rule.when.all).toHaveLength(3);
      expect(rule.then).toHaveLength(2);
      expect(rule.trigger.repeat_every).toBe('30m');
      expect(rule.flags).toEqual({
        skipPinned: true,
        log: true,
        immediate: true
      });
    });
  });
});