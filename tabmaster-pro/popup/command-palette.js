// Command Palette for TabMaster Pro
// Provides fuzzy search for commands and tabs with keyboard navigation

// ============================================================================
// State Management
// ============================================================================

const state = {
  commands: [],
  tabs: [],
  recentCommands: [],
  searchResults: [],
  selectedIndex: 0,
  isOpen: false,
  searchQuery: '',
  tabsCache: null,
  lastCacheTime: 0,
  CACHE_DURATION: 5000 // 5 seconds
};

// ============================================================================
// Command Definitions
// ============================================================================

const COMMANDS = [
  // Tab Management
  {
    id: 'close-current',
    name: 'Close Current Tab',
    description: 'Close the currently active tab',
    category: 'tab',
    icon: '❌',
    keywords: ['close', 'current', 'tab'],
    action: async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await chrome.tabs.remove(tab.id);
        window.close();
      }
    }
  },
  {
    id: 'close-duplicates',
    name: 'Close Duplicate Tabs',
    description: 'Close all duplicate tabs keeping the first one',
    category: 'tab',
    shortcut: 'Ctrl+D',
    icon: '📋',
    keywords: ['close', 'duplicate', 'tabs', 'clean'],
    action: async () => {
      const response = await chrome.runtime.sendMessage({ action: 'closeDuplicates' });
      showNotification(`Closed ${response} duplicate tabs`);
      window.close();
    }
  },
  {
    id: 'close-all-window',
    name: 'Close All Tabs in Window',
    description: 'Close all tabs in the current window',
    category: 'tab',
    icon: '🗑️',
    keywords: ['close', 'all', 'window'],
    action: async () => {
      if (confirm('Close all tabs in this window?')) {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        await chrome.tabs.remove(tabs.map(t => t.id));
      }
    }
  },
  {
    id: 'close-right',
    name: 'Close Tabs to the Right',
    description: 'Close all tabs to the right of the current tab',
    category: 'tab',
    icon: '➡️',
    keywords: ['close', 'right', 'tabs'],
    action: async () => {
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const tabsToClose = tabs.filter(t => t.index > currentTab.index);
      if (tabsToClose.length > 0) {
        await chrome.tabs.remove(tabsToClose.map(t => t.id));
        showNotification(`Closed ${tabsToClose.length} tabs`);
      }
      window.close();
    }
  },
  {
    id: 'pin-unpin',
    name: 'Pin/Unpin Current Tab',
    description: 'Toggle pin state of the current tab',
    category: 'tab',
    icon: '📌',
    keywords: ['pin', 'unpin', 'tab'],
    action: async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await chrome.tabs.update(tab.id, { pinned: !tab.pinned });
        window.close();
      }
    }
  },
  
  // Grouping Commands
  {
    id: 'group-domain',
    name: 'Group by Domain',
    description: 'Group all tabs by their domain',
    category: 'group',
    shortcut: 'Ctrl+G',
    icon: '🗂️',
    keywords: ['group', 'domain', 'organize'],
    action: async () => {
      const response = await chrome.runtime.sendMessage({ action: 'groupByDomain' });
      showNotification(`Created ${response} groups`);
      window.close();
    }
  },
  {
    id: 'ungroup-all',
    name: 'Ungroup All Tabs',
    description: 'Remove all tabs from their groups',
    category: 'group',
    icon: '📤',
    keywords: ['ungroup', 'all', 'tabs'],
    action: async () => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const groupedTabs = tabs.filter(t => t.groupId > 0);
      if (groupedTabs.length > 0) {
        await chrome.tabs.ungroup(groupedTabs.map(t => t.id));
        showNotification(`Ungrouped ${groupedTabs.length} tabs`);
      }
      window.close();
    }
  },
  {
    id: 'collapse-groups',
    name: 'Collapse All Groups',
    description: 'Collapse all tab groups',
    category: 'group',
    icon: '➖',
    keywords: ['collapse', 'groups'],
    action: async () => {
      const groups = await chrome.tabGroups.query({});
      for (const group of groups) {
        await chrome.tabGroups.update(group.id, { collapsed: true });
      }
      showNotification(`Collapsed ${groups.length} groups`);
      window.close();
    }
  },
  {
    id: 'expand-groups',
    name: 'Expand All Groups',
    description: 'Expand all tab groups',
    category: 'group',
    icon: '➕',
    keywords: ['expand', 'groups'],
    action: async () => {
      const groups = await chrome.tabGroups.query({});
      for (const group of groups) {
        await chrome.tabGroups.update(group.id, { collapsed: false });
      }
      showNotification(`Expanded ${groups.length} groups`);
      window.close();
    }
  },
  
  // Snooze Commands
  {
    id: 'snooze-current',
    name: 'Snooze Current Tab',
    description: 'Snooze the current tab for later',
    category: 'snooze',
    shortcut: 'Ctrl+S',
    icon: '💤',
    keywords: ['snooze', 'current', 'tab', 'later'],
    action: async () => {
      await chrome.runtime.sendMessage({ action: 'snoozeCurrent', minutes: 120 });
      showNotification('Tab snoozed for 2 hours');
      window.close();
    }
  },
  {
    id: 'view-snoozed',
    name: 'View Snoozed Tabs',
    description: 'Show all snoozed tabs',
    category: 'snooze',
    icon: '😴',
    keywords: ['view', 'snoozed', 'tabs'],
    action: async () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html#snoozed') });
      window.close();
    }
  },
  
  // Organization Commands
  {
    id: 'sort-title',
    name: 'Sort Tabs by Title',
    description: 'Sort all tabs alphabetically by title',
    category: 'organize',
    icon: '🔤',
    keywords: ['sort', 'title', 'alphabetical'],
    action: async () => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const sorted = tabs.sort((a, b) => a.title.localeCompare(b.title));
      for (let i = 0; i < sorted.length; i++) {
        await chrome.tabs.move(sorted[i].id, { index: i });
      }
      showNotification('Tabs sorted by title');
      window.close();
    }
  },
  {
    id: 'sort-domain',
    name: 'Sort Tabs by Domain',
    description: 'Sort all tabs by their domain',
    category: 'organize',
    icon: '🌐',
    keywords: ['sort', 'domain', 'url'],
    action: async () => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const sorted = tabs.sort((a, b) => {
        try {
          const domainA = new URL(a.url).hostname;
          const domainB = new URL(b.url).hostname;
          return domainA.localeCompare(domainB);
        } catch {
          return 0;
        }
      });
      for (let i = 0; i < sorted.length; i++) {
        await chrome.tabs.move(sorted[i].id, { index: i });
      }
      showNotification('Tabs sorted by domain');
      window.close();
    }
  },
  {
    id: 'bookmark-all',
    name: 'Bookmark All Tabs',
    description: 'Save all tabs to bookmarks',
    category: 'organize',
    icon: '⭐',
    keywords: ['bookmark', 'all', 'tabs', 'save'],
    action: async () => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const folder = await chrome.bookmarks.create({
        title: `TabMaster - ${new Date().toLocaleDateString()}`
      });
      for (const tab of tabs) {
        await chrome.bookmarks.create({
          parentId: folder.id,
          title: tab.title,
          url: tab.url
        });
      }
      showNotification(`Bookmarked ${tabs.length} tabs`);
      window.close();
    }
  },
  
  // Quick Actions
  {
    id: 'suspend-inactive',
    name: 'Suspend Inactive Tabs',
    description: 'Suspend tabs to save memory',
    category: 'action',
    icon: '🔄',
    keywords: ['suspend', 'inactive', 'memory', 'save'],
    action: async () => {
      const tabs = await chrome.tabs.query({ currentWindow: true, active: false, pinned: false });
      let suspended = 0;
      for (const tab of tabs) {
        try {
          await chrome.tabs.discard(tab.id);
          suspended++;
        } catch (e) {
          // Some tabs can't be discarded
        }
      }
      showNotification(`Suspended ${suspended} tabs`);
      window.close();
    }
  },
  {
    id: 'export-session',
    name: 'Export Session',
    description: 'Export all tabs and settings',
    category: 'action',
    icon: '💾',
    keywords: ['export', 'session', 'save', 'backup'],
    action: async () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html#export') });
      window.close();
    }
  },
  {
    id: 'open-dashboard',
    name: 'Open Dashboard',
    description: 'View analytics and statistics',
    category: 'action',
    icon: '📊',
    keywords: ['dashboard', 'analytics', 'stats'],
    action: async () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
      window.close();
    }
  },
  {
    id: 'open-settings',
    name: 'Open Settings',
    description: 'Configure TabMaster Pro',
    category: 'action',
    icon: '⚙️',
    keywords: ['settings', 'options', 'configure'],
    action: async () => {
      chrome.runtime.openOptionsPage();
      window.close();
    }
  }
];

// ============================================================================
// Initialization
// ============================================================================

async function init() {
  state.commands = COMMANDS;
  await loadRecentCommands();
  await updateTabsCache();
  
  setupEventListeners();
  renderInitialState();
  
  // Focus search input
  document.getElementById('searchInput').focus();
}

async function loadRecentCommands() {
  try {
    const { recentCommands } = await chrome.storage.local.get('recentCommands');
    state.recentCommands = recentCommands || [];
  } catch (e) {
    state.recentCommands = [];
  }
}

async function updateTabsCache() {
  const now = Date.now();
  if (!state.tabsCache || now - state.lastCacheTime > state.CACHE_DURATION) {
    state.tabs = await chrome.tabs.query({});
    state.tabsCache = state.tabs;
    state.lastCacheTime = now;
  } else {
    state.tabs = state.tabsCache;
  }
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  const overlay = document.getElementById('overlay');
  const closeButton = document.getElementById('closeButton');
  
  // Search input
  searchInput.addEventListener('input', debounce(handleSearch, 150));
  
  // Keyboard navigation
  document.addEventListener('keydown', handleKeydown);
  
  // Close handlers
  closeButton.addEventListener('click', closeCommandPalette);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeCommandPalette();
    }
  });
  
  // Prevent form submission
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  });
}

function handleKeydown(e) {
  const searchInput = document.getElementById('searchInput');
  
  switch (e.key) {
    case 'Escape':
      closeCommandPalette();
      break;
      
    case 'ArrowUp':
      e.preventDefault();
      navigateResults(-1);
      break;
      
    case 'ArrowDown':
      e.preventDefault();
      navigateResults(1);
      break;
      
    case 'Enter':
      e.preventDefault();
      selectCurrentResult();
      break;
      
    case 'Tab':
      e.preventDefault();
      navigateSections(e.shiftKey ? -1 : 1);
      break;
      
    case 'k':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        searchInput.value = '';
        handleSearch();
      }
      break;
      
    default:
      // Number shortcuts (1-9)
      if (e.key >= '1' && e.key <= '9' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (index < state.searchResults.length) {
          state.selectedIndex = index;
          selectCurrentResult();
        }
      }
  }
}

// ============================================================================
// Search Functionality
// ============================================================================

async function handleSearch() {
  const query = document.getElementById('searchInput').value.trim();
  state.searchQuery = query;
  
  if (!query) {
    renderInitialState();
    return;
  }
  
  // Update tabs cache if needed
  await updateTabsCache();
  
  // Search commands
  const commandResults = searchCommands(query);
  
  // Search tabs
  const tabResults = searchTabs(query);
  
  // Combine and sort results
  state.searchResults = [...commandResults, ...tabResults]
    .sort((a, b) => b.score - a.score)
    .slice(0, 100); // Limit to 100 results for performance
  
  state.selectedIndex = 0;
  renderSearchResults();
}

function searchCommands(query) {
  return state.commands
    .map(command => {
      const score = calculateSearchScore(query, command);
      return { type: 'command', item: command, score };
    })
    .filter(result => result.score > 0);
}

function searchTabs(query) {
  return state.tabs
    .map(tab => {
      const titleScore = fuzzyScore(query, tab.title);
      const urlScore = fuzzyScore(query, tab.url) * 0.8; // URL matches are less important
      const score = Math.max(titleScore, urlScore);
      return { type: 'tab', item: tab, score };
    })
    .filter(result => result.score > 0);
}

function calculateSearchScore(query, command) {
  // Check exact matches first
  if (command.name.toLowerCase().includes(query.toLowerCase())) {
    return 100;
  }
  
  // Fuzzy match on name
  let score = fuzzyScore(query, command.name) * 2;
  
  // Check keywords
  for (const keyword of command.keywords) {
    if (keyword.includes(query.toLowerCase())) {
      score += 50;
      break;
    }
  }
  
  // Check description
  score += fuzzyScore(query, command.description) * 0.5;
  
  return score;
}

function fuzzyScore(query, target) {
  query = query.toLowerCase();
  target = target.toLowerCase();
  
  let score = 0;
  let lastIndex = -1;
  
  for (const char of query) {
    const index = target.indexOf(char, lastIndex + 1);
    if (index === -1) return 0;
    
    // Bonus for consecutive matches
    if (index === lastIndex + 1) score += 2;
    
    // Bonus for start of word
    if (index === 0 || target[index - 1] === ' ' || target[index - 1] === '.' || target[index - 1] === '/') {
      score += 3;
    }
    
    score += 1;
    lastIndex = index;
  }
  
  // Penalty for length difference
  score -= Math.abs(query.length - target.length) * 0.1;
  
  return Math.max(0, score);
}

// ============================================================================
// Navigation
// ============================================================================

function navigateResults(direction) {
  const totalResults = state.searchResults.length || 
    (state.searchQuery ? 0 : state.commands.length + Math.min(state.tabs.length, 10));
  
  if (totalResults === 0) return;
  
  state.selectedIndex = (state.selectedIndex + direction + totalResults) % totalResults;
  updateSelectedResult();
}

function navigateSections(direction) {
  // This could be enhanced to jump between sections
  navigateResults(direction * 5); // Jump 5 items at a time
}

function updateSelectedResult() {
  const items = document.querySelectorAll('.result-item');
  items.forEach((item, index) => {
    if (index === state.selectedIndex) {
      item.classList.add('selected');
      item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      item.classList.remove('selected');
    }
  });
}

async function selectCurrentResult() {
  if (state.searchQuery) {
    // Select from search results
    const result = state.searchResults[state.selectedIndex];
    if (!result) return;
    
    if (result.type === 'command') {
      await executeCommand(result.item);
    } else if (result.type === 'tab') {
      await switchToTab(result.item);
    }
  } else {
    // Select from initial display
    const allItems = [...state.recentCommands.slice(0, 2), ...state.commands];
    const item = allItems[state.selectedIndex];
    
    if (item) {
      await executeCommand(item);
    }
  }
}

// ============================================================================
// Actions
// ============================================================================

async function executeCommand(command) {
  // Store in recent commands
  await addToRecentCommands(command);
  
  // Execute the command
  try {
    await command.action();
  } catch (error) {
    console.error('Command failed:', error);
    showNotification(`Failed to execute: ${command.name}`, 'error');
  }
}

async function switchToTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  window.close();
}

async function addToRecentCommands(command) {
  // Remove if already exists
  state.recentCommands = state.recentCommands.filter(c => c.id !== command.id);
  
  // Add to beginning
  state.recentCommands.unshift(command);
  
  // Keep only last 5
  state.recentCommands = state.recentCommands.slice(0, 5);
  
  // Save to storage
  await chrome.storage.local.set({ recentCommands: state.recentCommands });
}

// ============================================================================
// Rendering
// ============================================================================

function renderInitialState() {
  const recentSection = document.getElementById('recentSection');
  const commandsSection = document.getElementById('commandsSection');
  const tabsSection = document.getElementById('tabsSection');
  const noResults = document.getElementById('noResults');
  
  // Hide no results
  noResults.style.display = 'none';
  
  // Show sections
  recentSection.style.display = state.recentCommands.length > 0 ? 'block' : 'none';
  commandsSection.style.display = 'block';
  tabsSection.style.display = 'block';
  
  // Render recent commands
  if (state.recentCommands.length > 0) {
    const recentList = document.getElementById('recentList');
    recentList.innerHTML = state.recentCommands
      .slice(0, 2)
      .map((cmd, index) => renderCommand(cmd, index))
      .join('');
  }
  
  // Render all commands
  const commandsList = document.getElementById('commandsList');
  commandsList.innerHTML = state.commands
    .slice(0, 10)
    .map((cmd, index) => renderCommand(cmd, index + state.recentCommands.slice(0, 2).length))
    .join('');
  
  // Render recent tabs
  const tabsList = document.getElementById('tabsList');
  const displayTabs = state.tabs
    .filter(tab => !tab.pinned)
    .slice(0, 20); // Show up to 20 tabs initially
  
  tabsList.innerHTML = displayTabs
    .map((tab, index) => renderTab(tab, index + state.recentCommands.slice(0, 2).length + 10))
    .join('');
  
  // Add "Type to search all tabs" hint if there are more tabs
  if (state.tabs.length > displayTabs.length) {
    tabsList.innerHTML += `
      <div class="result-item search-hint" style="opacity: 0.7; font-style: italic;">
        <span class="result-icon">🔍</span>
        <div class="result-content">
          <div class="result-title">Type to search all ${state.tabs.length} tabs...</div>
        </div>
      </div>
    `;
  }
  
  // Update tabs count
  document.getElementById('tabsCount').textContent = `(showing ${displayTabs.length} of ${state.tabs.length})`;
  
  // Select first item
  state.selectedIndex = 0;
  updateSelectedResult();
}

function renderSearchResults() {
  const recentSection = document.getElementById('recentSection');
  const commandsSection = document.getElementById('commandsSection');
  const tabsSection = document.getElementById('tabsSection');
  const noResults = document.getElementById('noResults');
  
  if (state.searchResults.length === 0) {
    recentSection.style.display = 'none';
    commandsSection.style.display = 'none';
    tabsSection.style.display = 'none';
    noResults.style.display = 'block';
    return;
  }
  
  // Hide recent section during search
  recentSection.style.display = 'none';
  noResults.style.display = 'none';
  
  // Group results by type
  const commands = state.searchResults.filter(r => r.type === 'command');
  const tabs = state.searchResults.filter(r => r.type === 'tab');
  
  // Render commands
  if (commands.length > 0) {
    commandsSection.style.display = 'block';
    const commandsList = document.getElementById('commandsList');
    commandsList.innerHTML = commands
      .map((result, index) => renderCommand(result.item, index))
      .join('');
  } else {
    commandsSection.style.display = 'none';
  }
  
  // Render tabs
  if (tabs.length > 0) {
    tabsSection.style.display = 'block';
    const tabsList = document.getElementById('tabsList');
    tabsList.innerHTML = tabs
      .map((result, index) => renderTab(result.item, commands.length + index))
      .join('');
    
    document.getElementById('tabsCount').textContent = `(showing ${tabs.length} of ${state.tabs.length})`;
  } else {
    tabsSection.style.display = 'none';
  }
  
  updateSelectedResult();
}

function renderCommand(command, index) {
  const shortcut = command.shortcut ? `<span class="shortcut">${command.shortcut}</span>` : '';
  return `
    <div class="result-item ${index === 0 ? 'selected' : ''}" data-index="${index}" data-type="command" data-id="${command.id}">
      <span class="result-icon">${command.icon}</span>
      <div class="result-content">
        <div class="result-title">${command.name}</div>
        <div class="result-description">${command.description}</div>
      </div>
      ${shortcut}
    </div>
  `;
}

function renderTab(tab, index) {
  const favicon = tab.favIconUrl ? `<img src="${tab.favIconUrl}" class="tab-favicon" alt="">` : '<span class="result-icon">📄</span>';
  const title = tab.title || 'Untitled';
  const url = new URL(tab.url).hostname;
  
  return `
    <div class="result-item" data-index="${index}" data-type="tab" data-id="${tab.id}">
      ${favicon}
      <div class="result-content">
        <div class="result-title">${escapeHtml(title)}</div>
        <div class="result-description">${url}</div>
      </div>
    </div>
  `;
}

// ============================================================================
// Utilities
// ============================================================================

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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showNotification(message, type = 'success') {
  // This would show a toast notification in the popup
  console.log(`${type}: ${message}`);
}

function closeCommandPalette() {
  window.close();
}

// ============================================================================
// Click Handlers
// ============================================================================

document.addEventListener('click', async (e) => {
  const resultItem = e.target.closest('.result-item');
  if (!resultItem) return;
  
  const index = parseInt(resultItem.dataset.index);
  const type = resultItem.dataset.type;
  
  if (type === 'command') {
    const commandId = resultItem.dataset.id;
    const command = state.commands.find(c => c.id === commandId);
    if (command) {
      await executeCommand(command);
    }
  } else if (type === 'tab') {
    const tabId = parseInt(resultItem.dataset.id);
    const tab = state.tabs.find(t => t.id === tabId);
    if (tab) {
      await switchToTab(tab);
    }
  }
});

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);