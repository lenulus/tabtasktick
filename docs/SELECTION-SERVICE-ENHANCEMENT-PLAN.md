# SelectionService Enhancement Plan

## Core Principle
Stop re-encoding information. The rule object already contains everything needed for selection. Pass it directly.

## Current Problem
- Engine has complex selection logic
- Engine builds indices and contexts
- Engine evaluates conditions
- Too much logic in the wrong place

## Solution: Direct Rule Evaluation

### Add to SelectionService

```javascript
// services/selection/selectTabs.js

/**
 * Select tabs that match a rule's conditions
 * @param {Object} rule - The rule object with conditions
 * @param {Array} tabs - Optional tab array (queries all if not provided)
 * @returns {Promise<Array>} Tabs that match the rule
 */
export async function selectTabsMatchingRule(rule, tabs = null) {
  if (!tabs) {
    tabs = await chrome.tabs.query({});
  }

  // Build context for evaluation (duplicates, counts, etc.)
  const context = buildContext(tabs);

  // Filter tabs that match the rule
  return tabs.filter(tab => matchesRule(tab, rule, context));
}

/**
 * Test if a single tab matches a rule
 * @param {Object} tab - Tab to test
 * @param {Object} rule - Rule with conditions
 * @param {Object} context - Context with indices and counts
 * @returns {boolean}
 */
function matchesRule(tab, rule, context) {
  // Evaluate based on rule format
  if (rule.conditions) {
    return evaluateLegacyConditions(tab, rule.conditions, context);
  }

  if (rule.when) {
    return evaluateWhenCondition(tab, rule.when, context);
  }

  return false;
}

/**
 * Build context for advanced filtering
 * @private
 */
function buildContext(tabs) {
  const context = {
    duplicates: new Set(),
    domainCounts: new Map(),
    windowCounts: new Map(),
    totalCount: tabs.length
  };

  // Find duplicates
  const urlMap = new Map();
  for (const tab of tabs) {
    const normalized = normalizeUrl(tab.url);
    if (!urlMap.has(normalized)) {
      urlMap.set(normalized, []);
    }
    urlMap.get(normalized).push(tab.id);
  }

  // Mark duplicates
  for (const [url, tabIds] of urlMap) {
    if (tabIds.length > 1) {
      tabIds.forEach(id => context.duplicates.add(id));
    }
  }

  // Count by domain
  for (const tab of tabs) {
    const domain = extractDomain(tab.url);
    context.domainCounts.set(domain, (context.domainCounts.get(domain) || 0) + 1);
  }

  // Count by window
  for (const tab of tabs) {
    context.windowCounts.set(tab.windowId, (context.windowCounts.get(tab.windowId) || 0) + 1);
  }

  return context;
}
```

### Engine Becomes Simple

```javascript
// lib/engine.js - Thin orchestrator

export async function runRules(rules, options = {}) {
  const results = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    // 1. Select matching tabs (pass rule directly)
    const matches = await selectTabsMatchingRule(rule);

    // 2. Execute actions if matches
    if (matches.length > 0) {
      const actionResult = await executeActions(rule.actions, matches, options);

      // 3. Log results
      results.push({
        rule: rule.name,
        matched: matches.length,
        actions: actionResult
      });
    }
  }

  return results;
}
```

## Benefits

1. **No Re-encoding** - Rule conditions used directly
2. **Simple Engine** - Just orchestrates: select → execute → log
3. **Clear Separation** - Selection logic in SelectionService
4. **Reusable** - Same selection available everywhere
5. **Testable** - Each part tested independently

## Implementation Steps

1. Add `selectTabsMatchingRule()` to SelectionService
2. Move condition evaluation logic from engine to SelectionService
3. Move context building (indices, duplicates) to SelectionService
4. Simplify engine to just orchestrate
5. Test with existing rules

## What Moves from Engine to SelectionService

- `evaluateRule()` logic → `selectTabsMatchingRule()`
- `buildIndices()` → `buildContext()`
- Condition evaluation → `matchesRule()`
- Duplicate detection → Context building
- Domain counting → Context building

## Success Metrics

- Engine.js reduced from 500+ lines to ~100 lines
- All selection logic in SelectionService
- No data conversion/re-encoding
- Rules passed directly to selection
- All tests pass