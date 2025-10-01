// Predicate Compiler - Compiles JSON rule conditions into executable functions
// Based on the PRD specification for the rules engine

/**
 * Parse a duration string into milliseconds
 * @param {string} duration - Duration string like '30m', '2h', '7d'
 * @returns {number} Duration in milliseconds
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
 * Get a value from the context using a path
 * @param {string} path - Dot-separated path like 'tab.url' or special paths
 * @param {object} ctx - Context containing tab, window, idx
 * @returns {*} The value at the path
 */
function getValue(path, ctx) {
  // Handle special countPerOrigin paths
  if (path.startsWith('tab.countPerOrigin:')) {
    const metric = path.split(':')[1];
    const tab = ctx.tab;
    if (!tab) return 0;
    
    switch (metric) {
      case 'domain':
        return ctx.idx?.byDomain?.[tab.domain]?.length || 0;
      case 'origin':
        return ctx.idx?.byOrigin?.[tab.origin || 'unknown']?.length || 0;
      case 'dupeKey':
        return ctx.idx?.byDupeKey?.[tab.dupeKey]?.length || 0;
      default:
        return 0;
    }
  }
  
  // Handle regular dot-separated paths
  const parts = path.split('.');
  let value = ctx;
  
  for (const part of parts) {
    if (value == null) return undefined;
    value = value[part];
  }
  
  return value;
}

/**
 * Operator functions for conditions
 */
const operators = {
  // Equality
  eq: (a, b) => {
    // Handle duration comparisons
    if (typeof b === 'string' && b.match(/^\d+[mhd]$/)) {
      return a === parseDuration(b);
    }
    return a === b;
  },
  neq: (a, b) => {
    if (typeof b === 'string' && b.match(/^\d+[mhd]$/)) {
      return a !== parseDuration(b);
    }
    return a !== b;
  },
  
  // Comparison
  gt: (a, b) => {
    if (typeof b === 'string' && b.match(/^\d+[mhd]$/)) {
      return a > parseDuration(b);
    }
    return a > b;
  },
  gte: (a, b) => {
    if (typeof b === 'string' && b.match(/^\d+[mhd]$/)) {
      return a >= parseDuration(b);
    }
    return a >= b;
  },
  lt: (a, b) => {
    if (typeof b === 'string' && b.match(/^\d+[mhd]$/)) {
      return a < parseDuration(b);
    }
    return a < b;
  },
  lte: (a, b) => {
    if (typeof b === 'string' && b.match(/^\d+[mhd]$/)) {
      return a <= parseDuration(b);
    }
    return a <= b;
  },
  
  // Boolean
  is: (a, b) => !!a === !!b,
  
  // Array operations
  in: (a, b) => {
    if (!Array.isArray(b)) return false;
    return b.includes(a);
  },
  nin: (a, b) => {
    if (!Array.isArray(b)) return true;
    return !b.includes(a);
  },
  
  // String operations
  contains: (a, b) => {
    if (a == null || b == null) return false;
    return String(a).includes(String(b));
  },
  notContains: (a, b) => {
    if (a == null || b == null) return true;
    return !String(a).includes(String(b));
  },
  not_contains: (a, b) => {  // alias for snake_case
    if (a == null || b == null) return true;
    return !String(a).includes(String(b));
  },
  startsWith: (a, b) => {
    if (a == null || b == null) return false;
    return String(a).startsWith(String(b));
  },
  starts_with: (a, b) => {  // alias for snake_case
    if (a == null || b == null) return false;
    return String(a).startsWith(String(b));
  },
  endsWith: (a, b) => {
    if (a == null || b == null) return false;
    return String(a).endsWith(String(b));
  },
  ends_with: (a, b) => {  // alias for snake_case
    if (a == null || b == null) return false;
    return String(a).endsWith(String(b));
  },
  
  // Regular expression
  regex: (a, pattern) => {
    if (a == null) return false;
    try {
      // Extract pattern and flags from /pattern/flags format
      const match = pattern.match(/^\/(.*)\/([gimuy]*)$/);
      if (match) {
        const [, pat, flags] = match;
        return new RegExp(pat, flags).test(String(a));
      }
      // Fallback to pattern as-is
      return new RegExp(pattern).test(String(a));
    } catch (e) {
      console.error('Invalid regex pattern:', pattern, e);
      return false;
    }
  }
};

/**
 * Compile a condition node into a predicate function
 * @param {object} node - Condition node from rule JSON
 * @returns {function} Predicate function that takes context and returns boolean
 */
export function compile(node) {
  if (!node || typeof node !== 'object') {
    throw new Error('Invalid condition: must be an object');
  }
  
  // Logical operators
  if (node.all) {
    if (!Array.isArray(node.all)) {
      throw new Error('Invalid "all" condition: must be an array');
    }
    const predicates = node.all.map(compile);
    return ctx => predicates.every(pred => pred(ctx));
  }
  
  if (node.any) {
    if (!Array.isArray(node.any)) {
      throw new Error('Invalid "any" condition: must be an array');
    }
    const predicates = node.any.map(compile);
    return ctx => predicates.some(pred => pred(ctx));
  }
  
  if (node.none) {
    if (!Array.isArray(node.none)) {
      throw new Error('Invalid "none" condition: must be an array');
    }
    const predicates = node.none.map(compile);
    return ctx => !predicates.some(pred => pred(ctx));
  }
  
  if (node.not) {
    const predicate = compile(node.not);
    return ctx => !predicate(ctx);
  }
  
  // Find the operator
  const opKey = Object.keys(node).find(key => operators[key]);
  if (!opKey) {
    throw new Error(`Invalid condition: unknown operator in ${JSON.stringify(node)}`);
  }
  
  const operator = operators[opKey];
  const args = node[opKey];
  
  if (!Array.isArray(args) || args.length < 2) {
    throw new Error(`Invalid "${opKey}" condition: must be an array with at least 2 elements`);
  }
  
  const [leftPath, rightValue] = args;
  
  // Return the predicate function
  return ctx => {
    const leftValue = getValue(leftPath, ctx);
    return operator(leftValue, rightValue);
  };
}

/**
 * Evaluate a condition against a context
 * Helper function that compiles and evaluates in one step
 * @param {object} condition - Condition object
 * @param {object} context - Context with tab, window, idx
 * @returns {boolean} Whether the condition matches
 */
export function evaluateCondition(condition, context) {
  try {
    const predicate = compile(condition);
    return predicate(context);
  } catch (error) {
    console.error('Failed to evaluate condition:', error);
    return false;
  }
}

/**
 * Check if a tab matches the isDupe condition
 * @param {object} tab - Tab to check
 * @param {object} context - Context with idx containing duplicate information
 * @returns {boolean} Whether the tab is a duplicate
 */
export function checkIsDupe(tab, context) {
  if (!tab.dupeKey || !context.idx?.byDupeKey) return false;
  
  const dupeGroup = context.idx.byDupeKey[tab.dupeKey];
  if (!dupeGroup || dupeGroup.length <= 1) return false;
  
  // Tab is a dupe if it's not the first in the group
  const firstTab = dupeGroup.reduce((first, current) => 
    current.id < first.id ? current : first
  );
  
  return tab.id !== firstTab.id;
}