/**
 * Tests for DSL parser and serializer
 */

import { parseDSL, serializeRuleToDSL, validateDSL, formatDSL, tokenize } from '../lib/dsl.js';

describe('DSL Tokenizer', () => {
  test('tokenizes basic keywords', () => {
    const tokens = tokenize('rule when then trigger flags');
    expect(tokens.map(t => t.type)).toEqual([
      'RULE', 'WHEN', 'THEN', 'TRIGGER', 'FLAGS', 'EOF'
    ]);
  });

  test('tokenizes string literals', () => {
    const tokens = tokenize('"hello world" "escaped \\"quote\\""');
    expect(tokens[0]).toEqual({ type: 'STRING', value: 'hello world' });
    expect(tokens[1]).toEqual({ type: 'STRING', value: 'escaped "quote"' });
  });

  test('tokenizes numbers and durations', () => {
    const tokens = tokenize('42 30m 1h 7d');
    expect(tokens[0]).toEqual({ type: 'NUMBER', value: 42 });
    expect(tokens[1]).toEqual({ type: 'DURATION', value: '30m' });
    expect(tokens[2]).toEqual({ type: 'DURATION', value: '1h' });
    expect(tokens[3]).toEqual({ type: 'DURATION', value: '7d' });
  });

  test('tokenizes operators', () => {
    const tokens = tokenize('== != >= <= > < in is contains');
    const ops = tokens.slice(0, -1).map(t => t.value);
    expect(ops).toEqual(['==', '!=', '>=', '<=', '>', '<', 'in', 'is', 'contains']);
  });

  test('tokenizes regex patterns', () => {
    const tokens = tokenize('/test.*pattern/gi');
    expect(tokens[0]).toEqual({ type: 'STRING', value: '/test.*pattern/gi' });
  });

  test('handles comments', () => {
    const tokens = tokenize('rule // this is a comment\n"test"');
    expect(tokens.map(t => t.type)).toEqual(['RULE', 'STRING', 'EOF']);
    expect(tokens[1].value).toBe('test');
  });
});

describe('DSL Parser', () => {
  test('parses simple rule with close action', () => {
    const dsl = `
      rule "Close Old Tabs" {
        when tab.age > 7d
        then close
        trigger repeat every 1h
        flags skipPinned
      }
    `;
    const rules = parseDSL(dsl);
    
    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual({
      name: 'Close Old Tabs',
      enabled: true,
      when: { gt: ['tab.age', '7d'] },
      then: [{ action: 'close' }],
      trigger: { repeat_every: '1h' },
      flags: { skipPinned: true }
    });
  });

  test('parses rule with complex conditions', () => {
    const dsl = `
      rule "Complex Rule" {
        when all(tab.domain == "example.com", tab.age >= 1h)
        then close
        trigger immediate
      }
    `;
    const rules = parseDSL(dsl);
    
    expect(rules[0].when).toEqual({
      all: [
        { eq: ['tab.domain', 'example.com'] },
        { gte: ['tab.age', '1h'] }
      ]
    });
  });

  test('parses rule with category condition', () => {
    const dsl = `
      rule "Timebox News" {
        when tab.category in ["news", "social"]
        then snooze for 1d
        trigger repeat every 30m
        flags log skipPinned
      }
    `;
    const rules = parseDSL(dsl);
    
    expect(rules[0].when).toEqual({
      in: ['tab.category', ['news', 'social']]
    });
    expect(rules[0].then[0]).toEqual({
      action: 'snooze',
      for: '1d'
    });
    expect(rules[0].flags).toEqual({
      log: true,
      skipPinned: true
    });
  });

  test('parses rule with group action', () => {
    const dsl = `
      rule "Group Gmail Tabs" {
        when tab.origin == "gmail"
        then group name "Gmail Session"
        trigger immediate
      }
    `;
    const rules = parseDSL(dsl);
    
    expect(rules[0].then[0]).toEqual({
      action: 'group',
      name: 'Gmail Session'
    });
  });

  test('parses rule with multiple actions', () => {
    const dsl = `
      rule "Archive Research" {
        when tab.countPerOrigin:domain >= 8
        then group by domain and snooze for 12h
        trigger repeat every 2h
      }
    `;
    const rules = parseDSL(dsl);
    
    expect(rules[0].then).toEqual([
      { action: 'group', by: 'domain' },
      { action: 'snooze', for: '12h' }
    ]);
  });

  test('parses rule with regex condition', () => {
    const dsl = `
      rule "GitHub PRs" {
        when tab.url regex /github\\.com\\/.*\\/pull\\/\\d+/
        then group name "GitHub PRs"
        trigger onAction
      }
    `;
    const rules = parseDSL(dsl);

    expect(rules[0].when).toEqual({
      regex: ['tab.url', '/github\\.com\\/.*\\/pull\\/\\d+/']
    });
    expect(rules[0].trigger).toEqual({ on_action: true });
  });

  test('parses rule with once trigger', () => {
    const dsl = `
      rule "Scheduled Cleanup" {
        when tab.age > 30d
        then close
        trigger once at "2024-03-15T14:00:00"
      }
    `;
    const rules = parseDSL(dsl);
    
    expect(rules[0].trigger).toEqual({
      once_at: '2024-03-15T14:00:00'
    });
  });

  test('parses rule with nested conditions', () => {
    const dsl = `
      rule "Complex Nested" {
        when any(
          tab.domain == "example.com",
          all(tab.age > 1h, tab.isPinned == false)
        )
        then close
        trigger manual
      }
    `;
    const rules = parseDSL(dsl);
    
    expect(rules[0].when).toEqual({
      any: [
        { eq: ['tab.domain', 'example.com'] },
        {
          all: [
            { gt: ['tab.age', '1h'] },
            { eq: ['tab.isPinned', false] }
          ]
        }
      ]
    });
  });

  test('parses multiple rules', () => {
    const dsl = `
      rule "Rule 1" {
        when tab.age > 1d
        then close
        trigger immediate
      }
      
      rule "Rule 2" {
        when tab.isDupe == true
        then close
        trigger repeat every 30m
      }
    `;
    const rules = parseDSL(dsl);
    
    expect(rules).toHaveLength(2);
    expect(rules[0].name).toBe('Rule 1');
    expect(rules[1].name).toBe('Rule 2');
  });
});

describe('DSL Serializer', () => {
  test('serializes simple rule', () => {
    const rule = {
      name: 'Close Old Tabs',
      enabled: true,
      when: { gt: ['tab.age', '7d'] },
      then: [{ action: 'close' }],
      trigger: { repeat_every: '1h' },
      flags: { skipPinned: true }
    };
    
    const dsl = serializeRuleToDSL(rule);
    expect(dsl).toContain('rule "Close Old Tabs"');
    expect(dsl).toContain('when tab.age > "7d"');
    expect(dsl).toContain('then close');
    expect(dsl).toContain('trigger repeat every 1h');
    expect(dsl).toContain('flags skipPinned');
  });

  test('serializes complex conditions', () => {
    const rule = {
      name: 'Complex',
      when: {
        all: [
          { eq: ['tab.domain', 'example.com'] },
          { gte: ['tab.age', '1h'] }
        ]
      },
      then: [{ action: 'close' }],
      trigger: { immediate: true }
    };
    
    const dsl = serializeRuleToDSL(rule);
    expect(dsl).toContain('when all(tab.domain == "example.com", tab.age >= "1h")');
  });

  test('serializes category conditions', () => {
    const rule = {
      name: 'Categories',
      when: { in: ['tab.category', ['news', 'social']] },
      then: [{ action: 'snooze', for: '1d' }],
      trigger: { repeat_every: '30m' }
    };
    
    const dsl = serializeRuleToDSL(rule);
    expect(dsl).toContain('when tab.category in ["news", "social"]');
    expect(dsl).toContain('then snooze for 1d');
  });

  test('serializes multiple actions', () => {
    const rule = {
      name: 'Multi Action',
      when: { gte: ['tab.countPerOrigin:domain', 8] },
      then: [
        { action: 'group', by: 'domain' },
        { action: 'snooze', for: '12h' }
      ],
      trigger: { repeat_every: '2h' }
    };
    
    const dsl = serializeRuleToDSL(rule);
    expect(dsl).toContain('then group by domain and snooze for 12h');
  });

  test('serializes all flags', () => {
    const rule = {
      name: 'Flags',
      when: { eq: ['tab.domain', 'test.com'] },
      then: [{ action: 'close' }],
      trigger: { immediate: true },
      flags: { skipPinned: true, log: true, immediate: true }
    };
    
    const dsl = serializeRuleToDSL(rule);
    expect(dsl).toContain('flags skipPinned log immediate');
  });
});

describe('Round-trip conversion', () => {
  test('DSL → JSON → DSL preserves structure', () => {
    const originalDSL = `rule "Test Rule" {
  when all(tab.category in ["news", "social"], tab.age >= 1h)
  then group name "Old Media" and snooze for 1d
  trigger repeat every 30m
  flags skipPinned log
}`;
    
    const rules = parseDSL(originalDSL);
    const serialized = serializeRuleToDSL(rules[0]);
    const reparsed = parseDSL(serialized);
    
    expect(reparsed[0]).toEqual(rules[0]);
  });

  test('handles all PRD examples', () => {
    const examples = [
      {
        name: 'Timebox News 1h',
        dsl: `rule "Timebox News 1h" {
  when tab.category in ["news"] and tab.age >= 1h
  then snooze for 1d
  trigger repeat every 1h
  flags log skipPinned
}`
      },
      {
        name: 'Close Solo Windows > 3d',
        dsl: `rule "Close Solo Windows > 3d" {
  when window.tabCount == 1 and tab.age >= 3d
  then close
  trigger onAction
  flags immediate
}`
      },
      {
        name: 'Gmail Group',
        dsl: `rule "Gmail Group" {
  when tab.origin == "gmail"
  then group name "Gmail Session"
  trigger immediate
}`
      },
      {
        name: 'Deduplicate',
        dsl: `rule "Deduplicate" {
  when tab.isDupe
  then close
  trigger repeat every 30m
}`
      }
    ];

    for (const example of examples) {
      const rules = parseDSL(example.dsl);
      expect(rules).toHaveLength(1);
      expect(rules[0].name).toBe(example.name);
      
      // Verify round-trip
      const serialized = serializeRuleToDSL(rules[0]);
      const reparsed = parseDSL(serialized);
      expect(reparsed[0].name).toBe(example.name);
    }
  });
});

describe('DSL Validation', () => {
  test('validates correct DSL', () => {
    const result = validateDSL(`
      rule "Valid Rule" {
        when tab.age > 1d
        then close
        trigger immediate
      }
    `);
    
    expect(result.valid).toBe(true);
    expect(result.rules).toHaveLength(1);
  });

  test('reports parsing errors', () => {
    const result = validateDSL(`
      rule "Invalid Rule" {
        when tab.age >>> 1d
        then close
      }
    `);
    
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.error.includes('Unexpected') || result.error.includes('Expected')).toBe(true);
  });

  test('reports structural errors', () => {
    const result = validateDSL(`
      rule "Missing Brace" {
        when tab.age > 1d
        then close
    `);
    
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.error.includes('EOF') || result.error.includes('RBRACE')).toBe(true);
  });
});

describe('DSL Formatting', () => {
  test('formats unindented DSL', () => {
    const ugly = `rule "Test" {
when tab.age > 1d
then close
trigger immediate
}`;
    
    const formatted = formatDSL(ugly);
    expect(formatted).toBe(`rule "Test" {
  when tab.age > 1d
  then close
  trigger immediate
}`);
  });

  test('preserves existing formatting', () => {
    const pretty = `rule "Test" {
  when tab.age > 1d
  then close
  trigger immediate
}`;
    
    const formatted = formatDSL(pretty);
    expect(formatted).toBe(pretty);
  });
});

describe('Edge cases', () => {
  test('handles empty rule', () => {
    const dsl = 'rule "Empty" { }';
    const rules = parseDSL(dsl);
    
    expect(rules[0]).toEqual({
      name: 'Empty',
      enabled: true,
      when: null,
      then: [],
      trigger: {},
      flags: {}
    });
  });

  test('handles boolean conditions', () => {
    const dsl = `
      rule "Booleans" {
        when tab.isPinned is true and tab.isGrouped is false
        then close
        trigger immediate
      }
    `;
    const rules = parseDSL(dsl);
    
    expect(rules[0].when).toEqual({
      all: [
        { is: ['tab.isPinned', true] },
        { is: ['tab.isGrouped', false] }
      ]
    });
  });

  test('handles escaped characters in strings', () => {
    const dsl = `
      rule "Escaped" {
        when tab.title contains "Test \\"Quote\\""
        then group name "Special \\"Group\\""
        trigger immediate
      }
    `;
    const rules = parseDSL(dsl);
    
    expect(rules[0].when).toEqual({
      contains: ['tab.title', 'Test "Quote"']
    });
    expect(rules[0].then[0].name).toBe('Special "Group"');
  });

  test('handles complex regex patterns', () => {
    const dsl = `
      rule "Complex Regex" {
        when tab.url regex /^https?:\\/\\/(www\\.)?github\\.com\\/[\\w-]+\\/[\\w-]+\\/pull\\/\\d+$/i
        then group name "GitHub PRs"
        trigger onAction
      }
    `;
    const rules = parseDSL(dsl);

    expect(rules[0].when.regex[1]).toBe('/^https?:\\/\\/(www\\.)?github\\.com\\/[\\w-]+\\/[\\w-]+\\/pull\\/\\d+$/i');
  });
});