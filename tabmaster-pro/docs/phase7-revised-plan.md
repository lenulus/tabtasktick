# Phase 7: Dead Code Removal (REVISED PLAN)

**Last Updated:** 2025-10-09
**Status:** Ready to Start

## Problem

Original Phase 7.1 failed because v2-services is not feature-complete. It cannot replace v1 without test regressions.

## Solution: 3-Phase Approach

### Phase 7.0: V2 Completion (MUST DO FIRST)

**Goal:** Make v2 a drop-in replacement for v1

**Tasks:**
1. Fix v2's `evaluateRule()` to handle v1 DSL format `{ subject, operator, value }`
2. Fix v2's `previewRule()` to match v1 behavior
3. Run tests - must show 436/438 passing with v2
4. No hacks, no workarounds

**Acceptance:** 436/438 tests passing with v2

**Time:** 2-3 hours

---

### Phase 7.1: V2 Validation (MUST DO SECOND)

**Goal:** Prove v1 is unused in production

**Tasks:**
1. Make v2 the default in background-integrated.js
2. Add logging for any v1 usage
3. Run in production for 1 week
4. Monitor for issues

**Acceptance:** Zero v1 usage for 1 week

**Time:** 1 week

---

### Phase 7.2: Dead Code Removal (ONLY AFTER 7.0 + 7.1)

**Goal:** Delete v1 with zero regressions

**Tasks:**
1. Delete 4 engine files (~1,706 lines)
2. Delete session/ directory (~1,768 lines)
3. Update imports
4. Run tests - MUST show 436/438 (same as baseline)

**Acceptance:** 436/438 tests passing, 3,474 lines deleted

**Time:** 1 hour

---

## Critical Rules

1. **Zero test regressions** - Tests before = Tests after
2. **No hacks** - If you need workarounds, v2 isn't ready
3. **Sequential phases** - Cannot skip 7.0 or 7.1

## Next Steps

1. ✅ Revert Phase 7.1 attempt
2. Start Phase 7.0 - Fix v2's evaluateRule()
3. Do NOT skip ahead

See `phase7-learnings.md` for detailed analysis.
