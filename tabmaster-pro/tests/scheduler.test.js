// Tests for the Scheduler module

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createScheduler } from '../lib/scheduler.js';

// Set up timer mocking globally for this file
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Scheduler - Core Functionality', () => {
  let scheduler;
  let onTrigger;
  
  beforeEach(() => {
    jest.clearAllTimers();
    onTrigger = jest.fn();
    scheduler = createScheduler({ onTrigger });
  });
  
  afterEach(() => {
    scheduler.stopAll();
  });
  
  test('should create scheduler instance', () => {
    expect(scheduler).toBeDefined();
    expect(scheduler.scheduleImmediate).toBeDefined();
    expect(scheduler.scheduleRepeat).toBeDefined();
    expect(scheduler.scheduleOnce).toBeDefined();
  });
  
  test('should parse duration strings', () => {
    expect(scheduler.parseDuration('30m')).toBe(30 * 60 * 1000);
    expect(scheduler.parseDuration('1h')).toBe(60 * 60 * 1000);
    expect(scheduler.parseDuration('2d')).toBe(2 * 24 * 60 * 60 * 1000);
    expect(scheduler.parseDuration(5000)).toBe(5000);
    expect(scheduler.parseDuration('invalid')).toBe(0);
  });
});

describe('Scheduler - Immediate Triggers', () => {
  let scheduler;
  let onTrigger;
  
  beforeEach(() => {
    jest.clearAllTimers();
    onTrigger = jest.fn();
    scheduler = createScheduler({ 
      onTrigger,
      immediateDebounceMs: 1000 
    });
  });
  
  afterEach(() => {
    scheduler.stopAll();
  });
  
  test('should trigger after debounce delay', () => {
    scheduler.scheduleImmediate('rule1');
    
    expect(onTrigger).not.toHaveBeenCalled();
    
    jest.advanceTimersByTime(999);
    expect(onTrigger).not.toHaveBeenCalled();
    
    jest.advanceTimersByTime(1);
    expect(onTrigger).toHaveBeenCalledWith({
      ruleId: 'rule1',
      type: 'immediate',
      timestamp: expect.any(Number)
    });
  });
  
  test('should debounce multiple immediate triggers', () => {
    scheduler.scheduleImmediate('rule1');
    jest.advanceTimersByTime(500);
    
    scheduler.scheduleImmediate('rule1');
    jest.advanceTimersByTime(500);
    
    scheduler.scheduleImmediate('rule1');
    jest.advanceTimersByTime(1000);
    
    // Should only trigger once
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });
  
  test('should handle multiple rules independently', () => {
    scheduler.scheduleImmediate('rule1');
    scheduler.scheduleImmediate('rule2');
    
    jest.advanceTimersByTime(1000);
    
    expect(onTrigger).toHaveBeenCalledTimes(2);
    expect(onTrigger).toHaveBeenCalledWith(expect.objectContaining({ ruleId: 'rule1' }));
    expect(onTrigger).toHaveBeenCalledWith(expect.objectContaining({ ruleId: 'rule2' }));
  });
  
  test('should cancel immediate trigger', () => {
    scheduler.scheduleImmediate('rule1');
    scheduler.cancelImmediate('rule1');
    
    jest.advanceTimersByTime(2000);
    
    expect(onTrigger).not.toHaveBeenCalled();
  });
});

describe('Scheduler - Repeat Triggers', () => {
  let scheduler;
  let onTrigger;
  
  beforeEach(() => {
    jest.clearAllTimers();
    onTrigger = jest.fn();
    scheduler = createScheduler({ onTrigger });
  });
  
  afterEach(() => {
    scheduler.stopAll();
  });
  
  test('should trigger immediately and then repeat', async () => {
    await scheduler.scheduleRepeat('rule1', '30m');
    
    // Should trigger immediately
    expect(onTrigger).toHaveBeenCalledTimes(1);
    expect(onTrigger).toHaveBeenCalledWith({
      ruleId: 'rule1',
      type: 'repeat',
      timestamp: expect.any(Number)
    });
    
    // Advance 30 minutes
    jest.advanceTimersByTime(30 * 60 * 1000);
    expect(onTrigger).toHaveBeenCalledTimes(2);
    
    // Advance another 30 minutes
    jest.advanceTimersByTime(30 * 60 * 1000);
    expect(onTrigger).toHaveBeenCalledTimes(3);
  });
  
  test('should cancel and restart repeat trigger', async () => {
    await scheduler.scheduleRepeat('rule1', '1h');
    expect(onTrigger).toHaveBeenCalledTimes(1);
    
    jest.advanceTimersByTime(30 * 60 * 1000); // 30 minutes
    
    // Restart with new interval
    await scheduler.scheduleRepeat('rule1', '15m');
    expect(onTrigger).toHaveBeenCalledTimes(2); // Immediate trigger
    
    jest.advanceTimersByTime(15 * 60 * 1000);
    expect(onTrigger).toHaveBeenCalledTimes(3);
  });
  
  test('should cancel repeat trigger', async () => {
    await scheduler.scheduleRepeat('rule1', '10m');
    expect(onTrigger).toHaveBeenCalledTimes(1);
    
    await scheduler.cancelRepeat('rule1');
    
    jest.advanceTimersByTime(60 * 60 * 1000); // 1 hour
    expect(onTrigger).toHaveBeenCalledTimes(1); // Only initial trigger
  });
});

describe('Scheduler - Once Triggers', () => {
  let scheduler;
  let onTrigger;
  let mockStorage;
  
  beforeEach(() => {
    jest.clearAllTimers();
    onTrigger = jest.fn();
    mockStorage = {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined)
    };
    scheduler = createScheduler({ onTrigger, storage: mockStorage });
  });
  
  afterEach(() => {
    scheduler.stopAll();
  });
  
  test('should trigger once at specified time', async () => {
    await scheduler.scheduleOnce('rule1', 5000);
    
    expect(onTrigger).not.toHaveBeenCalled();
    
    jest.advanceTimersByTime(4999);
    expect(onTrigger).not.toHaveBeenCalled();
    
    jest.advanceTimersByTime(1);
    expect(onTrigger).toHaveBeenCalledWith({
      ruleId: 'rule1',
      type: 'once',
      timestamp: expect.any(Number)
    });
    
    // Should not trigger again
    jest.advanceTimersByTime(5000);
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });
  
  test('should trigger immediately if time is in the past', async () => {
    const pastDate = new Date(Date.now() - 1000);
    await scheduler.scheduleOnce('rule1', pastDate);
    
    expect(onTrigger).toHaveBeenCalledWith({
      ruleId: 'rule1',
      type: 'once',
      timestamp: expect.any(Number)
    });
  });
  
  test('should handle ISO date strings', async () => {
    const futureDate = new Date(Date.now() + 10000);
    await scheduler.scheduleOnce('rule1', futureDate.toISOString());
    
    jest.advanceTimersByTime(10000);
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });
  
  test('should save trigger to storage', async () => {
    const triggerTime = Date.now() + 10000;
    await scheduler.scheduleOnce('rule1', triggerTime - Date.now());
    
    expect(mockStorage.set).toHaveBeenCalledWith({
      scheduledTriggers: [
        { ruleId: 'rule1', time: triggerTime, type: 'once' }
      ]
    });
  });
  
  test('should cancel once trigger', async () => {
    await scheduler.scheduleOnce('rule1', 5000);
    scheduler.cancelOnce('rule1');
    
    jest.advanceTimersByTime(10000);
    expect(onTrigger).not.toHaveBeenCalled();
  });
});

describe('Scheduler - Persistence', () => {
  test('should restore saved triggers on init', async () => {
    const onTrigger = jest.fn();
    const now = Date.now();
    const futureTime = now + 10000;
    const pastTime = now - 1000;
    
    const mockStorage = {
      get: jest.fn().mockResolvedValue({
        scheduledTriggers: [
          { ruleId: 'rule1', time: futureTime },
          { ruleId: 'rule2', time: pastTime }
        ]
      }),
      set: jest.fn().mockResolvedValue(undefined)
    };
    
    const scheduler = createScheduler({ onTrigger, storage: mockStorage });
    await scheduler.init();
    
    // Past trigger should fire immediately after a tick
    await Promise.resolve();
    jest.runOnlyPendingTimers();
    
    expect(onTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: 'rule2', type: 'once' })
    );
    
    // Future trigger should be rescheduled
    jest.advanceTimersByTime(10000);
    expect(onTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: 'rule1', type: 'once' })
    );
    
    expect(onTrigger).toHaveBeenCalledTimes(2);
  });
});

describe('Scheduler - Rule Setup', () => {
  let scheduler;
  let onTrigger;
  
  beforeEach(() => {
    jest.clearAllTimers();
    onTrigger = jest.fn();
    scheduler = createScheduler({ onTrigger });
  });
  
  afterEach(() => {
    scheduler.stopAll();
  });
  
  test('should setup repeat trigger from rule', async () => {
    const rule = {
      id: 'test-rule',
      enabled: true,
      trigger: { repeat_every: '1h' }
    };
    
    await scheduler.setupRule(rule);
    
    expect(onTrigger).toHaveBeenCalledTimes(1); // Immediate trigger
    
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(onTrigger).toHaveBeenCalledTimes(2);
  });
  
  test('should setup once trigger from rule', async () => {
    const futureTime = new Date(Date.now() + 5000).toISOString();
    const rule = {
      id: 'test-rule',
      enabled: true,
      trigger: { once_at: futureTime }
    };
    
    scheduler.setupRule(rule);
    
    // Wait for promise to resolve
    await Promise.resolve();
    
    jest.advanceTimersByTime(5000);
    expect(onTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: 'test-rule', type: 'once' })
    );
  });
  
  test('should not setup triggers for disabled rules', () => {
    const rule = {
      id: 'test-rule',
      enabled: false,
      trigger: { repeat_every: '1h' }
    };
    
    scheduler.setupRule(rule);
    
    jest.advanceTimersByTime(2 * 60 * 60 * 1000);
    expect(onTrigger).not.toHaveBeenCalled();
  });
  
  test('should ignore manual triggers in setup', () => {
    const rule = {
      id: 'test-rule',
      enabled: true,
      trigger: { on_action: true }
    };
    
    scheduler.setupRule(rule);
    
    jest.advanceTimersByTime(10000);
    expect(onTrigger).not.toHaveBeenCalled();
  });
});

describe('Scheduler - Status and Control', () => {
  let scheduler;
  let onTrigger;
  
  beforeEach(() => {
    jest.clearAllTimers();
    onTrigger = jest.fn();
    scheduler = createScheduler({ onTrigger });
  });
  
  afterEach(() => {
    scheduler.stopAll();
  });
  
  test('should report status of active triggers', async () => {
    // Create scheduler with mock storage
    const mockStorage = {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined)
    };
    const testScheduler = createScheduler({ onTrigger, storage: mockStorage });
    
    testScheduler.scheduleImmediate('rule1');
    testScheduler.scheduleRepeat('rule2', '30m');
    await testScheduler.scheduleOnce('rule3', 10000);
    
    const status = testScheduler.getStatus();
    
    expect(status.immediate).toContain('rule1');
    expect(status.repeat).toContain('rule2');
    expect(status.once).toContain('rule3');
    
    // Cleanup
    testScheduler.stopAll();
  });
  
  test('should cancel all triggers for a rule', async () => {
    scheduler.scheduleImmediate('rule1');
    scheduler.scheduleRepeat('rule1', '30m');
    await scheduler.scheduleOnce('rule1', 10000);
    
    scheduler.cancelAll('rule1');
    
    jest.advanceTimersByTime(60 * 60 * 1000);
    // Only the initial repeat trigger should have fired
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });
  
  test('should stop all triggers', async () => {
    scheduler.scheduleImmediate('rule1');
    scheduler.scheduleImmediate('rule2');
    await scheduler.scheduleRepeat('rule3', '10m');
    await scheduler.scheduleRepeat('rule4', '20m');
    
    scheduler.stopAll();
    
    jest.advanceTimersByTime(60 * 60 * 1000);
    // Only initial repeat triggers should have fired
    expect(onTrigger).toHaveBeenCalledTimes(2);
  });
  
  test('should remove rule and cancel its triggers', async () => {
    await scheduler.scheduleRepeat('rule1', '10m');
    expect(onTrigger).toHaveBeenCalledTimes(1);
    
    await scheduler.removeRule('rule1');
    
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(onTrigger).toHaveBeenCalledTimes(1); // Only initial
  });
});