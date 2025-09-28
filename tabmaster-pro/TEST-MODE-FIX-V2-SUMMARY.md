# Test Mode Isolation Fix V2 - Snapshot and Restore

## Problem
Production rules (especially "Group tabs by domain" with immediate triggers) were executing during test mode, causing test failures by interfering with test scenarios.

## Solution Approach
Instead of complex filtering logic, implemented a simpler snapshot-and-restore mechanism:

1. **On Test Mode Entry**:
   - Save a snapshot of all rules' enabled states
   - Disable all production rules (those without `flags.test = true`)
   - Remove disabled rules from the scheduler

2. **On Test Mode Exit**:
   - Restore all rules to their original enabled states from the snapshot
   - Re-setup scheduler for re-enabled rules
   - Clean up the snapshot

## Implementation

Added a `chrome.storage.onChanged` listener in `background-integrated.js` (lines 2655-2713) that:

- Detects when `testModeActive` changes in storage
- When entering test mode (`true` from `false`):
  - Creates a snapshot of rule IDs and their enabled states
  - Disables all non-test rules
  - Removes them from the scheduler to prevent triggers
- When exiting test mode (`false` from `true`):
  - Retrieves the snapshot
  - Restores each rule's original enabled state
  - Re-schedules enabled rules
  - Cleans up the snapshot from storage

## Benefits

1. **Simplicity**: No complex filtering logic throughout the codebase
2. **Reliability**: Production rules are completely disabled, not just filtered
3. **Clean Restoration**: Original state is perfectly preserved and restored
4. **No Side Effects**: Test rules can run without any interference

## Testing Instructions

1. Reload the extension in Chrome (chrome://extensions/)
2. Open the popup and click "Test" to open Test Panel
3. Click "Run All Tests"
4. Verify that:
   - No "Group tabs by domain" or other production rules execute during tests
   - "trigger-mechanisms" test passes without "Group not found" error
   - "repeat-triggers" test passes without assertion failures
   - All 8 test scenarios complete successfully
5. After tests complete, verify production rules are restored to their original state

## Files Modified

- `/Users/laforge/dev/bmpro/tabmaster-pro/background-integrated.js` (lines 2655-2713)

## Expected Outcome

All test scenarios should pass without interference from production rules. The two previously failing tests should now work correctly:
- ✅ trigger-mechanisms (no more duplicate groups from production rule)
- ✅ repeat-triggers (no more interference with test groups)