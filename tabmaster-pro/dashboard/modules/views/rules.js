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
      description: 'Automatically close duplicate tabs, keeping the first one',
      enabled: false,
      when: {
        all: [
          { subject: 'duplicate', operator: 'equals', value: true }
        ]
      },
      then: [
        { type: 'close' }
      ],
      trigger: { type: 'manual' },
      priority: 1,
    },
    {
      id: 'sample_2',
      name: 'Group tabs by domain',
      description: 'Group tabs from the same domain when you have 3 or more',
      enabled: false,
      conditions: { type: 'domain_count', minCount: 3 },
      actions: { type: 'group', groupBy: 'domain' },
      priority: 2,
    },
    {
      id: 'sample_3',
      name: 'Snooze inactive articles',
      description: 'Snooze unread articles after 60 minutes of inactivity',
      enabled: false,
      conditions: {
        type: 'inactive',
        urlPatterns: ['medium.com', 'dev.to', 'hackernews', 'reddit.com'],
        timeCriteria: { inactive: 60 }
      },
      actions: { type: 'snooze', snoozeMinutes: 1440 },
      priority: 3,
      trigger: { type: 'event' }
    },
    {
      id: 'sample_4',
      name: 'Clean up inactive Chrome pages',
      description: 'Close common Chrome internal pages after 30 minutes of inactivity',
      enabled: false,
      conditions: {
        type: 'url_pattern',
        pattern: '^chrome://(extensions|downloads|settings|flags|history|bookmarks|newtab)',
        timeCriteria: { inactive: 30 }
      },
      actions: { type: 'close', saveToBookmarks: false },
      priority: 4,
      trigger: { type: 'event' }
    },
    {
      id: 'sample_5',
      name: 'Close inactive social media tabs',
      description: 'Close social media tabs after 60 minutes of inactivity',
      enabled: false,
      conditions: {
        type: 'category',
        categories: ['social'],
        timeCriteria: { inactive: 60 }
      },
      actions: { type: 'close', saveToBookmarks: false },
      priority: 5,
      trigger: { type: 'periodic', interval: 15 }
    },
    {
      id: 'sample_6',
      name: 'Group shopping tabs together',
      description: 'Automatically group all shopping sites into one tab group',
      enabled: false,
      conditions: {
        type: 'category',
        categories: ['shopping']
      },
      actions: { type: 'group', groupBy: 'category' },
      priority: 6,
      trigger: { type: 'event' }
    },
    {
      id: 'sample_7',
      name: 'Archive old research tabs',
      description: 'Close tabs older than 7 days that haven\'t been accessed in 24 hours',
      enabled: false,
      conditions: {
        type: 'duplicate',  // Match all tabs
        timeCriteria: { 
          age: 10080,  // 7 days
          notAccessed: 1440  // 24 hours
        }
      },
      actions: { type: 'close', saveToBookmarks: true },
      priority: 7,
      trigger: { type: 'periodic', interval: 60 }  // Check hourly
    },
    {
      id: 'sample_8',
      name: 'Suspend memory-heavy tabs',
      description: 'Suspend tabs from specific domains after 2 hours of inactivity',
      enabled: false,
      conditions: {
        type: 'age_and_domain',
        domains: ['youtube.com', 'netflix.com', 'twitch.tv', 'spotify.com'],
        timeCriteria: { inactive: 120 }  // 2 hours
      },
      actions: { type: 'suspend', excludePinned: true },
      priority: 8,
      trigger: { type: 'periodic', interval: 30 }  // Check every 30 minutes
    }
  ];
}

export function updateRulesUI() {
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

    sortedRules.forEach(rule => {
      const ruleCard = createRuleCard(rule);
      rulesList.appendChild(ruleCard);
    });
  }

  // Update sample rules in dropdown
  updateSampleRulesDropdown();
}

function createRuleCard(rule) {
  const card = document.createElement('div');
  card.className = `rule-card ${!rule.enabled ? 'disabled' : ''}`;
  card.dataset.ruleId = rule.id;
  card.draggable = true;

  card.innerHTML = `
    <div class="rule-header">
      <div class="rule-drag-handle" title="Drag to reorder">
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
        <label class="switch rule-switch" title="${rule.enabled ? 'Disable rule' : 'Enable rule'}">
          <input type="checkbox" class="rule-toggle" data-action="toggle" data-rule-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
        <button class="btn-icon" data-action="test" title="Test this rule (preview only)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
        <button class="btn-icon" data-action="run" title="Run this rule now">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </button>
        <button class="btn-icon" data-action="edit" title="Edit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="btn-icon" data-action="delete" title="Delete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>
    <div class="rule-details">
      <div class="rule-condition">
        <strong>When:</strong> ${getConditionDescription(rule.when || rule.conditions)}
      </div>
      <div class="rule-action">
        <strong>Then:</strong> ${getActionDescription(rule.then || rule.actions)}
      </div>
      ${rule.trigger && rule.trigger.type === 'periodic' ? `
      <div class="rule-trigger">
        <strong>Runs:</strong> Every ${rule.trigger.interval} minutes
      </div>
      ` : ''}
    </div>
  `;

  return card;
}

function updateSampleRulesDropdown() {
  const sampleRuleItems = document.getElementById('sampleRuleItems');
  if (!sampleRuleItems) return;

  sampleRuleItems.innerHTML = '';

  // Filter out already installed samples
  const installedSampleIds = state.get('currentRules').map(r => r.originalSampleId).filter(Boolean);
  const availableSamples = state.get('sampleRules').filter(s => !installedSampleIds.includes(s.id));

  if (availableSamples.length === 0) {
    sampleRuleItems.innerHTML = '<div class="dropdown-item-text">All templates installed</div>';
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
function getNewFormatConditionDescription(conditions) {
  const junction = conditions.all ? 'all' : conditions.any ? 'any' : 'none';
  const items = conditions[junction] || [];
  
  if (items.length === 0) return 'No conditions';
  
  // Build description
  const descriptions = items.map(item => {
    if (item.subject) {
      // Simple condition
      const subjectLabels = {
        url: 'URL',
        title: 'Title',
        domain: 'Domain',
        duplicate: 'Is duplicate',
        age: 'Tab age',
        last_access: 'Last accessed',
        pinned: 'Is pinned',
        category: 'Category'
      };
      
      const operatorLabels = {
        equals: 'is',
        contains: 'contains',
        greater_than: 'more than',
        less_than: 'less than',
        in: 'in'
      };
      
      const subject = subjectLabels[item.subject] || item.subject;
      const operator = operatorLabels[item.operator] || item.operator;
      const value = item.value === true ? 'yes' : item.value === false ? 'no' : item.value;
      
      return `${subject} ${operator} ${value}`;
    } else {
      // Nested condition group
      return `(${getNewFormatConditionDescription(item)})`;
    }
  });
  
  return `${junction.toUpperCase()} of: ${descriptions.join(', ')}`;
}

function getConditionDescription(conditions) {
  if (!conditions) return 'No conditions';
  
  // Handle new format (when: { all: [...] })
  if (conditions.all || conditions.any || conditions.none) {
    return getNewFormatConditionDescription(conditions);
  }
  
  // Handle old format for backward compatibility
  let description = '';
  switch (conditions.type) {
    case 'duplicate':
      description = 'Duplicate tabs';
      break;
    case 'domain_count':
      description = `${conditions.minCount}+ tabs from same domain`;
      break;
    case 'inactive':
      description = conditions.urlPatterns && conditions.urlPatterns.length > 0 
        ? `Tabs from ${conditions.urlPatterns.join(', ')}`
        : 'All tabs';
      break;
    case 'age_and_domain':
      description = `Tabs from ${conditions.domains.join(', ')}`;
      break;
    case 'url_pattern':
      description = `URLs matching "${conditions.pattern}"`;
      break;
    case 'category':
      const categoryNames = conditions.categories ? conditions.categories.join(', ') : 'none';
      description = `Sites in categories: ${categoryNames}`;
      break;
    default:
      return 'Unknown condition';
  }
  
  // Add time criteria if present
  const timeParts = [];
  if (conditions.timeCriteria) {
    if (conditions.timeCriteria.inactive !== undefined) {
      timeParts.push(`inactive for ${conditions.timeCriteria.inactive} min`);
    }
    if (conditions.timeCriteria.age !== undefined) {
      timeParts.push(`older than ${conditions.timeCriteria.age} min`);
    }
    if (conditions.timeCriteria.notAccessed !== undefined) {
      timeParts.push(`not accessed for ${conditions.timeCriteria.notAccessed} min`);
    }
  }
  
  // Handle legacy format for backward compatibility
  if (conditions.inactiveMinutes && !conditions.timeCriteria) {
    timeParts.push(`inactive for ${conditions.inactiveMinutes} min`);
  }
  if (conditions.ageMinutes && !conditions.timeCriteria) {
    timeParts.push(`older than ${conditions.ageMinutes} min`);
  }
  
  if (timeParts.length > 0) {
    description += ` (${timeParts.join(', ')})`;
  }
  
  return description;
}

function getActionDescription(actions) {
  // Handle new format (array of actions)
  if (Array.isArray(actions)) {
    if (actions.length === 0) return 'No actions';
    
    const actionDescriptions = actions.map(action => {
      const actionLabels = {
        close: 'Close tabs',
        group: 'Group tabs',
        snooze: 'Snooze tabs',
        bookmark: 'Bookmark tabs',
        move_to_window: 'Move to window',
        pin: 'Pin tabs',
        unpin: 'Unpin tabs',
        mute: 'Mute tabs',
        unmute: 'Unmute tabs'
      };
      
      let desc = actionLabels[action.type] || action.type;
      
      // Add parameters
      if (action.bookmark_first) desc += ' (bookmark first)';
      if (action.group_by) desc += ` by ${action.group_by}`;
      if (action.until) desc += ` for ${action.until}`;
      if (action.folder) desc += ` to "${action.folder}"`;
      
      return desc;
    });
    
    return actionDescriptions.join(', ');
  }
  
  // Handle old format
  switch (actions.type) {
    case 'close':
      return `Close tabs ${actions.saveToBookmarks ? '(save to bookmarks)' : ''}`;
    case 'group':
      return `Group tabs by ${actions.groupBy}`;
    case 'snooze':
      return `Snooze for ${actions.snoozeMinutes} minutes`;
    case 'suspend':
      return `Suspend tabs ${actions.excludePinned ? '(exclude pinned)' : ''}`;
    default:
      return 'Unknown action';
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

  // Setup drag and drop for rules
  setupRuleDragAndDrop();
  
  // Setup DSL import/export
  setupDSLEventListeners();
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
      if (confirm('Are you sure you want to delete this rule?')) {
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
  showNotification('Rule template installed successfully', 'success');
}

// Store the conditions builder instance
let conditionsBuilder = null;
let currentActions = [];

export function openRuleModal(rule = null) {
  const modal = document.getElementById('ruleModal');
  const modalTitle = document.getElementById('ruleModalTitle');

  // Update modal title
  modalTitle.textContent = rule ? 'Edit Rule' : 'Create New Rule';

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

  
  // Show modal
  modal.classList.add('show');
}

// Convert old conditions format to new Rules Engine 2.0 format
function convertOldConditionsToNew(oldConditions) {
  if (!oldConditions) return { all: [] };
  
  const conditions = [];
  
  switch (oldConditions.type) {
    case 'duplicate':
      conditions.push({ subject: 'duplicate', operator: 'equals', value: true });
      break;
      
    case 'domain_count':
      if (oldConditions.minCount) {
        conditions.push({ subject: 'tab_count', operator: 'greater_than_or_equal', value: oldConditions.minCount });
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
          operator: 'greater_than', 
          value: `${oldConditions.timeCriteria.inactive}m`
        });
      }
      break;
      
    case 'url_pattern':
      if (oldConditions.pattern) {
        conditions.push({ subject: 'url', operator: 'matches', value: oldConditions.pattern });
      }
      break;
      
    case 'age_and_domain':
      if (oldConditions.domains) {
        conditions.push({
          any: oldConditions.domains.map(domain => ({
            subject: 'domain', operator: 'equals', value: domain
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
        operator: 'greater_than',
        value: `${oldConditions.timeCriteria.age}m`
      });
    }
    if (oldConditions.timeCriteria.notAccessed) {
      conditions.push({
        subject: 'last_access',
        operator: 'greater_than',
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
      if (oldAction.saveToBookmarks) action.bookmark_first = true;
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
    container.innerHTML = '<p class="text-muted">No actions defined. Click "Add Action" to add one.</p>';
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
        ? 'Close action cannot be combined with other actions'
        : 'No more compatible actions available';
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
    close: 'Close tabs',
    group: 'Group tabs',
    snooze: 'Snooze tabs',
    bookmark: 'Bookmark tabs',
    move_to_window: 'Move to window',
    pin: 'Pin tabs',
    unpin: 'Unpin tabs',
    mute: 'Mute tabs',
    unmute: 'Unmute tabs'
  };
  
  div.innerHTML = `
    <div class="action-header">
      <span class="action-number">${index + 1}.</span>
      <span class="action-type">${actionLabels[action.type] || action.type}</span>
      <button class="btn-icon remove-action" title="Remove">×</button>
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
      return `
        <label>
          <input type="checkbox" ${action.bookmark_first ? 'checked' : ''} 
            onchange="updateActionParam(${currentActions.indexOf(action)}, 'bookmark_first', this.checked)">
          Bookmark before closing
        </label>
      `;
      
    case 'group':
      return `
        <label>Group by:
          <select onchange="updateActionParam(${currentActions.indexOf(action)}, 'group_by', this.value)">
            <option value="domain" ${action.group_by === 'domain' ? 'selected' : ''}>Domain</option>
            <option value="category" ${action.group_by === 'category' ? 'selected' : ''}>Category</option>
            <option value="window" ${action.group_by === 'window' ? 'selected' : ''}>Window</option>
          </select>
        </label>
        <label>Name:
          <input type="text" value="${action.name || ''}" placeholder="Auto-generated"
            onchange="updateActionParam(${currentActions.indexOf(action)}, 'name', this.value)">
        </label>
      `;
      
    case 'snooze':
      const duration = parseDuration(action.until || '1h');
      return `
        <label>Snooze for:
          <input type="number" value="${duration.value}" min="1"
            onchange="updateSnoozeDuration(${currentActions.indexOf(action)}, this.value)">
          <select onchange="updateSnoozeDurationUnit(${currentActions.indexOf(action)}, this.value)">
            <option value="m" ${duration.unit === 'm' ? 'selected' : ''}>minutes</option>
            <option value="h" ${duration.unit === 'h' ? 'selected' : ''}>hours</option>
            <option value="d" ${duration.unit === 'd' ? 'selected' : ''}>days</option>
          </select>
        </label>
      `;
      
    case 'move_to_window':
      return `
        <label>Target window:
          <select onchange="updateActionParam(${currentActions.indexOf(action)}, 'window_id', this.value)">
            <option value="new">New window</option>
            <option value="current" ${action.window_id === 'current' ? 'selected' : ''}>Current window</option>
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
        <label>Repeat every:
          <input type="number" id="repeatInterval" min="1" value="30">
          <select id="repeatUnit">
            <option value="m">minutes</option>
            <option value="h">hours</option>
            <option value="d">days</option>
          </select>
        </label>
      `;
      break;
      
    case 'once':
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 16);
      paramsContainer.innerHTML = `
        <label>Run at:
          <input type="datetime-local" id="onceAt" value="${dateStr}" min="${dateStr}">
        </label>
      `;
      break;
      
    case 'immediate':
      paramsContainer.innerHTML = `
        <label class="checkbox-with-help">
          <input type="checkbox" id="debounce" checked>
          <span>Debounce</span>
          <span class="help-tooltip" title="When enabled, waits for a pause in tab activity before running the rule. This prevents the rule from running multiple times during burst activities like opening many tabs at once. For example, if you open 10 tabs quickly, the rule runs once after you're done instead of 10 times.">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M9.5 9a3 3 0 0 1 5 0c0 2-3 3-3 3"></path>
              <circle cx="12" cy="17" r="1"></circle>
            </svg>
          </span>
        </label>
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
          <h3>Add Action</h3>
          <button class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <p class="text-muted">No more actions can be added. Current actions are not compatible with additional actions.</p>
          ${currentActions.some(a => a.type === 'close') ? '<p class="text-muted"><strong>Note:</strong> Close action cannot be combined with other actions.</p>' : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary close-action">Close</button>
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
    close: 'Close tabs',
    group: 'Group tabs',
    snooze: 'Snooze tabs',
    bookmark: 'Bookmark tabs',
    move_to_window: 'Move to window',
    pin: 'Pin tabs',
    unpin: 'Unpin tabs',
    mute: 'Mute tabs',
    unmute: 'Unmute tabs'
  };
  
  // Build options for compatible actions
  const optionsHTML = compatibleActions
    .map(action => `<option value="${action}">${actionLabels[action] || action}</option>`)
    .join('');
  
  modal.innerHTML = `
    <div class="modal-content modal-sm">
      <div class="modal-header">
        <h3>Add Action</h3>
        <button class="close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <label>Action Type:</label>
        <select id="newActionType" class="form-select">
          ${optionsHTML}
        </select>
        ${currentActions.length > 0 ? '<p class="text-muted" style="margin-top: 10px; font-size: 13px;">Only showing actions compatible with existing actions.</p>' : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary cancel-action">Cancel</button>
        <button class="btn btn-primary add-action-confirm">Add Action</button>
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
    alert('Please enter a rule name');
    return;
  }
  
  // Validate conditions
  if (!conditionsBuilder) {
    alert('Conditions not properly initialized');
    return;
  }
  
  const conditions = conditionsBuilder.getConditions();
  const validation = conditionsBuilder.validate();
  if (!validation.valid) {
    alert(`Invalid conditions: ${validation.error}`);
    return;
  }
  
  // Validate actions
  if (currentActions.length === 0) {
    alert('Please add at least one action');
    return;
  }
  
  // Validate action compatibility
  const actionValidation = validateActionList(currentActions);
  if (!actionValidation.valid) {
    alert(`Invalid actions: ${actionValidation.errors.join(', ')}`);
    return;
  }
  
  // Sort actions by priority for optimal execution
  const sortedActions = sortActionsByPriority(currentActions);
  
  // Build trigger
  const triggerType = document.getElementById('triggerType').value;
  let trigger = { type: 'manual' };
  
  switch (triggerType) {
    case 'immediate':
      trigger = {
        type: 'immediate',
        debounce: document.getElementById('debounce')?.checked ?? true
      };
      break;
      
    case 'repeat':
      const interval = document.getElementById('repeatInterval')?.value || '30';
      const unit = document.getElementById('repeatUnit')?.value || 'm';
      trigger = {
        type: 'repeat',
        every: `${interval}${unit}`
      };
      break;
      
    case 'once':
      const dateTime = document.getElementById('onceAt')?.value;
      if (dateTime) {
        trigger = {
          type: 'once',
          at: new Date(dateTime).toISOString()
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
  let rules = state.get('currentRules');
  
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
  showNotification(editingId ? 'Rule updated successfully' : 'Rule created successfully', 'success');
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
  showNotification('Rule deleted', 'success');
}

// Purge all rules
async function purgeAllRules() {
  const confirmMsg = 'Are you sure you want to delete ALL rules? This action cannot be undone.';
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
    
    showNotification('All rules have been purged', 'success');
    updateRulesUI();
  } catch (error) {
    console.error('Failed to purge rules:', error);
    showNotification('Failed to purge rules', 'error');
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
  showNotification(enabled ? 'All rules enabled' : 'All rules disabled', 'success');
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
      showNotification(
        `Rule executed successfully`, 
        'success'
      );
      
      // Refresh the view to show updated tab counts
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      showNotification(`Rule execution failed: ${result.error}`, 'error');
    }
  } catch (error) {
    showNotification(`Error executing rule: ${error.message}`, 'error');
  }
  
  // Restore button
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
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
      showNotification(
        `Rule tested: ${result.affectedCount} tab(s) would be affected`, 
        'info'
      );
      
      if (result.affectedTabs && result.affectedTabs.length > 0) {
        console.log('Affected tabs:', result.affectedTabs);
        // Pass the rule from the result if available, otherwise use the original
        showTestResultsModal(result.affectedTabs, result.rule || rule);
      }
    } else if (result.matchingTabs !== undefined) {
      // Old format from background.js
      const count = result.matchingTabs.length;
      showNotification(
        `Rule tested: ${count} tab(s) would be affected`, 
        'info'
      );
      
      if (count > 0) {
        console.log('Matching tabs:', result.matchingTabs);
      }
    } else if (result.error) {
      showNotification(`Rule test failed: ${result.error}`, 'error');
    } else {
      // Unexpected format
      console.error('Unexpected preview result format:', result);
      showNotification('Unable to preview rule', 'error');
    }
  } catch (error) {
    showNotification(`Error testing rule: ${error.message}`, 'error');
  }
  
  // Restore button
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
  }
}

export async function testAllRules() {
  const enabledRules = state.get('currentRules').filter(r => r.enabled);
  if (enabledRules.length === 0) {
    showNotification('No enabled rules to test', 'info');
    return;
  }
  
  const btn = document.getElementById('testAllRulesBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<svg class="spinner" width="16" height="16" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5"></circle></svg> Testing...';
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
      `Test complete: ${totalAffected} total tab(s) would be affected`,
      'info'
    );
    console.log('Test results by rule:', results);
  } else {
    showNotification('No tabs would be affected by current rules', 'info');
  }
  
  // Restore button
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = 'Test All Rules';
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
  
  rulesList.addEventListener('dragstart', (e) => {
    const ruleCard = e.target.closest('.rule-card');
    if (!ruleCard || !e.target.closest('.rule-drag-handle')) {
      e.preventDefault();
      return;
    }
    
    draggedElement = ruleCard;
    ruleCard.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
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
  
  showNotification('Rule priorities updated', 'success');
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
             onerror="this.style.display='none'">
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(tab.title || 'Untitled')}</div>
          <div style="font-size: 12px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(tab.url)}</div>
          ${tab.isDupe ? '<span style="font-size: 11px; color: #dc3545; font-weight: 500;">[DUPLICATE]</span>' : ''}
        </div>
      </div>
    `;
  }).join('');
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px; max-height: 80vh; display: flex; flex-direction: column;">
      <div class="modal-header">
        <h2>Test Results: ${escapeHtml(rule.name)}</h2>
        <button class="modal-close" id="testResultsCloseBtn">&times;</button>
      </div>
      <div class="modal-body" style="padding: 0; flex: 1; overflow-y: auto;">
        <div style="padding: 16px; background: #f8f9fa; border-bottom: 1px solid #e0e0e0;">
          <strong>${tabs.length} tab${tabs.length !== 1 ? 's' : ''} would be affected:</strong>
        </div>
        <div>
          ${tabsList}
        </div>
      </div>
      <div class="modal-footer" style="padding: 16px; display: flex; gap: 10px; justify-content: flex-end;">
        <button class="btn btn-secondary" id="testResultsCancelBtn">Close</button>
        <button class="btn btn-primary" id="testResultsExecuteBtn" data-rule-id="${rule.id}">Execute Rule</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
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
    showNotification(`Rule executed: ${result.actionCount || 0} actions performed`, 'success');
    // Add a small delay before refreshing to allow tabs to close
    setTimeout(async () => {
      await loadRulesView();
    }, 500);
  } else {
    showNotification(`Failed to execute rule: ${result.error}`, 'error');
  }
};

// DSL Import/Export Functions
export function exportRulesAsDSL() {
  const rules = state.get('currentRules');
  if (!rules || rules.length === 0) {
    showNotification('No rules to export', 'info');
    return;
  }

  // Convert rules to DSL format
  const dslContent = rules.map(rule => {
    // Convert old rule format to new format if needed
    const newRule = convertRuleToNewFormat(rule);
    return serializeRuleToDSL(newRule);
  }).join('\n\n');

  // Show DSL modal with export content
  showDSLModal('export', dslContent);
}

export function importRulesFromDSL() {
  // Show DSL modal for import
  showDSLModal('import', '');
}

// Store highlighter instance globally
let dslHighlighter = null;

function showDSLModal(mode, content = '') {
  const modal = document.getElementById('dslModal');
  const modalTitle = document.getElementById('dslModalTitle');
  const textarea = document.getElementById('dslContent');
  const confirmBtn = document.getElementById('confirmDSLBtn');
  const status = document.getElementById('dslStatus');

  // Set mode
  modalTitle.textContent = mode === 'export' ? 'Export Rules as DSL' : 'Import Rules from DSL';
  confirmBtn.textContent = mode === 'export' ? 'Copy to Clipboard' : 'Import';
  confirmBtn.style.display = mode === 'export' ? 'block' : 'block';
  textarea.readOnly = mode === 'export';
  textarea.value = content;
  
  // Clear status
  status.className = 'dsl-status';
  status.textContent = '';

  // Initialize syntax highlighting
  if (!dslHighlighter) {
    dslHighlighter = createHighlightedOverlay(textarea);
  } else {
    dslHighlighter.update();
  }

  // Show modal
  modal.style.display = 'flex';

  if (mode === 'export') {
    // Select all text for easy copying
    textarea.select();
  }
}

function closeDSLModal() {
  const modal = document.getElementById('dslModal');
  modal.style.display = 'none';
}

export async function handleDSLImport() {
  const textarea = document.getElementById('dslContent');
  const dslContent = textarea.value.trim();
  const status = document.getElementById('dslStatus');

  if (!dslContent) {
    showDSLStatus('Please enter DSL rules to import', 'error');
    return;
  }

  // Validate DSL
  const validation = validateDSL(dslContent);
  if (!validation.valid) {
    showDSLStatus(`Invalid DSL: ${validation.error}`, 'error');
    return;
  }

  try {
    // Parse DSL to rules
    const parsedRules = parseDSL(dslContent);
    
    // Convert to old format for compatibility
    const convertedRules = parsedRules.map(rule => convertRuleFromNewFormat(rule));

    // Get existing rules
    let existingRules = state.get('currentRules') || [];
    
    // Add new rules with unique IDs and priorities
    const newRules = convertedRules.map((rule, index) => ({
      ...rule,
      id: `rule_${Date.now()}_${index}`,
      priority: existingRules.length + index + 1,
      createdAt: Date.now(),
      enabled: false // Start disabled for safety
    }));

    // Combine rules
    const allRules = [...existingRules, ...newRules];
    
    // Save rules
    state.set('currentRules', allRules);
    await sendMessage({
      action: 'updateRules',
      rules: allRules
    });

    // Update UI and close modal
    updateRulesUI();
    closeDSLModal();
    showNotification(`Imported ${newRules.length} rule(s) successfully`, 'success');
  } catch (error) {
    showDSLStatus(`Import failed: ${error.message}`, 'error');
  }
}

export function formatDSLContent() {
  const textarea = document.getElementById('dslContent');
  const content = textarea.value.trim();
  
  if (!content) return;

  try {
    // Parse and re-serialize to format
    const validation = validateDSL(content);
    if (validation.valid) {
      const formatted = validation.rules.map(rule => serializeRuleToDSL(rule)).join('\n\n');
      textarea.value = formatDSL(formatted);
      
      // Update syntax highlighting
      if (dslHighlighter) {
        dslHighlighter.update();
      }
      
      showDSLStatus('DSL formatted successfully', 'success');
    } else {
      showDSLStatus(`Cannot format invalid DSL: ${validation.error}`, 'error');
    }
  } catch (error) {
    showDSLStatus(`Format error: ${error.message}`, 'error');
  }
}

export function validateDSLContent() {
  const textarea = document.getElementById('dslContent');
  const content = textarea.value.trim();
  
  if (!content) {
    showDSLStatus('Please enter DSL content to validate', 'info');
    return;
  }

  const validation = validateDSL(content);
  if (validation.valid) {
    showDSLStatus(`Valid DSL with ${validation.rules.length} rule(s)`, 'success');
  } else {
    showDSLStatus(`Invalid DSL: ${validation.error}`, 'error');
  }
}

function showDSLStatus(message, type) {
  const status = document.getElementById('dslStatus');
  status.className = `dsl-status ${type}`;
  status.textContent = message;
}

export function copyDSLToClipboard() {
  const textarea = document.getElementById('dslContent');
  textarea.select();
  document.execCommand('copy');
  showDSLStatus('Copied to clipboard!', 'success');
}

// DSL event listeners setup
export function setupDSLEventListeners() {
  // Export button
  const exportBtn = document.getElementById('exportDSLBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportRulesAsDSL);
  }

  // Import button
  const importBtn = document.getElementById('importDSLBtn');
  if (importBtn) {
    importBtn.addEventListener('click', importRulesFromDSL);
  }

  // Modal buttons
  const closeDSLBtn = document.getElementById('closeDSLModal');
  if (closeDSLBtn) {
    closeDSLBtn.addEventListener('click', closeDSLModal);
  }

  const cancelDSLBtn = document.getElementById('cancelDSLBtn');
  if (cancelDSLBtn) {
    cancelDSLBtn.addEventListener('click', closeDSLModal);
  }

  const confirmDSLBtn = document.getElementById('confirmDSLBtn');
  if (confirmDSLBtn) {
    confirmDSLBtn.addEventListener('click', () => {
      const modalTitle = document.getElementById('dslModalTitle');
      if (modalTitle.textContent.includes('Import')) {
        handleDSLImport();
      } else {
        copyDSLToClipboard();
      }
    });
  }

  // Toolbar buttons
  const formatBtn = document.getElementById('formatDSLBtn');
  if (formatBtn) {
    formatBtn.addEventListener('click', formatDSLContent);
  }

  const validateBtn = document.getElementById('validateDSLBtn');
  if (validateBtn) {
    validateBtn.addEventListener('click', validateDSLContent);
  }

  const clearBtn = document.getElementById('clearDSLBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      document.getElementById('dslContent').value = '';
      document.getElementById('dslStatus').className = 'dsl-status';
      document.getElementById('dslStatus').textContent = '';
    });
  }

  // Modal backdrop click
  const dslModal = document.getElementById('dslModal');
  if (dslModal) {
    dslModal.addEventListener('click', (e) => {
      if (e.target === dslModal) {
        closeDSLModal();
      }
    });
  }
}

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
      if (actions.saveToBookmarks) {
        result.saveToBookmarks = true;
      }
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
      if (action.saveToBookmarks) {
        result.saveToBookmarks = true;
      }
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
