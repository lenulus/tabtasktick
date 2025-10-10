// Assertions - Validates test outcomes and states

export class Assertions {
  constructor(testMode) {
    this.testMode = testMode;
    this.assertionTypes = this.initializeAssertionTypes();
  }

  /**
   * Initialize assertion type handlers
   */
  initializeAssertionTypes() {
    return {
      tabCount: this.assertTabCount.bind(this),
      tabExists: this.assertTabExists.bind(this),
      tabNotExists: this.assertTabNotExists.bind(this),
      tabSnoozed: this.assertTabSnoozed.bind(this),
      tabActive: this.assertTabActive.bind(this),
      groupExists: this.assertGroupExists.bind(this),
      groupNotExists: this.assertGroupNotExists.bind(this),
      ruleExecutions: this.assertRuleExecutions.bind(this),
      statistics: this.assertStatistics.bind(this),
      bookmarkCreated: this.assertBookmarkCreated.bind(this),
      memory: this.assertMemory.bind(this),
      performance: this.assertPerformance.bind(this),
      duplicatesFound: this.assertDuplicatesFound.bind(this),
      tabProperty: this.assertTabProperty.bind(this),
      ruleEnabled: this.assertRuleEnabled.bind(this),
      triggerScheduled: this.assertTriggerScheduled.bind(this),
      groupCount: this.assertGroupCount.bind(this),
      tabNotExists: this.assertTabNotExists.bind(this),
      bookmarkExists: this.assertBookmarkExists.bind(this),
      windowExists: this.assertWindowExists.bind(this),
      windowProperty: this.assertWindowProperty.bind(this),
      windowTabCount: this.assertWindowTabCount.bind(this)
    };
  }

  /**
   * Execute an assertion
   * @param {string} type - Assertion type
   * @param {object} params - Assertion parameters
   * @returns {object} Assertion result
   */
  async assert(type, params) {
    const assertionFunc = this.assertionTypes[type];
    if (!assertionFunc) {
      throw new Error(`Unknown assertion type: ${type}`);
    }

    try {
      const result = await assertionFunc(params);
      return {
        type,
        params,
        ...result,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        type,
        params,
        passed: false,
        message: error.message,
        error: true,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Assert tab count
   */
  async assertTabCount(params) {
    const { expected, url, windowId, condition = 'equals' } = params;
    
    // Build query
    const query = {};
    if (windowId !== undefined) {
      query.windowId = windowId === 'test' ? this.testMode.testWindow?.id : windowId;
    } else {
      query.windowId = this.testMode.testWindow?.id;
    }
    
    // Get tabs first, then filter by URL
    const tabs = await chrome.tabs.query(query);
    let filteredTabs = tabs;
    
    if (url) {
      // Filter tabs by URL substring
      filteredTabs = tabs.filter(tab => tab.url.includes(url));
    }
    
    const actual = filteredTabs.length;
    const passed = this.evaluateCondition(actual, expected, condition);

    return {
      passed,
      actual,
      expected,
      condition,
      message: passed 
        ? `Tab count ${condition} ${expected}` 
        : `Expected tab count ${condition} ${expected}, but got ${actual}`,
      tabs: filteredTabs.map(t => ({ id: t.id, url: t.url, title: t.title }))
    };
  }

  /**
   * Assert tab exists
   */
  async assertTabExists(params) {
    const { url, tabId, properties = {} } = params;
    
    let tab;
    
    if (tabId) {
      try {
        tab = await chrome.tabs.get(tabId);
      } catch (e) {
        return {
          passed: false,
          message: `Tab with ID ${tabId} does not exist`,
          actual: null
        };
      }
    } else if (url) {
      // Query ALL tabs across all windows for multi-window tests
      const tabs = await chrome.tabs.query({});
      // Filter by URL substring
      const matchingTabs = tabs.filter(t => t.url.includes(url));
      tab = matchingTabs[0];
    }

    if (!tab) {
      return {
        passed: false,
        message: `Tab not found with criteria: ${JSON.stringify(params)}`,
        actual: null
      };
    }

    // Check properties
    for (const [prop, expected] of Object.entries(properties)) {
      if (tab[prop] !== expected) {
        return {
          passed: false,
          message: `Tab property ${prop} is ${tab[prop]}, expected ${expected}`,
          actual: tab
        };
      }
    }

    return {
      passed: true,
      message: 'Tab exists with expected properties',
      actual: tab
    };
  }

  /**
   * Assert tab does not exist
   */
  async assertTabNotExists(params) {
    const exists = await this.assertTabExists(params);
    return {
      passed: !exists.passed,
      message: exists.passed 
        ? `Tab exists but was expected not to exist` 
        : 'Tab does not exist as expected',
      actual: exists.actual
    };
  }

  /**
   * Assert tab is snoozed
   */
  async assertTabSnoozed(params) {
    const { url, tabId } = params;
    
    // Check snoozed tabs
    const { snoozedTabs = [] } = await chrome.storage.local.get('snoozedTabs');
    const snoozedTab = snoozedTabs.find(t => {
      if (tabId && t.id === tabId) return true;
      if (url && t.url.includes(url)) return true;
      return false;
    });

    if (!snoozedTab) {
      // Also check if tab still exists (not properly snoozed)
      const exists = await this.assertTabExists({ url, tabId });
      if (exists.passed) {
        return {
          passed: false,
          message: 'Tab still exists and is not snoozed',
          actual: exists.actual
        };
      }
    }

    return {
      passed: !!snoozedTab,
      message: snoozedTab 
        ? 'Tab is snoozed' 
        : 'Tab is not in snoozed list',
      actual: snoozedTab
    };
  }

  /**
   * Assert tab is active (not snoozed)
   */
  async assertTabActive(params) {
    const snoozed = await this.assertTabSnoozed(params);
    const exists = await this.assertTabExists(params);
    
    return {
      passed: !snoozed.passed && exists.passed,
      message: exists.passed
        ? 'Tab is active'
        : 'Tab does not exist',
      actual: exists.actual
    };
  }

  /**
   * Assert group exists
   */
  async assertGroupExists(params) {
    const { title, tabCount, groupId, color } = params;
    
    const groups = await chrome.tabGroups.query({});
    let group;
    
    if (groupId) {
      group = groups.find(g => g.id === groupId);
    } else if (title) {
      group = groups.find(g => g.title === title);
    }

    if (!group) {
      return {
        passed: false,
        message: `Group not found with criteria: ${JSON.stringify(params)}`,
        actual: null,
        allGroups: groups
      };
    }

    // Check additional properties
    if (color && group.color !== color) {
      return {
        passed: false,
        message: `Group color is ${group.color}, expected ${color}`,
        actual: group
      };
    }

    // Check tab count
    if (tabCount !== undefined) {
      const tabs = await chrome.tabs.query({ groupId: group.id });
      const actualCount = tabs.length;
      
      if (actualCount !== tabCount) {
        return {
          passed: false,
          message: `Group has ${actualCount} tabs, expected ${tabCount}`,
          actual: group,
          tabs
        };
      }
    }

    return {
      passed: true,
      message: 'Group exists with expected properties',
      actual: group,
      groupId: group.id  // Return the group ID for later reference
    };
  }

  /**
   * Assert group does not exist
   */
  async assertGroupNotExists(params) {
    const exists = await this.assertGroupExists(params);
    return {
      passed: !exists.passed,
      message: exists.passed
        ? 'Group exists but was expected not to exist'
        : 'Group does not exist as expected',
      actual: exists.actual
    };
  }

  /**
   * Assert specific number of groups with given title exist
   */
  async assertGroupCount(params) {
    const { title, expected, count } = params;

    const groups = await chrome.tabGroups.query({});

    // If title is specified, count groups with that title
    // Otherwise, count total groups
    let actual, matchingGroups, expectedCount;

    if (title) {
      matchingGroups = groups.filter(g => g.title === title);
      actual = matchingGroups.length;
      expectedCount = expected || count;

      return {
        passed: actual === expectedCount,
        message: actual === expectedCount
          ? `Found expected ${expectedCount} group(s) with title '${title}'`
          : `Expected ${expectedCount} group(s) with title '${title}', but found ${actual}`,
        expected: expectedCount,
        actual,
        groups: matchingGroups.map(g => ({ id: g.id, title: g.title, tabCount: g.id }))
      };
    } else {
      // Total group count assertion
      actual = groups.length;
      expectedCount = count || expected;

      return {
        passed: actual === expectedCount,
        message: actual === expectedCount
          ? `Found expected ${expectedCount} total group(s)`
          : `Expected ${expectedCount} total group(s), but found ${actual}`,
        expected: expectedCount,
        actual,
        groups: groups.map(g => ({ id: g.id, title: g.title, color: g.color }))
      };
    }
  }

  /**
   * Assert tab does not exist
   */
  async assertTabNotExists(params) {
    const exists = await this.assertTabExists(params);
    return {
      passed: !exists.passed,
      message: exists.passed
        ? `Tab exists but was expected not to exist (url: ${params.url})`
        : `Tab does not exist as expected (url: ${params.url})`,
      actual: exists.actual
    };
  }

  /**
   * Assert bookmark exists
   */
  async assertBookmarkExists(params) {
    const { url, folder } = params;

    try {
      // Search for bookmarks with the given URL
      const bookmarks = await chrome.bookmarks.search({ url });

      if (!bookmarks || bookmarks.length === 0) {
        return {
          passed: false,
          message: `No bookmark found for URL: ${url}`,
          expected: { url, folder },
          actual: null
        };
      }

      // If folder is specified, check if bookmark is in that folder
      if (folder) {
        for (const bookmark of bookmarks) {
          // Get parent folder
          const parent = await chrome.bookmarks.get(bookmark.parentId);
          if (parent && parent[0] && parent[0].title === folder) {
            return {
              passed: true,
              message: `Bookmark found in folder '${folder}' for URL: ${url}`,
              actual: bookmark
            };
          }
        }

        return {
          passed: false,
          message: `Bookmark found but not in folder '${folder}' for URL: ${url}`,
          expected: { url, folder },
          actual: bookmarks[0]
        };
      }

      // Just check if bookmark exists regardless of folder
      return {
        passed: true,
        message: `Bookmark found for URL: ${url}`,
        actual: bookmarks[0]
      };
    } catch (error) {
      return {
        passed: false,
        message: `Error checking bookmark: ${error.message}`,
        error: true
      };
    }
  }

  /**
   * Assert rule executions
   */
  async assertRuleExecutions(params) {
    const { ruleId, count, minimum, maximum, condition = 'equals', timeWindow } = params;

    // Get execution history from test metrics
    const response = await chrome.runtime.sendMessage({
      action: 'getTestRuleExecutions',
      ruleId
    });

    let executions = response?.executions || [];

    // Filter by time window if specified
    if (timeWindow) {
      const cutoff = Date.now() - this.parseTimeWindow(timeWindow);
      executions = executions.filter(e => e.timestamp >= cutoff);
    }

    const actual = executions.length;

    // Determine the expected value and condition based on parameters
    let expectedValue, finalCondition, passed;

    if (minimum !== undefined) {
      expectedValue = minimum;
      finalCondition = 'greaterThanOrEqual';
      passed = actual >= minimum;
    } else if (maximum !== undefined) {
      expectedValue = maximum;
      finalCondition = 'lessThanOrEqual';
      passed = actual <= maximum;
    } else if (count !== undefined) {
      expectedValue = count;
      finalCondition = condition;
      passed = this.evaluateCondition(actual, count, condition);
    } else {
      // Default: at least 1 execution
      expectedValue = 1;
      finalCondition = 'greaterThanOrEqual';
      passed = actual >= 1;
    }

    return {
      passed,
      actual,
      expected: expectedValue,
      condition: finalCondition,
      message: passed
        ? `Rule ${ruleId} executed ${actual} times`
        : `Expected rule ${ruleId} to execute ${finalCondition} ${expectedValue} times, but executed ${actual} times`,
      executions
    };
  }

  /**
   * Assert statistics
   */
  async assertStatistics(params) {
    const { field, expected, condition = 'equals', minimum, maximum } = params;
    
    const stats = await chrome.runtime.sendMessage({ action: 'getStatistics' });
    const actual = this.getNestedValue(stats, field);

    if (minimum !== undefined && actual < minimum) {
      return {
        passed: false,
        actual,
        expected: `>= ${minimum}`,
        message: `${field} is ${actual}, expected at least ${minimum}`
      };
    }

    if (maximum !== undefined && actual > maximum) {
      return {
        passed: false,
        actual,
        expected: `<= ${maximum}`,
        message: `${field} is ${actual}, expected at most ${maximum}`
      };
    }

    if (expected !== undefined) {
      const passed = this.evaluateCondition(actual, expected, condition);
      return {
        passed,
        actual,
        expected,
        condition,
        message: passed
          ? `${field} ${condition} ${expected}`
          : `${field} is ${actual}, expected ${condition} ${expected}`
      };
    }

    return {
      passed: true,
      actual,
      message: `${field} is ${actual}`
    };
  }

  /**
   * Assert bookmark created
   */
  async assertBookmarkCreated(params) {
    const { count, folder, url } = params;
    
    // Search bookmarks
    let bookmarks;
    if (url) {
      bookmarks = await chrome.bookmarks.search({ url });
    } else {
      // Get recent bookmarks
      const tree = await chrome.bookmarks.getTree();
      bookmarks = this.flattenBookmarkTree(tree);
      
      // Filter by test time window (last 5 minutes)
      const cutoff = Date.now() - (5 * 60 * 1000);
      bookmarks = bookmarks.filter(b => b.dateAdded > cutoff);
    }

    // Filter by folder if specified
    if (folder && bookmarks.length > 0) {
      const folderBookmarks = [];
      for (const bookmark of bookmarks) {
        const parent = await chrome.bookmarks.get(bookmark.parentId);
        if (parent[0].title === folder) {
          folderBookmarks.push(bookmark);
        }
      }
      bookmarks = folderBookmarks;
    }

    const actual = bookmarks.length;
    const passed = count === undefined ? actual > 0 : actual === count;

    return {
      passed,
      actual,
      expected: count || 'any',
      message: passed
        ? `Found ${actual} bookmarks`
        : `Expected ${count || 'some'} bookmarks, found ${actual}`,
      bookmarks
    };
  }

  /**
   * Assert memory usage
   */
  async assertMemory(params) {
    const { maxUsage, condition = 'lessThan' } = params;
    
    let memoryUsage = 0;
    
    if (chrome.system?.memory) {
      const info = await chrome.system.memory.getInfo();
      memoryUsage = info.capacity - info.availableCapacity;
    } else if (performance.memory) {
      memoryUsage = performance.memory.usedJSHeapSize;
    }

    const passed = this.evaluateCondition(memoryUsage, maxUsage, condition);

    return {
      passed,
      actual: memoryUsage,
      expected: maxUsage,
      condition,
      message: passed
        ? `Memory usage ${condition} ${this.formatBytes(maxUsage)}`
        : `Memory usage is ${this.formatBytes(memoryUsage)}, expected ${condition} ${this.formatBytes(maxUsage)}`
    };
  }

  /**
   * Assert performance metrics
   */
  async assertPerformance(params) {
    const { metric, maxDuration, operation } = params;
    
    const metrics = await chrome.runtime.sendMessage({ 
      action: 'getPerformanceMetrics',
      metric,
      operation
    });

    const actual = metrics?.[metric] || 0;
    const passed = actual <= maxDuration;

    return {
      passed,
      actual,
      expected: maxDuration,
      message: passed
        ? `${operation || metric} completed in ${actual}ms`
        : `${operation || metric} took ${actual}ms, expected <= ${maxDuration}ms`,
      metrics
    };
  }

  /**
   * Assert duplicates found
   */
  async assertDuplicatesFound(params) {
    const { minGroups, minTotal, exactGroups } = params;
    
    const stats = await chrome.runtime.sendMessage({ action: 'getStatistics' });
    const duplicates = stats.duplicates || 0;
    
    // For detailed duplicate analysis
    const tabs = await chrome.tabs.query({ windowId: this.testMode.testWindow?.id });
    const response = await chrome.runtime.sendMessage({
      action: 'analyzeDuplicates',
      tabs
    });
    
    const duplicateGroups = response?.groups || [];
    const groupCount = duplicateGroups.length;

    let passed = true;
    let message = '';

    if (exactGroups !== undefined) {
      passed = groupCount === exactGroups;
      message = passed
        ? `Found exactly ${exactGroups} duplicate groups`
        : `Found ${groupCount} duplicate groups, expected ${exactGroups}`;
    } else if (minGroups !== undefined) {
      passed = groupCount >= minGroups;
      message = passed
        ? `Found ${groupCount} duplicate groups (>= ${minGroups})`
        : `Found ${groupCount} duplicate groups, expected at least ${minGroups}`;
    } else if (minTotal !== undefined) {
      passed = duplicates >= minTotal;
      message = passed
        ? `Found ${duplicates} duplicate tabs (>= ${minTotal})`
        : `Found ${duplicates} duplicate tabs, expected at least ${minTotal}`;
    }

    return {
      passed,
      actual: {
        totalDuplicates: duplicates,
        groupCount,
        groups: duplicateGroups
      },
      message
    };
  }

  /**
   * Assert tab property
   */
  async assertTabProperty(params) {
    const {
      tabId,
      url,
      property,
      expected,
      value,  // Alternative to expected for clarity
      condition = 'equals',
      count,  // Expected number of tabs with this property value
      minimum,  // Minimum number of tabs with this property value
      maximum  // Maximum number of tabs with this property value
    } = params;

    // Use value if provided, otherwise fall back to expected
    const expectedValue = value !== undefined ? value : expected;

    // Find the tab(s)
    let tabs = [];
    if (tabId) {
      const tab = await chrome.tabs.get(tabId);
      tabs = [tab];
    } else if (url) {
      const allTabs = await chrome.tabs.query({
        windowId: this.testMode.testWindow?.id
      });
      // Filter by URL substring
      tabs = allTabs.filter(t => t.url.includes(url));
    }

    if (tabs.length === 0) {
      return {
        passed: false,
        message: 'No tabs found matching criteria',
        actual: null
      };
    }

    // Check property value for each tab
    const matchingTabs = tabs.filter(tab => {
      const actual = this.getNestedValue(tab, property);
      return this.evaluateCondition(actual, expectedValue, condition);
    });

    // Determine if assertion passes based on count expectations
    let passed = false;
    let message = '';

    if (count !== undefined) {
      passed = matchingTabs.length === count;
      message = passed
        ? `${matchingTabs.length} tab(s) have ${property} = ${expectedValue}`
        : `Expected ${count} tab(s) with ${property} = ${expectedValue}, found ${matchingTabs.length}`;
    } else if (minimum !== undefined || maximum !== undefined) {
      if (minimum !== undefined && maximum !== undefined) {
        passed = matchingTabs.length >= minimum && matchingTabs.length <= maximum;
        message = passed
          ? `${matchingTabs.length} tab(s) have ${property} = ${expectedValue}`
          : `Expected ${minimum}-${maximum} tab(s) with ${property} = ${expectedValue}, found ${matchingTabs.length}`;
      } else if (minimum !== undefined) {
        passed = matchingTabs.length >= minimum;
        message = passed
          ? `${matchingTabs.length} tab(s) have ${property} = ${expectedValue}`
          : `Expected at least ${minimum} tab(s) with ${property} = ${expectedValue}, found ${matchingTabs.length}`;
      } else {
        passed = matchingTabs.length <= maximum;
        message = passed
          ? `${matchingTabs.length} tab(s) have ${property} = ${expectedValue}`
          : `Expected at most ${maximum} tab(s) with ${property} = ${expectedValue}, found ${matchingTabs.length}`;
      }
    } else {
      // Default: all matching tabs should have the property value
      passed = matchingTabs.length === tabs.length;
      const actual = tabs[0] ? this.getNestedValue(tabs[0], property) : null;
      message = passed
        ? `Tab property ${property} = ${expectedValue}`
        : `Expected ${property} = ${expectedValue}, got ${actual}`;
    }

    return {
      passed,
      actual: matchingTabs.length,
      expected: expectedValue,
      message,
      matchingCount: matchingTabs.length,
      totalCount: tabs.length
    };
  }

  /**
   * Assert rule is enabled/disabled
   */
  async assertRuleEnabled(params) {
    const { ruleId, enabled = true } = params;
    
    const response = await chrome.runtime.sendMessage({
      action: 'getRule',
      ruleId
    });

    if (!response.success || !response.rule) {
      return {
        passed: false,
        message: `Rule ${ruleId} not found`,
        actual: null
      };
    }

    const actual = response.rule.enabled;
    const passed = actual === enabled;

    return {
      passed,
      actual,
      expected: enabled,
      message: passed
        ? `Rule ${ruleId} is ${enabled ? 'enabled' : 'disabled'}`
        : `Rule ${ruleId} is ${actual ? 'enabled' : 'disabled'}, expected ${enabled ? 'enabled' : 'disabled'}`
    };
  }

  /**
   * Assert trigger is scheduled
   */
  async assertTriggerScheduled(params) {
    const { ruleId, triggerType, scheduled = true } = params;

    // First, try to resolve the actual rule ID if we were given a name
    const rulesResponse = await chrome.runtime.sendMessage({ action: 'getRules' });
    const rules = rulesResponse || [];
    const rule = rules.find(r => r.id === ruleId || r.name === ruleId);
    const actualRuleId = rule?.id || ruleId;

    const response = await chrome.runtime.sendMessage({
      action: 'getScheduledTriggers',
      ruleId: actualRuleId
    });

    const triggers = response?.triggers || [];
    const hasTrigger = triggers.some(t =>
      t.ruleId === actualRuleId &&
      (!triggerType || t.type === triggerType)
    );

    const passed = hasTrigger === scheduled;

    return {
      passed,
      message: passed
        ? `Trigger ${scheduled ? 'is' : 'is not'} scheduled for rule ${ruleId}`
        : `Expected trigger to be ${scheduled ? 'scheduled' : 'not scheduled'} for rule ${ruleId}`,
      triggers
    };
  }

  // Helper methods

  /**
   * Evaluate a condition
   */
  evaluateCondition(actual, expected, condition) {
    switch (condition) {
      case 'equals':
        return actual === expected;
      case 'notEquals':
        return actual !== expected;
      case 'greaterThan':
        return actual > expected;
      case 'greaterThanOrEquals':
        return actual >= expected;
      case 'lessThan':
        return actual < expected;
      case 'lessThanOrEquals':
        return actual <= expected;
      case 'contains':
        return String(actual).includes(String(expected));
      case 'notContains':
        return !String(actual).includes(String(expected));
      default:
        return actual === expected;
    }
  }

  /**
   * Get nested value from object
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, part) => current?.[part], obj);
  }

  /**
   * Parse time window string
   */
  parseTimeWindow(window) {
    const units = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000
    };
    
    const match = window.match(/^(\d+)([smhd])$/);
    if (!match) return 5 * 60 * 1000; // Default 5 minutes
    
    const [, num, unit] = match;
    return parseInt(num) * units[unit];
  }

  /**
   * Format bytes
   */
  formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  /**
   * Assert window exists
   */
  async assertWindowExists(params) {
    const { windowId } = params;
    const resolvedWindowId = windowId === 'test' ? this.testMode.testWindow?.id : windowId;

    if (!resolvedWindowId) {
      return {
        passed: false,
        message: 'Window ID not resolved (test window may not exist)'
      };
    }

    try {
      const window = await chrome.windows.get(resolvedWindowId);
      return {
        passed: true,
        message: `Window ${resolvedWindowId} exists`,
        actual: window
      };
    } catch (error) {
      return {
        passed: false,
        message: `Window ${resolvedWindowId} does not exist: ${error.message}`
      };
    }
  }

  /**
   * Assert window property has expected value
   */
  async assertWindowProperty(params) {
    const { windowId, property, value } = params;
    const resolvedWindowId = windowId === 'test' ? this.testMode.testWindow?.id : windowId;

    if (!resolvedWindowId) {
      return {
        passed: false,
        message: 'Window ID not resolved (test window may not exist)'
      };
    }

    try {
      const window = await chrome.windows.get(resolvedWindowId);
      const actualValue = this.getNestedProperty(window, property);
      const passed = actualValue === value;

      return {
        passed,
        actual: actualValue,
        expected: value,
        message: passed
          ? `Window ${resolvedWindowId} ${property} is ${value}`
          : `Window ${resolvedWindowId} ${property} is ${actualValue}, expected ${value}`
      };
    } catch (error) {
      return {
        passed: false,
        message: `Failed to check window property: ${error.message}`
      };
    }
  }

  /**
   * Assert window tab count
   */
  async assertWindowTabCount(params) {
    const { windowId, expected, minimum, maximum } = params;
    const resolvedWindowId = windowId === 'test' ? this.testMode.testWindow?.id : windowId;

    if (!resolvedWindowId) {
      return {
        passed: false,
        message: 'Window ID not resolved (test window may not exist)'
      };
    }

    try {
      const tabs = await chrome.tabs.query({ windowId: resolvedWindowId });
      const actual = tabs.length;

      let passed = true;
      let condition = '';

      if (expected !== undefined) {
        passed = actual === expected;
        condition = `equals ${expected}`;
      } else if (minimum !== undefined && maximum !== undefined) {
        passed = actual >= minimum && actual <= maximum;
        condition = `between ${minimum} and ${maximum}`;
      } else if (minimum !== undefined) {
        passed = actual >= minimum;
        condition = `>= ${minimum}`;
      } else if (maximum !== undefined) {
        passed = actual <= maximum;
        condition = `<= ${maximum}`;
      }

      return {
        passed,
        actual,
        expected: expected || { minimum, maximum },
        message: passed
          ? `Window ${resolvedWindowId} has ${actual} tabs (${condition})`
          : `Window ${resolvedWindowId} has ${actual} tabs, expected ${condition}`
      };
    } catch (error) {
      return {
        passed: false,
        message: `Failed to count window tabs: ${error.message}`
      };
    }
  }

  /**
   * Get nested property from object using dot notation
   */
  getNestedProperty(obj, path) {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  /**
   * Flatten bookmark tree
   */
  flattenBookmarkTree(nodes, bookmarks = []) {
    for (const node of nodes) {
      if (node.url) {
        bookmarks.push(node);
      }
      if (node.children) {
        this.flattenBookmarkTree(node.children, bookmarks);
      }
    }
    return bookmarks;
  }
}