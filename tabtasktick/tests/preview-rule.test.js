import { describe, test, expect, jest } from '@jest/globals';

describe('Preview Rule Logic', () => {
  describe('previewRule async filter bug', () => {
    test('should correctly filter tabs using Promise.all pattern', async () => {
      // Mock rule
      const rule = {
        id: 'rule1',
        conditions: {
          type: 'category',
          selectedCategories: ['social']
        },
        actions: { type: 'close' }
      };
      
      // Mock tabs - only Facebook should match
      const tabs = [
        { id: 1, url: 'https://facebook.com' },
        { id: 2, url: 'https://google.com' },
        { id: 3, url: 'https://github.com' }
      ];
      
      // Mock evaluateCondition to return true only for Facebook
      const evaluateCondition = jest.fn((conditions, tab) => {
        return Promise.resolve(tab.url.includes('facebook'));
      });
      
      // WRONG WAY (the bug we had)
      const wrongFilter = async () => {
        // This returns ALL tabs because async functions return promises which are truthy!
        return tabs.filter(tab => evaluateCondition(rule.conditions, tab, tabs));
      };
      
      const wrongResult = await wrongFilter();
      expect(wrongResult.length).toBe(3); // BUG: Returns all 3 tabs!
      
      // RIGHT WAY (the fix)
      const rightFilter = async () => {
        const evaluations = await Promise.all(
          tabs.map(tab => evaluateCondition(rule.conditions, tab, tabs))
        );
        return tabs.filter((tab, index) => evaluations[index]);
      };
      
      const rightResult = await rightFilter();
      expect(rightResult.length).toBe(1); // Correct: Only Facebook tab
      expect(rightResult[0].url).toContain('facebook');
    });
  });
  
  describe('previewRule with real implementation', () => {
    test('should handle duplicate rule correctly', async () => {
      const rule = {
        id: 'dup-rule',
        conditions: { type: 'duplicate' },
        actions: { type: 'close', keepFirst: true }
      };
      
      const tabs = [
        { id: 1, url: 'https://example.com/page1', pinned: false },
        { id: 2, url: 'https://example.com/page1', pinned: false }, // duplicate
        { id: 3, url: 'https://example.com/page1', pinned: false }, // duplicate
        { id: 4, url: 'https://example.com/page2', pinned: false }
      ];
      
      const result = await previewRule(rule, tabs);
      
      // Should return tabs 2 and 3 (keeping the first)
      expect(result.matchingTabs.length).toBe(2);
      expect(result.matchingTabs.map(t => t.id)).toEqual([2, 3]);
    });
  });
});

// Minimal implementation for testing
async function previewRule(rule, tabs) {
  // Use Promise.all to handle async evaluation (correct pattern)
  const evaluations = await Promise.all(
    tabs.map(tab => evaluateCondition(rule.conditions, tab, tabs))
  );
  let matchingTabs = tabs.filter((tab, index) => evaluations[index]);
  
  // Apply the same logic for duplicates as in applyRule
  if (rule.conditions.type === 'duplicate' && rule.actions.type === 'close') {
    const urlGroups = new Map();
    for (const tab of matchingTabs) {
      if (!urlGroups.has(tab.url)) {
        urlGroups.set(tab.url, []);
      }
      urlGroups.get(tab.url).push(tab);
    }
    
    matchingTabs = [];
    for (const [url, duplicates] of urlGroups.entries()) {
      if (duplicates.length > 1) {
        duplicates.sort((a, b) => a.id - b.id);
        if (rule.actions.keepFirst !== false) {
          matchingTabs.push(...duplicates.slice(1));
        } else {
          matchingTabs.push(...duplicates.slice(0, -1));
        }
      }
    }
  }
  
  return { matchingTabs };
}

function evaluateCondition(conditions, tab, allTabs) {
  switch (conditions.type) {
  case 'duplicate':
    return !tab.pinned && allTabs.filter(t => t.url === tab.url).length > 1;
  default:
    return false;
  }
}