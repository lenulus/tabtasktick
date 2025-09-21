# TabMaster Pro - Product Requirements Document v2.0
## For Claude Code Development Iteration

**Date:** September 2025  
**Version:** 2.0  
**Purpose:** Guide development of UI/UX improvements and feature completion

---

## 1. Executive Summary

### Current State
TabMaster Pro v1.0 has been built with core infrastructure including:
- Chrome Extension Manifest V3 architecture
- Background service worker with rules engine
- Basic popup interface with statistics
- Settings/options page with rule management
- Dashboard page with analytics (partially functional)
- Icon assets and branding

### Critical Gaps Requiring Development
1. **Snooze UI** - No user-friendly way to snooze tabs with custom times
2. **Quick Actions** - Limited one-click actions in popup
3. **Visual Feedback** - No confirmation/undo for destructive actions
4. **Rule Builder** - Complex UI needs simplification
5. **Onboarding** - No first-run experience for new users
6. **Tab Preview** - Can't preview tabs before taking action

---

## 2. User Stories & Requirements

### 🎯 Priority 1: Core UI Actions (MUST HAVE)

#### 2.1 Enhanced Snooze Interface
**User Story:** As a user with 200+ tabs, I want to quickly snooze tabs with intelligent presets so I can declutter without losing important pages.

**Requirements:**
```
- Right-click context menu on any tab with snooze submenu
- Popup interface with one-click snooze options:
  - Smart presets: "Later Today", "Tomorrow Morning", "This Weekend", "Next Week"
  - Custom time picker with calendar widget
  - Bulk snooze: Select multiple tabs and snooze together
- Visual snooze queue in popup showing:
  - Next 5 tabs to wake
  - Time until wake
  - Quick "Wake Now" button
- Keyboard shortcut (Alt+S) should show snooze dialog, not just default time
```

**UI Mockup Structure:**
```
┌─────────────────────────────┐
│ Snooze This Tab            │
├─────────────────────────────┤
│ ⏰ In 2 hours              │
│ 🌅 Tomorrow (9 AM)         │
│ 📅 This Weekend            │
│ 📆 Next Week               │
│ ➕ Custom Time...          │
├─────────────────────────────┤
│ 💤 Snoozed: 12 tabs        │
│ Next: GitHub PR in 2h      │
└─────────────────────────────┘
```

#### 2.2 Quick Action Wheel/Grid
**User Story:** As a power user, I want instant access to common actions without navigating menus.

**Requirements:**
```
- Floating action button in popup that expands to show:
  - Close Duplicates (with count preview)
  - Group by Domain (with preview of groups)
  - Suspend Inactive (with memory saved estimate)
  - Archive Old Tabs (with count)
  - Quick Organize (AI-powered suggestion)
- Each action should show:
  - Icon + Label
  - Preview count/impact
  - Undo option for 5 seconds after action
```

#### 2.3 Tab Selection & Bulk Operations
**User Story:** As a user, I want to select multiple tabs visually and perform bulk operations.

**Requirements:**
```
- Multi-select mode in popup with checkboxes
- Select all/none/invert selection
- Bulk operations toolbar appears when tabs selected:
  - Close Selected
  - Snooze Selected
  - Group Selected
  - Bookmark Selected
  - Move to Window
- Visual feedback: Selected tabs highlight
- Count indicator: "12 tabs selected"
```

---

### 🎯 Priority 2: Visual Enhancements (SHOULD HAVE)

#### 2.4 Tab Preview Cards
**User Story:** As a user, I want to see tab previews before taking action so I don't accidentally close important tabs.

**Requirements:**
```
- Hover over tab in list shows preview card with:
  - Page title (full, not truncated)
  - URL
  - Favicon
  - Screenshot thumbnail (if available)
  - Memory usage
  - Last accessed time
  - Quick actions (close, pin, snooze)
- Smooth animation on hover
- Option to disable previews in settings
```

#### 2.5 Confirmation & Undo System
**User Story:** As a user, I want to undo accidental actions quickly.

**Requirements:**
```
- Toast notifications for all actions with:
  - Action description ("Closed 5 duplicate tabs")
  - Undo button (5-second timeout)
  - Don't show again checkbox
- Confirmation dialog for destructive bulk actions:
  - Actions affecting >10 tabs
  - Closing pinned tabs
  - Deleting groups
- Undo history (last 10 actions) in settings
```

#### 2.6 Live Statistics Dashboard
**User Story:** As a user, I want to see real-time impact of my tab management.

**Requirements:**
```
- Animated counters when values change
- Mini graphs in popup showing:
  - Tab count over time (last 24h)
  - Memory usage trend
  - Top 3 domains
- Color coding:
  - Green: Good (low memory, few tabs)
  - Yellow: Warning (approaching limits)
  - Red: Critical (action needed)
```

---

### 🎯 Priority 3: Advanced Features (NICE TO HAVE)

#### 2.7 Smart Suggestions
**User Story:** As a user, I want AI-powered suggestions for organizing my tabs.

**Requirements:**
```
- "Smart Organize" button analyzes all tabs and suggests:
  - Tabs to close (duplicates, old, broken)
  - Natural groupings (by project, topic)
  - Tabs to snooze (inactive but important)
- Preview mode shows what will happen
- Accept/modify/reject each suggestion
- Learn from user choices over time
```

#### 2.8 Tab Search & Filter
**User Story:** As a user, I want to quickly find specific tabs among hundreds.

**Requirements:**
```
- Search bar in popup with:
  - Instant results as you type
  - Search by title, URL, or content
  - Filter chips (pinned, audible, duplicates)
  - Sort options (recent, memory, domain)
- Results show with actions:
  - Jump to tab
  - Close
  - Snooze
  - Group with similar
```

#### 2.9 Workspace Templates
**User Story:** As a developer, I want to save and restore tab configurations for different projects.

**Requirements:**
```
- Save current tabs as workspace template
- Quick workspace switcher in popup
- Templates include:
  - Tab URLs and positions
  - Group configurations
  - Pinned status
- One-click restore workspace
- Schedule workspace activation (e.g., "Work" at 9 AM)
```

---

## 3. Technical Specifications

### 3.1 Architecture Updates Needed

```javascript
// Current Architecture (v1.0)
- manifest.json (Chrome Extension Manifest V3) ✅
- background.js (Service Worker) ✅
- popup/* (Basic UI) ⚠️ Needs enhancement
- options/* (Settings) ✅ 
- dashboard/* (Analytics) ⚠️ Partially complete

// Required Additions (v2.0)
- popup/
  - components/
    - SnoozeDialog.js
    - TabCard.js
    - QuickActions.js
    - BulkActions.js
  - utils/
    - animations.js
    - notifications.js
- content-scripts/
  - preview-generator.js
  - tab-selector.js
- workers/
  - ai-suggestions.js
  - memory-monitor.js
```

### 3.2 API Integrations

```javascript
// Chrome APIs to utilize
chrome.tabs.*          // Tab management ✅
chrome.tabGroups.*     // Grouping ✅
chrome.contextMenus.*  // Right-click menus ⚠️ Basic
chrome.storage.*       // Data persistence ✅
chrome.alarms.*        // Scheduling ✅
chrome.notifications.* // User feedback ❌ Not implemented
chrome.idle.*          // Detect user activity ❌ Not implemented
chrome.sessions.*      // Recently closed ❌ Not implemented

// New APIs needed
chrome.tabCapture.*    // Screenshot generation
chrome.system.memory.* // Memory monitoring
chrome.browsingData.*  // Clean up old data
```

### 3.3 Data Schema Updates

```javascript
// Enhanced tab metadata
{
  id: string,
  url: string,
  title: string,
  favicon: string,
  groupId: string,
  // New fields needed:
  lastAccessed: timestamp,
  memoryUsage: number,
  screenshot: base64,
  tags: string[],
  workspace: string,
  priority: number,
  autoCloseExempt: boolean
}

// Snooze data structure
{
  id: string,
  tabData: object,
  snoozeUntil: timestamp,
  snoozeType: 'time' | 'event' | 'condition',
  // New fields:
  snoozeReason: string,
  wakeCondition: string,
  recurring: boolean,
  notificationPref: boolean
}

// Workspace template
{
  id: string,
  name: string,
  tabs: object[],
  groups: object[],
  created: timestamp,
  lastUsed: timestamp,
  schedule: object,
  tags: string[]
}
```

### 3.4 UI Component Library

**Use Preact/React for popup interface:**
```javascript
// Lightweight React alternative for extension
- Preact (3KB) for component system
- Tailwind CSS for styling
- Framer Motion for animations
- Chart.js for visualizations

// Component structure
<PopupApp>
  <Header stats={stats} />
  <QuickActions onAction={handleAction} />
  <TabList 
    tabs={filteredTabs}
    onSelect={handleSelect}
    onSnooze={handleSnooze}
  />
  <SnoozeQueue items={snoozed} />
  <NotificationToast />
</PopupApp>
```

---

## 4. UI/UX Design Specifications

### 4.1 Popup Window Redesign

```
Current: 420x600px static window
Target:  420x600px default, expandable to 600x800px

Layout Grid:
┌──────────────────────────────────┐
│ Header (stats bar)          60px │
├──────────────────────────────────┤
│ Search & Filters            50px │
├──────────────────────────────────┤
│ Quick Actions              100px │
├──────────────────────────────────┤
│ Tab List (scrollable)   340-540px│
├──────────────────────────────────┤
│ Footer (settings/help)      50px │
└──────────────────────────────────┘
```

### 4.2 Interaction Patterns

```
Click Actions:
- Single click: Select/deselect tab
- Double click: Jump to tab
- Right click: Context menu
- Long press: Multi-select mode

Drag & Drop:
- Drag tab to reorder
- Drag to group zone to add to group
- Drag to snooze zone to quick snooze

Keyboard Shortcuts:
- / : Focus search
- Ctrl+A: Select all
- Ctrl+D: Close duplicates
- Ctrl+G: Group selected
- Ctrl+Z: Undo last action
- Escape: Clear selection
```

### 4.3 Animation & Feedback

```css
/* Micro-interactions */
- Tab hover: Scale 1.02, shadow
- Button press: Scale 0.98
- Action complete: Checkmark animation
- Delete: Fade out + collapse
- Snooze: Clock animation + fade

/* Loading states */
- Skeleton screens for tab list
- Progress bar for bulk operations
- Spinner for async actions

/* Success/Error states */
- Green flash for success
- Red shake for error
- Yellow pulse for warning
```

---

## 5. Implementation Priorities

### Phase 1: Core UI (Week 1)
```
1. Snooze dialog component
2. Multi-select system
3. Bulk actions toolbar
4. Toast notifications
5. Basic animations
```

### Phase 2: Enhanced UX (Week 2)
```
1. Tab preview cards
2. Search & filter
3. Undo system
4. Context menus
5. Keyboard shortcuts
```

### Phase 3: Advanced Features (Week 3)
```
1. Smart suggestions
2. Workspace templates
3. Memory monitoring
4. Screenshot previews
5. AI organization
```

---

## 6. Success Metrics

### User Efficiency
- **Target**: Reduce time to organize 200 tabs from 30min to 5min
- **Measure**: Time from opening popup to completing organization

### Feature Adoption
- **Target**: 80% of users use snooze feature daily
- **Measure**: Track feature usage in storage.local

### Error Reduction
- **Target**: <1% accidental tab closure
- **Measure**: Track undo action usage

### Performance
- **Target**: All actions complete in <500ms
- **Measure**: Performance.now() for operations

---

## 7. Testing Requirements

### Unit Tests
```javascript
// Test coverage needed
- Snooze time calculations
- Duplicate detection algorithm
- Group creation logic
- Memory calculations
- Search filtering
```

### Integration Tests
```javascript
// User flows to test
- Snooze → Wake cycle
- Select → Bulk action → Undo
- Search → Filter → Action
- Save → Restore workspace
```

### User Testing
```
- 5 users with 100+ tabs
- Task: Organize all tabs in 5 minutes
- Measure: Success rate, time taken, errors
```

---

## 8. Known Issues to Fix

### From v1.0
1. **Icons not loading** ✅ Fixed
2. **Rules not persisting** - Need to verify storage.local
3. **Dashboard charts empty** - Need real data pipeline
4. **Snooze wake unreliable** - Alarm API timing issues
5. **Group colors inconsistent** - Need color management

### New Considerations
1. **Performance with 500+ tabs** - Need pagination/virtualization
2. **Memory leak in popup** - Need cleanup on close
3. **Sync across devices** - Need storage.sync migration
4. **Dark mode support** - Need theme system

---

## 9. Professional Power User Features

### 9.1 Tab Context & Project Management
**User Story:** As a consultant working on multiple client projects, I need to quickly switch between different work contexts without losing my place.

**Requirements:**
```
- Project-based auto-grouping using ML to detect related tabs
- Context switching: Save/restore entire work environments
- Meeting mode: One-click to hide non-work tabs
- Focus mode: Hide all tabs except current task
- Tab annotations: Add notes, TODOs, and highlights to tabs
- Project templates: Pre-defined tab sets for common workflows
```

### 9.2 Advanced Navigation & Command Palette
**User Story:** As a power user, I need keyboard-driven navigation to manage hundreds of tabs efficiently.

**Requirements:**
```
- Command palette (Cmd/Ctrl+K) with fuzzy search
- Tab jump shortcuts (Alt+1-9 for quick access)
- Navigate by typing partial URLs or titles
- Recent tabs panel with visual timeline
- Tab relationship graph visualization
- Quick switch between last 2 tabs (Alt+Tab style)
```

### 9.3 Time Tracking & Analytics
**User Story:** As a freelancer, I need to track time spent on different client projects for accurate billing.

**Requirements:**
```
- Automatic time tracking per domain/tab
- Productivity dashboard with insights
- Weekly/monthly reports exportable to CSV
- Billable vs non-billable time categorization
- Pomodoro timer integration
- Activity heatmaps showing peak productivity times
```

### 9.4 Emergency Recovery & Backup
**User Story:** As someone who has lost work due to crashes, I need robust recovery options.

**Requirements:**
```
- Panic button: Save all tabs and close browser
- Continuous auto-backup (every 5 minutes)
- Version history for tab sessions
- Offline tab caching for critical pages
- Emergency export to multiple formats
- Cloud backup with encryption
```

### 9.5 Smart Automation & AI
**User Story:** As a researcher, I want the extension to learn my patterns and proactively organize tabs.

**Requirements:**
```
- ML-based tab importance scoring
- Predictive tab suggestions based on time/context
- Auto-categorization using NLP on page content
- Smart cleanup suggestions based on usage patterns
- Anomaly detection for unusual tab behavior
- Custom automation workflows (if-this-then-that)
```

### 9.6 Collaboration & Sharing
**User Story:** As a team lead, I need to share curated resources with my team efficiently.

**Requirements:**
```
- Generate shareable links for tab collections
- Team workspaces with permissions
- Real-time collaboration on tab sets
- Comments and discussions on shared tabs
- Integration with Slack/Teams/Discord
- Public/private collection toggles
```

### 9.7 Professional Integrations
**User Story:** As a developer, I need my tabs to integrate with my development workflow.

**Requirements:**
```
- JIRA/GitHub issue linking
- Calendar integration for meeting prep
- IDE integration (open in VS Code)
- CI/CD status monitoring in tabs
- API for third-party integrations
- Webhook support for automation
```

---

## 10. Development Guidelines for Claude Code

### Code Style
```javascript
// Use modern ES6+ features
- Arrow functions for callbacks
- Async/await for promises
- Destructuring for objects
- Template literals for strings

// Component pattern
const Component = ({ prop1, prop2 }) => {
  const [state, setState] = useState(initial);
  
  useEffect(() => {
    // Side effects
  }, [dependencies]);
  
  return (
    <div className="component">
      {/* JSX */}
    </div>
  );
};
```

### File Organization
```
tabmaster-pro/
├── src/
│   ├── background/
│   │   ├── service-worker.js
│   │   ├── rules-engine.js
│   │   └── alarm-manager.js
│   ├── popup/
│   │   ├── App.jsx
│   │   ├── components/
│   │   ├── hooks/
│   │   └── utils/
│   ├── content/
│   │   └── tab-enhancer.js
│   └── shared/
│       ├── constants.js
│       ├── storage.js
│       └── messages.js
├── assets/
│   ├── icons/
│   └── styles/
└── dist/ (built files)
```

---

## 11. Questions for Development

1. **Snooze Behavior**: Should snoozed tabs close immediately or fade out with animation?
2. **Group Limits**: Maximum tabs per group? (Chrome supports unlimited)
3. **Data Retention**: How long to keep closed tab history?
4. **Sync Options**: Use Chrome Sync API or custom solution?
5. **AI Integration**: Use local processing or API for suggestions?
6. **Notification Style**: Chrome native or custom in-popup?
7. **Theme Options**: Just light/dark or custom colors?
8. **Export Format**: JSON, CSV, or both for data export?

---

## Appendix A: Competitive Feature Comparison

| Feature | TabMaster Pro | OneTab | Toby | Workona | The Great Suspender |
|---------|--------------|--------|------|---------|-------------------|
| Auto-close duplicates | ✅ | ❌ | ❌ | ❌ | ❌ |
| Smart snooze | ✅ | ❌ | ❌ | ✅ | ❌ |
| Rules engine | ✅ | ❌ | ❌ | ❌ | ❌ |
| Visual tab preview | 🚧 | ❌ | ✅ | ✅ | ❌ |
| Bulk operations | 🚧 | ✅ | ✅ | ✅ | ❌ |
| Workspaces | 🚧 | ❌ | ✅ | ✅ | ❌ |
| Memory management | ✅ | ✅ | ❌ | ❌ | ✅ |
| Search & filter | 🚧 | ❌ | ✅ | ✅ | ❌ |
| Undo system | 🚧 | ✅ | ❌ | ✅ | ❌ |
| Analytics | ✅ | ❌ | ❌ | ✅ | ❌ |

Legend: ✅ Complete | 🚧 In Development | ❌ Not Available

---

## Appendix B: Sample Code for Claude Code

### Snooze Dialog Component (React/Preact)
```jsx
import { useState, useEffect } from 'preact/hooks';
import { format, addHours, addDays, startOfTomorrow, nextSaturday } from 'date-fns';

const SnoozeDialog = ({ tab, onSnooze, onClose }) => {
  const [selectedTime, setSelectedTime] = useState(null);
  const [customTime, setCustomTime] = useState('');
  
  const presets = [
    { label: 'In 2 hours', value: addHours(new Date(), 2) },
    { label: 'Tomorrow morning', value: addHours(startOfTomorrow(), 9) },
    { label: 'This weekend', value: nextSaturday(new Date()) },
    { label: 'Next week', value: addDays(new Date(), 7) },
  ];
  
  const handleSnooze = () => {
    const time = customTime || selectedTime;
    chrome.runtime.sendMessage({
      action: 'snoozeTab',
      tabId: tab.id,
      until: time.getTime()
    });
    onSnooze(tab, time);
    onClose();
  };
  
  return (
    <div className="snooze-dialog">
      <h3>Snooze "{tab.title}"</h3>
      
      <div className="preset-options">
        {presets.map(preset => (
          <button
            key={preset.label}
            className={`preset ${selectedTime === preset.value ? 'selected' : ''}`}
            onClick={() => setSelectedTime(preset.value)}
          >
            <span className="label">{preset.label}</span>
            <span className="time">{format(preset.value, 'MMM d, h:mm a')}</span>
          </button>
        ))}
      </div>
      
      <div className="custom-time">
        <input
          type="datetime-local"
          value={customTime}
          onChange={(e) => setCustomTime(e.target.value)}
          min={new Date().toISOString().slice(0, 16)}
        />
      </div>
      
      <div className="dialog-actions">
        <button onClick={onClose}>Cancel</button>
        <button onClick={handleSnooze} disabled={!selectedTime && !customTime}>
          Snooze Tab
        </button>
      </div>
    </div>
  );
};
```

### Bulk Selection Hook
```javascript
import { useState, useCallback } from 'preact/hooks';

const useTabSelection = (tabs) => {
  const [selectedIds, setSelectedIds] = useState(new Set());
  
  const toggleSelection = useCallback((tabId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(tabId)) {
        next.delete(tabId);
      } else {
        next.add(tabId);
      }
      return next;
    });
  }, []);
  
  const selectAll = useCallback(() => {
    setSelectedIds(new Set(tabs.map(t => t.id)));
  }, [tabs]);
  
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);
  
  const getSelectedTabs = useCallback(() => {
    return tabs.filter(t => selectedIds.has(t.id));
  }, [tabs, selectedIds]);
  
  return {
    selectedIds,
    selectedCount: selectedIds.size,
    toggleSelection,
    selectAll,
    clearSelection,
    getSelectedTabs
  };
};
```

---

## Next Steps for Claude Code Session

1. **Review this PRD** and identify which features to implement first
2. **Set up development environment** with build tools (Webpack/Vite)
3. **Implement Phase 1** core UI components
4. **Test with real tab data** (200+ tabs scenario)
5. **Iterate based on testing** feedback
6. **Deploy and monitor** performance metrics

---

*This PRD is a living document. Update it as features are completed and new requirements emerge.*
