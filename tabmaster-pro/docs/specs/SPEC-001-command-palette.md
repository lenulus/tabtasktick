# SPEC-001: Command Palette Feature

## Overview
The Command Palette provides a quick, keyboard-driven interface for accessing TabMaster Pro's functionality and searching through tabs. It appears as a modal overlay triggered by Ctrl/Cmd+Shift+P.

## User Stories

1. **As a power user with 200+ tabs**, I want to quickly search and jump to any tab by typing part of its title or URL, so I can navigate efficiently without using the mouse.

2. **As a keyboard-focused user**, I want to execute any TabMaster Pro command without leaving my keyboard, so I can maintain my workflow.

3. **As a user**, I want to see recently used commands at the top, so I can quickly repeat common actions.

## Technical Design

### Data Structures

```javascript
// Command structure
{
  id: string,              // Unique command identifier
  name: string,            // Display name
  description: string,     // Help text
  category: string,        // 'action' | 'navigation' | 'tab'
  shortcut: string,        // Keyboard shortcut if available
  action: function,        // Function to execute
  icon: string,           // Icon class or emoji
  keywords: string[]      // Additional search terms
}

// Search result structure  
{
  type: 'command' | 'tab',
  item: object,           // Command or tab object
  score: number,          // Fuzzy match score
  highlights: number[][]  // Character ranges to highlight
}
```

### UI Layout

```
┌─────────────────────────────────────────────┐
│ 🔍 [Search commands and tabs...]         ✕ │
├─────────────────────────────────────────────┤
│ Recently Used                               │
│ ├─ 📋 Close Duplicate Tabs (3)       Ctrl+D │
│ └─ 📁 Group by Domain               Ctrl+G │
│                                             │
│ Commands                                    │
│ ├─ 💤 Snooze Current Tab            Ctrl+S │
│ ├─ 🗂️  Group All by Domain          Ctrl+G │
│ ├─ 📋 Close Duplicates              Ctrl+D │
│ └─ 🔄 Suspend Inactive Tabs                │
│                                             │
│ Tabs (showing 3 of 247)                    │
│ ├─ 📄 GitHub - Pull Request #123           │
│ ├─ 📄 Stack Overflow - How to...           │
│ └─ 📄 YouTube - Tutorial Video             │
└─────────────────────────────────────────────┘
```

### Algorithms

#### Fuzzy Search Algorithm
```javascript
// Simple fuzzy search scoring
function fuzzyScore(query, target) {
  query = query.toLowerCase();
  target = target.toLowerCase();
  
  let score = 0;
  let lastIndex = -1;
  
  for (let char of query) {
    const index = target.indexOf(char, lastIndex + 1);
    if (index === -1) return 0;
    
    // Bonus for consecutive matches
    if (index === lastIndex + 1) score += 2;
    // Bonus for start of word
    if (index === 0 || target[index - 1] === ' ') score += 3;
    
    score += 1;
    lastIndex = index;
  }
  
  // Penalty for length difference
  score -= Math.abs(query.length - target.length) * 0.1;
  
  return score;
}
```

### Chrome APIs Used
- `chrome.tabs.query()` - Get all tabs for searching
- `chrome.tabs.update()` - Switch to selected tab
- `chrome.windows.create()` - Create command palette window
- `chrome.runtime.getURL()` - Get extension URLs
- `chrome.storage.local` - Store recent commands

### Keyboard Navigation
- **↑/↓** - Navigate through results
- **Enter** - Execute selected command/switch to tab
- **Ctrl/Cmd+[1-9]** - Quick select result by number
- **Escape** - Close palette
- **Tab** - Switch between command/tab sections
- **Ctrl/Cmd+K** - Clear search

## Implementation Details

### Available Commands

1. **Tab Management**
   - Close Current Tab
   - Close Duplicate Tabs (show count)
   - Close All in Window
   - Close Tabs to the Right
   - Pin/Unpin Current Tab

2. **Grouping**
   - Group by Domain
   - Group Selected Tabs
   - Ungroup All
   - Collapse All Groups
   - Expand All Groups

3. **Snoozing**
   - Snooze Current Tab
   - Snooze Selected Tabs
   - View Snoozed Tabs
   - Wake All Snoozed

4. **Organization**  
   - Sort Tabs by Title
   - Sort Tabs by Domain
   - Sort Tabs by Last Access
   - Move All to New Window
   - Bookmark All Tabs

5. **Quick Actions**
   - Suspend Inactive Tabs
   - Export Session
   - Open Dashboard
   - Open Settings
   - Search Bookmarks

### Performance Considerations

1. **Virtual Scrolling**: Only render visible items when showing 200+ results
2. **Debounced Search**: 150ms debounce on keystrokes
3. **Result Limiting**: Show max 50 results (configurable)
4. **Caching**: Cache tab data, update on tab events
5. **Web Worker**: Run fuzzy search in worker for 200+ tabs

### Error Handling

1. **No Results**: Show helpful message with suggestions
2. **Command Fails**: Show toast notification with error
3. **Tab Not Found**: Remove from results, refresh cache
4. **Permissions**: Check before executing commands

## UI/UX Specifications

### Visual Design
- Semi-transparent dark overlay (rgba(0,0,0,0.8))
- Centered modal, max-width: 600px, max-height: 80vh
- Rounded corners (8px), subtle shadow
- Smooth fade-in animation (200ms)
- Result hover state with background highlight

### Colors & Typography
- Background: #1e1e1e (dark mode), #ffffff (light mode)
- Text: #e0e0e0 (dark), #333333 (light)
- Accent: #4a9eff (selection/highlights)
- Font: System font stack, 14px base size
- Monospace for shortcuts

### Responsive Behavior
- Minimum width: 400px
- Maximum width: 600px
- Height adjusts to content (max 80vh)
- Mobile: Full screen with larger touch targets

## Test Scenarios

### Functional Tests
1. **Open/Close**
   - Ctrl/Cmd+Shift+P opens palette
   - Escape closes palette
   - Click outside closes palette

2. **Search**
   - Empty query shows all commands + recent tabs
   - Query "git" matches GitHub tabs and git-related commands
   - Special characters handled gracefully

3. **Navigation**
   - Arrow keys move selection
   - Enter executes selected item
   - Tab key sections work correctly

4. **Commands**
   - Each command executes correctly
   - Counts shown are accurate
   - Shortcuts work from palette

### Performance Tests
1. Load with 10 tabs: < 50ms
2. Load with 200 tabs: < 200ms  
3. Search response: < 50ms
4. Smooth scrolling at 60fps

### Edge Cases
1. No tabs open (show commands only)
2. 500+ tabs (test performance)
3. Very long tab titles (truncate properly)
4. Duplicate tab titles (show URL to differentiate)
5. Special characters in search
6. Rapid open/close cycles

## Accessibility

1. **ARIA Labels**: Proper roles and labels
2. **Screen Reader**: Announce results count
3. **Keyboard Only**: Full functionality without mouse
4. **High Contrast**: Respect system preferences
5. **Focus Management**: Trap focus in modal

## Future Enhancements

1. **Custom Commands**: Let users create command shortcuts
2. **Command Aliases**: Multiple triggers for same command  
3. **Smart Suggestions**: ML-based command recommendations
4. **Command History**: Show full history, not just recent
5. **Batch Operations**: Select multiple tabs in palette
6. **Advanced Filters**: Filter by date, domain, state