// Command Pattern implementation for Rules Engine
// Each command represents a single atomic action to be performed

/**
 * Base Command class representing an action to be executed
 */
export class Command {
  /**
   * Create a new command
   * @param {string} action - The action type (close, group, snooze, etc.)
   * @param {number|number[]} targetIds - Tab ID(s) to act upon
   * @param {Object} params - Action-specific parameters
   */
  constructor(action, targetIds, params = {}) {
    this.action = action;
    this.targetIds = Array.isArray(targetIds) ? targetIds : [targetIds];
    this.params = params;
    this.timestamp = Date.now();
    this.id = `${action}-${this.timestamp}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate the command is well-formed
   * @returns {Object} { valid: boolean, errors?: string[] }
   */
  validate() {
    const errors = [];

    if (!this.action) {
      errors.push('Command must have an action type');
    }

    if (!this.targetIds || this.targetIds.length === 0) {
      errors.push('Command must have at least one target');
    }

    // Action-specific validation
    switch (this.action) {
      case 'snooze':
        if (!this.params.duration && !this.params.until) {
          errors.push('Snooze command requires duration or until parameter');
        }
        break;

      case 'group':
        // Group commands can have multiple targets
        if (this.targetIds.length < 2 && !this.params.singleTab) {
          errors.push('Group command requires at least 2 tabs');
        }
        break;

      case 'bookmark':
        if (!this.params.folder && !this.params.parentId) {
          // Default to Other Bookmarks is OK
        }
        break;

      case 'move':
        if (!this.params.windowId && !this.params.index) {
          errors.push('Move command requires windowId or index parameter');
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Get a preview of what this command will do
   * @returns {Object} Preview information
   */
  preview() {
    const targetCount = this.targetIds.length;
    const targetStr = targetCount === 1 ? '1 tab' : `${targetCount} tabs`;

    switch (this.action) {
      case 'close':
        return {
          action: 'close',
          description: `Close ${targetStr}`,
          targets: this.targetIds,
          reversible: false
        };

      case 'group':
        const groupName = this.params.name || 'New Group';
        return {
          action: 'group',
          description: `Group ${targetStr} as "${groupName}"`,
          targets: this.targetIds,
          params: this.params,
          reversible: true
        };

      case 'snooze':
        const duration = this.params.duration || '1h';
        return {
          action: 'snooze',
          description: `Snooze ${targetStr} for ${duration}`,
          targets: this.targetIds,
          params: this.params,
          reversible: true
        };

      case 'bookmark':
        const folder = this.params.folder || 'Other Bookmarks';
        return {
          action: 'bookmark',
          description: `Bookmark ${targetStr} to "${folder}"`,
          targets: this.targetIds,
          params: this.params,
          reversible: true
        };

      case 'move':
        const windowId = this.params.windowId;
        const windowDesc = windowId === 'new' ? 'new window' : `window ${windowId}`;
        return {
          action: 'move',
          description: `Move ${targetStr} to ${windowDesc}`,
          targets: this.targetIds,
          params: this.params,
          reversible: true
        };

      case 'pin':
        return {
          action: 'pin',
          description: `Pin ${targetStr}`,
          targets: this.targetIds,
          reversible: true
        };

      case 'unpin':
        return {
          action: 'unpin',
          description: `Unpin ${targetStr}`,
          targets: this.targetIds,
          reversible: true
        };

      case 'mute':
        return {
          action: 'mute',
          description: `Mute ${targetStr}`,
          targets: this.targetIds,
          reversible: true
        };

      case 'unmute':
        return {
          action: 'unmute',
          description: `Unmute ${targetStr}`,
          targets: this.targetIds,
          reversible: true
        };

      case 'suspend':
      case 'discard':
        return {
          action: 'suspend',
          description: `Suspend ${targetStr}`,
          targets: this.targetIds,
          reversible: true
        };

      default:
        return {
          action: this.action,
          description: `${this.action} ${targetStr}`,
          targets: this.targetIds,
          params: this.params
        };
    }
  }

  /**
   * Get human-readable description
   * @returns {string}
   */
  toString() {
    const preview = this.preview();
    return preview.description;
  }

  /**
   * Clone the command with modifications
   * @param {Object} modifications - Properties to change
   * @returns {Command}
   */
  clone(modifications = {}) {
    return new Command(
      modifications.action || this.action,
      modifications.targetIds || this.targetIds,
      { ...this.params, ...(modifications.params || {}) }
    );
  }

  /**
   * Check if this command conflicts with another
   * @param {Command} other - Another command
   * @returns {boolean}
   */
  conflictsWith(other) {
    // Commands on different targets don't conflict
    const sharedTargets = this.targetIds.filter(id => other.targetIds.includes(id));
    if (sharedTargets.length === 0) {
      return false;
    }

    // Check for mutually exclusive actions
    const conflicts = {
      'pin': ['unpin'],
      'unpin': ['pin'],
      'mute': ['unmute'],
      'unmute': ['mute'],
      'close': ['group', 'snooze', 'bookmark', 'pin', 'unpin', 'mute', 'unmute', 'suspend']
    };

    const thisConflicts = conflicts[this.action] || [];
    return thisConflicts.includes(other.action);
  }

  /**
   * Get execution priority (lower number = higher priority)
   * @returns {number}
   */
  getPriority() {
    // Priority order for execution
    const priorities = {
      'bookmark': 1,  // Bookmark before other actions
      'pin': 2,
      'unpin': 2,
      'mute': 3,
      'unmute': 3,
      'group': 4,
      'move': 5,
      'suspend': 6,
      'snooze': 7,    // Snooze removes tab
      'close': 8      // Close is always last
    };

    return priorities[this.action] || 99;
  }
}

/**
 * Create a command from a rule action definition
 * @param {Object} actionDef - Action definition from rule
 * @param {number[]} targetIds - Tab IDs to apply action to
 * @returns {Command}
 */
export function createCommandFromAction(actionDef, targetIds) {
  const action = actionDef.action || actionDef.type;
  const params = { ...actionDef };
  delete params.action;
  delete params.type;

  return new Command(action, targetIds, params);
}

/**
 * Sort commands by execution priority and resolve conflicts
 * @param {Command[]} commands - Array of commands
 * @returns {Command[]} Sorted and de-conflicted commands
 */
export function sortAndResolveCommands(commands) {
  // Sort by priority
  const sorted = [...commands].sort((a, b) => a.getPriority() - b.getPriority());

  // Remove conflicts (keep higher priority)
  const resolved = [];
  const processedTargets = new Map(); // targetId -> Set of actions

  for (const command of sorted) {
    let hasConflict = false;

    for (const targetId of command.targetIds) {
      const targetActions = processedTargets.get(targetId) || new Set();

      // Check if this action conflicts with already processed actions
      for (const processedAction of targetActions) {
        const tempCmd = new Command(processedAction, targetId);
        if (command.conflictsWith(tempCmd)) {
          hasConflict = true;
          break;
        }
      }

      if (!hasConflict) {
        // Track this action for this target
        targetActions.add(command.action);
        processedTargets.set(targetId, targetActions);
      }
    }

    if (!hasConflict) {
      resolved.push(command);
    }
  }

  return resolved;
}