# TabMaster Pro - TODO

## Current Priority

### Implement Global Logging System

**Status**: Planned - Ready for implementation
**Documentation**: [/docs/logger-service-plan.md](./docs/logger-service-plan.md)
**Blocker For**: Production deployment (console.log cleanup)

**Overview**:
Create global LoggerService with Developer Mode integration to replace scattered console.log statements with a proper logging system.

**Key Features**:
- **Dynamic scope registration** - Scopes auto-register on first use (no manual registry)
- **Developer Mode integration** - Logging UI only visible when enabled in Settings
- **Log levels** - DEBUG, INFO, WARN, ERROR with per-scope configuration
- **Ring buffer** - Last 1000 logs for diagnostics
- **Configuration persistence** - Settings survive service worker restarts

**Developer Mode Controls**:
- Settings panel "Developer Settings" section (hidden by default)
- Logging configuration UI (visible when Developer Mode enabled)
- Debug button in popup (hidden unless Developer Mode enabled)
- Test panel access (hidden unless Developer Mode enabled)

**Migration Phases** (see docs for details):
1. Core LoggerService + Developer Mode infrastructure
2. Rules engine, SnoozeService, Collection services
3. Background script, WindowService, Tab services
4. Dashboard, Popup, Side panel UI
5. Cleanup, polish, settings UI

**Success Criteria**:
- [ ] No console.log in production code paths
- [ ] All services use LoggerService
- [ ] Scopes register dynamically
- [ ] Developer Mode controls logging visibility
- [ ] Settings panel has logging configuration UI
- [ ] Debug button respects Developer Mode
- [ ] Test panel hidden unless Developer Mode enabled

---

## Archived

- **[TODO-cleanup.md](./TODO-cleanup.md)** - Architectural remediation phases (Phase 1-4), branching strategy, version history
