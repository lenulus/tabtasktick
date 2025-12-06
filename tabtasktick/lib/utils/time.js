// Time Utilities
// Extracted from engine.v2.services.js (Phase 6.1.1)

/**
 * Parse duration string into milliseconds
 * @param {string|number} duration - Duration string (e.g., '1h', '30m', '2d') or number in ms
 * @returns {number} Duration in milliseconds
 *
 * Supported formats:
 * - '1h' -> 3600000 (1 hour)
 * - '30m' -> 1800000 (30 minutes)
 * - '2d' -> 172800000 (2 days)
 * - 1000 -> 1000 (pass-through for numbers)
 */
export function parseDuration(duration) {
  // Pass through numbers
  if (typeof duration === 'number') return duration;

  // Return 0 for invalid input
  if (typeof duration !== 'string') return 0;

  // Define time unit multipliers
  const units = {
    m: 60 * 1000,           // minutes
    h: 60 * 60 * 1000,      // hours
    d: 24 * 60 * 60 * 1000  // days
  };

  // Match pattern: number followed by unit (m, h, or d)
  const match = duration.match(/^(\d+)([mhd])$/);
  if (!match) return 0;

  const [, num, unit] = match;
  return parseInt(num) * units[unit];
}
