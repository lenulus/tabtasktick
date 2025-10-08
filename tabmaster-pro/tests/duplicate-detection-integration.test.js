// Integration test for duplicate detection in v2 engine
// Ensures YouTube videos, Google searches aren't incorrectly closed as duplicates

import { describe, it, expect, beforeEach } from '@jest/globals';
import { runRules } from '../lib/engine.v2.services.js';

describe('Duplicate Detection Integration - v2 Engine', () => {
  let closedTabs;

  beforeEach(() => {
    closedTabs = [];
  });

  function mockContext(tabs, windows) {
    return {
      tabs,
      windows,
      chrome: {
        tabs: {
          remove: async (tabId) => {
            closedTabs.push(tabId);
          }
        }
      }
    };
  }

  it('should NOT close different YouTube videos as duplicates', async () => {
    const tabs = [
      {
        id: 1,
        url: 'https://www.youtube.com/watch?v=abc123',
        title: 'Video 1',
        windowId: 1
      },
      {
        id: 2,
        url: 'https://www.youtube.com/watch?v=xyz789',
        title: 'Video 2',
        windowId: 1
      }
    ];

    const windows = [{ id: 1, focused: true }];

    const rules = [{
      id: 'test-duplicates',
      name: 'Close Duplicates',
      enabled: true,
      conditions: {},
      then: [{ action: 'close-duplicates', keep: 'oldest' }]
    }];

    const context = mockContext(tabs, windows);
    await runRules(rules, context);

    // Should close 0 tabs - no duplicates exist (different video IDs)
    expect(closedTabs.length).toBe(0);
  });

  it('should close same YouTube video with different tracking params as duplicates', async () => {
    const tabs = [
      {
        id: 1,
        url: 'https://www.youtube.com/watch?v=abc123',
        title: 'Video',
        windowId: 1
      },
      {
        id: 2,
        url: 'https://www.youtube.com/watch?v=abc123&utm_source=twitter&fbclid=xyz',
        title: 'Video',
        windowId: 1
      },
      {
        id: 3,
        url: 'https://www.youtube.com/watch?v=abc123&utm_campaign=share',
        title: 'Video',
        windowId: 1
      }
    ];

    const windows = [{ id: 1, focused: true }];

    const rules = [{
      id: 'test-duplicates',
      name: 'Close Duplicates',
      enabled: true,
      conditions: {},
      then: [{ action: 'close-duplicates', keep: 'oldest' }]
    }];

    const context = mockContext(tabs, windows);
    await runRules(rules, context);

    // Should close 2 tabs (keeps oldest id=1, closes id=2 and id=3)
    expect(closedTabs.length).toBe(2);
    expect(closedTabs.sort()).toEqual([2, 3]);
  });

  it('should NOT close different Google searches as duplicates', async () => {
    const tabs = [
      {
        id: 1,
        url: 'https://www.google.com/search?q=cats',
        title: 'Google Search - cats',
        windowId: 1
      },
      {
        id: 2,
        url: 'https://www.google.com/search?q=dogs',
        title: 'Google Search - dogs',
        windowId: 1
      }
    ];

    const windows = [{ id: 1, focused: true }];

    const rules = [{
      id: 'test-duplicates',
      name: 'Close Duplicates',
      enabled: true,
      conditions: {},
      then: [{ action: 'close-duplicates', keep: 'oldest' }]
    }];

    const context = mockContext(tabs, windows);
    await runRules(rules, context);

    // Should close 0 tabs - no duplicates (different search queries)
    expect(closedTabs.length).toBe(0);
  });

  it('should close same Google search with different tracking params as duplicates', async () => {
    const tabs = [
      {
        id: 1,
        url: 'https://www.google.com/search?q=javascript',
        title: 'Google - javascript',
        windowId: 1
      },
      {
        id: 2,
        url: 'https://www.google.com/search?q=javascript&utm_source=homepage&gclid=abc',
        title: 'Google - javascript',
        windowId: 1
      }
    ];

    const windows = [{ id: 1, focused: true }];

    const rules = [{
      id: 'test-duplicates',
      name: 'Close Duplicates',
      enabled: true,
      conditions: {},
      then: [{ action: 'close-duplicates', keep: 'oldest' }]
    }];

    const context = mockContext(tabs, windows);
    await runRules(rules, context);

    // Should close 1 tab (same search query, different tracking params)
    expect(closedTabs.length).toBe(1);
    expect(closedTabs).toEqual([2]);
  });

  it('should NOT close different GitHub searches as duplicates', async () => {
    const tabs = [
      {
        id: 1,
        url: 'https://github.com/search?q=react&type=repositories',
        title: 'GitHub - react',
        windowId: 1
      },
      {
        id: 2,
        url: 'https://github.com/search?q=vue&type=repositories',
        title: 'GitHub - vue',
        windowId: 1
      }
    ];

    const windows = [{ id: 1, focused: true }];

    const rules = [{
      id: 'test-duplicates',
      name: 'Close Duplicates',
      enabled: true,
      conditions: {},
      then: [{ action: 'close-duplicates', keep: 'oldest' }]
    }];

    const context = mockContext(tabs, windows);
    await runRules(rules, context);

    // Should close 0 tabs - different search queries
    expect(closedTabs.length).toBe(0);
  });

  it('should close generic URLs with tracking params as duplicates', async () => {
    const tabs = [
      {
        id: 1,
        url: 'https://example.com/article',
        title: 'Article',
        windowId: 1
      },
      {
        id: 2,
        url: 'https://example.com/article?utm_source=twitter',
        title: 'Article',
        windowId: 1
      },
      {
        id: 3,
        url: 'https://example.com/article?fbclid=abc123&utm_campaign=share',
        title: 'Article',
        windowId: 1
      }
    ];

    const windows = [{ id: 1, focused: true }];

    const rules = [{
      id: 'test-duplicates',
      name: 'Close Duplicates',
      enabled: true,
      conditions: {},
      then: [{ action: 'close-duplicates', keep: 'oldest' }]
    }];

    const context = mockContext(tabs, windows);
    await runRules(rules, context);

    // Should close 2 tabs (same article, different tracking params)
    expect(closedTabs.length).toBe(2);
    expect(closedTabs.sort()).toEqual([2, 3]);
  });

  it('should NOT close different Amazon product pages as duplicates', async () => {
    const tabs = [
      {
        id: 1,
        url: 'https://www.amazon.com/dp/B001',
        title: 'Product 1',
        windowId: 1
      },
      {
        id: 2,
        url: 'https://www.amazon.com/dp/B002',
        title: 'Product 2',
        windowId: 1
      }
    ];

    const windows = [{ id: 1, focused: true }];

    const rules = [{
      id: 'test-duplicates',
      name: 'Close Duplicates',
      enabled: true,
      conditions: {},
      then: [{ action: 'close-duplicates', keep: 'oldest' }]
    }];

    const context = mockContext(tabs, windows);
    await runRules(rules, context);

    // Should close 0 tabs - different products
    expect(closedTabs.length).toBe(0);
  });

  it('should close same Amazon search with affiliate tracking as duplicates', async () => {
    const tabs = [
      {
        id: 1,
        url: 'https://www.amazon.com/s?k=laptop',
        title: 'Amazon - laptop',
        windowId: 1
      },
      {
        id: 2,
        url: 'https://www.amazon.com/s?k=laptop&tag=affiliate123',
        title: 'Amazon - laptop',
        windowId: 1
      }
    ];

    const windows = [{ id: 1, focused: true }];

    const rules = [{
      id: 'test-duplicates',
      name: 'Close Duplicates',
      enabled: true,
      conditions: {},
      then: [{ action: 'close-duplicates', keep: 'oldest' }]
    }];

    const context = mockContext(tabs, windows);
    await runRules(rules, context);

    // Should close 1 tab - same search, affiliate tracking removed
    expect(closedTabs.length).toBe(1);
    expect(closedTabs).toEqual([2]);
  });
});
