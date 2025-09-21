# SPEC-004: Quick Action Wheel/Grid Enhancement

## Overview
Enhance the current 4-button quick actions with a Floating Action Button (FAB) that expands to show a comprehensive action grid. This provides users with quick access to common operations with preview counts and undo functionality.

## User Stories

### Primary User Story
As a power user with 200+ tabs, I want instant access to common bulk actions with visual feedback on their impact before execution, so I can manage my tabs efficiently without navigating through menus.

### Supporting User Stories
1. As a user, I want to see how many tabs will be affected before executing an action
2. As a user, I want to undo accidental actions within 5 seconds
3. As a user, I want the quick actions to be discoverable but not intrusive
4. As a mobile user, I want the FAB to be thumb-reachable on smaller screens

## Technical Design

### Architecture Overview
```
┌─────────────────────────────────────┐
│         Popup Window (420px)         │
├─────────────────────────────────────┤
│ Header                              │
│ Stats Grid                          │
│ Memory Usage                        │
│ Quick Actions (Enhanced)            │
│   ├─ Existing 4-button grid         │
│   └─ FAB (bottom-right corner)     │
│       └─ Expandable Action Grid     │
│ Active Rules                        │
│ Top Domains                         │
│ Snoozed Preview                     │
│ Footer                              │
└─────────────────────────────────────┘
```

### Component Structure

#### 1. Floating Action Button (FAB)
- **Position**: Fixed, bottom-right corner of popup window
- **Size**: 56px diameter (Material Design standard)
- **Icon**: Plus (+) that rotates to X when expanded
- **Z-index**: 1000 (above all content)
- **Animation**: Scale in on load, rotate on toggle

#### 2. Action Grid Overlay
- **Container**: Full-width overlay that slides up from FAB
- **Background**: Semi-transparent backdrop (rgba(0,0,0,0.5))
- **Grid Layout**: 3x3 grid (expandable to 4x3)
- **Animation**: Slide up with stagger effect for items

#### 3. Action Items
```
┌─────────────┬─────────────┬─────────────┐
│   Close     │   Group     │  Suspend    │
│ Duplicates  │ by Domain   │  Inactive   │
│    (12)     │    (8)      │   (45)      │
├─────────────┼─────────────┼─────────────┤
│  Archive    │   Snooze    │   Quick     │
│   Old       │   Bulk      │  Organize   │
│   (23)      │    (0)      │    (AI)     │
├─────────────┼─────────────┼─────────────┤
│   Export    │  Import     │   More      │
│    All      │   Tabs      │  Actions    │
│             │             │     ...     │
└─────────────┴─────────────┴─────────────┘
```

### Data Structures

#### Action Configuration
```javascript
const actionConfig = {
  closeDuplicates: {
    id: 'closeDuplicates',
    label: 'Close Duplicates',
    icon: 'duplicate-icon',
    color: '#e74c3c',
    previewCount: async () => {
      const duplicates = await getDuplicateCount();
      return { count: duplicates, unit: 'tabs' };
    },
    execute: closeDuplicates,
    undoable: true
  },
  groupByDomain: {
    id: 'groupByDomain',
    label: 'Group by Domain',
    icon: 'group-icon',
    color: '#3498db',
    previewCount: async () => {
      const domains = await getUngroupedDomains();
      return { count: domains.length, unit: 'groups' };
    },
    execute: groupByDomain,
    undoable: true
  },
  // ... more actions
};
```

#### Undo State
```javascript
const undoState = {
  lastAction: null,
  undoData: null,
  timeout: null,
  canUndo: false
};
```

### Implementation Details

#### 1. FAB Component (fab.js)
```javascript
class FloatingActionButton {
  constructor(container) {
    this.container = container;
    this.isExpanded = false;
    this.fab = null;
    this.overlay = null;
    this.grid = null;
    this.init();
  }

  init() {
    this.createFAB();
    this.createOverlay();
    this.attachEventListeners();
    this.loadPreviewCounts();
  }

  createFAB() {
    this.fab = document.createElement('button');
    this.fab.className = 'fab';
    this.fab.innerHTML = `
      <svg class="fab-icon" viewBox="0 0 24 24">
        <path d="M12 5v14m7-7H5" stroke="currentColor" stroke-width="2"/>
      </svg>
    `;
    this.container.appendChild(this.fab);
  }

  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'fab-overlay';
    this.overlay.innerHTML = `
      <div class="fab-backdrop"></div>
      <div class="action-grid-container">
        <div class="action-grid"></div>
      </div>
    `;
    this.grid = this.overlay.querySelector('.action-grid');
    this.container.appendChild(this.overlay);
  }

  toggle() {
    this.isExpanded = !this.isExpanded;
    this.fab.classList.toggle('expanded');
    this.overlay.classList.toggle('active');
    
    if (this.isExpanded) {
      this.animateGridItems();
    }
  }

  async loadPreviewCounts() {
    for (const [key, action] of Object.entries(actionConfig)) {
      if (action.previewCount) {
        const preview = await action.previewCount();
        this.updateActionPreview(key, preview);
      }
    }
  }
}
```

#### 2. Preview Count System
```javascript
async function getDuplicateCount() {
  const tabs = await chrome.tabs.query({});
  const urlMap = new Map();
  let duplicates = 0;

  tabs.forEach(tab => {
    const normalizedUrl = normalizeUrl(tab.url);
    if (urlMap.has(normalizedUrl)) {
      duplicates++;
    } else {
      urlMap.set(normalizedUrl, tab);
    }
  });

  return duplicates;
}

async function getInactiveTabsInfo() {
  const tabs = await chrome.tabs.query({ active: false });
  const inactiveTabs = tabs.filter(tab => 
    !tab.pinned && 
    tab.lastAccessed < Date.now() - 30 * 60 * 1000 // 30 minutes
  );
  
  const memoryEstimate = inactiveTabs.length * 50; // 50MB average per tab
  
  return {
    count: inactiveTabs.length,
    memory: formatMemory(memoryEstimate)
  };
}
```

#### 3. Undo System
```javascript
class UndoManager {
  constructor() {
    this.undoStack = [];
    this.toastContainer = this.createToastContainer();
  }

  createToastContainer() {
    const container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
  }

  recordAction(action, undoData) {
    const undoItem = {
      id: Date.now(),
      action: action,
      data: undoData,
      timestamp: Date.now()
    };

    this.undoStack.push(undoItem);
    this.showUndoToast(undoItem);

    // Clear old undo items (keep last 5)
    if (this.undoStack.length > 5) {
      this.undoStack.shift();
    }
  }

  showUndoToast(undoItem) {
    const toast = document.createElement('div');
    toast.className = 'undo-toast';
    toast.innerHTML = `
      <span class="toast-message">${undoItem.action.label} completed</span>
      <button class="undo-btn" data-undo-id="${undoItem.id}">Undo</button>
      <div class="toast-progress"></div>
    `;

    this.toastContainer.appendChild(toast);

    // Auto-dismiss after 5 seconds
    const timeout = setTimeout(() => {
      this.dismissToast(toast);
    }, 5000);

    // Handle undo click
    toast.querySelector('.undo-btn').addEventListener('click', () => {
      clearTimeout(timeout);
      this.executeUndo(undoItem);
      this.dismissToast(toast);
    });
  }

  async executeUndo(undoItem) {
    if (undoItem.action.undo) {
      await undoItem.action.undo(undoItem.data);
      this.showNotification('Action undone', 'success');
    }
  }
}
```

### CSS Styling

#### FAB Styles
```css
.fab {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  color: white;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  z-index: 1000;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fab:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
}

.fab.expanded {
  transform: rotate(45deg);
  background: #e74c3c;
}

.fab-icon {
  width: 24px;
  height: 24px;
  transition: transform 0.3s ease;
}

.fab-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.fab-overlay.active {
  pointer-events: auto;
  opacity: 1;
}

.fab-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
}

.action-grid-container {
  position: absolute;
  bottom: 90px;
  right: 20px;
  transform: translateY(20px);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fab-overlay.active .action-grid-container {
  transform: translateY(0);
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(3, 100px);
  gap: 12px;
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.action-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  min-height: 90px;
}

.action-item:hover {
  background: #e9ecef;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.action-icon {
  width: 32px;
  height: 32px;
  margin-bottom: 8px;
}

.action-label {
  font-size: 12px;
  text-align: center;
  color: #2c3e50;
  line-height: 1.2;
}

.action-preview {
  position: absolute;
  top: 4px;
  right: 4px;
  background: #667eea;
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 600;
}

/* Animation classes */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.action-item {
  animation: fadeInUp 0.3s ease backwards;
}

.action-item:nth-child(1) { animation-delay: 0.05s; }
.action-item:nth-child(2) { animation-delay: 0.1s; }
.action-item:nth-child(3) { animation-delay: 0.15s; }
.action-item:nth-child(4) { animation-delay: 0.2s; }
.action-item:nth-child(5) { animation-delay: 0.25s; }
.action-item:nth-child(6) { animation-delay: 0.3s; }
.action-item:nth-child(7) { animation-delay: 0.35s; }
.action-item:nth-child(8) { animation-delay: 0.4s; }
.action-item:nth-child(9) { animation-delay: 0.45s; }

/* Toast Styles */
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 2000;
  pointer-events: none;
}

.undo-toast {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #2c3e50;
  color: white;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  pointer-events: auto;
  position: relative;
  overflow: hidden;
  animation: slideInRight 0.3s ease;
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.toast-message {
  flex: 1;
  font-size: 14px;
}

.undo-btn {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
}

.undo-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  background: #667eea;
  animation: progress 5s linear;
}

@keyframes progress {
  from { width: 100%; }
  to { width: 0%; }
}
```

### Action Implementations

#### Archive Old Tabs
```javascript
async function archiveOldTabs() {
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  const tabs = await chrome.tabs.query({});
  const now = Date.now();
  
  const oldTabs = tabs.filter(tab => {
    return !tab.pinned && 
           !tab.active && 
           tab.lastAccessed && 
           (now - tab.lastAccessed) > ONE_WEEK;
  });

  // Create archive entry
  const archive = {
    timestamp: now,
    tabs: oldTabs.map(tab => ({
      url: tab.url,
      title: tab.title,
      favicon: tab.favIconUrl,
      lastAccessed: tab.lastAccessed
    }))
  };

  // Save to storage
  const { archives = [] } = await chrome.storage.local.get('archives');
  archives.push(archive);
  await chrome.storage.local.set({ archives });

  // Close the tabs
  const tabIds = oldTabs.map(tab => tab.id);
  await chrome.tabs.remove(tabIds);

  return {
    count: oldTabs.length,
    undoData: { archive, tabIds }
  };
}

async function undoArchiveOldTabs(undoData) {
  // Restore tabs
  for (const tab of undoData.archive.tabs) {
    await chrome.tabs.create({ url: tab.url, active: false });
  }

  // Remove from archives
  const { archives = [] } = await chrome.storage.local.get('archives');
  const index = archives.findIndex(a => a.timestamp === undoData.archive.timestamp);
  if (index !== -1) {
    archives.splice(index, 1);
    await chrome.storage.local.set({ archives });
  }
}
```

#### Quick Organize (AI-Powered Suggestions)
```javascript
async function getOrganizeSuggestions() {
  const tabs = await chrome.tabs.query({});
  const suggestions = [];

  // Analyze tab patterns
  const domains = new Map();
  const topics = new Map();
  
  tabs.forEach(tab => {
    const domain = new URL(tab.url).hostname;
    domains.set(domain, (domains.get(domain) || 0) + 1);
    
    // Simple topic extraction from title
    const keywords = extractKeywords(tab.title);
    keywords.forEach(keyword => {
      topics.set(keyword, (topics.get(keyword) || 0) + 1);
    });
  });

  // Generate suggestions
  if (domains.size > 10) {
    suggestions.push({
      type: 'group',
      action: 'Group similar domains',
      impact: `Create ${Math.floor(domains.size / 3)} groups`
    });
  }

  const duplicateCount = await getDuplicateCount();
  if (duplicateCount > 5) {
    suggestions.push({
      type: 'clean',
      action: 'Clean up duplicates',
      impact: `Close ${duplicateCount} duplicate tabs`
    });
  }

  const inactiveInfo = await getInactiveTabsInfo();
  if (inactiveInfo.count > 20) {
    suggestions.push({
      type: 'suspend',
      action: 'Suspend inactive tabs',
      impact: `Free up ${inactiveInfo.memory}`
    });
  }

  return suggestions;
}
```

### Integration Points

#### 1. Popup Integration
- Add FAB container div to popup.html
- Import fab.js and fab.css
- Initialize FAB in popup.js after DOM loaded

#### 2. Background Script Updates
- Add new action handlers for Archive and Quick Organize
- Implement undo handlers for each action
- Add preview count endpoints

#### 3. Dashboard Integration
- Optional: Add FAB to dashboard for consistency
- Share action configuration between popup and dashboard
- Sync undo state across views

### Testing Scenarios

1. **FAB Visibility**
   - FAB should appear after popup loads
   - Should not overlap existing content
   - Should remain visible when scrolling

2. **Action Grid**
   - Grid should expand smoothly
   - All actions should show preview counts
   - Clicking backdrop should close grid

3. **Preview Counts**
   - Counts should update in real-time
   - Should handle 0 counts gracefully
   - Should format large numbers (1.2K)

4. **Undo System**
   - Toast should appear immediately after action
   - Undo should restore exact previous state
   - Multiple toasts should stack properly

5. **Performance**
   - Preview counts should load async without blocking
   - Animations should be smooth with 200+ tabs
   - Memory usage should remain under 50MB

### Error Handling

1. **Action Failures**
   - Show error toast with retry option
   - Log detailed error to console
   - Don't record failed actions in undo stack

2. **Preview Count Failures**
   - Show "-" instead of number
   - Cache last successful count
   - Retry on next FAB open

3. **Undo Failures**
   - Show error message
   - Offer manual recovery steps
   - Log undo data for debugging

### Accessibility

1. **Keyboard Support**
   - FAB focusable with Tab key
   - Space/Enter to toggle
   - Esc to close grid
   - Arrow keys to navigate grid

2. **Screen Readers**
   - Proper ARIA labels on all buttons
   - Announce preview counts
   - Announce toast messages

3. **Reduced Motion**
   - Respect prefers-reduced-motion
   - Provide instant transitions option
   - Keep functionality without animations

### Future Enhancements

1. **Customizable Actions**
   - Let users pick which actions appear
   - Custom action creation
   - Reorder actions

2. **Action History**
   - Show recent actions with repeat option
   - Action analytics
   - Batch undo for related actions

3. **Smart Suggestions**
   - ML-based action recommendations
   - Time-based suggestions
   - Usage pattern learning

### Implementation Order

1. Create FAB component structure
2. Implement basic expand/collapse
3. Add action grid with static items
4. Implement preview count system
5. Add action execution handlers
6. Implement undo system
7. Add animations and polish
8. Test with 200+ tabs
9. Add accessibility features
10. Document usage

### Success Metrics

1. **Performance**
   - FAB loads within 50ms
   - Preview counts load within 200ms
   - Animations run at 60fps

2. **Usability**
   - 80% of users discover FAB naturally
   - Average action completion < 3 clicks
   - Undo used in 30% of actions

3. **Reliability**
   - 0% data loss from actions
   - 100% undo success rate
   - No memory leaks after 1000 actions