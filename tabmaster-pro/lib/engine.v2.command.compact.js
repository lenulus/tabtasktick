// ENGINE v2 (Command Pattern - Compact) - MINIMAL PROOF OF CONCEPT
// Status: EXPERIMENTAL / PROOF OF CONCEPT
// Size: 111 lines - Achieved <100 line goal!
// Minimal orchestrator proving the Command Pattern model
//
// Rules Engine - Compact version using Command Pattern
// Select → Generate Commands → Execute

import { selectAndPlanActions } from '../services/selection/selectAndPlan.js';
import { ActionManager } from './commands/ActionManager.js';

/**
 * Run all enabled rules using Command Pattern
 */
export async function runRules(rules, context, options = {}) {
  const startTime = Date.now();
  const actionManager = new ActionManager(context);

  // Add debug hooks if requested
  if (options.debug) {
    actionManager.on('beforeExecute', cmd => console.log('[DEBUG] Executing:', cmd.toString()));
    actionManager.on('afterExecute', (cmd, result) => console.log('[DEBUG] Result:', result));
  }

  const allCommands = [];
  const ruleResults = [];

  // Process each rule: select → plan
  for (const rule of rules) {
    if (!rule.enabled && !options.forceExecution) continue;

    try {
      const { matches, commands } = await selectAndPlanActions(rule, context);

      if (commands.length > 0) {
        ruleResults.push({
          ruleId: rule.id,
          ruleName: rule.name,
          matchCount: matches.length,
          commandCount: commands.length
        });
        allCommands.push(...commands);
      }
    } catch (error) {
      ruleResults.push({
        ruleId: rule.id,
        ruleName: rule.name,
        error: error.message
      });
    }
  }

  // Execute all commands
  const executionResult = await actionManager.execute(allCommands, {
    dryRun: options.dryRun,
    continueOnError: options.continueOnError !== false
  });

  return {
    rules: ruleResults,
    execution: executionResult,
    totalCommands: allCommands.length,
    duration: Date.now() - startTime
  };
}

/**
 * Preview what rules would do without executing
 */
export async function previewRules(rules, context) {
  const previews = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    try {
      const { matches, commands } = await selectAndPlanActions(rule, context);
      previews.push({
        rule: { id: rule.id, name: rule.name },
        matchCount: matches.length,
        commands: commands.map(cmd => cmd.preview())
      });
    } catch (error) {
      previews.push({
        rule: { id: rule.id, name: rule.name },
        error: error.message
      });
    }
  }

  return { previews };
}

/**
 * Execute a single rule
 */
export async function executeSingleRule(rule, context, options = {}) {
  return runRules([rule], context, { ...options, forceExecution: true });
}

/**
 * Preview a single rule
 */
export async function previewRule(rule, context) {
  const { matches, commands } = await selectAndPlanActions(rule, context);

  return {
    rule: { id: rule.id, name: rule.name },
    matchCount: matches.length,
    commands: commands.map(cmd => cmd.preview())
  };
}

// Re-exports
export { selectAndPlanActions } from '../services/selection/selectAndPlan.js';
export { ActionManager } from './commands/ActionManager.js';
export { Command } from './commands/Command.js';