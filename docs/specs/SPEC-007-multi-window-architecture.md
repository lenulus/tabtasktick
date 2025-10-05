# SPEC-007: Multi-Window Architecture & Scope Control

## Overview

TabMaster Pro currently has inconsistent window-scoping behavior across operations. Some operations (like "Close Duplicates") affect tabs across ALL windows when triggered from the popup, while others (like "Suspend Inactive") correctly scope to the current window. This creates unpredictable user experience and makes testing multi-window scenarios impossible.

This spec defines a comprehensive multi-window architecture that:
1. Provides consistent, predictable window-scoping behavior
2. Gives users explicit control over operation scope
3. Enables comprehensive multi-window testing
4. Sets architectural patterns for future features

## Problem Statement

### Current Behavior Audit

| Operation | Current Scope | Expected Scope (from popup) | Issue |
|-----------|---------------|----------------------------|-------|
| `findAndCloseDuplicates()` | ALL windows | Current window | ❌ Bug #10 |
| `groupTabsByDomain()` | Current window | Current window | ✅ Correct |
| `handleSuspendInactive()` (popup) | Current window | Current window | ✅ Correct |
| `handleSuspendInactive()` (cmd palette) | Current window | Current window | ✅ Correct |
| `executeAllRules()` | ALL windows | Configurable per rule | ⚠️ Inconsistent |
| Dashboard export | Window-specific | User choice | ✅ Correct |

### Root Cause Analysis

1. **Inconsistent API usage:**
   ```javascript
   // background-integrated.js:1238 - Affects ALL windows
   async function findAndCloseDuplicates() {
     const tabs = await chrome.tabs.query({});  // ❌ No window filter
   }

   // background-integrated.js:1277 - Correctly scoped
   async function groupTabsByDomain() {
     const tabs = await chrome.tabs.query({ currentWindow: true });  // ✅ Scoped
   }
   ```

2. **No window context propagation:**
   - Popup calls background functions via `chrome.runtime.sendMessage()`
   - Background handler receives `sender.tab.windowId` but ignores it
   - Functions have no way to know which window initiated the call

3. **Implicit assumptions:**
   - Some functions assume popup context = current window
   - Others assume background context = all windows
   - Rules engine assumes all windows by default

### User Impact

**Scenario 1: Developer with project windows**
- Window A: 50 tabs for Project X
- Window B: 50 tabs for Project Y
- User clicks "Close Duplicates" in Window A
- **Current**: Duplicates from BOTH windows are closed (unexpected)
- **Expected**: Only Window A duplicates are closed

**Scenario 2: Research workflow**
- Window A: Active research (10 tabs)
- Window B: Reference material (100 tabs)
- User clicks "Group by Domain" in Window A
- **Current**: Only Window A is grouped (correct)
- **Expected**: Should match other quick actions (inconsistent UX)

**Scenario 3: Rules engine**
- Rule: "Close tabs older than 7 days"
- User expects: Rule applies to specific window or all windows based on configuration
- **Current**: Always applies to all windows (no control)

## User Stories

### Primary
As a user with multiple browser windows for different projects, I want tab operations to only affect the current window by default, so I don't accidentally modify tabs in other windows.

### Supporting
1. As a power user, I want to explicitly choose whether an operation affects one window or all windows
2. As a developer, I want to group tabs by domain in just my current workspace window
3. As a researcher, I want to close duplicates across all windows to free memory
4. As a rules author, I want to configure which windows a rule applies to
5. As a tester, I want to verify that operations correctly respect window boundaries

## Technical Design

### Architecture Principles

1. **Explicit over Implicit**: Always require explicit window scope
2. **Safe Defaults**: Default to current window for user-triggered actions
3. **User Control**: Provide UI for changing scope when appropriate
4. **Backward Compatibility**: Maintain existing behavior where correct
5. **Testability**: Enable multi-window test scenarios

### API Design Pattern

#### Option 1: Window Scope Parameter (Recommended)

```javascript
/**
 * Generic window scope parameter pattern
 * @param {Object} options - Operation options
 * @param {number|'current'|'all'|null} options.windowId - Window scope
 *   - number: Specific window ID
 *   - 'current': Current window (requires sender context)
 *   - 'all': All windows
 *   - null/undefined: Infer from sender.tab.windowId
 */

// Example: findAndCloseDuplicates
async function findAndCloseDuplicates(options = {}) {
  const { windowId = null, sender = null } = options;

  // Determine actual window ID
  const targetWindowId = resolveWindowScope(windowId, sender);

  // Build query
  const query = targetWindowId === 'all' ? {} : { windowId: targetWindowId };
  const tabs = await chrome.tabs.query(query);

  // ... rest of logic
}

// Helper function
function resolveWindowScope(windowId, sender) {
  if (windowId === 'all') return 'all';
  if (typeof windowId === 'number') return windowId;
  if (windowId === 'current' && sender?.tab?.windowId) {
    return sender.tab.windowId;
  }
  if (sender?.tab?.windowId) {
    return sender.tab.windowId;
  }
  throw new Error('Cannot resolve window scope: no windowId or sender context');
}
```

#### Option 2: Separate Functions (Not Recommended)

```javascript
// Verbose, creates API bloat
async function closeDuplicatesInWindow(windowId) { }
async function closeDuplicatesInAllWindows() { }
async function closeDuplicatesInCurrentWindow() { }
```

### Message Handler Refactor

**Current:**
```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch(request.action) {
    case 'closeDuplicates':
      const count = await findAndCloseDuplicates();  // ❌ No context
      sendResponse(count);
      break;
  }
});
```

**Proposed:**
```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch(request.action) {
    case 'closeDuplicates':
      // Option A: Use explicit windowId from request
      const windowId = request.windowId ?? sender.tab?.windowId ?? 'current';
      const count = await findAndCloseDuplicates({ windowId, sender });
      sendResponse(count);
      break;

    case 'closeDuplicatesAll':
      // Option B: Separate action for all-windows
      const count = await findAndCloseDuplicates({ windowId: 'all' });
      sendResponse(count);
      break;
  }
});
```

### Functions Requiring Changes

#### High Priority (Currently Broken)

1. **`findAndCloseDuplicates()`** - background-integrated.js:1237
   ```javascript
   // Before
   async function findAndCloseDuplicates() {
     const tabs = await chrome.tabs.query({});
   }

   // After
   async function findAndCloseDuplicates(options = {}) {
     const { windowId = null, sender = null } = options;
     const targetWindowId = resolveWindowScope(windowId, sender);
     const query = targetWindowId === 'all' ? {} : { windowId: targetWindowId };
     const tabs = await chrome.tabs.query(query);
   }
   ```

2. **`executeAllRules()`** - background-integrated.js:625
   - Should respect per-rule window scope configuration
   - Add `windowScope` field to rule schema

#### Medium Priority (Future Enhancement)

3. **Rule Actions** - lib/engine.js
   - Add window scope to action context
   - Allow rules to specify `applyToWindows: 'current' | 'all' | [windowIds]`

4. **Bulk Operations** (when implemented)
   - Tab selection should be window-scoped
   - Multi-select across windows should be explicit opt-in

#### Low Priority (Already Correct or Not Applicable)

5. **`groupTabsByDomain()`** - Already uses `currentWindow: true` ✅
6. **`handleSuspendInactive()`** - Already uses `currentWindow: true` ✅

### UI/UX Changes

#### Quick Actions Scope Indicator

```
┌─────────────────────────────────────┐
│ Quick Actions                       │
│ Scope: [Current Window ▼]          │ ← New dropdown
│                                     │
│ ┌────────┬────────┬────────────┐  │
│ │  🗑️    │  📁    │    💤      │  │
│ │ Close  │ Group  │  Suspend   │  │
│ │ Dupes  │Domain  │  Inactive  │  │
│ │  (5)   │  (3)   │   (12)     │  │
│ └────────┴────────┴────────────┘  │
└─────────────────────────────────────┘

Scope Options:
  • This Window (default)
  • All Windows
  • Window 1: Development
  • Window 2: Research
```

#### Action Confirmation Modal

For "All Windows" scope:
```
┌─────────────────────────────────────┐
│ ⚠️  Confirm Action                  │
│                                     │
│ Close 23 duplicate tabs across      │
│ 3 windows?                          │
│                                     │
│ • Window 1: 8 duplicates            │
│ • Window 2: 12 duplicates           │
│ • Window 3: 3 duplicates            │
│                                     │
│ [Cancel]  [Close in All Windows]   │
└─────────────────────────────────────┘
```

#### Settings Addition

```javascript
// Extension settings
{
  windowScoping: {
    defaultScope: 'current',  // 'current' | 'all'
    confirmAllWindows: true,  // Show confirmation for 'all'
    rememberChoice: false     // Remember last selection
  }
}
```

### Rule Window Architecture (Deep Dive)

#### The Fundamental Problem

Unlike user-triggered actions (which have clear window context from the popup/dashboard), **rules have complex evaluation semantics** that vary by:
1. **Trigger type** (scheduled, immediate, manual)
2. **Condition semantics** (window-level, tab-level, cross-window)
3. **Action behavior** (window-specific, global, cross-window)

**Current behavior**: All rules evaluate in a **global context** with ALL tabs from ALL windows, leading to:
- Duplicate detection is cross-window (may be desired or not)
- Domain counts are global (e.g., `tab.countPerOrigin:domain` counts across windows)
- Actions affect tabs regardless of window boundaries

#### Window Evaluation Modes

Rules need different evaluation strategies based on their purpose:

##### Mode 1: **Independent** (Most Common)
**Use case**: "Keep each window organized independently"

```javascript
{
  name: 'Group tabs by domain in each window',
  windowEvaluation: {
    mode: 'independent'
  },
  when: { gte: ['tab.countPerDomain', 3] },
  then: [{ action: 'group', by: 'domain' }]
}
```

**Execution**:
```javascript
for (const window of windows) {
  const tabs = await chrome.tabs.query({ windowId: window.id });
  const idx = buildIndices(tabs);  // Indices scoped to THIS window
  const context = { tabs, windows: [window], idx };
  const matches = evaluateRule(rule, context);
  await executeActions(matches, rule.then);
}
```

**Semantics**:
- Conditions evaluate against **only this window's tabs**
- `tab.countPerDomain` counts domains **in this window only**
- `tab.isDupe` checks duplicates **within this window only**
- Actions affect **only this window's tabs**

**Examples**:
- "If window has >50 tabs, group by domain" → per-window threshold
- "Close duplicates" → keep one per window (not cross-window dedup)
- "Suspend inactive tabs" → per-window inactivity

##### Mode 2: **Global** (Cross-Window)
**Use case**: "Manage memory/resources across all windows"

```javascript
{
  name: 'Global memory management',
  windowEvaluation: {
    mode: 'global'
  },
  when: { gte: ['total.tabCount', 200] },
  then: [{ action: 'suspend', target: 'oldest', limit: 50 }]
}
```

**Execution**:
```javascript
const tabs = await chrome.tabs.query({});  // All windows
const idx = buildIndices(tabs);  // Global indices
const context = { tabs, windows, idx };
const matches = evaluateRule(rule, context);
await executeActions(matches, rule.then);  // Act across all windows
```

**Semantics**:
- Conditions evaluate against **all tabs across all windows**
- `total.tabCount` is global count
- `tab.isDupe` checks duplicates **across all windows**
- Actions affect tabs **regardless of window**

**Examples**:
- "If total tabs >200, close oldest 50" → global threshold
- "Close duplicate URLs across all windows" → cross-window dedup
- "Suspend tabs not accessed in 7 days" → global cleanup

##### Mode 3: **Window-Aware Global** (Hybrid)
**Use case**: "Global rules that respect window boundaries"

```javascript
{
  name: 'Proportional cleanup across windows',
  windowEvaluation: {
    mode: 'window-aware-global'
  },
  when: { gte: ['total.tabCount', 300] },
  then: [{ action: 'suspend', target: 'oldest-per-window', percent: 20 }]
}
```

**Execution**:
```javascript
const tabs = await chrome.tabs.query({});
const idx = buildIndices(tabs);
const context = { tabs, windows, idx };

// Global condition check
if (evaluateConditions(rule.when, context)) {
  // But execute action per-window
  for (const window of windows) {
    const windowTabs = tabs.filter(t => t.windowId === window.id);
    await executeActions(windowTabs, rule.then);
  }
}
```

**Semantics**:
- Conditions evaluate **globally** (cross-window)
- Actions execute **per-window** (respecting boundaries)
- Useful for proportional/distributed actions

**Examples**:
- "If total >300, suspend 20% from each window" → global trigger, distributed action
- "If global memory >2GB, free memory from each window equally"

##### Mode 4: **Targeted** (Window-Specific)
**Use case**: "Rules that only apply to specific windows"

```javascript
{
  name: 'Work window - close social media',
  windowEvaluation: {
    mode: 'targeted',
    windowFilter: {
      titleMatches: /work/i,
      // OR specific IDs
      windowIds: [123, 456]
    }
  },
  when: { in: ['tab.category', ['social', 'entertainment']] },
  then: [{ action: 'close' }]
}
```

**Execution**:
```javascript
// Filter windows first
const targetWindows = windows.filter(w => matchesFilter(w, rule.windowFilter));

for (const window of targetWindows) {
  const tabs = await chrome.tabs.query({ windowId: window.id });
  const idx = buildIndices(tabs);
  const context = { tabs, windows: [window], idx };
  const matches = evaluateRule(rule, context);
  await executeActions(matches, rule.then);
}
```

**Semantics**:
- Rule only applies to **specific windows**
- Window matching can be by: ID, title pattern, tab count, etc.
- Evaluation scoped to matched windows only

**Examples**:
- "In 'Work' window, close social media tabs"
- "In windows with >100 tabs, group by domain"
- "In incognito windows, close tracking sites"

#### Window-Aware Conditions

Some conditions have inherent window semantics:

##### Window-Level Conditions
```javascript
// These inherently reference a specific window
{ gte: ['window.tabCount', 50] }          // THIS window has ≥50 tabs
{ eq: ['window.title', 'Work'] }          // THIS window title is 'Work'
{ gte: ['window.memoryUsage', '500MB'] }  // THIS window uses ≥500MB
```

**Implication**: These conditions **force independent evaluation** (mode must be 'independent' or 'targeted')

##### Tab-Level Conditions (Context-Dependent)
```javascript
// Semantics change based on evaluation mode
{ gte: ['tab.countPerDomain', 5] }
  // independent: ≥5 tabs of this domain IN THIS WINDOW
  // global: ≥5 tabs of this domain ACROSS ALL WINDOWS

{ is: ['tab.isDupe', true] }
  // independent: duplicate exists IN THIS WINDOW
  // global: duplicate exists IN ANY WINDOW
```

##### Cross-Window Conditions (Force Global)
```javascript
// These REQUIRE cross-window analysis
{ exists: ['tab.duplicateInWindow', 'other'] }  // Duplicate exists in DIFFERENT window
{ gte: ['total.tabCount', 200] }                 // Total across ALL windows ≥200
{ gte: ['total.windowCount', 3] }                // User has ≥3 windows open
```

**Implication**: These conditions **force global evaluation**

#### Trigger Context & Default Modes

Different trigger types have natural window contexts:

##### Time-Based/Scheduled Triggers (No Window Context)
```javascript
{
  trigger: { repeat_every: '1h' },
  // Default: 'independent' mode (safest - operates on each window)
  windowEvaluation: { mode: 'independent' }
}
```

**Why**: Scheduled rules run in background with no specific window context.
**Default**: Independent mode (run on each window separately)
**Override**: User can explicitly set 'global' if needed

##### Immediate Triggers (Has Window Context!)
```javascript
{
  trigger: { immediate: true },  // Fires on tab.created, tab.updated
  // Default: 'independent' mode, scoped to trigger window
  windowEvaluation: {
    mode: 'independent',
    context: 'trigger-window'  // Only evaluate in window where event occurred
  }
}
```

**Why**: Immediate trigger knows which window had the tab event.
**Default**: Independent mode, scoped to trigger window only
**Override**: User can set 'global' to check all windows on any tab event

##### Manual Execution (User Window Context)
```javascript
// When user clicks "Run Rule" from popup
{
  // Default: 'independent' mode, scoped to current window
  windowEvaluation: {
    mode: 'independent',
    context: 'current-window'
  }
}
```

**Why**: User expects rule to affect their current window.
**Default**: Independent mode, current window only
**Override**: Dashboard can show window selector

#### Enhanced Rule Schema

```javascript
{
  id: 'rule-123',
  name: 'Rule name',
  enabled: true,

  // Condition predicates (unchanged)
  when: {
    all: [
      { gte: ['tab.age', '24h'] },
      { is: ['tab.isDupe', false] }
    ]
  },

  // Actions to execute (unchanged)
  then: [
    { action: 'group', by: 'domain' },
    { action: 'close' }
  ],

  // Trigger configuration (unchanged)
  trigger: {
    repeat_every: '1h' | immediate: true | on_action: true
  },

  // NEW: Window evaluation configuration
  windowEvaluation: {
    // Evaluation mode (required)
    mode: 'independent' | 'global' | 'window-aware-global' | 'targeted',

    // Window filter (for 'targeted' mode)
    windowFilter?: {
      windowIds?: number[],              // Specific window IDs
      titleMatches?: string | RegExp,    // Window title pattern
      tabCountGte?: number,              // Windows with ≥N tabs
      tabCountLte?: number,              // Windows with ≤N tabs
      hasCategories?: string[],          // Windows containing tabs with categories
      custom?: (window) => boolean       // Custom filter function
    },

    // Context override (for immediate/manual triggers)
    context?: 'trigger-window' | 'current-window' | 'all-windows',

    // Legacy/compatibility
    _inferred?: boolean  // True if mode was auto-inferred from conditions
  },

  // Flags (unchanged)
  flags: {
    skipPinned: true,
    log: true,
    test: false
  }
}
```

#### Auto-Inference of Window Mode

For backward compatibility, infer mode from conditions if not specified:

```javascript
function inferWindowMode(rule) {
  const conditions = flattenConditions(rule.when);

  // Check for window-level conditions
  const hasWindowConditions = conditions.some(c =>
    c[1]?.startsWith('window.')
  );
  if (hasWindowConditions) {
    return 'independent';  // Window conditions force independent
  }

  // Check for cross-window conditions
  const hasCrossWindowConditions = conditions.some(c =>
    c[1]?.startsWith('total.') ||
    c[1]?.includes('InWindow')
  );
  if (hasCrossWindowConditions) {
    return 'global';  // Cross-window conditions force global
  }

  // Check trigger type
  if (rule.trigger?.immediate) {
    return 'independent';  // Immediate = likely window-scoped
  }

  // Default to independent (safest)
  return 'independent';
}
```

#### Rule Execution Engine Refactor

```javascript
async function executeRule(rule, options = {}) {
  const mode = rule.windowEvaluation?.mode || inferWindowMode(rule);

  switch (mode) {
    case 'independent':
      return await executeIndependent(rule, options);

    case 'global':
      return await executeGlobal(rule, options);

    case 'window-aware-global':
      return await executeWindowAwareGlobal(rule, options);

    case 'targeted':
      return await executeTargeted(rule, options);
  }
}

// Independent: Evaluate each window separately
async function executeIndependent(rule, options) {
  const windows = await chrome.windows.getAll();
  const results = [];

  for (const window of windows) {
    // Build window-scoped context
    const tabs = await chrome.tabs.query({ windowId: window.id });

    // Enhance tabs with time data
    enhanceTabs(tabs);

    // Build indices scoped to this window
    const idx = buildIndices(tabs);

    // Context only includes this window
    const context = { tabs, windows: [window], idx };

    // Evaluate and execute
    const matches = evaluateRule(rule, context);
    if (matches.length > 0) {
      const actionResults = await executeActions(matches, rule.then);
      results.push({ windowId: window.id, matches, actionResults });
    }
  }

  return results;
}

// Global: Evaluate all windows together
async function executeGlobal(rule, options) {
  // Get all tabs and windows
  const tabs = await chrome.tabs.query({});
  const windows = await chrome.windows.getAll();

  // Enhance tabs
  enhanceTabs(tabs);

  // Build global indices
  const idx = buildIndices(tabs);

  // Global context
  const context = { tabs, windows, idx };

  // Evaluate and execute
  const matches = evaluateRule(rule, context);
  const actionResults = await executeActions(matches, rule.then);

  return [{ global: true, matches, actionResults }];
}

// Window-Aware Global: Global condition, per-window action
async function executeWindowAwareGlobal(rule, options) {
  // Get all tabs and windows
  const tabs = await chrome.tabs.query({});
  const windows = await chrome.windows.getAll();

  // Enhance tabs
  enhanceTabs(tabs);

  // Build global indices
  const idx = buildIndices(tabs);

  // Evaluate condition globally
  const context = { tabs, windows, idx };
  const globalMatches = evaluateConditions(rule.when, context);

  if (!globalMatches) {
    return [];  // Global condition not met
  }

  // Execute action per-window
  const results = [];
  for (const window of windows) {
    const windowTabs = tabs.filter(t => t.windowId === window.id);
    const matches = windowTabs.filter(t => globalMatches.includes(t));

    if (matches.length > 0) {
      const actionResults = await executeActions(matches, rule.then);
      results.push({ windowId: window.id, matches, actionResults });
    }
  }

  return results;
}

// Targeted: Only specific windows
async function executeTargeted(rule, options) {
  const windows = await chrome.windows.getAll();

  // Filter windows based on windowFilter
  const targetWindows = windows.filter(w =>
    matchesWindowFilter(w, rule.windowEvaluation.windowFilter)
  );

  if (targetWindows.length === 0) {
    return [];  // No matching windows
  }

  const results = [];

  for (const window of targetWindows) {
    const tabs = await chrome.tabs.query({ windowId: window.id });
    enhanceTabs(tabs);

    const idx = buildIndices(tabs);
    const context = { tabs, windows: [window], idx };

    const matches = evaluateRule(rule, context);
    if (matches.length > 0) {
      const actionResults = await executeActions(matches, rule.then);
      results.push({ windowId: window.id, matches, actionResults });
    }
  }

  return results;
}

// Window filter matcher
function matchesWindowFilter(window, filter) {
  if (!filter) return true;

  if (filter.windowIds && !filter.windowIds.includes(window.id)) {
    return false;
  }

  if (filter.titleMatches) {
    const pattern = typeof filter.titleMatches === 'string'
      ? new RegExp(filter.titleMatches, 'i')
      : filter.titleMatches;
    if (!pattern.test(window.title || '')) {
      return false;
    }
  }

  if (filter.tabCountGte && window.tabs.length < filter.tabCountGte) {
    return false;
  }

  if (filter.tabCountLte && window.tabs.length > filter.tabCountLte) {
    return false;
  }

  if (filter.custom && !filter.custom(window)) {
    return false;
  }

  return true;
}
```

#### Immediate Trigger Window Context

For immediate triggers, pass window context:

```javascript
chrome.tabs.onCreated.addListener(async (tab) => {
  await checkImmediateTriggers('tab.created', {
    triggerWindow: tab.windowId,
    triggerTab: tab
  });
});

async function checkImmediateTriggers(event, triggerContext = {}) {
  const immediateRules = state.rules.filter(r =>
    r.enabled && r.trigger?.immediate
  );

  for (const rule of immediateRules) {
    const mode = rule.windowEvaluation?.mode || 'independent';
    const context = rule.windowEvaluation?.context || 'trigger-window';

    // Override window scope based on context
    if (context === 'trigger-window' && triggerContext.triggerWindow) {
      await executeRule(rule, {
        mode: 'independent',
        windowId: triggerContext.triggerWindow
      });
    } else {
      await executeRule(rule);
    }
  }
}
```

## Test Infrastructure Enhancement

### Multi-Window Test Support

#### 1. TestMode Enhancements

```javascript
class TestMode {
  constructor() {
    this.testWindows = new Map();  // Support multiple test windows
    this.primaryWindow = null;
  }

  async createTestWindow(name = 'primary', options = {}) {
    const window = await chrome.windows.create({
      type: 'normal',
      focused: name === 'primary',
      ...options
    });

    this.testWindows.set(name, window);
    if (name === 'primary') {
      this.primaryWindow = window;
    }

    return window;
  }

  async getTestWindow(name) {
    return this.testWindows.get(name);
  }

  async cleanupAllWindows() {
    for (const [name, window] of this.testWindows) {
      await chrome.windows.remove(window.id);
    }
    this.testWindows.clear();
  }
}
```

#### 2. TabSimulator Enhancements

```javascript
class TabSimulator {
  async createTabInWindow(windowName, config) {
    const window = await this.testMode.getTestWindow(windowName);
    if (!window) {
      throw new Error(`Test window '${windowName}' not found`);
    }

    return this.createTab({
      ...config,
      windowId: window.id
    });
  }
}
```

#### 3. New Test Steps

```javascript
// Test configuration
{
  name: 'Multi-window duplicate detection',
  steps: [
    // Create two test windows
    {
      type: 'createWindow',
      name: 'window1',
      focused: true
    },
    {
      type: 'createWindow',
      name: 'window2',
      focused: false
    },

    // Create duplicate tabs across windows
    {
      type: 'createTab',
      windowName: 'window1',
      url: 'https://example.com',
      title: 'Example'
    },
    {
      type: 'createTab',
      windowName: 'window2',
      url: 'https://example.com',
      title: 'Example Duplicate'
    },

    // Execute duplicate detection scoped to window1
    {
      type: 'execute',
      action: 'closeDuplicates',
      windowScope: 'window1'
    },

    // Assert: Only window1 duplicate removed
    {
      type: 'assert',
      assertion: 'tabCount',
      windowName: 'window1',
      expected: { count: 1 }
    },
    {
      type: 'assert',
      assertion: 'tabCount',
      windowName: 'window2',
      expected: { count: 1 }  // Still has the duplicate
    },

    // Now close duplicates across all windows
    {
      type: 'execute',
      action: 'closeDuplicates',
      windowScope: 'all'
    },

    // Assert: Duplicates removed from both windows
    {
      type: 'assert',
      assertion: 'tabCount',
      windowName: 'window1',
      expected: { count: 1 }
    },
    {
      type: 'assert',
      assertion: 'tabCount',
      windowName: 'window2',
      expected: { count: 0 }  // Duplicate removed
    }
  ]
}
```

#### 4. New Assertions

```javascript
class Assertions {
  // Assert tab count in specific window
  async assertWindowTabCount(windowName, expectedCount) {
    const window = await this.testMode.getTestWindow(windowName);
    const tabs = await chrome.tabs.query({ windowId: window.id });

    if (tabs.length !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} tabs in window '${windowName}', got ${tabs.length}`
      );
    }
  }

  // Assert no cross-window contamination
  async assertWindowIsolation(operation, windowName) {
    const beforeState = await this.captureAllWindowsState();

    // Execute operation scoped to specific window
    await operation({ windowId: windowName });

    const afterState = await this.captureAllWindowsState();

    // Verify only target window changed
    for (const [name, window] of this.testMode.testWindows) {
      if (name !== windowName) {
        const before = beforeState.windows.get(name);
        const after = afterState.windows.get(name);

        if (JSON.stringify(before) !== JSON.stringify(after)) {
          throw new Error(
            `Window '${name}' was modified but should have been isolated`
          );
        }
      }
    }
  }
}
```

### Test Scenarios

#### Scenario 1: Window-Scoped Duplicate Detection

```javascript
{
  name: 'Close duplicates respects window scope',
  description: 'Duplicate detection should only find duplicates within specified window',
  steps: [
    { type: 'createWindow', name: 'dev' },
    { type: 'createWindow', name: 'research' },

    // Create duplicates in dev window
    { type: 'createTab', windowName: 'dev', url: 'https://github.com' },
    { type: 'createTab', windowName: 'dev', url: 'https://github.com' },
    { type: 'createTab', windowName: 'dev', url: 'https://stackoverflow.com' },

    // Create duplicates in research window
    { type: 'createTab', windowName: 'research', url: 'https://github.com' },
    { type: 'createTab', windowName: 'research', url: 'https://github.com' },

    // Close duplicates in dev window only
    { type: 'execute', action: 'closeDuplicates', windowScope: 'dev' },

    // Assertions
    { type: 'assert', assertion: 'tabCount', windowName: 'dev', expected: 2 },
    { type: 'assert', assertion: 'tabCount', windowName: 'research', expected: 2 },

    // Close duplicates across all windows
    { type: 'execute', action: 'closeDuplicates', windowScope: 'all' },

    // Assertions
    { type: 'assert', assertion: 'tabCount', windowName: 'dev', expected: 2 },
    { type: 'assert', assertion: 'tabCount', windowName: 'research', expected: 1 }
  ]
}
```

#### Scenario 2: Rule Window Scope

```javascript
{
  name: 'Rules respect window scope configuration',
  description: 'Rules with window scope should only affect specified windows',
  steps: [
    { type: 'createWindow', name: 'active' },
    { type: 'createWindow', name: 'archive' },

    // Create old tabs in both windows
    {
      type: 'createTab',
      windowName: 'active',
      url: 'https://old-tab.com',
      age: 8 * 24 * 60 * 60 * 1000  // 8 days old
    },
    {
      type: 'createTab',
      windowName: 'archive',
      url: 'https://archive-tab.com',
      age: 8 * 24 * 60 * 60 * 1000  // 8 days old
    },

    // Create rule scoped to 'active' window only
    {
      type: 'createRule',
      rule: {
        name: 'Close old tabs in active window',
        conditions: [{ type: 'age', operator: 'greaterThan', value: 7, unit: 'days' }],
        actions: [{ type: 'close' }],
        windowScope: { type: 'specific', windowIds: ['active'] }
      }
    },

    { type: 'executeRule', ruleId: 'captured.ruleId' },

    // Assertions
    { type: 'assert', assertion: 'tabCount', windowName: 'active', expected: 0 },
    { type: 'assert', assertion: 'tabCount', windowName: 'archive', expected: 1 }
  ]
}
```

#### Scenario 3: Cross-Window Group Detection

```javascript
{
  name: 'Group by domain does not cross windows',
  description: 'Grouping should only organize tabs within the specified window',
  steps: [
    { type: 'createWindow', name: 'work' },
    { type: 'createWindow', name: 'personal' },

    // Create github tabs in work window
    { type: 'createTab', windowName: 'work', url: 'https://github.com/repo1' },
    { type: 'createTab', windowName: 'work', url: 'https://github.com/repo2' },
    { type: 'createTab', windowName: 'work', url: 'https://stackoverflow.com' },

    // Create github tabs in personal window
    { type: 'createTab', windowName: 'personal', url: 'https://github.com/personal' },

    // Group by domain in work window
    { type: 'execute', action: 'groupByDomain', windowScope: 'work' },

    // Assertions
    {
      type: 'assert',
      assertion: 'groupCount',
      windowName: 'work',
      expected: { count: 2, groups: ['github.com', 'stackoverflow.com'] }
    },
    {
      type: 'assert',
      assertion: 'groupCount',
      windowName: 'personal',
      expected: { count: 0 }  // No groups created
    }
  ]
}
```

#### Scenario 4: Rule Evaluation Modes

**Independent Mode:**
```javascript
{
  name: 'Rule execution respects independent mode',
  steps: [
    { type: 'createWindow', name: 'dev' },
    { type: 'createWindow', name: 'personal' },

    // Create github.com tabs in both windows
    { type: 'createTab', windowName: 'dev', url: 'https://github.com/work/repo' },
    { type: 'createTab', windowName: 'dev', url: 'https://github.com/work/repo' },  // Duplicate
    { type: 'createTab', windowName: 'personal', url: 'https://github.com/personal/repo' },
    { type: 'createTab', windowName: 'personal', url: 'https://github.com/personal/repo' },  // Duplicate

    {
      type: 'createRule',
      rule: {
        name: 'Close duplicates per window',
        windowEvaluation: { mode: 'independent' },
        when: { is: ['tab.isDupe', true] },
        then: [{ action: 'close' }]
      }
    },

    { type: 'executeRule', ruleId: 'captured:ruleId' },

    // Each window should have 1 tab (duplicates removed independently)
    { type: 'assert', assertion: 'tabCount', windowName: 'dev', expected: 1 },
    { type: 'assert', assertion: 'tabCount', windowName: 'personal', expected: 1 }
  ]
}
```

**Global Mode:**
```javascript
{
  name: 'Rule with global mode affects all windows',
  steps: [
    { type: 'createWindow', name: 'window1' },
    { type: 'createWindow', name: 'window2' },

    // Create same URL in both windows
    { type: 'createTab', windowName: 'window1', url: 'https://example.com' },
    { type: 'createTab', windowName: 'window2', url: 'https://example.com' },

    {
      type: 'createRule',
      rule: {
        name: 'Global duplicate removal',
        windowEvaluation: { mode: 'global' },
        when: { is: ['tab.isDupe', true] },
        then: [{ action: 'close' }]
      }
    },

    { type: 'executeRule', ruleId: 'captured:ruleId' },

    // One tab should remain, one should be closed (cross-window dedup)
    {
      type: 'assert',
      assertion: 'custom',
      validator: async () => {
        const allTabs = await chrome.tabs.query({});
        if (allTabs.length !== 1) {
          throw new Error(`Expected 1 tab total, got ${allTabs.length}`);
        }
      }
    }
  ]
}
```

**Targeted Mode:**
```javascript
{
  name: 'Rule with targeted mode only affects matching windows',
  steps: [
    { type: 'createWindow', name: 'work', title: 'Work Project' },
    { type: 'createWindow', name: 'personal', title: 'Personal' },

    // Create social media tabs in both
    { type: 'createTab', windowName: 'work', url: 'https://twitter.com' },
    { type: 'createTab', windowName: 'personal', url: 'https://twitter.com' },

    {
      type: 'createRule',
      rule: {
        name: 'Close social media in work windows only',
        windowEvaluation: {
          mode: 'targeted',
          windowFilter: { titleMatches: /work/i }
        },
        when: { in: ['tab.category', ['social']] },
        then: [{ action: 'close' }]
      }
    },

    { type: 'executeRule', ruleId: 'captured:ruleId' },

    // Work window should be empty, personal window unchanged
    { type: 'assert', assertion: 'tabCount', windowName: 'work', expected: 0 },
    { type: 'assert', assertion: 'tabCount', windowName: 'personal', expected: 1 }
  ]
}
```

**Window-Aware Global Mode:**
```javascript
{
  name: 'Window-aware global mode: global condition, per-window action',
  steps: [
    { type: 'createWindow', name: 'window1' },
    { type: 'createWindow', name: 'window2' },

    // Create 150 tabs in window1, 60 tabs in window2 (210 total)
    {
      type: 'createTabs',
      windowName: 'window1',
      count: 150,
      urlPattern: 'https://example.com/page-{index}'
    },
    {
      type: 'createTabs',
      windowName: 'window2',
      count: 60,
      urlPattern: 'https://test.com/page-{index}'
    },

    {
      type: 'createRule',
      rule: {
        name: 'If total > 200, suspend 30% from each window',
        windowEvaluation: { mode: 'window-aware-global' },
        when: { gte: ['total.tabCount', 200] },
        then: [{ action: 'suspend', target: 'oldest', percent: 30 }]
      }
    },

    { type: 'executeRule', ruleId: 'captured:ruleId' },

    // Verify proportional suspension
    // window1: 150 * 0.7 = 105 active
    // window2: 60 * 0.7 = 42 active
    {
      type: 'assert',
      assertion: 'tabCount',
      windowName: 'window1',
      expected: 105,
      filter: { discarded: false }
    },
    {
      type: 'assert',
      assertion: 'tabCount',
      windowName: 'window2',
      expected: 42,
      filter: { discarded: false }
    }
  ]
}
```

#### Scenario 5: Immediate Trigger Window Context

```javascript
{
  name: 'Immediate triggers execute in trigger window only',
  steps: [
    { type: 'createWindow', name: 'window1' },
    { type: 'createWindow', name: 'window2' },

    // Create rule with immediate trigger
    {
      type: 'createRule',
      rule: {
        name: 'Group gmail on creation',
        trigger: { immediate: true },
        windowEvaluation: {
          mode: 'independent',
          context: 'trigger-window'  // Only affect window where tab was created
        },
        when: { contains: ['tab.url', 'gmail'] },
        then: [{ action: 'group', name: 'Gmail', createIfMissing: true }]
      },
      captureAs: 'gmailRule'
    },

    // Create gmail tab in window1 (should trigger rule)
    { type: 'createTab', windowName: 'window1', url: 'https://gmail.com/inbox' },

    { type: 'wait', ms: 500 },  // Wait for immediate trigger

    // window1 should have group, window2 should not
    {
      type: 'assert',
      assertion: 'groupsInWindow',
      windowName: 'window1',
      expected: [{ title: 'Gmail', tabCount: 1 }]
    },
    {
      type: 'assert',
      assertion: 'groupsInWindow',
      windowName: 'window2',
      expected: []
    },

    // Now create gmail tab in window2
    { type: 'createTab', windowName: 'window2', url: 'https://gmail.com/compose' },

    { type: 'wait', ms: 500 },

    // window2 should now have its own Gmail group
    {
      type: 'assert',
      assertion: 'groupsInWindow',
      windowName: 'window2',
      expected: [{ title: 'Gmail', tabCount: 1 }]
    },

    // Verify groups are separate (not merged across windows)
    {
      type: 'assert',
      assertion: 'custom',
      validator: async () => {
        const allGroups = await chrome.tabGroups.query({});
        const gmailGroups = allGroups.filter(g => g.title === 'Gmail');
        if (gmailGroups.length !== 2) {
          throw new Error(`Expected 2 Gmail groups, got ${gmailGroups.length}`);
        }
      }
    }
  ]
}
```

### Rule UI/UX Enhancements

#### Rule Editor - Window Evaluation Section

```
┌─────────────────────────────────────────────────────────┐
│ Rule Configuration: Close Duplicates                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ Name: Close duplicate tabs                              │
│                                                          │
│ ┌─ Window Evaluation ─────────────────────────────────┐ │
│ │                                                      │ │
│ │ How should this rule evaluate tabs?                 │ │
│ │                                                      │ │
│ │ ◉ Independent (Each window separately)              │ │
│ │   └─ Each window evaluated independently            │ │
│ │      Duplicates determined within each window       │ │
│ │                                                      │ │
│ │ ○ Global (All windows together)                     │ │
│ │   └─ Tabs evaluated across all windows              │ │
│ │      Duplicates determined globally                 │ │
│ │                                                      │ │
│ │ ○ Targeted (Specific windows)                       │ │
│ │   └─ Only apply to matching windows                 │ │
│ │      [Configure filters...]                         │ │
│ │                                                      │ │
│ │ ○ Window-Aware Global                               │ │
│ │   └─ Global conditions, per-window actions          │ │
│ │                                                      │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ Conditions: [...]                                        │
│ Actions: [...]                                           │
│                                                          │
│          [Cancel]  [Save Rule]                           │
└─────────────────────────────────────────────────────────┘
```

#### Targeted Mode - Window Filter Configuration

```
┌─────────────────────────────────────────────────────────┐
│ Window Filter Configuration                              │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ Apply this rule only to windows matching:               │
│                                                          │
│ ☑ Window title contains: [work________________]         │
│                                                          │
│ ☑ Tab count:  [≥___] [50___] tabs                       │
│                                                          │
│ ☐ Contains categories:                                  │
│   □ News  □ Social  □ Shopping  □ Development           │
│                                                          │
│ ☐ Specific window IDs:                                  │
│   [________________________]                             │
│   (comma-separated)                                      │
│                                                          │
│                              [Cancel]  [Apply Filter]    │
└─────────────────────────────────────────────────────────┘
```

#### Dashboard - Rule Preview with Window Context

```
┌─────────────────────────────────────────────────────────┐
│ Rule Preview: Close Duplicates                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ Mode: Independent (Each window)                         │
│                                                          │
│ Preview Results:                                         │
│                                                          │
│ 📊 Window: Development (ID: 123)                        │
│    ├─ Matching tabs: 8                                  │
│    ├─ Actions: Close 5 duplicates                       │
│    └─ Would keep: 3 unique tabs                         │
│                                                          │
│ 📊 Window: Research (ID: 456)                           │
│    ├─ Matching tabs: 12                                 │
│    ├─ Actions: Close 8 duplicates                       │
│    └─ Would keep: 4 unique tabs                         │
│                                                          │
│ 📊 Window: Personal (ID: 789)                           │
│    ├─ Matching tabs: 0                                  │
│    └─ No actions                                        │
│                                                          │
│ Total Impact: 13 tabs closed across 2 windows           │
│                                                          │
│          [Cancel]  [Run Rule]                            │
└─────────────────────────────────────────────────────────┘
```

#### Immediate Trigger Context Selector

```
┌─────────────────────────────────────────────────────────┐
│ Immediate Trigger Configuration                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ When triggered by a tab event:                          │
│                                                          │
│ ◉ Process trigger window only                           │
│   └─ Recommended: Rule only affects the window          │
│      where the tab event occurred                       │
│                                                          │
│ ○ Process current window                                │
│   └─ Rule affects the currently active window           │
│                                                          │
│ ○ Process all windows                                   │
│   └─ ⚠️  Rule checks all windows on any tab event       │
│      (may impact performance)                           │
│                                                          │
│ ℹ️  This setting only applies to immediate triggers.    │
│     Scheduled and manual executions use the window      │
│     evaluation mode above.                              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

#### Manual Rule Execution - Window Selector

When user clicks "Run Rule" from popup:

```
┌─────────────────────────────────────────────────────────┐
│ Execute Rule: Group by Domain                            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ Rule mode: Independent                                  │
│                                                          │
│ Execute in:                                             │
│                                                          │
│ ◉ This window only                                      │
│   └─ Current: Development (50 tabs)                     │
│                                                          │
│ ○ All windows (3 total)                                │
│   ├─ Development: 50 tabs                              │
│   ├─ Research: 120 tabs                                │
│   └─ Personal: 25 tabs                                 │
│                                                          │
│ Preview:                                                │
│ • 8 domains would be grouped                            │
│ • 3 new groups would be created                         │
│                                                          │
│          [Cancel]  [Execute]                            │
└─────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)

**Goal**: Fix critical bugs and establish window-scoping pattern

1. **Create helper functions**
   - `resolveWindowScope(windowId, sender)` utility
   - `buildWindowQuery(windowId)` for chrome.tabs.query

2. **Fix `findAndCloseDuplicates()`**
   - Add `options` parameter with `windowId` and `sender`
   - Update message handler to pass `sender`
   - Default to current window when called from popup

3. **Update message handler**
   - Pass `sender` context to all operations
   - Add logging for window scope debugging

4. **Write migration tests**
   - Verify backward compatibility
   - Test both current and all-windows behavior

**Deliverables:**
- ✅ `findAndCloseDuplicates()` respects window scope
- ✅ Message handler passes window context
- ✅ Unit tests for window scope resolution
- ✅ Integration test: duplicate detection in multi-window scenario

### Phase 2: Test Infrastructure (Week 2)

**Goal**: Enable comprehensive multi-window testing

1. **Enhance TestMode**
   - Support multiple named test windows
   - Add `createTestWindow(name)` method
   - Add `getTestWindow(name)` method
   - Update cleanup to handle multiple windows

2. **Enhance TabSimulator**
   - Add `createTabInWindow(windowName, config)`
   - Support window references in tab creation

3. **Enhance TestRunner**
   - Add `createWindow` step executor
   - Add window context to execution environment
   - Support window names in assertions

4. **Enhance Assertions**
   - Add `assertWindowTabCount(windowName, count)`
   - Add `assertWindowIsolation(operation, windowName)`
   - Add `assertGroupsInWindow(windowName, expected)`

**Deliverables:**
- ✅ Multi-window test infrastructure
- ✅ 3+ multi-window test scenarios
- ✅ Documentation for writing multi-window tests
- ✅ Example tests for each operation

### Phase 3: UI/UX Enhancements (Week 3)

**Goal**: Give users explicit control over window scope

1. **Add scope selector to popup**
   - Dropdown: "This Window" / "All Windows"
   - Show window titles in dropdown
   - Persist user preference

2. **Update quick action previews**
   - Show counts per window when scope = all
   - Add window indicators to preview

3. **Add confirmation for all-windows**
   - Modal showing impact across windows
   - Breakdown by window
   - "Don't ask again" checkbox

4. **Settings page additions**
   - Default window scope preference
   - Confirmation preferences

**Deliverables:**
- ✅ Window scope selector in popup
- ✅ Confirmation modal for all-windows operations
- ✅ Settings for default behavior
- ✅ Visual indicators for operation scope

### Phase 4: Rules Engine Integration (Week 4)

**Goal**: Add window scope to rules

1. **Extend rule schema**
   - Add `windowScope` field
   - Support 'current', 'all', 'specific'
   - Add window selector in rule editor

2. **Update rule execution**
   - Filter tabs by rule's window scope
   - Evaluate conditions per-window when appropriate
   - Track rule executions by window

3. **Rule statistics by window**
   - Show rule impact per window
   - Dashboard: rule activity by window

**Deliverables:**
- ✅ Rule schema supports window scope
- ✅ Rule editor allows window configuration
- ✅ Rule execution respects window scope
- ✅ Dashboard shows per-window rule statistics

### Phase 5: Advanced Features (Future)

1. **Window profiles**
   - Save/restore specific windows
   - Name and icon for windows
   - Window-specific rules

2. **Cross-window operations**
   - Move tabs between windows
   - Merge windows
   - Compare windows (duplicates across)

3. **Window analytics**
   - Memory usage per window
   - Tab distribution across windows
   - Activity patterns by window

## Edge Cases & Error Handling

### Edge Case 1: Window Closed During Operation

```javascript
async function findAndCloseDuplicates(options = {}) {
  const { windowId } = options;

  try {
    // Verify window still exists
    if (windowId !== 'all') {
      await chrome.windows.get(windowId);
    }

    const tabs = await chrome.tabs.query({ windowId });
    // ... operation
  } catch (error) {
    if (error.message.includes('No window with id')) {
      throw new Error('Target window was closed');
    }
    throw error;
  }
}
```

### Edge Case 2: No Sender Context

```javascript
function resolveWindowScope(windowId, sender) {
  if (windowId === 'all') return 'all';
  if (typeof windowId === 'number') return windowId;

  if (!sender?.tab?.windowId) {
    // Fallback: use last focused window
    console.warn('No sender context, using last focused window');
    return chrome.windows.WINDOW_ID_CURRENT;
  }

  return sender.tab.windowId;
}
```

### Edge Case 3: Operation Split Across Windows

```javascript
// When user selects tabs across multiple windows
async function closeSelectedTabs(tabIds) {
  // Group by window
  const byWindow = new Map();
  for (const id of tabIds) {
    const tab = await chrome.tabs.get(id);
    if (!byWindow.has(tab.windowId)) {
      byWindow.set(tab.windowId, []);
    }
    byWindow.get(tab.windowId).push(id);
  }

  // Confirm if multiple windows
  if (byWindow.size > 1) {
    const confirmed = await showConfirmation(
      `Close ${tabIds.length} tabs across ${byWindow.size} windows?`
    );
    if (!confirmed) return;
  }

  // Execute per window
  for (const [windowId, ids] of byWindow) {
    await chrome.tabs.remove(ids);
  }
}
```

## Backward Compatibility

### Breaking Changes

1. **`findAndCloseDuplicates()` behavior change**
   - **Before**: Affected all windows
   - **After**: Affects current window by default
   - **Migration**: Add `windowId: 'all'` for old behavior

2. **Message handler signatures**
   - **Before**: Functions had no window context
   - **After**: Functions receive `sender` parameter
   - **Migration**: Existing callers still work (defaults apply)

### Non-Breaking Changes

1. All existing code continues to work
2. New functionality is opt-in
3. Default behavior matches user expectations

## Success Metrics

### Functional Metrics
- ✅ All operations respect window scope parameter
- ✅ 0 cross-window contamination bugs
- ✅ 95%+ test coverage for multi-window scenarios
- ✅ All quick actions have window scope controls

### User Experience Metrics
- ✅ User can select window scope in < 2 clicks
- ✅ Confirmation shown for all-windows operations
- ✅ Visual indicators show operation scope
- ✅ No surprised users (telemetry: accidental multi-window operations)

### Testing Metrics
- ✅ 10+ multi-window test scenarios
- ✅ All operations have multi-window tests
- ✅ Cross-window isolation verified for all operations
- ✅ Window scope edge cases covered

## Documentation Requirements

1. **User Documentation**
   - Guide: "Working with Multiple Windows"
   - FAQ: "Why does this operation affect all my windows?"
   - Settings: Window scope preferences explanation

2. **Developer Documentation**
   - Pattern: How to add window scope to operations
   - API: `resolveWindowScope()` and helpers
   - Testing: Writing multi-window tests

3. **Changelog**
   - Breaking change notice for `closeDuplicates`
   - Migration guide for extension consumers
   - New features: window scope controls

## Open Questions

1. **Default behavior for dashboard operations?**
   - Dashboard has global view, should default to 'all'?
   - Or should it match popup behavior for consistency?

2. **Keyboard shortcuts window context?**
   - Global shortcuts affect which window?
   - Active window? All windows?

3. **Rule scheduling and windows?**
   - Time-based rules run in which window context?
   - Should rules have per-window schedules?

4. **Window naming?**
   - Should we support user-defined window names?
   - Integration with Chrome's window naming?

## References

- Issue #10: Group by domain rules affect tabs across all windows
- Issue #4: Rule trigger only active during certain times (window context needed)
- SPEC-004: Quick Action Wheel/Grid (window scope for actions)
- Chrome API: [`chrome.windows`](https://developer.chrome.com/docs/extensions/reference/windows/)
- Chrome API: [`chrome.tabs`](https://developer.chrome.com/docs/extensions/reference/tabs/)

## Appendix A: Function Signatures

### Core Functions

```typescript
// Window scope resolution
function resolveWindowScope(
  windowId: number | 'current' | 'all' | null,
  sender: chrome.runtime.MessageSender | null
): number | 'all';

// Build query object
function buildWindowQuery(
  windowId: number | 'all'
): chrome.tabs.QueryInfo;

// Operations
async function findAndCloseDuplicates(options?: {
  windowId?: number | 'current' | 'all' | null;
  sender?: chrome.runtime.MessageSender;
}): Promise<number>;

async function groupTabsByDomain(options?: {
  windowId?: number | 'current' | 'all' | null;
  sender?: chrome.runtime.MessageSender;
}): Promise<GroupResult>;

async function suspendInactiveTabs(options?: {
  windowId?: number | 'current' | 'all' | null;
  sender?: chrome.runtime.MessageSender;
  minInactiveMinutes?: number;
}): Promise<number>;
```

### Test Infrastructure

```typescript
// TestMode
class TestMode {
  testWindows: Map<string, chrome.windows.Window>;
  primaryWindow: chrome.windows.Window | null;

  async createTestWindow(
    name?: string,
    options?: chrome.windows.CreateData
  ): Promise<chrome.windows.Window>;

  async getTestWindow(name: string): Promise<chrome.windows.Window | undefined>;

  async cleanupAllWindows(): Promise<void>;
}

// TabSimulator
class TabSimulator {
  async createTabInWindow(
    windowName: string,
    config: TabConfig
  ): Promise<chrome.tabs.Tab>;
}

// Test Step Types
type CreateWindowStep = {
  type: 'createWindow';
  name: string;
  focused?: boolean;
  options?: chrome.windows.CreateData;
};

type ExecuteActionStep = {
  type: 'execute';
  action: string;
  windowScope: string | 'all';
  options?: Record<string, any>;
};

type WindowAssertionStep = {
  type: 'assert';
  assertion: string;
  windowName: string;
  expected: any;
};
```

## Appendix B: Test Scenarios Index

1. **Window-Scoped Duplicate Detection**
   - Single window duplicate removal
   - Multi-window duplicate isolation
   - All-windows duplicate removal

2. **Window-Scoped Grouping**
   - Group by domain within window
   - Verify no cross-window grouping
   - Multiple windows with same domains

3. **Rule Window Scope**
   - Current window rule execution
   - All windows rule execution
   - Specific windows rule execution

4. **Window Isolation**
   - Operation in window A doesn't affect window B
   - Concurrent operations in different windows
   - Window closed during operation

5. **UI Scope Selection**
   - User selects current window
   - User selects all windows
   - User confirms all-windows operation

6. **Edge Cases**
   - Window closed mid-operation
   - No sender context fallback
   - Empty window handling
   - Single window environment
