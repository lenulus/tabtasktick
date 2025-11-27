# TabMaster Pro - Keyboard Shortcuts Guide

## Default Keybindings

### Primary Actions (Ctrl/Cmd + Shift + Letter)
These use Ctrl+Shift on Windows/Linux, Cmd+Shift on Mac to avoid conflicts.

Chrome limits extensions to 4 keyboard shortcuts. Configure shortcuts at chrome://extensions/shortcuts.

| Action | Default Shortcut | Description |
|--------|-----------------|-------------|
| **Quick Snooze** | `Ctrl+Shift+S` | Snooze current tab with dialog |
| **Group by Domain** | `Ctrl+Shift+G` | Group all tabs by domain |
| **Close Duplicates** | `Ctrl+Shift+D` | Close all duplicate tabs |

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

#### Example Custom Configuration
```json
{
  "quick_snooze": "Ctrl+Shift+Z",
  "group_by_domain": "Ctrl+Shift+G",
  "close_duplicates": "Ctrl+Shift+D"
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
All shortcuts are accessible via keyboard navigation with screen reader support.

### One-Handed Operation
Configure shortcuts in chrome://extensions/shortcuts to use left-hand-friendly combinations.

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