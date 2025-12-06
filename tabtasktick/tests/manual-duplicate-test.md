# Manual Test for Duplicate Detection with URL Parameters

## Test Scenarios

### 1. Basic Duplicate Detection
Open these tabs and verify they are detected as duplicates:
- https://example.com/page
- https://example.com/page?utm_source=google
- https://example.com/page?utm_source=facebook&utm_campaign=test
- https://example.com/page#section1
- https://example.com/page#section2

**Expected**: All 5 tabs should be shown when filtering by "Duplicates"

### 2. Different Pages Should Not Be Duplicates
Open these tabs:
- https://example.com/page1
- https://example.com/page2

**Expected**: These should NOT be shown as duplicates

### 3. Quick Actions - Close Duplicates
1. Open multiple tabs of the same page with different parameters:
   - https://github.com/user/repo
   - https://github.com/user/repo?tab=readme
   - https://github.com/user/repo?tab=code
   - https://github.com/user/repo#installation

2. Click the "Close Duplicates" quick action

**Expected**: Only one tab should remain (the first one)

### 4. Rules Engine - Duplicate Detection
1. Create a rule:
   - Condition: "Duplicate tabs"
   - Action: "Close tab"
   - Keep first: Yes

2. Open tabs with parameters as in Test 1

3. Run the rule manually

**Expected**: Only the first tab should remain

### 5. Statistics Count
1. Open 3 tabs of https://stackoverflow.com/questions/123456 with different parameters
2. Check the Overview page statistics

**Expected**: Should show "2 duplicates" (not counting the first occurrence)