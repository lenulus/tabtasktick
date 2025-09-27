// Test Panel - Side panel UI for test runner

import { TestMode } from '../lib/test-mode/test-mode.js';

// Global state
let testMode = null;
let isTestModeActive = false;
let currentResults = null;
const logs = [];

// DOM Elements
const elements = {
  toggleTestMode: document.getElementById('toggleTestMode'),
  testStatus: document.getElementById('testStatus'),
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
  downloadLogs: document.getElementById('downloadLogs')
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
  elements.runAllTests.addEventListener('click', runAllTests);
  elements.runSelectedTest.addEventListener('click', runSelectedTests);
  elements.stopTests.addEventListener('click', stopTests);
  elements.clearLogs.addEventListener('click', clearLogs);
  elements.downloadLogs.addEventListener('click', downloadLogs);
  elements.logLevel.addEventListener('change', filterLogs);
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
    
    if (initialize) {
      testMode = new TestMode();
      await testMode.initialize();
    } else {
      // Reconnect to existing test mode
      testMode = new TestMode();
      testMode.isActive = true;
    }
    
    isTestModeActive = true;
    updateUI('active');
    log('Test mode activated', 'info');
  } catch (error) {
    log(`Failed to activate test mode: ${error.message}`, 'error');
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
    
    const results = await testMode.runAll();
    currentResults = results;
    
    displayResults(results);
    updateUI('active');
    log(`All tests completed: ${results.summary.passed}/${results.summary.total} passed`, 'info');
    
  } catch (error) {
    log(`Test execution failed: ${error.message}`, 'error');
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
    log(`Running ${selectedScenarios.length} selected scenarios...`, 'info');
    
    const results = await testMode.runScenarios(selectedScenarios);
    currentResults = results;
    
    displayResults(results);
    updateUI('active');
    log(`Selected tests completed: ${results.summary.passed}/${results.summary.total} passed`, 'info');
    
  } catch (error) {
    log(`Test execution failed: ${error.message}`, 'error');
    updateUI('active');
  }
}

async function stopTests() {
  log('Stopping tests...', 'warning');
  // TODO: Implement test cancellation
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
        <span class="result-name">${scenario.name}</span>
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

// Export download results function
window.downloadTestResults = function() {
  if (currentResults && testMode) {
    testMode.downloadResults(currentResults);
  }
};