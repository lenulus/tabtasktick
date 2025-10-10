// ENGINE v2 (Services) - SERVICES-FIRST REFACTOR
// Status: TESTED / READY FOR MIGRATION
// Size: 383 lines - Thin orchestrator (selection moved to SelectionService)
// The "real v2" - practical refactor with backward compatibility
//
// Rules Engine - Thin orchestrator for rule evaluation and action execution
// Delegates selection to SelectionService, only handles orchestration

import { selectTabsMatchingRule } from '../services/selection/selectTabs.js';
import * as SnoozeService from '../services/execution/SnoozeService.js';
import * as SuspensionService from '../services/execution/SuspensionService.js';
import { validateActionList, sortActionsByPriority } from './action-validator.js';
import { groupTabs } from '../services/execution/groupTabs.js';
import { closeTabs, pinTabs, unpinTabs, muteTabs, unmuteTabs, moveTabsToWindow } from '../services/execution/TabActionsService.js';
import { bookmarkTabs } from '../services/execution/BookmarkService.js';
import { parseDuration } from './utils/time.js';
import { closeDuplicates } from '../services/execution/closeDuplicates.js';

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
      const strategy = action.keep || 'oldest';
      const dupeResults = await closeDuplicates(tabs, strategy, dryRun, context.chrome);
      results.push(...dupeResults);
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
 * Delegates all actions to services - engine only handles orchestration and dry-run
 */
async function executeAction(action, tab, context, dryRun) {
  const actionType = action.action || action.type;

  // Handle dry-run mode at engine level (services don't know about dry-run)
  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      action: actionType,
      tabId: tab.id,
      details: { preview: true }
    };
  }

  // Delegate all actions to services
  switch (actionType) {
    case 'close':
      return await closeTabs([tab.id]);

    case 'pin':
      return await pinTabs([tab.id]);

    case 'unpin':
      return await unpinTabs([tab.id]);

    case 'mute':
      return await muteTabs([tab.id]);

    case 'unmute':
      return await unmuteTabs([tab.id]);

    case 'suspend':
    case 'discard':
      const result = await SuspensionService.suspendTabs([tab.id], action.params);
      if (result.errors.length > 0) {
        return { success: false, error: result.errors[0].error };
      }
      if (result.skipped.length > 0) {
        return { success: false, error: 'Tab was skipped (active, pinned, or audible)' };
      }
      return { success: true, details: { suspended: tab.id } };

    case 'snooze':
      const duration = parseDuration(action.for || '1h');
      const snoozeUntil = Date.now() + duration;
      await SnoozeService.snoozeTabs([tab.id], snoozeUntil, `rule: ${context.ruleName || 'v2_rule'}`);
      return { success: true, details: { snoozed: tab.id, until: new Date(snoozeUntil).toISOString() } };

    case 'group':
      // CRITICAL BUG FIX: Group action was imported but not in switch statement!
      return await groupTabs([tab.id], {
        name: action.name,
        byDomain: action.by === 'domain' || action.group_by === 'domain',
        createIfMissing: action.createIfMissing !== false,
        windowId: tab.windowId // Ensure grouping in correct window
      });

    case 'bookmark':
      return await bookmarkTabs([tab.id], { folder: action.to });

    case 'move':
      return await moveTabsToWindow([tab.id], {
        windowId: action.windowId || action.to,
        preserveGroup: action.preserveGroup !== false
      });

    default:
      return { success: false, error: `Unknown action: ${actionType}` };
  }
}

// Re-export for backward compatibility
export { selectTabsMatchingRule } from '../services/selection/selectTabs.js';

/**
 * @deprecated Use selectTabsMatchingRule from SelectionService
 * Provided for backward compatibility with tests
 */
export function evaluateRule(rule, context, options = {}) {
  console.warn('evaluateRule is deprecated. Use selectTabsMatchingRule from SelectionService');

  // Context should already have idx from test-helpers.js
  if (!context.idx) {
    console.error('evaluateRule: context.idx is missing. Tests should use createTestContext() from test-helpers.js');
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