// ENGINE v2 (Command Pattern - Full) - ARCHITECTURAL REFACTOR
// Status: EXPERIMENTAL / NOT PRODUCTION READY (has dynamic imports)
// Size: 174 lines - Command Pattern implementation
// Fuller architectural version with Select → Commands → Execute flow
//
// Rules Engine V2 - Thin orchestrator using Command Pattern
// Follows: Select → Generate Commands → Execute pattern

import { selectAndPlanActions } from '../services/selection/selectAndPlan.js';
import { ActionManager } from './commands/ActionManager.js';

/**
 * Run all enabled rules using Command Pattern
 * @param {Array} rules - Array of rule definitions
 * @param {Object} context - Execution context with chrome API
 * @param {Object} options - Run options (dryRun, skipPinned, forceExecution, etc)
 * @returns {Object} Execution results and statistics
 */
export async function runRules(rules, context, options = {}) {
  const startTime = Date.now();

  // Create action manager for this run
  const actionManager = new ActionManager(context);

  // Add debug hooks if requested
  if (options.debug) {
    actionManager.on('beforeExecute', (cmd) => {
      console.log('[DEBUG] Executing:', cmd.toString());
    });
    actionManager.on('afterExecute', (cmd, result) => {
      console.log('[DEBUG] Result:', result);
    });
    actionManager.on('error', (cmd, error) => {
      console.error('[DEBUG] Error:', error);
    });
  }

  // Collect all commands from all rules
  const allCommands = [];
  const ruleResults = [];

  for (const rule of rules) {
    // Skip disabled rules unless forceExecution is set
    if (!rule.enabled && !options.forceExecution) continue;

    try {
      // 1. Select matching tabs and generate commands
      const { matches, commands } = await selectAndPlanActions(rule, context);

      if (commands.length > 0) {
        // Track commands by rule for reporting
        ruleResults.push({
          ruleId: rule.id,
          ruleName: rule.name,
          matchCount: matches.length,
          commandCount: commands.length,
          commands: commands.map(c => c.preview())
        });

        // Add to command queue
        allCommands.push(...commands);
      }
    } catch (error) {
      console.error(`Error processing rule ${rule.name}:`, error);
      ruleResults.push({
        ruleId: rule.id,
        ruleName: rule.name,
        error: error.message
      });
    }
  }

  // 2. Execute all commands through ActionManager
  const executionResult = await actionManager.execute(allCommands, {
    dryRun: options.dryRun,
    continueOnError: options.continueOnError !== false,
    force: options.force
  });

  // 3. Format results
  return {
    rules: ruleResults,
    execution: executionResult,
    totalRules: rules.length,
    activeRules: ruleResults.filter(r => !r.error).length,
    totalCommands: allCommands.length,
    executedCommands: executionResult.executed.length,
    skippedCommands: executionResult.skipped.length,
    errors: executionResult.errors,
    duration: Date.now() - startTime,
    log: options.includeLog ? actionManager.getExecutionLog() : undefined
  };
}

/**
 * Preview what rules would do without executing
 * @param {Array} rules - Rules to preview
 * @param {Object} context - Execution context
 * @returns {Object} Preview results
 */
export async function previewRules(rules, context) {
  const previews = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    try {
      const { matches, commands } = await selectAndPlanActions(rule, context);

      previews.push({
        rule: {
          id: rule.id,
          name: rule.name
        },
        matchCount: matches.length,
        matches: matches.slice(0, 10).map(t => ({ // Limit preview to 10 tabs
          id: t.id,
          url: t.url,
          title: t.title
        })),
        hasMore: matches.length > 10,
        commands: commands.map(cmd => cmd.preview())
      });
    } catch (error) {
      previews.push({
        rule: {
          id: rule.id,
          name: rule.name
        },
        error: error.message
      });
    }
  }

  return { previews };
}

/**
 * Execute a single rule (useful for testing/manual execution)
 * @param {Object} rule - Rule to execute
 * @param {Object} context - Execution context
 * @param {Object} options - Execution options
 * @returns {Object} Execution results
 */
export async function executeSingleRule(rule, context, options = {}) {
  return runRules([rule], context, { ...options, forceExecution: true });
}

/**
 * Get a preview of what a single rule would do
 * @param {Object} rule - Rule to preview
 * @param {Object} context - Execution context
 * @returns {Object} Preview information
 */
export async function previewRule(rule, context) {
  const { matches, commands } = await selectAndPlanActions(rule, context);

  return {
    rule: {
      id: rule.id,
      name: rule.name,
      when: rule.when || rule.conditions,
      then: rule.then || rule.actions
    },
    matchCount: matches.length,
    matches: matches.map(t => ({
      id: t.id,
      url: t.url,
      title: t.title
    })),
    commandCount: commands.length,
    commands: commands.map(cmd => cmd.preview()),
    wouldExecute: commands.map(cmd => cmd.toString())
  };
}

// Re-export for convenience
export { selectAndPlanActions } from '../services/selection/selectAndPlan.js';
export { ActionManager } from './commands/ActionManager.js';
export { Command } from './commands/Command.js';