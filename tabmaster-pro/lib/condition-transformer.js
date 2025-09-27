// Condition Transformer for Rules Engine 2.0
// Transforms UI condition format to predicate compiler format

/**
 * Transform a UI condition to predicate format
 * @param {object} condition - UI condition with subject, operator, value
 * @returns {object} Predicate-compatible condition
 */
export function transformCondition(condition) {
  // Check if this is already in predicate format (has operators like 'is', 'eq', 'gt', etc.)
  const predicateOperators = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'not_contains', 
                              'starts_with', 'ends_with', 'regex', 'not_regex', 'in', 'not_in', 'is'];
  
  const conditionKeys = Object.keys(condition);
  if (conditionKeys.length === 1 && predicateOperators.includes(conditionKeys[0])) {
    // Already in predicate format, return as-is
    return condition;
  }
  
  // Handle junction conditions (all, any, none)
  if (condition.all) {
    return { all: condition.all.map(transformCondition) };
  }
  if (condition.any) {
    return { any: condition.any.map(transformCondition) };
  }
  if (condition.none) {
    return { none: condition.none.map(transformCondition) };
  }
  
  // Handle NOT conditions
  if (condition.not) {
    return { not: transformCondition(condition) };
  }
  
  // Transform simple conditions
  const { subject, operator, value } = condition;
  
  // Validate required fields
  if (!subject || !operator) {
    console.warn('Invalid condition: missing subject or operator', condition);
    return { all: [] }; // Return empty condition that will match nothing
  }
  
  // Map UI operators to predicate operators
  const operatorMap = {
    'equals': 'eq',
    'not_equals': 'neq',
    'greater_than': 'gt',
    'greater_than_or_equal': 'gte',
    'less_than': 'lt',
    'less_than_or_equal': 'lte',
    'contains': 'contains',
    'not_contains': 'not_contains',
    'starts_with': 'starts_with',
    'ends_with': 'ends_with',
    'matches': 'regex',
    'not_matches': 'not_regex',
    'in': 'in',
    'not_in': 'not_in'
  };
  
  const predOp = operatorMap[operator] || operator;
  
  // Validate predicate operator
  if (!predOp) {
    console.warn('Invalid operator:', operator);
    return { all: [] };
  }
  
  // Build the path to the value based on subject
  let path = `tab.${subject}`;
  
  // Special cases
  switch (subject) {
    case 'duplicate':
      path = 'tab.isDupe';
      break;
    case 'age':
    case 'last_access':
      // Convert duration strings to milliseconds for comparison
      if (typeof value === 'string' && value.match(/^\d+[mhd]$/)) {
        const units = { m: 60000, h: 3600000, d: 86400000 };
        const match = value.match(/^(\d+)([mhd])$/);
        if (match) {
          const [, num, unit] = match;
          return { [predOp]: [path, parseInt(num) * units[unit]] };
        }
      }
      break;
  }
  
  // Build predicate condition
  return { [predOp]: [path, value] };
}

/**
 * Transform entire condition tree
 * @param {object} conditions - Root conditions object
 * @returns {object} Transformed conditions
 */
export function transformConditions(conditions) {
  if (!conditions || typeof conditions !== 'object') {
    return { all: [] };
  }
  
  // Check if conditions is empty
  const junctionKey = Object.keys(conditions)[0];
  if (junctionKey && Array.isArray(conditions[junctionKey]) && conditions[junctionKey].length === 0) {
    console.warn('Empty conditions array, returning empty all condition');
    return { all: [] };
  }
  
  return transformCondition(conditions);
}