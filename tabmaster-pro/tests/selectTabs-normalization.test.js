// Tests for selectTabs.js normalizeUrlForDuplicates
// Ensures YouTube videos, Google searches, etc. aren't incorrectly marked as duplicates

import { describe, it, expect } from '@jest/globals';
import { normalizeUrlForDuplicates } from '../services/selection/selectTabs.js';

describe('normalizeUrlForDuplicates - Preserved Parameters', () => {
  describe('YouTube videos', () => {
    it('should NOT treat different YouTube videos as duplicates', () => {
      const video1 = 'https://www.youtube.com/watch?v=abc123';
      const video2 = 'https://www.youtube.com/watch?v=xyz789';

      const norm1 = normalizeUrlForDuplicates(video1);
      const norm2 = normalizeUrlForDuplicates(video2);

      expect(norm1).not.toBe(norm2);
      expect(norm1).toContain('v=abc123');
      expect(norm2).toContain('v=xyz789');
    });

    it('should treat same YouTube video with different tracking params as duplicates', () => {
      const withTracking = 'https://www.youtube.com/watch?v=abc123&utm_source=twitter&fbclid=xyz';
      const withoutTracking = 'https://www.youtube.com/watch?v=abc123';

      const norm1 = normalizeUrlForDuplicates(withTracking);
      const norm2 = normalizeUrlForDuplicates(withoutTracking);

      expect(norm1).toBe(norm2);
      expect(norm1).toContain('v=abc123');
      expect(norm1).not.toContain('utm_source');
      expect(norm1).not.toContain('fbclid');
    });

    it('should preserve YouTube playlist parameter', () => {
      const playlist = 'https://www.youtube.com/watch?v=abc123&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf';

      const normalized = normalizeUrlForDuplicates(playlist);

      expect(normalized).toContain('v=abc123');
      expect(normalized).toContain('list=');
    });

    it('should preserve YouTube timestamp parameter', () => {
      const withTimestamp = 'https://www.youtube.com/watch?v=abc123&t=123';

      const normalized = normalizeUrlForDuplicates(withTimestamp);

      expect(normalized).toContain('v=abc123');
      expect(normalized).toContain('t=123');
    });

    it('should handle youtu.be short URLs', () => {
      const short1 = 'https://youtu.be/abc123?t=60';
      const short2 = 'https://youtu.be/xyz789?t=60';

      const norm1 = normalizeUrlForDuplicates(short1);
      const norm2 = normalizeUrlForDuplicates(short2);

      // Different videos even with same timestamp
      expect(norm1).not.toBe(norm2);
      expect(norm1).toContain('abc123');
      expect(norm2).toContain('xyz789');
    });
  });

  describe('Google searches', () => {
    it('should NOT treat different Google searches as duplicates', () => {
      const search1 = 'https://www.google.com/search?q=cats';
      const search2 = 'https://www.google.com/search?q=dogs';

      const norm1 = normalizeUrlForDuplicates(search1);
      const norm2 = normalizeUrlForDuplicates(search2);

      expect(norm1).not.toBe(norm2);
      expect(norm1).toContain('q=cats');
      expect(norm2).toContain('q=dogs');
    });

    it('should treat same search with different tracking params as duplicates', () => {
      const withTracking = 'https://www.google.com/search?q=cats&utm_source=nav&gclid=abc123';
      const withoutTracking = 'https://www.google.com/search?q=cats';

      const norm1 = normalizeUrlForDuplicates(withTracking);
      const norm2 = normalizeUrlForDuplicates(withoutTracking);

      expect(norm1).toBe(norm2);
      expect(norm1).toContain('q=cats');
      expect(norm1).not.toContain('utm_source');
      expect(norm1).not.toContain('gclid');
    });

    it('should preserve Google search type parameters', () => {
      const imageSearch = 'https://www.google.com/search?q=cats&tbm=isch';

      const normalized = normalizeUrlForDuplicates(imageSearch);

      expect(normalized).toContain('q=cats');
      expect(normalized).toContain('tbm=isch');
    });
  });

  describe('GitHub searches', () => {
    it('should NOT treat different GitHub searches as duplicates', () => {
      const search1 = 'https://github.com/search?q=react&type=repositories';
      const search2 = 'https://github.com/search?q=vue&type=repositories';

      const norm1 = normalizeUrlForDuplicates(search1);
      const norm2 = normalizeUrlForDuplicates(search2);

      expect(norm1).not.toBe(norm2);
      expect(norm1).toContain('q=react');
      expect(norm2).toContain('q=vue');
    });

    it('should preserve GitHub type and language parameters', () => {
      const search = 'https://github.com/search?q=machine+learning&type=repositories&language=python';

      const normalized = normalizeUrlForDuplicates(search);

      expect(normalized).toContain('q=');
      expect(normalized).toContain('type=repositories');
      expect(normalized).toContain('language=python');
    });
  });

  describe('Amazon searches', () => {
    it('should NOT treat different Amazon searches as duplicates', () => {
      const search1 = 'https://www.amazon.com/s?k=laptop';
      const search2 = 'https://www.amazon.com/s?k=headphones';

      const norm1 = normalizeUrlForDuplicates(search1);
      const norm2 = normalizeUrlForDuplicates(search2);

      expect(norm1).not.toBe(norm2);
      expect(norm1).toContain('k=laptop');
      expect(norm2).toContain('k=headphones');
    });

    it('should treat same search with different tracking params as duplicates', () => {
      const withTracking = 'https://www.amazon.com/s?k=laptop&ref=nav_search&tag=affiliate123';
      const withoutTracking = 'https://www.amazon.com/s?k=laptop';

      const norm1 = normalizeUrlForDuplicates(withTracking);
      const norm2 = normalizeUrlForDuplicates(withoutTracking);

      expect(norm1).toBe(norm2);
      expect(norm1).toContain('k=laptop');
      expect(norm1).not.toContain('ref=');
      expect(norm1).not.toContain('tag=');
    });
  });

  describe('Stack Overflow searches', () => {
    it('should NOT treat different Stack Overflow searches as duplicates', () => {
      const search1 = 'https://stackoverflow.com/search?q=javascript+promises';
      const search2 = 'https://stackoverflow.com/search?q=javascript+async';

      const norm1 = normalizeUrlForDuplicates(search1);
      const norm2 = normalizeUrlForDuplicates(search2);

      expect(norm1).not.toBe(norm2);
      expect(norm1).toContain('q=javascript');
      expect(norm2).toContain('q=javascript');
    });
  });

  describe('Generic URLs', () => {
    it('should treat same URL with different tracking params as duplicates', () => {
      const withTracking = 'https://example.com/article?utm_source=twitter&utm_campaign=promo&fbclid=123';
      const withoutTracking = 'https://example.com/article';

      const norm1 = normalizeUrlForDuplicates(withTracking);
      const norm2 = normalizeUrlForDuplicates(withoutTracking);

      expect(norm1).toBe(norm2);
      expect(norm1).not.toContain('utm_');
      expect(norm1).not.toContain('fbclid');
    });

    it('should treat generic URLs with params as same page (whitelist approach)', () => {
      const page1 = 'https://example.com/products?category=electronics&sort=price';
      const page2 = 'https://example.com/products?category=books&sort=price';

      const norm1 = normalizeUrlForDuplicates(page1);
      const norm2 = normalizeUrlForDuplicates(page2);

      // Whitelist approach: example.com not on whitelist, so ALL params removed
      // These are treated as same page (duplicates)
      expect(norm1).toBe(norm2);
      expect(norm1).toBe('https://example.com/products');
    });

    it('should preserve whitelisted params and sort them consistently', () => {
      // YouTube has whitelisted params (v, list, t)
      const url1 = 'https://youtube.com/watch?t=10&v=abc&list=xyz';
      const url2 = 'https://youtube.com/watch?v=abc&list=xyz&t=10';

      const norm1 = normalizeUrlForDuplicates(url1);
      const norm2 = normalizeUrlForDuplicates(url2);

      // Should be identical after sorting
      expect(norm1).toBe(norm2);
      expect(norm1).toBe('https://youtube.com/watch?list=xyz&t=10&v=abc');
    });

    it('should remove hash fragments', () => {
      const url1 = 'https://example.com/article#section1';
      const url2 = 'https://example.com/article#section2';

      const norm1 = normalizeUrlForDuplicates(url1);
      const norm2 = normalizeUrlForDuplicates(url2);

      expect(norm1).toBe(norm2);
      expect(norm1).not.toContain('#');
    });

    it('should handle trailing slashes consistently', () => {
      const withSlash = 'https://example.com/page/';
      const withoutSlash = 'https://example.com/page';

      const norm1 = normalizeUrlForDuplicates(withSlash);
      const norm2 = normalizeUrlForDuplicates(withoutSlash);

      expect(norm1).toBe(norm2);
    });
  });

  describe('Edge cases', () => {
    it('should handle chrome:// URLs', () => {
      const url1 = 'chrome://extensions/#details';
      const url2 = 'chrome://extensions/';

      const norm1 = normalizeUrlForDuplicates(url1);
      const norm2 = normalizeUrlForDuplicates(url2);

      expect(norm1).toBe(norm2);
      expect(norm1).not.toContain('#');
    });

    it('should handle null and undefined', () => {
      expect(normalizeUrlForDuplicates(null)).toBe('');
      expect(normalizeUrlForDuplicates(undefined)).toBe('');
      expect(normalizeUrlForDuplicates('')).toBe('');
    });

    it('should handle malformed URLs gracefully', () => {
      const malformed = 'not-a-url';
      const normalized = normalizeUrlForDuplicates(malformed);

      expect(normalized).toBe('not-a-url');
    });
  });
});

describe('normalizeUrlForDuplicates - Real-world scenarios', () => {
  it('should handle YouTube video shared from different sources', () => {
    const fromTwitter = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=twitter&fbclid=abc';
    const fromFacebook = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&fbclid=xyz&utm_campaign=share';
    const direct = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

    const norm1 = normalizeUrlForDuplicates(fromTwitter);
    const norm2 = normalizeUrlForDuplicates(fromFacebook);
    const norm3 = normalizeUrlForDuplicates(direct);

    // All should normalize to the same URL (same video)
    expect(norm1).toBe(norm2);
    expect(norm2).toBe(norm3);
    expect(norm1).toContain('v=dQw4w9WgXcQ'); // Case preserved in query params
  });

  it('should handle Google search with multiple tracking params', () => {
    const withTracking = 'https://www.google.com/search?q=javascript&utm_source=homepage&gclid=abc123&_ga=xyz&_gid=123';
    const clean = 'https://www.google.com/search?q=javascript';

    const norm1 = normalizeUrlForDuplicates(withTracking);
    const norm2 = normalizeUrlForDuplicates(clean);

    expect(norm1).toBe(norm2);
    expect(norm1).toContain('q=javascript');
    expect(norm1).not.toContain('utm_');
    expect(norm1).not.toContain('gclid');
    expect(norm1).not.toContain('_ga');
  });

  it('should handle GitHub issue with ref parameter', () => {
    const withRef = 'https://github.com/facebook/react/issues/12345?ref=notification';
    const withoutRef = 'https://github.com/facebook/react/issues/12345';

    const norm1 = normalizeUrlForDuplicates(withRef);
    const norm2 = normalizeUrlForDuplicates(withoutRef);

    // ref is a tracking param, should be removed
    expect(norm1).toBe(norm2);
    expect(norm1).not.toContain('ref=');
  });
});
