/**
 * Unit tests for listener utility functions
 * Tests the safeAsyncListener wrapper for Chrome API event handlers
 */

import { jest, describe, it, expect } from '@jest/globals';
import { safeAsyncListener, isAsyncFunction } from '../services/utils/listeners.js';

describe('safeAsyncListener', () => {
  describe('basic functionality', () => {
    it('should wrap an async function and execute it', async () => {
      let executed = false;
      const handler = async () => {
        executed = true;
      };

      const wrapped = safeAsyncListener(handler);
      wrapped();

      // Give async execution time to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(executed).toBe(true);
    });

    it('should not return a Promise', () => {
      const handler = async () => {
        await Promise.resolve();
      };

      const wrapped = safeAsyncListener(handler);
      const result = wrapped();

      expect(result).toBeUndefined();
      expect(result).not.toBeInstanceOf(Promise);
    });

    it('should pass arguments to the handler', async () => {
      let receivedArgs = null;
      const handler = async (...args) => {
        receivedArgs = args;
      };

      const wrapped = safeAsyncListener(handler);
      wrapped('arg1', 'arg2', 123);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(receivedArgs).toEqual(['arg1', 'arg2', 123]);
    });
  });

  describe('error handling', () => {
    it('should catch and log errors by default', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('Test error');
      const handler = async () => {
        throw error;
      };

      const wrapped = safeAsyncListener(handler);
      wrapped();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Listener error:',
        error,
        expect.objectContaining({
          handlerName: expect.any(String),
          argsCount: 0,
          timestamp: expect.any(Number)
        })
      );

      consoleErrorSpy.mockRestore();
    });

    it('should call custom error handler when provided', async () => {
      const customHandler = jest.fn();
      const error = new Error('Test error');
      const handler = async () => {
        throw error;
      };

      const wrapped = safeAsyncListener(handler, {
        errorHandler: customHandler
      });
      wrapped();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(customHandler).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          handlerName: expect.any(String),
          argsCount: 0,
          timestamp: expect.any(Number)
        })
      );
    });

    it('should not log errors when logErrors is false', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const handler = async () => {
        throw new Error('Test error');
      };

      const wrapped = safeAsyncListener(handler, { logErrors: false });
      wrapped();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Should still log if custom error handler throws
      // But not the original error
      const logCalls = consoleErrorSpy.mock.calls.filter(
        call => call[0] === 'Listener error:'
      );
      expect(logCalls.length).toBe(0);

      consoleErrorSpy.mockRestore();
    });

    it('should handle errors in custom error handler', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const handler = async () => {
        throw new Error('Handler error');
      };
      const errorHandler = () => {
        throw new Error('Error handler error');
      };

      const wrapped = safeAsyncListener(handler, { errorHandler });
      wrapped();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Should log both the original error and the error handler error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Listener error:',
        expect.any(Error),
        expect.any(Object)
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in custom error handler:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('double-wrap protection', () => {
    it('should detect already wrapped functions', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const handler = async () => {};

      const wrapped1 = safeAsyncListener(handler);
      const wrapped2 = safeAsyncListener(wrapped1);

      expect(wrapped1).toBe(wrapped2);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Handler already wrapped with safeAsyncListener - skipping double-wrap'
      );

      consoleWarnSpy.mockRestore();
    });

    it('should mark wrapped functions with __safeWrapped', () => {
      const handler = async () => {};
      const wrapped = safeAsyncListener(handler);

      expect(wrapped.__safeWrapped).toBe(true);
    });
  });

  describe('context information', () => {
    it('should include handler name in error context', async () => {
      const customHandler = jest.fn();
      async function namedHandler() {
        throw new Error('Test');
      }

      const wrapped = safeAsyncListener(namedHandler, {
        errorHandler: customHandler
      });
      wrapped();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(customHandler).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          handlerName: 'namedHandler'
        })
      );
    });

    it('should use "anonymous" for unnamed handlers', async () => {
      const customHandler = jest.fn();

      // Pass arrow function directly (not assigned to variable) to test truly anonymous
      const wrapped = safeAsyncListener(async () => {
        throw new Error('Test');
      }, {
        errorHandler: customHandler
      });
      wrapped();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(customHandler).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          handlerName: 'anonymous'
        })
      );
    });

    it('should include argument count in error context', async () => {
      const customHandler = jest.fn();
      const handler = async () => {
        throw new Error('Test');
      };

      const wrapped = safeAsyncListener(handler, {
        errorHandler: customHandler
      });
      wrapped('arg1', 'arg2', 'arg3');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(customHandler).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          argsCount: 3
        })
      );
    });
  });
});

describe('isAsyncFunction', () => {
  it('should return true for async functions', () => {
    const asyncFn = async () => {};
    expect(isAsyncFunction(asyncFn)).toBe(true);
  });

  it('should return false for regular functions', () => {
    const regularFn = () => {};
    expect(isAsyncFunction(regularFn)).toBe(false);
  });

  it('should return false for non-functions', () => {
    expect(isAsyncFunction(null)).toBe(false);
    expect(isAsyncFunction(undefined)).toBe(false);
    expect(isAsyncFunction({})).toBe(false);
    expect(isAsyncFunction('function')).toBe(false);
    expect(isAsyncFunction(123)).toBe(false);
  });

  it('should handle functions with no constructor', () => {
    const obj = Object.create(null);
    expect(isAsyncFunction(obj)).toBe(false);
  });
});
