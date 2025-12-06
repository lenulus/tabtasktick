# Phase 7: Dead Code Removal - Implementation Plan

## Executive Summary

**Status**: Ready for implementation
**Architecture Guardian**: APPROVED with MANDATORY modifications
**Risk Level**: MEDIUM
**Estimated Time**: 2-3 hours

## Guardian Verdict

**VIOLATION FOUND**: 1,706+ lines of deprecated engine code directly contradicts CLAUDE.md principle: *"Dead code is deleted immediately"*

**MANDATORY**: Complete removal of ALL deprecated engines. Keeping v1-legacy "for validation" is rejected as technical debt accumulation.

---

## Current State Analysis

### Active Production Code
- ✅ **`lib/engine.v2.services.js`** - Production engine (refactored in Phase 6)
  - 465 lines of pure orchestration
  - All business logic in services
  - 436/438 tests passing
  - All 9 Test Runner scenarios passing

- ✅ **`lib/engineLoader.js`** - Engine selection system
  - Currently supports v1-legacy and v2-services
  - Default: v2-services
  - **TO BE SIMPLIFIED**: Remove v1 support entirely

### Dead Code Identified (1,706+ lines)

#### Deprecated Engines:
1. **`lib/engine.js`** (644 lines)
   - Original V1 engine
   - Imported by: background-integrated.js, session/session.js (BROKEN), tests
   - Status: Completely superseded by v2-services

2. **`lib/engine.v1.legacy.js`** (~644 lines)
   - V1 legacy copy
   - Registered in engineLoader as 'v1-legacy'
   - Used by: test-engine-sandbox.js, tests
   - Status: Kept for "validation" (REJECTED by guardian)

3. **`lib/engine.v2.command.full.js`** (~200-300 lines est.)
   - Experimental command pattern engine
   - Already commented out everywhere
   - Never deployed to production

4. **`lib/engine.v2.command.compact.js`** (~200-300 lines est.)
   - Experimental command pattern engine
   - Already commented out everywhere
   - Never deployed to production

#### Critical Issue: session.js Broken Import
- **File**: `session/session.js`
- **Issue**: Imports non-existent `RulesEngine` class from `engine.js`
- **Line 4**: `import { RulesEngine } from '../lib/engine.js';`
- **Line 961**: `const engine = new RulesEngine();`
- **Status**: BROKEN - this import will fail if engine.js is loaded
- **Decision Needed**: Fix it OR delete session.js entirely

---

## Implementation Plan

### Phase 7.1: Unused Files (Dead Engine Removal)

#### **Step 1: Investigate session.js** ⚠️ CRITICAL
**Goal**: Determine if session manager is used in production

**Actions**:
- [ ] Check if session.js is referenced in manifest.json
- [ ] Check if session.html exists and is linked anywhere
- [ ] Search for links to session manager in UI code
- [ ] Test if session manager page loads (if accessible)

**Decision Matrix**:
- **IF used in production**: Fix broken import to use v2-services
- **IF NOT used**: Delete session.js and session.html entirely

**Expected**: Likely unused (broken import would have caused errors)

---

#### **Step 2: Update All Imports to v2-services** ✅ SAFE
**Goal**: Make all code work without v1 engines before deletion

**Files to Update**:

**background-integrated.js**:
```javascript
// REMOVE:
import * as engineV1 from './lib/engine.js';
// Remove from engines object: 'v1': engineV1

// REMOVE commented lines:
// import * as engineV2CommandFull from './lib/engine.v2.command.full.js';
// import * as engineV2CommandCompact from './lib/engine.v2.command.compact.js';

// UPDATE getEngine():
function getEngine() {
  // Always return v2-services (remove v1 fallback)
  return {
    runRules: engineV2Services.runRules,
    previewRule: engineV2Services.previewRule,
    buildIndices: engineV2Services.buildIndices,
    executeActions: engineV2Services.executeActions
  };
}
```

**session/session.js** (if keeping):
```javascript
// REPLACE:
import { RulesEngine } from '../lib/engine.js';

// WITH:
import { previewRule } from '../lib/engine.v2.services.js';

// UPDATE line 961:
// REMOVE: const engine = new RulesEngine();
// REMOVE: const results = await engine.previewRule(rule, context);
// REPLACE WITH: const results = await previewRule(rule, context);
```

**test-engine-sandbox.js**:
```javascript
// REMOVE:
import * as engineV1 from './lib/engine.v1.legacy.js';

// UPDATE to only import v2-services
```

**tests/engine.test.js**:
```javascript
// REPLACE:
import { ... } from '../lib/engine.js';

// WITH:
import { ... } from '../lib/engine.v2.services.js';
```

**tests/engine-compatibility.test.js**:
```javascript
// REMOVE:
import * as engineV1 from '../lib/engine.v1.legacy.js';

// DELETE the skipped comparison test (line 219):
test.skip('all engines should produce same results for basic rules', ...)
```

**tests/disabled-rule-test.test.js**:
```javascript
// REPLACE:
import { evaluateRule, previewRule, buildIndices, runRules } from '../lib/engine.js';

// WITH:
import { evaluateRule, previewRule, buildIndices, runRules } from '../lib/engine.v2.services.js';
```

**tests/utils/test-helpers.js**:
```javascript
// REPLACE:
import { buildIndices } from '../../lib/engine.js';

// WITH:
import { buildIndices } from '../../lib/engine.v2.services.js';
```

**Checklist**:
- [ ] Update background-integrated.js
- [ ] Update session/session.js (or delete)
- [ ] Update test-engine-sandbox.js (or delete)
- [ ] Update tests/engine.test.js
- [ ] Update tests/engine-compatibility.test.js
- [ ] Update tests/disabled-rule-test.test.js
- [ ] Update tests/utils/test-helpers.js

---

#### **Step 3: Run Tests** ✅ VALIDATION
**Goal**: Verify all code works before deleting engines

**Actions**:
- [ ] Run `npm test`
- [ ] Verify 436/438 tests still passing
- [ ] Fix any import errors
- [ ] Test extension loads in browser
- [ ] Test background service worker loads

**Success Criteria**: All tests pass with NO imports from deprecated engines

---

#### **Step 4: Delete Deprecated Engines** ⚠️ CRITICAL
**Goal**: Remove all dead engine code

**Files to Delete**:
- [ ] `lib/engine.js` (644 lines)
- [ ] `lib/engine.v1.legacy.js` (~644 lines)
- [ ] `lib/engine.v2.command.full.js` (~200-300 lines)
- [ ] `lib/engine.v2.command.compact.js` (~200-300 lines)

**Command**:
```bash
rm lib/engine.js
rm lib/engine.v1.legacy.js
rm lib/engine.v2.command.full.js
rm lib/engine.v2.command.compact.js
```

**Expected Result**: ~1,706+ lines deleted

---

#### **Step 5: Update engineLoader.js** ✅ SIMPLIFY
**Goal**: Remove v1-legacy support, keep only v2-services

**File**: `lib/engineLoader.js`

**Changes**:
```javascript
// REMOVE 'v1-legacy' from ENGINES object:
const ENGINES = {
  // DELETE THIS:
  // 'v1-legacy': {
  //   name: 'V1 Legacy',
  //   description: 'Original engine - for validation only',
  //   path: './engine.v1.legacy.js',
  //   module: null
  // },

  // KEEP ONLY:
  'v2-services': {
    name: 'V2 Services',
    description: 'Services-first architecture - production engine',
    path: './engine.v2.services.js',
    module: null
  }
};

// Note: DEFAULT_ENGINE is already 'v2-services' ✅
```

**Checklist**:
- [ ] Remove 'v1-legacy' from ENGINES object
- [ ] Update 'v2-services' description (remove "Default" label)
- [ ] Consider simplifying getActiveEngine (only one engine now)

---

#### **Step 6: Run Final Tests** ✅ VALIDATION
**Goal**: Verify nothing broke

**Actions**:
- [ ] Run `npm test` - verify 436/438 passing
- [ ] Load extension in Chrome
- [ ] Test background service worker (check console)
- [ ] Run all 9 Test Runner scenarios
- [ ] Test popup opens and works
- [ ] Test dashboard loads
- [ ] Verify no console errors

**Success Criteria**: All functionality working, zero regressions

---

#### **Step 7: Commit & Push** ✅ FINALIZE

**Commit Message Template**:
```
Phase 7.1: Remove all deprecated engines (1,706+ lines)

Dead code removed per architectural mandate:
- Deleted lib/engine.js (644 lines - V1 original)
- Deleted lib/engine.v1.legacy.js (644 lines - V1 copy)
- Deleted lib/engine.v2.command.full.js (~200 lines - experimental)
- Deleted lib/engine.v2.command.compact.js (~200 lines - experimental)

Updated all imports to use engine.v2.services.js:
- background-integrated.js (removed v1 fallback)
- session/session.js (fixed broken RulesEngine import OR deleted)
- test-engine-sandbox.js (v2-only)
- 5 test files updated to import from v2-services

Simplified engineLoader.js:
- Removed v1-legacy option
- Only supports v2-services now

Architecture Guardian: APPROVED (mandatory dead code deletion)
Tests: 436/438 passing
Risk: MEDIUM - touching production code, but well-tested

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

### Phase 7.2: Commented Code & TODO Cleanup

**Deferred to separate phase** - focus 7.1 on engine removal only

**Scope**:
- [ ] Remove all commented-out code blocks
- [ ] Remove TODO comments for completed work
- [ ] Remove console.logs from production code (keep debug mode logs)

---

## Risk Assessment

### Risk Level: MEDIUM

**High Risk Items**:
- 🚨 Touching background-integrated.js (production critical)
- 🚨 Deleting 1,706+ lines in one operation
- 🚨 Updating test infrastructure

**Medium Risk Items**:
- ⚠️ Session manager decision (fix vs delete)
- ⚠️ engineLoader.js simplification

**Low Risk Items**:
- ✅ Deleting command pattern engines (already commented out)
- ✅ Removing commented code

### Mitigation Strategies

**Before Deletion**:
1. Update all imports to v2-services
2. Run tests to verify nothing breaks
3. Test extension loads in browser

**During Deletion**:
1. Delete files one at a time
2. Run tests after each deletion
3. Commit frequently (can rollback easily)

**Rollback Plan**:
- All deleted code is in git history
- Simple `git revert` if issues found
- Can restore specific files if needed

---

## Success Criteria

### Code Metrics:
- [ ] 1,706+ lines of dead code deleted
- [ ] Zero imports of deleted files
- [ ] engineLoader.js supports only v2-services
- [ ] No commented code blocks in background-integrated.js

### Testing:
- [ ] All tests passing (436/438)
- [ ] Extension loads without errors
- [ ] Background service worker runs
- [ ] All 9 Test Runner scenarios pass
- [ ] No console errors

### Architecture:
- [ ] Services-first maintained
- [ ] No duplicate implementations
- [ ] Dead code eliminated
- [ ] CLAUDE.md principles enforced

---

## Decision Points

### Session Manager (session.js)

**Option A: Fix It**
- Update import to use v2-services
- Test session manager functionality
- Keep feature if working

**Option B: Delete It**
- Remove session/session.js
- Remove session/session.html (if exists)
- Remove any UI links to session manager
- Likely choice if broken import never reported

**Decision Required**: Investigate first, then choose based on findings

---

## Architecture Guardian Notes

**Key Findings**:
- VIOLATION: 1,706+ lines contradicts "delete dead code immediately"
- REJECT: Keeping v1-legacy "for validation" = technical debt excuse
- ENFORCE: Complete removal of ALL deprecated engines
- PRIORITIZE: Fix or delete broken session manager import

**Guardian Mandate**:
> "Every line of dead code is a future bug, a source of confusion, and a maintenance burden. DELETE IT NOW."

**Approved Approach**: Modified Option B (complete deletion)

---

## Implementation Checklist

### Pre-Implementation:
- [ ] Read this plan thoroughly
- [ ] Understand each step
- [ ] Have rollback strategy ready
- [ ] Backup current state (git commit)

### Phase 7.1 Execution:
- [ ] **Step 1**: Investigate session.js usage
- [ ] **Step 2**: Update all imports to v2-services
- [ ] **Step 3**: Run tests (verify before deletion)
- [ ] **Step 4**: Delete all 4 deprecated engines
- [ ] **Step 5**: Update engineLoader.js
- [ ] **Step 6**: Run final tests
- [ ] **Step 7**: Commit & push

### Post-Implementation:
- [ ] Update TODO.md (mark Phase 7.1 complete)
- [ ] Document any issues encountered
- [ ] Plan Phase 7.2 (commented code cleanup)

---

## Notes

- This is a ONE-WAY operation (files deleted from working tree)
- Git history preserves all deleted code
- Can reference old engines via git if needed
- Focus on clean deletion, not gradual migration
- Architecture guardian demands discipline

---

**Ready to Execute**: Yes, all research complete, plan approved by architecture guardian
