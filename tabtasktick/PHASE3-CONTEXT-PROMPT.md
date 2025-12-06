# Rules Engine 2.0 - Phase 3 Context Prompt

Use this prompt to continue development of TabMaster Pro Rules Engine 2.0 Phase 3 on another machine.

## Prompt for Resuming Phase 3:

I'm continuing work on the TabMaster Pro Chrome extension Rules Engine 2.0. Phases 1 and 2 are COMPLETE.

**Current State:**
- PRD: `/plans/rules-prd.md` - Complete product requirements
- TODO: `/TODO.md` - See Rules Engine 2.0 section for Phase 3 tasks
- Phase 1 Summary: `/docs/RULES-ENGINE-2.0-PHASE1-SUMMARY.md`
- Phase 2 Summary: `/docs/RULES-ENGINE-2.0-PHASE2-SUMMARY.md`

**Completed Components:**

Phase 1 (Core Engine - 127 tests):
- `/lib/engine.js` - Rule evaluation and action execution
- `/lib/scheduler.js` - Trigger system (immediate/repeat/once)
- `/lib/predicate.js` - Condition compilation
- `/lib/normalize.js` - URL deduplication
- `/lib/migrate-rules.js` - Migration utilities
- `/background-integrated.js` - Chrome API integration

Phase 2 (DSL Support - 98 tests):
- `/lib/dsl.js` - Parser/serializer for human-readable rules
- `/lib/dsl-highlighter.js` - Syntax highlighting
- Dashboard integration with import/export modal
- `/docs/DSL-SYNTAX.md` - Complete syntax reference

**Architecture Notes:**
- Old rule format (in dashboard) vs new format (Rules Engine 2.0)
- Conversion functions exist in `/dashboard/modules/views/rules.js`
- Test infrastructure in `/tests/utils/` (chrome-mock, factories, helpers)
- ES modules used throughout (not CommonJS)

**Phase 3 Goals (from PRD section 5.1):**
1. **Session View** - Bulk tab management with tree view (Windows → Groups → Tabs)
2. **Advanced Conditions Editor** - Visual builder for complex rule conditions
3. **Action Ordering UI** - Drag-drop interface for action sequences
4. **Categories Manager** - Domain→category mappings UI
5. **Dry-run Preview Panel** - Show which tabs would be affected

Please review the PRD section 5 (UI/UX) and help implement Phase 3 starting with the Session View for bulk tab hygiene operations.

## Key Context for Phase 3:

### Session View Requirements (PRD 5.1):
- Left panel: Windows → Groups → Tabs tree (virtualized for performance)
- Right panel: Details + bulk actions (Close, Group, Snooze, Bookmark)
- Toolbar: Search, Dedupe, "Close solos", "Move to Collector", Snapshot
- Must handle 200+ tabs efficiently

### Current Dashboard Structure:
- `/dashboard/dashboard.js` - Main dashboard (being refactored into modules)
- `/dashboard/modules/views/` - Modular view components
- `/dashboard/modules/core/state.js` - Centralized state management
- Dashboard already has tab tree view - could be extended for Session View

### Integration Points:
1. Rules can be triggered from Session View bulk actions
2. Preview uses `/lib/engine.js` dry-run capability
3. Categories from `/lib/categories.js` (190 domains mapped)
4. Use existing Chrome API wrappers in test utils

### Testing Approach:
- Unit tests for each UI component
- Integration tests for rule preview
- Manual testing with 200+ tabs
- Use existing test factories in `/tests/utils/`

## Quick Start Commands:

```bash
# Clone and setup
git clone <repo>
cd tabmaster-pro
npm install

# Run tests
npm test

# Check Rules Engine tests specifically
npm test -- tests/engine.test.js tests/dsl.test.js

# Load extension in Chrome
# 1. Open chrome://extensions/
# 2. Enable Developer mode
# 3. Load unpacked → select tabmaster-pro directory

# Start Phase 3
# Review: /plans/rules-prd.md section 5.1
# Review: /TODO.md "Phase 3: UI Enhancement" section
```

## Important Notes:
- Maintain vanilla JS approach (no React/frameworks)
- Keep performance focus for 200+ tabs
- Use virtual scrolling where needed
- Follow existing code patterns in dashboard modules
- Test with large datasets throughout development