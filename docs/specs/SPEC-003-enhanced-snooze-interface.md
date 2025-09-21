# SPEC-003: Enhanced Snooze Interface

## Overview

This specification outlines the implementation of an enhanced snooze interface for TabMaster Pro, replacing the basic dropdown with a full-featured modal dialog that provides smart presets, custom scheduling, bulk operations, and visual feedback.

## User Stories

1. **As a user**, I want to snooze tabs with natural language presets like "After lunch" or "End of day" so I can quickly defer tabs to meaningful times.

2. **As a power user**, I want to set custom snooze times with a date/time picker so I have precise control over when tabs reopen.

3. **As a user managing many tabs**, I want to bulk snooze multiple selected tabs so I can efficiently defer groups of related content.

4. **As a user**, I want to see my snoozed tabs in a visual queue so I know what's coming up and can manage my schedule.

5. **As a user**, I want to wake tabs early or reschedule them so I have flexibility when plans change.

## Technical Design

### Components

1. **Snooze Modal Dialog** (`/tabmaster-pro/components/snooze-modal.js`)
   - Modal overlay with backdrop
   - Smart preset buttons
   - Custom date/time picker
   - Bulk snooze indicator
   - Cancel/Confirm buttons

2. **Smart Presets Engine** (in `background.js`)
   - Calculate context-aware times
   - Business hours detection
   - Weekend handling
   - Timezone awareness

3. **Visual Snooze Queue** (`/tabmaster-pro/popup/popup.js` enhancement)
   - Timeline view of upcoming tabs
   - Grouped by time period
   - Quick actions per item

### Data Structures

```javascript
// Enhanced snoozed tab structure
{
  id: 'snoozed_<timestamp>_<tabId>',
  url: string,
  title: string,
  favicon: string,
  snoozeUntil: timestamp,
  snoozeReason: string,  // NEW: "lunch", "tomorrow", "custom", etc.
  originalTabId: number,
  groupId: string,      // NEW: for bulk snoozed tabs
  createdAt: timestamp, // NEW: when it was snoozed
}

// Smart preset structure
{
  id: string,
  label: string,        // "After lunch"
  getTime: function,    // Returns calculated timestamp
  icon: string,         // Icon identifier
  category: string,     // "time", "activity", "custom"
}
```

### UI/UX Mockup

```
┌─────────────────────────────────────────────┐
│  Snooze Tabs                            [X] │
├─────────────────────────────────────────────┤
│                                             │
│  Quick Presets:                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │   🌅    │ │   🍽️    │ │   🌙    │   │
│  │ Tomorrow │ │  After   │ │ End of   │   │
│  │  9 AM    │ │  Lunch   │ │   Day    │   │
│  └──────────┘ └──────────┘ └──────────┘   │
│                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │   📅    │ │   ⏰    │ │   🔄    │   │
│  │  Next    │ │ In 1 Hour│ │ Monday   │   │
│  │  Week    │ │          │ │  9 AM    │   │
│  └──────────┘ └──────────┘ └──────────┘   │
│                                             │
│  Custom Time:                               │
│  ┌─────────────────┐ ┌─────────────────┐   │
│  │ Date: ▼        │ │ Time: ▼        │   │
│  └─────────────────┘ └─────────────────┘   │
│                                             │
│  💡 Snoozing 3 selected tabs               │
│                                             │
│  [Cancel]                    [Snooze Tabs]  │
└─────────────────────────────────────────────┘

Visual Queue (in popup):
┌─────────────────────────────────────────────┐
│ 📅 Snoozed Tabs (5)                    [-] │
├─────────────────────────────────────────────┤
│ In 2 hours (2)                              │
│ ├─ 🌐 Project Documentation      [Wake][X]  │
│ └─ 📧 Email Draft                [Wake][X]  │
│                                             │
│ Tomorrow 9 AM (1)                           │
│ └─ 📊 Analytics Dashboard        [Wake][X]  │
│                                             │
│ Next Week (2)                               │
│ ├─ 📖 Long Article to Read      [Wake][X]  │
│ └─ 🎥 Tutorial Video            [Wake][X]  │
└─────────────────────────────────────────────┘
```

### Implementation Steps

1. **Create Modal Infrastructure**
   - Build reusable modal component
   - Add backdrop with click-to-close
   - Implement smooth animations
   - Handle keyboard events (Esc to close)

2. **Smart Presets Implementation**
   - Define preset configurations
   - Implement time calculation logic
   - Handle edge cases (weekends, holidays)
   - Add locale-aware formatting

3. **Custom Date/Time Picker**
   - Use native HTML5 inputs
   - Add validation
   - Show preview of selected time
   - Handle timezone considerations

4. **Bulk Snooze Integration**
   - Detect selected tabs from bulk selection
   - Show count in modal
   - Group snoozed tabs by operation
   - Maintain group association

5. **Enhanced Snooze Queue**
   - Group by time periods
   - Add wake/reschedule actions
   - Implement smooth transitions
   - Add empty state

6. **Background Service Updates**
   - Enhance alarm management
   - Add reschedule functionality
   - Implement wake early feature
   - Update statistics tracking

### Chrome APIs Usage

```javascript
// Storage for enhanced snoozed tabs
chrome.storage.local.set({ 
  snoozedTabs: enhancedSnoozedTabs,
  snoozeGroups: groupMetadata 
});

// Alarms for wake times
chrome.alarms.create(`snooze_${tabId}`, { when: snoozeUntil });

// Notifications for wake events
chrome.notifications.create({
  type: 'basic',
  title: 'Tab Waking Up',
  message: `"${tab.title}" is ready`,
  buttons: [
    { title: 'Open Now' },
    { title: 'Snooze Again' }
  ]
});

// Context menus for quick snooze
chrome.contextMenus.create({
  id: 'quick_snooze_presets',
  title: 'Snooze with Presets...',
  contexts: ['page']
});
```

### Performance Considerations

1. **Large Snooze Queues**
   - Paginate visual queue after 20 items
   - Use virtual scrolling for 100+ items
   - Lazy load favicons

2. **Bulk Operations**
   - Batch storage updates
   - Stagger tab closures to avoid UI freeze
   - Show progress for >50 tabs

3. **Memory Management**
   - Clean up old snoozed tab data
   - Compress stored tab metadata
   - Limit favicon storage

### Accessibility

1. **Keyboard Navigation**
   - Tab through all controls
   - Enter to select preset
   - Esc to cancel
   - Arrow keys in date/time picker

2. **Screen Reader Support**
   - ARIA labels for all buttons
   - Role="dialog" for modal
   - Announce snooze confirmations
   - Describedby for bulk count

3. **Visual Indicators**
   - High contrast mode support
   - Focus outlines
   - Hover states
   - Loading indicators

### Error Handling

1. **Storage Errors**
   - Fallback to session storage
   - Show user-friendly error
   - Retry mechanism
   - Preserve tab state

2. **Invalid Times**
   - Prevent past time selection
   - Validate custom inputs
   - Show inline errors
   - Suggest alternatives

3. **Bulk Operation Failures**
   - Track failed tabs
   - Show partial success
   - Offer retry
   - Log errors for debugging

### Test Scenarios

1. **Preset Selection**
   - Verify all presets calculate correctly
   - Test weekend edge cases
   - Check timezone changes
   - Validate business hours

2. **Custom Time**
   - Set time in past (should fail)
   - Set time years in future
   - Test invalid date formats
   - Verify timezone handling

3. **Bulk Snooze**
   - Snooze 1, 10, 100 tabs
   - Mix of tab types
   - Include pinned tabs
   - Test with existing snoozed tabs

4. **Wake/Reschedule**
   - Wake single tab
   - Wake grouped tabs
   - Reschedule to earlier
   - Reschedule to later

5. **Performance**
   - 200+ snoozed tabs
   - Rapid snooze/wake cycles
   - Memory usage monitoring
   - UI responsiveness

### Success Metrics

1. **Usage Metrics**
   - % of snoozes using smart presets vs custom
   - Average number of tabs snoozed per operation
   - Wake early vs natural wake ratio
   - Reschedule frequency

2. **Performance Metrics**
   - Modal open time < 100ms
   - Bulk snooze time < 2s for 100 tabs
   - Memory overhead < 1MB per 100 snoozed tabs
   - Zero UI freezes

3. **User Satisfaction**
   - Snooze abandonment rate < 5%
   - Feature usage growth week-over-week
   - Error rate < 0.1%
   - Support ticket reduction

### Future Enhancements

1. **Recurring Snooze**
   - Daily/weekly patterns
   - Workday only options
   - Custom recurrence rules

2. **Smart Suggestions**
   - ML-based time predictions
   - Usage pattern learning
   - Context-aware presets

3. **Integration Features**
   - Calendar integration
   - Reminder sync
   - Cross-device snooze

4. **Advanced Options**
   - Snooze with conditions
   - Auto-snooze rules
   - Batch wake scheduling