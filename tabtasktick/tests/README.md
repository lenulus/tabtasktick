# TabMaster Pro Tests

This directory contains unit tests for TabMaster Pro Chrome extension.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Structure

- `setup.js` - Mocks Chrome APIs and global setup
- `background.test.js` - Tests for core background script logic
- `time-tracking.test.js` - Tests for tab time tracking features
- `preview-rule.test.js` - Tests for rule preview logic (including async filter bug)
- `url-pattern.test.js` - Tests for URL pattern matching

## What We Test

### Critical Bugs Caught by Tests

1. **Async Filter Bug** - Using `filter()` with async functions returns all items
   - Test: `preview-rule.test.js` - "should correctly filter tabs using Promise.all pattern"
   
2. **GroupId === -1 Bug** - Chrome uses -1 for ungrouped tabs, not falsy values
   - Test: `background.test.js` - "should handle groupId = -1 as ungrouped"

3. **Category Matching Logic** - Ensures domains match their correct categories
   - Test: `background.test.js` - Category matching tests

### Core Functionality

- Domain grouping logic with existing groups
- Time-based criteria (inactive, age, not accessed)
- URL pattern matching with wildcards and regex
- Rule evaluation and tab filtering

## Mocking Strategy

Chrome APIs are mocked in `setup.js`:
- `chrome.tabs.*`
- `chrome.tabGroups.*`
- `chrome.storage.*`
- `chrome.runtime.*`
- `chrome.alarms.*`

## Adding New Tests

1. Create test file in `tests/` directory
2. Import necessary functions (currently copied - need to export from source)
3. Write tests following existing patterns
4. Mock Chrome APIs as needed

## TODO

- [ ] Export functions from source files instead of duplicating
- [ ] Add integration tests with full Chrome API simulation
- [ ] Add tests for dashboard UI logic
- [ ] Add tests for import/export functionality
- [ ] Add tests for snooze functionality