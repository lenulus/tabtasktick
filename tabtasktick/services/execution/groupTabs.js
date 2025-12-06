/**
 * @file groupTabs - Tab grouping with domain-based and custom naming
 *
 * @description
 * The groupTabs service provides tab grouping functionality using Chrome's native tab
 * groups API. It supports two primary grouping modes: domain-based grouping (automatic
 * organization by website) and custom naming (manual group naming).
 *
 * The service is execution-layer only - it acts on provided tab IDs without performing
 * any selection logic. Callers are responsible for selecting which tabs to group, typically
 * through selectTabs filters or user selection in UI.
 *
 * Key features include window boundary respect (perWindow option prevents cross-window
 * grouping), group reuse (adds tabs to existing groups with matching names), focus
 * management (prevents unexpected window focus changes), and dry-run preview mode.
 *
 * The service handles complex Chrome API quirks around window focus during group operations.
 * Chrome's tab.group API has unintuitive behavior: creating or adding to groups in non-focused
 * windows can steal focus or move tabs unexpectedly. The service carefully manages window
 * focus, switching to target windows during operations and restoring original focus afterward.
 *
 * @module services/execution/groupTabs
 *
 * @architecture
 * - Layer: Execution Service (Complex Operations)
 * - Dependencies: chrome.tabs.group API, chrome.tabGroups API, chrome.windows API
 * - Used By: Rules engine, dashboard bulk actions, popup quick actions
 * - Pattern: Plan-then-execute with focus management
 *
 * @example
 * // Group tabs by domain in current window
 * import { groupTabs } from './services/execution/groupTabs.js';
 *
 * const result = await groupTabs([123, 456, 789], {
 *   byDomain: true,
 *   perWindow: true
 * });
 *
 * console.log(`Created ${result.summary.groupsCreated} groups`);
 *
 * @example
 * // Group all tabs under custom name
 * const result = await groupTabs([123, 456], {
 *   customName: 'Important Work',
 *   perWindow: false // Allow cross-window grouping
 * });
 */

import { extractDomainForGrouping } from '../utils/domainUtils.js';

/**
 * Groups tabs by domain or custom name with configurable options.
 *
 * This is the main grouping function that takes tab IDs and creates/updates Chrome tab
 * groups based on the specified strategy. The function operates in two modes:
 *
 * 1. **Domain-based grouping** (byDomain: true): Automatically groups tabs by their domain
 *    (e.g., all github.com tabs in one group, all reddit.com tabs in another). Group names
 *    are derived from domain names. Respects minTabsPerGroup threshold.
 *
 * 2. **Custom naming** (customName provided): Groups all tabs under a single custom name,
 *    regardless of their domains. Useful for manual organization like "Project X" or "Research".
 *
 * Scoping control determines how windows are handled:
 * - scope: 'targeted' (default) - Groups tabs only within specified window (requires targetWindowId)
 * - scope: 'global' - Pulls all tabs from all windows into target window, then groups
 * - scope: 'per_window' - Processes each window independently
 *
 * Legacy perWindow option is preserved for backward compatibility:
 * - perWindow: true (default) - Respects window boundaries, creates separate groups per window
 * - perWindow: false - Allows cross-window grouping, may move tabs to consolidate groups
 *
 * The service implements a plan-then-execute pattern: it first analyzes which groups to create
 * or reuse, then executes the plan. The plan is returned in results for dry-run preview.
 *
 * Focus management is critical: Chrome's grouping API has quirks where operations in non-focused
 * windows can steal focus or move tabs unexpectedly. The service handles this by temporarily
 * switching focus to target windows during operations, then restoring original focus.
 *
 * @param {number[]} tabIds - Array of Chrome tab IDs to group
 * @param {Object} [options={}] - Grouping configuration options
 * @param {boolean} [options.byDomain=true] - Group tabs by their domain names
 * @param {string} [options.customName] - Custom group name (overrides byDomain if provided)
 * @param {string} [options.scope='targeted'] - Scoping mode: 'global' | 'targeted' | 'per_window'
 * @param {number} [options.targetWindowId] - Target window ID (required for global/targeted scopes)
 * @param {boolean} [options.perWindow=true] - Legacy: Respect window boundaries (no cross-window grouping)
 * @param {number} [options.minTabsPerGroup=2] - Minimum tabs required to create a new group
 * @param {boolean} [options.includeSingleIfExisting=true] - Add single tab to existing group with same name
 * @param {boolean} [options.includePinned=false] - Include pinned tabs in grouping
 * @param {boolean} [options.collapsed=false] - Collapse groups after creation
 * @param {boolean} [options.dryRun=false] - Preview mode - returns plan without executing
 * @param {number} [options.callerWindowId] - Window ID to restore focus to (overrides auto-detection)
 *
 * @returns {Promise<GroupResult>} Result object with execution details and summary
 *
 * @typedef {Object} GroupResult
 * @property {boolean} success - True if grouping completed successfully
 * @property {GroupStepResult[]} results - Results from each grouping step executed
 * @property {GroupStep[]} plan - Execution plan (what groups will be created/reused)
 * @property {GroupSummary} summary - Aggregate statistics about the operation
 * @property {string} [error] - Error message if operation failed
 *
 * @typedef {Object} GroupStepResult
 * @property {boolean} success - Whether this step succeeded
 * @property {string} action - Action taken: 'create' | 'reuse'
 * @property {number} groupId - Chrome group ID created or reused
 * @property {string} groupName - Group name/title
 * @property {number} tabCount - Number of tabs added to group
 * @property {string} [error] - Error message if step failed
 *
 * @typedef {Object} GroupStep
 * @property {string} action - Planned action: 'create' | 'reuse'
 * @property {number} [groupId] - Existing group ID (for reuse action)
 * @property {string} groupName - Group name/title
 * @property {number[]} tabIds - Tab IDs to group
 * @property {number} windowId - Target window ID
 * @property {string} [color] - Group color (for create action)
 * @property {boolean} [collapsed] - Whether to collapse group
 * @property {boolean} allowWindowMove - Whether tabs can be moved between windows
 *
 * @typedef {Object} GroupSummary
 * @property {number} totalTabs - Total tabs processed
 * @property {number} groupsCreated - Number of new groups created
 * @property {number} groupsReused - Number of existing groups reused
 *
 * @example
 * // Group tabs by domain, one group per window
 * import { groupTabs } from './services/execution/groupTabs.js';
 *
 * const result = await groupTabs([123, 456, 789], {
 *   byDomain: true,
 *   perWindow: true
 * });
 *
 * console.log(`Created ${result.summary.groupsCreated} groups`);
 * console.log(`Reused ${result.summary.groupsReused} existing groups`);
 *
 * @example
 * // Group all tabs under custom name (cross-window)
 * const result = await groupTabs([123, 456, 789], {
 *   customName: 'Important Work',
 *   perWindow: false, // Allow moving tabs between windows
 *   collapsed: false
 * });
 *
 * @example
 * // Dry-run preview (no execution)
 * const preview = await groupTabs([123, 456], {
 *   byDomain: true,
 *   dryRun: true
 * });
 *
 * console.log(`Would create ${preview.plan.length} groups`);
 * preview.plan.forEach(step => {
 *   console.log(`${step.action} "${step.groupName}" with ${step.tabIds.length} tabs`);
 * });
 *
 * @example
 * // Group with focus restoration
 * const currentWindow = await chrome.windows.getLastFocused();
 * const result = await groupTabs([123, 456], {
 *   byDomain: true,
 *   callerWindowId: currentWindow.id // Ensures focus returns here
 * });
 */
export async function groupTabs(tabIds, options = {}) {
  const {
    byDomain = true,
    customName = null,
    scope = 'targeted',
    targetWindowId = null,
    perWindow = true,
    minTabsPerGroup = 2,
    includeSingleIfExisting = true,
    includePinned = false,
    collapsed = false,
    dryRun = false,
    callerWindowId = null
  } = options;

  if (!tabIds || tabIds.length === 0) {
    return {
      success: true,
      results: [],
      plan: []
    };
  }

  try {
    // Validate scope-specific requirements
    // Exception: For backward compatibility, if using default scope with perWindow=true,
    // allow missing targetWindowId (will be inferred from tabs)
    const isLegacyUsage = scope === 'targeted' && !targetWindowId && perWindow;

    if ((scope === 'global' || (scope === 'targeted' && !isLegacyUsage)) && !targetWindowId) {
      return {
        success: false,
        error: `targetWindowId is required for scope: '${scope}'`,
        results: [],
        plan: []
      };
    }

    // Get full tab objects for the provided IDs
    const tabs = await Promise.all(
      tabIds.map(id => chrome.tabs.get(id).catch(() => null))
    );

    // Filter out nulls (tabs that don't exist)
    let validTabs = tabs.filter(tab => tab !== null);

    // Filter out pinned tabs if not included
    if (!includePinned) {
      validTabs = validTabs.filter(tab => !tab.pinned);
    }

    if (validTabs.length === 0) {
      return {
        success: false,
        error: 'No valid tabs found',
        results: [],
        plan: []
      };
    }

    // Handle scope: 'global' - pull all tabs to target window first
    if (scope === 'global') {
      return await handleGlobalScope(validTabs, targetWindowId, {
        byDomain,
        customName,
        minTabsPerGroup,
        includeSingleIfExisting,
        collapsed,
        dryRun,
        callerWindowId
      });
    }

    // Handle scope: 'per_window' - process each window independently
    if (scope === 'per_window') {
      return await handlePerWindowScope(validTabs, {
        byDomain,
        customName,
        minTabsPerGroup,
        includeSingleIfExisting,
        collapsed,
        dryRun,
        callerWindowId
      });
    }

    // Handle scope: 'targeted' - filter to target window only
    // Skip filtering if using legacy API (no targetWindowId provided)
    if (scope === 'targeted' && targetWindowId) {
      validTabs = validTabs.filter(tab => tab.windowId === targetWindowId);
      if (validTabs.length === 0) {
        return {
          success: false,
          error: 'No valid tabs found in target window',
          results: [],
          plan: []
        };
      }
    }

    // Build execution plan
    const plan = [];
    const results = [];

    if (customName) {
      // Group all tabs under custom name
      if (perWindow) {
        // Group per window with same custom name (no window moving)
        const tabsByWindow = groupTabsByWindow(validTabs);

        for (const [windowId, windowTabs] of tabsByWindow) {
          const step = await planGroupCreation(
            windowTabs,
            customName,
            windowId,
            collapsed,
            false,
            minTabsPerGroup,
            includeSingleIfExisting
          );
          if (step) plan.push(step);
        }
      } else {
        // Group all tabs together (may involve moving tabs)
        const step = await planGroupCreation(
          validTabs,
          customName,
          null,
          collapsed,
          true,
          minTabsPerGroup,
          includeSingleIfExisting
        );
        if (step) plan.push(step);
      }
    } else if (byDomain) {
      // Group tabs by their domains
      const tabsByDomain = groupTabsByDomain(validTabs);

      for (const [domain, domainTabs] of tabsByDomain) {
        if (perWindow) {
          // Further group by window (no window moving)
          const tabsByWindow = groupTabsByWindow(domainTabs);

          for (const [windowId, windowTabs] of tabsByWindow) {
            const step = await planGroupCreation(
              windowTabs,
              domain,
              windowId,
              collapsed,
              false,
              minTabsPerGroup,
              includeSingleIfExisting
            );
            if (step) plan.push(step);
          }
        } else {
          // Group all tabs of this domain together (may move windows)
          const step = await planGroupCreation(
            domainTabs,
            domain,
            null,
            collapsed,
            true,
            minTabsPerGroup,
            includeSingleIfExisting
          );
          if (step) plan.push(step);
        }
      }
    }

    // Execute plan (unless dry-run)
    if (!dryRun) {
      for (const step of plan) {
        const result = await executeGroupStep(step, callerWindowId);
        results.push(result);
      }
    }

    const windowCounts = {};
    for (const tab of validTabs) {
      windowCounts[tab.windowId] = (windowCounts[tab.windowId] || 0) + 1;
    }

    return {
      success: true,
      results,
      plan,
      summary: {
        totalTabs: validTabs.length,
        groupsCreated: plan.filter(s => s?.action === 'create').length,
        groupsReused: plan.filter(s => s?.action === 'reuse').length,
        debug: {
          planSteps: plan.length,
          planDetails: plan.map(s => ({ action: s?.action, groupName: s?.groupName, windowId: s?.windowId, tabCount: s?.tabIds?.length })),
          byDomain: byDomain,
          perWindow: perWindow,
          validTabsCount: validTabs.length,
          tabsWithGroupId: validTabs.filter(t => t.groupId && t.groupId !== -1).length,
          windowCounts: windowCounts,
          groupIds: [...new Set(validTabs.map(t => t.groupId).filter(id => id && id !== -1))]
        }
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      results: [],
      plan: []
    };
  }
}

/**
 * Plan a grouping operation
 * @private
 */
async function planGroupCreation(
  tabs,
  groupName,
  windowId,
  collapsed,
  allowWindowMove = false,
  minTabsPerGroup = 2,
  includeSingleIfExisting = true
) {
  if (tabs.length === 0) {
    return null;
  }

  // If no specific window, use the first tab's window
  const targetWindowId = windowId || tabs[0].windowId;

  // Check if a group with this name already exists
  // When allowWindowMove=false (perWindow=true), only search in target window to maintain window isolation
  // When allowWindowMove=true (perWindow=false), search all windows to allow consolidation
  const searchQuery = allowWindowMove ? {} : { windowId: targetWindowId };
  const groups = await chrome.tabGroups.query(searchQuery);
  const existingGroup = groups.find(g => g.title === groupName);

  // Filter out tabs that are already in the correct group
  let tabsToGroup = tabs;
  if (existingGroup) {
    tabsToGroup = tabs.filter(t => t.groupId !== existingGroup.id);

    // If all tabs are already in the correct group, nothing to do
    if (tabsToGroup.length === 0) {
      return null;
    }
  }

  const tabIds = tabsToGroup.map(t => t.id);

  if (existingGroup) {
    // Reuse existing group - tabs will be moved to the group's window
    // Apply includeSingleIfExisting: if false, still require minTabsPerGroup for reuse
    if (!includeSingleIfExisting && tabIds.length < minTabsPerGroup) {
      return null;
    }

    return {
      action: 'reuse',
      groupId: existingGroup.id,
      groupName: groupName,
      tabIds: tabIds,
      windowId: existingGroup.windowId, // Use the existing group's window, not the target window
      allowWindowMove: true // Allow movement to join the existing group
    };
  } else {
    // Create new group only if we meet the threshold
    if (tabIds.length < minTabsPerGroup) {
      return null;
    }

    return {
      action: 'create',
      groupName: groupName,
      tabIds: tabIds,
      windowId: targetWindowId,
      color: pickColorForName(groupName),
      collapsed: collapsed,
      allowWindowMove
    };
  }
}

/**
 * Execute a single grouping step
 * @private
 * @param {Object} step - The grouping step to execute
 * @param {number} callerWindowId - Window ID to restore focus to (overrides auto-detection)
 */
async function executeGroupStep(step, callerWindowId = null) {
  if (!step || step.tabIds.length === 0) {
    return { success: false, error: 'No tabs to group' };
  }

  try {
    let groupId;
    let originalFocusedWindowId = callerWindowId; // Use provided caller window if available

    // Verify all tabs are in the target window (they should be if perWindow=true)
    // Only move tabs if explicitly allowed (perWindow=false means cross-window grouping is ok)
    if (step.allowWindowMove) {
      const tabsToMove = [];
      for (const tabId of step.tabIds) {
        const tab = await chrome.tabs.get(tabId);
        if (tab.windowId !== step.windowId) {
          tabsToMove.push(tabId);
        }
      }

      if (tabsToMove.length > 0) {
        await chrome.tabs.move(tabsToMove, {
          windowId: step.windowId,
          index: -1
        });
      }
    }

    if (step.action === 'create') {
      // Chrome moves tabs to the focused window when creating groups
      // To maintain window isolation (perWindow=true), focus the target window first
      if (!step.allowWindowMove && step.windowId) {
        // Only detect focused window if caller didn't provide one
        if (!originalFocusedWindowId) {
          const windows = await chrome.windows.getAll();
          const focusedWindow = windows.find(w => w.focused);
          originalFocusedWindowId = focusedWindow?.id;
        }

        await chrome.windows.update(step.windowId, { focused: true });
      }

      // Create new group
      groupId = await chrome.tabs.group({ tabIds: step.tabIds });
      await chrome.tabGroups.update(groupId, {
        title: step.groupName,
        color: step.color,
        collapsed: step.collapsed
      });

      // Restore original focus
      if (originalFocusedWindowId && originalFocusedWindowId !== step.windowId) {
        await chrome.windows.update(originalFocusedWindowId, { focused: true });
      }
    } else if (step.action === 'reuse') {
      // Add to existing group
      groupId = step.groupId;

      // CRITICAL: Must focus the group's window to prevent tab stealing
      // Chrome will steal the entire group if we add tabs from a different focused window
      const group = await chrome.tabGroups.get(groupId);

      // Use provided callerWindowId, or detect focused window
      if (!originalFocusedWindowId) {
        const windows = await chrome.windows.getAll();
        const focusedWindow = windows.find(w => w.focused);
        originalFocusedWindowId = focusedWindow?.id;
      }

      const needsFocusSwitch = originalFocusedWindowId && originalFocusedWindowId !== group.windowId;

      if (needsFocusSwitch) {
        await chrome.windows.update(group.windowId, { focused: true });
      }

      await chrome.tabs.group({
        tabIds: step.tabIds,
        groupId: groupId
      });

      // Restore original focus
      if (needsFocusSwitch && originalFocusedWindowId) {
        await chrome.windows.update(originalFocusedWindowId, { focused: true });
      }
    }

    return {
      success: true,
      action: step.action,
      groupId: groupId,
      groupName: step.groupName,
      tabCount: step.tabIds.length
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      step: step
    };
  }
}

/**
 * Handle global scope: Pull all tabs to target window, then group
 * @private
 */
async function handleGlobalScope(validTabs, targetWindowId, options) {
  const {
    byDomain,
    customName,
    minTabsPerGroup,
    includeSingleIfExisting,
    collapsed,
    dryRun,
    callerWindowId
  } = options;

  const plan = [];
  const results = [];

  // Partition tabs by whether they need to move
  const tabsToMove = validTabs.filter(tab => tab.windowId !== targetWindowId);

  // Build move plan
  for (const tab of tabsToMove) {
    plan.push({
      kind: 'move',
      tabId: tab.id,
      toWindowId: targetWindowId,
      index: -1
    });
  }

  // Execute moves (unless dry-run)
  if (!dryRun) {
    for (const step of plan.filter(s => s.kind === 'move')) {
      try {
        await chrome.tabs.move(step.tabId, {
          windowId: step.toWindowId,
          index: step.index
        });
      } catch (err) {
        console.warn(`Move failed for tab ${step.tabId}:`, err);
      }
    }
  }

  // After moves, refresh tabs in target window and group them
  const targetWindowTabs = await chrome.tabs.query({ windowId: targetWindowId });
  const tabIdsSet = new Set(validTabs.map(t => t.id));
  const movedTabs = targetWindowTabs.filter(tab => tabIdsSet.has(tab.id));

  // Group the tabs in the target window
  const groupResult = await groupTabsInWindow(movedTabs, {
    byDomain,
    customName,
    windowId: targetWindowId,
    minTabsPerGroup,
    includeSingleIfExisting,
    collapsed,
    dryRun,
    callerWindowId,
    perWindow: true // Within target window, respect window boundaries
  });

  // Merge plans and results
  plan.push(...(groupResult.plan || []));
  results.push(...(groupResult.results || []));

  return {
    success: groupResult.success,
    results,
    plan,
    summary: {
      totalTabs: validTabs.length,
      tabsMoved: tabsToMove.length,
      groupsCreated: groupResult.summary?.groupsCreated || 0,
      groupsReused: groupResult.summary?.groupsReused || 0
    }
  };
}

/**
 * Handle per-window scope: Process each window independently
 * @private
 */
async function handlePerWindowScope(validTabs, options) {
  const {
    byDomain,
    customName,
    minTabsPerGroup,
    includeSingleIfExisting,
    collapsed,
    dryRun,
    callerWindowId
  } = options;

  // Group tabs by window
  const tabsByWindow = groupTabsByWindow(validTabs);

  const allPlans = [];
  const allResults = [];
  let totalGroupsCreated = 0;
  let totalGroupsReused = 0;

  // Process each window independently
  for (const [windowId, windowTabs] of tabsByWindow) {
    const windowResult = await groupTabsInWindow(windowTabs, {
      byDomain,
      customName,
      windowId,
      minTabsPerGroup,
      includeSingleIfExisting,
      collapsed,
      dryRun,
      callerWindowId,
      perWindow: true
    });

    if (windowResult.plan) allPlans.push(...windowResult.plan);
    if (windowResult.results) allResults.push(...windowResult.results);
    totalGroupsCreated += windowResult.summary?.groupsCreated || 0;
    totalGroupsReused += windowResult.summary?.groupsReused || 0;
  }

  return {
    success: true,
    results: allResults,
    plan: allPlans,
    summary: {
      totalTabs: validTabs.length,
      windowsProcessed: tabsByWindow.size,
      groupsCreated: totalGroupsCreated,
      groupsReused: totalGroupsReused
    }
  };
}

/**
 * Group tabs within a single window (helper for scope handlers)
 * @private
 */
async function groupTabsInWindow(tabs, options) {
  const {
    byDomain,
    customName,
    windowId,
    minTabsPerGroup,
    includeSingleIfExisting,
    collapsed,
    dryRun,
    callerWindowId,
    perWindow
  } = options;

  const plan = [];
  const results = [];

  if (customName) {
    // Group all tabs under custom name
    const step = await planGroupCreation(
      tabs,
      customName,
      windowId,
      collapsed,
      !perWindow,
      minTabsPerGroup,
      includeSingleIfExisting
    );
    if (step) plan.push(step);
  } else if (byDomain) {
    // Group tabs by their domains
    const tabsByDomain = groupTabsByDomain(tabs);

    for (const [domain, domainTabs] of tabsByDomain) {
      const step = await planGroupCreation(
        domainTabs,
        domain,
        windowId,
        collapsed,
        !perWindow,
        minTabsPerGroup,
        includeSingleIfExisting
      );
      if (step) plan.push(step);
    }
  }

  // Execute plan (unless dry-run)
  if (!dryRun) {
    for (const step of plan) {
      const result = await executeGroupStep(step, callerWindowId);
      results.push(result);
    }
  }

  return {
    success: true,
    results,
    plan,
    summary: {
      totalTabs: tabs.length,
      groupsCreated: plan.filter(s => s?.action === 'create').length,
      groupsReused: plan.filter(s => s?.action === 'reuse').length
    }
  };
}

/**
 * Group tabs by their domain
 * @private
 */
function groupTabsByDomain(tabs) {
  const domainMap = new Map();

  for (const tab of tabs) {
    const domain = extractDomainForGrouping(tab.url);
    if (domain) {
      if (!domainMap.has(domain)) {
        domainMap.set(domain, []);
      }
      domainMap.get(domain).push(tab);
    }
  }

  return domainMap;
}

/**
 * Group tabs by their window ID
 * @private
 */
function groupTabsByWindow(tabs) {
  const windowMap = new Map();

  for (const tab of tabs) {
    if (!windowMap.has(tab.windowId)) {
      windowMap.set(tab.windowId, []);
    }
    windowMap.get(tab.windowId).push(tab);
  }

  return windowMap;
}

/**
 * Pick a color for a group name (deterministic)
 * @private
 */
function pickColorForName(name) {
  const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }

  return colors[Math.abs(hash) % colors.length];
}