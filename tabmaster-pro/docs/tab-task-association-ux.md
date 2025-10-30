# Tab-Task Association UX Design

**Status**: Documented, Ready for Implementation
**Created**: 2025-10-29
**UX Review**: Completed with ux-architect agent

## Overview

This document specifies the UX design for associating tasks with browser tabs in TabMaster Pro. The design addresses the challenge of making tab associations discoverable and useful in an environment with 500+ tabs.

## User Problem

Users need to create tasks that reference specific browser tabs (e.g., "Fix issue on this GitHub page", "Review this documentation"). Current implementation:
- Tasks have `tabIds: []` field in data model
- NO UI exists to populate this field
- Tab references always empty on creation

## Design Goals

1. **Simplicity**: Make the common case (current tab) trivial
2. **Discoverability**: Make it obvious how to associate tabs
3. **Resilience**: Handle closed/moved tabs gracefully
4. **Scalability**: Don't overwhelm users with 500+ tabs
5. **Future-proof**: Allow evolution to multi-tab selection

## UX Architect Recommendation

**Pattern**: Smart Default with Explicit Override

### Core Insight
> "When I'm creating a task from the side panel I'd expect to be able to associate it with the **current tab in the window view** or none at all (i.e., it's not so much a multi-select as a toggle)."

### Mental Model
Tasks are **about** tabs (concrete work on web resources), not abstract to-dos. Tab association is **context metadata**, not a primary organizing principle.

### Navigation Philosophy
- **One-way**: Tasks reference tabs (click to open)
- **Not bidirectional**: Tabs don't show associated tasks
- **Findable via collections**: Tasks remain discoverable through collections

## Implementation Specification

### Phase 1: Current Tab Only (MVP)

#### User Flow

1. User opens side panel while viewing `github.com/project/issues/123`
2. Clicks "+ New Task" button
3. Modal opens with **current tab pre-associated**:
   ```
   ┌─────────────────────────────────┐
   │ Create New Task                 │
   ├─────────────────────────────────┤
   │ Summary: [________________]     │
   │                                 │
   │ Context:                        │
   │ ┌─────────────────────────┐     │
   │ │ 🌐 Issue #123 - Project × │   │ ← Pre-filled chip
   │ └─────────────────────────┘     │
   │ ↳ Quick access to this tab      │ ← Helper text
   │                                 │
   │ Notes: [____________________]   │
   │ Priority: [Medium ▼]            │
   │ Collection: [Work ▼]            │
   │ Due Date: [____________]        │
   │ Tags: [____________________]    │
   │                                 │
   │ [Cancel]  [Create Task]         │
   └─────────────────────────────────┘
   ```

4. User can:
   - **Keep association**: Click "Create Task" (most common)
   - **Remove association**: Click (×) on chip, shows "+ Link to current tab" button
   - **Re-add association**: Click "+ Link to current tab" button

5. Task saves with tab reference

#### UI States

**State 1: Linked (Default)**
```html
<div class="tab-association-section">
  <label class="section-label">Context</label>
  <div class="tab-chip-container">
    <div class="tab-chip active">
      <img class="favicon" src="https://github.com/favicon.ico" width="16" height="16">
      <span class="tab-title">Issue #123 - Project Name</span>
      <button class="remove-btn" aria-label="Remove tab association">×</button>
    </div>
  </div>
  <p class="helper-text">Quick access to this tab</p>
</div>
```

**State 2: Unlinked**
```html
<div class="tab-association-section">
  <label class="section-label">Context</label>
  <div class="tab-chip-container empty">
    <button class="add-current-tab-btn subtle">
      <span class="icon">🔗</span>
      <span>Link to current tab</span>
    </button>
  </div>
</div>
```

**State 3: Tab Closed (Ghost Reference)**
```html
<div class="tab-chip inactive">
  <span class="tab-icon">🔗</span>
  <span class="tab-title dimmed">Issue #123 - Project</span>
  <span class="status-badge" title="Tab was closed">Closed</span>
  <button class="remove-btn">×</button>
</div>
```

#### CSS Styling

```css
.tab-association-section {
  margin: 16px 0;
}

.section-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.tab-chip-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tab-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #E3F2FD;
  border: 1px solid #90CAF9;
  border-radius: 6px;
  max-width: 100%;
  transition: background 0.2s ease;
}

.tab-chip:hover {
  background: #BBDEFB;
}

.tab-chip.inactive {
  background: #F5F5F5;
  border-color: #E0E0E0;
}

.tab-chip .favicon {
  flex-shrink: 0;
}

.tab-chip .tab-title {
  flex: 1;
  font-size: 13px;
  color: #1565C0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-chip.inactive .tab-title {
  color: #757575;
}

.tab-chip .remove-btn {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: #1565C0;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.2s ease;
}

.tab-chip .remove-btn:hover {
  opacity: 1;
}

.add-current-tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: transparent;
  border: 1px dashed #BDBDBD;
  border-radius: 6px;
  color: #757575;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.add-current-tab-btn:hover {
  background: #F5F5F5;
  border-color: #90CAF9;
  color: #1565C0;
}

.helper-text {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 4px 0 0 0;
}

.status-badge {
  padding: 2px 6px;
  background: #FFF3E0;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  color: #E65100;
}
```

### Data Model Extension

**Current Model**:
```javascript
{
  id: 'task_123',
  summary: 'Fix bug',
  tabIds: ['tab_456']  // Just IDs, no resilience
}
```

**New Model** (Snapshot Storage):
```javascript
{
  id: 'task_123',
  summary: 'Fix bug',
  tabReferences: [
    {
      tabId: 'tab_456',           // Storage ID (FK to tabs table)
      chromeTabId: 789,           // Chrome tab ID (null if closed)
      title: 'Issue #123',        // Snapshot at association time
      url: 'github.com/...',      // Snapshot at association time
      favIconUrl: 'https://...',  // Snapshot at association time
      associatedAt: 1698765432000 // Timestamp of association
    }
  ]
}
```

**Why Snapshots?**
- Tab might close before task completes
- User can still see what the task was about
- Click behavior: try to find tab by URL, or open new tab
- Graceful degradation instead of broken references

### API Changes

**TaskService.createTask()**
```javascript
// Before
await createTask({
  summary: 'Fix bug',
  tabIds: []  // Always empty
});

// After
await createTask({
  summary: 'Fix bug',
  tabReferences: [
    {
      tabId: 'tab_456',
      chromeTabId: 789,
      title: 'Issue #123',
      url: 'github.com/...',
      favIconUrl: 'https://...',
      associatedAt: Date.now()
    }
  ]
});
```

**New Helper Function**:
```javascript
// services/utils/tab-snapshot.js
export async function getCurrentTabSnapshot() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return null;

  // Look up storage ID for this Chrome tab
  const tabId = await getStorageIdForChromeTab(tab.id);

  return {
    tabId,
    chromeTabId: tab.id,
    title: tab.title,
    url: tab.url,
    favIconUrl: tab.favIconUrl,
    associatedAt: Date.now()
  };
}
```

### Implementation Files

**Files to Modify**:
1. `sidepanel/panel.js` - New task modal
2. `sidepanel/tasks-view.js` - Edit task modal
3. `sidepanel/collection-detail.js` - Collection task creation
4. `services/execution/TaskService.js` - Data model update
5. `services/utils/tab-snapshot.js` - NEW: Snapshot utilities
6. `sidepanel/panel.css` - Tab chip styles

**Files to Create**:
1. `services/utils/tab-snapshot.js` - Tab snapshot helpers
2. `components/tab-chip.js` - Reusable tab chip component (optional)

### Edge Cases

#### 1. Current Tab Not in Collection
**Scenario**: Task in "Work" collection, but current tab is uncategorized

**Solution**: Allow association, show warning
```html
<div class="tab-chip active">
  <img class="favicon" src="...">
  <span class="tab-title">Issue #123</span>
  <span class="warning-badge" title="This tab isn't in the Work collection">⚠️</span>
  <button class="remove-btn">×</button>
</div>
<p class="helper-text warning">Note: This tab isn't in the Work collection</p>
```

**Rationale**: Tab association is about work context, not organizational hierarchy. Allow flexibility.

#### 2. Tab Closed After Association
**Solution**: Keep reference as "ghost"
- Show gray chip with "Closed" badge
- Click opens new tab with stored URL
- User can remove if no longer relevant

#### 3. User Navigates During Task Creation
**Solution**: Update chip in real-time
- Listen to `chrome.tabs.onActivated` and `chrome.tabs.onUpdated`
- Update chip content if user switches tabs
- Add subtle pulse animation to draw attention

#### 4. Collection Change After Association
**Solution**: Keep association, no automatic adjustment
- Tab reference is independent of collection organization
- User can manually remove if no longer makes sense

#### 5. No Current Tab (Unlikely)
**Solution**: Show empty state immediately
```html
<button class="add-current-tab-btn subtle" disabled>
  <span class="icon">🔗</span>
  <span>No active tab to link</span>
</button>
```

### Task List Display

**Before**:
```html
<div class="task-item">
  <span class="task-summary">Fix authentication bug</span>
  <span class="task-priority">High</span>
</div>
```

**After**:
```html
<div class="task-item">
  <span class="task-summary">Fix authentication bug</span>
  <div class="task-metadata">
    <span class="task-priority">High</span>
    <!-- NEW: Tab reference badge -->
    <button class="tab-reference-badge" title="Issue #123 - Project">
      <img class="favicon" src="..." width="12" height="12">
      <span class="tab-count">1 tab</span>
    </button>
  </div>
</div>
```

**Click Behavior**:
- Click badge → opens/focuses associated tab(s)
- If tab closed → opens new tab with stored URL
- Multiple tabs → opens all tabs

### Phase 2: Multiple Tabs (Future)

**When to Implement**: After Phase 1 is validated by users

**Changes**:
1. Add "+" button after first chip
2. Opens tab picker modal with:
   - Recent tabs (last 10)
   - Current window tabs
   - Search across all tabs in collection
3. Selected tabs appear as additional chips
4. Limit to 5 associations to prevent overwhelm

**UI Evolution**:
```
Context:
┌─────────────────────────┐
│ 🌐 Issue #123         × │
│ 🌐 Documentation      × │
│ 🌐 PR Review          × │
└─────────────────────────┘
[+ Add another tab]  (max 5)
```

## Success Metrics

**Adoption**:
- 80% of tasks created from side panel retain tab association
- < 5% of users remove pre-filled association

**Usability**:
- 0 confusion reports about what association means
- Users click tab badges to navigate (indicates value)

**Resilience**:
- Graceful handling of closed tabs (no errors)
- Users can still understand old tasks from snapshots

## Testing Checklist

- [ ] Create task with current tab → association saved
- [ ] Remove association → task saves without tab reference
- [ ] Re-add association → works correctly
- [ ] Close tab after association → shows "Closed" state
- [ ] Click tab badge in task list → opens/focuses tab
- [ ] Click closed tab badge → opens new tab with URL
- [ ] Edit task → can add/remove tab associations
- [ ] Create task from collection detail → same behavior
- [ ] Task in different collection than tab → shows warning
- [ ] Navigate during task creation → chip updates in real-time
- [ ] No active tab → shows disabled state
- [ ] Uncategorized task → can still associate tabs

## Migration Strategy

**Backward Compatibility**:
- Existing tasks have `tabIds: []` field (empty array)
- New tasks use `tabReferences: []` field
- Read both fields, prefer `tabReferences` if present
- Gradual migration: no breaking changes

**Data Migration** (Optional):
```javascript
// One-time migration for existing tasks
async function migrateTabReferences() {
  const tasks = await getAllTasks();
  for (const task of tasks) {
    if (task.tabIds?.length > 0 && !task.tabReferences) {
      task.tabReferences = await Promise.all(
        task.tabIds.map(async (tabId) => {
          const tab = await getTab(tabId);
          return {
            tabId,
            chromeTabId: null, // Don't know Chrome ID
            title: tab?.title || 'Unknown',
            url: tab?.url || '',
            favIconUrl: tab?.favIconUrl || '',
            associatedAt: task.createdAt
          };
        })
      );
      await updateTask(task.id, { tabReferences: task.tabReferences });
    }
  }
}
```

## Open Questions

1. **Persist across task completion?**
   - **Recommendation**: Yes, as historical context

2. **Allow duplicate associations (same tab, multiple tasks)?**
   - **Recommendation**: Yes, different tasks can reference same resource

3. **Show tab association count in dashboard cards?**
   - **Recommendation**: Yes, small badge like "📎 3 tabs"

4. **Auto-remove association when tab is permanently deleted?**
   - **Recommendation**: No, keep as ghost for historical record

## References

- UX Architect Review: This document (2025-10-29)
- TaskService: `services/execution/TaskService.js`
- Storage Queries: `services/utils/storage-queries.js`
- Side Panel: `sidepanel/panel.js`, `sidepanel/tasks-view.js`

---

**Next Steps**:
1. Implement Phase 1 (current tab only)
2. Validate with users
3. Collect feedback on multi-tab needs
4. Iterate to Phase 2 if needed
