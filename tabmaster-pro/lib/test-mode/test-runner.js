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
  }

  /**
   * Initialize step executors
   */
  initializeExecutors() {
    return {
      createTab: this.executeCreateTab.bind(this),
      createRule: this.executeCreateRule.bind(this),
      executeRule: this.executeExecuteRule.bind(this),
      assert: this.executeAssert.bind(this),
      wait: this.executeWait.bind(this),
      deleteTab: this.executeDeleteTab.bind(this),
      updateTab: this.executeUpdateTab.bind(this),
      measurePerformance: this.executeMeasurePerformance.bind(this),
      captureState: this.executeCaptureState.bind(this)
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
   * Execute createTab step
   */
  async executeCreateTab(step) {
    const { url, count = 1, age, pinned = false, muted = false, active = false } = step;
    const tabIds = [];

    // Ensure test window exists and is valid
    if (!this.testMode.testWindow?.id) {
      throw new Error('Test window not initialized');
    }

    // Check if test window still exists
    try {
      await chrome.windows.get(this.testMode.testWindow.id);
    } catch (error) {
      // Window no longer exists, recreate it
      await this.testMode.createTestWindow();
    }

    for (let i = 0; i < count; i++) {
      const tab = await this.tabSimulator.createTab({
        url: url || `https://test-tab-${Date.now()}-${i}.example.com`,
        pinned,
        muted,
        active: active && i === 0, // Only first tab can be active
        windowId: this.testMode.testWindow.id
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

    const response = await chrome.runtime.sendMessage({
      action: 'executeRule',
      ruleId,
      testMode: true,
      dryRun
    });

    if (!response.success) {
      throw new Error(`Failed to execute rule: ${response.error}`);
    }

    const executionTime = performance.now() - startTime;
    this.recordMetric('ruleExecution', {
      ruleId,
      executionTime,
      matchCount: response.matchCount,
      actionCount: response.actionCount
    });

    return {
      ruleId,
      matches: response.matches,
      actions: response.actions,
      executionTime
    };
  }

  /**
   * Execute assert step
   */
  async executeAssert(step) {
    const { type, ...params } = step;
    
    const assertion = await this.assertions.assert(type, params);
    
    if (!assertion.passed) {
      throw new Error(`Assertion failed: ${assertion.message}`);
    }

    return assertion;
  }

  /**
   * Execute wait step
   */
  async executeWait(step) {
    const { ms = 1000 } = step;
    await this.wait(ms);
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
}