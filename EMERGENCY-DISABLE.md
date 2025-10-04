# EMERGENCY DISABLE - Chrome Crash Prevention

## What Was Disabled

Chrome was crashing immediately after loading the extension due to issues with the new architecture changes. The following have been temporarily disabled:

### In `background-integrated.js`:

1. **Line 4-7**: Disabled imports from engine.js and predicate.js
   - Replaced with stub functions that return safe defaults
   - This prevents loading the problematic new code

2. **Line 349-368**: Disabled `executeRule()` function
   - Returns early with "Rules temporarily disabled" message
   - Prevents any rule execution

3. **Line 636-647**: Disabled `executeAllRules()` function
   - Returns early with "Rules temporarily disabled" message
   - Prevents bulk rule execution

4. **Line 743-771**: Disabled `checkImmediateTriggers()` function
   - Returns early to prevent immediate rule triggers
   - Stops automatic rule execution on tab events

## Root Cause (FIXED)

The cause was dynamic imports added to `/services/selection/selectTabs.js` at line 415-417:

```javascript
const [{ compile, checkIsDupe }, { transformConditions }] = await Promise.all([
  import('../../lib/predicate.js'),
  import('../../lib/condition-transformer.js')
]);
```

These dynamic imports in a Chrome extension service worker context were causing the crash.

**STATUS: FIXED** - Removed dynamic imports and simplified the function to use basic matching instead.

## How to Re-enable

1. First, fix the root cause by removing dynamic imports from selectTabs.js
2. Then uncomment the disabled sections in background-integrated.js:
   - Restore imports at lines 4-7
   - Remove the early returns in executeRule, executeAllRules, and checkImmediateTriggers
   - Delete the stub functions at lines 9-13

## Alternative Solution

Instead of dynamic imports, use static imports at the top of the files that need them, or avoid using the new architecture in the background service worker until properly tested.

## Testing

Before re-enabling:
1. Test the extension with Developer Mode
2. Check chrome://extensions for errors
3. Monitor the console for crash reports
4. Test with a minimal rule set first