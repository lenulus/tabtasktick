// services/utils/activityFormatter.js
// Pure function service for formatting activity messages from rule execution results

/**
 * Format activity message from rule execution results
 * @param {string} ruleName - Name of the rule
 * @param {object} results - Execution results from engine
 * @param {string} triggerType - Type of trigger (manual, repeat, etc)
 * @returns {string} Formatted activity message
 */
export function formatRuleActivityMessage(ruleName, results, triggerType) {
  if (!results || !results.rules || results.rules.length === 0) {
    return `${ruleName}: No actions taken (${triggerType})`;
  }

  const ruleResult = results.rules[0];
  const actions = ruleResult.actions || [];

  // Count actions by type
  const actionCounts = {};
  for (const action of actions) {
    if (action.success) {
      const type = action.action || action.type;
      actionCounts[type] = (actionCounts[type] || 0) + 1;
    }
  }

  // Build detailed message
  const actionParts = [];
  for (const [type, count] of Object.entries(actionCounts)) {
    const verb = formatActionType(type, count);
    actionParts.push(`${verb} ${count} ${count === 1 ? 'tab' : 'tabs'}`);
  }

  if (actionParts.length === 0) {
    return `${ruleName}: No successful actions (${triggerType})`;
  }

  return `${ruleName}: ${actionParts.join(', ')} (${triggerType})`;
}

/**
 * Format action type for display with proper grammar
 * @param {string} type - Action type
 * @param {number} count - Number of items affected (unused but kept for API consistency)
 * @returns {string} Formatted action description
 */
function formatActionType(type, count) {
  const actionVerbs = {
    'close': 'closed',
    'close-duplicates': 'closed duplicate',
    'group': 'grouped',
    'snooze': 'snoozed',
    'bookmark': 'bookmarked',
    'pin': 'pinned',
    'unpin': 'unpinned',
    'mute': 'muted',
    'unmute': 'unmuted',
    'discard': 'suspended',
    'move_to_window': 'moved'
  };

  return actionVerbs[type] || type;
}

/**
 * Get pluralized action noun
 * @param {number} count - Number of actions
 * @returns {string} "action" or "actions"
 */
export function pluralizeAction(count) {
  return count === 1 ? 'action' : 'actions';
}

/**
 * Format action counts for UI display
 * @param {object} actionCounts - Object mapping action types to counts
 * @returns {string} Formatted action summary (e.g., "closed 2 tabs, grouped 5 tabs")
 */
export function formatActionCounts(actionCounts) {
  if (!actionCounts || Object.keys(actionCounts).length === 0) {
    return 'No matching tabs found';
  }

  const actionParts = [];
  for (const [type, count] of Object.entries(actionCounts)) {
    const verb = formatActionType(type, count);
    actionParts.push(`${verb} ${count} ${count === 1 ? 'tab' : 'tabs'}`);
  }

  return actionParts.join(', ');
}
