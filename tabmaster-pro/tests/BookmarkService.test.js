import { bookmarkTabs } from '../services/execution/BookmarkService.js';

describe('BookmarkService', () => {
  describe('bookmarkTabs', () => {
    test('bookmarks single tab to default folder', async () => {
      const mockTab = {
        id: 1,
        title: 'Example Page',
        url: 'https://example.com'
      };

      chrome.tabs.get.mockResolvedValue(mockTab);
      chrome.bookmarks.create.mockResolvedValue({
        id: 'bookmark1',
        title: 'Example Page',
        url: 'https://example.com'
      });

      const result = await bookmarkTabs([1]);

      expect(result.success).toBe(true);
      expect(result.bookmarked).toEqual([1]);
      expect(result.errors).toEqual([]);
      expect(chrome.tabs.get).toHaveBeenCalledWith(1);
      expect(chrome.bookmarks.create).toHaveBeenCalledWith({
        parentId: '2', // Other Bookmarks
        title: 'Example Page',
        url: 'https://example.com'
      });
    });

    test('bookmarks multiple tabs', async () => {
      const mockTabs = [
        { id: 1, title: 'Page 1', url: 'https://example.com/1' },
        { id: 2, title: 'Page 2', url: 'https://example.com/2' },
        { id: 3, title: 'Page 3', url: 'https://example.com/3' }
      ];

      chrome.tabs.get.mockImplementation((tabId) =>
        Promise.resolve(mockTabs.find(t => t.id === tabId))
      );
      chrome.bookmarks.create.mockResolvedValue({});

      const result = await bookmarkTabs([1, 2, 3]);

      expect(result.success).toBe(true);
      expect(result.bookmarked).toEqual([1, 2, 3]);
      expect(chrome.tabs.get).toHaveBeenCalledTimes(3);
      expect(chrome.bookmarks.create).toHaveBeenCalledTimes(3);
    });

    test('bookmarks tabs to existing folder', async () => {
      const mockTab = { id: 1, title: 'Page', url: 'https://example.com' };
      const mockFolder = { id: 'folder123', title: 'My Folder' };

      chrome.tabs.get.mockResolvedValue(mockTab);
      chrome.bookmarks.search.mockResolvedValue([mockFolder]);
      chrome.bookmarks.create.mockResolvedValue({});

      const result = await bookmarkTabs([1], { folder: 'My Folder' });

      expect(result.success).toBe(true);
      expect(result.details.folder).toBe('My Folder');
      expect(chrome.bookmarks.search).toHaveBeenCalledWith({ title: 'My Folder' });
      expect(chrome.bookmarks.create).toHaveBeenCalledWith({
        parentId: 'folder123',
        title: 'Page',
        url: 'https://example.com'
      });
    });

    test('creates folder if it does not exist', async () => {
      const mockTab = { id: 1, title: 'Page', url: 'https://example.com' };
      const mockNewFolder = { id: 'newfolder', title: 'New Folder' };

      chrome.tabs.get.mockResolvedValue(mockTab);
      chrome.bookmarks.search.mockResolvedValue([]); // No existing folder
      chrome.bookmarks.create
        .mockResolvedValueOnce(mockNewFolder) // First call creates folder
        .mockResolvedValueOnce({}); // Second call creates bookmark

      const result = await bookmarkTabs([1], { folder: 'New Folder' });

      expect(result.success).toBe(true);
      expect(chrome.bookmarks.create).toHaveBeenCalledTimes(2);
      // First call: create folder
      expect(chrome.bookmarks.create).toHaveBeenNthCalledWith(1, {
        parentId: '2',
        title: 'New Folder'
      });
      // Second call: create bookmark
      expect(chrome.bookmarks.create).toHaveBeenNthCalledWith(2, {
        parentId: 'newfolder',
        title: 'Page',
        url: 'https://example.com'
      });
    });

    test('uses explicit parentId when provided', async () => {
      const mockTab = { id: 1, title: 'Page', url: 'https://example.com' };

      chrome.tabs.get.mockResolvedValue(mockTab);
      chrome.bookmarks.create.mockResolvedValue({});

      const result = await bookmarkTabs([1], { parentId: 'custom123' });

      expect(result.success).toBe(true);
      expect(chrome.bookmarks.search).not.toHaveBeenCalled(); // Skip folder lookup
      expect(chrome.bookmarks.create).toHaveBeenCalledWith({
        parentId: 'custom123',
        title: 'Page',
        url: 'https://example.com'
      });
    });

    test('distinguishes folders from URL bookmarks', async () => {
      const mockTab = { id: 1, title: 'Page', url: 'https://example.com' };
      const mockUrlBookmark = { id: 'url1', title: 'My Folder', url: 'https://example.com/bookmark' };
      const mockFolder = { id: 'folder1', title: 'My Folder' }; // No url property

      chrome.tabs.get.mockResolvedValue(mockTab);
      chrome.bookmarks.search.mockResolvedValue([mockUrlBookmark, mockFolder]);
      chrome.bookmarks.create.mockResolvedValue({});

      const result = await bookmarkTabs([1], { folder: 'My Folder' });

      expect(result.success).toBe(true);
      // Should use the folder (no url), not the URL bookmark
      expect(chrome.bookmarks.create).toHaveBeenCalledWith({
        parentId: 'folder1',
        title: 'Page',
        url: 'https://example.com'
      });
    });

    test('handles tab fetch errors gracefully', async () => {
      chrome.tabs.get.mockRejectedValue(new Error('Tab not found'));

      const result = await bookmarkTabs([999]);

      expect(result.success).toBe(false);
      expect(result.bookmarked).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].tabId).toBe(999);
      expect(result.errors[0].error).toContain('Failed to get tab');
    });

    test('handles bookmark creation errors', async () => {
      const mockTab = { id: 1, title: 'Page', url: 'https://example.com' };

      chrome.tabs.get.mockResolvedValue(mockTab);
      chrome.bookmarks.create.mockRejectedValue(new Error('Bookmark creation failed'));

      const result = await bookmarkTabs([1]);

      expect(result.success).toBe(false);
      expect(result.bookmarked).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].tabId).toBe(1);
    });

    test('handles partial success (some bookmarks succeed, some fail)', async () => {
      const mockTabs = [
        { id: 1, title: 'Page 1', url: 'https://example.com/1' },
        { id: 2, title: 'Page 2', url: 'https://example.com/2' },
        { id: 3, title: 'Page 3', url: 'https://example.com/3' }
      ];

      chrome.tabs.get.mockImplementation((tabId) =>
        Promise.resolve(mockTabs.find(t => t.id === tabId))
      );
      chrome.bookmarks.create
        .mockResolvedValueOnce({}) // Tab 1 succeeds
        .mockRejectedValueOnce(new Error('Failed')) // Tab 2 fails
        .mockResolvedValueOnce({}); // Tab 3 succeeds

      const result = await bookmarkTabs([1, 2, 3]);

      expect(result.success).toBe(true); // Partial success
      expect(result.bookmarked).toEqual([1, 3]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].tabId).toBe(2);
    });

    test('handles folder lookup errors by falling back to default', async () => {
      const mockTab = { id: 1, title: 'Page', url: 'https://example.com' };

      chrome.tabs.get.mockResolvedValue(mockTab);
      chrome.bookmarks.search.mockRejectedValue(new Error('Search failed'));
      chrome.bookmarks.create.mockResolvedValue({});

      const result = await bookmarkTabs([1], { folder: 'My Folder' });

      // Should fall back to default parentId '2'
      expect(result.success).toBe(true);
      expect(chrome.bookmarks.create).toHaveBeenCalledWith({
        parentId: '2',
        title: 'Page',
        url: 'https://example.com'
      });
    });

    test('returns consistent result format', async () => {
      const mockTab = { id: 1, title: 'Page', url: 'https://example.com' };

      chrome.tabs.get.mockResolvedValue(mockTab);
      chrome.bookmarks.create.mockResolvedValue({});

      const result = await bookmarkTabs([1]);

      // Verify result structure matches expected format
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('bookmarked');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('details');
      expect(Array.isArray(result.bookmarked)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
      expect(typeof result.details).toBe('object');
    });
  });
});
