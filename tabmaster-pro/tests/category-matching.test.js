/**
 * Test for Issue #2: Categories in rule conditions should match domain-categories.js
 * Verifies that all categories from DOMAIN_CATEGORIES are available in conditions builder
 */

import { DOMAIN_CATEGORIES } from '../lib/domain-categories.js';

describe('Issue #2: Category Matching', () => {
  test('DOMAIN_CATEGORIES should include video category', () => {
    expect(DOMAIN_CATEGORIES).toHaveProperty('video');
    expect(DOMAIN_CATEGORIES.video.name).toBe('Streaming & Video');
  });

  test('DOMAIN_CATEGORIES should include all expected categories', () => {
    const expectedCategories = [
      'adult', 'communication', 'crypto', 'dev', 'education',
      'entertainment', 'finance', 'food_delivery', 'gaming', 
      'government', 'health_fitness', 'music', 'news', 
      'productivity', 'reference', 'shopping', 'social', 
      'sports', 'travel', 'video'
    ];

    expectedCategories.forEach(category => {
      expect(DOMAIN_CATEGORIES).toHaveProperty(category);
    });
  });

  test('All categories should have name and description', () => {
    Object.entries(DOMAIN_CATEGORIES).forEach(([key, value]) => {
      expect(value).toHaveProperty('name');
      expect(value).toHaveProperty('description');
      expect(typeof value.name).toBe('string');
      expect(typeof value.description).toBe('string');
      expect(value.name.length).toBeGreaterThan(0);
    });
  });

  test('Category keys should be lowercase with underscores', () => {
    Object.keys(DOMAIN_CATEGORIES).forEach(key => {
      expect(key).toMatch(/^[a-z_]+$/);
    });
  });

  test('Should have at least 15 categories', () => {
    const categoryCount = Object.keys(DOMAIN_CATEGORIES).length;
    expect(categoryCount).toBeGreaterThanOrEqual(15);
  });
});
