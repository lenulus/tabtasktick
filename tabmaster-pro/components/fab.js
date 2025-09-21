// Floating Action Button Component for Quick Actions
class FloatingActionButton {
  constructor(container) {
    this.container = container;
    this.isExpanded = false;
    this.fab = null;
    this.overlay = null;
    this.grid = null;
    this.actionConfig = this.getActionConfig();
    this.undoManager = new UndoManager();
    this.init();
  }

  init() {
    this.createFAB();
    this.createOverlay();
    this.attachEventListeners();
    this.loadPreviewCounts();
  }

  getActionConfig() {
    return {
      closeDuplicates: {
        id: 'closeDuplicates',
        label: 'Close Duplicates',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>`,
        color: '#e74c3c',
        previewCount: async () => await this.getDuplicateCount(),
        execute: async () => await this.executeDuplicateClose(),
        undoable: true
      },
      groupByDomain: {
        id: 'groupByDomain',
        label: 'Group by Domain',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <rect x="3" y="3" width="7" height="7"></rect>
          <rect x="14" y="3" width="7" height="7"></rect>
          <rect x="14" y="14" width="7" height="7"></rect>
          <rect x="3" y="14" width="7" height="7"></rect>
        </svg>`,
        color: '#3498db',
        previewCount: async () => await this.getUngroupedDomainCount(),
        execute: async () => await this.executeGroupByDomain(),
        undoable: true
      },
      suspendInactive: {
        id: 'suspendInactive',
        label: 'Suspend Inactive',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M10 9v6m4-6v6"></path>
        </svg>`,
        color: '#f39c12',
        previewCount: async () => await this.getInactiveTabsInfo(),
        execute: async () => await this.executeSuspendInactive(),
        undoable: true
      },
      archiveOld: {
        id: 'archiveOld',
        label: 'Archive Old',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M21 8v13H3V8m18 0H3m18 0l-2-3H5l-2 3"></path>
          <path d="M12 11v6m-3-3h6"></path>
        </svg>`,
        color: '#9b59b6',
        previewCount: async () => await this.getOldTabsCount(),
        execute: async () => await this.executeArchiveOld(),
        undoable: true
      },
      snoozeBulk: {
        id: 'snoozeBulk',
        label: 'Snooze Bulk',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M12 2v10l4 2"></path>
          <circle cx="12" cy="12" r="10"></circle>
        </svg>`,
        color: '#1abc9c',
        previewCount: async () => await this.getSelectedTabsCount(),
        execute: async () => await this.executeSnoozeBulk(),
        undoable: true
      },
      quickOrganize: {
        id: 'quickOrganize',
        label: 'Quick Organize',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M3 3h18v18H3zm6 6h6m-6 6h6"></path>
          <circle cx="18" cy="6" r="3" fill="currentColor"></circle>
        </svg>`,
        color: '#34495e',
        previewCount: async () => ({ label: 'AI' }),
        execute: async () => await this.executeQuickOrganize(),
        undoable: false
      },
      exportAll: {
        id: 'exportAll',
        label: 'Export All',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>`,
        color: '#2ecc71',
        execute: async () => await this.executeExportAll(),
        undoable: false
      },
      importTabs: {
        id: 'importTabs',
        label: 'Import Tabs',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>`,
        color: '#3498db',
        execute: async () => await this.executeImportTabs(),
        undoable: false
      },
      moreActions: {
        id: 'moreActions',
        label: 'More Actions',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="1"></circle>
          <circle cx="12" cy="5" r="1"></circle>
          <circle cx="12" cy="19" r="1"></circle>
        </svg>`,
        color: '#95a5a6',
        execute: async () => await this.showMoreActions(),
        undoable: false
      }
    };
  }

  createFAB() {
    this.fab = document.createElement('button');
    this.fab.className = 'fab';
    this.fab.setAttribute('aria-label', 'Quick Actions');
    this.fab.innerHTML = `
      <svg class="fab-icon" viewBox="0 0 24 24">
        <path d="M12 5v14m7-7H5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
    this.container.appendChild(this.fab);
  }

  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'fab-overlay';
    this.overlay.setAttribute('aria-hidden', 'true');
    this.overlay.innerHTML = `
      <div class="fab-backdrop"></div>
      <div class="action-grid-container">
        <h3 class="action-grid-title">Quick Actions</h3>
        <div class="action-grid" role="grid"></div>
      </div>
    `;
    this.grid = this.overlay.querySelector('.action-grid');
    this.container.appendChild(this.overlay);

    // Populate grid with actions
    this.populateActionGrid();
  }

  populateActionGrid() {
    Object.entries(this.actionConfig).forEach(([key, action]) => {
      const actionItem = document.createElement('button');
      actionItem.className = 'action-item';
      actionItem.dataset.action = key;
      actionItem.setAttribute('role', 'gridcell');
      actionItem.setAttribute('aria-label', action.label);
      
      actionItem.innerHTML = `
        <div class="action-icon" style="color: ${action.color}">
          ${action.icon}
        </div>
        <span class="action-label">${action.label}</span>
        <span class="action-preview" data-action-preview="${key}"></span>
      `;
      
      this.grid.appendChild(actionItem);
    });
  }

  attachEventListeners() {
    // FAB click
    this.fab.addEventListener('click', () => this.toggle());

    // Backdrop click
    this.overlay.querySelector('.fab-backdrop').addEventListener('click', () => {
      if (this.isExpanded) this.toggle();
    });

    // Action clicks
    this.grid.addEventListener('click', async (e) => {
      const actionItem = e.target.closest('.action-item');
      if (actionItem) {
        const actionKey = actionItem.dataset.action;
        await this.executeAction(actionKey);
      }
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isExpanded) {
        this.toggle();
      }
    });
  }

  toggle() {
    this.isExpanded = !this.isExpanded;
    this.fab.classList.toggle('expanded', this.isExpanded);
    this.overlay.classList.toggle('active', this.isExpanded);
    this.overlay.setAttribute('aria-hidden', !this.isExpanded);

    if (this.isExpanded) {
      this.animateGridItems();
      this.refreshPreviewCounts();
      this.fab.setAttribute('aria-expanded', 'true');
    } else {
      this.fab.setAttribute('aria-expanded', 'false');
    }
  }

  animateGridItems() {
    const items = this.grid.querySelectorAll('.action-item');
    items.forEach((item, index) => {
      item.style.animationDelay = `${index * 0.05}s`;
    });
  }

  async loadPreviewCounts() {
    // Initial load
    await this.refreshPreviewCounts();
    
    // Refresh periodically
    setInterval(() => {
      if (this.isExpanded) {
        this.refreshPreviewCounts();
      }
    }, 5000);
  }

  async refreshPreviewCounts() {
    for (const [key, action] of Object.entries(this.actionConfig)) {
      if (action.previewCount) {
        try {
          const result = await action.previewCount();
          this.updateActionPreview(key, result);
        } catch (error) {
          console.error(`Failed to get preview for ${key}:`, error);
        }
      }
    }
  }

  updateActionPreview(actionKey, preview) {
    const previewElement = this.grid.querySelector(`[data-action-preview="${actionKey}"]`);
    if (previewElement) {
      if (preview.count !== undefined) {
        const formattedCount = preview.count > 999 
          ? `${(preview.count / 1000).toFixed(1)}K` 
          : preview.count.toString();
        previewElement.textContent = formattedCount;
        previewElement.style.display = preview.count > 0 ? 'block' : 'none';
      } else if (preview.label) {
        previewElement.textContent = preview.label;
        previewElement.style.display = 'block';
      }
    }
  }

  async executeAction(actionKey) {
    const action = this.actionConfig[actionKey];
    if (!action || !action.execute) return;

    try {
      // Close FAB
      this.toggle();

      // Execute action
      const result = await action.execute();
      
      // Handle undo if applicable
      if (action.undoable && result?.undoData) {
        this.undoManager.recordAction(action, result.undoData);
      }
    } catch (error) {
      console.error(`Failed to execute ${actionKey}:`, error);
      this.showNotification(`Failed to ${action.label}`, 'error');
    }
  }

  // Preview count methods
  async getDuplicateCount() {
    const response = await chrome.runtime.sendMessage({ action: 'getDuplicateCount' });
    return { count: response || 0 };
  }

  async getUngroupedDomainCount() {
    const tabs = await chrome.tabs.query({});
    const domains = new Set();
    tabs.forEach(tab => {
      if (!tab.groupId || tab.groupId === -1) {
        try {
          const url = new URL(tab.url);
          domains.add(url.hostname);
        } catch (e) {}
      }
    });
    return { count: domains.size };
  }

  async getInactiveTabsInfo() {
    const tabs = await chrome.tabs.query({ active: false });
    const inactiveTabs = tabs.filter(tab => 
      !tab.pinned && 
      tab.lastAccessed < Date.now() - 30 * 60 * 1000
    );
    return { count: inactiveTabs.length };
  }

  async getOldTabsCount() {
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
    const tabs = await chrome.tabs.query({});
    const oldTabs = tabs.filter(tab => 
      !tab.pinned && 
      !tab.active && 
      tab.lastAccessed &&
      (Date.now() - tab.lastAccessed) > ONE_WEEK
    );
    return { count: oldTabs.length };
  }

  async getSelectedTabsCount() {
    // Check if we're in dashboard with bulk selection
    const selectedTabs = document.querySelectorAll('.tab-checkbox:checked');
    return { count: selectedTabs.length };
  }

  // Action execution methods
  async executeDuplicateClose() {
    const count = await chrome.runtime.sendMessage({ action: 'closeDuplicates' });
    if (count > 0) {
      this.showNotification(`Closed ${count} duplicate tab${count > 1 ? 's' : ''}`, 'success');
    }
    return { count };
  }

  async executeGroupByDomain() {
    const count = await chrome.runtime.sendMessage({ action: 'groupByDomain' });
    if (count > 0) {
      this.showNotification(`Created ${count} group${count > 1 ? 's' : ''}`, 'success');
    }
    return { count };
  }

  async executeSuspendInactive() {
    const tabs = await chrome.tabs.query({ active: false });
    const inactiveTabs = tabs.filter(tab => 
      !tab.pinned && 
      tab.lastAccessed < Date.now() - 30 * 60 * 1000
    );
    
    if (inactiveTabs.length > 0) {
      await chrome.tabs.discard(inactiveTabs.map(t => t.id));
      this.showNotification(`Suspended ${inactiveTabs.length} inactive tabs`, 'success');
    }
    
    return { count: inactiveTabs.length };
  }

  async executeArchiveOld() {
    const result = await chrome.runtime.sendMessage({ action: 'archiveOldTabs' });
    if (result.count > 0) {
      this.showNotification(`Archived ${result.count} old tab${result.count > 1 ? 's' : ''}`, 'success');
    }
    return result;
  }

  async executeSnoozeBulk() {
    // Trigger snooze modal
    window.snoozeModal?.show();
  }

  async executeQuickOrganize() {
    const suggestions = await chrome.runtime.sendMessage({ action: 'getOrganizeSuggestions' });
    // Show suggestions modal
    this.showOrganizeSuggestions(suggestions);
  }

  async executeExportAll() {
    // Trigger export
    document.getElementById('export')?.click();
  }

  async executeImportTabs() {
    // Trigger import
    await chrome.runtime.sendMessage({ action: 'importTabs' });
  }

  async showMoreActions() {
    // Open dashboard
    await chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  }

  showNotification(message, type = 'info') {
    // Use existing notification system if available
    if (window.showNotification) {
      window.showNotification(message, type);
    }
  }

  showOrganizeSuggestions(suggestions) {
    // TODO: Implement suggestions modal
    console.log('Organization suggestions:', suggestions);
  }
}

// Undo Manager
class UndoManager {
  constructor() {
    this.undoStack = [];
    this.toastContainer = this.createToastContainer();
  }

  createToastContainer() {
    const existing = document.querySelector('.toast-container');
    if (existing) return existing;

    const container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
  }

  recordAction(action, undoData) {
    const undoItem = {
      id: Date.now(),
      action: action,
      data: undoData,
      timestamp: Date.now()
    };

    this.undoStack.push(undoItem);
    this.showUndoToast(undoItem);

    // Keep only last 5 undo items
    if (this.undoStack.length > 5) {
      this.undoStack.shift();
    }
  }

  showUndoToast(undoItem) {
    const toast = document.createElement('div');
    toast.className = 'undo-toast';
    toast.innerHTML = `
      <span class="toast-message">${undoItem.action.label} completed</span>
      <button class="undo-btn" data-undo-id="${undoItem.id}">Undo</button>
      <div class="toast-progress"></div>
    `;

    this.toastContainer.appendChild(toast);

    // Auto-dismiss after 5 seconds
    const timeout = setTimeout(() => {
      this.dismissToast(toast);
    }, 5000);

    // Handle undo click
    toast.querySelector('.undo-btn').addEventListener('click', async () => {
      clearTimeout(timeout);
      await this.executeUndo(undoItem);
      this.dismissToast(toast);
    });
  }

  dismissToast(toast) {
    toast.classList.add('dismissing');
    setTimeout(() => toast.remove(), 300);
  }

  async executeUndo(undoItem) {
    try {
      const result = await chrome.runtime.sendMessage({ 
        action: 'undo', 
        actionId: undoItem.action.id,
        undoData: undoItem.data 
      });
      
      if (result.success) {
        this.showNotification('Action undone', 'success');
      }
    } catch (error) {
      console.error('Undo failed:', error);
      this.showNotification('Failed to undo action', 'error');
    }
  }

  showNotification(message, type) {
    if (window.showNotification) {
      window.showNotification(message, type);
    }
  }
}

// Export for use
window.FloatingActionButton = FloatingActionButton;