# Bookmark Feature Removal Plan

## Rationale

Chrome's bookmark API has problematic behavior: URLs are globally unique, so adding a bookmark in one folder removes it from another. This creates unexpected user experience issues and edge cases that are difficult to handle gracefully.

## Files to Modify

### 1. Delete Entirely

| File | Lines | Notes |
|------|-------|-------|
| `services/execution/BookmarkService.js` | 223 | Core service |
| `tests/BookmarkService.test.js` | 221 | Unit tests |

### 2. Remove Bookmark Code

#### `manifest.json`
- Remove `"bookmarks"` from permissions array (line 9)

#### `background-integrated.js`
- Remove `case 'bookmarkTabs':` message handler (~line 1417)
- Remove legacy `bookmarkTabs()` function (lines 2281-2331)

#### `dashboard/dashboard.html`
- Remove bookmark button from bulk actions toolbar (lines 308-313):
```html
<button class="action-btn" data-action="bookmark" title="Bookmark selected tabs">
  <svg>...</svg>
  <span>Bookmark</span>
</button>
```

#### `dashboard/dashboard.js`
- Remove `case 'bookmark':` from action handler (~line 579-582)
- Remove `bookmarkTabs()` function (~lines 639-647)

#### `lib/engine.v2.services.js`
- Remove import: `import { bookmarkTabs } from '../services/execution/BookmarkService.js';` (line 15)
- Remove `case 'bookmark':` entirely (lines 237-238) - unknown actions fall through to default

#### `dashboard/modules/views/rules.js`
- Remove 'bookmark' from action type options in UI
- Remove bookmark action from sample rules (line 176)
- Remove legacy `saveToBookmarks` conversion logic (lines 1187, 2239-2240, 2320-2321)
- Remove bookmark action description formatting (line 671)

#### `lib/action-validator.js` *(MISSED IN ORIGINAL PLAN)*
- Line 15: Remove 'bookmark' from `ACTION_CATEGORIES.deferral`
- Lines 30-31: Remove snooze `allowsWith: ['bookmark']` rule
- Lines 179-183: Update `getIncompatibilityReason`

#### `lib/dsl.js` *(MISSED IN ORIGINAL PLAN)*
- Lines 401-406: Remove `case 'bookmark':` in action parsing
- Lines 610-614: Remove `case 'bookmark':` in action formatting

#### `lib/dsl-highlighter.js` *(MISSED IN ORIGINAL PLAN)*
- Line 36: Remove 'bookmark' from `ACTIONS` Set

#### `lib/migrate-rules.js` *(MISSED IN ORIGINAL PLAN)*
- Lines 156-161: Remove `case 'bookmark':` migration logic
- Line 344: Remove bookmark from sample rule

### 3. Test Files to Update *(MISSED IN ORIGINAL PLAN)*

| Test File | Changes |
|-----------|---------|
| `tests/engine.test.js` | Lines 298-328: Remove 'should bookmark tabs' test |
| `tests/dsl.test.js` | Lines 148, 489: Remove DSL bookmark parsing tests |
| `tests/dsl-integration.test.js` | Lines 104, 111: Remove bookmark integration tests |
| `tests/dsl-highlighter.test.js` | Line 31: Remove 'bookmark' from action highlight tests |
| `tests/disabled-rule-test.test.js` | Line 96: Remove bookmark action from test rule |
| `tests/engine-compatibility.test.js` | Line 31: Review chrome.bookmarks mock |

### 4. Test Infrastructure Cleanup

- `lib/test-mode/assertions.js` - Remove bookmark assertions
- `lib/test-mode/test-mode.js` - Remove bookmark cleanup
- `lib/test-mode/test-runner.js` - Remove bookmark test utilities
- `tests/utils/rule-factory.js` - Remove `closeWithBookmark` test rule

## Migration Considerations

### Existing User Rules
Users with existing rules containing `type: 'bookmark'` actions:
- The bookmark action will be silently skipped (unknown action type)
- Other actions in the same rule will still execute
- Users will notice bookmark is gone from the UI when editing rules
- Clean removal preferred over permanent deprecation warnings

### No Data Loss
- Bookmarks already created remain in Chrome
- No user data stored by BookmarkService needs migration
- Feature removal is clean with no orphaned data

## Execution Order (Revised)

### Phase 1 - UI Removal (prevents new usage)
- `dashboard/dashboard.html` - Remove bookmark button
- `dashboard/dashboard.js` - Remove handler
- `dashboard/modules/views/rules.js` - Remove from sample rules and UI options

### Phase 2 - DSL/Highlighter (removes language support)
- `lib/dsl.js` - Remove parsing
- `lib/dsl-highlighter.js` - Remove highlighting

### Phase 3 - Engine Integration (stops execution)
- `lib/engine.v2.services.js` - Remove import and case entirely
- `lib/action-validator.js` - Remove from categories (important: snooze allowsWith)
- `lib/migrate-rules.js` - Remove migration paths

### Phase 4 - Background (removes internal references)
- `background-integrated.js` - Remove case handlers and legacy function

### Phase 5 - Service Deletion
- `services/execution/BookmarkService.js` - Delete
- `tests/BookmarkService.test.js` - Delete

### Phase 6 - Test Cleanup
- Update all affected test files listed above
- Remove bookmark-specific test utilities from test-mode

### Phase 7 - Permission Removal (LAST)
- `manifest.json` - Remove "bookmarks" permission

## Intentionally NOT Removing

These files mention "bookmark" but are unrelated to the bookmark *feature*:

| File | Why Keep |
|------|----------|
| `services/utils/activityFormatter.js` | Cosmetic verb mapping only |
| `services/utils/emoji-suggestions.js` | Emoji suggestion for collection names |
| `lib/conditions-builder.js` | Tab origin filter ("opened from bookmark") - Chrome tab property, not our feature |

## Risk Notes

**High Risk**: `action-validator.js` has `allowsWith: ['bookmark']` for snooze actions. Must verify snooze validation still works after removal.

## Verification

After removal:
- [ ] Extension loads without errors
- [ ] Dashboard bulk actions work (minus bookmark)
- [ ] Rules engine executes other action types
- [ ] Snooze action validation still works
- [ ] DSL parsing works for all remaining actions
- [ ] No console errors related to bookmarks
- [ ] `npm test` passes
- [ ] `npm run test:e2e` passes
- [ ] `grep -r "bookmark" tabmaster-pro/**/*.js` returns only expected matches (tab origin, cosmetic)
