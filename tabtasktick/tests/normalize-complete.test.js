// Complete tests for normalize.js - including findDuplicates and extractOrigin

import { describe, it, expect } from '@jest/globals';
import {
  normalizeUrl,
  extractDomain,
  generateDupeKey,
  areDuplicates,
  findDuplicates,
  extractOrigin
} from '../services/selection/selectTabs.js';

describe('findDuplicates', () => {
  it('should find duplicate tabs', () => {
    const tabs = [
      { id: 1, url: 'https://example.com/page' },
      { id: 2, url: 'https://example.com/page#section' },
      { id: 3, url: 'https://different.com' },
      { id: 4, url: 'https://example.com/page?utm_source=test' }
    ];
    
    const dupes = findDuplicates(tabs);
    
    expect(dupes.size).toBe(1);
    const dupeGroup = dupes.get('https://example.com/page');
    expect(dupeGroup).toBeDefined();
    expect(dupeGroup.length).toBe(3);
    expect(dupeGroup.map(t => t.id).sort()).toEqual([1, 2, 4]);
  });

  it('should handle empty array', () => {
    const dupes = findDuplicates([]);
    expect(dupes.size).toBe(0);
  });

  it('should handle no duplicates', () => {
    const tabs = [
      { id: 1, url: 'https://example.com/page1' },
      { id: 2, url: 'https://example.com/page2' },
      { id: 3, url: 'https://different.com' }
    ];
    
    const dupes = findDuplicates(tabs);
    expect(dupes.size).toBe(0);
  });

  it('should handle tabs without urls', () => {
    const tabs = [
      { id: 1, url: 'https://example.com' },
      { id: 2 }, // no url
      { id: 3, url: 'https://example.com' }
    ];
    
    const dupes = findDuplicates(tabs);
    expect(dupes.size).toBe(1);
    expect(dupes.get('https://example.com/').length).toBe(2);
  });
});

describe('extractOrigin', () => {
  it('should extract known origins', () => {
    expect(extractOrigin('https://mail.google.com/mail')).toBe('gmail');
    expect(extractOrigin('https://google.com/search?q=test')).toBe('search');
    expect(extractOrigin('https://reddit.com/r/programming')).toBe('reddit');
    expect(extractOrigin('https://twitter.com/home')).toBe('twitter');
    expect(extractOrigin('https://x.com/home')).toBe('twitter');
    expect(extractOrigin('https://facebook.com')).toBe('facebook');
    expect(extractOrigin('https://linkedin.com/in/someone')).toBe('linkedin');
    expect(extractOrigin('https://slack.com/workspace')).toBe('slack');
  });

  it('should return domain for unknown origins', () => {
    expect(extractOrigin('https://example.com')).toBe('example.com');
    expect(extractOrigin('https://subdomain.example.com')).toBe('subdomain.example.com');
  });

  it('should handle search engines', () => {
    expect(extractOrigin('https://www.google.com/search?q=test')).toBe('search');
    expect(extractOrigin('https://www.bing.com/search?q=test')).toBe('search');
    expect(extractOrigin('https://duckduckgo.com/?q=test')).toBe('search');
  });

  it('should handle edge cases', () => {
    expect(extractOrigin('')).toBe('direct');
    expect(extractOrigin(null)).toBe('direct');
    expect(extractOrigin(undefined)).toBe('direct');
    // extractDomain returns 'not-a-url' for invalid URLs, which is then used as origin
    expect(extractOrigin('not-a-url')).toBe('not-a-url');
  });

  it('should handle special URLs', () => {
    expect(extractOrigin('chrome://extensions')).toBe('direct');
    expect(extractOrigin('file:///home/user/doc.pdf')).toBe('direct');
  });
});