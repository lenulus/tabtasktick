/**
 * Tests for DailyTabCountService (dashboard "Total Tabs: +N today" chip)
 */
import { jest } from '@jest/globals';
import {
  ensureDailyBaseline,
  getTabCountChangeToday,
  formatSignedCount,
  localDateKey
} from '../services/execution/DailyTabCountService.js';

describe('DailyTabCountService', () => {
  let store;

  beforeEach(() => {
    store = {};
    chrome.storage.local.get.mockImplementation(async (key) => (
      key in store ? { [key]: store[key] } : {}
    ));
    chrome.storage.local.set.mockImplementation(async (items) => {
      Object.assign(store, structuredClone(items));
    });
  });

  const nov13 = new Date(2026, 10, 13, 9, 0);
  const nov13Late = new Date(2026, 10, 13, 23, 30);
  const nov14 = new Date(2026, 10, 14, 0, 5);

  it('reports 0 the first time it sees a day', async () => {
    expect(await getTabCountChangeToday(250, nov13)).toBe(0);
    expect(store.tabCountBaseline).toEqual({ date: localDateKey(nov13), count: 250 });
  });

  it('goes negative after closing about 200 tabs', async () => {
    await ensureDailyBaseline(250, nov13);
    expect(await getTabCountChangeToday(52, nov13Late)).toBe(-198);
  });

  it('goes positive when tabs are opened', async () => {
    await ensureDailyBaseline(40, nov13);
    expect(await getTabCountChangeToday(47, nov13Late)).toBe(7);
  });

  it('starts a new baseline on a new day', async () => {
    await ensureDailyBaseline(250, nov13);
    expect(await getTabCountChangeToday(52, nov13Late)).toBe(-198);
    expect(await getTabCountChangeToday(52, nov14)).toBe(0);
    expect(store.tabCountBaseline.date).toBe(localDateKey(nov14));
  });

  it('only calls a count function when a baseline is needed', async () => {
    const countFn = jest.fn(async () => 100);
    await ensureDailyBaseline(countFn, nov13);
    await ensureDailyBaseline(countFn, nov13Late);
    expect(countFn).toHaveBeenCalledTimes(1);
  });

  it('keeps the first baseline when a burst of events races at the start of a day', async () => {
    // e.g. 200 onRemoved events fired at once when a window closes
    const counts = Array.from({ length: 200 }, (_, i) => 200 - i);
    await Promise.all(counts.map(c => ensureDailyBaseline(async () => c, nov13)));
    expect(store.tabCountBaseline.count).toBe(200);
  });

  it('formats signed changes', () => {
    expect(formatSignedCount(0)).toBe('+0');
    expect(formatSignedCount(5)).toBe('+5');
    expect(formatSignedCount(-198)).toBe('-198');
    expect(formatSignedCount(undefined)).toBe('+0');
  });

  it('renders through the localized message', () => {
    expect(chrome.i18n.getMessage('dashboard_overview_statTabsChangeToday', [formatSignedCount(-198)]))
      .toBe('-198 today');
  });
});
