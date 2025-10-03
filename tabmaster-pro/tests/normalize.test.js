// Tests for normalize.js - URL normalization and deduplication

import { jest, describe, it, expect } from '@jest/globals';
import { normalizeUrl, extractDomain, generateDupeKey, areDuplicates } from '../lib/normalize.js';

describe('normalizeUrl', () => {
  describe('basic normalization', () => {
    it('should remove hash fragments', () => {
      expect(normalizeUrl('https://example.com/page#section')).toBe('https://example.com/page');
      expect(normalizeUrl('https://example.com/#')).toBe('https://example.com/');
    });

    it('should remove common tracking parameters', () => {
      expect(normalizeUrl('https://example.com?utm_source=google&utm_medium=cpc'))
        .toBe('https://example.com/');
      expect(normalizeUrl('https://example.com?ref=twitter&fbclid=123'))
        .toBe('https://example.com/');
      expect(normalizeUrl('https://example.com?page=1&utm_campaign=sale&sort=asc'))
        .toBe('https://example.com/?page=1&sort=asc');
    });

    it('should sort query parameters alphabetically', () => {
      expect(normalizeUrl('https://example.com?z=3&a=1&m=2'))
        .toBe('https://example.com/?a=1&m=2&z=3');
      expect(normalizeUrl('https://example.com?category=books&sort=price&filter=new'))
        .toBe('https://example.com/?category=books&filter=new&sort=price');
    });

    it('should handle empty query strings', () => {
      expect(normalizeUrl('https://example.com?')).toBe('https://example.com/');
      expect(normalizeUrl('https://example.com/?')).toBe('https://example.com/');
    });

    it('should preserve important query parameters', () => {
      expect(normalizeUrl('https://youtube.com/watch?v=abc123'))
        .toBe('https://youtube.com/watch?v=abc123');
      expect(normalizeUrl('https://github.com/issues?q=is:open&utm_source=nav'))
        .toBe('https://github.com/issues?q=is%3Aopen');
    });
  });

  describe('edge cases', () => {
    it('should handle malformed URLs gracefully', () => {
      expect(normalizeUrl('not-a-url')).toBe('not-a-url');
      expect(normalizeUrl('')).toBe('');
      expect(normalizeUrl(null)).toBe(null);
      expect(normalizeUrl(undefined)).toBe(undefined);
    });

    it('should handle chrome:// URLs', () => {
      expect(normalizeUrl('chrome://extensions/')).toBe('chrome://extensions/');
      expect(normalizeUrl('chrome://settings/#privacy')).toBe('chrome://settings/');
    });

    it('should handle chrome-extension:// URLs', () => {
      const extUrl = 'chrome-extension://abc123/page.html';
      expect(normalizeUrl(extUrl)).toBe(extUrl);
    });

    it('should handle data: URLs', () => {
      const dataUrl = 'data:text/html,<h1>Test</h1>';
      expect(normalizeUrl(dataUrl)).toBe(dataUrl);
    });

    it('should handle file:// URLs', () => {
      expect(normalizeUrl('file:///home/user/doc.pdf#page=2'))
        .toBe('file:///home/user/doc.pdf');
    });

    it('should handle URLs with ports', () => {
      expect(normalizeUrl('http://localhost:3000/api?debug=true&utm_source=dev'))
        .toBe('http://localhost:3000/api?debug=true');
    });

    it('should handle internationalized domains', () => {
      expect(normalizeUrl('https://例え.jp/page#top'))
        .toBe('https://xn--r8jz45g.jp/page');
    });
  });

  describe('real-world examples', () => {
    it('should normalize GitHub URLs', () => {
      const gh1 = 'https://github.com/user/repo/issues/123#issuecomment-456';
      const gh2 = 'https://github.com/user/repo/issues/123?utm_source=notification';
      expect(normalizeUrl(gh1)).toBe('https://github.com/user/repo/issues/123');
      expect(normalizeUrl(gh2)).toBe('https://github.com/user/repo/issues/123');
    });

    it('should normalize Stack Overflow URLs', () => {
      const so1 = 'https://stackoverflow.com/questions/123/title#answer-456';
      const so2 = 'https://stackoverflow.com/questions/123/title?noredirect=1&lq=1';
      expect(normalizeUrl(so1)).toBe('https://stackoverflow.com/questions/123/title');
      expect(normalizeUrl(so2)).toBe('https://stackoverflow.com/questions/123/title?lq=1&noredirect=1');
    });

    it('should normalize social media URLs', () => {
      expect(normalizeUrl('https://twitter.com/user/status/123?s=20&t=abc'))
        .toBe('https://twitter.com/user/status/123');
      expect(normalizeUrl('https://facebook.com/photo.php?fbid=123&set=a.456&ref=share'))
        .toBe('https://facebook.com/photo.php?fbid=123&set=a.456');
    });
  });
});

describe('extractDomain', () => {
  it('should extract domain from valid URLs', () => {
    expect(extractDomain('https://www.example.com/page')).toBe('www.example.com');
    expect(extractDomain('http://subdomain.example.com')).toBe('subdomain.example.com');
    expect(extractDomain('https://example.com:8080')).toBe('example.com');
  });

  it('should handle URLs without protocol', () => {
    expect(extractDomain('example.com/page')).toBe('example.com');
    expect(extractDomain('www.example.com')).toBe('www.example.com');
  });

  it('should handle special URLs', () => {
    expect(extractDomain('chrome://extensions')).toBe('chrome://extensions');
    expect(extractDomain('file:///home/user/doc.pdf')).toBe('file://');
    expect(extractDomain('data:text/html,test')).toBe('data:');
  });

  it('should handle invalid inputs', () => {
    expect(extractDomain('')).toBe('unknown');
    expect(extractDomain(null)).toBe('unknown');
    expect(extractDomain(undefined)).toBe('unknown');
    expect(extractDomain('not a url at all')).toBe('unknown');
  });
});

describe('generateDupeKey', () => {
  it('should generate same key for duplicate URLs', () => {
    const url1 = 'https://example.com/page?a=1&b=2#section';
    const url2 = 'https://example.com/page?b=2&a=1&utm_source=test';
    expect(generateDupeKey(url1)).toBe(generateDupeKey(url2));
  });

  it('should generate different keys for different URLs', () => {
    const key1 = generateDupeKey('https://example.com/page1');
    const key2 = generateDupeKey('https://example.com/page2');
    expect(key1).not.toBe(key2);
  });

  it('should handle special characters in URLs', () => {
    const url = 'https://example.com/search?q=test+query&filter=a>b';
    const key = generateDupeKey(url);
    expect(key).toBeTruthy();
    expect(typeof key).toBe('string');
  });

  it('should be consistent', () => {
    const url = 'https://example.com/page?complex=params&test=true#hash';
    const key1 = generateDupeKey(url);
    const key2 = generateDupeKey(url);
    expect(key1).toBe(key2);
  });
});

describe('areDuplicates', () => {
  it('should identify exact duplicates', () => {
    const url = 'https://example.com/page';
    expect(areDuplicates(url, url)).toBe(true);
  });

  it('should identify duplicates with different fragments', () => {
    expect(areDuplicates(
      'https://example.com/page#section1',
      'https://example.com/page#section2'
    )).toBe(true);
  });

  it('should identify duplicates with different tracking params', () => {
    expect(areDuplicates(
      'https://example.com?utm_source=google',
      'https://example.com?utm_medium=email'
    )).toBe(true);
  });

  it('should identify duplicates with reordered params', () => {
    expect(areDuplicates(
      'https://example.com?a=1&b=2&c=3',
      'https://example.com?c=3&a=1&b=2'
    )).toBe(true);
  });

  it('should not identify different pages as duplicates', () => {
    expect(areDuplicates(
      'https://example.com/page1',
      'https://example.com/page2'
    )).toBe(false);
  });

  it('should not identify different domains as duplicates', () => {
    expect(areDuplicates(
      'https://example.com/page',
      'https://example.org/page'
    )).toBe(false);
  });

  it('should handle edge cases', () => {
    expect(areDuplicates('', '')).toBe(true);
    expect(areDuplicates(null, null)).toBe(true);
    expect(areDuplicates('https://example.com', null)).toBe(false);
  });

  describe('with tab objects', () => {
    it('should work with tab objects', () => {
      const tab1 = { url: 'https://example.com/page?utm_source=test#top' };
      const tab2 = { url: 'https://example.com/page?ref=nav' };
      expect(areDuplicates(tab1, tab2)).toBe(true);
    });

    it('should handle mixed inputs', () => {
      const tab = { url: 'https://example.com/page' };
      const url = 'https://example.com/page#section';
      expect(areDuplicates(tab, url)).toBe(true);
      expect(areDuplicates(url, tab)).toBe(true);
    });
  });
});