/**
 * @file collection-import-export-ui.test.js - Tests for shared UI helper module
 * @description Unit tests for collection import/export UI utilities
 */

import { jest } from '@jest/globals';
import {
  exportCollection,
  exportAllCollections,
  importCollections,
  formatImportSuccessMessage,
  formatImportErrorMessage,
  formatExportSuccessMessage
} from '../services/utils/collection-import-export-ui.js';

describe('collection-import-export-ui', () => {
  beforeEach(() => {
    // Mock chrome.runtime.sendMessage for each test
    chrome.runtime.sendMessage = jest.fn();

    // Mock File class with text() method for jsdom
    global.File = class File {
      constructor(parts, name, options) {
        this.parts = parts;
        this.name = name;
        this.size = parts.reduce((acc, part) => acc + (part.length || 0), 0);
        this.type = options?.type || '';
      }
      async text() {
        return this.parts.join('');
      }
    };
  });

  describe('exportCollection', () => {
    test('should send correct message with default options', async () => {
      const mockResult = { success: true, filename: 'test.json' };
      chrome.runtime.sendMessage.mockResolvedValue(mockResult);

      const result = await exportCollection('col_123');

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'exportCollection',
        collectionId: 'col_123',
        options: {
          includeTasks: true,
          includeSettings: true,
          includeMetadata: false
        }
      });
      expect(result).toEqual(mockResult);
    });

    test('should allow custom options', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });

      await exportCollection('col_456', {
        includeTasks: false,
        includeMetadata: true
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'exportCollection',
        collectionId: 'col_456',
        options: {
          includeTasks: false,
          includeSettings: true,
          includeMetadata: true
        }
      });
    });
  });

  describe('exportAllCollections', () => {
    test('should send correct message with default options', async () => {
      const mockResult = { success: true, filename: 'all.json', count: 5 };
      chrome.runtime.sendMessage.mockResolvedValue(mockResult);

      const result = await exportAllCollections();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'exportAllCollections',
        options: {
          includeTasks: true,
          includeSettings: true,
          includeMetadata: false
        }
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('importCollections', () => {
    test('should validate and send correct message', async () => {
      const mockFile = new File(
        ['{"version": "1.0", "collections": []}'],
        'test.json',
        { type: 'application/json' }
      );

      const mockResult = { success: true, imported: [], errors: [] };
      chrome.runtime.sendMessage.mockResolvedValue(mockResult);

      const result = await importCollections(mockFile);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'importCollections',
        data: '{"version": "1.0", "collections": []}',
        options: {
          mode: 'merge',
          importTasks: true,
          importSettings: true
        }
      });
      expect(result).toEqual(mockResult);
    });

    test('should reject file larger than 10MB', async () => {
      // Create a mock file larger than 10MB
      const largeFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.json');

      await expect(importCollections(largeFile)).rejects.toThrow(/File too large/);
    });

    test('should reject non-JSON files', async () => {
      const txtFile = new File(['test'], 'test.txt');

      await expect(importCollections(txtFile)).rejects.toThrow(/Invalid file type/);
    });

    test('should reject invalid JSON', async () => {
      const invalidFile = new File(['{invalid json}'], 'invalid.json');

      await expect(importCollections(invalidFile)).rejects.toThrow(/Invalid JSON format/);
    });

    test('should reject empty files', async () => {
      const emptyFile = new File([''], 'empty.json');

      await expect(importCollections(emptyFile)).rejects.toThrow(/File is empty/);
    });

    test('should allow custom options', async () => {
      const mockFile = new File(
        ['{"version": "1.0", "collections": []}'],
        'test.json'
      );

      chrome.runtime.sendMessage.mockResolvedValue({ success: true, imported: [], errors: [] });

      await importCollections(mockFile, {
        mode: 'replace',
        importTasks: false
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'importCollections',
        data: '{"version": "1.0", "collections": []}',
        options: {
          mode: 'replace',
          importTasks: false,
          importSettings: true
        }
      });
    });
  });

  describe('formatImportSuccessMessage', () => {
    test('should format single collection', () => {
      const result = {
        imported: [{ id: 'col_1', name: 'Work' }]
      };

      expect(formatImportSuccessMessage(result)).toBe('Imported 1 collection: Work');
    });

    test('should format multiple collections', () => {
      const result = {
        imported: [
          { id: 'col_1', name: 'Work' },
          { id: 'col_2', name: 'Personal' },
          { id: 'col_3', name: 'Archive' }
        ]
      };

      expect(formatImportSuccessMessage(result)).toBe(
        'Imported 3 collections: Work, Personal, Archive'
      );
    });
  });

  describe('formatImportErrorMessage', () => {
    test('should format single error with default separator', () => {
      const result = {
        errors: [
          { collectionName: 'Broken', error: 'Missing required field' }
        ]
      };

      expect(formatImportErrorMessage(result)).toBe(
        '1 collection failed to import:\nBroken: Missing required field'
      );
    });

    test('should format multiple errors', () => {
      const result = {
        errors: [
          { collectionName: 'Broken1', error: 'Error 1' },
          { collectionName: 'Broken2', error: 'Error 2' }
        ]
      };

      expect(formatImportErrorMessage(result)).toContain('2 collections failed to import');
      expect(formatImportErrorMessage(result)).toContain('Broken1: Error 1');
      expect(formatImportErrorMessage(result)).toContain('Broken2: Error 2');
    });

    test('should allow custom separator', () => {
      const result = {
        errors: [
          { collectionName: 'A', error: 'Err A' },
          { collectionName: 'B', error: 'Err B' }
        ]
      };

      const msg = formatImportErrorMessage(result, '; ');

      expect(msg).toContain('; A: Err A; B: Err B');
    });
  });

  describe('formatExportSuccessMessage', () => {
    test('should format single collection export', () => {
      const result = {
        filename: 'collection-work-123.json'
      };

      expect(formatExportSuccessMessage(result)).toBe(
        'Exported to collection-work-123.json'
      );
    });

    test('should format multiple collections export', () => {
      const result = {
        filename: 'collections-export-5-123.json',
        count: 5
      };

      expect(formatExportSuccessMessage(result)).toBe(
        'Exported 5 collections to collections-export-5-123.json'
      );
    });
  });
});
