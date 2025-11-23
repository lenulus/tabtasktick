# TabTaskTick - First-Run Experience (OOTB) Implementation Plan

## Executive Summary

This document outlines the implementation plan for TabTaskTick's first-run onboarding experience. Without onboarding, users perceive TabTaskTick as "another tab manager" rather than the workspace orchestration system it actually is. A guided 2-minute welcome flow will establish core mental models and dramatically improve feature discovery and retention.

---

## Problem Statement

### Current User Journey (Broken)
1. User installs TabTaskTick
2. Clicks extension icon → Popup appears
3. Sees cryptic stats: "37 tabs, 3 groups, 2 collections"
4. No understanding of what collections are or how they differ from Chrome groups
5. Either closes and forgets, or randomly clicks "Dashboard"
6. Dashboard shows 8 navigation options → Analysis paralysis
7. Never discovers sidepanel or rules engine
8. Uses <5% of system capabilities

### Mental Model Failures
- **Collections vs. Groups**: Users confuse persistent Collections with temporary Chrome Tab Groups
- **Task Invisibility**: Task management capability completely hidden
- **Surface Confusion**: No understanding of Popup vs. Dashboard vs. Sidepanel roles
- **Automation Burial**: Rules engine (most powerful feature) has zero discoverability
- **No Success Moment**: User never experiences automation working

### Impact
- Low feature adoption
- Poor retention
- Missed differentiation from competitors
- Support burden from confused users

---

## Solution Overview

### Three-Phase Welcome Flow (2 minutes total)

**Phase 1: Orient (30 seconds)**
- Auto-open dashboard on first install
- Visual diagram showing three surfaces
- Clear explanation of each surface's role

**Phase 2: Create First Collection (1 minute)**
- Interactive collection creation from user's actual tabs
- Establishes core mental model immediately
- Creates tangible success moment

**Phase 3: Introduce Automation (30 seconds)**
- Simple rule creation example
- Shows power of rules engine
- Skippable but memorable

**Plus: Sample Content**
- Pre-loaded sample collection with tasks
- Clearly marked as demo
- Easy to delete

---

## Detailed Design

### Phase 1: Welcome & Orientation

#### Trigger
- `chrome.runtime.onInstalled` listener detects first install
- Auto-open dashboard (not popup)
- Set flag: `firstRun: true` in chrome.storage

#### Welcome Screen Design

```
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║                      🎯 TabTaskTick                        ║
║         Advanced Tab & Task Management                     ║
║                                                            ║
║  ┌──────────────────────────────────────────────────┐     ║
║  │                                                  │     ║
║  │  [Visual: Three panels showing]                 │     ║
║  │  Popup | Dashboard | Sidepanel                  │     ║
║  │                                                  │     ║
║  └──────────────────────────────────────────────────┘     ║
║                                                            ║
║  Your Command Center:                                      ║
║  • Dashboard (you are here) - Manage everything           ║
║  • Popup - Quick access to stats & actions                ║
║  • Sidepanel - Your active workspace                      ║
║                                                            ║
║              [Start Setup]  [Skip & Explore]              ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

#### Key Messages
1. **TabTaskTick is more than a tab manager** - it's workspace orchestration
2. **Three surfaces, three purposes** - establish the IA immediately
3. **Dashboard is mission control** - orient to current location

### Phase 2: First Collection Creation

#### Interactive Flow

```
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║  Let's organize your current tabs                          ║
║                                                            ║
║  You have 12 tabs open right now:                          ║
║  ┌──────────────────────────────────────────────────┐     ║
║  │ ✓ GitHub - Pull Requests                        │     ║
║  │ ✓ Figma - Design System                         │     ║
║  │ ✓ Linear - Sprint Planning                      │     ║
║  │ ... (showing first 5)                            │     ║
║  └──────────────────────────────────────────────────┘     ║
║                                                            ║
║  Collections are persistent projects that:                 ║
║  ✓ Survive browser restarts                               ║
║  ✓ Can be snoozed and restored                            ║
║  ✓ Contain tasks alongside tabs                           ║
║                                                            ║
║  Name your first collection:                               ║
║  ┌──────────────────────────────────────────────────┐     ║
║  │ Work Project                              📁     │     ║
║  └──────────────────────────────────────────────────┘     ║
║                                                            ║
║              [Create Collection]  [Skip]                   ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

#### Behind the Scenes
1. Query current window tabs
2. Show first 5 as preview
3. On "Create Collection":
   - Call `CaptureWindowService.captureWindow()`
   - Create collection with user-provided name
   - Show success animation
   - Redirect to Collections view with new collection highlighted

#### Success Criteria
- User sees their actual tabs organized
- Collection created with real data (not demo)
- Immediate value delivered

### Phase 3: Introduce Automation

#### Simple Rule Builder

```
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║  Now let's automate tab management                         ║
║                                                            ║
║  Create your first rule:                                   ║
║  ┌──────────────────────────────────────────────────┐     ║
║  │                                                  │     ║
║  │  When: Tabs older than [7] days                 │     ║
║  │  And:  Not in a collection                      │     ║
║  │  Then: Close automatically                      │     ║
║  │                                                  │     ║
║  └──────────────────────────────────────────────────┘     ║
║                                                            ║
║  This will help prevent tab overload by automatically      ║
║  cleaning up forgotten tabs.                               ║
║                                                            ║
║              [Enable Rule]  [Skip Automation]              ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

#### Default Rule Template
```javascript
{
  id: 'onboarding-cleanup-rule',
  name: 'Clean up old tabs',
  enabled: true,
  trigger: {
    type: 'repeat',
    repeat_every: '1d'
  },
  when: {
    all: [
      { field: 'age', operator: '>', value: 7, unit: 'days' },
      { field: 'inCollection', operator: '==', value: false }
    ]
  },
  then: [
    { type: 'close' }
  ]
}
```

#### Progressive Disclosure
- Show simple rule builder (not full DSL editor)
- Link to "Advanced Rules" for power users
- Explain benefit clearly

### Phase 4: Sample Content

#### Pre-loaded Sample Collection

```javascript
{
  name: '📚 Getting Started with TabTaskTick',
  emoji: '📚',
  color: '#667eea',
  folders: [
    {
      name: 'Documentation',
      tabs: [
        {
          title: 'TabTaskTick Guide - Collections',
          url: 'https://github.com/[repo]/wiki/collections'
        },
        {
          title: 'TabTaskTick Guide - Rules',
          url: 'https://github.com/[repo]/wiki/rules'
        },
        {
          title: 'TabTaskTick Guide - Tasks',
          url: 'https://github.com/[repo]/wiki/tasks'
        }
      ]
    }
  ],
  tasks: [
    {
      title: '✓ Install TabTaskTick',
      status: 'completed',
      completed: true
    },
    {
      title: 'Create your first collection',
      status: 'active',
      completed: false,
      priority: 'high'
    },
    {
      title: 'Try snoozing tabs',
      status: 'active',
      completed: false,
      priority: 'medium'
    },
    {
      title: 'Explore the Rules Engine',
      status: 'active',
      completed: false,
      priority: 'low'
    }
  ]
}
```

#### Visibility
- Clearly labeled as "Sample" in UI
- Easy "Delete Sample Collection" button
- Auto-collapses after first session

---

## Implementation Phases

### Phase 1: Core Welcome Flow (Week 1)

**Files to Create:**
```
/dashboard/modules/views/welcome.js
/dashboard/modules/views/welcome.css
/services/execution/OnboardingService.js
```

**Tasks:**
1. Create Welcome view component
2. Add onboarding state management to chrome.storage
3. Implement auto-open dashboard on install
4. Create three-step wizard UI
5. Add skip/dismiss functionality

**Services Needed:**
- `OnboardingService.checkFirstRun()`
- `OnboardingService.completeStep(stepName)`
- `OnboardingService.skipOnboarding()`
- `OnboardingService.resetOnboarding()` (for settings)

### Phase 2: Collection Creation Flow (Week 2)

**Integration Points:**
- Use existing `CaptureWindowService.captureWindow()`
- Reuse collection creation modal components
- Add success animations

**Tasks:**
1. Create simplified collection creation interface
2. Add tab preview component
3. Implement success state with celebration
4. Redirect to Collections view after creation

### Phase 3: Rule Builder Introduction (Week 3)

**Tasks:**
1. Create simplified rule template UI
2. Pre-fill with sensible defaults
3. Add rule to storage if user accepts
4. Link to full Rules view for exploration

### Phase 4: Sample Content (Week 4)

**Tasks:**
1. Create sample collection JSON template
2. Implement sample content loader
3. Add "Delete Sample" functionality
4. Mark sample content visually distinct

### Phase 5: Progressive Discovery (Week 5)

**Feature Highlights System:**
```
/services/utils/featureDiscovery.js
```

**Capabilities:**
- Track feature usage
- Show blue dot indicators on unused features
- Display contextual tips after patterns detected
- "Did you know?" prompts

**Examples:**
- After 10 popup uses: "Try the Dashboard for bulk operations"
- After creating 3 collections: "Did you know you can add tasks?"
- After manual tab cleanup: "You could automate this with a rule"

---

## User Flow Diagrams

### First Install Flow

```
Install Extension
       ↓
Auto-open Dashboard (not popup)
       ↓
Welcome Screen (Orient to 3 surfaces)
       ↓
   [Start Setup] or [Skip]
       ↓
Create First Collection (from current tabs)
       ↓
Success Animation
       ↓
Introduce Automation (simple rule)
       ↓
   [Enable Rule] or [Skip]
       ↓
Dashboard Collections View
(Sample collection visible but collapsed)
```

### Returning User Flow

```
User opens extension after skipping onboarding
       ↓
Check: hasSeenTip('dashboard-power')
       ↓
After 10 popup uses → Show tip banner
"💡 Try the Dashboard for managing multiple tabs at once"
       ↓
User dismisses or clicks
       ↓
Mark tip as seen
```

---

## Technical Architecture

### Storage Schema

```javascript
// chrome.storage.local
{
  onboarding: {
    firstRun: true,
    completedSteps: ['welcome', 'collection', 'rule'],
    skipped: false,
    completedAt: 1234567890,
    sampleCollectionId: 'uuid-123'
  },
  featureDiscovery: {
    tipsShown: {
      'dashboard-power': { shown: true, dismissedAt: 1234567890 },
      'rules-automation': { shown: false },
      'task-management': { shown: false }
    },
    featureUsage: {
      'popup-open': 12,
      'dashboard-open': 2,
      'collection-create': 1,
      'rule-create': 0
    }
  }
}
```

### Service API

```javascript
// OnboardingService.js

export async function checkFirstRun() {
  const { onboarding } = await chrome.storage.local.get('onboarding');
  return !onboarding || onboarding.firstRun;
}

export async function completeOnboardingStep(step) {
  const { onboarding } = await chrome.storage.local.get('onboarding');
  const steps = onboarding?.completedSteps || [];
  steps.push(step);

  await chrome.storage.local.set({
    onboarding: {
      ...onboarding,
      completedSteps: steps,
      firstRun: false,
      completedAt: Date.now()
    }
  });
}

export async function skipOnboarding() {
  await chrome.storage.local.set({
    onboarding: {
      firstRun: false,
      skipped: true,
      completedSteps: [],
      skippedAt: Date.now()
    }
  });
}

export async function createSampleCollection() {
  const collection = {
    name: '📚 Getting Started with TabTaskTick',
    emoji: '📚',
    color: '#667eea',
    // ... rest of sample data
  };

  const result = await CollectionService.createCollection(collection);

  await chrome.storage.local.set({
    'onboarding.sampleCollectionId': result.id
  });

  return result;
}

export async function deleteSampleCollection() {
  const { onboarding } = await chrome.storage.local.get('onboarding');
  if (onboarding?.sampleCollectionId) {
    await CollectionService.deleteCollection(onboarding.sampleCollectionId);
  }
}

export async function resetOnboarding() {
  await chrome.storage.local.remove('onboarding');
  await chrome.storage.local.remove('featureDiscovery');
}
```

### Background Service Integration

```javascript
// background-integrated.js

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('TabTaskTick installed - starting onboarding');

    // Set first run flag
    await chrome.storage.local.set({
      onboarding: {
        firstRun: true,
        completedSteps: []
      }
    });

    // Auto-open dashboard with welcome view
    await chrome.tabs.create({
      url: chrome.runtime.getURL('dashboard/dashboard.html#welcome')
    });
  }
});
```

---

## UI Components

### Welcome View Component

**Location**: `/dashboard/modules/views/welcome.js`

```javascript
export async function loadWelcomeView() {
  const container = document.getElementById('mainContent');

  const onboarding = await OnboardingService.getOnboardingState();

  if (onboarding.completedSteps.includes('welcome')) {
    // Already completed, redirect to collections
    loadView('collections');
    return;
  }

  container.innerHTML = `
    <div class="welcome-container">
      <div class="welcome-header">
        <img src="../icons/icon-128.png" alt="TabTaskTick">
        <h1>Welcome to TabTaskTick</h1>
        <p>Advanced Tab & Task Management</p>
      </div>

      <div class="surfaces-diagram">
        <!-- Visual showing 3 surfaces -->
      </div>

      <div class="surfaces-explanation">
        <div class="surface-item">
          <h3>📊 Dashboard</h3>
          <p>Your command center - manage collections, rules, and bulk operations</p>
        </div>
        <div class="surface-item">
          <h3>⚡ Popup</h3>
          <p>Quick access to stats and common actions</p>
        </div>
        <div class="surface-item">
          <h3>📋 Sidepanel</h3>
          <p>Your active workspace - current collection and tasks</p>
        </div>
      </div>

      <div class="welcome-actions">
        <button class="btn btn-primary" id="startSetup">Start Setup</button>
        <button class="btn btn-secondary" id="skipOnboarding">Skip & Explore</button>
      </div>
    </div>
  `;

  // Event listeners
  document.getElementById('startSetup').addEventListener('click', async () => {
    await OnboardingService.completeOnboardingStep('welcome');
    showCollectionCreation();
  });

  document.getElementById('skipOnboarding').addEventListener('click', async () => {
    await OnboardingService.skipOnboarding();
    loadView('overview');
  });
}

async function showCollectionCreation() {
  const container = document.getElementById('mainContent');
  const tabs = await chrome.tabs.query({ currentWindow: true });

  container.innerHTML = `
    <div class="collection-creation-wizard">
      <h2>Let's organize your current tabs</h2>
      <p>You have ${tabs.length} tabs open right now:</p>

      <div class="tab-preview">
        ${tabs.slice(0, 5).map(tab => `
          <div class="tab-preview-item">
            <img src="${tab.favIconUrl}" width="16" height="16">
            <span>${tab.title}</span>
          </div>
        `).join('')}
        ${tabs.length > 5 ? `<p class="more-tabs">... and ${tabs.length - 5} more</p>` : ''}
      </div>

      <div class="collection-info">
        <h3>Collections are persistent projects that:</h3>
        <ul>
          <li>✓ Survive browser restarts</li>
          <li>✓ Can be snoozed and restored</li>
          <li>✓ Contain tasks alongside tabs</li>
        </ul>
      </div>

      <div class="collection-name-input">
        <label>Name your first collection:</label>
        <input type="text" id="collectionName" placeholder="Work Project" autofocus>
      </div>

      <div class="wizard-actions">
        <button class="btn btn-primary" id="createCollection">Create Collection</button>
        <button class="btn btn-secondary" id="skipCollection">Skip</button>
      </div>
    </div>
  `;

  document.getElementById('createCollection').addEventListener('click', async () => {
    const name = document.getElementById('collectionName').value || 'My First Collection';

    // Show loading state
    const btn = document.getElementById('createCollection');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    // Create collection from current window
    const result = await sendMessage({
      action: 'captureWindow',
      windowId: (await chrome.windows.getCurrent()).id,
      name: name
    });

    if (result.success) {
      await OnboardingService.completeOnboardingStep('collection');
      showSuccessAnimation();
      setTimeout(() => showRuleIntroduction(), 2000);
    }
  });

  document.getElementById('skipCollection').addEventListener('click', async () => {
    showRuleIntroduction();
  });
}

function showSuccessAnimation() {
  // Show celebration animation
  const container = document.getElementById('mainContent');
  const overlay = document.createElement('div');
  overlay.className = 'success-overlay';
  overlay.innerHTML = `
    <div class="success-animation">
      <div class="checkmark">✓</div>
      <h2>Collection Created!</h2>
      <p>Your tabs are now organized and will persist across browser restarts</p>
    </div>
  `;
  container.appendChild(overlay);
}

async function showRuleIntroduction() {
  const container = document.getElementById('mainContent');

  container.innerHTML = `
    <div class="rule-introduction-wizard">
      <h2>Now let's automate tab management</h2>
      <p>Create your first rule:</p>

      <div class="simple-rule-builder">
        <div class="rule-step">
          <label>When:</label>
          <span>Tabs older than <input type="number" value="7" min="1" max="90"> days</span>
        </div>
        <div class="rule-step">
          <label>And:</label>
          <span>Not in a collection</span>
        </div>
        <div class="rule-step">
          <label>Then:</label>
          <span>Close automatically</span>
        </div>
      </div>

      <div class="rule-benefit">
        <p>This will help prevent tab overload by automatically cleaning up forgotten tabs.</p>
      </div>

      <div class="wizard-actions">
        <button class="btn btn-primary" id="enableRule">Enable Rule</button>
        <button class="btn btn-secondary" id="skipRule">Skip Automation</button>
      </div>
    </div>
  `;

  document.getElementById('enableRule').addEventListener('click', async () => {
    const days = document.querySelector('input[type="number"]').value;

    const rule = {
      name: 'Clean up old tabs',
      enabled: true,
      trigger: { type: 'repeat', repeat_every: '1d' },
      when: {
        all: [
          { field: 'age', operator: '>', value: parseInt(days), unit: 'days' },
          { field: 'inCollection', operator: '==', value: false }
        ]
      },
      then: [{ type: 'close' }]
    };

    await sendMessage({ action: 'addRule', rule });
    await OnboardingService.completeOnboardingStep('rule');

    // Onboarding complete
    completeOnboarding();
  });

  document.getElementById('skipRule').addEventListener('click', async () => {
    completeOnboarding();
  });
}

async function completeOnboarding() {
  await OnboardingService.completeOnboardingStep('complete');

  // Create sample collection
  await OnboardingService.createSampleCollection();

  // Redirect to collections view
  loadView('collections');

  // Show success notification
  showNotification('Setup complete! Explore your collections and try creating tasks.', 'success');
}
```

---

## Progressive Discovery System

### Feature Tracking

```javascript
// services/utils/featureDiscovery.js

export async function trackFeatureUsage(featureName) {
  const { featureDiscovery } = await chrome.storage.local.get('featureDiscovery');
  const usage = featureDiscovery?.featureUsage || {};

  usage[featureName] = (usage[featureName] || 0) + 1;

  await chrome.storage.local.set({
    featureDiscovery: {
      ...featureDiscovery,
      featureUsage: usage
    }
  });

  // Check if we should show any tips based on usage patterns
  await checkForTips(usage);
}

async function checkForTips(usage) {
  const { featureDiscovery } = await chrome.storage.local.get('featureDiscovery');
  const tipsShown = featureDiscovery?.tipsShown || {};

  // After 10 popup uses, suggest dashboard
  if (usage['popup-open'] >= 10 && !tipsShown['dashboard-power']) {
    await showTip('dashboard-power', {
      title: '💡 Try the Dashboard',
      message: 'For managing multiple tabs at once, the Dashboard provides powerful bulk operations.',
      action: { label: 'Open Dashboard', url: 'dashboard/dashboard.html' }
    });
  }

  // After creating 3 collections, introduce tasks
  if (usage['collection-create'] >= 3 && !tipsShown['task-management']) {
    await showTip('task-management', {
      title: '📋 Did you know?',
      message: 'You can add tasks to your collections to track work alongside tabs.',
      action: { label: 'Learn More', url: 'dashboard/dashboard.html#tasks' }
    });
  }

  // After manual tab cleanup, suggest automation
  if (usage['manual-close'] >= 5 && usage['rule-create'] === 0 && !tipsShown['rules-automation']) {
    await showTip('rules-automation', {
      title: '⚡ Automate This',
      message: 'You\'re manually closing tabs often. You could automate this with a rule.',
      action: { label: 'Create Rule', url: 'dashboard/dashboard.html#rules' }
    });
  }
}

async function showTip(tipId, config) {
  // Show non-blocking notification banner
  const banner = document.createElement('div');
  banner.className = 'discovery-tip';
  banner.innerHTML = `
    <div class="tip-content">
      <h4>${config.title}</h4>
      <p>${config.message}</p>
      ${config.action ? `<button class="btn btn-sm">${config.action.label}</button>` : ''}
    </div>
    <button class="tip-dismiss">×</button>
  `;

  document.body.appendChild(banner);

  // Track that tip was shown
  const { featureDiscovery } = await chrome.storage.local.get('featureDiscovery');
  await chrome.storage.local.set({
    featureDiscovery: {
      ...featureDiscovery,
      tipsShown: {
        ...featureDiscovery?.tipsShown,
        [tipId]: { shown: true, shownAt: Date.now() }
      }
    }
  });

  // Handle dismiss
  banner.querySelector('.tip-dismiss').addEventListener('click', () => {
    banner.remove();
    markTipDismissed(tipId);
  });

  // Handle action
  if (config.action) {
    banner.querySelector('.btn').addEventListener('click', () => {
      window.location.href = config.action.url;
      banner.remove();
      markTipDismissed(tipId);
    });
  }
}

async function markTipDismissed(tipId) {
  const { featureDiscovery } = await chrome.storage.local.get('featureDiscovery');
  await chrome.storage.local.set({
    featureDiscovery: {
      ...featureDiscovery,
      tipsShown: {
        ...featureDiscovery?.tipsShown,
        [tipId]: {
          ...featureDiscovery?.tipsShown?.[tipId],
          dismissedAt: Date.now()
        }
      }
    }
  });
}
```

---

## Settings Integration

### Reset Onboarding Option

Add to Options page:

```html
<!-- options/options.html -->
<section class="settings-section">
  <h3>Onboarding</h3>
  <div class="setting-item">
    <label>
      <span>Reset Onboarding</span>
      <small>Replay the welcome flow and feature tips</small>
    </label>
    <button class="btn btn-secondary" id="resetOnboarding">Reset</button>
  </div>
</section>
```

```javascript
// options/options.js
document.getElementById('resetOnboarding').addEventListener('click', async () => {
  if (confirm('This will reset all onboarding progress and tips. Continue?')) {
    await sendMessage({ action: 'resetOnboarding' });
    showNotification('Onboarding reset. Reopen the dashboard to see the welcome flow.', 'success');
  }
});
```

---

## Success Metrics

### Key Performance Indicators (KPIs)

**Immediate Metrics (Day 1):**
- % of users who complete welcome screen
- % of users who create first collection
- % of users who enable first rule
- % of users who skip onboarding

**Short-term Metrics (Week 1):**
- % of users who create 2+ collections
- % of users who add tasks to collections
- % of users who open dashboard vs. popup only
- % of users who discover sidepanel

**Long-term Metrics (Month 1):**
- % of users who create custom rules (beyond onboarding)
- % of users with 5+ collections
- Feature adoption rate (tasks, snoozing, scheduled exports)
- Retention rate compared to pre-onboarding baseline

**Target Goals:**
- 80% complete initial setup
- 50% create second collection within 7 days
- 30% create at least one rule within 14 days
- 90% understand Collection vs. Group distinction (measured via feature usage patterns)

### Analytics Events

```javascript
// Track onboarding events
trackEvent('onboarding', 'started');
trackEvent('onboarding', 'step_completed', { step: 'welcome' });
trackEvent('onboarding', 'step_completed', { step: 'collection' });
trackEvent('onboarding', 'step_completed', { step: 'rule' });
trackEvent('onboarding', 'completed');
trackEvent('onboarding', 'skipped');

// Track feature discovery
trackEvent('discovery_tip', 'shown', { tip: 'dashboard-power' });
trackEvent('discovery_tip', 'dismissed', { tip: 'dashboard-power' });
trackEvent('discovery_tip', 'action_clicked', { tip: 'dashboard-power' });
```

---

## Edge Cases & Error Handling

### User Has No Tabs Open
```javascript
// If current window has 0 tabs (unlikely but possible)
if (tabs.length === 0) {
  showMessage('Open some tabs first, then create your first collection!');
  skipToRuleIntroduction();
}
```

### User Closes Window Mid-Onboarding
```javascript
// Save progress in chrome.storage
// On next dashboard open, check if onboarding incomplete
const { onboarding } = await chrome.storage.local.get('onboarding');
if (onboarding.firstRun && !onboarding.completedSteps.includes('complete')) {
  // Resume where they left off
  const lastStep = onboarding.completedSteps[onboarding.completedSteps.length - 1];
  resumeOnboardingFrom(lastStep);
}
```

### User Returns After Skipping
```javascript
// After 7 days of usage with no collections created
if (daysSinceInstall > 7 && collectionCount === 0) {
  showReOnboardingPrompt();
}
```

### Sample Collection Conflicts
```javascript
// Don't create sample if user already has 3+ collections
const existingCollections = await CollectionService.getCollections();
if (existingCollections.length >= 3) {
  skipSampleCreation();
}
```

---

## Visual Design

### Design Tokens

```css
/* welcome.css */
.welcome-container {
  max-width: 800px;
  margin: 80px auto;
  padding: 40px;
  text-align: center;
}

.welcome-header h1 {
  font-size: 32px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 20px 0 10px;
}

.welcome-header p {
  font-size: 18px;
  color: var(--text-secondary);
}

.surfaces-diagram {
  margin: 60px 0;
  display: flex;
  justify-content: center;
  gap: 40px;
}

.surfaces-explanation {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 30px;
  margin: 40px 0;
}

.surface-item {
  text-align: left;
  padding: 24px;
  background: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.surface-item h3 {
  font-size: 20px;
  margin-bottom: 12px;
}

.surface-item p {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.welcome-actions {
  margin-top: 40px;
  display: flex;
  gap: 16px;
  justify-content: center;
}

/* Success animation */
.success-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  animation: fadeIn 0.3s ease;
}

.success-animation {
  background: white;
  padding: 60px;
  border-radius: 16px;
  text-align: center;
  animation: scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.checkmark {
  width: 80px;
  height: 80px;
  background: var(--success-color);
  color: white;
  font-size: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
  animation: bounceIn 0.6s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleIn {
  from { transform: scale(0.8); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@keyframes bounceIn {
  0% { transform: scale(0); }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); }
}

/* Discovery tips */
.discovery-tip {
  position: fixed;
  bottom: 24px;
  right: 24px;
  max-width: 400px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  padding: 20px;
  display: flex;
  gap: 16px;
  animation: slideInRight 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 9999;
}

.tip-content h4 {
  margin: 0 0 8px;
  font-size: 16px;
}

.tip-content p {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--text-secondary);
}

.tip-dismiss {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
```

---

## Testing Plan

### Manual Testing Checklist

**First Install:**
- [ ] Dashboard auto-opens (not popup)
- [ ] Welcome screen displays correctly
- [ ] "Start Setup" button works
- [ ] "Skip & Explore" works and sets flag
- [ ] Collection creation wizard shows current tabs
- [ ] Collection is created with correct name
- [ ] Success animation plays
- [ ] Rule introduction displays
- [ ] Rule is created when enabled
- [ ] Sample collection appears
- [ ] Redirects to collections view
- [ ] Onboarding state saved correctly

**Skip Flow:**
- [ ] Skipping at welcome goes to overview
- [ ] Skipping at collection goes to rule intro
- [ ] Skipping at rule completes onboarding
- [ ] Skip state prevents re-showing

**Resume Flow:**
- [ ] Closing mid-onboarding saves progress
- [ ] Reopening resumes at correct step
- [ ] Completing after resume works correctly

**Progressive Discovery:**
- [ ] Tips show after usage thresholds
- [ ] Tips can be dismissed
- [ ] Dismissed tips don't re-appear
- [ ] Tip actions navigate correctly

**Settings:**
- [ ] Reset onboarding clears all state
- [ ] Reset allows replaying welcome flow

### Automated Tests

```javascript
// tests/unit/onboarding-service.test.js

describe('OnboardingService', () => {
  test('detects first run correctly', async () => {
    // Mock empty storage
    const isFirstRun = await OnboardingService.checkFirstRun();
    expect(isFirstRun).toBe(true);
  });

  test('tracks completed steps', async () => {
    await OnboardingService.completeOnboardingStep('welcome');
    const state = await OnboardingService.getOnboardingState();
    expect(state.completedSteps).toContain('welcome');
  });

  test('creates sample collection', async () => {
    const result = await OnboardingService.createSampleCollection();
    expect(result.id).toBeDefined();
    expect(result.name).toContain('Getting Started');
  });
});

describe('FeatureDiscovery', () => {
  test('tracks feature usage', async () => {
    await trackFeatureUsage('popup-open');
    const { featureDiscovery } = await chrome.storage.local.get('featureDiscovery');
    expect(featureDiscovery.featureUsage['popup-open']).toBe(1);
  });

  test('shows tip after threshold', async () => {
    // Simulate 10 popup opens
    for (let i = 0; i < 10; i++) {
      await trackFeatureUsage('popup-open');
    }

    const { featureDiscovery } = await chrome.storage.local.get('featureDiscovery');
    expect(featureDiscovery.tipsShown['dashboard-power']).toBeDefined();
  });
});
```

---

## Rollout Plan

### Phase 1: Beta Testing (Week 1-2)
- Enable for internal testing only
- Gather feedback on flow, timing, clarity
- Iterate on copy and visuals
- Fix bugs

### Phase 2: Staged Rollout (Week 3-4)
- 10% of new installs
- Monitor completion rates
- A/B test variations (e.g., sample content vs. no sample)
- Collect analytics

### Phase 3: Full Release (Week 5)
- 100% of new installs
- Monitor KPIs
- Prepare to iterate based on data

### Post-Launch Iteration
- Week 6-8: Analyze metrics
- Identify drop-off points
- Test variations to improve completion
- Add/remove steps based on data

---

## Open Questions & Decisions Needed

1. **Should sample collection links be real or placeholder?**
   - Option A: Real links to GitHub wiki (requires creating documentation)
   - Option B: Placeholder links that go to a "Docs coming soon" page
   - **Recommendation**: Real links to ensure value

2. **How aggressive should progressive discovery be?**
   - Option A: Show tips frequently (every 5 uses)
   - Option B: Show tips sparingly (only major milestones)
   - **Recommendation**: Start conservative, increase if needed

3. **Should we track analytics?**
   - Option A: Full analytics with Google Analytics
   - Option B: Minimal chrome.storage tracking only
   - **Recommendation**: chrome.storage only for privacy

4. **Onboarding video or interactive tour?**
   - Option A: Embed video tutorial
   - Option B: Interactive wizard (as designed)
   - **Recommendation**: Interactive wizard (more engaging)

5. **Default rule preset - which one?**
   - Option A: Close old tabs (as designed)
   - Option B: Group by domain
   - Option C: Let user choose
   - **Recommendation**: Close old tabs (most universally useful)

---

## Appendix: User Research Insights

### Common New User Confusions

From hypothetical user testing scenarios:

1. **"What's a collection?"**
   - Users compare to folders, bookmarks, tab groups
   - Need clear differentiation immediately

2. **"Why three different UIs?"**
   - Users don't understand popup vs. dashboard vs. sidepanel
   - Need explicit orientation

3. **"I already have tab groups, why collections?"**
   - Fundamental misunderstanding
   - Must address in onboarding

4. **"Where did my tabs go after creating a collection?"**
   - Confusion about capture vs. reference
   - Need to clarify that tabs stay open

5. **"How do I undo onboarding?"**
   - Users want ability to reset/replay
   - Must provide in settings

### Competitive Analysis

**Similar Tools:**
- **Notion**: Strong onboarding with template selection
- **Things 3**: Sample project with demo tasks
- **Linear**: Progressive disclosure with contextual tips
- **VS Code**: Feature highlights on first use

**Best Practices Borrowed:**
- Sample content (Things 3)
- Progressive tips (VS Code)
- Skippable but memorable (Linear)
- Visual orientation (Notion)

---

## Document Revision History

- v1.0 (2025-01-XX): Initial plan created
- Future revisions: TBD based on implementation learnings

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Prioritize implementation** phases
3. **Create design mockups** for welcome screens
4. **Begin Phase 1 development** (Core Welcome Flow)
5. **Set up analytics tracking** (if approved)
6. **Create beta testing group**
7. **Iterate based on feedback**

---

**Document Status**: Draft for Review
**Author**: UX Architecture Analysis
**Date**: January 2025
**Target Release**: TBD
