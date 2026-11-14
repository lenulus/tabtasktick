/**
 * Tests for TabHistoryService (dashboard activity chart data).
 */
import { recordTabHistory } from '../services/execution/TabHistoryService.js';

describe('TabHistoryService', () => {
  let store;

  beforeEach(() => {
    store = {};
    // Async storage with a little latency, like chrome.storage.local
    chrome.storage.local.get.mockImplementation(async (keys) => {
      await new Promise(r => setTimeout(r, 1));
      const out = {};
      for (const k of [].concat(keys)) if (k in store) out[k] = structuredClone(store[k]);
      return out;
    });
    chrome.storage.local.set.mockImplementation(async (items) => {
      await new Promise(r => setTimeout(r, 1));
      Object.assign(store, structuredClone(items));
    });
  });

  it('records every close when a window with 200 tabs closes at once', async () => {
    // One onRemoved per tab, all fired without waiting on each other
    await Promise.all(Array.from({ length: 200 }, () => recordTabHistory('closed')));

    expect(store.tabHistory.filter(h => h.action === 'closed')).toHaveLength(200);
    // Batched: far fewer writes than events
    expect(chrome.storage.local.set.mock.calls.length).toBeLessThan(10);
  });

  it('the old read-modify-write per event loses most entries (regression guard)', async () => {
    async function oldTrackTabHistory(action) {
      const history = await chrome.storage.local.get(['tabHistory']);
      const tabHistory = history.tabHistory || [];
      tabHistory.push({ action, timestamp: Date.now() });
      await chrome.storage.local.set({ tabHistory });
    }
    await Promise.all(Array.from({ length: 200 }, () => oldTrackTabHistory('closed')));
    expect(store.tabHistory.length).toBeLessThan(200);
  });

  it('keeps existing history and drops entries older than 30 days', async () => {
    const now = Date.now();
    store.tabHistory = [
      { action: 'opened', timestamp: now - 31 * 24 * 60 * 60 * 1000 },
      { action: 'opened', timestamp: now - 60 * 1000 }
    ];
    await recordTabHistory('closed');
    expect(store.tabHistory.map(h => h.action)).toEqual(['opened', 'closed']);
  });

  it('records entries that arrive while a write is in progress', async () => {
    const first = recordTabHistory('opened');
    await new Promise(r => setTimeout(r, 1)); // first write now in flight
    const second = recordTabHistory('closed');
    await Promise.all([first, second]);
    expect(store.tabHistory.map(h => h.action)).toEqual(['opened', 'closed']);
  });
});
