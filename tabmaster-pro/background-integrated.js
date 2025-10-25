// Background Service Worker for TabMaster Pro
// Integrated with new Rules Engine 2.0 (engine.js + scheduler.js)

// Import V2 engine (V1 removed in Phase 7.2)
import * as engine from './lib/engine.v2.services.js';

import { createChromeScheduler } from './lib/scheduler.js';
import * as SnoozeService from './services/execution/SnoozeService.js';
import * as WindowService from './services/execution/WindowService.js';
import * as ExportImportService from './services/ExportImportService.js';
import { getTabStatistics, extractDomain, normalizeUrlForDuplicates, extractOrigin } from './services/selection/selectTabs.js';
import { getCurrentWindowId } from './services/TabGrouping.js';
import { getCategoriesForDomain } from './lib/domain-categories.js';

// Phase 8.3: Import snooze operation services for proper message routing
import { detectSnoozeOperations } from './services/selection/detectSnoozeOperations.js';
import { executeSnoozeOperations } from './services/execution/executeSnoozeOperations.js';

// Phase 8.4: Import ScheduledExportService for automatic backups
import * as ScheduledExportService from './services/execution/ScheduledExportService.js';

// TabTaskTick Phase 2.6: Import services for message handlers
import * as CollectionService from './services/execution/CollectionService.js';
import * as FolderService from './services/execution/FolderService.js';
import * as TabService from './services/execution/TabService.js';
import * as TaskService from './services/execution/TaskService.js';
import { selectCollections } from './services/selection/selectCollections.js';
import { selectTasks } from './services/selection/selectTasks.js';

// TabTaskTick Phase 6: Import orchestration services
import * as CaptureWindowService from './services/execution/CaptureWindowService.js';
import * as RestoreCollectionService from './services/execution/RestoreCollectionService.js';
import * as TaskExecutionService from './services/execution/TaskExecutionService.js';
import { initialize as initializeDB } from './services/utils/db.js';
import {
  getCollection,
  getCompleteCollection,
  getFoldersByCollection,
  getTab,
  getTabsByFolder,
  getTask,
  findTabByRuntimeId
} from './services/utils/storage-queries.js';

console.log('Background service worker loaded with Rules Engine V2');

// Get the engine's functions (V2 only)
function getEngine() {
  return {
    runRules: engine.runRules,
    previewRule: engine.previewRule,
    executeActions: engine.executeActions
  };
}

/**
 * Build context for engine execution
 * Uses SelectionService's buildRuleContext logic for consistency
 * @param {Array} tabs - Array of tabs
 * @param {Array} windows - Array of windows
 * @returns {Object} Context object with tabs, windows, chrome, and idx
 */
function buildContextForEngine(tabs, windows) {
  const byDomain = {};
  const byOrigin = {};
  const byDupeKey = {};
  const byCategory = {};

  // Enhance tabs with derived fields and build indices
  for (const tab of tabs) {
    tab.domain = tab.domain || extractDomain(tab.url);
    tab.dupeKey = tab.dupeKey || normalizeUrlForDuplicates(tab.url);
    tab.origin = tab.origin || extractOrigin(tab.referrer || '');

    // Get categories for this domain
    const categories = getCategoriesForDomain(tab.domain);
    tab.category = categories.length > 0 ? categories[0] : 'unknown';
    tab.categories = categories.length > 0 ? categories : ['unknown'];

    // Calculate age - prefer createdAt (from test data) over lastAccessed
    if (tab.createdAt) {
      tab.age = Date.now() - tab.createdAt;
    } else if (tab.lastAccessed) {
      tab.age = Date.now() - tab.lastAccessed;
    }

    // Calculate time since last access
    if (tab.last_access) {
      tab.last_access = Date.now() - tab.last_access;
    }

    // Add to indices
    (byDomain[tab.domain] ||= []).push(tab);
    (byOrigin[tab.origin] ||= []).push(tab);
    (byDupeKey[tab.dupeKey] ||= []).push(tab);
    (byCategory[tab.category] ||= []).push(tab);
  }

  return {
    tabs,
    windows,
    chrome,
    idx: { byDomain, byOrigin, byDupeKey, byCategory }
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
  tabGroups: new Map(),
  activityLog: [], // Track recent activities
  testEngine: 'v1', // Track which engine to use for tests
  settings: {
    skipPinnedByDefault: true, // Safe default: protect pinned tabs
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
  await SnoozeService.initialize();
  await ScheduledExportService.initialize(); // Phase 8.4: Initialize automatic backups
  await initializeDB(); // TabTaskTick Phase 2.6: Initialize IndexedDB
  await WindowService.rebuildCollectionCache(); // TabTaskTick Phase 2.6: Rebuild collection cache
  await setupContextMenus();
  await loadSettings();
  await loadRules();
  await loadActivityLog();
  await initializeTabTimeTracking();
  await initializeScheduler();
  await checkAndMigrateTabs();
});

chrome.runtime.onStartup.addListener(async () => {
  await loadDomainCategories();
  await setupContextMenus(); // Ensure context menus are set up on startup
  await loadSettings();
  await loadRules();
  await SnoozeService.initialize();
  await ScheduledExportService.initialize(); // Phase 8.4: Initialize automatic backups
  await initializeDB(); // TabTaskTick Phase 2.6: Initialize IndexedDB
  await WindowService.rebuildCollectionCache(); // TabTaskTick Phase 2.6: Rebuild collection cache
  await loadActivityLog();
  await initializeTabTimeTracking();
  await initializeScheduler();
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
// Pinned Tab Protection Helper
// ============================================================================

/**
 * Inject pinned condition into rule when skipPinnedByDefault is enabled
 * This allows UI to enforce pinned protection without engine having default behavior
 */
function injectPinnedCondition(rule, skipPinned) {
  if (!skipPinned) return rule;

  // Clone rule to avoid mutating original
  const modifiedRule = { ...rule };
  const when = modifiedRule.when || modifiedRule.conditions;

  if (!when) return rule;

  // Add pinned: false condition to existing conditions
  const pinnedCondition = { subject: 'pinned', operator: 'equals', value: false };

  if (when.all) {
    modifiedRule.when = {
      ...when,
      all: [...when.all, pinnedCondition]
    };
  } else if (when.any) {
    // Wrap any in all with pinned condition
    modifiedRule.when = {
      all: [
        { any: when.any },
        pinnedCondition
      ]
    };
  } else {
    // Simple condition, wrap in all
    modifiedRule.when = {
      all: [when, pinnedCondition]
    };
  }

  return modifiedRule;
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
  const { settings, activeEngine } = await chrome.storage.local.get(['settings', 'activeEngine']);
  if (settings) {
    state.settings = { ...state.settings, ...settings };
  }
  // Load the active engine preference
  if (activeEngine) {
    state.testEngine = activeEngine;
    console.log(`Loaded engine preference: ${activeEngine}`);
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
    const { runRules } = getEngine();
    console.log(`Using engine: ${state.testEngine} for rule execution`);

    // Build context for engine using SelectionService
    const context = buildContextForEngine(tabs, windows);
    
    console.log('Running rule with dryRun=false');

    // Track performance for test mode
    const startTime = performance.now();

    // Run the single rule
    // For manual execution, force execution even if rule is disabled
    // Rule executes as-is (deterministic) - pinned condition should be in rule definition
    const results = await runRules([rule], context, {
      dryRun: false,
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
    const { previewRule: previewRuleEngine } = getEngine();
    console.log(`Using engine: ${state.testEngine} for preview`);

    // Build context for engine using SelectionService
    const context = buildContextForEngine(tabs, windows);

    // Use engine's preview function
    const preview = await previewRuleEngine(rule, context, {
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
  // Use service for statistics calculation (services-first architecture)
  const stats = await getTabStatistics();

  // Add snoozed tabs count from the SnoozeService
  const snoozedTabs = await SnoozeService.getSnoozedTabs();
  stats.snoozedTabs = snoozedTabs.length;

  // Add activity statistics from background state
  stats.statistics = state.statistics;

  return stats;
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
    const { runRules } = getEngine();
    console.log(`Using engine: ${state.testEngine} for executing all rules`);

    // Build context for engine using SelectionService
    const context = buildContextForEngine(tabs, windows);

    // Run all rules
    // Rules execute as-is (deterministic) - pinned condition should be in rule definitions
    const results = await runRules(enabledRules, context, {
      dryRun: false
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

// ============================================================================
// Window Event Handling for Collection Binding (TabTaskTick Phase 2.7)
// ============================================================================

// Handle window removal - unbind any bound collection
chrome.windows.onRemoved.addListener(async (windowId) => {
  console.log(`[Phase 2.7] chrome.windows.onRemoved fired for window ${windowId}`);

  // Diagnostic: Set a flag in storage to track that event fired
  try {
    await chrome.storage.local.set({
      lastWindowRemovedEvent: {
        windowId,
        timestamp: Date.now()
      }
    });
  } catch (error) {
    console.error('[Phase 2.7] Failed to set diagnostic flag:', error);
  }

  try {
    // Query database directly to find any collection bound to this window
    // Note: We can't rely on cache because it might not be populated if binding
    // happened in a different context (e.g., from a page vs background script)
    const allCollections = await selectCollections({});
    console.log(`[Phase 2.7] Found ${allCollections.length} total collections`);
    const activeCollections = allCollections.filter(c => c.isActive === true);
    console.log(`[Phase 2.7] Found ${activeCollections.length} active collections`);
    const boundCollection = activeCollections.find(c => c.windowId === windowId);
    console.log(`[Phase 2.7] Bound collection for window ${windowId}:`, boundCollection ? boundCollection.id : 'none');

    if (boundCollection) {
      console.log(`[Phase 2.7] Window ${windowId} closing, unbinding collection ${boundCollection.id}`);
      await WindowService.unbindCollectionFromWindow(boundCollection.id);
      console.log(`[Phase 2.7] Collection ${boundCollection.id} unbound from closed window ${windowId}`);
    } else {
      console.log(`[Phase 2.7] No bound collection found for window ${windowId}, skipping unbind`);
    }
  } catch (error) {
    console.error(`[Phase 2.7] Failed to unbind collection on window close:`, error);
  }
});

// Optional: Track window focus for collection activity
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  // Skip WINDOW_ID_NONE (-1) which indicates no window has focus
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;

  try {
    // Query database directly to find any collection bound to this window
    const allCollections = await selectCollections({});
    const boundCollection = allCollections.find(c => c.windowId === windowId && c.isActive === true);

    if (boundCollection) {
      // Update lastAccessed timestamp via CollectionService
      await CollectionService.updateCollection(boundCollection.id, {
        metadata: {
          ...boundCollection.metadata,
          lastAccessed: Date.now()
        }
      });
    }
  } catch (error) {
    // Focus changes are frequent, only log errors in debug mode
    if (state.settings.debugMode) {
      console.error(`Failed to update collection on focus change:`, error);
    }
  }
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
// Action Helper - Routes all actions through engine for consistency
// ============================================================================

/**
 * Execute tab actions through the engine for single source of truth
 * @param {string} action - The action type (close, group, bookmark, move, etc.)
 * @param {number[]} tabIds - Array of tab IDs to act on
 * @param {object} params - Action-specific parameters
 * @returns {Promise<object>} - Execution results
 */
async function executeActionViaEngine(action, tabIds, params = {}) {
  // Get all tabs and windows for context
  const allTabs = await chrome.tabs.query({});
  const windows = await chrome.windows.getAll();

  // Enhance tabs with time data
  allTabs.forEach(tab => {
    const timeData = tabTimeData.get(tab.id);
    if (timeData) {
      if (timeData.createdAt && !tab.createdAt) {
        Object.assign(tab, {
          createdAt: timeData.createdAt,
          age: Date.now() - timeData.createdAt,
          ageHours: (Date.now() - timeData.createdAt) / (1000 * 60 * 60)
        });
      }
    }
    tab.last_access = tab.lastAccessed || timeData?.lastAccessed || null;
  });

  // Get the current engine
  const { runRules } = getEngine();

  // Build context for engine using SelectionService
  // Note: Pass all tabs to context, but build indices only for target tabs
  const filteredTabs = allTabs.filter(t => tabIds.includes(t.id));
  const contextForFiltered = buildContextForEngine(filteredTabs, windows);

  // But use all tabs in context for rule evaluation
  const context = {
    tabs: allTabs,
    windows,
    chrome,
    idx: contextForFiltered.idx
  };

  // Create a temporary rule that matches only our target tabs
  const tempRule = {
    id: `temp-${action}-${Date.now()}`,
    name: `Manual ${action} action`,
    enabled: true,
    conditions: {
      // Match only tabs with IDs in our list
      any: tabIds.map(id => ({ eq: ['tab.id', id] }))
    },
    then: [{ action, ...params }]
  };

  // Execute through engine
  // Don't inject pinned condition for manual operations on user-selected tabs
  const results = await runRules([tempRule], context, {
    dryRun: false,
    forceExecution: true
  });

  // Log activity
  const totalActions = results.totalActions || 0;
  if (totalActions > 0) {
    logActivity(action, `${action} ${tabIds.length} tabs`, 'manual');
  }

  return results;
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

        // Tab operations - all routed through engine for consistency
        case 'closeTabs':
          const closeResult = await executeActionViaEngine('close', request.tabIds);
          sendResponse({ success: true, result: closeResult });
          break;

        case 'groupTabs':
          const groupParams = {};
          if (request.groupName) groupParams.name = request.groupName;
          if (request.color) groupParams.color = request.color;
          if (request.callerWindowId) groupParams.callerWindowId = request.callerWindowId;
          const groupResult = await executeActionViaEngine('group', request.tabIds, groupParams);
          sendResponse({ success: true, result: groupResult });
          break;

        case 'snoozeTabs':
          // Convert minutes to milliseconds for backward compatibility
          const duration = request.minutes ? request.minutes * 60 * 1000 : request.duration;
          const snoozeUntil = Date.now() + duration;
          // Get restoration mode from settings (explicit parameter passing)
          const restorationMode = request.restorationMode || state.settings.tabRestorationMode || 'original';
          await SnoozeService.snoozeTabs(request.tabIds, snoozeUntil, {
            reason: request.reason,
            restorationMode,
            sourceWindowId: request.sourceWindowId,
            windowSnoozeId: request.windowSnoozeId
          });
          sendResponse({ success: true });
          break;

        case 'detectSnoozeOperations':
          // Phase 8.3: Smart window detection service
          // UI sends tab IDs, service determines if it's a window snooze or individual tabs
          const detection = await detectSnoozeOperations(request.tabIds);
          sendResponse(detection);
          break;

        case 'executeSnoozeOperations':
          // Phase 8.3: Execute snooze operations (window or tabs)
          // This is the ONE execution path for all snooze operations from UI
          const execOptions = {
            ...request.options,
            // Apply settings for UI operations (convenience defaults)
            // Rules should pass explicit parameters and won't hit this path
            restorationMode: request.options?.restorationMode || state.settings.tabRestorationMode || 'original'
          };
          const snoozeExecResult = await executeSnoozeOperations({
            operations: request.operations,
            snoozeUntil: request.snoozeUntil,
            options: execOptions
          });
          sendResponse(snoozeExecResult);
          break;

        case 'suspendInactiveTabs':
          // Suspend inactive, non-pinned tabs via engine for consistency
          const engine = getEngine();
          const tempSuspendRule = {
            id: 'temp-suspend-inactive',
            name: 'Suspend Inactive Tabs',
            enabled: true,
            conditions: {
              all: [
                { subject: 'active', operator: 'equals', value: false },
                { subject: 'pinned', operator: 'equals', value: false }
              ]
            },
            then: [{ action: 'suspend' }]
          };
          const suspendContext = await buildContext();
          if (request.windowId) {
            suspendContext.tabs = suspendContext.tabs.filter(t => t.windowId === request.windowId);
          }
          // Rule already has pinned: false condition hardcoded
          const suspendResult = await engine.runRules([tempSuspendRule], suspendContext);
          sendResponse({
            success: true,
            suspended: suspendResult.totalActions || 0
          });
          break;

        case 'bookmarkTabs':
          const bookmarkParams = {};
          if (request.folder) bookmarkParams.folder = request.folder;
          const bookmarkResult = await executeActionViaEngine('bookmark', request.tabIds, bookmarkParams);
          sendResponse({ success: true, result: bookmarkResult });
          break;

        case 'moveToWindow':
          const moveParams = {
            windowId: request.windowId || request.targetWindowId
          };
          const moveResult = await executeActionViaEngine('move', request.tabIds, moveParams);
          sendResponse({ success: true, result: moveResult });
          break;

        case 'ungroupTabs':
          // Ungroup tabs - direct Chrome API call (not an engine action)
          await chrome.tabs.ungroup(request.tabIds);
          logActivity('ungroup', `Ungrouped ${request.tabIds.length} tabs`, 'manual');
          sendResponse({ success: true });
          break;

        case 'closeDuplicates':
          const closedCount = await findAndCloseDuplicates();
          sendResponse(closedCount);
          break;
          
        case 'groupByDomain':
          // Get parameters from request
          console.log('[groupByDomain] request:', request);
          const callerWindowId = request.callerWindowId || null;
          const currentWindowOnly = request.currentWindowOnly || false;
          const windowId = request.windowId || null;
          console.log('[groupByDomain] callerWindowId:', callerWindowId, 'currentWindowOnly:', currentWindowOnly, 'windowId:', windowId);
          const groupByDomainResult = await groupByDomain(callerWindowId, currentWindowOnly, windowId);
          sendResponse(groupByDomainResult);
          break;
          
        case 'snoozeCurrent':
          const snoozeResult = await quickSnoozeCurrent(request.minutes);
          sendResponse(snoozeResult);
          break;
          
        case 'getSnoozedTabs':
          const snoozedTabs = await SnoozeService.getSnoozedTabs();
          sendResponse(snoozedTabs);
          break;
          
        case 'wakeSnoozedTab':
          await SnoozeService.wakeTabs([request.tabId]);
          sendResponse({ success: true });
          break;
          
        case 'wakeAllSnoozed':
          const allSnoozed = await SnoozeService.getSnoozedTabs();

          // Separate window snoozes from individual tab snoozes
          const windowSnoozes = new Map(); // windowSnoozeId -> tab ids
          const individualTabs = [];

          for (const tab of allSnoozed) {
            if (tab.windowSnoozeId) {
              if (!windowSnoozes.has(tab.windowSnoozeId)) {
                windowSnoozes.set(tab.windowSnoozeId, []);
              }
              windowSnoozes.get(tab.windowSnoozeId).push(tab.id);
            } else {
              individualTabs.push(tab.id);
            }
          }

          // Restore window snoozes first (recreates windows)
          for (const [windowSnoozeId, tabIds] of windowSnoozes) {
            try {
              await WindowService.restoreWindow(windowSnoozeId);
            } catch (error) {
              console.error(`Failed to restore window ${windowSnoozeId}:`, error);
              // Fall back to individual tab wake if window restore fails
              await SnoozeService.wakeTabs(tabIds);
            }
          }

          // Then wake individual tabs (opens in current window)
          if (individualTabs.length > 0) {
            await SnoozeService.wakeTabs(individualTabs);
          }

          sendResponse({
            success: true,
            count: allSnoozed.length,
            windows: windowSnoozes.size,
            individualTabs: individualTabs.length
          });
          break;

        case 'deleteSnoozedTab':
          await SnoozeService.deleteSnoozedTab(request.tabId);
          sendResponse({ success: true });
          break;

        case 'restoreWindow':
          try {
            const restoreResult = await WindowService.restoreWindow(request.windowSnoozeId);
            sendResponse({ success: true, result: restoreResult });
          } catch (error) {
            console.error('Failed to restore window:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'deleteWindow':
          try {
            // Get all tabs for this window snooze
            const allSnoozed = await SnoozeService.getSnoozedTabs();
            const windowTabs = allSnoozed.filter(t => t.windowSnoozeId === request.windowSnoozeId);
            const tabIds = windowTabs.map(t => t.id);

            // Delete all tabs in window snooze
            for (const tabId of tabIds) {
              await SnoozeService.deleteSnoozedTab(tabId);
            }

            // Delete window metadata
            const stored = await chrome.storage.local.get('windowMetadata');
            const allMetadata = stored.windowMetadata || {};
            delete allMetadata[request.windowSnoozeId];
            await chrome.storage.local.set({ windowMetadata: allMetadata });

            sendResponse({ success: true, deletedCount: tabIds.length });
          } catch (error) {
            console.error('Failed to delete window:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'clearTestSnoozedTabs':
          const testPatterns = request.patterns || [];
          const allTestSnoozed = await SnoozeService.getSnoozedTabs();
          const tabsToClear = allTestSnoozed.filter(tab =>
            testPatterns.some(pattern => tab.url?.includes(pattern))
          );
          const removedCount = tabsToClear.length;
          for (const tab of tabsToClear) {
            await SnoozeService.deleteSnoozedTab(tab.id);
          }
          console.log(`Cleared ${removedCount} test snoozed tabs`);
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
          const testTabs = (Array.isArray(request.tabs) ? request.tabs : null) || await chrome.tabs.query({});
          const testWindows = await chrome.windows.getAll();
          const testContext = buildContextForEngine(testTabs, testWindows);
          const dupeGroups = [];

          for (const [dupeKey, tabs] of Object.entries(testContext.idx.byDupeKey)) {
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
          // Call ExportImportService with explicit parameters
          const exportResult = await ExportImportService.exportData(
            request.options,
            state,
            tabTimeData
          );
          sendResponse(exportResult);
          break;

        case 'importData':
          // Call ExportImportService with explicit context
          const importResult = await ExportImportService.importData(
            request.data,
            request.options,
            state,
            loadRules,
            scheduler
          );
          sendResponse(importResult);
          break;

        // Scheduled Backup Operations (Phase 8.4)
        case 'getScheduledExportConfig':
          const config = await ScheduledExportService.getScheduledExportConfig();
          sendResponse({ config });
          break;

        case 'enableScheduledExports':
          await ScheduledExportService.enableScheduledExports(request.config);
          sendResponse({ success: true });
          break;

        case 'disableScheduledExports':
          await ScheduledExportService.disableScheduledExports();
          sendResponse({ success: true });
          break;

        case 'triggerManualBackup':
          const exportState = {
            rules: state.rules,
            snoozedTabs: await SnoozeService.getSnoozedTabs(),
            settings: state.settings,
            statistics: state.statistics
          };
          const backupResult = await ScheduledExportService.triggerManualBackup(exportState, tabTimeData);
          sendResponse(backupResult);
          break;

        case 'getBackupHistory':
          const backups = await ScheduledExportService.getBackupHistory();
          sendResponse({ backups });
          break;

        case 'deleteBackup':
          await ScheduledExportService.deleteBackup(request.downloadId, request.deleteFile);
          sendResponse({ success: true });
          break;

        case 'getExportState':
          // Return FULL state for creating complete snapshots
          sendResponse({
            state: {
              rules: state.rules,
              snoozedTabs: await SnoozeService.getSnoozedTabs(),
              settings: state.settings,
              statistics: state.statistics
            },
            tabTimeData
          });
          break;

        case 'validateBackup':
          const validation = await ScheduledExportService.validateBackup(request.backup);
          sendResponse(validation);
          break;

        // ================================================================
        // TabTaskTick Phase 3.1: Side Panel Management
        // ================================================================

        case 'setSidePanel':
          // Swap between test panel and TabTaskTick panel
          try {
            const panelPath = request.panel === 'tabtasktick'
              ? 'sidepanel/panel.html'
              : 'test-panel/test-panel.html';

            await chrome.sidePanel.setOptions({
              path: panelPath,
              enabled: true
            });

            // Open the panel if requested
            if (request.open) {
              const window = await chrome.windows.getLastFocused();
              await chrome.sidePanel.open({ windowId: window.id });
            }

            sendResponse({ success: true, panel: request.panel });
          } catch (error) {
            console.error('Failed to set side panel:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        // ================================================================
        // TabTaskTick Phase 2.6: Collection, Folder, Tab, Task Operations
        // ================================================================

        // Collection Operations
        case 'createCollection':
          const createdCollection = await CollectionService.createCollection(request.params);
          sendResponse({ success: true, collection: createdCollection });
          break;

        case 'updateCollection':
          const updatedCollection = await CollectionService.updateCollection(request.id, request.updates);
          sendResponse({ success: true, collection: updatedCollection });
          break;

        case 'deleteCollection':
          await CollectionService.deleteCollection(request.id);
          sendResponse({ success: true });
          break;

        case 'getCollection':
          const collection = await getCollection(request.id || request.collectionId);
          sendResponse({ success: true, collection });
          break;

        case 'getCollections':
          const collections = await selectCollections(request.filters || {});
          sendResponse({ success: true, collections });
          break;

        case 'getCompleteCollection':
          const completeCollection = await getCompleteCollection(request.id || request.collectionId);
          sendResponse({ success: true, collection: completeCollection });
          break;

        // Folder Operations
        case 'createFolder':
          const createdFolder = await FolderService.createFolder({
            ...request.params,
            collectionId: request.collectionId || request.params.collectionId
          });
          sendResponse({ success: true, folder: createdFolder });
          break;

        case 'updateFolder':
          const updatedFolder = await FolderService.updateFolder(request.id, request.updates);
          sendResponse({ success: true, folder: updatedFolder });
          break;

        case 'deleteFolder':
          await FolderService.deleteFolder(request.id);
          sendResponse({ success: true });
          break;

        case 'getFoldersByCollection':
          const collectionFolders = await getFoldersByCollection(request.collectionId);
          sendResponse({ success: true, folders: collectionFolders });
          break;

        // Tab Operations
        case 'createTab':
          const createdTab = await TabService.createTab({
            ...request.params,
            folderId: request.folderId || request.params.folderId
          });
          sendResponse({ success: true, tab: createdTab });
          break;

        case 'updateTab':
          const tabId = request.tabId || request.id;
          const updatedTab = await TabService.updateTab(tabId, request.updates);
          sendResponse({ success: true, tab: updatedTab });
          break;

        case 'deleteTab':
          await TabService.deleteTab(request.id);
          sendResponse({ success: true });
          break;

        case 'getTab':
          const tabIdOrRuntimeId = request.tabId || request.id;
          let tab;

          // If it's a number, it's a Chrome runtime tab ID
          if (typeof tabIdOrRuntimeId === 'number' || !isNaN(Number(tabIdOrRuntimeId))) {
            tab = await findTabByRuntimeId(Number(tabIdOrRuntimeId));
          } else {
            // Otherwise it's a storage ID (UUID)
            tab = await getTab(tabIdOrRuntimeId);
          }

          sendResponse({ success: true, tab });
          break;

        case 'showNotification':
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon-128.png',
            title: request.title || 'TabMaster Pro',
            message: request.message || ''
          });
          sendResponse({ success: true });
          break;

        case 'getTabsByFolder':
          const folderTabs = await getTabsByFolder(request.folderId);
          sendResponse({ success: true, tabs: folderTabs });
          break;

        // Task Operations
        case 'createTask':
          const createdTask = await TaskService.createTask(request.params);
          sendResponse({ success: true, task: createdTask });
          break;

        case 'updateTask':
          const updatedTask = await TaskService.updateTask(request.id, request.updates);
          sendResponse({ success: true, task: updatedTask });
          break;

        case 'deleteTask':
          await TaskService.deleteTask(request.id);
          sendResponse({ success: true });
          break;

        case 'addTaskComment':
          const taskWithComment = await TaskService.addComment(request.taskId, request.text);
          sendResponse({ success: true, task: taskWithComment });
          break;

        case 'getTasks':
          const tasks = await selectTasks(request.filters || {});
          sendResponse({ success: true, tasks });
          break;

        case 'getTask':
          const task = await getTask(request.id);
          sendResponse({ success: true, task });
          break;

        // TabTaskTick Phase 6: Orchestration service message handlers
        case 'captureWindow':
          const captureResult = await CaptureWindowService.captureWindow({
            windowId: request.windowId,
            metadata: request.metadata,
            keepActive: request.keepActive
          });
          sendResponse({ success: true, ...captureResult });
          break;

        case 'restoreCollection':
          const restoreResult = await RestoreCollectionService.restoreCollection({
            collectionId: request.collectionId,
            createNewWindow: request.createNewWindow,
            windowId: request.windowId,
            focused: request.focused,
            windowState: request.windowState
          });
          sendResponse({ success: true, ...restoreResult });
          break;

        case 'openTaskTabs':
          const openResult = await TaskExecutionService.openTaskTabs(request.taskId);
          sendResponse({ success: true, ...openResult });
          break;

        case 'focusWindow':
          await chrome.windows.update(request.windowId, { focused: true });
          sendResponse({ success: true });
          break;

        // Context Menus (for testing)
        case 'setupContextMenus':
          await setupContextMenus();
          sendResponse({ success: true });
          break;

        case 'getContextMenus':
          const menuItems = await new Promise((resolve) => {
            chrome.contextMenus.getAll((items) => {
              resolve(items);
            });
          });
          sendResponse({ success: true, items: menuItems });
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

// Find and close duplicate tabs - uses engine for consistency
async function findAndCloseDuplicates() {
  // Use engine via runRules to ensure proper tab enhancement and consistent behavior
  const engine = getEngine();

  // Create a temporary rule for manual duplicate closing
  const tempRule = {
    id: 'manual-close-duplicates',
    name: 'Manual Close Duplicates',
    enabled: true,
    conditions: {}, // Empty conditions object matches all tabs
    actions: [{
      action: 'close-duplicates',
      keep: 'oldest' // Keep first instance, close duplicates
    }]
  };

  // Execute via engine.runRules to get proper tab enhancement
  // Inject pinned condition if skipPinnedByDefault is enabled
  const ruleToRun = injectPinnedCondition(tempRule, state.settings.skipPinnedByDefault);
  const result = await engine.runRules(
    [ruleToRun],
    { chrome },
    { dryRun: false }
  );

  // Count actions executed (each closed tab is an action)
  const closedCount = result.totalActions || 0;

  // Update statistics (side effects stay in caller)
  if (closedCount > 0) {
    state.statistics.duplicatesRemoved += closedCount;
    await chrome.storage.local.set({ statistics: state.statistics });

    // Log activity
    logActivity('close', `Closed ${closedCount} duplicate tab${closedCount > 1 ? 's' : ''}`, 'manual');

    // Track history
    for (let i = 0; i < closedCount; i++) {
      await trackTabHistory('closed');
    }
  }

  return closedCount;
}

// Group tabs by domain - uses engine for consistency
async function groupByDomain(callerWindowId = null, currentWindowOnly = false, windowId = null) {
  // Use engine via runRules to ensure proper tab enhancement and consistent behavior
  const engine = getEngine();

  // Build conditions based on whether we want current window only
  let conditions = {};
  if (currentWindowOnly && windowId) {
    conditions = {
      eq: ['tab.windowId', windowId]
    };
  }

  // Create a temporary rule for manual grouping by domain
  const tempRule = {
    id: 'manual-group-by-domain',
    name: 'Manual Group By Domain',
    enabled: true,
    conditions: conditions, // Filter by window if requested
    actions: [{
      action: 'group',
      by: 'domain',
      callerWindowId: callerWindowId // Pass through to groupTabs service
    }]
  };

  // Execute via engine.runRules to get proper tab enhancement
  // Inject pinned condition if skipPinnedByDefault is enabled
  const ruleToRun = injectPinnedCondition(tempRule, state.settings.skipPinnedByDefault);
  const result = await engine.runRules(
    [ruleToRun],
    { chrome },
    { dryRun: false }
  );

  // Count actions executed (each grouped tab is an action)
  const groupedCount = result.totalActions || 0;

  // Update statistics (side effects stay in caller)
  if (groupedCount > 0) {
    state.statistics.tabsGrouped += groupedCount;
    await chrome.storage.local.set({ statistics: state.statistics });

    // Log activity
    logActivity('group', `Grouped ${groupedCount} tab${groupedCount > 1 ? 's' : ''} by domain`, 'manual');
  }

  return { totalTabsGrouped: groupedCount };
}

// Quick snooze current tab
async function quickSnoozeCurrent(minutes = 120) {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab) {
    const snoozeUntil = Date.now() + (minutes * 60 * 1000);
    await SnoozeService.snoozeTabs([activeTab.id], snoozeUntil, 'quick_action');
    logActivity('snooze', `Snoozed current tab for ${minutes} minutes`, 'manual');
    return { success: true, tabId: activeTab.id };
  }
  return { success: false, error: 'No active tab' };
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
    case 'quick_snooze':
      await quickSnoozeCurrent();
      break;

    case 'group_by_domain':
      // Route through engine via groupByDomain (already uses getEngine())
      await groupByDomain();
      break;

    case 'close_duplicates':
      // Route through engine (already uses getEngine())
      await findAndCloseDuplicates();
      break;
  }
});

// ============================================================================
// Context Menus
// ============================================================================

async function setupContextMenus() {
  // Wait for removeAll to complete before creating new menus
  await new Promise((resolve) => {
    chrome.contextMenus.removeAll(resolve);
  });

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

  // Backup menu
  chrome.contextMenus.create({
    id: 'export',
    title: 'Backup Tabs',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'export-current-window',
    parentId: 'export',
    title: 'Backup Current Window',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'export-all-windows',
    parentId: 'export',
    title: 'Backup All Windows',
    contexts: ['page']
  });

  // Window operations menu
  chrome.contextMenus.create({
    id: 'snooze-window',
    title: 'Snooze Window',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'snooze-window-1h',
    parentId: 'snooze-window',
    title: 'For 1 hour',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'snooze-window-3h',
    parentId: 'snooze-window',
    title: 'For 3 hours',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'snooze-window-tomorrow',
    parentId: 'snooze-window',
    title: 'Until tomorrow',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'dedupe-window',
    title: 'Remove Duplicates in Window',
    contexts: ['page']
  });

  // TabTaskTick: Collections & Tasks context menus (Phase 5)
  chrome.contextMenus.create({
    id: 'tabtasktick-separator',
    type: 'separator',
    contexts: ['page', 'action']
  });

  // Tab/Page context menus
  chrome.contextMenus.create({
    id: 'add-to-collection',
    title: 'Add to Collection',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'create-task-for-tab',
    title: 'Create Task for Tab',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'add-note-to-tab',
    title: 'Add Note to Tab',
    contexts: ['page']
  });

  // Action (toolbar icon) context menus
  chrome.contextMenus.create({
    id: 'save-window-as-collection',
    title: 'Save Window as Collection',
    contexts: ['action']
  });

  chrome.contextMenus.create({
    id: 'open-side-panel',
    title: 'Open Side Panel',
    contexts: ['action']
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

/**
 * Export tabs from context menu
 * @param {string} scope - Either 'current-window' or 'all-windows'
 * @param {number} windowId - The window ID (required for current-window scope)
 */
async function exportFromContextMenu(scope, windowId = null) {
  try {
    // Call ExportImportService with appropriate options
    const options = {
      scope,
      currentWindowId: windowId,
      format: 'json',
      includeGroups: true,
      includeRules: true,
      includeSnoozed: true
    };

    const exportData = await ExportImportService.exportData(
      options,
      state,
      tabTimeData
    );

    // ExportImportService returns the raw export data object, not {success, data}
    if (exportData && !exportData.error) {
      // Create a download with the exported data
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const filename = scope === 'current-window'
        ? `tabmaster-window-${windowId}-${timestamp}.json`
        : `tabmaster-all-windows-${timestamp}.json`;

      const content = JSON.stringify(exportData, null, 2);

      // Service workers can't use URL.createObjectURL, so we use data URL instead
      const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(content);

      await chrome.downloads.download({
        url: dataUrl,
        filename,
        saveAs: true
      });
    } else {
      console.error('Export failed:', exportData?.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Failed to export from context menu:', error);
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case 'snooze-1h':
      // Use new options signature with settings applied (convenience defaults)
      await SnoozeService.snoozeTabs([tab.id], Date.now() + 60 * 60 * 1000, {
        reason: 'context_menu_1h',
        restorationMode: state.settings.tabRestorationMode || 'original',
        sourceWindowId: tab.windowId
      });
      break;
    case 'snooze-3h':
      await SnoozeService.snoozeTabs([tab.id], Date.now() + 3 * 60 * 60 * 1000, {
        reason: 'context_menu_3h',
        restorationMode: state.settings.tabRestorationMode || 'original',
        sourceWindowId: tab.windowId
      });
      break;
    case 'snooze-tomorrow':
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      await SnoozeService.snoozeTabs([tab.id], tomorrow.getTime(), {
        reason: 'context_menu_tomorrow',
        restorationMode: state.settings.tabRestorationMode || 'original',
        sourceWindowId: tab.windowId
      });
      break;
    case 'create-rule-for-domain':
      await createRuleForTab(tab, 'domain');
      break;
    case 'create-rule-for-url':
      await createRuleForTab(tab, 'url');
      break;
    case 'export-current-window':
      await exportFromContextMenu('current-window', tab.windowId);
      break;
    case 'export-all-windows':
      await exportFromContextMenu('all-windows');
      break;
    case 'snooze-window-1h':
      // THIN - delegate to WindowService with options (settings applied)
      await WindowService.snoozeWindow(
        tab.windowId,
        1000 * 60 * 60, // 1 hour
        {
          reason: 'context_menu_window_1h',
          restorationMode: state.settings.tabRestorationMode || 'original'
        }
      );
      console.log('Window snoozed for 1 hour');
      break;
    case 'snooze-window-3h':
      // THIN - delegate to WindowService with options (settings applied)
      await WindowService.snoozeWindow(
        tab.windowId,
        1000 * 60 * 60 * 3, // 3 hours
        {
          reason: 'context_menu_window_3h',
          restorationMode: state.settings.tabRestorationMode || 'original'
        }
      );
      console.log('Window snoozed for 3 hours');
      break;
    case 'snooze-window-tomorrow':
      // THIN - delegate to WindowService with options (settings applied)
      const tomorrowWindow = new Date();
      tomorrowWindow.setDate(tomorrowWindow.getDate() + 1);
      tomorrowWindow.setHours(9, 0, 0, 0);
      await WindowService.snoozeWindow(
        tab.windowId,
        tomorrowWindow.getTime() - Date.now(),
        {
          reason: 'context_menu_window_tomorrow',
          restorationMode: state.settings.tabRestorationMode || 'original'
        }
      );
      console.log('Window snoozed until tomorrow');
      break;
    case 'dedupe-window':
      // THIN - delegate to WindowService
      const result = await WindowService.deduplicateWindow(
        tab.windowId,
        'oldest',
        false
      );
      console.log('Window deduplicated:', result);
      break;

    // TabTaskTick: Context menu handlers (Phase 5)
    case 'add-to-collection':
      // Open collection selector modal
      chrome.windows.create({
        url: chrome.runtime.getURL('lib/modals/collection-selector.html') +
          `?tabId=${tab.id}&url=${encodeURIComponent(tab.url)}&title=${encodeURIComponent(tab.title)}`,
        type: 'popup',
        width: 500,
        height: 600
      });
      break;

    case 'create-task-for-tab':
      // Open task creation modal with tab pre-filled
      chrome.windows.create({
        url: chrome.runtime.getURL('lib/modals/task-modal.html') +
          `?summary=${encodeURIComponent(tab.title)}&tabId=${tab.id}&url=${encodeURIComponent(tab.url)}&title=${encodeURIComponent(tab.title)}`,
        type: 'popup',
        width: 600,
        height: 700
      });
      break;

    case 'add-note-to-tab':
      // Open note modal
      chrome.windows.create({
        url: chrome.runtime.getURL('lib/modals/note-modal.html') +
          `?tabId=${tab.id}&url=${encodeURIComponent(tab.url)}&title=${encodeURIComponent(tab.title)}`,
        type: 'popup',
        width: 500,
        height: 400
      });
      break;

    case 'save-window-as-collection':
      // Get current window from the action context (service workers can't use getCurrent)
      const currentWindow = await chrome.windows.getLastFocused({ populate: true });
      // Note: This would require CaptureWindowService from Phase 6
      // For now, show a notification that this feature is coming
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title: 'Feature Coming Soon',
        message: 'Save Window as Collection will be available in Phase 6'
      });
      console.log('Save window as collection - coming in Phase 6');
      break;

    case 'open-side-panel':
      // Open the side panel
      try {
        await chrome.sidePanel.open({ windowId: tab.windowId });
        console.log('Side panel opened');
      } catch (error) {
        console.error('Error opening side panel:', error);
      }
      break;
  }
});

// ============================================================================
// Alarm Handlers
// ============================================================================

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('snooze_')) {
    await SnoozeService.handleAlarm(alarm);
  } else if (alarm.name.startsWith('rule-repeat:')) {
    const ruleId = alarm.name.substring('rule-repeat:'.length);
    await onSchedulerTrigger({ ruleId, type: 'repeat' });
  } else if (alarm.name === 'scheduled_backup' || alarm.name === 'scheduled_backup_cleanup') {
    // Phase 8.4: Delegate to ScheduledExportService
    await ScheduledExportService.handleAlarm(alarm);
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
// Export/Import Functions - Now handled by ExportImportService
// ============================================================================
// All export/import logic has been moved to /services/ExportImportService.js
// Message handlers above call the service with explicit parameters


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