# SPEC-002: Tab Selection & Bulk Operations

## Overview

This specification details the implementation of tab selection and bulk operations functionality for TabMaster Pro. This feature enables users to select multiple tabs and perform actions on them simultaneously, crucial for managing 200+ tabs efficiently.

## User Stories

1. **As a power user**, I want to select multiple tabs so that I can perform bulk operations on them
2. **As a developer**, I want to close all Stack Overflow tabs at once to clean up after a debugging session
3. **As a researcher**, I want to snooze all research tabs together for later review
4. **As an organizer**, I want to group related tabs in bulk to better organize my workspace
5. **As a minimalist**, I want to bookmark and close multiple tabs to reduce clutter

## Acceptance Criteria

### Selection System
- [ ] Each tab card displays a checkbox for selection
- [ ] Clicking a checkbox toggles tab selection state
- [ ] Selected tabs show visual highlighting
- [ ] Selection count updates in real-time
- [ ] Clicking tab card (not checkbox) opens the tab without selecting
- [ ] "Select All" and "Clear Selection" options available
- [ ] Shift-click for range selection
- [ ] Keyboard shortcuts for selection (Ctrl/Cmd+A for select all)

### Bulk Toolbar
- [ ] Toolbar appears when 1+ tabs are selected
- [ ] Shows count of selected tabs
- [ ] Displays available bulk actions
- [ ] Toolbar sticks to top when scrolling
- [ ] Smooth slide-in animation

### Bulk Actions
- [ ] **Close Selected**: Remove all selected tabs
- [ ] **Snooze Selected**: Open snooze dialog for batch snoozing
- [ ] **Group Selected**: Create new group or add to existing
- [ ] **Bookmark Selected**: Save all to bookmarks folder
- [ ] **Move to Window**: Move selected tabs to new/existing window
- [ ] **Export Selected**: Export only selected tabs

### Confirmation & Feedback
- [ ] Confirmation dialog for actions affecting >10 tabs
- [ ] Success notification with undo option (5 seconds)
- [ ] Error handling for failed operations
- [ ] Progress indicator for long operations

## Technical Design

### Data Structure

```javascript
// Selection state management
const selectionState = {
  selectedTabs: new Set(), // Tab IDs
  lastSelectedId: null,    // For shift-selection
  isSelectMode: false,     // Bulk select mode active
};

// Bulk action configuration
const bulkActions = {
  close: {
    icon: 'close',
    label: 'Close Selected',
    requiresConfirm: (count) => count > 10,
    handler: 'closeTabs'
  },
  snooze: {
    icon: 'clock',
    label: 'Snooze Selected',
    requiresDialog: true,
    handler: 'snoozeTabs'
  },
  // ... other actions
};
```

### UI Components

#### 1. Tab Card Selection Enhancement
```html
<div class="tab-card" data-tab-id="123">
  <label class="tab-select-wrapper">
    <input type="checkbox" class="tab-checkbox" data-tab-id="123">
    <span class="tab-select-indicator"></span>
  </label>
  <!-- existing tab content -->
</div>
```

#### 2. Bulk Actions Toolbar
```html
<div class="bulk-toolbar" id="bulkToolbar" hidden>
  <div class="bulk-info">
    <span class="bulk-count">
      <span id="selectedCount">0</span> tabs selected
    </span>
    <button class="link-btn" id="selectAll">Select All</button>
    <button class="link-btn" id="clearSelection">Clear</button>
  </div>
  <div class="bulk-actions">
    <!-- Action buttons dynamically generated -->
  </div>
</div>
```

#### 3. Confirmation Dialog
```html
<div class="modal" id="confirmModal">
  <div class="modal-content compact">
    <h3 id="confirmTitle">Confirm Action</h3>
    <p id="confirmMessage"></p>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="confirmCancel">Cancel</button>
      <button class="btn btn-danger" id="confirmProceed">Proceed</button>
    </div>
  </div>
</div>
```

### CSS Styling

```css
/* Selection styling */
.tab-card {
  position: relative;
  transition: all 0.2s ease;
}

.tab-card.selected {
  background: var(--color-primary-light);
  border-color: var(--color-primary);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
}

.tab-select-wrapper {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 2;
}

.tab-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

/* Bulk toolbar */
.bulk-toolbar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--color-surface);
  border-bottom: 2px solid var(--color-primary);
  padding: 12px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  animation: slideDown 0.3s ease;
}

.bulk-toolbar[hidden] {
  display: none;
}

@keyframes slideDown {
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* Visual feedback */
.tab-card:hover .tab-select-wrapper {
  opacity: 1;
}

.tab-select-wrapper {
  opacity: 0.7;
  transition: opacity 0.2s;
}

.tab-card.selected .tab-select-wrapper {
  opacity: 1;
}
```

### JavaScript Implementation

#### Selection Management
```javascript
// Initialize selection system
function initializeSelection() {
  const tabsGrid = document.getElementById('tabsGrid');
  
  // Delegate checkbox events
  tabsGrid.addEventListener('change', (e) => {
    if (e.target.classList.contains('tab-checkbox')) {
      handleTabSelection(e.target);
    }
  });
  
  // Handle shift-click for range selection
  tabsGrid.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-checkbox') && e.shiftKey) {
      handleRangeSelection(e.target);
    }
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'a' && currentView === 'tabs') {
      e.preventDefault();
      selectAllTabs();
    }
  });
}

function handleTabSelection(checkbox) {
  const tabId = parseInt(checkbox.dataset.tabId);
  const tabCard = checkbox.closest('.tab-card');
  
  if (checkbox.checked) {
    selectionState.selectedTabs.add(tabId);
    tabCard.classList.add('selected');
  } else {
    selectionState.selectedTabs.delete(tabId);
    tabCard.classList.remove('selected');
  }
  
  selectionState.lastSelectedId = tabId;
  updateBulkToolbar();
}

function updateBulkToolbar() {
  const toolbar = document.getElementById('bulkToolbar');
  const count = selectionState.selectedTabs.size;
  
  if (count > 0) {
    toolbar.hidden = false;
    document.getElementById('selectedCount').textContent = count;
  } else {
    toolbar.hidden = true;
  }
}
```

#### Bulk Action Handlers
```javascript
async function executeBulkAction(action) {
  const selectedIds = Array.from(selectionState.selectedTabs);
  const count = selectedIds.length;
  
  // Check if confirmation needed
  if (bulkActions[action].requiresConfirm?.(count)) {
    const confirmed = await showConfirmDialog(action, count);
    if (!confirmed) return;
  }
  
  // Show progress for large operations
  if (count > 50) {
    showProgressIndicator();
  }
  
  try {
    switch(action) {
      case 'close':
        await closeTabs(selectedIds);
        break;
      case 'snooze':
        await showSnoozeDialog(selectedIds);
        break;
      case 'group':
        await groupTabs(selectedIds);
        break;
      case 'bookmark':
        await bookmarkTabs(selectedIds);
        break;
      case 'move':
        await moveToWindow(selectedIds);
        break;
    }
    
    // Show success with undo
    showUndoNotification(action, count);
    
    // Clear selection after success
    clearSelection();
    
  } catch (error) {
    showError(`Failed to ${action} tabs: ${error.message}`);
  } finally {
    hideProgressIndicator();
  }
}

// Individual action implementations
async function closeTabs(tabIds) {
  await chrome.tabs.remove(tabIds);
  analyticsTrack('bulk_close', { count: tabIds.length });
}

async function groupTabs(tabIds) {
  const groupId = await chrome.tabs.group({ tabIds });
  
  // Prompt for group name
  const name = await promptGroupName();
  if (name) {
    await chrome.tabGroups.update(groupId, { title: name });
  }
  
  analyticsTrack('bulk_group', { count: tabIds.length });
}

async function bookmarkTabs(tabIds) {
  // Create folder for bookmarks
  const folder = await chrome.bookmarks.create({
    parentId: '1', // Bookmarks bar
    title: `TabMaster Export - ${new Date().toLocaleDateString()}`
  });
  
  // Get tab details and create bookmarks
  const tabs = await chrome.tabs.query({ 
    id: tabIds // Chrome doesn't support array directly, need workaround
  });
  
  for (const tab of tabs) {
    if (tabIds.includes(tab.id)) {
      await chrome.bookmarks.create({
        parentId: folder.id,
        title: tab.title,
        url: tab.url
      });
    }
  }
  
  analyticsTrack('bulk_bookmark', { count: tabIds.length });
}
```

### Performance Optimizations

1. **Virtual Scrolling**: For 200+ tabs, implement virtual scrolling
2. **Batch DOM Updates**: Use DocumentFragment for rendering
3. **Debounced Selection**: Debounce toolbar updates during rapid selection
4. **Progressive Loading**: Load tab thumbnails on demand
5. **Efficient Data Structures**: Use Set for O(1) selection lookups

### Error Handling

```javascript
// Wrap all Chrome API calls
async function safeApiCall(apiFunction, ...args) {
  try {
    return await apiFunction(...args);
  } catch (error) {
    console.error('Chrome API error:', error);
    
    if (error.message.includes('permissions')) {
      showError('Missing permissions. Please check extension settings.');
    } else if (error.message.includes('closed')) {
      showError('Some tabs were already closed.');
    } else {
      showError('Operation failed. Please try again.');
    }
    
    throw error;
  }
}
```

### Accessibility

- Keyboard navigation for all actions
- ARIA labels for screen readers
- Focus management during modal interactions
- High contrast mode support
- Announce selection changes to screen readers

## Test Scenarios

### Functional Tests
1. Select single tab → checkbox checked, card highlighted
2. Select multiple tabs → count updates correctly
3. Select all → all visible tabs selected
4. Clear selection → all checkboxes unchecked
5. Shift-select range → tabs between selections selected
6. Close 15 selected tabs → confirmation shown, tabs closed
7. Group selected tabs → new group created with all tabs
8. Bookmark selected → folder created with all bookmarks
9. Undo action → previous state restored

### Performance Tests
1. Select 200 tabs → completes in <1 second
2. Close 100 tabs → completes in <3 seconds
3. Scroll with 500 tabs → maintains 60fps
4. Rapid selection changes → no UI lag

### Edge Cases
1. Select tabs across multiple windows → handle gracefully
2. Select already closed tabs → remove from selection
3. Group tabs at max group limit → show appropriate error
4. Bookmark tabs with invalid URLs → skip invalid, continue
5. Undo after tabs manually closed → handle missing tabs

## Implementation Plan

1. **Phase 1**: Selection System (2 hours)
   - Add checkboxes to tab cards
   - Implement selection state management
   - Add visual selection indicators
   - Keyboard shortcuts

2. **Phase 2**: Bulk Toolbar (1 hour)
   - Create sticky toolbar component
   - Add selection count and actions
   - Implement show/hide logic
   - Add select all/clear buttons

3. **Phase 3**: Action Handlers (3 hours)
   - Implement close action with confirmation
   - Add snooze dialog integration
   - Create group action with naming
   - Build bookmark folder creation
   - Add move to window functionality

4. **Phase 4**: Polish & Optimization (2 hours)
   - Add undo functionality
   - Implement progress indicators
   - Optimize for 200+ tabs
   - Add error handling
   - Create success notifications

## Future Enhancements

1. **Smart Selection**
   - Select by domain
   - Select by age
   - Select duplicates
   - Select by memory usage

2. **Advanced Actions**
   - Export selected to various formats
   - Share selected tabs
   - Create workspace from selection
   - Apply rules to selected

3. **Selection Persistence**
   - Save selections
   - Named selection sets
   - Selection history

4. **Batch Operations**
   - Queue multiple operations
   - Operation scheduling
   - Batch operation templates