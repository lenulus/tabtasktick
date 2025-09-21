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
// Initialization
// ============================================================================

chrome.runtime.onInstalled.addListener(async () => {
  console.log('TabMaster Pro installed');
  await initializeExtension();
  await setupContextMenus();
  await loadSettings();
  await loadRules();
  await checkAndMigrateTabs();
});

chrome.runtime.onStartup.addListener(async () => {
  await loadSettings();
  await loadRules();
  await restoreSnoozedTabs();
  await startMonitoring();
});

async function initializeExtension() {
  // Set default rules if none exist
  const { rules } = await chrome.storage.local.get('rules');
  if (!rules || rules.length === 0) {
    const defaultRules = getDefaultRules();
    await chrome.storage.local.set({ rules: defaultRules });
    state.rules = defaultRules;
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

function getDefaultRules() {
  return [
    {
      id: 'rule_1',
      name: 'Close duplicate tabs',
      enabled: true,
      conditions: {
        type: 'duplicate',
      },
      actions: {
        type: 'close',
        keepFirst: true,
      },
      priority: 1,
    },
    {
      id: 'rule_2',
      name: 'Auto-group by domain',
      enabled: true,
      conditions: {
        type: 'domain_count',
        minCount: 3,
      },
      actions: {
        type: 'group',
        groupBy: 'domain',
      },
      priority: 2,
    },
    {
      id: 'rule_3',
      name: 'Snooze unread articles',
      enabled: true,
      conditions: {
        type: 'inactive',
        inactiveMinutes: 60,
        urlPatterns: ['medium.com', 'dev.to', 'hackernews', 'reddit.com'],
      },
      actions: {
        type: 'snooze',
        snoozeMinutes: 1440, // 24 hours
      },
      priority: 3,
    },
    {
      id: 'rule_4',
      name: 'Close old Stack Overflow tabs',
      enabled: true,
      conditions: {
        type: 'age_and_domain',
        ageMinutes: 180,
        domains: ['stackoverflow.com'],
      },
      actions: {
        type: 'close',
        saveToBookmarks: true,
      },
      priority: 4,
    },
    {
      id: 'rule_5',
      name: 'Memory management',
      enabled: true,
      conditions: {
        type: 'memory',
        thresholdPercent: 80,
      },
      actions: {
        type: 'suspend',
        excludePinned: true,
      },
      priority: 5,
    },
  ];
}

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
  const matchingTabs = tabs.filter(tab => evaluateCondition(rule.conditions, tab, tabs));
  
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
    
    case 'memory':
      // This would require additional APIs or estimation
      return false; // Placeholder
    
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
  
  for (const tab of tabs) {
    // Store tab info
    const snoozedTab = {
      id: `snoozed_${Date.now()}_${tab.id}`,
      url: tab.url,
      title: tab.title,
      favicon: tab.favIconUrl,
      snoozeUntil: snoozeUntil,
      originalTabId: tab.id
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
  
  await updateStatistics();
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
  for (const [domain, tabIds] of domainMap) {
    if (tabIds.length >= 2) {
      const groupId = await chrome.tabs.group({ tabIds });
      
      await chrome.tabGroups.update(groupId, {
        title: domain,
        color: getColorForDomain(domain),
        collapsed: false
      });
      
      groupsCreated++;
      state.statistics.tabsGrouped += tabIds.length;
    }
  }
  
  await updateStatistics();
  
  if (groupsCreated > 0) {
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
  await snoozeTabsAction([activeTab], { snoozeMinutes });
  
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title: 'Tab Snoozed',
    message: `Tab will reopen in ${snoozeMinutes} minutes`
  });
}

async function snoozeTabs(tabIds, minutes) {
  const tabs = await chrome.tabs.query({});
  const tabsToSnooze = tabs.filter(tab => tabIds.includes(tab.id));
  
  if (tabsToSnooze.length === 0) return;
  
  await snoozeTabsAction(tabsToSnooze, { snoozeMinutes: minutes });
  
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title: 'Tabs Snoozed',
    message: `${tabsToSnooze.length} tabs will reopen in ${minutes} minutes`
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
    
    case 'getSettings':
      return state.settings;
    
    case 'updateSettings':
      return await updateSettings(request.settings);
    
    case 'restoreSnoozedTab':
      return await restoreSnoozedTab(request.tabId);
    
    case 'exportData':
      return await exportData();
    
    case 'importData':
      return await importData(request.data);
    
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

// Initialize monitoring on startup
startMonitoring();
