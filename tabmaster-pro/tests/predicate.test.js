// Tests for predicate.js - Rule condition compilation
// SKIPPED: predicate.js was part of V1 engine, removed in Phase 7.2
// V2 uses DSL format conditions instead of predicate functions

import { describe, it, expect, beforeEach } from '@jest/globals';
import { compile, evaluateCondition } from '../lib/predicate.js';
import { createTab, addTimeTracking, createTabGroup } from './utils/tab-factory.js';
import { createTestContext } from './utils/test-helpers.js';

describe.skip('predicate compiler', () => {
  describe('simple equality conditions', () => {
    it('should compile eq (equals) condition', () => {
      const condition = { eq: ['tab.url', 'https://example.com'] };
      const pred = compile(condition);
      
      const tab = createTab({ url: 'https://example.com' });
      const ctx = createTestContext([tab]);
      expect(pred({ tab, ...ctx })).toBe(true);
      
      const tab2 = createTab({ url: 'https://different.com' });
      expect(pred({ tab: tab2, ...ctx })).toBe(false);
    });

    it('should compile neq (not equals) condition', () => {
      const condition = { neq: ['tab.domain', 'example.com'] };
      const pred = compile(condition);
      
      const tab = createTab({ url: 'https://different.com' });
      tab.domain = 'different.com';
      const ctx = createTestContext([tab]);
      expect(pred({ tab, ...ctx })).toBe(true);
      
      const tab2 = createTab({ url: 'https://example.com' });
      tab2.domain = 'example.com';
      expect(pred({ tab: tab2, ...ctx })).toBe(false);
    });

    it('should compile is (boolean) condition', () => {
      const condition = { is: ['tab.pinned', true] };
      const pred = compile(condition);
      
      const tab = createTab({ pinned: true });
      const ctx = createTestContext([tab]);
      expect(pred({ tab, ...ctx })).toBe(true);
      
      const tab2 = createTab({ pinned: false });
      expect(pred({ tab: tab2, ...ctx })).toBe(false);
    });
  });

  describe('comparison conditions', () => {
    it('should compile gt (greater than) condition', () => {
      const condition = { gt: ['tab.index', 5] };
      const pred = compile(condition);
      
      const tab = createTab({ index: 10 });
      const ctx = createTestContext([tab]);
      expect(pred({ tab, ...ctx })).toBe(true);
      
      const tab2 = createTab({ index: 3 });
      expect(pred({ tab: tab2, ...ctx })).toBe(false);
    });

    it('should compile gte (greater than or equal) condition', () => {
      const condition = { gte: ['tab.age', '1h'] };
      const pred = compile(condition);
      
      const tab = createTab();
      tab.age = 2 * 60 * 60 * 1000; // 2 hours in ms
      const ctx = createTestContext([tab]);
      expect(pred({ tab, ...ctx })).toBe(true);
      
      tab.age = 30 * 60 * 1000; // 30 minutes
      expect(pred({ tab, ...ctx })).toBe(false);
    });

    it('should compile lt/lte conditions', () => {
      const ltCondition = { lt: ['window.tabCount', 10] };
      const ltPred = compile(ltCondition);
      
      const win = { id: 1, tabCount: 5 };
      const ctx = createTestContext([], [win]);
      expect(ltPred({ window: win, ...ctx })).toBe(true);
      
      const lteCondition = { lte: ['window.tabCount', 5] };
      const ltePred = compile(lteCondition);
      expect(ltePred({ window: win, ...ctx })).toBe(true);
    });
  });

  describe('array conditions', () => {
    it('should compile in (array contains) condition', () => {
      const condition = { in: ['tab.category', ['news', 'social']] };
      const pred = compile(condition);
      
      const newsTab = createTab({ url: 'https://cnn.com' });
      const ctx1 = createTestContext([newsTab]);
      expect(pred({ ...ctx1, tab: newsTab })).toBe(true);
      
      const devTab = createTab({ url: 'https://github.com' });
      const ctx2 = createTestContext([devTab]);
      expect(pred({ ...ctx2, tab: devTab })).toBe(false);
    });

    it('should compile nin (not in array) condition', () => {
      const condition = { nin: ['tab.domain', ['google.com', 'facebook.com']] };
      const pred = compile(condition);
      
      const tab = createTab({ url: 'https://github.com' });
      tab.domain = 'github.com';
      const ctx = createTestContext([tab]);
      expect(pred({ tab, ...ctx })).toBe(true);
      
      tab.domain = 'google.com';
      expect(pred({ tab, ...ctx })).toBe(false);
    });
  });

  describe('string conditions', () => {
    it('should compile contains condition', () => {
      const condition = { contains: ['tab.title', 'GitHub'] };
      const pred = compile(condition);
      
      const tab = createTab({ title: 'GitHub - Repository' });
      const ctx = createTestContext([tab]);
      expect(pred({ tab, ...ctx })).toBe(true);
      
      tab.title = 'Stack Overflow';
      expect(pred({ tab, ...ctx })).toBe(false);
    });

    it('should compile startsWith condition', () => {
      const condition = { startsWith: ['tab.url', 'https://docs.'] };
      const pred = compile(condition);
      
      const tab = createTab({ url: 'https://docs.google.com' });
      const ctx = createTestContext([tab]);
      expect(pred({ tab, ...ctx })).toBe(true);
      
      tab.url = 'https://google.com/docs';
      expect(pred({ tab, ...ctx })).toBe(false);
    });

    it('should compile endsWith condition', () => {
      const condition = { endsWith: ['tab.url', '.pdf'] };
      const pred = compile(condition);
      
      const tab = createTab({ url: 'https://example.com/document.pdf' });
      const ctx = createTestContext([tab]);
      expect(pred({ tab, ...ctx })).toBe(true);
      
      tab.url = 'https://example.com/page.html';
      expect(pred({ tab, ...ctx })).toBe(false);
    });

    it('should compile regex condition', () => {
      const condition = { regex: ['tab.url', '/\\/api\\/v[0-9]+/'] };
      const pred = compile(condition);
      
      const tab = createTab({ url: 'https://example.com/api/v2/users' });
      const ctx = createTestContext([tab]);
      expect(pred({ tab, ...ctx })).toBe(true);
      
      tab.url = 'https://example.com/api/users';
      expect(pred({ tab, ...ctx })).toBe(false);
    });
  });

  describe('logical operators', () => {
    it('should compile all (AND) condition', () => {
      const condition = {
        all: [
          { eq: ['tab.domain', 'github.com'] },
          { gte: ['tab.age', '1h'] },
          { is: ['tab.pinned', false] }
        ]
      };
      const pred = compile(condition);
      
      const tab = createTab({ url: 'https://github.com', pinned: false });
      tab.domain = 'github.com';
      tab.age = 2 * 60 * 60 * 1000; // 2 hours
      const ctx = createTestContext([tab]);
      expect(pred({ tab, ...ctx })).toBe(true);
      
      // Should fail if any condition is false
      tab.pinned = true;
      expect(pred({ tab, ...ctx })).toBe(false);
    });

    it('should compile any (OR) condition', () => {
      const condition = {
        any: [
          { eq: ['tab.domain', 'temporary.com'] },
          { contains: ['tab.title', '[DRAFT]'] },
          { gte: ['tab.age', '7d'] }
        ]
      };
      const pred = compile(condition);
      
      const tab = createTab({ title: 'My Document [DRAFT]' });
      tab.domain = 'example.com';
      tab.age = 1 * 60 * 60 * 1000; // 1 hour
      const ctx = createTestContext([tab]);
      expect(pred({ tab, ...ctx })).toBe(true);
      
      // Should fail if all conditions are false
      tab.title = 'Final Document';
      expect(pred({ tab, ...ctx })).toBe(false);
    });

    it('should compile none (NOR) condition', () => {
      const condition = {
        none: [
          { eq: ['tab.domain', 'important.com'] },
          { is: ['tab.isPinned', true] },
          { contains: ['tab.title', 'KEEP'] }
        ]
      };
      const pred = compile(condition);
      
      const tab = createTab({ url: 'https://example.com', pinned: false, title: 'Delete Me' });
      tab.domain = 'example.com';
      const ctx = createTestContext([tab]);
      expect(pred({ tab, ...ctx })).toBe(true);
      
      // Should fail if any condition is true
      tab.title = 'KEEP This Tab';
      expect(pred({ tab, ...ctx })).toBe(false);
    });

    it('should compile not condition', () => {
      const condition = {
        not: { eq: ['tab.domain', 'example.com'] }
      };
      const pred = compile(condition);
      
      const tab = createTab({ url: 'https://github.com' });
      tab.domain = 'github.com';
      const ctx = createTestContext([tab]);
      expect(pred({ tab, ...ctx })).toBe(true);
      
      tab.domain = 'example.com';
      expect(pred({ tab, ...ctx })).toBe(false);
    });

    it('should handle deeply nested conditions', () => {
      const condition = {
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
      };
      const pred = compile(condition);
      
      const tabs = Array(12).fill(null).map(() => 
        createTab({ url: 'https://github.com/repo' })
      );
      tabs.forEach(t => {
        t.domain = 'github.com';
        t.category = 'dev';
      });
      
      const ctx = createTestContext(tabs);
      const tab = tabs[0];
      tab.countPerOrigin = { domain: 12 };
      expect(pred({ tab, ...ctx })).toBe(true);
    });
  });

  describe('special field accessors', () => {
    it('should handle tab.countPerOrigin:domain', () => {
      const condition = { gte: ['tab.countPerOrigin:domain', 5] };
      const pred = compile(condition);
      
      const tabs = [
        createTab({ url: 'https://github.com/1' }),
        createTab({ url: 'https://github.com/2' }),
        createTab({ url: 'https://github.com/3' }),
        createTab({ url: 'https://github.com/4' }),
        createTab({ url: 'https://github.com/5' }),
        createTab({ url: 'https://example.com' })
      ];
      tabs.forEach(t => t.domain = new URL(t.url).hostname);
      
      const ctx = createTestContext(tabs);
      const tab = tabs[0];
      expect(pred({ tab, ...ctx })).toBe(true);
    });

    it('should handle tab.countPerOrigin:origin', () => {
      const condition = { gt: ['tab.countPerOrigin:origin', 2] };
      const pred = compile(condition);
      
      const tabs = [
        createTab({ url: 'https://example.com/1' }),
        createTab({ url: 'https://example.com/2' }),
        createTab({ url: 'https://example.com/3' }),
      ];
      tabs.forEach(t => {
        t.domain = 'example.com';
        t.origin = 'gmail'; // All opened from gmail
      });
      
      const ctx = createTestContext(tabs);
      const tab = tabs[0];
      expect(pred({ tab, ...ctx })).toBe(true);
    });

    it('should handle tab.isDupe', () => {
      const condition = { is: ['tab.isDupe', true] };
      const pred = compile(condition);
      
      const tabs = [
        createTab({ url: 'https://example.com/page' }),
        createTab({ url: 'https://example.com/page#section' })
      ];
      
      const ctx = createTestContext(tabs);
      const tab = tabs[1];
      tab.isDupe = true; // Would be set by normalize logic
      expect(pred({ tab, ...ctx })).toBe(true);
    });

    it('should handle window fields', () => {
      const condition = { eq: ['window.tabCount', 1] };
      const pred = compile(condition);
      
      const win = { id: 1, tabCount: 1 };
      const ctx = createTestContext([], [win]);
      expect(pred({ window: win, ...ctx })).toBe(true);
      
      win.tabCount = 5;
      expect(pred({ window: win, ...ctx })).toBe(false);
    });

    it('should handle tab.groupName', () => {
      const condition = { contains: ['tab.groupName', 'Work'] };
      const pred = compile(condition);
      
      const group = createTabGroup({ title: 'Work Projects' });
      const tab = createTab({ groupId: group.id });
      tab.groupName = group.title;
      
      const ctx = createTestContext([tab]);
      expect(pred({ tab, ...ctx })).toBe(true);
    });
  });

  describe('duration parsing', () => {
    it('should parse duration strings in comparisons', () => {
      const condition = { gte: ['tab.age', '30m'] };
      const pred = compile(condition);
      
      const tab = createTab();
      tab.age = 45 * 60 * 1000; // 45 minutes
      const ctx = createTestContext([tab]);
      expect(pred({ tab, ...ctx })).toBe(true);
      
      tab.age = 15 * 60 * 1000; // 15 minutes
      expect(pred({ tab, ...ctx })).toBe(false);
    });

    it('should handle different duration units', () => {
      const tests = [
        { duration: '5m', ms: 5 * 60 * 1000 },
        { duration: '2h', ms: 2 * 60 * 60 * 1000 },
        { duration: '3d', ms: 3 * 24 * 60 * 60 * 1000 }
      ];
      
      tests.forEach(({ duration, ms }) => {
        const condition = { eq: ['tab.age', duration] };
        const pred = compile(condition);
        
        const tab = createTab();
        tab.age = ms;
        const ctx = createTestContext([tab]);
        expect(pred({ tab, ...ctx })).toBe(true);
      });
    });
  });

  describe('error handling', () => {
    it('should handle missing fields gracefully', () => {
      const condition = { eq: ['tab.nonExistentField', 'value'] };
      const pred = compile(condition);
      
      const tab = createTab();
      const ctx = createTestContext([tab]);
      expect(pred({ tab, ...ctx })).toBe(false);
    });

    it('should handle null/undefined values', () => {
      const condition = { eq: ['tab.url', null] };
      const pred = compile(condition);
      
      const tab = createTab();
      tab.url = null;
      const ctx = createTestContext([tab]);
      expect(pred({ tab, ...ctx })).toBe(true);
    });

    it('should throw on invalid condition format', () => {
      const invalidConditions = [
        { unknownOp: ['tab.url', 'value'] },
        { eq: ['tab.url'] }, // Missing value
        { eq: 'not-an-array' },
        null,
        undefined,
        'string-condition'
      ];
      
      invalidConditions.forEach(condition => {
        expect(() => compile(condition)).toThrow();
      });
    });
  });
});