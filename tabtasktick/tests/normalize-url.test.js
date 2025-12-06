import { normalizeUrl } from '../dashboard/modules/core/utils.js';

describe('normalizeUrl', () => {
  test('removes query parameters', () => {
    expect(normalizeUrl('https://example.com/page?param1=value1&param2=value2'))
      .toBe('https://example.com/page');
  });

  test('removes hash fragments', () => {
    expect(normalizeUrl('https://example.com/page#section'))
      .toBe('https://example.com/page');
  });

  test('removes both query parameters and hash fragments', () => {
    expect(normalizeUrl('https://example.com/page?param=value#section'))
      .toBe('https://example.com/page');
  });

  test('preserves protocol and host', () => {
    expect(normalizeUrl('https://subdomain.example.com/page'))
      .toBe('https://subdomain.example.com/page');
  });

  test('preserves path structure', () => {
    expect(normalizeUrl('https://example.com/path/to/page?query=value'))
      .toBe('https://example.com/path/to/page');
  });

  test('handles URLs with ports', () => {
    expect(normalizeUrl('https://example.com:8080/page?query=value'))
      .toBe('https://example.com:8080/page');
  });

  test('handles invalid URLs gracefully', () => {
    expect(normalizeUrl('not-a-valid-url')).toBe('not-a-valid-url');
  });

  test('handles empty strings', () => {
    expect(normalizeUrl('')).toBe('');
  });

  test('handles URLs with complex query strings', () => {
    expect(normalizeUrl('https://example.com/search?q=test+query&filter[category]=tech&sort=desc#results'))
      .toBe('https://example.com/search');
  });

  test('identifies duplicates correctly', () => {
    const url1 = 'https://example.com/page?utm_source=google';
    const url2 = 'https://example.com/page?utm_source=facebook';
    const url3 = 'https://example.com/page#section1';
    const url4 = 'https://example.com/page';
    
    expect(normalizeUrl(url1)).toBe(normalizeUrl(url2));
    expect(normalizeUrl(url1)).toBe(normalizeUrl(url3));
    expect(normalizeUrl(url1)).toBe(normalizeUrl(url4));
  });
});