// Background Service Worker for TabMaster Pro
// Integrated with new Rules Engine 2.0 (engine.js + scheduler.js)

// Import all engine versions
import * as engineV1 from './lib/engine.js';
import * as engineV2Services from './lib/engine.v2.services.js';
// Command pattern engines would need their dependencies fixed first
// import * as engineV2CommandFull from './lib/engine.v2.command.full.js';
// import * as engineV2CommandCompact from './lib/engine.v2.command.compact.js';

import { createChromeScheduler } from './lib/scheduler.js';
import { checkIsDupe } from './lib/predicate.js';
import { GroupingScope, groupTabsByDomain as groupTabsByDomainService, getCurrentWindowId } from './services/TabGrouping.js';

console.log('Background service worker loaded with Rules Engine 2.0');

// Engine selector
const engines = {
  'v1': engineV1,
  'v2-services': engineV2Services,
  // 'v2-command-full': engineV2CommandFull,
  // 'v2-command-compact': engineV2CommandCompact
};

// Get the active engine's functions
function getEngine() {
  const engine = engines[state.testEngine] || engines['v1'];
  return {
    runRules: engine.runRules,
    previewRule: engine.previewRule || engine.previewRuleEngine,
    buildIndices: engine.buildIndices
  };
}

// ============================================================================
// Console Log Capturing for Debug
// ============================================================================

// Capture recent console logs for debugging
const recentLogs = [];
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn
};

// Override console methods to capture logs
console.log = function(...args) {
  recentLogs.push({ type: 'log', timestamp: Date.now(), message: args.join(' ') });
  if (recentLogs.length > 50) recentLogs.shift();
  originalConsole.log.apply(console, args);
};

console.error = function(...args) {
  recentLogs.push({ type: 'error', timestamp: Date.now(), message: args.join(' ') });
  if (recentLogs.length > 50) recentLogs.shift();
  originalConsole.error.apply(console, args);
};

console.warn = function(...args) {
  recentLogs.push({ type: 'warn', timestamp: Date.now(), message: args.join(' ') });
  if (recentLogs.length > 50) recentLogs.shift();
  originalConsole.warn.apply(console, args);
};

// ============================================================================
// State Management
// ============================================================================

const state = {
  rules: [],
  snoozedTabs: [],
  tabGroups: new Map(),
  activityLog: [], // Track recent activities
  testEngine: 'v1', // Track which engine to use for tests
  settings: {
    autoCloseEnabled: true,
    autoGroupEnabled: true,
    duplicateDetection: true,
    maxTabsWarning: 100,
    defaultSnoozeMinutes: 120,
    memoryThreshold: 80, // percentage
  },
  statistics: {
    tabsClosed: 0,
    tabsSnoozed: 0,
    tabsGrouped: 0,
    duplicatesRemoved: 0,
  }
};

// ============================================================================
// Rules Engine 2.0 Integration
// ============================================================================

// Scheduler trigger handler
async function onSchedulerTrigger(trigger) {
  console.log('Rule trigger fired:', trigger);
  console.log('Current rules in state:', state.rules.map(r => ({ id: r.id, name: r.name, enabled: r.enabled })));
  const rule = state.rules.find(r => r.id === trigger.ruleId);
  console.log('Found rule:', rule ? `${rule.name} (${rule.id})` : 'NOT FOUND');
  if (rule && rule.enabled) {
    // Check if we're in test mode
    const { testModeActive } = await chrome.storage.local.get('testModeActive');
    console.log('Test mode active:', testModeActive);
    await executeRule(rule.id, trigger.type, testModeActive || false);
  } else {
    console.warn(`Rule not found or disabled for trigger: ${trigger.ruleId}`);
  }
}

// Create scheduler instance
const scheduler = createChromeScheduler(chrome, onSchedulerTrigger);

// Initialize scheduler on startup
async function initializeScheduler() {
  await scheduler.init();
  
  // Setup all enabled rules
  for (const rule of state.rules) {
    if (rule.enabled) {
      await scheduler.setupRule(rule);
    }
  }
}

// ============================================================================
// Tab Time Tracking
// ============================================================================

// Track tab timestamps: tabId -> { created, lastActive, lastAccessed }
const tabTimeData = new Map();

// Store console logs for debugging
const consoleLogs = [];
const MAX_CONSOLE_LOGS = 500;

// Capture console logs
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = function(...args) {
  consoleLogs.push({
    type: 'log',
    timestamp: new Date().toLocaleTimeString(),
    message: args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ')
  });
  if (consoleLogs.length > MAX_CONSOLE_LOGS) {
    consoleLogs.shift();
  }
  originalLog.apply(console, args);
};

console.error = function(...args) {
  consoleLogs.push({
    type: 'error',
    timestamp: new Date().toLocaleTimeString(),
    message: args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ')
  });
  if (consoleLogs.length > MAX_CONSOLE_LOGS) {
    consoleLogs.shift();
  }
  originalError.apply(console, args);
};

console.warn = function(...args) {
  consoleLogs.push({
    type: 'warn',
    timestamp: new Date().toLocaleTimeString(),
    message: args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ')
  });
  if (consoleLogs.length > MAX_CONSOLE_LOGS) {
    consoleLogs.shift();
  }
  originalWarn.apply(console, args);
};

// Initialize time tracking for existing tabs on startup
async function initializeTabTimeTracking() {
  try {
    const tabs = await chrome.tabs.query({});
    const now = Date.now();
    
    tabs.forEach(tab => {
      tabTimeData.set(tab.id, {
        created: now - (5 * 60 * 1000), // Assume 5 minutes old for existing tabs
        lastActive: tab.active ? now : now - (10 * 60 * 1000),
        lastAccessed: now - (10 * 60 * 1000)
      });
    });
    
    console.log(`Initialized time tracking for ${tabs.length} tabs`);
  } catch (error) {
    console.error('Failed to initialize tab time tracking:', error);
  }
}

// ============================================================================
// Activity Tracking
// ============================================================================

// Track tab history for the activity chart
async function trackTabHistory(action) {
  const history = await chrome.storage.local.get(['tabHistory']);
  const tabHistory = history.tabHistory || [];

  // Add new entry
  tabHistory.push({
    action,
    timestamp: Date.now()
  });

  // Keep only last 30 days of history
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const recentHistory = tabHistory.filter(h => h.timestamp > thirtyDaysAgo);

  // Save back to storage
  await chrome.storage.local.set({ tabHistory: recentHistory });
}

function logActivity(action, details, source = 'manual') {
  const activity = {
    id: Date.now(),
    action,
    details,
    source, // 'manual', 'auto', 'rule'
    timestamp: Date.now(),
    icon: getActivityIcon(action),
    color: getActivityColor(action)
  };
  
  // Add to front of array (most recent first)
  state.activityLog.unshift(activity);
  
  // Keep only last 50 activities
  if (state.activityLog.length > 50) {
    state.activityLog = state.activityLog.slice(0, 50);
  }
  
  // Save to storage
  chrome.storage.local.set({ activityLog: state.activityLog });
}

function getActivityIcon(action) {
  const icons = {
    close: '🗑️',
    snooze: '⏰',
    group: '📁',
    bookmark: '🔖',
    rule: '⚡',
    import: '📥',
    export: '📤',
    suspend: '💤'
  };
  return icons[action] || '📌';
}

function getActivityColor(action) {
  const colors = {
    close: '#dc3545',
    snooze: '#fd7e14',
    group: '#0d6efd',
    bookmark: '#198754',
    rule: '#6f42c1',
    import: '#20c997',
    export: '#0dcaf0',
    suspend: '#6c757d'
  };
  return colors[action] || '#6c757d';
}

async function loadActivityLog() {
  const { activityLog } = await chrome.storage.local.get('activityLog');
  if (activityLog) {
    state.activityLog = activityLog;
  }
}

// ============================================================================
// Extension Lifecycle
// ============================================================================

chrome.runtime.onInstalled.addListener(async () => {
  console.log('TabMaster Pro installed');
  await loadDomainCategories();
  await initializeExtension();
  await setupContextMenus();
  await loadSettings();
  await loadRules();
  await loadActivityLog();
  await initializeTabTimeTracking();
  await initializeScheduler();
  await restoreSnoozedTabs();
  await checkAndMigrateTabs();
});

chrome.runtime.onStartup.addListener(async () => {
  await loadDomainCategories();
  await loadSettings();
  await loadRules();
  await loadActivityLog();
  await initializeTabTimeTracking();
  await initializeScheduler();
  await restoreSnoozedTabs();
  await startMonitoring();
});

async function initializeExtension() {
  // This function now primarily handles first-time setup
  const { rules } = await chrome.storage.local.get('rules');
  if (!rules) {
    // On first install, if no rules exist, initialize storage with an empty array
    state.rules = [];
    await chrome.storage.local.set({ rules: [] });
  } else {
    state.rules = rules;
  }

  // Initialize settings
  const { settings } = await chrome.storage.local.get('settings');
  if (settings) {
    state.settings = { ...state.settings, ...settings };
  }
}

// ============================================================================
// Rules Engine 2.0 Implementation
// ============================================================================

async function loadRules() {
  const { rules } = await chrome.storage.local.get('rules');
  if (rules) {
    state.rules = rules;
  } else {
    state.rules = [];
  }
}

async function loadSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  if (settings) {
    state.settings = { ...state.settings, ...settings };
  }
}

// Execute rules using the new engine
async function executeRule(ruleId, triggerType = 'manual', testMode = false) {
  const rule = state.rules.find(r => r.id === ruleId || r.id === String(ruleId) || r.name === ruleId);
  if (!rule) {
    console.error('executeRule - Rule not found:', ruleId);
    console.error('Available rules:', state.rules.map(r => ({ id: r.id, name: r.name, enabled: r.enabled })));
    return { success: false, error: 'Rule not found' };
  }

  // For automatic triggers (non-manual), check if rule is enabled
  // For manual execution (test button, run button), allow executing disabled rules
  if (triggerType !== 'manual' && !rule.enabled) {
    console.log(`Skipping disabled rule for automatic trigger: ${rule.name}`);
    return { success: false, error: 'Rule is disabled' };
  }
  
  console.log(`Executing rule: ${rule.name} (${triggerType})${testMode ? ' [TEST MODE]' : ''}`);
  console.log('Rule actions:', JSON.stringify(rule.then || rule.actions));
  
  // Track test mode executions
  if (testMode) {
    if (!state.testRuleExecutions) {
      state.testRuleExecutions = new Map();
    }
    // Track by both ID and name for flexibility
    const executions = state.testRuleExecutions.get(rule.id) || [];
    executions.push({
      timestamp: Date.now(),
      triggerType
    });
    state.testRuleExecutions.set(rule.id, executions);
    // Also track by name
    state.testRuleExecutions.set(rule.name, executions);
  }

  try {
    // Get current tabs and windows
    const tabs = await chrome.tabs.query({});
    const windows = await chrome.windows.getAll();
    
    // Enhance tabs with time data and categories
    tabs.forEach(tab => {
      const timeData = tabTimeData.get(tab.id);
      if (timeData) {
        tab.createdAt = timeData.created;
        tab.lastActivatedAt = timeData.lastActive;
        // Log for debugging test tabs with age
        if (testMode && timeData.created < Date.now() - 60 * 60 * 1000) {
          console.log(`Test tab ${tab.id} has age data:`, {
            url: tab.url,
            createdAt: tab.createdAt,
            age: Date.now() - tab.createdAt,
            ageHours: (Date.now() - tab.createdAt) / (1000 * 60 * 60)
          });
        }
      }
      // Prefer Chrome's lastAccessed over our tracked data
      tab.last_access = tab.lastAccessed || timeData?.lastAccessed || null;
      // Category will be assigned by engine.js using domain-categories.js data
    });
    
    // Get the current engine
    const { runRules, buildIndices } = getEngine();
    console.log(`Using engine: ${state.testEngine} for rule execution`);

    // Build indices to enhance tabs with dupeKeys and other fields
    const idx = buildIndices(tabs);

    // Build context for engine
    const context = {
      tabs,
      windows,
      chrome,
      idx
    };
    
    console.log('Running rule with dryRun=false');

    // Track performance for test mode
    const startTime = performance.now();

    // Run the single rule
    // For manual execution, force execution even if rule is disabled
    const results = await runRules([rule], context, {
      dryRun: false,
      skipPinned: rule.flags?.skipPinned !== false,
      forceExecution: triggerType === 'manual'
    });
    
    const executionTime = performance.now() - startTime;
    console.log('runRules results:', JSON.stringify(results, null, 2));
    
    // Update test metrics
    if (testMode) {
      if (!state.testMetrics) {
        state.testMetrics = { totalExecutions: 0, totalTime: 0, avgExecutionTime: 0 };
      }
      state.testMetrics.totalExecutions++;
      state.testMetrics.totalTime += executionTime;
      state.testMetrics.avgExecutionTime = state.testMetrics.totalTime / state.testMetrics.totalExecutions;
      
      // Track performance metrics for assertions
      if (!state.performanceMetrics) {
        state.performanceMetrics = {};
      }
      state.performanceMetrics[rule.name] = executionTime;
    }
    
    // Log activity
    const totalActions = results.totalActions || 0;
    if (totalActions > 0) {
      logActivity(
        'rule',
        `${rule.name}: ${totalActions} actions (${triggerType})`,
        triggerType === 'manual' ? 'manual' : 'auto'
      );
    }
    
    // Update statistics
    if (results.rules.length > 0) {
      const ruleResult = results.rules[0];
      for (const action of ruleResult.actions) {
        if (action.success) {
          switch (action.action) {
            case 'close':
              state.statistics.tabsClosed++;
              await trackTabHistory('closed');
              break;
            case 'snooze':
              state.statistics.tabsSnoozed++;
              await trackTabHistory('snoozed');
              break;
            case 'group':
              state.statistics.tabsGrouped++;
              await trackTabHistory('grouped');
              break;
            case 'bookmark':
              await trackTabHistory('bookmarked');
              break;
          }
        }
      }
      
      // Save statistics
      await chrome.storage.local.set({ statistics: state.statistics });
    }
    
    return {
      success: true,
      matchCount: results.totalMatches,
      actionCount: totalActions,
      errors: results.errors
    };
    
  } catch (error) {
    console.error('Error executing rule:', error);
    return { success: false, error: error.message };
  }
}

// Preview rule using the new engine
async function previewRule(ruleId) {
  const rule = state.rules.find(r => r.id === ruleId || r.id === String(ruleId));
  if (!rule) {
    console.error('Rule not found:', ruleId);
    return { error: 'Rule not found' };
  }

  try {
    // Get current tabs and windows
    const tabs = await chrome.tabs.query({});
    const windows = await chrome.windows.getAll();
    
    // Enhance tabs with time data
    tabs.forEach(tab => {
      const timeData = tabTimeData.get(tab.id);
      if (timeData) {
        tab.createdAt = timeData.created;
        tab.lastActivatedAt = timeData.lastActive;
      }
      // Prefer Chrome's lastAccessed over our tracked data
      tab.last_access = tab.lastAccessed || timeData?.lastAccessed || null;
      tab.category = getCategoryForDomain(tab.url);
    });
    
    // Get the current engine
    const { previewRule: previewRuleEngine, buildIndices } = getEngine();
    console.log(`Using engine: ${state.testEngine} for preview`);

    // Build indices to enhance tabs with dupeKeys and other fields
    const idx = buildIndices(tabs);

    // Build context
    const context = {
      tabs,
      windows,
      chrome,
      idx
    };

    // Use engine's preview function
    const preview = previewRuleEngine(rule, context, {
      skipPinned: rule.flags?.skipPinned !== false
    });
    
    // Transform to match frontend expectations
    const result = {
      success: true,
      affectedCount: preview.totalMatches || 0,
      affectedTabs: preview.matches || [],
      rule: preview.rule,
      // Also include the old format for backwards compatibility
      matchingTabs: preview.matches || []
    };
    
    return result;
    
  } catch (error) {
    console.error('Error previewing rule:', error);
    return { error: error.message };
  }
}

// Get statistics for popup and dashboard
async function getStatistics() {
  const tabs = await chrome.tabs.query({});
  const windows = await chrome.windows.getAll({ populate: true });
  
  // Count grouped tabs
  const groupedTabs = tabs.filter(tab => tab.groupId && tab.groupId !== -1);
  
  // Count by domain
  const domainCounts = {};
  for (const tab of tabs) {
    try {
      const domain = new URL(tab.url).hostname;
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    } catch {
      // Skip invalid URLs
    }
  }
  
  // Get top domains
  const topDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain, count]) => ({ domain, count }));
  
  // Find duplicates using the new engine
  const context = { tabs, windows, idx: buildIndices(tabs) };
  const duplicates = tabs.filter(tab => checkIsDupe(tab, context));
  
  return {
    totalTabs: tabs.length,
    totalWindows: windows.length,
    groupedTabs: groupedTabs.length,
    pinnedTabs: tabs.filter(t => t.pinned).length,
    snoozedTabs: state.snoozedTabs?.length || 0,
    duplicates: duplicates.length,
    topDomains,
    statistics: state.statistics
  };
}

// Get tab info for the current window
async function getTabInfo() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const groups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
  
  return {
    tabs: tabs.map(tab => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      favicon: tab.favIconUrl,
      pinned: tab.pinned,
      groupId: tab.groupId,
      active: tab.active,
      audible: tab.audible
    })),
    groups: groups.map(group => ({
      id: group.id,
      title: group.title,
      color: group.color,
      collapsed: group.collapsed
    }))
  };
}

// Execute all enabled rules
async function executeAllRules() {
  const enabledRules = state.rules.filter(r => r.enabled);

  try {
    // Get current tabs and windows
    const tabs = await chrome.tabs.query({});
    const windows = await chrome.windows.getAll();

    // Enhance tabs
    tabs.forEach(tab => {
      const timeData = tabTimeData.get(tab.id);
      if (timeData) {
        tab.createdAt = timeData.created;
        tab.lastActivatedAt = timeData.lastActive;
      }
      tab.category = getCategoryForDomain(tab.url);
    });

    // Get the current engine
    const { runRules, buildIndices } = getEngine();
    console.log(`Using engine: ${state.testEngine} for executing all rules`);

    // Build indices to enhance tabs with dupeKeys and other fields
    const idx = buildIndices(tabs);

    // Build context
    const context = {
      tabs,
      windows,
      chrome,
      idx
    };

    // Run all rules
    const results = await runRules(enabledRules, context, {
      dryRun: false,
      skipPinned: true
    });
    
    // Log activity
    if (results.totalActions > 0) {
      logActivity(
        'rule',
        `Manual execution: ${results.totalMatches} matches, ${results.totalActions} actions`,
        'manual'
      );
    }
    
    return {
      success: true,
      rulesExecuted: enabledRules.length,
      totalMatches: results.totalMatches,
      totalActions: results.totalActions,
      errors: results.errors
    };
    
  } catch (error) {
    console.error('Error executing all rules:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// Tab Event Handling for Immediate Triggers
// ============================================================================

// Handle tab creation for immediate triggers
chrome.tabs.onCreated.addListener(async (tab) => {
  // Track time
  tabTimeData.set(tab.id, {
    created: Date.now(),
    lastActive: Date.now(),
    lastAccessed: Date.now()
  });
  
  // Track history
  await trackTabHistory('created');
  
  // Check immediate triggers
  await checkImmediateTriggers('tab.created');
});

// Handle tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    await checkImmediateTriggers('tab.updated');
  }
});

// Handle tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const timeData = tabTimeData.get(activeInfo.tabId);
  if (timeData) {
    timeData.lastActive = Date.now();
    timeData.lastAccessed = Date.now();
  }
});

// Handle tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
  tabTimeData.delete(tabId);
  await trackTabHistory('closed');
});

// Check for rules with immediate triggers
async function checkImmediateTriggers(event) {
  // Check if we're in test mode
  const { testModeActive } = await chrome.storage.local.get('testModeActive');

  const immediateRules = state.rules.filter(r => {
    // Skip non-test rules during test mode
    if (testModeActive && !r.flags?.test) {
      return false;
    }
    // Skip test rules when not in test mode
    if (!testModeActive && r.flags?.test) {
      return false;
    }
    return r.enabled && (r.trigger?.immediate || r.trigger?.type === 'immediate');
  });

  for (const rule of immediateRules) {
    // Get custom debounce duration from rule trigger (convert seconds to milliseconds)
    const debounceDurationMs = rule.trigger?.debounceDuration
      ? rule.trigger.debounceDuration * 1000
      : null;
    scheduler.scheduleImmediate(rule.id, debounceDurationMs);
  }
}

// ============================================================================
// Rule Management API
// ============================================================================

async function addRule(rule) {
  // Ensure rule has required fields
  if (!rule.id) {
    rule.id = generateRuleId();
  }

  state.rules.push(rule);
  await chrome.storage.local.set({ rules: state.rules });

  // Setup triggers if enabled
  if (rule.enabled) {
    console.log(`Setting up scheduler for rule: ${rule.name}, trigger:`, rule.trigger);
    await scheduler.setupRule(rule);
  }

  return { success: true, ruleId: rule.id };
}

async function updateRule(ruleId, updates) {
  const ruleIndex = state.rules.findIndex(r => r.id === ruleId);
  if (ruleIndex === -1) {
    return { success: false, error: 'Rule not found' };
  }
  
  const oldRule = state.rules[ruleIndex];
  const newRule = { ...oldRule, ...updates };
  state.rules[ruleIndex] = newRule;
  
  await chrome.storage.local.set({ rules: state.rules });
  
  // Update scheduler
  scheduler.removeRule(ruleId);
  if (newRule.enabled) {
    await scheduler.setupRule(newRule);
  }
  
  return { success: true };
}

async function toggleRule(ruleId) {
  const rule = state.rules.find(r => r.id === ruleId);
  if (!rule) {
    return { success: false, error: 'Rule not found' };
  }

  rule.enabled = !rule.enabled;
  await chrome.storage.local.set({ rules: state.rules });

  // Update scheduler
  scheduler.removeRule(ruleId);
  if (rule.enabled) {
    await scheduler.setupRule(rule);
  }

  return { success: true, rule };
}

async function deleteRule(ruleId) {
  const ruleIndex = state.rules.findIndex(r => r.id === ruleId);
  if (ruleIndex === -1) {
    return { success: false, error: 'Rule not found' };
  }
  
  // Remove from scheduler
  scheduler.removeRule(ruleId);
  
  // Remove from state
  state.rules.splice(ruleIndex, 1);
  await chrome.storage.local.set({ rules: state.rules });
  
  logActivity('rule', `Deleted rule: ${ruleId}`, 'manual');
  
  return { success: true };
}

function generateRuleId() {
  return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// Domain Categories
// ============================================================================

// Domain categories now handled by engine.js

async function loadDomainCategories() {
  // This is now handled by engine.js using domain-categories.js
  // Keeping this function for compatibility
}

function getCategoryForDomain(url) {
  // This is now handled by engine.js using domain-categories.js
  // Keeping this stub for compatibility
  return 'unknown';
}

// ============================================================================
// Message Handler
// ============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle async operations
  (async () => {
    try {
      switch (request.action) {
        // Tab operations
        case 'getTabs':
          const tabs = await chrome.tabs.query({});
          const windows = await chrome.windows.getAll();

          // Add time data to tabs
          const enhancedTabs = tabs.map(tab => {
            const timeData = tabTimeData.get(tab.id);
            return {
              ...tab,
              timeData: timeData || null,
              last_access: tab.lastAccessed || timeData?.lastAccessed || null,
              category: getCategoryForDomain(tab.url)
            };
          });

          sendResponse({ tabs: enhancedTabs, windows });
          break;
          
        case 'getTabTimeData':
          const timeData = {};
          for (const [tabId, data] of tabTimeData.entries()) {
            timeData[tabId] = data;
          }
          sendResponse({ timeData });
          break;
          
        // Rule operations
        case 'getRules':
          // Always reload rules from storage to ensure we have the latest
          await loadRules();
          sendResponse(state.rules || []);
          break;
          
        case 'addRule':
          const addResult = await addRule(request.rule);
          sendResponse(addResult);
          break;
          
        case 'updateRule':
          const updateResult = await updateRule(request.ruleId, request.updates);
          sendResponse(updateResult);
          break;

        case 'toggleRule':
          const toggleResult = await toggleRule(request.ruleId);
          sendResponse(toggleResult);
          break;

        case 'updateRules':
          // Bulk update all rules (used by dashboard)
          state.rules = request.rules || [];
          await chrome.storage.local.set({ rules: state.rules });
          
          // Re-setup scheduler for all rules
          // First, remove all existing scheduled triggers
          for (const rule of state.rules) {
            scheduler.removeRule(rule.id);
          }
          
          // Then setup the new/updated rules
          for (const rule of state.rules) {
            if (rule.enabled) {
              await scheduler.setupRule(rule);
            }
          }
          
          sendResponse({ success: true });
          break;
          
        case 'deleteRule':
          const deleteResult = await deleteRule(request.ruleId);
          sendResponse(deleteResult);
          break;
          
        case 'previewRule':
          // Ensure rules are loaded before preview
          await loadRules();
          const preview = await previewRule(request.ruleId);
          sendResponse(preview);
          break;
          
        case 'executeRule':
          // Ensure scheduler is set up for the rule if it has triggers
          if (request.testMode) {
            const rule = state.rules.find(r => r.id === request.ruleId);
            if (rule && rule.trigger && (rule.trigger.repeat || rule.trigger.repeat_every)) {
              console.log(`Setting up scheduler for repeat rule: ${rule.name}`);
              await scheduler.setupRule(rule);
            }
          }
          const execResult = await executeRule(request.ruleId, 'manual', request.testMode);
          sendResponse(execResult);
          break;
          
        case 'executeAllRules':
          const allResult = await executeAllRules();
          sendResponse(allResult);
          break;
          
        case 'getSchedulerStatus':
          const status = scheduler.getStatus();
          sendResponse({ status });
          break;

        // Test Engine Selection
        case 'setTestEngine':
          state.testEngine = request.engine || 'v1';
          console.log(`Test engine switched to: ${state.testEngine}`);
          sendResponse({ success: true, engine: state.testEngine });
          break;

        case 'getTestEngine':
          sendResponse({ engine: state.testEngine });
          break;

        // Activity log
        case 'getActivityLog':
          sendResponse(state.activityLog || []);
          break;
          
        case 'clearActivityLog':
          state.activityLog = [];
          await chrome.storage.local.set({ activityLog: [] });
          sendResponse({ success: true });
          break;
          
        // Settings
        case 'getSettings':
          sendResponse({ settings: state.settings });
          break;
          
        case 'updateSettings':
          state.settings = { ...state.settings, ...request.settings };
          await chrome.storage.local.set({ settings: state.settings });
          sendResponse({ success: true });
          break;
          
        // Statistics
        case 'getStatistics':
          const stats = await getStatistics();
          sendResponse(stats);
          break;
          
        case 'getTabInfo':
          const tabInfo = await getTabInfo();
          sendResponse(tabInfo);
          break;

        case 'getRecentLogs':
          // Return recent console logs for debugging
          sendResponse({
            logs: recentLogs.map(log => ({
              ...log,
              time: new Date(log.timestamp).toLocaleTimeString()
            }))
          });
          break;

        // Tab operations
        case 'closeTabs':
          await closeTabs(request.tabIds);
          sendResponse({ success: true });
          break;
          
        case 'groupTabs':
          await groupTabs(request.tabIds, request.groupName);
          sendResponse({ success: true });
          break;
          
        case 'snoozeTabs':
          // Convert minutes to milliseconds
          const duration = request.minutes ? request.minutes * 60 * 1000 : request.duration;
          await snoozeTabs(request.tabIds, duration);
          sendResponse({ success: true });
          break;
          
        case 'bookmarkTabs':
          await bookmarkTabs(request.tabIds, request.folder);
          sendResponse({ success: true });
          break;
          
        case 'closeDuplicates':
          const closedCount = await findAndCloseDuplicates();
          sendResponse(closedCount);
          break;
          
        case 'groupByDomain':
          // Allow caller to specify window ID, otherwise use sender's window
          let targetWindowId = request.windowId;

          if (!targetWindowId) {
            // Fall back to sender's window
            targetWindowId = sender.tab ? sender.tab.windowId :
                             (await chrome.windows.getCurrent()).id;
          }

          const groupResult = await groupTabsByDomainService(GroupingScope.TARGETED, targetWindowId);
          sendResponse(groupResult);
          break;
          
        case 'snoozeCurrent':
          const snoozeResult = await quickSnoozeCurrent(request.minutes);
          sendResponse(snoozeResult);
          break;
          
        case 'getSnoozedTabs':
          sendResponse(state.snoozedTabs || []);
          break;
          
        case 'wakeSnoozedTab':
          const wakeResult = await wakeSnoozedTab(request.tabId);
          sendResponse(wakeResult);
          break;
          
        case 'wakeAllSnoozed':
          const wakeAllResult = await wakeAllSnoozedTabs();
          sendResponse(wakeAllResult);
          break;

        case 'deleteSnoozedTab':
          // Delete a snoozed tab record from storage
          const tabIdToDelete = request.tabId;
          const beforeDeleteCount = state.snoozedTabs.length;

          // Remove the record matching by ID or URL
          state.snoozedTabs = state.snoozedTabs.filter(tab => {
            // Compare IDs as strings since HTML data attributes are strings
            return String(tab.id) !== String(tabIdToDelete) && tab.url !== tabIdToDelete;
          });

          if (state.snoozedTabs.length < beforeDeleteCount) {
            await chrome.storage.local.set({ snoozedTabs: state.snoozedTabs });
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'Tab not found' });
          }
          break;

        case 'clearTestSnoozedTabs':
          // Clear snoozed tabs matching test patterns without recreating them
          const testPatterns = request.patterns || [];
          const beforeCount = state.snoozedTabs.length;
          state.snoozedTabs = state.snoozedTabs.filter(tab => {
            return !testPatterns.some(pattern => tab.url?.includes(pattern));
          });
          const removedCount = beforeCount - state.snoozedTabs.length;
          if (removedCount > 0) {
            await chrome.storage.local.set({ snoozedTabs: state.snoozedTabs });
            console.log(`Cleared ${removedCount} test snoozed tabs`);
          }
          sendResponse({ success: true, removedCount });
          break;

        // Test Mode Operations
        case 'setTestTabTime':
          if (request.timeData) {
            tabTimeData.set(request.tabId, request.timeData);
            console.log(`Set test tab ${request.tabId} time data:`, request.timeData);
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'No timeData provided' });
          }
          break;
          
        case 'setTestTabOrigin':
          // Store test tab origin info for testing
          if (!state.testTabOrigins) {
            state.testTabOrigins = new Map();
          }
          state.testTabOrigins.set(request.tabId, {
            origin: request.origin,
            referrer: request.referrer
          });
          sendResponse({ success: true });
          break;
          
        case 'markTestTabSuspended':
          // Mark tab as suspended in test mode
          if (!state.testTabStates) {
            state.testTabStates = new Map();
          }
          state.testTabStates.set(request.tabId, { suspended: true });
          sendResponse({ success: true });
          break;

        case 'getConsoleLogs':
          // Return captured console logs
          sendResponse({ logs: consoleLogs });
          break;
          
        case 'getTestRuleExecutions':
          // Return test rule execution history (lookup by ID or name)
          let executions = [];
          if (state.testRuleExecutions) {
            executions = state.testRuleExecutions.get(request.ruleId) || [];
            // If not found by ID, try by name
            if (executions.length === 0) {
              // Find rule by name to get its ID
              const rule = state.rules?.find(r => r.name === request.ruleId);
              if (rule) {
                executions = state.testRuleExecutions.get(rule.id) || [];
              }
            }
          }
          sendResponse({ executions });
          break;
          
        case 'getTestMetrics':
          // Return test performance metrics
          const metrics = {
            avgExecutionTime: state.testMetrics?.avgExecutionTime || 0,
            totalExecutions: state.testMetrics?.totalExecutions || 0
          };
          sendResponse(metrics);
          break;
          
        case 'getPerformanceMetrics':
          // Return performance metrics for assertions
          const perfMetrics = state.performanceMetrics || {};
          sendResponse(perfMetrics);
          break;
          
        case 'analyzeDuplicates':
          // Analyze duplicates for test assertions
          const testTabs = request.tabs || await chrome.tabs.query({});
          const testIndices = buildIndices(testTabs);
          const dupeGroups = [];
          
          for (const [dupeKey, tabs] of Object.entries(testIndices.byDupeKey)) {
            if (tabs.length > 1) {
              dupeGroups.push({
                dupeKey,
                count: tabs.length,
                tabs: tabs.map(t => ({ id: t.id, url: t.url }))
              });
            }
          }
          
          sendResponse({ groups: dupeGroups });
          break;
          
        case 'getScheduledTriggers':
          // Return scheduled triggers for a rule
          const triggers = [];
          if (scheduler && scheduler.getScheduledTriggers) {
            const allTriggers = scheduler.getScheduledTriggers();
            if (request.ruleId) {
              triggers.push(...allTriggers.filter(t => t.ruleId === request.ruleId));
            } else {
              triggers.push(...allTriggers);
            }
          }
          sendResponse({ triggers });
          break;
          
        case 'getRule':
          // Get a specific rule by ID
          const rule = state.rules.find(r => r.id === request.ruleId || r.name === request.ruleId);
          sendResponse({ success: !!rule, rule });
          break;

        // Export/Import Operations
        case 'exportData':
          const exportResult = await exportData(request.options);
          sendResponse(exportResult);
          break;

        case 'importData':
          const importResult = await importData(request.data, request.options);
          sendResponse(importResult);
          break;

        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ error: error.message });
    }
  })();
  
  return true; // Keep message channel open for async response
});

// ============================================================================
// Tab Operations
// ============================================================================

async function closeTabs(tabIds) {
  await chrome.tabs.remove(tabIds);
  state.statistics.tabsClosed += tabIds.length;
  await chrome.storage.local.set({ statistics: state.statistics });
  logActivity('close', `Closed ${tabIds.length} tabs`, 'manual');
}

// Find and close duplicate tabs
async function findAndCloseDuplicates() {
  const tabs = await chrome.tabs.query({});
  const context = { tabs, windows: await chrome.windows.getAll(), idx: buildIndices(tabs) };
  const duplicates = [];
  const seenUrls = new Set();
  
  // Find duplicates - keep the first instance of each URL
  for (const tab of tabs) {
    if (tab.pinned) continue;
    
    // Normalize URL by removing trailing slashes and fragments
    const normalizedUrl = tab.url.replace(/\/$/, '').split('#')[0];
    
    if (seenUrls.has(normalizedUrl)) {
      duplicates.push(tab.id);
      state.statistics.duplicatesRemoved++;
    } else {
      seenUrls.add(normalizedUrl);
    }
  }
  
  // Close duplicate tabs
  if (duplicates.length > 0) {
    await chrome.tabs.remove(duplicates);
    await chrome.storage.local.set({ statistics: state.statistics });
    
    // Log activity
    logActivity('close', `Closed ${duplicates.length} duplicate tab${duplicates.length > 1 ? 's' : ''}`, 'manual');
    
    // Track history
    for (let i = 0; i < duplicates.length; i++) {
      await trackTabHistory('closed');
    }
  }
  
  return duplicates.length;
}

// Group tabs by domain - uses centralized TabGrouping service
async function groupTabsByDomain() {
  const currentWindowId = await getCurrentWindowId();
  const result = await groupTabsByDomainService(GroupingScope.TARGETED, currentWindowId);

  // Update statistics (side effects stay in caller)
  if (result.totalTabsGrouped > 0) {
    state.statistics.tabsGrouped += result.totalTabsGrouped;
    await chrome.storage.local.set({ statistics: state.statistics });

    // Log activity (side effects stay in caller)
    const message = `Created ${result.groupsCreated} new groups, reused ${result.groupsReused} existing groups with ${result.totalTabsGrouped} tabs`;
    logActivity('group', message, 'manual');
  }

  return result;
}

// Quick snooze current tab
async function quickSnoozeCurrent(minutes = 120) {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab) {
    await snoozeTabs([activeTab.id], minutes * 60 * 1000);
    return { success: true, tabId: activeTab.id };
  }
  return { success: false, error: 'No active tab' };
}

// Helper function to restore a tab to its original group if it exists
async function restoreTabToGroup(newTabId, originalGroupId) {
  if (!originalGroupId || originalGroupId <= 0) {
    return false;
  }

  try {
    // Check if the group still exists by querying all groups
    const groups = await chrome.tabGroups.query({});
    const groupExists = groups.some(g => g.id === originalGroupId);

    if (groupExists) {
      // Group still exists, add tab to it
      await chrome.tabs.group({
        tabIds: [newTabId],
        groupId: originalGroupId
      });
      return true;
    } else {
      console.log(`Group ${originalGroupId} no longer exists for restored tab`);
      return false;
    }
  } catch (error) {
    // Error adding to group, tab stays ungrouped
    console.error(`Error restoring tab to group ${originalGroupId}:`, error);
    return false;
  }
}

// Wake a snoozed tab (restore it and remove from snooze list)
async function wakeSnoozedTab(tabId) {
  // Match by ID (compare as strings) or by URL as fallback
  const tabIndex = state.snoozedTabs.findIndex(t =>
    String(t.id) === String(tabId) || t.url === tabId
  );

  if (tabIndex === -1) {
    return { success: false, error: 'Tab not found' };
  }

  const snoozedTab = state.snoozedTabs[tabIndex];

  // Create the tab
  const newTab = await chrome.tabs.create({
    url: snoozedTab.url,
    active: false
  });

  // Restore group association if the group still exists
  await restoreTabToGroup(newTab.id, snoozedTab.groupId);

  // Remove from snoozed list
  state.snoozedTabs.splice(tabIndex, 1);
  await chrome.storage.local.set({ snoozedTabs: state.snoozedTabs });

  logActivity('snooze', `Woke snoozed tab: ${snoozedTab.title}`, 'manual');

  return { success: true };
}

// Wake all snoozed tabs
async function wakeAllSnoozedTabs() {
  const count = state.snoozedTabs.length;
  if (count === 0) {
    return { success: true, count: 0 };
  }
  
  // If there are multiple tabs, create them in a new window
  let targetWindowId;
  if (count > 1) {
    // Create window with the first tab's URL to avoid default new tab
    const firstTab = state.snoozedTabs[0];
    const newWindow = await chrome.windows.create({
      url: firstTab.url,
      focused: true
    });
    targetWindowId = newWindow.id;
    
    // Get the tab that was created with the window
    const windowTabs = await chrome.tabs.query({ windowId: targetWindowId });
    if (windowTabs.length > 0) {
      // Restore group if needed for the first tab
      await restoreTabToGroup(windowTabs[0].id, firstTab.groupId);
    }
    
    // Create the remaining tabs
    for (let i = 1; i < state.snoozedTabs.length; i++) {
      const snoozedTab = state.snoozedTabs[i];
      const newTab = await chrome.tabs.create({
        url: snoozedTab.url,
        windowId: targetWindowId,
        active: false
      });
      
      // Restore group association if the group still exists
      await restoreTabToGroup(newTab.id, snoozedTab.groupId);
    }
  } else {
    // Single tab - create in current window
    const snoozedTab = state.snoozedTabs[0];
    const newTab = await chrome.tabs.create({
      url: snoozedTab.url,
      active: false
    });
    
    // Restore group association if the group still exists
    await restoreTabToGroup(newTab.id, snoozedTab.groupId);
  }

  // Clear snoozed list
  state.snoozedTabs = [];
  await chrome.storage.local.set({ snoozedTabs: [] });

  logActivity('snooze', `Restored all ${count} snoozed tabs`, 'manual');

  return { success: true, count };
}

async function groupTabs(tabIds, groupName) {
  if (tabIds.length === 0) return;
  
  const groupId = await chrome.tabs.group({ tabIds });
  if (groupName) {
    await chrome.tabGroups.update(groupId, { title: groupName });
  }
  
  state.statistics.tabsGrouped += tabIds.length;
  await chrome.storage.local.set({ statistics: state.statistics });
  logActivity('group', `Grouped ${tabIds.length} tabs`, 'manual');
}

async function snoozeTabs(tabIds, duration) {
  // Get tab details for each ID
  const tabs = [];
  for (const tabId of tabIds) {
    try {
      const tab = await chrome.tabs.get(tabId);
      tabs.push(tab);
    } catch (e) {
      console.error(`Failed to get tab ${tabId}:`, e);
    }
  }

  const wakeTime = Date.now() + duration;
  
  for (const tab of tabs) {
    state.snoozedTabs.push({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      windowId: tab.windowId,
      index: tab.index,
      groupId: tab.groupId || -1,  // Preserve group association
      wakeTime
    });
  }
  
  await chrome.storage.local.set({ snoozedTabs: state.snoozedTabs });
  await chrome.tabs.remove(tabIds);
  
  state.statistics.tabsSnoozed += tabIds.length;
  await chrome.storage.local.set({ statistics: state.statistics });
  logActivity('snooze', `Snoozed ${tabIds.length} tabs`, 'manual');
}

async function bookmarkTabs(tabIds, folderName = 'TabMaster Bookmarks') {
  // Create or find folder
  const bookmarkTree = await chrome.bookmarks.getTree();
  let folderId = null;
  
  // Search for existing folder
  function findFolder(nodes, name) {
    for (const node of nodes) {
      if (node.title === name && !node.url) {
        return node.id;
      }
      if (node.children) {
        const found = findFolder(node.children, name);
        if (found) return found;
      }
    }
    return null;
  }
  
  folderId = findFolder(bookmarkTree, folderName);
  
  if (!folderId) {
    // Create in Other Bookmarks
    const folder = await chrome.bookmarks.create({
      parentId: '2',
      title: folderName
    });
    folderId = folder.id;
  }
  
  // Bookmark tabs - get tab details for each ID
  const tabs = [];
  for (const tabId of tabIds) {
    try {
      const tab = await chrome.tabs.get(tabId);
      tabs.push(tab);
    } catch (e) {
      console.error(`Failed to get tab ${tabId}:`, e);
    }
  }

  for (const tab of tabs) {
    await chrome.bookmarks.create({
      parentId: folderId,
      title: tab.title,
      url: tab.url
    });
  }
  
  logActivity('bookmark', `Bookmarked ${tabIds.length} tabs`, 'manual');
}

// ============================================================================
// Command Handlers
// ============================================================================

chrome.commands.onCommand.addListener(async (command) => {
  console.log('Command received:', command);
  
  switch (command) {
    case 'open_test_panel':
      // Note: sidePanel.open() requires user gesture, can't be triggered from keyboard shortcut
      // Users should click the Test button in the popup or use browser's side panel button
      console.log('Use the Test button in the popup to open the test panel');
      break;
      
    case 'open_command_palette':
      // TODO: Implement command palette
      break;
      
    case 'quick_snooze':
      await quickSnoozeCurrent();
      break;
      
    case 'group_by_domain':
      await groupTabsByDomain();
      break;
      
    case 'close_duplicates':
      await findAndCloseDuplicates();
      break;
  }
});

// ============================================================================
// Context Menus
// ============================================================================

async function setupContextMenus() {
  chrome.contextMenus.removeAll();

  // Snooze menu
  chrome.contextMenus.create({
    id: 'snooze-tab',
    title: 'Snooze Tab',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'snooze-1h',
    parentId: 'snooze-tab',
    title: 'For 1 hour',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'snooze-3h',
    parentId: 'snooze-tab',
    title: 'For 3 hours',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'snooze-tomorrow',
    parentId: 'snooze-tab',
    title: 'Until tomorrow',
    contexts: ['page']
  });

  // Rules menu
  chrome.contextMenus.create({
    id: 'rules',
    title: 'Rules',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'create-rule-for-domain',
    parentId: 'rules',
    title: 'Create Rule for this Domain',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'create-rule-for-url',
    parentId: 'rules',
    title: 'Create Rule for this URL',
    contexts: ['page']
  });
}

/**
 * Create a rule template for tabs matching the given tab's domain or URL
 * Opens the dashboard with a pre-filled rule for the user to customize
 * @param {object} tab - The tab to create a rule for
 * @param {string} mode - Either 'domain' or 'url'
 */
async function createRuleForTab(tab, mode = 'domain') {
  try {
    // Extract domain and path from tab URL
    const url = new URL(tab.url);
    const domain = url.hostname;
    const pathname = url.pathname;

    // Remove trailing slash for cleaner URLs
    const fullPath = pathname === '/' ? domain : domain + pathname;

    // Create a rule template based on mode
    // Use UI format for conditions (subject, operator, value)
    let ruleTemplate;

    if (mode === 'url') {
      // Match the full URL path (domain + path)
      ruleTemplate = {
        name: `Rule for ${fullPath}`,
        enabled: false, // Start disabled so user can configure first
        when: {
          all: [
            {
              subject: 'tab.url',
              operator: 'starts_with',
              value: url.origin + pathname
            }
          ]
        },
        then: [
          // Leave actions empty for user to configure
        ],
        flags: {
          createdFrom: 'contextMenu',
          mode: 'url',
          sourceDomain: domain,
          sourceUrl: tab.url
        }
      };
    } else {
      // Match just the domain
      ruleTemplate = {
        name: `Rule for ${domain}`,
        enabled: false, // Start disabled so user can configure first
        when: {
          all: [
            {
              subject: 'tab.url',
              operator: 'contains',
              value: domain
            }
          ]
        },
        then: [
          // Leave actions empty for user to configure
        ],
        flags: {
          createdFrom: 'contextMenu',
          mode: 'domain',
          sourceDomain: domain,
          sourceUrl: tab.url
        }
      };
    }

    // Open dashboard to rules view with the template
    const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html');
    const existingDashboard = await chrome.tabs.query({ url: dashboardUrl });

    if (existingDashboard.length > 0) {
      // Focus existing dashboard and send the rule template
      await chrome.tabs.update(existingDashboard[0].id, { active: true });
      await chrome.tabs.sendMessage(existingDashboard[0].id, {
        action: 'openRuleModal',
        rule: ruleTemplate
      });
    } else {
      // Open new dashboard tab
      const dashboardTab = await chrome.tabs.create({ url: dashboardUrl });

      // Wait for dashboard to load, then send the rule template
      // We'll listen for a message from the dashboard indicating it's ready
      const onDashboardReady = (message, sender) => {
        if (sender.tab?.id === dashboardTab.id && message.action === 'dashboardReady') {
          chrome.runtime.sendMessage({
            action: 'openRuleModal',
            rule: ruleTemplate,
            targetTabId: dashboardTab.id
          });
          chrome.runtime.onMessage.removeListener(onDashboardReady);
        }
      };

      chrome.runtime.onMessage.addListener(onDashboardReady);

      // Also store the template temporarily in case the message doesn't work
      await chrome.storage.local.set({ pendingRuleTemplate: ruleTemplate });
    }

  } catch (error) {
    console.error('Failed to create rule for tab:', error);
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case 'snooze-1h':
      await snoozeTabs([tab.id], 60 * 60 * 1000);
      break;
    case 'snooze-3h':
      await snoozeTabs([tab.id], 3 * 60 * 60 * 1000);
      break;
    case 'snooze-tomorrow':
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      const duration = tomorrow.getTime() - Date.now();
      await snoozeTabs([tab.id], duration);
      break;
    case 'create-rule-for-domain':
      await createRuleForTab(tab, 'domain');
      break;
    case 'create-rule-for-url':
      await createRuleForTab(tab, 'url');
      break;
  }
});

// ============================================================================
// Snoozed Tabs
// ============================================================================

async function restoreSnoozedTabs() {
  const { snoozedTabs } = await chrome.storage.local.get('snoozedTabs');
  if (snoozedTabs) {
    state.snoozedTabs = snoozedTabs;
  }
  
  // Set up periodic check
  chrome.alarms.create('checkSnoozedTabs', {
    delayInMinutes: 1,
    periodInMinutes: 1
  });
}

async function checkSnoozedTabs() {
  const now = Date.now();
  const toRestore = state.snoozedTabs.filter(tab => tab.wakeTime <= now);
  
  if (toRestore.length === 0) return;
  
  // Group by window
  const byWindow = {};
  for (const tab of toRestore) {
    const windowId = tab.windowId || 'new';
    if (!byWindow[windowId]) {
      byWindow[windowId] = [];
    }
    byWindow[windowId].push(tab);
  }
  
  // Restore tabs
  for (const [windowId, tabs] of Object.entries(byWindow)) {
    let targetWindowId;
    
    if (windowId === 'new') {
      // Create window with the first tab's URL to avoid default new tab
      const firstTab = tabs[0];
      const newWindow = await chrome.windows.create({
        url: firstTab.url,
        focused: true
      });
      targetWindowId = newWindow.id;
      
      // Get the tab that was created with the window
      const windowTabs = await chrome.tabs.query({ windowId: targetWindowId });
      if (windowTabs.length > 0) {
        // Restore group if needed for the first tab
        await restoreTabToGroup(windowTabs[0].id, firstTab.groupId);
      }
      
      // Create the remaining tabs
      for (let i = 1; i < tabs.length; i++) {
        const tab = tabs[i];
        await chrome.tabs.create({
          url: tab.url,
          windowId: targetWindowId,
          active: false
        });
      }
      
      // Remove the original tab from state.snoozedTabs
      state.snoozedTabs = state.snoozedTabs.filter(t => t.id !== firstTab.id);
      
      // Skip the rest of the loop since we handled all tabs
      continue;
    } else {
      // Check if original window still exists
      try {
        await chrome.windows.get(parseInt(windowId));
        targetWindowId = parseInt(windowId);
      } catch (e) {
        const currentWindow = await chrome.windows.getCurrent();
        targetWindowId = currentWindow.id;
      }
    }
    
    // Create tabs
    for (const tab of tabs) {
      await chrome.tabs.create({
        url: tab.url,
        windowId: targetWindowId,
        active: false
      });
    }
  }
  
  // Remove restored tabs from snoozed list
  state.snoozedTabs = state.snoozedTabs.filter(tab => tab.wakeTime > now);
  await chrome.storage.local.set({ snoozedTabs: state.snoozedTabs });
  
  // Log activity
  logActivity('snooze', `Restored ${toRestore.length} snoozed tabs`, 'auto');
}

// ============================================================================
// Alarm Handlers
// ============================================================================

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkSnoozedTabs') {
    await checkSnoozedTabs();
  } else if (alarm.name.startsWith('rule-repeat:')) {
    const ruleId = alarm.name.substring('rule-repeat:'.length);
    await onSchedulerTrigger({ ruleId, type: 'repeat' });
  }
});

// ============================================================================
// Migration
// ============================================================================

async function checkAndMigrateTabs() {
  // This function can be used to migrate old rule formats to new format
  const { rules } = await chrome.storage.local.get('rules');
  if (!rules || rules.length === 0) return;
  
  let migrated = false;
  
  for (const rule of rules) {
    // Check if rule uses old format
    if (rule.conditions && !rule.when) {
      // Migrate to new format
      rule.when = migrateConditions(rule.conditions);
      delete rule.conditions;
      migrated = true;
    }
    
    if (rule.actions && !rule.then) {
      // Migrate actions
      rule.then = migrateActions(rule.actions);
      delete rule.actions;
      migrated = true;
    }
    
    if (!rule.trigger) {
      // Add default trigger
      rule.trigger = { on_action: true };
      migrated = true;
    }
  }
  
  if (migrated) {
    state.rules = rules;
    await chrome.storage.local.set({ rules });
    console.log('Migrated rules to new format');
  }
}

function migrateConditions(oldConditions) {
  // Convert old condition format to new format
  // This is a simplified migration - expand based on actual old format
  switch (oldConditions.type) {
    case 'domain':
      return { eq: ['tab.domain', oldConditions.value] };
    case 'age':
      return { gte: ['tab.age', oldConditions.value] };
    case 'duplicate':
      return { is: ['tab.isDupe', true] };
    default:
      return { all: [] }; // Empty condition
  }
}

function migrateActions(oldActions) {
  // Convert old action format to new format
  const actions = [];
  
  switch (oldActions.type) {
    case 'close':
      actions.push({ action: 'close' });
      break;
    case 'group':
      actions.push({ 
        action: 'group',
        name: oldActions.groupName
      });
      break;
    case 'snooze':
      actions.push({
        action: 'snooze',
        for: oldActions.duration || '2h'
      });
      break;
  }
  
  return actions;
}

// ============================================================================
// Export/Import Functions
// ============================================================================

async function exportData(options = {}) {
  const {
    scope = 'all-windows', // 'current-window' or 'all-windows'
    format = 'json', // 'json', 'csv', or 'markdown'
    includeRules = true,
    includeSnoozed = true,
    includeSettings = true,
    includeStatistics = true,
    currentWindowId = null
  } = options;

  // Get tabs based on scope
  const query = scope === 'current-window' && currentWindowId
    ? { windowId: currentWindowId }
    : {};

  const tabs = await chrome.tabs.query(query);
  const windows = scope === 'current-window' && currentWindowId
    ? await chrome.windows.get(currentWindowId)
    : await chrome.windows.getAll();
  const groups = await chrome.tabGroups.query(query);

  // Build export based on format
  switch (format) {
    case 'json':
      return await buildJSONExport(tabs, windows, groups, options);
    case 'csv':
      return buildCSVExport(tabs, groups);
    case 'markdown':
      return buildMarkdownExport(tabs, windows, groups, options);
    default:
      return await buildJSONExport(tabs, windows, groups, options);
  }
}

async function buildJSONExport(tabs, windows, groups, options) {
  const now = new Date();
  const exportDate = now.toISOString();
  const exportDateReadable = now.toLocaleString();

  // Build session data with human-readable fields
  const windowsArray = Array.isArray(windows) ? windows : [windows];
  const sessionWindows = windowsArray.map(window => ({
    id: `w${window.id}`,
    windowId: window.id, // Keep original ID for reference
    title: `Window ${window.id} - ${tabs.filter(t => t.windowId === window.id).length} tabs`,
    focused: window.focused,
    state: window.state,
    type: window.type,
    tabCount: tabs.filter(t => t.windowId === window.id).length,
    tabs: tabs.filter(t => t.windowId === window.id).map(t => `t${t.id}`)
  }));

  // Get current time for relative time calculations
  const currentTime = Date.now();

  const sessionTabs = tabs.map(tab => {
    const group = groups.find(g => g.id === tab.groupId);
    const timeData = tabTimeData.get(tab.id) || {};

    // Calculate human-readable times
    const createdAt = timeData.created || currentTime;
    const lastAccessedAt = timeData.lastAccessed || currentTime;
    const createdAgo = getTimeAgo(createdAt, currentTime);
    const lastAccessedAgo = getTimeAgo(lastAccessedAt, currentTime);

    // Extract domain from URL
    let domain = '';
    try {
      const url = new URL(tab.url);
      domain = url.hostname;
    } catch (e) {
      domain = tab.url.split('/')[0];
    }

    return {
      id: `t${tab.id}`,
      tabId: tab.id, // Keep original ID for reference
      windowId: `w${tab.windowId}`,
      groupId: tab.groupId !== -1 ? `g${tab.groupId}` : null,
      groupName: group ? group.title : null,
      url: tab.url,
      title: tab.title,
      domain: domain,
      favicon: tab.favIconUrl || '',
      pinned: tab.pinned,
      position: tab.index,
      active: tab.active,
      audible: tab.audible,
      muted: tab.mutedInfo ? tab.mutedInfo.muted : false,
      createdAt: new Date(createdAt).toISOString(),
      createdReadable: createdAgo,
      lastAccessedAt: new Date(lastAccessedAt).toISOString(),
      lastAccessedReadable: lastAccessedAgo
    };
  });

  const sessionGroups = groups.map(group => {
    const window = windowsArray.find(w => w.id === group.windowId);
    const groupTabs = tabs.filter(t => t.groupId === group.id);

    return {
      id: `g${group.id}`,
      groupId: group.id, // Keep original ID for reference
      windowId: `w${group.windowId}`,
      windowTitle: window ? `Window ${window.id}` : 'Unknown Window',
      name: group.title || 'Unnamed Group',
      color: group.color,
      colorHex: getColorHex(group.color),
      collapsed: group.collapsed,
      tabCount: groupTabs.length,
      tabIds: groupTabs.map(t => `t${t.id}`)
    };
  });

  // Build the full export data
  const exportData = {
    format: 'TabMaster Export v2.0',
    created: exportDate,
    createdReadable: exportDateReadable,
    scope: options.scope || 'all-windows',
    description: `${tabs.length} tabs across ${windowsArray.length} window${windowsArray.length > 1 ? 's' : ''}`,
    browser: navigator.userAgent,
    extension: {
      name: 'TabMaster Pro',
      version: chrome.runtime.getManifest().version
    },
    session: {
      summary: `${windowsArray.length} window${windowsArray.length > 1 ? 's' : ''}, ${tabs.length} tabs, ${groups.length} groups`,
      windows: sessionWindows,
      tabs: sessionTabs,
      groups: sessionGroups
    },
    extensionData: {}
  };

  // Add extension data (never scoped - always all)
  if (options.includeRules !== false) {
    exportData.extensionData.rules = state.rules.map(rule => ({
      ...rule,
      conditionsReadable: getConditionsReadable(rule.conditions),
      actionsReadable: getActionsReadable(rule.actions)
    }));
  }

  if (options.includeSnoozed !== false) {
    exportData.extensionData.snoozedTabs = state.snoozedTabs.map(tab => ({
      ...tab,
      wakeTimeReadable: tab.wakeTime ? getTimeUntil(tab.wakeTime, currentTime) : 'Unknown',
      snoozedReadable: tab.snoozedAt ? getTimeAgo(tab.snoozedAt, currentTime) : 'Unknown'
    }));
  }

  if (options.includeSettings !== false) {
    exportData.extensionData.settings = state.settings;
  }

  if (options.includeStatistics !== false) {
    exportData.extensionData.statistics = state.statistics;
  }

  return exportData;
}

function buildCSVExport(tabs, groups) {
  // CSV header
  const headers = ['Window', 'Group', 'Position', 'Title', 'URL', 'Domain', 'Pinned', 'Active', 'Created', 'Last Accessed'];
  const rows = [headers];

  // Add tab data
  tabs.forEach(tab => {
    const group = groups.find(g => g.id === tab.groupId);
    const timeData = tabTimeData.get(tab.id) || {};

    // Extract domain
    let domain = '';
    try {
      const url = new URL(tab.url);
      domain = url.hostname;
    } catch (e) {
      domain = tab.url.split('/')[0];
    }

    const row = [
      `Window ${tab.windowId}`,
      group ? group.title : '',
      tab.index.toString(),
      tab.title.replace(/"/g, '""'), // Escape quotes for CSV
      tab.url,
      domain,
      tab.pinned ? 'true' : 'false',
      tab.active ? 'true' : 'false',
      timeData.created ? new Date(timeData.created).toLocaleString() : '',
      timeData.lastAccessed ? new Date(timeData.lastAccessed).toLocaleString() : ''
    ];

    rows.push(row);
  });

  // Convert to CSV string
  const csv = rows.map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  return { csv, format: 'csv' };
}

function buildMarkdownExport(tabs, windows, groups, options) {
  const windowsArray = Array.isArray(windows) ? windows : [windows];
  let markdown = '# TabMaster Export - ' + new Date().toLocaleDateString() + '\n\n';

  // Summary section
  markdown += '## Summary\n';
  markdown += `- **Total Tabs**: ${tabs.length} across ${windowsArray.length} window${windowsArray.length > 1 ? 's' : ''}\n`;
  markdown += `- **Tab Groups**: ${groups.length} groups\n`;
  if (options.includeSnoozed !== false && state.snoozedTabs.length > 0) {
    markdown += `- **Snoozed Tabs**: ${state.snoozedTabs.length} tabs\n`;
  }
  if (options.includeRules !== false && state.rules.length > 0) {
    markdown += `- **Active Rules**: ${state.rules.filter(r => r.enabled).length} rules\n`;
  }
  markdown += '\n';

  // Windows section
  markdown += '## Windows\n\n';

  windowsArray.forEach(window => {
    const windowTabs = tabs.filter(t => t.windowId === window.id);
    const windowGroups = groups.filter(g => g.windowId === window.id);

    markdown += `### Window ${window.id} (${windowTabs.length} tabs)\n`;

    if (windowGroups.length > 0) {
      const groupNames = windowGroups.map(g => `${g.title} (${windowTabs.filter(t => t.groupId === g.id).length})`);
      const ungroupedCount = windowTabs.filter(t => t.groupId === -1).length;
      if (ungroupedCount > 0) {
        groupNames.push(`Ungrouped (${ungroupedCount})`);
      }
      markdown += `**Groups**: ${groupNames.join(', ')}\n\n`;
    }

    // List tabs by group
    windowGroups.forEach(group => {
      const groupTabs = windowTabs.filter(t => t.groupId === group.id);
      if (groupTabs.length > 0) {
        markdown += `#### ${group.title} Group\n`;
        groupTabs.forEach((tab, index) => {
          const pinned = tab.pinned ? ' 📌' : '';
          markdown += `${index + 1}. [${tab.title}](${tab.url})${pinned}\n`;
        });
        markdown += '\n';
      }
    });

    // Ungrouped tabs
    const ungroupedTabs = windowTabs.filter(t => t.groupId === -1);
    if (ungroupedTabs.length > 0) {
      markdown += '#### Ungrouped Tabs\n';
      ungroupedTabs.forEach((tab, index) => {
        const pinned = tab.pinned ? ' 📌' : '';
        markdown += `${index + 1}. [${tab.title}](${tab.url})${pinned}\n`;
      });
      markdown += '\n';
    }
  });

  // Snoozed tabs section
  if (options.includeSnoozed !== false && state.snoozedTabs.length > 0) {
    markdown += '## Snoozed Tabs\n';
    markdown += '| Title | URL | Wake Time | Reason |\n';
    markdown += '|-------|-----|-----------|--------|\n';

    state.snoozedTabs.forEach(tab => {
      const wakeTime = tab.wakeTime ? new Date(tab.wakeTime).toLocaleString() : 'Unknown';
      markdown += `| ${tab.title} | ${tab.url} | ${wakeTime} | ${tab.reason || 'No reason'} |\n`;
    });
    markdown += '\n';
  }

  // Active rules section
  if (options.includeRules !== false && state.rules.length > 0) {
    const activeRules = state.rules.filter(r => r.enabled);
    if (activeRules.length > 0) {
      markdown += '## Active Rules\n';
      activeRules.forEach((rule, index) => {
        markdown += `${index + 1}. **${rule.name}** - ${rule.description || 'No description'}\n`;
      });
    }
  }

  return { markdown, format: 'markdown' };
}

// Helper functions for human-readable formatting
function getTimeAgo(timestamp, now) {
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
}

function getTimeUntil(timestamp, now) {
  const diff = timestamp - now;
  if (diff <= 0) return 'Now';

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `In ${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `In ${hours} hour${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `In ${minutes} minute${minutes > 1 ? 's' : ''}`;
  return 'Soon';
}

function getColorHex(colorName) {
  const colors = {
    'grey': '#5f6368',
    'blue': '#1a73e8',
    'red': '#ea4335',
    'yellow': '#fbbc04',
    'green': '#34a853',
    'pink': '#ff6d91',
    'purple': '#9334e6',
    'cyan': '#00bcd4',
    'orange': '#ff9800'
  };
  return colors[colorName] || '#5f6368';
}

function getConditionsReadable(conditions) {
  // Simple readable format for conditions
  if (!conditions) return 'No conditions';

  if (conditions.all && Array.isArray(conditions.all)) {
    return 'All conditions must be met';
  }
  if (conditions.any && Array.isArray(conditions.any)) {
    return 'Any condition must be met';
  }
  if (conditions.is && Array.isArray(conditions.is)) {
    return `Check: ${conditions.is[0]}`;
  }
  return 'Custom conditions';
}

function getActionsReadable(actions) {
  // Simple readable format for actions
  if (!actions || !Array.isArray(actions)) return 'No actions';

  return actions.map(action => {
    switch (action.type) {
      case 'close': return 'Close tab';
      case 'group': return `Group into "${action.group || 'unnamed'}"`;
      case 'snooze': return `Snooze for ${action.duration || 'default time'}`;
      case 'pin': return 'Pin tab';
      case 'unpin': return 'Unpin tab';
      case 'mute': return 'Mute tab';
      case 'unmute': return 'Unmute tab';
      default: return action.type;
    }
  }).join(', ');
}

// ============================================================================
// Import Functions
// ============================================================================

async function importData(data, options = {}) {
  const {
    scope = 'new-windows', // 'new-windows', 'current-window', or 'replace-all'
    importGroups = true,
    shouldImportRules = true,
    shouldImportSnoozed = true,
    importSettings = false
  } = options;

  const result = {
    success: false,
    imported: {
      windows: 0,
      tabs: 0,
      groups: 0,
      rules: 0,
      snoozed: 0
    },
    errors: [],
    warnings: []
  };

  try {
    // Validate data structure
    if (!data || !data.session) {
      throw new Error('Invalid import data: missing session information');
    }

    // Handle different import scopes
    switch (scope) {
      case 'replace-all':
        // Close all existing windows except the current one
        const currentWindow = await chrome.windows.getCurrent();
        const allWindows = await chrome.windows.getAll();
        for (const window of allWindows) {
          if (window.id !== currentWindow.id) {
            try {
              await chrome.windows.remove(window.id);
            } catch (e) {
              result.warnings.push(`Could not close window ${window.id}`);
            }
          }
        }
        break;

      case 'current-window':
        // Import will append to current window
        break;

      case 'new-windows':
      default:
        // Import will create new windows
        break;
    }

    // Import tabs and groups
    if (data.session && data.session.tabs && data.session.tabs.length > 0) {
      console.log(`Importing ${data.session.tabs.length} tabs with scope: ${scope}`);
      const importResult = await importTabsAndGroups(
        data.session.tabs,
        data.session.groups || [],
        data.session.windows || [],
        scope,
        importGroups
      );

      result.imported.tabs = importResult.tabCount;
      result.imported.groups = importResult.groupCount;
      result.imported.windows = importResult.windowCount;

      if (importResult.errors.length > 0) {
        result.errors.push(...importResult.errors);
      }
    } else {
      console.log('No tabs to import:', {
        hasSession: !!data.session,
        hasTabs: data.session ? !!data.session.tabs : false,
        tabCount: data.session && data.session.tabs ? data.session.tabs.length : 0
      });
    }

    // Import rules
    if (shouldImportRules && data.extensionData && data.extensionData.rules) {
      const rulesResult = await importRules(data.extensionData.rules);
      result.imported.rules = rulesResult.imported;
      if (rulesResult.errors.length > 0) {
        result.errors.push(...rulesResult.errors);
      }
    }

    // Import snoozed tabs
    if (shouldImportSnoozed && data.extensionData && data.extensionData.snoozedTabs) {
      const snoozedResult = await importSnoozedTabs(data.extensionData.snoozedTabs);
      result.imported.snoozed = snoozedResult.imported;
      if (snoozedResult.errors.length > 0) {
        result.errors.push(...snoozedResult.errors);
      }
    }

    // Import settings
    if (importSettings && data.extensionData && data.extensionData.settings) {
      try {
        state.settings = { ...state.settings, ...data.extensionData.settings };
        await chrome.storage.local.set({ settings: state.settings });
      } catch (e) {
        result.errors.push('Failed to import settings: ' + e.message);
      }
    }

    result.success = true;

  } catch (error) {
    console.error('Import failed:', error);
    result.success = false;
    result.errors.push(error.message);
  }

  return result;
}

async function importTabsAndGroups(tabs, groups, windows, scope, importGroups) {
  const result = {
    tabCount: 0,
    groupCount: 0,
    windowCount: 0,
    errors: []
  };

  try {
    let targetWindowId;
    const windowIdMap = new Map(); // Map old window IDs to new ones
    const groupIdMap = new Map(); // Map old group IDs to new ones
    const newWindowIds = []; // Track new windows for cleanup

    // Determine target window(s)
    if (scope === 'current-window' || scope === 'replace-all') {
      const currentWindow = await chrome.windows.getCurrent();
      targetWindowId = currentWindow.id;

      // Map all old window IDs to current window
      windows.forEach(window => {
        const oldId = window.windowId || parseInt(window.id.replace('w', ''));
        windowIdMap.set(oldId, targetWindowId);
      });
    } else {
      // Create new windows

      for (const windowData of windows) {
        try {
          const newWindow = await chrome.windows.create({
            focused: windows.indexOf(windowData) === 0, // Focus first window
            state: windowData.state || 'normal'
          });

          const oldId = windowData.windowId || parseInt(windowData.id.replace('w', ''));
          windowIdMap.set(oldId, newWindow.id);
          newWindowIds.push(newWindow.id); // Track for cleanup
          result.windowCount++;

          // Don't remove tabs yet - we'll do it after creating our tabs
          // Store the window for later cleanup
          targetWindowId = newWindow.id;
        } catch (e) {
          console.error('Failed to create window:', e);
          result.errors.push(`Failed to create window: ${e.message}`);
        }
      }

      // If no windows in data, create one
      if (windows.length === 0 && tabs.length > 0) {
        const newWindow = await chrome.windows.create({ focused: true });
        targetWindowId = newWindow.id;
        result.windowCount = 1;

        // Remove default tab
        const defaultTabs = await chrome.tabs.query({ windowId: newWindow.id });
        for (const tab of defaultTabs) {
          try {
            await chrome.tabs.remove(tab.id);
          } catch (e) {
            // Ignore
          }
        }
      }
    }

    // Create groups first if importing groups
    if (importGroups && groups.length > 0) {
      for (const groupData of groups) {
        try {
          const oldWindowId = groupData.windowId ? parseInt(groupData.windowId.replace('w', '')) : null;
          const newWindowId = oldWindowId ? windowIdMap.get(oldWindowId) : targetWindowId;

          if (!newWindowId) continue;

          // We'll create the group when we create tabs with groupId
          // Store the mapping for later use
          const oldGroupId = groupData.groupId || parseInt(groupData.id.replace('g', ''));
          groupIdMap.set(oldGroupId, {
            windowId: newWindowId,
            title: groupData.name || groupData.title,
            color: groupData.color,
            collapsed: groupData.collapsed
          });
        } catch (e) {
          result.errors.push(`Failed to prepare group ${groupData.name}: ${e.message}`);
        }
      }
    }

    // Create tabs in batches to avoid overwhelming the browser
    const BATCH_SIZE = 10;
    const tabsToCreate = [];

    for (const tabData of tabs) {
      // Skip restricted URLs
      if (tabData.url && (
        tabData.url.startsWith('chrome://') ||
        tabData.url.startsWith('edge://') ||
        tabData.url.startsWith('about:') ||
        tabData.url.startsWith('chrome-extension://')
      )) {
        result.errors.push(`Skipped restricted URL: ${tabData.url}`);
        continue;
      }

      // Determine target window
      const oldWindowId = tabData.windowId ? parseInt(tabData.windowId.replace('w', '')) : null;
      const newWindowId = oldWindowId ? windowIdMap.get(oldWindowId) : targetWindowId;

      if (!newWindowId) {
        continue;
      }

      tabsToCreate.push({
        url: tabData.url || 'about:blank',
        windowId: newWindowId,
        pinned: tabData.pinned || false,
        active: false, // We'll activate the right tab later
        groupId: tabData.groupId,
        groupData: groupIdMap.get(parseInt((tabData.groupId || '-1').toString().replace('g', ''))),
        originalData: tabData
      });
    }

    if (tabsToCreate.length === 0) {
      return result;
    }

    // Create tabs in batches
    const createdGroups = new Map(); // Track created groups per window

    for (let i = 0; i < tabsToCreate.length; i += BATCH_SIZE) {
      const batch = tabsToCreate.slice(i, i + BATCH_SIZE);

      const batchPromises = batch.map(async (tabInfo) => {
        try {
          const createProps = {
            url: tabInfo.url,
            windowId: tabInfo.windowId,
            pinned: tabInfo.pinned,
            active: false
          };

          const newTab = await chrome.tabs.create(createProps);
          result.tabCount++;

          // Add to group if needed
          if (importGroups && tabInfo.groupData) {
            const groupKey = `${tabInfo.windowId}-${tabInfo.groupData.title}`;

            if (!createdGroups.has(groupKey)) {
              // Create new group
              const groupId = await chrome.tabs.group({
                tabIds: [newTab.id],
                createProperties: {
                  windowId: tabInfo.windowId
                }
              });

              // Update group properties
              await chrome.tabGroups.update(groupId, {
                title: tabInfo.groupData.title,
                color: tabInfo.groupData.color,
                collapsed: tabInfo.groupData.collapsed
              });

              createdGroups.set(groupKey, groupId);
              result.groupCount++;
            } else {
              // Add to existing group
              const groupId = createdGroups.get(groupKey);
              await chrome.tabs.group({
                tabIds: [newTab.id],
                groupId: groupId
              });
            }
          }

          return newTab;
        } catch (e) {
          result.errors.push(`Failed to create tab: ${e.message}`);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);

      // Small delay between batches to avoid overwhelming the browser
      if (i + BATCH_SIZE < tabsToCreate.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Clean up default "New Tab" pages in new windows
    if (scope === 'new-windows' && newWindowIds && newWindowIds.length > 0) {
      for (const windowId of newWindowIds) {
        try {
          const windowTabs = await chrome.tabs.query({ windowId: windowId });
          // Find and remove any "New Tab" pages (chrome://newtab/)
          for (const tab of windowTabs) {
            if (tab.url === 'chrome://newtab/' ||
                (tab.url === '' && tab.title === 'New Tab') ||
                (tab.pendingUrl === 'chrome://newtab/')) {
              try {
                await chrome.tabs.remove(tab.id);
              } catch (e) {
                // Can't remove if it's the last tab, which is fine
              }
            }
          }
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }

  } catch (error) {
    console.error('Failed to import tabs and groups:', error);
    result.errors.push(error.message);
  }

  return result;
}

async function importRules(rules) {
  const result = { imported: 0, errors: [] };

  try {
    // Load current rules
    await loadRules();

    for (const ruleData of rules) {
      try {
        // Check if rule with same name exists
        const existingRule = state.rules.find(r => r.name === ruleData.name);

        if (existingRule) {
          // Update existing rule
          const updatedRule = {
            ...existingRule,
            ...ruleData,
            id: existingRule.id, // Keep original ID
            updatedAt: Date.now()
          };

          const index = state.rules.findIndex(r => r.id === existingRule.id);
          state.rules[index] = updatedRule;
        } else {
          // Add new rule
          const newRule = {
            ...ruleData,
            id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };

          state.rules.push(newRule);
        }

        result.imported++;
      } catch (e) {
        result.errors.push(`Failed to import rule "${ruleData.name}": ${e.message}`);
      }
    }

    // Save updated rules
    await chrome.storage.local.set({ rules: state.rules });

    // Update scheduler for all rules
    for (const rule of state.rules) {
      if (rule.enabled) {
        await scheduler.setupRule(rule);
      }
    }

  } catch (error) {
    console.error('Failed to import rules:', error);
    result.errors.push(error.message);
  }

  return result;
}

async function importSnoozedTabs(snoozedTabs) {
  const result = { imported: 0, errors: [] };

  try {
    for (const tabData of snoozedTabs) {
      try {
        // Skip if URL is restricted
        if (tabData.url && (
          tabData.url.startsWith('chrome://') ||
          tabData.url.startsWith('edge://') ||
          tabData.url.startsWith('about:')
        )) {
          result.errors.push(`Skipped restricted snoozed URL: ${tabData.url}`);
          continue;
        }

        // Add to snoozed tabs
        const snoozedTab = {
          ...tabData,
          id: `snoozed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          snoozedAt: Date.now()
        };

        state.snoozedTabs.push(snoozedTab);
        result.imported++;
      } catch (e) {
        result.errors.push(`Failed to import snoozed tab: ${e.message}`);
      }
    }

    // Save snoozed tabs
    await chrome.storage.local.set({ snoozedTabs: state.snoozedTabs });

  } catch (error) {
    console.error('Failed to import snoozed tabs:', error);
    result.errors.push(error.message);
  }

  return result;
}

// ============================================================================
// Startup
// ============================================================================

async function startMonitoring() {
  console.log('TabMaster Pro monitoring started');
}

// Initialize state on script load
(async function initializeOnLoad() {
  try {
    await loadRules();
    await loadSettings();
    await loadActivityLog();
    await loadDomainCategories();
    console.log('Initial state loaded');
  } catch (error) {
    console.error('Error loading initial state:', error);
  }
})();

// Listen for test mode changes
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'local' && changes.testModeActive) {
    const testModeActive = changes.testModeActive.newValue;
    const wasActive = changes.testModeActive.oldValue;

    if (testModeActive && !wasActive) {
      // Entering test mode - snapshot and disable production rules
      console.log('Entering test mode - disabling production rules');

      // Save snapshot of current rules state
      const rulesSnapshot = state.rules.map(r => ({
        id: r.id,
        enabled: r.enabled
      }));
      await chrome.storage.local.set({ rulesSnapshot });

      // Disable all non-test rules
      for (const rule of state.rules) {
        if (!rule.flags?.test && rule.enabled) {
          console.log(`Disabling production rule: ${rule.name}`);
          rule.enabled = false;
          // Remove from scheduler
          scheduler.removeRule(rule.id);
        }
      }

      // Save the disabled state
      await chrome.storage.local.set({ rules: state.rules });

    } else if (!testModeActive && wasActive) {
      // Exiting test mode - restore production rules
      console.log('Exiting test mode - restoring production rules');

      // Get the snapshot
      const { rulesSnapshot } = await chrome.storage.local.get('rulesSnapshot');

      if (rulesSnapshot) {
        // Restore original enabled states
        for (const snapshot of rulesSnapshot) {
          const rule = state.rules.find(r => r.id === snapshot.id);
          if (rule && rule.enabled !== snapshot.enabled) {
            console.log(`Restoring rule ${rule.name} enabled state to ${snapshot.enabled}`);
            rule.enabled = snapshot.enabled;

            // Re-setup scheduler if rule is enabled
            if (rule.enabled) {
              await scheduler.setupRule(rule);
            }
          }
        }

        // Save restored state and clean up
        await chrome.storage.local.set({ rules: state.rules });
        await chrome.storage.local.remove('rulesSnapshot');
      }
    }
  }
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    state,
    executeRule,
    previewRule,
    scheduler
  };
}