# Test Cleanup Implementation - Verification Guide

## Problems Solved

### Original Issue
The TabMaster Pro test suite was creating Chrome tab groups during testing but not cleaning them up, leaving persistent groups like "Scheduled Group" after test completion.

### Bug Discovered: Group Action Creates Multiple Groups
The repeat-trigger test revealed a bug in the grouping logic:

**Expected Behavior**: When a rule with `{ action: 'group', name: 'Repeated Group' }` matches 3 tabs, it should create ONE group containing all 3 tabs.

**Actual Behavior**: It creates 3 separate groups, each with the same name but containing only 1 tab:
- "Repeated Group" with repeat-test.com/1
- "Repeated Group" with repeat-test.com/2
- "Repeated Group" with repeat-test.com/3

This bug occurs specifically when tabs are ungrouped and then re-grouped by a repeating trigger. The first execution works correctly (1 group with 3 tabs), but subsequent executions create separate groups.

## Solution Implemented

### New Approach: Explicit Test-Level Cleanup
Instead of relying on global cleanup at test mode deactivation, tests now explicitly clean up the resources they create.

### 1. New Test Actions Added
- **`deleteGroup`** - Removes a specific tab group by ID or title
  - Parameters: `groupId`, `title`, or `useCaptured` (to use stored ID)
- **`removeTestGroups`** - Smart cleanup that removes test-created groups
  - Parameters:
    - `windowId` (optional, defaults to test window)
    - `forceCleanAll` (optional, removes ALL groups in test window when true)
  - Behavior:
    - Normally only removes tracked groups
    - When `forceCleanAll: true` OR no groups are tracked, removes ALL groups in test window
    - Safe because test window is isolated from user's regular windows
- **`removeAllGroups`** - (DEPRECATED) Removes ALL groups in window
  - Warning: Too aggressive, will remove user-created groups too

### 2. Automatic Group Tracking
- **ALL groups created during test execution are automatically tracked**:
  - Groups created by `executeRule` actions
  - Groups created by scheduled triggers during `wait` actions
  - Groups verified by `groupExists` assertions
- Test runner maintains a `createdGroupIds` Set for safe cleanup
- `removeTestGroups` only removes tracked groups, preserving user groups

### 3. ID Capture Mechanism
- `groupExists` assertion returns `groupId` in its result
- Test steps can use `captureAs` parameter to store the group ID for later use
- Stored IDs can be referenced via `useCaptured` in cleanup actions

### 3. Updated Test Scenarios
The following test scenarios now include explicit cleanup:

#### trigger-mechanisms Test
```javascript
// Create and verify groups
{ action: 'assert', type: 'groupExists', title: 'Triggered', captureAs: 'triggeredGroupId' },
{ action: 'assert', type: 'groupExists', title: 'Scheduled Group', captureAs: 'scheduledGroupId' },

// Explicit cleanup at end of test
{ action: 'deleteGroup', useCaptured: 'triggeredGroupId' },
{ action: 'deleteGroup', useCaptured: 'scheduledGroupId' }
```

#### group-based-actions Test
```javascript
// Create and verify groups
{ action: 'assert', type: 'groupExists', title: 'github.com', captureAs: 'githubGroupId' },
{ action: 'assert', type: 'groupExists', title: 'stackoverflow.com', captureAs: 'stackGroupId' },

// Explicit cleanup at end of test
{ action: 'deleteGroup', useCaptured: 'githubGroupId' },
{ action: 'deleteGroup', useCaptured: 'stackGroupId' }
```

#### repeat-trigger-test
```javascript
// Added assertions to verify groups have correct number of tabs
// This will FAIL if the grouping bug creates multiple groups
{ action: 'assert', type: 'groupExists', title: 'Repeated Group', tabCount: 3 },

// Explicit cleanup that will FAIL if multiple groups exist
// This exposes the bug rather than hiding it
{ action: 'deleteRule', ruleId: 'Repeat Rule' },
{ action: 'deleteGroup', title: 'Repeated Group' }  // Will fail if multiple groups with same name
```

## How to Test the Implementation

### Manual Testing Steps

1. **Reload the Extension**
   - Go to `chrome://extensions/`
   - Find TabMaster Pro
   - Click the refresh button

2. **Open the Test Panel**
   - Right-click the extension icon
   - Select "Open Test Panel" (or use the side panel)

3. **Activate Test Mode**
   - Click "Activate Test Mode" button
   - Wait for the test window to open

4. **Run the Problematic Tests**
   - Select "trigger-mechanisms" from the test list
   - Click "Run Selected Test"
   - Watch for groups being created during test:
     - "Triggered" group (3 tabs)
     - "Scheduled Group" (1 tab)

5. **Observe Cleanup**
   - Watch as the test completes
   - The last steps should remove both groups
   - Check that no groups remain in the test window

6. **Verify Complete Cleanup**
   - Check Chrome's tab group area
   - No "Scheduled Group" should persist
   - No "Triggered" group should remain

### Console Verification
Open DevTools console and run:
```javascript
// Check for any remaining groups after test
chrome.tabGroups.query({}).then(groups => {
  console.log('Remaining groups:', groups.map(g => ({
    id: g.id,
    title: g.title,
    windowId: g.windowId
  })));
});
```

Expected result: Empty array or only groups not created by tests

## Implementation Files Modified

1. **`/tabmaster-pro/lib/test-mode/test-runner.js`**
   - Added `deleteGroup` executor method - removes specific groups
   - Added `removeTestGroups` executor method - safely removes only test groups
   - Added `removeAllGroups` executor (deprecated) - too aggressive
   - Added `capturedData` storage for named ID references (line 19)
   - Added `createdGroupIds` Set to track all test-created groups (line 20)
   - Modified `executeAssert` to track and optionally capture group IDs
   - Modified `executeExecuteRule` to track groups created by rules
   - Modified `executeWait` to track groups created by scheduled triggers
   - Added executors to initialization (lines 37-41)

2. **`/tabmaster-pro/lib/test-mode/assertions.js`**
   - Modified `assertGroupExists` to return `groupId` (line 273)

3. **`/tabmaster-pro/lib/test-mode/test-mode.js`**
   - Updated "trigger-mechanisms" test with cleanup (lines 438, 456, 459-460)
   - Updated "group-based-actions" test with cleanup (lines 326-332)
   - Updated "repeat-trigger-test" with cleanup (lines 588, 603-604)

## Error Handling
- If a group doesn't exist when trying to delete, the test will fail with a clear error message
- `removeAllGroups` safely handles empty group lists
- Captured IDs are only used if they exist in storage
- Ungroup operation handles tabs that may have already been closed

## Benefits of This Improved Approach
1. **Safety First**: `removeTestGroups` only removes groups created during the test
2. **Automatic Tracking**: All group creation is automatically detected and tracked
3. **User-Friendly**: Preserves any existing user groups in the test window
4. **Explicit and Predictable**: Each test is responsible for its own cleanup
5. **Precise**: Uses actual group IDs, not names, ensuring correct group removal
6. **Test Independence**: Tests don't rely on global cleanup that might fail
7. **Debuggable**: Console logs show which groups are tracked and cleaned up

## Future Improvements
- Consider adding a test framework option to auto-capture all created groups
- Add option to preserve groups for debugging when tests fail
- Create a test report showing what resources were created and cleaned up
- Add automatic fallback cleanup if explicit cleanup fails