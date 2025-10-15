# TabTaskTick Data Models v2.0

**Architecture**: Normalized relational model using IndexedDB
**Database**: `TabTaskTickDB` v1
**Last Updated**: 2025-10-14

---

## Overview

TabTaskTick uses a **normalized data model** with 4 separate IndexedDB object stores connected by foreign keys, rather than nested documents. This architecture prevents race conditions on concurrent updates and enables efficient indexed queries.

### Why Normalized?

**Problem with nested documents**:
```javascript
// ❌ Nested approach (race conditions)
collection = {
  id: 'col_123',
  folders: [
    { id: 'folder_1', tabs: [{ id: 'tab_1', note: 'old' }] }
  ]
}

// Two surfaces update same collection simultaneously:
// Surface A: Updates tab note
// Surface B: Adds new folder
// Result: One update lost (last write wins)
```

**Solution with normalized model**:
```javascript
// ✅ Normalized approach (atomic updates)
// collections store
{ id: 'col_123', name: 'Project X' }

// folders store (FK: collectionId)
{ id: 'folder_1', collectionId: 'col_123' }

// tabs store (FK: folderId)
{ id: 'tab_1', folderId: 'folder_1', note: 'new' }

// Surface A: Updates only tab record (atomic)
// Surface B: Creates only folder record (atomic)
// Result: Both updates succeed independently
```

### Storage Architecture

**IndexedDB** (TabTaskTick data):
- `collections` - Persistent windows (active or saved)
- `folders` - Tab groups within collections
- `tabs` - Resources within folders
- `tasks` - Work items referencing tabs

**chrome.storage.local** (TabMaster legacy):
- Rules, settings, snooze metadata (unchanged)

---

## Database Schema

### Object Store: `collections`

**Purpose**: Persistent windows that can be active (open browser window) or saved (closed)

**Configuration**:
```javascript
{
  keyPath: 'id',
  indexes: {
    'isActive': { unique: false },           // Filter active vs saved
    'tags': { unique: false, multiEntry: true }, // Search by tags
    'lastAccessed': { unique: false }        // Sort by recency
  }
}
```

**Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Primary key, UUID v4 (`crypto.randomUUID()`) |
| `name` | string | ✅ | User-defined name, e.g., "Project X" |
| `description` | string |  | Optional description (markdown supported) |
| `icon` | string |  | Emoji icon, e.g., "📁" |
| `color` | string |  | Hex color code, e.g., "#4285F4" |
| `tags` | string[] | ✅ | Tags for filtering, e.g., ["work", "urgent"] (default: []) |
| `windowId` | number |  | Chrome window ID if active, null if saved |
| `isActive` | boolean | ✅ | true = browser window exists, false = saved |
| `metadata.createdAt` | number | ✅ | Timestamp (ms since epoch) |
| `metadata.lastAccessed` | number | ✅ | Timestamp of last activation/interaction |

**Indexes**:
- **isActive**: Enables fast filtering (active vs saved collections)
- **tags**: Multi-entry index for tag-based searches
- **lastAccessed**: Enables sorting by recency

**Example**:
```javascript
{
  id: 'col_a1b2c3d4',
  name: 'Authentication Project',
  description: 'OAuth 2.0 implementation and testing',
  icon: '🔐',
  color: '#EA4335',
  tags: ['work', 'backend', 'urgent'],
  windowId: 1234,
  isActive: true,
  metadata: {
    createdAt: 1702000000000,
    lastAccessed: 1702345600000
  }
}
```

---

### Object Store: `folders`

**Purpose**: Chrome tab groups within collections (topical organization)

**Configuration**:
```javascript
{
  keyPath: 'id',
  indexes: {
    'collectionId': { unique: false }  // FK to collections
  }
}
```

**Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Primary key, UUID v4 |
| `collectionId` | string | ✅ | **FK to collections.id** - parent collection |
| `name` | string | ✅ | Folder name, e.g., "Documentation" |
| `color` | string | ✅ | Chrome tab group color: 'grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange' |
| `collapsed` | boolean | ✅ | true = collapsed in Chrome UI (default: false) |
| `position` | number | ✅ | Order within collection (0-indexed) |

**Foreign Key**:
- `collectionId` → `collections.id` (many-to-one)
- **Cascade delete**: Deleting collection deletes all folders

**Indexes**:
- **collectionId**: Enables fast lookup of all folders in a collection

**Example**:
```javascript
{
  id: 'folder_x1y2z3',
  collectionId: 'col_a1b2c3d4',
  name: 'Documentation',
  color: 'blue',
  collapsed: false,
  position: 0
}
```

---

### Object Store: `tabs`

**Purpose**: Resources (web pages) within folders

**Configuration**:
```javascript
{
  keyPath: 'id',
  indexes: {
    'folderId': { unique: false }  // FK to folders
  }
}
```

**Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | **Storage ID** - Primary key, UUID v4 (persistent) |
| `folderId` | string | ✅ | **FK to folders.id** - parent folder |
| `url` | string | ✅ | Full URL, e.g., "https://oauth.net/2/" |
| `title` | string | ✅ | Page title from Chrome |
| `favicon` | string |  | Data URI or URL for favicon |
| `note` | string |  | User note (max 255 chars) |
| `position` | number | ✅ | Order within folder (0-indexed) |
| `isPinned` | boolean |  | Pinned status (default: false) |
| `lastAccess` | number |  | Timestamp of last access (optional) |
| `tabId` | number |  | **Runtime ID** - Chrome tab ID when collection is active (ephemeral) |

**Foreign Key**:
- `folderId` → `folders.id` (many-to-one)
- **Cascade delete**: Deleting folder deletes all tabs

**Indexes**:
- **folderId**: Enables fast lookup of all tabs in a folder

**Dual ID System**:
- **`id`**: Storage ID (persistent, UUID, survives window close/restore)
- **`tabId`**: Chrome tab ID (ephemeral, only valid when collection is active)

**Example**:
```javascript
{
  id: 'tab_m1n2o3p4',
  folderId: 'folder_x1y2z3',
  url: 'https://oauth.net/2/',
  title: 'OAuth 2.0 — OAuth',
  favicon: 'data:image/png;base64,iVBORw0KG...',
  note: 'Main spec - Section 4.1 for auth code flow',
  position: 0,
  isPinned: false,
  lastAccess: 1702340000000,
  tabId: 567  // Only present when collection is active
}
```

---

### Object Store: `tasks`

**Purpose**: Work items within collections, referencing specific tabs

**Configuration**:
```javascript
{
  keyPath: 'id',
  indexes: {
    'collectionId': { unique: false },
    'status': { unique: false },
    'priority': { unique: false },
    'dueDate': { unique: false },
    'tags': { unique: false, multiEntry: true },
    'createdAt': { unique: false }
  }
}
```

**Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Primary key, UUID v4 |
| `summary` | string | ✅ | Task summary, e.g., "Fix auth bug" |
| `notes` | string |  | Long-form notes (markdown supported) |
| `status` | string | ✅ | 'open', 'active', 'fixed', 'abandoned' (default: 'open') |
| `priority` | string | ✅ | 'low', 'medium', 'high', 'critical' (default: 'medium') |
| `dueDate` | number |  | Timestamp for due date (optional) |
| `tags` | string[] | ✅ | Tags for filtering, e.g., ["bug", "backend"] (default: []) |
| `collectionId` | string |  | **FK to collections.id** - parent collection (optional, null for uncategorized) |
| `tabIds` | string[] | ✅ | **Array of tab.id** - referenced tabs (default: []) |
| `comments` | Comment[] | ✅ | Array of comment objects (default: []) |
| `createdAt` | number | ✅ | Timestamp of creation |
| `completedAt` | number |  | Timestamp when marked fixed/abandoned (optional) |

**Foreign Key**:
- `collectionId` → `collections.id` (many-to-one, nullable)
- **Cascade delete**: Deleting collection deletes all tasks in that collection
- **Note**: Uncategorized tasks have `collectionId: null`

**Tab References**:
- `tabIds` → `tabs.id` (many-to-many via array)
- **No cascade**: Deleting task does NOT delete tabs
- **Validation**: All tab IDs should belong to tabs in the same collection (enforced by TaskService)

**Indexes**:
- **collectionId**: Filter tasks by collection
- **status**: Filter by task status (open, active, fixed, abandoned)
- **priority**: Filter by priority level
- **dueDate**: Sort by due date, filter overdue
- **tags**: Multi-entry index for tag-based searches
- **createdAt**: Sort by creation time

**Comment Structure** (embedded):
```typescript
interface Comment {
  id: string;        // UUID v4
  text: string;      // Comment content
  createdAt: number; // Timestamp
}
```

**Example**:
```javascript
{
  id: 'task_q1r2s3t4',
  summary: 'Fix authentication token expiry bug',
  notes: 'Users logged out after 5min. Extend token refresh window to 10min.',
  status: 'active',
  priority: 'high',
  dueDate: 1702432000000,
  tags: ['bug', 'backend', 'urgent'],
  collectionId: 'col_a1b2c3d4',
  tabIds: ['tab_m1n2o3p4', 'tab_u1v2w3x4', 'tab_y1z2a3b4'],
  comments: [
    {
      id: 'comment_c1d2e3f4',
      text: 'Narrowed down to token refresh logic in auth service',
      createdAt: 1702300000000
    }
  ],
  createdAt: 1702250000000,
  completedAt: null
}
```

---

## Foreign Key Relationships

### Entity Relationship Diagram

```
collections (1) ──┬──> folders (0..n)
                  │
                  └──> tasks (0..n)

folders (1) ────────> tabs (0..n)

tasks (1) ──────────> tabs (0..n) [via tabIds array]
```

### Cascade Delete Rules

**Deleting a Collection**:
1. Find all folders with `folderId = collectionId`
2. For each folder:
   - Find all tabs with `folderId = folder.id`
   - Delete all tabs
   - Delete folder
3. Find all tasks with `collectionId = collection.id`
4. Delete all tasks
5. Delete collection

**Implementation**:
```javascript
// In storage-queries.js
async function deleteCollection(id) {
  return withTransaction(['collections', 'folders', 'tabs', 'tasks'], 'readwrite', async (tx) => {
    // 1. Get all folders for this collection
    const folderStore = tx.objectStore('folders');
    const folderIndex = folderStore.index('collectionId');
    const folders = await getAllFromIndex(folderIndex, id);

    // 2. Delete all tabs in all folders
    const tabStore = tx.objectStore('tabs');
    for (const folder of folders) {
      const tabIndex = tabStore.index('folderId');
      const tabs = await getAllFromIndex(tabIndex, folder.id);
      for (const tab of tabs) {
        await tabStore.delete(tab.id);
      }
      await folderStore.delete(folder.id);
    }

    // 3. Delete all tasks in collection
    const taskStore = tx.objectStore('tasks');
    const taskIndex = taskStore.index('collectionId');
    const tasks = await getAllFromIndex(taskIndex, id);
    for (const task of tasks) {
      await taskStore.delete(task.id);
    }

    // 4. Delete collection
    await tx.objectStore('collections').delete(id);
  });
}
```

**Deleting a Folder**:
1. Find all tabs with `folderId = folder.id`
2. Delete all tabs
3. Delete folder

**Deleting a Tab**:
- No cascade (tabs are leaf nodes)
- Remove tab ID from any task.tabIds arrays (handled by TaskService)

**Deleting a Task**:
- No cascade (tasks don't own tabs)

---

## State Transitions

### Collection States

Collections have two primary states: **Active** (browser window exists) and **Saved** (window closed, state preserved).

```
┌─────────────────────────────────────────────────────────┐
│ SAVED COLLECTION                                        │
│ - windowId: null                                        │
│ - isActive: false                                       │
│ - All folders/tabs preserved in IndexedDB               │
└─────────────────────────────────────────────────────────┘
                        ↓
                 [User clicks "Open"]
                        ↓
            RestoreCollectionService.restoreCollection()
                        ↓
         - Creates new browser window
         - Recreates tab groups as folders
         - Updates windowId = <new window ID>
         - Updates isActive = true
                        ↓
┌─────────────────────────────────────────────────────────┐
│ ACTIVE COLLECTION                                       │
│ - windowId: 1234 (Chrome window ID)                    │
│ - isActive: true                                        │
│ - Tabs have tabId populated                            │
│ - Progressive sync on changes                          │
└─────────────────────────────────────────────────────────┘
                        ↓
              [User closes window]
                        ↓
        WindowService detects chrome.windows.onRemoved
                        ↓
         - Updates windowId = null
         - Updates isActive = false
         - Clears all tab.tabId fields
                        ↓
              [Back to SAVED state]
```

### Save Window as Collection

```
┌─────────────────────────────────────────────────────────┐
│ Regular Browser Window (Window #2)                      │
│ - Not tracked by TabTaskTick                           │
│ - Has 15 tabs in 3 tab groups                          │
└─────────────────────────────────────────────────────────┘
                        ↓
        [User clicks "Save Window as Collection"]
                        ↓
            CaptureWindowService.captureWindow()
                        ↓
         - Queries all tabs in window
         - Queries all tab groups
         - Creates collection with windowId=2, isActive=true
         - Creates folders from tab groups
         - Creates tabs from Chrome tabs
                        ↓
┌─────────────────────────────────────────────────────────┐
│ ACTIVE COLLECTION                                       │
│ - Bound to Window #2                                   │
│ - User can continue working                            │
│ - Progressive sync on tab/folder changes               │
│ - Closing window → becomes SAVED                       │
└─────────────────────────────────────────────────────────┘
```

### Task Tab Opening

```
┌─────────────────────────────────────────────────────────┐
│ TASK (in SAVED collection)                             │
│ - collectionId: 'col_123' (isActive: false)            │
│ - tabIds: ['tab_1', 'tab_2', 'tab_3']                 │
└─────────────────────────────────────────────────────────┘
                        ↓
              [User clicks "Open Tabs"]
                        ↓
          TaskExecutionService.openTaskTabs()
                        ↓
         - Detects collection is saved
         - Restores entire collection (creates window)
         - Focuses the 3 referenced tabs
                        ↓
┌─────────────────────────────────────────────────────────┐
│ TASK (in ACTIVE collection)                            │
│ - Collection now has windowId, isActive=true           │
│ - Referenced tabs have tabId populated                 │
│ - Tabs are focused in Chrome                           │
└─────────────────────────────────────────────────────────┘
```

---

## Tab ID Mapping

Tabs have **two ID systems** to handle the persistence/runtime duality:

### Storage ID (`id`)
- **Type**: string (UUID v4)
- **Scope**: Persistent across window close/restore
- **Purpose**: Foreign key references, task.tabIds array
- **Lifetime**: Exists until tab explicitly deleted from collection
- **Example**: `'tab_m1n2o3p4'`

### Runtime ID (`tabId`)
- **Type**: number (Chrome-assigned)
- **Scope**: Only valid while collection is active
- **Purpose**: Chrome API operations (focus, update, close)
- **Lifetime**: Created on window restore, cleared on window close
- **Example**: `567`

### Mapping Example

**When collection is active**:
```javascript
// IndexedDB tab record
{
  id: 'tab_m1n2o3p4',      // Storage ID (persistent)
  folderId: 'folder_x1y2z3',
  url: 'https://oauth.net/2/',
  title: 'OAuth 2.0',
  tabId: 567                // Chrome tab ID (ephemeral)
}

// Task referencing this tab
{
  id: 'task_q1r2s3t4',
  collectionId: 'col_a1b2c3d4',
  tabIds: ['tab_m1n2o3p4']  // Uses storage ID
}

// To focus tab in Chrome:
// 1. Look up tab by storage ID: tab = getTab('tab_m1n2o3p4')
// 2. Use Chrome tab ID: chrome.tabs.update(tab.tabId, { active: true })
```

**When collection is saved**:
```javascript
// IndexedDB tab record
{
  id: 'tab_m1n2o3p4',      // Storage ID (persistent)
  folderId: 'folder_x1y2z3',
  url: 'https://oauth.net/2/',
  title: 'OAuth 2.0',
  tabId: null               // No Chrome tab (window closed)
}

// Task still references tab by storage ID
{
  id: 'task_q1r2s3t4',
  collectionId: 'col_a1b2c3d4',
  tabIds: ['tab_m1n2o3p4']  // Persistent reference
}

// When user opens task:
// 1. RestoreCollectionService creates new window
// 2. Creates Chrome tab for tab_m1n2o3p4
// 3. Updates tab.tabId with new Chrome tab ID
// 4. Task reference still uses tab_m1n2o3p4 (unchanged)
```

### Sync Operations

**On window restore**:
```javascript
// For each tab in collection:
const chromeTab = await chrome.tabs.create({ url: tab.url, ... });
await updateTab(tab.id, { tabId: chromeTab.id }); // Map storage ID → Chrome ID
```

**On window close**:
```javascript
// For each tab in collection:
await updateTab(tab.id, { tabId: null }); // Clear Chrome ID
```

**On tab moved between folders** (user drags in Chrome UI):
```javascript
// Listen to chrome.tabs.onMoved
const storageTab = findTabByRuntimeId(chromeTabId); // Reverse lookup
await updateTab(storageTab.id, { position: newIndex });
```

---

## Example Data: Complete Collection

```javascript
// Collection
{
  id: 'col_a1b2c3d4',
  name: 'Authentication Project',
  description: 'OAuth 2.0 implementation and testing',
  icon: '🔐',
  color: '#EA4335',
  tags: ['work', 'backend', 'urgent'],
  windowId: 1234,
  isActive: true,
  metadata: {
    createdAt: 1702000000000,
    lastAccessed: 1702345600000
  }
}

// Folder 1
{
  id: 'folder_x1y2z3',
  collectionId: 'col_a1b2c3d4',
  name: 'Documentation',
  color: 'blue',
  collapsed: false,
  position: 0
}

// Tab 1 (in Folder 1)
{
  id: 'tab_m1n2o3p4',
  folderId: 'folder_x1y2z3',
  url: 'https://oauth.net/2/',
  title: 'OAuth 2.0 — OAuth',
  favicon: 'data:image/png;base64,...',
  note: 'Main spec - Section 4.1 for auth code flow',
  position: 0,
  isPinned: false,
  lastAccess: 1702340000000,
  tabId: 567
}

// Tab 2 (in Folder 1)
{
  id: 'tab_u1v2w3x4',
  folderId: 'folder_x1y2z3',
  url: 'https://datatracker.ietf.org/doc/html/rfc6749',
  title: 'RFC 6749 - OAuth 2.0 Authorization Framework',
  favicon: 'data:image/png;base64,...',
  note: 'Full RFC reference',
  position: 1,
  isPinned: false,
  tabId: 568
}

// Folder 2
{
  id: 'folder_g1h2i3',
  collectionId: 'col_a1b2c3d4',
  name: 'Development',
  color: 'red',
  collapsed: false,
  position: 1
}

// Tab 3 (in Folder 2)
{
  id: 'tab_y1z2a3b4',
  folderId: 'folder_g1h2i3',
  url: 'https://github.com/myorg/auth-service/pull/234',
  title: 'Fix token refresh timing by @username · Pull Request #234',
  favicon: 'data:image/png;base64,...',
  note: 'PR to review - changes to TokenService',
  position: 0,
  isPinned: false,
  tabId: 569
}

// Task
{
  id: 'task_q1r2s3t4',
  summary: 'Fix authentication token expiry bug',
  notes: 'Users logged out after 5min. Extend token refresh window to 10min.',
  status: 'active',
  priority: 'high',
  dueDate: 1702432000000,
  tags: ['bug', 'backend', 'urgent'],
  collectionId: 'col_a1b2c3d4',
  tabIds: ['tab_m1n2o3p4', 'tab_u1v2w3x4', 'tab_y1z2a3b4'],
  comments: [
    {
      id: 'comment_c1d2e3f4',
      text: 'Narrowed down to token refresh logic in auth service',
      createdAt: 1702300000000
    },
    {
      id: 'comment_j1k2l3m4',
      text: 'Testing fix in dev environment - looks good so far',
      createdAt: 1702310000000
    }
  ],
  createdAt: 1702250000000,
  completedAt: null
}
```

**Relationships**:
- Collection `col_a1b2c3d4` has 2 folders
- Folder `folder_x1y2z3` has 2 tabs (Documentation)
- Folder `folder_g1h2i3` has 1 tab (Development)
- Task `task_q1r2s3t4` belongs to collection and references all 3 tabs

---

## Query Patterns

### Get All Tabs for a Collection

```javascript
// 1. Get all folders in collection
const folders = await getFoldersByCollection(collectionId);

// 2. Get all tabs for each folder
const allTabs = [];
for (const folder of folders) {
  const tabs = await getTabsByFolder(folder.id);
  allTabs.push(...tabs);
}
```

### Get Active Collections

```javascript
// Use isActive index
const activeCollections = await getCollectionsByIndex('isActive', true);
```

### Get Tasks by Status for a Collection

```javascript
// Compound filter (uses collectionId + status indexes)
const allTasks = await getTasksByCollection(collectionId);
const openTasks = allTasks.filter(t => t.status === 'open');
```

### Reassemble Complete Collection Hierarchy

```javascript
async function getCompleteCollection(collectionId) {
  const collection = await getCollection(collectionId);
  const folders = await getFoldersByCollection(collectionId);

  // Enrich folders with tabs
  for (const folder of folders) {
    folder.tabs = await getTabsByFolder(folder.id);
  }

  // Get tasks
  const tasks = await getTasksByCollection(collectionId);

  return { ...collection, folders, tasks };
}
```

---

## Migration Strategy

### v1.0 → v2.0 (No Migration Needed)

TabTaskTick is a **new feature** in TabMaster Pro v1.3.0:
- No existing data to migrate
- TabMaster data (rules, settings, snooze) stays in chrome.storage.local
- IndexedDB starts empty on first install

### Future Schema Changes

When schema updates are needed (e.g., v2 → v3):

```javascript
// db.js - version upgrade handler
const DB_VERSION = 2;

db.onupgradeneeded = (event) => {
  const db = event.target.result;
  const oldVersion = event.oldVersion;

  if (oldVersion < 2) {
    // Add new index to collections
    const collectionStore = event.currentTarget.transaction.objectStore('collections');
    collectionStore.createIndex('archived', 'archived', { unique: false });
  }
};
```

---

## Architecture Compliance

### ✅ Normalized Model Benefits

1. **Atomic Updates**: Updating one tab doesn't require loading entire collection
2. **Transaction Control**: IndexedDB transactions handle concurrent access
3. **Query Performance**: Indexes enable O(log n) lookups instead of O(n) scans
4. **Data Integrity**: Foreign keys enforce referential integrity
5. **Scalability**: Handles 100+ collections, 1000+ tasks efficiently

### ✅ Service Layer Separation

- **Storage utilities** (`db.js`, `storage-queries.js`) handle CRUD only
- **Execution services** (`CollectionService`, `TaskService`) add business logic
- **Selection services** use indexes for efficient filtering
- **Orchestration services** coordinate complex workflows

### ✅ State Management

- `isActive` field tracks collection state (active vs saved)
- `tabId` field handles runtime Chrome mapping
- Window close/restore triggers state transitions
- Progressive sync keeps IndexedDB current during active sessions

---

## Summary

TabTaskTick's normalized data model provides:
- **4 object stores**: collections, folders, tabs, tasks
- **Foreign key relationships**: collectionId, folderId, tabIds
- **Cascade deletes**: collection → folders → tabs, collection → tasks
- **Dual ID system**: storage ID (persistent) + Chrome tabId (ephemeral)
- **Indexed queries**: Fast filtering by isActive, status, tags, etc.
- **State transitions**: active ↔ saved via window binding

This architecture supports efficient operations at scale (100+ collections, 1000+ tasks) while maintaining data integrity through IndexedDB transactions.

---

**Next Phase**: Implement IndexedDB utilities (`db.js`, `storage-queries.js`)
