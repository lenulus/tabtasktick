/**
 * TaskService Tests
 *
 * Tests for task creation, updating, deletion, comment management, and validation.
 * Uses real storage utilities with fake-indexeddb for integration testing.
 */

import 'fake-indexeddb/auto';
import { closeDB } from '../services/utils/db.js';
import * as TaskService from '../services/execution/TaskService.js';
import * as CollectionService from '../services/execution/CollectionService.js';
import * as FolderService from '../services/execution/FolderService.js';
import * as TabService from '../services/execution/TabService.js';

describe('TaskService', () => {
  beforeEach(async () => {
    // Close any existing connection and clear all databases
    closeDB();
    const databases = await indexedDB.databases();
    for (const db of databases) {
      indexedDB.deleteDatabase(db.name);
    }
  });

  afterEach(() => {
    closeDB();
  });

  describe('createTask', () => {
    test('creates task with required fields only', async () => {
      const params = {
        summary: 'Fix authentication bug'
      };

      const result = await TaskService.createTask(params);

      expect(result).toMatchObject({
        summary: 'Fix authentication bug',
        status: 'open',
        priority: 'medium',
        collectionId: null,
        tabIds: [],
        tags: [],
        comments: []
      });
      expect(result.id).toMatch(/^[a-f0-9-]{36}$/); // UUID format
      expect(result.createdAt).toBeDefined();
      expect(result.completedAt).toBeUndefined();
    });

    test('creates task with all optional fields', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Test Collection'
      });

      const params = {
        summary: 'Complex task',
        notes: 'Long description here',
        status: 'active',
        priority: 'high',
        dueDate: Date.now() + 86400000,
        tags: ['bug', 'urgent'],
        collectionId: collection.id,
        tabIds: []
      };

      const result = await TaskService.createTask(params);

      expect(result.summary).toBe('Complex task');
      expect(result.notes).toBe('Long description here');
      expect(result.status).toBe('active');
      expect(result.priority).toBe('high');
      expect(result.dueDate).toBeDefined();
      expect(result.tags).toEqual(['bug', 'urgent']);
      expect(result.collectionId).toBe(collection.id);
      expect(result.tabIds).toEqual([]);
    });

    test('creates uncategorized task (null collectionId)', async () => {
      const params = {
        summary: 'Uncategorized task',
        collectionId: null
      };

      const result = await TaskService.createTask(params);

      expect(result.collectionId).toBe(null);
    });

    test('creates task with tab references', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Test Collection'
      });

      const folder = await FolderService.createFolder({
        collectionId: collection.id,
        name: 'Test Folder',
        color: 'blue',
        position: 0
      });

      const tab1 = await TabService.createTab({
        folderId: folder.id,
        url: 'https://example.com/1',
        title: 'Tab 1',
        position: 0
      });

      const tab2 = await TabService.createTab({
        folderId: folder.id,
        url: 'https://example.com/2',
        title: 'Tab 2',
        position: 1
      });

      const params = {
        summary: 'Task with tabs',
        collectionId: collection.id,
        tabIds: [tab1.id, tab2.id]
      };

      const result = await TaskService.createTask(params);

      expect(result.tabIds).toEqual([tab1.id, tab2.id]);
    });

    test('throws error if summary is missing', async () => {
      await expect(TaskService.createTask({}))
        .rejects.toThrow('Task summary is required');
    });

    test('throws error if summary is empty', async () => {
      await expect(TaskService.createTask({ summary: '' }))
        .rejects.toThrow('Task summary is required');
    });

    test('throws error if status is invalid', async () => {
      await expect(TaskService.createTask({
        summary: 'Test',
        status: 'invalid'
      })).rejects.toThrow('Invalid task status');
    });

    test('throws error if priority is invalid', async () => {
      await expect(TaskService.createTask({
        summary: 'Test',
        priority: 'invalid'
      })).rejects.toThrow('Invalid task priority');
    });
  });

  describe('updateTask', () => {
    test('updates task with merged fields', async () => {
      const created = await TaskService.createTask({
        summary: 'Old summary',
        notes: 'Old notes',
        tags: ['old']
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await TaskService.updateTask(created.id, {
        summary: 'New summary',
        notes: 'New notes'
      });

      expect(result.summary).toBe('New summary');
      expect(result.notes).toBe('New notes');
      expect(result.id).toBe(created.id);
      expect(result.tags).toEqual(['old']); // Unchanged
      expect(result.createdAt).toBe(created.createdAt); // Unchanged
    });

    test('allows updating tags', async () => {
      const created = await TaskService.createTask({
        summary: 'Test',
        tags: ['old']
      });

      const result = await TaskService.updateTask(created.id, {
        tags: ['new', 'tags']
      });

      expect(result.tags).toEqual(['new', 'tags']);
    });

    test('does not allow updating id field', async () => {
      const created = await TaskService.createTask({
        summary: 'Test'
      });

      const result = await TaskService.updateTask(created.id, {
        id: 'task_HACKED',
        summary: 'Updated'
      });

      expect(result.id).toBe(created.id); // Original ID preserved
      expect(result.summary).toBe('Updated');
    });

    test('does not allow updating createdAt', async () => {
      const created = await TaskService.createTask({
        summary: 'Test'
      });

      const result = await TaskService.updateTask(created.id, {
        createdAt: Date.now() + 10000000
      });

      expect(result.createdAt).toBe(created.createdAt); // Unchanged
    });

    test('sets completedAt when status changes to fixed', async () => {
      const created = await TaskService.createTask({
        summary: 'Test',
        status: 'active'
      });

      expect(created.completedAt).toBeUndefined();

      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await TaskService.updateTask(created.id, {
        status: 'fixed'
      });

      expect(result.status).toBe('fixed');
      expect(result.completedAt).toBeDefined();
      expect(result.completedAt).toBeGreaterThan(created.createdAt);
    });

    test('sets completedAt when status changes to abandoned', async () => {
      const created = await TaskService.createTask({
        summary: 'Test',
        status: 'open'
      });

      const result = await TaskService.updateTask(created.id, {
        status: 'abandoned'
      });

      expect(result.status).toBe('abandoned');
      expect(result.completedAt).toBeDefined();
    });

    test('does not update completedAt if already set', async () => {
      const created = await TaskService.createTask({
        summary: 'Test',
        status: 'open'
      });

      const fixed = await TaskService.updateTask(created.id, {
        status: 'fixed'
      });

      const originalCompletedAt = fixed.completedAt;

      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await TaskService.updateTask(created.id, {
        notes: 'Additional notes'
      });

      expect(updated.completedAt).toBe(originalCompletedAt); // Unchanged
    });

    test('validates tabIds reference tabs in collection', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Test Collection'
      });

      const folder = await FolderService.createFolder({
        collectionId: collection.id,
        name: 'Test Folder',
        color: 'blue',
        position: 0
      });

      const tab = await TabService.createTab({
        folderId: folder.id,
        url: 'https://example.com',
        title: 'Tab',
        position: 0
      });

      const task = await TaskService.createTask({
        summary: 'Test',
        collectionId: collection.id,
        tabIds: []
      });

      // Valid update - tab in same collection
      const validUpdate = await TaskService.updateTask(task.id, {
        tabIds: [tab.id]
      });

      expect(validUpdate.tabIds).toEqual([tab.id]);

      // Invalid update - fake tab ID
      await expect(TaskService.updateTask(task.id, {
        tabIds: ['tab_fake']
      })).rejects.toThrow('Invalid tab reference');
    });

    test('allows updating tabIds for uncategorized task', async () => {
      const task = await TaskService.createTask({
        summary: 'Uncategorized',
        collectionId: null,
        tabIds: []
      });

      // Should not validate tabIds if collectionId is null
      const result = await TaskService.updateTask(task.id, {
        tabIds: ['tab_any']
      });

      expect(result.tabIds).toEqual(['tab_any']);
    });

    test('throws error if task not found', async () => {
      await expect(TaskService.updateTask('task_999', { summary: 'New' }))
        .rejects.toThrow('Task not found: task_999');
    });

    test('throws error if summary is empty string', async () => {
      const created = await TaskService.createTask({
        summary: 'Test'
      });

      await expect(TaskService.updateTask(created.id, { summary: '' }))
        .rejects.toThrow('Task summary cannot be empty');
    });

    test('throws error if tags is not array', async () => {
      const created = await TaskService.createTask({
        summary: 'Test'
      });

      await expect(TaskService.updateTask(created.id, {
        tags: 'not-an-array'
      })).rejects.toThrow('Tags must be an array');
    });

    test('throws error if tabIds is not array', async () => {
      const created = await TaskService.createTask({
        summary: 'Test'
      });

      await expect(TaskService.updateTask(created.id, {
        tabIds: 'not-an-array'
      })).rejects.toThrow('Tab IDs must be an array');
    });
  });

  describe('deleteTask', () => {
    test('deletes task from storage', async () => {
      const created = await TaskService.createTask({
        summary: 'Test'
      });

      await TaskService.deleteTask(created.id);

      // Verify deletion by trying to update (should fail)
      await expect(TaskService.updateTask(created.id, { summary: 'New' }))
        .rejects.toThrow('Task not found');
    });
  });

  describe('addComment', () => {
    test('adds comment to task', async () => {
      const task = await TaskService.createTask({
        summary: 'Test'
      });

      const result = await TaskService.addComment(task.id, 'First comment');

      expect(result.comments).toHaveLength(1);
      expect(result.comments[0]).toMatchObject({
        text: 'First comment'
      });
      expect(result.comments[0].id).toMatch(/^[a-f0-9-]{36}$/);
      expect(result.comments[0].createdAt).toBeDefined();
    });

    test('adds multiple comments', async () => {
      const task = await TaskService.createTask({
        summary: 'Test'
      });

      await TaskService.addComment(task.id, 'First comment');
      await new Promise(resolve => setTimeout(resolve, 10));
      const result = await TaskService.addComment(task.id, 'Second comment');

      expect(result.comments).toHaveLength(2);
      expect(result.comments[0].text).toBe('First comment');
      expect(result.comments[1].text).toBe('Second comment');
      expect(result.comments[1].createdAt).toBeGreaterThan(result.comments[0].createdAt);
    });

    test('throws error if comment text is empty', async () => {
      const task = await TaskService.createTask({
        summary: 'Test'
      });

      await expect(TaskService.addComment(task.id, ''))
        .rejects.toThrow('Comment text is required');
    });

    test('throws error if task not found', async () => {
      await expect(TaskService.addComment('task_999', 'Comment'))
        .rejects.toThrow('Task not found');
    });
  });

  describe('getTasksByCollection', () => {
    test('gets tasks for collection sorted by createdAt', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Test Collection'
      });

      const task1 = await TaskService.createTask({
        summary: 'First task',
        collectionId: collection.id
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const task2 = await TaskService.createTask({
        summary: 'Second task',
        collectionId: collection.id
      });

      const result = await TaskService.getTasksByCollection(collection.id);

      expect(result).toHaveLength(2);
      // Sorted newest first
      expect(result[0].id).toBe(task2.id);
      expect(result[1].id).toBe(task1.id);
    });

    test('returns empty array for collection with no tasks', async () => {
      const collection = await CollectionService.createCollection({
        name: 'Test Collection'
      });

      const result = await TaskService.getTasksByCollection(collection.id);

      expect(result).toEqual([]);
    });

    test('does not include tasks from other collections', async () => {
      const collection1 = await CollectionService.createCollection({
        name: 'Collection 1'
      });

      const collection2 = await CollectionService.createCollection({
        name: 'Collection 2'
      });

      await TaskService.createTask({
        summary: 'Task 1',
        collectionId: collection1.id
      });

      await TaskService.createTask({
        summary: 'Task 2',
        collectionId: collection2.id
      });

      const result = await TaskService.getTasksByCollection(collection1.id);

      expect(result).toHaveLength(1);
      expect(result[0].summary).toBe('Task 1');
    });
  });

  describe('validation edge cases', () => {
    test('validates status values', async () => {
      const validStatuses = ['open', 'active', 'fixed', 'abandoned'];

      for (const status of validStatuses) {
        const task = await TaskService.createTask({
          summary: 'Test',
          status
        });
        expect(task.status).toBe(status);
      }
    });

    test('validates priority values', async () => {
      const validPriorities = ['low', 'medium', 'high', 'critical'];

      for (const priority of validPriorities) {
        const task = await TaskService.createTask({
          summary: 'Test',
          priority
        });
        expect(task.priority).toBe(priority);
      }
    });

    test('preserves comments on update', async () => {
      const task = await TaskService.createTask({
        summary: 'Test'
      });

      await TaskService.addComment(task.id, 'Original comment');

      const updated = await TaskService.updateTask(task.id, {
        summary: 'Updated'
      });

      expect(updated.comments).toHaveLength(1);
      expect(updated.comments[0].text).toBe('Original comment');
    });
  });
});
