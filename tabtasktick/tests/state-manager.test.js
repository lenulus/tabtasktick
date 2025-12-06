/**
 * @jest-environment jsdom
 */

import { stateManager } from '../sidepanel/state-manager.js';

// Simple mock function helper (Jest globals not available in ES modules)
function createMockFn() {
  const calls = [];
  const fn = (arg) => {
    calls.push(arg);
  };
  fn.mock = { calls };
  return fn;
}

describe('StateManager', () => {
  beforeEach(() => {
    // Reset state before each test
    stateManager.reset();

    // Mock DOM elements
    document.body.innerHTML = `
      <div id="collections-view"></div>
      <div id="tasks-view"></div>
    `;
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = stateManager.getState();

      expect(state.activeView).toBe('collections');
      expect(state.loading.collections).toBe(false);
      expect(state.loading.tasks).toBe(false);
      expect(state.errors.collections).toBe(null);
      expect(state.errors.tasks).toBe(null);
      expect(state.empty.collections).toBe(false);
      expect(state.empty.tasks).toBe(false);
      expect(state.scrollPositions.collections).toBe(0);
      expect(state.scrollPositions.tasks).toBe(0);
    });
  });

  describe('Active View Management', () => {
    it('should set active view', () => {
      stateManager.setActiveView('tasks');
      expect(stateManager.getActiveView()).toBe('tasks');
    });

    it('should not trigger notification if setting same view', () => {
      const listener = createMockFn();
      stateManager.subscribe(listener);

      stateManager.setActiveView('collections');
      expect(listener.mock.calls.length).toBe(0);
    });

    it('should trigger notification when changing views', () => {
      const listener = createMockFn();
      stateManager.subscribe(listener);

      stateManager.setActiveView('tasks');
      expect(listener.mock.calls.length).toBe(1);
    });

    it('should save scroll position when changing views', () => {
      const collectionsView = document.getElementById('collections-view');
      collectionsView.scrollTop = 100;

      stateManager.setActiveView('tasks');

      const state = stateManager.getState();
      expect(state.scrollPositions.collections).toBe(100);
    });
  });

  describe('Loading States', () => {
    it('should set loading state', () => {
      stateManager.setLoading('collections', true);
      expect(stateManager.isLoading('collections')).toBe(true);
    });

    it('should clear loading state', () => {
      stateManager.setLoading('collections', true);
      stateManager.setLoading('collections', false);
      expect(stateManager.isLoading('collections')).toBe(false);
    });

    it('should clear errors when setting loading true', () => {
      stateManager.setError('collections', new Error('Test error'));
      stateManager.setLoading('collections', true);

      expect(stateManager.hasError('collections')).toBe(false);
    });

    it('should notify listeners when loading changes', () => {
      const listener = createMockFn();
      stateManager.subscribe(listener);

      stateManager.setLoading('collections', true);
      expect(listener.mock.calls.length).toBe(1);
    });
  });

  describe('Error States', () => {
    it('should set error state', () => {
      const error = new Error('Test error');
      stateManager.setError('collections', error);

      expect(stateManager.hasError('collections')).toBe(true);
    });

    it('should get error details', () => {
      const error = new Error('Test error');
      stateManager.setError('collections', error);

      const errorDetails = stateManager.getError('collections');
      expect(errorDetails).toBeTruthy();
      expect(errorDetails.message).toContain('Test error');
    });

    it('should clear error state', () => {
      const error = new Error('Test error');
      stateManager.setError('collections', error);
      stateManager.clearError('collections');

      expect(stateManager.hasError('collections')).toBe(false);
    });

    it('should clear loading when setting error', () => {
      stateManager.setLoading('collections', true);
      stateManager.setError('collections', new Error('Test error'));

      expect(stateManager.isLoading('collections')).toBe(false);
    });

    it('should format connection errors', () => {
      const error = new Error('Could not establish connection');
      stateManager.transitionToError('collections', error);

      const errorDetails = stateManager.getError('collections');
      expect(errorDetails.type).toBe('connection');
      expect(errorDetails.retry).toBe(true);
      expect(errorDetails.message).toContain('Connection lost');
    });

    it('should format quota errors', () => {
      const error = new Error('QUOTA_EXCEEDED');
      stateManager.transitionToError('collections', error);

      const errorDetails = stateManager.getError('collections');
      expect(errorDetails.type).toBe('quota');
      expect(errorDetails.retry).toBe(false);
      expect(errorDetails.message).toContain('Storage full');
    });

    it('should format not found errors', () => {
      const error = new Error('Collection not found');
      stateManager.transitionToError('collections', error);

      const errorDetails = stateManager.getError('collections');
      expect(errorDetails.type).toBe('not_found');
      expect(errorDetails.retry).toBe(false);
      expect(errorDetails.message).toContain('no longer exists');
    });

    it('should format permission errors', () => {
      const error = new Error('Permission denied');
      stateManager.transitionToError('collections', error);

      const errorDetails = stateManager.getError('collections');
      expect(errorDetails.type).toBe('permission');
      expect(errorDetails.retry).toBe(false);
      expect(errorDetails.message).toContain('Permission denied');
    });

    it('should format unknown errors with retry', () => {
      const error = new Error('Something went wrong');
      stateManager.transitionToError('collections', error);

      const errorDetails = stateManager.getError('collections');
      expect(errorDetails.type).toBe('unknown');
      expect(errorDetails.retry).toBe(true);
    });
  });

  describe('Empty States', () => {
    it('should set empty state', () => {
      stateManager.setEmpty('collections', true);
      expect(stateManager.isEmpty('collections')).toBe(true);
    });

    it('should not show empty if loading', () => {
      stateManager.setEmpty('collections', true);
      stateManager.setLoading('collections', true);

      expect(stateManager.isEmpty('collections')).toBe(false);
    });

    it('should not show empty if error', () => {
      stateManager.setEmpty('collections', true);
      stateManager.setError('collections', new Error('Test'));

      expect(stateManager.isEmpty('collections')).toBe(false);
    });
  });

  describe('State Transitions', () => {
    it('should transition loading to success with data', () => {
      stateManager.setLoading('collections', true);
      stateManager.transitionToSuccess('collections', true);

      expect(stateManager.isLoading('collections')).toBe(false);
      expect(stateManager.hasError('collections')).toBe(false);
      expect(stateManager.isEmpty('collections')).toBe(false);
      expect(stateManager.shouldShowContent('collections')).toBe(true);
    });

    it('should transition loading to success without data (empty)', () => {
      stateManager.setLoading('collections', true);
      stateManager.transitionToSuccess('collections', false);

      expect(stateManager.isLoading('collections')).toBe(false);
      expect(stateManager.hasError('collections')).toBe(false);
      expect(stateManager.isEmpty('collections')).toBe(true);
      expect(stateManager.shouldShowContent('collections')).toBe(false);
    });

    it('should transition loading to error', () => {
      stateManager.setLoading('collections', true);
      stateManager.transitionToError('collections', new Error('Failed to load'));

      expect(stateManager.isLoading('collections')).toBe(false);
      expect(stateManager.hasError('collections')).toBe(true);
      expect(stateManager.shouldShowContent('collections')).toBe(false);
    });

    it('should transition empty to has data', () => {
      stateManager.setEmpty('collections', true);
      stateManager.transitionToHasData('collections');

      expect(stateManager.isEmpty('collections')).toBe(false);
      expect(stateManager.shouldShowContent('collections')).toBe(true);
    });
  });

  describe('Render Helpers', () => {
    it('should show content when not loading/error/empty', () => {
      expect(stateManager.shouldShowContent('collections')).toBe(true);
    });

    it('should not show content when loading', () => {
      stateManager.setLoading('collections', true);
      expect(stateManager.shouldShowContent('collections')).toBe(false);
    });

    it('should not show content when error', () => {
      stateManager.setError('collections', new Error('Test'));
      expect(stateManager.shouldShowContent('collections')).toBe(false);
    });

    it('should not show content when empty', () => {
      stateManager.setEmpty('collections', true);
      expect(stateManager.shouldShowContent('collections')).toBe(false);
    });
  });

  describe('Scroll Position Management', () => {
    it('should save scroll position when changing views', () => {
      const collectionsView = document.getElementById('collections-view');
      collectionsView.scrollTop = 250;

      stateManager.setActiveView('tasks');

      const state = stateManager.getState();
      expect(state.scrollPositions.collections).toBe(250);
    });

    it('should restore scroll position when returning to view', (done) => {
      const collectionsView = document.getElementById('collections-view');
      const tasksView = document.getElementById('tasks-view');

      // Set scroll position on collections view
      collectionsView.scrollTop = 300;

      // Switch to tasks
      stateManager.setActiveView('tasks');

      // Switch back to collections
      stateManager.setActiveView('collections');

      // Wait for requestAnimationFrame to restore position
      requestAnimationFrame(() => {
        expect(collectionsView.scrollTop).toBe(300);
        done();
      });
    });

    it('should handle missing DOM elements gracefully', () => {
      document.body.innerHTML = ''; // Remove elements

      // Should not throw error
      expect(() => {
        stateManager.setActiveView('tasks');
      }).not.toThrow();
    });
  });

  describe('Listener Pattern', () => {
    it('should subscribe to state changes', () => {
      const listener = createMockFn();
      stateManager.subscribe(listener);

      stateManager.setLoading('collections', true);

      expect(listener.mock.calls.length).toBe(1);
      expect(listener.mock.calls[0]).toEqual(stateManager.getState());
    });

    it('should unsubscribe from state changes', () => {
      const listener = createMockFn();
      const unsubscribe = stateManager.subscribe(listener);

      unsubscribe();

      stateManager.setLoading('collections', true);

      expect(listener.mock.calls.length).toBe(0);
    });

    it('should support multiple listeners', () => {
      const listener1 = createMockFn();
      const listener2 = createMockFn();

      stateManager.subscribe(listener1);
      stateManager.subscribe(listener2);

      stateManager.setLoading('collections', true);

      expect(listener1.mock.calls.length).toBe(1);
      expect(listener2.mock.calls.length).toBe(1);
    });
  });

  describe('Reset', () => {
    it('should reset view state', () => {
      stateManager.setLoading('collections', true);
      stateManager.setError('collections', new Error('Test'));
      stateManager.setEmpty('collections', true);

      stateManager.resetView('collections');

      expect(stateManager.isLoading('collections')).toBe(false);
      expect(stateManager.hasError('collections')).toBe(false);
      expect(stateManager.isEmpty('collections')).toBe(false);
    });

    it('should reset all state', () => {
      stateManager.setActiveView('tasks');
      stateManager.setLoading('collections', true);
      stateManager.setError('tasks', new Error('Test'));

      stateManager.reset();

      expect(stateManager.getActiveView()).toBe('collections');
      expect(stateManager.isLoading('collections')).toBe(false);
      expect(stateManager.hasError('tasks')).toBe(false);
    });
  });

  describe('Immutability', () => {
    it('should return new state object on getState', () => {
      const state1 = stateManager.getState();
      const state2 = stateManager.getState();

      expect(state1).not.toBe(state2); // Different objects
      expect(state1).toEqual(state2); // But same values
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('should recover from connection error with retry', () => {
      // Initial connection error
      stateManager.setLoading('collections', true);
      stateManager.transitionToError('collections', new Error('Could not establish connection'));

      expect(stateManager.hasError('collections')).toBe(true);
      expect(stateManager.getError('collections').retry).toBe(true);

      // User clicks retry
      stateManager.setLoading('collections', true);
      stateManager.transitionToSuccess('collections', true);

      expect(stateManager.hasError('collections')).toBe(false);
      expect(stateManager.shouldShowContent('collections')).toBe(true);
    });

    it('should handle quota error without retry', () => {
      stateManager.transitionToError('collections', new Error('QUOTA_EXCEEDED'));

      const error = stateManager.getError('collections');
      expect(error.retry).toBe(false);
      expect(error.suggestion).toContain('Delete old collections');
    });

    it('should handle not found error gracefully', () => {
      stateManager.transitionToError('collections', new Error('Collection not found'));

      const error = stateManager.getError('collections');
      expect(error.retry).toBe(false);
      expect(error.type).toBe('not_found');
    });
  });

  describe('Multiple View Independence', () => {
    it('should manage collections and tasks states independently', () => {
      stateManager.setLoading('collections', true);
      stateManager.transitionToError('tasks', new Error('Task error'));

      expect(stateManager.isLoading('collections')).toBe(true);
      expect(stateManager.hasError('tasks')).toBe(true);
      expect(stateManager.hasError('collections')).toBe(false);
      expect(stateManager.isLoading('tasks')).toBe(false);
    });

    it('should maintain separate scroll positions', () => {
      const collectionsView = document.getElementById('collections-view');
      const tasksView = document.getElementById('tasks-view');

      collectionsView.scrollTop = 100;
      stateManager.setActiveView('tasks');

      tasksView.scrollTop = 200;
      stateManager.setActiveView('collections');

      const state = stateManager.getState();
      expect(state.scrollPositions.collections).toBe(100);
      expect(state.scrollPositions.tasks).toBe(200);
    });
  });
});
