// services/utils/activityFormatter.js
// Locale-aware formatting of activity messages from rule execution results.
// Output depends only on the active locale (via the i18n helper).

import { t, tPlural } from './i18n.js';

/**
 * Format activity message from rule execution results
 * @param {string} ruleName - Name of the rule
 * @param {object} results - Execution results from engine
 * @param {string} triggerType - Type of trigger (manual, repeat, etc)
 * @returns {string} Formatted activity message
 */
export function formatRuleActivityMessage(ruleName, results, triggerType) {
  if (!results || !results.rules || results.rules.length === 0) {
    return t('activity_noActions', [ruleName, triggerType]);
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
    actionParts.push(tPlural('activity_actionPart', count, [formatActionType(type)]));
  }

  if (actionParts.length === 0) {
    return t('activity_noSuccess', [ruleName, triggerType]);
  }

  return t('activity_summary', [ruleName, actionParts.join(t('activity_join')), triggerType]);
}

/**
 * Format action type for display with proper grammar
 * @param {string} type - Action type
 * @returns {string} Formatted action description
 */
function formatActionType(type) {
  const verbKeys = {
    'close': 'activity_verb_close',
    'close-duplicates': 'activity_verb_closeDuplicate',
    'group': 'activity_verb_group',
    'snooze': 'activity_verb_snooze',
    'bookmark': 'activity_verb_bookmark',
    'pin': 'activity_verb_pin',
    'unpin': 'activity_verb_unpin',
    'mute': 'activity_verb_mute',
    'unmute': 'activity_verb_unmute',
    'discard': 'activity_verb_discard',
    'move_to_window': 'activity_verb_move'
  };

  return verbKeys[type] ? t(verbKeys[type]) : type;
}

/**
 * Get pluralized action noun
 * @param {number} count - Number of actions
 * @returns {string} "action" or "actions"
 */
export function pluralizeAction(count) {
  return tPlural('activity_actionNoun', count);
}

/**
 * Format action counts for UI display
 * @param {object} actionCounts - Object mapping action types to counts
 * @returns {string} Formatted action summary (e.g., "closed 2 tabs, grouped 5 tabs")
 */
export function formatActionCounts(actionCounts) {
  if (!actionCounts || Object.keys(actionCounts).length === 0) {
    return t('activity_noMatching');
  }

  const actionParts = [];
  for (const [type, count] of Object.entries(actionCounts)) {
    actionParts.push(tPlural('activity_actionPart', count, [formatActionType(type)]));
  }

  return actionParts.join(t('activity_join'));
}
