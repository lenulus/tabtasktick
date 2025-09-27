# Puppeteer Test Automation Plan for TabMaster Pro

## Overview

This document outlines the changes needed to enable Puppeteer automation for the TabMaster Pro test suite, enabling an automated test/debug/fix cycle.

## 1. Expose Test Mode API to Puppeteer

Create a content script that exposes test functions to the page context:

```javascript
// lib/test-mode/test-bridge.js
window.tabMasterTest = {
  startTestMode: async () => {
    return await chrome.runtime.sendMessage({ action: 'startTestMode' });
  },
  
  runScenario: async (scenarioName) => {
    return await chrome.runtime.sendMessage({ 
      action: 'runTestScenario', 
      scenario: scenarioName 
    });
  },
  
  runAllTests: async () => {
    return await chrome.runtime.sendMessage({ action: 'runAllTests' });
  },
  
  getTestResults: async () => {
    return await chrome.runtime.sendMessage({ action: 'getTestResults' });
  },
  
  getTestLogs: async () => {
    return await chrome.runtime.sendMessage({ action: 'getTestLogs' });
  },
  
  getScenarioLogs: async (scenarioName) => {
    return await chrome.runtime.sendMessage({ 
      action: 'getScenarioLogs',
      scenario: scenarioName
    });
  },
  
  cleanup: async () => {
    return await chrome.runtime.sendMessage({ action: 'cleanupTestMode' });
  }
};
```

## 2. Headless-Friendly Test Mode

Modify `test-mode.js` to support headless operation:

```javascript
// Add to TestMode class
async initializeHeadless(options = {}) {
  this.headlessMode = true;
  this.options = { 
    ...this.options, 
    ...options,
    headless: true,
    suppressUI: true 
  };
  
  // Skip window creation in headless mode
  if (!this.headlessMode) {
    await this.createTestWindow();
  }
  
  // Initialize without UI
  this.isActive = true;
  await chrome.storage.local.set({ testModeActive: true });
  
  return { success: true, message: 'Test mode initialized (headless)' };
}

// Add method to get structured logs
getStructuredLogs() {
  return {
    all: this.logs,
    byScenario: this.logsByScenario,
    errors: this.logs.filter(log => log.level === 'error'),
    warnings: this.logs.filter(log => log.level === 'warning'),
    performance: this.performanceLogs
  };
}
```

## 3. Background Script Message Handlers

Add handlers for Puppeteer commands in `background-integrated.js`:

```javascript
// Add global test mode instance
let globalTestMode = null;

// Add to message handler switch statement
case 'startTestMode':
  if (!globalTestMode) {
    const { TestMode } = await import('./lib/test-mode/test-mode.js');
    globalTestMode = new TestMode();
    await globalTestMode.initializeHeadless(request.options);
  }
  sendResponse({ success: true });
  break;

case 'runTestScenario':
  if (!globalTestMode) {
    sendResponse({ error: 'Test mode not initialized' });
    break;
  }
  const scenarioResults = await globalTestMode.runScenarios([request.scenario]);
  sendResponse(scenarioResults);
  break;

case 'runAllTests':
  if (!globalTestMode) {
    sendResponse({ error: 'Test mode not initialized' });
    break;
  }
  const allResults = await globalTestMode.runAll();
  sendResponse(allResults);
  break;

case 'getTestResults':
  sendResponse(globalTestMode?.lastResults || null);
  break;

case 'getTestLogs':
  sendResponse(globalTestMode?.getStructuredLogs() || null);
  break;

case 'getScenarioLogs':
  const logs = globalTestMode?.logsByScenario?.[request.scenario] || [];
  sendResponse(logs);
  break;

case 'cleanupTestMode':
  if (globalTestMode) {
    await globalTestMode.cleanup();
    globalTestMode = null;
  }
  sendResponse({ success: true });
  break;
```

## 4. Puppeteer Test Runner

Create a Puppeteer script to automate testing:

```javascript
// test-automation/run-tests.js
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;

class ExtensionTestRunner {
  constructor(extensionPath) {
    this.extensionPath = extensionPath;
    this.browser = null;
    this.page = null;
    this.extensionId = null;
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: false, // Extensions require headed mode
      args: [
        `--disable-extensions-except=${this.extensionPath}`,
        `--load-extension=${this.extensionPath}`,
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });

    // Get extension ID
    const targets = await this.browser.targets();
    const extensionTarget = targets.find(target => 
      target.type() === 'service_worker' && 
      target.url().includes('chrome-extension://')
    );
    
    if (!extensionTarget) {
      throw new Error('Extension service worker not found');
    }
    
    this.extensionId = extensionTarget.url().split('/')[2];
    console.log(`Extension ID: ${this.extensionId}`);

    // Open test page
    this.page = await this.browser.newPage();
    await this.page.goto(`chrome-extension://${this.extensionId}/test-panel/test-panel.html`);
    
    // Inject test bridge
    await this.page.addScriptTag({
      path: path.join(this.extensionPath, 'lib/test-mode/test-bridge.js')
    });
  }

  async runAllTests() {
    // Initialize test mode
    console.log('Initializing test mode...');
    const initResult = await this.page.evaluate(() => {
      return window.tabMasterTest.startTestMode();
    });
    
    if (!initResult.success) {
      throw new Error('Failed to initialize test mode');
    }

    // Run all tests
    console.log('Running all test scenarios...');
    const results = await this.page.evaluate(() => {
      return window.tabMasterTest.runAllTests();
    });

    return results;
  }

  async runScenario(scenarioName) {
    const result = await this.page.evaluate((name) => {
      return window.tabMasterTest.runScenario(name);
    }, scenarioName);

    return result;
  }

  async analyzeFailures(results) {
    const failures = [];
    
    for (const scenario of results.scenarios) {
      if (scenario.status === 'failed') {
        const logs = await this.page.evaluate((name) => {
          return window.tabMasterTest.getScenarioLogs(name);
        }, scenario.name);

        failures.push({
          scenario: scenario.name,
          error: scenario.error,
          failedSteps: scenario.steps?.filter(s => s.status === 'failed') || [],
          logs: logs.filter(l => l.level === 'error')
        });
      }
    }

    return failures;
  }

  async generateReport(results, failures) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: results.summary,
      performance: results.performance,
      failures: failures,
      passed: results.summary.failed === 0
    };

    // Save report
    await fs.writeFile(
      path.join(__dirname, 'test-results.json'),
      JSON.stringify(report, null, 2)
    );

    // Generate markdown report
    let markdown = `# Test Results - ${report.timestamp}\n\n`;
    markdown += `## Summary\n`;
    markdown += `- Total: ${report.summary.total}\n`;
    markdown += `- Passed: ${report.summary.passed}\n`;
    markdown += `- Failed: ${report.summary.failed}\n\n`;

    if (failures.length > 0) {
      markdown += `## Failures\n\n`;
      for (const failure of failures) {
        markdown += `### ${failure.scenario}\n`;
        markdown += `Error: ${failure.error}\n\n`;
        
        if (failure.failedSteps.length > 0) {
          markdown += `Failed Steps:\n`;
          failure.failedSteps.forEach(step => {
            markdown += `- ${step.action}: ${step.error}\n`;
          });
          markdown += '\n';
        }
      }
    }

    await fs.writeFile(
      path.join(__dirname, 'test-report.md'),
      markdown
    );

    return report;
  }

  async cleanup() {
    if (this.page) {
      await this.page.evaluate(() => window.tabMasterTest.cleanup());
    }
    
    if (this.browser) {
      await this.browser.close();
    }
  }

  async runWithRetry(maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`\nAttempt ${attempt}/${maxRetries}`);
        
        await this.initialize();
        const results = await this.runAllTests();
        
        if (results.summary.failed > 0) {
          const failures = await this.analyzeFailures(results);
          const report = await this.generateReport(results, failures);
          
          console.error(`\n❌ ${results.summary.failed} tests failed`);
          failures.forEach(f => {
            console.error(`  - ${f.scenario}: ${f.error}`);
          });
          
          if (attempt < maxRetries) {
            console.log('\nRetrying...');
            await this.cleanup();
            continue;
          }
        } else {
          console.log(`\n✅ All ${results.summary.total} tests passed!`);
          await this.generateReport(results, []);
          await this.cleanup();
          return true;
        }
      } catch (error) {
        console.error(`\nAttempt ${attempt} error:`, error);
        
        if (attempt === maxRetries) {
          throw error;
        }
      } finally {
        await this.cleanup();
      }
    }

    return false;
  }
}

// Main execution
async function main() {
  const extensionPath = path.join(__dirname, '../');
  const runner = new ExtensionTestRunner(extensionPath);
  
  try {
    const success = await runner.runWithRetry();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = ExtensionTestRunner;
```

## 5. Enhanced Test Result Format

Make results more machine-readable in `test-mode.js`:

```javascript
// Add to TestMode class
formatResultsForAutomation(results) {
  return {
    ...results,
    machineFormat: {
      passed: results.summary.passed === results.summary.total,
      failedScenarios: results.scenarios
        .filter(s => s.status === 'failed')
        .map(s => ({
          name: s.name,
          error: s.error,
          failedSteps: s.steps?.filter(st => st.status === 'failed').map(st => ({
            action: st.action,
            error: st.error,
            details: st.details
          })) || []
        })),
      performanceIssues: this.detectPerformanceIssues(results.performance),
      timestamp: results.metadata.timestamp,
      duration: results.metadata.duration
    }
  };
}

detectPerformanceIssues(performance) {
  const thresholds = {
    avgRuleExecutionTime: 100, // ms
    peakMemoryUsage: 50 * 1024 * 1024, // 50MB
    totalTabsCreated: 500
  };

  const issues = [];
  
  Object.entries(performance).forEach(([metric, value]) => {
    if (thresholds[metric] && value > thresholds[metric]) {
      issues.push({
        metric,
        value,
        threshold: thresholds[metric],
        severity: value > thresholds[metric] * 2 ? 'high' : 'medium'
      });
    }
  });

  return issues;
}
```

## 6. CI/CD Integration

### Package.json Scripts

```json
{
  "name": "tabmaster-pro-tests",
  "version": "1.0.0",
  "scripts": {
    "test": "node test-automation/run-tests.js",
    "test:watch": "nodemon test-automation/run-tests.js",
    "test:scenario": "node test-automation/run-tests.js --scenario",
    "test:debug": "node --inspect-brk test-automation/run-tests.js",
    "test:ci": "xvfb-run -a npm test"
  },
  "devDependencies": {
    "puppeteer": "^21.0.0",
    "nodemon": "^3.0.0"
  }
}
```

### GitHub Actions Workflow

```yaml
# .github/workflows/test-extension.yml
name: Extension Tests

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        
    - name: Install dependencies
      run: |
        cd test-automation
        npm install
        
    - name: Install Chrome
      uses: browser-actions/setup-chrome@latest
      
    - name: Run extension tests
      run: |
        cd test-automation
        npm run test:ci
        
    - name: Upload test results
      if: always()
      uses: actions/upload-artifact@v3
      with:
        name: test-results
        path: |
          test-automation/test-results.json
          test-automation/test-report.md
```

## 7. Debugging Enhancements

### Debug Mode Runner

```javascript
// test-automation/debug-runner.js
const ExtensionTestRunner = require('./run-tests');

class DebugRunner extends ExtensionTestRunner {
  async initialize() {
    this.browser = await puppeteer.launch({
      headless: false,
      devtools: true,
      slowMo: 100, // Slow down operations
      args: [
        `--disable-extensions-except=${this.extensionPath}`,
        `--load-extension=${this.extensionPath}`,
        '--auto-open-devtools-for-tabs'
      ]
    });

    // ... rest of initialization
  }

  async runScenarioWithBreakpoints(scenarioName) {
    // Set up console monitoring
    this.page.on('console', msg => {
      console.log(`[Browser ${msg.type()}]:`, msg.text());
      
      if (msg.type() === 'error') {
        // Pause on errors
        debugger;
      }
    });

    // Take screenshots on failures
    this.page.on('pageerror', async error => {
      await this.page.screenshot({ 
        path: `error-${Date.now()}.png`,
        fullPage: true 
      });
    });

    return await this.runScenario(scenarioName);
  }
}
```

## 8. Performance Monitoring

```javascript
// test-automation/performance-monitor.js
class PerformanceMonitor {
  constructor(page) {
    this.page = page;
    this.metrics = [];
  }

  async startMonitoring() {
    this.interval = setInterval(async () => {
      const metrics = await this.page.metrics();
      const coverage = await this.page.coverage.stopJSCoverage();
      
      this.metrics.push({
        timestamp: Date.now(),
        memory: metrics.JSHeapUsedSize,
        documents: metrics.Documents,
        frames: metrics.Frames,
        nodes: metrics.Nodes,
        coverage: this.calculateCoverage(coverage)
      });
      
      await this.page.coverage.startJSCoverage();
    }, 1000);
  }

  stopMonitoring() {
    clearInterval(this.interval);
    return this.generateReport();
  }

  generateReport() {
    return {
      peakMemory: Math.max(...this.metrics.map(m => m.memory)),
      avgMemory: this.metrics.reduce((sum, m) => sum + m.memory, 0) / this.metrics.length,
      memoryGrowth: this.metrics[this.metrics.length - 1].memory - this.metrics[0].memory,
      timeline: this.metrics
    };
  }
}
```

## Implementation Steps

1. **Phase 1**: Implement test bridge and headless mode support
2. **Phase 2**: Create Puppeteer test runner with basic functionality
3. **Phase 3**: Add retry logic and failure analysis
4. **Phase 4**: Integrate with CI/CD pipeline
5. **Phase 5**: Add debugging and performance monitoring

## Benefits

1. **Automated Testing**: No manual intervention required
2. **Continuous Integration**: Automatic testing on every commit
3. **Detailed Debugging**: Screenshots, console logs, and breakpoints
4. **Performance Tracking**: Monitor memory usage and execution times
5. **Retry Mechanism**: Handle flaky tests automatically
6. **Machine-Readable Results**: Easy to parse for automated analysis

## Usage

```bash
# Run all tests
npm test

# Run specific scenario
npm run test:scenario duplicate-detection

# Debug mode
npm run test:debug

# Watch mode for development
npm run test:watch
```

This setup enables a fully automated test/debug/fix cycle where Puppeteer can run tests, identify failures, provide detailed debugging information, and even suggest fixes based on error patterns.