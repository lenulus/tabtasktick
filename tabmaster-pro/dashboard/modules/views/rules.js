// Rules View Module
// Handles the rules management view with rule creation, editing, and testing

import state from '../core/state.js';
import { showNotification } from '../core/shared-utils.js';

export async function loadRulesView() {
  console.log('Loading rules view...');

  try {
    // Load current rules from background
    const rules = await sendMessage({ action: 'getRules' });
    state.set('currentRules', rules || []);

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
      conditions: { type: 'duplicate' },
      actions: { type: 'close', keepFirst: true },
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
  if (state.get('currentRules').length === 0) {
    emptyState.style.display = 'flex';
    rulesList.style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    rulesList.style.display = 'block';
    rulesList.innerHTML = '';

    // Sort rules by priority
    const sortedRules = [...state.get('currentRules')].sort((a, b) => a.priority - b.priority);

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
        <button class="btn-icon" data-action="test" title="Test this rule">
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
        <strong>When:</strong> ${getConditionDescription(rule.conditions)}
      </div>
      <div class="rule-action">
        <strong>Then:</strong> ${getActionDescription(rule.actions)}
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

function getConditionDescription(conditions) {
  let description = '';
  
  // Base condition
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

  // Condition/Action selects
  const conditionSelect = document.getElementById('ruleCondition');
  const actionSelect = document.getElementById('ruleAction');

  if (conditionSelect && !conditionSelect.hasListener) {
    conditionSelect.addEventListener('change', updateConditionParams);
    conditionSelect.hasListener = true;
  }

  if (actionSelect && !actionSelect.hasListener) {
    actionSelect.addEventListener('change', updateActionParams);
    actionSelect.hasListener = true;
  }

  // Time criteria checkboxes
  const timeCheckboxes = ['useInactive', 'useAge', 'useNotAccessed'];
  timeCheckboxes.forEach(id => {
    const checkbox = document.getElementById(id);
    if (checkbox && !checkbox.hasListener) {
      checkbox.addEventListener('change', (e) => {
        const inputId = id.replace('use', '').toLowerCase() + 'Minutes';
        const input = document.getElementById(inputId);
        if (input) {
          input.disabled = !e.target.checked;
        }
      });
      checkbox.hasListener = true;
    }
  });

  // Trigger type select
  const triggerSelect = document.getElementById('triggerType');
  if (triggerSelect && !triggerSelect.hasListener) {
    triggerSelect.addEventListener('change', (e) => {
      const intervalDiv = document.getElementById('triggerInterval');
      intervalDiv.style.display = e.target.value === 'periodic' ? 'block' : 'none';
    });
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
    action: 'saveRules',
    rules: rules
  });

  // Update UI
  updateRulesUI();
  showNotification('Rule template installed successfully', 'success');
}

export function openRuleModal(rule = null) {
  const modal = document.getElementById('ruleModal');
  const modalTitle = document.getElementById('ruleModalTitle');
  const form = document.getElementById('ruleForm');

  // Update modal title
  modalTitle.textContent = rule ? 'Edit Rule' : 'Create New Rule';

  // Store editing state
  state.set('editingRuleId', rule?.id || null);

  // Reset form
  form.reset();

  // Initialize trigger type (default to event)
  document.getElementById('triggerType').value = rule?.trigger?.type || 'event';
  document.getElementById('triggerInterval').style.display = 
    rule?.trigger?.type === 'periodic' ? 'block' : 'none';

  if (rule) {
    // Populate form with existing rule data
    document.getElementById('ruleName').value = rule.name || '';
    document.getElementById('ruleCondition').value = rule.conditions.type;
    document.getElementById('ruleAction').value = rule.actions.type;

    // Populate trigger data
    if (rule.trigger) {
      document.getElementById('triggerType').value = rule.trigger.type;
      if (rule.trigger.type === 'periodic') {
        document.getElementById('intervalMinutes').value = rule.trigger.interval;
        document.getElementById('triggerInterval').style.display = 'block';
      }
    }

    // Update condition/action parameters
    updateConditionParams();
    updateActionParams();

    // Set specific values based on condition type
    if (rule.conditions.minCount) {
      document.getElementById('minTabCount').value = rule.conditions.minCount;
    }
    if (rule.conditions.pattern) {
      document.getElementById('urlPattern').value = rule.conditions.pattern;
    }
    if (rule.conditions.domains) {
      document.getElementById('domains').value = rule.conditions.domains.join(', ');
    }
    if (rule.conditions.urlPatterns) {
      document.getElementById('urlPatterns').value = rule.conditions.urlPatterns.join(', ');
    }
    if (rule.conditions.categories) {
      // Set checkboxes for categories
      const checkboxes = document.querySelectorAll('#categoriesDiv input[type="checkbox"]');
      checkboxes.forEach(cb => {
        cb.checked = rule.conditions.categories.includes(cb.value);
      });
    }

    // Set time criteria
    const tc = rule.conditions.timeCriteria || {};
    if (tc.inactive !== undefined || rule.conditions.inactiveMinutes) {
      document.getElementById('useInactive').checked = true;
      document.getElementById('inactiveMinutes').disabled = false;
      document.getElementById('inactiveMinutes').value = tc.inactive || rule.conditions.inactiveMinutes || 60;
    }
    if (tc.age !== undefined || rule.conditions.ageMinutes) {
      document.getElementById('useAge').checked = true;
      document.getElementById('ageMinutes').disabled = false;
      document.getElementById('ageMinutes').value = tc.age || rule.conditions.ageMinutes || 1440;
    }
    if (tc.notAccessed !== undefined) {
      document.getElementById('useNotAccessed').checked = true;
      document.getElementById('notaccessedMinutes').disabled = false;
      document.getElementById('notaccessedMinutes').value = tc.notAccessed || 1440;
    }

    // Set action parameters
    if (rule.actions.snoozeMinutes) {
      document.getElementById('snoozeMinutes').value = rule.actions.snoozeMinutes;
    }
    if (rule.actions.groupBy) {
      document.getElementById('groupBy').value = rule.actions.groupBy;
    }
    if (rule.actions.saveToBookmarks !== undefined) {
      document.getElementById('saveToBookmarks').checked = rule.actions.saveToBookmarks;
    }
    if (rule.actions.excludePinned !== undefined) {
      document.getElementById('excludePinned').checked = rule.actions.excludePinned;
    }
  } else {
    // Default values for new rule
    updateConditionParams();
    updateActionParams();
  }

  // Show modal
  modal.style.display = 'block';
}

export function closeRuleModal() {
  const modal = document.getElementById('ruleModal');
  modal.style.display = 'none';
  state.set('editingRuleId', null);
}

export function updateConditionParams() {
  const conditionType = document.getElementById('ruleCondition').value;
  const allParams = document.querySelectorAll('.condition-params');
  
  // Hide all parameter sections
  allParams.forEach(p => p.style.display = 'none');
  
  // Show relevant parameters
  switch (conditionType) {
    case 'domain_count':
      document.getElementById('domainCountParams').style.display = 'block';
      break;
    case 'inactive':
      document.getElementById('inactiveParams').style.display = 'block';
      break;
    case 'url_pattern':
      document.getElementById('urlPatternParams').style.display = 'block';
      break;
    case 'age_and_domain':
      document.getElementById('ageDomainParams').style.display = 'block';
      break;
    case 'category':
      document.getElementById('categoryParams').style.display = 'block';
      break;
  }
  
  // Always show time criteria section (optional for all conditions)
  document.getElementById('timeCriteriaSection').style.display = 'block';
}

export function updateActionParams() {
  const actionType = document.getElementById('ruleAction').value;
  const allParams = document.querySelectorAll('.action-params');
  
  // Hide all parameter sections
  allParams.forEach(p => p.style.display = 'none');
  
  // Show relevant parameters
  switch (actionType) {
    case 'snooze':
      document.getElementById('snoozeParams').style.display = 'block';
      break;
    case 'group':
      document.getElementById('groupParams').style.display = 'block';
      break;
    case 'close':
      document.getElementById('closeParams').style.display = 'block';
      break;
    case 'suspend':
      document.getElementById('suspendParams').style.display = 'block';
      break;
  }
}

export async function saveRule() {
  const form = document.getElementById('ruleForm');
  const editingId = state.get('editingRuleId');
  
  // Get form values
  const name = document.getElementById('ruleName').value.trim();
  const conditionType = document.getElementById('ruleCondition').value;
  const actionType = document.getElementById('ruleAction').value;
  const triggerType = document.getElementById('triggerType').value;
  
  if (!name) {
    alert('Please enter a rule name');
    return;
  }
  
  // Build conditions object
  const conditions = { type: conditionType };
  
  // Add condition-specific parameters
  switch (conditionType) {
    case 'domain_count':
      conditions.minCount = parseInt(document.getElementById('minTabCount').value) || 3;
      break;
    case 'url_pattern':
      conditions.pattern = document.getElementById('urlPattern').value.trim();
      if (!conditions.pattern) {
        alert('Please enter a URL pattern');
        return;
      }
      break;
    case 'inactive':
      const urlPatternsValue = document.getElementById('urlPatterns').value.trim();
      if (urlPatternsValue) {
        conditions.urlPatterns = urlPatternsValue.split(',').map(p => p.trim());
      }
      break;
    case 'age_and_domain':
      const domainsValue = document.getElementById('domains').value.trim();
      if (!domainsValue) {
        alert('Please enter at least one domain');
        return;
      }
      conditions.domains = domainsValue.split(',').map(d => d.trim());
      break;
    case 'category':
      const selectedCategories = Array.from(
        document.querySelectorAll('#categoriesDiv input:checked')
      ).map(cb => cb.value);
      if (selectedCategories.length === 0) {
        alert('Please select at least one category');
        return;
      }
      conditions.categories = selectedCategories;
      break;
  }
  
  // Add time criteria if any are checked
  const timeCriteria = {};
  if (document.getElementById('useInactive').checked) {
    timeCriteria.inactive = parseInt(document.getElementById('inactiveMinutes').value) || 60;
  }
  if (document.getElementById('useAge').checked) {
    timeCriteria.age = parseInt(document.getElementById('ageMinutes').value) || 1440;
  }
  if (document.getElementById('useNotAccessed').checked) {
    timeCriteria.notAccessed = parseInt(document.getElementById('notaccessedMinutes').value) || 1440;
  }
  
  if (Object.keys(timeCriteria).length > 0) {
    conditions.timeCriteria = timeCriteria;
  }
  
  // Build actions object
  const actions = { type: actionType };
  
  // Add action-specific parameters
  switch (actionType) {
    case 'snooze':
      actions.snoozeMinutes = parseInt(document.getElementById('snoozeMinutes').value) || 60;
      break;
    case 'group':
      actions.groupBy = document.getElementById('groupBy').value;
      break;
    case 'close':
      actions.saveToBookmarks = document.getElementById('saveToBookmarks').checked;
      break;
    case 'suspend':
      actions.excludePinned = document.getElementById('excludePinned').checked;
      break;
  }
  
  // Build trigger object
  const trigger = { type: triggerType };
  if (triggerType === 'periodic') {
    trigger.interval = parseInt(document.getElementById('intervalMinutes').value) || 15;
  }
  
  // Create or update rule
  let rules = state.get('currentRules');
  
  if (editingId) {
    // Update existing rule
    const index = rules.findIndex(r => r.id === editingId);
    if (index >= 0) {
      rules[index] = {
        ...rules[index],
        name,
        conditions,
        actions,
        trigger,
        updatedAt: Date.now()
      };
    }
  } else {
    // Create new rule
    const newRule = {
      id: `rule_${Date.now()}`,
      name,
      conditions,
      actions,
      trigger,
      enabled: true,
      priority: rules.length + 1,
      createdAt: Date.now()
    };
    rules.push(newRule);
  }
  
  // Save rules
  state.set('currentRules', rules);
  await sendMessage({
    action: 'saveRules',
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
      action: 'saveRules',
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
    action: 'saveRules',
    rules: rules
  });
  
  updateRulesUI();
  showNotification('Rule deleted', 'success');
}

export async function toggleAllRules(enabled) {
  const rules = state.get('currentRules');
  rules.forEach(rule => rule.enabled = enabled);
  
  state.set('currentRules', rules);
  await sendMessage({
    action: 'saveRules',
    rules: rules
  });
  
  updateRulesUI();
  showNotification(enabled ? 'All rules enabled' : 'All rules disabled', 'success');
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
      action: 'testRule',
      rule: rule
    });
    
    if (result.success) {
      showNotification(
        `Rule tested: ${result.affectedCount} tab(s) would be affected`, 
        'info'
      );
      
      if (result.affectedTabs && result.affectedTabs.length > 0) {
        console.log('Affected tabs:', result.affectedTabs);
      }
    } else {
      showNotification(`Rule test failed: ${result.error}`, 'error');
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
        action: 'testRule',
        rule: rule
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
    action: 'saveRules',
    rules: rules
  });
  
  showNotification('Rule priorities updated', 'success');
}

// Helper functions
async function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}
