/**
 * @file emoji-suggestions.test.js
 * @description Unit tests for emoji suggestion utility
 * Phase 4.2.7: Smart emoji suggestion based on collection names
 */

import {
  suggestEmoji,
  getAllKeywords,
  getEmojiForKeyword
} from '../services/utils/emoji-suggestions.js';

describe('Emoji Suggestions', () => {
  describe('suggestEmoji', () => {
    it('should suggest work emoji for work-related names', () => {
      expect(suggestEmoji('work project')).toBe('💼');
      expect(suggestEmoji('Work Tasks')).toBe('💼');
      expect(suggestEmoji('office stuff')).toBe('💼');
      expect(suggestEmoji('business plan')).toBe('💼');
    });

    it('should suggest code emoji for development names', () => {
      expect(suggestEmoji('code review')).toBe('💻');
      expect(suggestEmoji('Development docs')).toBe('💻');
      expect(suggestEmoji('programming tutorial')).toBe('💻');
      expect(suggestEmoji('github issues')).toBe('💻');
    });

    it('should suggest bug emoji for bug-related names', () => {
      expect(suggestEmoji('bug fixes')).toBe('🐛');
      expect(suggestEmoji('Fix errors')).toBe('🐛');
      expect(suggestEmoji('issue tracker')).toBe('🐛');
    });

    it('should suggest docs emoji for documentation', () => {
      expect(suggestEmoji('documentation')).toBe('📚');
      expect(suggestEmoji('docs review')).toBe('📚');
      expect(suggestEmoji('wiki pages')).toBe('📚');
    });

    it('should suggest research emoji for learning content', () => {
      expect(suggestEmoji('research project')).toBe('🔬');
      expect(suggestEmoji('learning materials')).toBe('🔬');
      expect(suggestEmoji('study notes')).toBe('🔬');
    });

    it('should suggest shopping emoji for e-commerce', () => {
      expect(suggestEmoji('shopping list')).toBe('🛒');
      expect(suggestEmoji('amazon wishlist')).toBe('🛒');
      expect(suggestEmoji('buy stuff')).toBe('🛒');
    });

    it('should suggest finance emoji for money-related names', () => {
      expect(suggestEmoji('finance tracker')).toBe('💰');
      expect(suggestEmoji('tax prep')).toBe('💰');
      expect(suggestEmoji('budget planning')).toBe('💰');
    });

    it('should suggest travel emoji for vacation content', () => {
      expect(suggestEmoji('travel plans')).toBe('✈️');
      expect(suggestEmoji('vacation ideas')).toBe('✈️');
      expect(suggestEmoji('flight bookings')).toBe('✈️');
    });

    it('should suggest food emoji for cooking content', () => {
      expect(suggestEmoji('food recipes')).toBe('🍔');
      expect(suggestEmoji('cooking tips')).toBe('🍔');
      expect(suggestEmoji('restaurant reviews')).toBe('🍔');
    });

    it('should suggest home emoji for housing content', () => {
      expect(suggestEmoji('home renovation')).toBe('🏠');
      expect(suggestEmoji('house hunting')).toBe('🏠');
      expect(suggestEmoji('furniture shopping')).toBe('🏠');
    });

    it('should prioritize first word match', () => {
      expect(suggestEmoji('code work tasks')).toBe('💻'); // 'code' is first
      expect(suggestEmoji('work code review')).toBe('💼'); // 'work' is first
    });

    it('should handle multi-word names', () => {
      expect(suggestEmoji('Work Project Alpha')).toBe('💼');
      expect(suggestEmoji('GitHub Issues Tracker')).toBe('💻');
      expect(suggestEmoji('Bug Fix Sprint')).toBe('🐛');
    });

    it('should handle case insensitivity', () => {
      expect(suggestEmoji('WORK')).toBe('💼');
      expect(suggestEmoji('Code')).toBe('💻');
      expect(suggestEmoji('BUG')).toBe('🐛');
    });

    it('should handle names with hyphens and underscores', () => {
      expect(suggestEmoji('work-project')).toBe('💼');
      expect(suggestEmoji('code_review')).toBe('💻');
      expect(suggestEmoji('bug_fixes-v2')).toBe('🐛');
    });

    it('should return fallback emoji for unknown names', () => {
      const emoji = suggestEmoji('random unknown name');
      const fallbackEmojis = ['📁', '📂', '📌', '🔖', '⭐', '🎯', '🗂️', '📑', '🏷️', '🗃️'];
      expect(fallbackEmojis).toContain(emoji);
    });

    it('should return fallback emoji for empty string', () => {
      const emoji = suggestEmoji('');
      const fallbackEmojis = ['📁', '📂', '📌', '🔖', '⭐', '🎯', '🗂️', '📑', '🏷️', '🗃️'];
      expect(fallbackEmojis).toContain(emoji);
    });

    it('should return fallback emoji for null/undefined', () => {
      const emoji1 = suggestEmoji(null);
      const emoji2 = suggestEmoji(undefined);
      const fallbackEmojis = ['📁', '📂', '📌', '🔖', '⭐', '🎯', '🗂️', '📑', '🏷️', '🗃️'];
      expect(fallbackEmojis).toContain(emoji1);
      expect(fallbackEmojis).toContain(emoji2);
    });

    it('should handle partial keyword matches', () => {
      expect(suggestEmoji('working')).toBe('💼'); // contains 'work'
      expect(suggestEmoji('documentation')).toBe('📚'); // matches 'docs'
    });
  });

  describe('getAllKeywords', () => {
    it('should return all available keywords sorted', () => {
      const keywords = getAllKeywords();
      expect(Array.isArray(keywords)).toBe(true);
      expect(keywords.length).toBeGreaterThan(60); // At least 60 keywords
      expect(keywords).toContain('work');
      expect(keywords).toContain('code');
      expect(keywords).toContain('bug');

      // Check if sorted
      const sorted = [...keywords].sort();
      expect(keywords).toEqual(sorted);
    });
  });

  describe('getEmojiForKeyword', () => {
    it('should return emoji for valid keyword', () => {
      expect(getEmojiForKeyword('work')).toBe('💼');
      expect(getEmojiForKeyword('code')).toBe('💻');
      expect(getEmojiForKeyword('bug')).toBe('🐛');
    });

    it('should return null for unknown keyword', () => {
      expect(getEmojiForKeyword('unknown')).toBeNull();
      expect(getEmojiForKeyword('xyz123')).toBeNull();
    });

    it('should handle case insensitivity', () => {
      expect(getEmojiForKeyword('WORK')).toBe('💼');
      expect(getEmojiForKeyword('Code')).toBe('💻');
    });

    it('should return null for null/undefined', () => {
      expect(getEmojiForKeyword(null)).toBeNull();
      expect(getEmojiForKeyword(undefined)).toBeNull();
    });
  });

  describe('Comprehensive category coverage', () => {
    const testCategories = [
      { name: 'work', emoji: '💼' },
      { name: 'code', emoji: '💻' },
      { name: 'bug', emoji: '🐛' },
      { name: 'docs', emoji: '📚' },
      { name: 'research', emoji: '🔬' },
      { name: 'shop', emoji: '🛒' },
      { name: 'finance', emoji: '💰' },
      { name: 'health', emoji: '🏥' },
      { name: 'travel', emoji: '✈️' },
      { name: 'food', emoji: '🍔' },
      { name: 'home', emoji: '🏠' },
      { name: 'personal', emoji: '👤' },
      { name: 'design', emoji: '🎨' },
      { name: 'music', emoji: '🎵' },
      { name: 'video', emoji: '📹' },
      { name: 'social', emoji: '💬' },
      { name: 'school', emoji: '🎓' },
      { name: 'project', emoji: '📋' },
      { name: 'idea', emoji: '💡' },
      { name: 'urgent', emoji: '🚨' }
    ];

    testCategories.forEach(({ name, emoji }) => {
      it(`should return ${emoji} for "${name}" category`, () => {
        expect(suggestEmoji(name)).toBe(emoji);
      });
    });
  });
});
