// Scheduler - Manages rule triggers (immediate, repeat, once)
// Handles debouncing, intervals, and one-time scheduling

/**
 * Creates a scheduler instance for managing rule triggers
 * @param {object} options - Scheduler options
 * @returns {object} Scheduler instance with methods
 */
export function createScheduler(options = {}) {
  const {
    onTrigger = () => {},
    immediateDebounceMs = 2000,
    storage = null,
    chrome = null
  } = options;
  
  // Active timers and intervals
  const timers = new Map(); // ruleId -> timeoutId
  const intervals = new Map(); // ruleId -> intervalId
  const debounceTimers = new Map(); // ruleId -> timeoutId
  
  // Scheduled "once" triggers
  let scheduledTriggers = [];
  
  /**
   * Initialize scheduler and restore saved triggers
   */
  async function init() {
    if (storage) {
      const data = await storage.get('scheduledTriggers');
      scheduledTriggers = data?.scheduledTriggers || [];
      
      // Reschedule any pending "once" triggers
      const now = Date.now();
      for (const trigger of scheduledTriggers) {
        if (trigger.time > now) {
          scheduleOnce(trigger.ruleId, trigger.time - now);
        } else {
          // Trigger immediately if past due
          setTimeout(() => handleTrigger(trigger.ruleId, 'once'), 0);
          removeSavedTrigger(trigger.ruleId);
        }
      }
    }
  }
  
  /**
   * Handle a rule trigger
   * @param {string} ruleId - ID of the rule to trigger
   * @param {string} type - Type of trigger (immediate, repeat, once)
   */
  function handleTrigger(ruleId, type) {
    onTrigger({ ruleId, type, timestamp: Date.now() });
  }
  
  /**
   * Schedule an immediate trigger with debouncing
   * @param {string} ruleId - Rule ID
   */
  function scheduleImmediate(ruleId) {
    // Cancel any existing debounce timer
    if (debounceTimers.has(ruleId)) {
      clearTimeout(debounceTimers.get(ruleId));
    }

    // Set new debounce timer
    const timerId = setTimeout(() => {
      debounceTimers.delete(ruleId);
      handleTrigger(ruleId, 'immediate');
    }, immediateDebounceMs);

    debounceTimers.set(ruleId, timerId);
  }
  
  /**
   * Schedule a repeating trigger
   * @param {string} ruleId - Rule ID
   * @param {string|number} interval - Interval like '30m', '1h', '2d' or ms
   */
  function scheduleRepeat(ruleId, interval) {
    console.log(`scheduleRepeat called for rule ${ruleId} with interval ${interval}`);
    // Cancel existing interval if any
    cancelRepeat(ruleId);

    const ms = parseDuration(interval);
    console.log(`Parsed interval ${interval} to ${ms}ms`);
    if (ms <= 0) {
      console.warn(`Invalid interval ${interval} parsed to ${ms}ms`);
      return;
    }

    // Trigger immediately on start
    console.log(`Triggering rule ${ruleId} immediately (repeat)`);
    handleTrigger(ruleId, 'repeat');

    // Set up interval
    const intervalId = setInterval(() => {
      console.log(`Interval trigger for rule ${ruleId} (repeat)`);
      handleTrigger(ruleId, 'repeat');
    }, ms);

    intervals.set(ruleId, intervalId);
    console.log(`Scheduled repeat trigger for rule ${ruleId} every ${ms}ms`);
  }
  
  /**
   * Schedule a one-time trigger
   * @param {string} ruleId - Rule ID
   * @param {string|number|Date} when - ISO date, ms delay, or Date object
   */
  async function scheduleOnce(ruleId, when) {
    // Cancel existing timer if any
    cancelOnce(ruleId);
    
    let delay;
    let triggerTime;
    
    if (typeof when === 'string') {
      // ISO date string
      triggerTime = new Date(when).getTime();
      delay = triggerTime - Date.now();
    } else if (when instanceof Date) {
      triggerTime = when.getTime();
      delay = triggerTime - Date.now();
    } else {
      // Direct delay in ms
      delay = when;
      triggerTime = Date.now() + delay;
    }
    
    if (delay <= 0) {
      // Trigger immediately if in the past
      handleTrigger(ruleId, 'once');
      return;
    }
    
    // Save to storage for persistence
    await saveTrigger(ruleId, triggerTime);
    
    // Schedule the trigger
    const timerId = setTimeout(() => {
      timers.delete(ruleId);
      handleTrigger(ruleId, 'once');
      removeSavedTrigger(ruleId);
    }, delay);
    
    timers.set(ruleId, timerId);
  }
  
  /**
   * Cancel an immediate trigger
   * @param {string} ruleId - Rule ID
   */
  function cancelImmediate(ruleId) {
    if (debounceTimers.has(ruleId)) {
      clearTimeout(debounceTimers.get(ruleId));
      debounceTimers.delete(ruleId);
    }
  }
  
  /**
   * Cancel a repeating trigger
   * @param {string} ruleId - Rule ID
   */
  function cancelRepeat(ruleId) {
    if (intervals.has(ruleId)) {
      clearInterval(intervals.get(ruleId));
      intervals.delete(ruleId);
    }
  }
  
  /**
   * Cancel a one-time trigger
   * @param {string} ruleId - Rule ID
   */
  function cancelOnce(ruleId) {
    if (timers.has(ruleId)) {
      clearTimeout(timers.get(ruleId));
      timers.delete(ruleId);
    }
    removeSavedTrigger(ruleId);
  }
  
  /**
   * Cancel all triggers for a rule
   * @param {string} ruleId - Rule ID
   */
  function cancelAll(ruleId) {
    cancelImmediate(ruleId);
    cancelRepeat(ruleId);
    cancelOnce(ruleId);
  }
  
  /**
   * Stop all scheduled triggers
   */
  function stopAll() {
    // Clear all debounce timers
    for (const timerId of debounceTimers.values()) {
      clearTimeout(timerId);
    }
    debounceTimers.clear();
    
    // Clear all intervals
    for (const intervalId of intervals.values()) {
      clearInterval(intervalId);
    }
    intervals.clear();
    
    // Clear all one-time timers
    for (const timerId of timers.values()) {
      clearTimeout(timerId);
    }
    timers.clear();
  }
  
  /**
   * Get status of all active triggers
   * @returns {object} Status of all triggers
   */
  function getStatus() {
    return {
      immediate: Array.from(debounceTimers.keys()),
      repeat: Array.from(intervals.keys()),
      once: Array.from(timers.keys()),
      scheduled: [...scheduledTriggers]
    };
  }
  
  /**
   * Save a trigger to storage
   * @param {string} ruleId - Rule ID
   * @param {number} time - Trigger time in ms
   */
  async function saveTrigger(ruleId, time) {
    if (!storage) return;

    // Remove any existing trigger for this rule
    scheduledTriggers = scheduledTriggers.filter(t => t.ruleId !== ruleId);

    // Add new trigger with type
    scheduledTriggers.push({ ruleId, time, type: 'once' });

    await storage.set({ scheduledTriggers });
  }
  
  /**
   * Remove a saved trigger
   * @param {string} ruleId - Rule ID
   */
  async function removeSavedTrigger(ruleId) {
    if (!storage) return;
    
    scheduledTriggers = scheduledTriggers.filter(t => t.ruleId !== ruleId);
    await storage.set({ scheduledTriggers });
  }
  
  /**
   * Parse duration string to milliseconds
   * @param {string|number} duration - Duration like '30m', '1h', '2d' or ms
   * @returns {number} Duration in milliseconds
   */
  function parseDuration(duration) {
    if (typeof duration === 'number') return duration;
    if (typeof duration !== 'string') return 0;

    const units = {
      s: 1000,           // seconds
      m: 60 * 1000,      // minutes
      h: 60 * 60 * 1000, // hours
      d: 24 * 60 * 60 * 1000 // days
    };

    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 0;

    const [, num, unit] = match;
    return parseInt(num) * units[unit];
  }
  
  /**
   * Setup rule triggers based on rule configuration
   * @param {object} rule - Rule with trigger configuration
   * @returns {Promise<void>}
   */
  async function setupRule(rule) {
    console.log(`setupRule called for rule ${rule.name} (${rule.id}), enabled: ${rule.enabled}, trigger:`, rule.trigger);
    if (!rule.enabled || !rule.trigger) {
      console.log(`Rule ${rule.name} is disabled or has no trigger, skipping setup`);
      return;
    }

    const { trigger } = rule;

    if (trigger.immediate || trigger.type === 'immediate') {
      // Will be triggered by tab events
      // No setup needed here
      console.log(`Rule ${rule.name} has immediate trigger`);
    }

    if (trigger.on_action) {
      // Manual trigger, no setup needed
      console.log(`Rule ${rule.name} has manual trigger`);
    }

    // Handle both repeat_every and repeat formats
    if (trigger.repeat_every || trigger.repeat) {
      console.log(`Setting up repeat trigger for rule ${rule.name}: ${trigger.repeat_every || trigger.repeat}`);
      scheduleRepeat(rule.id, trigger.repeat_every || trigger.repeat);
    }

    // Handle both once_at and once formats
    if (trigger.once_at || trigger.once) {
      // Await to ensure scheduledTriggers is populated
      console.log(`Setting up once trigger for rule ${rule.name}: ${trigger.once_at || trigger.once}`);
      await scheduleOnce(rule.id, trigger.once_at || trigger.once);
    }
  }
  
  /**
   * Remove all triggers for a rule
   * @param {string} ruleId - Rule ID
   */
  function removeRule(ruleId) {
    cancelAll(ruleId);
  }
  
  return {
    init,
    scheduleImmediate,
    scheduleRepeat,
    scheduleOnce,
    cancelImmediate,
    cancelRepeat,
    cancelOnce,
    cancelAll,
    stopAll,
    getStatus,
    getScheduledTriggers: () => [...scheduledTriggers],
    setupRule,
    removeRule,
    parseDuration
  };
}

/**
 * Create a scheduler for Chrome extension context
 * @param {object} chrome - Chrome API object
 * @param {function} onTrigger - Callback for triggers
 * @returns {object} Scheduler instance
 */
export function createChromeScheduler(chrome, onTrigger) {
  return createScheduler({
    onTrigger,
    storage: chrome?.storage?.local,
    chrome
  });
}