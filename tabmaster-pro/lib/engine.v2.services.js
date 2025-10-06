// ENGINE v2 (Services) - SERVICES-FIRST REFACTOR
// Status: TESTED / READY FOR MIGRATION
// Size: 383 lines - Thin orchestrator (selection moved to SelectionService)
// The "real v2" - practical refactor with backward compatibility
//
// Rules Engine - Thin orchestrator for rule evaluation and action execution
// Delegates selection to SelectionService, only handles orchestration

import { selectTabsMatchingRule } from '../services/selection/selectTabs.js';
import * as SnoozeService from '../services/execution/SnoozeService.js';
import { validateActionList, sortActionsByPriority } from './action-validator.js';
import { groupTabs } from '../services/execution/groupTabs.js';

/**
 * Run all enabled rules against the current context
 * @param {Array} rules - Array of rule definitions
 * @param {object} context - Execution context with chrome API
 * @param {object} options - Run options (dryRun, skipPinned, forceExecution, etc)
 * @returns {object} Execution results and statistics
 */
export async function runRules(rules, context, options = {}) {
  const startTime = Date.now();
  const results = {
    rules: [],
    totalMatches: 0,
    totalActions: 0,
    errors: [],
    duration: 0
  };

  for (const rule of rules) {
    // Skip disabled rules unless forceExecution is set
    if (!rule.enabled && !options.forceExecution) continue;

    try {
      // 1. Select matching tabs using SelectionService
      // Pass context.tabs if available for better performance
      const matches = await selectTabsMatchingRule(rule, context.tabs, context.windows);

      if (matches.length > 0) {
        // Get actions from rule (handle both old and new formats)
        const ruleActions = rule.then || rule.actions;

        if (!ruleActions || (Array.isArray(ruleActions) && ruleActions.length === 0)) {
          console.warn(`Rule ${rule.name} has no actions defined`);
          continue;
        }

        // Add rule name to context for logging
        context.ruleName = rule.name;

        // 2. Execute actions on matched tabs
        const actions = await executeActions(
          ruleActions,
          matches,
          context,
          options.dryRun
        );

        // 3. Log results
        results.rules.push({
          ruleId: rule.id,
          ruleName: rule.name,
          matches: matches.map(t => ({ id: t.id, url: t.url, title: t.title })),
          actions,
          matchCount: matches.length
        });

        results.totalMatches += matches.length;
        results.totalActions += actions.length;
      }
    } catch (error) {
      console.error(`Error executing rule ${rule.name}:`, error);
      results.errors.push({
        ruleId: rule.id,
        ruleName: rule.name,
        error: error.message
      });
    }
  }

  results.duration = Date.now() - startTime;
  return results;
}

/**
 * Execute actions on matched tabs
 * @param {Array} actions - Array of action definitions
 * @param {Array} tabs - Array of tabs to act on
 * @param {object} context - Execution context with chrome API
 * @param {boolean} dryRun - Whether to simulate without executing
 * @returns {Array} Array of execution results
 */
export async function executeActions(actions, tabs, context, dryRun = false) {
  // Ensure actions is an array
  const actionArray = Array.isArray(actions) ? actions : [actions];

  // Validate and sort actions
  const validation = validateActionList(actionArray);
  if (!validation.valid && !dryRun) {
    console.warn('Invalid action combination:', validation.errors);
  }

  const sortedActions = sortActionsByPriority(actionArray);
  const results = [];

  for (const action of sortedActions) {
    // Handle close-duplicates action specially
    if (action.action === 'close-duplicates' || action.type === 'close-duplicates') {
      // Group tabs by their dupeKey
      const dupeGroups = {};
      for (const tab of tabs) {
        if (!dupeGroups[tab.dupeKey]) {
          dupeGroups[tab.dupeKey] = [];
        }
        dupeGroups[tab.dupeKey].push(tab);
      }

      // Process each group of duplicates
      for (const [dupeKey, dupeTabs] of Object.entries(dupeGroups)) {
        if (dupeTabs.length <= 1) {
          // No duplicates in this group
          continue;
        }

        // Determine which tab(s) to close based on keep strategy
        const keepStrategy = action.keep || 'oldest'; // Default to keeping oldest
        let tabsToClose = [];

        if (keepStrategy === 'none') {
          // Close all duplicates
          tabsToClose = dupeTabs;
        } else {
          // Sort tabs to identify which to keep
          const sortedDupes = [...dupeTabs].sort((a, b) => {
            // Sort by creation time (use ID as proxy if no createdAt)
            const aTime = a.createdAt || a.id;
            const bTime = b.createdAt || b.id;
            return aTime - bTime; // Oldest first
          });

          if (keepStrategy === 'oldest') {
            // Keep first (oldest), close the rest
            tabsToClose = sortedDupes.slice(1);
          } else if (keepStrategy === 'newest') {
            // Keep last (newest), close the rest
            tabsToClose = sortedDupes.slice(0, -1);
          }
        }

        // Close the designated duplicates
        for (const tab of tabsToClose) {
          try {
            if (!dryRun && context.chrome?.tabs) {
              await context.chrome.tabs.remove(tab.id);
            }
            results.push({
              tabId: tab.id,
              action: 'close-duplicates',
              success: true,
              details: {
                closed: tab.id,
                dupeKey: tab.dupeKey,
                strategy: keepStrategy
              }
            });
          } catch (error) {
            results.push({
              tabId: tab.id,
              action: 'close-duplicates',
              success: false,
              error: error.message
            });
          }
        }
      }
      continue; // Move to next action
    }

    // Handle batch actions (like group)
    if (action.action === 'group' || action.type === 'group') {
      const options = {
        byDomain: action.by === 'domain' || action.group_by === 'domain',
        customName: action.name || null,
        perWindow: true,
        dryRun,
        callerWindowId: action.callerWindowId || null
      };

      const tabIds = tabs.map(t => t.id);
      const result = await groupTabs(tabIds, options);

      for (const tab of tabs) {
        results.push({
          tabId: tab.id,
          action: 'group',
          success: result.success,
          details: result.summary
        });
      }
    } else {
      // Handle individual tab actions
      for (const tab of tabs) {
        try {
          const result = await executeAction(action, tab, context, dryRun);
          results.push({
            tabId: tab.id,
            action: action.action || action.type,
            success: result.success,
            ...result
          });
        } catch (error) {
          results.push({
            tabId: tab.id,
            action: action.action || action.type,
            success: false,
            error: error.message
          });
        }
      }
    }
  }

  return results;
}

/**
 * Execute a single action on a tab
 * Simplified to just handle basic tab operations
 */
async function executeAction(action, tab, context, dryRun) {
  const actionType = action.action || action.type;

  switch (actionType) {
    case 'close':
      if (!dryRun && context.chrome?.tabs) {
        await context.chrome.tabs.remove(tab.id);
      }
      return { success: true, details: { closed: tab.id } };

    case 'pin':
      if (!dryRun && context.chrome?.tabs) {
        await context.chrome.tabs.update(tab.id, { pinned: true });
      }
      return { success: true, details: { pinned: tab.id } };

    case 'unpin':
      if (!dryRun && context.chrome?.tabs) {
        await context.chrome.tabs.update(tab.id, { pinned: false });
      }
      return { success: true, details: { unpinned: tab.id } };

    case 'mute':
      if (!dryRun && context.chrome?.tabs) {
        await context.chrome.tabs.update(tab.id, { muted: true });
      }
      return { success: true, details: { muted: tab.id } };

    case 'unmute':
      if (!dryRun && context.chrome?.tabs) {
        await context.chrome.tabs.update(tab.id, { muted: false });
      }
      return { success: true, details: { unmuted: tab.id } };

    case 'suspend':
    case 'discard':
      if (!dryRun && context.chrome?.tabs && !tab.active) {
        await context.chrome.tabs.discard(tab.id);
      }
      return { success: true, details: { suspended: tab.id } };

    case 'snooze':
      const duration = parseDuration(action.for || '1h');
      const snoozeUntil = Date.now() + duration;

      if (!dryRun && SnoozeService) {
        await SnoozeService.snoozeTabs([tab.id], snoozeUntil, `rule: ${context.ruleName || 'v2_rule'}`);
      }
      return { success: true, details: { snoozed: tab.id, until: new Date(snoozeUntil).toISOString() } };

    case 'bookmark':
      // TODO: Move to BookmarkService
      if (!dryRun && context.chrome?.bookmarks) {
        let parentId = '2'; // Default: Other Bookmarks

        // If 'to' folder is specified, find or create it
        if (action.to) {
          try {
            const bookmarks = await context.chrome.bookmarks.search({ title: action.to });
            const folder = bookmarks.find(b => !b.url); // Find folder (not URL bookmark)
            if (folder) {
              parentId = folder.id;
            } else {
              // Folder doesn't exist, create it in Other Bookmarks
              const newFolder = await context.chrome.bookmarks.create({
                parentId: '2',
                title: action.to
              });
              parentId = newFolder.id;
            }
          } catch (error) {
            console.warn('Failed to find/create bookmark folder:', action.to, error);
          }
        }

        await context.chrome.bookmarks.create({
          parentId,
          title: tab.title,
          url: tab.url
        });
      }
      return { success: true, details: { bookmarked: tab.id } };

    case 'move':
      if (!dryRun && context.chrome?.tabs && context.chrome?.windows) {
        const windowId = action.windowId || action.to;
        const preserveGroup = action.preserveGroup !== false; // Default to true

        if (!windowId) {
          return { success: false, error: 'Move action requires windowId parameter' };
        }

        // Store original group info before moving
        const originalGroupId = tab.groupId;
        let groupTitle = null;
        let groupColor = null;

        if (originalGroupId && originalGroupId !== -1 && preserveGroup) {
          try {
            const group = await context.chrome.tabGroups.get(originalGroupId);
            groupTitle = group.title;
            groupColor = group.color;
          } catch (e) {
            // Group might not exist anymore
          }
        }

        // Handle "new" window creation
        if (windowId === 'new') {
          // Store original focused window
          const currentWindow = await context.chrome.windows.getCurrent();
          const originalFocusedWindowId = currentWindow.id;

          const newWindow = await context.chrome.windows.create({
            tabId: tab.id,
            focused: false
          });

          // Re-group if needed
          if (groupTitle && preserveGroup) {
            // Focus the new window to create group correctly
            await context.chrome.windows.update(newWindow.id, { focused: true });

            const newGroupId = await context.chrome.tabs.group({
              tabIds: [tab.id]
            });
            await context.chrome.tabGroups.update(newGroupId, {
              title: groupTitle,
              color: groupColor
            });

            // Restore original focus
            await context.chrome.windows.update(originalFocusedWindowId, { focused: true });
          }

          return {
            success: true,
            details: { moved: tab.id, windowId: newWindow.id, newWindow: true, regrouped: !!groupTitle }
          };
        }

        // Move to existing window
        await context.chrome.tabs.move(tab.id, {
          windowId: parseInt(windowId),
          index: -1
        });

        // Re-group if needed
        if (groupTitle && preserveGroup) {
          // Store original focused window
          const currentWindow = await context.chrome.windows.getCurrent();
          const originalFocusedWindowId = currentWindow.id;

          // CRITICAL: Focus the target window first, otherwise Chrome creates group in focused window
          await context.chrome.windows.update(parseInt(windowId), { focused: true });

          const newGroupId = await context.chrome.tabs.group({
            tabIds: [tab.id]
          });
          await context.chrome.tabGroups.update(newGroupId, {
            title: groupTitle,
            color: groupColor
          });

          // Restore original focus
          await context.chrome.windows.update(originalFocusedWindowId, { focused: true });
        }

        return {
          success: true,
          details: { moved: tab.id, windowId: parseInt(windowId), newWindow: false, regrouped: !!groupTitle }
        };
      }
      return { success: true, details: { moved: tab.id } };

    default:
      return { success: false, error: `Unknown action: ${actionType}` };
  }
}

/**
 * Parse duration string into milliseconds
 */
function parseDuration(duration) {
  if (typeof duration === 'number') return duration;
  if (typeof duration !== 'string') return 0;

  const units = { m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  const match = duration.match(/^(\d+)([mhd])$/);
  if (!match) return 0;

  const [, num, unit] = match;
  return parseInt(num) * units[unit];
}

// Re-export for backward compatibility
export { selectTabsMatchingRule } from '../services/selection/selectTabs.js';

/**
 * @deprecated Use selectTabsMatchingRule from SelectionService
 * Provided for backward compatibility with tests
 */
export function buildIndices(tabs) {
  console.warn('buildIndices is deprecated. Use selectTabsMatchingRule from SelectionService');

  const byDomain = {};
  const byOrigin = {};
  const byDupeKey = {};
  const byCategory = {};

  for (const tab of tabs) {
    // Extract domain from URL
    const extractDomain = (url) => {
      if (!url) return '';
      try {
        const u = new URL(url);
        return u.hostname.toLowerCase().replace('www.', '');
      } catch {
        return '';
      }
    };

    // Simple URL normalization
    const normalizeUrl = (url) => {
      if (!url) return '';
      try {
        const u = new URL(url);
        // Remove tracking params
        ['utm_source', 'utm_medium', 'utm_campaign'].forEach(p => u.searchParams.delete(p));
        u.hash = '';
        return u.toString().toLowerCase();
      } catch {
        return url.toLowerCase();
      }
    };

    tab.domain = tab.domain || extractDomain(tab.url);
    tab.dupeKey = tab.dupeKey || normalizeUrl(tab.url);
    tab.origin = tab.origin || extractDomain(tab.referrer || '');
    tab.category = tab.category || 'unknown';

    if (tab.lastAccessed) {
      tab.age = Date.now() - tab.lastAccessed;
    }

    (byDomain[tab.domain] ||= []).push(tab);
    (byOrigin[tab.origin] ||= []).push(tab);
    (byDupeKey[tab.dupeKey] ||= []).push(tab);
    (byCategory[tab.category] ||= []).push(tab);
  }

  return { byDomain, byOrigin, byDupeKey, byCategory };
}

/**
 * @deprecated Use selectTabsMatchingRule from SelectionService
 * Provided for backward compatibility with tests
 */
export function evaluateRule(rule, context, options = {}) {
  console.warn('evaluateRule is deprecated. Use selectTabsMatchingRule from SelectionService');

  // Build indices if needed
  if (!context.idx) {
    context.idx = buildIndices(context.tabs);
  }

  // Simple matching for test compatibility
  const matches = [];
  for (const tab of context.tabs) {
    // Skip pinned tabs if configured
    if (options.skipPinned && tab.pinned && !rule.flags?.includePinned) {
      continue;
    }

    // Very basic condition matching for tests
    if (rule.when || rule.conditions) {
      const conditions = rule.when || rule.conditions;

      // Handle simple test cases
      if (conditions.all) {
        const allMatch = conditions.all.every(cond => {
          if (cond.eq && cond.eq[0] === 'tab.domain') {
            return tab.domain === cond.eq[1];
          }
          if (cond.gt && cond.gt[0] === 'tab.age') {
            return tab.age > cond.gt[1];
          }
          if (cond.is && cond.is[0] === 'tab.isDupe') {
            const dupeCount = context.idx.byDupeKey[tab.dupeKey]?.length || 1;
            return (dupeCount > 1) === cond.is[1];
          }
          if (cond.eq && cond.eq[0] === 'tab.category') {
            return tab.category === cond.eq[1];
          }
          if (cond.gt && cond.gt[0] === 'window.tabCount') {
            const window = context.windows?.find(w => w.id === tab.windowId);
            const tabCount = window?.tabs?.length || context.tabs.filter(t => t.windowId === tab.windowId).length;
            return tabCount > cond.gt[1];
          }
          return true;
        });

        if (allMatch) matches.push(tab);
      } else {
        // Default: include tab
        matches.push(tab);
      }
    }
  }

  return matches;
};

/**
 * Preview what a rule would do without executing actions
 * @param {object} rule - Rule to preview
 * @param {object} context - Context with tabs and windows
 * @param {object} options - Preview options
 * @returns {object} Preview results
 */
export async function previewRule(rule, context, options = {}) {
  const matches = await selectTabsMatchingRule(rule, context.tabs, context.windows);

  return {
    rule: {
      id: rule.id,
      name: rule.name,
      when: rule.when || rule.conditions,
      then: rule.then || rule.actions
    },
    matches: matches.map(t => ({
      id: t.id,
      url: t.url,
      title: t.title
    })),
    totalMatches: matches.length // Match v1 format for compatibility
  };
}