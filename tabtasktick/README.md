# TabMaster Pro - Advanced Tab Management Extension

## Overview
TabMaster Pro is a powerful Chrome extension designed to help you manage hundreds of browser tabs efficiently. With intelligent automation, smart grouping, and advanced organization features, it transforms chaotic tab sprawl into a well-organized browsing experience.

## Features

### 🚀 Core Features
- **Smart Rules Engine** - Automatically manage tabs based on customizable conditions
- **Tab Groups** - Organize tabs by domain, project, or custom criteria  
- **Snoozing System** - Temporarily hide tabs and have them reopen later
- **Duplicate Detection** - Automatically identify and close duplicate tabs
- **Memory Management** - Monitor and optimize browser memory usage
- **Advanced Search** - Quickly find any tab across all windows

### 📊 Dashboard
- Comprehensive overview of all open tabs
- Visual analytics and insights
- Bulk management operations
- Tab history tracking
- Performance metrics

### ⚙️ Automation
- Auto-close old tabs
- Auto-group by domain
- Auto-snooze inactive tabs
- Customizable rules with priorities
- Whitelist for protected domains

## Installation

### For Development
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select the `tabmaster-pro` directory
5. The extension will be installed and ready to use

### For Production (Creating .crx file)
1. In Chrome extensions page, click "Pack extension"
2. Browse to the `tabmaster-pro` directory
3. Click "Pack Extension"
4. This will create a `.crx` file for distribution

## Usage

### Quick Start
1. Click the TabMaster Pro icon in your browser toolbar
2. View statistics about your open tabs
3. Use Quick Actions to:
   - Close duplicate tabs
   - Group tabs by domain
   - Snooze the current tab
   - Suspend inactive tabs

### Keyboard Shortcuts
- `Alt + S` - Quick snooze current tab
- `Alt + G` - Group all tabs by domain
- `Alt + D` - Close duplicate tabs

### Creating Rules
1. Click the settings icon or right-click the extension icon
2. Go to "Rules Engine" tab
3. Click "Add Rule"
4. Configure:
   - **Condition**: What triggers the rule (duplicates, domain count, inactive time, etc.)
   - **Action**: What happens when triggered (close, group, snooze, suspend)
   - **Priority**: Order of rule execution (lower numbers = higher priority)

### Dashboard
Access the full dashboard by clicking "Dashboard" in the extension popup. Here you can:
- View detailed analytics
- Manage all tabs across windows
- Access tab history
- Perform bulk operations
- Configure advanced settings

## Configuration

### General Settings
- **Auto-Close**: Enable/disable automatic tab closing
- **Auto-Group**: Enable/disable automatic grouping
- **Duplicate Detection**: Enable/disable duplicate monitoring
- **Tab Warning Threshold**: Get alerts when tab count is high
- **Default Snooze Duration**: Set default snooze time

### Performance Settings
- **Memory Threshold**: Trigger actions when memory exceeds percentage
- **Auto-Suspend Time**: Suspend tabs after inactivity period
- **Max Tabs per Group**: Limit group sizes

### Whitelist
Add domains that should never be automatically closed:
1. Go to Settings → Automation
2. Add domains to whitelist (e.g., gmail.com, github.com)

## Default Rules

The extension comes with 5 pre-configured rules:

1. **Close Duplicates** - Automatically closes duplicate tabs
2. **Auto-Group by Domain** - Groups 3+ tabs from the same domain
3. **Snooze Articles** - Snoozes unread articles after 1 hour
4. **Close Old Stack Overflow** - Archives SO tabs after 3 hours
5. **Memory Management** - Suspends tabs when memory > 80%

## Privacy & Data

- All data is stored locally in your browser
- No data is sent to external servers
- No tracking or analytics
- Export/import functionality for backup

## Troubleshooting

### Extension Not Working
1. Make sure you have the latest version of Chrome
2. Check that all required permissions are granted
3. Try disabling and re-enabling the extension

### High Memory Usage
1. Enable memory management rules
2. Reduce the number of active tabs
3. Use tab suspension for inactive tabs

### Rules Not Triggering
1. Check that rules are enabled in settings
2. Verify rule conditions are met
3. Check rule priorities (lower numbers execute first)

## Development

### Project Structure
```
tabmaster-pro/
├── manifest.json         # Extension manifest
├── background.js        # Background service worker
├── popup/              # Popup interface
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/            # Settings page
│   ├── options.html
│   ├── options.css
│   └── options.js
├── dashboard/          # Dashboard interface
│   ├── dashboard.html
│   ├── dashboard.css
│   └── dashboard.js
└── icons/             # Extension icons
```

### Building from Source
```bash
# Clone the repository (if applicable)
git clone [repository-url]

# Install dependencies (if any)
npm install

# Load in Chrome as unpacked extension
```

### API Permissions
The extension requires these Chrome APIs:
- `tabs` - Manage browser tabs
- `tabGroups` - Create and manage tab groups
- `bookmarks` - Save tabs as bookmarks
- `storage` - Store settings and data
- `alarms` - Schedule actions
- `contextMenus` - Add right-click options
- `webNavigation` - Track tab navigation

## Support

### Known Limitations
- Cannot manage tabs in incognito mode (unless explicitly allowed)
- Some system tabs cannot be closed/managed
- Tab groups are only available in Chrome 89+

### Future Features
- Cloud sync across devices
- Advanced AI-powered suggestions
- Team collaboration features
- Mobile companion app
- Integration with productivity tools

## Version History

### v1.0.0 (Current)
- Initial release
- Core tab management features
- Rules engine
- Dashboard
- Basic analytics

## License
This extension is provided as-is for personal and commercial use.

## Credits
Created with ❤️ for better tab management

---

**Note**: Icon placeholders are included. For production use, replace the PNG files in the `icons/` directory with actual icon images.
