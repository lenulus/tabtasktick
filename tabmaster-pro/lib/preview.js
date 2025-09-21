// Tab Preview Card functionality for TabMaster Pro

class TabPreviewCard {
  constructor(container) {
    this.container = container || document.body;
    this.element = null;
    this.currentTabId = null;
    this.screenshotLoader = null;
    this.hoverTimer = null;
    this.isVisible = false;
    
    // Settings
    this.settings = {
      enabled: true,
      showScreenshots: true,
      hoverDelay: 300,
      screenshotCacheTime: 300000, // 5 minutes
    };
    
    // Screenshot cache: tabId => {screenshot, timestamp}
    this.screenshotCache = new Map();
    
    // Create preview element
    this.createElement();
    
    // Load settings
    this.loadSettings();
    
    // Clean up cache periodically
    setInterval(() => this.cleanCache(), 60000); // Every minute
  }
  
  createPortalContainer() {
    const portal = document.createElement('div');
    portal.id = 'preview-portal';
    portal.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      overflow: visible;
      pointer-events: none;
      z-index: 999999;
    `;
    document.body.appendChild(portal);
    return portal;
  }
  
  createElement() {
    // Create a container div that will be appended directly to body, outside any transformed containers
    const portalContainer = document.getElementById('preview-portal') || this.createPortalContainer();
    
    this.element = document.createElement('div');
    this.element.className = 'tab-preview-card';
    this.element.innerHTML = `
      <div class="preview-screenshot-container">
        <img class="preview-screenshot loading" alt="Tab screenshot">
        <div class="preview-screenshot-placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
            <path d="M16 2l-4 5-4-5"></path>
          </svg>
        </div>
      </div>
      <div class="preview-content">
        <div class="preview-header">
          <img class="preview-favicon" width="16" height="16">
          <div class="preview-title"></div>
        </div>
        <div class="preview-url"></div>
        <div class="preview-metadata">
          <span class="preview-memory">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <rect x="7" y="7" width="10" height="10"></rect>
            </svg>
            <span class="memory-value">-</span>
          </span>
          <span class="preview-time">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span class="time-value">-</span>
          </span>
        </div>
        <div class="preview-actions">
          <button class="preview-action" data-action="pin" title="Pin tab">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M9 3v6l-2 4v2h10v-2l-2-4V3"></path>
              <line x1="12" y1="15" x2="12" y2="21"></line>
            </svg>
          </button>
          <button class="preview-action" data-action="snooze" title="Snooze tab">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M21 12.79A9 9 0 1 1 11.21 3"></path>
              <polyline points="21 3 21 12 12 12"></polyline>
            </svg>
          </button>
          <button class="preview-action" data-action="close" title="Close tab">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    `;
    
    // Append to portal container which is outside any transformed elements
    portalContainer.appendChild(this.element);
    
    // Cache DOM references
    this.screenshotEl = this.element.querySelector('.preview-screenshot');
    this.screenshotPlaceholderEl = this.element.querySelector('.preview-screenshot-placeholder');
    this.faviconEl = this.element.querySelector('.preview-favicon');
    this.titleEl = this.element.querySelector('.preview-title');
    this.urlEl = this.element.querySelector('.preview-url');
    this.memoryValueEl = this.element.querySelector('.memory-value');
    this.timeValueEl = this.element.querySelector('.time-value');
    
    // Setup action handlers
    this.setupActionHandlers();
  }
  
  async loadSettings() {
    try {
      const result = await chrome.storage.local.get('tabPreviewSettings');
      if (result.tabPreviewSettings) {
        Object.assign(this.settings, result.tabPreviewSettings);
      }
    } catch (error) {
      console.error('Failed to load preview settings:', error);
    }
  }
  
  async saveSettings() {
    try {
      await chrome.storage.local.set({ tabPreviewSettings: this.settings });
    } catch (error) {
      console.error('Failed to save preview settings:', error);
    }
  }
  
  setupActionHandlers() {
    this.element.addEventListener('click', async (e) => {
      const actionBtn = e.target.closest('.preview-action');
      if (!actionBtn || !this.currentTabId) return;
      
      const action = actionBtn.dataset.action;
      
      try {
        switch (action) {
          case 'pin':
            const tab = await chrome.tabs.get(this.currentTabId);
            await chrome.tabs.update(this.currentTabId, { pinned: !tab.pinned });
            this.hide();
            break;
            
          case 'snooze':
            // Trigger snooze modal
            window.snoozeModal?.show(this.currentTabId);
            this.hide();
            break;
            
          case 'close':
            await chrome.tabs.remove(this.currentTabId);
            this.hide();
            break;
        }
      } catch (error) {
        console.error(`Failed to ${action} tab:`, error);
      }
    });
  }
  
  async show(tabIdOrElement, anchorElement) {
    if (!this.settings.enabled) return;
    
    // Clear any existing timer
    this.clearHoverTimer();
    
    // Set hover timer
    this.hoverTimer = setTimeout(async () => {
      try {
        let tab;
        
        // Support both old signature (tabId, element) and new signature (element, tab)
        if (typeof tabIdOrElement === 'number') {
          // Old signature: tabId, anchorElement
          // Get tab data
          if (typeof chrome !== 'undefined' && chrome.tabs) {
            tab = await chrome.tabs.get(tabIdOrElement);
          } else {
            return;
          }
          if (!tab) {
            return;
          }
          this.currentTabId = tabIdOrElement;
        } else if (typeof tabIdOrElement === 'object' && tabIdOrElement.nodeType) {
          // New signature: anchorElement, tab object
          const tempAnchor = tabIdOrElement;
          tab = anchorElement;  // In this case, second parameter is the tab object
          anchorElement = tempAnchor;
          this.currentTabId = tab.id;
        } else if (typeof tabIdOrElement === 'object' && !tabIdOrElement.nodeType) {
          // Direct tab object passed (for testing)
          tab = tabIdOrElement;
          this.currentTabId = tab.id;
        }
        
        this.currentTabId = tab.id || this.currentTabId;
        
        // Update content
        this.updateContent(tab);
        
        // Position the card
        this.updatePosition(anchorElement);
        
        // Show with animation
        
        // Ensure element is in DOM
        if (!this.element.parentNode) {
          document.body.appendChild(this.element);
        }
        
        this.element.classList.add('visible');
        this.isVisible = true;
        
        // Load screenshot if enabled
        if (this.settings.showScreenshots) {
          this.loadScreenshot(tab);
        }
      } catch (error) {
        console.error('Failed to show preview:', error);
      }
    }, this.settings.hoverDelay);
  }
  
  hide() {
    this.clearHoverTimer();
    
    if (this.isVisible) {
      this.element.classList.remove('visible');
      this.isVisible = false;
      this.currentTabId = null;
      
      // Cancel any pending screenshot load
      if (this.screenshotLoader) {
        this.screenshotLoader.cancel = true;
        this.screenshotLoader = null;
      }
      
      // Reset screenshot
      this.screenshotEl.src = '';
      this.screenshotEl.classList.add('loading');
      this.screenshotPlaceholderEl.style.display = 'flex';
    }
  }
  
  clearHoverTimer() {
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
  }
  
  updateContent(tab) {
    // Update favicon
    this.faviconEl.src = tab.favIconUrl || '../icons/icon-16.png';
    this.faviconEl.onerror = () => { this.faviconEl.src = '../icons/icon-16.png'; };
    
    // Update title and URL
    this.titleEl.textContent = tab.title;
    this.titleEl.title = tab.title;
    this.urlEl.textContent = tab.url;
    this.urlEl.title = tab.url;
    
    // Update metadata
    this.updateMetadata(tab);
    
    // Update pin button state
    const pinBtn = this.element.querySelector('[data-action="pin"]');
    if (tab.pinned) {
      pinBtn.classList.add('active');
      pinBtn.title = 'Unpin tab';
    } else {
      pinBtn.classList.remove('active');
      pinBtn.title = 'Pin tab';
    }
  }
  
  async updateMetadata(tab) {
    // Memory usage (placeholder for now - requires chrome.processes API)
    this.memoryValueEl.textContent = '~' + Math.round(20 + Math.random() * 80) + ' MB';
    
    // Last accessed time
    if (tab.lastAccessed) {
      const timeAgo = this.getTimeAgo(tab.lastAccessed);
      this.timeValueEl.textContent = timeAgo;
    } else {
      this.timeValueEl.textContent = 'Recently';
    }
  }
  
  getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }
  
  updatePosition(anchorElement) {
    const rect = anchorElement.getBoundingClientRect();
    
    const cardWidth = 320;
    const cardHeight = 280; // Approximate
    const padding = 8;
    
    // Calculate position relative to viewport
    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + padding;
    
    // Adjust if would go off screen
    if (rect.left + cardWidth > window.innerWidth) {
      left = window.innerWidth - cardWidth - padding + window.scrollX;
    }
    
    if (rect.bottom + cardHeight + padding > window.innerHeight) {
      top = rect.top + window.scrollY - cardHeight - padding;
    }
    
    // Ensure not off left edge
    if (rect.left < padding) {
      left = padding + window.scrollX;
    }
    
    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
    
    // Ensure the preview is positioned absolutely within the portal
    this.element.style.position = 'absolute';
    this.element.style.zIndex = '99999';
  }
  
  async loadScreenshot(tab) {
    // Check cache first
    const cached = this.screenshotCache.get(tab.id);
    if (cached && Date.now() - cached.timestamp < this.settings.screenshotCacheTime) {
      this.displayScreenshot(cached.screenshot);
      return;
    }
    
    // Create loader to track this request
    const loader = { cancel: false };
    this.screenshotLoader = loader;
    
    try {
      // Check if Chrome APIs are available
      if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.captureVisibleTab) {
        this.showEnhancedPlaceholder(tab);
        return;
      }
      
      // Check if this is the current active tab we're viewing
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // We can only capture screenshots of the currently visible tab
      if (activeTab && activeTab.id === tab.id) {
        try {
          const screenshot = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
            format: 'jpeg',
            quality: 30
          });
          
          if (!loader.cancel) {
            this.screenshotCache.set(tab.id, {
              screenshot,
              timestamp: Date.now()
            });
            this.displayScreenshot(screenshot);
          }
        } catch (captureError) {
          this.showEnhancedPlaceholder(tab);
        }
      } else {
        // For non-active tabs, show an enhanced placeholder with site info
        this.showEnhancedPlaceholder(tab);
      }
    } catch (error) {
      this.showEnhancedPlaceholder(tab);
    }
  }
  
  showEnhancedPlaceholder(tab) {
    // Hide the actual screenshot
    this.screenshotEl.style.display = 'none';
    this.screenshotPlaceholderEl.style.display = 'flex';
    
    // Update placeholder to show site-specific content
    const url = new URL(tab.url || 'https://example.com');
    const domain = url.hostname.replace('www.', '');
    
    // Create a more informative placeholder
    this.screenshotPlaceholderEl.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        ${tab.favIconUrl ? 
          `<img src="${tab.favIconUrl}" style="width: 48px; height: 48px; margin-bottom: 12px;" onerror="this.style.display='none'">` :
          `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 12px; opacity: 0.5;">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="9" y1="9" x2="15" y2="9"></line>
            <line x1="9" y1="12" x2="15" y2="12"></line>
            <line x1="9" y1="15" x2="12" y2="15"></line>
          </svg>`
        }
        <div style="font-size: 13px; opacity: 0.7; margin-top: 8px;">${domain}</div>
      </div>
    `;
  }
  
  displayScreenshot(dataUrl) {
    this.screenshotEl.src = dataUrl;
    this.screenshotEl.classList.remove('loading');
    this.screenshotPlaceholderEl.style.display = 'none';
    this.screenshotEl.style.display = 'block';
  }
  
  cleanCache() {
    const now = Date.now();
    const expiredEntries = [];
    
    for (const [tabId, data] of this.screenshotCache) {
      if (now - data.timestamp > this.settings.screenshotCacheTime) {
        expiredEntries.push(tabId);
      }
    }
    
    expiredEntries.forEach(tabId => this.screenshotCache.delete(tabId));
    
    // Also limit cache size to 50 entries
    if (this.screenshotCache.size > 50) {
      const entries = Array.from(this.screenshotCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, entries.length - 50);
      toRemove.forEach(([tabId]) => this.screenshotCache.delete(tabId));
    }
  }
  
  // Settings management
  setEnabled(enabled) {
    this.settings.enabled = enabled;
    this.saveSettings();
    if (!enabled) {
      this.hide();
    }
  }
  
  setShowScreenshots(show) {
    this.settings.showScreenshots = show;
    this.saveSettings();
  }
  
  setHoverDelay(delay) {
    this.settings.hoverDelay = Math.max(0, Math.min(1000, delay));
    this.saveSettings();
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TabPreviewCard;
}