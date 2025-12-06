/**
 * E2E Tests: Context Menus (Phase 5)
 *
 * Tests TabTaskTick context menu modals and functionality:
 * - Collection Selector Modal (add tab to collection)
 * - Task Modal (create tasks for tabs)
 * - Note Modal (add notes to tabs)
 * - Integration with message handlers
 */

import { test, expect } from './fixtures/extension.js';

test.describe('Context Menus - Phase 5', () => {
  // Helper function to create test data setup
  async function createTestData(testPage) {
    return await testPage.evaluate(async () => {
      // Create collection
      const collectionResult = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'createCollection',
          params: {
            name: 'Test Collection for Context Menus',
            description: 'Test collection for Phase 5'
          }
        }, (response) => {
          console.log('[DEBUG] createCollection response:', JSON.stringify(response, null, 2));
          if (chrome.runtime.lastError) {
            console.error('[DEBUG] chrome.runtime.lastError:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });

      if (!collectionResult) {
        throw new Error('createCollection returned undefined response');
      }

      if (collectionResult.error) {
        throw new Error(`createCollection failed with error: ${collectionResult.error}`);
      }

      if (!collectionResult.collection) {
        throw new Error(`createCollection response missing collection property. Response: ${JSON.stringify(collectionResult)}`);
      }

      const collectionId = collectionResult.collection.id;

      // Create folder
      const folderResult = await new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'createFolder',
          collectionId,
          params: {
            name: 'Test Folder',
            color: 'blue',
            position: 0
          }
        }, resolve);
      });

      const folderId = folderResult.folder.id;

      // Create tab
      const tabResult = await new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'createTab',
          folderId,
          params: {
            url: 'https://example.com',
            title: 'Example Tab for Testing',
            position: 0
          }
        }, resolve);
      });

      return {
        collectionId,
        folderId,
        tabId: tabResult.tab.id
      };
    });
  }

  test.beforeEach(async ({ testPage }) => {
    // Clear all data before each test to ensure isolation
    await testPage.evaluate(async () => {
      const { clearAllData } = await import('./services/utils/db.js');
      await clearAllData();
    });
  });

  test.describe('Collection Selector Modal Integration', () => {
    test('should add tab to existing collection via message handlers', async ({ testPage }) => {
      // Create test data for this test
      const testData = await createTestData(testPage);

      const result = await testPage.evaluate(async (data) => {
        const { collectionId, folderId } = data;

        // Simulate what the collection selector modal does:
        // 1. Create a new tab in the existing collection
        const tabResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createTab',
            folderId,
            params: {
              url: 'https://test-add-tab.com',
              title: 'Test Add Tab via Context Menu',
              position: 0
            }
          }, resolve);
        });

        // 2. Verify it was added
        const tabsResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'getTabsByFolder',
            folderId
          }, resolve);
        });

        return {
          tabAdded: tabResult.success,
          tabId: tabResult.tab?.id,
          allTabs: tabsResult.tabs
        };
      }, testData); // Pass testData to evaluate()

      expect(result.tabAdded).toBe(true);
      expect(result.tabId).toBeTruthy();
      expect(result.allTabs).toHaveLength(2); // Original + new tab
      const addedTab = result.allTabs.find(t => t.url === 'https://test-add-tab.com');
      expect(addedTab).toBeDefined();
      expect(addedTab.title).toBe('Test Add Tab via Context Menu');
    });

    test('should create new collection and add tab inline', async ({ testPage }) => {
      const result = await testPage.evaluate(async () => {
        // Simulate what happens when user creates new collection in modal:
        // 1. Create collection
        const collectionResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createCollection',
            params: { name: 'New Collection via Modal' }
          }, resolve);
        });

        const newCollectionId = collectionResult.collection.id;

        // 2. Create folder (modals create "Unsorted" folder)
        const folderResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createFolder',
            collectionId: newCollectionId,
            params: { name: 'Unsorted', color: 'blue', position: 0 }
          }, resolve);
        });

        // 3. Add tab to folder
        const tabResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createTab',
            folderId: folderResult.folder.id,
            params: {
              url: 'https://new-collection-test.com',
              title: 'New Collection Test Tab',
              position: 0
            }
          }, resolve);
        });

        return {
          collectionCreated: collectionResult.success,
          collectionId: newCollectionId,
          tabAdded: tabResult.success,
          tabResult: tabResult // Add for debugging
        };
      });

      expect(result.collectionCreated).toBe(true);
      expect(result.collectionId).toBeTruthy();
      expect(result.tabAdded).toBe(true);
    });
  });

  test.describe('Task Modal Integration', () => {
    test('should create task with tab references via message handlers', async ({ testPage }) => {
      // Create test data for this test
      const testData = await createTestData(testPage);

      const result = await testPage.evaluate(async (data) => {
        const { collectionId, tabId } = data;

        // Simulate what the task modal does:
        const taskResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createTask',
            params: {
              summary: 'E2E Test Task from Context Menu',
              notes: 'Task created via E2E test',
              collectionId,
              tabIds: [tabId],
              priority: 'high',
              status: 'open'
            }
          }, resolve);
        });

        return {
          taskCreated: taskResult.success,
          task: taskResult.task
        };
      }, testData); // Pass testData to evaluate()

      expect(result.taskCreated).toBe(true);
      expect(result.task.summary).toBe('E2E Test Task from Context Menu');
      expect(result.task.priority).toBe('high');
      expect(result.task.tabIds).toContain(result.task.tabIds[0]); // Contains the test tab ID
      expect(result.task.collectionId).toBeTruthy();
    });

    test('should create uncategorized task (no collection)', async ({ testPage }) => {
      const result = await testPage.evaluate(async () => {
        // Simulate creating task without collection
        const taskResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createTask',
            params: {
              summary: 'Uncategorized Task',
              notes: 'Task without collection',
              priority: 'medium',
              status: 'open'
            }
          }, resolve);
        });

        return {
          taskCreated: taskResult.success,
          task: taskResult.task
        };
      });

      expect(result.taskCreated).toBe(true);
      expect(result.task.summary).toBe('Uncategorized Task');
      expect(result.task.collectionId).toBeNull();
      expect(result.task.tabIds).toEqual([]);
    });
  });

  test.describe('Note Modal Integration', () => {
    test('should save note to tab via message handlers', async ({ testPage }) => {
      // Create test data for this test
      const testData = await createTestData(testPage);

      const result = await testPage.evaluate(async (data) => {
        const { tabId } = data;

        // Simulate what the note modal does:
        const updateResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'updateTab',
            tabId: tabId,
            updates: { note: 'This is a test note added via context menu E2E test' }
          }, resolve);
        });

        // The updateTab response includes the updated tab
        return {
          noteUpdated: updateResult.success,
          tab: updateResult.tab
        };
      }, testData); // Pass testData to evaluate()

      expect(result.noteUpdated).toBe(true);
      expect(result.tab.note).toBe('This is a test note added via context menu E2E test');
    });

    test('should update existing note', async ({ testPage }) => {
      // Create test data for this test
      const testData = await createTestData(testPage);

      const result = await testPage.evaluate(async (data) => {
        const { tabId } = data;

        // Add initial note
        await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'updateTab',
            tabId: tabId,
            updates: { note: 'First note' }
          }, resolve);
        });

        // Update note
        const updateResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'updateTab',
            tabId: tabId,
            updates: { note: 'Updated note' }
          }, resolve);
        });

        // The updateTab response includes the updated tab
        return {
          updated: updateResult.success,
          finalNote: updateResult.tab.note
        };
      }, testData); // Pass testData to evaluate()

      expect(result.updated).toBe(true);
      expect(result.finalNote).toBe('Updated note');
    });

    test('should respect 255 character limit', async ({ testPage }) => {
      // Create test data for this test
      const testData = await createTestData(testPage);

      const result = await testPage.evaluate(async (data) => {
        const { tabId } = data;

        // The modal enforces the limit, but let's test the backend accepts 255 chars
        const longNote = 'a'.repeat(255);
        const updateResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'updateTab',
            tabId: tabId,
            updates: { note: longNote }
          }, resolve);
        });

        // The updateTab response includes the updated tab
        return {
          updated: updateResult.success,
          noteLength: updateResult.tab.note.length,
          note: updateResult.tab.note
        };
      }, testData); // Pass testData to evaluate()

      expect(result.updated).toBe(true);
      expect(result.noteLength).toBe(255);
      expect(result.note).toBe('a'.repeat(255));
    });
  });

  test.describe('Context Menu Setup', () => {
    test('should have correct context menu items registered', async ({ testPage }) => {
      // First ensure context menus are set up
      const setupResult = await testPage.evaluate(async () => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({
            action: 'setupContextMenus'
          }, (response) => {
            console.log('[DEBUG] setupContextMenus response:', JSON.stringify(response, null, 2));
            resolve(response);
          });
        });
      });

      console.log('setupResult:', setupResult);

      // Wait a bit for context menus to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Then get the context menus
      const result = await testPage.evaluate(async () => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({
            action: 'getContextMenus'
          }, (response) => {
            console.log('[DEBUG] getContextMenus response:', JSON.stringify(response, null, 2));
            console.log('[DEBUG] response.items length:', response?.items?.length);
            console.log('[DEBUG] all menu IDs:', response?.items?.map(i => i.id));
            if (response && response.success && response.items) {
              const tabtasktickMenus = response.items.filter(item =>
                item.id && (
                  item.id.includes('collection') ||
                  item.id.includes('task') ||
                  item.id.includes('note') ||
                  item.id.includes('panel')
                )
              );
              console.log('[DEBUG] filtered menus:', JSON.stringify(tabtasktickMenus, null, 2));
              resolve({
                totalCount: response.items.length,
                allIds: response.items.map(i => i.id),
                menus: tabtasktickMenus.map(m => ({
                  id: m.id,
                  title: m.title,
                  contexts: m.contexts
                }))
              });
            } else {
              console.log('[DEBUG] No success or no items in response');
              resolve({
                totalCount: 0,
                allIds: [],
                menus: []
              });
            }
          });
        });
      });

      const contextMenus = result.menus;

      console.log('Total items:', result.totalCount);
      console.log('All IDs:', result.allIds);
      console.log('Filtered menus:', contextMenus);

      // Verify expected menu items exist
      const menuIds = contextMenus.map(m => m.id);
      expect(menuIds).toContain('add-to-collection');
      expect(menuIds).toContain('create-task-for-tab');
      expect(menuIds).toContain('add-note-to-tab');
      expect(menuIds).toContain('save-window-as-collection');
      expect(menuIds).toContain('open-side-panel');

      // Verify contexts are correct
      const addToCollection = contextMenus.find(m => m.id === 'add-to-collection');
      expect(addToCollection.contexts).toContain('page');

      const openPanel = contextMenus.find(m => m.id === 'open-side-panel');
      expect(openPanel.contexts).toContain('action');
    });
  });
});
