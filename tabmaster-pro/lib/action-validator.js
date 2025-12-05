// Action Validator for Rules Engine 2.0
// Handles validation of action compatibility and mutual exclusivity

/**
 * Action categories define compatibility groups
 * - terminal: Actions that end tab lifecycle (cannot combine with anything)
 * - state: Actions that modify tab state (can combine with each other)
 * - organizational: Actions that reorganize tabs (can combine with state)
 * - deferral: Actions that defer tab handling (limited combinations)
 */
const ACTION_CATEGORIES = {
  terminal: ['close', 'close-duplicates'],
  state: ['pin', 'unpin', 'mute', 'unmute'],
  organizational: ['group', 'move_to_window'],
  deferral: ['snooze']
};

/**
 * Explicit compatibility rules for special cases
 */
const SPECIAL_RULES = {
  // Pin/unpin are mutually exclusive
  pin: { excludes: ['unpin'] },
  unpin: { excludes: ['pin'] },

  // Mute/unmute are mutually exclusive
  mute: { excludes: ['unmute'] },
  unmute: { excludes: ['mute'] },

  // Close has no parameters
  close: { allowsWith: [] }
};

/**
 * Get the category of an action
 */
export function getActionCategory(actionType) {
  for (const [category, actions] of Object.entries(ACTION_CATEGORIES)) {
    if (actions.includes(actionType)) {
      return category;
    }
  }
  return null;
}

/**
 * Check if two specific actions are compatible
 */
export function areActionsCompatible(action1, action2) {
  // Same action is not compatible
  if (action1 === action2) {
    return false;
  }
  
  // Check special exclusion rules
  const rules1 = SPECIAL_RULES[action1];
  if (rules1?.excludes?.includes(action2)) {
    return false;
  }
  
  const rules2 = SPECIAL_RULES[action2];
  if (rules2?.excludes?.includes(action1)) {
    return false;
  }
  
  // Get categories
  const category1 = getActionCategory(action1);
  const category2 = getActionCategory(action2);
  
  // Terminal actions are incompatible with everything
  if (category1 === 'terminal' || category2 === 'terminal') {
    return false;
  }
  
  // Deferral actions have limited compatibility
  if (category1 === 'deferral' || category2 === 'deferral') {
    // Check special rules for deferral actions
    if (category1 === 'deferral' && SPECIAL_RULES[action1]?.allowsWith?.includes(action2)) {
      return true;
    }
    if (category2 === 'deferral' && SPECIAL_RULES[action2]?.allowsWith?.includes(action1)) {
      return true;
    }
    // Otherwise, deferral actions can't combine
    return false;
  }
  
  // State and organizational actions can generally combine
  return true;
}

/**
 * Validate a list of actions for compatibility
 * @param {Array} actions - Array of action objects with 'type' property
 * @returns {Object} Validation result with 'valid' boolean and optional 'errors' array
 */
export function validateActionList(actions) {
  const errors = [];
  const actionTypes = actions.map(a => a.type);
  
  // Check for empty actions
  if (actions.length === 0) {
    return { valid: true };
  }
  
  // Check for duplicate actions
  const uniqueTypes = new Set(actionTypes);
  if (uniqueTypes.size !== actionTypes.length) {
    errors.push('Duplicate actions are not allowed');
  }
  
  // Check compatibility between all pairs
  for (let i = 0; i < actions.length; i++) {
    for (let j = i + 1; j < actions.length; j++) {
      if (!areActionsCompatible(actions[i].type, actions[j].type)) {
        errors.push(`Actions "${actions[i].type}" and "${actions[j].type}" are incompatible`);
      }
    }
  }
  
  // Check for terminal actions with other actions
  const hasTerminal = actions.some(a => getActionCategory(a.type) === 'terminal');
  if (hasTerminal && actions.length > 1) {
    errors.push('Terminal actions (close) cannot be combined with other actions');
  }
  
  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}

/**
 * Get available action types that can be added to existing actions
 * @param {Array} currentActions - Array of current action objects
 * @returns {Array} Array of action types that can be added
 */
export function getCompatibleActions(currentActions) {
  const allActionTypes = Object.values(ACTION_CATEGORIES).flat();
  
  if (currentActions.length === 0) {
    return allActionTypes;
  }
  
  // If there's a terminal action, no more actions can be added
  const hasTerminal = currentActions.some(a => getActionCategory(a.type) === 'terminal');
  if (hasTerminal) {
    return [];
  }
  
  // Filter compatible actions
  return allActionTypes.filter(actionType => {
    // Check if this action is compatible with all current actions
    return currentActions.every(currentAction => 
      areActionsCompatible(actionType, currentAction.type)
    );
  });
}

/**
 * Get a human-readable description of why actions are incompatible
 */
export function getIncompatibilityReason(action1, action2) {
  const category1 = getActionCategory(action1);
  const category2 = getActionCategory(action2);
  
  if (category1 === 'terminal' || category2 === 'terminal') {
    return 'Close action cannot be combined with other actions';
  }
  
  const rules1 = SPECIAL_RULES[action1];
  if (rules1?.excludes?.includes(action2)) {
    return `${action1} and ${action2} are mutually exclusive`;
  }
  
  if ((category1 === 'deferral' || category2 === 'deferral') && 
      !SPECIAL_RULES[action1]?.allowsWith?.includes(action2) &&
      !SPECIAL_RULES[action2]?.allowsWith?.includes(action1)) {
    return 'Deferral actions have limited compatibility';
  }
  
  return 'These actions are incompatible';
}

/**
 * Sort actions by execution priority
 * @param {Array} actions - Array of action objects
 * @returns {Array} Sorted array of actions
 */
export function sortActionsByPriority(actions) {
  const priority = {
    state: 1,        // First: modify state
    organizational: 2, // Second: reorganize
    deferral: 3,     // Third: defer/backup
    terminal: 4      // Last: destroy
  };
  
  return [...actions].sort((a, b) => {
    const categoryA = getActionCategory(a.type);
    const categoryB = getActionCategory(b.type);
    return (priority[categoryA] || 999) - (priority[categoryB] || 999);
  });
}

/**
 * Validate action parameters
 */
export function validateActionParams(action) {
  const errors = [];
  
  switch (action.type) {
  case 'group':
    if (!action.group_by || !['domain', 'window', 'category'].includes(action.group_by)) {
      errors.push('Group action requires valid group_by parameter');
    }
    break;
      
  case 'snooze':
    if (!action.until || !action.until.match(/^\d+[mhd]$/)) {
      errors.push('Snooze action requires valid duration');
    }
    break;
      
  case 'move_to_window':
    if (!action.window_id || !['new', 'current'].includes(action.window_id)) {
      errors.push('Move to window action requires valid window_id');
    }
    break;
  }
  
  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}