// Test Mode - Core infrastructure for automated testing of the rules engine
// Provides safe, isolated environment for integration testing

import { TestRunner } from './test-runner.js';

export class TestMode {
  constructor() {
    this.isActive = false;
    this.testWindow = null;
    this.testTabIds = new Set();
    this.testRuleIds = new Set();
    this.originalState = null;
    this.results = [];
    this.startTime = null;
    this.options = {
      headless: false,
      logLevel: 'info',
      outputPath: './test-results/',
      stopOnFailure: false,
      maxTabs: 500,
      timeout: 5 * 60 * 1000 // 5 minutes
    };
  }

  /**
   * Initialize test mode
   * @param {object} options - Test mode options
   */
  async initialize(options = {}) {
    if (this.isActive) {
      throw new Error('Test mode is already active');
    }

    this.options = { ...this.options, ...options };
    this.startTime = Date.now();

    // Store original state for rollback
    await this.captureOriginalState();

    // Create isolated test window
    await this.createTestWindow();

    // Mark test mode as active
    this.isActive = true;
    await chrome.storage.local.set({ testModeActive: true });

    console.log('Test mode initialized', this.options);
    return true;
  }

  /**
   * Capture original state before tests
   */
  async captureOriginalState() {
    const [rules, settings, statistics] = await Promise.all([
      chrome.storage.local.get('rules'),
      chrome.storage.local.get('settings'),
      chrome.storage.local.get('statistics')
    ]);

    this.originalState = {
      rules: rules.rules || [],
      settings: settings.settings || {},
      statistics: statistics.statistics || {}
    };
  }

  /**
   * Create isolated test window
   */
  async createTestWindow() {
    this.testWindow = await chrome.windows.create({
      focused: !this.options.headless,
      width: 1200,
      height: 800,
      left: 100,
      top: 100,
      type: 'normal'
    });

    // Create initial tab with test mode indicator
    const [tab] = await chrome.tabs.query({ windowId: this.testWindow.id });
    await chrome.tabs.update(tab.id, {
      url: 'data:text/html,<h1>TabMaster Pro - Test Mode Active</h1><p>Do not close this window.</p>'
    });

    this.testTabIds.add(tab.id);
  }

  /**
   * Run all test scenarios
   */
  async runAll() {
    const scenarios = await this.loadScenarios();
    const results = {
      metadata: {
        timestamp: new Date().toISOString(),
        version: chrome.runtime.getManifest().version,
        browser: await this.getBrowserInfo(),
        duration: 0
      },
      scenarios: [],
      summary: {
        total: scenarios.length,
        passed: 0,
        failed: 0,
        skipped: 0
      },
      performance: {
        avgRuleExecutionTime: 0,
        peakMemoryUsage: 0,
        totalTabsCreated: 0,
        totalRulesExecuted: 0
      }
    };

    for (const scenario of scenarios) {
      if (!this.isActive) break;

      try {
        const scenarioResult = await this.runScenario(scenario);
        results.scenarios.push(scenarioResult);

        if (scenarioResult.status === 'passed') {
          results.summary.passed++;
        } else {
          results.summary.failed++;
          if (this.options.stopOnFailure) break;
        }
      } catch (error) {
        console.error(`Failed to run scenario ${scenario.name}:`, error);
        results.scenarios.push({
          name: scenario.name,
          status: 'error',
          error: error.message
        });
        results.summary.failed++;
        if (this.options.stopOnFailure) break;
      }
    }

    results.metadata.duration = Date.now() - this.startTime;
    results.performance = await this.collectPerformanceMetrics();

    return results;
  }

  /**
   * Run specific test scenarios
   * @param {Array<string>} scenarioNames - Names of scenarios to run
   */
  async runScenarios(scenarioNames) {
    const allScenarios = await this.loadScenarios();
    const scenarios = allScenarios.filter(s => scenarioNames.includes(s.name));
    
    if (scenarios.length === 0) {
      throw new Error(`No scenarios found matching: ${scenarioNames.join(', ')}`);
    }

    // Use runAll logic but with filtered scenarios
    const originalLoadScenarios = this.loadScenarios;
    this.loadScenarios = async () => scenarios;
    
    try {
      return await this.runAll();
    } finally {
      this.loadScenarios = originalLoadScenarios;
    }
  }

  /**
   * Load test scenarios
   */
  async loadScenarios() {
    // In a real implementation, these would be loaded from separate files
    // For now, return inline scenarios
    return [
      {
        name: 'duplicate-detection',
        description: 'Test duplicate tab detection and removal',
        steps: [
          // Create duplicate tabs
          { action: 'createTab', url: 'https://example.com', count: 3 },
          { action: 'createTab', url: 'https://example.com?utm_source=test', count: 2 },
          { action: 'createTab', url: 'https://example.com#section', count: 1 },
          { action: 'createTab', url: 'https://different.com', count: 1 },
          
          // Create rule to close duplicates
          { 
            action: 'createRule', 
            rule: {
              name: 'Close Duplicates',
              when: { all: [{ eq: ['tab.isDupe', true] }] },
              then: [{ action: 'close' }]
            }
          },
          
          // Execute and verify
          { action: 'executeRule', ruleId: 'Close Duplicates' },
          { action: 'wait', ms: 1000 },
          { action: 'assert', type: 'tabCount', expected: 2, url: 'example.com' },
          { action: 'assert', type: 'tabCount', expected: 1, url: 'different.com' },
          { action: 'assert', type: 'statistics', field: 'duplicatesRemoved', minimum: 4 }
        ]
      },
      {
        name: 'domain-grouping',
        description: 'Test grouping tabs by domain',
        steps: [
          // Create tabs from different domains
          { action: 'createTab', url: 'https://github.com/repo1', count: 3 },
          { action: 'createTab', url: 'https://github.com/repo2', count: 2 },
          { action: 'createTab', url: 'https://stackoverflow.com/questions/1', count: 2 },
          { action: 'createTab', url: 'https://stackoverflow.com/questions/2', count: 1 },
          { action: 'createTab', url: 'https://google.com', count: 1 },
          
          // Create and execute grouping rule
          { 
            action: 'createRule',
            rule: {
              name: 'Group by Domain',
              when: { all: [{ gte: ['tab.countPerOrigin:domain', 2] }] },
              then: [{ action: 'group', by: 'domain' }]
            }
          },
          
          { action: 'executeRule', ruleId: 'Group by Domain' },
          { action: 'wait', ms: 1000 },
          { action: 'assert', type: 'groupExists', title: 'github.com', tabCount: 5 },
          { action: 'assert', type: 'groupExists', title: 'stackoverflow.com', tabCount: 3 },
          { action: 'assert', type: 'groupNotExists', title: 'google.com' }
        ]
      },
      {
        name: 'time-based-rules',
        description: 'Test time-based conditions and triggers',
        steps: [
          // Create tabs with different ages
          { action: 'createTab', url: 'https://old-tab-1.com', age: '3h' },
          { action: 'createTab', url: 'https://old-tab-2.com', age: '2h' },
          { action: 'createTab', url: 'https://recent-tab.com', age: '5m' },
          { action: 'createTab', url: 'https://new-tab.com' },
          
          // Create rule for old tabs
          { 
            action: 'createRule',
            rule: {
              name: 'Snooze Old Tabs',
              when: { 
                all: [
                  { gt: ['tab.age', '1h'] },
                  { eq: ['tab.isPinned', false] }
                ]
              },
              then: [{ action: 'snooze', for: '2h' }]
            }
          },
          
          { action: 'executeRule', ruleId: 'Snooze Old Tabs' },
          { action: 'wait', ms: 1000 },
          { action: 'assert', type: 'tabSnoozed', url: 'old-tab-1.com' },
          { action: 'assert', type: 'tabSnoozed', url: 'old-tab-2.com' },
          { action: 'assert', type: 'tabActive', url: 'recent-tab.com' },
          { action: 'assert', type: 'tabActive', url: 'new-tab.com' },
          { action: 'assert', type: 'statistics', field: 'tabsSnoozed', minimum: 2 }
        ]
      },
      {
        name: 'complex-conditions',
        description: 'Test complex nested conditions',
        steps: [
          // Setup diverse tabs
          { action: 'createTab', url: 'https://youtube.com/watch?v=123', pinned: true },
          { action: 'createTab', url: 'https://youtube.com/watch?v=456', muted: true },
          { action: 'createTab', url: 'https://youtube.com/watch?v=789' },
          { action: 'createTab', url: 'https://docs.google.com/doc1' },
          { action: 'createTab', url: 'https://docs.google.com/doc2', muted: true },
          { action: 'createTab', url: 'https://github.com/user/repo/pull/123', age: '2d' },
          
          // Rule with nested conditions
          { 
            action: 'createRule',
            rule: {
              name: 'Complex Rule',
              when: {
                any: [
                  {
                    all: [
                      { contains: ['tab.url', 'youtube.com'] },
                      { eq: ['tab.isPinned', false] },
                      { eq: ['tab.isMuted', false] }
                    ]
                  },
                  {
                    all: [
                      { regex: ['tab.url', '/docs\\.google\\.com/'] },
                      { eq: ['tab.isMuted', false] }
                    ]
                  },
                  {
                    all: [
                      { regex: ['tab.url', '/github\\.com\\/.*\\/pull/'] },
                      { gt: ['tab.age', '1d'] }
                    ]
                  }
                ]
              },
              then: [{ action: 'bookmark', to: 'Test Bookmarks' }]
            }
          },
          
          { action: 'executeRule', ruleId: 'Complex Rule' },
          { action: 'wait', ms: 1000 },
          { action: 'assert', type: 'bookmarkCreated', count: 3, folder: 'Test Bookmarks' }
        ]
      },
      {
        name: 'trigger-mechanisms',
        description: 'Test immediate, repeat, and once triggers',
        steps: [
          // Test immediate triggers with debouncing
          { 
            action: 'createRule',
            rule: {
              name: 'Immediate Trigger',
              trigger: { immediate: true, debounce: '2s' },
              when: { all: [{ contains: ['tab.url', 'trigger-test'] }] },
              then: [{ action: 'group', name: 'Triggered' }]
            }
          },
          
          // Rapid tab creation to test debounce
          { action: 'createTab', url: 'https://trigger-test.com/1' },
          { action: 'wait', ms: 500 },
          { action: 'createTab', url: 'https://trigger-test.com/2' },
          { action: 'wait', ms: 500 },
          { action: 'createTab', url: 'https://trigger-test.com/3' },
          { action: 'wait', ms: 3000 },  // Wait for debounce to expire
          
          { action: 'assert', type: 'ruleExecutions', ruleId: 'Immediate Trigger', count: 1 },
          { action: 'assert', type: 'groupExists', title: 'Triggered', tabCount: 3 },
          
          // Test scheduled trigger
          { 
            action: 'createRule',
            rule: {
              name: 'Scheduled Rule',
              trigger: { once: new Date(Date.now() + 2000).toISOString() },
              when: { all: [{ contains: ['tab.url', 'scheduled-test'] }] },
              then: [{ action: 'group', name: 'Scheduled Group' }]
            }
          },
          
          { action: 'createTab', url: 'https://scheduled-test.com' },
          { action: 'assert', type: 'triggerScheduled', ruleId: 'Scheduled Rule', triggerType: 'once' },
          { action: 'wait', ms: 3000 },  // Wait for scheduled execution
          { action: 'assert', type: 'groupExists', title: 'Scheduled Group' }
        ]
      }
    ];
  }

  /**
   * Run a single scenario
   * @param {object} scenario - Scenario to run
   */
  async runScenario(scenario) {
    console.log(`Running scenario: ${scenario.name}`);
    const result = {
      name: scenario.name,
      description: scenario.description,
      status: 'running',
      duration: 0,
      steps: [],
      assertions: []
    };

    const scenarioStart = Date.now();

    try {
      // Setup phase
      await this.setupScenario(scenario);

      // Execute steps
      for (const step of scenario.steps) {
        const stepResult = await this.executeStep(step);
        result.steps.push(stepResult);

        if (stepResult.status === 'failed' && this.options.stopOnFailure) {
          result.status = 'failed';
          break;
        }
      }

      // Determine overall status
      if (result.status !== 'failed') {
        result.status = result.steps.every(s => s.status === 'success') ? 'passed' : 'failed';
      }

    } catch (error) {
      console.error(`Scenario ${scenario.name} failed:`, error);
      result.status = 'error';
      result.error = error.message;
    } finally {
      // Cleanup phase
      await this.cleanupScenario(scenario);
      result.duration = Date.now() - scenarioStart;
    }

    return result;
  }

  /**
   * Execute a single test step
   * @param {object} step - Step to execute
   */
  async executeStep(step) {
    // Initialize test runner if not already done
    if (!this.testRunner) {
      this.testRunner = new TestRunner(this);
    }
    
    return await this.testRunner.executeStep(step);
  }

  /**
   * Setup for a scenario
   */
  async setupScenario(scenario) {
    // Clear any existing test tabs (except the indicator tab)
    const tabs = await chrome.tabs.query({ windowId: this.testWindow.id });
    const indicatorTab = tabs.find(t => t.url.includes('Test Mode Active'));
    
    for (const tab of tabs) {
      if (tab.id !== indicatorTab?.id) {
        await chrome.tabs.remove(tab.id);
        this.testTabIds.delete(tab.id);
      }
    }

    // Clear test rules
    for (const ruleId of this.testRuleIds) {
      await this.removeTestRule(ruleId);
    }
    this.testRuleIds.clear();
  }

  /**
   * Cleanup after a scenario
   */
  async cleanupScenario(scenario) {
    // Scenario-specific cleanup if needed
  }

  /**
   * Remove a test rule
   */
  async removeTestRule(ruleId) {
    await chrome.runtime.sendMessage({
      action: 'deleteRule',
      ruleId
    });
  }

  /**
   * Collect performance metrics
   */
  async collectPerformanceMetrics() {
    const metrics = {
      avgRuleExecutionTime: 0,
      peakMemoryUsage: 0,
      totalTabsCreated: this.testTabIds.size,
      totalRulesExecuted: 0
    };

    // Get memory usage
    if (chrome.system && chrome.system.memory) {
      const memInfo = await chrome.system.memory.getInfo();
      metrics.peakMemoryUsage = memInfo.capacity - memInfo.availableCapacity;
    }

    // Get rule execution metrics from background
    try {
      const stats = await chrome.runtime.sendMessage({ action: 'getTestMetrics' });
      if (stats) {
        metrics.avgRuleExecutionTime = stats.avgExecutionTime || 0;
        metrics.totalRulesExecuted = stats.totalExecutions || 0;
      }
    } catch (error) {
      console.warn('Failed to get test metrics:', error);
    }

    return metrics;
  }

  /**
   * Get browser info
   */
  async getBrowserInfo() {
    const manifest = chrome.runtime.getManifest();
    const userAgent = navigator.userAgent;
    const chromeMatch = userAgent.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
    
    return {
      name: 'Chrome',
      version: chromeMatch ? chromeMatch[1] : 'Unknown',
      extension: manifest.name,
      extensionVersion: manifest.version
    };
  }

  /**
   * Download test results
   */
  downloadResults(results) {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `test-results-${timestamp}.json`;

    chrome.downloads.download({
      url,
      filename: `${this.options.outputPath}${filename}`,
      saveAs: false
    });

    URL.revokeObjectURL(url);
  }

  /**
   * Cleanup and restore original state
   */
  async cleanup() {
    if (!this.isActive) return;

    console.log('Cleaning up test mode...');

    try {
      // Remove all test tabs
      if (this.testWindow) {
        await chrome.windows.remove(this.testWindow.id);
      }

      // Remove all test rules
      for (const ruleId of this.testRuleIds) {
        await this.removeTestRule(ruleId);
      }

      // Restore original state
      if (this.originalState) {
        await chrome.storage.local.set({
          rules: this.originalState.rules,
          settings: this.originalState.settings,
          statistics: this.originalState.statistics
        });
      }

      // Clear test mode flag
      await chrome.storage.local.remove('testModeActive');

    } catch (error) {
      console.error('Error during cleanup:', error);
    } finally {
      this.isActive = false;
      this.testWindow = null;
      this.testTabIds.clear();
      this.testRuleIds.clear();
    }

    console.log('Test mode cleanup complete');
  }

  /**
   * Check if test mode is active
   */
  static async isActive() {
    const { testModeActive } = await chrome.storage.local.get('testModeActive');
    return !!testModeActive;
  }
}