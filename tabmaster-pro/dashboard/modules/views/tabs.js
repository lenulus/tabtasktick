// Tabs View Module
// Handles the main tabs list view with grid/tree display modes

import {
  normalizeUrl,
  getWindowSignature,
  generateWindowColor,
  getFaviconUrl,
  getGroupColor,
  getTabState,
  getLastAccessText,
  getTimeAgo
} from '../core/utils.js';

import {
  FILTER_TYPES,
  LIMITS
} from '../core/constants.js';

import state from '../core/state.js';

import {
  handleTabSelection,
  showNotification,
  showRenameWindowsDialog,
  clearSelection,
  updateBulkToolbar
} from '../core/shared-utils.js';

import {
  getWindowNamesAndSignatures,
  setWindowNamesAndSignatures
} from '../../../services/utils/WindowNameService.js';

// Track window filter selection to restore after rename dialog
let lastWindowFilterSelection = 'all';

export async function loadTabsView(filter = undefined) {
  // Store current filter values before they are potentially cleared
  const searchInput = document.getElementById('searchTabs');
  const filterInput = document.getElementById('filterTabs');
  const windowInput = document.getElementById('windowFilter');
  const sortInput = document.getElementById('sortTabs');

  // Determine filter type:
  // - If filter is explicitly null (nav click), reset to 'all'
  // - If filter is a string like 'duplicates' (deep link), use that
  // - If filter is undefined (page refresh), preserve current dropdown value
  let filterType = 'all';
  if (filter === null) {
    filterType = 'all'; // Nav click - reset filters
  } else if (filter) {
    filterType = filter; // Deep link with specific filter
  } else if (filterInput) {
    filterType = filterInput.value; // Preserve current state
  }

  const preservedFilterState = {
    searchTerm: filter === null ? '' : (searchInput ? searchInput.value : ''),
    filterType: filterType,
    windowId: filter === null ? 'all' : (windowInput ? windowInput.value : 'all'),
    sortType: sortInput ? sortInput.value : 'default'
  };
  
  try {
    // Get tabs with time data from background script
    const { tabs, windows } = await chrome.runtime.sendMessage({ action: 'getTabs' });
    const groups = await chrome.tabGroups.query({});
    
    // Get custom window names from storage (keyed by window signature)
    const { windowNames, windowSignatures } = await getWindowNamesAndSignatures();
    
    // Create window color map with better color generation for many windows
    const windowColorMap = new Map();
    const windowNameMap = new Map();
    const windowSignatureMap = new Map();
    
    // Generate colors using HSL for even distribution
    
    // Sort windows by ID for consistent ordering
    const sortedWindows = windows.sort((a, b) => a.id - b.id);
    const currentWindowId = (await chrome.windows.getCurrent()).id;
    
    // Process each window
    sortedWindows.forEach((window, index) => {
      // Get tabs for this window
      const windowTabs = tabs.filter(t => t.windowId === window.id);
      const signature = getWindowSignature(windowTabs);
      windowSignatureMap.set(window.id, signature);
      
      // Assign color
      windowColorMap.set(window.id, generateWindowColor(index, windows.length));
      
      // Determine window name
      let windowName;
      
      // First check if we have a name for this window ID
      if (windowNames[window.id]) {
        windowName = windowNames[window.id];
      }
      // Then check if we recognize this window by its signature
      else if (signature && windowSignatures[signature]) {
        windowName = windowSignatures[signature];
        // Update the windowNames with current ID
        windowNames[window.id] = windowName;
      }
      // Otherwise generate smart default name based on content
      // Note: current window indicator is shown in dropdown as "(current, X tabs)"
      else {
        if (windowTabs.length > 0) {
          // Try to generate a smart name based on window content
          const domains = windowTabs.map(t => {
            try {
              return new URL(t.url).hostname.replace('www.', '');
            } catch {
              return '';
            }
          }).filter(d => d);
          
          // Find most common domain
          const domainCounts = {};
          domains.forEach(d => {
            domainCounts[d] = (domainCounts[d] || 0) + 1;
          });
          
          const topDomain = Object.entries(domainCounts)
            .sort((a, b) => b[1] - a[1])[0];
          
          if (topDomain && topDomain[1] >= 2) {
            // If one domain appears multiple times, use it as the name
            windowName = topDomain[0].split('.')[0].charAt(0).toUpperCase() + 
                        topDomain[0].split('.')[0].slice(1) + ' Window';
          } else {
            windowName = `Window ${index + 1}`;
          }
        } else {
          windowName = `Window ${index + 1}`;
        }
      }
      
      windowNameMap.set(window.id, windowName);
    });
    
    // Get last accessed time from session storage as fallback
    const lastAccessData = await chrome.storage.session.get('tabLastAccess').catch(() => ({}));
    const tabLastAccess = lastAccessData.tabLastAccess || {};

    // Update last access for active tabs
    tabs.forEach(tab => {
      if (tab.active) {
        tabLastAccess[tab.id] = Date.now();
      }
    });

    // Save updated access times
    await chrome.storage.session.set({ tabLastAccess }).catch(() => {});

    // Create group map
    const groupMap = new Map();
    groups.forEach(group => {
      groupMap.set(group.id, {
        title: group.title || `Group ${group.id}`,
        color: group.color,
        collapsed: group.collapsed
      });
    });

    // Store window and group info globally
    window.windowInfo = { windowColorMap, windowNameMap, currentWindowId };
    window.groupInfo = groupMap;

    // Map tab data with real state information and window/group info
    // Priority: background timeData > session storage > Chrome API > null
    state.set('tabsData', tabs.map(tab => ({
      ...tab,
      lastAccessed: tab.timeData?.lastAccessed || tabLastAccess[tab.id] || tab.lastAccessed || null,
      windowColor: windowColorMap.get(tab.windowId),
      windowName: windowNameMap.get(tab.windowId),
      groupName: tab.groupId > 0 ? groupMap.get(tab.groupId)?.title : null,
      groupColor: tab.groupId > 0 ? groupMap.get(tab.groupId)?.color : null
    })));
    
    // Populate window filter dropdown - AFTER tabsData is populated so counts work
    updateWindowFilterDropdown(sortedWindows, windowNameMap, currentWindowId);
    
    // Restore filter values after UI elements (like windowFilter) are repopulated
    if (searchInput) searchInput.value = preservedFilterState.searchTerm;
    if (filterInput) filterInput.value = preservedFilterState.filterType;
    if (windowInput) {
      // Check if the preserved window ID still exists
      const windowExists = preservedFilterState.windowId === 'all' || 
                          windows.some(w => w.id === parseInt(preservedFilterState.windowId));
      console.log('Window filter check:', {
        preserved: preservedFilterState.windowId,
        exists: windowExists,
        windows: windows.map(w => w.id),
        setting: windowExists ? preservedFilterState.windowId : 'all'
      });
      windowInput.value = windowExists ? preservedFilterState.windowId : 'all';
    }
    if (sortInput) sortInput.value = preservedFilterState.sortType;
    
    // Save updated window mappings via service
    const updatedSignatures = Object.fromEntries(
      Array.from(windowSignatureMap.entries()).map(([id, sig]) => {
        const name = windowNameMap.get(id);
        return [sig, name];
      }).filter(([sig, name]) => sig && !name.startsWith('Window '))
    );
    await setWindowNamesAndSignatures(windowNames, updatedSignatures);
    
    // Apply current filter/sort if they exist (preserves state during refresh)
    if (document.getElementById('searchTabs') || document.getElementById('filterTabs')) {
      filterTabs();
    } else {
      renderTabs(state.get('tabsData'));
    }
  } catch (error) {
    console.error('Failed to load tabs:', error);
  }
}

export function updateTabCount(displayedCount, totalCount) {
  const tabCountEl = document.getElementById('tabCount');
  if (tabCountEl) {
    if (displayedCount === totalCount) {
      tabCountEl.textContent = `(${totalCount})`;
    } else {
      tabCountEl.textContent = `(${displayedCount} of ${totalCount})`;
    }
  }
}

export function renderTabs(tabs) {
  // Get saved view preference or default to grid
  const savedView = localStorage.getItem('tabsViewMode') || 'grid';
  let currentView = document.querySelector('.view-toggle-btn.active')?.dataset.view || savedView;
  
  // If the saved view doesn't match current active, update the UI
  if (currentView !== savedView && document.querySelector(`.view-toggle-btn[data-view="${savedView}"]`)) {
    document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.view-toggle-btn[data-view="${savedView}"]`).classList.add('active');
    currentView = savedView;
  }
  
  // Show/hide the correct view containers
  const gridContainer = document.getElementById('tabsGrid');
  const treeContainer = document.getElementById('tabsTree');
  
  if (currentView === 'tree') {
    if (gridContainer) gridContainer.style.display = 'none';
    if (treeContainer) treeContainer.style.display = 'block';
  } else {
    if (gridContainer) gridContainer.style.display = 'grid';
    if (treeContainer) treeContainer.style.display = 'none';
  }
  
  // Update tab count display
  updateTabCount(tabs.length, state.get('tabsData').length);
  
  // Render based on current view
  if (currentView === 'tree') {
    renderTreeView(tabs);
  } else {
    renderGridView(tabs);
  }
}

export function renderGridView(tabs) {
  const grid = document.getElementById('tabsGrid');
  grid.innerHTML = '';
  
  if (tabs.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <h3>No tabs found</h3>
        <p>No tabs match your current filter</p>
      </div>
    `;
    return;
  }
  
  tabs.forEach(tab => {
    const card = document.createElement('div');
    card.className = 'tab-card';
    card.dataset.tabId = tab.id;
    
    // Restore selection state if tab was previously selected
    if (state.selectedTabs.has(tab.id)) {
      card.classList.add('selected');
    }
    
    // Add window color as border
    if (tab.windowColor) {
      card.style.borderLeft = `4px solid ${tab.windowColor}`;
    }
    
    const badges = [];
    if (tab.pinned) badges.push('<span class="tab-badge pinned">Pinned</span>');
    if (tab.audible) badges.push('<span class="tab-badge audible">Playing</span>');
    if (tab.category && tab.category !== 'unknown') badges.push(`<span class="tab-badge category">${tab.category}</span>`);
    
    // Filter out invalid favicon URLs
    const filterFaviconUrl = (url) => {
      if (!url) return '../icons/icon-16.png';
      // Skip chrome-extension:// URLs from other extensions
      if (url.startsWith('chrome-extension://') && !url.includes(chrome.runtime.id)) {
        return '../icons/icon-16.png';
      }
      // Skip invalid URLs
      if (url === 'chrome-extension://invalid/') {
        return '../icons/icon-16.png';
      }
      return url;
    };
    
    const safeFaviconUrl = filterFaviconUrl(getFaviconUrl(tab));
    
    card.innerHTML = `
      <div class="window-indicator" style="background: ${tab.windowColor || '#999'};" title="${tab.windowName || 'Unknown Window'}"></div>
      <label class="tab-select-wrapper">
        <input type="checkbox" class="tab-checkbox" data-tab-id="${tab.id}" ${state.selectedTabs.has(tab.id) ? 'checked' : ''}>
        <span class="tab-select-indicator"></span>
      </label>
      <div class="tab-header">
        <img src="${safeFaviconUrl}" class="tab-favicon" data-fallback="../icons/icon-16.png">
        <div class="tab-title" title="${tab.title}">${tab.title}</div>
      </div>
      <div class="tab-url" title="${tab.url}">${new URL(tab.url).hostname}</div>
      ${badges.length > 0 ? `<div class="tab-badges">${badges.join('')}</div>` : ''}
      <div class="tab-hover-info">
        <span class="tab-state">${getTabState(tab)}</span>
        <span class="tab-access">• Last accessed: ${getLastAccessText(tab)}</span>
      </div>
    `;
    
    // Handle favicon errors silently
    const favicon = card.querySelector('.tab-favicon');
    if (favicon) {
      favicon.addEventListener('error', function(e) {
        // Prevent error from bubbling up and logging to console
        e.preventDefault();
        this.src = this.dataset.fallback || '../icons/icon-16.png';
      }, true);
    }
    
    // Add click handler for selection
    const checkbox = card.querySelector('.tab-checkbox');
    checkbox.addEventListener('change', (e) => {
      handleTabSelection(e.target, tab.id, card);
    });
    
    // Handle shift-click for range selection
    checkbox.addEventListener('click', (e) => {
      if (e.shiftKey && selectionState.lastSelectedId !== null) {
        e.preventDefault();
        handleRangeSelection(tab.id);
      }
    });
    
    // Add click handler to open tab
    card.addEventListener('click', (e) => {
      // Don't open tab if clicking on checkbox or its wrapper
      const isCheckboxArea = e.target.closest('.tab-select-wrapper') ||
                            e.target.classList.contains('tab-checkbox');
      if (!isCheckboxArea) {
        chrome.tabs.update(tab.id, { active: true });
        chrome.windows.update(tab.windowId, { focused: true });
      }
    });

    // Add double-click handler to show details
    card.addEventListener('dblclick', (e) => {
      e.preventDefault();
      showTabDetails(tab);
    });

    grid.appendChild(card);
  });
}


export function renderTreeView(tabs) {
  const tree = document.getElementById('tabsTree');
  tree.innerHTML = '';
  
  if (tabs.length === 0) {
    tree.innerHTML = `
      <div class="empty-state">
        <h3>No tabs found</h3>
        <p>No tabs match your current filter</p>
      </div>
    `;
    return;
  }
  
  // Group tabs by window and then by group
  const windows = new Map();
  
  tabs.forEach(tab => {
    if (!windows.has(tab.windowId)) {
      windows.set(tab.windowId, {
        id: tab.windowId,
        name: tab.windowName || `Window ${tab.windowId}`,
        color: tab.windowColor || '#999',
        groups: new Map(),
        ungroupedTabs: []
      });
    }
    
    const window = windows.get(tab.windowId);
    
    if (tab.groupId && tab.groupId !== -1) {
      if (!window.groups.has(tab.groupId)) {
        window.groups.set(tab.groupId, {
          id: tab.groupId,
          name: tab.groupName || `Group ${tab.groupId}`,
          color: getGroupColor(tab.groupColor),
          tabs: []
        });
      }
      window.groups.get(tab.groupId).tabs.push(tab);
    } else {
      window.ungroupedTabs.push(tab);
    }
  });
  
  // Render tree structure
  windows.forEach((window, windowId) => {
    const windowEl = document.createElement('div');
    windowEl.className = 'tree-window';
    windowEl.dataset.windowId = windowId;
    
    // Calculate window selection state
    const allWindowTabs = [...Array.from(window.groups.values()).flatMap(g => g.tabs), ...window.ungroupedTabs];
    const selectedWindowTabs = allWindowTabs.filter(tab => state.selectedTabs.has(tab.id));
    const windowCheckedState = selectedWindowTabs.length === allWindowTabs.length ? 'checked' : 
      selectedWindowTabs.length > 0 ? 'indeterminate' : 'unchecked';
    
    // Window header
    const windowHeader = document.createElement('div');
    windowHeader.className = 'tree-window-header';
    windowHeader.dataset.windowId = windowId;
    const totalWindowTabs = Array.from(window.groups.values()).reduce((sum, g) => sum + g.tabs.length, 0) + window.ungroupedTabs.length;
    windowHeader.innerHTML = `
      <svg class="tree-expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
      <input type="checkbox" class="tree-select-checkbox" data-window-id="${windowId}" 
             ${windowCheckedState === 'checked' ? 'checked' : ''}
             title="Select all tabs in window">
      <div class="tree-window-color" style="background: ${window.color};"></div>
      <div class="tree-window-name">${window.name}</div>
      <div class="tree-window-count">${totalWindowTabs} tabs</div>
      <div class="tree-window-actions">
        <button class="tree-action-btn" title="Close window" data-action="close-window" data-window-id="${windowId}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;
    
    windowHeader.addEventListener('click', (e) => {
      // Don't toggle collapse if clicking on checkbox or actions
      if (e.target.type === 'checkbox' || e.target.closest('.tree-action-btn')) {
        return;
      }
      windowHeader.classList.toggle('collapsed');
    });
    
    windowEl.appendChild(windowHeader);
    
    // Window content
    const windowContent = document.createElement('div');
    windowContent.className = 'tree-window-content';
    
    // Render groups
    window.groups.forEach((group, groupId) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'tree-group';
      groupEl.dataset.groupId = groupId;
      
      // Calculate group selection state
      const selectedGroupTabs = group.tabs.filter(tab => state.selectedTabs.has(tab.id));
      const groupCheckedState = selectedGroupTabs.length === group.tabs.length ? 'checked' : 
        selectedGroupTabs.length > 0 ? 'indeterminate' : 'unchecked';
      
      // Group header
      const groupHeader = document.createElement('div');
      groupHeader.className = 'tree-group-header';
      groupHeader.dataset.groupId = groupId;
      groupHeader.dataset.windowId = windowId;
      groupHeader.innerHTML = `
        <svg class="tree-expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width: 14px; height: 14px;">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
        <input type="checkbox" class="tree-select-checkbox" data-group-id="${groupId}" 
               ${groupCheckedState === 'checked' ? 'checked' : ''}
               title="Select all tabs in group">
        <div class="tree-group-color" style="background: ${group.color};"></div>
        <div class="tree-group-name" contenteditable="false" data-group-id="${groupId}">${group.name}</div>
        <div class="tree-window-count">${group.tabs.length} tabs</div>
        <div class="tree-group-actions">
          <button class="tree-action-btn" title="Rename group" data-action="rename-group" data-group-id="${groupId}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="tree-action-btn" title="Close group" data-action="close-group" data-group-id="${groupId}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `;
      
      groupHeader.addEventListener('click', (e) => {
        // Don't toggle collapse if clicking on checkbox, name, or actions
        if (e.target.type === 'checkbox' || 
            e.target.closest('.tree-action-btn') ||
            e.target.classList.contains('tree-group-name')) {
          return;
        }
        groupHeader.classList.toggle('collapsed');
      });
      
      groupEl.appendChild(groupHeader);
      
      // Group tabs
      const groupContent = document.createElement('div');
      groupContent.className = 'tree-group-content';
      
      group.tabs.forEach(tab => {
        groupContent.appendChild(createTreeTab(tab));
      });
      
      groupEl.appendChild(groupContent);
      windowContent.appendChild(groupEl);
      
      // Set initial indeterminate state for group checkbox if needed
      const groupCheckbox = groupHeader.querySelector('.tree-select-checkbox');
      if (groupCheckedState === 'indeterminate') {
        groupCheckbox.indeterminate = true;
      }
      
      // Handle select all in group - attached after groupEl is in DOM
      groupCheckbox.addEventListener('change', (e) => {
        e.stopPropagation();
        const groupTabCheckboxes = groupEl.querySelectorAll('.tree-tab-checkbox');
        
        if (e.target.checked) {
          // Select all tabs in group
          group.tabs.forEach(tab => {
            state.selectedTabs.add(tab.id);
          });
          // Update UI without re-rendering
          groupTabCheckboxes.forEach(checkbox => {
            checkbox.checked = true;
            checkbox.closest('.tree-tab').classList.add('selected');
          });
        } else {
          // Deselect all tabs in group
          group.tabs.forEach(tab => {
            state.selectedTabs.delete(tab.id);
          });
          // Update UI without re-rendering  
          groupTabCheckboxes.forEach(checkbox => {
            checkbox.checked = false;
            checkbox.closest('.tree-tab').classList.remove('selected');
          });
        }
        
        updateBulkToolbar();
        // Update window checkbox state
        updateWindowCheckbox(windowEl);
      });
    });
    
    // Render ungrouped tabs
    if (window.ungroupedTabs.length > 0) {
      const ungroupedEl = document.createElement('div');
      ungroupedEl.className = 'tree-ungrouped';
      
      const ungroupedHeader = document.createElement('div');
      ungroupedHeader.className = 'tree-ungrouped-header';
      ungroupedHeader.textContent = 'Ungrouped Tabs';
      ungroupedEl.appendChild(ungroupedHeader);
      
      window.ungroupedTabs.forEach(tab => {
        ungroupedEl.appendChild(createTreeTab(tab));
      });
      
      windowContent.appendChild(ungroupedEl);
    }
    
    windowEl.appendChild(windowContent);
    tree.appendChild(windowEl);
    
    // Add drag and drop handlers for window
    windowHeader.addEventListener('dragover', handleDragOver);
    windowHeader.addEventListener('drop', handleDropOnWindow);
    
    // Add drag and drop handlers for groups
    window.groups.forEach((group, groupId) => {
      const groupHeader = windowEl.querySelector(`.tree-group-header[data-group-id="${groupId}"]`);
      if (groupHeader) {
        groupHeader.addEventListener('dragover', handleDragOver);
        groupHeader.addEventListener('drop', handleDropOnGroup);
      }
    });
    
    // Set initial indeterminate state for window checkbox if needed
    const windowCheckbox = windowHeader.querySelector('.tree-select-checkbox');
    if (windowCheckedState === 'indeterminate') {
      windowCheckbox.indeterminate = true;
    }
    
    // Handle select all in window - attached after windowEl is in DOM
    windowCheckbox.addEventListener('change', (e) => {
      e.stopPropagation();
      const allTabs = [...Array.from(window.groups.values()).flatMap(g => g.tabs), ...window.ungroupedTabs];
      const allTabCheckboxes = windowEl.querySelectorAll('.tree-tab-checkbox');
      const allGroupCheckboxes = windowEl.querySelectorAll('.tree-group-header .tree-select-checkbox');
      
      if (e.target.checked) {
        // Select all tabs
        allTabs.forEach(tab => {
          state.selectedTabs.add(tab.id);
        });
        // Update UI without re-rendering
        allTabCheckboxes.forEach(checkbox => {
          checkbox.checked = true;
          checkbox.closest('.tree-tab').classList.add('selected');
        });
        // Check all group checkboxes
        allGroupCheckboxes.forEach(checkbox => {
          checkbox.checked = true;
          checkbox.indeterminate = false;
        });
      } else {
        // Deselect all tabs
        allTabs.forEach(tab => {
          state.selectedTabs.delete(tab.id);
        });
        // Update UI without re-rendering
        allTabCheckboxes.forEach(checkbox => {
          checkbox.checked = false;
          checkbox.closest('.tree-tab').classList.remove('selected');
        });
        // Uncheck all group checkboxes
        allGroupCheckboxes.forEach(checkbox => {
          checkbox.checked = false;
          checkbox.indeterminate = false;
        });
      }
      updateBulkToolbar();
    });
  });
  
  // Add global event delegation for tree actions
  tree.addEventListener('click', async (e) => {
    const actionBtn = e.target.closest('.tree-action-btn');
    if (!actionBtn) return;
    
    const action = actionBtn.dataset.action;
    
    if (action === 'close-window') {
      const windowId = parseInt(actionBtn.dataset.windowId);
      if (confirm('Close this window and all its tabs?')) {
        await chrome.windows.remove(windowId);
        await loadTabsView();
      }
    } else if (action === 'close-group') {
      const groupId = parseInt(actionBtn.dataset.groupId);
      if (confirm('Close all tabs in this group?')) {
        const tabsToClose = tabs.filter(t => t.groupId === groupId).map(t => t.id);
        // Route through background → engine
        await chrome.runtime.sendMessage({
          action: 'closeTabs',
          tabIds: tabsToClose
        });
        await loadTabsView();
      }
    } else if (action === 'rename-group') {
      const groupId = parseInt(actionBtn.dataset.groupId);
      const nameEl = actionBtn.closest('.tree-group-header').querySelector('.tree-group-name');
      nameEl.contentEditable = true;
      nameEl.focus();
      
      // Select all text
      const range = document.createRange();
      range.selectNodeContents(nameEl);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      
      // Save on blur or enter
      const saveRename = async () => {
        nameEl.contentEditable = false;
        const newName = nameEl.textContent.trim();
        if (newName) {
          await chrome.tabGroups.update(groupId, { title: newName });
        }
      };
      
      nameEl.addEventListener('blur', saveRename, { once: true });
      nameEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          nameEl.blur();
        }
      }, { once: true });
    }
  });
}

// Drag and drop handlers
function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  
  // Add visual feedback
  this.classList.add('drop-target');
  
  // Clear other drop targets
  document.querySelectorAll('.drop-target').forEach(el => {
    if (el !== this) el.classList.remove('drop-target');
  });
}

async function handleDropOnWindow(e) {
  e.preventDefault();
  e.stopPropagation();
  
  this.classList.remove('drop-target');
  
  const data = JSON.parse(e.dataTransfer.getData('application/json'));
  const targetWindowId = parseInt(this.dataset.windowId);
  
  if (data.sourceWindowId === targetWindowId) {
    // Same window, just remove from group if in one
    if (data.sourceGroupId && data.sourceGroupId !== -1) {
      try {
        await chrome.tabs.ungroup(data.tabIds);
        showNotification(`Removed ${data.tabIds.length} tab(s) from group`, 'success');
        await loadTabsView();
      } catch (error) {
        console.error('Failed to ungroup tabs:', error);
        showNotification('Failed to ungroup tabs', 'error');
      }
    }
  } else {
    // Different window, move tabs
    try {
      await chrome.tabs.move(data.tabIds, {
        windowId: targetWindowId,
        index: -1
      });
      showNotification(`Moved ${data.tabIds.length} tab(s) to window`, 'success');
      clearSelection();
      await loadTabsView();
    } catch (error) {
      console.error('Failed to move tabs:', error);
      showNotification('Failed to move tabs', 'error');
    }
  }
}

async function handleDropOnGroup(e) {
  e.preventDefault();
  e.stopPropagation();
  
  this.classList.remove('drop-target');
  
  const data = JSON.parse(e.dataTransfer.getData('application/json'));
  const targetGroupId = parseInt(this.dataset.groupId);
  const targetWindowId = parseInt(this.dataset.windowId);
  
  try {
    // First move to target window if different
    if (data.sourceWindowId !== targetWindowId) {
      await chrome.tabs.move(data.tabIds, {
        windowId: targetWindowId,
        index: -1
      });
    }
    
    // Then add to group
    await chrome.tabs.group({
      tabIds: data.tabIds,
      groupId: targetGroupId
    });
    
    showNotification(`Added ${data.tabIds.length} tab(s) to group`, 'success');
    clearSelection();
    await loadTabsView();
  } catch (error) {
    console.error('Failed to move tabs to group:', error);
    showNotification('Failed to move tabs to group', 'error');
  }
}

function createTreeTab(tab) {
  const tabEl = document.createElement('div');
  tabEl.className = 'tree-tab';
  tabEl.draggable = true;
  tabEl.dataset.tabId = tab.id;
  tabEl.dataset.windowId = tab.windowId;
  tabEl.dataset.groupId = tab.groupId || -1;
  
  if (state.selectedTabs.has(tab.id)) {
    tabEl.classList.add('selected');
  }
  
  const badges = [];
  if (tab.pinned) badges.push('<span class="tree-tab-badge pinned">Pin</span>');
  if (tab.audible) badges.push('<span class="tree-tab-badge audible">Audio</span>');
  
  // Filter out invalid favicon URLs
  const filterFaviconUrl = (url) => {
    if (!url) return '../icons/icon-16.png';
    if (url.startsWith('chrome-extension://') && !url.includes(chrome.runtime.id)) {
      return '../icons/icon-16.png';
    }
    if (url === 'chrome-extension://invalid/') {
      return '../icons/icon-16.png';
    }
    return url;
  };
  
  const safeFaviconUrl = filterFaviconUrl(getFaviconUrl(tab));
  
  tabEl.innerHTML = `
    <input type="checkbox" class="tree-tab-checkbox tab-checkbox" data-tab-id="${tab.id}"
           ${state.selectedTabs.has(tab.id) ? 'checked' : ''}>
    <img src="${safeFaviconUrl}" class="tree-tab-favicon" data-fallback="../icons/icon-16.png">
    <div class="tree-tab-title" title="${tab.title}">${tab.title}</div>
    <button class="tree-tab-details" title="Show tab state details for debugging">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
    </button>
    <button class="tree-tab-goto" title="Go to tab">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
        <polyline points="15 3 21 3 21 9"></polyline>
        <line x1="10" y1="14" x2="21" y2="3"></line>
      </svg>
    </button>
    ${badges.length > 0 ? `<div class="tree-tab-badges">${badges.join('')}</div>` : ''}
  `;
  
  // Handle favicon errors
  const favicon = tabEl.querySelector('.tree-tab-favicon');
  if (favicon) {
    favicon.addEventListener('error', function(e) {
      e.preventDefault();
      this.src = this.dataset.fallback || '../icons/icon-16.png';
    }, true);
  }
  
  // Add checkbox handler
  const checkbox = tabEl.querySelector('.tab-checkbox');
  if (checkbox) {
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      if (e.target.checked) {
        state.selectedTabs.add(tab.id);
        tabEl.classList.add('selected');
      } else {
        state.selectedTabs.delete(tab.id);
        tabEl.classList.remove('selected');
      }
      updateBulkToolbar();
    
      // Update parent group/window checkbox states
      updateParentCheckboxes(tabEl);
    });
  }
  
  // Make entire row clickable for selection (except checkbox, details, and goto button)
  tabEl.addEventListener('click', (e) => {
    // Don't toggle if clicking checkbox, details button, or goto button
    if (e.target.classList.contains('tab-checkbox') ||
        e.target.closest('.tree-tab-details') ||
        e.target.closest('.tree-tab-goto')) {
      return;
    }
    e.stopPropagation();
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // Add click handler to details button
  const detailsBtn = tabEl.querySelector('.tree-tab-details');
  if (detailsBtn) {
    detailsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showTabDetails(tab);
    });
  }

  // Add click handler to goto button
  const gotoBtn = tabEl.querySelector('.tree-tab-goto');
  if (gotoBtn) {
    gotoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.tabs.update(tab.id, { active: true });
      chrome.windows.update(tab.windowId, { focused: true });
    });
  }
  
  // Add drag and drop handlers
  tabEl.addEventListener('dragstart', (e) => {
    // If multiple tabs selected, drag them all
    const tabsToMove = state.selectedTabs.has(tab.id) 
      ? Array.from(state.get('selectedTabs'))
      : [tab.id];
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({
      tabIds: tabsToMove,
      sourceWindowId: tab.windowId,
      sourceGroupId: tab.groupId
    }));
    
    tabEl.classList.add('dragging');
  });
  
  tabEl.addEventListener('dragend', (e) => {
    tabEl.classList.remove('dragging');
    // Remove all drop zone indicators
    document.querySelectorAll('.drop-target, .drop-before, .drop-after').forEach(el => {
      el.classList.remove('drop-target', 'drop-before', 'drop-after');
    });
  });
  
  return tabEl;
}

// Helper function to update parent checkboxes based on child selections
function updateParentCheckboxes(tabEl) {
  // Update group checkbox if tab is in a group
  const groupEl = tabEl.closest('.tree-group');
  if (groupEl) {
    const groupCheckbox = groupEl.querySelector('.tree-group-header .tree-select-checkbox');
    const allGroupTabs = groupEl.querySelectorAll('.tab-checkbox');
    const checkedGroupTabs = groupEl.querySelectorAll('.tab-checkbox:checked');
    
    if (checkedGroupTabs.length === 0) {
      groupCheckbox.checked = false;
      groupCheckbox.indeterminate = false;
    } else if (checkedGroupTabs.length === allGroupTabs.length) {
      groupCheckbox.checked = true;
      groupCheckbox.indeterminate = false;
    } else {
      groupCheckbox.checked = false;
      groupCheckbox.indeterminate = true;
    }
  }
  
  // Update window checkbox
  const windowEl = tabEl.closest('.tree-window');
  if (windowEl) {
    updateWindowCheckbox(windowEl);
  }
}

// Helper function to update window checkbox based on all child selections
function updateWindowCheckbox(windowEl) {
  const windowCheckbox = windowEl.querySelector('.tree-window-header .tree-select-checkbox');
  const allWindowTabs = windowEl.querySelectorAll('.tab-checkbox');
  const checkedWindowTabs = windowEl.querySelectorAll('.tab-checkbox:checked');
  
  if (checkedWindowTabs.length === 0) {
    windowCheckbox.checked = false;
    windowCheckbox.indeterminate = false;
  } else if (checkedWindowTabs.length === allWindowTabs.length) {
    windowCheckbox.checked = true;
    windowCheckbox.indeterminate = false;
  } else {
    windowCheckbox.checked = false;
    windowCheckbox.indeterminate = true;
  }
}

export function updateWindowFilterDropdown(windows, windowNameMap, currentWindowId) {
  const windowFilter = document.getElementById('windowFilter');
  if (!windowFilter) return;
  
  // Clear existing options except 'All Windows'
  windowFilter.innerHTML = '<option value="all">All Windows</option>';
  
  // Add window options with custom names
  windows.forEach(window => {
    const option = document.createElement('option');
    option.value = window.id;
    const name = windowNameMap.get(window.id);
    const tabCount = state.get('tabsData').filter(t => t.windowId === window.id).length;
    const currentIndicator = window.id === currentWindowId ? 'current, ' : '';
    option.textContent = `${name} (${currentIndicator}${tabCount} tabs)`;
    windowFilter.appendChild(option);
  });
  
  // Add rename option at the end
  const renameOption = document.createElement('option');
  renameOption.value = 'rename';
  renameOption.textContent = '✏️ Rename Windows...';
  renameOption.style.borderTop = '1px solid #ddd';
  windowFilter.appendChild(renameOption);
}

export function filterTabs() {
  const searchTerm = document.getElementById('searchTabs').value.toLowerCase();
  const filterType = document.getElementById('filterTabs').value;
  const windowFilterValue = document.getElementById('windowFilter')?.value || 'all';
  const sortType = document.getElementById('sortTabs')?.value || 'default';

  // Handle rename option
  if (windowFilterValue === 'rename') {
    showRenameWindowsDialog();
    // Restore previous selection while dialog is open
    document.getElementById('windowFilter').value = lastWindowFilterSelection;
    return;
  }

  // Track current selection for restoration after rename
  lastWindowFilterSelection = windowFilterValue;
  
  let filtered = state.get('tabsData');
  
  // Apply search filter
  if (searchTerm) {
    filtered = filtered.filter(tab => 
      tab.title.toLowerCase().includes(searchTerm) ||
      tab.url.toLowerCase().includes(searchTerm)
    );
  }
  
  // Apply window filter
  if (windowFilterValue !== 'all') {
    const windowId = parseInt(windowFilterValue);
    const windowFiltered = filtered.filter(tab => tab.windowId === windowId);
    
    // If no tabs found for this window (window was closed), reset to all windows
    if (windowFiltered.length === 0 && filtered.length > 0) {
      const windowFilter = document.getElementById('windowFilter');
      if (windowFilter) {
        windowFilter.value = 'all';
        // Re-run filter with all windows
        filterTabs();
        return;
      }
    }
    
    filtered = windowFiltered;
  }
  
  // Apply type filter
  switch(filterType) {
  case 'active':
    filtered = filtered.filter(tab => tab.active);
    break;
  case 'suspended':
    filtered = filtered.filter(tab => tab.discarded);
    break;
  case 'pinned':
    filtered = filtered.filter(tab => tab.pinned);
    break;
  case 'audible':
    filtered = filtered.filter(tab => tab.audible);
    break;
  case 'muted':
    filtered = filtered.filter(tab => tab.mutedInfo && tab.mutedInfo.muted);
    break;
  case 'grouped':
    filtered = filtered.filter(tab => tab.groupId && tab.groupId !== -1);
    break;
  case 'ungrouped':
    filtered = filtered.filter(tab => !tab.groupId || tab.groupId === -1);
    break;
  case 'duplicates':
    const urls = new Map();
    filtered.forEach(tab => {
      const normalizedUrl = normalizeUrl(tab.url);
      if (!urls.has(normalizedUrl)) {
        urls.set(normalizedUrl, []);
      }
      urls.get(normalizedUrl).push(tab);
    });
    filtered = [];
    urls.forEach(tabs => {
      if (tabs.length > 1) {
        filtered.push(...tabs);
      }
    });
    break;
  }
  
  sortAndRenderTabs(filtered, sortType);
}

export function sortAndRenderTabs(tabs, sortType) {
  const sorted = [...tabs]; // Create a copy to avoid mutating original
  
  switch(sortType) {
  case 'window':
    // Group tabs by window
    sorted.sort((a, b) => {
      if (a.windowId !== b.windowId) {
        return a.windowId - b.windowId;
      }
      // Within same window, sort by index
      return a.index - b.index;
    });
    break;
      
  case 'recent':
    // Most recently used (active tabs first, then by last accessed)
    sorted.sort((a, b) => {
      if (a.active) return -1;
      if (b.active) return 1;
      return (b.lastAccessed || 0) - (a.lastAccessed || 0);
    });
    break;
      
  case 'oldest':
    // Least recently used
    sorted.sort((a, b) => {
      if (a.active) return 1;
      if (b.active) return -1;
      return (a.lastAccessed || 0) - (b.lastAccessed || 0);
    });
    break;
      
  case 'suspended':
    // Suspended tabs first (good for cleanup)
    sorted.sort((a, b) => {
      if (a.discarded && !b.discarded) return -1;
      if (!a.discarded && b.discarded) return 1;
      return 0;
    });
    break;
      
  case 'active':
    // Active/playing tabs first
    sorted.sort((a, b) => {
      const aScore = (a.active ? 4 : 0) + (a.audible ? 2 : 0) + (a.pinned ? 1 : 0);
      const bScore = (b.active ? 4 : 0) + (b.audible ? 2 : 0) + (b.pinned ? 1 : 0);
      return bScore - aScore;
    });
    break;
      
  case 'title':
    sorted.sort((a, b) => a.title.localeCompare(b.title));
    break;
      
  case 'domain':
    sorted.sort((a, b) => {
      const domainA = new URL(a.url).hostname;
      const domainB = new URL(b.url).hostname;
      return domainA.localeCompare(domainB);
    });
    break;

  case 'category':
    // Sort by category alphabetically, with 'unknown' at the end
    sorted.sort((a, b) => {
      const catA = a.category || 'unknown';
      const catB = b.category || 'unknown';

      // Put 'unknown' categories at the end
      if (catA === 'unknown' && catB !== 'unknown') return 1;
      if (catA !== 'unknown' && catB === 'unknown') return -1;

      // Alphabetical sort
      return catA.localeCompare(catB);
    });
    break;

  case 'default':
  default:
    // Keep original order (by tab index)
    break;
  }

  renderTabs(sorted);
}

// Show tab details modal for debugging
export function showTabDetails(tab) {
  // Create modal
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'flex';

  // Format tab data for display
  const formatValue = (value) => {
    if (value === null) return '<span style="color: #999;">null</span>';
    if (value === undefined) return '<span style="color: #999;">undefined</span>';
    if (typeof value === 'boolean') return `<span style="color: ${value ? '#4caf50' : '#f44336'};">${value}</span>`;
    if (typeof value === 'number') return `<span style="color: #2196f3;">${value}</span>`;
    if (typeof value === 'string') return `<span style="color: #ff9800;">"${value}"</span>`;
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      return `<span style="color: #9c27b0;">[${value.length} items]</span>`;
    }
    if (typeof value === 'object') return '<span style="color: #9c27b0;">{...}</span>';
    return String(value);
  };

  // Build attribute rows
  const attributes = Object.keys(tab).sort().map(key => {
    const value = tab[key];
    let displayValue = formatValue(value);

    // Special handling for certain fields
    if (key === 'categories' && Array.isArray(value)) {
      displayValue = value.length > 0 ? value.join(', ') : '<span style="color: #999;">none</span>';
    } else if (key === 'age' || key === 'lastAccess') {
      const ms = value;
      if (ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        let timeStr = '';
        if (days > 0) timeStr = `${days}d ${hours % 24}h`;
        else if (hours > 0) timeStr = `${hours}h ${minutes % 60}m`;
        else if (minutes > 0) timeStr = `${minutes}m ${seconds % 60}s`;
        else timeStr = `${seconds}s`;

        displayValue = `${formatValue(ms)} <span style="color: #666;">(${timeStr})</span>`;
      }
    } else if (Array.isArray(value) && value.length > 0) {
      displayValue = value.map(v => formatValue(v)).join(', ');
    }

    return `
      <tr>
        <td style="font-weight: 600; padding: 8px; border-bottom: 1px solid #eee; vertical-align: top;">${key}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; font-family: monospace; font-size: 13px;">${displayValue}</td>
      </tr>
    `;
  }).join('');

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 800px; max-height: 80vh; overflow: hidden; display: flex; flex-direction: column;">
      <div class="modal-header" style="padding: 20px; border-bottom: 1px solid #eee;">
        <h2 style="margin: 0; font-size: 18px;">Tab State Details</h2>
        <button class="modal-close" style="position: absolute; top: 20px; right: 20px; background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">×</button>
      </div>
      <div style="padding: 20px; overflow-y: auto; flex: 1;">
        <div style="margin-bottom: 20px;">
          <div style="font-size: 14px; color: #666; margin-bottom: 8px;">
            <img src="${tab.favIconUrl || '../icons/icon-16.png'}" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 8px;">
            <strong>${tab.title}</strong>
          </div>
          <div style="font-size: 12px; color: #999; font-family: monospace; word-break: break-all;">
            ${tab.url}
          </div>
        </div>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="text-align: left; padding: 8px; border-bottom: 2px solid #ddd; background: #f5f5f5;">Attribute</th>
              <th style="text-align: left; padding: 8px; border-bottom: 2px solid #ddd; background: #f5f5f5;">Value</th>
            </tr>
          </thead>
          <tbody>
            ${attributes}
          </tbody>
        </table>
      </div>
      <div class="modal-footer" style="padding: 16px; border-top: 1px solid #eee; display: flex; justify-content: space-between;">
        <button class="btn btn-secondary copy-json-btn">Copy as JSON</button>
        <button class="btn btn-primary close-modal-btn">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close handlers
  const closeModal = () => modal.remove();
  modal.querySelector('.modal-close').addEventListener('click', closeModal);
  modal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Copy JSON handler
  modal.querySelector('.copy-json-btn').addEventListener('click', () => {
    const json = JSON.stringify(tab, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      const btn = modal.querySelector('.copy-json-btn');
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    });
  });
}

// Listen for window filter update requests (e.g., after renaming windows)
document.addEventListener('updateWindowFilter', async () => {
  await loadTabsView();

  // Restore the previous window filter selection
  const windowFilter = document.getElementById('windowFilter');
  if (windowFilter && lastWindowFilterSelection !== 'all') {
    // Check if the option still exists (window may have been closed)
    const optionExists = Array.from(windowFilter.options).some(
      opt => opt.value === lastWindowFilterSelection
    );
    if (optionExists) {
      windowFilter.value = lastWindowFilterSelection;
      filterTabs();
    }
  }
});