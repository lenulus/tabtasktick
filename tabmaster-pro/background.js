// Background Service Worker for TabMaster Pro
// Core functionality for tab management, rules engine, and automation

console.log('Background service worker loaded');

// Test keyboard shortcut registration
chrome.commands.getAll((commands) => {
  console.log('Registered commands:', commands);
});

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
  saveActivityLog();
}

function getActivityIcon(action) {
  const icons = {
    close: 'close',
    snooze: 'snooze',
    group: 'group',
    suspend: 'suspend',
    wake: 'wake',
    duplicate: 'duplicate',
    rule: 'rule',
    export: 'export',
    import: 'import',
    bookmark: 'bookmark'
  };
  return icons[action] || 'action';
}

function getActivityColor(action) {
  const colors = {
    close: '#e74c3c',
    snooze: '#4facfe',
    group: '#667eea',
    suspend: '#95a5a6',
    wake: '#2ecc71',
    duplicate: '#e67e22',
    rule: '#28a745',
    export: '#3498db',
    import: '#9b59b6',
    bookmark: '#f39c12'
  };
  return colors[action] || '#7f8c8d';
}

async function saveActivityLog() {
  try {
    await chrome.storage.local.set({ activityLog: state.activityLog });
  } catch (error) {
    console.error('Failed to save activity log:', error);
  }
}

async function loadActivityLog() {
  try {
    const data = await chrome.storage.local.get('activityLog');
    if (data.activityLog) {
      state.activityLog = data.activityLog;
    }
  } catch (error) {
    console.error('Failed to load activity log:', error);
  }
}

// ============================================================================
// Initialization
// ============================================================================

chrome.runtime.onInstalled.addListener(async () => {
  console.log('TabMaster Pro installed');
  await loadDomainCategories();
  await initializeExtension();
  await setupContextMenus();
  await loadSettings();
  await loadRules();
  await loadActivityLog();
  await checkAndMigrateTabs();
});

chrome.runtime.onStartup.addListener(async () => {
  await loadDomainCategories();
  await loadSettings();
  await loadRules();
  await loadActivityLog();
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
// Rules Engine
// ============================================================================

async function loadRules() {
  const { rules } = await chrome.storage.local.get('rules');
  if (rules) {
    state.rules = rules;
  }
}

async function evaluateRules() {
  if (!state.settings.autoCloseEnabled) return;
  
  const tabs = await chrome.tabs.query({});
  const sortedRules = [...state.rules]
    .filter(rule => rule.enabled)
    .sort((a, b) => a.priority - b.priority);
  
  for (const rule of sortedRules) {
    await applyRule(rule, tabs);
  }
}

async function applyRule(rule, tabs) {
  let matchingTabs = tabs.filter(tab => evaluateCondition(rule.conditions, tab, tabs));

  // Special handling for duplicate condition with keepFirst
  if (rule.conditions.type === 'duplicate' && rule.actions.type === 'close') {
    // Group duplicates by URL
    const urlGroups = new Map();
    for (const tab of matchingTabs) {
      if (!urlGroups.has(tab.url)) {
        urlGroups.set(tab.url, []);
      }
      urlGroups.get(tab.url).push(tab);
    }

    // For each group of duplicates, exclude the one to keep
    matchingTabs = [];
    for (const [url, duplicates] of urlGroups.entries()) {
      if (duplicates.length > 1) {
        // Sort by ID (lower ID = older tab)
        duplicates.sort((a, b) => a.id - b.id);

        if (rule.actions.keepFirst !== false) {
          // Keep the first (oldest) tab, close the rest
          matchingTabs.push(...duplicates.slice(1));
        } else {
          // Keep the last (newest) tab, close the rest
          matchingTabs.push(...duplicates.slice(0, -1));
        }
      }
    }
  }

  if (matchingTabs.length > 0) {
    await executeAction(rule.actions, matchingTabs);
  }
}

function evaluateCondition(conditions, tab, allTabs) {
  switch (conditions.type) {
    case 'duplicate':
      return isDuplicateTab(tab, allTabs);
    
    case 'domain_count':
      return shouldGroupByDomain(tab, allTabs, conditions.minCount);
    
    case 'inactive':
      return isInactiveTab(tab, conditions);
    
    case 'age_and_domain':
      return isOldDomainTab(tab, conditions);
    
    case 'url_pattern':
      return isUrlPatternMatch(tab, conditions);
    
    case 'category':
      return isCategoryMatch(tab, conditions);

    default:
      return false;
  }
}

async function executeAction(action, tabs) {
  switch (action.type) {
    case 'close':
      await closeTabsAction(tabs, action);
      break;
    
    case 'group':
      await groupTabsAction(tabs, action);
      break;
    
    case 'snooze':
      await snoozeTabsAction(tabs, action);
      break;
    
    case 'suspend':
      await suspendTabsAction(tabs, action);
      break;
  }
}

// ============================================================================
// Tab Management Functions
// ============================================================================

function isDuplicateTab(tab, allTabs) {
  if (tab.pinned) return false;
  
  const duplicates = allTabs.filter(t => 
    t.id !== tab.id && 
    t.url === tab.url &&
    !t.pinned
  );
  
  // Only mark as duplicate if this isn't the first occurrence
  if (duplicates.length > 0) {
    const firstOccurrence = allTabs.find(t => t.url === tab.url);
    return firstOccurrence.id !== tab.id;
  }
  
  return false;
}

function shouldGroupByDomain(tab, allTabs, minCount) {
  const domain = new URL(tab.url).hostname;
  const sameDomainTabs = allTabs.filter(t => {
    try {
      return new URL(t.url).hostname === domain;
    } catch {
      return false;
    }
  });
  
  return sameDomainTabs.length >= minCount && !tab.groupId;
}

function isInactiveTab(tab, conditions) {
  // Check if tab matches URL patterns
  if (conditions.urlPatterns) {
    const matches = conditions.urlPatterns.some(pattern => 
      tab.url.includes(pattern)
    );
    if (!matches) return false;
  }
  
  // In a real implementation, we'd track last access time
  // For now, we'll use a simplified check
  return !tab.active && !tab.pinned;
}

function isOldDomainTab(tab, conditions) {
  if (!conditions.domains) return false;
  
  try {
    const domain = new URL(tab.url).hostname;
    const matches = conditions.domains.some(d => domain.includes(d));
    
    // In a real implementation, we'd track tab creation time
    // For now, return matches for domain
    return matches && !tab.pinned && !tab.active;
  } catch {
    return false;
  }
}

function isUrlPatternMatch(tab, conditions) {
  if (!conditions.pattern) return false;
  
  try {
    // Create regex from the pattern
    const regex = new RegExp(conditions.pattern);
    const matches = regex.test(tab.url);
    
    // Check inactive time if specified (default 30 minutes)
    if (matches && conditions.inactiveMinutes) {
      // For now, consider tab inactive if not active/pinned
      // In real implementation, track last access time
      const isInactive = !tab.active && !tab.pinned;
      return isInactive;
    }
    
    return matches && !tab.pinned;
  } catch (e) {
    console.error('Invalid regex pattern:', conditions.pattern, e);
    return false;
  }
}

async function isCategoryMatch(tab, conditions) {
  if (!conditions.categories || conditions.categories.length === 0) return false;
  
  try {
    const url = new URL(tab.url);
    const domain = url.hostname.replace(/^www\./, '');
    
    // Get categories for this domain from storage or built-in list
    const { domainCategories = {} } = await chrome.storage.local.get('domainCategories');
    
    // Check user-defined categories first
    const userCategories = domainCategories[domain] || [];
    
    // Then check built-in categories (imported from domain-categories.js)
    // For now, we'll implement a simple check - in production, import the module
    const builtInCategories = getBuiltInCategoriesForDomain(domain);
    
    // Combine categories
    const allCategories = [...new Set([...userCategories, ...builtInCategories])];
    
    // Check if any of the tab's categories match the rule's categories
    const matches = conditions.categories.some(cat => allCategories.includes(cat));
    
    // Check inactive time if specified
    if (matches && conditions.inactiveMinutes) {
      const isInactive = !tab.active && !tab.pinned;
      return isInactive;
    }
    
    return matches && !tab.pinned;
  } catch {
    return false;
  }
}

// Import domain categories (loaded at startup)
let DOMAIN_CATEGORIES_MAP = {};

// Load domain categories at startup
async function loadDomainCategories() {
  try {
    // In a Chrome extension, we need to fetch the file
    const response = await fetch(chrome.runtime.getURL('lib/domain-categories-generated.js'));
    const text = await response.text();
    
    // Parse the JavaScript module content
    // Extract the CATEGORIZED_DOMAINS array
    const match = text.match(/export const CATEGORIZED_DOMAINS = \[([\s\S]*?)\];/);
    if (match) {
      // Create a map for faster lookups
      const domainsStr = match[1];
      // Use eval carefully here - we control the source
      const domains = eval('[' + domainsStr + ']');
      
      domains.forEach(d => {
        DOMAIN_CATEGORIES_MAP[d.domain] = d.categories;
      });
      
      console.log(`Loaded ${Object.keys(DOMAIN_CATEGORIES_MAP).length} categorized domains`);
    }
  } catch (error) {
    console.error('Failed to load domain categories:', error);
    // Fallback to basic categories
    DOMAIN_CATEGORIES_MAP = {
      'google.com': ['search', 'productivity_tools'],
      'youtube.com': ['streaming_entertainment', 'social'],
      'facebook.com': ['social'],
      'reddit.com': ['social', 'reference_research'],
      'github.com': ['tech_dev', 'productivity_tools'],
      'stackoverflow.com': ['tech_dev', 'reference_research'],
      'amazon.com': ['shopping'],
      'netflix.com': ['streaming_entertainment']
    };
  }
}

// Get categories for a domain
function getBuiltInCategoriesForDomain(domain) {
  // Direct lookup
  if (DOMAIN_CATEGORIES_MAP[domain]) {
    return DOMAIN_CATEGORIES_MAP[domain];
  }
  
  // Try without subdomain
  const parts = domain.split('.');
  if (parts.length > 2) {
    const withoutSubdomain = parts.slice(1).join('.');
    if (DOMAIN_CATEGORIES_MAP[withoutSubdomain]) {
      return DOMAIN_CATEGORIES_MAP[withoutSubdomain];
    }
  }
  
  return [];
}

async function closeTabsAction(tabs, action) {
  const tabIds = tabs.map(t => t.id);
  
  if (action.saveToBookmarks) {
    // Create bookmark folder
    const folder = await chrome.bookmarks.create({
      title: `TabMaster Archive - ${new Date().toLocaleDateString()}`
    });
    
    // Save tabs as bookmarks
    for (const tab of tabs) {
      await chrome.bookmarks.create({
        parentId: folder.id,
        title: tab.title,
        url: tab.url
      });
    }
  }
  
  // Close tabs
  await chrome.tabs.remove(tabIds);
  state.statistics.tabsClosed += tabs.length;
  await updateStatistics();
}

async function groupTabsAction(tabs, action) {
  if (action.groupBy === 'domain') {
    const tabsByDomain = new Map();
    
    // Group tabs by domain
    for (const tab of tabs) {
      try {
        const domain = new URL(tab.url).hostname;
        if (!tabsByDomain.has(domain)) {
          tabsByDomain.set(domain, []);
        }
        tabsByDomain.get(domain).push(tab);
      } catch {
        // Skip invalid URLs
      }
    }
    
    // Create groups for each domain
    for (const [domain, domainTabs] of tabsByDomain) {
      if (domainTabs.length >= 2) {
        const tabIds = domainTabs.map(t => t.id);
        const group = await chrome.tabs.group({ tabIds });
        
        await chrome.tabGroups.update(group, {
          title: domain,
          color: getColorForDomain(domain),
          collapsed: false
        });
        
        state.statistics.tabsGrouped += domainTabs.length;
      }
    }
  }
  
  await updateStatistics();
}

async function snoozeTabsAction(tabs, action) {
  const snoozeUntil = Date.now() + (action.snoozeMinutes * 60 * 1000);
  const groupId = action.groupId || `group_${Date.now()}`;
  
  for (const tab of tabs) {
    // Store tab info with enhanced metadata
    const snoozedTab = {
      id: `snoozed_${Date.now()}_${tab.id}`,
      url: tab.url,
      title: tab.title,
      favicon: tab.favIconUrl,
      snoozeUntil: snoozeUntil,
      snoozeReason: action.snoozeReason || 'manual',
      originalTabId: tab.id,
      groupId: tabs.length > 1 ? groupId : null,
      createdAt: Date.now()
    };
    
    state.snoozedTabs.push(snoozedTab);
    
    // Close the tab
    await chrome.tabs.remove(tab.id);
    state.statistics.tabsSnoozed++;
  }
  
  // Save snoozed tabs
  await chrome.storage.local.set({ snoozedTabs: state.snoozedTabs });
  
  // Set alarm to restore tabs
  chrome.alarms.create('checkSnoozedTabs', { delayInMinutes: 1, periodInMinutes: 1 });
  
  // Show notification with smart message
  if (tabs.length > 0) {
    const notificationMessage = tabs.length === 1 
      ? `Tab will reopen ${getReadableTimeFromNow(snoozeUntil)}`
      : `${tabs.length} tabs will reopen ${getReadableTimeFromNow(snoozeUntil)}`;
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: 'Tabs Snoozed',
      message: notificationMessage,
      buttons: [{ title: 'Undo' }]
    });
  }
  
  await updateStatistics();
}

function getReadableTimeFromNow(timestamp) {
  const now = Date.now();
  const diff = timestamp - now;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `in ${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `in ${hours} hour${hours > 1 ? 's' : ''}`;
  return `in ${minutes} minute${minutes > 1 ? 's' : ''}`;
}

async function suspendTabsAction(tabs, action) {
  // Placeholder for tab suspension (would need to inject content script)
  // For now, we'll just discard non-pinned tabs
  const tabsToSuspend = action.excludePinned ? 
    tabs.filter(t => !t.pinned) : tabs;
  
  for (const tab of tabsToSuspend) {
    try {
      await chrome.tabs.discard(tab.id);
    } catch (error) {
      console.error('Failed to discard tab:', error);
    }
  }
}

// ============================================================================
// Snooze Management
// ============================================================================

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkSnoozedTabs') {
    await checkSnoozedTabs();
  } else if (alarm.name === 'evaluateRules') {
    await evaluateRules();
  }
});

// Handle notification interactions
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (buttonIndex === 0) { // Undo button
    // Check if this is a snooze notification
    const recentlySnoozed = state.snoozedTabs.slice(-5); // Check last 5 snoozed tabs
    if (recentlySnoozed.length > 0) {
      // Restore the most recently snoozed tabs
      for (const tab of recentlySnoozed) {
        await chrome.tabs.create({
          url: tab.url,
          active: false
        });
      }
      
      // Remove them from snoozed tabs
      state.snoozedTabs = state.snoozedTabs.filter(
        t => !recentlySnoozed.some(r => r.id === t.id)
      );
      await chrome.storage.local.set({ snoozedTabs: state.snoozedTabs });
      
      // Clear the notification
      chrome.notifications.clear(notificationId);
      
      // Show success notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title: 'Undo Successful',
        message: `Restored ${recentlySnoozed.length} tab${recentlySnoozed.length > 1 ? 's' : ''}`
      });
    }
  }
});

async function checkSnoozedTabs() {
  const now = Date.now();
  const tabsToRestore = state.snoozedTabs.filter(tab => tab.snoozeUntil <= now);
  
  if (tabsToRestore.length > 0) {
    for (const snoozedTab of tabsToRestore) {
      await chrome.tabs.create({
        url: snoozedTab.url,
        active: false
      });
      
      // Remove from snoozed tabs
      state.snoozedTabs = state.snoozedTabs.filter(t => t.id !== snoozedTab.id);
    }
    
    // Update storage
    await chrome.storage.local.set({ snoozedTabs: state.snoozedTabs });
  }
  
  // Clear alarm if no more snoozed tabs
  if (state.snoozedTabs.length === 0) {
    chrome.alarms.clear('checkSnoozedTabs');
  }
}

async function restoreSnoozedTabs() {
  const { snoozedTabs } = await chrome.storage.local.get('snoozedTabs');
  if (snoozedTabs) {
    state.snoozedTabs = snoozedTabs;
    if (snoozedTabs.length > 0) {
      chrome.alarms.create('checkSnoozedTabs', { delayInMinutes: 1, periodInMinutes: 1 });
    }
  }
}

// ============================================================================
// Duplicate Detection
// ============================================================================

async function findAndCloseDuplicates() {
  const tabs = await chrome.tabs.query({});
  const urlMap = new Map();
  const duplicates = [];
  
  // Find duplicates
  for (const tab of tabs) {
    if (tab.pinned) continue;
    
    if (urlMap.has(tab.url)) {
      duplicates.push(tab.id);
      state.statistics.duplicatesRemoved++;
    } else {
      urlMap.set(tab.url, tab.id);
    }
  }
  
  // Close duplicate tabs
  if (duplicates.length > 0) {
    await chrome.tabs.remove(duplicates);
    await updateStatistics();
    
    // Log activity
    logActivity('close', `Closed ${duplicates.length} duplicate tab${duplicates.length > 1 ? 's' : ''}`, 'manual');
    
    // Notify user
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: 'Duplicate Tabs Closed',
      message: `Closed ${duplicates.length} duplicate tab(s)`
    });
  }
  
  return duplicates.length;
}

// ============================================================================
// Group Management
// ============================================================================

async function groupTabsByDomain() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const domainMap = new Map();
  
  // Group tabs by domain
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
  
  // Create groups for domains with multiple tabs
  let groupsCreated = 0;
  let totalTabsGrouped = 0;
  for (const [domain, tabIds] of domainMap) {
    if (tabIds.length >= 2) {
      const groupId = await chrome.tabs.group({ tabIds });
      
      await chrome.tabGroups.update(groupId, {
        title: domain,
        color: getColorForDomain(domain),
        collapsed: false
      });
      
      groupsCreated++;
      totalTabsGrouped += tabIds.length;
      state.statistics.tabsGrouped += tabIds.length;
    }
  }
  
  await updateStatistics();
  
  if (groupsCreated > 0) {
    // Log activity
    logActivity('group', `Created ${groupsCreated} group${groupsCreated > 1 ? 's' : ''} (${totalTabsGrouped} tabs)`, 'manual');
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: 'Tabs Grouped',
      message: `Created ${groupsCreated} group(s) by domain`
    });
  }
  
  return groupsCreated;
}

function getColorForDomain(domain) {
  const colors = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
  
  // Generate consistent color based on domain
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = ((hash << 5) - hash) + domain.charCodeAt(i);
    hash = hash & hash;
  }
  
  return colors[Math.abs(hash) % colors.length];
}

// ============================================================================
// Quick Actions
// ============================================================================

async function quickSnoozeCurrent(minutes = null) {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab) return;
  
  const snoozeMinutes = minutes || state.settings.defaultSnoozeMinutes;
  await snoozeTabsAction([activeTab], { 
    snoozeMinutes,
    snoozeReason: 'quick_action'
  });
}

async function snoozeTabs(tabIds, minutes, reason = 'manual') {
  const tabs = await chrome.tabs.query({});
  const tabsToSnooze = tabs.filter(tab => tabIds.includes(tab.id));
  
  if (tabsToSnooze.length === 0) return;
  
  await snoozeTabsAction(tabsToSnooze, { 
    snoozeMinutes: minutes,
    snoozeReason: reason
  });
  
  return true;
}

// ============================================================================
// Context Menus
// ============================================================================

async function setupContextMenus() {
  // Remove existing menus
  await chrome.contextMenus.removeAll();
  
  // Snooze options
  chrome.contextMenus.create({
    id: 'snooze_tab',
    title: 'Snooze Tab',
    contexts: ['page']
  });
  
  chrome.contextMenus.create({
    id: 'snooze_2h',
    parentId: 'snooze_tab',
    title: 'For 2 hours',
    contexts: ['page']
  });
  
  chrome.contextMenus.create({
    id: 'snooze_tomorrow',
    parentId: 'snooze_tab',
    title: 'Until tomorrow',
    contexts: ['page']
  });
  
  chrome.contextMenus.create({
    id: 'snooze_week',
    parentId: 'snooze_tab',
    title: 'For 1 week',
    contexts: ['page']
  });
  
  // Group options
  chrome.contextMenus.create({
    id: 'group_domain',
    title: 'Group tabs from this domain',
    contexts: ['page']
  });
  
  // Duplicate management
  chrome.contextMenus.create({
    id: 'close_duplicates',
    title: 'Close all duplicate tabs',
    contexts: ['page']
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case 'snooze_2h':
      await snoozeTabsAction([tab], { snoozeMinutes: 120 });
      break;
    
    case 'snooze_tomorrow':
      await snoozeTabsAction([tab], { snoozeMinutes: 1440 });
      break;
    
    case 'snooze_week':
      await snoozeTabsAction([tab], { snoozeMinutes: 10080 });
      break;
    
    case 'group_domain':
      const domain = new URL(tab.url).hostname;
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const domainTabs = tabs.filter(t => {
        try {
          return new URL(t.url).hostname === domain;
        } catch {
          return false;
        }
      });
      
      if (domainTabs.length >= 2) {
        const tabIds = domainTabs.map(t => t.id);
        const groupId = await chrome.tabs.group({ tabIds });
        await chrome.tabGroups.update(groupId, {
          title: domain,
          color: getColorForDomain(domain)
        });
      }
      break;
    
    case 'close_duplicates':
      await findAndCloseDuplicates();
      break;
  }
});

// ============================================================================
// Tab Event Listeners
// ============================================================================

// Track bulk operations to avoid double-logging
let bulkOperationInProgress = false;

// Log tab closes to activity history
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  // Skip logging if:
  // 1. Window is closing (too noisy)
  // 2. Part of a bulk operation (will be logged as bulk)
  if (!removeInfo.isWindowClosing && !bulkOperationInProgress) {
    logActivity('close', 'Closed 1 tab', 'manual');
    trackTabHistory('closed');
  }
});

// Log tab creations
chrome.tabs.onCreated.addListener((tab) => {
  logActivity('create', 'Opened new tab', 'manual');
  trackTabHistory('opened');
});

// Log tab groups
chrome.tabGroups.onCreated.addListener((group) => {
  logActivity('group', 'Created new group', 'manual');
});

chrome.tabGroups.onRemoved.addListener((group) => {
  logActivity('ungroup', 'Removed group', 'manual');
});

// ============================================================================
// Keyboard Commands
// ============================================================================

chrome.commands.onCommand.addListener(async (command) => {
  console.log('Command received:', command);
  switch (command) {
    case 'open_command_palette':
      // Open command palette
      console.log('Opening command palette...');
      await openCommandPalette();
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

async function openCommandPalette() {
  // Create or focus the command palette
  const width = 600;
  const height = 600;
  
  try {
    // Get the current window to calculate center position
    const currentWindow = await chrome.windows.getCurrent();
    const left = Math.round(currentWindow.left + (currentWindow.width - width) / 2);
    const top = Math.round(currentWindow.top + (currentWindow.height - height) / 2);
    
    const window = await chrome.windows.create({
      url: chrome.runtime.getURL('popup/command-palette.html'),
      type: 'popup',
      width: width,
      height: height,
      left: left,
      top: top,
      focused: true
    });
    console.log('Command palette opened:', window);
  } catch (error) {
    console.error('Failed to open command palette:', error);
    // Fallback: open in a new tab
    chrome.tabs.create({
      url: chrome.runtime.getURL('popup/command-palette.html')
    });
  }
}


// ============================================================================
// Message Handling
// ============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(request, sender) {
  switch (request.action) {
    case 'openCommandPalette':
      await openCommandPalette();
      return true;
      
    case 'getStatistics':
      return await getStatistics();
    
    case 'getActivityLog':
      return state.activityLog || [];
    
    case 'getTabInfo':
      return await getTabInfo();
    
    case 'closeDuplicates':
      return await findAndCloseDuplicates();
    
    case 'groupByDomain':
      return await groupTabsByDomain();
    
    case 'snoozeCurrent':
      return await quickSnoozeCurrent(request.minutes);
    
    case 'snoozeTabs':
      return await snoozeTabs(request.tabIds, request.minutes);
    
    case 'getSnoozedTabs':
      return state.snoozedTabs;
    
    case 'getRules':
      return state.rules;
    
    case 'updateRule':
      return await updateRule(request.rule);
    
    case 'toggleRule':
      return await toggleRule(request.ruleId);

    case 'updateRules':
      return await updateRules(request.rules);

    case 'previewRule':
      return await previewRule(request.ruleId);

    case 'executeRule':
      return await executeRule(request.ruleId);

    case 'previewAllRules':
      return await previewAllRules();

    case 'executeAllRules':
      return await executeAllRules();

    case 'getSettings':
      return state.settings;
    
    case 'updateSettings':
      return await updateSettings(request.settings);
    
    case 'restoreSnoozedTab':
      return await restoreSnoozedTab(request.tabId);
    
    case 'removeSnoozedTab':
      return await removeSnoozedTab(request.tabId);
    
    case 'addSnoozedTab':
      return await addSnoozedTab(request.tab);
    
    case 'exportData':
      return await exportData();
    
    case 'importData':
      return await importData(request.data);
    
    case 'getDuplicateCount':
      return await getDuplicateCount();
    
    case 'archiveOldTabs':
      return await archiveOldTabs();
    
    case 'getOrganizeSuggestions':
      return await getOrganizeSuggestions();
    
    case 'undo':
      return await executeUndo(request.actionId, request.undoData);
    
    case 'logBulkActivity':
      // Set flag to prevent double-logging individual tab events
      bulkOperationInProgress = true;
      setTimeout(() => { bulkOperationInProgress = false; }, 500);
      
      // Log bulk actions with proper count
      const message = request.type === 'close' 
        ? `Closed ${request.count} tab${request.count > 1 ? 's' : ''}`
        : `Performed bulk action on ${request.count} tabs`;
      logActivity(request.type, message, request.source || 'manual');
      return true;
    
    default:
      throw new Error(`Unknown action: ${request.action}`);
  }
}

// ============================================================================
// Statistics and Monitoring
// ============================================================================

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
  
  return {
    totalTabs: tabs.length,
    totalWindows: windows.length,
    groupedTabs: groupedTabs.length,
    pinnedTabs: tabs.filter(t => t.pinned).length,
    snoozedTabs: state.snoozedTabs.length,
    duplicates: findDuplicateCount(tabs),
    topDomains,
    statistics: state.statistics,
    memoryEstimate: await estimateMemoryUsage(tabs)
  };
}

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

function findDuplicateCount(tabs) {
  const urls = tabs.map(t => t.url);
  const uniqueUrls = new Set(urls);
  return urls.length - uniqueUrls.size;
}

async function estimateMemoryUsage(tabs) {
  try {
    // Try to get actual system memory info
    if (chrome.system && chrome.system.memory) {
      const memoryInfo = await chrome.system.memory.getInfo();
      const totalMemoryGB = (memoryInfo.capacity / (1024 * 1024 * 1024)).toFixed(2);
      const availableMemoryGB = (memoryInfo.availableCapacity / (1024 * 1024 * 1024)).toFixed(2);
      const usedMemoryGB = totalMemoryGB - availableMemoryGB;
      const usagePercentage = ((usedMemoryGB / totalMemoryGB) * 100).toFixed(1);
      
      // Estimate Chrome's portion (rough estimate: Chrome uses ~30-40% of used memory with many tabs)
      const chromeMemoryMB = Math.round((usedMemoryGB * 1024) * 0.35);
      const perTabEstimate = tabs.length > 0 ? Math.round(chromeMemoryMB / tabs.length) : 0;
      
      return {
        estimatedMB: chromeMemoryMB,
        percentage: parseFloat(usagePercentage),
        totalSystemGB: parseFloat(totalMemoryGB),
        availableSystemGB: parseFloat(availableMemoryGB),
        perTabMB: perTabEstimate,
        isRealData: true
      };
    }
  } catch (error) {
    console.log('System memory API not available, using estimates');
  }
  
  // Fallback to estimation if system.memory API is not available
  // More realistic estimation based on tab count
  const baseMemoryMB = 150; // Chrome base usage
  const memoryPerTab = tabs.length < 50 ? 50 : // Heavy per tab when few tabs
                       tabs.length < 100 ? 30 : // Medium per tab 
                       tabs.length < 200 ? 20 : // Light per tab when many
                       15; // Very light when 200+ tabs
  
  const estimatedMB = baseMemoryMB + (tabs.length * memoryPerTab);
  const assumedSystemMemoryMB = 8192; // Assume 8GB system
  const percentage = Math.min(95, (estimatedMB / assumedSystemMemoryMB) * 100);
  
  return {
    estimatedMB,
    percentage,
    totalSystemGB: 8,
    availableSystemGB: ((assumedSystemMemoryMB - estimatedMB) / 1024).toFixed(2),
    perTabMB: memoryPerTab,
    isRealData: false
  };
}

// ============================================================================
// Settings Management
// ============================================================================

async function loadSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  if (settings) {
    state.settings = { ...state.settings, ...settings };
  }
}

async function updateSettings(newSettings) {
  state.settings = { ...state.settings, ...newSettings };
  await chrome.storage.local.set({ settings: state.settings });
  return state.settings;
}

// ============================================================================
// Rule Management
// ============================================================================

async function updateRule(rule) {
  const index = state.rules.findIndex(r => r.id === rule.id);
  if (index !== -1) {
    state.rules[index] = rule;
  } else {
    state.rules.push(rule);
  }
  
  await chrome.storage.local.set({ rules: state.rules });
  return rule;
}

async function toggleRule(ruleId) {
  const rule = state.rules.find(r => r.id === ruleId);
  if (rule) {
    rule.enabled = !rule.enabled;
    await chrome.storage.local.set({ rules: state.rules });
  }
  return rule;
}

async function updateRules(rules) {
  state.rules = rules;
  await chrome.storage.local.set({ rules: state.rules });
  return state.rules;
}

async function previewRule(ruleId) {
  const rule = state.rules.find(r => r.id === ruleId);
  if (!rule) return { matchingTabs: [] };

  const tabs = await chrome.tabs.query({});
  let matchingTabs = tabs.filter(tab => evaluateCondition(rule.conditions, tab, tabs));

  // Apply the same logic for duplicates as in applyRule
  if (rule.conditions.type === 'duplicate' && rule.actions.type === 'close') {
    const urlGroups = new Map();
    for (const tab of matchingTabs) {
      if (!urlGroups.has(tab.url)) {
        urlGroups.set(tab.url, []);
      }
      urlGroups.get(tab.url).push(tab);
    }

    matchingTabs = [];
    for (const [url, duplicates] of urlGroups.entries()) {
      if (duplicates.length > 1) {
        duplicates.sort((a, b) => a.id - b.id);
        if (rule.actions.keepFirst !== false) {
          matchingTabs.push(...duplicates.slice(1));
        } else {
          matchingTabs.push(...duplicates.slice(0, -1));
        }
      }
    }
  }

  return {
    rule: rule,
    matchingTabs: matchingTabs.map(t => ({
      id: t.id,
      title: t.title,
      url: t.url
    }))
  };
}

async function executeRule(ruleId) {
  const rule = state.rules.find(r => r.id === ruleId);
  if (!rule) return { success: false };

  const tabs = await chrome.tabs.query({});
  await applyRule(rule, tabs);

  // Log the manual execution
  logActivity(rule.actions.type, `Manual: ${rule.name}`, 'manual');

  return { success: true };
}

async function previewAllRules() {
  const enabledRules = state.rules.filter(r => r.enabled);
  const results = [];

  for (const rule of enabledRules) {
    const preview = await previewRule(rule.id);
    results.push(preview);
  }

  return { results };
}

async function executeAllRules() {
  const enabledRules = state.rules.filter(r => r.enabled);
  const tabs = await chrome.tabs.query({});

  for (const rule of enabledRules) {
    await applyRule(rule, tabs);
  }

  // Log the manual execution
  logActivity('rule', `Manual execution of ${enabledRules.length} rules`, 'manual');

  return { success: true, rulesExecuted: enabledRules.length };
}

// ============================================================================
// Import/Export
// ============================================================================

async function exportData(options = {}) {
  const exportData = {
    version: '1.0.0',
    exportDate: new Date().toISOString(),
    browser: navigator.userAgent,
    extension: {
      rules: state.rules,
      settings: state.settings,
      snoozedTabs: state.snoozedTabs,
      statistics: state.statistics,
      tabGroups: Array.from(state.tabGroups.entries())
    }
  };

  // Include current tabs if requested (default: true)
  if (options.includeTabs !== false) {
    const tabs = await chrome.tabs.query({});
    const windows = await chrome.windows.getAll({ populate: false });
    const groups = await chrome.tabGroups.query({});
    
    exportData.currentSession = {
      windowCount: windows.length,
      tabCount: tabs.length,
      groupCount: groups.length,
      tabs: tabs.map(tab => ({
        id: tab.id,
        windowId: tab.windowId,
        groupId: tab.groupId,
        title: tab.title,
        url: tab.url,
        favicon: tab.favIconUrl,
        pinned: tab.pinned,
        active: tab.active,
        index: tab.index,
        audible: tab.audible,
        mutedInfo: tab.mutedInfo,
        openerTabId: tab.openerTabId
      })),
      groups: groups.map(group => ({
        id: group.id,
        title: group.title,
        color: group.color,
        collapsed: group.collapsed,
        windowId: group.windowId
      })),
      windows: windows.map(window => ({
        id: window.id,
        focused: window.focused,
        incognito: window.incognito,
        type: window.type,
        state: window.state
      }))
    };
  }

  // Include bookmarks if requested
  if (options.includeBookmarks) {
    try {
      const bookmarkTree = await chrome.bookmarks.getTree();
      exportData.bookmarks = bookmarkTree;
    } catch (error) {
      console.error('Failed to export bookmarks:', error);
    }
  }

  return exportData;
}

async function importData(data) {
  if (data.rules) {
    state.rules = data.rules;
    await chrome.storage.local.set({ rules: state.rules });
  }
  
  if (data.settings) {
    state.settings = data.settings;
    await chrome.storage.local.set({ settings: state.settings });
  }
  
  if (data.snoozedTabs) {
    state.snoozedTabs = data.snoozedTabs;
    await chrome.storage.local.set({ snoozedTabs: state.snoozedTabs });
  }
  
  return true;
}

// ============================================================================
// Utility Functions
// ============================================================================

async function updateStatistics() {
  await chrome.storage.local.set({ statistics: state.statistics });
}

async function checkAndMigrateTabs() {
  const tabs = await chrome.tabs.query({});
  
  if (tabs.length > state.settings.maxTabsWarning) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: 'Tab Overload Warning',
      message: `You have ${tabs.length} tabs open. Consider using TabMaster Pro to organize them!`,
      buttons: [
        { title: 'Organize Now' },
        { title: 'Dismiss' }
      ]
    });
  }
}

async function startMonitoring() {
  // Set up periodic rule evaluation
  chrome.alarms.create('evaluateRules', { delayInMinutes: 5, periodInMinutes: 5 });
}

async function restoreSnoozedTab(tabId) {
  const snoozedTab = state.snoozedTabs.find(t => t.id === tabId);
  if (snoozedTab) {
    await chrome.tabs.create({
      url: snoozedTab.url,
      active: true
    });
    
    state.snoozedTabs = state.snoozedTabs.filter(t => t.id !== tabId);
    await chrome.storage.local.set({ snoozedTabs: state.snoozedTabs });
  }
  
  return snoozedTab;
}

async function removeSnoozedTab(tabId) {
  const snoozedTab = state.snoozedTabs.find(t => t.id === tabId);
  if (snoozedTab) {
    state.snoozedTabs = state.snoozedTabs.filter(t => t.id !== tabId);
    await chrome.storage.local.set({ snoozedTabs: state.snoozedTabs });
    return true;
  }
  return false;
}

async function addSnoozedTab(tab) {
  state.snoozedTabs.push(tab);
  await chrome.storage.local.set({ snoozedTabs: state.snoozedTabs });
  
  // Ensure alarm is set
  chrome.alarms.create('checkSnoozedTabs', { delayInMinutes: 1, periodInMinutes: 1 });
  
  return true;
}

// ============================================================================
// FAB Action Implementations
// ============================================================================

async function getDuplicateCount() {
  const tabs = await chrome.tabs.query({});
  const urlMap = new Map();
  let duplicates = 0;

  tabs.forEach(tab => {
    if (!tab.pinned) {
      const normalizedUrl = tab.url;
      if (urlMap.has(normalizedUrl)) {
        duplicates++;
      } else {
        urlMap.set(normalizedUrl, tab);
      }
    }
  });

  return duplicates;
}

async function archiveOldTabs() {
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  const tabs = await chrome.tabs.query({});
  const now = Date.now();
  
  const oldTabs = tabs.filter(tab => {
    return !tab.pinned && 
           !tab.active && 
           tab.lastAccessed && 
           (now - tab.lastAccessed) > ONE_WEEK;
  });

  if (oldTabs.length === 0) {
    return { count: 0 };
  }

  // Create archive entry
  const archive = {
    id: Date.now().toString(),
    timestamp: now,
    tabs: oldTabs.map(tab => ({
      url: tab.url,
      title: tab.title,
      favicon: tab.favIconUrl,
      lastAccessed: tab.lastAccessed
    }))
  };

  // Save to storage
  const { archives = [] } = await chrome.storage.local.get('archives');
  archives.push(archive);
  await chrome.storage.local.set({ archives });

  // Close the tabs
  const tabIds = oldTabs.map(tab => tab.id);
  await chrome.tabs.remove(tabIds);

  return {
    count: oldTabs.length,
    undoData: { archiveId: archive.id, tabCount: oldTabs.length }
  };
}

async function getOrganizeSuggestions() {
  const tabs = await chrome.tabs.query({});
  const suggestions = [];

  // Analyze tab patterns
  const domains = new Map();
  const ungroupedDomains = new Set();
  
  tabs.forEach(tab => {
    try {
      const domain = new URL(tab.url).hostname;
      domains.set(domain, (domains.get(domain) || 0) + 1);
      
      if (!tab.groupId || tab.groupId === -1) {
        ungroupedDomains.add(domain);
      }
    } catch (e) {}
  });

  // Generate suggestions
  if (ungroupedDomains.size > 5) {
    suggestions.push({
      type: 'group',
      action: 'Group similar domains',
      impact: `Create ${Math.floor(ungroupedDomains.size / 2)} groups`,
      execute: 'groupByDomain'
    });
  }

  const duplicateCount = await getDuplicateCount();
  if (duplicateCount > 3) {
    suggestions.push({
      type: 'clean',
      action: 'Clean up duplicates',
      impact: `Close ${duplicateCount} duplicate tabs`,
      execute: 'closeDuplicates'
    });
  }

  const inactiveTabs = tabs.filter(tab => 
    !tab.pinned && 
    !tab.active &&
    tab.lastAccessed < Date.now() - 30 * 60 * 1000
  );
  
  if (inactiveTabs.length > 10) {
    const memoryEstimate = Math.round(inactiveTabs.length * 50 / 1024); // GB
    suggestions.push({
      type: 'suspend',
      action: 'Suspend inactive tabs',
      impact: `Free up ~${memoryEstimate}MB memory`,
      execute: 'suspendInactive'
    });
  }

  const oldTabsResult = await getOldTabsCount();
  if (oldTabsResult > 5) {
    suggestions.push({
      type: 'archive',
      action: 'Archive old tabs',
      impact: `Archive ${oldTabsResult} tabs not used in 7+ days`,
      execute: 'archiveOld'
    });
  }

  return suggestions;
}

async function getOldTabsCount() {
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  const tabs = await chrome.tabs.query({});
  const oldTabs = tabs.filter(tab => 
    !tab.pinned && 
    !tab.active && 
    tab.lastAccessed &&
    (Date.now() - tab.lastAccessed) > ONE_WEEK
  );
  return oldTabs.length;
}

async function executeUndo(actionId, undoData) {
  try {
    switch (actionId) {
      case 'archiveOld':
        return await undoArchiveOldTabs(undoData);
      
      case 'closeDuplicates':
      case 'groupByDomain':
      case 'suspendInactive':
        // These actions don't have undo implemented yet
        return { success: false, message: 'Undo not available for this action' };
      
      default:
        return { success: false, message: 'Unknown action' };
    }
  } catch (error) {
    console.error('Undo failed:', error);
    return { success: false, message: error.message };
  }
}

async function undoArchiveOldTabs(undoData) {
  // Get archives
  const { archives = [] } = await chrome.storage.local.get('archives');
  const archiveIndex = archives.findIndex(a => a.id === undoData.archiveId);
  
  if (archiveIndex === -1) {
    throw new Error('Archive not found');
  }

  const archive = archives[archiveIndex];
  
  // Restore tabs
  for (const tab of archive.tabs) {
    await chrome.tabs.create({ 
      url: tab.url, 
      active: false 
    });
  }

  // Remove from archives
  archives.splice(archiveIndex, 1);
  await chrome.storage.local.set({ archives });

  return { success: true, restoredCount: archive.tabs.length };
}

// Initialize monitoring on startup
startMonitoring();
