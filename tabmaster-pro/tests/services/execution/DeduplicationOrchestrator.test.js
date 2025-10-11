import { deduplicate, deduplicateGlobal, deduplicatePerWindow, deduplicateWindow } from '../../../services/execution/DeduplicationOrchestrator.js';

describe('DeduplicationOrchestrator', () => {

  beforeEach(() => {
    chrome.tabs.query.mockReset();
    chrome.tabs.remove.mockReset();
  });

  describe('scope: global (cross-window deduplication)', () => {
    test('removes duplicates across multiple windows', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);

      const tabs = [
        { id: 1, url: 'https://example.com', windowId: 1, createdAt: 1000 },
        { id: 2, url: 'https://example.com', windowId: 2, createdAt: 2000 }, // Duplicate in different window
        { id: 3, url: 'https://google.com', windowId: 1, createdAt: 3000 },
        { id: 4, url: 'https://google.com', windowId: 3, createdAt: 4000 }  // Duplicate in different window
      ];

      const results = await deduplicate({
        tabs,
        scope: 'global',
        strategy: 'oldest',
        dryRun: false
      });

      // Should close the newer duplicates (id 2 and 4)
      expect(results).toHaveLength(2);
      expect(results.find(r => r.tabId === 2)).toBeDefined();
      expect(results.find(r => r.tabId === 4)).toBeDefined();
      expect(chrome.tabs.remove).toHaveBeenCalledWith(2);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(4);
      expect(chrome.tabs.remove).not.toHaveBeenCalledWith(1);
      expect(chrome.tabs.remove).not.toHaveBeenCalledWith(3);
    });

    test('backward compatibility helper - deduplicateGlobal', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);

      const tabs = [
        { id: 1, url: 'https://example.com', windowId: 1, createdAt: 1000 },
        { id: 2, url: 'https://example.com', windowId: 2, createdAt: 2000 }
      ];

      const results = await deduplicateGlobal(tabs, 'oldest', false);

      expect(results).toHaveLength(1);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(2);
    });
  });

  describe('scope: per-window (within-window deduplication)', () => {
    test('keeps duplicates in different windows', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);

      const tabs = [
        // Window 1: two example.com tabs
        { id: 1, url: 'https://example.com', windowId: 1, createdAt: 1000 },
        { id: 2, url: 'https://example.com', windowId: 1, createdAt: 2000 },
        // Window 2: two example.com tabs
        { id: 3, url: 'https://example.com', windowId: 2, createdAt: 3000 },
        { id: 4, url: 'https://example.com', windowId: 2, createdAt: 4000 }
      ];

      const results = await deduplicate({
        tabs,
        scope: 'per-window',
        strategy: 'oldest',
        dryRun: false
      });

      // Should close newer duplicates within each window (id 2 in window 1, id 4 in window 2)
      // But keep at least one in each window
      expect(results).toHaveLength(2);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(2); // Window 1 duplicate
      expect(chrome.tabs.remove).toHaveBeenCalledWith(4); // Window 2 duplicate
      expect(chrome.tabs.remove).not.toHaveBeenCalledWith(1); // Window 1 keeper
      expect(chrome.tabs.remove).not.toHaveBeenCalledWith(3); // Window 2 keeper
    });

    test('handles mixed URLs across windows', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);

      const tabs = [
        // Window 1: example.com duplicates
        { id: 1, url: 'https://example.com', windowId: 1, createdAt: 1000 },
        { id: 2, url: 'https://example.com', windowId: 1, createdAt: 2000 },
        // Window 2: google.com duplicates
        { id: 3, url: 'https://google.com', windowId: 2, createdAt: 3000 },
        { id: 4, url: 'https://google.com', windowId: 2, createdAt: 4000 },
        // Window 3: mixed URLs, no duplicates
        { id: 5, url: 'https://example.com', windowId: 3, createdAt: 5000 },
        { id: 6, url: 'https://google.com', windowId: 3, createdAt: 6000 }
      ];

      const results = await deduplicate({
        tabs,
        scope: 'per-window',
        strategy: 'oldest',
        dryRun: false
      });

      // Should close id 2 (window 1 dupe) and id 4 (window 2 dupe)
      // Keep id 5 and id 6 (different window from their duplicates)
      expect(results).toHaveLength(2);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(2);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(4);
      expect(chrome.tabs.remove).not.toHaveBeenCalledWith(5);
      expect(chrome.tabs.remove).not.toHaveBeenCalledWith(6);
    });

    test('backward compatibility helper - deduplicatePerWindow', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);

      const tabs = [
        { id: 1, url: 'https://example.com', windowId: 1, createdAt: 1000 },
        { id: 2, url: 'https://example.com', windowId: 1, createdAt: 2000 },
        { id: 3, url: 'https://example.com', windowId: 2, createdAt: 3000 }
      ];

      const results = await deduplicatePerWindow(tabs, 'oldest', false);

      // Should only close id 2 (window 1 duplicate)
      // id 3 is in different window, so kept
      expect(results).toHaveLength(1);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(2);
      expect(chrome.tabs.remove).not.toHaveBeenCalledWith(3);
    });
  });

  describe('scope: window (single window deduplication)', () => {
    test('only processes tabs from specified window', async () => {
      chrome.tabs.query.mockResolvedValue([
        { id: 1, url: 'https://example.com', windowId: 1, createdAt: 1000 },
        { id: 2, url: 'https://example.com', windowId: 1, createdAt: 2000 }
      ]);
      chrome.tabs.remove.mockResolvedValue(undefined);

      const results = await deduplicate({
        windowId: 1,
        scope: 'window',
        strategy: 'oldest',
        dryRun: false
      });

      // Should query only window 1
      expect(chrome.tabs.query).toHaveBeenCalledWith({ windowId: 1 });
      // Should close newer duplicate
      expect(results).toHaveLength(1);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(2);
    });

    test('backward compatibility helper - deduplicateWindow', async () => {
      chrome.tabs.query.mockResolvedValue([
        { id: 10, url: 'https://test.com', windowId: 5, createdAt: 1000 },
        { id: 11, url: 'https://test.com', windowId: 5, createdAt: 2000 }
      ]);
      chrome.tabs.remove.mockResolvedValue(undefined);

      const results = await deduplicateWindow(5, 'oldest', false);

      expect(chrome.tabs.query).toHaveBeenCalledWith({ windowId: 5 });
      expect(results).toHaveLength(1);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(11);
    });
  });

  describe('dupeKey generation', () => {
    test('automatically generates dupeKeys when missing', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);

      const tabs = [
        { id: 1, url: 'https://example.com/page1', windowId: 1, createdAt: 1000 },
        { id: 2, url: 'https://example.com/page2', windowId: 1, createdAt: 2000 }
      ];

      const results = await deduplicate({
        tabs,
        scope: 'global',
        strategy: 'oldest',
        dryRun: false
      });

      // Different URLs should generate different dupeKeys, so no duplicates
      expect(results).toHaveLength(0);
      expect(chrome.tabs.remove).not.toHaveBeenCalled();
    });

    test('preserves existing dupeKeys', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);

      const tabs = [
        { id: 1, url: 'https://example.com', windowId: 1, createdAt: 1000, dupeKey: 'custom-key' },
        { id: 2, url: 'https://different.com', windowId: 1, createdAt: 2000, dupeKey: 'custom-key' }
      ];

      const results = await deduplicate({
        tabs,
        scope: 'global',
        strategy: 'oldest',
        dryRun: false
      });

      // Different URLs but same dupeKey = duplicates
      expect(results).toHaveLength(1);
      expect(chrome.tabs.remove).toHaveBeenCalledWith(2);
    });
  });

  describe('dryRun mode', () => {
    test('previews changes without closing tabs', async () => {
      const tabs = [
        { id: 1, url: 'https://example.com', windowId: 1, createdAt: 1000 },
        { id: 2, url: 'https://example.com', windowId: 1, createdAt: 2000 }
      ];

      const results = await deduplicate({
        tabs,
        scope: 'global',
        strategy: 'oldest',
        dryRun: true
      });

      // Should return results but not close tabs
      expect(results).toHaveLength(1);
      expect(results[0].tabId).toBe(2);
      expect(chrome.tabs.remove).not.toHaveBeenCalled();
    });
  });

  describe('strategy variations', () => {
    test('newest strategy keeps newest tab', async () => {
      chrome.tabs.remove.mockResolvedValue(undefined);

      const tabs = [
        { id: 1, url: 'https://example.com', windowId: 1, createdAt: 1000 },
        { id: 2, url: 'https://example.com', windowId: 1, createdAt: 3000 }
      ];

      const results = await deduplicate({
        tabs,
        scope: 'global',
        strategy: 'newest',
        dryRun: false
      });

      // Should close oldest (id 1)
      expect(chrome.tabs.remove).toHaveBeenCalledWith(1);
      expect(chrome.tabs.remove).not.toHaveBeenCalledWith(2);
    });
  });

  describe('edge cases', () => {
    test('handles empty tabs array', async () => {
      const results = await deduplicate({
        tabs: [],
        scope: 'global',
        strategy: 'oldest',
        dryRun: false
      });

      expect(results).toHaveLength(0);
      expect(chrome.tabs.remove).not.toHaveBeenCalled();
    });

    test('handles no duplicates', async () => {
      const tabs = [
        { id: 1, url: 'https://example.com', windowId: 1 },
        { id: 2, url: 'https://google.com', windowId: 1 },
        { id: 3, url: 'https://github.com', windowId: 1 }
      ];

      const results = await deduplicate({
        tabs,
        scope: 'global',
        strategy: 'oldest',
        dryRun: false
      });

      expect(results).toHaveLength(0);
      expect(chrome.tabs.remove).not.toHaveBeenCalled();
    });
  });
});
