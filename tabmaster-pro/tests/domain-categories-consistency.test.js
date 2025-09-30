/**
 * Test for Issue #3: DOMAIN_CATEGORIES consistency check
 * Verifies that all categories used in CATEGORIZED_DOMAINS exist in DOMAIN_CATEGORIES
 */

import { DOMAIN_CATEGORIES, CATEGORIZED_DOMAINS } from '../lib/domain-categories.js';

describe('Issue #3: Domain Categories Consistency', () => {
  test('All categories used in CATEGORIZED_DOMAINS should exist in DOMAIN_CATEGORIES', () => {
    // Extract all unique categories from CATEGORIZED_DOMAINS
    const usedCategories = new Set();

    CATEGORIZED_DOMAINS.forEach(domain => {
      if (domain.categories && Array.isArray(domain.categories)) {
        domain.categories.forEach(cat => usedCategories.add(cat));
      }
    });

    // Check that each used category exists in DOMAIN_CATEGORIES
    usedCategories.forEach(category => {
      expect(DOMAIN_CATEGORIES).toHaveProperty(category);
    });
  });

  test('DOMAIN_CATEGORIES should include search category', () => {
    expect(DOMAIN_CATEGORIES).toHaveProperty('search');
    expect(DOMAIN_CATEGORIES.search.name).toBe('Search & Discovery');
  });

  test('No undefined or invalid categories should be used', () => {
    const validCategories = Object.keys(DOMAIN_CATEGORIES);
    const invalidDomains = [];

    CATEGORIZED_DOMAINS.forEach(domain => {
      if (domain.categories && Array.isArray(domain.categories)) {
        domain.categories.forEach(cat => {
          if (!validCategories.includes(cat)) {
            invalidDomains.push({ domain: domain.domain, invalidCategory: cat });
          }
        });
      }
    });

    expect(invalidDomains).toEqual([]);
  });

  test('All DOMAIN_CATEGORIES entries should have required fields', () => {
    Object.entries(DOMAIN_CATEGORIES).forEach(([key, value]) => {
      expect(value).toHaveProperty('name');
      expect(value).toHaveProperty('description');
      expect(value).toHaveProperty('color');

      expect(typeof value.name).toBe('string');
      expect(typeof value.description).toBe('string');
      expect(typeof value.color).toBe('string');

      expect(value.name.length).toBeGreaterThan(0);
      expect(value.description.length).toBeGreaterThan(0);
      expect(value.color).toMatch(/^#[0-9A-F]{6}$/i);
    });
  });

  test('CATEGORIZED_DOMAINS should have valid structure', () => {
    CATEGORIZED_DOMAINS.forEach(domain => {
      expect(domain).toHaveProperty('domain');
      expect(domain).toHaveProperty('categories');
      expect(typeof domain.domain).toBe('string');
      expect(Array.isArray(domain.categories)).toBe(true);
      expect(domain.categories.length).toBeGreaterThan(0);
    });
  });

  test('No duplicate category keys should exist', () => {
    const keys = Object.keys(DOMAIN_CATEGORIES);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });

  test('Category count should match (21 total including search)', () => {
    const categoryCount = Object.keys(DOMAIN_CATEGORIES).length;
    expect(categoryCount).toBe(21);
  });
});