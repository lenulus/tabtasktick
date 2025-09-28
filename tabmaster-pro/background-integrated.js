// Background Service Worker for TabMaster Pro
// Integrated with new Rules Engine 2.0 (engine.js + scheduler.js)

import { runRules, previewRule as previewRuleEngine, buildIndices } from './lib/engine.js';
import { createChromeScheduler } from './lib/scheduler.js';
import { checkIsDupe } from './lib/predicate.js';

console.log('Background service worker loaded with Rules Engine 2.0');

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

// Create scheduler instance
const scheduler = createChromeScheduler(chrome, async (trigger) => {
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
});

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
  if (!rule || !rule.enabled) {
    console.error('executeRule - Rule not found or disabled:', ruleId);
    console.error('Available rules:', state.rules.map(r => ({ id: r.id, name: r.name, enabled: r.enabled })));
    return { success: false, error: 'Rule not found or disabled' };
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
      // Add category from domain mapping
      tab.category = getCategoryForDomain(tab.url);
    });
    
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
    const results = await runRules([rule], context, {
      dryRun: false,
      skipPinned: rule.flags?.skipPinned !== false
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
      tab.category = getCategoryForDomain(tab.url);
    });
    
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
  checkImmediateTriggers('tab.created');
});

// Handle tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    checkImmediateTriggers('tab.updated');
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
function checkImmediateTriggers(event) {
  const immediateRules = state.rules.filter(r => 
    r.enabled && r.trigger?.immediate
  );
  
  for (const rule of immediateRules) {
    scheduler.scheduleImmediate(rule.id);
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

let domainCategories = {};

async function loadDomainCategories() {
  const { domainCategories: saved } = await chrome.storage.local.get('domainCategories');
  if (saved) {
    domainCategories = saved;
  } else {
    // Initialize with default categories
    domainCategories = {
      'youtube.com': 'video',
      'netflix.com': 'video',
      'twitch.tv': 'video',
      'github.com': 'dev',
      'stackoverflow.com': 'dev',
      'reddit.com': 'social',
      'twitter.com': 'social',
      'x.com': 'social',
      'facebook.com': 'social',
      'instagram.com': 'social',
      'linkedin.com': 'social',
      'gmail.com': 'email',
      'outlook.com': 'email',
      'nytimes.com': 'news',
      'cnn.com': 'news',
      'bbc.com': 'news',
      'amazon.com': 'shopping',
      'ebay.com': 'shopping'
    };
    await chrome.storage.local.set({ domainCategories });
  }
}

function getCategoryForDomain(url) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    
    // Check exact match
    if (domainCategories[domain]) {
      return domainCategories[domain];
    }
    
    // Check parent domain
    const parts = domain.split('.');
    if (parts.length > 2) {
      const parentDomain = parts.slice(-2).join('.');
      if (domainCategories[parentDomain]) {
        return domainCategories[parentDomain];
      }
    }
    
    return 'unknown';
  } catch (e) {
    return 'unknown';
  }
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
          const enhancedTabs = tabs.map(tab => ({
            ...tab,
            timeData: tabTimeData.get(tab.id) || null,
            category: getCategoryForDomain(tab.url)
          }));
          
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
          const groupResult = await groupTabsByDomain();
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
          const wakeResult = await restoreSnoozedTab(request.tabId);
          sendResponse(wakeResult);
          break;
          
        case 'wakeAllSnoozed':
          const wakeAllResult = await wakeAllSnoozedTabs();
          sendResponse(wakeAllResult);
          break;

        case 'deleteSnoozedTab':
          // Delete a single snoozed tab by ID or URL
          const tabIdToDelete = request.tabId;
          const beforeDeleteCount = state.snoozedTabs.length;

          // Find and remove the tab
          state.snoozedTabs = state.snoozedTabs.filter(tab => {
            // Match by either ID or URL
            return tab.id !== tabIdToDelete && tab.url !== tabIdToDelete;
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

// Group tabs by domain
async function groupTabsByDomain() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const domainMap = new Map();
  const existingGroups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });

  // Build a map of existing groups by domain title
  const groupsByDomain = new Map();
  for (const group of existingGroups) {
    if (group.title) {
      groupsByDomain.set(group.title, group.id);
    }
  }

  // Group ungrouped tabs by domain
  for (const tab of tabs) {
    if (tab.groupId > 0) continue; // Skip already grouped tabs

    try {
      const url = new URL(tab.url);
      const domain = url.hostname;

      if (!domainMap.has(domain)) {
        domainMap.set(domain, []);
      }
      domainMap.get(domain).push(tab.id);
    } catch {
      // Skip invalid URLs
    }
  }

  // Add tabs to existing groups or create new ones
  let groupsCreated = 0;
  let groupsReused = 0;
  let totalTabsGrouped = 0;
  const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
  let colorIndex = existingGroups.length; // Start color index after existing groups

  for (const [domain, tabIds] of domainMap) {
    if (tabIds.length >= 2 || (tabIds.length === 1 && groupsByDomain.has(domain))) {
      let groupId;

      // Check if a group with this domain already exists
      if (groupsByDomain.has(domain)) {
        // Add tabs to existing group
        groupId = groupsByDomain.get(domain);
        await chrome.tabs.group({
          tabIds: tabIds,
          groupId: groupId
        });
        groupsReused++;
      } else if (tabIds.length >= 2) {
        // Create new group only if we have multiple tabs
        groupId = await chrome.tabs.group({ tabIds });

        await chrome.tabGroups.update(groupId, {
          title: domain,
          color: colors[colorIndex % colors.length],
          collapsed: false
        });

        colorIndex++;
        groupsCreated++;
        groupsByDomain.set(domain, groupId); // Track for potential reuse
      } else {
        // Single tab with no existing group - skip
        continue;
      }

      totalTabsGrouped += tabIds.length;
      state.statistics.tabsGrouped += tabIds.length;
    }
  }

  await chrome.storage.local.set({ statistics: state.statistics });

  // Log activity
  if (groupsCreated > 0 || groupsReused > 0) {
    const message = `Created ${groupsCreated} new groups, reused ${groupsReused} existing groups with ${totalTabsGrouped} tabs`;
    logActivity('group', message, 'manual');
  }

  return { groupsCreated, groupsReused, totalTabsGrouped };
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

// Restore a snoozed tab
async function restoreSnoozedTab(tabId) {
  const tabIndex = state.snoozedTabs.findIndex(t => t.id === tabId);
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

  logActivity('snooze', `Restored snoozed tab: ${snoozedTab.title}`, 'manual');

  return { success: true };
}

// Wake all snoozed tabs
async function wakeAllSnoozedTabs() {
  const count = state.snoozedTabs.length;
  if (count === 0) {
    return { success: true, count: 0 };
  }

  // Create all tabs and restore group associations
  for (const snoozedTab of state.snoozedTabs) {
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
      const newWindow = await chrome.windows.create();
      targetWindowId = newWindow.id;
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
    console.log('Initial state loaded');
  } catch (error) {
    console.error('Error loading initial state:', error);
  }
})();

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    state,
    executeRule,
    previewRule,
    scheduler
  };
}