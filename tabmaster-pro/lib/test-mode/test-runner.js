// Test Runner - Orchestrates test execution and manages test lifecycle

import { TabSimulator } from './tab-simulator.js';
import { RuleBuilder } from './rule-builder.js';
import { Assertions } from './assertions.js';

export class TestRunner {
  constructor(testMode) {
    this.testMode = testMode;
    this.tabSimulator = new TabSimulator(testMode);
    this.ruleBuilder = new RuleBuilder(testMode);
    this.assertions = new Assertions(testMode);
    this.executors = this.initializeExecutors();
    this.metrics = {
      ruleExecutions: [],
      tabOperations: [],
      memorySnapshots: []
    };
    this.capturedData = {};  // Store captured IDs and data from assertions
    this.createdGroupIds = new Set();  // Track all groups created during this test run
  }

  /**
   * Initialize step executors
   */
  initializeExecutors() {
    return {
      createWindow: this.executeCreateWindow.bind(this),
      createTab: this.executeCreateTab.bind(this),
      createRule: this.executeCreateRule.bind(this),
      executeRule: this.executeExecuteRule.bind(this),
      assert: this.executeAssert.bind(this),
      wait: this.executeWait.bind(this),
      deleteTab: this.executeDeleteTab.bind(this),
      updateTab: this.executeUpdateTab.bind(this),
      measurePerformance: this.executeMeasurePerformance.bind(this),
      captureState: this.executeCaptureState.bind(this),
      ungroupTabs: this.executeUngroupTabs.bind(this),
      deleteRule: this.executeDeleteRule.bind(this),
      deleteGroup: this.executeDeleteGroup.bind(this),
      removeAllGroups: this.executeRemoveAllGroups.bind(this),
      removeTestGroups: this.executeRemoveTestGroups.bind(this)
    };
  }

  /**
   * Execute a test step
   * @param {object} step - Step configuration
   * @returns {object} Step result
   */
  async executeStep(step) {
    const startTime = Date.now();
    const result = {
      action: step.action,
      status: 'running',
      startTime,
      details: {},
      error: null
    };

    try {
      const executor = this.executors[step.action];
      if (!executor) {
        throw new Error(`Unknown step action: ${step.action}`);
      }

      const details = await executor(step);
      result.details = details;
      result.status = 'success';

    } catch (error) {
      console.error(`Step ${step.action} failed:`, error);
      result.status = 'failed';
      result.error = error.message;
      result.stack = error.stack;
    } finally {
      result.duration = Date.now() - startTime;
      result.endTime = Date.now();
    }

    return result;
  }

  /**
   * Execute createWindow step
   */
  async executeCreateWindow(step) {
    const {
      captureAs,
      state = 'normal',
      focused = false,
      left,
      top,
      width = 800,
      height = 600,
      type = 'normal'
    } = step;

    // Create the window
    const windowOptions = {
      state,
      focused,
      width,
      height,
      type
    };

    // Only set position if provided (Chrome will auto-position otherwise)
    if (left !== undefined) windowOptions.left = left;
    if (top !== undefined) windowOptions.top = top;

    const window = await chrome.windows.create(windowOptions);

    // Track this window as a test window
    if (!this.testMode.testWindowIds) {
      this.testMode.testWindowIds = new Set();
    }
    this.testMode.testWindowIds.add(window.id);

    // Capture window ID if requested
    if (captureAs) {
      this.capturedData[captureAs] = window.id;
    }

    console.log(`Created test window ${window.id} (${state}, ${type})`);

    return {
      windowId: window.id,
      state: window.state,
      type: window.type
    };
  }

  /**
   * Execute createTab step
   */
  async executeCreateTab(step) {
    const {
      url,
      count = 1,
      age,
      pinned = false,
      muted = false,
      active = false,
      windowId: specifiedWindowId,
      useCaptured
    } = step;
    const tabIds = [];

    // Determine which window to use
    let windowId;

    if (useCaptured) {
      // Use a captured window ID
      windowId = this.capturedData[useCaptured];
      if (!windowId) {
        throw new Error(`No captured window ID found for: ${useCaptured}`);
      }
    } else if (specifiedWindowId) {
      // Use explicitly specified window ID
      windowId = specifiedWindowId;
    } else {
      // Default to test window
      // Ensure test window exists and is valid
      if (!this.testMode.testWindow?.id) {
        // Try to create test window if it doesn't exist
        console.log('Test window not initialized, creating new window');
        await this.testMode.createTestWindow();

        if (!this.testMode.testWindow?.id) {
          throw new Error('Failed to create test window');
        }
      }

      // Check if test window still exists
      windowId = this.testMode.testWindow.id;
      try {
        await chrome.windows.get(windowId);
      } catch (error) {
        // Window no longer exists, recreate it
        console.log('Test window no longer exists, recreating');
        await this.testMode.createTestWindow();
        windowId = this.testMode.testWindow.id;

        if (!windowId) {
          throw new Error('Failed to recreate test window');
        }
      }
    }

    for (let i = 0; i < count; i++) {
      const tab = await this.tabSimulator.createTab({
        url: url || `https://test-tab-${Date.now()}-${i}.example.com`,
        pinned,
        muted,
        active: active && i === 0, // Only first tab can be active
        windowId: windowId
      });

      // Simulate age if specified
      if (age) {
        await this.tabSimulator.setTabAge(tab.id, age);
      }

      tabIds.push(tab.id);
      this.testMode.testTabIds.add(tab.id);

      // Small delay between tabs to avoid rate limiting
      if (i < count - 1) {
        await this.wait(50);
      }
    }

    this.recordMetric('tabOperation', {
      operation: 'create',
      count,
      duration: Date.now() - Date.now()
    });

    return { tabIds, count };
  }

  /**
   * Execute createRule step
   */
  async executeCreateRule(step) {
    const { rule } = step;

    // Build rule using RuleBuilder
    const builtRule = this.ruleBuilder.buildRule(rule);

    // If the rule contains bookmark actions, pre-create the folder
    // (This ensures the folder exists but snapshot/restore handles cleanup)
    if (builtRule.then) {
      for (const action of builtRule.then) {
        if (action.action === 'bookmark' && action.to) {
          try {
            const folders = await chrome.bookmarks.search({ title: action.to });
            if (folders.length === 0 || folders[0].url) {
              // Create the folder
              const folder = await chrome.bookmarks.create({
                title: action.to,
                parentId: '1' // Bookmarks bar
              });
              console.log(`Created test bookmark folder: ${action.to} (${folder.id})`);
            }
          } catch (e) {
            console.log(`Could not pre-create bookmark folder: ${e.message}`);
          }
        }
      }
    }

    // Send to background to create rule
    const response = await chrome.runtime.sendMessage({
      action: 'addRule',
      rule: builtRule
    });

    if (!response.success) {
      throw new Error(`Failed to create rule: ${response.error}`);
    }

    this.testMode.testRuleIds.add(response.ruleId);

    return {
      ruleId: response.ruleId,
      rule: builtRule
    };
  }

  /**
   * Execute executeRule step
   */
  async executeExecuteRule(step) {
    const { ruleId, dryRun = false } = step;
    const startTime = performance.now();

    console.log(`Executing rule ${ruleId}...`);

    // Get existing groups before execution
    const groupsBefore = await chrome.tabGroups.query({
      windowId: this.testMode.testWindow?.id
    });
    const groupIdsBefore = new Set(groupsBefore.map(g => g.id));

    const response = await chrome.runtime.sendMessage({
      action: 'executeRule',
      ruleId,
      testMode: true,
      dryRun
    });

    console.log(`Rule execution response:`, response);

    if (!response || !response.success) {
      const error = response?.error || 'No response from background';
      console.error(`Rule execution failed:`, error);
      throw new Error(`Failed to execute rule: ${error}`);
    }

    // Check for new groups after execution
    const groupsAfter = await chrome.tabGroups.query({
      windowId: this.testMode.testWindow?.id
    });

    for (const group of groupsAfter) {
      if (!groupIdsBefore.has(group.id)) {
        // This is a new group created by the rule
        this.createdGroupIds.add(group.id);
        console.log(`Tracked new group created by rule: ${group.id} (${group.title})`);
      }
    }

    const executionTime = performance.now() - startTime;
    this.recordMetric('ruleExecution', {
      ruleId,
      executionTime,
      matchCount: response.matchCount || 0,
      actionCount: response.actionCount || 0
    });

    return {
      ruleId,
      matches: response.matches || [],
      actions: response.actions || [],
      executionTime,
      matchCount: response.matchCount || 0,
      actionCount: response.actionCount || 0
    };
  }

  /**
   * Execute assert step
   */
  async executeAssert(step) {
    const { type, captureAs, useCaptured, ...params } = step;

    // Resolve captured window ID if useCaptured is specified
    if (useCaptured && params.windowId) {
      const capturedId = this.capturedData[params.windowId];
      if (!capturedId) {
        throw new Error(`No captured ID found for: ${params.windowId}`);
      }
      params.windowId = capturedId;
    }

    const assertion = await this.assertions.assert(type, params);

    if (!assertion.passed) {
      throw new Error(`Assertion failed: ${assertion.message}`);
    }

    // Store captured data for later reference
    if (assertion.groupId) {
      // Track this group as created during the test
      this.createdGroupIds.add(assertion.groupId);

      if (captureAs) {
        this.capturedData[captureAs] = assertion.groupId;
      }
    }

    return assertion;
  }

  /**
   * Execute wait step
   */
  async executeWait(step) {
    const { ms = 1000 } = step;

    // Get groups before waiting (for tracking delayed group creation)
    const groupsBefore = await chrome.tabGroups.query({
      windowId: this.testMode.testWindow?.id
    });
    const groupIdsBefore = new Set(groupsBefore.map(g => g.id));

    await this.wait(ms);

    // Check for new groups after waiting (could be from scheduled triggers)
    const groupsAfter = await chrome.tabGroups.query({
      windowId: this.testMode.testWindow?.id
    });

    for (const group of groupsAfter) {
      if (!groupIdsBefore.has(group.id)) {
        // This is a new group created during the wait (likely from a trigger)
        this.createdGroupIds.add(group.id);
        console.log(`Tracked new group created during wait: ${group.id} (${group.title})`);
      }
    }

    return { waited: ms };
  }

  /**
   * Execute deleteTab step
   */
  async executeDeleteTab(step) {
    const { tabId, url } = step;
    
    if (tabId) {
      await chrome.tabs.remove(tabId);
      this.testMode.testTabIds.delete(tabId);
      return { deletedTabId: tabId };
    } else if (url) {
      const tabs = await chrome.tabs.query({ 
        windowId: this.testMode.testWindow.id
      });
      
      // Filter by URL substring
      const matchingTabs = tabs.filter(t => t.url.includes(url));
      const tabIds = matchingTabs.map(t => t.id);
      
      if (tabIds.length > 0) {
        await chrome.tabs.remove(tabIds);
        tabIds.forEach(id => this.testMode.testTabIds.delete(id));
      }
      
      return { deletedTabIds: tabIds };
    }

    throw new Error('deleteTab requires either tabId or url');
  }

  /**
   * Execute updateTab step
   */
  async executeUpdateTab(step) {
    const { tabId, url, updates } = step;
    
    let targetTabId = tabId;
    
    if (!targetTabId && url) {
      const tabs = await chrome.tabs.query({ 
        windowId: this.testMode.testWindow.id
      });
      
      // Filter by URL substring
      const matchingTabs = tabs.filter(t => t.url.includes(url));
      
      if (matchingTabs.length === 0) {
        throw new Error(`No tab found with url: ${url}`);
      }
      targetTabId = matchingTabs[0].id;
    }

    if (!targetTabId) {
      throw new Error('updateTab requires either tabId or url');
    }

    const updatedTab = await chrome.tabs.update(targetTabId, updates);
    
    return {
      tabId: updatedTab.id,
      updates
    };
  }

  /**
   * Execute measurePerformance step
   */
  async executeMeasurePerformance(step) {
    const { operation, iterations = 1 } = step;
    const measurements = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      const startMemory = await this.getMemoryUsage();

      // Execute the operation
      if (operation.action) {
        await this.executeStep(operation);
      }

      const endTime = performance.now();
      const endMemory = await this.getMemoryUsage();

      measurements.push({
        iteration: i + 1,
        duration: endTime - startTime,
        memoryDelta: endMemory - startMemory
      });

      // Small delay between iterations
      if (i < iterations - 1) {
        await this.wait(100);
      }
    }

    const avgDuration = measurements.reduce((sum, m) => sum + m.duration, 0) / iterations;
    const avgMemoryDelta = measurements.reduce((sum, m) => sum + m.memoryDelta, 0) / iterations;

    return {
      operation: operation.action,
      iterations,
      avgDuration,
      avgMemoryDelta,
      measurements
    };
  }

  /**
   * Execute captureState step
   */
  async executeCaptureState(step) {
    const { name } = step;
    
    const state = {
      name,
      timestamp: Date.now(),
      tabs: await chrome.tabs.query({ windowId: this.testMode.testWindow.id }),
      rules: await this.getRules(),
      memory: await this.getMemoryUsage(),
      statistics: await chrome.runtime.sendMessage({ action: 'getStatistics' })
    };

    return state;
  }

  /**
   * Get current rules
   */
  async getRules() {
    const response = await chrome.runtime.sendMessage({ action: 'getRules' });
    return response.rules || [];
  }

  /**
   * Get memory usage
   */
  async getMemoryUsage() {
    if (chrome.system && chrome.system.memory) {
      const info = await chrome.system.memory.getInfo();
      return info.capacity - info.availableCapacity;
    }
    // Fallback to performance.memory if available
    if (performance.memory) {
      return performance.memory.usedJSHeapSize;
    }
    return 0;
  }

  /**
   * Wait for specified milliseconds
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute ungroupTabs step
   */
  async executeUngroupTabs(step) {
    const { url, groupId, tabId } = step;

    // Get tabs to ungroup
    let tabsToUngroup = [];

    if (tabId) {
      // Ungroup specific tab
      tabsToUngroup = [tabId];
    } else if (groupId) {
      // Ungroup all tabs in a specific group
      const tabs = await chrome.tabs.query({ groupId, windowId: this.testMode.testWindow.id });
      tabsToUngroup = tabs.map(t => t.id);
    } else if (url) {
      // Ungroup tabs matching URL pattern
      const tabs = await chrome.tabs.query({ windowId: this.testMode.testWindow.id });
      const matchingTabs = tabs.filter(t => t.url.includes(url) && t.groupId !== -1);
      tabsToUngroup = matchingTabs.map(t => t.id);
    } else {
      // Ungroup all tabs in test window
      const tabs = await chrome.tabs.query({ windowId: this.testMode.testWindow.id });
      const groupedTabs = tabs.filter(t => t.groupId !== -1);
      tabsToUngroup = groupedTabs.map(t => t.id);
    }

    // Ungroup the tabs
    if (tabsToUngroup.length > 0) {
      await chrome.tabs.ungroup(tabsToUngroup);
    }

    return {
      ungroupedCount: tabsToUngroup.length,
      tabIds: tabsToUngroup
    };
  }

  /**
   * Execute deleteRule step
   */
  async executeDeleteRule(step) {
    const { ruleId } = step;

    // First get the actual rule ID if we were given a name
    const rulesResponse = await chrome.runtime.sendMessage({ action: 'getRules' });
    const rules = rulesResponse || [];
    const rule = rules.find(r => r.id === ruleId || r.name === ruleId);

    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    // Delete the rule
    const response = await chrome.runtime.sendMessage({
      action: 'deleteRule',
      ruleId: rule.id
    });

    if (!response.success) {
      throw new Error(`Failed to delete rule: ${response.error}`);
    }

    // Remove from tracked test rules
    this.testMode.testRuleIds.delete(rule.id);

    return {
      deletedRuleId: rule.id,
      ruleName: rule.name
    };
  }

  /**
   * Record a metric
   */
  recordMetric(type, data) {
    this.metrics[type + 's'] = this.metrics[type + 's'] || [];
    this.metrics[type + 's'].push({
      timestamp: Date.now(),
      ...data
    });
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary() {
    const ruleExecutions = this.metrics.ruleExecutions || [];
    const tabOperations = this.metrics.tabOperations || [];

    return {
      ruleExecutions: {
        count: ruleExecutions.length,
        avgDuration: ruleExecutions.length > 0
          ? ruleExecutions.reduce((sum, r) => sum + r.executionTime, 0) / ruleExecutions.length
          : 0,
        totalMatches: ruleExecutions.reduce((sum, r) => sum + (r.matchCount || 0), 0),
        totalActions: ruleExecutions.reduce((sum, r) => sum + (r.actionCount || 0), 0)
      },
      tabOperations: {
        creates: tabOperations.filter(op => op.operation === 'create').length,
        totalTabsCreated: tabOperations
          .filter(op => op.operation === 'create')
          .reduce((sum, op) => sum + (op.count || 0), 0)
      }
    };
  }

  /**
   * Execute deleteGroup step
   */
  async executeDeleteGroup(step) {
    const { groupId, title, useCaptured } = step;

    // Use captured ID if specified
    let actualGroupId = groupId;
    if (useCaptured && this.capturedData[useCaptured]) {
      actualGroupId = this.capturedData[useCaptured];
    }

    // Find the group to delete
    const groups = await chrome.tabGroups.query({});
    let targetGroup;

    if (actualGroupId) {
      targetGroup = groups.find(g => g.id === actualGroupId);
    } else if (title) {
      targetGroup = groups.find(g => g.title === title);
    }

    if (!targetGroup) {
      throw new Error(`Group not found: ${actualGroupId || title}`);
    }

    // Get all tabs in this group
    const tabs = await chrome.tabs.query({ groupId: targetGroup.id });
    const tabIds = tabs.map(t => t.id);

    // Ungroup the tabs (which removes the group)
    if (tabIds.length > 0) {
      await chrome.tabs.ungroup(tabIds);
    }

    // Remove from our tracking set
    this.createdGroupIds.delete(targetGroup.id);

    return {
      deletedGroupId: targetGroup.id,
      groupTitle: targetGroup.title,
      ungroupedTabCount: tabIds.length
    };
  }

  /**
   * Execute removeAllGroups step - WARNING: removes ALL groups in window
   * @deprecated Use removeTestGroups instead for safer cleanup
   */
  async executeRemoveAllGroups(step) {
    const { windowId } = step;

    console.warn('removeAllGroups is deprecated - use removeTestGroups for safer cleanup');

    // Query groups in the specified window or test window
    const targetWindowId = windowId || this.testMode.testWindow?.id;

    if (!targetWindowId) {
      throw new Error('No window specified for removeAllGroups');
    }

    const groups = await chrome.tabGroups.query({ windowId: targetWindowId });
    let totalUngroupedTabs = 0;
    const removedGroups = [];

    for (const group of groups) {
      // Get all tabs in this group
      const tabs = await chrome.tabs.query({ groupId: group.id });
      const tabIds = tabs.map(t => t.id);

      // Ungroup the tabs
      if (tabIds.length > 0) {
        await chrome.tabs.ungroup(tabIds);
        totalUngroupedTabs += tabIds.length;
      }

      removedGroups.push({
        id: group.id,
        title: group.title,
        tabCount: tabIds.length
      });
    }

    return {
      removedGroupCount: removedGroups.length,
      totalUngroupedTabs,
      removedGroups
    };
  }

  /**
   * Execute removeTestGroups step - removes only groups created during this test
   */
  async executeRemoveTestGroups(step) {
    const { windowId, forceCleanAll } = step;

    // Query groups in the specified window or test window
    const targetWindowId = windowId || this.testMode.testWindow?.id;

    if (!targetWindowId) {
      throw new Error('No window specified for removeTestGroups');
    }

    // Get ALL groups in the test window
    const groups = await chrome.tabGroups.query({ windowId: targetWindowId });
    let totalUngroupedTabs = 0;
    const removedGroups = [];
    const skippedGroups = [];

    // If forceCleanAll is true, remove ALL groups in the test window
    // This is useful at the end of tests where tracking might have been lost
    const shouldRemoveAll = forceCleanAll || this.createdGroupIds.size === 0;

    for (const group of groups) {
      // Remove if we tracked this group OR if we're forcing cleanup of all test window groups
      if (this.createdGroupIds.has(group.id) || shouldRemoveAll) {
        // Get all tabs in this group
        const tabs = await chrome.tabs.query({ groupId: group.id });
        const tabIds = tabs.map(t => t.id);

        // Ungroup the tabs
        if (tabIds.length > 0) {
          await chrome.tabs.ungroup(tabIds);
          totalUngroupedTabs += tabIds.length;
        }

        removedGroups.push({
          id: group.id,
          title: group.title,
          tabCount: tabIds.length
        });

        // Remove from tracking
        this.createdGroupIds.delete(group.id);
      } else {
        skippedGroups.push({
          id: group.id,
          title: group.title
        });
      }
    }

    if (skippedGroups.length > 0 && !shouldRemoveAll) {
      console.log(`Skipped ${skippedGroups.length} groups not created by test:`,
        skippedGroups.map(g => g.title));
    }

    if (shouldRemoveAll && removedGroups.length > 0) {
      console.log(`Force cleaned ${removedGroups.length} groups from test window:`,
        removedGroups.map(g => g.title));
    }

    return {
      removedGroupCount: removedGroups.length,
      totalUngroupedTabs,
      removedGroups,
      skippedGroups,
      forceCleanedAll: shouldRemoveAll
    };
  }
}