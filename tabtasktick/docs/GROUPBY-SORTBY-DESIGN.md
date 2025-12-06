# Group By / Sort By Design Decision

**Date**: 2025-10-20
**Status**: Approved
**Context**: Phase 3.5 - Side Panel Search & Filters

## Problem Statement

Test #69 "should sort tasks by due date" was failing because:
1. Tasks are grouped by collection (visual cards with headers)
2. Sorting happens within each group, not globally
3. Test expected global sort (all tasks by due date across collections)

This revealed a fundamental UX question: **Should "Sort By: Due Date" mean sorting within groups or globally?**

## UX Analysis

Consulted @agent-ux-architect who identified this as a **"Group By" vs "Order By"** problem - a classic database visualization pattern.

### The Core Insight

These are TWO separate, independent controls:

**Group By** = Visual organization / containers
- Collection, Priority, Tag, Status, **None**
- Creates visual hierarchy with section headers
- Primary organizing principle

**Sort By** = Directional order within groups (or globally if Group By = None)
- ↑ Ascending / ↓ Descending
- Type inferred from column: Alpha, Numeric, Date, Enum
- Secondary ordering within primary organization

### Jobs-to-be-Done Analysis

**Job 1: "What do I need to work on next?" (Task Mode)**
- Mental model: Time-based priority
- Settings: `Group By: None`, `Sort By: Due Date`
- User gets flat list sorted by urgency

**Job 2: "What's happening in Project Alpha?" (Project Mode)**
- Mental model: Project-based organization
- Settings: `Group By: Collection`, `Sort By: Priority`
- User sees projects with high-priority items first within each

## Approved Solution

### Always-Visible Controls

```
┌─────────────────────────────────────────────────┐
│ TASKS VIEW                                      │
├─────────────────────────────────────────────────┤
│ Group By: [Collection ▼]   Sort By: [Priority ▼] [↓] │  ← Always visible
├─────────────────────────────────────────────────┤
│ [🔍 Search...] [Filters ▼]                      │  ← Toggle filters panel
```

### The Three-Layer Hierarchy

1. **Always Visible Controls** (presentation layer)
   - **Group By**: How to organize results
   - **Sort By**: What order to show results
   - User needs to always see how data is being presented

2. **Filters Panel** (data layer)
   - **What to show**: Status, Priority, Collection, Tags, Date Range
   - Can be collapsed when not needed
   - About reducing the dataset, not organizing it

3. **Content Area**
   - Tasks displayed based on above settings

### Defaults

```javascript
{
  groupBy: 'collection',  // Shows project context
  sortBy: 'priority',     // High → Low (actionable first)
  sortDirection: 'desc'   // Priority: High to Low
}
```

### Group By Options

- **Collection** (default) - Organize by project
- **Priority** - Organize by urgency level
- **Status** - Organize by workflow state
- **None** - Flat list (no grouping)

### Sort By Options

- **Priority** (default) - High/Medium/Low/Critical
- **Due Date** - Soonest to latest (or reverse)
- **Created** - Newest to oldest (or reverse)
- **Alpha** - A → Z (or reverse)

### Sort Direction

- **Ascending** (↑): A→Z, 1→9, Past→Future, Low→High
- **Descending** (↓): Z→A, 9→1, Future→Past, High→Low

## Design Principles

### ✅ Predictable
- What you see is what you get
- No magic or hidden side effects
- Controls show current state

### ✅ Flexible
- Any valid combination works:
  - `Group: Collection, Sort: Due Date` = Projects with urgent tasks first
  - `Group: None, Sort: Due Date` = Pure deadline view
  - `Group: Priority, Sort: Due Date` = High-pri tasks, earliest first

### ✅ No Side Effects
- Selecting a sort does NOT change grouping
- Selecting a group does NOT change sort
- User is never afraid to make changes

### ✅ Discoverable
- Controls always visible at top of panel
- Current state always clear
- No hidden modes

### ✅ Persistent
- Settings saved to `chrome.storage.local`
- Restored on panel reopen
- Synced across sessions

## Storage Keys

```javascript
{
  'tabtasktick.tasks.groupBy': 'collection',      // Collection|Priority|Status|None
  'tabtasktick.tasks.sortBy': 'priority',         // priority|dueDate|created|alpha
  'tabtasktick.tasks.sortDirection': 'desc'       // asc|desc
}
```

## Implementation Impact

### Test #69 Resolution

The test was assuming `Group By: None` (flat list) when expecting globally sorted tasks.

**Options**:
1. Update test to set `groupBy: 'none'` explicitly before sorting
2. Accept that with `groupBy: 'collection'`, sort order appears different due to collection grouping
3. Change test expectations to match grouped+sorted behavior

**Recommendation**: Option 1 - make test explicit about grouping mode.

### tasks-view.js Changes

```javascript
// Current (simplified from earlier fix)
render(tasks, collections) {
  // Always groups by collection
  const groups = this.groupTasks(tasks);
  // Render groups...
}

// New (with groupBy support)
render(tasks, collections, { groupBy, sortBy, sortDirection }) {
  if (groupBy === 'none') {
    // Render flat list (unified)
    this.renderUnifiedList(tasks, sortBy, sortDirection);
  } else {
    // Render grouped (current behavior)
    const groups = this.groupTasks(tasks, groupBy);
    this.renderGroups(groups, sortBy, sortDirection);
  }
}
```

### panel.js Changes

```javascript
// Pass groupBy/sortBy from controls to view
renderTasks() {
  const groupBy = this.searchFilter?.getGroupBy() || 'collection';
  const sortBy = this.searchFilter?.getSortBy() || 'priority';
  const sortDirection = this.searchFilter?.getSortDirection() || 'desc';

  this.tasksView.render(filteredTasks, this.collectionsData, {
    groupBy,
    sortBy,
    sortDirection
  });
}
```

## Benefits

### For Users
- Clear mental model (database-like controls)
- Supports both Task Mode and Project Mode workflows
- No confusion about what "sort" means
- Familiar pattern from Excel, tables, etc.

### For Developers
- Explicit state, no ambiguity
- Easy to test (set groupBy, verify rendering)
- No side effects to debug
- Clear separation of concerns

### For Tests
- Can explicitly set `groupBy: 'none'` for flat sort tests
- Can test grouped+sorted combinations
- Predictable outcomes

## References

- **UX Architect Analysis**: [Session 2025-10-20] - Recommended separating Group By and Sort By controls
- **User's Table Example**: Desktop task manager with sortable columns (no grouping UI confusion)
- **Excel Pattern**: Group rows by column, sort within groups - familiar to users
- **Database Pattern**: GROUP BY vs ORDER BY - well-understood distinction

## Next Steps

1. ✅ Document design decision (this file)
2. ✅ Update TODO.md with Phase 3.5 details
3. [ ] Implement Group By / Sort By controls in search-filter.js
4. [ ] Update tasks-view.js to support groupBy parameter
5. [ ] Update panel.js to pass groupBy/sortBy options
6. [ ] Update test #69 to explicitly set `groupBy: 'none'`
7. [ ] Verify all 31 tests pass

---

**Approved by**: UX Architect Agent + User
**Implementation Target**: Phase 3.5 (Side Panel Search & Filters)
