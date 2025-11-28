// Advanced Conditions Builder for Rules Engine 2.0
// Provides a visual interface for building complex logical conditions

import { DOMAIN_CATEGORIES } from './domain-categories.js';

export class ConditionsBuilder {
  constructor(container, initialConditions = { all: [] }, options = {}) {
    this.container = typeof container === 'string'
      ? document.querySelector(container)
      : container;

    this.conditions = this.normalizeConditions(initialConditions);
    this.options = {
      maxDepth: 5,
      previewSelector: null,
      onChange: null,
      ...options
    };

    this.subjects = this.getAvailableSubjects();
    this.listenersAttached = false;
    this.init();
  }

  normalizeConditions(conditions) {
    // Ensure conditions have a root junction
    if (!conditions || typeof conditions !== 'object') {
      return { all: [] };
    }
    
    const junctions = ['all', 'any', 'none'];
    const hasJunction = junctions.some(j => j in conditions);
    
    if (!hasJunction) {
      // Wrap single condition in 'all'
      return { all: [conditions] };
    }
    
    return conditions;
  }

  getAvailableSubjects() {
    return [
      { value: 'url', label: 'URL', type: 'string' },
      { value: 'title', label: 'Title', type: 'string' },
      { value: 'domain', label: 'Domain', type: 'string' },
      { value: 'domainCount', label: 'Domain Tab Count', type: 'number' },
      { value: 'origin', label: 'Origin', type: 'origin' },
      { value: 'age', label: 'Tab Age', type: 'duration' },
      { value: 'last_access', label: 'Last Accessed', type: 'duration' },
      { value: 'pinned', label: 'Pinned', type: 'boolean' },
      { value: 'audible', label: 'Playing Audio', type: 'boolean' },
      { value: 'muted', label: 'Muted', type: 'boolean' },
      { value: 'group', label: 'In Group', type: 'boolean' },
      { value: 'group_name', label: 'Group Name', type: 'string' },
      { value: 'window_id', label: 'Window ID', type: 'number' },
      { value: 'duplicate', label: 'Is Duplicate', type: 'boolean' },
      { value: 'category', label: 'Category', type: 'category' },
      { value: 'index', label: 'Tab Index', type: 'number' },
      { value: 'active', label: 'Is Active', type: 'boolean' }
    ];
  }

  getOperatorsForType(type) {
    const operators = {
      string: [
        { value: 'eq', label: 'equals' },
        { value: 'neq', label: 'not equals' },
        { value: 'contains', label: 'contains' },
        { value: 'notContains', label: 'does not contain' },
        { value: 'startsWith', label: 'starts with' },
        { value: 'endsWith', label: 'ends with' },
        { value: 'regex', label: 'matches regex' }
      ],
      number: [
        { value: 'eq', label: 'equals' },
        { value: 'neq', label: 'not equals' },
        { value: 'gt', label: 'greater than' },
        { value: 'lt', label: 'less than' },
        { value: 'gte', label: 'at least' },
        { value: 'lte', label: 'at most' }
      ],
      duration: [
        { value: 'gt', label: 'older than' },
        { value: 'lt', label: 'newer than' },
        { value: 'gte', label: 'at least' },
        { value: 'lte', label: 'at most' }
      ],
      boolean: [
        { value: 'is', label: 'is' }
      ],
      category: [
        { value: 'in', label: 'is in' },
        { value: 'nin', label: 'is not in' }
      ],
      origin: [
        { value: 'eq', label: 'is' },
        { value: 'neq', label: 'is not' }
      ]
    };
    return operators[type] || operators.string;
  }

  init() {
    if (!this.container) {
      console.error('ConditionsBuilder: No container element provided');
      return;
    }
    
    this.render();
    this.attachEventListeners();
    this.updatePreview();
  }

  render() {
    this.container.innerHTML = '';
    this.container.className = 'conditions-builder';
    
    const rootGroup = this.renderGroup(this.conditions, 0);
    this.container.appendChild(rootGroup);
  }

  renderGroup(conditions, depth) {
    const junction = Object.keys(conditions)[0];
    const items = conditions[junction] || [];
    
    const group = document.createElement('div');
    group.className = 'condition-group';
    group.dataset.depth = depth;
    
    // Prevent too deep nesting
    const canAddGroup = depth < this.options.maxDepth - 1;
    
    group.innerHTML = `
      <div class="group-header">
        <select class="junction-selector" ${depth === 0 ? 'data-root="true"' : ''}>
          <option value="all" ${junction === 'all' ? 'selected' : ''}>ALL</option>
          <option value="any" ${junction === 'any' ? 'selected' : ''}>ANY</option>
          <option value="none" ${junction === 'none' ? 'selected' : ''}>NONE</option>
        </select>
        <span class="group-description">of the following conditions:</span>
        ${depth > 0 ? '<button class="btn-icon remove-group" title="Remove group">×</button>' : ''}
      </div>
      <div class="group-conditions"></div>
      <div class="group-actions">
        <button class="btn btn-sm add-condition">+ Add Condition</button>
        ${canAddGroup ? '<button class="btn btn-sm add-group">+ Add Group</button>' : ''}
      </div>
    `;
    
    const conditionsContainer = group.querySelector('.group-conditions');
    
    items.forEach(item => {
      if (this.isCondition(item)) {
        conditionsContainer.appendChild(this.createConditionRow(item));
      } else {
        // Nested group
        conditionsContainer.appendChild(this.renderGroup(item, depth + 1));
      }
    });
    
    // If empty, add a default condition
    if (items.length === 0) {
      conditionsContainer.appendChild(this.createConditionRow({
        subject: 'url',
        operator: 'contains',
        value: ''
      }));
    }
    
    return group;
  }

  isCondition(item) {
    // Check if item is an object and has a 'subject' property
    // Also handle string conditions from old format
    if (!item || typeof item !== 'object') {
      return false;
    }
    return 'subject' in item;
  }

  createConditionRow(condition) {
    const row = document.createElement('div');
    row.className = 'condition-row';
    
    const subject = this.subjects.find(s => s.value === condition.subject) || this.subjects[0];
    const operators = this.getOperatorsForType(subject.type);
    const currentOperator = operators.find(op => op.value === condition.operator) || operators[0];
    
    row.innerHTML = `
      <label class="not-toggle" title="Negate this condition">
        <input type="checkbox" class="not-checkbox" ${condition.not ? 'checked' : ''}>
        <span>NOT</span>
      </label>
      <select class="subject-select" title="What to check">
        ${this.subjects.map(s => 
    `<option value="${s.value}" data-type="${s.type}" ${s.value === condition.subject ? 'selected' : ''}>${s.label}</option>`
  ).join('')}
      </select>
      <select class="operator-select" title="How to compare">
        ${operators.map(op => 
    `<option value="${op.value}" ${op.value === condition.operator ? 'selected' : ''}>${op.label}</option>`
  ).join('')}
      </select>
      <div class="value-input-container">
        ${this.createValueInput(subject.type, condition.value)}
      </div>
      <button class="btn-icon remove-condition" title="Remove condition">×</button>
    `;
    
    return row;
  }

  createValueInput(type, value) {
    switch (type) {
    case 'boolean':
      return `
          <select class="value-input value-boolean">
            <option value="true" ${value === true ? 'selected' : ''}>Yes</option>
            <option value="false" ${value === false || value === undefined ? 'selected' : ''}>No</option>
          </select>
        `;
      
    case 'duration':
      const duration = this.parseDuration(value);
      return `
          <div class="duration-input">
            <input type="number" class="value-input value-duration-number" value="${duration.value}" min="1">
            <select class="value-duration-unit">
              <option value="m" ${duration.unit === 'm' ? 'selected' : ''}>minutes</option>
              <option value="h" ${duration.unit === 'h' ? 'selected' : ''}>hours</option>
              <option value="d" ${duration.unit === 'd' ? 'selected' : ''}>days</option>
            </select>
          </div>
        `;
      
    case 'category':
      const categories = Array.isArray(value) ? value : [];
      // Generate options dynamically from DOMAIN_CATEGORIES
      const categoryOptions = Object.keys(DOMAIN_CATEGORIES)
        .sort()
        .map(key => {
          const category = DOMAIN_CATEGORIES[key];
          const isSelected = categories.includes(key);
          return `<option value="${key}" ${isSelected ? 'selected' : ''}>${category.name}</option>`;
        })
        .join('\n            ');

      return `
          <select class="value-input value-category" multiple size="8">
            ${categoryOptions}
          </select>
        `;
      
    case 'origin':
      return `
          <select class="value-input value-origin">
            <option value="user" ${value === 'user' ? 'selected' : ''}>Opened by user</option>
            <option value="link" ${value === 'link' ? 'selected' : ''}>Opened from link</option>
            <option value="redirect" ${value === 'redirect' ? 'selected' : ''}>Redirect</option>
            <option value="typed" ${value === 'typed' ? 'selected' : ''}>Typed URL</option>
            <option value="bookmark" ${value === 'bookmark' ? 'selected' : ''}>From bookmark</option>
          </select>
        `;
      
    case 'number':
      return `<input type="number" class="value-input value-number" value="${value || 0}" min="0">`;
      
    default: // string
      return `<input type="text" class="value-input value-string" value="${value || ''}" placeholder="Enter value">`;
    }
  }

  parseDuration(value) {
    if (!value || typeof value !== 'string') {
      return { value: 1, unit: 'h' };
    }
    
    const match = value.match(/^(\d+)([mhd])$/);
    if (match) {
      return { value: parseInt(match[1]), unit: match[2] };
    }
    
    return { value: 1, unit: 'h' };
  }

  formatDuration(value, unit) {
    return `${value}${unit}`;
  }

  attachEventListeners() {
    // Remove any existing listeners first
    this.removeEventListeners();
    
    // Create bound event handlers so we can remove them later
    this.clickHandler = (e) => {
      if (e.target.classList.contains('add-condition')) {
        this.handleAddCondition(e.target);
      } else if (e.target.classList.contains('add-group')) {
        this.handleAddGroup(e.target);
      } else if (e.target.classList.contains('remove-condition')) {
        this.handleRemoveCondition(e.target);
      } else if (e.target.classList.contains('remove-group')) {
        this.handleRemoveGroup(e.target);
      }
    };

    this.changeHandler = (e) => {
      if (e.target.classList.contains('subject-select')) {
        this.handleSubjectChange(e.target);
      }

      this.updatePreview();
      this.triggerChange();
    };

    this.inputHandler = (e) => {
      if (e.target.classList.contains('value-input')) {
        this.updatePreview();
        this.triggerChange();
      }
    };
    
    // Attach the event listeners
    this.container.addEventListener('click', this.clickHandler);
    this.container.addEventListener('change', this.changeHandler);
    this.container.addEventListener('input', this.inputHandler);
    
    this.listenersAttached = true;
  }
  
  removeEventListeners() {
    if (!this.listenersAttached) return;
    
    // Remove event listeners using the stored references
    if (this.clickHandler) {
      this.container.removeEventListener('click', this.clickHandler);
    }
    if (this.changeHandler) {
      this.container.removeEventListener('change', this.changeHandler);
    }
    if (this.inputHandler) {
      this.container.removeEventListener('input', this.inputHandler);
    }
    
    this.listenersAttached = false;
  }

  handleAddCondition(button) {
    const group = button.closest('.condition-group');
    const conditionsContainer = group.querySelector('.group-conditions');
    
    const newCondition = this.createConditionRow({
      subject: 'url',
      operator: 'contains',
      value: ''
    });
    
    conditionsContainer.appendChild(newCondition);
    
    // Focus the value input
    const input = newCondition.querySelector('.value-input');
    if (input) input.focus();
    
    this.updatePreview();
    this.triggerChange();
  }

  handleAddGroup(button) {
    const group = button.closest('.condition-group');
    const depth = parseInt(group.dataset.depth);
    const conditionsContainer = group.querySelector('.group-conditions');
    
    const newGroup = this.renderGroup({ all: [] }, depth + 1);
    conditionsContainer.appendChild(newGroup);
    
    this.updatePreview();
    this.triggerChange();
  }

  handleRemoveCondition(button) {
    const row = button.closest('.condition-row');
    const container = row.parentElement;

    row.remove();

    // If this was the last condition in a group, add a default one
    if (container.children.length === 0) {
      container.appendChild(this.createConditionRow({
        subject: 'url',
        operator: 'contains',
        value: ''
      }));
    }

    this.updatePreview();
    this.triggerChange();
  }

  handleRemoveGroup(button) {
    const group = button.closest('.condition-group');
    group.remove();
    
    this.updatePreview();
    this.triggerChange();
  }

  handleSubjectChange(select) {
    const row = select.closest('.condition-row');
    const newType = select.selectedOptions[0].dataset.type;
    const operators = this.getOperatorsForType(newType);
    
    // Update operators
    const operatorSelect = row.querySelector('.operator-select');
    operatorSelect.innerHTML = operators.map(op => 
      `<option value="${op.value}">${op.label}</option>`
    ).join('');
    
    // Update value input
    const valueContainer = row.querySelector('.value-input-container');
    valueContainer.innerHTML = this.createValueInput(newType, null);
    
    this.updatePreview();
    this.triggerChange();
  }

  getConditions() {
    const rootGroup = this.container.querySelector('.condition-group[data-depth="0"]');
    return this.parseGroup(rootGroup);
  }

  parseGroup(groupElement) {
    const junction = groupElement.querySelector('.junction-selector').value;
    const conditions = [];
    
    const conditionsContainer = groupElement.querySelector('.group-conditions');
    for (const child of conditionsContainer.children) {
      if (child.classList.contains('condition-row')) {
        const condition = this.parseCondition(child);
        if (condition) conditions.push(condition);
      } else if (child.classList.contains('condition-group')) {
        const nestedGroup = this.parseGroup(child);
        if (Object.values(nestedGroup)[0].length > 0) {
          conditions.push(nestedGroup);
        }
      }
    }
    
    return { [junction]: conditions };
  }

  parseCondition(rowElement) {
    const notChecked = rowElement.querySelector('.not-checkbox').checked;
    const subject = rowElement.querySelector('.subject-select').value;
    const operator = rowElement.querySelector('.operator-select').value;
    
    // Skip if essential fields are missing
    if (!subject || !operator) {
      console.warn('Incomplete condition row - missing subject or operator');
      return null;
    }
    
    const subjectConfig = this.subjects.find(s => s.value === subject);
    if (!subjectConfig) {
      console.warn('Unknown subject:', subject);
      return null;
    }
    
    const value = this.parseValue(rowElement, subjectConfig.type);
    
    const condition = { subject, operator, value };
    if (notChecked) condition.not = true;
    
    return condition;
  }

  parseValue(rowElement, type) {
    switch (type) {
    case 'boolean':
      return rowElement.querySelector('.value-boolean').value === 'true';
      
    case 'duration':
      const num = rowElement.querySelector('.value-duration-number').value;
      const unit = rowElement.querySelector('.value-duration-unit').value;
      return this.formatDuration(num, unit);
      
    case 'category':
      const select = rowElement.querySelector('.value-category');
      return Array.from(select.selectedOptions).map(opt => opt.value);
      
    case 'number':
      return parseInt(rowElement.querySelector('.value-number').value) || 0;
      
    default:
      return rowElement.querySelector('.value-input').value;
    }
  }

  updatePreview() {
    if (!this.options.previewSelector) return;
    
    const previewElement = document.querySelector(this.options.previewSelector);
    if (!previewElement) return;
    
    const conditions = this.getConditions();
    const previewText = this.generatePreview(conditions);
    previewElement.textContent = previewText;
  }

  generatePreview(conditions) {
    return this.conditionsToText(conditions);
  }

  conditionsToText(conditions, depth = 0) {
    const junction = Object.keys(conditions)[0];
    const items = conditions[junction];
    
    if (items.length === 0) {
      return 'No conditions defined';
    }
    
    const junctionText = junction.toUpperCase();
    const parts = [];
    
    items.forEach((item, index) => {
      if (this.isCondition(item)) {
        parts.push(this.conditionToText(item));
      } else {
        // Nested group
        const nestedText = this.conditionsToText(item, depth + 1);
        parts.push(`(${nestedText})`);
      }
    });
    
    if (depth === 0) {
      return `Match ${junctionText} of: ${parts.join(` ${junctionText} `)}`;
    } else {
      return parts.join(` ${junctionText} `);
    }
  }

  conditionToText(condition) {
    const subject = this.subjects.find(s => s.value === condition.subject);
    const subjectLabel = subject?.label || condition.subject;
    
    const operators = this.getOperatorsForType(subject?.type);
    const operator = operators.find(op => op.value === condition.operator);
    const operatorLabel = operator?.label || condition.operator;
    
    let valueText = condition.value;
    if (Array.isArray(valueText)) {
      valueText = valueText.join(', ');
    } else if (typeof valueText === 'boolean') {
      valueText = valueText ? 'Yes' : 'No';
    }
    
    const text = `${subjectLabel} ${operatorLabel} "${valueText}"`;
    return condition.not ? `NOT (${text})` : text;
  }

  triggerChange() {
    if (this.options.onChange) {
      const conditions = this.getConditions();
      this.options.onChange(conditions);
    }
  }

  setConditions(conditions) {
    this.conditions = this.normalizeConditions(conditions);
    this.render();
    this.attachEventListeners();
    this.updatePreview();
  }

  validate() {
    const conditions = this.getConditions();
    return this.validateConditions(conditions);
  }

  validateConditions(conditions) {
    const junction = Object.keys(conditions)[0];
    const items = conditions[junction];
    
    if (items.length === 0) {
      return { valid: false, error: 'At least one condition is required' };
    }
    
    for (const item of items) {
      if (this.isCondition(item)) {
        const validation = this.validateCondition(item);
        if (!validation.valid) return validation;
      } else {
        const validation = this.validateConditions(item);
        if (!validation.valid) return validation;
      }
    }
    
    return { valid: true };
  }

  validateCondition(condition) {
    console.log('Validating condition:', condition);
    
    if (!condition.subject) {
      return { valid: false, error: 'Subject is required' };
    }
    
    if (!condition.operator) {
      return { valid: false, error: 'Operator is required' };
    }
    
    // Validate value based on type
    const subject = this.subjects.find(s => s.value === condition.subject);
    if (!subject) {
      return { valid: false, error: `Unknown subject: ${condition.subject}` };
    }
    
    if (subject.type === 'string' && condition.operator === 'matches') {
      // Validate regex
      try {
        new RegExp(condition.value);
      } catch (e) {
        return { valid: false, error: `Invalid regex pattern: ${condition.value}` };
      }
    }
    
    return { valid: true };
  }
  
  destroy() {
    // Clean up event listeners when destroying the instance
    this.removeEventListeners();
    this.clickHandler = null;
    this.changeHandler = null;
    this.inputHandler = null;
  }
}