// Background Service Worker for TabMaster Pro
// Integrated with new Rules Engine 2.0 (engine.js + scheduler.js)

import { runRules, previewRule as previewRuleEngine } from './lib/engine.js';
import { createChromeScheduler } from './lib/scheduler.js';

console.log('Background service worker loaded with Rules Engine 2.0');

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
  const rule = state.rules.find(r => r.id === trigger.ruleId);
  if (rule && rule.enabled) {
    await executeRule(rule.id, trigger.type);
  }
});

// Initialize scheduler on startup
async function initializeScheduler() {
  await scheduler.init();
  
  // Setup all enabled rules
  for (const rule of state.rules) {
    if (rule.enabled) {
      scheduler.setupRule(rule);
    }
  }
}

// ============================================================================
// Tab Time Tracking
// ============================================================================

// Track tab timestamps: tabId -> { created, lastActive, lastAccessed }
const tabTimeData = new Map();

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
  }
}

async function loadSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  if (settings) {
    state.settings = { ...state.settings, ...settings };
  }
}

// Execute rules using the new engine
async function executeRule(ruleId, triggerType = 'manual') {
  const rule = state.rules.find(r => r.id === ruleId);
  if (!rule || !rule.enabled) {
    return { success: false, error: 'Rule not found or disabled' };
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
      }
      // Add category from domain mapping
      tab.category = getCategoryForDomain(tab.url);
    });
    
    // Build context for engine
    const context = {
      tabs,
      windows,
      chrome
    };
    
    // Run the single rule
    const results = await runRules([rule], context, {
      dryRun: false,
      skipPinned: rule.flags?.skipPinned !== false
    });
    
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
  const rule = state.rules.find(r => r.id === ruleId);
  if (!rule) {
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
    
    // Build context
    const context = {
      tabs,
      windows,
      chrome
    };
    
    // Use engine's preview function
    const preview = previewRuleEngine(rule, context, {
      skipPinned: rule.flags?.skipPinned !== false
    });
    
    return preview;
    
  } catch (error) {
    console.error('Error previewing rule:', error);
    return { error: error.message };
  }
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
    
    // Build context
    const context = {
      tabs,
      windows,
      chrome
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
    scheduler.setupRule(rule);
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
    scheduler.setupRule(newRule);
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
          sendResponse({ rules: state.rules });
          break;
          
        case 'addRule':
          const addResult = await addRule(request.rule);
          sendResponse(addResult);
          break;
          
        case 'updateRule':
          const updateResult = await updateRule(request.ruleId, request.updates);
          sendResponse(updateResult);
          break;
          
        case 'deleteRule':
          const deleteResult = await deleteRule(request.ruleId);
          sendResponse(deleteResult);
          break;
          
        case 'previewRule':
          const preview = await previewRule(request.ruleId);
          sendResponse(preview);
          break;
          
        case 'executeRule':
          const execResult = await executeRule(request.ruleId, 'manual');
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
          sendResponse({ activityLog: state.activityLog });
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
          sendResponse({ statistics: state.statistics });
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
          await snoozeTabs(request.tabIds, request.duration);
          sendResponse({ success: true });
          break;
          
        case 'bookmarkTabs':
          await bookmarkTabs(request.tabIds, request.folder);
          sendResponse({ success: true });
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
  const tabs = await chrome.tabs.query({ id: tabIds });
  const wakeTime = Date.now() + duration;
  
  for (const tab of tabs) {
    state.snoozedTabs.push({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      windowId: tab.windowId,
      index: tab.index,
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
  
  // Bookmark tabs
  const tabs = await chrome.tabs.query({ id: tabIds });
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

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    state,
    executeRule,
    previewRule,
    scheduler
  };
}