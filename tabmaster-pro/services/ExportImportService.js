// Service for handling all export and import functionality.
import * as SnoozeService from './execution/SnoozeService.js';

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

async function buildJSONExport(tabs, windows, groups, options, state, tabTimeData) {
  const now = new Date();
  const exportDate = now.toISOString();
  const exportDateReadable = now.toLocaleString();

  const windowsArray = Array.isArray(windows) ? windows : [windows];
  const sessionWindows = windowsArray.map(window => ({
    id: `w${window.id}`,
    windowId: window.id,
    title: `Window ${window.id} - ${tabs.filter(t => t.windowId === window.id).length} tabs`,
    focused: window.focused,
    state: window.state,
    type: window.type,
    tabCount: tabs.filter(t => t.windowId === window.id).length,
    tabs: tabs.filter(t => t.windowId === window.id).map(t => `t${t.id}`)
  }));

  const currentTime = Date.now();

  const sessionTabs = tabs.map(tab => {
    const group = groups.find(g => g.id === tab.groupId);
    const timeData = tabTimeData.get(tab.id) || {};
    const createdAt = timeData.created || currentTime;
    const lastAccessedAt = timeData.lastAccessed || currentTime;
    const createdAgo = getTimeAgo(createdAt, currentTime);
    const lastAccessedAgo = getTimeAgo(lastAccessedAt, currentTime);
    let domain = '';
    try {
      const url = new URL(tab.url);
      domain = url.hostname;
    } catch (e) {
      domain = tab.url.split('/')[0];
    }

    return {
      id: `t${tab.id}`,
      tabId: tab.id,
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
      groupId: group.id,
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

  if (options.includeRules !== false) {
    exportData.extensionData.rules = state.rules.map(rule => ({
      ...rule,
      conditionsReadable: getConditionsReadable(rule.conditions),
      actionsReadable: getActionsReadable(rule.actions)
    }));
  }

  if (options.includeSnoozed !== false) {
    const snoozedTabs = await SnoozeService.getSnoozedTabs();
    exportData.extensionData.snoozedTabs = snoozedTabs.map(tab => ({
      ...tab,
      wakeTimeReadable: tab.snoozeUntil ? getTimeUntil(tab.snoozeUntil, currentTime) : 'Unknown',
      snoozedReadable: tab.createdAt ? getTimeAgo(tab.createdAt, currentTime) : 'Unknown'
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

function buildCSVExport(tabs, groups, tabTimeData) {
  const headers = ['Window', 'Group', 'Position', 'Title', 'URL', 'Domain', 'Pinned', 'Active', 'Created', 'Last Accessed'];
  const rows = [headers];

  tabs.forEach(tab => {
    const group = groups.find(g => g.id === tab.groupId);
    const timeData = tabTimeData.get(tab.id) || {};
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
      tab.title.replace(/"/g, '""'),
      tab.url,
      domain,
      tab.pinned ? 'true' : 'false',
      tab.active ? 'true' : 'false',
      timeData.created ? new Date(timeData.created).toLocaleString() : '',
      timeData.lastAccessed ? new Date(timeData.lastAccessed).toLocaleString() : ''
    ];

    rows.push(row);
  });

  const csv = rows.map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  return { csv, format: 'csv' };
}

async function buildMarkdownExport(tabs, windows, groups, options, state) {
  const windowsArray = Array.isArray(windows) ? windows : [windows];
  let markdown = '# TabMaster Export - ' + new Date().toLocaleDateString() + '\n\n';

  markdown += '## Summary\n';
  markdown += `- **Total Tabs**: ${tabs.length} across ${windowsArray.length} window${windowsArray.length > 1 ? 's' : ''}\n`;
  markdown += `- **Tab Groups**: ${groups.length} groups\n`;
  const snoozedTabs = await SnoozeService.getSnoozedTabs();
  if (options.includeSnoozed !== false && snoozedTabs.length > 0) {
    markdown += `- **Snoozed Tabs**: ${snoozedTabs.length} tabs\n`;
  }
  if (options.includeRules !== false && state.rules.length > 0) {
    markdown += `- **Active Rules**: ${state.rules.filter(r => r.enabled).length} rules\n`;
  }
  markdown += '\n';

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

  if (options.includeSnoozed !== false && snoozedTabs.length > 0) {
    markdown += '## Snoozed Tabs\n';
    markdown += '| Title | URL | Wake Time | Reason |\n';
    markdown += '|-------|-----|-----------|--------|\n';

    snoozedTabs.forEach(tab => {
      const wakeTime = tab.snoozeUntil ? new Date(tab.snoozeUntil).toLocaleString() : 'Unknown';
      markdown += `| ${tab.title} | ${tab.url} | ${wakeTime} | ${tab.snoozeReason || 'manual'} |\n`;
    });
    markdown += '\n';
  }

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

export async function exportData(options = {}, state, tabTimeData) {
  const {
    scope = 'all-windows',
    format = 'json',
    currentWindowId = null
  } = options;

  const query = scope === 'current-window' && currentWindowId
    ? { windowId: currentWindowId }
    : {};

  const tabs = await chrome.tabs.query(query);
  const windows = scope === 'current-window' && currentWindowId
    ? await chrome.windows.get(currentWindowId)
    : await chrome.windows.getAll();
  const groups = await chrome.tabGroups.query(query);

  switch (format) {
    case 'json':
      return await buildJSONExport(tabs, windows, groups, options, state, tabTimeData);
    case 'csv':
      return buildCSVExport(tabs, groups, tabTimeData);
    case 'markdown':
      return await buildMarkdownExport(tabs, windows, groups, options, state);
    default:
      return await buildJSONExport(tabs, windows, groups, options, state, tabTimeData);
  }
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
    const windowIdMap = new Map();
    const groupIdMap = new Map();
    const newWindowIds = [];

    if (scope === 'current-window' || scope === 'replace-all') {
      const currentWindow = await chrome.windows.getCurrent();
      targetWindowId = currentWindow.id;
      windows.forEach(window => {
        const oldId = window.windowId || parseInt(window.id.replace('w', ''));
        windowIdMap.set(oldId, targetWindowId);
      });
    } else {
      for (const windowData of windows) {
        try {
          const newWindow = await chrome.windows.create({
            focused: windows.indexOf(windowData) === 0,
            state: windowData.state || 'normal'
          });
          const oldId = windowData.windowId || parseInt(windowData.id.replace('w', ''));
          windowIdMap.set(oldId, newWindow.id);
          newWindowIds.push(newWindow.id);
          result.windowCount++;
          targetWindowId = newWindow.id;
        } catch (e) {
          console.error('Failed to create window:', e);
          result.errors.push(`Failed to create window: ${e.message}`);
        }
      }
      if (windows.length === 0 && tabs.length > 0) {
        const newWindow = await chrome.windows.create({ focused: true });
        targetWindowId = newWindow.id;
        result.windowCount = 1;
        const defaultTabs = await chrome.tabs.query({ windowId: newWindow.id });
        for (const tab of defaultTabs) {
          try {
            await chrome.tabs.remove(tab.id);
          } catch (e) {}
        }
      }
    }

    if (importGroups && groups.length > 0) {
      for (const groupData of groups) {
        try {
          const oldWindowId = groupData.windowId ? parseInt(groupData.windowId.replace('w', '')) : null;
          const newWindowId = oldWindowId ? windowIdMap.get(oldWindowId) : targetWindowId;
          if (!newWindowId) continue;
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

    const BATCH_SIZE = 10;
    const tabsToCreate = [];
    for (const tabData of tabs) {
      if (tabData.url && (tabData.url.startsWith('chrome://') || tabData.url.startsWith('edge://') || tabData.url.startsWith('about:') || tabData.url.startsWith('chrome-extension://'))) {
        result.errors.push(`Skipped restricted URL: ${tabData.url}`);
        continue;
      }
      const oldWindowId = tabData.windowId ? parseInt(tabData.windowId.replace('w', '')) : null;
      const newWindowId = oldWindowId ? windowIdMap.get(oldWindowId) : targetWindowId;
      if (!newWindowId) continue;
      tabsToCreate.push({
        url: tabData.url || 'about:blank',
        windowId: newWindowId,
        pinned: tabData.pinned || false,
        active: false,
        groupId: tabData.groupId,
        groupData: groupIdMap.get(parseInt((tabData.groupId || '-1').toString().replace('g', ''))),
        originalData: tabData
      });
    }

    if (tabsToCreate.length === 0) return result;

    const createdGroups = new Map();
    for (let i = 0; i < tabsToCreate.length; i += BATCH_SIZE) {
      const batch = tabsToCreate.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (tabInfo) => {
        try {
          const newTab = await chrome.tabs.create({ url: tabInfo.url, windowId: tabInfo.windowId, pinned: tabInfo.pinned, active: false });
          result.tabCount++;
          if (importGroups && tabInfo.groupData) {
            const groupKey = `${tabInfo.windowId}-${tabInfo.groupData.title}`;
            if (!createdGroups.has(groupKey)) {
              const groupId = await chrome.tabs.group({ tabIds: [newTab.id], createProperties: { windowId: tabInfo.windowId } });
              await chrome.tabGroups.update(groupId, { title: tabInfo.groupData.title, color: tabInfo.groupData.color, collapsed: tabInfo.groupData.collapsed });
              createdGroups.set(groupKey, groupId);
              result.groupCount++;
            } else {
              await chrome.tabs.group({ tabIds: [newTab.id], groupId: createdGroups.get(groupKey) });
            }
          }
        } catch (e) {
          result.errors.push(`Failed to create tab: ${e.message}`);
        }
      }));
      if (i + BATCH_SIZE < tabsToCreate.length) await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (scope === 'new-windows' && newWindowIds && newWindowIds.length > 0) {
      for (const windowId of newWindowIds) {
        try {
          const windowTabs = await chrome.tabs.query({ windowId });
          for (const tab of windowTabs) {
            if (tab.url === 'chrome://newtab/' || (tab.url === '' && tab.title === 'New Tab') || (tab.pendingUrl === 'chrome://newtab/')) {
              try {
                await chrome.tabs.remove(tab.id);
              } catch (e) {}
            }
          }
        } catch (e) {}
      }
    }
  } catch (error) {
    console.error('Failed to import tabs and groups:', error);
    result.errors.push(error.message);
  }
  return result;
}

async function importRules(rules, state, loadRules, scheduler) {
  const result = { imported: 0, errors: [] };
  try {
    await loadRules();
    for (const ruleData of rules) {
      try {
        const existingRule = state.rules.find(r => r.name === ruleData.name);
        if (existingRule) {
          const updatedRule = { ...existingRule, ...ruleData, id: existingRule.id, updatedAt: Date.now() };
          state.rules[state.rules.findIndex(r => r.id === existingRule.id)] = updatedRule;
        } else {
          state.rules.push({ ...ruleData, id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, createdAt: Date.now(), updatedAt: Date.now() });
        }
        result.imported++;
      } catch (e) {
        result.errors.push(`Failed to import rule "${ruleData.name}": ${e.message}`);
      }
    }
    await chrome.storage.local.set({ rules: state.rules });
    for (const rule of state.rules) {
      if (rule.enabled) await scheduler.setupRule(rule);
    }
  } catch (error) {
    console.error('Failed to import rules:', error);
    result.errors.push(error.message);
  }
  return result;
}

async function importSnoozedTabs(snoozedTabs) {
  const result = { imported: 0, errors: [] };
  const allSnoozed = await SnoozeService.getSnoozedTabs();
  try {
    for (const tabData of snoozedTabs) {
      try {
        if (tabData.url && (tabData.url.startsWith('chrome://') || tabData.url.startsWith('edge://') || tabData.url.startsWith('about:'))) {
          result.errors.push(`Skipped restricted snoozed URL: ${tabData.url}`);
          continue;
        }
        allSnoozed.push({ ...tabData, id: `snoozed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, createdAt: tabData.createdAt || Date.now() });
        result.imported++;
      } catch (e) {
        result.errors.push(`Failed to import snoozed tab: ${e.message}`);
      }
    }
    await chrome.storage.local.set({ snoozedTabs: allSnoozed });
    await SnoozeService.initialize(chrome);
  } catch (error) {
    console.error('Failed to import snoozed tabs:', error);
    result.errors.push(error.message);
  }
  return result;
}

export async function importData(data, options = {}, state, loadRules, scheduler) {
  const {
    scope = 'new-windows',
    importGroups = true,
    shouldImportRules = true,
    shouldImportSnoozed = true,
    importSettings = false
  } = options;

  const result = {
    success: false,
    imported: { windows: 0, tabs: 0, groups: 0, rules: 0, snoozed: 0 },
    errors: [],
    warnings: []
  };

  try {
    if (!data || !data.session) throw new Error('Invalid import data: missing session information');
    if (scope === 'replace-all') {
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
    }

    if (data.session && data.session.tabs && data.session.tabs.length > 0) {
      const importResult = await importTabsAndGroups(data.session.tabs, data.session.groups || [], data.session.windows || [], scope, importGroups);
      result.imported.tabs = importResult.tabCount;
      result.imported.groups = importResult.groupCount;
      result.imported.windows = importResult.windowCount;
      if (importResult.errors.length > 0) result.errors.push(...importResult.errors);
    }

    if (shouldImportRules && data.extensionData && data.extensionData.rules) {
      const rulesResult = await importRules(data.extensionData.rules, state, loadRules, scheduler);
      result.imported.rules = rulesResult.imported;
      if (rulesResult.errors.length > 0) result.errors.push(...rulesResult.errors);
    }

    if (shouldImportSnoozed && data.extensionData && data.extensionData.snoozedTabs) {
      const snoozedResult = await importSnoozedTabs(data.extensionData.snoozedTabs);
      result.imported.snoozed = snoozedResult.imported;
      if (snoozedResult.errors.length > 0) result.errors.push(...snoozedResult.errors);
    }

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