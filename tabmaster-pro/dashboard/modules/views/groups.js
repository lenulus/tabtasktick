// Groups View Module
// Handles the tab groups management view

import { showNotification } from '../core/shared-utils.js';

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
        <button class="btn btn-primary" id="autoGroupBtn">Auto-Group Tabs</button>
      </div>
    `;
    // Add event listener after creating the button
    document.getElementById('autoGroupBtn')?.addEventListener('click', autoGroupTabs);
    return;
  }
  
  groups.forEach(group => {
    const card = document.createElement('div');
    card.className = 'group-card';
    
    card.innerHTML = `
      <div class="group-header" data-group-id="${group.id}">
        <div class="group-title">
          <h3>${group.title || 'Untitled Group'}</h3>
          <span class="group-count">${group.tabs.length} tabs</span>
        </div>
        <div class="group-actions">
          <button class="group-action-btn" data-action="collapse" data-group-id="${group.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
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
      <div class="group-tabs ${group.collapsed ? 'collapsed' : ''}">
        ${group.tabs.map(tab => {
          // Filter out invalid favicon URLs
          const favIconUrl = (!tab.favIconUrl || 
                              tab.favIconUrl.startsWith('chrome-extension://') || 
                              tab.favIconUrl === 'chrome-extension://invalid/') 
                              ? '../icons/icon-16.png' 
                              : tab.favIconUrl;
          return `
          <div class="tab-card">
            <div class="tab-header">
              <img src="${favIconUrl}" class="tab-favicon" data-fallback="../icons/icon-16.png">
              <div class="tab-title">${tab.title}</div>
            </div>
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
      collapseGroup(groupId);
    } else if (action === 'close') {
      closeGroup(groupId);
    }
  });
  
  // Handle favicon errors silently
  container.querySelectorAll('.tab-favicon').forEach(img => {
    img.addEventListener('error', function(e) {
      // Prevent error from bubbling up and logging to console
      e.preventDefault();
      this.src = this.dataset.fallback || '../icons/icon-16.png';
    }, true);
  });
}

async function collapseGroup(groupId) {
  try {
    await chrome.tabGroups.update(groupId, { collapsed: true });
    await loadGroupsView(); // Reload the view
  } catch (error) {
    console.error('Failed to collapse group:', error);
  }
}

async function closeGroup(groupId) {
  try {
    const tabs = await chrome.tabs.query({ groupId });
    const tabIds = tabs.map(tab => tab.id);
    await chrome.tabs.remove(tabIds);
    await loadGroupsView(); // Reload the view
  } catch (error) {
    console.error('Failed to close group:', error);
  }
}

export async function autoGroupTabs() {
  try {
    const result = await chrome.runtime.sendMessage({ action: 'autoGroupTabs' });
    if (result.success) {
      await loadGroupsView();
      showNotification(`Created ${result.groupsCreated} groups`, 'success');
    }
  } catch (error) {
    console.error('Failed to auto-group tabs:', error);
    showNotification('Failed to auto-group tabs', 'error');
  }
}

