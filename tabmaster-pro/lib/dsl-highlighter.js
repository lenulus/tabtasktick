/**
 * DSL Syntax Highlighter
 * 
 * Provides syntax highlighting for the Rules Engine DSL
 */

/**
 * Token types for highlighting
 */
const HighlightClass = {
  KEYWORD: 'dsl-keyword',
  STRING: 'dsl-string',
  NUMBER: 'dsl-number',
  OPERATOR: 'dsl-operator',
  IDENTIFIER: 'dsl-identifier',
  COMMENT: 'dsl-comment',
  BRACKET: 'dsl-bracket',
  FUNCTION: 'dsl-function',
  PROPERTY: 'dsl-property',
  REGEX: 'dsl-regex'
};

/**
 * Keywords that should be highlighted
 */
const KEYWORDS = new Set([
  'rule', 'when', 'then', 'trigger', 'flags',
  'and', 'or', 'not', 'all', 'any', 'none',
  'true', 'false', 'is', 'in'
]);

/**
 * Action keywords
 */
const ACTIONS = new Set([
  'close', 'snooze', 'group'
]);

/**
 * Trigger types
 */
const TRIGGERS = new Set([
  'immediate', 'onAction', 'manual', 'repeat', 'once'
]);

/**
 * Flag names
 */
const FLAGS = new Set([
  'skipPinned', 'log', 'immediate'
]);

/**
 * Properties that can be accessed on objects
 */
const PROPERTIES = new Set([
  'age', 'domain', 'url', 'title', 'category', 'origin',
  'isDupe', 'isPinned', 'isGrouped', 'groupName',
  'countPerOrigin', 'tabCount'
]);

/**
 * Highlight DSL code and return HTML
 */
function highlightDSL(code) {
  if (!code) return '';
  
  let result = '';
  let i = 0;
  
  while (i < code.length) {
    // Skip whitespace
    if (/\s/.test(code[i])) {
      result += code[i];
      i++;
      continue;
    }
    
    // Comments
    if (code[i] === '/' && code[i + 1] === '/') {
      let comment = '';
      while (i < code.length && code[i] !== '\n') {
        comment += code[i];
        i++;
      }
      result += `<span class="${HighlightClass.COMMENT}">${escapeHtml(comment)}</span>`;
      continue;
    }
    
    // String literals
    if (code[i] === '"') {
      let str = '"';
      i++;
      let escaped = false;
      while (i < code.length && (code[i] !== '"' || escaped)) {
        if (!escaped && code[i] === '\\') {
          escaped = true;
          str += code[i];
        } else {
          escaped = false;
          str += code[i];
        }
        i++;
      }
      if (i < code.length) {
        str += '"';
        i++;
      }
      result += `<span class="${HighlightClass.STRING}">${escapeHtml(str)}</span>`;
      continue;
    }
    
    // Regex patterns
    if (code[i] === '/' && isRegexStart(code, i)) {
      let regex = '/';
      i++;
      while (i < code.length && code[i] !== '/') {
        if (code[i] === '\\' && i + 1 < code.length) {
          regex += code[i] + code[i + 1];
          i += 2;
        } else {
          regex += code[i];
          i++;
        }
      }
      if (i < code.length) {
        regex += '/';
        i++;
        // Collect flags
        while (i < code.length && /[gimuy]/.test(code[i])) {
          regex += code[i];
          i++;
        }
      }
      result += `<span class="${HighlightClass.REGEX}">${escapeHtml(regex)}</span>`;
      continue;
    }
    
    // Numbers and durations
    if (/\d/.test(code[i])) {
      let num = '';
      while (i < code.length && /\d/.test(code[i])) {
        num += code[i];
        i++;
      }
      // Check for duration suffix
      if (i < code.length && /[mhd]/.test(code[i])) {
        num += code[i];
        i++;
      }
      result += `<span class="${HighlightClass.NUMBER}">${escapeHtml(num)}</span>`;
      continue;
    }
    
    // Brackets and braces
    if ('{[()]}'.includes(code[i])) {
      result += `<span class="${HighlightClass.BRACKET}">${escapeHtml(code[i])}</span>`;
      i++;
      continue;
    }
    
    // Operators
    if ('=!<>'.includes(code[i])) {
      let op = code[i];
      i++;
      if (i < code.length && '='.includes(code[i])) {
        op += code[i];
        i++;
      }
      result += `<span class="${HighlightClass.OPERATOR}">${escapeHtml(op)}</span>`;
      continue;
    }
    
    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(code[i])) {
      let word = '';
      const startPos = i;
      
      // Collect the word
      while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) {
        word += code[i];
        i++;
      }
      
      // Check for property access (tab.property or window.property)
      let isProperty = false;
      if (i < code.length && code[i] === '.') {
        const prevWord = word;
        word += '.';
        i++;
        
        // Collect property name
        let propName = '';
        while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) {
          propName += code[i];
          word += code[i];
          i++;
        }
        
        // Special case for tab.countPerOrigin:domain
        if (propName === 'countPerOrigin' && i < code.length && code[i] === ':') {
          word += code[i];
          i++;
          while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) {
            word += code[i];
            i++;
          }
        }
        
        // Highlight the object and property separately
        result += `<span class="${HighlightClass.IDENTIFIER}">${escapeHtml(prevWord)}</span>`;
        result += '.';
        if (PROPERTIES.has(propName) || propName.startsWith('countPerOrigin')) {
          result += `<span class="${HighlightClass.PROPERTY}">${escapeHtml(word.substring(prevWord.length + 1))}</span>`;
        } else {
          result += `<span class="${HighlightClass.IDENTIFIER}">${escapeHtml(word.substring(prevWord.length + 1))}</span>`;
        }
        isProperty = true;
      }
      
      if (!isProperty) {
        // Determine highlighting class
        let className = HighlightClass.IDENTIFIER;
        
        if (KEYWORDS.has(word)) {
          className = HighlightClass.KEYWORD;
        } else if (ACTIONS.has(word)) {
          className = HighlightClass.KEYWORD;
        } else if (TRIGGERS.has(word)) {
          className = HighlightClass.KEYWORD;
        } else if (FLAGS.has(word)) {
          className = HighlightClass.KEYWORD;
        } else if (['contains', 'startsWith', 'endsWith', 'regex'].includes(word)) {
          className = HighlightClass.OPERATOR;
        } else if (['for', 'to', 'by', 'name', 'every', 'at', 'wakeInto'].includes(word)) {
          className = HighlightClass.KEYWORD;
        }
        
        result += `<span class="${className}">${escapeHtml(word)}</span>`;
      }
      
      continue;
    }
    
    // Default - unrecognized character
    result += escapeHtml(code[i]);
    i++;
  }
  
  return result;
}

/**
 * Check if a forward slash starts a regex pattern
 */
function isRegexStart(code, pos) {
  // Look back to see if this could be a regex
  // Regex typically follows operators or keywords like 'regex'
  let lookback = pos - 1;
  while (lookback >= 0 && /\s/.test(code[lookback])) {
    lookback--;
  }
  
  if (lookback >= 0) {
    // Check if preceded by 'regex' keyword
    const before = code.substring(Math.max(0, lookback - 10), lookback + 1);
    if (before.endsWith('regex')) {
      return true;
    }
  }
  
  // For now, assume / at start of value position might be regex
  return true;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Apply syntax highlighting to a textarea by creating an overlay
 */
function createHighlightedOverlay(textarea) {
  // Create overlay container
  const container = document.createElement('div');
  container.className = 'dsl-highlight-container';
  container.style.position = 'relative';
  
  // Create backdrop for highlighted code
  const backdrop = document.createElement('div');
  backdrop.className = 'dsl-highlight-backdrop';
  backdrop.style.position = 'absolute';
  backdrop.style.top = '0';
  backdrop.style.left = '0';
  backdrop.style.right = '0';
  backdrop.style.bottom = '0';
  backdrop.style.padding = textarea.style.padding || '12px';
  backdrop.style.fontFamily = textarea.style.fontFamily;
  backdrop.style.fontSize = textarea.style.fontSize;
  backdrop.style.lineHeight = textarea.style.lineHeight;
  backdrop.style.whiteSpace = 'pre-wrap';
  backdrop.style.wordWrap = 'break-word';
  backdrop.style.overflow = 'auto';
  backdrop.style.pointerEvents = 'none';
  backdrop.style.color = 'transparent';
  backdrop.style.backgroundColor = 'transparent';
  
  // Insert container before textarea
  textarea.parentNode.insertBefore(container, textarea);
  container.appendChild(backdrop);
  container.appendChild(textarea);
  
  // Make textarea transparent to show highlights underneath
  textarea.style.position = 'relative';
  textarea.style.backgroundColor = 'transparent';
  textarea.style.zIndex = '1';
  textarea.style.color = 'inherit';
  
  // Update highlights on input
  function updateHighlights() {
    const code = textarea.value;
    const highlighted = highlightDSL(code);
    backdrop.innerHTML = highlighted + '\n'; // Extra newline for scroll sync
    
    // Sync scroll position
    backdrop.scrollTop = textarea.scrollTop;
    backdrop.scrollLeft = textarea.scrollLeft;
  }
  
  // Event listeners
  textarea.addEventListener('input', updateHighlights);
  textarea.addEventListener('scroll', () => {
    backdrop.scrollTop = textarea.scrollTop;
    backdrop.scrollLeft = textarea.scrollLeft;
  });
  
  // Initial highlight
  updateHighlights();
  
  return {
    update: updateHighlights,
    destroy: () => {
      container.parentNode.insertBefore(textarea, container);
      container.remove();
    }
  };
}

// Export functions
export {
  highlightDSL,
  createHighlightedOverlay,
  HighlightClass
};