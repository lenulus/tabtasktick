// Groups View Module
// Handles the tab groups management view

import { showNotification } from '../core/shared-utils.js';
import { getFaviconUrl } from '../core/utils.js';
import { GroupingScope, groupTabsByDomain as groupTabsByDomainService, getCurrentWindowId } from '../../../services/TabGrouping.js';

// Store UI collapsed state for groups
const collapsedGroups = new Set();

export async function ungroupAllTabs() {
  try {
    // Get all tabs in the current window
    const tabs = await chrome.tabs.query({ currentWindow: true });

    // Filter for only grouped tabs
    const groupedTabs = tabs.filter(tab => tab.groupId && tab.groupId !== -1);

    if (groupedTabs.length === 0) {
      showNotification("No grouped tabs to ungroup", "info");
      return;
    }

    // Route through background → engine (via ungroup action)
    const tabIds = groupedTabs.map(tab => tab.id);
    await chrome.runtime.sendMessage({
      action: 'ungroupTabs',
      tabIds: tabIds
    });

    showNotification(`Ungrouped ${groupedTabs.length} tabs`, "success");
    await loadGroupsView(); // Refresh the view
  } catch (error) {
    console.error("Failed to ungroup tabs:", error);
    showNotification("Failed to ungroup tabs", "error");
  }
}

export async function loadGroupsView() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const groups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });

    const groupsMap = new Map();
    
    // Initialize groups
    groups.forEach(group => {
      groupsMap.set(group.id, {
        ...group,
        tabs: []
      });
    });
    
    // Add tabs to groups
    tabs.forEach(tab => {
      if (tab.groupId && tab.groupId !== -1) {
        if (groupsMap.has(tab.groupId)) {
          groupsMap.get(tab.groupId).tabs.push(tab);
        }
      }
    });
    
    renderGroups(Array.from(groupsMap.values()));
  } catch (error) {
    console.error('Failed to load groups:', error);
  }
}

export function renderGroups(groups) {
  const container = document.getElementById('groupsContainer');
  container.innerHTML = '';
  
  if (groups.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No tab groups</h3>
        <p>Create groups to organize your tabs better</p>
        <button class="btn btn-primary" id="groupByDomainBtn">Group by Domain</button>
      </div>
    `;
    // Add event listener after creating the button
    document.getElementById('groupByDomainBtn')?.addEventListener('click', groupTabsByDomain);
    return;
  }
  
  groups.forEach(group => {
    const card = document.createElement('div');
    card.className = 'group-card';

    // Use our stored UI state instead of Chrome's collapsed state
    const isUICollapsed = collapsedGroups.has(group.id);

    card.innerHTML = `
      <div class="group-header" data-group-id="${group.id}">
        <div class="group-title">
          <h3>${group.title || 'Untitled Group'}</h3>
          <span class="group-count">${group.tabs.length} tabs</span>
        </div>
        <div class="group-actions">
          <button class="group-action-btn" data-action="collapse" data-group-id="${group.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="transform: ${isUICollapsed ? 'rotate(-90deg)' : ''}">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <button class="group-action-btn" data-action="close" data-group-id="${group.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="group-tabs ${isUICollapsed ? 'collapsed' : ''}">
        ${group.tabs.map(tab => {
          const favIconUrl = getFaviconUrl(tab);
          return `
          <div class="group-tab-card">
            <img src="${favIconUrl}" class="group-tab-favicon" data-fallback="../icons/icon-16.png">
            <div class="group-tab-title">${tab.title}</div>
          </div>
        `;
        }).join('')}
      </div>
    `;
    
    // Toggle collapse on header click
    const header = card.querySelector('.group-header');
    header.addEventListener('click', (e) => {
      if (!e.target.closest('.group-actions')) {
        const tabs = card.querySelector('.group-tabs');
        tabs.classList.toggle('collapsed');

        // Track collapsed state
        if (tabs.classList.contains('collapsed')) {
          collapsedGroups.add(group.id);
        } else {
          collapsedGroups.delete(group.id);
        }

        // Update chevron rotation
        const chevron = card.querySelector('[data-action="collapse"] svg');
        if (chevron) {
          chevron.style.transform = tabs.classList.contains('collapsed') ? 'rotate(-90deg)' : '';
        }
      }
    });
    
    container.appendChild(card);
  });
  
  // Add event delegation for group actions
  container.addEventListener('click', (e) => {
    const button = e.target.closest('.group-action-btn');
    if (!button) return;

    const action = button.dataset.action;
    const groupId = parseInt(button.dataset.groupId);

    if (action === 'collapse') {
      // Just toggle the UI, don't actually collapse in Chrome
      e.stopPropagation();
      const groupCard = button.closest('.group-card');
      const tabs = groupCard.querySelector('.group-tabs');
      tabs.classList.toggle('collapsed');

      // Track collapsed state
      if (tabs.classList.contains('collapsed')) {
        collapsedGroups.add(groupId);
      } else {
        collapsedGroups.delete(groupId);
      }

      // Rotate the chevron
      const svg = button.querySelector('svg');
      svg.style.transform = tabs.classList.contains('collapsed') ? 'rotate(-90deg)' : '';
    } else if (action === 'close') {
      closeGroup(groupId);
    }
  });
  
  // Handle favicon errors silently
  container.querySelectorAll('.group-tab-favicon').forEach(img => {
    img.addEventListener('error', function(e) {
      // Prevent error from bubbling up and logging to console
      e.preventDefault();
      this.src = this.dataset.fallback || '../icons/icon-16.png';
    }, true);
  });
}


async function closeGroup(groupId) {
  try {
    const tabs = await chrome.tabs.query({ groupId });
    const tabIds = tabs.map(tab => tab.id);

    // Route through background → engine
    await chrome.runtime.sendMessage({
      action: 'closeTabs',
      tabIds: tabIds
    });

    await loadGroupsView(); // Reload the view
  } catch (error) {
    console.error('Failed to close group:', error);
  }
}

export async function groupTabsByDomain() {
  try {
    // Use centralized TabGrouping service
    // Use TARGETED scope for the dashboard's window
    const currentWindowId = await getCurrentWindowId();
    const result = await groupTabsByDomainService(GroupingScope.TARGETED, currentWindowId);

    await loadGroupsView();

    // Show notification (side effects stay in caller)
    if (result.groupsCreated > 0 || result.groupsReused > 0) {
      const message = `Created ${result.groupsCreated} new groups, reused ${result.groupsReused} existing groups with ${result.totalTabsGrouped} tabs`;
      showNotification(message, 'success');
    } else {
      showNotification('No tabs to group by domain', 'info');
    }
  } catch (error) {
    console.error('Failed to group tabs by domain:', error);
    showNotification('Failed to group tabs by domain', 'error');
  }
}

