/**
 * TabTaskTick Phase 2.7: Window Event Listener Integration Tests
 *
 * Tests automatic collection-window binding lifecycle:
 * - Window close → collection unbinds (isActive=false)
 * - Cache rebuild on startup
 * - Orphaned collection cleanup
 */

import { test, expect } from './fixtures/extension.js';

test.describe('TabTaskTick Phase 2.7: Window Event Listener Integration', () => {

  test('window close automatically unbinds collection', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      try {
        // Clear data
        const { clearAllData } = await import('./services/utils/db.js');
        await clearAllData();

        // Create a test collection
        const { saveCollection } = await import('./services/utils/storage-queries.js');
        const testCollection = {
          id: 'test-collection-1',
          name: 'Test Collection',
          isActive: false,
          windowId: null,
          tags: [],
          metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
        };
        await saveCollection(testCollection);

        // Create a new window
        const window = await chrome.windows.create({
          url: 'about:blank',
          focused: false
        });

        // Bind collection to window via WindowService
        const WindowService = await import('./services/execution/WindowService.js');
        await WindowService.bindCollectionToWindow('test-collection-1', window.id);

        // Verify binding succeeded
        const boundCollection = await WindowService.getCollectionForWindow(window.id);
        if (!boundCollection || boundCollection.id !== 'test-collection-1') {
          throw new Error('Collection binding failed');
        }

        // Close the window (this should trigger chrome.windows.onRemoved)
        console.log(`Closing window ${window.id}`);
        await chrome.windows.remove(window.id);

        // Wait for event listener to process
        console.log('Waiting for unbind...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check if background script received the event
        const eventData = await chrome.storage.local.get('lastWindowRemovedEvent');
        console.log('Window removed event data:', eventData.lastWindowRemovedEvent);

        if (!eventData.lastWindowRemovedEvent) {
          throw new Error('chrome.windows.onRemoved event did not fire');
        }

        if (eventData.lastWindowRemovedEvent.windowId !== window.id) {
          throw new Error(`Event fired for wrong window: expected ${window.id}, got ${eventData.lastWindowRemovedEvent.windowId}`);
        }

        // Verify collection is unbound
        const { selectCollections } = await import('./services/selection/selectCollections.js');
        console.log('Querying collection...');
        const collections = await selectCollections({ id: 'test-collection-1' });
        console.log(`Found ${collections.length} collections:`, collections);

        if (collections.length !== 1) {
          throw new Error('Collection not found after window close');
        }

        const unboundCollection = collections[0];

        return {
          success: true,
          isActive: unboundCollection.isActive,
          windowId: unboundCollection.windowId
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    });

    if (!result.success) {
      console.error('Test failed:', result.error);
      console.error('Stack:', result.stack);
    }

    expect(result.success).toBe(true);
    expect(result.isActive).toBe(false);
    expect(result.windowId).toBeNull();
  });

  test('cache rebuild on startup detects active windows', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      try {
        // Clear data
        const { clearAllData } = await import('./services/utils/db.js');
        await clearAllData();

        // Create collections
        const { saveCollection } = await import('./services/utils/storage-queries.js');

        // Collection 1: bound to existing window
        const currentWindows = await chrome.windows.getAll();
        const existingWindowId = currentWindows[0]?.id;

        await saveCollection({
          id: 'collection-1',
          name: 'Active Collection',
          isActive: true,
          windowId: existingWindowId,
          tags: [],
          metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
        });

        // Collection 2: bound to non-existent window (orphaned)
        await saveCollection({
          id: 'collection-2',
          name: 'Orphaned Collection',
          isActive: true,
          windowId: 999999, // Non-existent window
          tags: [],
          metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
        });

        // Rebuild cache (simulates startup)
        const WindowService = await import('./services/execution/WindowService.js');
        await WindowService.rebuildCollectionCache();

        // Verify results
        const { selectCollections } = await import('./services/selection/selectCollections.js');
        const allCollections = await selectCollections({});

        const collection1 = allCollections.find(c => c.id === 'collection-1');
        const collection2 = allCollections.find(c => c.id === 'collection-2');

        return {
          success: true,
          collection1: {
            isActive: collection1?.isActive,
            windowId: collection1?.windowId
          },
          collection2: {
            isActive: collection2?.isActive,
            windowId: collection2?.windowId
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    });

    if (!result.success) {
      console.error('Test failed:', result.error);
      console.error('Stack:', result.stack);
    }

    expect(result.success).toBe(true);

    // Collection 1 should remain active (window exists)
    expect(result.collection1.isActive).toBe(true);

    // Collection 2 should be deactivated (orphaned)
    expect(result.collection2.isActive).toBe(false);
    expect(result.collection2.windowId).toBeNull();
  });

  test('window focus updates collection lastAccessed timestamp', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      try {
        // Clear data
        const { clearAllData } = await import('./services/utils/db.js');
        await clearAllData();

        // Create a test collection
        const { saveCollection } = await import('./services/utils/storage-queries.js');
        const initialTimestamp = Date.now() - 10000; // 10 seconds ago

        await saveCollection({
          id: 'focus-test-collection',
          name: 'Focus Test Collection',
          isActive: false,
          windowId: null,
          tags: [],
          metadata: { createdAt: initialTimestamp, lastAccessed: initialTimestamp }
        });

        // Create a new window
        const window = await chrome.windows.create({
          url: 'about:blank',
          focused: false
        });

        // Bind collection to window
        const WindowService = await import('./services/execution/WindowService.js');
        await WindowService.bindCollectionToWindow('focus-test-collection', window.id);

        // Focus the window (triggers chrome.windows.onFocusChanged)
        await chrome.windows.update(window.id, { focused: true });

        // Wait for event listener to process
        await new Promise(resolve => setTimeout(resolve, 500));

        // Get updated collection
        const { selectCollections } = await import('./services/selection/selectCollections.js');
        const collections = await selectCollections({ id: 'focus-test-collection' });

        if (collections.length !== 1) {
          throw new Error('Collection not found');
        }

        const updatedCollection = collections[0];
        const lastAccessed = updatedCollection.metadata?.lastAccessed || 0;

        // Clean up
        await chrome.windows.remove(window.id);

        return {
          success: true,
          initialTimestamp,
          lastAccessed,
          wasUpdated: lastAccessed > initialTimestamp
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    });

    if (!result.success) {
      console.error('Test failed:', result.error);
      console.error('Stack:', result.stack);
    }

    expect(result.success).toBe(true);
    expect(result.wasUpdated).toBe(true);
    expect(result.lastAccessed).toBeGreaterThan(result.initialTimestamp);
  });

  test('multiple window closes handled sequentially', async ({ testPage }) => {
    const result = await testPage.evaluate(async () => {
      try {
        // Clear data
        const { clearAllData } = await import('./services/utils/db.js');
        await clearAllData();

        // Create multiple collections and windows
        const { saveCollection } = await import('./services/utils/storage-queries.js');
        const WindowService = await import('./services/execution/WindowService.js');

        const windows = [];
        const collectionIds = ['multi-1', 'multi-2', 'multi-3'];

        for (let i = 0; i < 3; i++) {
          // Create collection
          await saveCollection({
            id: collectionIds[i],
            name: `Multi Collection ${i + 1}`,
            isActive: false,
            windowId: null,
            tags: [],
            metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
          });

          // Create window
          const window = await chrome.windows.create({
            url: 'about:blank',
            focused: false
          });
          windows.push(window.id);

          // Bind collection to window
          await WindowService.bindCollectionToWindow(collectionIds[i], window.id);
        }

        // Close all windows
        for (const windowId of windows) {
          await chrome.windows.remove(windowId);
        }

        // Wait for all event listeners to process
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify all collections are unbound
        const { selectCollections } = await import('./services/selection/selectCollections.js');
        const collections = await selectCollections({});

        const activeCount = collections.filter(c => c.isActive).length;
        const boundCount = collections.filter(c => c.windowId !== null).length;

        return {
          success: true,
          totalCollections: collections.length,
          activeCount,
          boundCount
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    });

    if (!result.success) {
      console.error('Test failed:', result.error);
      console.error('Stack:', result.stack);
    }

    expect(result.success).toBe(true);
    expect(result.totalCollections).toBe(3);
    expect(result.activeCount).toBe(0);
    expect(result.boundCount).toBe(0);
  });

});
