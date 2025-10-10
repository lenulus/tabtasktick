# Service Architecture Rules

**Last Updated**: 2025-10-10
**Status**: Active Guidelines

## Overview

TabMaster Pro follows a strict services-first architecture where all business logic lives in services, and UI/background layers remain thin presentation/orchestration layers.

## Service Layers

```
┌─────────────────────────────────────────────┐
│         UI Layer (THIN)                      │
│  popup/ dashboard/ session/ options/         │
│  - User interaction only                     │
│  - NO business logic                         │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│      background.js (THIN)                    │
│  - Routes messages to services               │
│  - Coordinates multi-service operations      │
│  - NO business logic                         │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│         Service Layer                        │
│                                              │
│  ┌──────────────────────────────────┐       │
│  │  Execution Services              │       │
│  │  /services/execution/            │       │
│  │  - Perform actions               │       │
│  │  - Modify state                  │       │
│  │  - Call Chrome APIs              │       │
│  └──────────────────────────────────┘       │
│                                              │
│  ┌──────────────────────────────────┐       │
│  │  Selection Services              │       │
│  │  /services/selection/            │       │
│  │  - Filter and select entities    │       │
│  │  - Return arrays of IDs          │       │
│  │  - Read-only operations          │       │
│  └──────────────────────────────────┘       │
│                                              │
│  ┌──────────────────────────────────┐       │
│  │  Utility Services                │       │
│  │  /services/                      │       │
│  │  - Cross-cutting concerns        │       │
│  │  - Export/Import                 │       │
│  │  - Pure functions                │       │
│  └──────────────────────────────────┘       │
└─────────────────────────────────────────────┘
```

## Service Dependency Rules

### ✅ Allowed Dependencies

1. **Same Layer (Execution → Execution)**
   - Execution services MAY depend on other execution services
   - Example: `WindowService` → `ExportImportService`
   - Rationale: Eliminates code duplication, maintains DRY

2. **Execution → Selection**
   - Execution services MAY call selection services
   - Example: `groupTabs()` → `selectTabs()`
   - Rationale: Execution needs filtering, selection is read-only

3. **Selection → Selection**
   - Selection services MAY call other selection services
   - Example: `selectDuplicates()` → `selectTabs()`
   - Rationale: Composing filters is logical

4. **Background → Any Service**
   - background.js MAY call any service
   - Rationale: Orchestration layer coordinates services

### ❌ Forbidden Dependencies

1. **Selection → Execution**
   - Selection services MUST NOT call execution services
   - Rationale: Violates unidirectional data flow

2. **Circular Dependencies**
   - Service A → Service B → Service A is FORBIDDEN
   - Rationale: Creates tight coupling, breaks testability

3. **UI → Service (Direct)**
   - UI layers MUST NOT import services directly
   - Must go through message passing to background.js
   - Rationale: Maintains separation, enables multi-surface consistency

4. **Cross-Layer Violations**
   - Services MUST NOT depend on UI components
   - Services MUST NOT depend on background.js
   - Rationale: Services should be pure business logic

## Existing Service Dependencies

### Current Dependencies (As of 2025-10-10)

1. **ExportImportService → SnoozeService**
   - File: `/services/ExportImportService.js`
   - Lines: 2 (import), 181, 533 (usage)
   - Type: Execution → Execution
   - Status: ✅ Allowed
   - Rationale: Export needs to include snoozed tabs

2. **WindowService → ExportImportService** (Planned)
   - File: `/services/execution/WindowService.js`
   - Type: Execution → Execution
   - Status: ✅ Allowed
   - Rationale: Reuses window creation logic, maintains DRY

## When to Create a Service Dependency

Ask these questions:

1. **Does it eliminate code duplication?**
   - If YES → Dependency is likely justified
   - If NO → Consider if dependency is necessary

2. **Does it maintain single source of truth?**
   - If YES → Dependency reinforces architecture
   - If NO → May indicate missing abstraction

3. **Is there a clear directional flow?**
   - Execution → Execution ✅
   - Execution → Selection ✅
   - Selection → Execution ❌

4. **Does it create circular dependency?**
   - If YES → FORBIDDEN, refactor required
   - If NO → Proceed with documentation

## Documentation Requirements

When creating a service dependency, you MUST:

1. **Document at the top of the dependent service:**
   ```javascript
   /**
    * ServiceName
    *
    * Dependencies:
    * - OtherService: Why this dependency exists (layer type)
    *
    * This service delegates [specific operation] to OtherService
    * to maintain single source of truth for [domain].
    */
   ```

2. **Add to this ARCHITECTURE.md file:**
   - Update "Existing Service Dependencies" section
   - Document rationale
   - Mark as allowed/forbidden

3. **Update service diagram if needed:**
   - Keep architecture documentation current

## Anti-Patterns to Avoid

### ❌ Convenience Dependencies
```javascript
// BAD: Using service just for convenience
import { formatDate } from '../UtilityService.js';

// GOOD: Use utility functions directly or create shared utils
import { formatDate } from '../utils/date.js';
```

### ❌ Leaky Abstractions
```javascript
// BAD: Service exposing internal details
export function getInternalTabMap() {
  return tabMap; // Exposes internal structure
}

// GOOD: Service provides clean interface
export function getTabById(tabId) {
  return tabMap.get(tabId); // Hides internal structure
}
```

### ❌ God Services
```javascript
// BAD: Single service doing everything
class TabService {
  selectTabs() {}      // Selection
  groupTabs() {}       // Execution
  exportTabs() {}      // Export
  importTabs() {}      // Import
  // ... 50 more methods
}

// GOOD: Focused services
// SelectionService - filtering only
// GroupingService - grouping only
// ExportImportService - import/export only
```

## Service Design Checklist

Before creating a new service or dependency:

- [ ] Service has single, clear responsibility
- [ ] Service is in correct layer (execution/selection/utility)
- [ ] Any dependencies follow allowed patterns
- [ ] No circular dependencies created
- [ ] Dependencies documented with rationale
- [ ] Service is < 500 lines of code
- [ ] All methods have JSDoc comments
- [ ] Service has corresponding test file

## Refactoring Guidelines

When refactoring services:

1. **Identify duplicate logic** across files
2. **Determine correct service layer** (execution/selection/utility)
3. **Create service with clear interface**
4. **Update all callers** to use new service
5. **Delete old implementations** immediately
6. **Document dependencies** if created
7. **Run full test suite** to verify
8. **Update this ARCHITECTURE.md** if patterns change

## Questions & Clarifications

If unclear whether a dependency is allowed:

1. Check if it follows "Allowed Dependencies" rules
2. Verify no circular dependency
3. Ensure it eliminates duplication
4. Document rationale clearly
5. If still unclear, create architectural review

## Monitoring Architecture Health

Regular checks to maintain architecture quality:

- [ ] No circular dependencies (check imports)
- [ ] All services in correct directories
- [ ] Dependencies documented and justified
- [ ] No business logic in UI/background layers
- [ ] Services remain focused (< 500 lines)
- [ ] Test coverage > 80% for all services

---

**Note**: These rules are living guidelines. Update this document when new patterns emerge or decisions are made.
