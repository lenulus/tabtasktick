# Phase 6: Rules Engine Cleanup - Lessons Learned

## Overview

Phase 6 focuses on cleaning up the rules engine implementations to follow the services-first architecture established in Phases 1-5. Unlike previous phases, we don't have a feature branch to compare against - instead, we're analyzing the current state and identifying opportunities for consolidation and cleanup.

## Current State Analysis

### Engine Implementations

We currently have **5 different engine implementations**:

1. **`lib/engine.js`** (644 lines) - "Current" engine with v1 compatibility
2. **`lib/engine.v1.legacy.js`** (767 lines) - Original legacy engine
3. **`lib/engine.v2.services.js`** (574 lines) - Services-based engine
4. **`lib/engine.v2.command.full.js`** (179 lines) - Command pattern engine
5. **`lib/engine.v2.command.compact.js`** (116 lines) - Compact command engine

**Total**: 2,280 lines of engine code

### Supporting Infrastructure

- **`lib/engineLoader.js`** (135 lines) - Engine selection and loading
- **`lib/commands/ActionManager.js`** (450 lines) - Command pattern action handlers
- **`lib/commands/Command.js`** (130 lines) - Command class with validation
- **`lib/predicate.js`** - Condition evaluation
- **`lib/condition-transformer.js`** - UI to predicate format conversion
- **`lib/action-validator.js`** - Action validation and prioritization

## Problems Identified

### 1. Inline Chrome API Calls (Violates Services-First)

**Location**: `lib/engine.js:225-459` (executeAction function)

**Issue**: The main engine has inline Chrome API calls for most actions:
- `chrome.tabs.remove()` for close (line 237)
- `chrome.tabs.group()` for group (lines 274-340)
- `chrome.tabs.update()` for pin/unpin/mute/unmute (lines 394-440)
- `chrome.bookmarks.create()` for bookmark (lines 366-387)

**Why This Violates Principles**:
- ❌ **Not Services-First**: Business logic is in the engine, not in services
- ❌ **Duplicate Implementations**: Same logic exists in ActionManager (v2) and services
- ❌ **Not Testable**: Hard to test engine without mocking Chrome APIs
- ❌ **Magic Behavior**: Group caching logic is embedded in action handler (lines 267-336)

**Services Already Exist**:
- ✅ SnoozeService (line 357) - already using service
- ✅ SuspensionService (line 446) - already using service
- ❌ Close, pin, unpin, mute, unmute - direct Chrome API calls
- ❌ Group - complex inline implementation with caching
- ❌ Bookmark - inline implementation

### 2. Duplicate Action Handlers

**Comparison**:

| Action | engine.js | ActionManager.js | Service Exists? |
|--------|-----------|------------------|-----------------|
| close | ✅ Inline (237) | ✅ Handler (167) | ❌ No service |
| pin | ✅ Inline (394) | ✅ Handler (177) | ❌ No service |
| unpin | ✅ Inline (403) | ✅ Handler (191) | ❌ No service |
| mute | ✅ Inline (417) | ✅ Handler (205) | ❌ No service |
| unmute | ✅ Inline (429) | ✅ Handler (219) | ❌ No service |
| group | ✅ Inline (246) | ✅ Handler (242) | ✅ groupTabs service |
| snooze | ✅ Uses service (357) | ✅ Handler (252) | ✅ SnoozeService |
| suspend | ✅ Uses service (446) | ✅ Handler (233) | ✅ SuspensionService |
| bookmark | ✅ Inline (366) | ✅ Handler (271) | ❌ No service |

**Problem**: We have 2-3 implementations of the same action:
1. Inline in engine.js
2. Handler in ActionManager
3. Sometimes a service (snooze, suspend, group)

### 3. Complex Grouping Logic Embedded in Engine

**Location**: `lib/engine.js:246-350`

**Problem**: 104 lines of complex group management logic:
- Group caching by window (lines 267-284)
- Name-based group lookup (lines 287-300)
- Attribute-based grouping (lines 302-336)
- Cross-window prevention logic (lines 274, 314)

**Why This is Bad**:
- ❌ Business logic in engine (should be in service)
- ❌ State management (context.groupMap) couples engine to execution context
- ❌ Not reusable outside of rules engine
- ❌ Duplicate of groupTabs service functionality

**What Should Happen**:
- ✅ Call `groupTabs([tab.id], { name, byDomain, ... })`
- ✅ Service handles caching, lookups, creation
- ✅ Engine only orchestrates

### 4. Missing Services

Based on the analysis, we need services for:

1. **TabActionsService** - Basic tab operations (close, pin, unpin, mute, unmute)
2. **BookmarkService** - Bookmark creation and management

These are currently handled with inline Chrome API calls.

### 5. Engine Proliferation

**Question**: Do we really need 5 engine implementations?

**Analysis**:
- `engine.js` (644 lines) - Supposedly "current" but has v1-style inline logic
- `engine.v1.legacy.js` (767 lines) - Original, kept for compatibility
- `engine.v2.services.js` (574 lines) - Better, uses some services
- `engine.v2.command.full.js` (179 lines) - Command pattern, thin
- `engine.v2.command.compact.js` (116 lines) - Ultra-thin

**Recommendation**: We should consolidate to 2 engines:
1. **v1 (legacy)** - Keep for backwards compatibility testing
2. **v2 (command pattern)** - Use compact version, it's the cleanest

**Savings**: Remove 3 engine implementations (~1,400 lines)

## Architectural Issues

### Issue #1: Engine Does Too Much

**Current**: Engine.js has:
- Condition evaluation ✅ (OK - this is orchestration)
- Action execution ❌ (should delegate to services)
- Group caching ❌ (service concern)
- Bookmark folder lookup ❌ (service concern)
- Chrome API calls ❌ (service concern)

**Should Be**: Engine only orchestrates:
```javascript
async function executeAction(action, tab, context, dryRun) {
  switch (action.type) {
    case 'close':
      return await TabActionsService.closeTabs([tab.id]);
    case 'group':
      return await groupTabs([tab.id], action.params);
    case 'snooze':
      return await SnoozeService.snoozeTabs([tab.id], ...);
    // etc
  }
}
```

### Issue #2: No Separation Between Simple and Complex Actions

**Simple Actions** (direct Chrome API call):
- close, pin, unpin, mute, unmute
- Could be grouped into `TabActionsService`

**Complex Actions** (need business logic):
- group (needs caching, window management, domain extraction)
- snooze (needs alarms, storage, wake logic)
- suspend (needs filtering, state management)
- bookmark (needs folder lookup/creation)

**Current**: All mixed together in one giant switch statement

**Should Be**: Services handle complexity, engine just calls them

## Good Patterns to Keep

### ✅ 1. Command Pattern (v2.command.compact.js)

The compact command engine is excellent:
```javascript
// 116 lines total - ultra-thin orchestration
export async function runRules(rules, context, options = {}) {
  // 1. Select matching tabs
  const selected = await selectTabsMatchingRule(rule, context);

  // 2. Create commands
  const commands = await selectAndPlan([rule], context);

  // 3. Execute commands
  const result = await actionManager.execute(commands, context);

  return result;
}
```

This follows **Services-First** perfectly:
- Selection → `selectTabsMatchingRule` service
- Planning → `selectAndPlan` service
- Execution → `ActionManager` (which delegates to services)

### ✅ 2. ActionManager Delegation

ActionManager already uses services where they exist:
```javascript
registerHandler('snooze', async (command, context) => {
  // Delegates to SnoozeService ✅
  return await SnoozeService.snoozeTabs(
    command.tabIds,
    snoozeUntil,
    'rule'
  );
});

registerHandler('suspend', async (command, context) => {
  // Delegates to SuspensionService ✅
  return await SuspensionService.suspendTabs(
    command.tabIds,
    command.params
  );
});
```

**Problem**: It only uses services when they exist. For other actions, it falls back to inline Chrome API calls.

### ✅ 3. Service Integration Pattern

When services exist, both engines use them correctly:
```javascript
// engine.js:357 - Snooze
await SnoozeService.snoozeTabs([tab.id], snoozeUntil, `rule: ${context.ruleName}`);

// engine.js:446 - Suspend
await SuspensionService.suspendTabs([tab.id], action.params);
```

This is the pattern we want for ALL actions.

## Recommended Implementation Plan

### Step 1: Create Missing Services (New Code)

#### 1.1 Create TabActionsService
**File**: `/services/execution/TabActionsService.js` (~100 lines)

**API**:
```javascript
export async function closeTabs(tabIds)
export async function pinTabs(tabIds)
export async function unpinTabs(tabIds)
export async function muteTabs(tabIds)
export async function unmuteTabs(tabIds)
```

**Why**: Groups simple Chrome API calls into one service
- Single source of truth for basic tab operations
- Testable
- Reusable across all surfaces

#### 1.2 Create BookmarkService
**File**: `/services/execution/BookmarkService.js` (~150 lines)

**API**:
```javascript
export async function bookmarkTabs(tabIds, options = {})
  // options: { folder, parentId }

async function findOrCreateFolder(folderName)
```

**Why**: Encapsulates bookmark logic
- Folder lookup/creation (currently inline at engine.js:369-378)
- Batch bookmark creation
- Error handling

### Step 2: Update ActionManager to Use New Services

**File**: `lib/commands/ActionManager.js`

**Change**:
```javascript
// BEFORE (inline Chrome API)
this.registerHandler('close', async (command, context) => {
  await context.chrome.tabs.remove(command.tabIds);
});

// AFTER (use service)
this.registerHandler('close', async (command, context) => {
  return await TabActionsService.closeTabs(command.tabIds);
});
```

**Apply to**: close, pin, unpin, mute, unmute, bookmark handlers

### Step 3: Update engine.js to Use Services

**File**: `lib/engine.js:225-459`

**Change**: Replace entire executeAction function with service calls:

```javascript
async function executeAction(action, tab, context, dryRun) {
  const actionType = action.action || action.type;

  if (dryRun) {
    return { success: true, dryRun: true, action: actionType };
  }

  switch (actionType) {
    case 'close':
      return await TabActionsService.closeTabs([tab.id]);

    case 'group':
      return await groupTabs([tab.id], {
        name: action.name,
        byDomain: action.by === 'domain' || action.group_by === 'domain',
        createIfMissing: action.createIfMissing
      });

    case 'snooze':
      const duration = parseDuration(action.for || '1h');
      const snoozeUntil = Date.now() + duration;
      return await SnoozeService.snoozeTabs(
        [tab.id],
        snoozeUntil,
        `rule: ${context.ruleName || 'untitled'}`
      );

    case 'bookmark':
      return await BookmarkService.bookmarkTabs([tab.id], {
        folder: action.to
      });

    case 'pin':
      return await TabActionsService.pinTabs([tab.id]);

    // ... etc for all actions

    default:
      return { success: false, error: `Unknown action: ${actionType}` };
  }
}
```

**Reduction**: ~220 lines → ~60 lines (~73% reduction)

### Step 4: Consolidate Engine Implementations

**Keep**:
1. `lib/engine.v1.legacy.js` - For backwards compatibility testing
2. `lib/engine.v2.command.compact.js` - Rename to `lib/engine.js`

**Delete**:
1. `lib/engine.js` (current) - Replaced by compact command engine
2. `lib/engine.v2.services.js` - Functionality absorbed by compact engine
3. `lib/engine.v2.command.full.js` - Compact version is sufficient

**Update engineLoader.js**:
- v1 → `engine.v1.legacy.js`
- v2 → `engine.js` (renamed from command.compact)

**Savings**: ~1,400 lines removed

### Step 5: Update All Engine References

**Files to Update**:
- `background-integrated.js` - Uses `getEngine()`
- All tests - Update to use v1 or v2
- `lib/engineLoader.js` - Map to new files

**Pattern**: No code changes needed - engine API stays the same

### Step 6: Remove Helper Functions from Engines

**Current**: Each engine has helper functions like:
- `getGroupKey(tab, by)` (engine.js:571)
- `parseDuration(str)` (engine.js:537)
- `findBookmarkFolder(node, name)` (engine.js:556)

**Problem**: Duplicated across engines, not reusable

**Solution**: Move to services or utilities:
- `getGroupKey` → `groupTabs` service (internal helper)
- `parseDuration` → `lib/utils/time.js`
- `findBookmarkFolder` → `BookmarkService` (internal helper)

## Expected Results

### Code Reduction

| Area | Before | After | Reduction |
|------|--------|-------|-----------|
| engine.js | 644 lines | 116 lines | -528 lines |
| Deleted engines | 1,520 lines | 0 | -1,520 lines |
| **Total** | **2,164 lines** | **116 lines** | **-2,048 lines** |

### New Code

| Service | Lines | Purpose |
|---------|-------|---------|
| TabActionsService | ~100 | Simple tab operations |
| BookmarkService | ~150 | Bookmark management |
| **Total** | **~250 lines** | |

### Net Reduction

**-1,798 lines** (~83% reduction in engine code)

### Architectural Improvements

✅ **Services-First**: All business logic in services
✅ **No Duplication**: Single source of truth for each action
✅ **Thin Engine**: Only orchestration, no business logic
✅ **Testable**: Services can be tested independently
✅ **Maintainable**: Clear separation of concerns
✅ **Explicit**: No magic caching or state management in engine

## Testing Strategy

### 1. Service Unit Tests

Create tests for new services:
- `tests/TabActionsService.test.js`
- `tests/BookmarkService.test.js`

### 2. Engine Integration Tests

Update existing engine tests:
- `tests/engine.test.js` - Test v1 and v2 with services
- `tests/engine-compatibility.test.js` - Verify behavior unchanged

### 3. Test Runner Scenarios

Run all 9 scenarios in `lib/test-mode/test-mode.js`:
- Should pass with both v1 and v2 engines
- Verify identical behavior

### 4. Manual Testing

- [ ] Extension loads without errors
- [ ] Rules execute properly (v1 and v2)
- [ ] All actions work (close, group, snooze, pin, etc)
- [ ] Test Runner passes all scenarios
- [ ] No console errors

## Migration Path

### Phase 6.1: Create Services (Safe, Additive)
1. Create TabActionsService
2. Create BookmarkService
3. Add unit tests
4. **No breaking changes** - services not used yet

### Phase 6.2: Update ActionManager (Low Risk)
1. Update handlers to use new services
2. Test command pattern engine (v2.command.compact)
3. Verify Test Runner passes
4. **Risk**: Only affects v2 engine users

### Phase 6.3: Update engine.js (Medium Risk)
1. Replace executeAction with service calls
2. Test thoroughly
3. **Risk**: Affects v1/current engine users

### Phase 6.4: Consolidate Engines (High Risk)
1. Rename v2.command.compact to engine.js
2. Update engineLoader
3. Delete old engines
4. Update all tests
5. **Risk**: Breaking change, needs careful testing

### Phase 6.5: Cleanup (Low Risk)
1. Move helper functions to services/utils
2. Remove dead code
3. Update documentation

## Risks and Mitigations

### Risk #1: Breaking Existing Rules
**Mitigation**:
- Keep v1 engine unchanged until Phase 6.3
- Test all 9 Test Runner scenarios
- Beta test with real rule sets

### Risk #2: Service API Mismatches
**Mitigation**:
- Design service APIs to match current behavior
- Add compatibility layer if needed
- Comprehensive unit tests

### Risk #3: Performance Regression
**Mitigation**:
- Benchmark before/after
- Services should be as fast or faster (less code)
- Monitor with production rules

### Risk #4: Engine Selector Breaks
**Mitigation**:
- Update engineLoader.js carefully
- Test switching between v1/v2
- Verify Settings page selector works

## Success Criteria

✅ All 9 Test Runner scenarios pass (v1 and v2)
✅ `npm test` passes (all suites)
✅ Extension loads without errors
✅ Rules execute correctly in production
✅ No duplicate code in engines
✅ All actions use services
✅ Net code reduction ~1,800 lines
✅ No breaking changes for users
✅ Engine selector still works
✅ Performance unchanged or improved

## Lessons from Previous Phases

### From Phase 4 (Suspension)
- ✅ Create service first, then update callers
- ✅ Use explicit parameters (no global state)
- ✅ Test incrementally (don't break existing code)

### From Phase 5 (Export/Import)
- ✅ Extract from feature branch when available
- ✅ Fix bugs found during integration (dependency injection)
- ✅ Add lazy initialization for service workers
- ✅ Document lessons learned immediately

### New Lesson for Phase 6
- ⚠️ Engine consolidation is HIGH RISK
- ⚠️ Multiple implementations means harder testing
- ⚠️ Do incremental migration, not big bang
- ⚠️ Keep backwards compatibility until proven

## Open Questions

1. **Should we keep engine.v2.services.js?**
   - Pro: Intermediate step between v1 and command pattern
   - Con: More code to maintain
   - **Recommendation**: Delete - command pattern is better

2. **Should TabActionsService be one service or multiple?**
   - Option A: One TabActionsService with many methods
   - Option B: Separate services (CloseTabsService, PinTabsService, etc)
   - **Recommendation**: One service - operations are simple and related

3. **Should we version the services?**
   - Current: No versioning
   - Pro: Easier to make breaking changes
   - Con: More complexity
   - **Recommendation**: No versioning - services should be stable

4. **How do we handle dry-run in services?**
   - Option A: Pass dryRun flag to services
   - Option B: Services have preview methods
   - Option C: Engine handles dry-run (don't call services)
   - **Recommendation**: Option A - services check dryRun flag

## Next Steps

1. ✅ Document current state (this file)
2. ⚠️ Get architectural review from guardian
3. ⚠️ Create detailed implementation plan
4. ⚠️ Get approval before starting
5. ⚠️ Implement Phase 6.1 (create services)
6. ⚠️ Test and iterate

---

**Status**: Planning Complete - Ready for Architectural Review
**Risk Level**: High (engine changes affect core functionality)
**Estimated Effort**: 2-3 days for full implementation
**Expected Impact**: -1,800 lines, major architectural improvement
