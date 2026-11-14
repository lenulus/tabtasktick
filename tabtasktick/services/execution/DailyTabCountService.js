/**
 * @file DailyTabCountService - Tracks how the open tab count changed today
 *
 * @description
 * The dashboard's Total Tabs card shows "+N today" / "-N today". To compute it we
 * keep one baseline per local calendar day: the number of open tabs at the start
 * of the day (or the first moment the extension saw tab activity that day).
 * The change today is simply `currentCount - baseline.count`.
 *
 * A baseline snapshot is used instead of counting opened/closed events because
 * event counting drifts: closing hundreds of tabs fires hundreds of concurrent
 * onRemoved events, and some actions are reported twice (by the action and by
 * the onRemoved listener).
 *
 * Storage: chrome.storage.local key `tabCountBaseline` = { date: 'YYYY-MM-DD', count }
 *
 * @module services/execution/DailyTabCountService
 */

const STORAGE_KEY = 'tabCountBaseline';

/**
 * Serializes baseline reads/writes so that a burst of tab events at the start of
 * a day produces exactly one baseline (the first one wins).
 */
let queue = Promise.resolve();

function serialize(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

/**
 * Returns the local calendar date as YYYY-MM-DD.
 * @param {Date} [now]
 * @returns {string}
 */
export function localDateKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isValidBaseline(baseline, today) {
  return Boolean(baseline) && baseline.date === today && Number.isFinite(baseline.count);
}

/**
 * Makes sure today's baseline exists. If it does not, records one.
 *
 * `startingCount` may be a number or a (possibly async) function returning one.
 * A function is only called when a new baseline is actually needed, so callers
 * on hot paths (tab events) avoid querying all tabs on every event.
 *
 * @param {number|function(): (number|Promise<number>)} startingCount - Tab count to use as the start of today
 * @param {Date} [now]
 * @returns {Promise<{date: string, count: number}>} Today's baseline
 */
export function ensureDailyBaseline(startingCount, now = new Date()) {
  return serialize(async () => {
    const today = localDateKey(now);
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const existing = stored?.[STORAGE_KEY];
    if (isValidBaseline(existing, today)) {
      return existing;
    }

    const count = typeof startingCount === 'function' ? await startingCount() : startingCount;
    const baseline = { date: today, count: Math.max(0, Number(count) || 0) };
    await chrome.storage.local.set({ [STORAGE_KEY]: baseline });
    return baseline;
  });
}

/**
 * Returns how many tabs were added (positive) or removed (negative) today.
 * Records a baseline from `currentCount` if none exists for today (result 0).
 *
 * @param {number} currentCount - Tabs open right now
 * @param {Date} [now]
 * @returns {Promise<number>}
 */
export async function getTabCountChangeToday(currentCount, now = new Date()) {
  const baseline = await ensureDailyBaseline(currentCount, now);
  return currentCount - baseline.count;
}

/**
 * Formats a change as "+5", "-12" or "+0".
 * @param {number} change
 * @returns {string}
 */
export function formatSignedCount(change) {
  const n = Number(change) || 0;
  return n < 0 ? `-${Math.abs(n)}` : `+${n}`;
}
