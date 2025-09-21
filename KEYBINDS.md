# TabMaster Pro - Keyboard Shortcuts Guide

## Default Keybindings

### Primary Actions (Ctrl/Cmd + Shift + Letter)
These use Ctrl+Shift on Windows/Linux, Cmd+Shift on Mac to avoid conflicts:

| Action | Default Shortcut | Description |
|--------|-----------------|-------------|
| **Command Palette** | `Ctrl+Shift+P` | Open command palette for all actions |
| **Quick Snooze** | `Ctrl+Shift+S` | Snooze current tab with dialog |
| **Group by Domain** | `Ctrl+Shift+G` | Group all tabs by domain |
| **Close Duplicates** | `Ctrl+Shift+D` | Close all duplicate tabs |
| **Toggle Tab List** | `Ctrl+Shift+T` | Show/hide tab management panel |
| **Emergency Save** | `Ctrl+Shift+E` | Emergency backup all tabs |

### Navigation (Ctrl/Cmd + Alt + Key)
For quick navigation without conflicts:

| Action | Default Shortcut | Description |
|--------|-----------------|-------------|
| **Search Tabs** | `Ctrl+Alt+F` | Open tab search |
| **Recent Tabs** | `Ctrl+Alt+R` | Show recently closed tabs |
| **Next Group** | `Ctrl+Alt+]` | Navigate to next tab group |
| **Previous Group** | `Ctrl+Alt+[` | Navigate to previous tab group |
| **Jump to Tab** | `Ctrl+Alt+J` | Jump to tab by number/name |

### Tab Management (Ctrl/Cmd + Shift + Alt + Key)
For advanced management features:

| Action | Default Shortcut | Description |
|--------|-----------------|-------------|
| **Bulk Select** | `Ctrl+Shift+Alt+A` | Toggle multi-select mode |
| **Meeting Mode** | `Ctrl+Shift+Alt+M` | Hide non-work tabs |
| **Focus Mode** | `Ctrl+Shift+Alt+F` | Show only current project |
| **Workspace Switch** | `Ctrl+Shift+Alt+W` | Switch between workspaces |

### Quick Actions (No Modifiers - Only in Extension Popup)
When the extension popup is open:

| Action | Key | Description |
|--------|-----|-------------|
| **Search** | `/` | Focus search box |
| **Select All** | `a` | Select all visible tabs |
| **Snooze Selected** | `s` | Snooze selected tabs |
| **Group Selected** | `g` | Group selected tabs |
| **Close Selected** | `x` | Close selected tabs |
| **Navigate** | `j/k` | Move down/up in list |
| **Toggle Selection** | `Space` | Select/deselect current tab |

## Customization

### How to Change Shortcuts

1. **Chrome Settings Method:**
   - Go to `chrome://extensions/shortcuts`
   - Find TabMaster Pro
   - Click on any shortcut to modify
   - Press your desired key combination

2. **Extension Settings:**
   - Click TabMaster Pro icon → Settings
   - Navigate to "Keyboard Shortcuts"
   - Click on any shortcut to edit
   - Option to reset to defaults

### Recommended Custom Configurations

#### For Developers
```json
{
  "command_palette": "Ctrl+K",
  "quick_snooze": "Ctrl+Shift+Z",
  "search_tabs": "Ctrl+P",
  "toggle_tab_list": "Ctrl+`"
}
```

#### For Power Users  
```json
{
  "command_palette": "Alt+Space",
  "emergency_save": "Ctrl+Shift+S",
  "meeting_mode": "Ctrl+Shift+M",
  "workspace_switch": "Ctrl+Tab"
}
```

#### For Vim Users
```json
{
  "command_palette": "Ctrl+Shift+P",
  "search_tabs": "Ctrl+/",
  "navigate_down": "j",
  "navigate_up": "k",
  "toggle_selection": "v"
}
```

## Avoiding Conflicts

### Common Conflicts to Avoid:
- `Ctrl/Cmd + T` - New tab
- `Ctrl/Cmd + W` - Close tab
- `Ctrl/Cmd + Tab` - Switch tabs
- `Ctrl/Cmd + 1-9` - Jump to specific tab
- `Alt + D` - Address bar
- `Alt + Left/Right` - Back/Forward
- `F1-F12` - Browser functions
- Single letters - Web page shortcuts

### Safe Modifier Combinations:
1. `Ctrl+Shift+Letter` (best for primary actions)
2. `Ctrl+Alt+Letter` (good for navigation)
3. `Ctrl+Shift+Alt+Letter` (for advanced features)
4. `Ctrl+Shift+Number` (for quick actions)

## Accessibility

### Screen Reader Support
All shortcuts can be accessed via the command palette (`Ctrl+Shift+P`) with full screen reader support.

### One-Handed Operation
Enable "One-Handed Mode" in settings to use shortcuts with just the left hand:
- Command Palette: `Ctrl+Space`
- Quick Actions: `Ctrl+1-5`
- Navigation: `Ctrl+Q/W/E/R`

### Voice Control Integration
Compatible with voice control software - say "Tab Master" followed by command name.

## Import/Export Settings

### Export Your Keybindings
1. Settings → Keyboard Shortcuts → Export
2. Save as JSON file
3. Share with team or backup

### Import Keybindings
1. Settings → Keyboard Shortcuts → Import
2. Select JSON file
3. Review and confirm changes

## Troubleshooting

### Shortcut Not Working?
1. Check for conflicts at `chrome://extensions/shortcuts`
2. Ensure no other extension uses the same shortcut
3. Try the shortcut in a new tab
4. Reset to defaults in settings

### OS-Specific Issues
- **macOS**: Use Cmd instead of Ctrl
- **Linux**: Some window managers intercept Alt combinations
- **Windows**: Some shortcuts may conflict with Windows features

## Best Practices

1. **Learn Gradually**: Start with 3-5 most used shortcuts
2. **Customize for Workflow**: Adjust based on your most common actions
3. **Document Changes**: Keep a note of customizations
4. **Share with Team**: Export and share configs for consistency
5. **Regular Review**: Update shortcuts as your workflow evolves