/**
 * Test for Issue #5: Custom debounce duration
 * Verifies that users can set a custom debounce duration for immediate triggers
 */

import { jest } from '@jest/globals';
import { createScheduler } from '../lib/scheduler.js';

describe('Issue #5: Custom Debounce Duration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should use default debounce duration when not specified', () => {
    const onTrigger = jest.fn();
    const scheduler = createScheduler({
      onTrigger,
      immediateDebounceMs: 2000
    });

    scheduler.scheduleImmediate('rule1');

    // Should not trigger immediately
    expect(onTrigger).not.toHaveBeenCalled();

    // Fast forward 1 second - should not trigger yet
    jest.advanceTimersByTime(1000);
    expect(onTrigger).not.toHaveBeenCalled();

    // Fast forward another 1 second (total 2s) - should trigger
    jest.advanceTimersByTime(1000);
    expect(onTrigger).toHaveBeenCalledWith({
      ruleId: 'rule1',
      type: 'immediate',
      timestamp: expect.any(Number)
    });
  });

  test('should use custom debounce duration when specified', () => {
    const onTrigger = jest.fn();
    const scheduler = createScheduler({
      onTrigger,
      immediateDebounceMs: 2000 // default
    });

    // Schedule with custom 5 second debounce (5000ms)
    scheduler.scheduleImmediate('rule2', 5000);

    // Should not trigger at 2 seconds (default)
    jest.advanceTimersByTime(2000);
    expect(onTrigger).not.toHaveBeenCalled();

    // Should not trigger at 4 seconds
    jest.advanceTimersByTime(2000);
    expect(onTrigger).not.toHaveBeenCalled();

    // Should trigger at 5 seconds (custom duration)
    jest.advanceTimersByTime(1000);
    expect(onTrigger).toHaveBeenCalledWith({
      ruleId: 'rule2',
      type: 'immediate',
      timestamp: expect.any(Number)
    });
  });

  test('should use custom debounce duration shorter than default', () => {
    const onTrigger = jest.fn();
    const scheduler = createScheduler({
      onTrigger,
      immediateDebounceMs: 2000 // default
    });

    // Schedule with custom 500ms debounce (0.5 seconds)
    scheduler.scheduleImmediate('rule3', 500);

    // Should trigger after 500ms
    jest.advanceTimersByTime(500);
    expect(onTrigger).toHaveBeenCalledWith({
      ruleId: 'rule3',
      type: 'immediate',
      timestamp: expect.any(Number)
    });
  });

  test('should support fractional seconds (100ms)', () => {
    const onTrigger = jest.fn();
    const scheduler = createScheduler({ onTrigger });

    // 0.1 seconds = 100ms
    scheduler.scheduleImmediate('rule4', 100);

    jest.advanceTimersByTime(100);
    expect(onTrigger).toHaveBeenCalled();
  });

  test('should debounce multiple triggers with custom duration', () => {
    const onTrigger = jest.fn();
    const scheduler = createScheduler({ onTrigger });

    // Schedule with 3 second custom debounce
    scheduler.scheduleImmediate('rule5', 3000);

    // Trigger again before first one fires
    jest.advanceTimersByTime(1000);
    scheduler.scheduleImmediate('rule5', 3000);

    // Trigger again
    jest.advanceTimersByTime(1000);
    scheduler.scheduleImmediate('rule5', 3000);

    // Should only trigger once after the last schedule + 3s
    jest.advanceTimersByTime(3000);
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  test('should handle null custom duration (use default)', () => {
    const onTrigger = jest.fn();
    const scheduler = createScheduler({
      onTrigger,
      immediateDebounceMs: 1500
    });

    // Pass null to use default
    scheduler.scheduleImmediate('rule6', null);

    // Should use default (1500ms)
    jest.advanceTimersByTime(1500);
    expect(onTrigger).toHaveBeenCalled();
  });
});