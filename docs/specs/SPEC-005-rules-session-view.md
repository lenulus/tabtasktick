# SPEC-005: Rules Engine Session View

## Overview
The Session View is a bulk tab management interface for the Rules Engine 2.0. It provides a tree-based visualization of all tabs organized by Windows → Groups → Tabs, with bulk selection and action capabilities.

## User Stories
1. As a user with 200+ tabs, I want to see all my tabs in a hierarchical tree view to understand my session structure
2. As a user, I want to select multiple tabs across windows/groups to perform bulk actions
3. As a user, I want to preview what my rules will affect before running them
4. As a user, I want to quickly apply common hygiene actions (dedupe, close solos, etc.)

## Technical Design

### Architecture
- Extend existing `/dashboard/modules/views/tabs.js` tree view
- New route `/session` in dashboard with dedicated session management UI
- Integrate with Rules Engine for dry-run preview
- Reuse existing bulk selection infrastructure

### Components

#### 1. Session Tree View (Left Panel)
```
┌─────────────────────────────────┐
│ 🔍 Search tabs...               │
│ ─────────────────────────────── │
│ ▼ Window 1 - Work (45 tabs)     │
│   ▼ 🟦 Development (12)         │
│     □ GitHub - PR #123          │
│     □ VS Code - main.js        │
│   ▼ 🟩 Research (8)            │
│     □ MDN - Array methods      │
│   ▷ No Group (25)              │
│ ▷ Window 2 - Personal (67)      │
│ ▷ Window 3 - News (23)         │
└─────────────────────────────────┘
```

Features:
- Checkbox selection at all levels (window/group/tab)
- Virtualized scrolling for 200+ tabs performance
- Collapsible nodes with tab counts
- Color coding for windows and groups
- Search filters tree in real-time
- Multi-select with Shift+Click, Ctrl+Click

#### 2. Details & Actions Panel (Right)
```
┌─────────────────────────────────┐
│ Selected: 23 tabs               │
│ ─────────────────────────────── │
│ Quick Actions:                  │
│ [Close] [Group] [Snooze]       │
│ [Bookmark] [Move to Window]     │
│                                 │
│ Smart Actions:                  │
│ [Dedupe (5)] [Close Solos (12)]│
│ [Group by Domain] [Archive Old] │
│                                 │
│ Apply Rule:                     │
│ [Select Rule ▼] [Dry Run]      │
│ ─────────────────────────────── │
│ Selection Details:              │
│ • 3 windows                     │
│ • 5 groups                      │
│ • 23 total tabs                 │
│ • ~156 MB memory               │
│ • 5 duplicates detected        │
└─────────────────────────────────┘
```

#### 3. Toolbar
```
[Snapshot Session] [Import] [Export] [Refresh]
```

### Data Structure
```javascript
// Session state
const sessionState = {
  windows: Map<windowId, {
    id: number,
    name: string,
    color: string,
    expanded: boolean,
    selected: boolean,
    groups: Map<groupId, {
      id: number,
      name: string, 
      color: string,
      expanded: boolean,
      selected: boolean,
      tabs: Tab[]
    }>,
    ungroupedTabs: Tab[]
  }>,
  selectedTabs: Set<tabId>,
  searchQuery: string,
  stats: {
    totalTabs: number,
    totalWindows: number,
    totalGroups: number,
    duplicates: number,
    memory: number
  }
};
```

### UI Implementation

#### HTML Structure
```html
<div class="session-view">
  <div class="session-toolbar">
    <button id="snapshotSession">Snapshot</button>
    <button id="importSession">Import</button>
    <button id="exportSession">Export</button>
    <button id="refreshSession">Refresh</button>
  </div>
  
  <div class="session-content">
    <div class="session-tree-panel">
      <input type="search" id="sessionSearch" placeholder="Search tabs...">
      <div id="sessionTree" class="tree-container"></div>
    </div>
    
    <div class="session-actions-panel">
      <div class="selection-summary">
        <h3>Selected: <span id="selectedCount">0</span> tabs</h3>
      </div>
      
      <div class="action-groups">
        <div class="quick-actions">
          <h4>Quick Actions</h4>
          <button data-action="close">Close</button>
          <button data-action="group">Group</button>
          <button data-action="snooze">Snooze</button>
          <button data-action="bookmark">Bookmark</button>
          <button data-action="move">Move to Window</button>
        </div>
        
        <div class="smart-actions">
          <h4>Smart Actions</h4>
          <button data-action="dedupe">
            Dedupe <span class="count"></span>
          </button>
          <button data-action="close-solos">
            Close Solos <span class="count"></span>
          </button>
          <button data-action="group-by-domain">Group by Domain</button>
          <button data-action="archive-old">Archive Old</button>
        </div>
        
        <div class="rule-actions">
          <h4>Apply Rule</h4>
          <select id="ruleSelector">
            <option value="">Select a rule...</option>
          </select>
          <button id="dryRunRule">Dry Run</button>
        </div>
      </div>
      
      <div class="selection-details">
        <h4>Selection Details</h4>
        <ul id="selectionStats"></ul>
      </div>
    </div>
  </div>
</div>
```

#### CSS Styling
```css
.session-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.session-content {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 20px;
}

.tree-node {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  cursor: pointer;
}

.tree-node:hover {
  background: var(--hover-bg);
}

.tree-node.selected {
  background: var(--selected-bg);
}

.tree-checkbox {
  margin-right: 8px;
}

.tree-expand {
  width: 20px;
  text-align: center;
}

.tree-children {
  margin-left: 20px;
}

/* Virtualization container */
.tree-container {
  height: calc(100vh - 200px);
  overflow-y: auto;
}
```

### Performance Optimizations

1. **Virtual Scrolling**: Only render visible nodes
```javascript
class VirtualTree {
  constructor(container, nodes, nodeHeight = 28) {
    this.container = container;
    this.nodes = nodes;
    this.nodeHeight = nodeHeight;
    this.visibleNodes = [];
    this.init();
  }
  
  updateVisibleNodes() {
    const scrollTop = this.container.scrollTop;
    const containerHeight = this.container.clientHeight;
    const startIndex = Math.floor(scrollTop / this.nodeHeight);
    const endIndex = Math.ceil((scrollTop + containerHeight) / this.nodeHeight);
    
    this.visibleNodes = this.nodes.slice(startIndex, endIndex + 1);
    this.render();
  }
}
```

2. **Debounced Search**: Prevent excessive re-renders
```javascript
const searchInput = document.getElementById('sessionSearch');
const debouncedSearch = debounce((query) => {
  filterTree(query);
}, 300);

searchInput.addEventListener('input', (e) => {
  debouncedSearch(e.target.value);
});
```

3. **Batch Operations**: Process selections in chunks
```javascript
async function performBulkAction(tabIds, action) {
  const chunks = [];
  const chunkSize = 50;
  
  for (let i = 0; i < tabIds.length; i += chunkSize) {
    chunks.push(tabIds.slice(i, i + chunkSize));
  }
  
  for (const chunk of chunks) {
    await processChunk(chunk, action);
    // Update progress UI
  }
}
```

### Integration Points

1. **Rules Engine Integration**
```javascript
import { RulesEngine } from '../lib/engine.js';

async function dryRunRule(ruleId, selectedTabs) {
  const rule = await getRuleById(ruleId);
  const engine = new RulesEngine();
  
  const results = await engine.dryRun(rule, {
    tabs: selectedTabs,
    windows: await chrome.windows.getAll(),
    groups: await chrome.tabGroups.query({})
  });
  
  return results;
}
```

2. **Selection State Sync**
```javascript
// Sync with existing bulk selection system
function syncSelectionState() {
  const selected = Array.from(sessionState.selectedTabs);
  state.selectedTabs = new Set(selected);
  updateBulkToolbar();
}
```

### Keyboard Shortcuts
- `Ctrl+A`: Select all visible tabs
- `Ctrl+Click`: Toggle selection
- `Shift+Click`: Range selection
- `Space`: Toggle selected node expansion
- `Enter`: Perform default action
- `Delete`: Close selected tabs

### Error Handling
- Handle tabs that close during session
- Graceful degradation for missing permissions
- Clear error messages for failed operations
- Undo support for destructive actions

## Test Scenarios

1. **Large Dataset**
   - Load 500+ tabs across 10+ windows
   - Verify smooth scrolling and selection
   - Test search performance

2. **Bulk Operations**
   - Select 100+ tabs and close
   - Group 50 tabs by domain
   - Move tabs between windows

3. **Tree Interactions**
   - Expand/collapse all nodes
   - Select parent propagates to children
   - Keyboard navigation through tree

4. **Rules Integration**
   - Dry run shows correct affected tabs
   - Apply rule to selection only
   - Preview updates on selection change

## Success Metrics
- Tree renders 500+ tabs in <200ms
- Selection operations <50ms
- Search filters in real-time (<100ms)
- Memory usage <100MB for 500 tabs

## Implementation Order
1. Tree structure and rendering
2. Selection logic and propagation
3. Search and filtering
4. Bulk actions integration
5. Rules engine dry-run
6. Virtual scrolling optimization