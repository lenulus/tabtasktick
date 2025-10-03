// services/TabGrouping.js
// Centralized service for grouping tabs by domain with explicit scoping control
// No new formats. No hidden behavior. Same entrypoints for every surface.

export const GroupingScope = {
  GLOBAL: 'global',           // All tabs from all windows → single target window
  TARGETED: 'targeted',       // Group tabs only within specified window
  PER_WINDOW: 'per_window'    // Group tabs within each window independently
};

/**
 * @typedef {Object} GroupingOptions
 * @property {number} [minTabsPerGroup=2] - Minimum tabs required to create a new group
 * @property {boolean} [includeSingleIfExisting=true] - Add a single tab to an existing same-title group
 * @property {boolean} [includePinned=false] - Include pinned tabs in grouping (default: skip them)
 * @property {boolean} [dryRun=false] - If true, compute what would happen but don't move/group tabs
 * @property {number[]} [specificTabIds] - If provided, ONLY group these specific tabs (ignores other tabs)
 */

/**
 * Groups tabs by domain with explicit scope control.
 * Surfaces MUST call this (and only this) for domain grouping.
 *
 * @param {'global'|'targeted'|'per_window'} scope - One of GroupingScope values
 * @param {number|null} targetWindowId - Required for GLOBAL and TARGETED scopes
 * @param {GroupingOptions} [opts]
 * @returns {Promise<{groupsCreated:number,groupsReused:number,totalTabsGrouped:number,windowsAffected:number[], targetWindow?:number, plan:Array}>}
 */
export async function groupTabsByDomain(scope, targetWindowId = null, opts = {}) {
  switch (scope) {
    case GroupingScope.GLOBAL: {
      if (!targetWindowId) throw new Error('Target window ID required for GLOBAL scope');
      return await groupGlobally(targetWindowId, opts);
    }
    case GroupingScope.TARGETED: {
      if (!targetWindowId) throw new Error('Target window ID required for TARGETED scope');
      return await groupInWindow(targetWindowId, opts);
    }
    case GroupingScope.PER_WINDOW: {
      return await groupPerWindow(opts);
    }
    default:
      throw new Error(`Invalid scope: ${scope}`);
  }
}

/**
 * GLOBAL scope: Pull all tabs from all windows into target window and group them.
 * Deterministic plan: move (if not already in target) → group.
 */
async function groupGlobally(targetWindowId, opts) {
  const result = baseResult({ targetWindow: targetWindowId });
  const { specificTabIds = null } = opts;

  // Get tabs - either specific ones or all tabs
  let allTabs;
  if (specificTabIds && specificTabIds.length > 0) {
    allTabs = await Promise.all(specificTabIds.map(id =>
      chrome.tabs.get(id).catch(() => null)
    ));
    allTabs = allTabs.filter(tab => tab !== null);
  } else {
    allTabs = await chrome.tabs.query({});
  }

  // Partition tabs
  const tabsToMove = [];
  for (const tab of allTabs) {
    if (!isValidTab(tab)) continue;
    if (tab.windowId !== targetWindowId) {
      tabsToMove.push(tab);
      result._windowsAffectedSet.add(tab.windowId);
    } else {
      result._windowsAffectedSet.add(targetWindowId);
    }
  }

  // Build plan up-front for determinism (especially useful if you enable dryRun)
  const plan = [];

  // Move steps
  for (const tab of tabsToMove) {
    plan.push({ kind: 'move', tabId: tab.id, toWindowId: targetWindowId, index: -1 });
  }

  // Execute moves (unless dryRun)
  if (!opts.dryRun) {
    for (const step of plan) {
      if (step.kind !== 'move') continue;
      try {
        await chrome.tabs.move(step.tabId, { windowId: step.toWindowId, index: step.index });
      } catch (err) {
        // Ignore move failures; keep going
        console.warn(`Move failed for tab ${step.tabId}:`, err);
      }
    }
  }

  // Refresh target window tabs after moves
  const targetResult = await groupInWindow(targetWindowId, opts);
  result.groupsCreated += targetResult.groupsCreated;
  result.groupsReused += targetResult.groupsReused;
  result.totalTabsGrouped += targetResult.totalTabsGrouped;

  // Merge plans
  result.plan = plan.concat(targetResult.plan || []);
  finalizeResult(result);
  return result;
}

/**
 * TARGETED scope: Group tabs only within the specified window.
 */
async function groupInWindow(windowId, opts = {}) {
  const {
    minTabsPerGroup = 2,
    includeSingleIfExisting = true,
    includePinned = false,
    dryRun = false,
    specificTabIds = null
  } = opts;

  const result = baseResult();
  result._windowsAffectedSet.add(windowId);

  // Get tabs - either specific ones or all in window
  let tabs;
  if (specificTabIds && specificTabIds.length > 0) {
    // Get only the specific tabs requested
    tabs = await Promise.all(specificTabIds.map(id =>
      chrome.tabs.get(id).catch(() => null)
    ));
    tabs = tabs.filter(tab => tab && tab.windowId === windowId);
  } else {
    tabs = await chrome.tabs.query({ windowId });
  }

  const existingGroups = await chrome.tabGroups.query({ windowId });

  // Map existing groups by title (domain title convention)
  const groupsByTitle = new Map();
  for (const group of existingGroups) {
    if (group && typeof group.title === 'string' && group.title.trim()) {
      groupsByTitle.set(group.title, group.id);
    }
  }

  // Group ungrouped tabs by normalized domain
  const domainMap = new Map();
  for (const tab of tabs) {
    if (!isValidTab(tab)) continue;
    if (tab.groupId && tab.groupId !== -1) continue; // already in a group
    if (!includePinned && tab.pinned) continue; // skip pinned tabs unless explicitly included
    const domain = tryGetDomain(tab.url);
    if (!domain) continue;

    if (!domainMap.has(domain)) domainMap.set(domain, []);
    domainMap.get(domain).push(tab.id);
  }

  // Deterministic: sort domains to keep stable order across runs
  const domains = Array.from(domainMap.keys()).sort();

  // Build & execute plan
  const plan = [];
  let groupsCreated = 0;
  let groupsReused = 0;
  let totalTabsGrouped = 0;

  for (const domain of domains) {
    const tabIds = domainMap.get(domain);
    const hasExisting = groupsByTitle.has(domain);

    // Create only if we meet threshold OR if we're adding to an existing group (1+ allowed)
    const canCreate = tabIds.length >= minTabsPerGroup;
    const canReuse = hasExisting && (includeSingleIfExisting ? tabIds.length >= 1 : tabIds.length >= minTabsPerGroup);

    if (!canCreate && !canReuse) continue;

    if (hasExisting) {
      // Reuse existing group
      const groupId = groupsByTitle.get(domain);
      plan.push({ kind: 'group-add', tabIds: tabIds.slice(), groupId, windowId });
      groupsReused += 1;
      totalTabsGrouped += tabIds.length;
    } else {
      // Create new group
      // Deterministic color based on domain hash (no shuffle)
      const color = pickColorForDomain(domain);
      plan.push({ kind: 'group-create', tabIds: tabIds.slice(), title: domain, color, windowId });
      groupsCreated += 1;
      totalTabsGrouped += tabIds.length;
    }
  }

  // Execute
  if (!opts.dryRun) {
    for (const step of plan) {
      try {
        if (step.kind === 'group-add') {
          if (step.tabIds.length) {
            await chrome.tabs.group({ tabIds: step.tabIds, groupId: step.groupId });
          }
        } else if (step.kind === 'group-create') {
          if (step.tabIds.length) {
            const gid = await chrome.tabs.group({ tabIds: step.tabIds });
            await chrome.tabGroups.update(gid, {
              title: step.title,
              color: step.color,
              collapsed: false
            });
          }
        }
      } catch (err) {
        console.warn(`Grouping step failed (${step.kind}):`, err);
        // Continue; we still want a consistent return payload
      }
    }
  }

  result.groupsCreated = groupsCreated;
  result.groupsReused = groupsReused;
  result.totalTabsGrouped = totalTabsGrouped;
  result.plan = plan;
  finalizeResult(result);
  return { ...result, windowId };
}

/**
 * PER_WINDOW scope: Group tabs within each window independently.
 */
async function groupPerWindow(opts) {
  const result = baseResult();
  const windows = await chrome.windows.getAll();

  for (const win of windows) {
    const windowResult = await groupInWindow(win.id, opts);
    if (windowResult.totalTabsGrouped > 0) {
      result.groupsCreated += windowResult.groupsCreated;
      result.groupsReused += windowResult.groupsReused;
      result.totalTabsGrouped += windowResult.totalTabsGrouped;
      result._windowsAffectedSet.add(win.id);
      // Append plan for traceability
      if (Array.isArray(windowResult.plan) && windowResult.plan.length) {
        if (!result.plan) result.plan = [];
        result.plan = result.plan.concat(windowResult.plan);
      }
    }
  }

  finalizeResult(result);
  return result;
}

/**
 * Group a single tab by its domain or a custom name.
 * Will reuse existing group with same name if it exists in the tab's window.
 * Used primarily by the rules engine for single-tab operations.
 *
 * @param {number} tabId - The ID of the tab to group
 * @param {Object} [opts] - Options
 * @param {string} [opts.groupName] - Custom group name (if not provided, uses domain)
 * @param {boolean} [opts.createIfMissing=true] - Create a new group if no matching group exists
 * @returns {Promise<{success:boolean, groupId?:number, reused:boolean, error?:string}>}
 */
export async function groupSingleTab(tabId, opts = {}) {
  const { groupName = null, createIfMissing = true } = opts;

  try {
    const tab = await chrome.tabs.get(tabId);

    // Determine the group title
    let title;
    if (groupName) {
      // Use custom group name
      title = groupName;
    } else {
      // Use domain from URL
      if (!isValidTab(tab)) {
        return { success: false, error: 'Invalid tab URL' };
      }
      title = tryGetDomain(tab.url);
      if (!title) {
        return { success: false, error: 'Cannot determine domain' };
      }
    }

    // Check if already in the correct group
    if (tab.groupId && tab.groupId !== -1) {
      const group = await chrome.tabGroups.get(tab.groupId);
      if (group.title === title) {
        return { success: true, groupId: tab.groupId, reused: true };
      }
    }

    // Look for existing group with same title in this window
    const existingGroups = await chrome.tabGroups.query({ windowId: tab.windowId });
    let targetGroupId = null;

    for (const group of existingGroups) {
      if (group.title === title) {
        targetGroupId = group.id;
        break;
      }
    }

    if (targetGroupId) {
      // Add to existing group
      await chrome.tabs.group({ tabIds: [tabId], groupId: targetGroupId });
      return { success: true, groupId: targetGroupId, reused: true };
    } else if (createIfMissing) {
      // Create new group
      const newGroupId = await chrome.tabs.group({ tabIds: [tabId] });
      const color = groupName ? pickColorForDomain(groupName) : pickColorForDomain(title);
      await chrome.tabGroups.update(newGroupId, {
        title: title,
        color: color,
        collapsed: false
      });
      return { success: true, groupId: newGroupId, reused: false };
    } else {
      return { success: false, error: 'No matching group exists' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Helper to get the current window ID for dashboard/popup contexts (explicit; no magic)
 */
export async function getCurrentWindowId() {
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return currentTab?.windowId ?? null;
}

/* ---------------------- internals (minimal, deterministic) ---------------------- */

function baseResult(extra = {}) {
  return {
    groupsCreated: 0,
    groupsReused: 0,
    totalTabsGrouped: 0,
    windowsAffected: [],
    plan: [],
    _windowsAffectedSet: new Set(),
    ...extra
  };
}

function finalizeResult(r) {
  r.windowsAffected = Array.from(r._windowsAffectedSet.values()).sort((a, b) => a - b);
  delete r._windowsAffectedSet;
}

/** Lowercase hostname, strip leading "www." only. Keep it simple & predictable. */
function tryGetDomain(url) {
  try {
    if (!url || typeof url !== 'string') return null;
    if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:')) return null;
    const u = new URL(url);
    let h = (u.hostname || '').toLowerCase();
    if (h.startsWith('www.')) h = h.slice(4);
    return h || null;
  } catch {
    return null;
  }
}

/** Deterministic color choice per domain via simple hash. */
function pickColorForDomain(domain) {
  const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = ((hash << 5) - hash + domain.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % colors.length;
  return colors[idx];
}

/** Valid if it has an id, a windowId, and a URL we can parse (http/https/…); excludes internal pages. */
function isValidTab(tab) {
  if (!tab || typeof tab.id !== 'number' || typeof tab.windowId !== 'number') return false;
  // Some tabs (new-tab pages) have no URL or about:blank — treat them as invalid for grouping
  if (!tab.url || typeof tab.url !== 'string') return false;
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) return false;
  return true;
}