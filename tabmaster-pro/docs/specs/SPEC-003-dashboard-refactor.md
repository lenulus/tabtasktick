# SPEC-003: Dashboard Refactoring

## Overview
Refactor the 4000+ line dashboard.js into modular, maintainable components.

## Current Problems
1. **File Size**: 4019 lines in a single file
2. **Multiple Responsibilities**: Handles tabs, groups, snooze, history, rules, charts, modals
3. **Hard to Test**: Everything is tightly coupled
4. **Difficult to Navigate**: Finding specific functionality is challenging
5. **Global State**: Heavy reliance on global variables

## Proposed Architecture

### Core Module Structure
```
dashboard/
├── dashboard.html          # Main HTML
├── dashboard.css          # Styles
├── dashboard.js           # Main entry point & initialization
├── modules/
│   ├── core/
│   │   ├── state.js       # State management
│   │   ├── router.js      # View navigation
│   │   └── utils.js       # Shared utilities
│   ├── views/
│   │   ├── overview.js    # Overview view
│   │   ├── tabs.js        # Tabs view
│   │   ├── groups.js      # Groups view
│   │   ├── snoozed.js     # Snoozed view
│   │   ├── history.js     # History view
│   │   └── rules.js       # Rules view
│   ├── components/
│   │   ├── tab-card.js    # Tab card component
│   │   ├── bulk-actions.js # Bulk actions toolbar
│   │   ├── charts.js      # Chart rendering
│   │   ├── modals.js      # Modal management
│   │   └── filters.js     # Filter controls
│   └── services/
│       ├── chrome-api.js  # Chrome API wrapper
│       ├── storage.js     # Storage operations
│       └── analytics.js   # Analytics/metrics

```

## Implementation Plan

### Phase 1: Setup Module System (No Framework)
```javascript
// modules/core/state.js
export const state = {
  tabs: [],
  groups: [],
  snoozedTabs: [],
  currentView: 'overview',
  selectedTabs: new Set(),
  filters: {
    searchTerm: '',
    windowId: 'all',
    filterType: 'all',
    sortType: 'recent'
  }
};

// modules/core/utils.js
export function debounce(func, wait) { /* ... */ }
export function getTimeAgo(timestamp) { /* ... */ }
export function formatBytes(bytes) { /* ... */ }

// dashboard.js - main entry point
import { state } from './modules/core/state.js';
import { initRouter } from './modules/core/router.js';
import { TabsView } from './modules/views/tabs.js';
// ... other imports
```

### Phase 2: Extract Views
Each view becomes its own module with clear responsibilities:

```javascript
// modules/views/tabs.js
import { state } from '../core/state.js';
import { TabCard } from '../components/tab-card.js';
import { setupFilters } from '../components/filters.js';

export class TabsView {
  constructor(container) {
    this.container = container;
    this.setupEventListeners();
  }
  
  async render() {
    const tabs = await this.fetchTabs();
    state.tabs = tabs;
    this.renderTabs(tabs);
  }
  
  renderTabs(tabs) {
    // Render logic here
  }
  
  handleTabSelection(tabId) {
    // Selection logic here
  }
}
```

### Phase 3: Extract Components
Reusable UI components:

```javascript
// modules/components/tab-card.js
export class TabCard {
  constructor(tab) {
    this.tab = tab;
  }
  
  render() {
    const card = document.createElement('div');
    card.className = 'tab-card';
    card.innerHTML = `
      <input type="checkbox" data-tab-id="${this.tab.id}">
      <img src="${this.tab.favIconUrl}">
      <span>${this.tab.title}</span>
    `;
    return card;
  }
  
  static createBatch(tabs) {
    const fragment = document.createDocumentFragment();
    tabs.forEach(tab => {
      const card = new TabCard(tab);
      fragment.appendChild(card.render());
    });
    return fragment;
  }
}
```

### Phase 4: Extract Services
Chrome API and storage operations:

```javascript
// modules/services/chrome-api.js
export async function getTabs(query = {}) {
  return chrome.tabs.query(query);
}

export async function getGroups() {
  return chrome.tabGroups.query({});
}

export async function moveTabsToWindow(tabIds, windowId) {
  return chrome.tabs.move(tabIds, { windowId, index: -1 });
}

// modules/services/storage.js
export async function loadSnoozedTabs() {
  const { snoozedTabs = [] } = await chrome.storage.local.get('snoozedTabs');
  return snoozedTabs;
}
```

## Migration Strategy

1. **Start with new module structure** - Create directories and base files
2. **Extract utilities first** - Low risk, high reuse
3. **Extract one view at a time** - Start with simplest (history/snoozed)
4. **Add tests as we go** - Each module gets its own test file
5. **Keep dashboard.js working** - Gradual migration, not big bang

## Benefits

1. **Testability**: Each module can be tested in isolation
2. **Maintainability**: Clear separation of concerns
3. **Reusability**: Components can be shared between views
4. **Performance**: Load only what's needed
5. **Developer Experience**: Easy to find and modify code

## Example Test

```javascript
// tests/modules/components/tab-card.test.js
import { TabCard } from '../../../dashboard/modules/components/tab-card.js';

describe('TabCard', () => {
  test('renders tab with title and favicon', () => {
    const tab = {
      id: 1,
      title: 'Test Page',
      favIconUrl: 'https://example.com/icon.png'
    };
    
    const card = new TabCard(tab);
    const element = card.render();
    
    expect(element.querySelector('span').textContent).toBe('Test Page');
    expect(element.querySelector('img').src).toBe('https://example.com/icon.png');
  });
});
```

## Considerations

1. **No Build Step**: Use ES6 modules with type="module" in script tags
2. **Browser Compatibility**: Modern Chrome only (it's an extension)
3. **State Management**: Keep it simple - no Redux/MobX needed
4. **Event System**: Use native DOM events or simple pub/sub
5. **CSS**: Keep styles modular too (consider CSS modules approach)

## Success Criteria

- [ ] Dashboard.js reduced to < 500 lines
- [ ] Each module < 300 lines
- [ ] All functionality preserved
- [ ] Tests for each module
- [ ] No global variables (except for debugging)
- [ ] Clear dependency graph