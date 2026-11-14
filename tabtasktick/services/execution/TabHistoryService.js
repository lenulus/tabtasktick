/**
 * @file TabHistoryService - Records tab activity for the dashboard activity chart
 *
 * @description
 * Stores { action, timestamp } entries ('opened', 'closed', 'snoozed', 'grouped')
 * in chrome.storage.local under `tabHistory`, keeping the last 30 days.
 *
 * Closing a window fires one tabs.onRemoved event per tab, all at once. A plain
 * read-modify-write per event lets those writes overwrite each other, so most of
 * the closes were lost. Entries are therefore queued in memory and written by a
 * single writer: every entry recorded while a write is in progress goes into the
 * next write, so no entry is dropped and a burst costs only a couple of writes.
 *
 * @module services/execution/TabHistoryService
 */

const STORAGE_KEY = 'tabHistory';
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

let pending = []; // [{ entry, resolve, reject }]
let writing = false;

async function writePending() {
  writing = true;
  try {
    while (pending.length > 0) {
      const batch = pending;
      pending = [];
      try {
        const stored = await chrome.storage.local.get([STORAGE_KEY]);
        const history = Array.isArray(stored?.[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
        const cutoff = Date.now() - RETENTION_MS;
        const updated = history.concat(batch.map(p => p.entry)).filter(h => h.timestamp > cutoff);
        await chrome.storage.local.set({ [STORAGE_KEY]: updated });
        batch.forEach(p => p.resolve());
      } catch (error) {
        batch.forEach(p => p.reject(error));
      }
    }
  } finally {
    writing = false;
  }
}

/**
 * Records one tab history entry. Resolves once the entry has been written.
 *
 * @param {string} action - 'opened' | 'closed' | 'snoozed' | 'grouped'
 * @param {number} [timestamp]
 * @returns {Promise<void>}
 */
export function recordTabHistory(action, timestamp = Date.now()) {
  return new Promise((resolve, reject) => {
    pending.push({ entry: { action, timestamp }, resolve, reject });
    if (!writing) {
      writePending();
    }
  });
}
