/**
 * Test for Issue #1: Disabled rules don't execute when tested
 * This test verifies that disabled rules can be previewed/tested and executed manually
 */

import { jest } from '@jest/globals';
import { evaluateRule, previewRule, buildIndices, runRules } from '../lib/engine.js';

describe('Issue #1: Disabled Rules Testing', () => {
  test('evaluateRule should work on disabled rules', () => {
    const rule = {
      id: 'test-rule',
      name: 'Test Disabled Rule',
      enabled: false, // Rule is disabled
      when: {
        all: [
          { subject: 'domain', operator: 'equals', value: 'example.com' }
        ]
      },
      then: [
        { type: 'close' }
      ]
    };

    const tabs = [
      { id: 1, url: 'https://example.com', title: 'Example' },
      { id: 2, url: 'https://google.com', title: 'Google' }
    ];

    const context = {
      tabs,
      windows: [],
      idx: buildIndices(tabs)
    };

    const matches = evaluateRule(rule, context);

    // Should match the example.com tab even though rule is disabled
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(1);
    expect(matches[0].url).toBe('https://example.com');
  });

  test('previewRule should work on disabled rules', () => {
    const rule = {
      id: 'preview-test',
      name: 'Preview Disabled Rule',
      enabled: false, // Rule is disabled
      when: {
        all: [
          { subject: 'url', operator: 'contains', value: 'test' }
        ]
      },
      then: [
        { type: 'group', name: 'Test Group' }
      ]
    };

    const tabs = [
      { id: 1, url: 'https://test.com/page', title: 'Test Page' },
      { id: 2, url: 'https://example.com', title: 'Example' }
    ];

    const context = {
      tabs,
      windows: [],
      idx: buildIndices(tabs)
    };

    const preview = previewRule(rule, context);

    // Should preview the test.com tab even though rule is disabled
    expect(preview.totalMatches).toBe(1);
    expect(preview.matches).toHaveLength(1);
    expect(preview.matches[0].id).toBe(1);
  });

  test('enabled rules should still work normally', () => {
    const rule = {
      id: 'enabled-rule',
      name: 'Enabled Rule',
      enabled: true, // Rule is enabled
      when: {
        all: [
          { subject: 'domain', operator: 'equals', value: 'github.com' }
        ]
      },
      then: [
        { type: 'bookmark' }
      ]
    };

    const tabs = [
      { id: 1, url: 'https://github.com/repo', title: 'GitHub' },
      { id: 2, url: 'https://example.com', title: 'Example' }
    ];

    const context = {
      tabs,
      windows: [],
      idx: buildIndices(tabs)
    };

    const matches = evaluateRule(rule, context);

    // Should match the github.com tab
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(1);
  });

  test('runRules should skip disabled rules in automatic execution (without forceExecution)', async () => {
    const disabledRule = {
      id: 'disabled-auto',
      name: 'Disabled Auto Rule',
      enabled: false,
      when: {
        all: [
          { subject: 'domain', operator: 'equals', value: 'example.com' }
        ]
      },
      then: [
        { type: 'close' }
      ]
    };

    const enabledRule = {
      id: 'enabled-auto',
      name: 'Enabled Auto Rule',
      enabled: true,
      when: {
        all: [
          { subject: 'domain', operator: 'equals', value: 'github.com' }
        ]
      },
      then: [
        { type: 'close' }
      ]
    };

    const tabs = [
      { id: 1, url: 'https://example.com', title: 'Example' },
      { id: 2, url: 'https://github.com/repo', title: 'GitHub' }
    ];

    const context = {
      tabs,
      windows: [],
      idx: buildIndices(tabs),
      chrome: {
        tabs: {
          remove: jest.fn().mockResolvedValue(undefined)
        }
      }
    };

    const results = await runRules([disabledRule, enabledRule], context, { dryRun: false });

    // Should only execute the enabled rule
    expect(results.rules).toHaveLength(1);
    expect(results.rules[0].ruleName).toBe('Enabled Auto Rule');
    expect(results.totalMatches).toBe(1);
  });

  test('runRules should execute disabled rules with forceExecution option', async () => {
    const disabledRule = {
      id: 'disabled-manual',
      name: 'Disabled Manual Rule',
      enabled: false,
      when: {
        all: [
          { subject: 'domain', operator: 'equals', value: 'example.com' }
        ]
      },
      then: [
        { type: 'close' }
      ]
    };

    const tabs = [
      { id: 1, url: 'https://example.com', title: 'Example' },
      { id: 2, url: 'https://github.com/repo', title: 'GitHub' }
    ];

    const context = {
      tabs,
      windows: [],
      idx: buildIndices(tabs),
      chrome: {
        tabs: {
          remove: jest.fn().mockResolvedValue(undefined)
        }
      }
    };

    // With forceExecution: true, disabled rule should execute
    const results = await runRules([disabledRule], context, {
      dryRun: false,
      forceExecution: true
    });

    // Should execute the disabled rule
    expect(results.rules).toHaveLength(1);
    expect(results.rules[0].ruleName).toBe('Disabled Manual Rule');
    expect(results.totalMatches).toBe(1);
    expect(context.chrome.tabs.remove).toHaveBeenCalledWith(1);
  });
});
