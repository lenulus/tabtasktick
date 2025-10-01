/**
 * @jest-environment jsdom
 */

import { compile } from '../lib/predicate.js';
import { transformCondition } from '../lib/condition-transformer.js';

describe('Operator Consistency - CamelCase Standard', () => {
  test('startsWith operator should work directly', () => {
    const condition = { startsWith: ['tab.url', 'https://meet.google.com'] };
    const predicate = compile(condition);

    const context = {
      tab: { url: 'https://meet.google.com/abc-def-ghi' }
    };

    expect(predicate(context)).toBe(true);
  });

  test('endsWith operator should work directly', () => {
    const condition = { endsWith: ['tab.url', '.pdf'] };
    const predicate = compile(condition);

    const context = {
      tab: { url: 'https://example.com/document.pdf' }
    };

    expect(predicate(context)).toBe(true);
  });

  test('notContains operator should work directly', () => {
    const condition = { notContains: ['tab.url', 'ads'] };
    const predicate = compile(condition);

    const context = {
      tab: { url: 'https://example.com/article' }
    };

    expect(predicate(context)).toBe(true);
  });

  test('condition-transformer should convert snake_case to camelCase', () => {
    const uiCondition = {
      subject: 'url',
      operator: 'starts_with',
      value: 'https://'
    };

    const predicateCondition = transformCondition(uiCondition);
    expect(predicateCondition).toEqual({ startsWith: ['tab.url', 'https://'] });
  });

  test('condition-transformer should convert not_contains to notContains', () => {
    const uiCondition = {
      subject: 'url',
      operator: 'not_contains',
      value: 'ads'
    };

    const predicateCondition = transformCondition(uiCondition);
    expect(predicateCondition).toEqual({ notContains: ['tab.url', 'ads'] });
  });

  test('condition-transformer should pass through camelCase operators', () => {
    const uiCondition = {
      subject: 'url',
      operator: 'startsWith',
      value: 'https://'
    };

    const predicateCondition = transformCondition(uiCondition);
    expect(predicateCondition).toEqual({ startsWith: ['tab.url', 'https://'] });
  });

  test('nin (not in) operator should work', () => {
    const condition = { nin: ['tab.category', ['ads', 'spam']] };
    const predicate = compile(condition);

    const context = {
      tab: { category: 'news' }
    };

    expect(predicate(context)).toBe(true);
  });

  test('complex condition with all camelCase operators', () => {
    const condition = {
      all: [
        { startsWith: ['tab.url', 'https://'] },
        { notContains: ['tab.url', 'ads'] },
        { endsWith: ['tab.url', '.html'] }
      ]
    };

    const predicate = compile(condition);

    const context = {
      tab: { url: 'https://example.com/page.html' }
    };

    expect(predicate(context)).toBe(true);
  });
});
