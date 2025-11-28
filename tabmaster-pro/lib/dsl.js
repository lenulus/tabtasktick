/**
 * DSL Parser and Serializer for Rules Engine 2.0
 * 
 * Converts between human-readable DSL format and JSON rule format.
 * 
 * DSL Format Example:
 * rule "Rule Name" {
 *   when condition
 *   then action
 *   trigger type
 *   flags flag1 flag2
 * }
 */

/**
 * Token types for lexical analysis
 */
const TokenType = {
  RULE: 'RULE',
  WHEN: 'WHEN',
  THEN: 'THEN',
  TRIGGER: 'TRIGGER',
  FLAGS: 'FLAGS',
  STRING: 'STRING',
  NUMBER: 'NUMBER',
  DURATION: 'DURATION',
  IDENTIFIER: 'IDENTIFIER',
  OPERATOR: 'OPERATOR',
  LBRACE: 'LBRACE',
  RBRACE: 'RBRACE',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  LBRACKET: 'LBRACKET',
  RBRACKET: 'RBRACKET',
  COMMA: 'COMMA',
  AND: 'AND',
  OR: 'OR',
  NOT: 'NOT',
  EOF: 'EOF'
};

/**
 * Tokenize DSL input
 */
function tokenize(input) {
  const tokens = [];
  let i = 0;

  const keywords = {
    'rule': TokenType.RULE,
    'when': TokenType.WHEN,
    'then': TokenType.THEN,
    'trigger': TokenType.TRIGGER,
    'flags': TokenType.FLAGS,
    'and': TokenType.AND,
    'or': TokenType.OR,
    'not': TokenType.NOT,
    'all': TokenType.AND,
    'any': TokenType.OR,
    'none': TokenType.NOT
  };

  const operators = ['==', '!=', '>=', '<=', '>', '<', 'in', 'is', 'contains', 'startsWith', 'endsWith', 'regex'];

  while (i < input.length) {
    // Skip whitespace
    if (/\s/.test(input[i])) {
      i++;
      continue;
    }

    // Comments (// to end of line)
    if (input[i] === '/' && input[i + 1] === '/') {
      while (i < input.length && input[i] !== '\n') i++;
      continue;
    }

    // String literals
    if (input[i] === '"') {
      i++;
      let str = '';
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < input.length) {
          i++;
          str += input[i];
        } else {
          str += input[i];
        }
        i++;
      }
      i++; // Skip closing quote
      tokens.push({ type: TokenType.STRING, value: str });
      continue;
    }

    // Brackets and braces
    if (input[i] === '{') {
      tokens.push({ type: TokenType.LBRACE });
      i++;
      continue;
    }
    if (input[i] === '}') {
      tokens.push({ type: TokenType.RBRACE });
      i++;
      continue;
    }
    if (input[i] === '(') {
      tokens.push({ type: TokenType.LPAREN });
      i++;
      continue;
    }
    if (input[i] === ')') {
      tokens.push({ type: TokenType.RPAREN });
      i++;
      continue;
    }
    if (input[i] === '[') {
      tokens.push({ type: TokenType.LBRACKET });
      i++;
      continue;
    }
    if (input[i] === ']') {
      tokens.push({ type: TokenType.RBRACKET });
      i++;
      continue;
    }
    if (input[i] === ',') {
      tokens.push({ type: TokenType.COMMA });
      i++;
      continue;
    }

    // Numbers and durations
    if (/\d/.test(input[i])) {
      let num = '';
      while (i < input.length && /\d/.test(input[i])) {
        num += input[i];
        i++;
      }
      
      // Check for duration suffix (m, h, d)
      if (i < input.length && /[mhd]/.test(input[i])) {
        num += input[i];
        i++;
        tokens.push({ type: TokenType.DURATION, value: num });
      } else {
        tokens.push({ type: TokenType.NUMBER, value: parseInt(num) });
      }
      continue;
    }

    // Regex patterns /pattern/flags
    if (input[i] === '/') {
      let pattern = '/';
      i++;
      while (i < input.length && input[i] !== '/') {
        if (input[i] === '\\' && i + 1 < input.length) {
          pattern += input[i] + input[i + 1];
          i += 2;
        } else {
          pattern += input[i];
          i++;
        }
      }
      if (i < input.length) {
        pattern += '/';
        i++;
        // Collect regex flags
        while (i < input.length && /[gimuy]/.test(input[i])) {
          pattern += input[i];
          i++;
        }
      }
      tokens.push({ type: TokenType.STRING, value: pattern });
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(input[i])) {
      let ident = '';
      while (i < input.length && /[a-zA-Z0-9_.]/.test(input[i])) {
        ident += input[i];
        i++;
      }
      
      // Special case for tab.countPerOrigin:domain format
      if (i < input.length && input[i] === ':' && ident.startsWith('tab.countPerOrigin')) {
        ident += input[i];
        i++;
        while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
          ident += input[i];
          i++;
        }
      }

      // Check for operators that are words
      if (operators.includes(ident)) {
        tokens.push({ type: TokenType.OPERATOR, value: ident });
      } else if (keywords[ident.toLowerCase()]) {
        tokens.push({ type: keywords[ident.toLowerCase()] });
      } else {
        tokens.push({ type: TokenType.IDENTIFIER, value: ident });
      }
      continue;
    }

    // Multi-character operators
    const twoChar = input.substr(i, 2);
    if (operators.includes(twoChar)) {
      tokens.push({ type: TokenType.OPERATOR, value: twoChar });
      i += 2;
      continue;
    }

    // Single character operators
    if (operators.includes(input[i])) {
      tokens.push({ type: TokenType.OPERATOR, value: input[i] });
      i++;
      continue;
    }

    // Unknown character
    throw new Error(`Unexpected character '${input[i]}' at position ${i}`);
  }

  tokens.push({ type: TokenType.EOF });
  return tokens;
}

/**
 * Parse DSL into JSON rules
 */
function parseDSL(input) {
  const tokens = tokenize(input);
  let current = 0;

  function peek() {
    return tokens[current];
  }

  function consume(expectedType) {
    const token = tokens[current];
    if (token.type !== expectedType) {
      throw new Error(`Expected ${expectedType} but got ${token.type}`);
    }
    current++;
    return token;
  }

  function parseCondition() {
    const token = peek();

    // Handle grouping: all(...), any(...), none(...), not(...)
    if (token.type === TokenType.AND || (token.type === TokenType.IDENTIFIER && token.value === 'all')) {
      current++;
      consume(TokenType.LPAREN);
      const conditions = [];
      while (peek().type !== TokenType.RPAREN) {
        conditions.push(parseCondition());
        if (peek().type === TokenType.COMMA) {
          current++;
        }
      }
      consume(TokenType.RPAREN);
      return { all: conditions };
    }

    if (token.type === TokenType.OR || (token.type === TokenType.IDENTIFIER && token.value === 'any')) {
      current++;
      consume(TokenType.LPAREN);
      const conditions = [];
      while (peek().type !== TokenType.RPAREN) {
        conditions.push(parseCondition());
        if (peek().type === TokenType.COMMA) {
          current++;
        }
      }
      consume(TokenType.RPAREN);
      return { any: conditions };
    }

    if (token.type === TokenType.NOT || (token.type === TokenType.IDENTIFIER && token.value === 'none')) {
      current++;
      consume(TokenType.LPAREN);
      const conditions = [];
      while (peek().type !== TokenType.RPAREN) {
        conditions.push(parseCondition());
        if (peek().type === TokenType.COMMA) {
          current++;
        }
      }
      consume(TokenType.RPAREN);
      return { none: conditions };
    }

    // Simple condition: subject operator value
    const subject = consume(TokenType.IDENTIFIER).value;
    
    // Special case for boolean properties like tab.isDupe
    if (peek().type === TokenType.THEN || peek().type === TokenType.AND || peek().type === TokenType.OR || peek().type === TokenType.RPAREN) {
      // No operator, assume it's a boolean check
      return { is: [subject, true] };
    }
    
    const operator = consume(TokenType.OPERATOR).value;
    
    let value;
    const nextToken = peek();
    
    if (nextToken.type === TokenType.LBRACKET) {
      // Array value
      current++;
      value = [];
      while (peek().type !== TokenType.RBRACKET) {
        if (peek().type === TokenType.STRING) {
          value.push(consume(TokenType.STRING).value);
        } else if (peek().type === TokenType.NUMBER) {
          value.push(consume(TokenType.NUMBER).value);
        }
        if (peek().type === TokenType.COMMA) {
          current++;
        }
      }
      consume(TokenType.RBRACKET);
    } else if (nextToken.type === TokenType.STRING) {
      value = consume(TokenType.STRING).value;
    } else if (nextToken.type === TokenType.NUMBER) {
      value = consume(TokenType.NUMBER).value;
    } else if (nextToken.type === TokenType.DURATION) {
      value = consume(TokenType.DURATION).value;
    } else if (nextToken.type === TokenType.IDENTIFIER) {
      value = consume(TokenType.IDENTIFIER).value === 'true';
    }

    // Convert operator to JSON format
    const operatorMap = {
      '==': 'eq',
      '!=': 'neq',
      '>': 'gt',
      '>=': 'gte',
      '<': 'lt',
      '<=': 'lte',
      'is': 'is',
      'in': 'in',
      'contains': 'contains',
      'startsWith': 'startsWith',
      'endsWith': 'endsWith',
      'regex': 'regex'
    };

    const jsonOp = operatorMap[operator] || operator;
    const condition = {};
    condition[jsonOp] = [subject, value];

    // Handle 'and' chaining
    if (peek().type === TokenType.AND) {
      current++;
      return { all: [condition, parseCondition()] };
    }

    // Handle 'or' chaining
    if (peek().type === TokenType.OR) {
      current++;
      return { any: [condition, parseCondition()] };
    }

    return condition;
  }

  function parseAction() {
    const action = consume(TokenType.IDENTIFIER).value;
    const result = { action };

    // Parse action parameters based on action type
    switch (action) {
    case 'close':
      // No parameters
      break;
      
    case 'snooze':
      if (peek().type === TokenType.IDENTIFIER && peek().value === 'for') {
        current++;
        result.for = consume(TokenType.DURATION).value;
      }
      if (peek().type === TokenType.IDENTIFIER && peek().value === 'wakeInto') {
        current++;
        result.wakeInto = consume(TokenType.STRING).value;
      }
      break;
      
    case 'group':
      if (peek().type === TokenType.IDENTIFIER && peek().value === 'name') {
        current++;
        result.name = consume(TokenType.STRING).value;
      } else if (peek().type === TokenType.IDENTIFIER && peek().value === 'by') {
        current++;
        result.by = consume(TokenType.IDENTIFIER).value;
      }
      break;
      
    case 'bookmark':
      if (peek().type === TokenType.IDENTIFIER && peek().value === 'to') {
        current++;
        result.folder = consume(TokenType.STRING).value;
      }
      break;
    }

    return result;
  }

  function parseRule() {
    consume(TokenType.RULE);
    const name = consume(TokenType.STRING).value;
    consume(TokenType.LBRACE);

    const rule = {
      name,
      enabled: true,
      when: null,
      then: [],
      trigger: {},
      flags: {}
    };

    while (peek().type !== TokenType.RBRACE) {
      const token = peek();

      if (token.type === TokenType.WHEN) {
        current++;
        rule.when = parseCondition();
      } else if (token.type === TokenType.THEN) {
        current++;
        rule.then.push(parseAction());
        
        // Multiple actions can be chained with 'and'
        while (peek().type === TokenType.AND || peek().type === TokenType.IDENTIFIER && peek().value === 'and') {
          current++;
          rule.then.push(parseAction());
        }
      } else if (token.type === TokenType.TRIGGER) {
        current++;
        const triggerType = consume(TokenType.IDENTIFIER).value;
        
        switch (triggerType) {
        case 'immediate':
          rule.trigger.immediate = true;
          break;
        case 'onAction':
        case 'manual':
          rule.trigger.on_action = true;
          break;
        case 'repeat':
          if (peek().type === TokenType.IDENTIFIER && peek().value === 'every') {
            current++;
            rule.trigger.repeat_every = consume(TokenType.DURATION).value;
          }
          break;
        case 'once':
          if (peek().type === TokenType.IDENTIFIER && peek().value === 'at') {
            current++;
            rule.trigger.once_at = consume(TokenType.STRING).value;
          }
          break;
        }
      } else if (token.type === TokenType.FLAGS) {
        current++;
        while (peek().type === TokenType.IDENTIFIER) {
          const flag = consume(TokenType.IDENTIFIER).value;
          if (flag === 'skipPinned') {
            rule.flags.skipPinned = true;
          } else if (flag === 'log') {
            rule.flags.log = true;
          } else if (flag === 'immediate') {
            rule.flags.immediate = true;
          }
        }
      } else {
        current++; // Skip unexpected token to avoid infinite loop
        throw new Error(`Unexpected token ${token.type} in rule body`);
      }
    }

    consume(TokenType.RBRACE);
    return rule;
  }

  const rules = [];
  while (peek().type !== TokenType.EOF) {
    rules.push(parseRule());
  }

  return rules;
}

/**
 * Serialize JSON rules to DSL format
 */
function serializeRuleToDSL(rule) {
  let dsl = `rule "${rule.name}" {\n`;

  // Serialize condition
  if (rule.when) {
    dsl += `  when ${serializeCondition(rule.when)}\n`;
  }

  // Serialize actions
  if (rule.then && rule.then.length > 0) {
    dsl += `  then ${rule.then.map(serializeAction).join(' and ')}\n`;
  }

  // Serialize trigger
  if (rule.trigger) {
    dsl += `  trigger ${serializeTrigger(rule.trigger)}\n`;
  }

  // Serialize flags
  if (rule.flags) {
    const flags = [];
    if (rule.flags.skipPinned) flags.push('skipPinned');
    if (rule.flags.log) flags.push('log');
    if (rule.flags.immediate) flags.push('immediate');
    if (flags.length > 0) {
      dsl += `  flags ${flags.join(' ')}\n`;
    }
  }

  dsl += '}';
  return dsl;
}

function serializeCondition(condition) {
  // Handle grouping operators
  if (condition.all) {
    return `all(${condition.all.map(serializeCondition).join(', ')})`;
  }
  if (condition.any) {
    return `any(${condition.any.map(serializeCondition).join(', ')})`;
  }
  if (condition.none) {
    return `none(${condition.none.map(serializeCondition).join(', ')})`;
  }

  // Handle simple conditions
  const operatorMap = {
    'eq': '==',
    'neq': '!=',
    'gt': '>',
    'gte': '>=',
    'lt': '<',
    'lte': '<=',
    'is': 'is',
    'in': 'in',
    'contains': 'contains',
    'startsWith': 'startsWith',
    'endsWith': 'endsWith',
    'regex': 'regex'
  };

  for (const [jsonOp, dslOp] of Object.entries(operatorMap)) {
    if (condition[jsonOp]) {
      const [subject, value] = condition[jsonOp];
      let valueStr;
      
      if (Array.isArray(value)) {
        valueStr = `[${value.map(v => `"${v}"`).join(', ')}]`;
      } else if (typeof value === 'string') {
        // Check if it's a regex pattern
        if (value.startsWith('/') && value.includes('/', 1)) {
          valueStr = value;
        } else {
          valueStr = `"${value}"`;
        }
      } else if (typeof value === 'boolean') {
        valueStr = value.toString();
      } else {
        valueStr = value;
      }
      
      return `${subject} ${dslOp} ${valueStr}`;
    }
  }

  return '';
}

function serializeAction(action) {
  switch (action.action) {
  case 'close':
    return 'close';
    
  case 'snooze':
    let snooze = 'snooze';
    if (action.for) {
      snooze += ` for ${action.for}`;
    }
    if (action.wakeInto) {
      snooze += ` wakeInto "${action.wakeInto}"`;
    }
    return snooze;
    
  case 'group':
    if (action.name) {
      return `group name "${action.name}"`;
    } else if (action.by) {
      return `group by ${action.by}`;
    }
    return 'group';
    
  case 'bookmark':
    if (action.folder) {
      return `bookmark to "${action.folder}"`;
    }
    return 'bookmark';
    
  default:
    return action.action;
  }
}

function serializeTrigger(trigger) {
  if (trigger.immediate) {
    return 'immediate';
  }
  if (trigger.on_action) {
    return 'onAction';
  }
  if (trigger.repeat_every) {
    return `repeat every ${trigger.repeat_every}`;
  }
  if (trigger.once_at) {
    return `once at "${trigger.once_at}"`;
  }
  return 'manual';
}

/**
 * Validate DSL syntax
 */
function validateDSL(dsl) {
  try {
    const rules = parseDSL(dsl);
    return { valid: true, rules };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Format DSL with proper indentation
 */
function formatDSL(dsl) {
  const lines = dsl.split('\n');
  const formatted = [];
  let indentLevel = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.endsWith('{')) {
      formatted.push('  '.repeat(indentLevel) + trimmed);
      indentLevel++;
    } else if (trimmed.startsWith('}')) {
      indentLevel = Math.max(0, indentLevel - 1);
      formatted.push('  '.repeat(indentLevel) + trimmed);
    } else if (trimmed) {
      formatted.push('  '.repeat(indentLevel) + trimmed);
    } else {
      formatted.push('');
    }
  }

  return formatted.join('\n');
}

// Export functions for use in other modules
export {
  parseDSL,
  serializeRuleToDSL,
  validateDSL,
  formatDSL,
  tokenize
};