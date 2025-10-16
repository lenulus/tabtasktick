/**
 * E2E Tests for selectCollections.js
 *
 * ⚠️ THESE TESTS CANNOT CURRENTLY RUN ⚠️
 *
 * Issue: Playwright's testPage fixture cannot load chrome-extension:// URLs
 * with ES module support. Service workers don't support dynamic imports.
 *
 * Decision (per architecture-guardian review): Accept Jest limitation,
 * use manual testing for index queries. See /tests/KNOWN_LIMITATIONS.md
 *
 * These tests remain as documentation of what SHOULD be tested when
 * the infrastructure limitation is resolved.
 *
 * Status: Preserved for future use when Playwright extension testing matures
 */

import { test, expect } from './fixtures/extension.js';

test.describe('selectCollections - IndexedDB Index Queries', () => {
  test.beforeEach(async ({ testPage }) => {
    // Clear IndexedDB before each test
    await testPage.evaluate(async () => {
      const { clearAllData } = await import('./services/utils/db.js');
      await clearAllData();
    });
  });

  test('selects collections by isActive index', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveCollection } = await import('./services/utils/storage-queries.js');
      const { selectCollections } = await import('./services/selection/selectCollections.js');

      // Create test collections
      await saveCollection({
        id: 'active_1',
        name: 'Active Collection',
        isActive: true,
        tags: [],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await saveCollection({
        id: 'saved_1',
        name: 'Saved Collection',
        isActive: false,
        tags: [],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await saveCollection({
        id: 'active_2',
        name: 'Another Active',
        isActive: true,
        tags: [],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      // Test isActive index query
      const activeCollections = await selectCollections({ isActive: true });
      const savedCollections = await selectCollections({ isActive: false });

      return {
        activeCount: activeCollections.length,
        activeNames: activeCollections.map(c => c.name).sort(),
        savedCount: savedCollections.length,
        savedNames: savedCollections.map(c => c.name)
      };
    });

    expect(result.activeCount).toBe(2);
    expect(result.activeNames).toEqual(['Active Collection', 'Another Active']);
    expect(result.savedCount).toBe(1);
    expect(result.savedNames).toEqual(['Saved Collection']);
  });

  test('selects collections by tags index (multi-entry)', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveCollection } = await import('./services/utils/storage-queries.js');
      const { selectCollections } = await import('./services/selection/selectCollections.js');

      // Create collections with tags
      await saveCollection({
        id: 'work_1',
        name: 'Work Project',
        isActive: true,
        tags: ['work', 'urgent'],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await saveCollection({
        id: 'personal_1',
        name: 'Personal Project',
        isActive: true,
        tags: ['personal'],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await saveCollection({
        id: 'work_2',
        name: 'Another Work Project',
        isActive: false,
        tags: ['work', 'client'],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      // Test tags index query
      const workCollections = await selectCollections({ tags: ['work'] });
      const urgentCollections = await selectCollections({ tags: ['urgent'] });
      const personalCollections = await selectCollections({ tags: ['personal'] });

      return {
        workCount: workCollections.length,
        workNames: workCollections.map(c => c.name).sort(),
        urgentCount: urgentCollections.length,
        urgentNames: urgentCollections.map(c => c.name),
        personalCount: personalCollections.length,
        personalNames: personalCollections.map(c => c.name)
      };
    });

    expect(result.workCount).toBe(2);
    expect(result.workNames).toEqual(['Another Work Project', 'Work Project']);
    expect(result.urgentCount).toBe(1);
    expect(result.urgentNames).toEqual(['Work Project']);
    expect(result.personalCount).toBe(1);
    expect(result.personalNames).toEqual(['Personal Project']);
  });

  test('combines isActive and tags filters', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveCollection } = await import('./services/utils/storage-queries.js');
      const { selectCollections } = await import('./services/selection/selectCollections.js');

      await saveCollection({
        id: 'active_work',
        name: 'Active Work',
        isActive: true,
        tags: ['work'],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await saveCollection({
        id: 'saved_work',
        name: 'Saved Work',
        isActive: false,
        tags: ['work'],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await saveCollection({
        id: 'active_personal',
        name: 'Active Personal',
        isActive: true,
        tags: ['personal'],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      // Test combined filter
      const activeWork = await selectCollections({
        isActive: true,
        tags: ['work']
      });

      return {
        count: activeWork.length,
        names: activeWork.map(c => c.name)
      };
    });

    expect(result.count).toBe(1);
    expect(result.names).toEqual(['Active Work']);
  });

  test('filters by search text (name and description)', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveCollection } = await import('./services/utils/storage-queries.js');
      const { selectCollections } = await import('./services/selection/selectCollections.js');

      await saveCollection({
        id: 'auth_project',
        name: 'Authentication System',
        description: 'OAuth2 implementation',
        isActive: true,
        tags: [],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await saveCollection({
        id: 'api_project',
        name: 'API Gateway',
        description: 'authentication and authorization',
        isActive: true,
        tags: [],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await saveCollection({
        id: 'ui_project',
        name: 'UI Components',
        description: 'Reusable components',
        isActive: true,
        tags: [],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      // Search by name
      const nameResults = await selectCollections({ search: 'authentication' });

      // Search by description
      const descResults = await selectCollections({ search: 'oauth' });

      return {
        nameCount: nameResults.length,
        nameMatches: nameResults.map(c => c.name).sort(),
        descCount: descResults.length,
        descMatches: descResults.map(c => c.name)
      };
    });

    // "authentication" matches name and description
    expect(result.nameCount).toBe(2);
    expect(result.nameMatches).toEqual(['API Gateway', 'Authentication System']);

    // "oauth" matches description only
    expect(result.descCount).toBe(1);
    expect(result.descMatches).toEqual(['Authentication System']);
  });

  test('filters by lastAccessed date range', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveCollection } = await import('./services/utils/storage-queries.js');
      const { selectCollections } = await import('./services/selection/selectCollections.js');

      const now = Date.now();
      const oneDayAgo = now - (24 * 60 * 60 * 1000);
      const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

      await saveCollection({
        id: 'recent',
        name: 'Recent Collection',
        isActive: true,
        tags: [],
        metadata: { createdAt: now, lastAccessed: now }
      });

      await saveCollection({
        id: 'medium',
        name: 'Medium Age Collection',
        isActive: true,
        tags: [],
        metadata: { createdAt: threeDaysAgo, lastAccessed: threeDaysAgo }
      });

      await saveCollection({
        id: 'old',
        name: 'Old Collection',
        isActive: true,
        tags: [],
        metadata: { createdAt: sevenDaysAgo, lastAccessed: sevenDaysAgo }
      });

      // Last 2 days
      const recentCollections = await selectCollections({
        lastAccessedAfter: oneDayAgo * 2
      });

      // Between 2 and 5 days ago
      const mediumCollections = await selectCollections({
        lastAccessedAfter: now - (5 * 24 * 60 * 60 * 1000),
        lastAccessedBefore: now - (2 * 24 * 60 * 60 * 1000)
      });

      return {
        recentCount: recentCollections.length,
        recentNames: recentCollections.map(c => c.name).sort(),
        mediumCount: mediumCollections.length,
        mediumNames: mediumCollections.map(c => c.name)
      };
    });

    expect(result.recentCount).toBe(1);
    expect(result.recentNames).toEqual(['Recent Collection']);
    expect(result.mediumCount).toBe(1);
    expect(result.mediumNames).toEqual(['Medium Age Collection']);
  });

  test('sorts by lastAccessed (desc)', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveCollection } = await import('./services/utils/storage-queries.js');
      const { selectCollections } = await import('./services/selection/selectCollections.js');

      const now = Date.now();

      await saveCollection({
        id: 'oldest',
        name: 'Oldest',
        isActive: true,
        tags: [],
        metadata: { createdAt: now - 3000, lastAccessed: now - 3000 }
      });

      await saveCollection({
        id: 'middle',
        name: 'Middle',
        isActive: true,
        tags: [],
        metadata: { createdAt: now - 2000, lastAccessed: now - 2000 }
      });

      await saveCollection({
        id: 'newest',
        name: 'Newest',
        isActive: true,
        tags: [],
        metadata: { createdAt: now - 1000, lastAccessed: now - 1000 }
      });

      const collections = await selectCollections({
        sortBy: 'lastAccessed',
        sortOrder: 'desc'
      });

      return {
        names: collections.map(c => c.name)
      };
    });

    expect(result.names).toEqual(['Newest', 'Middle', 'Oldest']);
  });

  test('sorts by name (asc)', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveCollection } = await import('./services/utils/storage-queries.js');
      const { selectCollections } = await import('./services/selection/selectCollections.js');

      const now = Date.now();

      await saveCollection({
        id: 'zebra',
        name: 'Zebra Project',
        isActive: true,
        tags: [],
        metadata: { createdAt: now, lastAccessed: now }
      });

      await saveCollection({
        id: 'alpha',
        name: 'Alpha Project',
        isActive: true,
        tags: [],
        metadata: { createdAt: now, lastAccessed: now }
      });

      await saveCollection({
        id: 'beta',
        name: 'Beta Project',
        isActive: true,
        tags: [],
        metadata: { createdAt: now, lastAccessed: now }
      });

      const collections = await selectCollections({
        sortBy: 'name',
        sortOrder: 'asc'
      });

      return {
        names: collections.map(c => c.name)
      };
    });

    expect(result.names).toEqual(['Alpha Project', 'Beta Project', 'Zebra Project']);
  });

  test('convenience wrapper: getActiveCollections()', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveCollection } = await import('./services/utils/storage-queries.js');
      const { getActiveCollections } = await import('./services/selection/selectCollections.js');

      await saveCollection({
        id: 'active',
        name: 'Active',
        isActive: true,
        tags: [],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await saveCollection({
        id: 'saved',
        name: 'Saved',
        isActive: false,
        tags: [],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      const active = await getActiveCollections();

      return {
        count: active.length,
        names: active.map(c => c.name)
      };
    });

    expect(result.count).toBe(1);
    expect(result.names).toEqual(['Active']);
  });

  test('convenience wrapper: getSavedCollections()', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveCollection } = await import('./services/utils/storage-queries.js');
      const { getSavedCollections } = await import('./services/selection/selectCollections.js');

      await saveCollection({
        id: 'active',
        name: 'Active',
        isActive: true,
        tags: [],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await saveCollection({
        id: 'saved',
        name: 'Saved',
        isActive: false,
        tags: [],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      const saved = await getSavedCollections();

      return {
        count: saved.length,
        names: saved.map(c => c.name)
      };
    });

    expect(result.count).toBe(1);
    expect(result.names).toEqual(['Saved']);
  });

  test('convenience wrapper: searchCollections()', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveCollection } = await import('./services/utils/storage-queries.js');
      const { searchCollections } = await import('./services/selection/selectCollections.js');

      await saveCollection({
        id: 'auth',
        name: 'Authentication',
        isActive: true,
        tags: [],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await saveCollection({
        id: 'api',
        name: 'API Gateway',
        isActive: true,
        tags: [],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      const results = await searchCollections('auth');

      return {
        count: results.length,
        names: results.map(c => c.name)
      };
    });

    expect(result.count).toBe(1);
    expect(result.names).toEqual(['Authentication']);
  });

  test('convenience wrapper: getCollectionsByTags()', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveCollection } = await import('./services/utils/storage-queries.js');
      const { getCollectionsByTags } = await import('./services/selection/selectCollections.js');

      await saveCollection({
        id: 'work',
        name: 'Work Project',
        isActive: true,
        tags: ['work', 'urgent'],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await saveCollection({
        id: 'personal',
        name: 'Personal Project',
        isActive: true,
        tags: ['personal'],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      // Test with array
      const workResults = await getCollectionsByTags(['work']);

      // Test with string
      const personalResults = await getCollectionsByTags('personal');

      return {
        workCount: workResults.length,
        workNames: workResults.map(c => c.name),
        personalCount: personalResults.length,
        personalNames: personalResults.map(c => c.name)
      };
    });

    expect(result.workCount).toBe(1);
    expect(result.workNames).toEqual(['Work Project']);
    expect(result.personalCount).toBe(1);
    expect(result.personalNames).toEqual(['Personal Project']);
  });

  test('handles empty results gracefully', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { selectCollections } = await import('./services/selection/selectCollections.js');

      // No data in database
      const collections = await selectCollections({ isActive: true });

      return {
        count: collections.length,
        isArray: Array.isArray(collections)
      };
    });

    expect(result.isArray).toBe(true);
    expect(result.count).toBe(0);
  });

  test('deduplicates results when querying multiple tags', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      const { saveCollection } = await import('./services/utils/storage-queries.js');
      const { selectCollections } = await import('./services/selection/selectCollections.js');

      // Collection with multiple matching tags
      await saveCollection({
        id: 'multi_tag',
        name: 'Multi Tag Project',
        isActive: true,
        tags: ['work', 'urgent', 'client'],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await saveCollection({
        id: 'single_tag',
        name: 'Single Tag Project',
        isActive: true,
        tags: ['work'],
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      // Query with multiple tags that would match the same collection
      const collections = await selectCollections({
        tags: ['work', 'urgent']
      });

      return {
        count: collections.length,
        names: collections.map(c => c.name).sort(),
        ids: collections.map(c => c.id).sort()
      };
    });

    // Should return 2 unique collections, not 3 (multi_tag shouldn't be duplicated)
    expect(result.count).toBe(2);
    expect(result.names).toEqual(['Multi Tag Project', 'Single Tag Project']);
    expect(result.ids).toEqual(['multi_tag', 'single_tag']);
  });
});
