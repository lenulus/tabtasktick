# SPEC-006: Advanced Conditions Editor for Rules Engine 2.0

## Overview
Replace the simple dropdown-based condition selector with an advanced visual conditions builder that supports complex logical expressions with grouping, operators, and negation.

## User Stories
1. As a user, I want to create complex conditions with multiple criteria combined using AND/OR/NOT logic
2. As a user, I want to visually group conditions to create nested logical expressions
3. As a user, I want to easily add, remove, and modify individual conditions
4. As a user, I want to see a human-readable preview of my conditions

## Requirements (from PRD Section 5.1)
- **Conditions Builder**: rows `[Subject][Operator][Value]`, add/remove
- **Group blocks** with junction **ALL/ANY/NONE**
- Per-row NOT toggle
- Nested grouping support

## Technical Design

### Data Structure
The conditions use the Rules Engine 2.0 format:
```javascript
{
  when: {
    all: [  // or 'any' or 'none'
      { subject: 'url', operator: 'contains', value: 'github.com' },
      { subject: 'age', operator: 'greater_than', value: '7d' },
      {
        any: [
          { subject: 'title', operator: 'matches', value: '/PR #\\d+/' },
          { subject: 'pinned', operator: 'equals', value: false }
        ]
      }
    ]
  }
}
```

### UI Components

#### 1. Condition Row
```
[NOT] [Subject ▼] [Operator ▼] [Value input] [×]
```
- NOT toggle (checkbox)
- Subject dropdown (url, title, domain, age, etc.)
- Operator dropdown (dynamic based on subject type)
- Value input (dynamic type based on subject)
- Remove button

#### 2. Condition Group
```
┌─ ALL ▼ ────────────────────────────────┐
│ [condition row 1]                      │
│ [condition row 2]                      │
│ [+ Add Condition] [+ Add Group]        │
└────────────────────────────────────────┘
```
- Junction selector (ALL/ANY/NONE)
- Contains condition rows and/or nested groups
- Add buttons for conditions and subgroups

#### 3. Visual Design
```
Rule Conditions:
┌─ ALL ───────────────────────────────────────┐
│ □ URL contains "github.com"                 │
│ □ Age greater than 7 days                   │
│ ┌─ ANY ─────────────────────────────────┐   │
│ │ □ Title matches /PR #\d+/             │   │
│ │ ☑ NOT Pinned equals true              │   │
│ │ [+ Add Condition]                     │   │
│ └───────────────────────────────────────┘   │
│ [+ Add Condition] [+ Add Group]             │
└─────────────────────────────────────────────┘
```

### Implementation

#### HTML Structure
```html
<div class="conditions-builder" id="conditionsBuilder">
  <div class="condition-group" data-junction="all">
    <div class="group-header">
      <select class="junction-selector">
        <option value="all">ALL</option>
        <option value="any">ANY</option>
        <option value="none">NONE</option>
      </select>
      <span class="group-description">of the following conditions</span>
    </div>
    <div class="group-conditions">
      <!-- Condition rows and nested groups go here -->
    </div>
    <div class="group-actions">
      <button class="btn btn-secondary add-condition">
        + Add Condition
      </button>
      <button class="btn btn-secondary add-group">
        + Add Group
      </button>
    </div>
  </div>
</div>

<div class="condition-preview">
  <h4>Preview</h4>
  <div class="preview-text" id="conditionPreview">
    Match ALL tabs where URL contains "github.com" AND age is greater than 7 days
  </div>
</div>
```

#### JavaScript API
```javascript
class ConditionsBuilder {
  constructor(container, initialConditions = { all: [] }) {
    this.container = container;
    this.conditions = initialConditions;
    this.subjects = this.getAvailableSubjects();
    this.init();
  }

  getAvailableSubjects() {
    return [
      { value: 'url', label: 'URL', type: 'string' },
      { value: 'title', label: 'Title', type: 'string' },
      { value: 'domain', label: 'Domain', type: 'string' },
      { value: 'age', label: 'Age', type: 'duration' },
      { value: 'last_access', label: 'Last Access', type: 'duration' },
      { value: 'pinned', label: 'Pinned', type: 'boolean' },
      { value: 'audible', label: 'Playing Audio', type: 'boolean' },
      { value: 'muted', label: 'Muted', type: 'boolean' },
      { value: 'group', label: 'In Group', type: 'boolean' },
      { value: 'group_name', label: 'Group Name', type: 'string' },
      { value: 'window_id', label: 'Window', type: 'window' },
      { value: 'duplicate', label: 'Is Duplicate', type: 'boolean' },
      { value: 'category', label: 'Category', type: 'category' },
      { value: 'tab_count', label: 'Domain Tab Count', type: 'number' }
    ];
  }

  getOperatorsForType(type) {
    const operators = {
      string: [
        { value: 'equals', label: 'equals' },
        { value: 'not_equals', label: 'does not equal' },
        { value: 'contains', label: 'contains' },
        { value: 'not_contains', label: 'does not contain' },
        { value: 'starts_with', label: 'starts with' },
        { value: 'ends_with', label: 'ends with' },
        { value: 'matches', label: 'matches regex' }
      ],
      number: [
        { value: 'equals', label: 'equals' },
        { value: 'not_equals', label: 'does not equal' },
        { value: 'greater_than', label: 'greater than' },
        { value: 'less_than', label: 'less than' },
        { value: 'greater_than_or_equal', label: 'at least' },
        { value: 'less_than_or_equal', label: 'at most' }
      ],
      duration: [
        { value: 'greater_than', label: 'older than' },
        { value: 'less_than', label: 'newer than' }
      ],
      boolean: [
        { value: 'equals', label: 'is' }
      ],
      category: [
        { value: 'in', label: 'is in' },
        { value: 'not_in', label: 'is not in' }
      ]
    };
    return operators[type] || operators.string;
  }

  renderGroup(conditions, parentElement, level = 0) {
    const junction = Object.keys(conditions)[0]; // 'all', 'any', or 'none'
    const items = conditions[junction];
    
    const group = this.createGroupElement(junction, level);
    const conditionsContainer = group.querySelector('.group-conditions');
    
    items.forEach(item => {
      if (this.isCondition(item)) {
        conditionsContainer.appendChild(this.createConditionRow(item));
      } else {
        // Nested group
        this.renderGroup(item, conditionsContainer, level + 1);
      }
    });
    
    parentElement.appendChild(group);
  }

  createConditionRow(condition) {
    const row = document.createElement('div');
    row.className = 'condition-row';
    
    const subject = this.subjects.find(s => s.value === condition.subject);
    const operators = this.getOperatorsForType(subject?.type || 'string');
    
    row.innerHTML = `
      <label class="not-toggle">
        <input type="checkbox" ${condition.not ? 'checked' : ''}>
        NOT
      </label>
      <select class="subject-select">
        ${this.subjects.map(s => 
          `<option value="${s.value}" ${s.value === condition.subject ? 'selected' : ''}>${s.label}</option>`
        ).join('')}
      </select>
      <select class="operator-select">
        ${operators.map(op => 
          `<option value="${op.value}" ${op.value === condition.operator ? 'selected' : ''}>${op.label}</option>`
        ).join('')}
      </select>
      ${this.createValueInput(condition.subject, condition.value)}
      <button class="btn-icon remove-condition" title="Remove">×</button>
    `;
    
    return row;
  }

  createValueInput(subject, value) {
    const subjectConfig = this.subjects.find(s => s.value === subject);
    const type = subjectConfig?.type || 'string';
    
    switch (type) {
      case 'boolean':
        return `
          <select class="value-input">
            <option value="true" ${value === true ? 'selected' : ''}>Yes</option>
            <option value="false" ${value === false ? 'selected' : ''}>No</option>
          </select>
        `;
      
      case 'duration':
        return `
          <div class="duration-input">
            <input type="number" class="value-input" value="${this.parseDuration(value).value}">
            <select class="duration-unit">
              <option value="m" ${value?.endsWith('m') ? 'selected' : ''}>minutes</option>
              <option value="h" ${value?.endsWith('h') ? 'selected' : ''}>hours</option>
              <option value="d" ${value?.endsWith('d') ? 'selected' : ''}>days</option>
            </select>
          </div>
        `;
      
      case 'category':
        return `
          <select class="value-input" multiple>
            <option value="news" ${value?.includes('news') ? 'selected' : ''}>News</option>
            <option value="social" ${value?.includes('social') ? 'selected' : ''}>Social</option>
            <option value="shopping" ${value?.includes('shopping') ? 'selected' : ''}>Shopping</option>
            <option value="work" ${value?.includes('work') ? 'selected' : ''}>Work</option>
            <option value="entertainment" ${value?.includes('entertainment') ? 'selected' : ''}>Entertainment</option>
          </select>
        `;
      
      default:
        return `<input type="text" class="value-input" value="${value || ''}" placeholder="Enter value">`;
    }
  }

  getConditions() {
    // Parse the DOM and return the conditions object
    return this.parseGroup(this.container.querySelector('.condition-group'));
  }

  generatePreview(conditions) {
    // Generate human-readable preview text
    return this.conditionsToText(conditions);
  }
}
```

### Features

1. **Dynamic Operators**: Operators change based on subject type (string, number, boolean, etc.)
2. **Smart Value Inputs**: 
   - Text input for strings
   - Number + unit selector for durations
   - Dropdown for booleans
   - Multi-select for categories
3. **Nested Groups**: Support unlimited nesting depth
4. **Live Preview**: Shows human-readable version of conditions
5. **Validation**: Ensures valid condition structure before saving

### Integration with Rules Engine

The conditions builder outputs directly to Rules Engine 2.0 format:
```javascript
// Get conditions from builder
const conditions = conditionsBuilder.getConditions();

// Create rule with conditions
const rule = {
  name: 'My Rule',
  when: conditions,
  then: [/* actions */]
};

// Send to Rules Engine
const engine = new RulesEngine();
const results = await engine.runRules([rule], context);
```

## Implementation Plan

1. Create `conditions-builder.js` module
2. Add CSS for visual hierarchy and styling
3. Replace current dropdown system in rule modal
4. Add preview generation
5. Add validation before save
6. Create tests for complex condition scenarios

## Success Metrics
- Users can create any condition expressible in the Rules Engine 2.0 format
- Visual representation is clear and intuitive
- Performance with deeply nested conditions (5+ levels)
- Preview accurately represents the logical expression