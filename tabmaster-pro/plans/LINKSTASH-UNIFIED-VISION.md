# LinkStash: Unified Vision - Living Collections

## Core Concept: Collections with States

A **Collection** is a group of related links that can exist in different states of activity. It's not binary (bookmark vs workspace) but a spectrum of engagement.

```typescript
interface Collection {
  // Identity
  id: string;
  name: string;
  description?: string;

  // Visual & Organization
  icon: string;                    // Emoji or icon
  color: string;                   // Visual identifier
  tags: string[];                  // For finding collections
  parent?: string;                 // Collections can nest

  // The Links
  links: CollectionLink[];

  // State Management
  state: 'dormant' | 'reference' | 'active' | 'working';

  // Rich Context
  metadata: {
    notes: string;                // Markdown notes for the collection
    tasks: Task[];                // Integrated task list
    screenshots: string[];        // Visual memory aids
    createdAt: number;
    lastAccessed: number;
    accessCount: number;
  };

  // Working State (when active/working)
  workingState?: {
    openTabs: Map<string, TabState>;  // Which links are currently open
    focusedUrl: string;                // Last active tab
    windowId?: number;                 // Associated window if any
    splitView?: SplitConfig;          // Side-by-side tabs config
  };

  // Intelligence
  rules?: CollectionRule[];         // Auto-organization rules
  schedule?: Schedule;              // Time-based activation
  triggers?: Trigger[];             // Event-based activation
}

interface CollectionLink {
  // Core
  id: string;
  url: string;
  title: string;

  // Metadata
  favicon?: string;
  description?: string;
  notes?: string;                  // Link-specific notes
  highlights?: string[];           // Captured text

  // State in collection
  role: 'primary' | 'reference' | 'related' | 'archive';
  isPinned: boolean;               // Always restore when activating
  position?: number;               // Order in collection

  // Working state
  tabState?: {
    isOpen: boolean;
    tabId?: number;
    scrollY?: number;
    formData?: any;
    lastAccessed?: number;
  };

  // Tasks can reference links
  taskRefs?: string[];             // Task IDs that reference this link
}

interface Task {
  id: string;
  text: string;
  completed: boolean;

  // Link to specific tabs/links
  linkRefs?: string[];             // Related links

  // Context
  createdAt: number;
  completedAt?: number;
  dueDate?: number;

  // Smart features
  autoOpen?: string[];             // Links to open when starting task
  autoClose?: string[];            // Links to close when completing
}
```

## Collection States Explained

### 1. **Dormant** - Pure Bookmark Collection
- Just saved links with metadata
- No active tabs
- Minimal memory footprint
- Example: "React Resources" - 50 links you've collected over time

### 2. **Reference** - Quick Access Collection
- Frequently accessed but not kept open
- Quick open/close pattern
- Cached for fast access
- Example: "Daily Sites" - News, email, weather you check briefly

### 3. **Active** - Live Collection
- Some or all links are open tabs
- Maintains tab state
- Can be quickly hidden/shown
- Example: "Current Research" - 10 tabs you're actively reading

### 4. **Working** - Full Workspace Mode
- All features active
- Task list engaged
- Form data preserved
- Split views configured
- Example: "Project X Development" - IDE, docs, tickets, with active todos

## State Transitions

```javascript
class CollectionManager {
  // Dormant → Reference (user starts accessing frequently)
  async promoteToReference(collectionId) {
    const collection = await this.get(collectionId);

    // Pre-cache favicons and metadata
    await this.preloadCollection(collection);

    // Add to quick access panel
    await this.addToQuickAccess(collection);

    collection.state = 'reference';
  }

  // Reference → Active (user opens multiple links)
  async activate(collectionId, options = {}) {
    const collection = await this.get(collectionId);

    if (options.openAll) {
      // Open all pinned links
      for (const link of collection.links.filter(l => l.isPinned)) {
        const tab = await chrome.tabs.create({ url: link.url });
        link.tabState = {
          isOpen: true,
          tabId: tab.id,
          lastAccessed: Date.now()
        };
      }
    } else if (options.openSpecific) {
      // Open specific links
      for (const linkId of options.linkIds) {
        await this.openLink(collectionId, linkId);
      }
    }

    collection.state = 'active';
    collection.workingState = {
      openTabs: new Map(),
      focusedUrl: collection.links[0]?.url
    };
  }

  // Active → Working (user starts task)
  async startWorking(collectionId, taskId) {
    const collection = await this.get(collectionId);
    const task = collection.metadata.tasks.find(t => t.id === taskId);

    // Open task-related links
    if (task.autoOpen) {
      for (const linkId of task.autoOpen) {
        await this.openLink(collectionId, linkId);
      }
    }

    // Set up working environment
    collection.state = 'working';

    // Start tracking detailed state
    this.startStateTracking(collectionId);

    // Show task panel
    await this.showTaskPanel(collectionId, taskId);
  }

  // Working → Active (task complete, but keep browsing)
  async pauseWorking(collectionId) {
    const collection = await this.get(collectionId);

    // Save all form data and scroll positions
    await this.captureDetailedState(collection);

    // Keep tabs open but stop intensive tracking
    collection.state = 'active';
    this.stopStateTracking(collectionId);
  }

  // Active → Dormant (close all tabs)
  async deactivate(collectionId, options = {}) {
    const collection = await this.get(collectionId);

    if (options.preserveState) {
      // Capture everything before closing
      await this.captureDetailedState(collection);
    }

    // Close all tabs
    for (const link of collection.links) {
      if (link.tabState?.tabId) {
        await chrome.tabs.remove(link.tabState.tabId);
        link.tabState.isOpen = false;
        link.tabState.tabId = null;
      }
    }

    collection.state = 'dormant';
    collection.workingState = null;
  }
}
```

## Unified UI Approach

### Side Panel Design
```
┌────────────────────────────────────┐
│ LinkStash  [+Collection] [⚙] [?]  │
├────────────────────────────────────┤
│ 🔍 Search everything...            │
├────────────────────────────────────┤
│ WORKING ────────────────────       │
│ 🔴 Project X (12 tabs) ✓3/8 tasks │
│   📍 API Docs                      │
│   📍 GitHub PR #234                │
│   ☐ Fix auth bug → [open tabs]    │
│   ☐ Update tests                   │
├────────────────────────────────────┤
│ ACTIVE ─────────────────────       │
│ 🟢 Research (8 tabs)               │
│ 🔵 Shopping (4 tabs)               │
├────────────────────────────────────┤
│ REFERENCE ──────────────────       │
│ ⚡ Daily Sites (click to open)     │
│ ⚡ Dev Tools                       │
├────────────────────────────────────┤
│ COLLECTIONS ────────────────       │
│ 📁 React Learning (48 links)       │
│ 📁 House Renovation (23 links)     │
│ 📁 Recipes (31 links)             │
│ 📂 Work                            │
│   📁 Q4 Planning (12 links)       │
│   📁 Team Resources (8 links)     │
└────────────────────────────────────┘
```

### Collection View (Expanded)
```
┌────────────────────────────────────┐
│ 🔴 Project X                       │
│ ────────────────────────────────── │
│ "Implementing new auth system"      │
│                                    │
│ TASKS (3/8) ──────────             │
│ ✓ Set up OAuth provider            │
│ ✓ Create login component           │
│ ✓ Add session management           │
│ ☐ Fix auth bug [→ 2 tabs]         │
│ ☐ Update tests                     │
│ ☐ Documentation                    │
│                                    │
│ LINKS (12) ───────────             │
│ 📍 [📑] API Documentation          │
│     Last viewed: 10 min ago        │
│     "Check section on JWT..."      │
│                                    │
│ 📍 [🐙] GitHub PR #234             │
│     Form data saved                │
│                                    │
│ 📎 [📚] Auth Best Practices        │
│     3 highlights saved             │
│                                    │
│ 📎 [🎥] Tutorial Video             │
│     Timestamp: 12:34               │
│                                    │
│ [+ Add Link] [+ Add Task]          │
└────────────────────────────────────┘
```

## Key Hybrid Features

### 1. Smart Window Management
```javascript
// One window can host multiple collections
class WindowManager {
  async switchCollection(fromId, toId) {
    const window = await chrome.windows.getCurrent();

    // Save state of current collection
    await this.saveCollectionState(fromId, window);

    // Close current tabs
    const currentTabs = await chrome.tabs.query({ windowId: window.id });
    await chrome.tabs.remove(currentTabs.map(t => t.id));

    // Open new collection
    const toCollection = await this.get(toId);
    for (const link of toCollection.links.filter(l => l.isPinned)) {
      await chrome.tabs.create({
        windowId: window.id,
        url: link.url
      });
    }

    // Update window association
    toCollection.workingState.windowId = window.id;
  }
}
```

### 2. Task-Driven Workflow
```javascript
class TaskManager {
  // Tasks can span multiple collections
  async createCrossCollectionTask(task) {
    // Example: "Research and implement feature X"
    // Links from "Research" collection AND "Dev" collection

    task.linkRefs = [
      'research/link1',
      'research/link2',
      'dev/link3'
    ];

    task.autoOpen = task.linkRefs; // Open all when starting

    // Add task to relevant collections
    for (const ref of task.linkRefs) {
      const [collectionId, linkId] = ref.split('/');
      await this.addTaskToCollection(collectionId, task);
    }
  }

  async completeTask(taskId) {
    const task = await this.get(taskId);

    // Auto-close related tabs
    for (const linkRef of task.autoClose || []) {
      await this.closeLink(linkRef);
    }

    // Move collection state if all tasks done
    const collection = await this.getCollection(task.collectionId);
    if (collection.metadata.tasks.every(t => t.completed)) {
      await this.transitionState(collection.id, 'active', 'reference');
    }
  }
}
```

### 3. Intelligent Categorization
```javascript
class IntelligentOrganizer {
  async suggestCollectionForTab(tab) {
    // Check if tab belongs to existing collection
    const collections = await this.getAllCollections();

    for (const collection of collections) {
      // URL match
      if (collection.links.some(l => l.url === tab.url)) {
        return collection;
      }

      // Domain match
      const domain = new URL(tab.url).hostname;
      if (collection.rules?.some(r => r.domain === domain)) {
        return collection;
      }

      // Smart similarity
      const similarity = await this.calculateSimilarity(tab, collection);
      if (similarity > 0.7) {
        return collection;
      }
    }

    // Suggest new collection
    return this.suggestNewCollection(tab);
  }

  async autoOrganizeWindow() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const groups = await this.clusterTabs(tabs);

    return groups.map(group => ({
      suggestedName: this.generateName(group),
      tabs: group,
      confidence: this.calculateConfidence(group)
    }));
  }
}
```

### 4. Progressive Enhancement
```javascript
// Start simple, grow complex
class ProgressiveCollection {
  // Level 1: Just save a link
  async quickSave(url, title) {
    return {
      links: [{ url, title }],
      state: 'dormant'
    };
  }

  // Level 2: Save with context
  async saveWithContext(url, title, notes) {
    return {
      links: [{ url, title, notes }],
      metadata: { notes },
      state: 'dormant'
    };
  }

  // Level 3: Save as part of task
  async saveWithTask(url, title, taskText) {
    return {
      links: [{ url, title }],
      metadata: {
        tasks: [{
          text: taskText,
          linkRefs: [url]
        }]
      },
      state: 'reference'
    };
  }

  // Level 4: Full workspace
  async createWorkspace(name, tabs, tasks) {
    return {
      name,
      links: tabs.map(t => ({
        url: t.url,
        title: t.title,
        tabState: { isOpen: true, tabId: t.id }
      })),
      metadata: { tasks },
      state: 'working',
      workingState: {
        openTabs: new Map(tabs.map(t => [t.url, t])),
        windowId: tabs[0].windowId
      }
    };
  }
}
```

## Migration Strategy

### For Window Hoarders
1. **Capture**: "Save this window as collection"
2. **Enhance**: Add tasks to make it a workspace
3. **Trust**: Show state preservation works
4. **Replace**: Close window, use collection

### For Bookmark Traditionalists
1. **Import**: Bring in existing bookmarks
2. **Organize**: Auto-create collections
3. **Activate**: Show collections can become workspaces
4. **Engage**: Add tasks and notes

### For Tab Hoarders
1. **Group**: Auto-detect related tabs
2. **Save**: One-click collection creation
3. **Close**: Show easy restoration
4. **Manage**: Use tasks to track why tabs were open

## Success Metrics

### Behavior Change
- Collections in active/working state: >3 per user
- Average open tabs: <15 (from 50+)
- Collection switches per day: >5
- Tasks completed: >50%

### User Satisfaction
- "I can finally close tabs without anxiety"
- "My browser is fast again"
- "I can find things from last month"
- "Projects feel organized"

## Conclusion

This hybrid approach unifies bookmarks and workspaces into a single concept: **Living Collections**. They can be as simple as a bookmark folder or as complex as a full workspace with tasks, state preservation, and automation.

The key insight is that **organization and activity are orthogonal** - you can have:
- Organized but inactive (traditional bookmarks)
- Active but disorganized (current tab chaos)
- **Organized AND active (Living Collections)**

This solves both problems:
1. **Window hoarding**: Collections replace windows as organizational units
2. **Dead bookmarks**: Collections can wake up into full workspaces

The progressive nature means users can start simple and grow into power features as needed, making adoption smooth and natural.