/**
 * @jest-environment jsdom
 */

import { getNewFormatConditionDescription } from '../dashboard/modules/views/rules.js';

describe('Rule Description Formatting', () => {
  test('should format startsWith operator as human-readable', () => {
    const conditions = {
      all: [
        { subject: 'url', operator: 'startsWith', value: 'https://meet.google.com/' }
      ]
    };

    const description = getNewFormatConditionDescription(conditions);

    // Should show "starts with" not "startsWith"
    expect(description).toContain('starts with');
    expect(description).not.toContain('startsWith');
  });

  test('should format gt operator as human-readable for duration', () => {
    const conditions = {
      all: [
        { subject: 'last_access', operator: 'gt', value: '1h' }
      ]
    };

    const description = getNewFormatConditionDescription(conditions);

    // Should show "greater than" not "gt"
    expect(description).toContain('greater than');
    expect(description).not.toContain(' gt ');
  });

  test('should format last_access as "Last Accessed"', () => {
    const conditions = {
      all: [
        { subject: 'last_access', operator: 'gt', value: '1h' }
      ]
    };

    const description = getNewFormatConditionDescription(conditions);

    // Should show "Last Accessed" not "last_access"
    expect(description).toContain('Last Accessed');
    expect(description).not.toContain('last_access');
  });

  test('should format complex rule from issue #8 correctly', () => {
    const conditions = {
      all: [
        { subject: 'url', operator: 'startsWith', value: 'https://meet.google.com/' },
        { subject: 'last_access', operator: 'gt', value: '1h' }
      ]
    };

    const description = getNewFormatConditionDescription(conditions);

    // Should be human-readable: "ALL of: URL starts with ..., Last Accessed greater than 1h"
    expect(description).toContain('ALL of:');
    expect(description).toContain('URL starts with');
    expect(description).toContain('Last Accessed greater than');

    // Should NOT contain internal representation
    expect(description).not.toContain('startsWith');
    expect(description).not.toContain(' gt ');
    expect(description).not.toContain('last_access');
  });

  test('should handle all new operator types', () => {
    const testCases = [
      { operator: 'eq', expected: 'equals' },
      { operator: 'neq', expected: 'not equals' },
      { operator: 'gte', expected: 'at least' },
      { operator: 'lte', expected: 'at most' },
      { operator: 'notContains', expected: 'does not contain' },
      { operator: 'endsWith', expected: 'ends with' },
      { operator: 'nin', expected: 'not in' }
    ];

    testCases.forEach(({ operator, expected }) => {
      const conditions = {
        all: [{ subject: 'url', operator, value: 'test' }]
      };

      const description = getNewFormatConditionDescription(conditions);

      expect(description).toContain(expected);
    });
  });
});
