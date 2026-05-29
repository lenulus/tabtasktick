// Rules View Module
// Handles the rules management view with rule creation, editing, and testing

import state from '../core/state.js';
import { showNotification } from '../core/shared-utils.js';
import { parseDSL, serializeRuleToDSL, validateDSL, formatDSL } from '../../../lib/dsl.js';
import { createHighlightedOverlay } from '../../../lib/dsl-highlighter.js';
import { ConditionsBuilder } from '../../../lib/conditions-builder.js';
import {
  validateActionList,
  getCompatibleActions,
  getIncompatibilityReason,
  sortActionsByPriority
} from '../../../lib/action-validator.js';
import { formatActionCounts } from '../../../services/utils/activityFormatter.js';
import { t, tPlural } from '../../../services/utils/i18n.js';

export async function loadRulesView() {
  console.log('Loading rules view...');

  try {
    // Load current rules from background
    const response = await sendMessage({ action: 'getRules' });
    console.log('Rules response:', response);
    
    // Handle both old format (direct array) and new format (wrapped)
    const rules = Array.isArray(response) ? response : (response?.rules || []);
    state.set('currentRules', rules);

    // Initialize sample rules (not auto-enabled)
    state.set('sampleRules', getSampleRules());

    // Update UI
    updateRulesUI();
    setupRulesEventListeners();

  } catch (error) {
    console.error('Failed to load rules:', error);
  }
}

function getSampleRules() {
  return [
    {
      id: 'sample_1',
      name: 'Close duplicate tabs',
      description: 'Automatically close duplicate tabs globally, keeping the oldest one',
      enabled: false,
      when: {
        all: [
          { subject: 'duplicate', operator: 'is', value: true }
        ]
      },
      then: [
        { type: 'close-duplicates', keep: 'oldest', scope: 'global' }
      ],
      trigger: { type: 'immediate' },
      priority: 1,
    },
    {
      id: 'sample_2',
      name: 'Keep newest duplicate per window',
      description: 'When opening a duplicate tab, close the older one in the same window (keeps your current tab)',
      enabled: false,
      when: {
        all: [
          { subject: 'duplicate', operator: 'is', value: true }
        ]
      },
      then: [
        { type: 'close-duplicates', keep: 'newest', scope: 'per-window' }
      ],
      trigger: { type: 'immediate' },
      priority: 2,
    },
    {
      id: 'sample_3',
      name: 'Group tabs by domain',
      description: 'Group tabs from the same domain when you have 3 or more',
      enabled: false,
      when: {
        all: [
          { subject: 'domainCount', operator: 'gte', value: 3 }
        ]
      },
      then: [
        { type: 'group', group_by: 'domain' }
      ],
      trigger: { type: 'immediate' },
      priority: 3,
    },
    {
      id: 'sample_4',
      name: 'Snooze inactive articles',
      description: 'Snooze unread articles after 30 minutes',
      enabled: false,
      when: {
        all: [
          {
            any: [
              { subject: 'domain', operator: 'contains', value: 'medium.com' },
              { subject: 'domain', operator: 'contains', value: 'dev.to' },
              { subject: 'domain', operator: 'contains', value: 'hackernews' },
              { subject: 'domain', operator: 'contains', value: 'reddit.com' }
            ]
          },
          { subject: 'age', operator: 'gt', value: 30 * 60 * 1000 }  // 30 minutes in ms
        ]
      },
      then: [
        { type: 'snooze', for: '24h' }
      ],
      trigger: { type: 'repeat', repeat_every: '15m' },
      priority: 4,
    },
    {
      id: 'sample_5',
      name: 'Clean up inactive Chrome pages',
      description: 'Close Chrome internal pages after 30 minutes',
      enabled: false,
      when: {
        all: [
          { subject: 'url', operator: 'regex', value: '^chrome://(extensions|downloads|settings|flags|history|bookmarks|newtab)' },
          { subject: 'age', operator: 'gt', value: 30 * 60 * 1000 }  // 30 minutes in ms
        ]
      },
      then: [
        { type: 'close' }
      ],
      trigger: { type: 'repeat', repeat_every: '15m' },
      priority: 5,
    },
    {
      id: 'sample_6',
      name: 'Close inactive social media tabs',
      description: 'Close social media tabs after 60 minutes',
      enabled: false,
      when: {
        all: [
          { subject: 'category', operator: 'in', value: ['social'] },
          { subject: 'age', operator: 'gt', value: 60 * 60 * 1000 }  // 60 minutes in ms
        ]
      },
      then: [
        { type: 'close' }
      ],
      trigger: { type: 'repeat', repeat_every: '15m' },
      priority: 6,
    },
    {
      id: 'sample_7',
      name: 'Group shopping tabs together',
      description: 'Automatically group all shopping sites into one tab group',
      enabled: false,
      when: {
        all: [
          { subject: 'category', operator: 'in', value: ['shopping'] }
        ]
      },
      then: [
        { type: 'group', name: 'Shopping' }
      ],
      trigger: { type: 'immediate' },
      priority: 6,
    },
    {
      id: 'sample_8',
      name: 'Discard memory-heavy video tabs',
      description: 'Discard video streaming tabs after 30 minutes of inactivity',
      enabled: false,
      when: {
        all: [
          {
            any: [
              { subject: 'domain', operator: 'contains', value: 'youtube.com' },
              { subject: 'domain', operator: 'contains', value: 'netflix.com' },
              { subject: 'domain', operator: 'contains', value: 'twitch.tv' },
              { subject: 'domain', operator: 'contains', value: 'spotify.com' }
            ]
          },
          { subject: 'active', operator: 'is', value: false },
          { subject: 'age', operator: 'gt', value: 30 * 60 * 1000 }  // 30 minutes in ms
        ]
      },
      then: [
        { type: 'discard' }
      ],
      trigger: { type: 'repeat', repeat_every: '30m' },
      priority: 8,
    }
  ];
}

export async function updateRulesUI() {
  const rulesList = document.getElementById('rulesList');
  const emptyState = document.getElementById('rulesEmptyState');

  // Show/hide empty state
  const rules = state.get('currentRules') || [];
  if (rules.length === 0) {
    emptyState.style.display = 'flex';
    rulesList.style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    rulesList.style.display = 'block';
    rulesList.innerHTML = '';

    // Sort rules by priority
    const currentRules = state.get('currentRules') || [];
    console.log('Current rules in updateRulesUI:', currentRules);

    // Ensure currentRules is an array
    if (!Array.isArray(currentRules)) {
      console.error('currentRules is not an array:', currentRules);
      return;
    }

    const sortedRules = [...currentRules].sort((a, b) => (a.priority || 999) - (b.priority || 999));

    // Create rule cards asynchronously
    for (const rule of sortedRules) {
      const ruleCard = await createRuleCard(rule);
      rulesList.appendChild(ruleCard);
    }
  }

  // Update sample rules in dropdown
  updateSampleRulesDropdown();
}

async function createRuleCard(rule) {
  const card = document.createElement('div');
  card.className = `rule-card ${!rule.enabled ? 'disabled' : ''}`;
  card.dataset.ruleId = rule.id;
  card.draggable = false; // Will be set dynamically on mousedown

  // Get trigger info HTML asynchronously
  const triggerInfoHTML = await getTriggerInfoHTML(rule);

  card.innerHTML = `
    <div class="rule-header">
      <div class="rule-drag-handle" title="${t('dashboard_rules_dragToReorder')}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="9" cy="5" r="1"></circle>
          <circle cx="9" cy="12" r="1"></circle>
          <circle cx="9" cy="19" r="1"></circle>
          <circle cx="15" cy="5" r="1"></circle>
          <circle cx="15" cy="12" r="1"></circle>
          <circle cx="15" cy="19" r="1"></circle>
        </svg>
      </div>
      <div class="rule-info">
        <h3>${rule.name}</h3>
      </div>
      <div class="rule-actions">
        <label class="switch rule-switch" title="${rule.enabled ? t('dashboard_rules_disableRule') : t('dashboard_rules_enableRule')}">
          <input type="checkbox" class="rule-toggle" data-action="toggle" data-rule-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
        <button class="btn-icon" data-action="test" title="${t('dashboard_rules_testRuleTitle')}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
        <button class="btn-icon" data-action="run" title="${t('dashboard_rules_runRuleTitle')}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </button>
        <button class="btn-icon" data-action="edit" title="${t('common_edit')}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="btn-icon" data-action="delete" title="${t('common_delete')}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>
    <div class="rule-details">
      <div class="rule-condition">
        <strong>${t('dashboard_rules_cardWhen')}</strong> ${getConditionDescription(rule.when || rule.conditions)}
      </div>
      <div class="rule-action">
        <strong>${t('dashboard_rules_cardThen')}</strong> ${getActionDescription(rule.then || rule.actions)}
      </div>
      ${triggerInfoHTML}
    </div>
  `;

  return card;
}

/**
 * Get trigger information HTML for a rule
 * Shows interval and next run time for repeat triggers
 */
async function getTriggerInfoHTML(rule) {
  if (!rule.trigger) return '';

  const trigger = rule.trigger;

  // Handle repeat triggers (both 'repeat' type and legacy 'periodic')
  if (trigger.type === 'repeat' || trigger.type === 'periodic') {
    // Get interval from either repeat_every or every format
    const interval = trigger.repeat_every || trigger.every || trigger.interval;
    if (!interval) return '';

    // Format interval for display
    const intervalText = formatInterval(interval);

    // Get next run time from chrome.alarms if rule is enabled
    let nextRunHTML = '';
    if (rule.enabled) {
      const nextRunTime = await getNextRunTime(rule.id);
      if (nextRunTime) {
        nextRunHTML = ` <span style="color: #666;">${t('dashboard_rules_nextRun', nextRunTime)}</span>`;
      }
    }

    return `
      <div class="rule-trigger">
        <strong>${t('dashboard_rules_cardRuns')}</strong> ${t('dashboard_rules_runsEvery', intervalText)}${nextRunHTML}
      </div>
    `;
  }

  // Handle once triggers
  if (trigger.type === 'once') {
    const at = trigger.once_at || trigger.at;
    if (at) {
      const date = new Date(at);
      const dateStr = date.toLocaleString();
      return `
        <div class="rule-trigger">
          <strong>${t('dashboard_rules_cardRuns')}</strong> ${t('dashboard_rules_runsOnceAt', dateStr)}
        </div>
      `;
    }
  }

  // Handle immediate triggers
  if (trigger.type === 'immediate') {
    return `
      <div class="rule-trigger">
        <strong>${t('dashboard_rules_cardRuns')}</strong> ${t('dashboard_rules_runsImmediate')}
      </div>
    `;
  }

  // Handle onCreate triggers
  if (trigger.type === 'onCreate') {
    return `
      <div class="rule-trigger">
        <strong>${t('dashboard_rules_cardRuns')}</strong> ${t('dashboard_rules_runsOnCreate')}
      </div>
    `;
  }

  return '';
}

/**
 * Format interval string to human-readable text
 * Converts '30m', '1h', '2d' to "30 minutes", "1 hour", "2 days"
 */
function formatInterval(interval) {
  if (typeof interval === 'number') {
    // Legacy format: interval in minutes
    if (interval < 60) return tPlural('dashboard_rules_interval_minutes', interval);
    if (interval < 1440) return tPlural('dashboard_rules_interval_hours', interval / 60);
    return tPlural('dashboard_rules_interval_days', interval / 1440);
  }

  // Modern format: '30m', '1h', '2d'
  const match = interval.match(/^(\d+)([smhd])$/);
  if (!match) return interval;

  const [, num, unit] = match;
  const value = parseInt(num);

  const unitKeys = {
    s: 'dashboard_rules_interval_seconds',
    m: 'dashboard_rules_interval_minutes',
    h: 'dashboard_rules_interval_hours',
    d: 'dashboard_rules_interval_days'
  };

  return tPlural(unitKeys[unit], value);
}

/**
 * Get next run time for a repeat rule from chrome.alarms
 * Returns formatted relative time string (e.g., "in 5 minutes")
 */
async function getNextRunTime(ruleId) {
  try {
    const alarmName = `rule-repeat:${ruleId}`;
    const alarm = await chrome.alarms.get(alarmName);

    if (!alarm || !alarm.scheduledTime) {
      return null;
    }

    const now = Date.now();
    const scheduledTime = alarm.scheduledTime;
    const diffMs = scheduledTime - now;

    // If past due (shouldn't happen, but handle it)
    if (diffMs < 0) {
      return t('dashboard_rules_nextOverdue');
    }

    // Format relative time
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return tPlural('dashboard_rules_nextIn_days', days);
    } else if (hours > 0) {
      return tPlural('dashboard_rules_nextIn_hours', hours);
    } else if (minutes > 0) {
      return tPlural('dashboard_rules_nextIn_minutes', minutes);
    } else {
      return tPlural('dashboard_rules_nextIn_seconds', seconds);
    }
  } catch (error) {
    console.error('Error getting next run time:', error);
    return null;
  }
}

function updateSampleRulesDropdown() {
  const sampleRuleItems = document.getElementById('sampleRuleItems');
  if (!sampleRuleItems) return;

  sampleRuleItems.innerHTML = '';

  // Filter out already installed samples
  const installedSampleIds = state.get('currentRules').map(r => r.originalSampleId).filter(Boolean);
  const availableSamples = state.get('sampleRules').filter(s => !installedSampleIds.includes(s.id));

  if (availableSamples.length === 0) {
    sampleRuleItems.innerHTML = `<div class="dropdown-item-text">${t('dashboard_rules_allTemplatesInstalled')}</div>`;
  } else {
    availableSamples.forEach(sample => {
      const item = document.createElement('button');
      item.className = 'dropdown-item sample-rule-item';
      item.dataset.sampleId = sample.id;
      item.innerHTML = `
        <div class="dropdown-item-content">
          <strong>${sample.name}</strong>
          <small>${sample.description}</small>
        </div>
      `;
      sampleRuleItems.appendChild(item);
    });
  }
}

// Helper to describe conditions in new format
export function getNewFormatConditionDescription(conditions) {
  const junction = conditions.all ? 'all' : conditions.any ? 'any' : 'none';
  const items = conditions[junction] || [];

  if (items.length === 0) return t('dashboard_rules_condNoConditions');

  // Build description
  const descriptions = items.map(item => {
    if (item.subject) {
      // Simple condition - map DSL subject identifiers to localized labels
      const subjectLabels = {
        url: t('dashboard_rules_subject_url'),
        title: t('dashboard_rules_subject_title'),
        domain: t('dashboard_rules_subject_domain'),
        domainCount: t('dashboard_rules_subject_domainCount'),
        origin: t('dashboard_rules_subject_origin'),
        age: t('dashboard_rules_subject_age'),
        last_access: t('dashboard_rules_subject_lastAccess'),
        pinned: t('dashboard_rules_subject_pinned'),
        audible: t('dashboard_rules_subject_audible'),
        muted: t('dashboard_rules_subject_muted'),
        group: t('dashboard_rules_subject_group'),
        group_name: t('dashboard_rules_subject_groupName'),
        window_id: t('dashboard_rules_subject_windowId'),
        duplicate: t('dashboard_rules_subject_duplicate'),
        category: t('dashboard_rules_subject_category'),
        index: t('dashboard_rules_subject_index'),
        active: t('dashboard_rules_subject_active')
      };

      const operatorLabels = {
        // Equality
        eq: t('dashboard_rules_op_eq'),
        neq: t('dashboard_rules_op_neq'),
        equals: t('dashboard_rules_op_equals'),
        // Comparison
        gt: t('dashboard_rules_op_gt'),
        gte: t('dashboard_rules_op_gte'),
        lt: t('dashboard_rules_op_lt'),
        lte: t('dashboard_rules_op_lte'),
        greater_than: t('dashboard_rules_op_greaterThan'),
        less_than: t('dashboard_rules_op_lessThan'),
        // String operations
        contains: t('dashboard_rules_op_contains'),
        notContains: t('dashboard_rules_op_notContains'),
        startsWith: t('dashboard_rules_op_startsWith'),
        endsWith: t('dashboard_rules_op_endsWith'),
        regex: t('dashboard_rules_op_regex'),
        // Array operations
        in: t('dashboard_rules_op_in'),
        nin: t('dashboard_rules_op_nin'),
        // Boolean
        is: t('dashboard_rules_op_is')
      };

      const subject = subjectLabels[item.subject] || item.subject;
      const operator = operatorLabels[item.operator] || item.operator;

      // Format value based on type
      let value = item.value;
      if (value === true) {
        value = t('dashboard_rules_valueYes');
      } else if (value === false) {
        value = t('dashboard_rules_valueNo');
      } else if (typeof value === 'number' && (item.subject === 'age' || item.subject === 'last_access')) {
        // Convert milliseconds to human-readable duration
        const seconds = value / 1000;
        const minutes = seconds / 60;
        const hours = minutes / 60;
        const days = hours / 24;

        if (days >= 1) {
          value = `${Math.floor(days)}d`;
        } else if (hours >= 1) {
          value = `${Math.floor(hours)}h`;
        } else if (minutes >= 1) {
          value = `${Math.floor(minutes)}m`;
        } else {
          value = `${Math.floor(seconds)}s`;
        }
      }

      return t('dashboard_rules_condTriple', [String(subject), String(operator), String(value)]);
    } else {
      // Nested condition group
      return `(${getNewFormatConditionDescription(item)})`;
    }
  });

  const junctionLabels = {
    all: t('dashboard_rules_junctionAll'),
    any: t('dashboard_rules_junctionAny'),
    none: t('dashboard_rules_junctionNone')
  };
  return t('dashboard_rules_condJunctionOf', [junctionLabels[junction] || junction.toUpperCase(), descriptions.join(', ')]);
}

function getConditionDescription(conditions) {
  if (!conditions) return t('dashboard_rules_condNoConditions');

  // Handle new format (when: { all: [...] })
  if (conditions.all || conditions.any || conditions.none) {
    return getNewFormatConditionDescription(conditions);
  }

  // Handle old format for backward compatibility
  let description = '';
  switch (conditions.type) {
  case 'duplicate':
    description = t('dashboard_rules_condDuplicate');
    break;
  case 'domain_count':
    description = t('dashboard_rules_condDomainCount', String(conditions.minCount));
    break;
  case 'inactive':
    description = conditions.urlPatterns && conditions.urlPatterns.length > 0
      ? t('dashboard_rules_condTabsFrom', conditions.urlPatterns.join(', '))
      : t('dashboard_rules_condAllTabs');
    break;
  case 'age_and_domain':
    description = t('dashboard_rules_condTabsFrom', conditions.domains.join(', '));
    break;
  case 'url_pattern':
    description = t('dashboard_rules_condUrlsMatching', conditions.pattern);
    break;
  case 'category':
    const categoryNames = conditions.categories ? conditions.categories.join(', ') : t('dashboard_rules_condNoneCategories');
    description = t('dashboard_rules_condSitesInCategories', categoryNames);
    break;
  default:
    return t('dashboard_rules_condUnknown');
  }

  // Add time criteria if present
  const timeParts = [];
  if (conditions.timeCriteria) {
    if (conditions.timeCriteria.inactive !== undefined) {
      timeParts.push(t('dashboard_rules_condInactiveFor', String(conditions.timeCriteria.inactive)));
    }
    if (conditions.timeCriteria.age !== undefined) {
      timeParts.push(t('dashboard_rules_condOlderThan', String(conditions.timeCriteria.age)));
    }
    if (conditions.timeCriteria.notAccessed !== undefined) {
      timeParts.push(t('dashboard_rules_condNotAccessedFor', String(conditions.timeCriteria.notAccessed)));
    }
  }

  // Handle legacy format for backward compatibility
  if (conditions.inactiveMinutes && !conditions.timeCriteria) {
    timeParts.push(t('dashboard_rules_condInactiveFor', String(conditions.inactiveMinutes)));
  }
  if (conditions.ageMinutes && !conditions.timeCriteria) {
    timeParts.push(t('dashboard_rules_condOlderThan', String(conditions.ageMinutes)));
  }
  
  if (timeParts.length > 0) {
    description += ` (${timeParts.join(', ')})`;
  }
  
  return description;
}

function getActionDescription(actions) {
  // Handle new format (array of actions)
  if (Array.isArray(actions)) {
    if (actions.length === 0) return t('dashboard_rules_actionNoActions');

    const actionDescriptions = actions.map(action => {
      const actionLabels = {
        close: t('dashboard_rules_action_close'),
        'close-duplicates': t('dashboard_rules_action_closeDuplicates'),
        group: t('dashboard_rules_action_group'),
        snooze: t('dashboard_rules_action_snooze'),
        move_to_window: t('dashboard_rules_action_moveToWindow'),
        pin: t('dashboard_rules_action_pin'),
        unpin: t('dashboard_rules_action_unpin'),
        mute: t('dashboard_rules_action_mute'),
        unmute: t('dashboard_rules_action_unmute')
      };

      let desc = actionLabels[action.type] || action.type;

      // Add parameters
      if (action.keep) desc += ` ${t('dashboard_rules_actionKeep', String(action.keep))}`;
      if (action.scope && action.scope !== 'global') desc += ` ${t('dashboard_rules_actionScope', String(action.scope))}`;
      if (action.group_by) desc += ` ${t('dashboard_rules_actionBy', String(action.group_by))}`;
      if (action.until) desc += ` ${t('dashboard_rules_actionFor', String(action.until))}`;

      return desc;
    });

    return actionDescriptions.join(', ');
  }

  // Handle old format
  switch (actions.type) {
  case 'close':
    return t('dashboard_rules_action_close');
  case 'group':
    return t('dashboard_rules_actionGroupByOld', String(actions.groupBy));
  case 'snooze':
    return t('dashboard_rules_actionSnoozeMinutesOld', String(actions.snoozeMinutes));
  case 'suspend':
    return t('dashboard_rules_actionSuspendOld', actions.excludePinned ? t('dashboard_rules_actionSuspendExcludePinned') : '');
  default:
    return t('dashboard_rules_actionUnknown');
  }
}

export function setupRulesEventListeners() {
  // Dropdown toggle
  const dropdownBtn = document.getElementById('addRuleDropdown');
  const dropdownMenu = document.getElementById('addRuleMenu');

  if (dropdownBtn && !dropdownBtn.hasListener) {
    dropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownMenu.classList.toggle('show');
    });
    dropdownBtn.hasListener = true;

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      dropdownMenu.classList.remove('show');
    });

    dropdownMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
  
  // Purge All Rules button
  const purgeBtn = document.getElementById('purgeAllRulesBtn');
  if (purgeBtn && !purgeBtn.hasListener) {
    purgeBtn.addEventListener('click', purgeAllRules);
    purgeBtn.hasListener = true;
  }

  // Add custom rule button
  const addCustomBtn = document.getElementById('addCustomRuleBtn');
  if (addCustomBtn && !addCustomBtn.hasListener) {
    addCustomBtn.addEventListener('click', () => {
      openRuleModal();
      dropdownMenu.classList.remove('show');
    });
    addCustomBtn.hasListener = true;
  }

  // Test all rules button
  const testAllBtn = document.getElementById('testAllRulesBtn');
  if (testAllBtn && !testAllBtn.hasListener) {
    testAllBtn.addEventListener('click', () => testAllRules());
    testAllBtn.hasListener = true;
  }

  // Create first rule button (in empty state) - triggers dropdown
  const createFirstBtn = document.getElementById('createFirstRuleBtn');
  if (createFirstBtn && !createFirstBtn.hasListener) {
    createFirstBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Position dropdown near the button for better UX in empty state
      const dropdownMenu = document.getElementById('addRuleMenu');
      const btnRect = createFirstBtn.getBoundingClientRect();
      dropdownMenu.style.position = 'fixed';
      dropdownMenu.style.top = `${btnRect.bottom + 8}px`;
      dropdownMenu.style.left = `${btnRect.left}px`;
      dropdownMenu.style.right = 'auto';
      dropdownMenu.classList.toggle('show');

      // Reset position when closed
      const resetPosition = () => {
        if (!dropdownMenu.classList.contains('show')) {
          dropdownMenu.style.position = '';
          dropdownMenu.style.top = '';
          dropdownMenu.style.left = '';
          dropdownMenu.style.right = '';
          document.removeEventListener('click', resetPosition);
        }
      };

      setTimeout(() => {
        document.addEventListener('click', resetPosition);
      }, 0);
    });
    createFirstBtn.hasListener = true;
  }

  // Modal buttons
  const closeModalBtn = document.getElementById('closeRuleModal');
  const cancelBtn = document.getElementById('cancelRuleBtn');
  const saveBtn = document.getElementById('saveRuleBtn');

  if (closeModalBtn && !closeModalBtn.hasListener) {
    closeModalBtn.addEventListener('click', closeRuleModal);
    closeModalBtn.hasListener = true;
  }

  if (cancelBtn && !cancelBtn.hasListener) {
    cancelBtn.addEventListener('click', closeRuleModal);
    cancelBtn.hasListener = true;
  }

  if (saveBtn && !saveBtn.hasListener) {
    saveBtn.addEventListener('click', saveRule);
    saveBtn.hasListener = true;
  }

  // Add Action button
  const addActionBtn = document.getElementById('addActionBtn');
  if (addActionBtn && !addActionBtn.hasListener) {
    addActionBtn.addEventListener('click', () => {
      const actionModal = createActionModal();
      document.body.appendChild(actionModal);
      actionModal.classList.add('show');
    });
    addActionBtn.hasListener = true;
  }

  // Actions container click handler
  const actionsContainer = document.getElementById('actionsContainer');
  if (actionsContainer && !actionsContainer.hasListener) {
    actionsContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-action')) {
        const index = parseInt(e.target.closest('.action-item').dataset.index);
        currentActions.splice(index, 1);
        updateActionsUI();
      }
    });
    actionsContainer.hasListener = true;
  }

  // Trigger type select
  const triggerSelect = document.getElementById('triggerType');
  if (triggerSelect && !triggerSelect.hasListener) {
    triggerSelect.addEventListener('change', updateTriggerParams);
    triggerSelect.hasListener = true;
  }

  // Rule card actions (use event delegation)
  const rulesList = document.getElementById('rulesList');
  if (rulesList && !rulesList.hasListener) {
    rulesList.addEventListener('click', handleRuleAction);
    rulesList.hasListener = true;
  }

  // Sample rule installations from dropdown
  const sampleRuleItems = document.getElementById('sampleRuleItems');
  if (sampleRuleItems && !sampleRuleItems.hasListener) {
    sampleRuleItems.addEventListener('click', async (e) => {
      const sampleItem = e.target.closest('.sample-rule-item');
      if (!sampleItem) return;

      const sampleId = sampleItem.dataset.sampleId;
      const sample = state.get('sampleRules').find(s => s.id === sampleId);

      if (sample) {
        await installSampleRule(sample);
        dropdownMenu.classList.remove('show');
      }
    });
    sampleRuleItems.hasListener = true;
  }

  // Quick actions
  const disableAllBtn = document.getElementById('disableAllRules');
  const enableAllBtn = document.getElementById('enableAllRules');

  if (disableAllBtn && !disableAllBtn.hasListener) {
    disableAllBtn.addEventListener('click', () => toggleAllRules(false));
    disableAllBtn.hasListener = true;
  }

  if (enableAllBtn && !enableAllBtn.hasListener) {
    enableAllBtn.addEventListener('click', () => toggleAllRules(true));
    enableAllBtn.hasListener = true;
  }

  // Event delegation for action parameter changes (CSP-compliant)
  const modal = document.getElementById('ruleModal');
  if (modal && !modal.hasActionParamListener) {
    modal.addEventListener('change', (e) => {
      const target = e.target;

      // Handle select dropdowns
      if (target.classList.contains('action-param-select')) {
        const index = parseInt(target.dataset.actionIndex);
        const param = target.dataset.param;
        window.updateActionParam(index, param, target.value);
      }

      // Handle checkboxes
      else if (target.classList.contains('action-param-checkbox')) {
        const index = parseInt(target.dataset.actionIndex);
        const param = target.dataset.param;
        window.updateActionParam(index, param, target.checked);
      }

      // Handle text inputs
      else if (target.classList.contains('action-param-input')) {
        const index = parseInt(target.dataset.actionIndex);
        const param = target.dataset.param;
        window.updateActionParam(index, param, target.value);
      }

      // Handle snooze duration value
      else if (target.classList.contains('action-param-snooze-value')) {
        const index = parseInt(target.dataset.actionIndex);
        window.updateSnoozeDuration(index, target.value);
      }

      // Handle snooze duration unit
      else if (target.classList.contains('action-param-snooze-unit')) {
        const index = parseInt(target.dataset.actionIndex);
        window.updateSnoozeDurationUnit(index, target.value);
      }
    });
    modal.hasActionParamListener = true;
  }

  // Setup drag and drop for rules
  setupRuleDragAndDrop();
}

export async function handleRuleAction(e) {
  // Handle switch toggle separately
  if (e.target.classList.contains('rule-toggle')) {
    const ruleId = e.target.dataset.ruleId;
    await toggleRule(ruleId);
    return;
  }

  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const ruleCard = btn.closest('.rule-card');
  const ruleId = ruleCard?.dataset.ruleId;

  switch (action) {
  case 'test':
    await testRule(ruleId);
    break;
  case 'run':
    await runRule(ruleId);
    break;
  case 'edit':
    const rule = state.get('currentRules').find(r => r.id === ruleId);
    openRuleModal(rule);
    break;
  case 'delete':
    if (confirm(t('dashboard_rules_confirmDelete'))) {
      await deleteRule(ruleId);
    }
    break;
  }
}

export async function installSampleRule(sample) {
  const newRule = {
    ...sample,
    id: `rule_${Date.now()}`,
    originalSampleId: sample.id,
    enabled: true, // Enable by default when installing
    createdAt: Date.now()
  };

  // Add to current rules
  const rules = state.get('currentRules');
  rules.push(newRule);
  state.set('currentRules', rules);

  // Save to background
  await sendMessage({
    action: 'updateRules',
    rules: rules
  });

  // Update UI
  updateRulesUI();
  showNotification(t('dashboard_rules_templateInstalled'), 'success');
}

// Store the conditions builder instance
let conditionsBuilder = null;
let currentActions = [];

export function openRuleModal(rule = null) {
  const modal = document.getElementById('ruleModal');
  const modalTitle = document.getElementById('ruleModalTitle');

  // Update modal title
  modalTitle.textContent = rule ? t('dashboard_rules_modalTitleEdit') : t('dashboard_rules_modalTitleCreate');

  // Store editing state
  state.set('editingRuleId', rule?.id || null);
  state.set('editingRule', rule);

  // Reset form elements
  document.getElementById('ruleName').value = rule?.name || '';
  document.getElementById('ruleEnabled').checked = rule ? rule.enabled : true;
  
  // Initialize conditions builder
  const conditionsContainer = document.getElementById('conditionsContainer');
  
  // Convert old format to new format if needed
  let conditions = { all: [] };
  if (rule?.when) {
    // Check if this is in predicate format (has strings as values in arrays)
    const isPredicateFormat = (obj) => {
      if (!obj || typeof obj !== 'object') return false;
      // Check for predicate operators like 'eq', 'gt', 'contains', etc.
      const predicateOps = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'not_contains',
        'starts_with', 'ends_with', 'regex', 'not_regex', 'in', 'not_in', 'is'];
      return Object.keys(obj).some(key => predicateOps.includes(key));
    };

    // If it's in predicate format, convert to UI format (not supported yet, use empty conditions)
    if (isPredicateFormat(rule.when) ||
        (rule.when.all && Array.isArray(rule.when.all) && rule.when.all.some(item => typeof item === 'string' || isPredicateFormat(item)))) {
      console.warn('Rule uses predicate format conditions which cannot be edited in UI yet:', rule.when);
      conditions = { all: [] }; // Start fresh for UI editing
    } else {
      conditions = rule.when;
    }
  } else if (rule?.conditions) {
    // Convert old conditions format to new format
    conditions = convertOldConditionsToNew(rule.conditions);
  }
  
  // Create new conditions builder instance
  if (conditionsBuilder) {
    conditionsBuilder = null;
  }
  
  conditionsBuilder = new ConditionsBuilder(conditionsContainer, conditions, {
    previewSelector: '#conditionPreview',
    onChange: (newConditions) => {
      console.log('Conditions changed:', newConditions);
    }
  });
  
  // Initialize actions
  currentActions = [];
  if (rule?.then) {
    currentActions = Array.isArray(rule.then) ? rule.then : [rule.then];
  } else if (rule?.actions) {
    // Convert old actions format to new format
    currentActions = [convertOldActionToNew(rule.actions)];
  }
  updateActionsUI();
  
  // Initialize trigger
  const triggerType = document.getElementById('triggerType');
  if (rule?.trigger) {
    switch (rule.trigger.type) {
    case 'immediate':
      triggerType.value = 'immediate';
      break;
    case 'repeat':
      triggerType.value = 'repeat';
      break;
    case 'once':
      triggerType.value = 'once';
      break;
    default:
      triggerType.value = 'manual';
    }
  } else {
    triggerType.value = 'immediate';
  }
  updateTriggerParams();

  // Populate trigger-specific values after updateTriggerParams creates the inputs
  if (rule?.trigger) {
    if (rule.trigger.type === 'immediate') {
      // Set debounce checkbox
      const debounceCheckbox = document.getElementById('debounce');
      if (debounceCheckbox) {
        debounceCheckbox.checked = rule.trigger.debounce ?? true;
      }
      // Set debounce duration
      const debounceDurationInput = document.getElementById('debounceDuration');
      if (debounceDurationInput && rule.trigger.debounceDuration) {
        debounceDurationInput.value = rule.trigger.debounceDuration;
      }
    } else if (rule.trigger.type === 'repeat') {
      // Parse and populate interval and unit for repeat triggers
      const interval = rule.trigger.repeat_every || rule.trigger.every;
      if (interval) {
        const match = interval.match(/^(\d+)([smhd])$/);
        if (match) {
          const repeatIntervalInput = document.getElementById('repeatInterval');
          const repeatUnitSelect = document.getElementById('repeatUnit');
          if (repeatIntervalInput) repeatIntervalInput.value = match[1];
          if (repeatUnitSelect) repeatUnitSelect.value = match[2];
        }
      }
    } else if (rule.trigger.type === 'once') {
      // Populate datetime for once triggers
      const at = rule.trigger.once_at || rule.trigger.at;
      if (at) {
        const onceAtInput = document.getElementById('onceAt');
        if (onceAtInput) {
          // Convert to datetime-local format (YYYY-MM-DDTHH:mm)
          const date = new Date(at);
          const dateStr = date.toISOString().slice(0, 16);
          onceAtInput.value = dateStr;
        }
      }
    }
  }

  // Show modal
  modal.classList.add('show');
}

// Convert old conditions format to new Rules Engine 2.0 format
function convertOldConditionsToNew(oldConditions) {
  if (!oldConditions) return { all: [] };
  
  const conditions = [];
  
  switch (oldConditions.type) {
  case 'duplicate':
    conditions.push({ subject: 'duplicate', operator: 'eq', value: true });
    break;

  case 'domain_count':
    if (oldConditions.minCount) {
      conditions.push({ subject: 'tab_count', operator: 'gte', value: oldConditions.minCount });
    }
    break;
      
  case 'inactive':
    if (oldConditions.urlPatterns) {
      conditions.push({
        any: oldConditions.urlPatterns.map(pattern => ({
          subject: 'domain', operator: 'contains', value: pattern
        }))
      });
    }
    if (oldConditions.timeCriteria?.inactive) {
      conditions.push({
        subject: 'last_access',
        operator: 'gt',
        value: `${oldConditions.timeCriteria.inactive}m`
      });
    }
    break;
      
  case 'url_pattern':
    if (oldConditions.pattern) {
      conditions.push({ subject: 'url', operator: 'regex', value: oldConditions.pattern });
    }
    break;
      
  case 'age_and_domain':
    if (oldConditions.domains) {
      conditions.push({
        any: oldConditions.domains.map(domain => ({
          subject: 'domain', operator: 'eq', value: domain
        }))
      });
    }
    break;
      
  case 'category':
    if (oldConditions.categories) {
      conditions.push({ subject: 'category', operator: 'in', value: oldConditions.categories });
    }
    break;
  }
  
  // Add time criteria
  if (oldConditions.timeCriteria) {
    if (oldConditions.timeCriteria.age) {
      conditions.push({
        subject: 'age',
        operator: 'gt',
        value: `${oldConditions.timeCriteria.age}m`
      });
    }
    if (oldConditions.timeCriteria.notAccessed) {
      conditions.push({
        subject: 'last_access',
        operator: 'gt',
        value: `${oldConditions.timeCriteria.notAccessed}m`
      });
    }
  }
  
  return conditions.length > 0 ? { all: conditions } : { all: [] };
}

// Convert old action format to new format
function convertOldActionToNew(oldAction) {
  if (!oldAction) return { type: 'close' };
  
  const action = { type: oldAction.type };
  
  switch (oldAction.type) {
  case 'close':
    break;
  case 'group':
    action.group_by = oldAction.groupBy || 'domain';
    break;
  case 'snooze':
    action.until = `${oldAction.snoozeMinutes || 60}m`;
    break;
  case 'suspend':
    if (oldAction.excludePinned) action.exclude_pinned = true;
    break;
  }
  
  return action;
}

// Update actions UI
function updateActionsUI() {
  const container = document.getElementById('actionsContainer');
  container.innerHTML = '';
  
  // Check for validation issues
  const validation = validateActionList(currentActions);
  
  // Update container class based on whether we have actions
  if (currentActions.length > 0) {
    container.classList.add('has-actions');
  } else {
    container.classList.remove('has-actions');
  }
  
  currentActions.forEach((action, index) => {
    const actionEl = createActionElement(action, index);
    container.appendChild(actionEl);
  });
  
  if (currentActions.length === 0) {
    container.innerHTML = `<p class="text-muted">${t('dashboard_rules_noActionsDefined')}</p>`;
  } else if (!validation.valid) {
    // Add warning about incompatible actions
    const warning = document.createElement('div');
    warning.className = 'compatibility-warning';
    warning.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 22h20L12 2z M12 8v6 M12 18h.01"/>
      </svg>
      <span>${validation.errors[0]}</span>
    `;
    container.appendChild(warning);
  }
  
  // Update Add Action button state
  const addActionBtn = document.getElementById('addActionBtn');
  if (addActionBtn) {
    const compatibleActions = getCompatibleActions(currentActions);
    addActionBtn.disabled = compatibleActions.length === 0;
    if (compatibleActions.length === 0) {
      addActionBtn.title = currentActions.some(a => a.type === 'close')
        ? t('dashboard_rules_closeNotCombinable')
        : t('dashboard_rules_noMoreCompatible');
    } else {
      addActionBtn.title = '';
    }
  }
}

// Create action element
function createActionElement(action, index) {
  const div = document.createElement('div');
  div.className = 'action-item';
  div.dataset.index = index;
  
  const actionLabels = {
    close: t('dashboard_rules_action_close'),
    'close-duplicates': t('dashboard_rules_action_closeDuplicates'),
    group: t('dashboard_rules_action_group'),
    snooze: t('dashboard_rules_action_snooze'),
    move_to_window: t('dashboard_rules_action_moveToWindow'),
    pin: t('dashboard_rules_action_pin'),
    unpin: t('dashboard_rules_action_unpin'),
    mute: t('dashboard_rules_action_mute'),
    unmute: t('dashboard_rules_action_unmute')
  };

  div.innerHTML = `
    <div class="action-header">
      <span class="action-number">${index + 1}.</span>
      <span class="action-type">${actionLabels[action.type] || action.type}</span>
      <button class="btn-icon remove-action" title="${t('dashboard_rules_removeAction')}">×</button>
    </div>
    <div class="action-params">
      ${getActionParamsHTML(action)}
    </div>
  `;
  
  return div;
}

// Get action parameters HTML
function getActionParamsHTML(action) {
  switch (action.type) {
  case 'close':
    return ''; // No parameters needed for close action

  case 'close-duplicates':
    return `
        <label>${t('dashboard_rules_paramKeep')}
          <select data-action-index="${currentActions.indexOf(action)}" data-param="keep" class="action-param-select">
            <option value="oldest" ${!action.keep || action.keep === 'oldest' ? 'selected' : ''}>${t('dashboard_rules_paramKeepOldest')}</option>
            <option value="newest" ${action.keep === 'newest' ? 'selected' : ''}>${t('dashboard_rules_paramKeepNewest')}</option>
            <option value="none" ${action.keep === 'none' ? 'selected' : ''}>${t('dashboard_rules_paramKeepNone')}</option>
          </select>
        </label>
        <label>${t('dashboard_rules_paramScope')}
          <select data-action-index="${currentActions.indexOf(action)}" data-param="scope" class="action-param-select">
            <option value="global" ${!action.scope || action.scope === 'global' ? 'selected' : ''}>${t('dashboard_rules_paramScopeGlobal')}</option>
            <option value="per-window" ${action.scope === 'per-window' ? 'selected' : ''}>${t('dashboard_rules_paramScopePerWindow')}</option>
          </select>
        </label>
      `;

  case 'group':
    return `
        <label>${t('dashboard_rules_paramGroupBy')}
          <select data-action-index="${currentActions.indexOf(action)}" data-param="group_by" class="action-param-select">
            <option value="domain" ${action.group_by === 'domain' ? 'selected' : ''}>${t('dashboard_rules_paramGroupByDomain')}</option>
            <option value="category" ${action.group_by === 'category' ? 'selected' : ''}>${t('dashboard_rules_paramGroupByCategory')}</option>
            <option value="window" ${action.group_by === 'window' ? 'selected' : ''}>${t('dashboard_rules_paramGroupByWindow')}</option>
          </select>
        </label>
        <label>${t('dashboard_rules_paramName')}
          <input type="text" value="${action.name || ''}" placeholder="${t('dashboard_rules_paramNamePlaceholder')}"
            data-action-index="${currentActions.indexOf(action)}" data-param="name" class="action-param-input">
        </label>
      `;

  case 'snooze':
    const duration = parseDuration(action.until || '1h');
    return `
        <label>${t('dashboard_rules_paramSnoozeFor')}
          <input type="number" value="${duration.value}" min="1"
            data-action-index="${currentActions.indexOf(action)}" data-param="snooze-value" class="action-param-snooze-value">
          <select data-action-index="${currentActions.indexOf(action)}" data-param="snooze-unit" class="action-param-snooze-unit">
            <option value="m" ${duration.unit === 'm' ? 'selected' : ''}>${t('dashboard_rules_paramUnitMinutes')}</option>
            <option value="h" ${duration.unit === 'h' ? 'selected' : ''}>${t('dashboard_rules_paramUnitHours')}</option>
            <option value="d" ${duration.unit === 'd' ? 'selected' : ''}>${t('dashboard_rules_paramUnitDays')}</option>
          </select>
        </label>
      `;

  case 'move_to_window':
    return `
        <label>${t('dashboard_rules_paramTargetWindow')}
          <select data-action-index="${currentActions.indexOf(action)}" data-param="window_id" class="action-param-select">
            <option value="new">${t('dashboard_rules_paramTargetNew')}</option>
            <option value="current" ${action.window_id === 'current' ? 'selected' : ''}>${t('dashboard_rules_paramTargetCurrent')}</option>
          </select>
        </label>
      `;
      
  default:
    return '';
  }
}

// Parse duration string
function parseDuration(duration) {
  const match = duration.match(/^(\d+)([mhd])$/);
  if (match) {
    return { value: parseInt(match[1]), unit: match[2] };
  }
  return { value: 1, unit: 'h' };
}

// Update action parameter
window.updateActionParam = function(index, param, value) {
  if (currentActions[index]) {
    currentActions[index][param] = value;
  }
};

// Update snooze duration
window.updateSnoozeDuration = function(index, value) {
  if (currentActions[index]) {
    const duration = parseDuration(currentActions[index].until || '1h');
    currentActions[index].until = `${value}${duration.unit}`;
  }
};

// Update snooze duration unit
window.updateSnoozeDurationUnit = function(index, unit) {
  if (currentActions[index]) {
    const duration = parseDuration(currentActions[index].until || '1h');
    currentActions[index].until = `${duration.value}${unit}`;
  }
};

// Update trigger parameters
function updateTriggerParams() {
  const triggerType = document.getElementById('triggerType').value;
  const paramsContainer = document.getElementById('triggerParams');
  
  paramsContainer.innerHTML = '';
  
  switch (triggerType) {
  case 'repeat':
    paramsContainer.innerHTML = `
        <label>${t('dashboard_rules_triggerRepeatEvery')}
          <input type="number" id="repeatInterval" min="1" value="30">
          <select id="repeatUnit">
            <option value="m">${t('dashboard_rules_paramUnitMinutes')}</option>
            <option value="h">${t('dashboard_rules_paramUnitHours')}</option>
            <option value="d">${t('dashboard_rules_paramUnitDays')}</option>
          </select>
        </label>
      `;
    break;

  case 'once':
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 16);
    paramsContainer.innerHTML = `
        <label>${t('dashboard_rules_triggerRunAt')}
          <input type="datetime-local" id="onceAt" value="${dateStr}" min="${dateStr}">
        </label>
      `;
    break;

  case 'immediate':
    paramsContainer.innerHTML = `
        <label class="checkbox-with-help">
          <input type="checkbox" id="debounce" checked>
          <span>${t('dashboard_rules_triggerDebounce')}</span>
          <span class="help-tooltip" title="${t('dashboard_rules_triggerDebounceHelp')}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M9.5 9a3 3 0 0 1 5 0c0 2-3 3-3 3"></path>
              <circle cx="12" cy="17" r="1"></circle>
            </svg>
          </span>
        </label>
        <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px;">
          <label for="debounceDuration" style="font-size: 13px;">${t('dashboard_rules_triggerWaitFor')}</label>
          <input type="number" id="debounceDuration" value="2" min="0.1" max="60" step="0.1" style="width: 60px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px;">
          <span style="font-size: 13px; color: #666;">${t('dashboard_rules_triggerSeconds')}</span>
        </div>
      `;
    break;
  }
}

// Create action modal
function createActionModal() {
  // Get compatible actions based on current actions
  const compatibleActions = getCompatibleActions(currentActions);
  
  const modal = document.createElement('div');
  modal.className = 'modal action-modal';
  
  // If no compatible actions, show message
  if (compatibleActions.length === 0) {
    modal.innerHTML = `
      <div class="modal-content modal-sm">
        <div class="modal-header">
          <h3>${t('dashboard_rules_addAction')}</h3>
          <button class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <p class="text-muted">${t('dashboard_rules_noMoreActions')}</p>
          ${currentActions.some(a => a.type === 'close') ? `<p class="text-muted">${t('dashboard_rules_closeNotCombinableNote', `<strong>${t('dashboard_rules_noteLabel')}</strong>`)}</p>` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary close-action">${t('common_close')}</button>
        </div>
      </div>
    `;
    
    modal.querySelector('.close-action').addEventListener('click', () => {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 300);
    });
    
    modal.querySelector('.close-btn').addEventListener('click', () => {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 300);
    });
    
    return modal;
  }
  
  const actionLabels = {
    close: t('dashboard_rules_action_close'),
    'close-duplicates': t('dashboard_rules_action_closeDuplicates'),
    group: t('dashboard_rules_action_group'),
    snooze: t('dashboard_rules_action_snooze'),
    move_to_window: t('dashboard_rules_action_moveToWindow'),
    pin: t('dashboard_rules_action_pin'),
    unpin: t('dashboard_rules_action_unpin'),
    mute: t('dashboard_rules_action_mute'),
    unmute: t('dashboard_rules_action_unmute')
  };

  // Build options for compatible actions
  const optionsHTML = compatibleActions
    .map(action => `<option value="${action}">${actionLabels[action] || action}</option>`)
    .join('');

  modal.innerHTML = `
    <div class="modal-content modal-sm">
      <div class="modal-header">
        <h3>${t('dashboard_rules_addAction')}</h3>
        <button class="close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <label>${t('dashboard_rules_actionType')}</label>
        <select id="newActionType" class="form-select">
          ${optionsHTML}
        </select>
        ${currentActions.length > 0 ? `<p class="text-muted" style="margin-top: 10px; font-size: 13px;">${t('dashboard_rules_onlyCompatible')}</p>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary cancel-action">${t('common_cancel')}</button>
        <button class="btn btn-primary add-action-confirm">${t('dashboard_rules_addAction')}</button>
      </div>
    </div>
  `;
  
  // Event listeners
  modal.querySelector('.close-btn').addEventListener('click', () => {
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 300);
  });
  
  modal.querySelector('.cancel-action').addEventListener('click', () => {
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 300);
  });
  
  modal.querySelector('.add-action-confirm').addEventListener('click', () => {
    const type = modal.querySelector('#newActionType').value;
    const action = { type };
    
    // Add default parameters based on type
    switch (type) {
    case 'snooze':
      action.until = '1h';
      break;
    case 'group':
      action.group_by = 'domain';
      break;
    case 'close-duplicates':
      action.keep = 'oldest';
      action.scope = 'global'; // Default to global scope
      break;
    }
    
    currentActions.push(action);
    updateActionsUI();
    
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 300);
  });
  
  return modal;
}

export function closeRuleModal() {
  const modal = document.getElementById('ruleModal');
  modal.classList.remove('show');
  state.set('editingRuleId', null);
  state.set('editingRule', null);
  
  // Clean up conditions builder
  if (conditionsBuilder) {
    conditionsBuilder = null;
  }
  
  // Reset actions
  currentActions = [];
}


export async function saveRule() {
  const editingId = state.get('editingRuleId');
  
  // Get form values
  const name = document.getElementById('ruleName').value.trim();
  
  if (!name) {
    alert(t('dashboard_rules_enterName'));
    return;
  }

  // Validate conditions
  if (!conditionsBuilder) {
    alert(t('dashboard_rules_conditionsNotInit'));
    return;
  }

  const conditions = conditionsBuilder.getConditions();
  const validation = conditionsBuilder.validate();
  if (!validation.valid) {
    alert(t('dashboard_rules_invalidConditions', validation.error));
    return;
  }

  // Validate actions
  if (currentActions.length === 0) {
    alert(t('dashboard_rules_addAtLeastOneAction'));
    return;
  }

  // Validate action compatibility
  const actionValidation = validateActionList(currentActions);
  if (!actionValidation.valid) {
    alert(t('dashboard_rules_invalidActions', actionValidation.errors.join(', ')));
    return;
  }
  
  // Sort actions by priority for optimal execution
  const sortedActions = sortActionsByPriority(currentActions);
  
  // Build trigger
  const triggerType = document.getElementById('triggerType').value;
  let trigger = { type: 'manual' };
  
  switch (triggerType) {
  case 'immediate':
    const debounceEnabled = document.getElementById('debounce')?.checked ?? true;
    const debounceDuration = parseFloat(document.getElementById('debounceDuration')?.value || '2');
    trigger = {
      type: 'immediate',
      debounce: debounceEnabled,
      debounceDuration: debounceDuration
    };
    break;

  case 'repeat':
    const interval = document.getElementById('repeatInterval')?.value || '30';
    const unit = document.getElementById('repeatUnit')?.value || 'm';
    trigger = {
      type: 'repeat',
      repeat_every: `${interval}${unit}`  // Use repeat_every (scheduler expects this)
    };
    break;

  case 'once':
    const dateTime = document.getElementById('onceAt')?.value;
    if (dateTime) {
      trigger = {
        type: 'once',
        once_at: new Date(dateTime).toISOString()  // Use once_at (scheduler expects this)
      };
    }
    break;
  }
  
  // Build complete rule in new format
  const rule = {
    id: editingId || `rule_${Date.now()}`,
    name: name,
    enabled: document.getElementById('ruleEnabled').checked,
    when: conditions,
    then: sortedActions,
    trigger: trigger,
    priority: 999, // Will be updated based on position
    createdAt: editingId ? state.get('editingRule')?.createdAt : Date.now(),
    updatedAt: Date.now()
  };
  
  
  // Update existing or create new rule
  const rules = state.get('currentRules');
  
  if (editingId) {
    // Update existing rule
    const index = rules.findIndex(r => r.id === editingId);
    if (index >= 0) {
      rules[index] = {
        ...rule,
        priority: rules[index].priority // Keep existing priority
      };
    }
  } else {
    // Create new rule with correct priority
    rule.priority = rules.length + 1;
    rules.push(rule);
  }
  
  // Save rules
  state.set('currentRules', rules);
  await sendMessage({
    action: 'updateRules',
    rules: rules
  });
  
  // Close modal and update UI
  closeRuleModal();
  updateRulesUI();
  showNotification(editingId ? t('dashboard_rules_updated') : t('dashboard_rules_created'), 'success');
}


export async function toggleRule(ruleId) {
  const rules = state.get('currentRules');
  const rule = rules.find(r => r.id === ruleId);
  
  if (rule) {
    rule.enabled = !rule.enabled;
    await sendMessage({
      action: 'updateRules',
      rules: rules
    });
    updateRulesUI();
  }
}

export async function deleteRule(ruleId) {
  let rules = state.get('currentRules');
  rules = rules.filter(r => r.id !== ruleId);
  
  state.set('currentRules', rules);
  await sendMessage({
    action: 'updateRules',
    rules: rules
  });
  
  updateRulesUI();
  showNotification(t('dashboard_rules_deleted'), 'success');
}

// Purge all rules
async function purgeAllRules() {
  const confirmMsg = t('dashboard_rules_confirmPurge');
  if (!confirm(confirmMsg)) {
    return;
  }
  
  try {
    // Get all rules
    const rules = state.get('currentRules') || [];
    
    // Delete each rule
    for (const rule of rules) {
      await sendMessage({ action: 'deleteRule', ruleId: rule.id });
    }
    
    // Clear storage directly as well to be sure
    await chrome.storage.local.set({ rules: [] });
    
    // Clear local state
    state.set('currentRules', []);
    
    showNotification(t('dashboard_rules_purged'), 'success');
    updateRulesUI();
  } catch (error) {
    console.error('Failed to purge rules:', error);
    showNotification(t('dashboard_rules_purgeFailed'), 'error');
  }
}

export async function toggleAllRules(enabled) {
  const rules = state.get('currentRules');
  rules.forEach(rule => rule.enabled = enabled);
  
  state.set('currentRules', rules);
  await sendMessage({
    action: 'updateRules',
    rules: rules
  });
  
  updateRulesUI();
  showNotification(enabled ? t('dashboard_rules_allEnabled') : t('dashboard_rules_allDisabled'), 'success');
}

export async function runRule(ruleId) {
  const rule = state.get('currentRules').find(r => r.id === ruleId);
  if (!rule) return;

  const btn = document.querySelector(`[data-rule-id="${ruleId}"] button[data-action="run"]`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<svg class="spinner" width="16" height="16" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5"></circle></svg>';
  }

  try {
    const result = await sendMessage({
      action: 'executeRule',
      ruleId: ruleId
    });

    if (result.success) {
      // Format detailed action message
      const actionMessage = formatActionCounts(result.actionCounts);
      const notificationType = result.actionCount > 0 ? 'success' : 'info';

      showNotification(
        t('dashboard_rules_ruleExecuted', actionMessage),
        notificationType
      );
    } else {
      showNotification(t('dashboard_rules_ruleExecutionFailed', result.error), 'error');
    }
  } catch (error) {
    showNotification(t('dashboard_rules_ruleExecutionError', error.message), 'error');
  } finally {
    // Always restore button state
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    }
  }
}

export async function testRule(ruleId) {
  const rule = state.get('currentRules').find(r => r.id === ruleId);
  if (!rule) return;
  
  const btn = document.querySelector(`[data-rule-id="${ruleId}"] button[data-action="test"]`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<svg class="spinner" width="16" height="16" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5"></circle></svg>';
  }
  
  try {
    const result = await sendMessage({
      action: 'previewRule',
      ruleId: ruleId
    });
    
    console.log('Preview result:', result);
    
    // Handle both old and new response formats
    if (result.success) {
      // New format
      const count = result.affectedCount;
      const notificationType = count > 0 ? 'success' : 'info';
      const message = count > 0
        ? tPlural('dashboard_rules_previewAffected', count)
        : t('dashboard_rules_previewNoMatch');

      showNotification(message, notificationType);

      if (result.affectedTabs && result.affectedTabs.length > 0) {
        console.log('Affected tabs:', result.affectedTabs);
        // Pass the rule from the result if available, otherwise use the original
        showTestResultsModal(result.affectedTabs, result.rule || rule);
      }
    } else if (result.matchingTabs !== undefined) {
      // Old format from background.js
      const count = result.matchingTabs.length;
      const notificationType = count > 0 ? 'success' : 'info';
      const message = count > 0
        ? tPlural('dashboard_rules_previewAffected', count)
        : t('dashboard_rules_previewNoMatch');

      showNotification(message, notificationType);

      if (count > 0) {
        console.log('Matching tabs:', result.matchingTabs);
      }
    } else if (result.error) {
      showNotification(t('dashboard_rules_testFailed', result.error), 'error');
    } else {
      // Unexpected format
      console.error('Unexpected preview result format:', result);
      showNotification(t('dashboard_rules_unableToPreview'), 'error');
    }
  } catch (error) {
    showNotification(t('dashboard_rules_testError', error.message), 'error');
  }

  // Restore button to preview/eye icon
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  }
}

export async function testAllRules() {
  const enabledRules = state.get('currentRules').filter(r => r.enabled);
  if (enabledRules.length === 0) {
    showNotification(t('dashboard_rules_noEnabledToTest'), 'info');
    return;
  }

  const btn = document.getElementById('testAllRulesBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<svg class="spinner" width="16" height="16" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5"></circle></svg> ${t('dashboard_rules_testing')}`;
  }
  
  let totalAffected = 0;
  const results = [];
  
  for (const rule of enabledRules) {
    try {
      const result = await sendMessage({
        action: 'previewRule',
        ruleId: rule.id
      });
      
      if (result.success) {
        totalAffected += result.affectedCount;
        if (result.affectedCount > 0) {
          results.push(`${rule.name}: ${result.affectedCount} tab(s)`);
        }
      }
    } catch (error) {
      console.error(`Error testing rule ${rule.name}:`, error);
    }
  }
  
  // Show results
  if (totalAffected > 0) {
    showNotification(
      tPlural('dashboard_rules_testCompleteAffected', totalAffected),
      'info'
    );
    console.log('Test results by rule:', results);
  } else {
    showNotification(t('dashboard_rules_testNoneAffected'), 'info');
  }
  
  // Restore button
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = t('dashboard_rules_testAll');
  }
}

export function setupRuleDragAndDrop() {
  let draggedElement = null;
  let placeholder = null;

  const rulesList = document.getElementById('rulesList');
  if (!rulesList || rulesList.hasDragHandler) return;

  rulesList.hasDragHandler = true;

  // Create placeholder element
  placeholder = document.createElement('div');
  placeholder.className = 'rule-card-placeholder';

  // Enable dragging only when mousedown on handle
  rulesList.addEventListener('mousedown', (e) => {
    const handle = e.target.closest('.rule-drag-handle');
    if (handle) {
      const card = handle.closest('.rule-card');
      if (card) {
        card.draggable = true;
      }
    }
  });

  // Disable dragging on mouseup
  rulesList.addEventListener('mouseup', (e) => {
    const cards = rulesList.querySelectorAll('.rule-card');
    cards.forEach(card => {
      card.draggable = false;
    });
  });
  
  rulesList.addEventListener('dragstart', (e) => {
    const ruleCard = e.target.closest('.rule-card');
    if (!ruleCard) return;

    draggedElement = ruleCard;
    ruleCard.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // Firefox requires this
  });
  
  rulesList.addEventListener('dragend', (e) => {
    if (draggedElement) {
      draggedElement.classList.remove('dragging');
      draggedElement = null;
    }
    if (placeholder.parentNode) {
      placeholder.parentNode.removeChild(placeholder);
    }
  });
  
  rulesList.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!draggedElement) return;
    
    const afterElement = getDragAfterElement(rulesList, e.clientY);
    
    if (afterElement == null) {
      rulesList.appendChild(placeholder);
    } else {
      rulesList.insertBefore(placeholder, afterElement);
    }
  });
  
  rulesList.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (!draggedElement) return;
    
    // Insert dragged element where placeholder is
    if (placeholder.parentNode) {
      placeholder.parentNode.insertBefore(draggedElement, placeholder);
      placeholder.parentNode.removeChild(placeholder);
    }
    
    // Update priorities based on new order
    await updateRulePriorities();
  });
  
  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.rule-card:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }
}

export async function updateRulePriorities() {
  const ruleCards = document.querySelectorAll('.rule-card');
  const rules = state.get('currentRules');
  
  // Update priorities based on visual order
  ruleCards.forEach((card, index) => {
    const ruleId = card.dataset.ruleId;
    const rule = rules.find(r => r.id === ruleId);
    if (rule) {
      rule.priority = index + 1;
    }
  });
  
  // Save updated rules
  state.set('currentRules', rules);
  await sendMessage({
    action: 'updateRules',
    rules: rules
  });
  
  showNotification(t('dashboard_rules_prioritiesUpdated'), 'success');
}

// Helper functions
async function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

// Show test results in a modal
function showTestResultsModal(tabs, rule) {
  // Remove any existing modal
  const existingModal = document.getElementById('testResultsModal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // Create modal HTML
  const modal = document.createElement('div');
  modal.id = 'testResultsModal';
  modal.className = 'modal-overlay';
  modal.style.cssText = 'display: flex; align-items: center; justify-content: center; z-index: 10000;';
  
  // Import escapeHtml if not available
  const escapeHtml = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };
  
  // Create a default icon as base64 to avoid escaping issues
  const defaultIcon = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>');
  
  const tabsList = tabs.map(tab => {
    const iconUrl = tab.favIconUrl || defaultIcon;
    return `
      <div style="padding: 10px; border-bottom: 1px solid #e0e0e0; display: flex; align-items: center; gap: 10px;">
        <img src="${iconUrl}"
             style="width: 16px; height: 16px; flex-shrink: 0;"
             class="rule-preview-favicon">
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(tab.title || t('dashboard_rules_untitled'))}</div>
          <div style="font-size: 12px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(tab.url)}</div>
          ${tab.isDupe ? `<span style="font-size: 11px; color: #dc3545; font-weight: 500;">${t('dashboard_rules_duplicateTag')}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px; max-height: 80vh; display: flex; flex-direction: column;">
      <div class="modal-header">
        <h2>${t('dashboard_rules_testResultsTitle', escapeHtml(rule.name))}</h2>
        <button class="modal-close" id="testResultsCloseBtn">&times;</button>
      </div>
      <div class="modal-body" style="padding: 0; flex: 1; overflow-y: auto;">
        <div style="padding: 16px; background: #f8f9fa; border-bottom: 1px solid #e0e0e0;">
          <strong>${tPlural('dashboard_rules_wouldBeAffected', tabs.length)}</strong>
        </div>
        <div>
          ${tabsList}
        </div>
      </div>
      <div class="modal-footer" style="padding: 16px; display: flex; gap: 10px; justify-content: flex-end;">
        <button class="btn btn-secondary" id="testResultsCancelBtn">${t('common_close')}</button>
        <button class="btn btn-primary" id="testResultsExecuteBtn" data-rule-id="${rule.id}">${t('dashboard_rules_executeRule')}</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);

  // Add favicon error handler (CSP-compliant)
  modal.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG' && e.target.classList.contains('rule-preview-favicon')) {
      e.target.style.display = 'none';
    }
  }, { capture: true });

  // Add event listeners properly
  document.getElementById('testResultsCloseBtn').addEventListener('click', () => {
    modal.remove();
  });
  
  document.getElementById('testResultsCancelBtn').addEventListener('click', () => {
    modal.remove();
  });
  
  document.getElementById('testResultsExecuteBtn').addEventListener('click', (e) => {
    const ruleId = e.target.dataset.ruleId;
    modal.remove();
    window.executeRuleFromTest(ruleId);
  });
  
  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
  
  // Close on escape
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

// Make executeRule available globally for the modal
window.executeRuleFromTest = async (ruleId) => {
  console.log('Executing rule:', ruleId);
  const result = await sendMessage({ action: 'executeRule', ruleId });
  console.log('Execute result:', JSON.stringify(result, null, 2));
  if (result.success) {
    showNotification(t('dashboard_rules_ruleExecutedActions', String(result.actionCount || 0)), 'success');
    // Add a small delay before refreshing to allow tabs to close
    setTimeout(async () => {
      await loadRulesView();
    }, 500);
  } else {
    showNotification(t('dashboard_rules_executeFailed', result.error), 'error');
  }
};

// Rule format conversion helpers
function convertRuleToNewFormat(oldRule) {
  // Convert old rule format to Rules Engine 2.0 format
  const newRule = {
    name: oldRule.name,
    enabled: oldRule.enabled,
    when: null,
    then: [],
    trigger: {},
    flags: {}
  };

  // Convert conditions
  if (oldRule.conditions) {
    newRule.when = convertConditionsToNew(oldRule.conditions);
  }

  // Convert actions
  if (oldRule.actions) {
    newRule.then = [convertActionsToNew(oldRule.actions)];
  }

  // Convert trigger
  if (oldRule.trigger) {
    if (oldRule.trigger.type === 'event') {
      newRule.trigger.immediate = true;
    } else if (oldRule.trigger.type === 'periodic') {
      newRule.trigger.repeat_every = `${oldRule.trigger.interval}m`;
    }
  }

  return newRule;
}

function convertConditionsToNew(conditions) {
  const type = conditions.type;
  const result = { all: [] };

  switch (type) {
  case 'duplicate':
    return { is: ['tab.isDupe', true] };
    
  case 'domain_count':
    return { gte: ['tab.countPerOrigin:domain', conditions.minCount || 3] };
    
  case 'inactive':
    if (conditions.urlPatterns && conditions.urlPatterns.length > 0) {
      result.all.push({ in: ['tab.domain', conditions.urlPatterns] });
    }
    if (conditions.timeCriteria?.inactive) {
      result.all.push({ gte: ['tab.age', `${conditions.timeCriteria.inactive}m`] });
    }
    break;
    
  case 'url_pattern':
    return { regex: ['tab.url', conditions.pattern] };
    
  case 'category':
    return { in: ['tab.category', conditions.categories || []] };
    
  case 'age_and_domain':
    if (conditions.domains) {
      result.all.push({ in: ['tab.domain', conditions.domains] });
    }
    if (conditions.timeCriteria?.inactive) {
      result.all.push({ gte: ['tab.age', `${conditions.timeCriteria.inactive}m`] });
    }
    break;
  }

  return result.all.length === 1 ? result.all[0] : result;
}

function convertActionsToNew(actions) {
  const result = { action: actions.type };

  switch (actions.type) {
  case 'close':
    break;

  case 'snooze':
    if (actions.snoozeMinutes) {
      result.for = `${actions.snoozeMinutes}m`;
    }
    break;
    
  case 'group':
    if (actions.groupBy) {
      result.by = actions.groupBy;
    } else if (actions.name) {
      result.name = actions.name;
    }
    break;
  }

  return result;
}

function convertRuleFromNewFormat(newRule) {
  // Convert Rules Engine 2.0 format back to old format
  const oldRule = {
    name: newRule.name,
    enabled: newRule.enabled !== false,
    conditions: {},
    actions: {}
  };

  // Convert trigger
  if (newRule.trigger.immediate) {
    oldRule.trigger = { type: 'event' };
  } else if (newRule.trigger.repeat_every) {
    const match = newRule.trigger.repeat_every.match(/(\d+)([mhd])/);
    if (match) {
      let minutes = parseInt(match[1]);
      if (match[2] === 'h') minutes *= 60;
      if (match[2] === 'd') minutes *= 1440;
      oldRule.trigger = { type: 'periodic', interval: minutes };
    }
  }

  // Convert conditions - simplified conversion
  if (newRule.when) {
    oldRule.conditions = convertConditionsFromNew(newRule.when);
  }

  // Convert actions
  if (newRule.then && newRule.then.length > 0) {
    oldRule.actions = convertActionsFromNew(newRule.then[0]);
  }

  return oldRule;
}

function convertConditionsFromNew(condition) {
  // Simplified conversion - may need expansion based on actual use
  if (condition.is && condition.is[0] === 'tab.isDupe') {
    return { type: 'duplicate' };
  } else if (condition.gte && condition.gte[0] === 'tab.countPerOrigin:domain') {
    return { type: 'domain_count', minCount: condition.gte[1] };
  } else if (condition.in && condition.in[0] === 'tab.category') {
    return { type: 'category', categories: condition.in[1] };
  } else if (condition.regex && condition.regex[0] === 'tab.url') {
    return { type: 'url_pattern', pattern: condition.regex[1] };
  } else if (condition.all) {
    // Handle complex conditions - simplified
    return { type: 'duplicate' }; // Default fallback
  }
  
  return { type: 'duplicate' };
}

function convertActionsFromNew(action) {
  const result = { type: action.action };

  switch (action.action) {
  case 'close':
    break;

  case 'snooze':
    if (action.for) {
      const match = action.for.match(/(\d+)([mhd])/);
      if (match) {
        let minutes = parseInt(match[1]);
        if (match[2] === 'h') minutes *= 60;
        if (match[2] === 'd') minutes *= 1440;
        result.snoozeMinutes = minutes;
      }
    }
    break;
    
  case 'group':
    if (action.by) {
      result.groupBy = action.by;
    } else if (action.name) {
      result.name = action.name;
    }
    break;
  }

  return result;
}
