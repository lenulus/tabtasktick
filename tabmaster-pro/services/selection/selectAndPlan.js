// Select and Plan Service - Generates commands from rule matches
// Bridges the gap between tab selection and command execution

import { selectTabsMatchingRule } from './selectTabs.js';
import { Command, createCommandFromAction } from '../../lib/commands/Command.js';
import { extractDomain } from '../utils/domainUtils.js';

/**
 * Select tabs matching a rule and generate commands for execution
 * @param {Object} rule - Rule with conditions and actions
 * @param {Object} context - Context with tabs and windows
 * @param {Object} options - Selection options (e.g., skipPinned)
 * @returns {Object} { matches, commands }
 */
export async function selectAndPlanActions(rule, context, options = {}) {
  // 1. Select matching tabs
  const matches = await selectTabsMatchingRule(rule, context.tabs, context.windows);

  // 2. Generate commands from rule actions
  const commands = generateCommands(rule, matches);

  return {
    rule: {
      id: rule.id,
      name: rule.name
    },
    matches,
    commands
  };
}

/**
 * Generate commands from rule actions and matched tabs
 * @param {Object} rule - Rule with actions
 * @param {Array} matchedTabs - Tabs that matched the rule
 * @returns {Command[]} Array of commands to execute
 */
export function generateCommands(rule, matchedTabs) {
  if (!matchedTabs || matchedTabs.length === 0) {
    return [];
  }

  const actions = rule.then || rule.actions || [];
  const actionArray = Array.isArray(actions) ? actions : [actions];
  const commands = [];

  for (const actionDef of actionArray) {
    const actionType = actionDef.action || actionDef.type;

    // Handle special cases that need custom command generation
    if (actionType === 'group' && (actionDef.by === 'domain' || actionDef.group_by === 'domain')) {
      // Group by domain - create one command per domain group
      const domainGroups = groupTabsByDomain(matchedTabs);

      for (const [domain, tabs] of domainGroups) {
        const tabIds = tabs.map(t => t.id);
        commands.push(new Command('group', tabIds, {
          name: domain,
          byDomain: true,
          color: getColorForDomain(domain)
        }));
      }
    } else if (actionType === 'group' && (actionDef.by === 'window' || actionDef.group_by === 'window')) {
      // Group by window - create one command per window
      const windowGroups = groupTabsByWindow(matchedTabs);

      for (const [windowId, tabs] of windowGroups) {
        const tabIds = tabs.map(t => t.id);
        commands.push(new Command('group', tabIds, {
          name: actionDef.name || `Window ${windowId}`,
          windowId
        }));
      }
    } else if (actionType === 'group') {
      // Single group for all matched tabs
      const tabIds = matchedTabs.map(t => t.id);
      commands.push(new Command('group', tabIds, {
        name: actionDef.name || 'Group',
        ...actionDef
      }));
    } else {
      // Individual commands per tab
      for (const tab of matchedTabs) {
        commands.push(createCommandFromAction(actionDef, tab.id));
      }
    }
  }

  return commands;
}

/**
 * Group tabs by domain
 * @private
 */
function groupTabsByDomain(tabs) {
  const groups = new Map();

  for (const tab of tabs) {
    const domain = extractDomain(tab.url);
    if (!groups.has(domain)) {
      groups.set(domain, []);
    }
    groups.get(domain).push(tab);
  }

  return groups;
}

/**
 * Group tabs by window
 * @private
 */
function groupTabsByWindow(tabs) {
  const groups = new Map();

  for (const tab of tabs) {
    const windowId = tab.windowId;
    if (!groups.has(windowId)) {
      groups.set(windowId, []);
    }
    groups.get(windowId).push(tab);
  }

  return groups;
}

/**
 * Get color for domain (deterministic)
 * @private
 */
function getColorForDomain(domain) {
  const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = ((hash << 5) - hash) + domain.charCodeAt(i);
    hash = hash & hash;
  }

  return colors[Math.abs(hash) % colors.length];
}

/**
 * Plan commands for multiple rules
 * @param {Array} rules - Array of rules
 * @param {Object} context - Execution context
 * @returns {Array} Array of planning results
 */
export async function planMultipleRules(rules, context) {
  const results = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    try {
      const plan = await selectAndPlanActions(rule, context);
      results.push(plan);
    } catch (error) {
      console.error(`Error planning rule ${rule.name}:`, error);
      results.push({
        rule: { id: rule.id, name: rule.name },
        error: error.message,
        matches: [],
        commands: []
      });
    }
  }

  return results;
}

/**
 * Preview what commands would be generated without executing
 * @param {Object} rule - Rule to preview
 * @param {Object} context - Execution context
 * @returns {Object} Preview information
 */
export async function previewRuleCommands(rule, context) {
  const { matches, commands } = await selectAndPlanActions(rule, context);

  return {
    rule: {
      id: rule.id,
      name: rule.name,
      conditions: rule.when || rule.conditions,
      actions: rule.then || rule.actions
    },
    matchCount: matches.length,
    matches: matches.map(t => ({
      id: t.id,
      url: t.url,
      title: t.title
    })),
    commandCount: commands.length,
    commands: commands.map(cmd => cmd.preview())
  };
}

/**
 * Generate batch commands for bulk operations
 * @param {string} operation - Operation type (group, close, etc.)
 * @param {Array} tabs - Tabs to operate on
 * @param {Object} options - Operation options
 * @returns {Command[]} Generated commands
 */
export function generateBulkCommands(operation, tabs, options = {}) {
  const commands = [];

  switch (operation) {
    case 'group_by_domain':
      const domainGroups = groupTabsByDomain(tabs);
      for (const [domain, domainTabs] of domainGroups) {
        const tabIds = domainTabs.map(t => t.id);
        commands.push(new Command('group', tabIds, {
          name: domain,
          byDomain: true,
          color: getColorForDomain(domain)
        }));
      }
      break;

    case 'group_all':
      const allTabIds = tabs.map(t => t.id);
      commands.push(new Command('group', allTabIds, {
        name: options.name || 'Group',
        ...options
      }));
      break;

    case 'close_duplicates':
      // Keep first tab of each duplicate set
      const seen = new Set();
      const toClose = [];

      for (const tab of tabs) {
        const key = normalizeUrl(tab.url);
        if (seen.has(key)) {
          toClose.push(tab.id);
        } else {
          seen.add(key);
        }
      }

      if (toClose.length > 0) {
        commands.push(new Command('close', toClose, { reason: 'duplicate' }));
      }
      break;

    default:
      // Simple operation on all tabs
      const tabIds = tabs.map(t => t.id);
      if (tabIds.length > 0) {
        commands.push(new Command(operation, tabIds, options));
      }
  }

  return commands;
}

/**
 * Normalize URL for duplicate detection
 * @private
 */
function normalizeUrl(url) {
  if (!url) return '';

  try {
    const u = new URL(url);
    // Remove common tracking parameters
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid']
      .forEach(p => u.searchParams.delete(p));
    u.searchParams.sort();
    u.hash = '';
    return u.toString().toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}