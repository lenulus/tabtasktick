import { jest } from '@jest/globals';
import { 
  debounce, 
  formatBytes, 
  getTimeAgo, 
  getGroupColor, 
  getTabState,
  getWindowSignature,
  generateWindowColor,
  escapeHtml,
  sortTabs
} from '../modules/core/utils.js';

describe('Utils Module', () => {
  describe('debounce', () => {
    jest.useFakeTimers();
    
    test('should delay function execution', () => {
      const func = jest.fn();
      const debouncedFunc = debounce(func, 1000);
      
      debouncedFunc();
      expect(func).not.toHaveBeenCalled();
      
      jest.advanceTimersByTime(500);
      expect(func).not.toHaveBeenCalled();
      
      jest.advanceTimersByTime(500);
      expect(func).toHaveBeenCalledTimes(1);
    });
    
    test('should cancel previous calls', () => {
      const func = jest.fn();
      const debouncedFunc = debounce(func, 1000);
      
      debouncedFunc('first');
      jest.advanceTimersByTime(500);
      debouncedFunc('second');
      jest.advanceTimersByTime(1000);
      
      expect(func).toHaveBeenCalledTimes(1);
      expect(func).toHaveBeenCalledWith('second');
    });
  });
  
  describe('formatBytes', () => {
    test('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1536, 0)).toBe('2 KB');
    });
  });
  
  describe('getTimeAgo', () => {
    const now = Date.now();
    
    test('should return "Just now" for recent times', () => {
      expect(getTimeAgo(now - 30000)).toBe('Just now');
    });
    
    test('should return minutes for < 1 hour', () => {
      expect(getTimeAgo(now - 150000)).toBe('2m ago');
      expect(getTimeAgo(now - 1800000)).toBe('30m ago');
    });
    
    test('should return hours for < 1 day', () => {
      expect(getTimeAgo(now - 7200000)).toBe('2h ago');
      expect(getTimeAgo(now - 43200000)).toBe('12h ago');
    });
    
    test('should return days for < 1 week', () => {
      expect(getTimeAgo(now - 172800000)).toBe('2d ago');
      expect(getTimeAgo(now - 518400000)).toBe('6d ago');
    });
    
    test('should return date for older times', () => {
      const oldDate = now - 864000000; // 10 days ago
      expect(getTimeAgo(oldDate)).toBe(new Date(oldDate).toLocaleDateString());
    });
  });
  
  describe('getGroupColor', () => {
    test('should return correct hex colors', () => {
      expect(getGroupColor('blue')).toBe('#1a73e8');
      expect(getGroupColor('red')).toBe('#d93025');
      expect(getGroupColor('green')).toBe('#188038');
    });
    
    test('should return grey for unknown colors', () => {
      expect(getGroupColor('unknown')).toBe('#5f6368');
      expect(getGroupColor()).toBe('#5f6368');
    });
  });
  
  describe('getTabState', () => {
    test('should identify suspended tabs', () => {
      expect(getTabState({ discarded: true })).toBe('💤 Suspended');
    });
    
    test('should identify active tabs', () => {
      expect(getTabState({ active: true })).toBe('👁 Active');
    });
    
    test('should identify audible tabs', () => {
      expect(getTabState({ audible: true })).toBe('🔊 Playing');
    });
    
    test('should identify pinned tabs', () => {
      expect(getTabState({ pinned: true })).toBe('📌 Pinned');
    });
    
    test('should return Loaded for normal tabs', () => {
      expect(getTabState({})).toBe('Loaded');
    });
    
    test('should prioritize states correctly', () => {
      expect(getTabState({ discarded: true, active: true })).toBe('💤 Suspended');
      expect(getTabState({ active: true, audible: true })).toBe('👁 Active');
    });
  });
  
  describe('getWindowSignature', () => {
    test('should create signature from pinned tabs', () => {
      const tabs = [
        { url: 'https://gmail.com', pinned: true },
        { url: 'https://calendar.google.com', pinned: true },
        { url: 'https://github.com', pinned: false }
      ];
      expect(getWindowSignature(tabs)).toBe('calendar.google.com|gmail.com');
    });
    
    test('should fallback to top domains', () => {
      const tabs = [
        { url: 'https://example.com' },
        { url: 'https://test.com' },
        { url: 'https://demo.com' }
      ];
      expect(getWindowSignature(tabs)).toBe('demo.com|example.com|test.com');
    });
    
    test('should handle invalid URLs', () => {
      const tabs = [
        { url: 'chrome://newtab' },
        { url: 'invalid-url' },
        { url: 'https://valid.com' }
      ];
      expect(getWindowSignature(tabs)).toBe('newtab|valid.com');
    });
  });
  
  describe('generateWindowColor', () => {
    test('should generate different colors for different indices', () => {
      const color1 = generateWindowColor(0, 10);
      const color2 = generateWindowColor(1, 10);
      const color3 = generateWindowColor(2, 10);
      
      expect(color1).not.toBe(color2);
      expect(color2).not.toBe(color3);
      expect(color1).toMatch(/^hsl\(/);
    });
    
    test('should handle edge cases', () => {
      expect(generateWindowColor(0, 1)).toMatch(/^hsl\(/);
      expect(generateWindowColor(100, 5)).toMatch(/^hsl\(/);
    });
  });
  
  describe('escapeHtml', () => {
    test('should escape HTML entities', () => {
      expect(escapeHtml('<script>alert("XSS")</script>'))
        .toBe('&lt;script&gt;alert("XSS")&lt;/script&gt;');
      expect(escapeHtml('Test & < > " \''))
        .toBe('Test &amp; &lt; &gt; " \'');
    });
  });
  
  describe('sortTabs', () => {
    const mockTabs = [
      { id: 1, title: 'Zebra', url: 'https://zebra.com', lastAccessed: 1000 },
      { id: 2, title: 'Apple', url: 'https://apple.com', lastAccessed: 3000 },
      { id: 3, title: 'Banana', url: 'https://banana.net', lastAccessed: 2000 }
    ];
    
    test('should sort alphabetically', () => {
      const sorted = sortTabs(mockTabs, 'alphabetical');
      expect(sorted[0].title).toBe('Apple');
      expect(sorted[2].title).toBe('Zebra');
    });
    
    test('should sort by domain', () => {
      const sorted = sortTabs(mockTabs, 'domain');
      expect(sorted[0].url).toBe('https://apple.com');
      expect(sorted[2].url).toBe('https://zebra.com');
    });
    
    test('should sort by recent access', () => {
      const sorted = sortTabs(mockTabs, 'recent');
      expect(sorted[0].lastAccessed).toBe(3000);
      expect(sorted[2].lastAccessed).toBe(1000);
    });
    
    test('should sort by oldest access', () => {
      const sorted = sortTabs(mockTabs, 'oldest');
      expect(sorted[0].lastAccessed).toBe(1000);
      expect(sorted[2].lastAccessed).toBe(3000);
    });
    
    test('should return original order for default', () => {
      const sorted = sortTabs(mockTabs, 'default');
      expect(sorted).toEqual(mockTabs);
    });
  });
});