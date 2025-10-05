# LinkStash Integration Architecture v2.0
## Updated for TabMaster Pro V2 Services Architecture

## Executive Summary

LinkStash must be built as integrated features within TabMaster Pro following the **V2 Services-First Architecture** we've established. This document updates the integration strategy to align with our proven patterns:

- **Services-First**: All logic in `/services/*`, surfaces are thin
- **Separation of Concerns**: Selection services separate from Execution services
- **Message Passing**: Surface → Message → Background → Service
- **Single Source of Truth**: No duplicate implementations
- **Engine Integration**: Collections work with the unified rule engine

## Core Architecture Principles

### Lessons from V2 Architecture

Based on our successful Phase 1.8 refactor, we've learned:

1. **Thin Surfaces**: UI layers (popup, dashboard, sidepanel) only handle presentation
2. **Service Modules**: All business logic lives in dedicated service modules
3. **Message Bus**: All operations route through background message handler
4. **No Direct Chrome API**: Surfaces never call Chrome APIs directly
5. **Explicit Parameters**: All options passed explicitly, no magic defaults
6. **Window Awareness**: Handle multi-window scenarios from the start

## Revised Architecture

```
TabMaster Pro 2.0 (V2 Services Architecture)
├── /services (ALL business logic)
│   ├── /selection
│   │   ├── selectTabs.js              # Existing
│   │   ├── selectCollections.js       # New: Collection selection/filtering
│   │   └── selectLinks.js             # New: Link filtering within collections
│   ├── /execution
│   │   ├── groupTabs.js               # Existing
│   │   ├── snoozeTabs.js              # Existing (SnoozeService)
│   │   ├── collections/
│   │   │   ├── createCollection.js    # New: Collection creation
│   │   │   ├── updateCollection.js    # New: Collection updates
│   │   │   ├── activateWorkspace.js   # New: Workspace activation
│   │   │   └── saveWorkspaceState.js  # New: State capture/restore
│   │   └── links/
│   │       ├── addLinks.js            # New: Add links to collection
│   │       └── organizeLinks.js       # New: Link organization
│   └── TabGrouping.js                 # Existing (legacy compatibility)
│
├── /lib
│   ├── /engine.v2.services.js         # Existing: V2 engine with Command Pattern
│   ├── /engine.v1.legacy.js           # Existing: V1 engine (compatibility)
│   ├── /engineLoader.js               # Existing: Engine selection
│   └── /commands
│       ├── Command.js                 # Existing: Command infrastructure
│       ├── ActionManager.js           # Existing: Action dispatcher
│       └── CollectionActions.js       # New: Collection-specific actions
│
├── /storage
│   └── UnifiedStorage.js              # New: Chrome.storage + IndexedDB wrapper
│
├── /popup (THIN - presentation only)
│   ├── popup.js
│   └── collection-quick-add.js        # New: Quick save to collection
│
├── /sidepanel (THIN - presentation only)
│   ├── panel.js
│   ├── collection-browser.js          # New: Browse collections
│   └── workspace-manager.js           # New: Manage workspaces
│
├── /dashboard (THIN - presentation only)
│   └── /modules/views
│       ├── tabs.js                    # Existing
│       ├── groups.js                  # Existing
│       ├── collections.js             # New: Collection management
│       └── workspaces.js              # New: Workspace overview
│
└── background-integrated.js (Message router + Service coordinator)
```

## Storage Architecture

### Hybrid Storage Following V2 Pattern

```javascript
// storage/UnifiedStorage.js
// Single source of truth for all storage operations

export class UnifiedStorage {
  constructor() {
    this.chromeStorage = chrome.storage.local;
    this.db = null; // IndexedDB for collections
  }

  async init() {
    this.db = await this.openDatabase();

    // Setup change listeners
    chrome.storage.onChanged.addListener(this.handleStorageChange.bind(this));
  }

  async openDatabase() {
    return await openDB('tabmaster-pro', 2, {
      upgrade(db, oldVersion, newVersion) {
        if (oldVersion < 2) {
          // Collection stores
          const collections = db.createObjectStore('collections', { keyPath: 'id' });
          collections.createIndex('state', 'state');
          collections.createIndex('name', 'name');
          collections.createIndex('created', 'metadata.createdAt');
          collections.createIndex('accessed', 'metadata.lastAccessed');

          const links = db.createObjectStore('links', { keyPath: 'id' });
          links.createIndex('url', 'url');
          links.createIndex('collectionId', 'collectionId');
          links.createIndex('role', 'role');

          const tasks = db.createObjectStore('tasks', { keyPath: 'id' });
          tasks.createIndex('collectionId', 'collectionId');
          tasks.createIndex('completed', 'completed');
          tasks.createIndex('due', 'dueDate');
        }
      }
    });
  }

  // Unified API - single source of truth
  async getCollection(id) {
    return await this.db.get('collections', id);
  }

  async saveCollection(collection) {
    return await this.db.put('collections', collection);
  }

  async queryCollections(filters) {
    // Delegate to selection service
    const { selectCollections } = await import('../services/selection/selectCollections.js');
    return await selectCollections(filters);
  }
}

// Singleton instance
export const storage = new UnifiedStorage();
```

## Service Modules

### Selection Services (What to act on)

```javascript
// services/selection/selectCollections.js
// Selection-only service - no execution logic

/**
 * Select collections based on filters
 * @param {Object} filters - Collection filters
 * @param {string} [filters.state] - Filter by state (dormant, active, working)
 * @param {string[]} [filters.tags] - Filter by tags
 * @param {string} [filters.search] - Search query
 * @param {boolean} [filters.hasActiveTabs] - Only collections with open tabs
 * @returns {Promise<Collection[]>} Matching collections
 */
export async function selectCollections(filters = {}) {
  const { storage } = await import('../../storage/UnifiedStorage.js');

  // Get all collections from IndexedDB
  let collections = await storage.db.getAll('collections');

  // Apply filters
  if (filters.state) {
    collections = collections.filter(c => c.state === filters.state);
  }

  if (filters.tags && filters.tags.length > 0) {
    collections = collections.filter(c =>
      filters.tags.some(tag => c.tags.includes(tag))
    );
  }

  if (filters.search) {
    const query = filters.search.toLowerCase();
    collections = collections.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.description?.toLowerCase().includes(query)
    );
  }

  if (filters.hasActiveTabs) {
    collections = collections.filter(c =>
      c.workingState?.openTabs?.size > 0
    );
  }

  return collections;
}

/**
 * Select links within a collection based on filters
 */
export async function selectLinksInCollection(collectionId, filters = {}) {
  const { storage } = await import('../../storage/UnifiedStorage.js');

  const collection = await storage.getCollection(collectionId);
  if (!collection) return [];

  let links = collection.links;

  // Apply filters
  if (filters.role) {
    links = links.filter(l => l.role === filters.role);
  }

  if (filters.isPinned !== undefined) {
    links = links.filter(l => l.isPinned === filters.isPinned);
  }

  if (filters.isOpen !== undefined) {
    links = links.filter(l => l.tabState?.isOpen === filters.isOpen);
  }

  return links;
}
```

### Execution Services (How to act)

```javascript
// services/execution/collections/createCollection.js
// Execution-only service - takes explicit parameters

/**
 * Create a new collection
 * @param {Object} params - Collection parameters
 * @param {string} params.name - Collection name
 * @param {Array} params.links - Links to add
 * @param {string} [params.description] - Description
 * @param {string[]} [params.tags] - Tags
 * @param {string} [params.icon] - Icon/emoji
 * @param {string} [params.state] - Initial state (default: dormant)
 * @param {number} [params.callerWindowId] - Window ID to restore focus to
 * @returns {Promise<Collection>}
 */
export async function createCollection(params) {
  const {
    name,
    links = [],
    description = '',
    tags = [],
    icon = '📁',
    state = 'dormant',
    callerWindowId = null
  } = params;

  if (!name) {
    throw new Error('Collection name is required');
  }

  const { storage } = await import('../../../storage/UnifiedStorage.js');

  const collection = {
    id: crypto.randomUUID(),
    name,
    description,
    icon,
    color: pickColorForName(name), // Reuse from TabGrouping
    tags,
    links: links.map((link, index) => ({
      id: crypto.randomUUID(),
      url: link.url,
      title: link.title || link.url,
      favicon: link.favicon || null,
      role: link.role || 'primary',
      isPinned: link.isPinned || false,
      position: index
    })),
    state,
    metadata: {
      notes: '',
      tasks: [],
      screenshots: [],
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0
    }
  };

  // Save to storage
  await storage.saveCollection(collection);

  // Log activity
  console.log(`[createCollection] Created "${name}" with ${links.length} links`);

  // Notify all UIs
  chrome.runtime.sendMessage({
    type: 'collection.created',
    data: collection
  });

  return collection;
}

function pickColorForName(name) {
  // Reuse deterministic color logic from TabGrouping
  const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length];
}
```

```javascript
// services/execution/collections/activateWorkspace.js
// Execution-only service - workspace activation

/**
 * Activate a collection as a workspace
 * @param {string} collectionId - Collection to activate
 * @param {Object} options - Activation options
 * @param {boolean} [options.openPinned=true] - Open pinned links
 * @param {boolean} [options.createNewWindow=false] - Open in new window
 * @param {number} [options.callerWindowId] - Window to restore focus to
 * @returns {Promise<{collection: Collection, tabs: Array}>}
 */
export async function activateWorkspace(collectionId, options = {}) {
  const {
    openPinned = true,
    createNewWindow = false,
    callerWindowId = null
  } = options;

  const { storage } = await import('../../../storage/UnifiedStorage.js');

  const collection = await storage.getCollection(collectionId);
  if (!collection) {
    throw new Error(`Collection ${collectionId} not found`);
  }

  // Get currently focused window for restoration
  let originalFocusedWindowId = callerWindowId;
  if (!originalFocusedWindowId) {
    const windows = await chrome.windows.getAll();
    const focusedWindow = windows.find(w => w.focused);
    originalFocusedWindowId = focusedWindow?.id;
  }

  // Determine target window
  let targetWindowId;
  if (createNewWindow) {
    const newWindow = await chrome.windows.create({ focused: false });
    targetWindowId = newWindow.id;
  } else {
    targetWindowId = originalFocusedWindowId;
  }

  // Update collection state
  collection.state = 'working';
  collection.workingState = {
    windowId: targetWindowId,
    openTabs: new Map(),
    activated: Date.now()
  };

  // Open links
  const tabs = [];
  const linksToOpen = openPinned
    ? collection.links.filter(l => l.isPinned)
    : collection.links;

  for (const link of linksToOpen) {
    const tab = await chrome.tabs.create({
      url: link.url,
      windowId: targetWindowId,
      pinned: link.isPinned,
      active: false
    });

    collection.workingState.openTabs.set(link.id, {
      tabId: tab.id,
      openedAt: Date.now()
    });

    // Update link state
    link.tabState = {
      isOpen: true,
      tabId: tab.id,
      lastAccessed: Date.now()
    };

    tabs.push(tab);
  }

  // Update metadata
  collection.metadata.lastAccessed = Date.now();
  collection.metadata.accessCount++;

  // Save updated collection
  await storage.saveCollection(collection);

  // Track in session
  await chrome.storage.local.set({
    activeWorkspace: collectionId
  });

  // Restore original focus
  if (originalFocusedWindowId && originalFocusedWindowId !== targetWindowId) {
    await chrome.windows.update(originalFocusedWindowId, { focused: true });
  }

  console.log(`[activateWorkspace] Activated "${collection.name}" with ${tabs.length} tabs`);

  // Notify UIs
  chrome.runtime.sendMessage({
    type: 'workspace.activated',
    data: { collection, tabs }
  });

  return { collection, tabs };
}
```

## Background Integration

### Message Handler Following V2 Pattern

```javascript
// background-integrated.js
// Extended with collection message handlers

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      switch (request.action) {
        // Existing TabMaster actions
        case 'closeTabs':
        case 'groupTabs':
        case 'bookmarkTabs':
        case 'moveToWindow':
          // ... existing handlers
          break;

        // New Collection actions
        case 'createCollection': {
          const { createCollection } = await import('./services/execution/collections/createCollection.js');
          const collection = await createCollection({
            ...request.params,
            callerWindowId: request.callerWindowId
          });
          sendResponse({ success: true, collection });
          break;
        }

        case 'activateWorkspace': {
          const { activateWorkspace } = await import('./services/execution/collections/activateWorkspace.js');
          const result = await activateWorkspace(request.collectionId, {
            ...request.options,
            callerWindowId: request.callerWindowId
          });
          sendResponse({ success: true, ...result });
          break;
        }

        case 'getCollections': {
          const { selectCollections } = await import('./services/selection/selectCollections.js');
          const collections = await selectCollections(request.filters || {});
          sendResponse({ success: true, collections });
          break;
        }

        case 'saveWorkspaceState': {
          const { saveWorkspaceState } = await import('./services/execution/collections/saveWorkspaceState.js');
          await saveWorkspaceState(request.collectionId);
          sendResponse({ success: true });
          break;
        }

        case 'convertGroupToCollection': {
          const { convertGroupToCollection } = await import('./services/execution/collections/convertGroupToCollection.js');
          const collection = await convertGroupToCollection(request.groupId, {
            callerWindowId: request.callerWindowId
          });
          sendResponse({ success: true, collection });
          break;
        }

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error(`Error handling ${request.action}:`, error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // Keep channel open for async response
});
```

## UI Integration (Thin Surfaces)

### Side Panel (New)

```javascript
// sidepanel/panel.js
// THIN presentation layer - no business logic

class LinkStashPanel {
  constructor() {
    this.currentView = 'collections';
    this.selectedCollection = null;
  }

  async init() {
    // Setup UI event listeners
    document.getElementById('save-window-btn').addEventListener('click',
      () => this.saveCurrentWindow()
    );
    document.getElementById('collections-list').addEventListener('click',
      (e) => this.handleCollectionClick(e)
    );

    // Load initial data
    await this.loadCollections();

    // Listen for updates from background
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'collection.created') {
        this.refreshCollections();
      }
    });
  }

  async saveCurrentWindow() {
    // Get current window (popup/sidepanel context)
    const currentWindow = await chrome.windows.getCurrent({ populate: true });

    // Get suggested name from tabs
    const name = this.suggestName(currentWindow.tabs);

    // Route through background → service
    const response = await chrome.runtime.sendMessage({
      action: 'createCollection',
      params: {
        name,
        links: currentWindow.tabs.map(tab => ({
          url: tab.url,
          title: tab.title,
          favicon: tab.favIconUrl,
          isPinned: tab.pinned
        }))
      },
      callerWindowId: currentWindow.id
    });

    if (response.success) {
      this.showNotification(`Saved "${name}" with ${currentWindow.tabs.length} links`);
      await this.loadCollections();
    }
  }

  async loadCollections() {
    // Get collections from background → selection service
    const response = await chrome.runtime.sendMessage({
      action: 'getCollections',
      filters: {} // Get all for now
    });

    if (response.success) {
      this.renderCollections(response.collections);
    }
  }

  renderCollections(collections) {
    // Pure presentation logic
    const container = document.getElementById('collections-list');
    container.innerHTML = collections.map(c => `
      <div class="collection-item" data-id="${c.id}">
        <span class="icon">${c.icon}</span>
        <div class="details">
          <h3>${c.name}</h3>
          <span class="meta">${c.links.length} links · ${c.state}</span>
        </div>
        <button class="activate-btn" data-action="activate">Open</button>
      </div>
    `).join('');
  }

  async handleCollectionClick(e) {
    const activateBtn = e.target.closest('[data-action="activate"]');
    if (!activateBtn) return;

    const collectionId = e.target.closest('.collection-item').dataset.id;

    // Get caller window ID
    const currentWindow = await chrome.windows.getCurrent();

    // Route through background → service
    const response = await chrome.runtime.sendMessage({
      action: 'activateWorkspace',
      collectionId,
      options: {
        openPinned: true,
        createNewWindow: false
      },
      callerWindowId: currentWindow.id
    });

    if (response.success) {
      this.showNotification(`Activated workspace`);
    }
  }

  suggestName(tabs) {
    // Simple name suggestion based on domain
    const domains = tabs.map(t => new URL(t.url).hostname);
    const topDomain = this.mostFrequent(domains);
    return topDomain.replace('www.', '');
  }

  mostFrequent(arr) {
    const counts = arr.reduce((acc, val) => {
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {});
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  }

  showNotification(message) {
    // Simple notification UI
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  const panel = new LinkStashPanel();
  panel.init();
});
```

### Dashboard Integration

```javascript
// dashboard/modules/views/collections.js
// THIN presentation layer

export async function loadCollectionsView() {
  // Get collections from background → selection service
  const response = await chrome.runtime.sendMessage({
    action: 'getCollections',
    filters: {} // Get all
  });

  if (response.success) {
    renderCollections(response.collections);
  }
}

function renderCollections(collections) {
  const container = document.getElementById('collectionsContainer');

  // Group by state
  const byState = {
    working: collections.filter(c => c.state === 'working'),
    active: collections.filter(c => c.state === 'active'),
    reference: collections.filter(c => c.state === 'reference'),
    dormant: collections.filter(c => c.state === 'dormant')
  };

  container.innerHTML = `
    <div class="collections-overview">
      ${renderStateSection('Working', byState.working)}
      ${renderStateSection('Active', byState.active)}
      ${renderStateSection('Reference', byState.reference)}
      ${renderStateSection('Dormant', byState.dormant)}
    </div>
  `;
}

function renderStateSection(title, collections) {
  if (collections.length === 0) return '';

  return `
    <section class="state-section">
      <h2>${title} <span class="count">${collections.length}</span></h2>
      <div class="collection-grid">
        ${collections.map(renderCollectionCard).join('')}
      </div>
    </section>
  `;
}

function renderCollectionCard(collection) {
  return `
    <div class="collection-card" data-id="${collection.id}">
      <div class="card-header">
        <span class="icon">${collection.icon}</span>
        <h3>${collection.name}</h3>
      </div>
      <div class="card-body">
        <p class="description">${collection.description || ''}</p>
        <div class="stats">
          <span>${collection.links.length} links</span>
          <span>${collection.metadata.tasks.filter(t => !t.completed).length} tasks</span>
        </div>
      </div>
      <div class="card-actions">
        <button data-action="activate">Activate</button>
        <button data-action="edit">Edit</button>
      </div>
    </div>
  `;
}
```

## Engine Integration

### Collections as Rule Targets

```javascript
// lib/commands/CollectionActions.js
// New action handlers for collections

export class CollectionActionHandler {
  static async register(actionManager) {
    actionManager.registerHandler('saveToCollection', async (command, context) => {
      const { createCollection } = await import('../services/execution/collections/createCollection.js');

      const tabs = context.tabs.filter(t => command.targetIds.includes(t.id));

      return await createCollection({
        name: command.params.collectionName,
        links: tabs.map(t => ({
          url: t.url,
          title: t.title,
          favicon: t.favIconUrl
        })),
        tags: command.params.tags || [],
        state: 'dormant'
      });
    });

    actionManager.registerHandler('addToCollection', async (command, context) => {
      const { addLinksToCollection } = await import('../services/execution/collections/addLinks.js');

      const tabs = context.tabs.filter(t => command.targetIds.includes(t.id));

      return await addLinksToCollection(command.params.collectionId, {
        links: tabs.map(t => ({
          url: t.url,
          title: t.title,
          favicon: t.favIconUrl
        }))
      });
    });
  }
}
```

### Rule Examples

```javascript
// Collections can be managed via rules
const COLLECTION_RULES = [
  {
    id: 'save-research-tabs',
    name: 'Auto-save research tabs to collection',
    enabled: true,
    conditions: {
      all: [
        { contains: ['tab.url', 'arxiv.org'] },
        { gt: ['tab.age', 3600000] } // 1 hour old
      ]
    },
    then: [{
      action: 'saveToCollection',
      collectionName: 'Research Papers',
      tags: ['research', 'auto-saved']
    }]
  },

  {
    id: 'add-to-project',
    name: 'Add project tabs to active collection',
    enabled: true,
    conditions: {
      any: [
        { contains: ['tab.url', 'github.com/myorg'] },
        { contains: ['tab.url', 'figma.com/project'] }
      ]
    },
    then: [{
      action: 'addToCollection',
      collectionId: 'active-project-123'
    }]
  }
];
```

## Integration with Tab Groups

### Converting Groups to Collections

```javascript
// services/execution/collections/convertGroupToCollection.js

/**
 * Convert a tab group to a collection
 * @param {number} groupId - Tab group ID
 * @param {Object} options
 * @param {boolean} [options.closeTabs=false] - Close tabs after converting
 * @param {number} [options.callerWindowId] - Window to restore focus to
 */
export async function convertGroupToCollection(groupId, options = {}) {
  const {
    closeTabs = false,
    callerWindowId = null
  } = options;

  // Get group info
  const group = await chrome.tabGroups.get(groupId);
  const tabs = await chrome.tabs.query({ groupId });

  const { createCollection } = await import('./createCollection.js');

  const collection = await createCollection({
    name: group.title || `Group ${groupId}`,
    links: tabs.map(tab => ({
      url: tab.url,
      title: tab.title,
      favicon: tab.favIconUrl,
      isPinned: tab.pinned
    })),
    tags: ['from-tab-group'],
    icon: '🗂️',
    state: 'dormant',
    callerWindowId
  });

  // Optionally close tabs
  if (closeTabs) {
    await chrome.tabs.remove(tabs.map(t => t.id));
  }

  console.log(`[convertGroupToCollection] Converted group "${group.title}" to collection`);

  return collection;
}
```

### Context Menu Integration

```javascript
// background-integrated.js
// Add context menu for tab groups

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'convert-group-to-collection',
    title: 'Save group as collection',
    contexts: ['page'],
    documentUrlPatterns: ['<all_urls>']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'convert-group-to-collection' && tab.groupId !== -1) {
    const { convertGroupToCollection } = await import('./services/execution/collections/convertGroupToCollection.js');

    await convertGroupToCollection(tab.groupId, {
      closeTabs: false
    });

    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: 'Collection Created',
      message: 'Tab group saved as collection'
    });
  }
});
```

## Migration Strategy

### Phase 1: Foundation (Aligned with V2 Architecture)
- [x] V2 Services architecture complete
- [x] Message passing pattern established
- [x] Window focus management patterns
- [ ] Add IndexedDB storage layer
- [ ] Create collection data models
- [ ] Implement UnifiedStorage service

### Phase 2: Core Collection Services
- [ ] Create `services/selection/selectCollections.js`
- [ ] Create `services/execution/collections/createCollection.js`
- [ ] Create `services/execution/collections/updateCollection.js`
- [ ] Add message handlers in background
- [ ] Test with existing TabMaster patterns

### Phase 3: Side Panel UI
- [ ] Create side panel HTML/CSS
- [ ] Implement LinkStashPanel (thin surface)
- [ ] Collection browser UI
- [ ] Quick save functionality
- [ ] Follow dashboard UI patterns

### Phase 4: Dashboard Integration
- [ ] Add Collections view to dashboard
- [ ] Reuse existing dashboard patterns
- [ ] Integrate with tabs/groups views
- [ ] Unified search across tabs + collections

### Phase 5: Workspace Features
- [ ] Implement `activateWorkspace.js` service
- [ ] Implement `saveWorkspaceState.js` service
- [ ] State capture (scroll, forms, etc.)
- [ ] Multi-window workspace support

### Phase 6: Rule Engine Integration
- [ ] Add collection actions to ActionManager
- [ ] Create CollectionActions.js handlers
- [ ] Test with existing rule scenarios
- [ ] Add collection-specific conditions

### Phase 7: Advanced Features
- [ ] Task system integration
- [ ] Scheduled workspace activation
- [ ] AI-powered organization (optional)
- [ ] Cloud sync (optional)

## Testing Strategy

Following V2 test patterns:

```javascript
// test/integration/collections.test.js

describe('Collection Services', () => {
  beforeEach(async () => {
    await storage.db.clear('collections');
  });

  test('should create collection from window', async () => {
    const window = await createTestWindow(5);

    const collection = await createCollection({
      name: 'Test Collection',
      links: window.tabs.map(t => ({
        url: t.url,
        title: t.title
      }))
    });

    expect(collection.links).toHaveLength(5);
    expect(collection.state).toBe('dormant');
  });

  test('should activate workspace in new window', async () => {
    const collection = await createTestCollection({
      links: [
        { url: 'https://example.com', isPinned: true },
        { url: 'https://test.com', isPinned: false }
      ]
    });

    const result = await activateWorkspace(collection.id, {
      openPinned: true,
      createNewWindow: true
    });

    expect(result.tabs).toHaveLength(1); // Only pinned
    expect(result.collection.state).toBe('working');
  });

  test('should restore focus after activation', async () => {
    const dashboardWindow = await chrome.windows.create({ focused: true });
    const collection = await createTestCollection();

    await activateWorkspace(collection.id, {
      createNewWindow: true,
      callerWindowId: dashboardWindow.id
    });

    const currentWindow = await chrome.windows.getCurrent();
    expect(currentWindow.id).toBe(dashboardWindow.id);
  });
});
```

## Summary

This updated architecture aligns LinkStash integration with our proven V2 patterns:

1. **Services-First**: All business logic in dedicated service modules
2. **Separation of Concerns**: Selection vs Execution services
3. **Thin Surfaces**: UI layers only handle presentation
4. **Message Passing**: All operations route through background
5. **Window Awareness**: Proper focus management from the start
6. **Single Source of Truth**: No duplicate implementations
7. **Engine Integration**: Collections work with unified rule engine

By following these patterns, we ensure LinkStash integrates seamlessly with TabMaster Pro's existing architecture while maintaining the quality and maintainability we've achieved in Phase 1.8.
