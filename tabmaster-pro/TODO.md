# TabMaster Pro - TODO

## Current Priority

### 🔴 Implement Global Logging System

**Status**: Planned - Ready for implementation
**Documentation**: `/docs/logger-service-plan.md`
**Estimated Effort**: 5 weeks (phased rollout)

**Overview**:
Create global LoggerService with Developer Mode integration to replace ~200+ console.log statements throughout the codebase with a proper logging system.

**Key Features**:
- **Dynamic scope registration** - Scopes auto-register on first use
- **Developer Mode integration** - Logging UI only visible to developers
- **Log levels** - DEBUG, INFO, WARN, ERROR with per-scope configuration
- **Ring buffer** - Last 1000 logs for diagnostics
- **Styled console output** - Color-coded by level and scope
- **Configuration persistence** - Settings survive service worker restarts

**Migration Phases**:
1. **Phase 1** (Week 1): Core LoggerService implementation + Developer Mode
2. **Phase 2** (Week 2): Rules engine, SnoozeService, Collection services
3. **Phase 3** (Week 3): Background script, WindowService, Tab services
4. **Phase 4** (Week 4): Dashboard, Popup, Side panel UI
5. **Phase 5** (Week 5): Cleanup, polish, settings UI

**Current Blocker**: Production console.log statements identified in architecture review
- Prevents clean production deployment
- Creates noise in user consoles
- Lacks structure for debugging

**Success Criteria**:
- [ ] No console.log statements in production code paths
- [ ] All services use LoggerService
- [ ] Scopes register dynamically
- [ ] Developer Mode controls logging visibility
- [ ] Settings panel has logging configuration UI
- [ ] Debug button respects Developer Mode
- [ ] Test panel link hidden unless Developer Mode enabled
- [ ] Unit tests pass with >90% coverage
- [ ] No performance degradation

**Next Steps**:
1. Read `/docs/logger-service-plan.md` for complete implementation guide
2. Start with Phase 1: Create LoggerService core
3. Add Developer Mode toggle to Settings panel
4. Integrate Developer Mode with LoggerService
5. Write unit tests
6. Begin phased migration of services

---

## Completed (Recent)

See `TODO-cleanup.md` for completed cleanup tasks from rule debugging session (2025-01-29).

**Recent Commits**:
- `1e94a47` - Added test mode visual indicator
- `4071f16` - Refactored to TestModeService (Services-First)
- `7d52570` - Created LoggerService implementation plan

---

## Future Enhancements

Items to consider after LoggerService implementation:

### Performance Monitoring
- Add performance scope for timing critical operations
- Track rule execution times
- Monitor service worker lifecycle events

### Enhanced Debugging
- Real-time log streaming UI (optional)
- Log export to file for bug reports
- Automatic error reporting (opt-in)

### Analytics
- Track feature usage (with privacy consideration)
- Monitor error rates by scope
- Identify slow operations

---

## Notes

- **Architecture**: All implementations must follow Services-First principles (see CLAUDE.md)
- **Testing**: Unit tests required for all new services
- **Documentation**: Update user docs when adding user-facing features
- **Performance**: Target <1ms overhead per log call
- **Security**: Never log sensitive data (passwords, tokens, PII)
