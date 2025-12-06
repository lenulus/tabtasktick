// Snoozed View Module
// Handles the snoozed tabs timeline view

// Track if event listeners are already set up
let listenersInitialized = false;

export async function loadSnoozedView() {
  try {
    console.log('Loading snoozed view...');
    const snoozedTabs = await sendMessage({ action: 'getSnoozedTabs' });
    console.log('Received snoozed tabs:', snoozedTabs);
    renderSnoozedTimeline(snoozedTabs || []);

    // Set up event listeners only once
    if (!listenersInitialized) {
      setupSnoozedEventListeners();
      listenersInitialized = true;
    }
  } catch (error) {
    console.error('Failed to load snoozed tabs:', error);
    renderSnoozedTimeline([]);
  }
}

function renderSnoozedTimeline(snoozedTabs) {
  const timeline = document.getElementById('snoozedTimeline');
  timeline.innerHTML = '';

  if (snoozedTabs.length === 0) {
    timeline.innerHTML = `
      <div class="empty-state">
        <h3>No snoozed tabs</h3>
        <p>Snooze tabs to temporarily hide them and have them reopen later</p>
      </div>
    `;
    return;
  }

  // Separate window snoozes from individual tabs
  const { windowSnoozes, individualTabs } = separateWindowSnoozes(snoozedTabs);

  // Group by wake time
  const groups = groupSnoozedByTime([...windowSnoozes, ...individualTabs]);

  // Add timeline line
  timeline.innerHTML = '<div class="timeline-line"></div>';

  Object.entries(groups).forEach(([timeLabel, items]) => {
    const section = document.createElement('div');
    section.className = 'timeline-section';

    section.innerHTML = `
      <div class="timeline-header">
        <div class="timeline-dot"></div>
        <div class="timeline-time">${timeLabel}</div>
      </div>
      <div class="timeline-tabs">
        ${items.map(item => {
    if (item.isWindowSnooze) {
      // Render window snooze group
      return `
              <div class="window-snooze-card">
                <div class="window-snooze-header">
                  <div class="window-icon">🪟</div>
                  <div class="window-info">
                    <div class="window-title">Snoozed Window (${item.tabs.length} tabs)</div>
                    <div class="window-meta">
                      <span class="wake-time">🕐 ${getExactWakeTime(item.snoozeUntil)}</span>
                    </div>
                  </div>
                </div>
                <div class="window-tabs-preview">
                  ${item.tabs.slice(0, 3).map(tab => `
                    <div class="tab-preview">
                      <img src="${tab.favIconUrl || '../icons/icon-16.png'}" class="tab-favicon-small">
                      <span class="tab-title-small">${tab.title || tab.url}</span>
                    </div>
                  `).join('')}
                  ${item.tabs.length > 3 ? `<div class="more-tabs">+${item.tabs.length - 3} more</div>` : ''}
                </div>
                <div class="window-actions">
                  <button class="btn-small restore-window-btn" data-window-snooze-id="${item.windowSnoozeId}">Restore Window</button>
                  <button class="btn-small delete-window-btn" data-window-snooze-id="${item.windowSnoozeId}">Delete All</button>
                </div>
              </div>
            `;
    } else {
      // Render individual tab
      return `
              <div class="tab-card ${item.groupId ? 'grouped' : ''}">
                <div class="tab-header">
                  <img src="${item.favicon || '../icons/icon-16.png'}" class="tab-favicon">
                  <div class="tab-title">${item.title}</div>
                </div>
                <div class="tab-url">${item.url}</div>
                <div class="tab-meta">
                  <span class="wake-time">🕐 ${getExactWakeTime(item.snoozeUntil || item.wakeTime)}</span>
                  ${item.groupId ? '<span class="group-indicator">📁 Grouped</span>' : ''}
                  <span class="snooze-reason">${item.snoozeReason || 'manual'}</span>
                </div>
                <div class="tab-actions">
                  <button class="btn-small wake-btn" data-tab-id="${item.id}">Wake Now</button>
                  <button class="btn-small delete-btn" data-tab-id="${item.id}" data-tab-url="${item.url}" title="Delete snoozed tab">Delete</button>
                </div>
              </div>
            `;
    }
  }).join('')}
      </div>
    `;

    timeline.appendChild(section);
  });
}

/**
 * Separate window snoozes from individual tab snoozes
 */
function separateWindowSnoozes(snoozedTabs) {
  const windowGroups = new Map(); // windowSnoozeId -> tabs[]
  const individualTabs = [];

  for (const tab of snoozedTabs) {
    if (tab.windowSnoozeId) {
      if (!windowGroups.has(tab.windowSnoozeId)) {
        windowGroups.set(tab.windowSnoozeId, []);
      }
      windowGroups.get(tab.windowSnoozeId).push(tab);
    } else {
      individualTabs.push(tab);
    }
  }

  // Convert window groups to objects for easier rendering
  const windowSnoozes = Array.from(windowGroups.entries()).map(([windowSnoozeId, tabs]) => ({
    isWindowSnooze: true,
    windowSnoozeId,
    tabs,
    snoozeUntil: tabs[0]?.snoozeUntil // All tabs in window have same snoozeUntil
  }));

  return { windowSnoozes, individualTabs };
}

function groupSnoozedByTime(items) {
  const groups = {};
  const now = Date.now();

  items.forEach(item => {
    // Handle both tabs and window snooze objects
    const timestamp = item.snoozeUntil || item.wakeTime;
    const diff = timestamp - now;
    let label;

    if (diff <= 3600000) { // 1 hour
      label = 'Within 1 hour';
    } else if (diff <= 86400000) { // 1 day
      label = 'Today';
    } else if (diff <= 172800000) { // 2 days
      label = 'Tomorrow';
    } else if (diff <= 604800000) { // 1 week
      label = 'This week';
    } else {
      label = 'Later';
    }

    if (!groups[label]) {
      groups[label] = [];
    }
    groups[label].push(item);
  });

  return groups;
}

function getExactWakeTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  
  // Format time
  const timeOptions = { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  };
  
  // Check if it's today, tomorrow, or later
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);
  
  if (date < tomorrow) {
    return `Today at ${date.toLocaleTimeString('en-US', timeOptions)}`;
  } else if (date < dayAfter) {
    return `Tomorrow at ${date.toLocaleTimeString('en-US', timeOptions)}`;
  } else {
    const dateOptions = { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    };
    return date.toLocaleString('en-US', dateOptions);
  }
}

async function wakeTab(tabId) {
  try {
    console.log('Waking snoozed tab:', tabId);
    const result = await sendMessage({ action: 'wakeSnoozedTab', tabId });
    console.log('Wake result:', result);
    if (result && result.success) {
      // Reload the snoozed view
      await loadSnoozedView();
    } else {
      console.error('Failed to wake tab:', result?.error || 'Unknown error');
      alert(`Failed to wake tab: ${result?.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Failed to wake tab:', error);
    alert(`Failed to wake tab: ${error.message}`);
  }
}

async function deleteTab(tabId, tabUrl) {
  try {
    const result = await sendMessage({
      action: 'deleteSnoozedTab',
      tabId: tabId || tabUrl
    });
    if (result && result.success) {
      // Reload the snoozed view
      await loadSnoozedView();
    } else {
      console.error('Failed to delete tab:', result?.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Failed to delete tab:', error);
  }
}

function setupSnoozedEventListeners() {
  const timeline = document.getElementById('snoozedTimeline');

  if (!timeline) {
    console.error('Snoozed timeline element not found');
    return;
  }

  // Event delegation for all buttons
  timeline.addEventListener('click', async (e) => {
    if (e.target.classList.contains('wake-btn')) {
      const tabId = e.target.dataset.tabId;
      if (tabId) {
        await wakeTab(tabId);
      }
    } else if (e.target.classList.contains('delete-btn')) {
      const tabId = e.target.dataset.tabId;
      const tabUrl = e.target.dataset.tabUrl;
      if (confirm('Delete this snoozed tab?')) {
        await deleteTab(tabId, tabUrl);
      }
    } else if (e.target.classList.contains('restore-window-btn')) {
      const windowSnoozeId = e.target.dataset.windowSnoozeId;
      if (windowSnoozeId) {
        await restoreWindow(windowSnoozeId);
      }
    } else if (e.target.classList.contains('delete-window-btn')) {
      const windowSnoozeId = e.target.dataset.windowSnoozeId;
      if (windowSnoozeId && confirm('Delete all tabs in this snoozed window?')) {
        await deleteWindow(windowSnoozeId);
      }
    }
  });
}

async function restoreWindow(windowSnoozeId) {
  try {
    console.log('Restoring snoozed window:', windowSnoozeId);
    const result = await sendMessage({
      action: 'restoreWindow',
      windowSnoozeId
    });
    console.log('Restore result:', result);
    if (result && result.success) {
      // Small delay to ensure storage write completes before UI refresh
      await new Promise(resolve => setTimeout(resolve, 100));
      // Reload the snoozed view
      await loadSnoozedView();
    } else {
      console.error('Failed to restore window:', result?.error || 'Unknown error');
      alert(`Failed to restore window: ${result?.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Failed to restore window:', error);
    alert(`Failed to restore window: ${error.message}`);
  }
}

async function deleteWindow(windowSnoozeId) {
  try {
    console.log('Deleting snoozed window:', windowSnoozeId);
    const result = await sendMessage({
      action: 'deleteWindow',
      windowSnoozeId
    });
    if (result && result.success) {
      // Reload the snoozed view
      await loadSnoozedView();
    } else {
      console.error('Failed to delete window:', result?.error || 'Unknown error');
      alert(`Failed to delete window: ${result?.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Failed to delete window:', error);
    alert(`Failed to delete window: ${error.message}`);
  }
}

// Helper function
async function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}