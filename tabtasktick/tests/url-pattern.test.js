describe('URL Pattern Matching', () => {
  describe('isUrlPatternMatch', () => {
    test('should match exact patterns', () => {
      const tab = { url: 'https://example.com/page' };
      const conditions = { pattern: 'example.com' };
      
      expect(isUrlPatternMatch(tab, conditions)).toBe(true);
    });
    
    test('should match with wildcards', () => {
      const tab = { url: 'https://docs.google.com/document/d/123/edit' };
      
      expect(isUrlPatternMatch(tab, { pattern: '*.google.com' })).toBe(true);
      expect(isUrlPatternMatch(tab, { pattern: '*google.com*' })).toBe(true);
      expect(isUrlPatternMatch(tab, { pattern: 'docs.google.com/*/edit' })).toBe(true);
    });
    
    test('should handle regex patterns', () => {
      const tab = { url: 'https://github.com/user/repo' };
      
      // Regex pattern to match GitHub repos
      expect(isUrlPatternMatch(tab, { pattern: '^https://github\\.com/[^/]+/[^/]+$' })).toBe(true);
      
      // Should not match GitHub issues
      const issueTab = { url: 'https://github.com/user/repo/issues/123' };
      expect(isUrlPatternMatch(issueTab, { pattern: '^https://github\\.com/[^/]+/[^/]+$' })).toBe(false);
    });
    
    test('should handle special characters in patterns', () => {
      const tab = { url: 'https://example.com/path?query=value' };
      
      expect(isUrlPatternMatch(tab, { pattern: '*?query=*' })).toBe(true);
      expect(isUrlPatternMatch(tab, { pattern: 'example.com/path?' })).toBe(true);
    });
    
    test('should handle chrome:// URLs', () => {
      const tab = { url: 'chrome://extensions/' };
      
      expect(isUrlPatternMatch(tab, { pattern: 'chrome://*' })).toBe(true);
      expect(isUrlPatternMatch(tab, { pattern: 'chrome://extensions*' })).toBe(true);
    });
    
    test('should be case insensitive', () => {
      const tab = { url: 'https://EXAMPLE.COM/PAGE' };
      
      expect(isUrlPatternMatch(tab, { pattern: 'example.com' })).toBe(true);
      expect(isUrlPatternMatch(tab, { pattern: 'EXAMPLE.COM' })).toBe(true);
    });
  });
  
  describe('URL pattern edge cases', () => {
    test('should handle empty pattern', () => {
      const tab = { url: 'https://example.com' };
      
      expect(isUrlPatternMatch(tab, { pattern: '' })).toBe(false);
      expect(isUrlPatternMatch(tab, {})).toBe(false);
    });
    
    test('should handle invalid URLs', () => {
      const tab = { url: 'not a valid url' };
      
      expect(() => isUrlPatternMatch(tab, { pattern: '*' })).not.toThrow();
    });
    
    test('should handle null/undefined values', () => {
      expect(isUrlPatternMatch({ url: null }, { pattern: '*' })).toBe(false);
      expect(isUrlPatternMatch({ url: undefined }, { pattern: '*' })).toBe(false);
      expect(isUrlPatternMatch({}, { pattern: '*' })).toBe(false);
    });
  });
});

// Implementation for testing
function isUrlPatternMatch(tab, conditions) {
  if (!tab.url || !conditions.pattern) {
    return false;
  }
  
  const pattern = conditions.pattern.toLowerCase();
  const url = tab.url.toLowerCase();
  
  // Check if it's a regex pattern (starts with ^)
  if (pattern.startsWith('^')) {
    try {
      const regex = new RegExp(pattern, 'i');
      return regex.test(tab.url);
    } catch (e) {
      return false;
    }
  }
  
  // Convert wildcard pattern to regex
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars except *
    .replace(/\*/g, '.*'); // Convert * to .*
  
  const regex = new RegExp(regexPattern, 'i');
  return regex.test(url);
}