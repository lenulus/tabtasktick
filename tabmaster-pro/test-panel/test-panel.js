// Test Panel - Side panel UI for test runner

import { TestMode } from '../lib/test-mode/test-mode.js';

// Global state
let testMode = null;
let isTestModeActive = false;
let currentResults = null;
let selectedEngine = 'v2-services'; // V2 Services is now the only engine
const logs = [];

// DOM Elements
const elements = {
  toggleTestMode: document.getElementById('toggleTestMode'),
  testStatus: document.getElementById('testStatus'),
  engineSelect: document.getElementById('engineSelect'),
  engineStatus: document.getElementById('engineStatus'),
  runAllTests: document.getElementById('runAllTests'),
  runSelectedTest: document.getElementById('runSelectedTest'),
  stopTests: document.getElementById('stopTests'),
  scenarioList: document.getElementById('scenarioList'),
  testProgress: document.getElementById('testProgress'),
  progressFill: document.getElementById('progressFill'),
  progressText: document.getElementById('progressText'),
  testResults: document.getElementById('testResults'),
  resultsSummary: document.getElementById('resultsSummary'),
  resultsDetails: document.getElementById('resultsDetails'),
  logContent: document.getElementById('logContent'),
  logLevel: document.getElementById('logLevel'),
  clearLogs: document.getElementById('clearLogs'),
  downloadLogs: document.getElementById('downloadLogs'),
  copyAllLogs: document.getElementById('copyAllLogs')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  checkTestModeStatus();
  log('Test panel initialized', 'info');
});

// Event Listeners
function setupEventListeners() {
  elements.toggleTestMode.addEventListener('click', toggleTestMode);
  elements.engineSelect.addEventListener('change', onEngineChange);
  elements.runAllTests.addEventListener('click', runAllTests);
  elements.runSelectedTest.addEventListener('click', runSelectedTests);
  elements.stopTests.addEventListener('click', stopTests);
  elements.clearLogs.addEventListener('click', clearLogs);
  elements.downloadLogs.addEventListener('click', downloadLogs);
  elements.copyAllLogs.addEventListener('click', copyAllLogs);
  elements.logLevel.addEventListener('change', filterLogs);
}

// Engine Selection
async function onEngineChange() {
  const newEngine = elements.engineSelect.value;
  selectedEngine = newEngine;

  // Update status
  elements.engineStatus.textContent = '⏳ Switching...';
  elements.engineStatus.className = 'engine-status loading';

  // Send message to background to switch engine
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'setTestEngine',
      engine: selectedEngine
    });

    if (response && response.success) {
      elements.engineStatus.textContent = '✅ Ready';
      elements.engineStatus.className = 'engine-status';
      log(`Switched to engine: ${selectedEngine}`, 'info');
    } else {
      throw new Error(response?.error || 'Failed to switch engine');
    }
  } catch (error) {
    elements.engineStatus.textContent = '❌ Error';
    elements.engineStatus.className = 'engine-status error';
    log(`Failed to switch engine: ${error.message}`, 'error');

    // Revert selection
    elements.engineSelect.value = selectedEngine === newEngine ? 'v2-services' : selectedEngine;
    selectedEngine = elements.engineSelect.value;
  }
}

// Test Mode Management
async function checkTestModeStatus() {
  const { testModeActive } = await chrome.storage.local.get('testModeActive');
  if (testModeActive) {
    await activateTestMode(false);
  }
}

async function toggleTestMode() {
  if (isTestModeActive) {
    await deactivateTestMode();
  } else {
    await activateTestMode(true);
  }
}

async function activateTestMode(initialize = true) {
  try {
    log('Activating test mode...', 'info');

    testMode = new TestMode();

    if (initialize) {
      await testMode.initialize();
      log('Test mode initialized with new test window', 'info');
    } else {
      // Reconnect to existing test mode
      try {
        await testMode.reconnect();
        log('Reconnected to existing test mode', 'info');
      } catch (reconnectError) {
        // If reconnection fails, initialize fresh
        log(`Reconnection failed (${reconnectError.message}), initializing new test mode`, 'warning');
        await testMode.initialize();
      }
    }

    isTestModeActive = true;
    updateUI('active');

    // Load and display available scenarios
    await loadScenarios();

    log('Test mode activated', 'info');
  } catch (error) {
    log(`Failed to activate test mode: ${error.message}`, 'error');
    log(`Stack trace: ${error.stack}`, 'error');
    updateUI('inactive');
  }
}

async function deactivateTestMode() {
  if (!testMode) return;
  
  try {
    log('Deactivating test mode...', 'info');
    await testMode.cleanup();
    testMode = null;
    isTestModeActive = false;
    updateUI('inactive');
    clearResults();
    log('Test mode deactivated', 'info');
  } catch (error) {
    log(`Error during deactivation: ${error.message}`, 'error');
  }
}

// Test Execution
async function runAllTests() {
  if (!testMode || !isTestModeActive) {
    log('Test mode not active', 'warning');
    return;
  }

  try {
    updateUI('running');
    log('Starting all tests...', 'info');

    // Store Test Runner window for focus management
    const testRunnerWindow = await chrome.windows.getCurrent();
    const testRunnerWindowId = testRunnerWindow.id;

    // Hook into test mode to get real-time updates
    testMode.onStepExecuted = (scenario, step, result) => {
      logTestStep(scenario, step, result);
    };

    testMode.onScenarioStarted = (scenario) => {
      log(`\n=== Starting scenario: ${scenario.name} ===`, 'info');
      log(`Description: ${scenario.description}`, 'info');
    };

    testMode.onScenarioCompleted = (scenario, result) => {
      const statusEmoji = result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⚠️';
      log(`${statusEmoji} Scenario '${scenario.name}' completed: ${result.status} (${result.duration}ms)`,
          result.status === 'passed' ? 'info' : 'error');
    };

    // Pass Test Runner window ID to test mode for focus management
    testMode.testRunnerWindowId = testRunnerWindowId;

    const results = await testMode.runAll();
    currentResults = results;

    // Return focus to Test Runner window
    await chrome.windows.update(testRunnerWindowId, { focused: true });

    displayResults(results);
    updateUI('active');
    log(`\n=== Test Summary ===`, 'info');
    log(`Total: ${results.summary.total} | Passed: ${results.summary.passed} | Failed: ${results.summary.failed}`, 'info');

    // Ask user if they want to clean up
    log(`\nTest execution complete. Use 'Toggle Test Mode' to deactivate and clean up.`, 'info');

  } catch (error) {
    log(`Test execution failed: ${error.message}`, 'error');
    log(`Stack trace: ${error.stack}`, 'error');
    updateUI('active');
  }
}

async function runSelectedTests() {
  if (!testMode || !isTestModeActive) {
    log('Test mode not active', 'warning');
    return;
  }

  const selectedScenarios = getSelectedScenarios();
  if (selectedScenarios.length === 0) {
    log('No scenarios selected', 'warning');
    return;
  }

  try {
    updateUI('running');
    log(`Running ${selectedScenarios.length} selected scenarios: ${selectedScenarios.join(', ')}`, 'info');

    // Store Test Runner window for focus management
    const testRunnerWindow = await chrome.windows.getCurrent();
    const testRunnerWindowId = testRunnerWindow.id;

    // Hook into test mode for detailed logging
    testMode.onStepExecuted = (scenario, step, result) => {
      logTestStep(scenario, step, result);
    };

    testMode.onScenarioStarted = (scenario) => {
      log(`\n=== Starting scenario: ${scenario.name} ===`, 'info');
      log(`Description: ${scenario.description}`, 'info');
    };

    testMode.onScenarioCompleted = (scenario, result) => {
      const statusEmoji = result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⚠️';
      log(`${statusEmoji} Scenario '${scenario.name}' completed: ${result.status} (${result.duration}ms)`,
          result.status === 'passed' ? 'info' : 'error');
    };

    // Pass Test Runner window ID to test mode for focus management
    testMode.testRunnerWindowId = testRunnerWindowId;

    const results = await testMode.runScenarios(selectedScenarios);
    currentResults = results;

    // Return focus to Test Runner window
    await chrome.windows.update(testRunnerWindowId, { focused: true });

    displayResults(results);
    updateUI('active');
    log(`\n=== Test Summary ===`, 'info');
    log(`Selected tests completed: ${results.summary.passed}/${results.summary.total} passed`, 'info');

  } catch (error) {
    log(`Test execution failed: ${error.message}`, 'error');
    log(`Stack trace: ${error.stack}`, 'error');
    updateUI('active');
  }
}

async function stopTests() {
  log('Stopping tests...', 'warning');

  // Set a flag that the test runner will check
  if (testMode) {
    testMode.shouldAbort = true;

    // Force cleanup after a short delay to ensure current step completes
    setTimeout(async () => {
      if (testMode && testMode.isActive) {
        log('Cleaning up test environment...', 'warning');
        await testMode.cleanup();
        updateUI('active');
        log('Tests stopped and cleaned up', 'warning');
      }
    }, 500);
  }

  updateUI('active');
}

// UI Updates
function updateUI(state) {
  const statusIndicator = elements.testStatus.querySelector('.status-indicator');
  const statusText = elements.testStatus.querySelector('.status-text');
  const toggleBtn = elements.toggleTestMode;
  
  // Remove all status classes
  statusIndicator.classList.remove('active', 'inactive', 'running');
  
  switch (state) {
    case 'inactive':
      statusIndicator.classList.add('inactive');
      statusText.textContent = 'Test Mode Inactive';
      toggleBtn.classList.remove('active');
      elements.runAllTests.disabled = true;
      elements.runSelectedTest.disabled = true;
      elements.stopTests.disabled = true;
      break;
      
    case 'active':
      statusIndicator.classList.add('active');
      statusText.textContent = 'Test Mode Active';
      toggleBtn.classList.add('active');
      elements.runAllTests.disabled = false;
      elements.runSelectedTest.disabled = false;
      elements.stopTests.disabled = true;
      break;
      
    case 'running':
      statusIndicator.classList.add('running');
      statusText.textContent = 'Tests Running...';
      toggleBtn.classList.add('active');
      elements.runAllTests.disabled = true;
      elements.runSelectedTest.disabled = true;
      elements.stopTests.disabled = false;
      break;
  }
}

// Dynamically load and display available scenarios
async function loadScenarios() {
  if (!testMode) return;

  try {
    const scenarios = await testMode.getAvailableScenarios();

    // Clear existing scenario list
    elements.scenarioList.innerHTML = '';

    // Create scenario items dynamically
    scenarios.forEach((scenario, index) => {
      const scenarioDiv = document.createElement('div');
      scenarioDiv.className = 'scenario-item';
      scenarioDiv.dataset.scenario = scenario.name;

      const checkboxId = `scenario-${scenario.name.replace(/[^a-z0-9]/gi, '-')}`;

      scenarioDiv.innerHTML = `
        <input type="checkbox" id="${checkboxId}" class="scenario-checkbox">
        <label for="${checkboxId}">
          <span class="scenario-name">${formatScenarioName(scenario.name)}</span>
          <span class="scenario-status"></span>
        </label>
        <div class="scenario-description">${scenario.description}</div>
      `;

      elements.scenarioList.appendChild(scenarioDiv);
    });

    log(`Loaded ${scenarios.length} test scenarios`, 'info');
  } catch (error) {
    log(`Failed to load scenarios: ${error.message}`, 'error');
  }
}

// Format scenario name for display
function formatScenarioName(name) {
  return name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getSelectedScenarios() {
  const selected = [];
  const checkboxes = elements.scenarioList.querySelectorAll('.scenario-checkbox:checked');

  checkboxes.forEach(checkbox => {
    const scenarioItem = checkbox.closest('.scenario-item');
    if (scenarioItem) {
      selected.push(scenarioItem.dataset.scenario);
    }
  });

  return selected;
}

// Results Display
function displayResults(results) {
  if (!results) return;

  // Show results section
  elements.testResults.style.display = 'block';

  // Show download button
  const downloadBtn = document.getElementById('downloadResults');
  if (downloadBtn) {
    downloadBtn.style.display = 'inline-block';
  }
  
  // Summary
  const { summary, performance } = results;
  elements.resultsSummary.innerHTML = `
    <div class="summary-stat">
      <span class="summary-label">Total</span>
      <span class="summary-value">${summary.total}</span>
    </div>
    <div class="summary-stat">
      <span class="summary-label">Passed</span>
      <span class="summary-value success">${summary.passed}</span>
    </div>
    <div class="summary-stat">
      <span class="summary-label">Failed</span>
      <span class="summary-value error">${summary.failed}</span>
    </div>
    ${performance ? `
    <div class="summary-stat">
      <span class="summary-label">Avg Time</span>
      <span class="summary-value">${performance.avgRuleExecutionTime.toFixed(0)}ms</span>
    </div>
    ` : ''}
  `;
  
  // Details
  elements.resultsDetails.innerHTML = '';
  results.scenarios.forEach(scenario => {
    const resultItem = document.createElement('div');
    resultItem.className = `result-item ${scenario.status}`;
    
    let errorDetails = '';
    if (scenario.status === 'failed' && scenario.steps) {
      const failedSteps = scenario.steps.filter(s => s.status === 'failed');
      if (failedSteps.length > 0) {
        errorDetails = failedSteps.map(step => 
          `<div class="result-error">${step.action}: ${step.error || 'Unknown error'}</div>`
        ).join('');
      }
    }
    
    resultItem.innerHTML = `
      <div class="result-header">
        <span class="result-name">${formatScenarioName(scenario.name)}</span>
        <span class="result-duration">${scenario.duration}ms</span>
      </div>
      ${errorDetails}
    `;
    
    elements.resultsDetails.appendChild(resultItem);
    
    // Update scenario status in list
    updateScenarioStatus(scenario.name, scenario.status);
  });
}

function updateScenarioStatus(scenarioName, status) {
  const scenarioItem = elements.scenarioList.querySelector(`[data-scenario="${scenarioName}"]`);
  if (!scenarioItem) return;
  
  const statusElement = scenarioItem.querySelector('.scenario-status');
  statusElement.className = `scenario-status ${status}`;
  statusElement.textContent = status.toUpperCase();
}

function clearResults() {
  elements.testResults.style.display = 'none';
  elements.resultsSummary.innerHTML = '';
  elements.resultsDetails.innerHTML = '';
  
  // Clear scenario statuses
  elements.scenarioList.querySelectorAll('.scenario-status').forEach(el => {
    el.className = 'scenario-status';
    el.textContent = '';
  });
}

// Logging
function log(message, level = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const entry = { timestamp, message, level };
  logs.push(entry);
  
  // Keep only last 500 logs
  if (logs.length > 500) {
    logs.shift();
  }
  
  displayLog(entry);
}

function displayLog(entry) {
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${entry.level}`;
  logEntry.innerHTML = `<span class="log-timestamp">[${entry.timestamp}]</span>${entry.message}`;
  
  elements.logContent.appendChild(logEntry);
  elements.logContent.scrollTop = elements.logContent.scrollHeight;
  
  // Keep only last 100 visible logs
  while (elements.logContent.children.length > 100) {
    elements.logContent.removeChild(elements.logContent.firstChild);
  }
}

function filterLogs() {
  const level = elements.logLevel.value;
  elements.logContent.innerHTML = '';
  
  const filteredLogs = level === 'all' 
    ? logs 
    : logs.filter(log => log.level === level);
    
  filteredLogs.forEach(entry => displayLog(entry));
}

function clearLogs() {
  logs.length = 0;
  elements.logContent.innerHTML = '';
  log('Logs cleared', 'info');
}

function downloadLogs() {
  const logText = logs.map(entry =>
    `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`
  ).join('\n');

  const blob = new Blob([logText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  chrome.downloads.download({
    url,
    filename: `test-logs-${timestamp}.txt`,
    saveAs: true
  });

  URL.revokeObjectURL(url);
}

// Store console logs
const consoleLogs = [];

// Capture console logs
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = function(...args) {
  consoleLogs.push({
    type: 'log',
    timestamp: new Date().toLocaleTimeString(),
    message: args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ')
  });
  // Keep only last 500 console logs
  if (consoleLogs.length > 500) {
    consoleLogs.shift();
  }
  originalLog.apply(console, args);
};

console.error = function(...args) {
  consoleLogs.push({
    type: 'error',
    timestamp: new Date().toLocaleTimeString(),
    message: args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ')
  });
  if (consoleLogs.length > 500) {
    consoleLogs.shift();
  }
  originalError.apply(console, args);
};

console.warn = function(...args) {
  consoleLogs.push({
    type: 'warn',
    timestamp: new Date().toLocaleTimeString(),
    message: args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ')
  });
  if (consoleLogs.length > 500) {
    consoleLogs.shift();
  }
  originalWarn.apply(console, args);
};

// Copy all logs to clipboard
async function copyAllLogs() {
  try {
    // Get console logs from background script
    const response = await chrome.runtime.sendMessage({ action: 'getConsoleLogs' });
    const backgroundLogs = response?.logs || [];

    // Combine all logs
    const allLogs = [];

    allLogs.push('='.repeat(80));
    allLogs.push('TABMASTER PRO - TEST RUNNER LOGS');
    allLogs.push('Generated: ' + new Date().toISOString());
    allLogs.push('='.repeat(80));
    allLogs.push('');

    // Test Panel Logs
    allLogs.push('TEST PANEL LOGS:');
    allLogs.push('-'.repeat(40));
    logs.forEach(entry => {
      allLogs.push(`[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`);
    });
    allLogs.push('');

    // Console Logs from this panel
    allLogs.push('CONSOLE LOGS (Test Panel):');
    allLogs.push('-'.repeat(40));
    consoleLogs.forEach(entry => {
      allLogs.push(`[${entry.timestamp}] [${entry.type.toUpperCase()}] ${entry.message}`);
    });
    allLogs.push('');

    // Background Console Logs if available
    if (backgroundLogs.length > 0) {
      allLogs.push('CONSOLE LOGS (Background):');
      allLogs.push('-'.repeat(40));
      backgroundLogs.forEach(entry => {
        allLogs.push(`[${entry.timestamp}] [${entry.type.toUpperCase()}] ${entry.message}`);
      });
      allLogs.push('');
    }

    // Test Results if available
    if (currentResults) {
      allLogs.push('TEST RESULTS:');
      allLogs.push('-'.repeat(40));
      allLogs.push(JSON.stringify(currentResults, null, 2));
      allLogs.push('');
    }

    // Copy to clipboard
    const text = allLogs.join('\n');
    await navigator.clipboard.writeText(text);

    // Show feedback
    log('All logs copied to clipboard!', 'info');

    // Flash the button for visual feedback
    elements.copyAllLogs.style.background = '#4CAF50';
    elements.copyAllLogs.textContent = 'Copied!';
    setTimeout(() => {
      elements.copyAllLogs.style.background = '';
      elements.copyAllLogs.textContent = 'Copy All Logs';
    }, 2000);

  } catch (error) {
    log('Failed to copy logs: ' + error.message, 'error');
    console.error('Copy failed:', error);
  }
}

// Get auto-cleanup setting
async function getAutoCleanupSetting() {
  const { testAutoCleanup } = await chrome.storage.local.get('testAutoCleanup');
  return testAutoCleanup !== false; // Default to true
}

// Helper function to log test step details
function logTestStep(scenario, step, result) {
  const statusIcon = result.status === 'success' ? '✓' : result.status === 'failed' ? '✗' : '○';
  const level = result.status === 'failed' ? 'error' : 'info';

  // Log the step action and status
  log(`  ${statusIcon} ${step.action}: ${JSON.stringify(step)}`, level);

  // Log detailed results
  if (result.details) {
    if (step.action === 'assert') {
      const details = result.details;
      if (details.passed) {
        log(`    → Assertion passed: ${details.message}`, 'info');
      } else {
        log(`    → Assertion failed: ${details.message}`, 'error');
        if (details.actual !== undefined && details.expected !== undefined) {
          log(`    → Expected: ${JSON.stringify(details.expected)}`, 'error');
          log(`    → Actual: ${JSON.stringify(details.actual)}`, 'error');
        }
      }
    } else if (step.action === 'createTab') {
      log(`    → Created ${result.details.count || 1} tab(s)`, 'info');
    } else if (step.action === 'createRule') {
      log(`    → Created rule: ${result.details.rule?.name || result.details.ruleId}`, 'info');
    } else if (step.action === 'executeRule') {
      const matchCount = result.details.matchCount || result.details.matches?.length || 0;
      const actionCount = result.details.actionCount || result.details.actions?.length || 0;
      log(`    → Executed rule: ${matchCount} matches, ${actionCount} actions`, 'info');
      if (matchCount === 0) {
        log(`    → WARNING: No tabs matched the rule conditions`, 'warning');
      }
    }
  }

  // Log any errors
  if (result.error) {
    log(`    → Error: ${result.error}`, 'error');
    if (result.stack) {
      log(`    → Stack: ${result.stack}`, 'error');
    }
  }

  // Log timing
  if (result.duration) {
    log(`    → Duration: ${result.duration}ms`, 'info');
  }
}

// Export download results function
window.downloadTestResults = function() {
  if (currentResults && testMode) {
    // Create detailed report
    const detailedResults = {
      ...currentResults,
      logs: logs.slice() // Include logs in the download
    };
    testMode.downloadResults(detailedResults);
    log('Test results downloaded', 'info');
  } else {
    log('No test results to download', 'warning');
  }
};

// Add button for downloading results
window.addEventListener('DOMContentLoaded', () => {
  const downloadBtn = document.createElement('button');
  downloadBtn.id = 'downloadResults';
  downloadBtn.className = 'btn btn-small';
  downloadBtn.textContent = 'Download Results';
  downloadBtn.addEventListener('click', window.downloadTestResults);
  downloadBtn.style.display = 'none';

  const logControls = document.querySelector('.log-controls');
  if (logControls) {
    logControls.appendChild(downloadBtn);
  }
});