// History View Module
// Handles the tab history timeline view

import { getActivityIcon } from '../core/utils.js';

export async function loadHistoryView() {
  // Get real activity log from background
  const activities = await sendMessage({ action: 'getActivityLog' }) || [];
  
  // Group activities by date
  const groupedHistory = {};
  const now = Date.now();
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const yesterdayStart = todayStart - 86400000;
  const weekAgo = todayStart - 7 * 86400000;
  
  activities.forEach(activity => {
    let dateKey;
    
    if (activity.timestamp >= todayStart) {
      dateKey = 'Today';
    } else if (activity.timestamp >= yesterdayStart) {
      dateKey = 'Yesterday';
    } else if (activity.timestamp >= weekAgo) {
      const daysAgo = Math.floor((todayStart - activity.timestamp) / 86400000);
      dateKey = `${daysAgo} days ago`;
    } else {
      const date = new Date(activity.timestamp);
      dateKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    
    if (!groupedHistory[dateKey]) {
      groupedHistory[dateKey] = [];
    }
    
    groupedHistory[dateKey].push({
      action: activity.action,
      description: activity.details,
      timestamp: activity.timestamp,
      source: activity.source,
      color: activity.color,
      icon: activity.icon
    });
  });
  
  // Convert to array format for rendering
  const historyArray = Object.entries(groupedHistory).map(([date, items]) => ({
    date,
    items,
    sortKey: items[0]?.timestamp || 0
  }));
  
  // Sort by most recent date first
  historyArray.sort((a, b) => b.sortKey - a.sortKey);
  
  renderHistory(historyArray);
}

function renderHistory(history) {
  const container = document.getElementById('historyContainer');
  container.innerHTML = '';
  
  if (history.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No tab history</h3>
        <p>Your tab management activity will appear here as you use TabMaster Pro</p>
      </div>
    `;
    return;
  }
  
  history.forEach(day => {
    const dayCard = document.createElement('div');
    dayCard.className = 'history-day';
    
    const dayHeader = document.createElement('h3');
    dayHeader.textContent = day.date;
    dayCard.appendChild(dayHeader);
    
    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'history-items';
    
    day.items.forEach(item => {
      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      
      const badge = item.source === 'auto' ? '<span class="source-badge auto">Auto</span>' : 
                   item.source === 'rule' ? '<span class="source-badge rule">Rule</span>' : '';
      
      historyItem.innerHTML = `
        <div class="history-icon" style="color: ${item.color || '#666'};">
          ${getActivityIcon(item.icon || 'action')}
        </div>
        <div class="history-content">
          <div class="history-action">
            ${item.description}
            ${badge}
          </div>
          <div class="history-time">${new Date(item.timestamp).toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit'
          })}</div>
        </div>
      `;
      
      itemsContainer.appendChild(historyItem);
    });
    
    dayCard.appendChild(itemsContainer);
    container.appendChild(dayCard);
  });
}

// Helper function
async function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}