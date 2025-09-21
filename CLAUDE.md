# TabMaster Pro - Implementation Guide for Claude

## Project Overview

TabMaster Pro is a Chrome extension for advanced tab management, built with vanilla JavaScript (no frameworks). The extension helps users manage 200+ tabs efficiently with features like snoozing, grouping, bulk operations, and analytics.

**PRD Location**: `/plans/tabmaster-pro-prd-v2.md` - Contains full product requirements and specifications
**TODO Location**: `/TODO.md` - Contains implementation status and remaining tasks with completion markers

## Tech Stack & Constraints

- **Frontend**: Vanilla JavaScript, HTML5, CSS3 (no frameworks)
- **Styling**: Modern CSS with Grid, Flexbox, Custom Properties
- **APIs**: Chrome Extensions Manifest V3 APIs
- **Build**: No build tools needed, direct file loading
- **Storage**: chrome.storage.local for persistence
- **Charts**: Chart.js (via CDN) for analytics

## Key Architecture Decisions

1. **No Framework**: Keep it simple with vanilla JS for performance with 200+ tabs
2. **Modular Design**: Separate concerns into popup.js, background.js, content.js, dashboard.js
3. **Event-Driven**: Use Chrome events and custom events for communication
4. **Efficient DOM**: Use DocumentFragment for bulk updates, virtual scrolling for large lists
5. **Progressive Enhancement**: Core features work without optional dependencies

## Current State (as of last update)

- ✅ Core extension structure (manifest, popup, dashboard)
- ✅ Basic tab management (list, close, snooze)
- ✅ Tab grouping functionality
- ✅ Export functionality (JSON format)
- ✅ Dashboard with charts (Chart.js integration fixed)
- ✅ Real memory monitoring
- ✅ Quick Actions (Close Duplicates, Group by Domain, Snooze Current, Suspend Inactive)
- ⏳ Import functionality (partial)
- ⏳ Snooze UI (basic implementation, needs enhancement)
- ❌ Command Palette
- ❌ Enhanced Quick Actions (preview counts, undo, floating action button)
- ❌ Bulk Operations

## Implementation Instructions

### Working with this Project

1. **Always check TODO.md first** - This is the single source of truth for what needs to be implemented
   - Look for status markers: ✅ Complete | ⚠️ Partial | ❌ Not Started
   - Update TODO.md as you complete tasks
   - Add [x] checkmarks as you complete individual items

2. **Follow the implementation order in TODO.md**
   - Priority 1: Core UI Actions
   - Priority 2: Visual Enhancements  
   - Priority 3: Advanced Features
   - And so on...

3. **Before starting any feature**:
   - Check if it already exists (marked with ⚠️ or ✅)
   - Read the "Current Status" notes
   - Don't recreate existing functionality

4. **Update documentation as you work**:
   - Mark completed items in TODO.md
   - Update this file if architecture changes
   - Document any new patterns or decisions

## Code Patterns & Best Practices

### DOM Manipulation Pattern
```javascript
// Efficient bulk updates
const fragment = document.createDocumentFragment();
items.forEach(item => {
  const element = createItemElement(item);
  fragment.appendChild(element);
});
container.appendChild(fragment);
```

### Chrome API Pattern
```javascript
// Always check permissions and handle errors
try {
  const tabs = await chrome.tabs.query({});
  // Process tabs
} catch (error) {
  console.error('Tab query failed:', error);
  showUserError('Unable to access tabs');
}
```

### Event Delegation Pattern
```javascript
// For dynamic content
container.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]');
  if (action) {
    handleAction(action.dataset.action, action.dataset.id);
  }
});
```

### Storage Pattern
```javascript
// Consistent storage access
async function saveSettings(settings) {
  try {
    await chrome.storage.local.set({ settings });
    return true;
  } catch (error) {
    console.error('Storage error:', error);
    return false;
  }
}
```

## Testing Commands

```bash
# Lint JavaScript
npm run lint

# Run tests (when implemented)
npm test

# Load extension in Chrome
# 1. Open chrome://extensions/
# 2. Enable Developer mode
# 3. Click "Load unpacked"
# 4. Select tabmaster-pro directory
```

## Common Issues & Solutions

1. **Chart.js Not Loading**
   - Check CDN availability
   - Ensure Chart is defined before use
   - Initialize charts after DOM ready

2. **Memory Leaks with 200+ Tabs**
   - Use virtual scrolling
   - Clean up event listeners
   - Paginate large datasets

3. **Chrome API Permissions**
   - Check manifest.json permissions
   - Handle permission requests gracefully
   - Provide fallbacks

## Development Workflow

1. Make changes to relevant files
2. Reload extension in Chrome (Ctrl+R on extensions page)
3. Test in both popup and dashboard
4. Check console for errors
5. Test with large tab counts (200+)
6. Commit after each major feature

## Next Steps

See TODO.md for the prioritized list of features to implement. Start with Priority 1 items marked with ❌ or ⚠️.

## Important Notes

- Always test with 200+ tabs to ensure performance
- Keep accessibility in mind (keyboard navigation, ARIA)
- Follow existing code style (2-space indent, semicolons)
- Document complex logic with comments
- Update this file as implementation progresses

## File Structure

```
tabmaster-pro/
├── manifest.json         # Extension configuration
├── popup.html/js/css    # Main popup interface
├── dashboard/           # Full dashboard
├── background.js        # Service worker
├── content.js          # Content script
├── lib/                # Shared libraries
│   ├── snooze.js      # Snooze functionality
│   ├── export.js      # Export features
│   ├── import.js      # Import features (WIP)
│   └── groups.js      # Group management
└── icons/              # Extension icons
```

## Performance Targets

- Popup load: < 100ms
- Tab list render: < 200ms for 200 tabs
- Search response: < 50ms
- Memory usage: < 50MB for 500 tabs
- Dashboard load: < 500ms

Remember: Keep it simple, performant, and user-focused!