// Tab Simulator - Creates and manages test tabs with specific properties

export class TabSimulator {
  constructor(testMode) {
    this.testMode = testMode;
    this.tabTimeData = new Map(); // Store simulated time data
    this.tabMetadata = new Map(); // Store additional metadata
  }

  /**
   * Create a tab with specific properties
   * @param {object} config - Tab configuration
   * @returns {object} Created tab
   */
  async createTab(config) {
    const {
      url = 'https://example.com',
      pinned = false,
      muted = false,
      active = false,
      windowId = null,
      index = undefined,
      openerTabId = undefined
    } = config;

    // Determine which window to use
    const targetWindowId = windowId || this.testMode.testWindow?.id;

    if (!targetWindowId) {
      throw new Error('No window ID available for tab creation. Test window may not be initialized.');
    }

    // Create the tab
    const tab = await chrome.tabs.create({
      url,
      pinned,
      active,
      windowId: targetWindowId,
      index,
      openerTabId
    });

    // Apply additional properties after creation
    if (muted) {
      await chrome.tabs.update(tab.id, { muted: true });
    }

    // Initialize time data
    const now = Date.now();
    this.tabTimeData.set(tab.id, {
      created: now,
      lastActive: active ? now : now - (10 * 60 * 1000), // 10 minutes ago if not active
      lastAccessed: now
    });

    // Store metadata
    this.tabMetadata.set(tab.id, {
      testTab: true,
      createdBy: 'TabSimulator',
      scenario: this.testMode.currentScenario
    });

    // Wait for tab to fully load if it's a real URL
    if (url && !url.startsWith('data:') && !url.startsWith('about:')) {
      await this.waitForTabLoad(tab.id);
    }

    return tab;
  }

  /**
   * Create multiple tabs with variations
   * @param {object} baseConfig - Base configuration for tabs
   * @param {Array} variations - Array of config overrides for each tab
   * @returns {Array} Created tabs
   */
  async createTabs(baseConfig, variations = []) {
    const tabs = [];

    if (variations.length === 0) {
      // Create identical tabs
      const count = baseConfig.count || 1;
      for (let i = 0; i < count; i++) {
        const tab = await this.createTab(baseConfig);
        tabs.push(tab);
      }
    } else {
      // Create tabs with variations
      for (const variation of variations) {
        const config = { ...baseConfig, ...variation };
        const tab = await this.createTab(config);
        tabs.push(tab);
      }
    }

    return tabs;
  }

  /**
   * Wait for tab to finish loading
   * @param {number} tabId - Tab ID to wait for
   * @param {number} timeout - Maximum wait time in ms
   */
  async waitForTabLoad(tabId, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkTab = async () => {
        try {
          const tab = await chrome.tabs.get(tabId);
          
          if (tab.status === 'complete') {
            resolve(tab);
            return;
          }
          
          if (Date.now() - startTime > timeout) {
            reject(new Error(`Tab ${tabId} did not load within ${timeout}ms`));
            return;
          }
          
          // Check again in 100ms
          setTimeout(checkTab, 100);
        } catch (error) {
          // Tab might have been closed
          reject(error);
        }
      };
      
      checkTab();
    });
  }

  /**
   * Set simulated age for a tab
   * @param {number} tabId - Tab ID
   * @param {string|number} age - Age like '2h', '30m', or milliseconds
   */
  async setTabAge(tabId, age) {
    const ageMs = this.parseAge(age);
    const now = Date.now();

    const timeData = {
      created: now - ageMs,
      lastActive: now - ageMs,
      lastAccessed: now - Math.min(ageMs / 2, 30 * 60 * 1000) // Accessed more recently
    };

    this.tabTimeData.set(tabId, timeData);
    console.log(`Setting tab ${tabId} age to ${age} (${ageMs}ms ago)`, timeData);

    // Notify background script about the simulated time
    const response = await chrome.runtime.sendMessage({
      action: 'setTestTabTime',
      tabId,
      timeData
    });

    if (!response?.success) {
      console.error('Failed to set test tab time:', response);
    }

    return timeData;
  }

  /**
   * Simulate tab navigation
   * @param {number} tabId - Tab to navigate
   * @param {string} url - New URL
   */
  async navigateTab(tabId, url) {
    await chrome.tabs.update(tabId, { url });
    await this.waitForTabLoad(tabId);
    
    // Update last accessed time
    const timeData = this.tabTimeData.get(tabId);
    if (timeData) {
      timeData.lastAccessed = Date.now();
    }
    
    return await chrome.tabs.get(tabId);
  }

  /**
   * Simulate tab activation
   * @param {number} tabId - Tab to activate
   */
  async activateTab(tabId) {
    await chrome.tabs.update(tabId, { active: true });
    
    // Update time data
    const timeData = this.tabTimeData.get(tabId);
    if (timeData) {
      const now = Date.now();
      timeData.lastActive = now;
      timeData.lastAccessed = now;
    }
    
    return await chrome.tabs.get(tabId);
  }

  /**
   * Create tabs that simulate being from specific origins
   * @param {object} config - Configuration with origin details
   */
  async createTabWithOrigin(config) {
    const { 
      url, 
      origin = 'direct',
      referrer = null,
      ...tabConfig 
    } = config;

    // First create the tab
    const tab = await this.createTab({ url, ...tabConfig });

    // Store origin information
    const metadata = this.tabMetadata.get(tab.id) || {};
    metadata.origin = origin;
    metadata.referrer = referrer || this.getDefaultReferrer(origin);
    this.tabMetadata.set(tab.id, metadata);

    // Notify background about the origin
    await chrome.runtime.sendMessage({
      action: 'setTestTabOrigin',
      tabId: tab.id,
      origin,
      referrer: metadata.referrer
    });

    return tab;
  }

  /**
   * Get default referrer for known origins
   */
  getDefaultReferrer(origin) {
    const referrers = {
      'gmail': 'https://mail.google.com/',
      'search': 'https://google.com/search?q=test',
      'reddit': 'https://reddit.com/r/test',
      'twitter': 'https://twitter.com/home',
      'slack': 'https://app.slack.com/client/test'
    };
    
    return referrers[origin] || null;
  }

  /**
   * Create duplicate tabs for testing deduplication
   * @param {string} baseUrl - Base URL to duplicate
   * @param {Array} variations - URL variations (with tracking params, etc)
   */
  async createDuplicateTabs(baseUrl, variations = []) {
    const tabs = [];

    // Create exact duplicate
    tabs.push(await this.createTab({ url: baseUrl }));

    // Create with variations
    for (const variation of variations) {
      const url = this.addUrlVariation(baseUrl, variation);
      tabs.push(await this.createTab({ url }));
    }

    // Create one more exact duplicate to ensure we have at least 2
    tabs.push(await this.createTab({ url: baseUrl }));

    return tabs;
  }

  /**
   * Add variation to URL
   */
  addUrlVariation(baseUrl, variation) {
    const url = new URL(baseUrl);
    
    if (variation.type === 'tracking') {
      // Add tracking parameters
      const trackingParams = ['utm_source=test', 'utm_medium=test', 'fbclid=123'];
      trackingParams.forEach(param => {
        const [key, value] = param.split('=');
        url.searchParams.set(key, value);
      });
    } else if (variation.type === 'fragment') {
      // Add URL fragment
      url.hash = '#section-' + Date.now();
    } else if (variation.type === 'query') {
      // Add query parameters
      url.searchParams.set('q', 'test-' + Date.now());
    }
    
    return url.toString();
  }

  /**
   * Parse age string to milliseconds
   */
  parseAge(age) {
    if (typeof age === 'number') return age;
    
    const units = {
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000
    };
    
    const match = age.match(/^(\d+)([smhd])$/);
    if (!match) return 0;
    
    const [, num, unit] = match;
    return parseInt(num) * units[unit];
  }

  /**
   * Get tab with all test metadata
   */
  async getTestTab(tabId) {
    const tab = await chrome.tabs.get(tabId);
    const timeData = this.tabTimeData.get(tabId);
    const metadata = this.tabMetadata.get(tabId);
    
    return {
      ...tab,
      timeData,
      metadata,
      testTab: true
    };
  }

  /**
   * Cleanup simulator data for a tab
   */
  cleanupTab(tabId) {
    this.tabTimeData.delete(tabId);
    this.tabMetadata.delete(tabId);
  }

  /**
   * Create tabs to simulate memory pressure
   * @param {number} count - Number of heavy tabs to create
   */
  async createMemoryPressure(count = 10) {
    const tabs = [];
    
    for (let i = 0; i < count; i++) {
      // Create tabs with data URLs containing large content
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB of data
      const dataUrl = `data:text/html,<html><body><script>var data="${largeContent}";</script><h1>Memory Test Tab ${i}</h1></body></html>`;
      
      const tab = await this.createTab({
        url: dataUrl,
        active: false
      });
      
      tabs.push(tab);
      
      // Small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return tabs;
  }

  /**
   * Simulate tab suspension
   * @param {number} tabId - Tab to suspend
   */
  async suspendTab(tabId) {
    // Chrome doesn't have a direct API to suspend tabs,
    // but we can simulate it by marking in metadata
    const metadata = this.tabMetadata.get(tabId) || {};
    metadata.suspended = true;
    metadata.suspendedAt = Date.now();
    this.tabMetadata.set(tabId, metadata);

    // Notify background
    await chrome.runtime.sendMessage({
      action: 'markTestTabSuspended',
      tabId
    });

    return metadata;
  }
}