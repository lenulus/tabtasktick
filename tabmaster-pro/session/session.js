// Session Manager - Bulk tab management interface for Rules Engine 2.0

// Import Rules Engine modules
import { previewRule } from '../lib/engine.v2.services.js';
import { normalizeUrlForDuplicates } from '../services/selection/selectTabs.js';
import { GroupingScope, groupTabsByDomain as groupTabsByDomainService } from '../services/TabGrouping.js';

// State management
const sessionState = {
  windows: new Map(),
  selectedTabs: new Set(),
  searchQuery: '',
  stats: {
    totalTabs: 0,
    totalWindows: 0,
    totalGroups: 0,
    duplicates: 0,
    solos: 0,
    memory: 0
  },
  rules: [],
  expandedNodes: new Set(['root']) // Track expanded state
};

// DOM elements
let elements = {};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  cacheElements();
  await loadSession();
  await loadRules();
  setupEventListeners();
});

// Cache DOM elements
function cacheElements() {
  elements = {
    tree: document.getElementById('sessionTree'),
    search: document.getElementById('sessionSearch'),
    searchCount: document.getElementById('searchCount'),
    selectedCount: document.getElementById('selectedCount'),
    selectionStats: document.getElementById('selectionStats'),
    ruleSelector: document.getElementById('ruleSelector'),
    dryRunResults: document.getElementById('dryRunResults'),
    clearSelection: document.getElementById('clearSelection'),
    expandAll: document.getElementById('expandAll'),
    collapseAll: document.getElementById('collapseAll'),
    // Action buttons
    actions: {
      close: document.querySelector('[data-action="close"]'),
      group: document.querySelector('[data-action="group"]'),
      snooze: document.querySelector('[data-action="snooze"]'),
      bookmark: document.querySelector('[data-action="bookmark"]'),
      move: document.querySelector('[data-action="move"]'),
      dedupe: document.querySelector('[data-action="dedupe"]'),
      closeSolos: document.querySelector('[data-action="close-solos"]'),
      groupByDomain: document.querySelector('[data-action="group-by-domain"]'),
      archiveOld: document.querySelector('[data-action="archive-old"]')
    },
    // Rule buttons
    dryRun: document.getElementById('dryRunRule'),
    applyRule: document.getElementById('applyRule'),
    // Toolbar buttons
    snapshot: document.getElementById('snapshotSession'),
    import: document.getElementById('importSession'),
    export: document.getElementById('exportSession'),
    refresh: document.getElementById('refreshSession')
  };
}

// Load current session data
async function loadSession() {
  try {
    showLoading();
    
    const [tabs, windows, groups] = await Promise.all([
      chrome.tabs.query({}),
      chrome.windows.getAll(),
      chrome.tabGroups.query({})
    ]);

    // Build session structure
    buildSessionStructure(tabs, windows, groups);
    
    // Calculate stats
    calculateStats();
    
    // Render tree
    renderTree();
    
    // Update UI
    updateSelectionUI();
    
  } catch (error) {
    console.error('Failed to load session:', error);
    showError('Failed to load session data');
  }
}

// Build hierarchical session structure
function buildSessionStructure(tabs, windows, groups) {
  sessionState.windows.clear();
  sessionState.stats = {
    totalTabs: tabs.length,
    totalWindows: windows.length,
    totalGroups: groups.length,
    duplicates: 0,
    solos: 0,
    memory: 0
  };

  // Create window map
  windows.forEach(window => {
    sessionState.windows.set(window.id, {
      id: window.id,
      name: `Window ${window.id}`,
      focused: window.focused,
      incognito: window.incognito,
      color: generateWindowColor(window.id),
      groups: new Map(),
      ungroupedTabs: [],
      expanded: sessionState.expandedNodes.has(`window-${window.id}`)
    });
  });

  // Create group map
  groups.forEach(group => {
    const window = sessionState.windows.get(group.windowId);
    if (window) {
      window.groups.set(group.id, {
        id: group.id,
        title: group.title || `Group ${group.id}`,
        color: group.color || 'grey',
        collapsed: group.collapsed,
        tabs: [],
        expanded: sessionState.expandedNodes.has(`group-${group.id}`)
      });
    }
  });

  // Organize tabs and detect duplicates/solos
  const urlCounts = new Map();
  const domainCounts = new Map();

  tabs.forEach(tab => {
    // Count URLs for duplicate detection
    const normalizedUrl = normalizeUrlForDuplicates(tab.url);
    urlCounts.set(normalizedUrl, (urlCounts.get(normalizedUrl) || 0) + 1);

    // Count domains for solo detection
    const domain = getDomain(tab.url);
    domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);

    // Add tab to structure
    const window = sessionState.windows.get(tab.windowId);
    if (window) {
      const tabData = {
        id: tab.id,
        windowId: tab.windowId,
        groupId: tab.groupId,
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl || getFaviconUrl(tab.url),
        pinned: tab.pinned,
        audible: tab.audible,
        mutedInfo: tab.mutedInfo,
        active: tab.active,
        index: tab.index
      };

      if (tab.groupId !== -1) {
        const group = window.groups.get(tab.groupId);
        if (group) {
          group.tabs.push(tabData);
        }
      } else {
        window.ungroupedTabs.push(tabData);
      }
    }
  });

  // Calculate duplicate and solo counts
  urlCounts.forEach(count => {
    if (count > 1) {
      sessionState.stats.duplicates += count - 1;
    }
  });

  domainCounts.forEach(count => {
    if (count === 1) {
      sessionState.stats.solos++;
    }
  });
}

// Calculate session statistics
function calculateStats() {
  // Update duplicate count in smart action button
  const dedupeBtn = elements.actions.dedupe;
  const dedupeCount = dedupeBtn.querySelector('.count');
  dedupeCount.textContent = sessionState.stats.duplicates > 0 ? sessionState.stats.duplicates : '';

  // Update solo count
  const solosBtn = elements.actions.closeSolos;
  const solosCount = solosBtn.querySelector('.count');
  solosCount.textContent = sessionState.stats.solos > 0 ? sessionState.stats.solos : '';
}

// Render the tree view
function renderTree() {
  const container = elements.tree;
  container.innerHTML = '';

  if (sessionState.windows.size === 0) {
    container.innerHTML = `
      <div class="tree-empty">
        <h3>No tabs found</h3>
        <p>No browser windows are currently open</p>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();

  sessionState.windows.forEach(window => {
    const windowNode = renderWindowNode(window);
    fragment.appendChild(windowNode);
  });

  container.appendChild(fragment);
}

// Render a window node
function renderWindowNode(window) {
  const node = document.createElement('div');
  node.className = 'tree-node tree-window';
  node.dataset.windowId = window.id;

  const tabCount = window.ungroupedTabs.length + 
    Array.from(window.groups.values()).reduce((sum, g) => sum + g.tabs.length, 0);

  const isSelected = isWindowSelected(window);
  if (isSelected) node.classList.add('selected');

  node.innerHTML = `
    <div class="tree-node-content">
      <input type="checkbox" class="tree-checkbox" data-type="window" data-id="${window.id}" ${isSelected ? 'checked' : ''}>
      <span class="tree-expand ${window.groups.size === 0 && window.ungroupedTabs.length === 0 ? 'empty' : ''}">${window.expanded ? '▼' : '▶'}</span>
      <span class="window-color" style="background-color: ${window.color}"></span>
      <span class="tree-label">${escapeHtml(window.name)}</span>
      <span class="tree-count">${tabCount}</span>
    </div>
  `;

  if (window.expanded) {
    const children = document.createElement('div');
    children.className = 'tree-children';

    // Render groups
    window.groups.forEach(group => {
      children.appendChild(renderGroupNode(group, window.id));
    });

    // Render ungrouped tabs
    window.ungroupedTabs.forEach(tab => {
      children.appendChild(renderTabNode(tab));
    });

    node.appendChild(children);
  }

  return node;
}

// Render a group node
function renderGroupNode(group, windowId) {
  const node = document.createElement('div');
  node.className = 'tree-node tree-group';
  node.dataset.groupId = group.id;
  node.dataset.windowId = windowId;

  const isSelected = isGroupSelected(group);
  if (isSelected) node.classList.add('selected');

  node.innerHTML = `
    <div class="tree-node-content">
      <input type="checkbox" class="tree-checkbox" data-type="group" data-id="${group.id}" ${isSelected ? 'checked' : ''}>
      <span class="tree-expand ${group.tabs.length === 0 ? 'empty' : ''}">${group.expanded ? '▼' : '▶'}</span>
      <span class="group-color" style="background-color: ${getGroupColor(group.color)}"></span>
      <span class="tree-label">${escapeHtml(group.title)}</span>
      <span class="tree-count">${group.tabs.length}</span>
    </div>
  `;

  if (group.expanded && group.tabs.length > 0) {
    const children = document.createElement('div');
    children.className = 'tree-children';

    group.tabs.forEach(tab => {
      children.appendChild(renderTabNode(tab));
    });

    node.appendChild(children);
  }

  return node;
}

// Render a tab node
function renderTabNode(tab) {
  const node = document.createElement('div');
  node.className = 'tree-node tree-tab';
  node.dataset.tabId = tab.id;

  const isSelected = sessionState.selectedTabs.has(tab.id);
  if (isSelected) node.classList.add('selected');

  const badges = [];
  if (tab.pinned) badges.push('<span class="tab-badge pinned">📌</span>');
  if (tab.audible) badges.push('<span class="tab-badge audible">🔊</span>');
  if (tab.mutedInfo?.muted) badges.push('<span class="tab-badge muted">🔇</span>');

  node.innerHTML = `
    <div class="tree-node-content">
      <input type="checkbox" class="tree-checkbox" data-type="tab" data-id="${tab.id}" ${isSelected ? 'checked' : ''}>
      <span class="tree-expand empty"></span>
      <img class="tab-favicon" src="${escapeHtml(tab.favIconUrl)}" onerror="this.src='../icons/icon-16.png'">
      <span class="tree-label">${escapeHtml(tab.title || tab.url)}</span>
      ${badges.length > 0 ? `<div class="tab-badges">${badges.join('')}</div>` : ''}
    </div>
  `;

  return node;
}

// Selection helpers
function isWindowSelected(window) {
  // Window is selected if all its tabs are selected
  const allTabs = [...window.ungroupedTabs];
  window.groups.forEach(group => allTabs.push(...group.tabs));
  
  return allTabs.length > 0 && allTabs.every(tab => sessionState.selectedTabs.has(tab.id));
}

function isGroupSelected(group) {
  // Group is selected if all its tabs are selected
  return group.tabs.length > 0 && group.tabs.every(tab => sessionState.selectedTabs.has(tab.id));
}

// Event listeners
function setupEventListeners() {
  // Tree interactions
  elements.tree.addEventListener('click', handleTreeClick);
  
  // Search
  elements.search.addEventListener('input', debounce(handleSearch, 300));
  
  // Selection controls
  elements.clearSelection.addEventListener('click', clearSelection);
  elements.expandAll.addEventListener('click', expandAll);
  elements.collapseAll.addEventListener('click', collapseAll);
  
  // Action buttons
  Object.entries(elements.actions).forEach(([action, button]) => {
    button.addEventListener('click', () => handleAction(action));
  });
  
  // Rule controls
  elements.ruleSelector.addEventListener('change', handleRuleSelection);
  elements.dryRun.addEventListener('click', handleDryRun);
  elements.applyRule.addEventListener('click', handleApplyRule);
  
  // Toolbar buttons
  elements.snapshot.addEventListener('click', handleSnapshot);
  elements.import.addEventListener('click', handleImport);
  elements.export.addEventListener('click', handleExport);
  elements.refresh.addEventListener('click', loadSession);
  
  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);
}

// Tree click handler
function handleTreeClick(e) {
  const checkbox = e.target.closest('.tree-checkbox');
  const expand = e.target.closest('.tree-expand');
  const nodeContent = e.target.closest('.tree-node-content');
  
  if (checkbox) {
    handleCheckboxClick(checkbox, e);
  } else if (expand && !expand.classList.contains('empty')) {
    handleExpandClick(expand);
  } else if (nodeContent) {
    // Click on node content toggles checkbox
    const cb = nodeContent.querySelector('.tree-checkbox');
    if (cb) {
      cb.checked = !cb.checked;
      handleCheckboxClick(cb, e);
    }
  }
}

// Checkbox selection handler
function handleCheckboxClick(checkbox, event) {
  const type = checkbox.dataset.type;
  const id = parseInt(checkbox.dataset.id);
  const checked = checkbox.checked;
  
  if (type === 'tab') {
    if (checked) {
      sessionState.selectedTabs.add(id);
    } else {
      sessionState.selectedTabs.delete(id);
    }
  } else if (type === 'group') {
    // Select/deselect all tabs in group
    sessionState.windows.forEach(window => {
      const group = window.groups.get(id);
      if (group) {
        group.tabs.forEach(tab => {
          if (checked) {
            sessionState.selectedTabs.add(tab.id);
          } else {
            sessionState.selectedTabs.delete(tab.id);
          }
        });
      }
    });
  } else if (type === 'window') {
    // Select/deselect all tabs in window
    const window = sessionState.windows.get(id);
    if (window) {
      const allTabs = [...window.ungroupedTabs];
      window.groups.forEach(group => allTabs.push(...group.tabs));
      
      allTabs.forEach(tab => {
        if (checked) {
          sessionState.selectedTabs.add(tab.id);
        } else {
          sessionState.selectedTabs.delete(tab.id);
        }
      });
    }
  }
  
  // Handle shift-click for range selection
  if (event.shiftKey && lastSelectedNode) {
    selectRange(lastSelectedNode, checkbox);
  }
  
  lastSelectedNode = checkbox;
  
  // Update UI
  updateTreeSelection();
  updateSelectionUI();
}

// Expand/collapse handler
function handleExpandClick(expand) {
  const node = expand.closest('.tree-node');
  const windowId = node.dataset.windowId;
  const groupId = node.dataset.groupId;
  
  if (groupId) {
    const key = `group-${groupId}`;
    if (sessionState.expandedNodes.has(key)) {
      sessionState.expandedNodes.delete(key);
    } else {
      sessionState.expandedNodes.add(key);
    }
    
    // Update group expanded state
    sessionState.windows.forEach(window => {
      const group = window.groups.get(parseInt(groupId));
      if (group) {
        group.expanded = sessionState.expandedNodes.has(key);
      }
    });
  } else if (windowId) {
    const key = `window-${windowId}`;
    if (sessionState.expandedNodes.has(key)) {
      sessionState.expandedNodes.delete(key);
    } else {
      sessionState.expandedNodes.add(key);
    }
    
    // Update window expanded state
    const window = sessionState.windows.get(parseInt(windowId));
    if (window) {
      window.expanded = sessionState.expandedNodes.has(key);
    }
  }
  
  renderTree();
}

// Update tree selection visually
function updateTreeSelection() {
  // Update tab checkboxes and nodes
  document.querySelectorAll('.tree-tab').forEach(node => {
    const tabId = parseInt(node.dataset.tabId);
    const checkbox = node.querySelector('.tree-checkbox');
    const isSelected = sessionState.selectedTabs.has(tabId);
    
    checkbox.checked = isSelected;
    node.classList.toggle('selected', isSelected);
  });
  
  // Update group checkboxes
  document.querySelectorAll('.tree-group').forEach(node => {
    const groupId = parseInt(node.dataset.groupId);
    const checkbox = node.querySelector('.tree-checkbox');
    
    let isSelected = false;
    sessionState.windows.forEach(window => {
      const group = window.groups.get(groupId);
      if (group) {
        isSelected = isGroupSelected(group);
      }
    });
    
    checkbox.checked = isSelected;
    node.classList.toggle('selected', isSelected);
  });
  
  // Update window checkboxes
  document.querySelectorAll('.tree-window').forEach(node => {
    const windowId = parseInt(node.dataset.windowId);
    const checkbox = node.querySelector('.tree-checkbox');
    
    const window = sessionState.windows.get(windowId);
    const isSelected = window ? isWindowSelected(window) : false;
    
    checkbox.checked = isSelected;
    node.classList.toggle('selected', isSelected);
  });
}

// Update selection UI
function updateSelectionUI() {
  const count = sessionState.selectedTabs.size;
  elements.selectedCount.textContent = count;
  
  // Enable/disable action buttons
  const hasSelection = count > 0;
  Object.values(elements.actions).forEach(button => {
    button.disabled = !hasSelection;
  });
  
  // Update selection stats
  if (hasSelection) {
    const stats = calculateSelectionStats();
    elements.selectionStats.innerHTML = `
      <li><strong>Windows:</strong> ${stats.windows}</li>
      <li><strong>Groups:</strong> ${stats.groups}</li>
      <li><strong>Tabs:</strong> ${stats.tabs}</li>
      <li><strong>Duplicates:</strong> ${stats.duplicates}</li>
      <li><strong>Domains:</strong> ${stats.domains}</li>
    `;
  } else {
    elements.selectionStats.innerHTML = '<li>No tabs selected</li>';
  }
  
  // Enable rule buttons if rule selected
  const ruleSelected = elements.ruleSelector.value !== '';
  elements.dryRun.disabled = !ruleSelected || !hasSelection;
  elements.applyRule.disabled = !ruleSelected || !hasSelection;
}

// Calculate selection statistics
function calculateSelectionStats() {
  const stats = {
    windows: new Set(),
    groups: new Set(),
    tabs: sessionState.selectedTabs.size,
    duplicates: 0,
    domains: new Set()
  };
  
  const urls = new Map();
  
  sessionState.selectedTabs.forEach(tabId => {
    sessionState.windows.forEach(window => {
      // Check ungrouped tabs
      const ungroupedTab = window.ungroupedTabs.find(t => t.id === tabId);
      if (ungroupedTab) {
        stats.windows.add(window.id);
        const url = normalizeUrlForDuplicates(ungroupedTab.url);
        urls.set(url, (urls.get(url) || 0) + 1);
        stats.domains.add(getDomain(ungroupedTab.url));
      }

      // Check grouped tabs
      window.groups.forEach(group => {
        const groupedTab = group.tabs.find(t => t.id === tabId);
        if (groupedTab) {
          stats.windows.add(window.id);
          stats.groups.add(group.id);
          const url = normalizeUrlForDuplicates(groupedTab.url);
          urls.set(url, (urls.get(url) || 0) + 1);
          stats.domains.add(getDomain(groupedTab.url));
        }
      });
    });
  });
  
  // Count duplicates
  urls.forEach(count => {
    if (count > 1) {
      stats.duplicates += count - 1;
    }
  });
  
  return {
    windows: stats.windows.size,
    groups: stats.groups.size,
    tabs: stats.tabs,
    duplicates: stats.duplicates,
    domains: stats.domains.size
  };
}

// Clear selection
function clearSelection() {
  sessionState.selectedTabs.clear();
  updateTreeSelection();
  updateSelectionUI();
}

// Expand all nodes
function expandAll() {
  sessionState.windows.forEach(window => {
    window.expanded = true;
    sessionState.expandedNodes.add(`window-${window.id}`);
    
    window.groups.forEach(group => {
      group.expanded = true;
      sessionState.expandedNodes.add(`group-${group.id}`);
    });
  });
  
  renderTree();
}

// Collapse all nodes
function collapseAll() {
  sessionState.windows.forEach(window => {
    window.expanded = false;
    window.groups.forEach(group => {
      group.expanded = false;
    });
  });
  
  sessionState.expandedNodes.clear();
  sessionState.expandedNodes.add('root');
  
  renderTree();
}

// Search handler
function handleSearch() {
  const query = elements.search.value.toLowerCase().trim();
  sessionState.searchQuery = query;
  
  if (!query) {
    elements.searchCount.textContent = '';
    renderTree();
    return;
  }
  
  // Filter and count matching tabs
  let matchCount = 0;
  const matchingTabs = new Set();
  
  sessionState.windows.forEach(window => {
    window.ungroupedTabs.forEach(tab => {
      if (matchesSearch(tab, query)) {
        matchCount++;
        matchingTabs.add(tab.id);
      }
    });
    
    window.groups.forEach(group => {
      group.tabs.forEach(tab => {
        if (matchesSearch(tab, query)) {
          matchCount++;
          matchingTabs.add(tab.id);
        }
      });
    });
  });
  
  elements.searchCount.textContent = `${matchCount} found`;
  
  // Re-render with search filter
  renderFilteredTree(matchingTabs);
}

// Check if tab matches search query
function matchesSearch(tab, query) {
  return tab.title.toLowerCase().includes(query) || 
         tab.url.toLowerCase().includes(query);
}

// Render filtered tree
function renderFilteredTree(matchingTabs) {
  // For now, just highlight matching tabs
  // TODO: Implement proper filtering that hides non-matching items
  renderTree();
  
  // Highlight matches
  document.querySelectorAll('.tree-tab').forEach(node => {
    const tabId = parseInt(node.dataset.tabId);
    if (matchingTabs.has(tabId)) {
      node.classList.add('search-match');
    }
  });
}

// Action handlers
async function handleAction(action) {
  const selectedIds = Array.from(sessionState.selectedTabs);
  
  try {
    switch (action) {
      case 'close':
        await closeTabs(selectedIds);
        break;
      case 'group':
        await groupTabs(selectedIds);
        break;
      case 'snooze':
        await snoozeTabs(selectedIds);
        break;
      case 'bookmark':
        await bookmarkTabs(selectedIds);
        break;
      case 'move':
        await moveTabsToWindow(selectedIds);
        break;
      case 'dedupe':
        await deduplicateTabs();
        break;
      case 'closeSolos':
        await closeSoloTabs();
        break;
      case 'groupByDomain':
        await groupTabsByDomain(selectedIds);
        break;
      case 'archiveOld':
        await archiveOldTabs(selectedIds);
        break;
    }
    
    // Refresh after action
    await loadSession();
    showNotification(`Action completed: ${action}`);
    
  } catch (error) {
    console.error(`Failed to ${action}:`, error);
    showNotification(`Failed to ${action}`, 'error');
  }
}

// Tab actions - route through background → engine
async function closeTabs(tabIds) {
  await chrome.runtime.sendMessage({
    action: 'closeTabs',
    tabIds: tabIds
  });
  sessionState.selectedTabs.clear();
}

async function groupTabs(tabIds) {
  if (tabIds.length === 0) return;

  // Route through background → engine
  await chrome.runtime.sendMessage({
    action: 'groupTabs',
    tabIds: tabIds,
    groupName: 'New Group',
    color: 'blue'
  });
}

async function snoozeTabs(tabIds) {
  // Route through background → SnoozeService (default to 2 hours)
  await chrome.runtime.sendMessage({
    action: 'snoozeTabs',
    tabIds: tabIds,
    minutes: 120, // 2 hours
    reason: 'session_manager'
  });
}

async function bookmarkTabs(tabIds) {
  // Route through background → engine
  const folderName = `Session ${new Date().toLocaleDateString()}`;
  await chrome.runtime.sendMessage({
    action: 'bookmarkTabs',
    tabIds: tabIds,
    folder: folderName
  });
}

async function moveTabsToWindow(tabIds) {
  if (tabIds.length === 0) return;

  // Route through background → engine (create new window)
  await chrome.runtime.sendMessage({
    action: 'moveToWindow',
    tabIds: tabIds,
    targetWindowId: 'new'
  });
}

async function deduplicateTabs() {
  // Get selected tab IDs
  const selectedIds = Array.from(sessionState.selectedTabs);

  if (selectedIds.length === 0) return;

  // Route through background closeDuplicates handler
  // This will use the engine's duplicate detection
  await chrome.runtime.sendMessage({
    action: 'closeDuplicates',
    tabIds: selectedIds
  });
}

async function closeSoloTabs() {
  // Get all selected tabs
  const selectedIds = Array.from(sessionState.selectedTabs);
  if (selectedIds.length === 0) return;

  // Get all tabs to analyze domains
  const tabs = await chrome.tabs.query({});
  const selectedTabs = tabs.filter(t => selectedIds.includes(t.id));

  // Count domains
  const domainCounts = new Map();
  const tabsByDomain = new Map();

  selectedTabs.forEach(tab => {
    const domain = getDomain(tab.url);
    domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);

    if (!tabsByDomain.has(domain)) {
      tabsByDomain.set(domain, []);
    }
    tabsByDomain.get(domain).push(tab.id);
  });

  // Find solo tabs (only one tab for that domain)
  const toClose = [];
  domainCounts.forEach((count, domain) => {
    if (count === 1) {
      toClose.push(...tabsByDomain.get(domain));
    }
  });

  if (toClose.length > 0) {
    // Route through background → engine
    await chrome.runtime.sendMessage({
      action: 'closeTabs',
      tabIds: toClose
    });
  }
}

async function groupTabsByDomain(tabIds) {
  // Use centralized TabGrouping service
  // Group tabs by their windows first
  const tabsByWindow = new Map();
  for (const tabId of tabIds) {
    const tab = await chrome.tabs.get(tabId);
    if (!tabsByWindow.has(tab.windowId)) {
      tabsByWindow.set(tab.windowId, []);
    }
    tabsByWindow.get(tab.windowId).push(tabId);
  }

  // For each window, group only the selected tabs
  for (const [windowId, windowTabIds] of tabsByWindow) {
    await groupTabsByDomainService(GroupingScope.TARGETED, windowId, {
      specificTabIds: windowTabIds,
      minTabsPerGroup: 2  // Keep session's behavior of requiring >1 tab per group
    });
  }

  // Refresh the session view
  await updateAllWindows();
}

async function archiveOldTabs(tabIds) {
  // TODO: Implement archive functionality
  console.log('Archive old tabs:', tabIds);
}

// Load rules for selector
async function loadRules() {
  try {
    const { rules = [] } = await chrome.storage.local.get('rules');
    sessionState.rules = rules;
    
    // Populate selector
    elements.ruleSelector.innerHTML = '<option value="">Select a rule...</option>';
    
    rules.forEach(rule => {
      if (rule.enabled) {
        const option = document.createElement('option');
        option.value = rule.id;
        option.textContent = rule.name;
        elements.ruleSelector.appendChild(option);
      }
    });
  } catch (error) {
    console.error('Failed to load rules:', error);
  }
}

// Rule selection handler
function handleRuleSelection() {
  const ruleId = elements.ruleSelector.value;
  const hasSelection = sessionState.selectedTabs.size > 0;
  
  elements.dryRun.disabled = !ruleId || !hasSelection;
  elements.applyRule.disabled = !ruleId || !hasSelection;
  elements.dryRunResults.classList.add('hidden');
}

// Dry run handler
async function handleDryRun() {
  const ruleId = elements.ruleSelector.value;
  if (!ruleId) return;
  
  try {
    const rule = sessionState.rules.find(r => r.id === ruleId);
    if (!rule) return;
    
    // Get selected tabs with full data
    const selectedTabs = [];
    sessionState.selectedTabs.forEach(tabId => {
      sessionState.windows.forEach(window => {
        const tab = window.ungroupedTabs.find(t => t.id === tabId) ||
          Array.from(window.groups.values()).flatMap(g => g.tabs).find(t => t.id === tabId);
        if (tab) selectedTabs.push(tab);
      });
    });
    
    // Create context for rules engine
    const context = {
      tabs: selectedTabs,
      windows: Array.from(sessionState.windows.values()),
      groups: Array.from(sessionState.windows.values()).flatMap(w => Array.from(w.groups.values()))
    };
    
    // Run engine in dry-run mode
    const results = await previewRule(rule, context);
    
    // Display results
    const affectedCount = results.actions.reduce((sum, action) => sum + action.tabs.length, 0);
    const actionSummary = results.actions.map(action => 
      `${action.type}: ${action.tabs.length} tabs`
    ).join(', ');
    
    elements.dryRunResults.innerHTML = `
      <strong>Dry Run Results:</strong><br>
      Rule: ${escapeHtml(rule.name)}<br>
      Would affect ${affectedCount} of ${selectedTabs.length} selected tabs<br>
      Actions: ${actionSummary}
    `;
    elements.dryRunResults.classList.remove('hidden');
    
  } catch (error) {
    console.error('Dry run failed:', error);
    showNotification('Dry run failed', 'error');
  }
}

// Apply rule handler
async function handleApplyRule() {
  const ruleId = elements.ruleSelector.value;
  if (!ruleId) return;
  
  if (!confirm('Are you sure you want to apply this rule to the selected tabs?')) {
    return;
  }
  
  try {
    const rule = sessionState.rules.find(r => r.id === ruleId);
    if (!rule) return;
    
    // Send message to background to apply rule to selected tabs
    const response = await chrome.runtime.sendMessage({
      type: 'applyRuleToTabs',
      ruleId: rule.id,
      tabIds: Array.from(sessionState.selectedTabs)
    });
    
    if (response.success) {
      showNotification(`Rule applied: ${response.summary}`);
      // Clear selection and reload
      sessionState.selectedTabs.clear();
      await loadSession();
    } else {
      showNotification(`Failed to apply rule: ${response.error}`, 'error');
    }
    
  } catch (error) {
    console.error('Failed to apply rule:', error);
    showNotification('Failed to apply rule', 'error');
  }
}

// Toolbar handlers
async function handleSnapshot() {
  try {
    const snapshot = await createSnapshot();
    await chrome.storage.local.set({
      lastSnapshot: snapshot,
      lastSnapshotTime: Date.now()
    });
    showNotification('Session snapshot saved');
  } catch (error) {
    console.error('Failed to create snapshot:', error);
    showNotification('Failed to create snapshot', 'error');
  }
}

async function handleImport() {
  // Redirect to dashboard which has comprehensive import UI
  window.open('../dashboard/dashboard.html#import', '_blank');
}

async function handleExport() {
  // Redirect to dashboard which has comprehensive export UI
  window.open('../dashboard/dashboard.html#export', '_blank');
}

// Create session snapshot
async function createSnapshot() {
  const [tabs, windows, groups] = await Promise.all([
    chrome.tabs.query({}),
    chrome.windows.getAll(),
    chrome.tabGroups.query({})
  ]);
  
  return {
    timestamp: Date.now(),
    windows: windows.map(w => ({
      id: w.id,
      focused: w.focused,
      incognito: w.incognito,
      type: w.type
    })),
    groups: groups.map(g => ({
      id: g.id,
      windowId: g.windowId,
      title: g.title,
      color: g.color,
      collapsed: g.collapsed
    })),
    tabs: tabs.map(t => ({
      id: t.id,
      windowId: t.windowId,
      groupId: t.groupId,
      title: t.title,
      url: t.url,
      pinned: t.pinned,
      index: t.index,
      active: t.active
    }))
  };
}

// Keyboard handler
function handleKeyboard(e) {
  if (e.ctrlKey || e.metaKey) {
    switch (e.key) {
      case 'a':
        e.preventDefault();
        selectAll();
        break;
      case 'Escape':
        clearSelection();
        break;
    }
  }
}

// Select all visible tabs
function selectAll() {
  sessionState.windows.forEach(window => {
    window.ungroupedTabs.forEach(tab => {
      sessionState.selectedTabs.add(tab.id);
    });
    
    window.groups.forEach(group => {
      group.tabs.forEach(tab => {
        sessionState.selectedTabs.add(tab.id);
      });
    });
  });
  
  updateTreeSelection();
  updateSelectionUI();
}

// Utility functions
function showLoading() {
  elements.tree.innerHTML = '<div class="tree-loading">Loading session...</div>';
}

function showError(message) {
  elements.tree.innerHTML = `<div class="tree-empty"><h3>Error</h3><p>${message}</p></div>`;
}

function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  document.getElementById('notificationContainer').appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

function generateWindowColor(windowId) {
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
  return colors[windowId % colors.length];
}

function getGroupColor(color) {
  const colorMap = {
    grey: '#9CA3AF',
    blue: '#3B82F6',
    red: '#EF4444',
    yellow: '#F59E0B',
    green: '#10B981',
    pink: '#EC4899',
    purple: '#8B5CF6',
    cyan: '#06B6D4',
    orange: '#F97316'
  };
  return colorMap[color] || colorMap.grey;
}

// getDomain removed - now using centralized TabGrouping service

function getFaviconUrl(url) {
  if (!url || url.startsWith('chrome://') || url.startsWith('edge://')) {
    return '../icons/icon-16.png';
  }
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}`;
  } catch {
    return '../icons/icon-16.png';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// getColorForDomain removed - now using centralized TabGrouping service

// Track last selected for shift-click
let lastSelectedNode = null;