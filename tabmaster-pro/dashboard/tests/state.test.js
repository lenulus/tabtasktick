import state from '../modules/core/state.js';

describe('State Management', () => {
  beforeEach(() => {
    // Reset state before each test
    state.reset();
  });

  describe('Basic state operations', () => {
    test('should get and set simple values', () => {
      state.set('testValue', 'hello');
      expect(state.get('testValue')).toBe('hello');
    });

    test('should get and set nested values', () => {
      state.set('settings.theme', 'dark');
      expect(state.get('settings.theme')).toBe('dark');
      expect(state.get('settings')).toEqual({
        theme: 'dark',
        autoSuspend: false,
        suspendAfter: 30,
        notifications: true
      });
    });

    test('should return undefined for non-existent paths', () => {
      expect(state.get('nonexistent')).toBeUndefined();
      expect(state.get('deeply.nested.path')).toBeUndefined();
    });

    test('should set multiple values at once', () => {
      state.set({
        'currentView': 'tabs',
        'settings.theme': 'dark',
        'settings.autoSuspend': true
      });
      
      expect(state.get('currentView')).toBe('tabs');
      expect(state.get('settings.theme')).toBe('dark');
      expect(state.get('settings.autoSuspend')).toBe(true);
    });
  });

  describe('Arrays and objects', () => {
    test('should handle arrays', () => {
      const tabs = [{ id: 1, url: 'test.com' }];
      state.set('tabsData', tabs);
      
      const retrieved = state.get('tabsData');
      expect(retrieved).toEqual(tabs);
      expect(retrieved).not.toBe(tabs); // Should be a copy
    });

    test('should handle objects', () => {
      const settings = { theme: 'dark', fontSize: 16 };
      state.set('settings', settings);
      
      const retrieved = state.get('settings');
      expect(retrieved.theme).toBe('dark');
      expect(retrieved.fontSize).toBe(16);
      expect(retrieved).not.toBe(settings); // Should be a copy
    });
  });

  describe('State subscriptions', () => {
    test('should notify subscribers on state change', (done) => {
      const callback = jest.fn((updates, paths) => {
        expect(updates).toEqual({ testValue: 'updated' });
        expect(paths).toEqual(['testValue']);
        done();
      });

      const unsubscribe = state.subscribe(['testValue'], callback);
      state.set('testValue', 'updated');
    });

    test('should not notify for unrelated changes', () => {
      const callback = jest.fn();
      
      state.subscribe(['specificPath'], callback);
      state.set('otherPath', 'value');
      
      expect(callback).not.toHaveBeenCalled();
    });

    test('should handle wildcard subscriptions', () => {
      const callback = jest.fn();
      
      state.subscribe(['*'], callback);
      state.set('anyPath', 'value');
      
      expect(callback).toHaveBeenCalledWith(
        { anyPath: 'value' },
        ['anyPath']
      );
    });

    test('should unsubscribe correctly', () => {
      const callback = jest.fn();
      
      const unsubscribe = state.subscribe(['testValue'], callback);
      unsubscribe();
      
      state.set('testValue', 'updated');
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Batch updates', () => {
    test('should batch multiple updates', () => {
      const callback = jest.fn();
      state.subscribe(['*'], callback);
      
      state.batchUpdate(() => {
        state.set('value1', 'test1');
        state.set('value2', 'test2');
        state.set('value3', 'test3');
      });
      
      // Should only be called once with all updates
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        {
          value1: 'test1',
          value2: 'test2',
          value3: 'test3'
        },
        ['value1', 'value2', 'value3']
      );
    });
  });

  describe('selectedTabs API', () => {
    test('should add and remove tabs', () => {
      state.selectedTabs.add(1);
      state.selectedTabs.add(2);
      
      expect(state.selectedTabs.has(1)).toBe(true);
      expect(state.selectedTabs.has(2)).toBe(true);
      expect(state.selectedTabs.size).toBe(2);
      
      state.selectedTabs.delete(1);
      expect(state.selectedTabs.has(1)).toBe(false);
      expect(state.selectedTabs.size).toBe(1);
    });

    test('should toggle tabs', () => {
      state.selectedTabs.toggle(1);
      expect(state.selectedTabs.has(1)).toBe(true);
      
      state.selectedTabs.toggle(1);
      expect(state.selectedTabs.has(1)).toBe(false);
    });

    test('should clear all tabs', () => {
      state.selectedTabs.add(1);
      state.selectedTabs.add(2);
      state.selectedTabs.add(3);
      
      state.selectedTabs.clear();
      expect(state.selectedTabs.size).toBe(0);
    });

    test('should notify on selectedTabs changes', (done) => {
      const callback = jest.fn((updates, paths) => {
        expect(paths).toContain('selectedTabs');
        expect(state.selectedTabs.has(1)).toBe(true);
        done();
      });

      state.subscribe(['selectedTabs'], callback);
      state.selectedTabs.add(1);
    });
  });

  describe('State reset', () => {
    test('should reset all state to defaults', () => {
      state.set('currentView', 'groups');
      state.set('tabsData', [1, 2, 3]);
      state.selectedTabs.add(1);
      
      state.reset();
      
      expect(state.get('currentView')).toBe('overview');
      expect(state.get('tabsData')).toEqual([]);
      expect(state.selectedTabs.size).toBe(0);
    });

    test('should reset specific paths', () => {
      state.set('currentView', 'groups');
      state.set('settings.theme', 'dark');
      
      state.reset(['currentView']);
      
      expect(state.get('currentView')).toBe('overview');
      expect(state.get('settings.theme')).toBe('dark'); // Should not be reset
    });
  });
});