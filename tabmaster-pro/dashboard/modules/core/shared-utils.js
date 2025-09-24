// Shared Utilities Module
// Contains common utility functions used across different view modules

// Import state for managing selection state
import state from './state.js';

// Selection state management
export const selectionState = {
  startId: null,
  isSelecting: false
};

// Tab selection handling
export function handleTabSelection(checkbox, tabId, tabCard) {
  const wasChecked = checkbox.checked;
  
  if (event.shiftKey && selectionState.startId !== null) {
    // Range selection
    handleRangeSelection(tabId);
  } else {
    // Single selection
    if (wasChecked) {
      state.selectedTabs.add(tabId);
      tabCard.classList.add('selected');
    } else {
      state.selectedTabs.delete(tabId);
      tabCard.classList.remove('selected');
    }
    selectionState.startId = tabId;
  }
  
  updateBulkToolbar();
}

// Handle range selection between two tabs
function handleRangeSelection(endId) {
  const allTabs = Array.from(document.querySelectorAll('.tab-card'));
  const startIndex = allTabs.findIndex(card => 
    parseInt(card.dataset.tabId) === selectionState.startId
  );
  const endIndex = allTabs.findIndex(card => 
    parseInt(card.dataset.tabId) === endId
  );
  
  if (startIndex === -1 || endIndex === -1) return;
  
  const start = Math.min(startIndex, endIndex);
  const end = Math.max(startIndex, endIndex);
  
  for (let i = start; i <= end; i++) {
    const card = allTabs[i];
    const checkbox = card.querySelector('.tab-checkbox');
    const id = parseInt(card.dataset.tabId);
    
    state.selectedTabs.add(id);
    card.classList.add('selected');
    checkbox.checked = true;
  }
}

// Clear all tab selections
export function clearSelection() {
  // Clear the selection state
  state.selectedTabs.clear();
  
  // Clear selections in grid view
  document.querySelectorAll('.tab-card.selected').forEach(card => {
    card.classList.remove('selected');
    const checkbox = card.querySelector('.tab-checkbox');
    if (checkbox) checkbox.checked = false;
  });
  
  // Clear selections in tree view
  document.querySelectorAll('.tree-tab').forEach(tab => {
    const checkbox = tab.querySelector('.tab-checkbox');
    tab.classList.remove('selected');
    if (checkbox) checkbox.checked = false;
  });
  
  // Clear all parent checkboxes in tree view (windows and groups)
  document.querySelectorAll('.tree-select-checkbox').forEach(checkbox => {
    checkbox.checked = false;
    checkbox.indeterminate = false;
  });
  
  selectionState.startId = null;
  updateBulkToolbar();
}

// Update bulk action toolbar visibility
export function updateBulkToolbar() {
  const toolbar = document.getElementById('bulkToolbar');
  if (!toolbar) return;
  
  const count = state.selectedTabs.size;
  
  if (count > 0) {
    toolbar.hidden = false;
    const selectedCount = document.getElementById('selectedCount');
    if (selectedCount) {
      selectedCount.textContent = count;
    }
  } else {
    toolbar.hidden = true;
  }
}

// Show notification to user
export function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Trigger animation
  setTimeout(() => notification.classList.add('show'), 10);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Show rename windows dialog
export async function showRenameWindowsDialog() {
  const windows = await chrome.windows.getAll({ populate: false });
  
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content">
      <h3>Rename Windows</h3>
      <div class="rename-windows-list">
        ${windows.map(window => `
          <div class="rename-window-item">
            <label>Window ${window.id}</label>
            <input type="text" 
                   class="rename-input" 
                   data-window-id="${window.id}"
                   placeholder="Enter name..."
                   value="${state.windowNames.get(window.id) || ''}">
          </div>
        `).join('')}
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="cancelRename">Cancel</button>
        <button class="btn btn-primary" id="saveWindowNames">Save Names</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Handle save
  document.getElementById('saveWindowNames').addEventListener('click', async () => {
    const inputs = modal.querySelectorAll('.rename-input');
    const updates = {};
    
    inputs.forEach(input => {
      const windowId = parseInt(input.dataset.windowId);
      const name = input.value.trim();
      
      if (name) {
        state.windowNames.set(windowId, name);
        updates[`window_${windowId}`] = name;
      } else {
        state.windowNames.delete(windowId);
        updates[`window_${windowId}`] = null;
      }
    });
    
    // Save to storage
    await chrome.storage.local.set({ windowNames: updates });
    
    // Update dropdowns if on tabs view
    if (state.activeView === 'tabs') {
      updateWindowFilterDropdown();
    }
    
    modal.remove();
    showNotification('Window names saved', 'success');
  });
  
  // Handle cancel
  document.getElementById('cancelRename').addEventListener('click', () => {
    modal.remove();
  });
}

// Update window filter dropdown (stub - actual implementation in tabs.js)
function updateWindowFilterDropdown() {
  // This is handled by the tabs module
  const event = new CustomEvent('updateWindowFilter');
  document.dispatchEvent(event);
}