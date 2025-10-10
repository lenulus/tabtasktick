import { closeDuplicates } from '../../../services/execution/closeDuplicates.js';

describe('closeDuplicates', () => {

  describe('oldest strategy', () => {
    test('keeps oldest tab and closes newer duplicates', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);

      const tabs = [
        { id: 1, dupeKey: 'example.com', createdAt: 1000 },
        { id: 2, dupeKey: 'example.com', createdAt: 2000 },
        { id: 3, dupeKey: 'example.com', createdAt: 3000 }
      ];

      const results = await closeDuplicates(tabs, 'oldest', false);

      expect(results).toHaveLength(2);
      expect(results[0].tabId).toBe(2);
      expect(results[0].success).toBe(true);
      expect(results[0].details.strategy).toBe('oldest');
      expect(results[1].tabId).toBe(3);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(2);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(3);
      expect(chrome.tabs.remove).not.toHaveBeenCalledWith(1);
    });

    test('uses tab ID as fallback when createdAt missing', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);

      const tabs = [
        { id: 5, dupeKey: 'example.com' },
        { id: 10, dupeKey: 'example.com' },
        { id: 3, dupeKey: 'example.com' }
      ];

      const results = await closeDuplicates(tabs, 'oldest', false);

      expect(results).toHaveLength(2);
      // Should keep tab 3 (lowest ID)
      expect(chrome.tabs.remove).toHaveBeenCalledWith(5);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(10);
      expect(chrome.tabs.remove).not.toHaveBeenCalledWith(3);
    });
  });

  describe('newest strategy', () => {
    test('keeps newest tab and closes older duplicates', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);

      const tabs = [
        { id: 1, dupeKey: 'example.com', createdAt: 1000 },
        { id: 2, dupeKey: 'example.com', createdAt: 2000 },
        { id: 3, dupeKey: 'example.com', createdAt: 3000 }
      ];

      const results = await closeDuplicates(tabs, 'newest', false);

      expect(results).toHaveLength(2);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(1);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(2);
      expect(chrome.tabs.remove).not.toHaveBeenCalledWith(3); // Keep newest
    });
  });

  describe('mru (most recently used) strategy', () => {
    test('keeps most recently used tab and closes others', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);

      const tabs = [
        { id: 1, dupeKey: 'example.com', lastAccessed: 1000 },
        { id: 2, dupeKey: 'example.com', lastAccessed: 3000 }, // MRU
        { id: 3, dupeKey: 'example.com', lastAccessed: 2000 }
      ];

      const results = await closeDuplicates(tabs, 'mru', false);

      expect(results).toHaveLength(2);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(1);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(3);
      expect(chrome.tabs.remove).not.toHaveBeenCalledWith(2); // Keep MRU (highest lastAccessed)
    });

    test('falls back to createdAt when lastAccessed missing', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);

      const tabs = [
        { id: 1, dupeKey: 'example.com', createdAt: 1000 },
        { id: 2, dupeKey: 'example.com', createdAt: 3000 },
        { id: 3, dupeKey: 'example.com', createdAt: 2000 }
      ];

      const results = await closeDuplicates(tabs, 'mru', false);

      expect(results).toHaveLength(2);
      expect(chrome.tabs.remove).not.toHaveBeenCalledWith(2); // Keep tab with highest createdAt
    });
  });

  describe('lru (least recently used) strategy', () => {
    test('keeps least recently used tab and closes others', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);

      const tabs = [
        { id: 1, dupeKey: 'example.com', lastAccessed: 1000 }, // LRU
        { id: 2, dupeKey: 'example.com', lastAccessed: 3000 },
        { id: 3, dupeKey: 'example.com', lastAccessed: 2000 }
      ];

      const results = await closeDuplicates(tabs, 'lru', false);

      expect(results).toHaveLength(2);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(2);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(3);
      expect(chrome.tabs.remove).not.toHaveBeenCalledWith(1); // Keep LRU (lowest lastAccessed)
    });
  });

  describe('all strategy', () => {
    test('keeps all tabs and closes none', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);

      const tabs = [
        { id: 1, dupeKey: 'example.com', createdAt: 1000 },
        { id: 2, dupeKey: 'example.com', createdAt: 2000 },
        { id: 3, dupeKey: 'example.com', createdAt: 3000 }
      ];

      const results = await closeDuplicates(tabs, 'all', false);

      expect(results).toHaveLength(0);
      expect(chrome.tabs.remove).not.toHaveBeenCalled();
    });
  });

  describe('none strategy', () => {
    test('closes all duplicates including first', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);

      const tabs = [
        { id: 1, dupeKey: 'example.com', createdAt: 1000 },
        { id: 2, dupeKey: 'example.com', createdAt: 2000 },
        { id: 3, dupeKey: 'example.com', createdAt: 3000 }
      ];

      const results = await closeDuplicates(tabs, 'none', false);

      expect(results).toHaveLength(3);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(1);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(2);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(3);
    });
  });

  describe('single-tab groups', () => {
    test('does not close tabs with no duplicates', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);

      const tabs = [
        { id: 1, dupeKey: 'example.com', createdAt: 1000 },
        { id: 2, dupeKey: 'google.com', createdAt: 2000 },
        { id: 3, dupeKey: 'github.com', createdAt: 3000 }
      ];

      const results = await closeDuplicates(tabs, 'oldest', false);

      expect(results).toHaveLength(0);
      expect(chrome.tabs.remove).not.toHaveBeenCalled();
    });
  });

  describe('multiple duplicate groups', () => {
    test('handles multiple groups independently', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);

      const tabs = [
        { id: 1, dupeKey: 'example.com', createdAt: 1000 },
        { id: 2, dupeKey: 'example.com', createdAt: 2000 },
        { id: 3, dupeKey: 'google.com', createdAt: 1000 },
        { id: 4, dupeKey: 'google.com', createdAt: 2000 }
      ];

      const results = await closeDuplicates(tabs, 'oldest', false);

      expect(results).toHaveLength(2);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(2); // Close newer example.com
      expect(chrome.tabs.remove).toHaveBeenCalledWith(4); // Close newer google.com
      expect(chrome.tabs.remove).not.toHaveBeenCalledWith(1); // Keep oldest example.com
      expect(chrome.tabs.remove).not.toHaveBeenCalledWith(3); // Keep oldest google.com
    });
  });

  describe('dry-run mode', () => {
    test('returns preview without closing tabs', async () => {
      const tabs = [
        { id: 1, dupeKey: 'example.com', createdAt: 1000 },
        { id: 2, dupeKey: 'example.com', createdAt: 2000 },
        { id: 3, dupeKey: 'example.com', createdAt: 3000 }
      ];

      const results = await closeDuplicates(tabs, 'oldest', true);

      expect(results).toHaveLength(2);
      expect(results[0].tabId).toBe(2);
      expect(results[0].success).toBe(true);
      expect(results[1].tabId).toBe(3);
      expect(chrome.tabs.remove).not.toHaveBeenCalled(); // Dry-run: no actual removal
    });
  });

  describe('error handling', () => {
    test('handles tab removal errors gracefully', async () => {
      chrome.tabs.remove.mockRejectedValue(new Error('Tab not found'));

      const tabs = [
        { id: 1, dupeKey: 'example.com', createdAt: 1000 },
        { id: 2, dupeKey: 'example.com', createdAt: 2000 }
      ];

      const results = await closeDuplicates(tabs, 'oldest', false);

      expect(results).toHaveLength(1);
      expect(results[0].tabId).toBe(2);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Tab not found');
    });

    test('continues closing tabs after individual failures', async () => {
      chrome.tabs.remove
        .mockRejectedValueOnce(new Error('Tab 2 error'))
        .mockResolvedValueOnce(undefined);

      const tabs = [
        { id: 1, dupeKey: 'example.com', createdAt: 1000 },
        { id: 2, dupeKey: 'example.com', createdAt: 2000 },
        { id: 3, dupeKey: 'example.com', createdAt: 3000 }
      ];

      const results = await closeDuplicates(tabs, 'oldest', false);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false); // Tab 2 failed
      expect(results[1].success).toBe(true);  // Tab 3 succeeded
      expect(chrome.tabs.remove).toHaveBeenCalledTimes(2);
    });
  });

  describe('default strategy', () => {
    test('defaults to oldest strategy when no strategy provided', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);

      const tabs = [
        { id: 1, dupeKey: 'example.com', createdAt: 1000 },
        { id: 2, dupeKey: 'example.com', createdAt: 2000 }
      ];

      const results = await closeDuplicates(tabs);

      expect(results).toHaveLength(1);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(2);
      expect(chrome.tabs.remove).not.toHaveBeenCalledWith(1); // Keep oldest
    });
  });
});
