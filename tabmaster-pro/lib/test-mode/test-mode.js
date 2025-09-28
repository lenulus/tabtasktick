// Test Mode - Core infrastructure for automated testing of the rules engine
// Provides safe, isolated environment for integration testing

import { TestRunner } from './test-runner.js';

export class TestMode {
  constructor() {
    this.isActive = false;
    this.testWindow = null;
    this.testTabIds = new Set();
    this.testRuleIds = new Set();
    this.testBookmarkIds = new Set(); // Track bookmarks created during tests
    this.testBookmarkFolders = new Set(); // Track bookmark folders created
    this.originalState = null;
    this.results = [];
    this.startTime = null;
    this.currentScenario = null;
    this.options = {
      headless: false,
      logLevel: 'info',
      outputPath: './test-results/',
      stopOnFailure: false,
      maxTabs: 500,
      timeout: 5 * 60 * 1000 // 5 minutes
    };

    // Logging callbacks
    this.onStepExecuted = null;
    this.onScenarioStarted = null;
    this.onScenarioCompleted = null;
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

    // Store test window ID in storage for reconnection
    await chrome.storage.local.set({
      testModeActive: true,
      testWindowId: this.testWindow.id
    });

    // Mark test mode as active
    this.isActive = true;

    console.log('Test mode initialized', this.options);
    return true;
  }

  /**
   * Reconnect to existing test mode
   */
  async reconnect() {
    const { testModeActive, testWindowId } = await chrome.storage.local.get(['testModeActive', 'testWindowId']);

    if (!testModeActive || !testWindowId) {
      throw new Error('No active test mode to reconnect to');
    }

    // Verify the test window still exists
    try {
      const window = await chrome.windows.get(testWindowId);
      this.testWindow = window;
      this.isActive = true;
      this.startTime = Date.now();

      // Restore original state from storage if available
      const { testOriginalState } = await chrome.storage.local.get('testOriginalState');
      if (testOriginalState) {
        this.originalState = testOriginalState;
      } else {
        // Capture it now if not stored
        await this.captureOriginalState();
      }

      console.log('Reconnected to test mode with window', testWindowId);
      return true;
    } catch (error) {
      // Window no longer exists
      console.log('Test window no longer exists, cleaning up');
      await chrome.storage.local.remove(['testModeActive', 'testWindowId', 'testOriginalState']);
      throw new Error('Test window no longer exists');
    }
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

    // Snapshot all existing bookmarks
    const bookmarkTree = await chrome.bookmarks.getTree();
    const bookmarkSnapshot = this.serializeBookmarkTree(bookmarkTree);

    this.originalState = {
      rules: rules.rules || [],
      settings: settings.settings || {},
      statistics: statistics.statistics || {},
      bookmarks: bookmarkSnapshot
    };

    // Store original state for reconnection
    await chrome.storage.local.set({ testOriginalState: this.originalState });

    console.log('Captured bookmark snapshot with', this.countBookmarks(bookmarkTree), 'bookmarks');
  }

  /**
   * Serialize bookmark tree for comparison
   */
  serializeBookmarkTree(nodes) {
    const serialized = [];
    for (const node of nodes) {
      const item = {
        id: node.id,
        title: node.title,
        url: node.url,
        parentId: node.parentId,
        index: node.index
      };
      if (node.children) {
        item.children = this.serializeBookmarkTree(node.children);
      }
      serialized.push(item);
    }
    return serialized;
  }

  /**
   * Count bookmarks in tree
   */
  countBookmarks(nodes) {
    let count = 0;
    for (const node of nodes) {
      if (node.url) count++;
      if (node.children) {
        count += this.countBookmarks(node.children);
      }
    }
    return count;
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
   * Get available test scenarios (for UI display)
   */
  async getAvailableScenarios() {
    const scenarios = await this.loadScenarios();
    return scenarios.map(s => ({
      name: s.name,
      description: s.description,
      stepCount: s.steps ? s.steps.length : 0
    }));
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
          // After closing duplicates, we should have:
          // - 1 example.com (the oldest/first one)
          // - 1 different.com (no duplicates)
          { action: 'assert', type: 'tabCount', expected: 1, url: 'example.com' },
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
          { action: 'assert', type: 'groupExists', title: 'github.com', tabCount: 5, captureAs: 'githubGroupId' },
          { action: 'assert', type: 'groupExists', title: 'stackoverflow.com', tabCount: 3, captureAs: 'stackGroupId' },
          { action: 'assert', type: 'groupNotExists', title: 'google.com' },

          // Cleanup: Remove the groups created during this test
          { action: 'deleteGroup', useCaptured: 'githubGroupId' },
          { action: 'deleteGroup', useCaptured: 'stackGroupId' }
        ]
      },
      {
        name: 'domain-grouping-reuse',
        description: 'Test that Group by Domain adds tabs to existing groups',
        steps: [
          // Create initial tabs and group them
          { action: 'createTab', url: 'https://github.com/repo1', count: 2 },
          { action: 'createTab', url: 'https://stackoverflow.com/q1', count: 2 },

          // Create rule and execute to create initial groups
          {
            action: 'createRule',
            rule: {
              name: 'Group by Domain Reuse',
              when: { all: [{ gte: ['tab.countPerOrigin:domain', 2] }] },
              then: [{ action: 'group', by: 'domain' }]
            }
          },

          { action: 'executeRule', ruleId: 'Group by Domain Reuse' },
          { action: 'wait', ms: 1000 },

          // Verify initial groups were created
          { action: 'assert', type: 'groupExists', title: 'github.com', tabCount: 2, captureAs: 'githubGroupId' },
          { action: 'assert', type: 'groupExists', title: 'stackoverflow.com', tabCount: 2, captureAs: 'stackGroupId' },
          { action: 'assert', type: 'groupCount', count: 2, message: 'Should have exactly 2 groups initially' },

          // Create new ungrouped tabs from same domains
          { action: 'createTab', url: 'https://github.com/repo3', count: 1 },
          { action: 'createTab', url: 'https://stackoverflow.com/q3', count: 2 },

          // Execute rule again - should add to existing groups, not create new ones
          { action: 'executeRule', ruleId: 'Group by Domain Reuse' },
          { action: 'wait', ms: 1000 },

          // Verify tabs were added to existing groups (not new groups created)
          { action: 'assert', type: 'groupExists', title: 'github.com', tabCount: 3, message: 'GitHub group should now have 3 tabs' },
          { action: 'assert', type: 'groupExists', title: 'stackoverflow.com', tabCount: 4, message: 'Stack Overflow group should now have 4 tabs' },
          { action: 'assert', type: 'groupCount', count: 2, message: 'Should still have exactly 2 groups (no duplicates created)' },

          // Cleanup: Remove the groups
          { action: 'deleteGroup', useCaptured: 'githubGroupId' },
          { action: 'deleteGroup', useCaptured: 'stackGroupId' }
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
          { action: 'assert', type: 'tabExists', url: 'recent-tab.com' },  // Should not be snoozed (< 1h old)
          { action: 'assert', type: 'tabExists', url: 'new-tab.com' },  // Should not be snoozed (brand new)
          { action: 'assert', type: 'tabCount', expected: 3 },  // 2 tabs + test window tab
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
          // Should bookmark: youtube/789 (not pinned, not muted) and github PR (> 1d old)
          { action: 'assert', type: 'bookmarkCreated', count: 2, folder: 'Test Bookmarks' }
          // Note: Can't verify exact URLs due to redirects (youtube adds www, docs.google redirects)
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
          { action: 'assert', type: 'groupExists', title: 'Triggered', tabCount: 3, captureAs: 'triggeredGroupId' },
          { action: 'assert', type: 'groupCount', title: 'Triggered', expected: 1 },  // Verify only ONE group created
          
          // Test scheduled trigger - create tab first, then rule
          { action: 'createTab', url: 'https://scheduled-test.com' },

          {
            action: 'createRule',
            rule: {
              name: 'Scheduled Rule',
              trigger: { once: 'FUTURE:5000' },  // Special marker for 5 seconds in future
              when: { all: [{ contains: ['tab.url', 'scheduled-test'] }] },
              then: [{ action: 'group', name: 'Scheduled Group' }]
            }
          },

          { action: 'wait', ms: 500 },  // Small wait to ensure trigger is saved
          { action: 'assert', type: 'triggerScheduled', ruleId: 'Scheduled Rule', triggerType: 'once' },
          { action: 'wait', ms: 5500 },  // Wait for scheduled trigger to fire (5s + buffer)
          { action: 'assert', type: 'groupExists', title: 'Scheduled Group', tabCount: 1, captureAs: 'scheduledGroupId' },
          { action: 'assert', type: 'groupCount', title: 'Scheduled Group', expected: 1 },  // Verify only ONE group created

          // Cleanup: Remove the groups created during this test
          { action: 'deleteGroup', useCaptured: 'triggeredGroupId' },
          { action: 'deleteGroup', useCaptured: 'scheduledGroupId' }
        ]
      },
      {
        name: 'tab-state-actions',
        description: 'Test pin, mute, and suspend actions',
        steps: [
          // Create various tabs for testing
          { action: 'createTab', url: 'https://important-doc.com', count: 2 },
          { action: 'createTab', url: 'https://video-site.com/watch', count: 2 },
          { action: 'createTab', url: 'https://news-site.com', count: 3 },
          { action: 'createTab', url: 'https://work-app.com', pinned: true },

          // Test PIN action
          {
            action: 'createRule',
            rule: {
              name: 'Pin Important Tabs',
              when: {
                all: [
                  { contains: ['tab.url', 'important'] },
                  { eq: ['tab.isPinned', false] }
                ]
              },
              then: [{ action: 'pin' }]
            }
          },
          { action: 'executeRule', ruleId: 'Pin Important Tabs' },
          { action: 'wait', ms: 500 },
          { action: 'assert', type: 'tabProperty', url: 'important-doc.com', property: 'pinned', value: true, count: 2 },

          // Test MUTE action
          {
            action: 'createRule',
            rule: {
              name: 'Mute Video Tabs',
              when: { contains: ['tab.url', 'video-site.com'] },
              then: [{ action: 'mute' }]
            }
          },
          { action: 'executeRule', ruleId: 'Mute Video Tabs' },
          { action: 'wait', ms: 500 },
          { action: 'assert', type: 'tabProperty', url: 'video-site.com', property: 'mutedInfo.muted', value: true, count: 2 },

          // Test UNMUTE action
          {
            action: 'createRule',
            rule: {
              name: 'Unmute Important',
              when: {
                all: [
                  { eq: ['tab.isMuted', true] },
                  { contains: ['tab.url', 'important'] }
                ]
              },
              then: [{ action: 'unmute' }]
            }
          },

          // Test SUSPEND action (using discard as Chrome's suspend mechanism)
          {
            action: 'createRule',
            rule: {
              name: 'Suspend News Tabs',
              when: {
                all: [
                  { contains: ['tab.url', 'news-site'] },
                  { eq: ['tab.isPinned', false] }
                ]
              },
              then: [{ action: 'suspend' }]
            }
          },
          { action: 'executeRule', ruleId: 'Suspend News Tabs' },
          { action: 'wait', ms: 1000 },
          { action: 'assert', type: 'tabProperty', url: 'news-site.com', property: 'discarded', value: true, minimum: 1 },

          // Test UNPIN action
          {
            action: 'createRule',
            rule: {
              name: 'Unpin Work Tabs',
              when: {
                all: [
                  { contains: ['tab.url', 'work-app'] },
                  { eq: ['tab.isPinned', true] }
                ]
              },
              then: [{ action: 'unpin' }]
            }
          },
          { action: 'executeRule', ruleId: 'Unpin Work Tabs' },
          { action: 'wait', ms: 500 },
          { action: 'assert', type: 'tabProperty', url: 'work-app.com', property: 'pinned', value: false }
        ]
      },
      {
        name: 'repeat-triggers',
        description: 'Test repeating trigger execution',
        steps: [
          // Create tabs for repeat testing
          { action: 'createTab', url: 'https://repeat-test.com/1' },
          { action: 'createTab', url: 'https://repeat-test.com/2' },
          { action: 'createTab', url: 'https://repeat-test.com/3' },

          // Create rule with repeat trigger (every 3 seconds)
          {
            action: 'createRule',
            rule: {
              name: 'Repeat Rule',
              trigger: { repeat: '3s' },  // Repeat every 3 seconds
              when: {
                all: [
                  { contains: ['tab.url', 'repeat-test'] },
                  { eq: ['tab.groupId', -1] }  // Not in a group
                ]
              },
              then: [{ action: 'group', name: 'Repeated Group' }]
            }
          },

          // First execution should happen immediately
          { action: 'wait', ms: 500 },
          { action: 'assert', type: 'ruleExecutions', ruleId: 'Repeat Rule', count: 1 },
          { action: 'assert', type: 'groupExists', title: 'Repeated Group', tabCount: 3, captureAs: 'repeatedGroupId' },

          // Ungroup tabs to test repeat
          { action: 'ungroupTabs', url: 'repeat-test.com' },
          { action: 'wait', ms: 3500 },  // Wait for next repeat (3s + buffer)
          { action: 'assert', type: 'ruleExecutions', ruleId: 'Repeat Rule', minimum: 2 },
          { action: 'assert', type: 'groupExists', title: 'Repeated Group', tabCount: 3 },

          // Ungroup again and wait for third execution
          { action: 'ungroupTabs', url: 'repeat-test.com' },
          { action: 'wait', ms: 3500 },  // Wait for another repeat
          { action: 'assert', type: 'ruleExecutions', ruleId: 'Repeat Rule', minimum: 3 },
          { action: 'assert', type: 'groupExists', title: 'Repeated Group', tabCount: 3 },

          // Clean up - remove the repeat rule to stop it
          { action: 'deleteRule', ruleId: 'Repeat Rule' },

          // Try to clean up the group we expect to exist
          // This will FAIL if multiple groups were created (exposing the bug)
          { action: 'deleteGroup', title: 'Repeated Group' }
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
    this.currentScenario = scenario.name;

    // Notify scenario started
    if (this.onScenarioStarted) {
      this.onScenarioStarted(scenario);
    }

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

        // Notify step executed
        if (this.onStepExecuted) {
          this.onStepExecuted(scenario, step, stepResult);
        }

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
      this.currentScenario = null;

      // Notify scenario completed
      if (this.onScenarioCompleted) {
        this.onScenarioCompleted(scenario, result);
      }
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

    const result = await this.testRunner.executeStep(step);

    // Track bookmarks if created
    if (step.action === 'bookmark' || (step.action === 'executeRule' && step.rule?.then?.some(a => a.action === 'bookmark'))) {
      // The background script should notify us about created bookmarks
      // For now, we'll track them in the assertions
    }

    return result;
  }

  /**
   * Register a test bookmark (kept for compatibility but not needed with snapshot approach)
   * @param {string} bookmarkId - ID of the created bookmark
   * @param {boolean} isFolder - Whether it's a folder
   */
  registerTestBookmark(bookmarkId, isFolder = false) {
    // No longer needed with snapshot approach, but kept for compatibility
    if (isFolder) {
      this.testBookmarkFolders.add(bookmarkId);
    } else {
      this.testBookmarkIds.add(bookmarkId);
    }
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

    // Clear any tab groups in the test window
    try {
      const groups = await chrome.tabGroups.query({ windowId: this.testWindow.id });
      for (const group of groups) {
        await chrome.tabGroups.update(group.id, { collapsed: false });
        // Ungroup all tabs in this group
        const groupTabs = await chrome.tabs.query({ groupId: group.id });
        if (groupTabs.length > 0) {
          await chrome.tabs.ungroup(groupTabs.map(t => t.id));
        }
      }
    } catch (error) {
      console.log('Error cleaning up tab groups:', error);
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
    // Clean up bookmarks created during this scenario
    await this.cleanupNewBookmarks();

    // Clean up any remaining test data
    // This is scenario-specific cleanup
  }

  /**
   * Clean up snoozed tabs created during tests
   */
  async cleanupSnoozedTabs() {
    try {
      // Define patterns that identify test tabs
      const testPatterns = [
        'old-tab-',
        'test-tab-',
        'trigger-test',
        'scheduled-test',
        'example.com'
      ];

      // Clear test snoozed tabs without recreating them
      const response = await chrome.runtime.sendMessage({
        action: 'clearTestSnoozedTabs',
        patterns: testPatterns
      });

      if (response.removedCount > 0) {
        console.log(`Cleaned up ${response.removedCount} test snoozed tabs`);
      } else {
        console.log('No test snoozed tabs to clean up');
      }
    } catch (error) {
      console.error('Error cleaning up snoozed tabs:', error);
    }
  }

  /**
   * Clean up bookmarks created since snapshot
   */
  async cleanupNewBookmarks() {
    if (!this.originalState?.bookmarks) {
      console.log('No bookmark snapshot available, skipping cleanup');
      return;
    }

    try {
      // Get current bookmark tree
      const currentTree = await chrome.bookmarks.getTree();

      // Find all bookmark IDs in original snapshot
      const originalIds = new Set();
      this.collectBookmarkIds(this.originalState.bookmarks, originalIds);

      // Find all current bookmark IDs
      const currentIds = [];
      this.collectBookmarkIdsFlat(currentTree, currentIds);

      // Remove any bookmarks not in original snapshot
      let removedCount = 0;
      for (const id of currentIds) {
        if (!originalIds.has(id) && id !== '0') { // Don't try to remove root
          try {
            // Check if it's a folder or bookmark
            const [bookmark] = await chrome.bookmarks.get(id);
            if (bookmark) {
              if (bookmark.url) {
                // It's a bookmark
                await chrome.bookmarks.remove(id);
                console.log(`Removed test bookmark: ${bookmark.title} (${id})`);
              } else {
                // It's a folder - use removeTree to remove folder and contents
                await chrome.bookmarks.removeTree(id);
                console.log(`Removed test folder: ${bookmark.title} (${id})`);
              }
              removedCount++;
            }
          } catch (e) {
            // Node might have been already removed as part of parent folder
            if (!e.message.includes('No node with id')) {
              console.log(`Could not remove bookmark ${id}:`, e.message);
            }
          }
        }
      }

      if (removedCount > 0) {
        console.log(`Cleaned up ${removedCount} test bookmarks/folders`);
      }

      // Clear tracking sets
      this.testBookmarkIds.clear();
      this.testBookmarkFolders.clear();

    } catch (error) {
      console.error('Error cleaning up bookmarks:', error);
    }
  }

  /**
   * Collect bookmark IDs from serialized tree
   */
  collectBookmarkIds(nodes, ids) {
    for (const node of nodes) {
      ids.add(node.id);
      if (node.children) {
        this.collectBookmarkIds(node.children, ids);
      }
    }
  }

  /**
   * Collect bookmark IDs from live tree (flat list)
   */
  collectBookmarkIdsFlat(nodes, ids) {
    for (const node of nodes) {
      ids.push(node.id);
      if (node.children) {
        this.collectBookmarkIdsFlat(node.children, ids);
      }
    }
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
      // First clean up any tab groups before removing the window
      if (this.testWindow) {
        try {
          const groups = await chrome.tabGroups.query({ windowId: this.testWindow.id });
          for (const group of groups) {
            // Ungroup all tabs in this group
            const groupTabs = await chrome.tabs.query({ groupId: group.id });
            if (groupTabs.length > 0) {
              await chrome.tabs.ungroup(groupTabs.map(t => t.id));
            }
          }
        } catch (error) {
          console.log('Error cleaning up tab groups:', error);
        }
      }

      // Remove all test tabs
      if (this.testWindow) {
        await chrome.windows.remove(this.testWindow.id);
        // Wait a bit to ensure the window and its tabs are fully removed
        // This prevents suspended tabs from reloading and triggering production rules
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Remove all test rules
      for (const ruleId of this.testRuleIds) {
        await this.removeTestRule(ruleId);
      }

      // Clean up all bookmarks created during tests
      await this.cleanupNewBookmarks();

      // Clean up all snoozed tabs created during tests
      await this.cleanupSnoozedTabs();

      // Restore original state
      if (this.originalState) {
        await chrome.storage.local.set({
          rules: this.originalState.rules,
          settings: this.originalState.settings,
          statistics: this.originalState.statistics
        });
      }

      // Clear test mode flags and data - do this LAST to prevent race conditions
      // The storage change listener will restore production rules when testModeActive is removed
      await chrome.storage.local.remove(['testModeActive', 'testWindowId', 'testOriginalState']);

    } catch (error) {
      console.error('Error during cleanup:', error);
    } finally {
      this.isActive = false;
      this.testWindow = null;
      this.testTabIds.clear();
      this.testRuleIds.clear();
      this.testBookmarkIds.clear();
      this.testBookmarkFolders.clear();
      this.currentScenario = null;
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