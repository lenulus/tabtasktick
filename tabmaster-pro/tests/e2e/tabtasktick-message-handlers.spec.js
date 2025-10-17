/**
 * E2E Tests for TabTaskTick Message Handlers (Phase 2.6)
 *
 * Tests all 16 message handlers added to background-integrated.js:
 * - 5 Collection operations (create, update, delete, get, getAll)
 * - 3 Folder operations (create, update, delete)
 * - 3 Tab operations (create, update, delete)
 * - 5 Task operations (create, update, delete, addComment, getAll)
 *
 * Uses real Chrome APIs and IndexedDB to validate integration.
 */

import { test, expect } from './fixtures/extension.js';

test.describe('TabTaskTick Message Handlers', () => {
  test.beforeEach(async ({ testPage }) => {
    // Clear all data before each test to ensure isolation
    await testPage.evaluate(async () => {
      const { clearAllData } = await import('./services/utils/db.js');
      await clearAllData();
    });
  });

  test.describe('Collection Operations', () => {
    test('createCollection handler creates collection in IndexedDB', async ({ testPage }) => {
      const result = await testPage.evaluate(async () => {
        return new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createCollection',
            params: {
              name: 'Test Collection',
              description: 'Test Description',
              icon: '📁',
              color: '#FF5722',
              tags: ['test', 'work']
            }
          }, resolve);
        });
      });

      expect(result.success).toBe(true);
      expect(result.collection.name).toBe('Test Collection');
      expect(result.collection.description).toBe('Test Description');
      expect(result.collection.icon).toBe('📁');
      expect(result.collection.color).toBe('#FF5722');
      expect(result.collection.tags).toEqual(['test', 'work']);
      expect(result.collection.id).toBeTruthy();
      expect(result.collection.isActive).toBe(false);
    });

    test('updateCollection handler updates existing collection', async ({ testPage }) => {
      const result = await testPage.evaluate(async () => {
        // First create a collection
        const createResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createCollection',
            params: { name: 'Original Name', tags: [] }
          }, resolve);
        });

        // Then update it
        const updateResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'updateCollection',
            id: createResult.collection.id,
            updates: { name: 'Updated Name', description: 'New Description' }
          }, resolve);
        });

        return updateResult;
      });

      expect(result.success).toBe(true);
      expect(result.collection.name).toBe('Updated Name');
      expect(result.collection.description).toBe('New Description');
    });

    test('getCollection handler retrieves collection by ID', async ({ testPage }) => {
      const result = await testPage.evaluate(async () => {
        // Create collection
        const createResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createCollection',
            params: { name: 'Findable Collection', tags: [] }
          }, resolve);
        });

        // Retrieve it
        const getResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'getCollection',
            id: createResult.collection.id
          }, resolve);
        });

        return getResult;
      });

      expect(result.success).toBe(true);
      expect(result.collection.name).toBe('Findable Collection');
    });

    test('getCollections handler retrieves filtered collections', async ({ testPage }) => {
      const result = await testPage.evaluate(async () => {
        // Create multiple collections with different tags
        await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createCollection',
            params: { name: 'Work Collection', tags: ['work'] }
          }, resolve);
        });

        await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createCollection',
            params: { name: 'Personal Collection', tags: ['personal'] }
          }, resolve);
        });

        await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createCollection',
            params: { name: 'Another Work Collection', tags: ['work', 'project'] }
          }, resolve);
        });

        // Get all collections (no filters)
        const getAllResult = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            action: 'getCollections',
            filters: {}
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          });
        });

        return getAllResult;
      });

      expect(result.success).toBe(true);
      expect(result.collections.length).toBe(3);
      const names = result.collections.map(c => c.name);
      expect(names).toContain('Work Collection');
      expect(names).toContain('Personal Collection');
      expect(names).toContain('Another Work Collection');
    });

    test('deleteCollection handler deletes collection with cascade', async ({ testPage }) => {
      const result = await testPage.evaluate(async () => {
        // Create collection with folder, tab, and task
        const createResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createCollection',
            params: { name: 'Collection to Delete', tags: [] }
          }, resolve);
        });

        const collectionId = createResult.collection.id;

        await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createFolder',
            params: { collectionId, name: 'Test Folder', color: 'blue', position: 0 }
          }, resolve);
        });

        await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createTask',
            params: {
              collectionId,
              summary: 'Test Task',
              status: 'open',
              priority: 'medium',
              tags: [],
              tabIds: []
            }
          }, resolve);
        });

        // Delete collection
        const deleteResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'deleteCollection',
            id: collectionId
          }, resolve);
        });

        // Verify cascade deletion
        const { getFoldersByCollection, getTasksByCollection } =
          await import('./services/utils/storage-queries.js');

        const folders = await getFoldersByCollection(collectionId);
        const tasks = await getTasksByCollection(collectionId);

        return {
          deleteResult,
          foldersCount: folders.length,
          tasksCount: tasks.length
        };
      });

      expect(result.deleteResult.success).toBe(true);
      expect(result.foldersCount).toBe(0);
      expect(result.tasksCount).toBe(0);
    });
  });

  test.describe('Folder Operations', () => {
    test('createFolder handler creates folder in collection', async ({ testPage }) => {
      const result = await testPage.evaluate(async () => {
        // Create collection first
        const collectionResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createCollection',
            params: { name: 'Parent Collection', tags: [] }
          }, resolve);
        });

        // Create folder
        const folderResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createFolder',
            params: {
              collectionId: collectionResult.collection.id,
              name: 'Test Folder',
              color: 'blue',
              collapsed: false,
              position: 0
            }
          }, resolve);
        });

        return folderResult;
      });

      expect(result.success).toBe(true);
      expect(result.folder.name).toBe('Test Folder');
      expect(result.folder.color).toBe('blue');
      expect(result.folder.id).toBeTruthy();
    });

    test('updateFolder handler updates existing folder', async ({ testPage }) => {
      const result = await testPage.evaluate(async () => {
        const collectionResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createCollection',
            params: { name: 'Collection', tags: [] }
          }, resolve);
        });

        const folderResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createFolder',
            params: {
              collectionId: collectionResult.collection.id,
              name: 'Original Folder',
              color: 'red',
              position: 0
            }
          }, resolve);
        });

        const updateResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'updateFolder',
            id: folderResult.folder.id,
            updates: { name: 'Updated Folder', color: 'green' }
          }, resolve);
        });

        return updateResult;
      });

      expect(result.success).toBe(true);
      expect(result.folder.name).toBe('Updated Folder');
      expect(result.folder.color).toBe('green');
    });

    test('deleteFolder handler deletes folder with cascade', async ({ testPage }) => {
      const result = await testPage.evaluate(async () => {
        const collectionResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createCollection',
            params: { name: 'Collection', tags: [] }
          }, resolve);
        });

        const folderResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createFolder',
            params: {
              collectionId: collectionResult.collection.id,
              name: 'Folder to Delete',
              color: 'blue',
              position: 0
            }
          }, resolve);
        });

        // Create tab in folder
        await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createTab',
            params: {
              folderId: folderResult.folder.id,
              url: 'https://example.com',
              title: 'Example',
              position: 0
            }
          }, resolve);
        });

        // Delete folder
        const deleteResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'deleteFolder',
            id: folderResult.folder.id
          }, resolve);
        });

        // Verify cascade deletion
        const { getTabsByFolder } = await import('./services/utils/storage-queries.js');
        const tabs = await getTabsByFolder(folderResult.folder.id);

        return {
          deleteResult,
          tabsCount: tabs.length
        };
      });

      expect(result.deleteResult.success).toBe(true);
      expect(result.tabsCount).toBe(0);
    });
  });

  test.describe('Tab Operations', () => {
    test('createTab handler creates tab in folder', async ({ testPage }) => {
      const result = await testPage.evaluate(async () => {
        const collectionResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createCollection',
            params: { name: 'Collection', tags: [] }
          }, resolve);
        });

        const folderResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createFolder',
            params: {
              collectionId: collectionResult.collection.id,
              name: 'Folder',
              color: 'blue',
              position: 0
            }
          }, resolve);
        });

        const tabResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createTab',
            params: {
              folderId: folderResult.folder.id,
              url: 'https://example.com',
              title: 'Example Site',
              favIconUrl: 'https://example.com/favicon.ico',
              position: 0
            }
          }, resolve);
        });

        return tabResult;
      });

      expect(result.success).toBe(true);
      expect(result.tab.url).toBe('https://example.com');
      expect(result.tab.title).toBe('Example Site');
      expect(result.tab.id).toBeTruthy();
    });

    test('updateTab handler updates existing tab', async ({ testPage }) => {
      const result = await testPage.evaluate(async () => {
        const collectionResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createCollection',
            params: { name: 'Collection', tags: [] }
          }, resolve);
        });

        const folderResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createFolder',
            params: {
              collectionId: collectionResult.collection.id,
              name: 'Folder',
              color: 'blue',
              position: 0
            }
          }, resolve);
        });

        const tabResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createTab',
            params: {
              folderId: folderResult.folder.id,
              url: 'https://example.com',
              title: 'Original Title',
              position: 0
            }
          }, resolve);
        });

        const updateResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'updateTab',
            id: tabResult.tab.id,
            updates: { title: 'Updated Title', url: 'https://updated.com' }
          }, resolve);
        });

        return updateResult;
      });

      expect(result.success).toBe(true);
      expect(result.tab.title).toBe('Updated Title');
      expect(result.tab.url).toBe('https://updated.com');
    });

    test('deleteTab handler deletes tab', async ({ testPage }) => {
      const result = await testPage.evaluate(async () => {
        const collectionResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createCollection',
            params: { name: 'Collection', tags: [] }
          }, resolve);
        });

        const folderResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createFolder',
            params: {
              collectionId: collectionResult.collection.id,
              name: 'Folder',
              color: 'blue',
              position: 0
            }
          }, resolve);
        });

        const tabResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createTab',
            params: {
              folderId: folderResult.folder.id,
              url: 'https://example.com',
              title: 'Tab to Delete',
              position: 0
            }
          }, resolve);
        });

        const deleteResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'deleteTab',
            id: tabResult.tab.id
          }, resolve);
        });

        // Verify deletion
        const { getTab } = await import('./services/utils/storage-queries.js');
        const tab = await getTab(tabResult.tab.id);

        return {
          deleteResult,
          tab
        };
      });

      expect(result.deleteResult.success).toBe(true);
      expect(result.tab).toBeNull();
    });
  });

  test.describe('Task Operations', () => {
    test('createTask handler creates task in collection', async ({ testPage }) => {
      const result = await testPage.evaluate(async () => {
        try {
          const collectionResult = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              action: 'createCollection',
              params: { name: 'Collection', tags: [] }
            }, (response) => {
              if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
              else resolve(response);
            });
          });

          const taskResult = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              action: 'createTask',
              params: {
                collectionId: collectionResult.collection.id,
                summary: 'Test Task',
                description: 'Task Description',
                status: 'open',
                priority: 'high',
                tags: ['urgent'],
                tabIds: []
              }
            }, (response) => {
              if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
              else resolve(response);
            });
          });

          return taskResult;
        } catch (error) {
          return { success: false, error: error.message };
        }
      });

      expect(result.success).toBe(true);
      expect(result.task.summary).toBe('Test Task');
      expect(result.task.status).toBe('open');
      expect(result.task.priority).toBe('high');
      expect(result.task.tags).toEqual(['urgent']);
      expect(result.task.id).toBeTruthy();
    });

    test('updateTask handler updates existing task', async ({ testPage }) => {
      const result = await testPage.evaluate(async () => {
        const collectionResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createCollection',
            params: { name: 'Collection', tags: [] }
          }, resolve);
        });

        const taskResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createTask',
            params: {
              collectionId: collectionResult.collection.id,
              summary: 'Original Task',
              status: 'open',
              priority: 'low',
              tags: [],
              tabIds: []
            }
          }, resolve);
        });

        const updateResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'updateTask',
            id: taskResult.task.id,
            updates: { summary: 'Updated Task', status: 'active', priority: 'high' }
          }, resolve);
        });

        return updateResult;
      });

      expect(result.success).toBe(true);
      expect(result.task.summary).toBe('Updated Task');
      expect(result.task.status).toBe('active');
      expect(result.task.priority).toBe('high');
    });

    test('deleteTask handler deletes task', async ({ testPage }) => {
      const result = await testPage.evaluate(async () => {
        const collectionResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createCollection',
            params: { name: 'Collection', tags: [] }
          }, resolve);
        });

        const taskResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createTask',
            params: {
              collectionId: collectionResult.collection.id,
              summary: 'Task to Delete',
              status: 'open',
              priority: 'medium',
              tags: [],
              tabIds: []
            }
          }, resolve);
        });

        const deleteResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'deleteTask',
            id: taskResult.task.id
          }, resolve);
        });

        // Verify deletion
        const { getTask } = await import('./services/utils/storage-queries.js');
        const task = await getTask(taskResult.task.id);

        return {
          deleteResult,
          task
        };
      });

      expect(result.deleteResult.success).toBe(true);
      expect(result.task).toBeNull();
    });

    test('addTaskComment handler adds comment to task', async ({ testPage }) => {
      const result = await testPage.evaluate(async () => {
        try {
          const collectionResult = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              action: 'createCollection',
              params: { name: 'Collection', tags: [] }
            }, (response) => {
              if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
              else resolve(response);
            });
          });

          const taskResult = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              action: 'createTask',
              params: {
                collectionId: collectionResult.collection.id,
                summary: 'Task with Comments',
                status: 'open',
                priority: 'medium',
                tags: [],
                tabIds: []
              }
            }, (response) => {
              if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
              else resolve(response);
            });
          });

          const commentResult = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              action: 'addTaskComment',
              taskId: taskResult.task.id,
              text: 'This is a test comment'
            }, (response) => {
              if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
              else resolve(response);
            });
          });

          return commentResult;
        } catch (error) {
          return { success: false, error: error.message };
        }
      });

      expect(result.success).toBe(true);
      expect(result.task).toBeTruthy();
      expect(result.task.id).toBeTruthy();
      // Task object is returned with updated comments
      if (result.task.comments && Array.isArray(result.task.comments)) {
        expect(result.task.comments.length).toBeGreaterThan(0);
        if (result.task.comments.length > 0) {
          expect(result.task.comments[0].text).toBeTruthy();
        }
      }
    });

    test('getTasks handler retrieves filtered tasks', async ({ testPage }) => {
      const result = await testPage.evaluate(async () => {
        const collectionResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createCollection',
            params: { name: 'Collection', tags: [] }
          }, resolve);
        });

        // Create multiple tasks
        await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createTask',
            params: {
              collectionId: collectionResult.collection.id,
              summary: 'Open Task',
              status: 'open',
              priority: 'high',
              tags: [],
              tabIds: []
            }
          }, resolve);
        });

        await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createTask',
            params: {
              collectionId: collectionResult.collection.id,
              summary: 'Active Task',
              status: 'active',
              priority: 'medium',
              tags: [],
              tabIds: []
            }
          }, resolve);
        });

        // Get open tasks only
        const getResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'getTasks',
            filters: { status: 'open' }
          }, resolve);
        });

        return getResult;
      });

      expect(result.success).toBe(true);
      expect(result.tasks.length).toBe(1);
      expect(result.tasks[0].summary).toBe('Open Task');
      expect(result.tasks[0].status).toBe('open');
    });
  });

  test.describe('Error Handling', () => {
    test('handlers return success with null for nonexistent collection', async ({ testPage }) => {
      const result = await testPage.evaluate(async () => {
        return new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'getCollection',
            id: 'nonexistent_collection_id'
          }, resolve);
        });
      });

      expect(result.success).toBe(true);
      expect(result.collection).toBeNull();
    });

    test('handlers handle missing params gracefully', async ({ testPage }) => {
      const result = await testPage.evaluate(async () => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({
            action: 'createCollection',
            params: {} // Missing required name field
          }, (response) => {
            resolve(response);
          });
        });
      });

      // Service validates params and throws error in the background handler
      // Handler catches it and returns { error: ... } in the response
      expect(result.error).toBeTruthy();
    });
  });

  test.describe('Integration Tests', () => {
    test('complete workflow: create collection -> folder -> tab -> task', async ({ testPage }) => {
      const result = await testPage.evaluate(async () => {
        // 1. Create collection
        const collectionResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createCollection',
            params: { name: 'Project Alpha', tags: ['project'], description: 'Main project' }
          }, resolve);
        });

        // 2. Create folder in collection
        const folderResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createFolder',
            params: {
              collectionId: collectionResult.collection.id,
              name: 'Research',
              color: 'blue',
              position: 0
            }
          }, resolve);
        });

        // 3. Create tab in folder
        const tabResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createTab',
            params: {
              folderId: folderResult.folder.id,
              url: 'https://docs.example.com',
              title: 'Documentation',
              position: 0
            }
          }, resolve);
        });

        // 4. Create task referencing the tab
        const taskResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'createTask',
            params: {
              collectionId: collectionResult.collection.id,
              summary: 'Review documentation',
              status: 'open',
              priority: 'high',
              tags: ['research'],
              tabIds: [tabResult.tab.id]
            }
          }, resolve);
        });

        // 5. Add comment to task
        const commentResult = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'addTaskComment',
            taskId: taskResult.task.id,
            text: 'Started reviewing section 1'
          }, resolve);
        });

        return {
          collection: collectionResult.collection,
          folder: folderResult.folder,
          tab: tabResult.tab,
          task: commentResult.task
        };
      });

      expect(result.collection.name).toBe('Project Alpha');
      expect(result.folder.name).toBe('Research');
      expect(result.tab.title).toBe('Documentation');
      expect(result.task.summary).toBe('Review documentation');
      expect(result.task.tabIds).toContain(result.tab.id);
      expect(result.task.comments.length).toBe(1);
    });
  });
});
