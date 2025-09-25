/**
 * Tests for DSL syntax highlighter
 */

import { highlightDSL, HighlightClass } from '../lib/dsl-highlighter.js';

describe('DSL Syntax Highlighter', () => {
  describe('Keywords', () => {
    test('highlights rule keyword', () => {
      const result = highlightDSL('rule "Test" { }');
      expect(result).toContain(`<span class="${HighlightClass.KEYWORD}">rule</span>`);
    });

    test('highlights all main keywords', () => {
      const keywords = ['rule', 'when', 'then', 'trigger', 'flags'];
      keywords.forEach(keyword => {
        const result = highlightDSL(keyword);
        expect(result).toContain(`<span class="${HighlightClass.KEYWORD}">${keyword}</span>`);
      });
    });

    test('highlights logical operators', () => {
      const operators = ['and', 'or', 'not', 'all', 'any', 'none'];
      operators.forEach(op => {
        const result = highlightDSL(op);
        expect(result).toContain(`<span class="${HighlightClass.KEYWORD}">${op}</span>`);
      });
    });

    test('highlights action keywords', () => {
      const actions = ['close', 'snooze', 'group', 'bookmark'];
      actions.forEach(action => {
        const result = highlightDSL(`then ${action}`);
        expect(result).toContain(`<span class="${HighlightClass.KEYWORD}">${action}</span>`);
      });
    });
  });

  describe('Strings', () => {
    test('highlights simple strings', () => {
      const result = highlightDSL('"hello world"');
      expect(result).toContain(`<span class="${HighlightClass.STRING}">&quot;hello world&quot;</span>`);
    });

    test('highlights strings with escapes', () => {
      const result = highlightDSL('"test \\"quote\\""');
      expect(result).toContain(`<span class="${HighlightClass.STRING}">&quot;test \\&quot;quote\\&quot;&quot;</span>`);
    });
  });

  describe('Numbers and Durations', () => {
    test('highlights plain numbers', () => {
      const result = highlightDSL('42');
      expect(result).toContain(`<span class="${HighlightClass.NUMBER}">42</span>`);
    });

    test('highlights durations', () => {
      const durations = ['30m', '1h', '7d'];
      durations.forEach(dur => {
        const result = highlightDSL(dur);
        expect(result).toContain(`<span class="${HighlightClass.NUMBER}">${dur}</span>`);
      });
    });
  });

  describe('Properties', () => {
    test('highlights tab properties', () => {
      const result = highlightDSL('tab.age');
      expect(result).toContain(`<span class="${HighlightClass.IDENTIFIER}">tab</span>`);
      expect(result).toContain(`<span class="${HighlightClass.PROPERTY}">age</span>`);
    });

    test('highlights special properties', () => {
      const result = highlightDSL('tab.countPerOrigin:domain');
      expect(result).toContain(`<span class="${HighlightClass.IDENTIFIER}">tab</span>`);
      expect(result).toContain(`<span class="${HighlightClass.PROPERTY}">countPerOrigin:domain</span>`);
    });
  });

  describe('Operators', () => {
    test('highlights comparison operators', () => {
      const operators = ['==', '!=', '>', '>=', '<', '<='];
      const expectedOps = ['==', '!=', '&gt;', '&gt;=', '&lt;', '&lt;='];
      operators.forEach((op, index) => {
        const result = highlightDSL(`age ${op} 5`);
        expect(result).toContain(`<span class="${HighlightClass.OPERATOR}">${expectedOps[index]}</span>`);
      });
    });

    test('highlights word operators', () => {
      const operators = ['contains', 'startsWith', 'endsWith', 'regex'];
      operators.forEach(op => {
        const result = highlightDSL(`url ${op} "test"`);
        expect(result).toContain(`<span class="${HighlightClass.OPERATOR}">${op}</span>`);
      });
    });
  });

  describe('Comments', () => {
    test('highlights single-line comments', () => {
      const result = highlightDSL('rule "Test" { } // This is a comment');
      expect(result).toContain(`<span class="${HighlightClass.COMMENT}">// This is a comment</span>`);
    });
  });

  describe('Brackets', () => {
    test('highlights brackets and braces', () => {
      const result = highlightDSL('{ [ ( ) ] }');
      expect(result.match(new RegExp(HighlightClass.BRACKET, 'g'))).toHaveLength(6);
    });
  });

  describe('Regex patterns', () => {
    test('highlights regex patterns', () => {
      const result = highlightDSL('url regex /test.*pattern/gi');
      expect(result).toContain(`<span class="${HighlightClass.REGEX}">/test.*pattern/gi</span>`);
    });
  });

  describe('Complete rules', () => {
    test('highlights a complete rule', () => {
      const dsl = `rule "Test Rule" {
  when tab.age > 1d and tab.category in ["news", "social"]
  then close
  trigger repeat every 30m
  flags skipPinned log
}`;
      
      const result = highlightDSL(dsl);
      
      // Check various elements
      expect(result).toContain(`<span class="${HighlightClass.KEYWORD}">rule</span>`);
      expect(result).toContain(`<span class="${HighlightClass.STRING}">&quot;Test Rule&quot;</span>`);
      expect(result).toContain(`<span class="${HighlightClass.KEYWORD}">when</span>`);
      expect(result).toContain(`<span class="${HighlightClass.PROPERTY}">age</span>`);
      expect(result).toContain(`<span class="${HighlightClass.OPERATOR}">&gt;</span>`);
      expect(result).toContain(`<span class="${HighlightClass.NUMBER}">1d</span>`);
      expect(result).toContain(`<span class="${HighlightClass.KEYWORD}">and</span>`);
      expect(result).toContain(`<span class="${HighlightClass.KEYWORD}">in</span>`);
      expect(result).toContain(`<span class="${HighlightClass.KEYWORD}">then</span>`);
      expect(result).toContain(`<span class="${HighlightClass.KEYWORD}">close</span>`);
      expect(result).toContain(`<span class="${HighlightClass.KEYWORD}">trigger</span>`);
      expect(result).toContain(`<span class="${HighlightClass.KEYWORD}">repeat</span>`);
      expect(result).toContain(`<span class="${HighlightClass.KEYWORD}">every</span>`);
      expect(result).toContain(`<span class="${HighlightClass.NUMBER}">30m</span>`);
      expect(result).toContain(`<span class="${HighlightClass.KEYWORD}">flags</span>`);
      expect(result).toContain(`<span class="${HighlightClass.KEYWORD}">skipPinned</span>`);
      expect(result).toContain(`<span class="${HighlightClass.KEYWORD}">log</span>`);
    });

    test('highlights complex nested conditions', () => {
      const dsl = `when all(
  tab.domain in ["example.com", "test.com"],
  any(
    tab.age > 2h,
    tab.isPinned is false
  )
)`;
      
      const result = highlightDSL(dsl);
      
      expect(result).toContain(`<span class="${HighlightClass.KEYWORD}">all</span>`);
      expect(result).toContain(`<span class="${HighlightClass.KEYWORD}">any</span>`);
      expect(result).toContain(`<span class="${HighlightClass.KEYWORD}">is</span>`);
      expect(result).toContain(`<span class="${HighlightClass.KEYWORD}">false</span>`);
    });
  });

  describe('HTML escaping', () => {
    test('escapes HTML characters in strings', () => {
      // The input has nested quotes which breaks the string parsing
      // Let's test with escaped quotes instead
      const result = highlightDSL('"<script>alert(\\"xss\\")</script>"');
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
      expect(result).toContain('\\&quot;xss\\&quot;');
    });
  });
});