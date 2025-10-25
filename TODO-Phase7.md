# TabMaster Pro - TODO

## Phase 7 Architecture Refactoring (CRITICAL)

**Context**: Phase 7 dashboard integration was implemented in commit `6fa2c64` with +988 insertions. The architecture-guardian agent reviewed the code and identified critical technical debt that must be addressed before merging to main.

**Architecture Score**: 7/10 - Good implementation but needs refactoring to prevent maintenance burden.

---

### MUST FIX Before Merge

#### 1. Extract Modal Service (HIGH PRIORITY)

**Problem**: Modal creation logic is duplicated across multiple files:
- `dashboard/modules/views/collections.js`: Lines 711-751 (createCollectionDetailsModal)
- `dashboard/modules/views/collections.js`: Lines 791-870 (createEditCollectionModal)
- `dashboard/modules/views/tasks-base.js`: Lines 170-254 (createTaskDetailModal)

**Why It Matters**: Violates DRY principle, creates inconsistent behavior, increases maintenance burden.

**Required Action**:

Create `/dashboard/modules/core/modal-service.js`:

```javascript
// Modal Service - Centralized modal management
class ModalService {
  constructor() {
    this.modals = new Map();
  }

  create(config) {
    const { id, title, size = 'md', body, footer, onClose } = config;

    if (this.modals.has(id)) {
      return this.modals.get(id);
    }

    const modal = this.buildModal(config);
    this.modals.set(id, modal);
    return modal;
  }

  buildModal({ id, title, size, body, footer }) {
    const modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content modal-${size}">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="close-btn" data-modal-close="${id}">&times;</button>
        </div>
        <div class="modal-body">
          ${body}
        </div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    `;

    document.body.appendChild(modal);
    this.attachEventListeners(modal, id);
    return modal;
  }

  attachEventListeners(modal, id) {
    // Close button
    modal.querySelector(`[data-modal-close="${id}"]`)?.addEventListener('click', () => {
      this.hide(id);
    });

    // Backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.hide(id);
      }
    });
  }

  show(id) {
    const modal = this.modals.get(id);
    if (modal) modal.style.display = 'flex';
  }

  hide(id) {
    const modal = this.modals.get(id);
    if (modal) modal.style.display = 'none';
  }

  updateBody(id, bodyHtml) {
    const modal = this.modals.get(id);
    if (modal) {
      const body = modal.querySelector('.modal-body');
      if (body) body.innerHTML = bodyHtml;
    }
  }
}

export default new ModalService();
```

**Then refactor**:
- `collections.js`: Replace createCollectionDetailsModal/createEditCollectionModal with modalService.create()
- `tasks-base.js`: Replace createTaskDetailModal with modalService.create()

---

#### 2. Extract Emoji Data from View Layer (HIGH PRIORITY)

**Problem**: 120+ emoji definitions hardcoded in `collections.js` (lines 867-884).

**Why It Matters**: View layer should not contain data definitions. This makes the emoji picker non-reusable.

**Required Action**:

Create `/dashboard/modules/data/emoji-data.js`:

```javascript
// Emoji Data - Organized by category
export const EMOJI_CATEGORIES = {
  folders: {
    name: 'Folders & Files',
    emojis: ['📁', '📂', '🗂️', '📋', '📄', '📃', '📑', '🗃️', '🗄️', '📦', '📇', '🗳️', '📰', '📚', '📖']
  },
  work: {
    name: 'Work & Productivity',
    emojis: ['💼', '🏢', '📊', '📈', '📉', '💰', '💵', '💳', '🏦', '📞', '📱', '💻', '⌨️', '🖥️', '🖨️', '📠', '✉️', '📧', '📮', '📬', '📭', '📪', '🗒️', '📝', '✏️', '✒️', '🖊️', '🖋️', '📌', '📍', '🔖', '🏷️']
  },
  dev: {
    name: 'Development & Tech',
    emojis: ['💻', '🖥️', '⌨️', '🖱️', '🖲️', '💾', '💿', '📀', '🔌', '🔋', '🔧', '🔨', '⚙️', '🛠️', '⚡', '🔥', '💡', '🔍', '🔎', '🧪', '🧬', '🚀', '🛸', '🤖', '👾', '🎮', '🕹️']
  },
  misc: {
    name: 'Miscellaneous',
    emojis: ['🎯', '📌', '⭐', '✨', '🌟', '💫', '🔔', '🔕', '🎨', '🎭', '🎪', '🎬', '🎤', '🎧', '🎵', '🎶', '📻', '📺', '📷', '📸', '🔐', '🔒', '🔓', '🔑', '🗝️', '🏆', '🥇', '🥈', '🥉', '🎖️', '🏅', '🎗️', '🎀', '🎁', '🎉', '🎊', '🎈', '❤️', '💙', '💚', '💛', '🧡', '💜', '🖤', '🤍', '🤎', '💖', '💝']
  }
};
```

**Then update** `collections.js`:
```javascript
import { EMOJI_CATEGORIES } from '../data/emoji-data.js';
```

---

### SHOULD FIX (Can be follow-up PR)

#### 3. Extract Collection/Task Formatters

**Problem**: Complex rendering logic (700+ lines) in `collections.js` lines 557-709 (renderCollectionDetails).

**Why It Matters**: Views should be thin; business logic should be in services.

**Recommended Action**:

Create `/services/utils/formatters/collectionFormatter.js`:

```javascript
export function formatCollectionDetails(collection) {
  return {
    header: formatHeader(collection),
    metadata: formatMetadata(collection),
    tabs: formatTabs(collection.tabs || []),
    folders: formatFolders(collection.folders || []),
    tasks: formatTasks(collection.tasks || [])
  };
}

function formatHeader(collection) {
  return {
    icon: collection.icon || '📁',
    color: collection.color || '#667eea',
    name: collection.name,
    description: collection.description || ''
  };
}

function formatMetadata(collection) {
  return {
    status: collection.isActive ? '🟢 Active' : '💾 Saved',
    windowId: collection.windowId,
    created: collection.createdAt ? new Date(collection.createdAt).toLocaleString() : 'Unknown',
    lastAccessed: collection.metadata?.lastAccessed || 'Never',
    tabCount: collection.tabs?.length || 0,
    folderCount: collection.folders?.length || 0,
    taskCount: collection.tasks?.length || 0
  };
}

// ... more formatter functions
```

Create `/services/utils/formatters/taskFormatter.js`:

```javascript
const PRIORITY_COLORS = {
  critical: '#f5576c',
  high: '#fa709a',
  medium: '#667eea',
  low: '#4facfe'
};

const STATUS_COLORS = {
  open: '#667eea',
  active: '#4facfe',
  fixed: '#43e97b',
  abandoned: '#999'
};

export function formatTaskBadges(task) {
  return {
    priority: {
      color: PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium,
      label: task.priority
    },
    status: {
      color: STATUS_COLORS[task.status] || STATUS_COLORS.open,
      label: task.status
    },
    dueDate: formatDueDate(task.dueDate)
  };
}

function formatDueDate(dueDate) {
  if (!dueDate) return null;

  const due = new Date(dueDate);
  const now = new Date();
  const isOverdue = due < now;

  return {
    text: due.toLocaleDateString(),
    isOverdue,
    timeAgo: getTimeAgo(due.getTime())
  };
}
```

---

#### 4. Centralize Theme Configuration

**Problem**: Colors defined inline in multiple places (collections.js, tasks-kanban.js, tasks-list.js).

**Recommended Action**:

Create `/dashboard/modules/core/theme-config.js`:

```javascript
export const THEME = {
  colors: {
    priority: {
      critical: '#f5576c',
      high: '#fa709a',
      medium: '#667eea',
      low: '#4facfe'
    },
    status: {
      open: '#667eea',
      active: '#4facfe',
      fixed: '#43e97b',
      abandoned: '#999'
    },
    collection: {
      default: '#667eea'
    }
  },

  getBadgeStyle(type, value) {
    const color = this.colors[type]?.[value] || '#667eea';
    return {
      backgroundColor: color,
      color: 'white'
    };
  }
};
```

---

## Implementation Checklist

Before merging Phase 7 to main:

- [ ] Create `/dashboard/modules/core/modal-service.js`
- [ ] Refactor `collections.js` to use ModalService
- [ ] Refactor `tasks-base.js` to use ModalService
- [ ] Create `/dashboard/modules/data/emoji-data.js`
- [ ] Update `collections.js` to import emoji data
- [ ] Test all modals still work correctly
- [ ] Test emoji picker still works correctly
- [ ] Commit refactoring changes

Optional (can be separate PR):

- [ ] Create `/services/utils/formatters/collectionFormatter.js`
- [ ] Create `/services/utils/formatters/taskFormatter.js`
- [ ] Create `/dashboard/modules/core/theme-config.js`
- [ ] Refactor views to use formatter services
- [ ] Remove inline color definitions

---

## Files to Modify

**Critical**:
- `dashboard/modules/views/collections.js` (refactor modal creation, extract emoji data)
- `dashboard/modules/views/tasks-base.js` (refactor modal creation)

**Optional**:
- `dashboard/modules/views/tasks-kanban.js` (use theme config)
- `dashboard/modules/views/tasks-list.js` (use theme config)

---

## Testing After Refactoring

1. **Modal Service**:
   - [ ] Collection edit modal opens and closes
   - [ ] Collection details modal opens and closes
   - [ ] Task detail modal opens and closes
   - [ ] Backdrop clicks close modals
   - [ ] Close buttons work
   - [ ] Multiple modals can exist simultaneously

2. **Emoji Picker**:
   - [ ] Emoji categories switch correctly
   - [ ] Emoji selection updates current emoji
   - [ ] Selected emoji persists when saving

3. **Overall**:
   - [ ] No console errors
   - [ ] All existing functionality works
   - [ ] Code is cleaner and more maintainable

---

## Architecture Principles (Reminder)

From CLAUDE.md:

1. **One Behavior**: Same functionality across all surfaces
2. **Services-First**: All logic lives in shared services; surfaces are thin
3. **No Magic**: Every side effect is an explicit call
4. **Deterministic**: Same inputs → same outputs
5. **Maintainable**: Small PRs, strong tests, clear docs, remove dead code immediately
6. **Separation of Concerns**: Selection (what) separate from Execution (how)

**The current Phase 7 implementation violates #2 (services-first) by having too much logic in views.**

---

## Next Steps

1. Create a new branch: `refactor/phase7-architecture-cleanup`
2. Implement the critical fixes (modal service + emoji data)
3. Test thoroughly
4. Commit with message: `refactor(dashboard): Extract modal service and emoji data to improve architecture`
5. Merge to Phase 7 branch
6. Then merge Phase 7 to main

---

## References

- Architecture review: See git commit `6fa2c64`
- Agent review score: 7/10
- CLAUDE.md: Core architecture principles
- Critical violations: Modal duplication, data in views
