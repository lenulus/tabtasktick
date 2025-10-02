# SPEC-002: Unified Time-Based Triggers and Criteria

## Overview
Implement a consistent time-based trigger system that works across all rule conditions, providing both time criteria (age, inactivity) and periodic execution.

## Current Issues
1. Inconsistent time criteria across conditions
2. No actual time tracking implementation
3. No periodic rule execution
4. Time options hardcoded into specific condition types

## Proposed Solution

### 1. Separate Time Criteria from Condition Types

Instead of embedding time criteria into specific conditions, make them optional modifiers:

```javascript
{
  conditions: {
    type: 'category',
    categories: ['social'],
    // Time criteria as optional modifiers
    timeCriteria: {
      inactive: 60,      // minutes since last active
      age: 180,          // minutes since tab opened
      notAccessed: 120   // minutes since last accessed (requires tracking)
    }
  },
  // Optional trigger schedule
  trigger: {
    type: 'periodic',    // 'event' (default) or 'periodic'
    interval: 15         // check every 15 minutes
  }
}
```

### 2. Time Tracking Implementation

Track tab timestamps in background.js:

```javascript
const tabTimeData = new Map(); // tabId -> timestamps

// Track when tabs are created
chrome.tabs.onCreated.addListener((tab) => {
  tabTimeData.set(tab.id, {
    created: Date.now(),
    lastActive: Date.now(),
    lastAccessed: Date.now()
  });
});

// Track when tabs become active
chrome.tabs.onActivated.addListener(({tabId}) => {
  const data = tabTimeData.get(tabId);
  if (data) {
    data.lastActive = Date.now();
    data.lastAccessed = Date.now();
  }
});

// Track when tabs are updated (navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    const data = tabTimeData.get(tabId);
    if (data) {
      data.lastAccessed = Date.now();
    }
  }
});
```

### 3. Unified Condition Checking

Modify condition checking to support time criteria:

```javascript
async function checkCondition(tab, condition, allTabs) {
  // First check the base condition
  let matches = false;
  
  switch (condition.type) {
    case 'duplicate':
      matches = isDuplicateTab(tab, allTabs);
      break;
    case 'category':
      matches = await isCategoryMatch(tab, condition);
      break;
    // ... other conditions
  }
  
  // Then apply time criteria if specified
  if (matches && condition.timeCriteria) {
    matches = checkTimeCriteria(tab, condition.timeCriteria);
  }
  
  return matches;
}

function checkTimeCriteria(tab, criteria) {
  const tabTime = tabTimeData.get(tab.id);
  if (!tabTime) return false;
  
  const now = Date.now();
  
  if (criteria.inactive !== undefined) {
    const inactiveMinutes = (now - tabTime.lastActive) / 60000;
    if (inactiveMinutes < criteria.inactive) return false;
  }
  
  if (criteria.age !== undefined) {
    const ageMinutes = (now - tabTime.created) / 60000;
    if (ageMinutes < criteria.age) return false;
  }
  
  if (criteria.notAccessed !== undefined) {
    const notAccessedMinutes = (now - tabTime.lastAccessed) / 60000;
    if (notAccessedMinutes < criteria.notAccessed) return false;
  }
  
  return true;
}
```

### 4. Periodic Rule Execution

Implement scheduled rule checking:

```javascript
// Set up periodic rule checking
const RULE_CHECK_INTERVAL = 60000; // Check every minute

chrome.alarms.create('checkRules', {
  delayInMinutes: 1,
  periodInMinutes: 1
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkRules') {
    checkPeriodicRules();
  }
});

async function checkPeriodicRules() {
  const rules = await getRules();
  const tabs = await chrome.tabs.query({});
  
  for (const rule of rules) {
    if (!rule.enabled) continue;
    
    // Check if rule should run now based on trigger settings
    if (!shouldRunRule(rule)) continue;
    
    const matchingTabs = [];
    for (const tab of tabs) {
      if (await checkCondition(tab, rule.conditions, tabs)) {
        matchingTabs.push(tab);
      }
    }
    
    if (matchingTabs.length > 0) {
      await executeAction(rule.actions, matchingTabs);
    }
  }
}
```

### 5. UI Updates

Update the rule editor to support time criteria for all conditions:

```html
<!-- After condition selection -->
<div class="form-group time-criteria" id="timeCriteria">
  <label>Time Criteria (optional)</label>
  <div class="time-options">
    <label>
      <input type="checkbox" id="useInactive">
      Inactive for <input type="number" id="inactiveMinutes" min="5" value="60"> minutes
    </label>
    <label>
      <input type="checkbox" id="useAge">
      Older than <input type="number" id="ageMinutes" min="5" value="180"> minutes
    </label>
    <label>
      <input type="checkbox" id="useNotAccessed">
      Not accessed for <input type="number" id="notAccessedMinutes" min="5" value="120"> minutes
    </label>
  </div>
</div>

<!-- Trigger type -->
<div class="form-group">
  <label for="triggerType">When to check</label>
  <select id="triggerType">
    <option value="event">On tab events (immediate)</option>
    <option value="periodic">Periodically</option>
  </select>
  <div id="triggerInterval" style="display:none;">
    <label>Check every <input type="number" id="intervalMinutes" min="1" value="15"> minutes</label>
  </div>
</div>
```

## Migration Strategy

1. Keep backward compatibility by converting old format to new:
```javascript
// Convert old format
if (condition.inactiveMinutes && !condition.timeCriteria) {
  condition.timeCriteria = { inactive: condition.inactiveMinutes };
  delete condition.inactiveMinutes;
}
```

2. Update existing sample rules to use new format

3. Add new sample rules demonstrating time-based triggers:
   - "Archive old research tabs" (age > 7 days)
   - "Close stale news tabs" (category + not accessed > 4 hours)
   - "Group inactive work tabs" (domain + inactive > 2 hours)

## Benefits

1. **Consistency**: All conditions can use any time criteria
2. **Flexibility**: Mix and match conditions with time modifiers
3. **Power**: Periodic checking enables proactive tab management
4. **Clarity**: Clearer separation of concerns in the UI

## Implementation Steps

1. [ ] Implement tab time tracking in background.js
2. [ ] Update condition checking to support timeCriteria
3. [ ] Add periodic rule checking with chrome.alarms
4. [ ] Update UI to show time criteria for all conditions
5. [ ] Migrate existing rules to new format
6. [ ] Add new sample rules
7. [ ] Update documentation