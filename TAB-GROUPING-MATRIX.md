# Tab Grouping Implementation Matrix

## Current Implementations Found

1. **Background Service** (`background-integrated.js:1292`) - Wrapper calling lib/tabGroupingService
2. **Dashboard** (`dashboard/modules/views/groups.js:199`) - Wrapper calling lib/tabGroupingService
3. **Session Manager** (`session/session.js:902`) - Independent implementation
4. **Rules Engine** (`lib/engine.js:244`) - Independent implementation
5. **lib/tabGroupingService** (`lib/tabGroupingService.js:16`) - Partial centralization
6. **New Service** (`services/TabGrouping.js:27`) - New clean implementation

## Implementation Comparison Matrix

| Aspect | Background | Dashboard | Session | Rules Engine | lib/tabGroupingService | New Service |
|--------|------------|-----------|---------|--------------|------------------------|-------------|
| **Entry Point** | `groupTabsByDomain()` | `groupTabsByDomain()` | `groupTabsByDomain(tabIds)` | Action: `{action: 'group'}` | `groupTabsByDomain(scope, windowId)` | `groupTabsByDomain(scope, windowId, opts)` |
| **Parameters** | None | None | `tabIds[]` | Action object | `scope`, `targetWindowId` | `scope`, `targetWindowId`, `opts` |
| **Scope** | TARGETED (current window) | TARGETED (current window) | Specific tabs only | Single tab | GLOBAL/TARGETED/PER_WINDOW | GLOBAL/TARGETED/PER_WINDOW |
| **Window Handling** | Current window only | Current window only | Tabs' existing windows | Tab's window only | Explicit window control | Explicit window control |
| **Min Tabs for Group** | 2 (or 1 if group exists) | 2 (or 1 if group exists) | >1 | 1 | 2 (or 1 if group exists) | Configurable (default 2) |
| **Domain Extraction** | Via lib service | Via lib service | `hostname.replace('www.', '')` | Uses `tab.domain` field | `url.hostname` | `hostname.toLowerCase().replace('www.', '')` |
| **Chrome URLs** | Not specified | Not specified | Attempts to parse | Warns on invalid URL | Skips silently | Explicitly excludes |
| **Pinned Tabs** | Not specified | Not specified | Groups them | Groups them | Groups them | Skips by default |
| **Already Grouped** | Via lib service | Via lib service | Ignores | Moves to new group | Skips | Skips |
| **Group Reuse** | Via lib service | Via lib service | No reuse | Reuses by title | Reuses by title | Reuses by title |
| **Color Assignment** | Via lib service | Via lib service | Hash-based | Not specified | Sequential (colorIndex++) | Hash-based deterministic |
| **Collapsed State** | Via lib service | Via lib service | Not set | Not set | `collapsed: false` | `collapsed: false` |
| **Error Handling** | Try/catch + log | Try/catch + notification | None | Try/catch + warn | None (fails silently) | Continue on error |
| **Side Effects** | Updates stats, logs activity | Shows notification, refreshes view | None | None | None | None (opts.dryRun available) |
| **Return Value** | Result object | None (async) | None | Success object | Result counts | Result + plan array |

## Edge Case Handling

| Edge Case | Background | Dashboard | Session | Rules Engine | lib/tabGroupingService | New Service |
|-----------|------------|-----------|---------|--------------|------------------------|-------------|
| **Single tab with matching group** | Groups it | Groups it | Won't group (<2) | Groups it | Groups it | Configurable |
| **chrome:// URLs** | Unknown | Unknown | Tries to group | Fails with warning | Skips | Explicitly skips |
| **about:blank** | Unknown | Unknown | Tries to group | May fail | May group | Explicitly skips |
| **Invalid URLs** | Unknown | Unknown | Uses URL as domain | Warns and returns error | Skips | Skips |
| **Pinned tabs** | Groups | Groups | Groups | Groups | Groups | Skips (configurable) |
| **Tab already in correct group** | Unknown | Unknown | Unknown | Returns success | Skips | Skips |
| **Tab in different group** | Unknown | Unknown | Unknown | Moves to new group | Skips (already grouped) | Skips |
| **No ungrouped tabs** | Returns empty result | Shows "No tabs" message | Creates no groups | N/A | Returns 0 counts | Returns 0 counts |
| **Group name collision** | Via lib | Via lib | Creates duplicate groups | Reuses existing | Reuses existing | Reuses existing |

## Problems Identified

1. **Multiple Independent Implementations**:
   - Session has its own implementation that doesn't reuse groups
   - Rules engine has complex inline logic
   - Two "centralized" services exist (lib/ and services/)

2. **Inconsistent Behavior**:
   - Session creates duplicate groups (no reuse)
   - Rules engine moves tabs between groups
   - Different domain extraction (some use `tab.domain`, others parse URL)
   - Different minimum tab requirements

3. **Missing Edge Case Handling**:
   - Most don't handle chrome:// URLs properly
   - Invalid URL handling varies
   - No consistent approach to already-grouped tabs

4. **Side Effects**:
   - Background updates statistics
   - Dashboard shows notifications
   - No way to preview without executing

5. **Color Assignment**:
   - Session uses hash (deterministic)
   - lib/tabGroupingService uses sequential index (non-deterministic)
   - New service uses hash (deterministic)

## Canonical Behavior Decisions

### Core Principles
1. **Single Implementation**: All surfaces MUST use `services/TabGrouping.js`
2. **Explicit Parameters**: No hidden defaults, all options visible
3. **Deterministic**: Same input → same output (use hash for colors)
4. **No Side Effects in Service**: Statistics, notifications, UI updates happen in callers

### Canonical Rules

1. **Domain Extraction**:
   - Lowercase hostname
   - Strip "www." prefix only
   - Return null for chrome://, edge://, about:, invalid URLs

2. **Minimum Tabs**:
   - Default: 2 tabs minimum to create new group
   - Option: `minTabsPerGroup` (configurable)
   - Option: `includeSingleIfExisting` to add single tab to existing group

3. **Group Reuse**:
   - ALWAYS reuse existing groups with matching title
   - Never create duplicate groups with same name

4. **Already Grouped Tabs**:
   - SKIP tabs already in any group
   - Never move tabs between groups

5. **Pinned Tabs**:
   - Default: SKIP pinned tabs (treat as already "grouped")
   - Option: `includePinned` (default: false) to include them

5. **Window Boundaries**:
   - TARGETED: Stay within specified window
   - GLOBAL: Move all to target window first
   - PER_WINDOW: Process each window independently

6. **Color Assignment**:
   - Use deterministic hash of domain
   - Same domain → same color always

7. **Error Handling**:
   - Continue on partial failures
   - Return what succeeded
   - Log warnings, don't throw

8. **Return Value**:
   ```javascript
   {
     groupsCreated: number,
     groupsReused: number,
     totalTabsGrouped: number,
     windowsAffected: number[],
     plan: Array<Step>,  // For debugging/dry-run
     targetWindow?: number  // For GLOBAL scope
   }
   ```

## Migration Plan

1. **Phase 1**: Update all wrappers to use new service
   - background-integrated.js → call service
   - dashboard/groups.js → call service
   - session.js → call service
   - Rules engine → call service for 'group' action

2. **Phase 2**: Remove old implementations
   - Delete lib/tabGroupingService.js
   - Remove inline logic from session.js
   - Simplify rules engine

3. **Phase 3**: Add missing features
   - Dry-run support for preview
   - Better error messages
   - Progress callbacks