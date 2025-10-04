# Command Pattern Architecture

## Overview

The Rules Engine has been refactored to use a Command Pattern architecture, providing clear separation between selection, command generation, and execution. This results in better atomicity, debuggability, and maintainability.

## Architecture Flow

```
1. Selection: Rules + Context → Matched Tabs
2. Planning: Matched Tabs + Actions → Commands
3. Execution: Commands → ActionManager → Results
```

## Key Components

### 1. Command Class (`/lib/commands/Command.js`)
- Represents a single atomic action
- Contains target IDs and parameters
- Provides validation and preview capabilities
- Handles conflict detection and priority

```javascript
const command = new Command('group', [123, 456], {
  name: 'Development',
  color: 'blue'
});

console.log(command.preview());
// { description: 'Group 2 tabs as "Development"', ... }
```

### 2. ActionManager (`/lib/commands/ActionManager.js`)
- Command dispatcher and executor
- Routes commands to appropriate handlers
- Manages execution lifecycle
- Provides event hooks for debugging

```javascript
const manager = new ActionManager(context);
manager.on('beforeExecute', cmd => console.log('Executing:', cmd));
const results = await manager.execute(commands, { dryRun: false });
```

### 3. SelectAndPlan Service (`/services/selection/selectAndPlan.js`)
- Bridges selection and execution
- Generates commands from rule matches
- Handles special cases (group by domain, etc.)

```javascript
const { matches, commands } = await selectAndPlanActions(rule, context);
// Returns matched tabs and commands to execute
```

### 4. Engine V2 (`/lib/engine-compact.js`)
- Thin orchestrator (~100 lines)
- Coordinates: Select → Plan → Execute
- Handles rule iteration and result aggregation

## Benefits

### 1. Atomicity
Each command is self-contained with its target and parameters:
```javascript
{
  action: 'close',
  targetIds: [123, 456],
  params: { reason: 'duplicate' }
}
```

### 2. Debuggability
Commands can be inspected before execution:
```javascript
const preview = command.preview();
console.log('Will execute:', preview.description);
```

### 3. Testability
Commands can be tested in isolation:
```javascript
const command = new Command('group', [1, 2], { name: 'Test' });
const validation = command.validate();
assert(validation.valid);
```

### 4. Flexibility
Commands can be modified, reordered, or filtered:
```javascript
const sorted = sortAndResolveCommands(commands);
const filtered = commands.filter(cmd => cmd.action !== 'close');
```

## Usage Examples

### Basic Rule Execution
```javascript
import { runRules } from '/lib/engine-compact.js';

const results = await runRules(rules, context, {
  dryRun: false,
  debug: true
});
```

### Preview Mode
```javascript
import { previewRule } from '/lib/engine-compact.js';

const preview = await previewRule(rule, context);
console.log('Would execute:', preview.commands);
```

### Direct Command Execution
```javascript
import { ActionManager, Command } from '/lib/commands/index.js';

const manager = new ActionManager(context);
const command = new Command('group', [1, 2, 3], { name: 'My Group' });
const result = await manager.execute([command]);
```

### Bulk Operations
```javascript
import { generateBulkCommands } from '/services/selection/selectAndPlan.js';

const commands = generateBulkCommands('group_by_domain', tabs);
const results = await manager.execute(commands);
```

## Migration Path

### Old Pattern
```javascript
// Direct execution on tabs
for (const tab of matches) {
  await chrome.tabs.remove(tab.id);
}
```

### New Pattern
```javascript
// Generate commands, then execute
const commands = matches.map(tab =>
  new Command('close', tab.id)
);
await actionManager.execute(commands);
```

## File Structure

```
/lib/
  ├── commands/
  │   ├── Command.js         # Command class and utilities
  │   └── ActionManager.js   # Command dispatcher
  ├── engine.js              # Legacy engine (backward compat)
  ├── engine-v2.js           # Full-featured new engine
  └── engine-compact.js      # Minimal engine (~100 lines)

/services/
  └── selection/
      ├── selectTabs.js      # Tab selection logic
      └── selectAndPlan.js   # Command generation
```

## Performance Metrics

- **Old engine.js**: 618 lines
- **With SelectionService**: 356 lines (43% reduction)
- **New engine-compact.js**: 111 lines (82% reduction)
- **Separation achieved**: Selection, Planning, and Execution are fully decoupled

## Next Steps

1. **Update surfaces** to use command pattern directly
2. **Add command batching** for performance optimization
3. **Implement command queue** for scheduled execution
4. **Create command history** for undo/redo functionality