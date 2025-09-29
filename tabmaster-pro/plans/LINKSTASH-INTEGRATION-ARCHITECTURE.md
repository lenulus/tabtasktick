# LinkStash Integration Architecture

## Executive Summary

LinkStash must be built as integrated features within TabMaster Pro, not as a separate extension, due to Chrome's extension isolation model. This document outlines the technical architecture and implementation strategy for adding persistent collection management to TabMaster Pro.

## The Extension Isolation Problem

### Why Separate Extensions Won't Work
```javascript
// Chrome extensions cannot:
chrome.runtime.sendMessage('other-extension-id', data); // ❌ Blocked by Chrome
chrome.storage.local.get('other-extension-data');        // ❌ Storage is isolated
sharedWorker = new SharedWorker('shared.js');           // ❌ Not supported
window.postMessage(data, 'other-extension');            // ❌ Different contexts
```

### The Single Extension Solution
- LinkStash features must be built INTO TabMaster Pro
- Shared storage, messaging, and permissions
- Unified codebase with modular architecture
- Progressive feature enablement

## Architecture Design

### Core Architecture
```
TabMaster Pro 2.0
├── Core Systems (shared)
│   ├── Rule Engine (predicate.js, engine.js)
│   ├── Category System (domain-categories.js)
│   ├── Storage Manager (unified access layer)
│   ├── Message Bus (background-integrated.js)
│   └── Permission Manager
│
├── Tab Management Module (original TabMaster)
│   ├── Tab Operations (grouping, closing, snoozing)
│   ├── Deduplication System
│   ├── Quick Actions
│   ├── Test Mode
│   └── Popup UI
│
└── Collection Management Module (LinkStash features)
    ├── Collection CRUD Operations
    ├── Workspace State Management
    ├── Task System
    ├── Persistence Layer (IndexedDB)
    └── Side Panel UI
```

### Modular Service Architecture
```javascript
// background-integrated.js - Extended with modules
class IntegratedBackground {
  constructor() {
    // Core services
    this.storage = new UnifiedStorage();
    this.messages = new MessageBus();
    this.permissions = new PermissionManager();

    // Feature modules
    this.modules = {
      // Existing TabMaster modules
      tabs: new TabManagementModule(),
      rules: new RuleEngine(),
      scheduler: new Scheduler(),
      testMode: new TestModeModule(),

      // New LinkStash modules
      collections: new CollectionModule(),
      workspaces: new WorkspaceModule(),
      tasks: new TaskModule(),

      // Shared modules
      categories: new CategorySystem(),
      search: new UnifiedSearch()
    };
  }

  async handleMessage(request, sender, sendResponse) {
    const { module, action, data } = request;

    if (!this.modules[module]) {
      throw new Error(`Unknown module: ${module}`);
    }

    return await this.modules[module].execute(action, data);
  }
}
```

## Storage Architecture

### Hybrid Storage Strategy
```javascript
// Storage layout
const STORAGE_SCHEMA = {
  // Chrome.storage.local (10MB limit) - For active state and settings
  'chrome.storage.local': {
    'tm_settings': {},           // User preferences
    'tm_rules': [],              // Active rules
    'tm_session': {},            // Current session data
    'ls_active_collections': [], // Currently active collection IDs
    'ls_workspace_states': {},   // Current workspace states
    'unified_cache': {}          // Quick access cache
  },

  // IndexedDB (unlimited) - For collections and history
  'indexedDB': {
    'collections': {             // Collection documents
      keyPath: 'id',
      indices: ['name', 'created', 'accessed', 'state']
    },
    'links': {                   // All saved links
      keyPath: 'id',
      indices: ['url', 'domain', 'collectionId', 'created']
    },
    'tasks': {                   // Task items
      keyPath: 'id',
      indices: ['collectionId', 'completed', 'due']
    },
    'history': {                 // Activity history
      keyPath: 'id',
      indices: ['timestamp', 'type', 'entityId']
    }
  }
};

// Unified storage interface
class UnifiedStorage {
  async init() {
    // Initialize IndexedDB
    this.db = await this.openDatabase();

    // Setup Chrome storage listeners
    chrome.storage.onChanged.addListener(this.handleStorageChange.bind(this));
  }

  async openDatabase() {
    return await openDB('tabmaster-pro', 2, {
      upgrade(db, oldVersion, newVersion) {
        if (oldVersion < 2) {
          // Create LinkStash stores
          db.createObjectStore('collections', { keyPath: 'id' });
          db.createObjectStore('links', { keyPath: 'id' });
          db.createObjectStore('tasks', { keyPath: 'id' });
        }
      }
    });
  }

  // Unified API
  async get(type, id) {
    if (type in STORAGE_SCHEMA['chrome.storage.local']) {
      return await chrome.storage.local.get(type);
    } else {
      return await this.db.get(type, id);
    }
  }

  async set(type, data) {
    if (type in STORAGE_SCHEMA['chrome.storage.local']) {
      return await chrome.storage.local.set({ [type]: data });
    } else {
      return await this.db.put(type, data);
    }
  }
}
```

## UI Architecture

### Multiple Entry Points
```javascript
// manifest.json
{
  "name": "TabMaster Pro",
  "version": "2.0.0",

  // Entry point 1: Popup (existing)
  "action": {
    "default_popup": "popup/popup.html",
    "default_title": "TabMaster Pro - Quick Actions"
  },

  // Entry point 2: Side Panel (new)
  "side_panel": {
    "default_path": "sidepanel/panel.html"
  },

  // Entry point 3: Dashboard (existing, enhanced)
  "chrome_url_overrides": {
    "newtab": "dashboard/dashboard.html"  // Optional
  }
}
```

### UI Component Architecture
```
/ui
  /popup (lightweight, fast actions)
    ├── popup.html
    ├── popup.js         # Quick TabMaster actions
    ├── popup.css
    └── collection-quick-add.js  # New: Save to collection

  /sidepanel (persistent workspace)
    ├── panel.html
    ├── panel.js         # LinkStash main UI
    ├── panel.css
    ├── collection-browser.js
    ├── workspace-manager.js
    └── task-list.js

  /dashboard (full management)
    ├── dashboard.html
    ├── dashboard.js     # Enhanced with collections
    ├── /modules
    │   ├── /views
    │   │   ├── tabs.js          # Existing
    │   │   ├── rules.js         # Existing
    │   │   ├── collections.js   # New
    │   │   └── workspaces.js    # New
    │   └── /shared
    │       ├── storage.js        # Unified storage access
    │       └── components.js     # Shared UI components
```

### Side Panel Implementation
```javascript
// sidepanel/panel.js
class LinkStashPanel {
  constructor() {
    this.currentCollection = null;
    this.view = 'collections'; // collections | workspace | search
  }

  async init() {
    // Setup message listener for cross-UI communication
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'collection.created') {
        this.refreshCollections();
      }
    });

    // Load initial data
    await this.loadCollections();
    await this.checkForActiveWorkspace();
  }

  async saveCurrentWindow() {
    const window = await chrome.windows.getCurrent({ populate: true });
    const collection = {
      id: crypto.randomUUID(),
      name: await this.suggestName(window.tabs),
      links: window.tabs.map(tab => ({
        url: tab.url,
        title: tab.title,
        favicon: tab.favIconUrl,
        isPinned: tab.pinned
      })),
      state: 'active',
      created: Date.now()
    };

    // Save via unified message bus
    await chrome.runtime.sendMessage({
      module: 'collections',
      action: 'create',
      data: collection
    });

    this.showCollection(collection.id);
  }
}
```

## Feature Modules

### Collection Module
```javascript
class CollectionModule {
  async execute(action, data) {
    switch (action) {
      case 'create':
        return await this.createCollection(data);
      case 'addLink':
        return await this.addLinkToCollection(data);
      case 'convertGroup':
        return await this.convertTabGroup(data);
      case 'activate':
        return await this.activateCollection(data);
      case 'search':
        return await this.searchCollections(data);
    }
  }

  async createCollection(data) {
    const collection = {
      id: data.id || crypto.randomUUID(),
      name: data.name,
      links: data.links || [],
      state: 'dormant',
      created: Date.now(),
      accessed: Date.now(),
      metadata: {
        notes: data.notes || '',
        tasks: data.tasks || [],
        tags: data.tags || []
      }
    };

    // Save to IndexedDB
    await storage.db.add('collections', collection);

    // Update cache
    await this.updateCache(collection.id);

    // Notify all UI components
    chrome.runtime.sendMessage({
      type: 'collection.created',
      data: collection
    });

    return collection;
  }

  async convertTabGroup(groupId) {
    // Integration with TabMaster groups
    const group = await chrome.tabGroups.get(groupId);
    const tabs = await chrome.tabs.query({ groupId });

    return await this.createCollection({
      name: group.title || `Group ${group.id}`,
      links: tabs.map(tab => ({
        url: tab.url,
        title: tab.title,
        favicon: tab.favIconUrl
      })),
      metadata: {
        tags: ['from-tab-group'],
        notes: `Converted from tab group "${group.title}"`
      }
    });
  }
}
```

### Workspace Module
```javascript
class WorkspaceModule {
  async execute(action, data) {
    switch (action) {
      case 'activate':
        return await this.activateWorkspace(data);
      case 'suspend':
        return await this.suspendWorkspace(data);
      case 'switch':
        return await this.switchWorkspace(data);
      case 'saveState':
        return await this.saveWorkspaceState(data);
    }
  }

  async activateWorkspace(collectionId) {
    const collection = await storage.db.get('collections', collectionId);

    // Update state
    collection.state = 'working';
    collection.workingState = {
      windowId: chrome.windows.WINDOW_ID_CURRENT,
      openTabs: new Map(),
      activated: Date.now()
    };

    // Open pinned links
    for (const link of collection.links.filter(l => l.isPinned)) {
      const tab = await chrome.tabs.create({
        url: link.url,
        pinned: link.isPinned
      });

      collection.workingState.openTabs.set(link.id, tab.id);
    }

    // Save state
    await storage.db.put('collections', collection);

    // Track in session
    await chrome.storage.local.set({
      activeWorkspace: collectionId
    });

    return collection;
  }

  async saveWorkspaceState(collectionId) {
    const collection = await storage.db.get('collections', collectionId);
    const tabs = await chrome.tabs.query({
      windowId: collection.workingState?.windowId
    });

    // Capture detailed state
    for (const tab of tabs) {
      const link = collection.links.find(l => l.url === tab.url);
      if (link) {
        // Inject content script to capture state
        const state = await chrome.tabs.sendMessage(tab.id, {
          action: 'captureState'
        });

        link.tabState = {
          scrollY: state.scrollY,
          formData: state.formData,
          sessionStorage: state.sessionStorage
        };
      }
    }

    await storage.db.put('collections', collection);
  }
}
```

## Integration Points

### TabMaster → LinkStash
```javascript
// Add to existing TabMaster features

// 1. Group context menu
chrome.contextMenus.create({
  id: 'save-group-as-collection',
  title: 'Save as Collection',
  contexts: ['tab'],
  onclick: async (info, tab) => {
    const groupId = tab.groupId;
    if (groupId > -1) {
      await chrome.runtime.sendMessage({
        module: 'collections',
        action: 'convertGroup',
        data: groupId
      });
    }
  }
});

// 2. Rule actions
const RULE_ACTIONS = {
  // Existing actions
  'group': (tabs) => { /* ... */ },
  'close': (tabs) => { /* ... */ },

  // New collection actions
  'addToCollection': async (tabs, params) => {
    await chrome.runtime.sendMessage({
      module: 'collections',
      action: 'addLinks',
      data: {
        collectionId: params.collection,
        links: tabs.map(t => ({ url: t.url, title: t.title }))
      }
    });
  },

  'saveAsCollection': async (tabs, params) => {
    await chrome.runtime.sendMessage({
      module: 'collections',
      action: 'create',
      data: {
        name: params.name,
        links: tabs.map(t => ({ url: t.url, title: t.title }))
      }
    });
  }
};
```

### LinkStash → TabMaster
```javascript
// Collections can use TabMaster features

// 1. Apply rules to collection
async function applyRulesToCollection(collectionId) {
  const collection = await storage.db.get('collections', collectionId);
  const virtualTabs = collection.links.map(link => ({
    url: link.url,
    title: link.title,
    // Virtual tab for rule evaluation
    id: `virtual_${link.id}`,
    windowId: -1,
    groupId: -1
  }));

  // Use existing rule engine
  const results = await ruleEngine.evaluate(virtualTabs);

  // Apply results to collection structure
  for (const action of results.actions) {
    if (action.type === 'group') {
      // Create sub-collection
      await this.createSubCollection(collectionId, action.group);
    }
  }
}

// 2. Open collection with TabMaster rules
async function openCollectionWithRules(collectionId) {
  const collection = await storage.db.get('collections', collectionId);

  // Open tabs
  const tabs = [];
  for (const link of collection.links) {
    const tab = await chrome.tabs.create({ url: link.url });
    tabs.push(tab);
  }

  // Apply TabMaster rules to organize
  await chrome.runtime.sendMessage({
    module: 'tabs',
    action: 'applyRules',
    data: { tabIds: tabs.map(t => t.id) }
  });
}
```

## Migration Strategy

### Phase 1: Foundation (Week 1-2)
- Add IndexedDB storage layer
- Create collection data models
- Basic CRUD operations
- Storage migration utilities

### Phase 2: Core Features (Week 3-4)
- Collection creation from window/group
- Basic collection browser in popup
- Save/restore collections
- Integration with existing storage

### Phase 3: Side Panel (Week 5-6)
- Implement side panel UI
- Collection management interface
- Quick add functionality
- Visual collection browser

### Phase 4: Workspace Features (Week 7-8)
- State preservation system
- Workspace activation/switching
- Task management
- Form data capture

### Phase 5: Deep Integration (Week 9-10)
- Rule engine extensions
- Unified search
- Cross-feature workflows
- Performance optimization

## Feature Flags

```javascript
// Progressive rollout strategy
const FEATURE_FLAGS = {
  // Phase 1 - Basic collections
  'collections.basic': {
    default: true,
    description: 'Basic collection CRUD'
  },

  // Phase 2 - Side panel
  'collections.sidepanel': {
    default: false,
    description: 'Side panel UI',
    requires: ['collections.basic']
  },

  // Phase 3 - Workspaces
  'collections.workspaces': {
    default: false,
    description: 'Full workspace management',
    requires: ['collections.sidepanel']
  },

  // Phase 4 - Tasks
  'collections.tasks': {
    default: false,
    description: 'Task integration',
    requires: ['collections.workspaces']
  },

  // Phase 5 - Advanced
  'collections.ai': {
    default: false,
    description: 'AI-powered organization',
    requires: ['collections.workspaces'],
    experimental: true
  }
};

// Feature flag manager
class FeatureManager {
  async isEnabled(feature) {
    const { features = {} } = await chrome.storage.local.get('features');
    const flag = FEATURE_FLAGS[feature];

    if (!flag) return false;

    // Check dependencies
    if (flag.requires) {
      for (const dep of flag.requires) {
        if (!await this.isEnabled(dep)) {
          return false;
        }
      }
    }

    // Check user override or default
    return features[feature] ?? flag.default;
  }
}
```

## Performance Considerations

### Memory Management
```javascript
// Lazy loading for collections
class CollectionCache {
  constructor(maxSize = 10) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  async get(id) {
    if (this.cache.has(id)) {
      // Move to end (LRU)
      const value = this.cache.get(id);
      this.cache.delete(id);
      this.cache.set(id, value);
      return value;
    }

    // Load from IndexedDB
    const collection = await storage.db.get('collections', id);

    // Trim cache if needed
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(id, collection);
    return collection;
  }
}
```

### Virtual Scrolling for Large Collections
```javascript
// Reuse existing virtual scroll implementation
class CollectionListView {
  constructor(container) {
    this.virtualScroll = new VirtualScroll(container, {
      itemHeight: 60,
      renderItem: this.renderCollection.bind(this)
    });
  }

  async load() {
    // Get collection IDs only
    const ids = await storage.db.getAllKeys('collections');

    // Virtual scroll will request items as needed
    this.virtualScroll.setItems(ids);
  }

  async renderCollection(id) {
    const collection = await collectionCache.get(id);
    return `
      <div class="collection-item">
        <span class="icon">${collection.icon || '📁'}</span>
        <span class="name">${collection.name}</span>
        <span class="count">${collection.links.length} links</span>
      </div>
    `;
  }
}
```

## Testing Strategy

### Unit Tests
```javascript
// Extend existing test suite
describe('Collections Module', () => {
  beforeEach(async () => {
    await storage.db.clear('collections');
  });

  test('should create collection from window', async () => {
    const window = await createTestWindow(5); // 5 tabs
    const collection = await collections.createFromWindow(window.id);

    expect(collection.links).toHaveLength(5);
    expect(collection.state).toBe('dormant');
  });

  test('should integrate with rules', async () => {
    const collection = await createTestCollection();
    const rules = await getRulesForCollection(collection.id);

    expect(rules).toContainEqual(
      expect.objectContaining({
        action: 'addToCollection'
      })
    );
  });
});
```

### Integration Tests
- Test TabMaster + LinkStash workflows
- Test state preservation
- Test storage migration
- Test performance with large datasets

## Security Considerations

- No external API calls for basic functionality
- Optional cloud backup with encryption
- Permissions requested progressively
- Content script injection only when needed

## Conclusion

Building LinkStash as integrated features within TabMaster Pro is not just a technical necessity due to Chrome's extension isolation - it's actually a better architecture. It provides:

1. **Unified Experience**: Single extension, cohesive UI
2. **Shared Intelligence**: Rules, categories, patterns
3. **Better Performance**: No IPC overhead
4. **Simpler Maintenance**: One codebase
5. **Progressive Enhancement**: Start simple, grow complex

The modular architecture ensures clean separation of concerns while enabling deep integration where beneficial. The hybrid storage strategy (Chrome.storage + IndexedDB) provides the best of both worlds: fast access for active data and unlimited storage for collections.

This architecture positions TabMaster Pro as a complete browser memory system - managing both active tabs (short-term) and collections (long-term) in one cohesive solution.