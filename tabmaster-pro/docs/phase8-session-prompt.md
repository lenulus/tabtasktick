# Phase 8.0: Multi-Window Test Infrastructure - Session Bootstrap

**Date**: 2025-10-10
**Phase**: 8.0 - Multi-Window Test Infrastructure
**Priority**: CRITICAL - Must complete before any Phase 8 feature implementation
**Estimated Time**: 4-6 hours

## Context

You are working on TabMaster Pro, a Chrome extension for advanced tab management. The project has just completed Phase 7, achieving:
- ✅ Zero architectural violations
- ✅ 410 tests passing
- ✅ Services-first architecture with pure separation of concerns
- ✅ Single source of truth for all business logic
- ✅ Release v1.2.1 published

## Current State

**Repository**: `/Users/anthonylaforge/dev/bmpro/`
**Working Directory**: `/Users/anthonylaforge/dev/bmpro/tabmaster-pro/`
**Branch**: `main` (17 commits ahead of origin after recent release)
**Last Release**: v1.2.1 (2025-10-10)

**Recent Commits**:
- `c08dbce` - Docs: Update Phase 8 plan with service dependency analysis
- `f30ea49` - Docs: Add comprehensive Phase 8 implementation plan
- `b916583` - Docs: Mark Phase 7.2 complete
- `26a954a` - Remove duplicate DSL export/import UI from Rules Engine
- `40f8294` - Phase 7.2: Remove commented code blocks

## Your Task: Phase 8.0 - Multi-Window Test Infrastructure

**Objective**: Build test infrastructure for multi-window scenarios BEFORE implementing any Phase 8 features.

**Why This Comes First**:
- Current test suite has ZERO multi-window testing capability
- Cannot validate window operations without proper test infrastructure
- Prevents bugs and architectural violations during implementation
- Enables TDD approach for subsequent phases

## Deliverables

### 1. Create `/tests/utils/window-test-helpers.js`

Must include:
- `createMockWindow(id, tabs, options)` - Mock window objects with metadata
- `createMultiWindowScenario(config)` - Generate multi-window test data
- `createTabsWithCrossWindowDuplicates()` - Cross-window duplicate testing
- `createLargeWindow(windowId, tabCount)` - Performance testing (100+ tabs)
- `assertWindowProperties(actual, expected)` - Window property assertions
- `assertTabInWindow(tab, windowId)` - Tab location assertions
- `getTabsForWindow(allTabs, windowId)` - Filter helper

**Key Requirements**:
- Support creating 10+ windows with 100+ tabs each
- Window properties: left, top, width, height, state, type, focused, incognito
- Tab properties: windowId, groupId, url, title, pinned, active

### 2. Create `/tests/window-operations.test.js`

Test scenarios:
- Cross-window duplicate detection (same URLs in different windows)
- Large multi-window scenarios (5 windows × 50 tabs each)
- Window property preservation (position, size, state)
- Tab-to-window assignment validation

### 3. Update Test Runner (Optional)

If time permits, enhance `/lib/test-mode/test-mode.js`:
- Add multi-window test category
- Window-level assertions
- Performance benchmarks for multi-window operations

## Success Criteria

- ✅ `/tests/utils/window-test-helpers.js` created with all functions
- ✅ Can create 10+ windows with 100+ tabs each for testing
- ✅ Window property assertions working correctly
- ✅ All new tests passing (`npm test`)
- ✅ Zero architectural violations maintained
- ✅ Code follows existing patterns (see examples below)

## Important Context & Constraints

### Architecture Rules (CRITICAL)

**Read these first**:
1. `/tabmaster-pro/CLAUDE.md` - Core architecture principles and rules
2. `/tabmaster-pro/services/ARCHITECTURE.md` - Service dependency guidelines
3. `/tabmaster-pro/docs/phase8-window-operations.md` - Full Phase 8 design

**Key Principles**:
- Services-first: All business logic in `/services/*`
- No duplicate implementations
- Separation of concerns: Selection (what) vs Execution (how)
- NO dynamic imports (`import()` will crash Chrome)
- Test infrastructure must support the planned Phase 8 features

### Existing Test Patterns

**Look at these examples**:
- `/tests/engine.test.js` - Good test structure and mocking patterns
- `/tests/duplicate-detection-integration.test.js` - Integration test example
- `/tests/TabActionsService.test.js` - Service testing pattern

**Test File Structure**:
```javascript
import { describe, it, expect, beforeEach } from '@jest/globals';

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup
  });

  it('should do something specific', () => {
    // Arrange
    // Act
    // Assert
  });
});
```

### Chrome Extension APIs Used

The window test utilities will need to mock:
- `chrome.windows.create()` - Create new windows
- `chrome.windows.get()` - Get window metadata
- `chrome.windows.getAll()` - Get all windows
- `chrome.windows.update()` - Update window state
- `chrome.tabs.query({ windowId })` - Get tabs in window
- `chrome.tabGroups.query({ windowId })` - Get groups in window

## Phase 8 Context (Future Work)

Your test infrastructure will support these upcoming features:

**Phase 8.1**: WindowService
- `snoozeWindow()` - Snooze entire window with all tabs
- `restoreWindow()` - Restore snoozed window with metadata preservation
- `deduplicateWindow()` - Remove duplicates within a single window

**Phase 8.2**: Window-Scoped Deduplication
- Global vs window-scoped duplicate detection
- Rules with `scope: 'window'` option

**Phase 8.3**: Window Snooze/Restore UI
- Dashboard window action buttons
- Snoozed windows view

Design your test utilities to support testing these features!

## Code Style & Standards

**Follow existing patterns**:
- 2-space indentation
- Semicolons required
- ES6 modules (static imports only)
- JSDoc comments for exported functions
- Clear, descriptive test names
- Arrange-Act-Assert pattern in tests

**Example JSDoc**:
```javascript
/**
 * Create a mock Chrome window object
 *
 * @param {number} id - Window ID
 * @param {Array} tabs - Array of tab objects
 * @param {Object} options - Window properties (left, top, width, height, state)
 * @returns {Object} Mock window object
 */
export function createMockWindow(id, tabs = [], options = {}) {
  // ...
}
```

## Testing Your Work

Run tests frequently:
```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm test window-operations  # Run specific test
```

**All 410 existing tests must still pass!**

## Common Pitfalls to Avoid

❌ **DO NOT**:
- Use dynamic imports (`import()` or `await import()`)
- Add business logic to test utilities (keep them pure helpers)
- Create God objects (keep utilities focused and composable)
- Skip documentation (JSDoc required for all exports)
- Forget to test edge cases (0 tabs, 100+ tabs, maximized windows, etc.)

✅ **DO**:
- Follow existing test patterns
- Keep utilities pure and composable
- Test with realistic data volumes (100+ tabs per window)
- Document all functions with JSDoc
- Run full test suite before committing

## Questions to Ask

If uncertain about anything:
1. Check existing test files for patterns
2. Review `/tabmaster-pro/CLAUDE.md` for architecture rules
3. Look at `/services/ARCHITECTURE.md` for service patterns
4. Reference `/docs/phase8-window-operations.md` for feature context

## Expected Output

By the end of this session, you should have:

1. **New File**: `/tests/utils/window-test-helpers.js`
   - All 7+ utility functions implemented
   - Full JSDoc documentation
   - Supports 10+ windows with 100+ tabs each

2. **New File**: `/tests/window-operations.test.js`
   - Multi-window test scenarios
   - Cross-window duplicate detection tests
   - Window property preservation tests
   - All tests passing

3. **Test Results**: All 410+ tests passing (including new ones)

4. **Ready for Commit**: Clean, documented code ready to commit

## First Steps

1. Read the architecture docs (CLAUDE.md, ARCHITECTURE.md)
2. Review existing test patterns in `/tests/` directory
3. Create `/tests/utils/window-test-helpers.js` with basic structure
4. Implement utility functions one at a time
5. Create `/tests/window-operations.test.js` to use the utilities
6. Run `npm test` frequently to ensure nothing breaks
7. Commit when all tests pass

## Getting Started

Run this to verify your environment:
```bash
cd /Users/anthonylaforge/dev/bmpro/tabmaster-pro
npm test  # Should show 410 tests passing
git status  # Should show clean working tree
```

Then begin with:
```bash
# Create the utilities file
touch tests/utils/window-test-helpers.js

# Start with the basic structure and imports
# Follow patterns from existing test files
```

---

**Ready to start Phase 8.0!** Focus on building solid test infrastructure that will support all of Phase 8's window operations features. Take your time, follow the patterns, and maintain the zero-violation standard. Good luck! 🚀
