// Snoozed View Module
// Handles the snoozed tabs timeline view

export async function loadSnoozedView() {
  try {
    console.log('Loading snoozed view...');
    const snoozedTabs = await sendMessage({ action: 'getSnoozedTabs' });
    console.log('Received snoozed tabs:', snoozedTabs);
    renderSnoozedTimeline(snoozedTabs || []);
    
    // Set up event listeners for Wake Now buttons
    setupSnoozedEventListeners();
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
  
  // Group by wake time
  const groups = groupSnoozedByTime(snoozedTabs);
  
  // Add timeline line
  timeline.innerHTML = '<div class="timeline-line"></div>';
  
  Object.entries(groups).forEach(([timeLabel, tabs]) => {
    const section = document.createElement('div');
    section.className = 'timeline-section';
    
    section.innerHTML = `
      <div class="timeline-header">
        <div class="timeline-dot"></div>
        <div class="timeline-time">${timeLabel}</div>
      </div>
      <div class="timeline-tabs">
        ${tabs.map(tab => `
          <div class="tab-card ${tab.groupId ? 'grouped' : ''}">
            <div class="tab-header">
              <img src="${tab.favicon || '../icons/icon-16.png'}" class="tab-favicon">
              <div class="tab-title">${tab.title}</div>
            </div>
            <div class="tab-url">${tab.url}</div>
            <div class="tab-meta">
              <span class="wake-time">🕐 ${getExactWakeTime(tab.snoozeUntil)}</span>
              ${tab.groupId ? '<span class="group-indicator">📁 Grouped</span>' : ''}
              <span class="snooze-reason">${tab.snoozeReason || 'manual'}</span>
            </div>
            <div class="tab-actions">
              <button class="btn-small" data-tab-id="${tab.id}">Wake Now</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    
    timeline.appendChild(section);
  });
}

function groupSnoozedByTime(tabs) {
  const groups = {};
  const now = Date.now();
  
  tabs.forEach(tab => {
    const diff = tab.snoozeUntil - now;
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
    groups[label].push(tab);
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
    if (result) {
      // Reload the snoozed view
      await loadSnoozedView();
    }
  } catch (error) {
    console.error('Failed to wake tab:', error);
  }
}

function setupSnoozedEventListeners() {
  const timeline = document.getElementById('snoozedTimeline');
  
  // Event delegation for Wake Now buttons
  timeline.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-small')) {
      const tabId = e.target.dataset.tabId;
      if (tabId) {
        await wakeTab(tabId);
      }
    }
  });
}

// Helper function
async function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}