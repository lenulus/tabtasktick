# SPEC-005: Tab Preview Cards

## Overview

Implement hover-based tab preview cards that display rich information about tabs without needing to switch to them. This feature enhances tab management efficiency by providing quick visual context for tabs in both the popup and dashboard views.

## User Stories

1. As a user with 200+ tabs, I want to see tab previews on hover so I can quickly identify tabs without switching to them
2. As a power user, I want to see tab metadata (memory, last accessed) to make informed decisions about tab management
3. As a performance-conscious user, I want previews to load lazily and not impact browser performance
4. As a privacy-aware user, I want the option to disable screenshot thumbnails

## Technical Design

### Data Structures

```javascript
// Preview card state
const previewState = {
  activePreview: null,      // Currently showing preview
  hoverTimer: null,         // Delay timer for hover
  cachedScreenshots: new Map(), // tabId => {screenshot, timestamp}
  settings: {
    enabled: true,
    showScreenshots: true,
    hoverDelay: 300,       // ms
    screenshotCacheTime: 300000, // 5 minutes
  }
};

// Tab preview data structure
const tabPreviewData = {
  id: 123,
  title: "Full page title that might be very long",
  url: "https://example.com/very/long/path/to/page",
  favicon: "data:image/png;base64,...",
  screenshot: null, // Base64 or null
  memory: 45.2,    // MB
  lastAccessed: 1234567890, // timestamp
  isPinned: false,
  isAudible: false,
  groupId: null
};
```

### Component Architecture

```javascript
// TabPreviewCard class
class TabPreviewCard {
  constructor(container) {
    this.container = container;
    this.element = null;
    this.currentTabId = null;
    this.screenshotLoader = null;
  }
  
  show(tab, anchorElement) {
    // Create/update preview card
    // Position near anchor element
    // Load screenshot if enabled
  }
  
  hide() {
    // Hide preview with animation
    // Cancel pending screenshot loads
  }
  
  updatePosition(anchorElement) {
    // Reposition card to stay visible
  }
}
```

### Chrome API Usage

1. **Tab Information**: `chrome.tabs.get(tabId)` - Get full tab details
2. **Screenshots**: `chrome.tabs.captureVisibleTab()` - Capture tab screenshot (requires activeTab permission)
3. **Memory Usage**: `chrome.processes.getProcessInfo()` - Get memory data (if available)
4. **Storage**: `chrome.storage.local` - Store preview settings

### UI/UX Design

```
┌─────────────────────────────────────┐
│ ▸ Preview Card                      │
├─────────────────────────────────────┤
│ ┌───────────────────────────────┐   │
│ │                               │   │
│ │    Screenshot Thumbnail       │   │
│ │    (16:9 aspect, 240x135)    │   │
│ │                               │   │
│ └───────────────────────────────┘   │
│                                     │
│ 🌐 Example Domain - Full Page Ti... │
│ https://example.com/very/long/pa... │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 💾 45.2 MB  |  ⏱ 5 mins ago    │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [📌 Pin] [🔕 Snooze] [❌ Close]     │
└─────────────────────────────────────┘
```

### Implementation Details

1. **Hover Detection**:
   - Use mouseenter/mouseleave events
   - 300ms delay before showing preview
   - Cancel on quick hover (prevents flashing)

2. **Screenshot Loading**:
   - Check cache first (5 minute TTL)
   - Show skeleton loader while loading
   - Fall back to placeholder if capture fails
   - Only capture visible tabs (performance)

3. **Positioning Logic**:
   - Calculate optimal position (avoid viewport edges)
   - Prefer showing below/right of cursor
   - Flip to above/left if needed
   - Keep preview fully visible

4. **Performance Optimizations**:
   - Lazy load screenshots
   - Limit concurrent screenshot captures to 1
   - Use DocumentFragment for DOM updates
   - Cache DOM references
   - Throttle position updates

5. **Memory Management**:
   - Clear old screenshot cache entries
   - Limit cache to 50 screenshots
   - Use WeakMap for tab references
   - Clean up on tab close

### CSS Styling

```css
/* Preview card styles */
.tab-preview-card {
  --preview-width: 320px;
  --preview-padding: 12px;
  --preview-radius: 8px;
  --preview-shadow: 0 4px 24px rgba(0,0,0,0.15);
  
  position: fixed;
  width: var(--preview-width);
  padding: var(--preview-padding);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--preview-radius);
  box-shadow: var(--preview-shadow);
  z-index: 9999;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 200ms, transform 200ms;
  pointer-events: none;
}

.tab-preview-card.visible {
  opacity: 1;
  transform: translateY(0);
}

/* Screenshot thumbnail */
.preview-screenshot {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: 4px;
  background: var(--bg-secondary);
}

/* Skeleton loader */
.preview-screenshot.loading {
  background: linear-gradient(
    90deg,
    var(--bg-secondary) 25%,
    var(--bg-tertiary) 50%,
    var(--bg-secondary) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
}
```

## Test Scenarios

1. **Basic Functionality**:
   - Hover over tab → Preview appears after 300ms
   - Move away → Preview disappears immediately
   - Quick hover → No preview shown

2. **Screenshot Loading**:
   - Active tab → Screenshot loads successfully
   - Background tab → Placeholder shown
   - Tab closed during load → No errors

3. **Performance with 200+ Tabs**:
   - Hover multiple tabs rapidly → No lag
   - Screenshot cache works → No duplicate captures
   - Memory usage stays under 50MB

4. **Edge Cases**:
   - Preview at viewport edge → Repositions correctly
   - Very long titles/URLs → Truncate elegantly
   - No favicon → Show default icon
   - Tab closed while preview open → Hide gracefully

5. **Settings**:
   - Disable previews → No hover events registered
   - Disable screenshots → Show metadata only
   - Custom hover delay → Respected

## Integration Points

1. **Popup Tab List** (`popup.js`):
   - Add to snoozed tabs list
   - Add to command palette results
   - Consider space constraints

2. **Dashboard Tab Grid** (`dashboard.js`):
   - Add to tab cards in grid view
   - More space available for larger previews

3. **Settings** (`settings.js`):
   - Add preview settings section
   - Screenshot toggle
   - Hover delay slider

4. **Background Script** (`background.js`):
   - Handle screenshot capture
   - Manage cache cleanup

## Privacy & Security

1. **Screenshot Permissions**:
   - Only capture when user hovers
   - Don't capture incognito tabs
   - Respect user settings

2. **Data Storage**:
   - Screenshots in memory only (not persisted)
   - Clear cache on browser close
   - No external transmission

## Accessibility

1. **Keyboard Support**:
   - Show preview on focus (tab key)
   - Dismiss with Escape key
   - Navigate actions with arrow keys

2. **Screen Readers**:
   - Announce preview content
   - Describe screenshot if present
   - Read full title/URL

## Future Enhancements

1. **Rich Previews**:
   - Show tab groups
   - Display tab relationships
   - Include tab history

2. **Advanced Actions**:
   - Drag from preview to reorder
   - Multi-select from preview
   - Context menu integration

3. **Smart Loading**:
   - Predictive pre-loading
   - Progressive image loading
   - WebP format for smaller size

## Success Metrics

1. **Performance**:
   - Preview appears < 50ms after delay
   - Screenshot loads < 200ms
   - No impact on scroll performance

2. **Usage**:
   - 80% of users use preview feature
   - <5% disable screenshots
   - Positive feedback on efficiency

3. **Quality**:
   - Zero crashes from preview code
   - <1% screenshot capture failures
   - Smooth animations on all devices