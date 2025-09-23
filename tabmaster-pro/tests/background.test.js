// Tests for background.js functions
// We'll need to extract functions to make them testable

describe('Domain Grouping Logic', () => {
  describe('shouldGroupByDomain', () => {
    const mockTabs = [
      { id: 1, url: 'https://docs.google.com/doc1', groupId: -1 },
      { id: 2, url: 'https://docs.google.com/doc2', groupId: -1 },
      { id: 3, url: 'https://docs.google.com/doc3', groupId: -1 },
      { id: 4, url: 'https://github.com/repo1', groupId: 100 },
      { id: 5, url: 'https://github.com/repo2', groupId: 100 },
      { id: 6, url: 'https://github.com/repo3', groupId: -1 }
    ];

    test('should return true when enough ungrouped tabs from same domain', () => {
      const result = shouldGroupByDomain(mockTabs[0], mockTabs, 3);
      expect(result).toBe(true);
    });

    test('should return false when tab is already grouped', () => {
      const result = shouldGroupByDomain(mockTabs[3], mockTabs, 2);
      expect(result).toBe(false);
    });

    test('should return true for ungrouped tab when existing group exists', () => {
      const result = shouldGroupByDomain(mockTabs[5], mockTabs, 2);
      expect(result).toBe(true);
    });

    test('should handle groupId = -1 as ungrouped', () => {
      const tab = { id: 7, url: 'https://example.com', groupId: -1 };
      const tabs = [tab];
      const result = shouldGroupByDomain(tab, tabs, 1);
      expect(result).toBe(true);
    });

    test('should handle groupId = 0 as ungrouped', () => {
      const tab = { id: 8, url: 'https://example.com', groupId: 0 };
      const tabs = [tab];
      const result = shouldGroupByDomain(tab, tabs, 1);
      expect(result).toBe(true);
    });

    test('should handle invalid URLs gracefully', () => {
      const tab = { id: 9, url: 'chrome://newtab', groupId: -1 };
      const tabs = [tab];
      expect(() => shouldGroupByDomain(tab, tabs, 1)).not.toThrow();
    });
  });
});

describe('Category Matching Logic', () => {
  describe('evaluateCondition with category type', () => {
    beforeEach(() => {
      // Mock the domain categories
      global.DOMAIN_CATEGORIES_MAP = {
        'facebook.com': ['social'],
        'instagram.com': ['social'],
        'google.com': ['productivity_tools', 'search'],
        'docs.google.com': ['productivity_tools']
      };
    });

    test('should match tabs with correct category', async () => {
      const condition = {
        type: 'category',
        selectedCategories: ['social']
      };
      
      const socialTab = { id: 1, url: 'https://facebook.com/page' };
      const result = await evaluateCondition(condition, socialTab, []);
      expect(result).toBe(true);
    });

    test('should not match tabs with wrong category', async () => {
      const condition = {
        type: 'category',
        selectedCategories: ['social']
      };
      
      const productivityTab = { id: 2, url: 'https://docs.google.com/doc' };
      const result = await evaluateCondition(condition, productivityTab, []);
      expect(result).toBe(false);
    });

    test('should handle multiple categories correctly', async () => {
      const condition = {
        type: 'category',
        selectedCategories: ['productivity_tools', 'search']
      };
      
      const googleTab = { id: 3, url: 'https://google.com' };
      const result = await evaluateCondition(condition, googleTab, []);
      expect(result).toBe(true);
    });

    test('should handle domains not in category map', async () => {
      const condition = {
        type: 'category',
        selectedCategories: ['social']
      };
      
      const unknownTab = { id: 4, url: 'https://unknown-site.com' };
      const result = await evaluateCondition(condition, unknownTab, []);
      expect(result).toBe(false);
    });
  });
});

describe('Async Filter Bug', () => {
  test('filter with async function should use Promise.all pattern', async () => {
    const tabs = [
      { id: 1, url: 'https://example.com' },
      { id: 2, url: 'https://test.com' }
    ];
    
    // This is WRONG - all promises are truthy
    const wrongWay = tabs.filter(async tab => false);
    expect(wrongWay.length).toBe(2); // BUG: Should be 0!
    
    // This is CORRECT
    const evaluations = await Promise.all(
      tabs.map(async tab => false)
    );
    const rightWay = tabs.filter((tab, index) => evaluations[index]);
    expect(rightWay.length).toBe(0);
  });
});

// Helper function exports for testing (these would need to be exported from background.js)
function shouldGroupByDomain(tab, allTabs, minCount) {
  try {
    const domain = new URL(tab.url).hostname;
    
    // Find all tabs with the same domain
    const sameDomainTabs = allTabs.filter(t => {
      try {
        return new URL(t.url).hostname === domain;
      } catch (e) {
        return false;
      }
    });
    
    // Find existing groups for this domain
    const existingGroups = new Map();
    sameDomainTabs.forEach(t => {
      if (t.groupId && t.groupId !== -1) {
        if (!existingGroups.has(t.groupId)) {
          existingGroups.set(t.groupId, []);
        }
        existingGroups.get(t.groupId).push(t);
      }
    });
    
    // Count ungrouped tabs
    const ungroupedTabs = sameDomainTabs.filter(t => !t.groupId || t.groupId === -1);
    
    // Case 1: Tab is already grouped - don't match
    if (tab.groupId && tab.groupId !== -1) {
      return false;
    }
    
    // Case 2: There's an existing group we can add to
    if (existingGroups.size > 0) {
      return true;
    }
    
    // Case 3: Enough ungrouped tabs to create a new group
    if (ungroupedTabs.length >= minCount) {
      return true;
    }
    
    return false;
  } catch (e) {
    return false;
  }
}

async function evaluateCondition(conditions, tab, allTabs) {
  let matches = false;
  
  switch (conditions.type) {
    case 'domain_count':
      matches = shouldGroupByDomain(tab, allTabs, conditions.minCount);
      break;
    
    case 'category':
      matches = await isCategoryMatch(tab, conditions);
      break;
      
    default:
      return false;
  }
  
  return matches;
}

async function isCategoryMatch(tab, conditions) {
  if (!conditions.selectedCategories || conditions.selectedCategories.length === 0) {
    return false;
  }
  
  try {
    const url = new URL(tab.url);
    let domain = url.hostname.replace(/^www\./, '');
    
    // Check direct domain match
    const categories = global.DOMAIN_CATEGORIES_MAP[domain] || [];
    
    // Check if any of the tab's categories match the selected categories
    return categories.some(cat => conditions.selectedCategories.includes(cat));
  } catch (e) {
    return false;
  }
}