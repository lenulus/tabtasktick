/**
 * Moving a tab between two windows that are both bound to collections.
 *
 * Each collection flushes on its own debounce timer, so the destination may
 * process the TAB_CREATED before the source processes its TAB_REMOVED. Before
 * the fix, the destination skipped the tab ("already exists") and the source
 * then deleted it, so the tab vanished from both collections.
 */
import 'fake-indexeddb/auto';
import { jest } from '@jest/globals';
import { closeDB } from '../services/utils/db.js';
import * as ProgressiveSyncService from '../services/execution/ProgressiveSyncService.js';
import * as CollectionService from '../services/execution/CollectionService.js';
import * as TabService from '../services/execution/TabService.js';
import { findTabByRuntimeId, getCollection } from '../services/utils/storage-queries.js';

// Listeners are registered once at module load; grab them before mocks reset.
const onAttached = chrome.tabs.onAttached.addListener.mock.calls[0][0];
const onDetached = chrome.tabs.onDetached.addListener.mock.calls[0][0];

describe('ProgressiveSyncService: tab moved between two collection windows', () => {
  let source;
  let dest;
  const RUNTIME_TAB_ID = 555;
  const chromeTab = {
    id: RUNTIME_TAB_ID,
    windowId: 2,
    index: 0,
    groupId: -1,
    url: 'https://example.com/moved',
    title: 'Moved tab',
    pinned: false
  };

  beforeEach(async () => {
    closeDB();
    for (const db of await indexedDB.databases()) {
      indexedDB.deleteDatabase(db.name);
    }
    jest.clearAllMocks();

    const settings = { trackingEnabled: true, autoSync: true, syncDebounceMs: 10000 };
    source = await CollectionService.createCollection({ name: 'Source', windowId: 1, isActive: true, settings });
    dest = await CollectionService.createCollection({ name: 'Dest', windowId: 2, isActive: true, settings });
    await ProgressiveSyncService.initialize();
    await ProgressiveSyncService.trackCollection(source.id);
    await ProgressiveSyncService.trackCollection(dest.id);

    await TabService.createTab({
      collectionId: source.id,
      folderId: null,
      url: chromeTab.url,
      title: chromeTab.title,
      position: 0,
      tabId: RUNTIME_TAB_ID
    });

    chrome.tabs.get.mockImplementation(async () => chromeTab);
  });

  afterEach(async () => {
    await ProgressiveSyncService.flush();
    // Drop these collections from the service's in-memory cache so the next
    // test's collections (same window IDs) are found instead
    await ProgressiveSyncService.untrackCollection(source.id);
    await ProgressiveSyncService.untrackCollection(dest.id);
    closeDB();
  });

  async function moveTab() {
    await onDetached(RUNTIME_TAB_ID, { oldWindowId: 1, oldPosition: 0 });
    await onAttached(RUNTIME_TAB_ID, { newWindowId: 2, newPosition: 0 });
  }

  it('keeps the tab when the destination flushes first', async () => {
    await moveTab();
    await ProgressiveSyncService.flush(dest.id);
    await ProgressiveSyncService.flush(source.id);

    const stored = await findTabByRuntimeId(RUNTIME_TAB_ID);
    expect(stored).not.toBeNull();
    expect(stored.collectionId).toBe(dest.id);
    expect((await getCollection(dest.id)).metadata.tabCount).toBe(1);
    expect((await getCollection(source.id)).metadata.tabCount).toBe(0);
  });

  it('keeps the tab when the source flushes first', async () => {
    await moveTab();
    await ProgressiveSyncService.flush(source.id);
    await ProgressiveSyncService.flush(dest.id);

    const stored = await findTabByRuntimeId(RUNTIME_TAB_ID);
    expect(stored).not.toBeNull();
    expect(stored.collectionId).toBe(dest.id);
    expect((await getCollection(dest.id)).metadata.tabCount).toBe(1);
  });
});
