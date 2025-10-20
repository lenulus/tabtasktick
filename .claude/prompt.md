# TabMaster Pro Development Guidelines

## Critical Project Context

**ALWAYS READ THESE FILES FIRST** before making code changes:

1. **`/CLAUDE.md`** - Architecture principles and service directory
   - Services-first architecture (all logic in `/services/*`)
   - NO SHORTCUTS rule (debug, don't work around)
   - Separation of concerns (selection vs execution)
   - Chrome extension limitations (no dynamic imports)

2. **`/TODO.md`** - Current phase status and roadmap
   - What's complete, what's in progress, what's next
   - Phase-specific requirements and acceptance criteria

3. **`/tabmaster-pro/services/`** - All business logic lives here
   - Selection services: `/services/selection/*` (what to act on)
   - Execution services: `/services/execution/*` (how to act)
   - Surfaces (popup, dashboard) are THIN - they call services

## Proactive Agent Usage

**IMPORTANT**: Use specialized agents to manage context and ensure quality:

### @agent-architecture-guardian (Use Proactively!)
**When**: After ANY significant code change, BEFORE committing
- Validates services-first architecture
- Ensures separation of concerns
- Checks for duplicate logic
- Prevents technical debt

**Example**:
```markdown
I've just implemented bulk tab grouping. Let me get architectural review:

@agent-architecture-guardian review the tab grouping implementation

Files changed:
- /services/execution/groupTabs.js
- /popup/popup.js

Please verify separation of concerns and check for duplicate logic.
```

### @agent-e2e-playwright-test-debugger
**When**: E2E test failures need systematic debugging
- Follows 5-phase workflow (Execute → Analyze → Debug → Fix → Verify)
- Manages context efficiently
- Applies known patterns

### @agent-documentation-writer
**When**: Need to create/update docs without context bloat
- Create guides, specs, API docs
- Update docs when code changes
- Generate changelogs

### @agent-git-commit-helper
**When**: Need git operations (commit, branch, status, etc.)
- Note: Cannot push to remote (security restriction)

### @agent-ux-architect
**When**: Need UX/UI design decisions
- Information architecture
- Interaction patterns
- User experience evaluation

## Development Workflow

1. **Before coding**: Read CLAUDE.md + TODO.md to understand context
2. **While coding**: Follow services-first architecture, no duplicate logic
3. **After coding**: Use @agent-architecture-guardian to review changes
4. **Before committing**: Ensure tests pass, architectural review complete
5. **Update docs**: Use @agent-documentation-writer for verbose doc work

## Key Architectural Rules

- **Services-First**: All business logic in `/services/*`, surfaces are thin
- **No Duplicate Logic**: If two places have similar code, extract to service
- **Separation of Concerns**: Selection (filtering) vs Execution (actions)
- **No Shortcuts**: Fix root causes, never comment out failing tests
- **Static Imports Only**: NEVER use `import()` or `await import()` (crashes Chrome)
- **Test Isolation**: Each test starts with clean state (beforeEach hooks)
- **Async/Await**: All Chrome API calls must be properly awaited

## File Organization

```
/services/
  ├── selection/      # What to act on (filtering, detection)
  │   ├── selectTabs.js
  │   └── detectSnoozeOperations.js
  └── execution/      # How to act (operations, state changes)
      ├── TabActionsService.js
      ├── SnoozeService.js
      ├── WindowService.js
      ├── groupTabs.js
      └── DeduplicationOrchestrator.js

/popup/              # THIN presentation layer
/dashboard/          # THIN presentation layer
/sidepanel/          # THIN presentation layer
/background.js       # THIN coordinator - calls services
```

## When in Doubt

- Check `/CLAUDE.md` for architecture guidance
- Check `/TODO.md` for current phase requirements
- Use @agent-architecture-guardian for code review
- Ask user before cutting scope or deferring features
