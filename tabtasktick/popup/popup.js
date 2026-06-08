// Popup JavaScript for TabTaskTick

/* global SnoozeModal */
// SnoozeModal is loaded as a non-module global via <script src="../components/snooze-modal.js">
// in popup.html (before this module), so it is not imported here.

// ============================================================================
// Imports
// ============================================================================

import { exitTestMode } from '../services/execution/TestModeService.js';
import { initConsoleCapture } from '../services/utils/console-capture.js';
import { setPendingAction } from '../services/execution/SidePanelNavigationService.js';
import { t, tPlural, localizeDocument } from '../services/utils/i18n.js';
import * as ReviewPromptService from '../services/execution/ReviewPromptService.js';

// Initialize console capture immediately
initConsoleCapture();

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

  // Review prompt
  reviewPromptBanner: document.getElementById('reviewPromptBanner'),
  reviewPromptStep1: document.getElementById('reviewPromptStep1'),
  reviewPromptStep2Positive: document.getElementById('reviewPromptStep2Positive'),
  reviewPromptStep2Negative: document.getElementById('reviewPromptStep2Negative'),
  reviewPromptYes: document.getElementById('reviewPromptYes'),
  reviewPromptNo: document.getElementById('reviewPromptNo'),
  reviewPromptDismiss: document.getElementById('reviewPromptDismiss'),
  reviewPromptRate: document.getElementById('reviewPromptRate'),
  reviewPromptLater: document.getElementById('reviewPromptLater'),
  reviewPromptGithub: document.getElementById('reviewPromptGithub'),
  reviewPromptDecline: document.getElementById('reviewPromptDecline'),
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

// Review prompt render-once-per-popup-open guards (see implementation plan §6.2).
// reviewPromptActive: the prompt owns the promo slot for this session (mutex with
//   the Collections banner — checked before any collectionsBanner show-path).
// reviewPromptEvaluated: shouldPrompt() has already run this session.
let reviewPromptActive = false;
let reviewPromptEvaluated = false;

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  localizeDocument();
  // Evaluate/render the review prompt BEFORE any banner show-path so the mutex
  // guards (loadBannerState + loadCollectionsAndTasks) see reviewPromptActive
  // already set — otherwise the Collections banner paints first and flashes
  // (implementation plan §6.2).
  await maybeShowReviewPrompt();
  await loadTestModeStatus();
  await loadBannerState();
  await loadCollectionsAndTasks();
  await loadStatistics();
  await loadRules();
  await loadSnoozedTabs();
  await loadCurrentTab();
  setupEventListeners();
  setupStatCardLinks();
  setupCollectionsLinks();
  await setupDeveloperFeatures();

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

    // Show banner (unless the review prompt owns the promo slot this session)
    if (!reviewPromptActive) {
      elements.collectionsBanner.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Failed to load banner state:', error);
  }
}

async function loadTestModeStatus() {
  try {
    const storage = await chrome.storage.local.get(['testModeActive']);
    const testModeActive = storage.testModeActive;

    const testModeBanner = document.getElementById('testModeBanner');
    testModeBanner.classList.toggle('hidden', !testModeActive);
  } catch (error) {
    console.error('Failed to load test mode status:', error);
  }
}

/**
 * Setup developer features visibility based on Developer Mode setting
 * Hides debug buttons when Developer Mode is OFF
 */
async function setupDeveloperFeatures() {
  try {
    const { developerMode } = await chrome.storage.local.get('developerMode');

    // Hide or show debug-related buttons based on developer mode
    if (elements.debugBtn) {
      elements.debugBtn.style.display = developerMode ? '' : 'none';
    }
    if (elements.testPanel) {
      elements.testPanel.style.display = developerMode ? '' : 'none';
    }
  } catch (error) {
    console.error('Failed to setup developer features:', error);
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
    elements.collectionsDetail.textContent = t('popup_collectionsDetail', [String(activeCollections), String(savedCollections)]);

    // Load tasks count
    const tasksResult = await sendMessage({ action: 'getTasks' });
    const tasks = tasksResult?.tasks || [];

    const totalTasks = tasks.length;
    const openTasks = tasks.filter(t => t.status === 'open').length;
    const activeTasks = tasks.filter(t => t.status === 'active').length;

    elements.tasksCount.textContent = totalTasks;
    elements.tasksDetail.textContent = t('popup_tasksDetail', [String(openTasks), String(activeTasks)]);

    // Progressive discovery: update banner visibility
    if (totalCollections === 0) {
      // First time user - show banner (unless the review prompt owns the slot)
      if (!reviewPromptActive) {
        elements.collectionsBanner.classList.remove('hidden');
      }
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
    elements.collectionsDetail.textContent = t('common_errorLoading');
    elements.tasksCount.textContent = '0';
    elements.tasksDetail.textContent = t('common_errorLoading');
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
    showNotification(t('popup_notify_loadStatsFailed'), 'error');
  }
}

async function loadRules() {
  try {
    const response = await sendMessage({ action: 'getRules' });
    // Handle both old format (direct array) and new format (wrapped), ensure it's always an array
    const rules = Array.isArray(response)
      ? response
      : (Array.isArray(response?.rules) ? response.rules : []);
    updateRulesList(rules);
  } catch (error) {
    console.error('Failed to load rules:', error);
  }
}

async function loadSnoozedTabs() {
  try {
    const response = await sendMessage({ action: 'getSnoozedTabs' });
    // Handle both direct array and wrapped format, ensure it's always an array
    const snoozedTabs = Array.isArray(response)
      ? response
      : (Array.isArray(response?.snoozedTabs) ? response.snoozedTabs : []);
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
        <p>${t('popup_rules_empty')}</p>
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
        <p>${t('popup_domains_empty')}</p>
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
      <div class="snoozed-title">${tPlural('popup_snoozed_windowLabel', tabCount)}</div>
      <div class="snoozed-time">${timeRemaining}</div>
    </div>
    <div class="snoozed-actions">
      <button class="snoozed-action wake-window-btn" data-window-snooze-id="${windowSnooze.windowSnoozeId}" title="${t('popup_snoozed_restoreWindow')}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      </button>
      <button class="snoozed-action delete-window-btn" data-window-snooze-id="${windowSnooze.windowSnoozeId}" title="${t('popup_snoozed_deleteWindow')}">
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
    if (confirm(tPlural('popup_confirm_deleteWindow', tabCount))) {
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
      <button class="snoozed-action wake-btn" data-tab-id="${tab.id}" title="${t('popup_snoozed_wakeNow')}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      </button>
      <button class="snoozed-action reschedule-btn" data-tab-id="${tab.id}" title="${t('popup_snoozed_reschedule')}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <polyline points="1 4 1 10 7 10"></polyline>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
        </svg>
      </button>
      <button class="snoozed-action delete-btn" data-tab-id="${tab.id}" title="${t('common_delete')}">
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
    if (confirm(t('popup_confirm_deleteTab', [tab.title]))) {
      await deleteSnoozedTab(tab.id || tab.url);
    }
  });

  return tabEl;
}

function groupSnoozedTabsByPeriod(items) {
  const now = Date.now();
  const groups = {
    soon: { title: t('popup_group_nextHour'), items: [] },
    today: { title: t('popup_group_today'), items: [] },
    tomorrow: { title: t('popup_group_tomorrow'), items: [] },
    later: { title: t('popup_group_later'), items: [] }
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
  // Test Mode Banner
  document.getElementById('exitTestModeBtn')?.addEventListener('click', handleExitTestMode);

  // Collections & Tasks
  elements.bannerClose?.addEventListener('click', handleBannerDismiss);
  elements.saveWindowBtn?.addEventListener('click', handleSaveWindow);

  // Review prompt
  setupReviewPromptListeners();

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
  // Collections card deep link to side panel
  elements.collectionsCard?.addEventListener('click', () => {
    openSidePanel('collections');
  });

  // Tasks card deep link to side panel
  elements.tasksCard?.addEventListener('click', () => {
    openSidePanel('tasks');
  });
}

/**
 * Fade a banner out, then hide it via the `.hidden` class.
 * Single source of truth for the banner fade-out sequence used by the
 * Collections banner, the test-mode banner, and the review prompt.
 */
function fadeOutAndHide(el, ms = 300) {
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => {
    el.classList.add('hidden');
    el.style.opacity = '1';
  }, ms);
}

async function handleBannerDismiss() {
  try {
    // Save dismissal timestamp
    await chrome.storage.local.set({
      bannerDismissed: Date.now()
    });

    // Hide banner with fade animation
    fadeOutAndHide(elements.collectionsBanner);
  } catch (error) {
    console.error('Failed to dismiss banner:', error);
  }
}

// ============================================================================
// Review Prompt (implementation plan §6)
// ============================================================================

/**
 * Evaluate eligibility and, if eligible, render Step 1 in the promo slot.
 * Runs at most once per popup open (reviewPromptEvaluated guard) and BEFORE any
 * Collections banner show-path, so reviewPromptActive wins the slot mutex.
 */
async function maybeShowReviewPrompt() {
  if (reviewPromptEvaluated) return;
  reviewPromptEvaluated = true;

  try {
    const { eligible, version } = await ReviewPromptService.shouldPrompt();
    if (!eligible) return;

    reviewPromptActive = true;
    // Mutex: the review prompt owns the promo slot — hide the Collections banner.
    elements.collectionsBanner?.classList.add('hidden');

    renderReviewStep1(version);
    elements.reviewPromptBanner.classList.remove('hidden');

    // Persist that the prompt was actually displayed (lastPromptAt + shownCount).
    await ReviewPromptService.markShown();
  } catch (error) {
    console.error('Failed to evaluate review prompt:', error);
  }
}

/**
 * Show Step 1. `version` ('fresh' | 'after_defer') selects the copy variant.
 */
function renderReviewStep1(version) {
  // Override the load-time localized question (data-i18n) with the version-specific
  // copy: 'after_defer' gets the re-show wording, everything else the fresh wording.
  const question = document.getElementById('reviewPromptQuestion');
  if (question) {
    question.textContent =
      version === 'after_defer'
        ? t('reviewPrompt_step1_question_afterDefer')
        : t('reviewPrompt_step1_question');
  }
  showReviewStep('reviewPromptStep1');
}

/**
 * Toggle which inner step block is visible inside the review prompt banner.
 */
function showReviewStep(stepId) {
  [elements.reviewPromptStep1, elements.reviewPromptStep2Positive, elements.reviewPromptStep2Negative]
    .forEach((el) => el?.classList.toggle('hidden', el.id !== stepId));
}

/**
 * Wire all review-prompt button handlers (outcomes per implementation plan §6.5).
 */
function setupReviewPromptListeners() {
  // Step 1: 👍 Yes → swap to Step-2 positive (no outcome recorded yet).
  elements.reviewPromptYes?.addEventListener('click', () => {
    showReviewStep('reviewPromptStep2Positive');
  });

  // Step 1: 👎 Not yet → record thumbsDown, swap to Step-2 negative.
  elements.reviewPromptNo?.addEventListener('click', async () => {
    await ReviewPromptService.recordOutcome({ step: 1, action: 'thumbsDown' });
    showReviewStep('reviewPromptStep2Negative');
  });

  // Step 1: Dismiss × → record dismiss, fade out.
  elements.reviewPromptDismiss?.addEventListener('click', async () => {
    await ReviewPromptService.recordOutcome({ step: 1, action: 'dismiss' });
    fadeOutAndHide(elements.reviewPromptBanner);
  });

  // Step 2a: Rate → record rated, then open the Web Store review page.
  // Await BEFORE chrome.tabs.create: creating the tab closes the popup and would
  // abort an un-awaited storage write, re-prompting a user who already rated.
  elements.reviewPromptRate?.addEventListener('click', async () => {
    await ReviewPromptService.recordOutcome({ step: 2, action: 'rated' });
    chrome.tabs.create({ url: ReviewPromptService.URLS.review });
  });

  // Step 2a: Maybe later → record later, fade out.
  elements.reviewPromptLater?.addEventListener('click', async () => {
    await ReviewPromptService.recordOutcome({ step: 2, action: 'later' });
    fadeOutAndHide(elements.reviewPromptBanner);
  });

  // Step 2b: Open GitHub issue → record github, then open the feedback page.
  elements.reviewPromptGithub?.addEventListener('click', async () => {
    await ReviewPromptService.recordOutcome({ step: 2, action: 'github' });
    chrome.tabs.create({ url: ReviewPromptService.URLS.feedback });
  });

  // Step 2b: No thanks → record noThanks, fade out.
  elements.reviewPromptDecline?.addEventListener('click', async () => {
    await ReviewPromptService.recordOutcome({ step: 2, action: 'noThanks' });
    fadeOutAndHide(elements.reviewPromptBanner);
  });
}

async function handleExitTestMode() {
  try {
    // Use service to exit test mode (single source of truth)
    const result = await exitTestMode({ source: 'popup_ui' });

    if (result.success) {
      // Hide banner with fade animation (UI concern only)
      fadeOutAndHide(document.getElementById('testModeBanner'));

      console.log('Test mode disabled from popup');
    }
  } catch (error) {
    console.error('Failed to exit test mode:', error);
  }
}

async function handleSaveWindow() {
  try {
    // Get current window ID for the action data
    const currentWindow = await chrome.windows.getCurrent();

    // Open side panel with create collection action
    await openSidePanel({
      action: 'createCollection',
      actionData: { windowId: currentWindow.id }
    });
  } catch (error) {
    console.error('Failed to open save window modal:', error);
    showNotification(t('popup_notify_sidePanelFailed'), 'error');
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
      showNotification(tPlural('popup_notify_closedDuplicates', count), 'success');
    } else {
      showNotification(t('popup_notify_noDuplicates'), 'info');
    }

    await loadStatistics();
  } catch (error) {
    console.error('Failed to close duplicates:', error);
    showNotification(t('popup_notify_closeDuplicatesFailed'), 'error');
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
      showNotification(tPlural('popup_notify_createdGroups', count), 'success');
    } else {
      showNotification(t('popup_notify_noTabsToGroup'), 'info');
    }

    await loadStatistics();
  } catch (error) {
    console.error('Failed to group tabs:', error);
    showNotification(t('popup_notify_groupTabsFailed'), 'error');
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
    
    showNotification(tPlural('popup_notify_tabsSnoozed', tabCount, [getReadableDuration(minutes)]), 'success');
    
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
    showNotification(t('popup_notify_snoozeTabsFailed'), 'error');
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
      showNotification(t('popup_notify_noTabsToSnooze'), 'warning');
      return;
    }

    // THIN UI Layer: Send message to background for detection (business logic)
    const { operations, summary } = await sendMessage({
      action: 'detectSnoozeOperations',
      tabIds
    });

    if (operations.length === 0) {
      showNotification(t('popup_notify_noTabsToSnooze'), 'warning');
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
            message = tPlural('popup_notify_windowsSnoozed', windowCount, [getReadableDuration(minutes)]);
          } else {
            message = tPlural('popup_notify_totalTabsSnoozed', totalTabs, [getReadableDuration(minutes)]);
          }

          showNotification(message, 'success');

          // Refresh statistics
          await loadStatistics();
          await loadSnoozedTabs();

          // Close popup after window snooze
          setTimeout(() => window.close(), 1000);
        } else {
          showNotification(tPlural('popup_notify_snoozeErrors', result.errors.length), 'warning');
        }
      } catch (error) {
        console.error('Failed to snooze window:', error);
        showNotification(t('popup_notify_snoozeWindowFailed'), 'error');
      }
    };

    snoozeModal.onCancel = () => {
      // Modal handles its own cleanup
    };
  } catch (error) {
    console.error('Failed to prepare window snooze:', error);
    showNotification(t('popup_notify_prepareSnoozeFailed'), 'error');
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

      showNotification(t('popup_notify_tabRescheduled'), 'success');
      await loadSnoozedTabs();
    } catch (error) {
      console.error('Failed to reschedule tab:', error);
      showNotification(t('popup_notify_rescheduleFailed'), 'error');
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
      showNotification(tPlural('popup_notify_restoredTabs', count), 'success');
      // Refresh the snoozed tabs list
      await loadSnoozedTabs();
      await loadStatistics();
    } else {
      showNotification(t('popup_notify_noSnoozedToRestore'), 'info');
    }
  } catch (error) {
    console.error('Failed to wake all snoozed tabs:', error);
    showNotification(t('popup_notify_wakeAllFailed'), 'error');
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
      showNotification(tPlural('popup_notify_suspended', result.suspended), 'success');
    } else {
      showNotification(t('popup_notify_noInactive'), 'info');
    }

    await loadStatistics();
  } catch (error) {
    console.error('Failed to suspend tabs:', error);
    showNotification(t('popup_notify_suspendFailed'), 'error');
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
    showNotification(t('popup_notify_toggleRuleFailed'), 'error');
  }
}

async function wakeSnoozedTab(tabId) {
  try {
    console.log('Attempting to wake snoozed tab:', tabId);
    const response = await sendMessage({ action: 'wakeSnoozedTab', tabId });
    console.log('Wake response:', response);

    if (response && response.success) {
      await loadSnoozedTabs();
      showNotification(t('popup_notify_tabRestored'), 'success');
    } else {
      console.error('Wake failed:', response);
      showNotification(t('popup_notify_wakeTabFailedDetail', [response?.error || t('common_unknownError')]), 'error');
    }
  } catch (error) {
    console.error('Failed to wake tab:', error);
    showNotification(t('popup_notify_wakeTabFailed'), 'error');
  }
}

async function deleteSnoozedTab(tabId) {
  try {
    console.log('Attempting to delete snoozed tab:', tabId);
    const response = await sendMessage({ action: 'deleteSnoozedTab', tabId });
    console.log('Delete response:', response);

    if (response && response.success) {
      await loadSnoozedTabs();
      showNotification(t('popup_notify_snoozedTabDeleted'), 'success');
    } else {
      console.error('Delete failed:', response);
      showNotification(t('popup_notify_deleteTabFailedDetail', [response?.error || t('common_unknownError')]), 'error');
    }
  } catch (error) {
    console.error('Failed to delete tab:', error);
    showNotification(t('popup_notify_deleteTabFailed'), 'error');
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
      showNotification(t('popup_notify_windowRestored'), 'success');
    } else {
      console.error('Failed to restore window:', result?.error || 'Unknown error');
      showNotification(t('popup_notify_restoreWindowFailedDetail', [result?.error || t('common_unknownError')]), 'error');
    }
  } catch (error) {
    console.error('Failed to restore window:', error);
    showNotification(t('popup_notify_restoreWindowFailed'), 'error');
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
      showNotification(t('popup_notify_snoozedWindowDeleted'), 'success');
    } else {
      console.error('Failed to delete window:', result?.error || 'Unknown error');
      showNotification(t('popup_notify_deleteWindowFailedDetail', [result?.error || t('common_unknownError')]), 'error');
    }
  } catch (error) {
    console.error('Failed to delete window:', error);
    showNotification(t('popup_notify_deleteWindowFailed'), 'error');
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

    showNotification(t('popup_notify_debugCopied'), 'success');
    console.log('Debug info:', debugInfo);

  } catch (error) {
    console.error('Failed to collect debug info:', error);
    showNotification(t('popup_notify_debugFailed'), 'error');
  }
}

// ============================================================================
// Settings and Navigation
// ============================================================================

function openSettings() {
  chrome.runtime.openOptionsPage();
}

async function openDashboard(view = 'overview', filter = null) {
  let url = chrome.runtime.getURL('dashboard/dashboard.html');

  // Add filter parameter first (before hash)
  if (filter) {
    url += `?filter=${filter}`;
  }

  // Add view parameter after query params
  if (view) {
    url += `#${view}`;
  }

  // Count this as an engaged dashboard-open from the popup (review-prompt gate).
  // MUST be awaited before chrome.tabs.create: creating the tab closes the popup
  // and tears down this context, which would abort an un-awaited storage write —
  // losing the engagement counter that feeds the not_enough_engagement gate.
  await ReviewPromptService.trackDashboardOpenFromPopup();

  chrome.tabs.create({ url });
}

/**
 * Open side panel with optional view or action
 * Centralized helper to avoid duplicate side panel opening logic
 *
 * @param {Object} options - Options for opening side panel
 * @param {string} [options.view] - View to open ('collections', 'tasks', etc.)
 * @param {string} [options.action] - Action for panel to execute ('createCollection', etc.)
 * @param {Object} [options.actionData] - Additional data for the action
 * @param {boolean} [options.closePopup=true] - Whether to close popup after opening
 */
async function openSidePanel(options = {}) {
  // Support legacy call with just a string view parameter
  if (typeof options === 'string') {
    options = { view: options };
  }

  const { view, action, actionData, closePopup = true } = options;

  try {
    const currentWindow = await chrome.windows.getCurrent();

    // Store pending action BEFORE opening panel to avoid race condition
    // The side panel will consume this after initialization
    if (action) {
      await setPendingAction(action, actionData);
    } else if (view) {
      await setPendingAction('switchView', { view });
    }

    // Open side panel (popup has user gesture)
    await chrome.sidePanel.open({ windowId: currentWindow.id });

    // Also send message as fallback for when panel is already open and listening
    if (action) {
      chrome.runtime.sendMessage({
        action: 'openSidePanelWithAction',
        data: {
          panelAction: action,
          ...actionData
        }
      });
    } else if (view) {
      chrome.runtime.sendMessage({
        action: 'openSidePanelView',
        data: { view }
      });
    }

    // Close popup after opening side panel (unless disabled)
    if (closePopup) {
      window.close();
    }
  } catch (error) {
    console.error('Failed to open side panel:', error);
    showNotification(t('popup_notify_sidePanelFailed'), 'error');
  }
}

function openRulesManager() {
  // Open dashboard directly to the rules view
  openDashboard('rules');
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

async function openImportModal() {
  // Open dashboard with backup/restore view
  const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html#export-import');
  chrome.tabs.create({ url: dashboardUrl });
  window.close();
}

function openHelp() {
  // Repo root renders the README (overview, features, getting started) — the
  // wiki it used to point at was empty.
  chrome.tabs.create({ url: 'https://github.com/lenulus/tabtasktick#readme' });
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

    // Open the side panel (has user gesture in popup)
    await openSidePanel({});
  } catch (error) {
    console.error('Failed to open test panel:', error);
    showNotification(t('popup_notify_testPanelFailedDetail', [error.message]), 'error');
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

  if (diff <= 0) return t('popup_time_now');

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return tPlural('common_days', days);
  if (hours > 0) return tPlural('common_hours', hours);
  return tPlural('common_minutes', minutes);
}

function getReadableDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return tPlural('common_days', days);
  if (hours > 0) return tPlural('common_hours', hours);
  return tPlural('common_minutes', minutes);
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
  showNotification(t('popup_notify_genericError'), 'error');
});
