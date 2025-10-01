/**
 * @jest-environment jsdom
 */

import { compile } from '../lib/predicate.js';

describe('Operator Snake Case Support', () => {
  test('starts_with operator should work', () => {
    const condition = { starts_with: ['tab.url', 'https://meet.google.com'] };
    const predicate = compile(condition);

    const context = {
      tab: { url: 'https://meet.google.com/abc-def-ghi' }
    };

    expect(predicate(context)).toBe(true);
  });

  test('starts_with operator should reject non-matching URLs', () => {
    const condition = { starts_with: ['tab.url', 'https://meet.google.com'] };
    const predicate = compile(condition);

    const context = {
      tab: { url: 'https://zoom.us/meeting' }
    };

    expect(predicate(context)).toBe(false);
  });

  test('ends_with operator should work', () => {
    const condition = { ends_with: ['tab.url', '.pdf'] };
    const predicate = compile(condition);

    const context = {
      tab: { url: 'https://example.com/document.pdf' }
    };

    expect(predicate(context)).toBe(true);
  });

  test('not_contains operator should work', () => {
    const condition = { not_contains: ['tab.url', 'ads'] };
    const predicate = compile(condition);

    const context = {
      tab: { url: 'https://example.com/article' }
    };

    expect(predicate(context)).toBe(true);
  });

  test('not_contains operator should reject matching URLs', () => {
    const condition = { not_contains: ['tab.url', 'ads'] };
    const predicate = compile(condition);

    const context = {
      tab: { url: 'https://example.com/ads/banner' }
    };

    expect(predicate(context)).toBe(false);
  });

  test('camelCase operators should still work', () => {
    const condition = { startsWith: ['tab.url', 'https://meet.google.com'] };
    const predicate = compile(condition);

    const context = {
      tab: { url: 'https://meet.google.com/abc-def-ghi' }
    };

    expect(predicate(context)).toBe(true);
  });

  test('complex condition with snake_case operators', () => {
    const condition = {
      all: [
        { starts_with: ['tab.url', 'https://'] },
        { not_contains: ['tab.url', 'ads'] },
        { ends_with: ['tab.url', '.html'] }
      ]
    };

    const predicate = compile(condition);

    const context = {
      tab: { url: 'https://example.com/page.html' }
    };

    expect(predicate(context)).toBe(true);
  });

  test('complex condition should reject if any fails', () => {
    const condition = {
      all: [
        { starts_with: ['tab.url', 'https://'] },
        { not_contains: ['tab.url', 'ads'] },
        { ends_with: ['tab.url', '.html'] }
      ]
    };

    const predicate = compile(condition);

    const context = {
      tab: { url: 'https://example.com/ads/page.html' }
    };

    expect(predicate(context)).toBe(false);
  });
});
