# LinkStash Planning Documentation

## Document Status & Reading Order

### ✅ **Primary Reference (V2 Architecture)**
1. **[LINKSTASH-INTEGRATION-ARCHITECTURE-V2.md](./LINKSTASH-INTEGRATION-ARCHITECTURE-V2.md)** - **START HERE**
   - Updated for TabMaster Pro V2 services-first architecture
   - Shows concrete implementation patterns
   - Aligns with proven Phase 1.8 patterns
   - **This is the canonical technical reference**

### 📖 **Vision & Concept Documents (Still Valid)**
2. **[LINKSTASH-UNIFIED-VISION.md](./LINKSTASH-UNIFIED-VISION.md)**
   - Core concept: Collections with States
   - Data models for Collection and Links
   - State transitions (dormant → active → working)
   - **Good for understanding the "why"**

3. **[LINKSTASH-WINDOW-REPLACEMENT-STRATEGY.md](./LINKSTASH-WINDOW-REPLACEMENT-STRATEGY.md)**
   - User problem: Window hoarding as workspace management
   - How LinkStash replaces this anti-pattern
   - Workspace switching UX concepts
   - **Good for understanding user needs**

4. **[LINKSTASH-TASK-SYSTEM.md](./LINKSTASH-TASK-SYSTEM.md)**
   - Vision: Tasks with context
   - Task-to-link relationships
   - Workflow automation concepts
   - **Good for Phase 7+ planning**

5. **[LINKSTASH-BOOKMARK-MANAGER.md](./LINKSTASH-BOOKMARK-MANAGER.md)**
   - Multi-context organization philosophy
   - Rich metadata approach
   - Link health monitoring concepts
   - **Good for understanding bookmark features**

### ⚠️ **Outdated (Do Not Use for Implementation)**
6. **[LINKSTASH-INTEGRATION-ARCHITECTURE.md](./LINKSTASH-INTEGRATION-ARCHITECTURE.md)** - SUPERSEDED
   - Original integration plan before V2 architecture
   - Uses old class-based pattern
   - Does not follow services-first architecture
   - **DO NOT USE - See V2 version instead**

7. **[LINKSTASH-TECHNICAL-SPEC.md](./LINKSTASH-TECHNICAL-SPEC.md)** - NEEDS UPDATE
   - Has good data models
   - But implementation patterns are outdated
   - Does not follow V2 architecture
   - **Use data models only, ignore API sections**

## Implementation Guide

### Where to Start

If you're implementing LinkStash, follow this order:

1. **Read V2 Architecture Doc First**
   - Understand services-first pattern
   - See concrete code examples
   - Learn message passing flow

2. **Understand the Vision**
   - Read Unified Vision for data models
   - Read Window Replacement for user problems

3. **Follow the Migration Phases**
   - From V2 Architecture doc, Phase 1-7
   - Start with Foundation (IndexedDB + Storage)
   - Build incrementally

### Key Architectural Principles (From V2)

```
✅ DO:
- Put ALL logic in /services/
- Separate Selection from Execution
- Use message passing (Surface → Background → Service)
- Pass callerWindowId for focus management
- Make all parameters explicit
- Test with multi-window scenarios

❌ DON'T:
- Put business logic in UI code
- Call Chrome APIs directly from surfaces
- Use class-based modules (use function exports)
- Forget window focus management
- Create duplicate implementations
```

### Code Organization

```
/services
  /selection
    selectCollections.js    # What collections to act on
    selectLinks.js          # What links to filter
  /execution
    /collections
      createCollection.js   # How to create
      activateWorkspace.js  # How to activate
      saveWorkspaceState.js # How to save state
    /links
      addLinks.js          # How to add links
      organizeLinks.js     # How to organize

/storage
  UnifiedStorage.js        # Chrome.storage + IndexedDB wrapper

/sidepanel                 # THIN UI
  panel.js                 # Presentation only

/dashboard/modules/views   # THIN UI
  collections.js           # Presentation only
```

## Migration from Tab Groups

### Natural Evolution Path

LinkStash Collections are the natural evolution of Tab Groups:

| Tab Groups | LinkStash Collections |
|------------|---------------------|
| Temporary | Persistent |
| Active tabs only | Active + Dormant links |
| No notes | Rich notes & tasks |
| Window-bound | Multi-window |
| Manual only | Manual + Automated |

### Conversion Flow

```javascript
// Tab Group → Collection (one-time)
Tab Group "Research" (8 tabs)
  ↓
Collection "Research" (dormant)
  - 8 links preserved
  - Group metadata (title, color)
  - Can be reactivated anytime

// Collection → Workspace (on demand)
Collection "Research" (dormant)
  ↓ [Activate]
  ↓
Workspace "Research" (working)
  - Opens pinned tabs
  - Tracks state
  - Auto-saves changes
```

## Integration Points with TabMaster

### Shared Services
- **Rule Engine**: Collections can use existing predicates
- **Category System**: Same domain categories
- **Selection Service**: Query both tabs and collections
- **Message Bus**: Unified communication

### New Services
- **Collection CRUD**: Create, Read, Update, Delete collections
- **Workspace Management**: Activate, suspend, switch workspaces
- **State Capture**: Save scroll, forms, session data
- **Link Management**: Add, organize, search links

### UI Extensions
- **Popup**: Add "Save to Collection" quick action
- **Dashboard**: New "Collections" and "Workspaces" views
- **Side Panel**: New persistent workspace browser
- **Context Menus**: "Convert group to collection"

## Timeline Estimate

Based on V2 architecture migration phases:

| Phase | Duration | Deliverables |
|-------|----------|------------|
| Phase 1: Foundation | 1-2 weeks | UnifiedStorage, data models |
| Phase 2: Core Services | 2-3 weeks | CRUD operations, message handlers |
| Phase 3: Side Panel | 2 weeks | Basic UI, collection browser |
| Phase 4: Dashboard Views | 1-2 weeks | Collections/Workspaces views |
| Phase 5: Workspace Features | 2-3 weeks | State capture, activation |
| Phase 6: Engine Integration | 1-2 weeks | Collection rules, predicates |
| Phase 7: Advanced | 2-4 weeks | Tasks, scheduling, AI |

**Total: 11-18 weeks** for full implementation

## Questions?

If you're implementing LinkStash and have questions:

1. Check V2 Architecture doc for patterns
2. Look at existing TabMaster services for examples
3. Reference TODO.md Phase 1.8 for proven patterns
4. See docs/chrome-api-lessons.md for Chrome quirks

## Contributing

When adding new features to LinkStash:

1. Create service in `/services/execution/collections/`
2. Add message handler in `background-integrated.js`
3. Update UI to call via message passing
4. Add tests following existing patterns
5. Document in V2 Architecture doc
6. Update this README if needed
