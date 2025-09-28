# Test Mode Race Condition Fix V3

## Problem
Even after implementing the snapshot-and-restore mechanism, "news-site.com" groups were being created when test mode ended. This happened because:

1. The "tab-state-actions" test creates news-site.com tabs and suspends them
2. When test cleanup runs, it removes `testModeActive` from storage
3. This triggers the storage listener which restores production rules immediately
4. Meanwhile, the test window is still being closed (async operation)
5. Suspended tabs get reloaded during window closure, triggering immediate rules
6. The restored "Group tabs by domain" rule (if enabled) would group these tabs

## Root Cause: Race Condition
The race condition occurred between:
- `chrome.windows.remove()` - async operation that takes time
- Removing `testModeActive` from storage - triggers immediate rule restoration

## Solution: Two-Part Fix

### Part 1: Test Cleanup Order (test-mode.js:1048)
Added a 500ms delay after window removal to ensure tabs are fully removed before clearing `testModeActive`:

```javascript
if (this.testWindow) {
  await chrome.windows.remove(this.testWindow.id);
  // Wait a bit to ensure the window and its tabs are fully removed
  // This prevents suspended tabs from reloading and triggering production rules
  await new Promise(resolve => setTimeout(resolve, 500));
}
```

Also moved the `testModeActive` removal to the very end of cleanup with a comment explaining why.

### Part 2: Test Mode Check in Immediate Triggers (background-integrated.js:716-735)
Updated `checkImmediateTriggers` to be async and check test mode state:

```javascript
async function checkImmediateTriggers(event) {
  // Check if we're in test mode
  const { testModeActive } = await chrome.storage.local.get('testModeActive');

  const immediateRules = state.rules.filter(r => {
    // Skip non-test rules during test mode
    if (testModeActive && !r.flags?.test) {
      return false;
    }
    // Skip test rules when not in test mode
    if (!testModeActive && r.flags?.test) {
      return false;
    }
    return r.enabled && (r.trigger?.immediate || r.trigger?.type === 'immediate');
  });

  for (const rule of immediateRules) {
    scheduler.scheduleImmediate(rule.id);
  }
}
```

## Why This Works

1. **Belt and Suspenders Approach**:
   - The delay ensures test tabs are gone before production rules are restored
   - The test mode check in immediate triggers provides additional protection

2. **No Implicit Cleanup**:
   - We're not hiding issues by cleaning up groups afterwards
   - The fix prevents the groups from being created in the first place

3. **Clear Execution Order**:
   - Test window fully closed → Production rules restored → No test tabs to trigger them

## Testing Instructions

1. Reload the extension in Chrome
2. Run the test scenarios, especially "tab-state-actions"
3. After tests complete, verify:
   - No "news-site.com" groups are created
   - All 8 tests pass
   - Production rules work normally after test mode exits

## Files Modified

- `/Users/laforge/dev/bmpro/tabmaster-pro/lib/test-mode/test-mode.js` (lines 1046-1048, 1071-1073)
- `/Users/laforge/dev/bmpro/tabmaster-pro/background-integrated.js` (lines 716-735, 690, 696)