/**
 * Unit tests for storage query utilities (storage-queries.js)
 *
 * Tests CRUD operations for all 4 object stores, cascade deletes,
 * batch operations, and foreign key relationships.
 * Uses fake-indexeddb for in-memory database simulation.
 */

import 'fake-indexeddb/auto';
import { closeDB } from '../services/utils/db.js';
import {
  // Collections
  getCollection,
  getAllCollections,
  getCollectionsByIndex,
  saveCollection,
  deleteCollection,
  // Folders
  getFolder,
  getFoldersByCollection,
  saveFolder,
  deleteFolder,
  // Tabs
  getTab,
  getTabsByFolder,
  saveTab,
  deleteTab,
  // Tasks
  getTask,
  getAllTasks,
  getTasksByCollection,
  getTasksByIndex,
  saveTask,
  deleteTask,
  // Batch
  saveTabs,
  saveFolders,
  getCompleteCollection,
  findTabByRuntimeId
} from '../services/utils/storage-queries.js';

describe('storage-queries.js - Storage Query Utilities', () => {
  beforeEach(async () => {
    closeDB();
    const databases = await indexedDB.databases();
    for (const db of databases) {
      indexedDB.deleteDatabase(db.name);
    }
  });

  afterEach(() => {
    closeDB();
  });

  // ==========================================================================
  // COLLECTIONS
  // ==========================================================================

  describe('Collections', () => {
    test('saveCollection creates new collection', async () => {
      const collection = {
        id: 'col_1',
        name: 'Test Collection',
        description: 'Test description',
        icon: '📁',
        color: '#4285F4',
        tags: ['work', 'urgent'],
        windowId: null,
        isActive: false,
        metadata: {
          createdAt: Date.now(),
          lastAccessed: Date.now()
        }
      };

      const id = await saveCollection(collection);

      expect(id).toBe('col_1');

      const saved = await getCollection('col_1');
      expect(saved.name).toBe('Test Collection');
      expect(saved.tags).toEqual(['work', 'urgent']);
    });

    test('saveCollection updates existing collection', async () => {
      const collection = {
        id: 'col_update',
        name: 'Original Name',
        tags: [],
        isActive: false,
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      };

      await saveCollection(collection);

      collection.name = 'Updated Name';
      await saveCollection(collection);

      const saved = await getCollection('col_update');
      expect(saved.name).toBe('Updated Name');
    });

    test('getCollection returns null for non-existent collection', async () => {
      const result = await getCollection('nonexistent');
      expect(result).toBeNull();
    });

    test('getAllCollections returns all collections', async () => {
      await saveCollection({
        id: 'col_all_1',
        name: 'Collection 1',
        tags: [],
        isActive: false,
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });
      await saveCollection({
        id: 'col_all_2',
        name: 'Collection 2',
        tags: [],
        isActive: true,
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      const all = await getAllCollections();

      expect(all).toHaveLength(2);
      expect(all.find(c => c.id === 'col_all_1')).toBeDefined();
      expect(all.find(c => c.id === 'col_all_2')).toBeDefined();
    });

    test('getCollectionsByIndex filters by isActive', async () => {
      // Uses index.getAll() - see KNOWN_LIMITATIONS.md
      await saveCollection({
        id: 'col_active',
        name: 'Active',
        tags: [],
        isActive: true,
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });
      await saveCollection({
        id: 'col_saved',
        name: 'Saved',
        tags: [],
        isActive: false,
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      const active = await getCollectionsByIndex('isActive', true);
      const saved = await getCollectionsByIndex('isActive', false);

      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('col_active');
      expect(saved).toHaveLength(1);
      expect(saved[0].id).toBe('col_saved');
    });

    test('getCollectionsByIndex filters by tags (multi-entry)', async () => {
      await saveCollection({
        id: 'col_tag_1',
        name: 'Work Collection',
        tags: ['work', 'urgent'],
        isActive: false,
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });
      await saveCollection({
        id: 'col_tag_2',
        name: 'Personal Collection',
        tags: ['personal'],
        isActive: false,
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      const workCollections = await getCollectionsByIndex('tags', 'work');

      expect(workCollections).toHaveLength(1);
      expect(workCollections[0].id).toBe('col_tag_1');
    });

    test('deleteCollection removes collection only', async () => {
      await saveCollection({
        id: 'col_del',
        name: 'Delete Test',
        tags: [],
        isActive: false,
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await deleteCollection('col_del');

      const result = await getCollection('col_del');
      expect(result).toBeNull();
    });

    test('deleteCollection cascades to folders and tabs', async () => {
      // Create collection
      await saveCollection({
        id: 'col_cascade',
        name: 'Cascade Test',
        tags: [],
        isActive: false,
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      // Create folder
      await saveFolder({
        id: 'folder_cascade',
        collectionId: 'col_cascade',
        name: 'Test Folder',
        color: 'blue',
        collapsed: false,
        position: 0
      });

      // Create tab
      await saveTab({
        id: 'tab_cascade',
        folderId: 'folder_cascade',
        url: 'https://example.com',
        title: 'Example',
        position: 0
      });

      // Delete collection
      await deleteCollection('col_cascade');

      // Verify cascade
      const collection = await getCollection('col_cascade');
      const folder = await getFolder('folder_cascade');
      const tab = await getTab('tab_cascade');

      expect(collection).toBeNull();
      expect(folder).toBeNull();
      expect(tab).toBeNull();
    });

    test('deleteCollection cascades to tasks', async () => {
      await saveCollection({
        id: 'col_task_cascade',
        name: 'Task Cascade',
        tags: [],
        isActive: false,
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await saveTask({
        id: 'task_cascade',
        summary: 'Test Task',
        status: 'open',
        priority: 'medium',
        tags: [],
        collectionId: 'col_task_cascade',
        tabIds: [],
        comments: [],
        createdAt: Date.now()
      });

      await deleteCollection('col_task_cascade');

      const task = await getTask('task_cascade');
      expect(task).toBeNull();
    });
  });

  // ==========================================================================
  // FOLDERS
  // ==========================================================================

  describe('Folders', () => {
    beforeEach(async () => {
      // Create parent collection for folders
      await saveCollection({
        id: 'col_parent',
        name: 'Parent Collection',
        tags: [],
        isActive: false,
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });
    });

    test('saveFolder creates new folder', async () => {
      const folder = {
        id: 'folder_1',
        collectionId: 'col_parent',
        name: 'Documentation',
        color: 'blue',
        collapsed: false,
        position: 0
      };

      const id = await saveFolder(folder);

      expect(id).toBe('folder_1');

      const saved = await getFolder('folder_1');
      expect(saved.name).toBe('Documentation');
      expect(saved.collectionId).toBe('col_parent');
    });

    test('saveFolder updates existing folder', async () => {
      const folder = {
        id: 'folder_update',
        collectionId: 'col_parent',
        name: 'Original',
        color: 'blue',
        collapsed: false,
        position: 0
      };

      await saveFolder(folder);

      folder.name = 'Updated';
      folder.color = 'red';
      await saveFolder(folder);

      const saved = await getFolder('folder_update');
      expect(saved.name).toBe('Updated');
      expect(saved.color).toBe('red');
    });

    test('getFolder returns null for non-existent folder', async () => {
      const result = await getFolder('nonexistent');
      expect(result).toBeNull();
    });

    test('getFoldersByCollection returns all folders in collection', async () => {
      await saveFolder({
        id: 'folder_col_1',
        collectionId: 'col_parent',
        name: 'Folder 1',
        color: 'blue',
        collapsed: false,
        position: 0
      });
      await saveFolder({
        id: 'folder_col_2',
        collectionId: 'col_parent',
        name: 'Folder 2',
        color: 'red',
        collapsed: false,
        position: 1
      });

      const folders = await getFoldersByCollection('col_parent');

      expect(folders).toHaveLength(2);
      expect(folders.find(f => f.id === 'folder_col_1')).toBeDefined();
      expect(folders.find(f => f.id === 'folder_col_2')).toBeDefined();
    });

    test('deleteFolder removes folder only', async () => {
      await saveFolder({
        id: 'folder_del',
        collectionId: 'col_parent',
        name: 'Delete Test',
        color: 'blue',
        collapsed: false,
        position: 0
      });

      await deleteFolder('folder_del');

      const result = await getFolder('folder_del');
      expect(result).toBeNull();
    });

    test('deleteFolder cascades to tabs', async () => {
      await saveFolder({
        id: 'folder_tab_cascade',
        collectionId: 'col_parent',
        name: 'Cascade Folder',
        color: 'blue',
        collapsed: false,
        position: 0
      });

      await saveTab({
        id: 'tab_folder_cascade',
        folderId: 'folder_tab_cascade',
        url: 'https://example.com',
        title: 'Example',
        position: 0
      });

      await deleteFolder('folder_tab_cascade');

      const folder = await getFolder('folder_tab_cascade');
      const tab = await getTab('tab_folder_cascade');

      expect(folder).toBeNull();
      expect(tab).toBeNull();
    });
  });

  // ==========================================================================
  // TABS
  // ==========================================================================

  describe('Tabs', () => {
    beforeEach(async () => {
      await saveCollection({
        id: 'col_tabs',
        name: 'Tabs Collection',
        tags: [],
        isActive: false,
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await saveFolder({
        id: 'folder_tabs',
        collectionId: 'col_tabs',
        name: 'Tabs Folder',
        color: 'blue',
        collapsed: false,
        position: 0
      });
    });

    test('saveTab creates new tab', async () => {
      const tab = {
        id: 'tab_1',
        folderId: 'folder_tabs',
        url: 'https://example.com',
        title: 'Example Page',
        favicon: 'data:image/png;base64,...',
        note: 'Test note',
        position: 0,
        isPinned: false,
        lastAccess: Date.now(),
        tabId: 567
      };

      const id = await saveTab(tab);

      expect(id).toBe('tab_1');

      const saved = await getTab('tab_1');
      expect(saved.url).toBe('https://example.com');
      expect(saved.note).toBe('Test note');
      expect(saved.tabId).toBe(567);
    });

    test('saveTab updates existing tab', async () => {
      const tab = {
        id: 'tab_update',
        folderId: 'folder_tabs',
        url: 'https://example.com',
        title: 'Original',
        position: 0
      };

      await saveTab(tab);

      tab.note = 'Added note';
      tab.isPinned = true;
      await saveTab(tab);

      const saved = await getTab('tab_update');
      expect(saved.note).toBe('Added note');
      expect(saved.isPinned).toBe(true);
    });

    test('getTab returns null for non-existent tab', async () => {
      const result = await getTab('nonexistent');
      expect(result).toBeNull();
    });

    test('getTabsByFolder returns all tabs in folder', async () => {
      await saveTab({
        id: 'tab_folder_1',
        folderId: 'folder_tabs',
        url: 'https://example.com/1',
        title: 'Page 1',
        position: 0
      });
      await saveTab({
        id: 'tab_folder_2',
        folderId: 'folder_tabs',
        url: 'https://example.com/2',
        title: 'Page 2',
        position: 1
      });

      const tabs = await getTabsByFolder('folder_tabs');

      expect(tabs).toHaveLength(2);
      expect(tabs.find(t => t.id === 'tab_folder_1')).toBeDefined();
      expect(tabs.find(t => t.id === 'tab_folder_2')).toBeDefined();
    });

    test('deleteTab removes tab', async () => {
      await saveTab({
        id: 'tab_del',
        folderId: 'folder_tabs',
        url: 'https://example.com',
        title: 'Delete Test',
        position: 0
      });

      await deleteTab('tab_del');

      const result = await getTab('tab_del');
      expect(result).toBeNull();
    });

    test('tabs support dual ID system (storage ID + runtime tabId)', async () => {
      await saveTab({
        id: 'tab_dual_id',
        folderId: 'folder_tabs',
        url: 'https://example.com',
        title: 'Dual ID Test',
        position: 0,
        tabId: null // Initially no Chrome tab
      });

      // Simulate collection activation (Chrome tab created)
      const tab = await getTab('tab_dual_id');
      tab.tabId = 123; // Assign Chrome tab ID
      await saveTab(tab);

      const updated = await getTab('tab_dual_id');
      expect(updated.id).toBe('tab_dual_id'); // Storage ID unchanged
      expect(updated.tabId).toBe(123); // Runtime ID set
    });
  });

  // ==========================================================================
  // TASKS
  // ==========================================================================

  describe('Tasks', () => {
    beforeEach(async () => {
      await saveCollection({
        id: 'col_tasks',
        name: 'Tasks Collection',
        tags: [],
        isActive: false,
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });
    });

    test('saveTask creates new task', async () => {
      const task = {
        id: 'task_1',
        summary: 'Fix authentication bug',
        notes: 'Detailed notes here',
        status: 'open',
        priority: 'high',
        dueDate: Date.now() + 86400000,
        tags: ['bug', 'backend'],
        collectionId: 'col_tasks',
        tabIds: ['tab_1', 'tab_2'],
        comments: [
          { id: 'comment_1', text: 'Test comment', createdAt: Date.now() }
        ],
        createdAt: Date.now()
      };

      const id = await saveTask(task);

      expect(id).toBe('task_1');

      const saved = await getTask('task_1');
      expect(saved.summary).toBe('Fix authentication bug');
      expect(saved.tabIds).toEqual(['tab_1', 'tab_2']);
      expect(saved.comments).toHaveLength(1);
    });

    test('saveTask updates existing task', async () => {
      const task = {
        id: 'task_update',
        summary: 'Original summary',
        status: 'open',
        priority: 'medium',
        tags: [],
        collectionId: 'col_tasks',
        tabIds: [],
        comments: [],
        createdAt: Date.now()
      };

      await saveTask(task);

      task.status = 'fixed';
      task.completedAt = Date.now();
      await saveTask(task);

      const saved = await getTask('task_update');
      expect(saved.status).toBe('fixed');
      expect(saved.completedAt).toBeDefined();
    });

    test('getTask returns null for non-existent task', async () => {
      const result = await getTask('nonexistent');
      expect(result).toBeNull();
    });

    test('getAllTasks returns all tasks', async () => {
      await saveTask({
        id: 'task_all_1',
        summary: 'Task 1',
        status: 'open',
        priority: 'medium',
        tags: [],
        collectionId: 'col_tasks',
        tabIds: [],
        comments: [],
        createdAt: Date.now()
      });
      await saveTask({
        id: 'task_all_2',
        summary: 'Task 2',
        status: 'active',
        priority: 'high',
        tags: [],
        collectionId: 'col_tasks',
        tabIds: [],
        comments: [],
        createdAt: Date.now()
      });

      const all = await getAllTasks();

      expect(all).toHaveLength(2);
    });

    test('getTasksByCollection returns tasks in collection', async () => {
      await saveCollection({
        id: 'col_tasks_2',
        name: 'Second Collection',
        tags: [],
        isActive: false,
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await saveTask({
        id: 'task_col_1',
        summary: 'Task in collection 1',
        status: 'open',
        priority: 'medium',
        tags: [],
        collectionId: 'col_tasks',
        tabIds: [],
        comments: [],
        createdAt: Date.now()
      });
      await saveTask({
        id: 'task_col_2',
        summary: 'Task in collection 2',
        status: 'open',
        priority: 'medium',
        tags: [],
        collectionId: 'col_tasks_2',
        tabIds: [],
        comments: [],
        createdAt: Date.now()
      });

      const tasksInCol1 = await getTasksByCollection('col_tasks');

      expect(tasksInCol1).toHaveLength(1);
      expect(tasksInCol1[0].id).toBe('task_col_1');
    });

    test('getTasksByIndex filters by status', async () => {
      await saveTask({
        id: 'task_status_open',
        summary: 'Open task',
        status: 'open',
        priority: 'medium',
        tags: [],
        collectionId: 'col_tasks',
        tabIds: [],
        comments: [],
        createdAt: Date.now()
      });
      await saveTask({
        id: 'task_status_fixed',
        summary: 'Fixed task',
        status: 'fixed',
        priority: 'medium',
        tags: [],
        collectionId: 'col_tasks',
        tabIds: [],
        comments: [],
        createdAt: Date.now(),
        completedAt: Date.now()
      });

      const openTasks = await getTasksByIndex('status', 'open');
      const fixedTasks = await getTasksByIndex('status', 'fixed');

      expect(openTasks).toHaveLength(1);
      expect(openTasks[0].id).toBe('task_status_open');
      expect(fixedTasks).toHaveLength(1);
      expect(fixedTasks[0].id).toBe('task_status_fixed');
    });

    test('getTasksByIndex filters by priority', async () => {
      await saveTask({
        id: 'task_pri_high',
        summary: 'High priority',
        status: 'open',
        priority: 'high',
        tags: [],
        collectionId: 'col_tasks',
        tabIds: [],
        comments: [],
        createdAt: Date.now()
      });
      await saveTask({
        id: 'task_pri_low',
        summary: 'Low priority',
        status: 'open',
        priority: 'low',
        tags: [],
        collectionId: 'col_tasks',
        tabIds: [],
        comments: [],
        createdAt: Date.now()
      });

      const highTasks = await getTasksByIndex('priority', 'high');

      expect(highTasks).toHaveLength(1);
      expect(highTasks[0].id).toBe('task_pri_high');
    });

    test('getTasksByIndex filters by tags (multi-entry)', async () => {
      await saveTask({
        id: 'task_tag_bug',
        summary: 'Bug task',
        status: 'open',
        priority: 'medium',
        tags: ['bug', 'backend'],
        collectionId: 'col_tasks',
        tabIds: [],
        comments: [],
        createdAt: Date.now()
      });
      await saveTask({
        id: 'task_tag_feature',
        summary: 'Feature task',
        status: 'open',
        priority: 'medium',
        tags: ['feature', 'frontend'],
        collectionId: 'col_tasks',
        tabIds: [],
        comments: [],
        createdAt: Date.now()
      });

      const bugTasks = await getTasksByIndex('tags', 'bug');

      expect(bugTasks).toHaveLength(1);
      expect(bugTasks[0].id).toBe('task_tag_bug');
    });

    test('deleteTask removes task', async () => {
      await saveTask({
        id: 'task_del',
        summary: 'Delete test',
        status: 'open',
        priority: 'medium',
        tags: [],
        collectionId: 'col_tasks',
        tabIds: [],
        comments: [],
        createdAt: Date.now()
      });

      await deleteTask('task_del');

      const result = await getTask('task_del');
      expect(result).toBeNull();
    });

    test('tasks support nullable collectionId (uncategorized)', async () => {
      await saveTask({
        id: 'task_uncategorized',
        summary: 'Uncategorized task',
        status: 'open',
        priority: 'medium',
        tags: [],
        collectionId: null, // No collection
        tabIds: [],
        comments: [],
        createdAt: Date.now()
      });

      const saved = await getTask('task_uncategorized');
      expect(saved.collectionId).toBeNull();
    });
  });

  // ==========================================================================
  // BATCH OPERATIONS
  // ==========================================================================

  describe('Batch Operations', () => {
    beforeEach(async () => {
      await saveCollection({
        id: 'col_batch',
        name: 'Batch Collection',
        tags: [],
        isActive: false,
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await saveFolder({
        id: 'folder_batch',
        collectionId: 'col_batch',
        name: 'Batch Folder',
        color: 'blue',
        collapsed: false,
        position: 0
      });
    });

    test('saveTabs saves multiple tabs atomically', async () => {
      const tabs = [
        {
          id: 'tab_batch_1',
          folderId: 'folder_batch',
          url: 'https://example.com/1',
          title: 'Page 1',
          position: 0
        },
        {
          id: 'tab_batch_2',
          folderId: 'folder_batch',
          url: 'https://example.com/2',
          title: 'Page 2',
          position: 1
        },
        {
          id: 'tab_batch_3',
          folderId: 'folder_batch',
          url: 'https://example.com/3',
          title: 'Page 3',
          position: 2
        }
      ];

      const ids = await saveTabs(tabs);

      expect(ids).toHaveLength(3);
      expect(ids).toEqual(['tab_batch_1', 'tab_batch_2', 'tab_batch_3']);

      const savedTabs = await getTabsByFolder('folder_batch');
      expect(savedTabs).toHaveLength(3);
    });

    test('saveFolders saves multiple folders atomically', async () => {
      const folders = [
        {
          id: 'folder_batch_1',
          collectionId: 'col_batch',
          name: 'Folder 1',
          color: 'blue',
          collapsed: false,
          position: 0
        },
        {
          id: 'folder_batch_2',
          collectionId: 'col_batch',
          name: 'Folder 2',
          color: 'red',
          collapsed: false,
          position: 1
        }
      ];

      const ids = await saveFolders(folders);

      expect(ids).toHaveLength(2);
      expect(ids).toEqual(['folder_batch_1', 'folder_batch_2']);

      const savedFolders = await getFoldersByCollection('col_batch');
      // +1 for the folder created in beforeEach
      expect(savedFolders.length).toBeGreaterThanOrEqual(2);
    });

    test('getCompleteCollection returns hierarchical structure', async () => {
      // Create second folder
      await saveFolder({
        id: 'folder_complete_2',
        collectionId: 'col_batch',
        name: 'Folder 2',
        color: 'red',
        collapsed: false,
        position: 1
      });

      // Create tabs
      await saveTab({
        id: 'tab_complete_1',
        folderId: 'folder_batch',
        url: 'https://example.com/1',
        title: 'Page 1',
        position: 0
      });
      await saveTab({
        id: 'tab_complete_2',
        folderId: 'folder_batch',
        url: 'https://example.com/2',
        title: 'Page 2',
        position: 1
      });
      await saveTab({
        id: 'tab_complete_3',
        folderId: 'folder_complete_2',
        url: 'https://example.com/3',
        title: 'Page 3',
        position: 0
      });

      const complete = await getCompleteCollection('col_batch');

      expect(complete).toBeDefined();
      expect(complete.id).toBe('col_batch');
      expect(complete.folders).toHaveLength(2);

      // Check folder 1 has 2 tabs
      const folder1 = complete.folders.find(f => f.id === 'folder_batch');
      expect(folder1.tabs).toHaveLength(2);
      expect(folder1.tabs[0].position).toBe(0);
      expect(folder1.tabs[1].position).toBe(1);

      // Check folder 2 has 1 tab
      const folder2 = complete.folders.find(f => f.id === 'folder_complete_2');
      expect(folder2.tabs).toHaveLength(1);
    });

    test('getCompleteCollection returns null for non-existent collection', async () => {
      const result = await getCompleteCollection('nonexistent');
      expect(result).toBeNull();
    });

    test('getCompleteCollection sorts folders and tabs by position', async () => {
      // Uses index queries to get folders/tabs - see KNOWN_LIMITATIONS.md
      // Create a separate collection to avoid conflicts with beforeEach
      await saveCollection({
        id: 'col_sort_test',
        name: 'Sort Test Collection',
        tags: [],
        isActive: false,
        metadata: { createdAt: Date.now(), lastAccessed: Date.now() }
      });

      await saveFolder({
        id: 'folder_pos_1',
        collectionId: 'col_sort_test',
        name: 'Second',
        color: 'red',
        collapsed: false,
        position: 1
      });
      await saveFolder({
        id: 'folder_pos_0',
        collectionId: 'col_sort_test',
        name: 'First',
        color: 'blue',
        collapsed: false,
        position: 0
      });

      await saveTab({
        id: 'tab_pos_1',
        folderId: 'folder_pos_0',
        url: 'https://example.com/2',
        title: 'Second Tab',
        position: 1
      });
      await saveTab({
        id: 'tab_pos_0',
        folderId: 'folder_pos_0',
        url: 'https://example.com/1',
        title: 'First Tab',
        position: 0
      });

      const complete = await getCompleteCollection('col_sort_test');

      // Folders sorted by position
      expect(complete.folders[0].name).toBe('First');
      expect(complete.folders[1].name).toBe('Second');

      // Tabs sorted by position
      const firstFolder = complete.folders.find(f => f.id === 'folder_pos_0');
      expect(firstFolder.tabs[0].title).toBe('First Tab');
      expect(firstFolder.tabs[1].title).toBe('Second Tab');
    });

    test('findTabByRuntimeId finds tab by Chrome tabId', async () => {
      await saveTab({
        id: 'tab_runtime_1',
        folderId: 'folder_batch',
        url: 'https://example.com/1',
        title: 'Page 1',
        position: 0,
        tabId: 567
      });
      await saveTab({
        id: 'tab_runtime_2',
        folderId: 'folder_batch',
        url: 'https://example.com/2',
        title: 'Page 2',
        position: 1,
        tabId: 568
      });

      const found = await findTabByRuntimeId(567);

      expect(found).toBeDefined();
      expect(found.id).toBe('tab_runtime_1');
      expect(found.tabId).toBe(567);
    });

    test('findTabByRuntimeId returns null for non-existent runtime ID', async () => {
      const result = await findTabByRuntimeId(999);
      expect(result).toBeNull();
    });
  });
});
