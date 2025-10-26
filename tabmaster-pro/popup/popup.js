// Popup JavaScript for TabMaster Pro

// ============================================================================
// DOM Elements
// ============================================================================

const elements = {
  // Statistics
  totalTabs: document.getElementById('totalTabs'),
  groupedTabs: document.getElementById('groupedTabs'),
  snoozedTabs: document.getElementById('snoozedTabs'),
  duplicates: document.getElementById('duplicates'),

  // Collections & Tasks
  collectionsBanner: document.getElementById('collectionsBanner'),
  bannerClose: document.getElementById('bannerClose'),
  saveWindowBtn: document.getElementById('saveWindowBtn'),
  collectionsCard: document.getElementById('collectionsCard'),
  tasksCard: document.getElementById('tasksCard'),
  collectionsCount: document.getElementById('collectionsCount'),
  collectionsDetail: document.getElementById('collectionsDetail'),
  tasksCount: document.getElementById('tasksCount'),
  tasksDetail: document.getElementById('tasksDetail'),

  // Action Buttons
  closeDuplicates: document.getElementById('closeDuplicates'),
  groupByDomain: document.getElementById('groupByDomain'),
  snoozeCurrent: document.getElementById('snoozeCurrent'),
  snoozeWindow: document.getElementById('snoozeWindow'),
  suspendInactive: document.getElementById('suspendInactive'),

  // Sections
  snoozeOptions: document.getElementById('snoozeOptions'),
  rulesList: document.getElementById('rulesList'),
  domainsList: document.getElementById('domainsList'),
  snoozedList: document.getElementById('snoozedList'),
  snoozedSection: document.getElementById('snoozedSection'),
  snoozedCount: document.getElementById('snoozedCount'),

  // Header
  settingsBtn: document.getElementById('settingsBtn'),
  debugBtn: document.getElementById('debugBtn'),

  // Footer
  commandPalette: document.getElementById('commandPalette'),
  dashboard: document.getElementById('dashboard'),
  export: document.getElementById('export'),
  import: document.getElementById('import'),
  testPanel: document.getElementById('testPanel'),
  help: document.getElementById('help'),

  // Badge
  duplicateBadge: document.getElementById('duplicateBadge'),

  // Snoozed tabs
  wakeAllBtn: document.getElementById('wakeAllBtn'),

  // Rules management
  manageRulesBtn: document.getElementById('manageRulesBtn'),
};

// ============================================================================
// Global Variables
// ============================================================================

let snoozeModal = null;
let currentTab = null;

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  await loadBannerState();
  await loadCollectionsAndTasks();
  await loadStatistics();
  await loadRules();
  await loadSnoozedTabs();
  await loadCurrentTab();
  setupEventListeners();
  setupStatCardLinks();
  setupCollectionsLinks();

  // Initialize snooze modal
  snoozeModal = new SnoozeModal();

  // Refresh data every 5 seconds
  setInterval(async () => {
    await loadCollectionsAndTasks();
    await loadStatistics();
    await loadSnoozedTabs();
  }, 5000);
});

// ============================================================================
// Data Loading Functions
// ============================================================================

async function loadBannerState() {
  try {
    const storage = await chrome.storage.local.get(['bannerDismissed']);
    const dismissed = storage.bannerDismissed;

    if (dismissed) {
      // Check if 7 days have passed
      const now = Date.now();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;

      if (now - dismissed < sevenDays) {
        elements.collectionsBanner.classList.add('hidden');
        return;
      }
    }

    // Show banner
    elements.collectionsBanner.classList.remove('hidden');
  } catch (error) {
    console.error('Failed to load banner state:', error);
  }
}

async function loadCollectionsAndTasks() {
  try {
    // Load collections count
    const collectionsResult = await sendMessage({ action: 'getCollections' });
    const collections = collectionsResult?.collections || [];

    const totalCollections = collections.length;
    const activeCollections = collections.filter(c => c.isActive).length;
    const savedCollections = collections.filter(c => !c.isActive).length;

    elements.collectionsCount.textContent = totalCollections;
    elements.collectionsDetail.textContent = `${activeCollections} active, ${savedCollections} saved`;

    // Load tasks count
    const tasksResult = await sendMessage({ action: 'getTasks' });
    const tasks = tasksResult?.tasks || [];

    const totalTasks = tasks.length;
    const openTasks = tasks.filter(t => t.status === 'open').length;
    const activeTasks = tasks.filter(t => t.status === 'active').length;

    elements.tasksCount.textContent = totalTasks;
    elements.tasksDetail.textContent = `${openTasks} open, ${activeTasks} active`;

    // Progressive discovery: update banner visibility
    if (totalCollections === 0) {
      // First time user - show banner
      elements.collectionsBanner.classList.remove('hidden');
    } else if (totalCollections > 0 && totalTasks === 0) {
      // Has collections but no tasks - could show task creation prompt
      // For now, just hide banner
      const storage = await chrome.storage.local.get(['bannerDismissed']);
      if (storage.bannerDismissed) {
        elements.collectionsBanner.classList.add('hidden');
      }
    } else {
      // Has both collections and tasks - hide banner if dismissed
      const storage = await chrome.storage.local.get(['bannerDismissed']);
      if (storage.bannerDismissed) {
        elements.collectionsBanner.classList.add('hidden');
      }
    }
  } catch (error) {
    console.error('Failed to load collections and tasks:', error);
    elements.collectionsCount.textContent = '0';
    elements.collectionsDetail.textContent = 'Error loading';
    elements.tasksCount.textContent = '0';
    elements.tasksDetail.textContent = 'Error loading';
  }
}

async function loadCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
  } catch (error) {
    console.error('Failed to load current tab:', error);
  }
}

async function loadStatistics() {
  try {
    const stats = await sendMessage({ action: 'getStatistics' });
    
    // Update counts
    elements.totalTabs.textContent = stats.totalTabs;
    elements.groupedTabs.textContent = stats.groupedTabs;
    elements.snoozedTabs.textContent = stats.snoozedTabs;
    elements.duplicates.textContent = stats.duplicates;
    
    // Update duplicate badge
    if (stats.duplicates > 0) {
      elements.duplicateBadge.textContent = stats.duplicates;
      elements.duplicateBadge.classList.add('show');
    } else {
      elements.duplicateBadge.classList.remove('show');
    }
    
    // Update top domains
    updateDomainsList(stats.topDomains);
    
  } catch (error) {
    console.error('Failed to load statistics:', error);
    showNotification('Failed to load statistics', 'error');
  }
}

async function loadRules() {
  try {
    const rules = await sendMessage({ action: 'getRules' });
    updateRulesList(rules);
  } catch (error) {
    console.error('Failed to load rules:', error);
  }
}

async function loadSnoozedTabs() {
  try {
    const snoozedTabs = await sendMessage({ action: 'getSnoozedTabs' });
    updateSnoozedList(snoozedTabs);
  } catch (error) {
    console.error('Failed to load snoozed tabs:', error);
  }
}

// ============================================================================
// UI Update Functions
// ============================================================================

function updateRulesList(rules) {
  elements.rulesList.innerHTML = '';
  
  if (rules.length === 0) {
    elements.rulesList.innerHTML = `
      <div class="empty-state">
        <p>No active rules</p>
      </div>
    `;
    return;
  }
  
  rules.forEach(rule => {
    const ruleEl = document.createElement('div');
    ruleEl.className = `rule-item ${!rule.enabled ? 'disabled' : ''}`;
    ruleEl.innerHTML = `
      <div class="rule-name">
        <div class="rule-indicator ${!rule.enabled ? 'inactive' : ''}"></div>
        <span>${rule.name}</span>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" data-rule-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>
    `;

    // Add toggle event listener
    const toggleInput = ruleEl.querySelector('input[type="checkbox"]');
    toggleInput.addEventListener('change', () => toggleRule(rule.id));
    
    elements.rulesList.appendChild(ruleEl);
  });
}

function updateDomainsList(domains) {
  elements.domainsList.innerHTML = '';
  
  if (!domains || domains.length === 0) {
    elements.domainsList.innerHTML = `
      <div class="empty-state">
        <p>No domains to display</p>
      </div>
    `;
    return;
  }
  
  domains.forEach(domain => {
    const domainEl = document.createElement('div');
    domainEl.className = 'domain-item';
    domainEl.innerHTML = `
      <span class="domain-name" title="${domain.domain}">${domain.domain}</span>
      <span class="domain-count">${domain.count}</span>
    `;
    elements.domainsList.appendChild(domainEl);
  });
}

function updateSnoozedList(snoozedTabs) {
  // Update count
  elements.snoozedCount.textContent = snoozedTabs.length;

  // Show/hide section and wake all button
  if (snoozedTabs.length === 0) {
    elements.snoozedSection.style.display = 'none';
    return;
  }

  elements.snoozedSection.style.display = 'block';

  // Show/hide wake all button
  if (elements.wakeAllBtn) {
    elements.wakeAllBtn.style.display = snoozedTabs.length > 0 ? 'flex' : 'none';
  }
  elements.snoozedList.innerHTML = '';

  // Separate window snoozes from individual tabs
  const { windowSnoozes, individualTabs } = separateWindowSnoozes(snoozedTabs);

  // Combine and sort by wake time
  const allItems = [...windowSnoozes, ...individualTabs];
  allItems.sort((a, b) => {
    const timeA = a.snoozeUntil || a.wakeTime || 0;
    const timeB = b.snoozeUntil || b.wakeTime || 0;
    return timeA - timeB;
  });

  // Group items by time period
  const groups = groupSnoozedTabsByPeriod(allItems);

  groups.forEach(group => {
    // Add group header
    const groupHeader = document.createElement('div');
    groupHeader.className = 'snoozed-group-header';
    groupHeader.innerHTML = `
      <span class="group-title">${group.title}</span>
      <span class="group-count">(${group.items.length})</span>
    `;
    elements.snoozedList.appendChild(groupHeader);

    // Add items in group (windows or individual tabs)
    group.items.forEach(item => {
      if (item.isWindowSnooze) {
        // Render window snooze group
        const windowEl = createWindowSnoozeElement(item);
        elements.snoozedList.appendChild(windowEl);
      } else {
        // Render individual tab
        const tabEl = createSnoozedTabElement(item);
        elements.snoozedList.appendChild(tabEl);
      }
    });
  });
}

/**
 * Separate window snoozes from individual tab snoozes
 */
function separateWindowSnoozes(snoozedTabs) {
  const windowGroups = new Map(); // windowSnoozeId -> tabs[]
  const individualTabs = [];

  for (const tab of snoozedTabs) {
    if (tab.windowSnoozeId) {
      if (!windowGroups.has(tab.windowSnoozeId)) {
        windowGroups.set(tab.windowSnoozeId, []);
      }
      windowGroups.get(tab.windowSnoozeId).push(tab);
    } else {
      individualTabs.push(tab);
    }
  }

  // Convert window groups to objects for easier rendering
  const windowSnoozes = Array.from(windowGroups.entries()).map(([windowSnoozeId, tabs]) => ({
    isWindowSnooze: true,
    windowSnoozeId,
    tabs,
    snoozeUntil: tabs[0]?.snoozeUntil, // All tabs in window have same snoozeUntil
    wakeTime: tabs[0]?.wakeTime // Fallback for legacy
  }));

  return { windowSnoozes, individualTabs };
}

/**
 * Create DOM element for window snooze group
 */
function createWindowSnoozeElement(windowSnooze) {
  const windowEl = document.createElement('div');
  windowEl.className = 'snoozed-window';

  const timeRemaining = getTimeRemaining(windowSnooze.snoozeUntil || windowSnooze.wakeTime);
  const tabCount = windowSnooze.tabs.length;

  windowEl.innerHTML = `
    <div class="snoozed-window-icon">🪟</div>
    <div class="snoozed-info">
      <div class="snoozed-title">Window (${tabCount} tab${tabCount !== 1 ? 's' : ''})</div>
      <div class="snoozed-time">${timeRemaining}</div>
    </div>
    <div class="snoozed-actions">
      <button class="snoozed-action wake-window-btn" data-window-snooze-id="${windowSnooze.windowSnoozeId}" title="Restore window">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      </button>
      <button class="snoozed-action delete-window-btn" data-window-snooze-id="${windowSnooze.windowSnoozeId}" title="Delete window">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  `;

  // Add action event listeners
  const wakeBtn = windowEl.querySelector('.wake-window-btn');
  const deleteBtn = windowEl.querySelector('.delete-window-btn');

  wakeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await restoreWindowSnooze(windowSnooze.windowSnoozeId);
  });

  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (confirm(`Delete snoozed window with ${tabCount} tabs?`)) {
      await deleteWindowSnooze(windowSnooze.windowSnoozeId);
    }
  });

  return windowEl;
}

/**
 * Create DOM element for individual snoozed tab
 */
function createSnoozedTabElement(tab) {
  const tabEl = document.createElement('div');
  tabEl.className = 'snoozed-tab';

  const timeRemaining = getTimeRemaining(tab.wakeTime || tab.snoozeUntil);
  const favicon = tab.favicon || tab.favIconUrl || '../icons/icon-16.png';

  tabEl.innerHTML = `
    <img src="${favicon}" class="snoozed-favicon" onerror="this.src='../icons/icon-16.png'">
    <div class="snoozed-info">
      <div class="snoozed-title" title="${tab.title}">${tab.title}</div>
      <div class="snoozed-time">${timeRemaining}</div>
    </div>
    <div class="snoozed-actions">
      <button class="snoozed-action wake-btn" data-tab-id="${tab.id}" title="Wake now">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      </button>
      <button class="snoozed-action reschedule-btn" data-tab-id="${tab.id}" title="Reschedule">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <polyline points="1 4 1 10 7 10"></polyline>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
        </svg>
      </button>
      <button class="snoozed-action delete-btn" data-tab-id="${tab.id}" title="Delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  `;

  // Add action event listeners
  const wakeBtn = tabEl.querySelector('.wake-btn');
  const rescheduleBtn = tabEl.querySelector('.reschedule-btn');
  const deleteBtn = tabEl.querySelector('.delete-btn');

  wakeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    wakeSnoozedTab(tab.id || tab.url); // Use URL as fallback ID
  });

  rescheduleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    rescheduleSnoozedTab(tab);
  });

  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (confirm(`Delete snoozed tab "${tab.title}"?`)) {
      await deleteSnoozedTab(tab.id || tab.url);
    }
  });

  return tabEl;
}

function groupSnoozedTabsByPeriod(items) {
  const now = Date.now();
  const groups = {
    soon: { title: 'Next Hour', items: [] },
    today: { title: 'Today', items: [] },
    tomorrow: { title: 'Tomorrow', items: [] },
    later: { title: 'Later', items: [] }
  };

  items.forEach(item => {
    const diff = (item.snoozeUntil || item.wakeTime || 0) - now;
    const hours = diff / (1000 * 60 * 60);

    if (hours <= 1) {
      groups.soon.items.push(item);
    } else if (hours <= 24) {
      groups.today.items.push(item);
    } else if (hours <= 48) {
      groups.tomorrow.items.push(item);
    } else {
      groups.later.items.push(item);
    }
  });

  // Return only non-empty groups
  return Object.values(groups).filter(g => g.items.length > 0);
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners() {
  // Collections & Tasks
  elements.bannerClose?.addEventListener('click', handleBannerDismiss);
  elements.saveWindowBtn?.addEventListener('click', handleSaveWindow);

  // Quick Actions
  elements.closeDuplicates.addEventListener('click', handleCloseDuplicates);
  elements.groupByDomain.addEventListener('click', handleGroupByDomain);
  elements.snoozeCurrent.addEventListener('click', handleSnoozeCurrentToggle);
  elements.snoozeWindow.addEventListener('click', handleSnoozeWindow);
  elements.suspendInactive.addEventListener('click', handleSuspendInactive);

  // Header Actions
  elements.settingsBtn.addEventListener('click', openSettings);
  elements.debugBtn?.addEventListener('click', copyDebugInfo);

  // Snoozed tabs actions
  elements.wakeAllBtn?.addEventListener('click', handleWakeAll);

  // Rules management
  elements.manageRulesBtn?.addEventListener('click', openRulesManager);

  // Footer Actions
  elements.commandPalette.addEventListener('click', openCommandPalette);
  elements.dashboard.addEventListener('click', () => openDashboard());
  elements.export.addEventListener('click', openExportModal);
  elements.import.addEventListener('click', openImportModal);
  elements.testPanel?.addEventListener('click', openTestPanel);
  elements.help.addEventListener('click', openHelp);
}

function setupStatCardLinks() {
  // Add click handlers to stat cards for dashboard deep links
  document.querySelectorAll('.stat-card.clickable').forEach(card => {
    card.addEventListener('click', () => {
      const view = card.dataset.dashboardView;
      const filter = card.dataset.filter;
      openDashboard(view, filter);
    });
  });
}

function setupCollectionsLinks() {
  // Collections card deep link
  elements.collectionsCard?.addEventListener('click', async () => {
    await openSidePanel('collections');
  });

  // Tasks card deep link
  elements.tasksCard?.addEventListener('click', async () => {
    await openSidePanel('tasks');
  });
}

async function handleBannerDismiss() {
  try {
    // Save dismissal timestamp
    await chrome.storage.local.set({
      bannerDismissed: Date.now()
    });

    // Hide banner with fade animation
    elements.collectionsBanner.style.opacity = '0';
    setTimeout(() => {
      elements.collectionsBanner.classList.add('hidden');
      elements.collectionsBanner.style.opacity = '1';
    }, 300);
  } catch (error) {
    console.error('Failed to dismiss banner:', error);
  }
}

async function handleSaveWindow() {
  try {
    // Open side panel with create collection modal
    await openSidePanelWithAction('createCollection');
  } catch (error) {
    console.error('Failed to open save window modal:', error);
    showNotification('Failed to open save window', 'error');
  }
}

async function openSidePanel(view) {
  try {
    // Send message to background to open side panel with specific view
    await sendMessage({
      action: 'openSidePanelView',
      view: view
    });

    // Close popup
    window.close();
  } catch (error) {
    console.error('Failed to open side panel:', error);
    showNotification('Failed to open side panel', 'error');
  }
}

async function openSidePanelWithAction(action) {
  try {
    // Get current window info for pre-population
    const currentWindow = await chrome.windows.getCurrent({ populate: true });

    // Send message to background to open side panel with action
    await sendMessage({
      action: 'openSidePanelWithAction',
      panelAction: action,
      windowId: currentWindow.id
    });

    // Close popup
    window.close();
  } catch (error) {
    console.error('Failed to open side panel with action:', error);
    showNotification('Failed to open side panel', 'error');
  }
}

// ============================================================================
// Action Handlers
// ============================================================================

async function handleCloseDuplicates() {
  try {
    const button = elements.closeDuplicates;
    button.disabled = true;
    
    const count = await sendMessage({ action: 'closeDuplicates' });
    
    if (count > 0) {
      showNotification(`Closed ${count} duplicate tab${count > 1 ? 's' : ''}`, 'success');
    } else {
      showNotification('No duplicate tabs found', 'info');
    }
    
    await loadStatistics();
  } catch (error) {
    console.error('Failed to close duplicates:', error);
    showNotification('Failed to close duplicates', 'error');
  } finally {
    elements.closeDuplicates.disabled = false;
  }
}

async function handleGroupByDomain() {
  try {
    const button = elements.groupByDomain;
    button.disabled = true;

    // Get current window to only group tabs in this window
    const currentWindow = await chrome.windows.getCurrent();

    const count = await sendMessage({
      action: 'groupByDomain',
      currentWindowOnly: true,
      windowId: currentWindow.id
    });

    if (count > 0) {
      showNotification(`Created ${count} group${count > 1 ? 's' : ''}`, 'success');
    } else {
      showNotification('No tabs to group', 'info');
    }

    await loadStatistics();
  } catch (error) {
    console.error('Failed to group tabs:', error);
    showNotification('Failed to group tabs', 'error');
  } finally {
    elements.groupByDomain.disabled = false;
  }
}

function handleSnoozeCurrentToggle() {
  // Check if bulk selection is active
  const selectedTabs = getSelectedTabs();
  
  if (selectedTabs.length > 0) {
    // Bulk snooze
    snoozeModal.show(selectedTabs);
  } else if (currentTab) {
    // Single tab snooze
    snoozeModal.show([currentTab]);
  }
  
  // Set up modal callbacks
  snoozeModal.onSnooze = async (snoozeData) => {
    await handleSnoozeTabs(snoozeData);
  };
  
  snoozeModal.onCancel = () => {
    // Modal handles its own cleanup
  };
}

async function handleSnoozeTabs(snoozeData) {
  try {
    const { timestamp, presetId, tabIds, tabCount } = snoozeData;
    const minutes = Math.floor((timestamp - Date.now()) / 60000);
    
    if (tabIds.length === 1 && tabIds[0] === currentTab?.id) {
      // Single current tab
      await sendMessage({ action: 'snoozeCurrent', minutes });
    } else {
      // Multiple tabs or specific tabs
      await sendMessage({ action: 'snoozeTabs', tabIds, minutes });
    }
    
    const tabText = tabCount === 1 ? 'Tab' : `${tabCount} tabs`;
    showNotification(`${tabText} snoozed for ${getReadableDuration(minutes)}`, 'success');
    
    // Clear selection if bulk snooze
    if (tabCount > 1) {
      clearSelection();
    }
    
    // Refresh statistics
    await loadStatistics();
    await loadSnoozedTabs();
    
    // Close popup after single tab snooze
    if (tabCount === 1 && tabIds[0] === currentTab?.id) {
      setTimeout(() => window.close(), 1000);
    }
  } catch (error) {
    console.error('Failed to snooze tabs:', error);
    showNotification('Failed to snooze tabs', 'error');
  }
}

/**
 * Phase 8.3: Snooze entire current window
 * Uses message passing for ONE execution path (architecture fix)
 */
async function handleSnoozeWindow() {
  try {
    // Get all tabs in current window
    const currentWindow = await chrome.windows.getCurrent({ populate: true });
    const tabIds = currentWindow.tabs.map(t => t.id);

    if (tabIds.length === 0) {
      showNotification('No tabs to snooze', 'warning');
      return;
    }

    // THIN UI Layer: Send message to background for detection (business logic)
    const { operations, summary } = await sendMessage({
      action: 'detectSnoozeOperations',
      tabIds
    });

    if (operations.length === 0) {
      showNotification('No tabs to snooze', 'warning');
      return;
    }

    // Show modal with operations and summary (new format)
    snoozeModal.show({ operations, summary });

    // Set up modal callbacks
    snoozeModal.onSnooze = async (snoozeData) => {
      try {
        const { timestamp, operations, summary } = snoozeData;

        // THIN UI Layer: Send message to background for execution (ONE execution path)
        const result = await sendMessage({
          action: 'executeSnoozeOperations',
          operations,
          snoozeUntil: timestamp,
          options: {
            reason: 'manual',
            // restorationMode will be pulled from settings by background handler
          }
        });

        if (result.success) {
          const minutes = Math.floor((timestamp - Date.now()) / 60000);
          const { windowCount, individualTabCount, totalTabs } = summary;

          let message;
          if (windowCount > 0 && individualTabCount === 0) {
            message = `Snoozed ${windowCount} window${windowCount !== 1 ? 's' : ''} for ${getReadableDuration(minutes)}`;
          } else {
            message = `Snoozed ${totalTabs} tab${totalTabs !== 1 ? 's' : ''} for ${getReadableDuration(minutes)}`;
          }

          showNotification(message, 'success');

          // Refresh statistics
          await loadStatistics();
          await loadSnoozedTabs();

          // Close popup after window snooze
          setTimeout(() => window.close(), 1000);
        } else {
          showNotification(`Snooze completed with ${result.errors.length} error(s)`, 'warning');
        }
      } catch (error) {
        console.error('Failed to snooze window:', error);
        showNotification('Failed to snooze window', 'error');
      }
    };

    snoozeModal.onCancel = () => {
      // Modal handles its own cleanup
    };
  } catch (error) {
    console.error('Failed to prepare window snooze:', error);
    showNotification('Failed to prepare window snooze', 'error');
  }
}

async function rescheduleSnoozedTab(tab) {
  // Show modal for rescheduling
  snoozeModal.show([tab]);

  snoozeModal.onSnooze = async (snoozeData) => {
    try {
      // First remove the tab without opening it
      const tabId = tab.id || tab.url; // Use URL as fallback ID
      await sendMessage({ action: 'removeSnoozedTab', tabId });

      // Then create new snoozed entry with new time
      const newSnoozedTab = {
        ...tab,
        id: tab.id || Math.random().toString(36).substr(2, 9), // Ensure it has an ID
        wakeTime: snoozeData.timestamp,
        snoozeReason: snoozeData.presetId || 'custom'
      };

      await sendMessage({ action: 'addSnoozedTab', tab: newSnoozedTab });

      showNotification('Tab rescheduled', 'success');
      await loadSnoozedTabs();
    } catch (error) {
      console.error('Failed to reschedule tab:', error);
      showNotification('Failed to reschedule tab', 'error');
    }
  };
}

function getSelectedTabs() {
  // Check if we're in the dashboard context with bulk selection
  // For the popup, we'll only handle the current tab
  // The dashboard handles bulk selection through its own implementation
  return [];
}

function clearSelection() {
  // Not needed in popup context
  // Dashboard handles its own selection clearing
}

async function handleWakeAll() {
  try {
    const result = await sendMessage({ action: 'wakeAllSnoozed' });
    const count = result.count || 0;

    if (count > 0) {
      showNotification(`Restored ${count} snoozed tab${count === 1 ? '' : 's'}`, 'success');
      // Refresh the snoozed tabs list
      await loadSnoozedTabs();
      await loadStatistics();
    } else {
      showNotification('No snoozed tabs to restore', 'info');
    }
  } catch (error) {
    console.error('Failed to wake all snoozed tabs:', error);
    showNotification('Failed to wake snoozed tabs', 'error');
  }
}

async function handleSuspendInactive() {
  try {
    const button = elements.suspendInactive;
    button.disabled = true;

    // Get current window ID for scoped suspension
    const currentWindow = await chrome.windows.getCurrent();

    // Send message to background to suspend via engine
    const result = await sendMessage({
      action: 'suspendInactiveTabs',
      windowId: currentWindow.id
    });

    if (result.suspended > 0) {
      showNotification(
        `Suspended ${result.suspended} inactive tab${result.suspended > 1 ? 's' : ''}`,
        'success'
      );
    } else {
      showNotification('No inactive tabs to suspend', 'info');
    }

    await loadStatistics();
  } catch (error) {
    console.error('Failed to suspend tabs:', error);
    showNotification('Failed to suspend tabs', 'error');
  } finally {
    elements.suspendInactive.disabled = false;
  }
}

async function toggleRule(ruleId) {
  try {
    await sendMessage({ action: 'toggleRule', ruleId });
    await loadRules();
    // Silently update - no notification needed for toggle
  } catch (error) {
    console.error('Failed to toggle rule:', error);
    showNotification('Failed to update rule', 'error');
  }
}

async function wakeSnoozedTab(tabId) {
  try {
    console.log('Attempting to wake snoozed tab:', tabId);
    const response = await sendMessage({ action: 'wakeSnoozedTab', tabId });
    console.log('Wake response:', response);

    if (response && response.success) {
      await loadSnoozedTabs();
      showNotification('Tab restored', 'success');
    } else {
      console.error('Wake failed:', response);
      showNotification(`Failed to wake tab: ${response?.error || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    console.error('Failed to wake tab:', error);
    showNotification('Failed to wake tab', 'error');
  }
}

async function deleteSnoozedTab(tabId) {
  try {
    console.log('Attempting to delete snoozed tab:', tabId);
    const response = await sendMessage({ action: 'deleteSnoozedTab', tabId });
    console.log('Delete response:', response);

    if (response && response.success) {
      await loadSnoozedTabs();
      showNotification('Snoozed tab deleted', 'success');
    } else {
      console.error('Delete failed:', response);
      showNotification(`Failed to delete tab: ${response?.error || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    console.error('Failed to delete tab:', error);
    showNotification('Failed to delete tab', 'error');
  }
}

async function restoreWindowSnooze(windowSnoozeId) {
  try {
    console.log('Restoring snoozed window:', windowSnoozeId);
    const result = await sendMessage({
      action: 'restoreWindow',
      windowSnoozeId
    });

    if (result && result.success) {
      await loadSnoozedTabs();
      await loadStatistics();
      showNotification('Window restored', 'success');
    } else {
      console.error('Failed to restore window:', result?.error || 'Unknown error');
      showNotification(`Failed to restore window: ${result?.error || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    console.error('Failed to restore window:', error);
    showNotification('Failed to restore window', 'error');
  }
}

async function deleteWindowSnooze(windowSnoozeId) {
  try {
    console.log('Deleting snoozed window:', windowSnoozeId);
    const result = await sendMessage({
      action: 'deleteWindow',
      windowSnoozeId
    });

    if (result && result.success) {
      await loadSnoozedTabs();
      await loadStatistics();
      showNotification('Snoozed window deleted', 'success');
    } else {
      console.error('Failed to delete window:', result?.error || 'Unknown error');
      showNotification(`Failed to delete window: ${result?.error || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    console.error('Failed to delete window:', error);
    showNotification('Failed to delete window', 'error');
  }
}

// ============================================================================
// Debug Information
// ============================================================================

async function copyDebugInfo() {
  try {
    // Collect all debug information
    const debugInfo = {
      timestamp: new Date().toISOString(),
      browser: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        manifest: chrome.runtime.getManifest()
      },
      permissions: {},
      state: {},
      errors: [],
      diagnostics: {}
    };

    // Check permissions
    try {
      const permissions = await chrome.permissions.getAll();
      debugInfo.permissions = permissions;
    } catch (e) {
      debugInfo.errors.push({ context: 'permissions', error: e.message });
    }

    // Get snoozed tabs with full details
    try {
      const snoozedTabs = await sendMessage({ action: 'getSnoozedTabs' });
      debugInfo.state.snoozedTabs = {
        count: snoozedTabs?.length || 0,
        tabs: snoozedTabs?.map(tab => ({
          id: tab.id,
          url: tab.url,
          title: tab.title,
          wakeTime: tab.wakeTime,
          snoozeUntil: tab.snoozeUntil,
          wakeInto: tab.wakeInto,
          snoozeReason: tab.snoozeReason,
          favicon: tab.favicon || tab.favIconUrl,
          hasId: !!tab.id,
          hasWakeTime: !!tab.wakeTime,
          hasSnoozeUntil: !!tab.snoozeUntil,
          wakeTimeDate: tab.wakeTime ? new Date(tab.wakeTime).toISOString() : null,
          snoozeUntilDate: tab.snoozeUntil ? new Date(tab.snoozeUntil).toISOString() : null,
          isOverdue: tab.wakeTime ? tab.wakeTime < Date.now() : false
        }))
      };
    } catch (e) {
      debugInfo.errors.push({ context: 'getSnoozedTabs', error: e.message, stack: e.stack });
    }

    // Get current tabs with details
    try {
      const tabs = await chrome.tabs.query({});
      const windows = await chrome.windows.getAll();
      const groups = await chrome.tabGroups?.query({}) || [];
      // Get duplicate count from statistics (uses service)
      const stats = await sendMessage({ action: 'getStatistics' });

      debugInfo.state.tabs = {
        total: tabs.length,
        byWindow: tabs.reduce((acc, tab) => {
          acc[tab.windowId] = (acc[tab.windowId] || 0) + 1;
          return acc;
        }, {}),
        byStatus: {
          active: tabs.filter(t => t.active).length,
          pinned: tabs.filter(t => t.pinned).length,
          muted: tabs.filter(t => t.mutedInfo?.muted).length,
          discarded: tabs.filter(t => t.discarded).length,
          audible: tabs.filter(t => t.audible).length,
          grouped: tabs.filter(t => t.groupId !== -1).length
        },
        windows: windows.map(w => ({
          id: w.id,
          type: w.type,
          state: w.state,
          focused: w.focused,
          tabsCount: w.tabs?.length
        })),
        groups: groups.map(g => ({
          id: g.id,
          title: g.title,
          color: g.color,
          collapsed: g.collapsed,
          windowId: g.windowId
        })),
        duplicates: stats?.duplicates || 0
      };
    } catch (e) {
      debugInfo.errors.push({ context: 'chrome.tabs.query', error: e.message, stack: e.stack });
    }

    // Get storage data with sizes
    try {
      const storage = await chrome.storage.local.get(null);
      debugInfo.state.storage = {
        keys: Object.keys(storage),
        sizes: {},
        rules: {
          count: storage.rules?.length || 0,
          enabled: storage.rules?.filter(r => r.enabled).length || 0,
          withTriggers: storage.rules?.filter(r => r.trigger).length || 0
        },
        snoozedTabsInStorage: storage.snoozedTabs?.length || 0,
        activityLog: storage.activityLog?.length || 0,
        statistics: storage.statistics,
        settings: storage.settings,
        testModeActive: storage.testModeActive || false,
        scheduledTriggers: storage.scheduledTriggers?.length || 0
      };

      // Calculate approximate sizes
      for (const key of Object.keys(storage)) {
        try {
          debugInfo.state.storage.sizes[key] = JSON.stringify(storage[key]).length;
        } catch (e) {
          debugInfo.state.storage.sizes[key] = 'Error calculating size';
        }
      }

      // Get total storage usage
      if (chrome.storage.local.getBytesInUse) {
        debugInfo.state.storage.totalBytes = await chrome.storage.local.getBytesInUse();
        debugInfo.state.storage.quotaBytes = chrome.storage.local.QUOTA_BYTES;
        debugInfo.state.storage.usagePercent = ((debugInfo.state.storage.totalBytes / chrome.storage.local.QUOTA_BYTES) * 100).toFixed(2) + '%';
      }
    } catch (e) {
      debugInfo.errors.push({ context: 'chrome.storage.local', error: e.message, stack: e.stack });
    }

    // Test various message handlers
    debugInfo.diagnostics.messageTests = {};

    // Test ping
    try {
      const pingStart = Date.now();
      const testResult = await sendMessage({ action: 'ping' });
      debugInfo.diagnostics.messageTests.ping = {
        success: !!testResult,
        responseTime: Date.now() - pingStart,
        response: testResult
      };
    } catch (e) {
      debugInfo.diagnostics.messageTests.ping = { error: e.message };
    }

    // Test getRules
    try {
      const rulesResult = await sendMessage({ action: 'getRules' });
      debugInfo.diagnostics.messageTests.getRules = {
        success: true,
        count: rulesResult?.length || 0
      };
    } catch (e) {
      debugInfo.diagnostics.messageTests.getRules = { error: e.message };
    }

    // Test getStatistics
    try {
      const statsResult = await sendMessage({ action: 'getStatistics' });
      debugInfo.diagnostics.messageTests.getStatistics = {
        success: true,
        hasData: !!statsResult
      };
    } catch (e) {
      debugInfo.diagnostics.messageTests.getStatistics = { error: e.message };
    }

    // Check for alarms
    try {
      const alarms = await chrome.alarms.getAll();
      debugInfo.state.alarms = alarms.map(a => ({
        name: a.name,
        scheduledTime: new Date(a.scheduledTime).toISOString(),
        periodInMinutes: a.periodInMinutes
      }));
    } catch (e) {
      debugInfo.errors.push({ context: 'chrome.alarms', error: e.message });
    }

    // Get recent console errors from background
    try {
      const logsResult = await sendMessage({ action: 'getRecentLogs' });
      debugInfo.diagnostics.recentBackgroundLogs = logsResult?.logs || [];
    } catch (e) {
      // Background might not have this handler, which is OK
      debugInfo.diagnostics.recentBackgroundLogs = 'Not available';
    }


    // Format as JSON
    const debugText = JSON.stringify(debugInfo, null, 2);

    // Copy to clipboard
    await navigator.clipboard.writeText(debugText);

    showNotification('Debug info copied to clipboard', 'success');
    console.log('Debug info:', debugInfo);

  } catch (error) {
    console.error('Failed to collect debug info:', error);
    showNotification('Failed to copy debug info', 'error');
  }
}

// ============================================================================
// Settings and Navigation
// ============================================================================

function openSettings() {
  chrome.runtime.openOptionsPage();
}

function openDashboard(view = 'overview', filter = null) {
  let url = chrome.runtime.getURL('dashboard/dashboard.html');

  // Add filter parameter first (before hash)
  if (filter) {
    url += `?filter=${filter}`;
  }

  // Add view parameter after query params
  if (view) {
    url += `#${view}`;
  }

  chrome.tabs.create({ url });
}

function openRulesManager() {
  // Open dashboard directly to the rules view
  openDashboard('rules');
}

function openCommandPalette() {
  // Send message to background to open command palette
  chrome.runtime.sendMessage({ action: 'openCommandPalette' });
  window.close();
}

// ============================================================================
// Backup/Restore Modal Functions
// ============================================================================

async function openExportModal() {
  // Open dashboard with backup/restore view
  const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html#export-import');
  chrome.tabs.create({ url: dashboardUrl });
  window.close();
}

function closeExportModal() {
  document.body.classList.remove('modal-open');
  document.getElementById('exportBackdrop').style.display = 'none';
  document.getElementById('exportModal').style.display = 'none';
}

async function handleExport() {
  try {
    const scope = document.querySelector('input[name="exportScope"]:checked').value;
    const format = document.querySelector('input[name="exportFormat"]:checked').value;

    // Get current window ID if needed
    let currentWindowId = null;
    if (scope === 'current-window') {
      const currentWindow = await chrome.windows.getCurrent();
      currentWindowId = currentWindow.id;
    }

    // Prepare options
    const options = {
      scope,
      format,
      currentWindowId,
      includeRules: document.getElementById('includeRules').checked,
      includeSnoozed: document.getElementById('includeSnoozed').checked,
      includeSettings: document.getElementById('includeSettings').checked,
      includeStatistics: document.getElementById('includeStatistics').checked
    };

    showNotification(`Exporting as ${format.toUpperCase()}...`, 'info');

    const data = await sendMessage({ action: 'exportData', options });

    // Determine file extension and MIME type
    let fileExtension, mimeType, content;

    switch (format) {
      case 'csv':
        fileExtension = 'csv';
        mimeType = 'text/csv';
        content = data.csv;
        break;
      case 'markdown':
        fileExtension = 'md';
        mimeType = 'text/markdown';
        content = data.markdown;
        break;
      case 'json':
      default:
        fileExtension = 'json';
        mimeType = 'application/json';
        content = JSON.stringify(data, null, 2);
        break;
    }

    // Create download
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const filename = `tabmaster-export-${new Date().toISOString().split('T')[0]}.${fileExtension}`;

    await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    });

    // Show summary
    if (format === 'json') {
      const summary = [];
      if (data.session) {
        summary.push(`${data.session.tabs.length} tabs`);
      }
      if (data.extensionData && data.extensionData.rules) {
        summary.push(`${data.extensionData.rules.length} rules`);
      }
      if (data.extensionData && data.extensionData.snoozedTabs) {
        summary.push(`${data.extensionData.snoozedTabs.length} snoozed tabs`);
      }
      showNotification(`Exported: ${summary.join(', ')}`, 'success');
    } else {
      showNotification(`Exported as ${format.toUpperCase()}`, 'success');
    }

    closeExportModal();
  } catch (error) {
    console.error('Failed to export data:', error);
    showNotification('Export failed: ' + (error.message || 'Unknown error'), 'error');
  }
}

// Restore Modal Functions
async function openImportModal() {
  // Open dashboard with backup/restore view
  const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html#export-import');
  chrome.tabs.create({ url: dashboardUrl });
  window.close();
}

function closeImportModal() {
  document.body.classList.remove('modal-open');
  document.getElementById('importBackdrop').style.display = 'none';
  document.getElementById('importModal').style.display = 'none';
}

let importedData = null;

async function handleFileSelect(file) {
  try {
    // Validate file type
    if (!file.name.endsWith('.json')) {
      showNotification('Please select a JSON file', 'error');
      return;
    }

    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      showNotification('File too large (max 10MB)', 'error');
      return;
    }

    // Read and parse file
    const text = await file.text();
    const data = JSON.parse(text);

    // Validate structure
    if (!data.format || !data.session) {
      showNotification('Invalid TabMaster export file', 'error');
      return;
    }

    importedData = data;

    // Display file info
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = (file.size / 1024).toFixed(1) + ' KB';
    document.getElementById('fileFormat').textContent = data.format || 'Unknown';
    document.getElementById('fileInfo').style.display = 'block';

    // Display preview
    const summaryList = document.getElementById('importSummaryList');
    summaryList.innerHTML = '';

    if (data.session) {
      const items = [];
      if (data.session.tabs) items.push(`${data.session.tabs.length} tabs in ${data.session.windows ? data.session.windows.length : 1} window(s)`);
      if (data.session.groups) items.push(`${data.session.groups.length} tab groups`);
      if (data.extensionData) {
        if (data.extensionData.rules) items.push(`${data.extensionData.rules.length} rules`);
        if (data.extensionData.snoozedTabs) items.push(`${data.extensionData.snoozedTabs.length} snoozed tabs`);
      }

      items.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        summaryList.appendChild(li);
      });
    }

    document.getElementById('importPreview').style.display = 'block';
    document.getElementById('importOptions').style.display = 'block';

    // Update warning
    const tabCount = data.session?.tabs?.length || 0;
    const warning = document.getElementById('importWarning');
    if (tabCount > 50) {
      warning.textContent = `⚠️ This will open ${tabCount} tabs. Consider importing in smaller batches.`;
      warning.style.display = 'block';
    } else if (tabCount > 0) {
      warning.textContent = `This will open ${tabCount} tabs.`;
      warning.style.display = 'block';
    } else {
      warning.style.display = 'none';
    }

    // Enable import button
    document.getElementById('confirmImport').disabled = false;

  } catch (error) {
    console.error('Failed to process file:', error);
    showNotification('Failed to read file: ' + error.message, 'error');
  }
}

async function handleImport() {
  if (!importedData) {
    showNotification('No file selected', 'error');
    return;
  }

  try {
    const options = {
      scope: document.querySelector('input[name="importScope"]:checked').value,
      importGroups: document.getElementById('importGroups').checked,
      importRules: document.getElementById('importRules').checked,
      importSnoozed: document.getElementById('importSnoozed').checked,
      importSettings: document.getElementById('importSettings').checked
    };

    showNotification('Importing data...', 'info');

    const result = await sendMessage({
      action: 'importData',
      data: importedData,
      options
    });

    if (result.success) {
      const imported = result.imported || {};
      const summary = [];
      if (imported.tabs) summary.push(`${imported.tabs} tabs`);
      if (imported.groups) summary.push(`${imported.groups} groups`);
      if (imported.rules) summary.push(`${imported.rules} rules`);

      showNotification(`Successfully imported: ${summary.join(', ')}`, 'success');
      closeImportModal();

      // Refresh the popup display
      await updateStatistics();
    } else {
      showNotification('Import failed: ' + (result.error || 'Unknown error'), 'error');
    }

  } catch (error) {
    console.error('Failed to import data:', error);
    showNotification('Import failed: ' + error.message, 'error');
  }
}

function openHelp() {
  chrome.tabs.create({ url: 'https://github.com/yourusername/tabmaster-pro/wiki' });
}

async function openTestPanel() {
  try {
    // Switch to test panel (but don't open from background - no user gesture there)
    const response = await chrome.runtime.sendMessage({
      action: 'setSidePanel',
      panel: 'test',
      open: false  // Changed to false - we'll open from popup instead
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Failed to switch to test panel');
    }

    // Open the panel from popup (has user gesture)
    const currentWindow = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: currentWindow.id });

    // Close popup after opening side panel
    window.close();
  } catch (error) {
    console.error('Failed to open test panel:', error);
    showNotification('Failed to open test panel: ' + error.message, 'error');
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

async function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

function getTimeRemaining(timestamp) {
  const now = Date.now();
  const diff = timestamp - now;
  
  if (diff <= 0) return 'now';
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}

function getReadableDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}

function showNotification(message, type = 'info') {
  // Remove existing notifications
  const existing = document.querySelector('.notification');
  if (existing) {
    existing.remove();
  }
  
  // Create new notification
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Expose globally for FAB component
window.showNotification = showNotification;

// ============================================================================
// Error Handling
// ============================================================================

window.addEventListener('error', (event) => {
  console.error('Popup error:', event.error);
  showNotification('An error occurred', 'error');
});
