// ActionManager - Command Dispatcher for Rules Engine
// Routes commands to appropriate service handlers and manages execution

import { sortAndResolveCommands } from './Command.js';
import { groupTabs } from '../../services/execution/groupTabs.js';
import * as SnoozeService from '../../services/execution/SnoozeService.js';
import * as SuspensionService from '../../services/execution/SuspensionService.js';

/**
 * ActionManager handles command execution and dispatching
 */
export class ActionManager {
  /**
   * Create a new ActionManager
   * @param {Object} context - Execution context with chrome API and services
   */
  constructor(context) {
    this.context = context;
    this.handlers = new Map();
    this.eventListeners = new Map();
    this.executionLog = [];

    // Register default handlers on creation
    this.registerDefaultHandlers();
  }

  /**
   * Register a handler for an action type
   * @param {string} action - Action type (close, group, etc.)
   * @param {Function} handler - Async function to handle the command
   */
  registerHandler(action, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Handler for ${action} must be a function`);
    }
    this.handlers.set(action, handler);
  }

  /**
   * Execute a list of commands
   * @param {Command[]} commands - Array of commands to execute
   * @param {Object} options - Execution options
   * @returns {Object} Execution results
   */
  async execute(commands, options = {}) {
    const startTime = Date.now();
    const results = {
      executed: [],
      skipped: [],
      errors: [],
      totalCommands: commands.length,
      duration: 0
    };

    // Validate all commands first
    const validationErrors = this.validateCommands(commands);
    if (validationErrors.length > 0 && !options.force) {
      results.errors = validationErrors;
      results.duration = Date.now() - startTime;
      return results;
    }

    // Sort and resolve conflicts
    const resolved = sortAndResolveCommands(commands);
    const skipped = commands.filter(cmd => !resolved.includes(cmd));
    results.skipped = skipped.map(cmd => ({
      command: cmd.preview(),
      reason: 'Conflict with higher priority command'
    }));

    // Execute commands
    for (const command of resolved) {
      try {
        // Emit beforeExecute event
        await this.emit('beforeExecute', command);

        if (options.dryRun) {
          // In dry-run mode, just preview
          const preview = command.preview();
          results.executed.push({
            command: preview,
            dryRun: true,
            success: true
          });

          // Emit afterExecute event
          await this.emit('afterExecute', command, preview);
          continue;
        }

        // Get handler for this action
        const handler = this.handlers.get(command.action);
        if (!handler) {
          throw new Error(`No handler registered for action: ${command.action}`);
        }

        // Execute the command
        const handlerResult = await handler(command, this.context);

        // Record result
        const result = {
          command: command.preview(),
          result: handlerResult,
          success: true,
          timestamp: Date.now()
        };

        results.executed.push(result);
        this.logExecution(command, result);

        // Emit afterExecute event
        await this.emit('afterExecute', command, result);

      } catch (error) {
        console.error(`Error executing command ${command.action}:`, error);

        const errorResult = {
          command: command.preview(),
          error: error.message,
          success: false,
          timestamp: Date.now()
        };

        results.errors.push(errorResult);
        this.logExecution(command, errorResult);

        // Emit error event
        await this.emit('error', command, error);

        // Stop on error unless force mode
        if (!options.continueOnError) {
          break;
        }
      }
    }

    results.duration = Date.now() - startTime;
    return results;
  }

  /**
   * Validate a list of commands
   * @private
   */
  validateCommands(commands) {
    const errors = [];

    for (const command of commands) {
      const validation = command.validate();
      if (!validation.valid) {
        errors.push({
          command: command.preview(),
          errors: validation.errors
        });
      }
    }

    return errors;
  }

  /**
   * Register default handlers for built-in actions
   * @private
   */
  registerDefaultHandlers() {
    // Close handler
    this.registerHandler('close', async (command, context) => {
      if (!context.chrome?.tabs) {
        throw new Error('Chrome tabs API not available');
      }

      await context.chrome.tabs.remove(command.targetIds);
      return { closed: command.targetIds };
    });

    // Pin handler
    this.registerHandler('pin', async (command, context) => {
      if (!context.chrome?.tabs) {
        throw new Error('Chrome tabs API not available');
      }

      const updates = [];
      for (const tabId of command.targetIds) {
        updates.push(context.chrome.tabs.update(tabId, { pinned: true }));
      }
      await Promise.all(updates);
      return { pinned: command.targetIds };
    });

    // Unpin handler
    this.registerHandler('unpin', async (command, context) => {
      if (!context.chrome?.tabs) {
        throw new Error('Chrome tabs API not available');
      }

      const updates = [];
      for (const tabId of command.targetIds) {
        updates.push(context.chrome.tabs.update(tabId, { pinned: false }));
      }
      await Promise.all(updates);
      return { unpinned: command.targetIds };
    });

    // Mute handler
    this.registerHandler('mute', async (command, context) => {
      if (!context.chrome?.tabs) {
        throw new Error('Chrome tabs API not available');
      }

      const updates = [];
      for (const tabId of command.targetIds) {
        updates.push(context.chrome.tabs.update(tabId, { muted: true }));
      }
      await Promise.all(updates);
      return { muted: command.targetIds };
    });

    // Unmute handler
    this.registerHandler('unmute', async (command, context) => {
      if (!context.chrome?.tabs) {
        throw new Error('Chrome tabs API not available');
      }

      const updates = [];
      for (const tabId of command.targetIds) {
        updates.push(context.chrome.tabs.update(tabId, { muted: false }));
      }
      await Promise.all(updates);
      return { unmuted: command.targetIds };
    });

    // Suspend/Discard handler - delegates to SuspensionService
    this.registerHandler('suspend', async (command, context) => {
      if (!SuspensionService) {
        throw new Error('SuspensionService is not available.');
      }
      const options = command.params || {};
      return await SuspensionService.suspendTabs(command.targetIds, options);
    });

    // Group handler - delegates to GroupTabs service
    this.registerHandler('group', async (command, context) => {
      const options = {
        ...command.params,
        dryRun: false
      };

      return await groupTabs(command.targetIds, options);
    });

    // Snooze handler
    this.registerHandler('snooze', async (command, context) => {
      if (!SnoozeService) {
        throw new Error('SnoozeService is not available.');
      }

      const duration = parseDuration(command.params.duration || '1h');
      const snoozeUntil = command.params.until || (Date.now() + duration);
      const reason = command.params.reason || 'command_rule';

      // The SnoozeService will handle finding tab details and removing the original tabs.
      await SnoozeService.snoozeTabs(command.targetIds, snoozeUntil, reason);

      return {
        snoozed: command.targetIds,
        until: new Date(snoozeUntil).toISOString()
      };
    });

    // Bookmark handler
    this.registerHandler('bookmark', async (command, context) => {
      if (!context.chrome?.bookmarks || !context.chrome?.tabs) {
        throw new Error('Chrome bookmarks/tabs API not available');
      }

      const parentId = command.params.parentId || '2'; // Default to Other Bookmarks
      const folder = command.params.folder;

      // Create folder if specified
      let folderId = parentId;
      if (folder) {
        const created = await context.chrome.bookmarks.create({
          parentId,
          title: folder
        });
        folderId = created.id;
      }

      // Get tab details and bookmark them
      const tabs = await context.chrome.tabs.query({});
      const targetTabs = tabs.filter(t => command.targetIds.includes(t.id));

      const bookmarks = [];
      for (const tab of targetTabs) {
        const bookmark = await context.chrome.bookmarks.create({
          parentId: folderId,
          title: tab.title,
          url: tab.url
        });
        bookmarks.push(bookmark.id);
      }

      return {
        bookmarked: command.targetIds,
        bookmarkIds: bookmarks,
        folder: folder || 'Other Bookmarks'
      };
    });

    // Move handler - move tabs to different window
    this.registerHandler('move', async (command, context) => {
      if (!context.chrome?.tabs || !context.chrome?.windows) {
        throw new Error('Chrome tabs/windows API not available');
      }

      const windowId = command.params.windowId;
      const preserveGroup = command.params.preserveGroup !== false; // Default to true

      if (!windowId) {
        throw new Error('windowId parameter is required for move action');
      }

      // Get tab details to preserve group info
      const tabs = await context.chrome.tabs.query({});
      const targetTabs = tabs.filter(t => command.targetIds.includes(t.id));

      // Group tabs by their original group
      const groupMap = new Map(); // groupId -> { title, color, tabIds }
      for (const tab of targetTabs) {
        if (tab.groupId && tab.groupId !== -1 && preserveGroup) {
          if (!groupMap.has(tab.groupId)) {
            try {
              const group = await context.chrome.tabGroups.get(tab.groupId);
              groupMap.set(tab.groupId, {
                title: group.title,
                color: group.color,
                tabIds: []
              });
            } catch (e) {
              // Group doesn't exist anymore
            }
          }
          if (groupMap.has(tab.groupId)) {
            groupMap.get(tab.groupId).tabIds.push(tab.id);
          }
        }
      }

      let targetWindowId = windowId;

      // Handle "new" window creation
      if (windowId === 'new') {
        // Store original focused window
        const currentWindow = await context.chrome.windows.getCurrent();
        const originalFocusedWindowId = currentWindow.id;

        const tabIds = [...command.targetIds];
        const firstTabId = tabIds.shift();

        // Create new window with first tab
        const newWindow = await context.chrome.windows.create({
          tabId: firstTabId,
          focused: false
        });
        targetWindowId = newWindow.id;

        // Move remaining tabs if any
        if (tabIds.length > 0) {
          await context.chrome.tabs.move(tabIds, {
            windowId: newWindow.id,
            index: -1
          });
        }

        // Re-create groups
        if (groupMap.size > 0) {
          // Focus the new window to create groups correctly
          await context.chrome.windows.update(newWindow.id, { focused: true });

          for (const [oldGroupId, groupInfo] of groupMap.entries()) {
            const newGroupId = await context.chrome.tabs.group({
              tabIds: groupInfo.tabIds
            });
            await context.chrome.tabGroups.update(newGroupId, {
              title: groupInfo.title,
              color: groupInfo.color
            });
          }

          // Restore original focus
          await context.chrome.windows.update(originalFocusedWindowId, { focused: true });
        }

        return {
          moved: command.targetIds,
          windowId: newWindow.id,
          newWindow: true,
          regrouped: groupMap.size
        };
      }

      // Move to existing window
      await context.chrome.tabs.move(command.targetIds, {
        windowId: parseInt(windowId),
        index: -1
      });

      // Re-create groups (must focus window first due to Chrome limitation)
      if (groupMap.size > 0) {
        // Store original focused window
        const currentWindow = await context.chrome.windows.getCurrent();
        const originalFocusedWindowId = currentWindow.id;

        // CRITICAL: Focus the target window first, otherwise Chrome creates group in focused window
        await context.chrome.windows.update(parseInt(windowId), { focused: true });

        for (const [oldGroupId, groupInfo] of groupMap.entries()) {
          const newGroupId = await context.chrome.tabs.group({
            tabIds: groupInfo.tabIds
          });
          await context.chrome.tabGroups.update(newGroupId, {
            title: groupInfo.title,
            color: groupInfo.color
          });
        }

        // Restore original focus
        await context.chrome.windows.update(originalFocusedWindowId, { focused: true });
      }

      return {
        moved: command.targetIds,
        windowId: parseInt(windowId),
        newWindow: false,
        regrouped: groupMap.size
      };
    });
  }

  /**
   * Log command execution for debugging
   * @private
   */
  logExecution(command, result) {
    const entry = {
      timestamp: Date.now(),
      command: command.preview(),
      result,
      success: result.success
    };

    this.executionLog.push(entry);

    // Keep only last 100 entries
    if (this.executionLog.length > 100) {
      this.executionLog.shift();
    }
  }

  /**
   * Get execution history
   * @returns {Array} Recent execution log entries
   */
  getExecutionLog() {
    return [...this.executionLog];
  }

  /**
   * Clear execution log
   */
  clearLog() {
    this.executionLog = [];
  }

  /**
   * Add event listener
   * @param {string} event - Event name (beforeExecute, afterExecute, error)
   * @param {Function} listener - Event handler
   */
  on(event, listener) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(listener);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event handler to remove
   */
  off(event, listener) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event
   * @private
   */
  async emit(event, ...args) {
    const listeners = this.eventListeners.get(event) || [];
    for (const listener of listeners) {
      try {
        await listener(...args);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    }
  }
}

/**
 * Parse duration string into milliseconds
 * @private
 */
function parseDuration(duration) {
  if (typeof duration === 'number') return duration;
  if (typeof duration !== 'string') return 0;

  const units = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  const match = duration.match(/^(\d+)([mhd])$/);
  if (!match) return 0;

  const [, num, unit] = match;
  return parseInt(num) * units[unit];
}

/**
 * Create a singleton ActionManager instance
 */
let defaultManager = null;

export function getDefaultActionManager(context) {
  if (!defaultManager) {
    defaultManager = new ActionManager(context);
  }
  return defaultManager;
}