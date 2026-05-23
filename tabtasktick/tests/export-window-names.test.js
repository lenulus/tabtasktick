// Tests for custom window name export (regression: window names were dropped on export)

import { describe, it, expect, beforeEach } from '@jest/globals';
import { exportData } from '../services/ExportImportService.js';
import { getWindowSignature } from '../services/utils/WindowNameService.js';

// Stateful chrome.storage.local backed by a plain object so WindowNameService
// reads back what it writes.
function installStatefulStorage(initial = {}) {
  let store = { ...initial };
  global.chrome.storage.local.get.mockImplementation(keys => {
    if (Array.isArray(keys)) {
      const out = {};
      for (const k of keys) out[k] = store[k];
      return Promise.resolve(out);
    }
    if (typeof keys === 'string') return Promise.resolve({ [keys]: store[keys] });
    return Promise.resolve({ ...store });
  });
  global.chrome.storage.local.set.mockImplementation(obj => {
    store = { ...store, ...obj };
    return Promise.resolve();
  });
  return () => store;
}

const noExtensionData = {
  includeRules: false,
  includeSnoozed: false,
  includeSettings: false,
  includeStatistics: false,
  includeCollections: false
};

describe('getWindowSignature', () => {
  it('derives a signature from pinned tab hostnames first', () => {
    const tabs = [
      { url: 'https://github.com/a', pinned: true },
      { url: 'https://mail.google.com/b', pinned: true },
      { url: 'https://example.com/c', pinned: false }
    ];
    expect(getWindowSignature(tabs)).toBe('github.com|mail.google.com');
  });

  it('falls back to top tab hostnames when no tabs are pinned', () => {
    const tabs = [
      { url: 'https://example.com/a', pinned: false },
      { url: 'https://news.ycombinator.com/b', pinned: false }
    ];
    expect(getWindowSignature(tabs)).toBe('example.com|news.ycombinator.com');
  });

  it('is recomputable: same tab URLs produce the same signature', () => {
    const tabs = [{ url: 'https://github.com/x', pinned: true }];
    expect(getWindowSignature(tabs)).toBe(getWindowSignature([...tabs]));
  });
});

describe('exportData - custom window names', () => {
  beforeEach(() => {
    global.chrome.tabGroups.query = global.chrome.tabGroups.query || (() => Promise.resolve([]));
  });

  function mockBrowser(tabs, windows, groups = []) {
    global.chrome.tabs.query.mockResolvedValue(tabs);
    global.chrome.windows.getAll.mockResolvedValue(windows);
    global.chrome.tabGroups.query.mockResolvedValue(groups);
  }

  it('includes the custom name keyed by windowId in the JSON export', async () => {
    installStatefulStorage({ windowNames: { 1: 'Work', 2: 'Personal' } });
    mockBrowser(
      [
        { id: 10, windowId: 1, url: 'https://github.com/a', title: 'A', pinned: true, index: 0 },
        { id: 11, windowId: 2, url: 'https://example.com/b', title: 'B', pinned: false, index: 0 }
      ],
      [
        { id: 1, focused: true, state: 'normal', type: 'normal' },
        { id: 2, focused: false, state: 'normal', type: 'normal' }
      ]
    );

    const result = await exportData({ format: 'json', ...noExtensionData }, {}, new Map());
    const byId = Object.fromEntries(result.session.windows.map(w => [w.windowId, w]));

    expect(byId[1].name).toBe('Work');
    expect(byId[2].name).toBe('Personal');
  });

  it('resolves the name by signature when not keyed by current windowId', async () => {
    // No windowNames entry for window 7, but its signature is known.
    const signature = getWindowSignature([{ url: 'https://github.com/a', pinned: true }]);
    installStatefulStorage({ windowNames: {}, windowSignatures: { [signature]: 'Recovered' } });
    mockBrowser(
      [{ id: 20, windowId: 7, url: 'https://github.com/a', title: 'A', pinned: true, index: 0 }],
      [{ id: 7, focused: true, state: 'normal', type: 'normal' }]
    );

    const result = await exportData({ format: 'json', ...noExtensionData }, {}, new Map());

    expect(result.session.windows[0].name).toBe('Recovered');
    expect(result.session.windows[0].signature).toBe(signature);
  });

  it('exports name as null for unnamed windows', async () => {
    installStatefulStorage({ windowNames: {}, windowSignatures: {} });
    mockBrowser(
      [{ id: 30, windowId: 9, url: 'https://example.com/a', title: 'A', pinned: false, index: 0 }],
      [{ id: 9, focused: true, state: 'normal', type: 'normal' }]
    );

    const result = await exportData({ format: 'json', ...noExtensionData }, {}, new Map());

    expect(result.session.windows[0].name).toBeNull();
  });

  it('uses the custom name in the Markdown window heading', async () => {
    installStatefulStorage({ windowNames: { 3: 'Research' } });
    mockBrowser(
      [{ id: 40, windowId: 3, url: 'https://example.com/a', title: 'A', pinned: false, index: 0 }],
      [{ id: 3, focused: true, state: 'normal', type: 'normal' }]
    );

    const result = await exportData({ format: 'markdown', ...noExtensionData }, {}, new Map());

    expect(result.markdown).toContain('### Research (1 tabs)');
  });
});
