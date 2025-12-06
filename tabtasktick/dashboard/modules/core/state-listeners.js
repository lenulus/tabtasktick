/**
 * Example state change listeners for TabMaster Pro
 * Demonstrates how to subscribe to state changes
 */

import state from './state.js';

// Example 1: Listen to specific state changes
export function initStateListeners() {
  // Listen to currentView changes
  const unsubscribeView = state.subscribe(['currentView'], (updates, paths) => {
    console.log('View changed to:', updates.currentView);
    // Could trigger analytics, update UI, etc.
  });
  
  // Listen to selectedTabs changes
  const unsubscribeSelection = state.subscribe(['selectedTabs'], (updates, paths) => {
    const count = state.selectedTabs.size;
    console.log(`Selection changed: ${count} tabs selected`);
    
    // Update UI elements that depend on selection
    updateSelectionDependentUI(count);
  });
  
  // Listen to multiple paths
  const unsubscribeData = state.subscribe(['tabsData', 'groupsData'], (updates, paths) => {
    console.log('Data updated:', paths);
    
    if ('tabsData' in updates) {
      console.log(`Tabs data updated: ${state.get('tabsData').length} tabs`);
    }
    
    if ('groupsData' in updates) {
      console.log(`Groups data updated: ${state.get('groupsData').length} groups`);
    }
  });
  
  // Listen to all state changes (use sparingly)
  const unsubscribeAll = state.subscribe(['*'], (updates, paths) => {
    console.debug('State changed:', paths);
  });
  
  // Return cleanup function
  return () => {
    unsubscribeView();
    unsubscribeSelection();
    unsubscribeData();
    unsubscribeAll();
  };
}

// Example 2: Auto-save state changes to storage
export function initAutoSave(storage) {
  // Debounce function to avoid too frequent saves
  let saveTimeout;
  const debouncedSave = (key, value) => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      try {
        await storage.set({ [key]: value });
        console.log(`Auto-saved ${key}`);
      } catch (error) {
        console.error(`Failed to auto-save ${key}:`, error);
      }
    }, 1000); // Save after 1 second of inactivity
  };
  
  // Auto-save settings
  state.subscribe(['settings'], (updates) => {
    if (updates.settings) {
      debouncedSave('settings', updates.settings);
    }
  });
  
  // Auto-save rules
  state.subscribe(['currentRules'], (updates) => {
    if (updates.currentRules) {
      debouncedSave('rules', updates.currentRules);
    }
  });
}

// Example 3: Sync state across windows/tabs
export function initCrossWindowSync() {
  // Listen for state changes and broadcast them
  state.subscribe(['*'], (updates, paths) => {
    // Skip certain paths that shouldn't be synced
    const syncablePaths = paths.filter(path => 
      !['snoozeModal', 'previewCard', 'charts'].includes(path.split('.')[0])
    );
    
    if (syncablePaths.length > 0) {
      // Broadcast to other windows via chrome.runtime
      chrome.runtime.sendMessage({
        type: 'STATE_SYNC',
        updates: Object.fromEntries(
          Object.entries(updates).filter(([key]) => 
            syncablePaths.includes(key)
          )
        )
      });
    }
  });
  
  // Listen for state sync messages from other windows
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STATE_SYNC') {
      // Apply updates from other windows
      state.batchUpdate(() => {
        Object.entries(message.updates).forEach(([path, value]) => {
          state.set(path, value);
        });
      });
    }
  });
}

// Example 4: State-based UI updates
function updateSelectionDependentUI(selectedCount) {
  // Update bulk action toolbar visibility
  const bulkToolbar = document.getElementById('bulkToolbar');
  if (bulkToolbar) {
    bulkToolbar.style.display = selectedCount > 0 ? 'flex' : 'none';
  }
  
  // Update selection count display
  const countDisplay = document.querySelector('.selection-count');
  if (countDisplay) {
    countDisplay.textContent = `${selectedCount} selected`;
  }
  
  // Enable/disable bulk action buttons
  document.querySelectorAll('.bulk-action').forEach(button => {
    button.disabled = selectedCount === 0;
  });
}

// Example 5: State persistence and restoration
export async function saveStateSnapshot() {
  const snapshot = {
    timestamp: Date.now(),
    state: {
      currentView: state.get('currentView'),
      tabsData: state.get('tabsData'),
      groupsData: state.get('groupsData'),
      settings: state.get('settings'),
      currentRules: state.get('currentRules')
    }
  };
  
  await chrome.storage.local.set({ stateSnapshot: snapshot });
  return snapshot;
}

export async function restoreStateSnapshot() {
  const { stateSnapshot } = await chrome.storage.local.get('stateSnapshot');
  
  if (stateSnapshot && stateSnapshot.state) {
    state.batchUpdate(() => {
      Object.entries(stateSnapshot.state).forEach(([key, value]) => {
        state.set(key, value);
      });
    });
    
    console.log('State restored from snapshot:', new Date(stateSnapshot.timestamp));
    return true;
  }
  
  return false;
}

// Export initialization function
export function initializeStateManagement(storage) {
  // Initialize all listeners
  const cleanupListeners = initStateListeners();
  initAutoSave(storage);
  initCrossWindowSync();
  
  // Restore state on startup
  restoreStateSnapshot().catch(console.error);
  
  // Save state snapshot periodically
  setInterval(() => {
    saveStateSnapshot().catch(console.error);
  }, 5 * 60 * 1000); // Every 5 minutes
  
  // Save state on page unload
  window.addEventListener('beforeunload', () => {
    saveStateSnapshot().catch(console.error);
  });
  
  // Return cleanup function
  return () => {
    cleanupListeners();
  };
}