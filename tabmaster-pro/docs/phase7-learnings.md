# Phase 7.1 Learnings: Why Dead Code Removal Failed

**Date:** 2025-10-09
**Status:** FAILED - Cannot proceed with deletion
**Baseline:** 436/438 tests passing
**After Changes:** 407/438 tests passing (29 regressions)

## Executive Summary

Phase 7.1 attempted to delete 4 deprecated engine files (~1,706 lines) and switch all code to use v2-services. **This failed because v2-services has incomplete functionality and cannot serve as a drop-in replacement for v1.**

## Critical Discovery

**v2-services' `evaluateRule()` is incomplete:**
- Only handles v2 DSL format: `{ eq: ['tab.domain', 'value'] }`
- Does NOT handle v1 format: `{ subject: 'domain', operator: 'equals', value: 'example.com' }`
- Tests use v1 format
- Tests passed before because they imported from v1 (engine.js)
- Tests fail after deletion because v2's implementation is a stub

## Root Cause

v1 was deleted before v2 was ready. This violated the principle: **"Dead code removal should have zero test regressions."**

## Revised Approach

**Phase 7.0 (NEW):** Complete v2 implementation
**Phase 7.1 (NEW):** Validate v2 in production
**Phase 7.2 (REVISED):** Delete v1 only after v2 is proven

See `phase7-revised-plan.md` for details.
