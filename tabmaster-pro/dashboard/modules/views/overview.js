// Overview View Module
// Handles the main dashboard overview with statistics and charts

import { getTimeAgo, getActivityIcon } from '../core/utils.js';
import state from '../core/state.js';

// Store chart instances globally to ensure proper cleanup
let chartInstances = {
  activity: null,
  domains: null
};

// Cleanup function to destroy all charts
export function cleanupCharts() {
  Object.keys(chartInstances).forEach(key => {
    if (chartInstances[key]) {
      try {
        chartInstances[key].destroy();
        chartInstances[key] = null;
      } catch (e) {
        console.error(`Error destroying ${key} chart:`, e);
      }
    }
  });
}

export async function loadOverviewData(filter = null) {
  console.log('Loading overview data...', filter ? `with filter: ${filter}` : '');
  try {
    const startTime = Date.now();
    const stats = await sendMessage({ action: 'getStatistics' });
    const tabInfo = await sendMessage({ action: 'getTabInfo' });
    console.log(`Data fetched in ${Date.now() - startTime}ms`);
    
    // Update stat cards
    document.getElementById('statTotalTabs').textContent = stats.totalTabs;
    document.getElementById('statTabsChange').textContent = '+0 today'; // Would need tracking
    
    document.getElementById('statGroups').textContent = tabInfo.groups?.length || 0;
    document.getElementById('statGroupsInfo').textContent = '0 collapsed'; // Would need tracking
    
    document.getElementById('statSnoozed').textContent = stats.snoozedTabs;
    updateNextWakeTime(stats.snoozedTabs);

    // Get collections count
    try {
      const collectionsResponse = await chrome.runtime.sendMessage({ action: 'getCollections' });
      const collections = collectionsResponse?.collections || [];
      const activeCollections = collections.filter(c => c.state === 'active');
      document.getElementById('statCollections').textContent = collections.length;
      document.getElementById('statCollectionsInfo').textContent = `${activeCollections.length} active`;
    } catch (e) {
      document.getElementById('statCollections').textContent = '0';
      document.getElementById('statCollectionsInfo').textContent = '0 active';
    }
    
    // Update charts with sample data
    console.log('Calling chart updates...');
    updateActivityChart();
    updateDomainsChart(stats.topDomains);
    console.log('Chart updates called');
    
    // Update recent activity
    await updateRecentActivity();
    
  } catch (error) {
    console.error('Failed to load overview data:', error);
  }
}

function updateNextWakeTime(snoozedCount) {
  if (snoozedCount > 0) {
    document.getElementById('statNextWake').textContent = 'Next in 2h'; // Would need actual calculation
  } else {
    document.getElementById('statNextWake').textContent = 'None scheduled';
  }
}


export async function updateRecentActivity(filter = 'all') {
  // Get real activity log from background
  const response = await sendMessage({ action: 'getActivityLog' });
  
  // Handle both old and new response formats
  const activities = response.activityLog || response || [];
  
  // Filter activities if needed
  let filteredActivities = Array.isArray(activities) ? activities : [];
  if (filter !== 'all') {
    filteredActivities = filteredActivities.filter(a => a.source === filter);
  }
  
  // Take only the most recent 5 activities
  const recentActivities = filteredActivities.slice(0, 5);
  
  // Format activities for display
  const formattedActivities = recentActivities.map(activity => ({
    icon: activity.icon,
    color: activity.color,
    text: activity.details,
    time: getTimeAgo(activity.timestamp),
    source: activity.source
  }));
  
  const container = document.getElementById('recentActivity');
  container.innerHTML = '';
  
  // Add filter buttons if not present
  const activitySection = container.closest('.activity-section');
  if (!activitySection || !activitySection.querySelector('#activityFilter')) {
    const filterContainer = document.createElement('div');
    filterContainer.id = 'activityFilter';
    filterContainer.style.cssText = 'display: flex; gap: 8px; margin-bottom: 12px;';
    filterContainer.innerHTML = `
      <button class="activity-filter-btn ${filter === 'all' ? 'active' : ''}" data-filter="all">All</button>
      <button class="activity-filter-btn ${filter === 'manual' ? 'active' : ''}" data-filter="manual">Manual</button>
      <button class="activity-filter-btn ${filter === 'auto' ? 'active' : ''}" data-filter="auto">Auto</button>
      <button class="activity-filter-btn ${filter === 'rule' ? 'active' : ''}" data-filter="rule">Rules</button>
    `;
    
    // Add event listeners for filter buttons
    filterContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('activity-filter-btn')) {
        updateRecentActivity(e.target.dataset.filter);
      }
    });
    
    // Insert after the section title
    const sectionTitle = activitySection?.querySelector('h3');
    if (sectionTitle) {
      sectionTitle.after(filterContainer);
    }
  } else {
    // Update active state of filter buttons
    document.querySelectorAll('.activity-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });
  }
  
  if (formattedActivities.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 20px;">
        <p style="margin: 0; color: #6c757d; text-align: center;">No recent activity</p>
      </div>
    `;
    return;
  }
  
  formattedActivities.forEach(activity => {
    const item = document.createElement('div');
    item.className = 'activity-item';
    item.innerHTML = `
      <div class="activity-icon" style="background: ${activity.color}20; color: ${activity.color};">
        ${getActivityIcon(activity.icon)}
      </div>
      <div class="activity-content">
        <div>${activity.text}</div>
        <div class="activity-time">${activity.time}</div>
      </div>
    `;
    container.appendChild(item);
  });
}


// ============================================================================
// Chart Functions
// ============================================================================

// Chart instances are now stored in state.charts.activityChart and state.charts.domainsChart

export function updateActivityChart() {
  const ctx = document.getElementById('activityChart');
  if (!ctx) return;

  // Destroy existing chart if it exists
  if (chartInstances.activity) {
    try {
      chartInstances.activity.destroy();
      chartInstances.activity = null;
    } catch (e) {
      console.error('Error destroying activity chart:', e);
    }
  }

  // Get activity data from storage or background
  chrome.storage.local.get(['tabHistory'], (result) => {
    const history = result.tabHistory || [];
    const last7Days = getActivityDataForLast7Days(history);

    // Create new chart
    chartInstances.activity = new Chart(ctx, {
      type: 'line',
      data: {
        labels: last7Days.labels,
        datasets: [{
          label: 'Tabs Opened',
          data: last7Days.opened,
          borderColor: 'rgb(102, 126, 234)',
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          tension: 0.4
        }, {
          label: 'Tabs Closed',
          data: last7Days.closed,
          borderColor: 'rgb(245, 87, 108)',
          backgroundColor: 'rgba(245, 87, 108, 0.1)',
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  });
}

function getActivityDataForLast7Days(history) {
  const days = [];
  const opened = [];
  const closed = [];
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    days.push(dayName);

    // Count activities for this day
    const dayActivities = history.filter(h => {
      const actDate = new Date(h.timestamp);
      return actDate >= date && actDate < nextDate;
    });

    opened.push(dayActivities.filter(a => a.action === 'opened').length);
    closed.push(dayActivities.filter(a => a.action === 'closed').length);
  }

  return {
    labels: days,
    opened,
    closed
  };
}

export function updateDomainsChart(topDomains) {
  const ctx = document.getElementById('domainsChart');
  if (!ctx) return;

  // If no data provided, get current tabs
  if (!topDomains || topDomains.length === 0) {
    chrome.tabs.query({}, (tabs) => {
      const domains = {};
      tabs.forEach(tab => {
        try {
          const url = new URL(tab.url);
          const domain = url.hostname.replace('www.', '');
          if (domain) {
            domains[domain] = (domains[domain] || 0) + 1;
          }
        } catch (e) {
          // Ignore invalid URLs
        }
      });

      // Sort and get top 5
      const sortedDomains = Object.entries(domains)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      renderDomainsChart(sortedDomains);
    });
  } else {
    renderDomainsChart(topDomains);
  }
}

function renderDomainsChart(domainData) {
  const ctx = document.getElementById('domainsChart');
  if (!ctx) return;

  // Destroy existing chart if it exists
  if (chartInstances.domains) {
    try {
      chartInstances.domains.destroy();
      chartInstances.domains = null;
    } catch (e) {
      console.error('Error destroying domains chart:', e);
    }
  }

  const labels = domainData.map(d => Array.isArray(d) ? d[0] : d.domain);
  const data = domainData.map(d => Array.isArray(d) ? d[1] : d.count);

  // Create new chart
  chartInstances.domains = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: [
          'rgba(102, 126, 234, 0.8)',
          'rgba(245, 87, 108, 0.8)',
          'rgba(240, 147, 251, 0.8)',
          'rgba(79, 172, 254, 0.8)',
          'rgba(250, 112, 154, 0.8)'
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

// Helper function for sendMessage
async function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}