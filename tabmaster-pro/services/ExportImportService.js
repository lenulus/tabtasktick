/**
 * @file ExportImportService - Data export/import in multiple formats with session restoration
 *
 * @description
 * The ExportImportService handles all data export and import operations for TabMaster Pro,
 * supporting three output formats (JSON, CSV, Markdown) and providing complete session
 * restoration capabilities. It exports full snapshots including tabs, windows, groups, rules,
 * settings, snoozed tabs, statistics, collections, and tasks, and can restore complete browser
 * sessions from these snapshots.
 *
 * Key features include scope control (all windows vs current window), format selection
 * (structured JSON for backups, CSV for analysis, Markdown for readability), comprehensive
 * window restoration (creates new windows with preserved metadata), group restoration (recreates
 * tab groups with titles/colors), and snoozed tab restoration via SnoozeService integration.
 *
 * The service implements the 137-line battle-tested window creation logic that is reused by
 * WindowService for window snooze restoration. It handles complex edge cases like default tab
 * removal, group recreation across windows, error recovery for partial imports, and ID remapping
 * (old window/group IDs → new IDs after restoration).
 *
 * Export formats:
 * - JSON: Complete structured data for backups and restoration (default)
 * - CSV: Flat tab list for spreadsheet analysis
 * - Markdown: Human-readable session summary with tables and statistics
 *
 * Import scopes:
 * - 'new-windows': Create new windows for each window in import (preserves structure)
 * - 'current-window': Import all tabs into current window (flattens structure)
 * - 'replace-all': Close all tabs in current window, then import
 *
 * @module services/ExportImportService
 *
 * @architecture
 * - Layer: Execution Service (Data Management)
 * - Dependencies:
 *   - SnoozeService (snoozed tab restoration)
 *   - chrome.tabs (tab creation/query)
 *   - chrome.windows (window creation/management)
 *   - chrome.tabGroups (group creation/management)
 * - Used By: Background handlers, Dashboard export/import UI, ScheduledExportService, WindowService
 * - Reused By: WindowService (window restoration logic)
 *
 * @example
 * // Export all windows as JSON
 * import * as ExportImportService from './services/ExportImportService.js';
 *
 * const exportData = await ExportImportService.exportData(
 *   { scope: 'all-windows', format: 'json', includeRules: true },
 *   state,
 *   tabTimeData
 * );
 *
 * @example
 * // Import session to new windows
 * const result = await ExportImportService.importData(
 *   importData,
 *   { scope: 'new-windows', importGroups: true },
 *   state,
 *   loadRules,
 *   scheduler
 * );
 * console.log(`Restored ${result.imported.tabs} tabs in ${result.imported.windows} windows`);
 */
// Service for handling all export and import functionality.
import * as SnoozeService from './execution/SnoozeService.js';
import { createWindowWithTabsAndGroups } from './utils/windowCreation.js';
import { getAllCollections, getCompleteCollection } from './utils/storage-queries.js';
import * as CollectionImportService from './execution/CollectionImportService.js';

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

  // Include collections and tasks (from IndexedDB)
  if (options.includeCollections !== false) {
    try {
      const allCollections = await getAllCollections();
      const collectionsWithData = [];

      for (const collection of allCollections) {
        // Get complete collection with folders, tabs, and tasks
        const completeCollection = await getCompleteCollection(collection.id);

        if (completeCollection) {
          // Build export format similar to CollectionExportService
          const collectionExport = {
            name: completeCollection.name,
            description: completeCollection.description,
            icon: completeCollection.icon,
            color: completeCollection.color,
            tags: completeCollection.tags || [],
            settings: completeCollection.settings,
            metadata: {
              createdAt: completeCollection.metadata?.createdAt,
              lastAccessed: completeCollection.metadata?.lastAccessed
            }
          };

          // Export folders with tabs
          const folders = completeCollection.folders || [];
          folders.sort((a, b) => a.position - b.position);

          collectionExport.folders = folders.map(folder => ({
            name: folder.name,
            color: folder.color,
            collapsed: folder.collapsed || false,
            position: folder.position,
            tabs: (folder.tabs || []).map(tab => ({
              url: tab.url,
              title: tab.title,
              favicon: tab.favicon,
              note: tab.note,
              position: tab.position,
              isPinned: tab.isPinned || false
            }))
          }));

          // Export ungrouped tabs
          const ungroupedTabs = completeCollection.ungroupedTabs || [];
          if (ungroupedTabs.length > 0) {
            ungroupedTabs.sort((a, b) => a.position - b.position);
            collectionExport.ungroupedTabs = ungroupedTabs.map(tab => ({
              url: tab.url,
              title: tab.title,
              favicon: tab.favicon,
              note: tab.note,
              position: tab.position,
              isPinned: tab.isPinned || false
            }));
          }

          // Export tasks with tab references
          const tasks = completeCollection.tasks || [];
          if (tasks.length > 0) {
            collectionExport.tasks = tasks.map(task => {
              const taskExport = {
                summary: task.summary,
                notes: task.notes,
                status: task.status,
                priority: task.priority,
                dueDate: task.dueDate,
                tags: task.tags || [],
                comments: task.comments || [],
                createdAt: task.createdAt,
                completedAt: task.completedAt
              };

              // Convert tab IDs to folder/tab indices for portability
              if (task.tabIds && task.tabIds.length > 0) {
                taskExport.tabReferences = convertTabIdsToReferences(
                  task.tabIds,
                  folders
                );
              } else {
                taskExport.tabReferences = [];
              }

              return taskExport;
            });
          }

          collectionsWithData.push(collectionExport);
        }
      }

      exportData.extensionData.collections = collectionsWithData;
    } catch (error) {
      console.error('Failed to export collections:', error);
      // Don't fail entire export if collections fail
      exportData.extensionData.collections = [];
    }
  }

  return exportData;
}

/**
 * Convert tab IDs to folder/tab index references with fallback identifiers.
 *
 * Helper function for exporting tasks - converts internal tab IDs to
 * portable folder/tab indices with URL fallbacks.
 *
 * @private
 * @param {string[]} tabIds - Array of tab IDs
 * @param {Object[]} folders - Folders with tabs (already loaded)
 * @returns {Object[]} Array of {folderIndex, tabIndex, url, title} references
 */
function convertTabIdsToReferences(tabIds, folders) {
  const references = [];

  for (const tabId of tabIds) {
    // Find folder and tab index
    for (let folderIndex = 0; folderIndex < folders.length; folderIndex++) {
      const folder = folders[folderIndex];
      const tabIndex = folder.tabs?.findIndex(t => t.id === tabId);

      if (tabIndex !== undefined && tabIndex !== -1) {
        const tab = folder.tabs[tabIndex];

        // Include fallback identifiers for recovery
        references.push({
          folderIndex,
          tabIndex,
          url: tab.url,
          title: tab.title
        });
        break;
      }
    }
  }

  return references;
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

/**
 * Exports browser session data in specified format.
 *
 * Creates a complete snapshot of the current browser state including tabs, windows,
 * groups, rules, settings, snoozed tabs, and statistics. Supports three output formats
 * optimized for different use cases. The export can be scoped to all windows or just
 * the current window.
 *
 * JSON format includes complete structured data suitable for backups and restoration.
 * CSV format provides a flat tab list suitable for spreadsheet analysis. Markdown
 * format creates a human-readable report with tables and statistics.
 *
 * @param {Object} [options={}] - Export configuration
 * @param {string} [options.scope='all-windows'] - Export scope: 'all-windows' or 'current-window'
 * @param {string} [options.format='json'] - Output format: 'json', 'csv', or 'markdown'
 * @param {number} [options.currentWindowId=null] - Window ID (required if scope='current-window')
 * @param {boolean} [options.includeRules=false] - Include automation rules in export
 * @param {boolean} [options.includeSnoozed=false] - Include snoozed tabs in export
 * @param {boolean} [options.includeSettings=false] - Include extension settings in export
 * @param {boolean} [options.includeStatistics=false] - Include usage statistics in export
 * @param {boolean} [options.includeCollections=false] - Include collections and tasks from IndexedDB in export
 * @param {Object} state - Background state object (rules, settings)
 * @param {Map} tabTimeData - Tab time tracking data (created/lastAccessed times)
 *
 * @returns {Promise<Object>} Export result
 * @returns {Object} return.session - Session data (tabs, windows, groups)
 * @returns {Array} return.session.tabs - Tab objects with metadata
 * @returns {Array} return.session.windows - Window objects with metadata
 * @returns {Array} return.session.groups - Group objects with colors/titles
 * @returns {Array} [return.rules] - Automation rules (if includeRules=true)
 * @returns {Array} [return.snoozedTabs] - Snoozed tabs (if includeSnoozed=true)
 * @returns {Object} [return.settings] - Extension settings (if includeSettings=true)
 * @returns {Object} [return.statistics] - Usage stats (if includeStatistics=true)
 * @returns {Array} [return.collections] - Collections with folders, tabs, and tasks (if includeCollections=true)
 * @returns {Object} return.meta - Export metadata (date, version, counts)
 * @returns {string} [return.format] - Format identifier (for CSV/Markdown)
 *
 * @example
 * // Full backup export (JSON)
 * const backup = await exportData(
 *   {
 *     scope: 'all-windows',
 *     format: 'json',
 *     includeRules: true,
 *     includeSnoozed: true,
 *     includeSettings: true,
 *     includeStatistics: true
 *   },
 *   state,
 *   tabTimeData
 * );
 *
 * @example
 * // CSV export for analysis
 * const csv = await exportData(
 *   { scope: 'all-windows', format: 'csv' },
 *   state,
 *   tabTimeData
 * );
 *
 * @example
 * // Markdown report for current window
 * const report = await exportData(
 *   { scope: 'current-window', format: 'markdown', currentWindowId: 123 },
 *   state,
 *   tabTimeData
 * );
 */
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
    let windowNeedingDefaultTabCleanup = null; // Track windows that need cleanup

    if (scope === 'current-window' || scope === 'replace-all') {
      const currentWindow = await chrome.windows.getLastFocused();
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
        // Create window but DON'T remove default tabs yet
        // We'll clean them up after creating real tabs to avoid closing the window
        const newWindow = await chrome.windows.create({ focused: true });
        targetWindowId = newWindow.id;
        windowNeedingDefaultTabCleanup = newWindow.id;
        result.windowCount = 1;
      }
    }

    // Build group ID map for tab-to-group assignment
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

    // Transform export format tabs into windowCreation format
    // Group tabs by window for efficient batch processing
    const tabsByWindow = new Map();

    for (const tabData of tabs) {
      const oldWindowId = tabData.windowId ? parseInt(tabData.windowId.replace('w', '')) : null;
      const newWindowId = oldWindowId ? windowIdMap.get(oldWindowId) : targetWindowId;
      if (!newWindowId) continue;

      // Get group info if this tab belongs to a group
      const oldGroupId = tabData.groupId ? parseInt((tabData.groupId || '-1').toString().replace('g', '')) : null;
      const groupInfo = oldGroupId ? groupIdMap.get(oldGroupId) : null;

      // Transform to windowCreation format
      const transformedTab = {
        url: tabData.url || 'about:blank',
        pinned: tabData.pinned || false,
        groupKey: groupInfo && importGroups ? `${groupInfo.windowId}-${groupInfo.title}` : null,
        groupInfo: groupInfo && importGroups ? groupInfo : null,
        metadata: tabData // Store original data for reference
      };

      // Group by window
      if (!tabsByWindow.has(newWindowId)) {
        tabsByWindow.set(newWindowId, []);
      }
      tabsByWindow.get(newWindowId).push(transformedTab);
    }

    if (tabsByWindow.size === 0) return result;

    // Create tabs in each window using shared utility
    for (const [windowId, windowTabs] of tabsByWindow) {
      try {
        const createResult = await createWindowWithTabsAndGroups({
          tabs: windowTabs,
          createNewWindow: false, // Windows already created
          windowId: windowId
        });

        result.tabCount += createResult.stats.tabsCreated;
        result.groupCount += createResult.stats.groupsCreated;
        result.errors.push(...createResult.stats.warnings);
      } catch (error) {
        result.errors.push(`Failed to create tabs in window ${windowId}: ${error.message}`);
      }
    }

    // Remove default blank tabs from windows created without metadata
    // (only after real tabs have been created to avoid closing the window)
    if (windowNeedingDefaultTabCleanup) {
      try {
        const allTabsInWindow = await chrome.tabs.query({ windowId: windowNeedingDefaultTabCleanup });
        for (const tab of allTabsInWindow) {
          if (tab.url === 'about:blank' || tab.url === 'chrome://newtab/') {
            try {
              await chrome.tabs.remove(tab.id);
            } catch (e) {
              // Ignore errors - tab may have already been removed
            }
          }
        }
      } catch (error) {
        // Ignore cleanup errors
      }
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

/**
 * Imports browser session data from export file.
 *
 * Restores a complete browser session from export data, including tabs, windows, groups,
 * rules, and snoozed tabs. Supports three import scopes that control how the session is
 * restored. Implements the 137-line battle-tested window creation logic that handles
 * complex edge cases like default tab removal, group recreation, and ID remapping.
 *
 * Import process:
 * 1. Validate import data structure
 * 2. Handle scope-specific preparation (replace-all closes existing windows)
 * 3. Create windows and restore tabs with metadata
 * 4. Recreate groups with titles/colors (if importGroups=true)
 * 5. Restore snoozed tabs via SnoozeService (if shouldImportSnoozed=true)
 * 6. Import automation rules (if shouldImportRules=true)
 * 7. Import settings (if importSettings=true)
 *
 * The function provides detailed results including success/failure status, counts of
 * imported items, error messages, and warnings. Partial imports are supported - some
 * items can succeed while others fail.
 *
 * @param {Object} data - Export data (from exportData function)
 * @param {Object} data.session - Session data (required)
 * @param {Array} data.session.tabs - Tab objects to restore
 * @param {Array} data.session.windows - Window objects to create
 * @param {Array} data.session.groups - Group objects to recreate
 * @param {Object} [data.extensionData] - Extension data (rules, snoozed tabs, settings)
 * @param {Array} [data.extensionData.rules] - Automation rules
 * @param {Array} [data.extensionData.snoozedTabs] - Snoozed tabs
 * @param {Object} [data.extensionData.settings] - Extension settings
 * @param {Object} [options={}] - Import configuration
 * @param {string} [options.scope='new-windows'] - Import scope: 'new-windows', 'current-window', or 'replace-all'
 * @param {boolean} [options.importGroups=true] - Whether to recreate tab groups
 * @param {boolean} [options.shouldImportRules=true] - Whether to import automation rules
 * @param {boolean} [options.shouldImportSnoozed=true] - Whether to restore snoozed tabs
 * @param {boolean} [options.importSettings=false] - Whether to import extension settings
 * @param {boolean} [options.shouldImportCollections=true] - Whether to import collections and tasks from IndexedDB
 * @param {Object} state - Background state object (for rules/settings)
 * @param {Function} loadRules - Function to reload rules from storage
 * @param {Object} scheduler - Scheduler object (for rule setup)
 *
 * @returns {Promise<Object>} Import result
 * @returns {boolean} return.success - Whether import succeeded overall
 * @returns {Object} return.imported - Counts of imported items
 * @returns {number} return.imported.windows - Number of windows created
 * @returns {number} return.imported.tabs - Number of tabs restored
 * @returns {number} return.imported.groups - Number of groups recreated
 * @returns {number} return.imported.rules - Number of rules imported
 * @returns {number} return.imported.snoozed - Number of snoozed tabs restored
 * @returns {number} [return.imported.collections] - Number of collections imported (if shouldImportCollections=true)
 * @returns {number} [return.imported.collectionTasks] - Number of collection tasks imported (if shouldImportCollections=true)
 * @returns {Array<string>} return.errors - Error messages (empty if no errors)
 * @returns {Array<string>} return.warnings - Warning messages (non-fatal issues)
 *
 * @throws {Error} If import data is invalid or missing required fields
 *
 * @example
 * // Import to new windows (preserves structure)
 * const result = await importData(
 *   exportData,
 *   { scope: 'new-windows', importGroups: true },
 *   state,
 *   loadRules,
 *   scheduler
 * );
 * console.log(`Imported ${result.imported.tabs} tabs in ${result.imported.windows} windows`);
 *
 * @example
 * // Import to current window (flatten structure)
 * const result = await importData(
 *   exportData,
 *   { scope: 'current-window', importGroups: false },
 *   state,
 *   loadRules,
 *   scheduler
 * );
 *
 * @example
 * // Replace all windows (destructive)
 * const result = await importData(
 *   exportData,
 *   { scope: 'replace-all', importGroups: true },
 *   state,
 *   loadRules,
 *   scheduler
 * );
 *
 * @example
 * // Handle partial import with errors
 * const result = await importData(exportData, options, state, loadRules, scheduler);
 * if (result.errors.length > 0) {
 *   console.warn(`${result.errors.length} errors during import:`, result.errors);
 * }
 * if (result.warnings.length > 0) {
 *   console.info(`${result.warnings.length} warnings:`, result.warnings);
 * }
 */
export async function importData(data, options = {}, state, loadRules, scheduler) {
  const {
    scope = 'new-windows',
    importGroups = true,
    shouldImportRules = true,
    shouldImportSnoozed = true,
    importSettings = false,
    shouldImportCollections = true
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
      const currentWindow = await chrome.windows.getLastFocused();
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

    // Import collections and tasks if present in export data
    if (options.shouldImportCollections !== false && data.extensionData && data.extensionData.collections && data.extensionData.collections.length > 0) {
      try {
        // Build import doc in CollectionImportService format
        const collectionsImportDoc = {
          version: '1.1',
          exportedAt: Date.now(),
          collections: data.extensionData.collections
        };

        // Use CollectionImportService to import collections
        const collectionsResult = await CollectionImportService.importCollections(collectionsImportDoc, {
          mode: 'merge', // Always merge - don't replace existing collections
          importTasks: true,
          importSettings: true
        });

        result.imported.collections = collectionsResult.stats.collectionsImported;
        result.imported.collectionTasks = collectionsResult.stats.tasksImported;

        // Add any errors from collection import
        if (collectionsResult.errors.length > 0) {
          result.errors.push(...collectionsResult.errors.map(e =>
            `Collection "${e.collectionName}": ${e.error}`
          ));
        }

        // Add any warnings from collection import
        if (collectionsResult.stats.warnings.length > 0) {
          result.warnings.push(...collectionsResult.stats.warnings);
        }
      } catch (e) {
        console.error('Failed to import collections:', e);
        result.errors.push('Failed to import collections: ' + e.message);
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