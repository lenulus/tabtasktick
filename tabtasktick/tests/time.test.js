import { parseDuration } from '../lib/utils/time.js';

describe('parseDuration', () => {
  describe('valid duration strings', () => {
    test('parses minutes correctly', () => {
      expect(parseDuration('1m')).toBe(60 * 1000);
      expect(parseDuration('30m')).toBe(30 * 60 * 1000);
      expect(parseDuration('60m')).toBe(60 * 60 * 1000);
    });

    test('parses hours correctly', () => {
      expect(parseDuration('1h')).toBe(60 * 60 * 1000);
      expect(parseDuration('2h')).toBe(2 * 60 * 60 * 1000);
      expect(parseDuration('24h')).toBe(24 * 60 * 60 * 1000);
    });

    test('parses days correctly', () => {
      expect(parseDuration('1d')).toBe(24 * 60 * 60 * 1000);
      expect(parseDuration('2d')).toBe(2 * 24 * 60 * 60 * 1000);
      expect(parseDuration('7d')).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  describe('number pass-through', () => {
    test('returns numbers unchanged', () => {
      expect(parseDuration(1000)).toBe(1000);
      expect(parseDuration(60000)).toBe(60000);
      expect(parseDuration(0)).toBe(0);
    });
  });

  describe('invalid inputs', () => {
    test('returns 0 for invalid strings', () => {
      expect(parseDuration('invalid')).toBe(0);
      expect(parseDuration('1x')).toBe(0);
      expect(parseDuration('abc')).toBe(0);
      expect(parseDuration('')).toBe(0);
    });

    test('returns 0 for malformed duration strings', () => {
      expect(parseDuration('m')).toBe(0);
      expect(parseDuration('h')).toBe(0);
      expect(parseDuration('d')).toBe(0);
      expect(parseDuration('1')).toBe(0);
      expect(parseDuration('1 h')).toBe(0); // space not allowed
      expect(parseDuration('1.5h')).toBe(0); // decimals not supported
    });

    test('returns 0 for non-string, non-number types', () => {
      expect(parseDuration(null)).toBe(0);
      expect(parseDuration(undefined)).toBe(0);
      expect(parseDuration({})).toBe(0);
      expect(parseDuration([])).toBe(0);
      expect(parseDuration(true)).toBe(0);
    });
  });

  describe('edge cases', () => {
    test('handles zero values', () => {
      expect(parseDuration('0m')).toBe(0);
      expect(parseDuration('0h')).toBe(0);
      expect(parseDuration('0d')).toBe(0);
    });

    test('handles large values', () => {
      expect(parseDuration('999m')).toBe(999 * 60 * 1000);
      expect(parseDuration('999h')).toBe(999 * 60 * 60 * 1000);
      expect(parseDuration('365d')).toBe(365 * 24 * 60 * 60 * 1000);
    });
  });

  describe('common use cases', () => {
    test('typical snooze durations', () => {
      expect(parseDuration('15m')).toBe(15 * 60 * 1000);
      expect(parseDuration('1h')).toBe(60 * 60 * 1000);
      expect(parseDuration('4h')).toBe(4 * 60 * 60 * 1000);
      expect(parseDuration('1d')).toBe(24 * 60 * 60 * 1000);
    });
  });
});
